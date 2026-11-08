// Maia: o mínimo de LGPD pro piloto (07/11).
//  (a) aviso curto de privacidade na 1ª resposta a um cliente novo. Por negócio em meta.atendimento.privacidade:
//      { ligado: true (padrão), texto?: o aviso do próprio negócio, link?: a política de privacidade (https) }
//  (b) "apagar dados deste contato" (painel da equipe): apaga a conversa, as mensagens, o contato do funil, o histórico dele,
//      as mídias que ele mandou e os registros técnicos ligados a ele, SÓ do negócio dele. Fica um evento sem dado pessoal.
import { maiaDb as db } from './db'
import { tomDoNegocio } from './tom'
import { ehSimulado, fone } from '@/lib/oito/wa'

// 08/11 (T12): o aviso que o PRÓPRIO negócio já tem, escrito na base ("O que a Maia sabe": um assunto "privacidade", "lgpd",
// "aviso"... ou um texto que fala de LGPD/privacidade dos dados). Com ele, a Maia manda ESSE aviso (uma vez) e não o padrão por cima
const CHAVE_AVISO = /privacidade|lgpd|protecao.?de.?dados|aviso.?(de.?)?dados|politica.?de.?dados/
const TEXTO_AVISO = /\b(lgpd|privacidade|prote[cç][aã]o de dados|lei geral de prote)/i
const semAcento = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
export function avisoDaBase(neg: any): string | null {
  const ctx = neg?.contexto || {}
  for (const [k, v] of Object.entries(ctx)) {
    if (typeof v !== 'string' || v.trim().length < 20) continue
    if (CHAVE_AVISO.test(semAcento(k)) || (TEXTO_AVISO.test(v) && /\bdados\b/i.test(v))) return v.trim().slice(0, 600)
  }
  return null
}
// a resposta da IA já trouxe um aviso de privacidade? (aí o do sistema não vai junto: seria repetido)
export const respostaJaAvisa = (t: string) => TEXTO_AVISO.test(t) || /\bapag\w* (os |seus |teus |suas |tuas )?dados\b/i.test(t)

export function avisoPrivacidade(neg: any): string | null {
  const p = neg?.meta?.atendimento?.privacidade || {}
  if (p.ligado === false) return null
  const voce = tomDoNegocio(neg).pessoa === 'voce'
  const texto = String(p.texto || '').trim() || avisoDaBase(neg) || (voce
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

// 08/11 (T12): troca o nome do contato apagado por [apagado]. O nome completo sempre; o primeiro nome sozinho ("Pra Helena: ...")
// só se nenhum outro contato do negócio tem o mesmo primeiro nome (senão apagaria o recado de outra pessoa)
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export function tiraNome(nome: string, outros: string[] = []) {
  const n = String(nome || '').trim().replace(/\s+/g, ' ')
  const primeiro = n.split(' ')[0] || ''
  const alvos: string[] = []
  if (n.length >= 3) alvos.push(n)
  if (primeiro.length >= 3 && primeiro !== n && !outros.some(o => semAcento(String(o).trim().split(/\s+/)[0] || '') === semAcento(primeiro))) alvos.push(primeiro)
  else if (primeiro.length >= 3 && primeiro === n && outros.some(o => semAcento(String(o).trim().split(/\s+/)[0] || '') === semAcento(primeiro))) alvos.pop()
  const re = alvos.length ? new RegExp(`(?<![\\p{L}\\p{N}])(${alvos.map(esc).join('|')})(?![\\p{L}\\p{N}])`, 'gu') : null
  return { tem: !!re, troca: (t: string) => (re ? String(t || '').replace(re, '[apagado]') : String(t || '')) }
}

const TIPOS_LIGADOS = ['midia_cliente', 'voz_resposta','fila_cliente', 'modo_humano', 'conversa_devolvida', 'modelo_cliente', 'capi']

export async function apagaContato(negocio_id: string, q: { conversa_id?: string | null; lead_id?: string | null }, por = 'equipe', motivo = 'pedido') {
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
  // 08/11 (T12): o NOME dele também vira [apagado], nos recados pro dono e nos avisos pra equipe (aviso_equipe) desse negócio
  const tira = tiraNome(lead?.nome || cv?.nome || '', (await db.lista('leads', { negocio_id })).map(l => String(l.nome || '')))
  if (dcv && (telefone.length >= 8 || tira.tem)) {
    for (const m of await db.lista('msgs', { conversa_id: dcv.id, negocio_id })) {
      let t = String(m.texto || '')
      if (telefone.length >= 8) t = t.split(telefone).join('[apagado]')
      t = tira.troca(t)
      if (t !== String(m.texto || '')) { await db.atualiza('msgs', { id: m.id }, { texto: t }); recados++ }
    }
  }
  let avisos = 0
  for (const e of await db.lista('eventos', { negocio_id, tipo: 'aviso_equipe' })) {
    const d = e.detalhe || {}, tit = String(d.titulo || ''), tx = String(d.texto || '')
    let nt = tira.troca(tit), nx = tira.troca(tx)
    if (telefone.length >= 8) { nt = nt.split(telefone).join('[apagado]'); nx = nx.split(telefone).join('[apagado]') }
    if (nt !== tit || nx !== tx) { await db.atualiza('eventos', { id: e.id }, { detalhe: { ...d, titulo: nt, texto: nx } }); avisos++ }
  }
  const r = { mes, contou, msgs: msgs.length, midias, registros, contato: !!lead, recados, avisos }
  await db.evento('contato_apagado', negocio_id, { por, motivo, ...r })
  return { ok: true, ...r }
}

// ---- 08/11: prazo de guarda (decisão do Guto: 12 meses depois da última mensagem) ----
// A rotina, 1x por dia, apaga as conversas de cliente sem NENHUMA mensagem (dele ou nossa) há mais de N meses: mensagens,
// mídias, contato do funil e histórico (a mesma apagaContato do painel), com motivo "prazo" e só contagens no registro.
// Por negócio em meta.atendimento.guarda_meses (padrão 12). Não manda mensagem pra ninguém, então não tem horário.
export const GUARDA_MESES = 12
export const guardaMesesDo = (neg: any) => { const m = Number(neg?.meta?.atendimento?.guarda_meses); return m >= 1 ? Math.round(m) : GUARDA_MESES }

export async function apagaVencidos(agora = new Date(), forcar = false) {
  const dia = agora.toISOString().slice(0, 10)
  if (!forcar && (await db.lista('eventos', { tipo: 'guarda_rodou' }, { ordem: 'criado_em', desc: true, limite: 1 }))[0]?.detalhe?.dia === dia) return []
  const feitos: any[] = []
  for (const neg of await db.lista('negocios')) {
    const limite = new Date(agora); limite.setMonth(limite.getMonth() - guardaMesesDo(neg))
    for (const cv of await db.lista('conversas', { negocio_id: neg.id, canal: 'cliente' })) {
      const ult = (await db.lista('msgs', { conversa_id: cv.id }, { ordem: 'criado_em', desc: true, limite: 1 }))[0]?.criado_em || cv.ultima_msg_em || cv.criado_em
      if (!ult || ult >= limite.toISOString()) continue
      try { const r = await apagaContato(neg.id, { conversa_id: cv.id }, 'rotina', 'prazo'); feitos.push({ negocio: neg.id, msgs: r.msgs, midias: r.midias }) } catch { /* segue com os outros */ }
    }
  }
  await db.evento('guarda_rodou', null, { dia, apagados: feitos.length })
  return feitos
}
