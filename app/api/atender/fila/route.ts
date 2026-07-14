import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'

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

// Fila de atendimento priorizada: 🔥 quem respondeu (última msg dele) primeiro; depois follow-ups frios (1-13d).
// Não inclui agendado/aguardando pagamento (compromisso) nem falado hoje sem resposta.
export async function GET() {
  const now = Date.now()
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const leads = (await todos('leads', 'id,nome,etapa,whatsapp,codigo_turma,cidade')).filter((l: any) => !['ganho', 'perda', 'agendado', 'aguardando_pagamento'].includes(l.etapa))
  const lset = new Set(leads.map((l: any) => l.id))
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
  const perConv: Record<string, { lastAny: number; lastIn: number; dir: string; texto: string }> = {}
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100); let from = 0
    for (; ;) {
      const { data } = await sb.from('wa_mensagens').select('conversa_id,direcao,status,texto,criado_em').in('conversa_id', chunk).range(from, from + 999)
      if (!data?.length) break
      for (const m of data as any[]) {
        const t = +new Date(m.criado_em); const inbound = (m.direcao === 'recebida' || m.status === 'recebida')
        const o = perConv[m.conversa_id] = perConv[m.conversa_id] || { lastAny: 0, lastIn: 0, dir: 'out', texto: '' }
        if (t > o.lastAny) { o.lastAny = t; o.dir = inbound ? 'in' : 'out'; o.texto = (m.texto || '').slice(0, 120) }
        if (inbound && t > o.lastIn) o.lastIn = t
      }
      if (data.length < 1000) break; from += 1000
    }
  }
  const fila: any[] = []
  for (const l of leads) {
    const cs = [...(convDeLead[l.id] || []), ...(convPorTel[suf(l.whatsapp)] || [])]
    let best: any = null, bestConv: string = ''
    for (const cid of cs) { const o = perConv[cid]; if (o && (!best || o.lastAny > best.lastAny)) { best = o; bestConv = cid } }
    if (!best || !best.lastAny) continue
    const dSC = Math.floor((now - best.lastAny) / 864e5)
    const hojeC = new Date(best.lastAny).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) === hoje
    const conv = convById[bestConv] || {}
    const item = {
      leadId: l.id, nome: l.nome, etapa: l.etapa,
      conversaId: bestConv, telefone: conv.telefone || l.whatsapp, chatLid: conv.chat_lid || null,
      snippet: best.texto || conv.ultima_msg || '', dSC,
      produto: familia(l.codigo_turma), cidade: l.cidade || null,
    }
    if (best.dir === 'in') fila.push({ ...item, prioridade: 'quente', ord: best.lastAny })   // respondeu, esperando
    else if (!hojeC && dSC >= 1 && dSC <= 13) fila.push({ ...item, prioridade: 'followup', ord: -dSC }) // frio a nutrir
  }
  const quentes = fila.filter(f => f.prioridade === 'quente').sort((a, b) => b.ord - a.ord)
  const followups = fila.filter(f => f.prioridade === 'followup').sort((a, b) => a.dSC > b.dSC ? -1 : 1)
  return NextResponse.json({ ok: true, quentes: quentes.length, followups: followups.length, fila: [...quentes, ...followups] })
}
