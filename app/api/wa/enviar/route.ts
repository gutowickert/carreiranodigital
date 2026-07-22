import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { enviarTexto, enviarAudio, enviarImagem, enviarDocumento, foneZapi } from '@/lib/zapi'

// ─────────────────────────────────────────────────────────────────────────
// GUARDRAIL ANTI-BLOQUEIO (número Z-API não-oficial, usado no aparelho p/ ligar)
// Protege limitando o ALCANCE — quantos contatos NOVOS você abre, e quão rápido.
// NÃO atrapalha o trabalho: responder quem já está em conversa hoje é SEMPRE liberado;
// a regra só freia abrir muitos contatos novos rápido demais (o que o WhatsApp lê como disparo).
// Números ajustáveis (peça pra afrouxar/apertar; dá pra virar tela de config depois).
const WA_MAX_CONTATOS_DIA = 50   // teto de contatos NOVOS por dia (conservador: número queimado até a coexistência)
const WA_MAX_CONTATOS_MIN = 5    // teto de contatos NOVOS por minuto (anti-rajada)

async function guardrailWA(org: string, convIdAtual: string | null): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const hojeBRT = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const inicioDia = new Date(`${hojeBRT}T00:00:00-03:00`).toISOString()
  // Conversa que JÁ recebeu algo nosso hoje = atendimento em andamento → libera sempre
  if (convIdAtual) {
    const { count } = await supabase.from('wa_mensagens').select('id', { count: 'exact', head: true })
      .eq('org_id', org).eq('conversa_id', convIdAtual).eq('direcao', 'enviada').not('zapi_id', 'is', null).gte('criado_em', inicioDia)
    if ((count || 0) > 0) return { ok: true }
  }
  // Contato NOVO hoje → aplica os limites de alcance
  const { data: dia } = await supabase.from('wa_mensagens').select('conversa_id')
    .eq('org_id', org).eq('direcao', 'enviada').not('zapi_id', 'is', null).gte('criado_em', inicioDia).limit(5000)
  const contatosDia = new Set((dia || []).map((r: any) => r.conversa_id)).size
  if (contatosDia >= WA_MAX_CONTATOS_DIA)
    return { ok: false, motivo: `🛑 Limite diário de ${WA_MAX_CONTATOS_DIA} contatos novos atingido (proteção anti-bloqueio do número). As conversas já abertas hoje seguem liberadas.` }
  const min1 = new Date(Date.now() - 60_000).toISOString()
  const { data: min } = await supabase.from('wa_mensagens').select('conversa_id')
    .eq('org_id', org).eq('direcao', 'enviada').not('zapi_id', 'is', null).gte('criado_em', min1).limit(500)
  const contatosMin = new Set((min || []).map((r: any) => r.conversa_id)).size
  if (contatosMin >= WA_MAX_CONTATOS_MIN)
    return { ok: false, motivo: `⏳ Muitos contatos novos em pouco tempo — espere alguns segundos antes do próximo (proteção do número).` }
  return { ok: true }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { telefone, texto, audioBase64, anexoBase64, anexoNome, anexoTipo, anexoExt, leadId, chatLid, enviadoPor } = body
    const org = await orgDaRequest(req.headers.get('authorization'))

    let fone = (telefone || '').toString()
    let leadInfo: any = null

    if (leadId) {
      const { data: lead } = await supabase.from('leads').select('id, nome, whatsapp').eq('org_id', org).eq('id', leadId).single()
      if (lead) { leadInfo = lead; if (!fone) fone = lead.whatsapp || '' }
    }
    fone = foneZapi(fone)
    if (!fone && !chatLid) return NextResponse.json({ ok: false, error: 'telefone invalido' }, { status: 400 })
    if (!texto && !audioBase64 && !anexoBase64) return NextResponse.json({ ok: false, error: 'nada pra enviar' }, { status: 400 })

    // GUARDRAIL: acha a conversa existente (só leitura, sem criar) e checa os limites de alcance.
    let convGuard: string | null = null
    if (leadId) {
      const { data } = await supabase.from('wa_conversas').select('id').eq('org_id', org).eq('lead_id', leadId).eq('canal', 'zapi').order('ultima_msg_em', { ascending: false, nullsFirst: false }).limit(1)
      if (data && data[0]) convGuard = data[0].id
    }
    if (!convGuard && fone) {
      const { data } = await supabase.from('wa_conversas').select('id').eq('org_id', org).eq('telefone', fone).eq('canal', 'zapi').maybeSingle()
      if (data) convGuard = data.id
    }
    const guard = await guardrailWA(org, convGuard)
    if (!guard.ok) return NextResponse.json({ ok: false, error: guard.motivo, guardrail: true }, { status: 200 })

    // Alvo do envio: número real (10–13 dígitos) usa o número; senão usa o @lid
    // (do chatLid salvo, ou reconstruído dos dígitos do id). Z-API aceita @lid.
    const foneDigits = fone.replace(/\D/g, '')
    let alvo: string
    if (foneDigits.length >= 10 && foneDigits.length <= 13) alvo = fone
    else if (chatLid) alvo = chatLid.toString()
    else if (foneDigits.length > 13) alvo = `${foneDigits}@lid`
    else alvo = fone

    // Envia pelo Z-API
    let r
    if (anexoBase64) {
      if (anexoTipo === 'imagem') r = await enviarImagem(alvo, anexoBase64, texto || '')
      else r = await enviarDocumento(alvo, anexoBase64, anexoNome || 'arquivo', anexoExt || 'pdf')
    } else if (audioBase64) {
      r = await enviarAudio(alvo, audioBase64)
    } else {
      r = await enviarTexto(alvo, texto)
    }
    if (!r.ok) return NextResponse.json(r, { status: 200 })

    // Acha a conversa: PRIMEIRO pelo lead (fonte da verdade), depois por telefone exato
    let conversa: any = null
    if (leadInfo || leadId) {
      const lid = leadInfo ? leadInfo.id : leadId
      const { data: porLead } = await supabase.from('wa_conversas').select('*').eq('org_id', org).eq('lead_id', lid).eq('canal', 'zapi').order('ultima_msg_em', { ascending: false, nullsFirst: false }).limit(1)
      if (porLead && porLead[0]) conversa = porLead[0]
    }
    if (!conversa) {
      const { data: porFone } = await supabase.from('wa_conversas').select('*').eq('org_id', org).eq('telefone', fone).eq('canal', 'zapi').maybeSingle()
      conversa = porFone || null
    }
    if (!conversa) {
      const { data: nova } = await supabase.from('wa_conversas').insert({
        org_id: org,
        telefone: fone,
        nome: leadInfo ? leadInfo.nome : null,
        lead_id: leadInfo ? leadInfo.id : (leadId || null),
        canal: 'zapi',
      }).select().single()
      conversa = nova
    }

    if (conversa) {
      const tipoMsg = anexoBase64 ? (anexoTipo === 'imagem' ? 'imagem' : 'documento') : (audioBase64 ? 'audio' : 'texto')
      await supabase.from('wa_mensagens').insert({
        org_id: org,
        conversa_id: conversa.id,
        zapi_id: r.id,
        direcao: 'enviada',
        tipo: tipoMsg,
        texto: tipoMsg === 'documento' ? (anexoNome || null) : (texto || null),
        midia_url: anexoBase64 || audioBase64 || null,
        midia_mime: anexoBase64 ? (anexoTipo === 'imagem' ? 'image/*' : 'application/octet-stream') : (audioBase64 ? 'audio/ogg' : null),
        status: 'enviada',
        enviado_por: enviadoPor || null,
      })
      const resumoMsg = tipoMsg === 'imagem' ? '📷 Imagem' : tipoMsg === 'documento' ? `📎 ${anexoNome || 'documento'}` : tipoMsg === 'audio' ? '🎤 Áudio' : texto
      await supabase.from('wa_conversas').update({
        ultima_msg: resumoMsg,
        ultima_msg_em: new Date().toISOString(),
      }).eq('id', conversa.id)
    }

    return NextResponse.json({ ok: true, conversaId: conversa ? conversa.id : null })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}