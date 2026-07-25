import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { enviarTexto, foneOficial } from '@/lib/whatsapp-oficial'
import { sugerirAtendimento } from '@/lib/atendimento-ia'

export const maxDuration = 300

// RESPONDEDOR AUTÔNOMO — a IA atende quem ESTÁ ESPERANDO resposta (última mensagem foi do CLIENTE,
// dentro da janela de 24h → dá pra mandar texto livre). Gera a resposta pelo copiloto e decide:
//   • responder normal → manda a mensagem (avança a etapa se mudou), marca atendido_por='ia'
//   • agendar_ligacao → cria ligação pro time + confirma
//   • chamar_humano / confiança baixa → ESCALA: seta handoff, devolve pro time, manda recado de espera
// dryRun (padrão) só mostra. Enviar: { dryRun:false, confirm:true }. Kill switch: ia-automacao {ligado:false}.
const DIA = 864e5

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({} as any))
    const dryRun = b?.dryRun !== false
    const confirm = b?.confirm === true
    const limit = Math.min(Math.max(Number(b?.limit) || 8, 1), 30)
    if (!dryRun && !confirm) return NextResponse.json({ ok: false, error: 'pra enviar: dryRun=false E confirm=true' }, { status: 200 })

    const { data: cfg } = await sb.from('webhook_logs').select('payload').eq('org_id', org).eq('origem', 'ia-automacao').order('recebido_em', { ascending: false }).limit(1).maybeSingle()
    if ((cfg?.payload as any)?.ligado === false && !dryRun) return NextResponse.json({ ok: false, killed: true, error: 'Automação DESLIGADA (kill switch).' }, { status: 200 })

    // 1) conversas oficiais com mensagem RECEBIDA nas últimas 24h
    const desde = new Date(Date.now() - DIA).toISOString()
    const { data: recs } = await sb.from('wa_mensagens').select('conversa_id, criado_em').eq('org_id', org).eq('canal', 'oficial').eq('direcao', 'recebida').gte('criado_em', desde).order('criado_em', { ascending: false }).limit(400)
    const convIds = [...new Set((recs || []).map(m => m.conversa_id))]
    if (!convIds.length) return NextResponse.json({ ok: true, dryRun, esperando: 0, planejados: 0, amostra: [] })

    // 2) por conversa: a ÚLTIMA mensagem é do cliente? (então está esperando resposta). pega lead + texto.
    const esperando: { leadId: string; conversaId: string; ultimaFala: string; em: string }[] = []
    for (let i = 0; i < convIds.length; i += 100) {
      const chunk = convIds.slice(i, i + 100)
      const { data: convs } = await sb.from('wa_conversas').select('id, lead_id').in('id', chunk)
      const leadDe = new Map((convs || []).map(c => [c.id, c.lead_id]))
      const { data: msgs } = await sb.from('wa_mensagens').select('conversa_id, direcao, status, texto, criado_em').in('conversa_id', chunk).order('criado_em', { ascending: false }).limit(2000)
      const ultima = new Map<string, any>()
      for (const m of msgs || []) if (!ultima.has(m.conversa_id)) ultima.set(m.conversa_id, m) // 1ª (mais recente)
      for (const [cid, m] of ultima) {
        const inbound = m.direcao === 'recebida' || m.status === 'recebida'
        const lead = leadDe.get(cid)
        if (inbound && lead && (Date.now() - +new Date(m.criado_em)) < DIA) esperando.push({ leadId: lead, conversaId: cid, ultimaFala: (m.texto || '').slice(0, 160), em: m.criado_em })
      }
    }
    // dedup por lead (um lead, um atendimento)
    const vistos = new Set<string>()
    const fila = esperando.filter(e => e.leadId && !vistos.has(e.leadId) && vistos.add(e.leadId)).slice(0, limit)

    const previews: any[] = []
    let respondidos = 0, escalados = 0, agendados = 0, avancados = 0, falhas = 0

    for (const e of fila) {
      const { data: lead } = await sb.from('leads').select('id, nome, whatsapp, etapa, codigo_turma, turma_id').eq('id', e.leadId).maybeSingle()
      if (!lead) { falhas++; continue }
      const r: any = await sugerirAtendimento({ leadId: lead.id })
      if (!r?.ok || !r.sugestao) { falhas++; previews.push({ lead: lead.nome, erro: r?.error || 'sem sugestão' }); continue }
      const s = r.sugestao
      const escala = s.acao_sugerida === 'chamar_humano' || String(s.confianca).toLowerCase() === 'baixa'
      const agenda = s.acao_sugerida === 'agendar_ligacao'
      const resposta = (s.resposta || '').trim()

      if (dryRun) {
        previews.push({ lead: lead.nome, etapa: lead.etapa, ultimaFala: e.ultimaFala, acao: s.acao_sugerida, confianca: s.confianca, decisao: escala ? '🙋 ESCALA (humano)' : agenda ? '📞 AGENDA LIGAÇÃO' : '🤖 RESPONDE', etapaSugerida: s.etapa_sugerida, resposta })
        continue
      }

      const to = foneOficial(lead.whatsapp || '')
      if (!to) { falhas++; continue }

      if (escala) {
        await sb.from('leads').update({ atendido_por: 'humano', handoff_motivo: s.objecao && s.objecao !== 'nenhuma' ? s.objecao : (s.situacao || 'IA pediu ajuda'), handoff_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }).eq('id', lead.id)
        await sb.from('lead_andamentos').insert({ lead_id: lead.id, tipo: 'ia_handoff', observacao: `🙋 IA pediu ajuda — ${s.acao_sugerida}/${s.confianca}: ${(s.situacao || '').slice(0, 140)}` })
        if (resposta) { const rr = await enviarTexto(to, resposta); if (rr.ok) await registrarSaida(org, lead, e.conversaId, resposta, to) }
        escalados++; continue
      }

      // responde normal (ou agenda ligação — a mensagem já pede o horário)
      const rr = await enviarTexto(to, resposta)
      if (!rr.ok) { falhas++; previews.push({ lead: lead.nome, erro: rr.error }); continue }
      await registrarSaida(org, lead, e.conversaId, resposta, to)
      await sb.from('leads').update({ atendido_por: 'ia', atualizado_em: new Date().toISOString() }).eq('id', lead.id)
      if (s.etapa_sugerida && s.etapa_sugerida !== 'manter' && s.etapa_sugerida !== lead.etapa) {
        await sb.from('leads').update({ etapa: s.etapa_sugerida }).eq('id', lead.id)
        await sb.from('lead_andamentos').insert({ lead_id: lead.id, tipo: 'mudanca_etapa', etapa_anterior: lead.etapa, etapa_nova: s.etapa_sugerida, observacao: `🤖 IA (atendimento) — ${s.acao_sugerida}` })
        avancados++
      }
      if (agenda) { await sb.from('tarefas_lead').insert({ lead_id: lead.id, tipo: 'ligar_agendado', titulo: `Ligar (pedido no WhatsApp) — ${lead.nome}`, descricao: s.proximo_passo || 'Lead pediu ligação no atendimento da IA.' }); agendados++ }
      await sb.from('lead_andamentos').insert({ lead_id: lead.id, tipo: 'ia_followup', observacao: `🤖 IA respondeu (${s.acao_sugerida}): ${resposta.slice(0, 120)}` })
      respondidos++
    }

    return NextResponse.json({ ok: true, dryRun, esperando: fila.length, respondidos, escalados, agendados, avancados, falhas, amostra: previews })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}

async function registrarSaida(org: string, lead: any, conversaId: string, texto: string, to: string) {
  let conv: any = conversaId
  if (!conv) { const c = (await sb.from('wa_conversas').select('id').eq('org_id', org).eq('lead_id', lead.id).eq('canal', 'oficial').limit(1).maybeSingle()).data; conv = c?.id }
  if (!conv) { const c = await sb.from('wa_conversas').insert({ org_id: org, telefone: to, nome: lead.nome, lead_id: lead.id, canal: 'oficial' }).select('id').single(); conv = c.data?.id }
  if (conv) {
    await sb.from('wa_mensagens').insert({ org_id: org, conversa_id: conv, direcao: 'enviada', tipo: 'texto', texto, status: 'enviada', canal: 'oficial' })
    await sb.from('wa_conversas').update({ ultima_msg: texto.slice(0, 200), ultima_msg_em: new Date().toISOString() }).eq('id', conv)
  }
}
