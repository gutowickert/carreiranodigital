// DOSSIÊ ÚNICO do lead — a fonte de verdade que TODO mundo (motor, tela Qualidade, copiloto) usa.
// Junta as DUAS linhas de WhatsApp (zapi + oficial) + ligações + áudios + TODOS os andamentos do card,
// em ordem cronológica, e calcula os sinais de engajamento. Nada de "cada parte olha do seu jeito".

type LeadRef = { id: string; whatsapp?: string | null }
export type MsgLinha = { quem: 'cliente' | 'nos'; texto: string; canal: string; status: string; em: string }
export type AndLinha = { tipo: string; observacao: string; em: string }
export type Dossie = {
  mensagens: MsgLinha[]
  andamentos: AndLinha[]
  temInbound: boolean          // alguma mensagem RECEBIDA (qualquer canal)
  temLigacao: boolean          // alguma ligação registrada
  engajado: boolean            // já teve contato humano de verdade (inbound OU ligação OU observação humana)
  ultimoInboundEm: string | null
  ultimoOutboundEm: string | null
  ultimoContatoEm: string | null   // último movimento de qualquer tipo
}

const suf = (t: string | null | undefined) => (t || '').replace(/\D/g, '').slice(-8)
const RECEBIDA = (m: any) => m.direcao === 'recebida' || m.status === 'recebida'
// andamentos que NÃO contam como "conversa humana" (são automáticos/sistema)
const AND_AUTO = new Set(['tarefa_criada', 'mudanca_etapa', 'criado', 'webhook_convertido', 'ia_followup', 'migracao_num', 'recuperacao_falha'])

// Monta o dossiê de VÁRIOS leads de uma vez (batch — evita N+1 no motor).
export async function dossiesLote(sb: any, org: string, leads: LeadRef[]): Promise<Map<string, Dossie>> {
  const out = new Map<string, Dossie>()
  for (const l of leads) out.set(l.id, { mensagens: [], andamentos: [], temInbound: false, temLigacao: false, engajado: false, ultimoInboundEm: null, ultimoOutboundEm: null, ultimoContatoEm: null })
  if (!leads.length) return out
  const leadIds = leads.map(l => l.id)

  // 1) conversas do lead — por lead_id (as 2 linhas costumam ter lead_id) + por telefone (histórico antigo sem lead_id)
  const convs: any[] = []
  for (let i = 0; i < leadIds.length; i += 200) { const { data } = await sb.from('wa_conversas').select('id, lead_id, telefone').in('lead_id', leadIds.slice(i, i + 200)); convs.push(...(data || [])) }
  const fones = [...new Set(leads.map(l => suf(l.whatsapp)).filter(s => s.length === 8))]
  for (const f of fones) { const { data } = await sb.from('wa_conversas').select('id, lead_id, telefone').eq('org_id', org).ilike('telefone', `%${f}`); for (const c of (data || [])) if (!convs.some(x => x.id === c.id)) convs.push(c) }

  // conversa_id -> leadId (por lead_id direto; senão casa pelo sufixo do telefone)
  const foneDoLead = new Map<string, string>(); for (const l of leads) { const s = suf(l.whatsapp); if (s.length === 8) foneDoLead.set(s, l.id) }
  const convToLead = new Map<string, string>()
  for (const c of convs) { const lid = c.lead_id && out.has(c.lead_id) ? c.lead_id : foneDoLead.get(suf(c.telefone)); if (lid) convToLead.set(c.id, lid) }
  const convIds = [...convToLead.keys()]

  // 2) mensagens dessas conversas (paginado)
  const msgs: any[] = []
  for (let i = 0; i < convIds.length; i += 150) {
    const chunk = convIds.slice(i, i + 150)
    for (let from = 0; ; from += 1000) { const { data } = await sb.from('wa_mensagens').select('conversa_id, direcao, status, texto, canal, criado_em').in('conversa_id', chunk).range(from, from + 999); if (!data?.length) break; msgs.push(...data); if (data.length < 1000) break }
  }
  for (const m of msgs) {
    const lid = convToLead.get(m.conversa_id); if (!lid) continue
    const d = out.get(lid)!; const em = m.criado_em
    const receb = RECEBIDA(m)
    if ((m.texto || '').trim()) d.mensagens.push({ quem: receb ? 'cliente' : 'nos', texto: m.texto, canal: m.canal || '?', status: m.status || '', em })
    if (receb) { d.temInbound = true; if (!d.ultimoInboundEm || em > d.ultimoInboundEm) d.ultimoInboundEm = em }
    else if (m.status !== 'falha') { if (!d.ultimoOutboundEm || em > d.ultimoOutboundEm) d.ultimoOutboundEm = em }
  }

  // 3) TODOS os andamentos do card (ligações, áudios, observações, etapa, tarefas)
  const ands: any[] = []
  for (let i = 0; i < leadIds.length; i += 200) { const { data } = await sb.from('lead_andamentos').select('lead_id, tipo, observacao, criado_em').in('lead_id', leadIds.slice(i, i + 200)); ands.push(...(data || [])) }
  for (const a of ands) {
    const d = out.get(a.lead_id); if (!d) continue
    d.andamentos.push({ tipo: a.tipo, observacao: a.observacao || '', em: a.criado_em })
    if (a.tipo === 'ligacao') d.temLigacao = true
  }

  // 4) fecha os sinais
  for (const d of out.values()) {
    d.mensagens.sort((a, b) => +new Date(a.em) - +new Date(b.em))
    d.andamentos.sort((a, b) => +new Date(a.em) - +new Date(b.em))
    // engajado = teve conversa DE VERDADE: respondeu mensagem OU tem nota humana (ligação atendida vira observação).
    // Ligação só "iniciada" (sem retorno/nota) NÃO conta — é justamente o alvo da Esteira IA ("não atenderam").
    const temNotaHumana = d.andamentos.some(a => !AND_AUTO.has(a.tipo) && a.tipo !== 'ligacao' && (a.observacao || '').trim())
    d.engajado = d.temInbound || temNotaHumana
    const datas = [d.ultimoInboundEm, d.ultimoOutboundEm, ...d.andamentos.map(a => a.em)].filter(Boolean) as string[]
    d.ultimoContatoEm = datas.length ? datas.sort().slice(-1)[0] : null
  }
  return out
}

// Dossiê de UM lead (tela/copiloto).
export async function dossieLead(sb: any, org: string, lead: LeadRef): Promise<Dossie> {
  return (await dossiesLote(sb, org, [lead])).get(lead.id)!
}

// Linha do tempo unificada (mensagens + andamentos) pronta pra exibir/mandar pro modelo.
export function timelineDossie(d: Dossie, max = 30): { quem: string; texto: string; em: string }[] {
  const linhas = [
    ...d.mensagens.map(m => ({ quem: m.quem === 'cliente' ? 'cliente' : 'nos', texto: m.texto, em: m.em })),
    ...d.andamentos.filter(a => a.tipo === 'ligacao' || (!AND_AUTO.has(a.tipo) && (a.observacao || '').trim()))
      .map(a => ({ quem: 'evento', texto: a.tipo === 'ligacao' ? `📞 ligação${a.observacao ? ' — ' + a.observacao : ''}` : a.observacao, em: a.em })),
  ]
  return linhas.sort((a, b) => +new Date(a.em) - +new Date(b.em)).slice(-max)
}
