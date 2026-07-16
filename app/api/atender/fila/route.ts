import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { getFluxo, PRIORIDADE_PADRAO } from '@/lib/fluxo'

export const maxDuration = 60

const suf = (t: string) => (t || '').replace(/\D/g, '').slice(-8)
async function todos(tab: string, cols: string, f?: (q: any) => any) {
  let out: any[] = [], from = 0
  for (; ;) {
    let q = sb.from(tab).select(cols).range(from, from + 999)
    if (f) q = f(q)
    const { data } = await q
    if (!data?.length) break
    out.push(...data); if (data.length < 1000) break; from += 1000
  }
  return out
}
const familia = (cod: string) => /^fc/i.test(cod || '') ? 'FC' : /^anl/i.test(cod || '') ? 'ANL' : ''

// Fila de atendimento. `fila` (Atender Agora / Copiloto): 🔥 quem respondeu + follow-ups frios.
// `lote`: os FOLLOW-UPS DO DIA (tarefas vencidas/hoje), exceto quem está respondendo — pra despachar em massa.
// Todo item vem enriquecido: tempo de chegada, etapa no funil, se teve ligação, e andamentos.
export async function GET() {
  const now = Date.now()
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const leads = (await todos('leads', 'id,nome,etapa,whatsapp,codigo_turma,criado_em')).filter((l: any) => !['ganho', 'perda', 'agendado', 'aguardando_pagamento'].includes(l.etapa))
  const convs = await todos('wa_conversas', 'id,lead_id,telefone,chat_lid,ultima_msg,ultima_msg_em')
  const convDeLead: Record<string, string[]> = {}, convPorTel: Record<string, string[]> = {}, convById: Record<string, any> = {}
  for (const c of convs) {
    convById[c.id] = c
    if (c.lead_id) (convDeLead[c.lead_id] = convDeLead[c.lead_id] || []).push(c.id)
    const s = suf(c.telefone); if (s.length === 8) (convPorTel[s] = convPorTel[s] || []).push(c.id)
  }
  const alvo = new Set<string>()
  for (const l of leads) { (convDeLead[l.id] || []).forEach(id => alvo.add(id)); (convPorTel[suf(l.whatsapp)] || []).forEach(id => alvo.add(id)) }
  const ids = [...alvo]
  const perConv: Record<string, { lastAny: number; lastIn: number; dir: string; texto: string; textoCliente: string }> = {}
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100); let from = 0
    for (; ;) {
      const { data } = await sb.from('wa_mensagens').select('conversa_id,direcao,status,texto,tipo,criado_em').in('conversa_id', chunk).range(from, from + 999)
      if (!data?.length) break
      for (const m of data as any[]) {
        const t = +new Date(m.criado_em); const inbound = (m.direcao === 'recebida' || m.status === 'recebida')
        const txt = m.texto || (m.tipo === 'audio' ? '🎤 áudio' : m.tipo && m.tipo !== 'texto' ? `📎 ${m.tipo}` : '')
        const o = perConv[m.conversa_id] = perConv[m.conversa_id] || { lastAny: 0, lastIn: 0, dir: 'out', texto: '', textoCliente: '' }
        if (t > o.lastAny) { o.lastAny = t; o.dir = inbound ? 'in' : 'out'; o.texto = txt.slice(0, 160) }
        if (inbound && t > o.lastIn) { o.lastIn = t; o.textoCliente = txt.slice(0, 220) }
      }
      if (data.length < 1000) break; from += 1000
    }
  }

  // ENRIQUECIMENTO: ligações (quantas) + andamentos (quantos + último) por lead
  const leadIds = leads.map((l: any) => l.id)
  const ligCount: Record<string, number> = {}
  const andInfo: Record<string, { n: number; ultimo: string; em: string }> = {}
  for (let i = 0; i < leadIds.length; i += 200) {
    const chunk = leadIds.slice(i, i + 200)
    const { data: ligs } = await sb.from('ligacoes').select('lead_id').in('lead_id', chunk)
    for (const x of (ligs || [])) if (x.lead_id) ligCount[x.lead_id] = (ligCount[x.lead_id] || 0) + 1
    const { data: ands } = await sb.from('lead_andamentos').select('lead_id,observacao,criado_em').in('lead_id', chunk).order('criado_em', { ascending: false })
    for (const a of (ands || [])) { const o = andInfo[a.lead_id] = andInfo[a.lead_id] || { n: 0, ultimo: '', em: '' }; o.n++; if (!o.ultimo && a.observacao) { o.ultimo = a.observacao; o.em = a.criado_em } }
  }

  // FOLLOW-UPS DO DIA: tarefas pendentes vencidas ou de hoje
  const tarefas = await todos('tarefas_lead', 'lead_id,tipo,titulo,data_vencimento', q => q.eq('concluida', false).eq('cancelada', false).lte('data_vencimento', hoje + 'T23:59:59'))
  const tarefaDeLead: Record<string, any> = {}
  for (const t of tarefas) { const c = tarefaDeLead[t.lead_id]; if (!c || (t.data_vencimento || '') < (c.data_vencimento || '')) tarefaDeLead[t.lead_id] = t }

  const bestDe = (l: any) => {
    const cs = [...(convDeLead[l.id] || []), ...(convPorTel[suf(l.whatsapp)] || [])]
    let best: any = null, bestConv = ''
    for (const cid of cs) { const o = perConv[cid]; if (o && (!best || o.lastAny > best.lastAny)) { best = o; bestConv = cid } }
    if (!bestConv) bestConv = cs[0] || ''
    return { best, bestConv }
  }
  const mkItem = (l: any, best: any, bestConv: string) => {
    const conv = convById[bestConv] || {}
    const a = andInfo[l.id]
    return {
      leadId: l.id, nome: l.nome, etapa: l.etapa,
      conversaId: bestConv || null, telefone: conv.telefone || l.whatsapp, chatLid: conv.chat_lid || null,
      snippet: best?.texto || conv.ultima_msg || '', ultimaCliente: best?.textoCliente || '',
      dSC: best?.lastAny ? Math.floor((now - best.lastAny) / 864e5) : null,
      chegouDias: l.criado_em ? Math.floor((now - +new Date(l.criado_em)) / 864e5) : null,
      temLigacao: ligCount[l.id] || 0, qtdAndamentos: a?.n || 0, ultimoAndamento: (a?.ultimo || '').slice(0, 140),
      produto: familia(l.codigo_turma), cidade: null,
    }
  }

  const P = (await getFluxo().then(f => f.prioridade).catch(() => null)) || PRIORIDADE_PADRAO
  const fila: any[] = []
  for (const l of leads) {
    const { best, bestConv } = bestDe(l)
    if (!best || !best.lastAny) continue
    const dSC = Math.floor((now - best.lastAny) / 864e5)
    const hojeC = new Date(best.lastAny).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) === hoje
    const item = mkItem(l, best, bestConv)
    if (best.dir === 'in') fila.push({ ...item, prioridade: 'quente', ord: best.lastAny })
    else if ((P.incluirFaladoHoje || !hojeC) && dSC >= 1 && dSC <= (P.followupDias || 13)) fila.push({ ...item, prioridade: 'followup' })
  }
  const prod = (a: any) => (P.produtoPrioritario && a.produto === P.produtoPrioritario) ? 0 : 1
  const quentes = fila.filter(f => f.prioridade === 'quente').sort((a, b) => prod(a) - prod(b) || (P.ordemQuente === 'esperando' ? a.ord - b.ord : b.ord - a.ord))
  const followups = fila.filter(f => f.prioridade === 'followup').sort((a, b) => prod(a) - prod(b) || (P.ordemFollowup === 'menos_frio' ? a.dSC - b.dSC : b.dSC - a.dSC))

  // LOTE = follow-ups do dia (tarefa vencida/hoje), exceto quem está respondendo (esses vão pro Atender Agora)
  const lote: any[] = []
  for (const l of leads) {
    const tf = tarefaDeLead[l.id]; if (!tf) continue
    const { best, bestConv } = bestDe(l)
    if (best && best.dir === 'in') continue
    const item = mkItem(l, best, bestConv)
    lote.push({ ...item, prioridade: 'followup', tarefa: { tipo: tf.tipo, titulo: tf.titulo, venc: (tf.data_vencimento || '').slice(0, 10) } })
  }
  lote.sort((a, b) => (a.tarefa.venc || '').localeCompare(b.tarefa.venc || ''))

  // SEM TAREFA (parados): leads em etapa ativa que NÃO têm nenhuma tarefa pendente — terminaram a cadência
  // (ou nunca geraram) e não foram movidos. Ficam invisíveis no Lote/Copiloto e se perdem no CRM.
  const pend = await todos('tarefas_lead', 'lead_id', q => q.eq('concluida', false).eq('cancelada', false))
  const comTarefa = new Set(pend.map((t: any) => t.lead_id))
  const parados: any[] = []
  for (const l of leads) {
    if (comTarefa.has(l.id)) continue
    const { best, bestConv } = bestDe(l)
    parados.push({ ...mkItem(l, best, bestConv), prioridade: 'followup' })
  }
  parados.sort((a, b) => (b.dSC || 0) - (a.dSC || 0)) // mais parado (mais silêncio) primeiro

  return NextResponse.json({ ok: true, quentes: quentes.length, followups: followups.length, fila: [...quentes, ...followups], lote, loteCount: lote.length, parados, paradosCount: parados.length })
}
