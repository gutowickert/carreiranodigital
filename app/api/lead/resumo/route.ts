import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 60

// Sonnet dá conta do resumo e é mais barato/rápido que o Opus (o resumo é cacheado
// e só regenera quando entra mensagem/andamento novo). Troque se quiser.
const MODELO = 'claude-sonnet-4-6'

const suf = (t: string) => (t || '').replace(/\D/g, '').slice(-8)

const SYSTEM = `Você resume a negociação de um lead da Carreira No Digital (cursos presenciais de marketing no RS) pro vendedor bater o olho e saber onde está, SEM reler tudo. Baseie-se APENAS na conversa do WhatsApp e nos andamentos (anotações do vendedor) fornecidos. Não invente. Se algo não apareceu, diga que não.

Responda APENAS com um objeto JSON válido, sem texto antes ou depois, exatamente neste formato:
{
 "temperatura":"quente|morno|frio",
 "jaExplicouCurso":"sim|parcial|nao",
 "ondeParou":"1 frase: qual foi a última interação e o que está pendente agora",
 "resumo":["3 a 6 bullets curtos com o essencial: objetivo/negócio do cliente, cidade/turma de interesse, o que já foi oferecido (formato, valor, condição), sinais de interesse"],
 "objecoes":"objeções levantadas e se foram resolvidas — ou 'nenhuma'",
 "proximoPasso":"o que o vendedor deve fazer AGORA pra avançar"
}
Regras: jaExplicouCurso = 'sim' só se oferta/formato E preço já foram apresentados; 'parcial' se parte; 'nao' se nada. temperatura pela intenção de compra demonstrada. Português, direto, tom da escola.`

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const body = await req.json().catch(() => ({}))
    const leadId: string | undefined = body.leadId
    const forcar: boolean = !!body.forcar
    if (!leadId) return NextResponse.json({ ok: false, error: 'falta leadId' }, { status: 200 })

    const { data: lead } = await supabase.from('leads')
      .select('id, nome, whatsapp, etapa, codigo_turma, resumo_ia, resumo_ia_em').eq('org_id', org).eq('id', leadId).single()
    if (!lead) return NextResponse.json({ ok: false, error: 'lead não encontrado' }, { status: 200 })

    // conversas do lead (por lead_id e por sufixo do telefone)
    const s = suf(lead.whatsapp)
    const { data: convs } = await supabase.from('wa_conversas').select('id').eq('org_id', org)
      .or(`lead_id.eq.${leadId}${s.length === 8 ? `,telefone.ilike.%${s}` : ''}`)
    const convIds = (convs || []).map((c: any) => c.id)

    // última atividade (msg ou andamento) — pra saber se o cache está velho
    let ultimaMsg: string | null = null
    if (convIds.length) {
      const { data } = await supabase.from('wa_mensagens').select('criado_em').in('conversa_id', convIds)
        .order('criado_em', { ascending: false }).limit(1).maybeSingle()
      ultimaMsg = data?.criado_em || null
    }
    const { data: ultAnd } = await supabase.from('lead_andamentos').select('criado_em').eq('lead_id', leadId)
      .order('criado_em', { ascending: false }).limit(1).maybeSingle()
    const ultimaAtividade = [ultimaMsg, ultAnd?.criado_em].filter(Boolean).sort().pop() || null
    const stale = !lead.resumo_ia_em || (ultimaAtividade ? lead.resumo_ia_em < ultimaAtividade : false)

    // sem forçar: devolve o cache (não chama a IA)
    if (!forcar) {
      return NextResponse.json({ ok: true, resumo: lead.resumo_ia || null, em: lead.resumo_ia_em || null, stale, temMensagens: convIds.length > 0 })
    }

    // ---- gera com a IA ----
    const key = process.env.ANTHROPIC_API_KEY
    if (!key) return NextResponse.json({ ok: false, error: 'Falta ANTHROPIC_API_KEY no servidor.' }, { status: 200 })

    // mensagens da conversa (cronológico), transcrevendo áudios pendentes
    let linhas: string[] = []
    if (convIds.length) {
      const { data: msgs } = await supabase.from('wa_mensagens')
        .select('id, direcao, status, texto, tipo, midia_url, criado_em').in('conversa_id', convIds)
        .order('criado_em', { ascending: false }).limit(80)
      const recentes = (msgs || []).reverse()
      const dgKey = process.env.DEEPGRAM_API_KEY
      const pendentes = recentes.filter((m: any) => m.tipo === 'audio' && m.midia_url && !(m.texto || '').trim()).slice(-15)
      if (dgKey && pendentes.length) {
        await Promise.all(pendentes.map(async (m: any) => {
          try {
            const a = await fetch(m.midia_url); if (!a.ok) return
            const buf = Buffer.from(await a.arrayBuffer())
            const r = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=pt&smart_format=true', {
              method: 'POST', headers: { Authorization: 'Token ' + dgKey, 'Content-Type': 'audio/ogg' }, body: buf,
            })
            const j = await r.json()
            const tx = (j?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '').trim()
            if (tx) { m.texto = '🎤 ' + tx; await supabase.from('wa_mensagens').update({ texto: m.texto }).eq('id', m.id) }
          } catch { /* ignora */ }
        }))
      }
      linhas = recentes
        .filter((m: any) => (m.texto || '').trim())
        .map((m: any) => {
          const quem = (m.direcao === 'recebida' || m.status === 'recebida') ? 'CLIENTE' : 'VENDEDOR'
          const dia = (m.criado_em || '').slice(0, 10)
          return `[${dia}] ${quem}: ${(m.texto || '').replace(/\s+/g, ' ').trim().slice(0, 400)}`
        })
        .filter((l: string) => l.length > 12)
        .slice(-50)
    }

    // andamentos (anotações do vendedor + mudanças de etapa)
    const { data: ands } = await supabase.from('lead_andamentos')
      .select('tipo, observacao, etapa_anterior, etapa_nova, criado_em').eq('lead_id', leadId)
      .order('criado_em', { ascending: true }).limit(60)
    const andTxt = (ands || [])
      .map((a: any) => {
        const dia = (a.criado_em || '').slice(0, 10)
        const et = a.etapa_nova ? ` (etapa: ${a.etapa_anterior || '?'}→${a.etapa_nova})` : ''
        const obs = (a.observacao || '').replace(/\s+/g, ' ').trim()
        return obs || et ? `[${dia}]${et}${obs ? ' ' + obs : ''}` : ''
      })
      .filter(Boolean).slice(-40)

    const contexto = `LEAD: ${lead.nome || '(sem nome)'} | etapa atual: ${lead.etapa || '-'} | turma de interesse: ${lead.codigo_turma || '-'}

ANDAMENTOS (anotações do vendedor e mudanças de etapa):
${andTxt.length ? andTxt.join('\n') : '(sem andamentos)'}

CONVERSA NO WHATSAPP:
${linhas.length ? linhas.join('\n') : '(sem mensagens)'}

Gere o resumo em JSON.`

    const client = new Anthropic({ apiKey: key })
    const resp = await client.messages.create({
      model: MODELO, max_tokens: 1024, system: SYSTEM,
      messages: [{ role: 'user', content: contexto }],
    })
    const rawTxt = (resp.content || []).map((b: any) => b.type === 'text' ? b.text : '').join('').trim()
    let out: any = null
    try { out = JSON.parse(rawTxt) } catch {
      const a = rawTxt.indexOf('{'), z = rawTxt.lastIndexOf('}')
      if (a >= 0 && z > a) { try { out = JSON.parse(rawTxt.slice(a, z + 1)) } catch {} }
    }
    if (!out) return NextResponse.json({ ok: false, error: 'não consegui gerar o resumo agora' }, { status: 200 })

    // normaliza resumo pra array
    if (typeof out.resumo === 'string') out.resumo = out.resumo.split(/\n|•|·/).map((x: string) => x.trim()).filter(Boolean)

    const agora = new Date().toISOString()
    await supabase.from('leads').update({ resumo_ia: out, resumo_ia_em: agora }).eq('id', leadId)
    return NextResponse.json({ ok: true, resumo: out, em: agora, stale: false, temMensagens: convIds.length > 0 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}
