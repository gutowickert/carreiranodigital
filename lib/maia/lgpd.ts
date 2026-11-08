// Maia: o mínimo de LGPD pro piloto (07/11).
//  (a) aviso curto de privacidade na 1ª resposta a um cliente novo. Por negócio em meta.atendimento.privacidade:
//      { ligado: true (padrão), texto?: o aviso do próprio negócio, link?: a política de privacidade (https) }
//  (b) "apagar dados deste contato" (painel da equipe): apaga a conversa, as mensagens, o contato do funil, o histórico dele,
//      as mídias que ele mandou e os registros técnicos ligados a ele, SÓ do negócio dele. Fica um evento sem dado pessoal.
import { maiaDb as db } from './db'
import { tomDoNegocio } from './tom'
import { ehSimulado, fone } from '@/lib/oito/wa'

export function avisoPrivacidade(neg: any): string | null {
  const p = neg?.meta?.atendimento?.privacidade || {}
  if (p.ligado === false) return null
  const voce = tomDoNegocio(neg).pessoa === 'voce'
  const texto = String(p.texto || '').trim() || (voce
    ? `Um aviso rápido: este atendimento é feito por uma assistente virtual (IA) do ${neg.nome}. Suas mensagens ficam guardadas só pra atender você. Se quiser que a gente apague seus dados, é só pedir aqui.`
    : `Um aviso rápido: este atendimento é feito por uma assistente virtual (IA) do ${neg.nome}. Tuas mensagens ficam guardadas só pra te atender. Se quiser que a gente apague teus dados, é só pedir aqui.`)
  const link = /^https:\/\/\S+$/.test(String(p.link || '').trim()) ? String(p.link).trim() : ''
  return link ? `${texto} ${voce ? 'Saiba mais' : 'Mais detalhes'}: ${link}` : texto
}

// limpa o que veio do painel
export function privacidadeValida(p: any) {
  const link = String(p?.link || '').trim()
  return { ligado: p?.ligado !== false && p?.ligado !== 'nao', ...(String(p?.texto || '').trim() ? { texto: String(p.texto).trim().slice(0, 600) } : {}), ...(/^https:\/\/\S+$/.test(link) ? { link: link.slice(0, 300) } : {}) }
}

const TIPOS_LIGADOS = ['midia_cliente', 'fila_cliente', 'modo_humano', 'conversa_devolvida', 'modelo_cliente', 'capi']

export async function apagaContato(negocio_id: string, q: { conversa_id?: string | null; lead_id?: string | null }, por = 'equipe') {
  if (!negocio_id) throw new Error('falta o negócio')
  const neg = await db.um('negocios', { id: negocio_id })
  if (!neg) throw new Error('negócio não existe')
  // tudo filtrado pelo negocio_id: uma conversa ou contato de OUTRO negócio não é achado aqui
  let cv = q.conversa_id ? await db.um('conversas', { id: q.conversa_id, negocio_id }) : null
  let lead = q.lead_id ? await db.um('leads', { id: q.lead_id, negocio_id }) : null
  if (q.conversa_id && !cv) throw new Error('essa conversa não existe nesse negócio')
  if (q.lead_id && !lead) throw new Error('esse contato não existe nesse negócio')
  if (cv && cv.canal !== 'cliente') throw new Error('só dá pra apagar conversa de cliente (a do dono não)')
  if (cv && !lead) lead = cv.lead_id ? await db.um('leads', { id: cv.lead_id, negocio_id }) : cv.telefone ? await db.um('leads', { negocio_id, telefone: cv.telefone }) : null
  if (lead && !cv && lead.telefone) cv = await db.um('conversas', { negocio_id, canal: 'cliente', telefone: lead.telefone })
  if (!cv && !lead) throw new Error('nada pra apagar')
  const telefone = fone(cv?.telefone || lead?.telefone || '')

  // contou nas conversas do mês? continua contando (sem guardar quem era)
  const { inicioDoMes } = await import('./uso')
  const { mes, desde } = inicioDoMes(neg)
  const msgs = cv ? await db.lista('msgs', { conversa_id: cv.id, negocio_id }) : []
  const contou = !!cv && !cv.simulada && !ehSimulado(cv.telefone) && msgs.some(m => m.autor === 'cliente' && m.criado_em >= desde)

  // as mídias que ele mandou (a pasta da conversa) e os registros técnicos ligados a ele
  let midias = 0
  if (cv) midias = await db.apagaPasta(`${negocio_id}/clientes/${cv.id}`).catch(() => 0)
  let registros = 0
  for (const tipo of TIPOS_LIGADOS) {
    for (const e of await db.lista('eventos', { negocio_id, tipo })) {
      if ((cv && e.detalhe?.conversa_id === cv.id) || (lead && e.detalhe?.lead_id === lead.id)) { await db.apaga('eventos', { id: e.id, negocio_id }); registros++ }
    }
  }
  if (cv) await db.apaga('msgs', { conversa_id: cv.id, negocio_id })
  if (lead) { await db.apaga('lead_eventos', { lead_id: lead.id, negocio_id }); await db.apaga('leads', { id: lead.id, negocio_id }) }
  if (cv) await db.apaga('conversas', { id: cv.id, negocio_id })
  // o telefone dele nos recados da Maia pro dono ("Fulano (5551...) precisa de ti") vira [apagado]
  let recados = 0
  const dcv = neg.dono_whatsapp ? await db.um('conversas', { negocio_id, canal: 'dono', telefone: fone(neg.dono_whatsapp) }) : null
  if (dcv && telefone.length >= 8) {
    for (const m of await db.lista('msgs', { conversa_id: dcv.id, negocio_id })) {
      if (String(m.texto || '').includes(telefone)) { await db.atualiza('msgs', { id: m.id }, { texto: String(m.texto).split(telefone).join('[apagado]') }); recados++ }
    }
  }
  const r = { mes, contou, msgs: msgs.length, midias, registros, contato: !!lead, recados }
  await db.evento('contato_apagado', negocio_id, { por, ...r })
  return { ok: true, ...r }
}
