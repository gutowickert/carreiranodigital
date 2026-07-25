import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { enviarTexto, foneOficial } from '@/lib/whatsapp-oficial'
import { sugerirAtendimento } from '@/lib/atendimento-ia'

// ATENDER UM LEAD — o cérebro autônomo, reusado pelo WEBHOOK (tempo real) e pelo CRON (rede de segurança).
// A IA lê o dossiê (via copiloto), gera a resposta e decide: responder / agendar ligação / escalar (chamar_humano).
// Faz o ANDAMENTO sozinha: avança etapa, agenda ligação, registra tudo. Só sai da IA quando ESCALA.
// Respeita o kill switch. dryRun não envia.

export type ResultadoAtender = { ok: boolean; acao?: string; decisao?: string; resposta?: string; etapa?: string; motivo?: string; erro?: string }

async function killAtivo(org: string): Promise<boolean> {
  const { data } = await sb.from('webhook_logs').select('payload').eq('org_id', org).eq('origem', 'ia-automacao').order('recebido_em', { ascending: false }).limit(1).maybeSingle()
  return (data?.payload as any)?.ligado === false
}

async function registrarSaida(org: string, lead: any, conversaId: string | null, texto: string, to: string) {
  let conv: any = conversaId
  if (!conv) { const c = (await sb.from('wa_conversas').select('id').eq('org_id', org).eq('lead_id', lead.id).eq('canal', 'oficial').limit(1).maybeSingle()).data; conv = c?.id }
  if (!conv) { const c = await sb.from('wa_conversas').insert({ org_id: org, telefone: to, nome: lead.nome, lead_id: lead.id, canal: 'oficial' }).select('id').single(); conv = c.data?.id }
  if (conv) {
    await sb.from('wa_mensagens').insert({ org_id: org, conversa_id: conv, direcao: 'enviada', tipo: 'texto', texto, status: 'enviada', canal: 'oficial' })
    await sb.from('wa_conversas').update({ ultima_msg: texto.slice(0, 200), ultima_msg_em: new Date().toISOString() }).eq('id', conv)
  }
}

export async function atenderLead(org: string, leadId: string, opts: { dryRun?: boolean; conversaId?: string } = {}): Promise<ResultadoAtender> {
  const seco = opts.dryRun === true // seco = simula (não envia)
  const { data: lead } = await sb.from('leads').select('id, nome, whatsapp, etapa, codigo_turma, turma_id, handoff_em, atendido_por').eq('id', leadId).maybeSingle()
  if (!lead) return { ok: false, erro: 'lead não encontrado' }
  // escalado (handoff pendente) → o time está no caso, a IA não fala
  if (lead.handoff_em) return { ok: false, motivo: 'escalado (handoff pendente) — time atende' }
  if (!seco && await killAtivo(org)) return { ok: false, motivo: 'automação desligada (kill switch)' }

  // ANTI-DUPLICADO: se já respondemos nos últimos 60s (lead mandou 2 msgs seguidas), não responde de novo
  if (!seco && opts.conversaId) {
    const { data: ult } = await sb.from('wa_mensagens').select('direcao, criado_em').eq('conversa_id', opts.conversaId).order('criado_em', { ascending: false }).limit(1).maybeSingle()
    if (ult && ult.direcao === 'enviada' && (Date.now() - +new Date(ult.criado_em)) < 60000) return { ok: false, motivo: 'já respondido há pouco (anti-duplicado)' }
  }

  const r: any = await sugerirAtendimento({ leadId: lead.id })
  if (!r?.ok || !r.sugestao) return { ok: false, erro: r?.error || 'sem sugestão' }
  const s = r.sugestao
  const resposta = (s.resposta || '').trim()
  const escala = s.acao_sugerida === 'chamar_humano' || String(s.confianca).toLowerCase() === 'baixa'
  const agenda = s.acao_sugerida === 'agendar_ligacao'
  const decisao = escala ? 'escala' : agenda ? 'agenda_ligacao' : 'responde'

  if (seco) return { ok: true, acao: s.acao_sugerida, decisao, resposta, etapa: s.etapa_sugerida, motivo: s.situacao }

  const to = foneOficial(lead.whatsapp || '')
  if (!to) return { ok: false, erro: 'sem telefone' }

  if (escala) {
    await sb.from('leads').update({ atendido_por: 'humano', handoff_motivo: s.objecao && s.objecao !== 'nenhuma' ? s.objecao : (s.situacao || 'IA pediu ajuda'), handoff_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }).eq('id', lead.id)
    await sb.from('lead_andamentos').insert({ lead_id: lead.id, tipo: 'ia_handoff', observacao: `🙋 IA pediu ajuda — ${s.acao_sugerida}/${s.confianca}: ${(s.situacao || '').slice(0, 140)}` })
    if (resposta) { const rr = await enviarTexto(to, resposta); if (rr.ok) await registrarSaida(org, lead, opts.conversaId || null, resposta, to) }
    return { ok: true, decisao: 'escala', resposta, motivo: s.situacao }
  }

  const rr = await enviarTexto(to, resposta)
  if (!rr.ok) return { ok: false, erro: rr.error }
  await registrarSaida(org, lead, opts.conversaId || null, resposta, to)
  await sb.from('leads').update({ atendido_por: 'ia', atualizado_em: new Date().toISOString() }).eq('id', lead.id)

  // ANDAMENTO automático: avança a etapa se mudou
  if (s.etapa_sugerida && s.etapa_sugerida !== 'manter' && s.etapa_sugerida !== lead.etapa) {
    await sb.from('leads').update({ etapa: s.etapa_sugerida }).eq('id', lead.id)
    await sb.from('lead_andamentos').insert({ lead_id: lead.id, tipo: 'mudanca_etapa', etapa_anterior: lead.etapa, etapa_nova: s.etapa_sugerida, observacao: `🤖 IA (atendimento) — ${s.acao_sugerida}` })
    // marcador pro follow-up automático dos estados que esperam retorno (pagamento / agendado)
    if (s.etapa_sugerida === 'aguardando_pagamento' || s.etapa_sugerida === 'agendado') {
      await sb.from('lead_andamentos').insert({ lead_id: lead.id, tipo: 'ia_aguarda', observacao: `⏳ IA aguardando (${s.etapa_sugerida}) — retomar se não houver retorno.` })
    }
  }
  // AGENDAMENTO automático: lead pediu ligação → cria na Fila de Ligações
  if (agenda) {
    await sb.from('tarefas_lead').insert({ lead_id: lead.id, tipo: 'ligar_agendado', titulo: `Ligar (pedido no WhatsApp) — ${lead.nome}`, descricao: s.proximo_passo || 'Lead pediu ligação no atendimento da IA.' })
  }
  await sb.from('lead_andamentos').insert({ lead_id: lead.id, tipo: 'ia_followup', observacao: `🤖 IA respondeu (${s.acao_sugerida}): ${resposta.slice(0, 120)}` })
  return { ok: true, acao: s.acao_sugerida, decisao, resposta, etapa: s.etapa_sugerida }
}
