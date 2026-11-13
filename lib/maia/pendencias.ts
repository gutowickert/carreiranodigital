// Maia: o que está ESPERANDO O DONO, e a cobrança por urgência (13/11, Guto). Tudo em tabelas que já existem (maia_eventos,
// maia_lead_eventos, maia_conversas, maia_pecas, maia_avisos): nenhuma mudança no banco.
//
// 1) pendenciasDoDono(neg): a lista do que o dono ainda não respondeu, cada item com a urgência:
//    - 'alta': cliente que a Maia passou pro dono (quer fechar, pediu pessoa, reclamou) e o dono ainda não falou na conversa;
//              pergunta de cliente que o dono ainda não respondeu
//    - 'simples': anúncio esperando o 👍, "fechou?" das 18h sem resposta, sugestão da análise (maia_avisos 'enviado')
//    A análise de 2 dias (lib/maia/relatorios*, outro ramo) usa essa lista pra cobrar de novo as simples, com a atualização.
// 2) cobraDono (rotina de hora em hora): só as 'alta'. Aviso na hora (quem passa a conversa já avisa), de novo depois de 1 h, e
//    depois só no dia seguinte. Uma mensagem só por negócio, com TUDO que está esperando (comPendencias). Fora da janela de 24 h
//    do número da Maia, o canal guarda na fila e chama o dono com o modelo maia_novidades (canal.ts).
// 3) comPendencias: todo aviso novo pro dono leva junto o que ele ainda não respondeu, numa mensagem só.
// 4) pedido de VERBA: o dono pede (WhatsApp ou painel), a EQUIPE aprova no painel da equipe e o dono recebe a confirmação.
//    O teto (R$ 60/dia, limites.ts) continua: pedido acima nem vira pedido.
// 5) PROBLEMA TÉCNICO (anúncio reprovado, cartão recusado, WhatsApp caiu): avisa só a equipe; o recado pro dono fica pendente
//    (maia_eventos 'aviso_dono_pendente') até a equipe aprovar no painel.
import { maiaDb as db } from './db'
import { conversaDoDono, mandaTexto, avisaEquipe } from './canal'
import { podeFalar } from './horario'
import { verbaAcimaDoTeto } from './limites'

const H = 3600e3
const ABERTAS = ['novo', 'conversando', 'interessado', 'proposta']
const diaBR = (t: number) => new Date(t - 3 * H).toISOString().slice(0, 10)
const primeiro = (s: any) => String(s || '').trim().split(' ')[0]
const talvez = async (tab: string, f: any, o: any = {}) => { try { return await db.lista(tab, f, o) } catch { return [] } }

export type Pendencia = { chave: string; tipo: 'fechar' | 'conversa' | 'pergunta' | 'joinha' | 'fechou' | 'sugestao'; urgencia: 'alta' | 'simples'; desde: string; texto: string; lead_id?: string | null; conversa_id?: string | null }

export async function pendenciasDoDono(neg: any): Promise<Pendencia[]> {
  const id = neg.id
  const [convs, evs, eventos, pecas, avisos, leads] = await Promise.all([
    db.lista('conversas', { negocio_id: id, canal: 'cliente', modo: 'humano' }),
    db.lista('lead_eventos', { negocio_id: id }, { ordem: 'criado_em' }),
    db.lista('eventos', { negocio_id: id, tipo: 'modo_humano' }, { ordem: 'criado_em' }),
    db.lista('pecas', { negocio_id: id, status: 'com_dono' }),
    talvez('avisos', { negocio_id: id, status: 'enviado' }),
    db.lista('leads', { negocio_id: id }),
  ])
  const leadDe = new Map(leads.map(l => [l.id, l]))
  const out: Pendencia[] = []
  // conversas que a Maia passou e o dono (ou a equipe) ainda não falou depois da passagem
  for (const c of convs) {
    const ev = eventos.filter(e => e.detalhe?.conversa_id === c.id).slice(-1)[0]
    const desde = ev?.criado_em || c.ultima_msg_em || c.criado_em
    const falou = (await db.lista('msgs', { conversa_id: c.id }, { ordem: 'criado_em', desc: true, limite: 30 })).some(m => (m.autor === 'dono' || m.autor === 'equipe') && m.criado_em > desde)
    if (falou) continue
    const l = c.lead_id ? leadDe.get(c.lead_id) : null
    if (l && !ABERTAS.includes(l.etapa)) continue
    const nome = c.nome || l?.nome || c.telefone
    const fechar = ev?.detalhe?.tipo === 'fechar'
    out.push({ chave: `conversa:${c.id}:${ev?.id || ''}`, tipo: fechar ? 'fechar' : 'conversa', urgencia: 'alta', desde, lead_id: l?.id || null, conversa_id: c.id,
      texto: fechar ? `${nome} quer fechar (a conversa está contigo)` : `${nome} precisa de ti${ev?.detalhe?.motivo ? ': ' + String(ev.detalhe.motivo).slice(0, 90) : ''}` })
  }
  // perguntas de cliente sem resposta do dono (de quem ainda está em aberto)
  for (const e of evs.filter(e => e.tipo === 'pergunta_cliente')) {
    if (evs.some(x => x.tipo === 'pergunta_respondida' && x.lead_id === e.lead_id && x.criado_em > e.criado_em)) continue
    const l = leadDe.get(e.lead_id)
    if (!l || !ABERTAS.includes(l.etapa) || out.some(p => p.lead_id === l.id && p.tipo === 'pergunta')) continue
    out.push({ chave: `pergunta:${e.id}`, tipo: 'pergunta', urgencia: 'alta', desde: e.criado_em, lead_id: l.id, texto: `${l.nome || l.telefone || 'um cliente'} perguntou: ${String(e.detalhe?.pergunta || '?').slice(0, 120)}` })
  }
  // simples: o 👍 nos anúncios, o "fechou?" das 18h, as sugestões da análise
  if (pecas.length) {
    const desde = pecas.map(p => p.enviado_dono_em || p.atualizado_em || p.criado_em).filter(Boolean).sort()[0]
    out.push({ chave: `joinha:${pecas.map(p => p.id).sort().join(',')}`, tipo: 'joinha', urgencia: 'simples', desde, texto: pecas.length === 1 ? '1 anúncio esperando o teu 👍' : `${pecas.length} anúncios esperando o teu 👍` })
  }
  for (const e of evs.filter(e => e.tipo === 'pergunta_dono' && Date.now() - Date.parse(e.criado_em) < 7 * 86400e3)) {
    const l = leadDe.get(e.lead_id)
    if (l && l.etapa === 'proposta' && !out.some(p => p.tipo === 'fechou' && p.lead_id === l.id)) out.push({ chave: `fechou:${l.id}`, tipo: 'fechou', urgencia: 'simples', desde: e.criado_em, lead_id: l.id, texto: `${l.nome || l.telefone} fechou? (é só me dizer sim ou não)` })
  }
  for (const a of avisos) out.push({ chave: `sugestao:${a.id}`, tipo: 'sugestao', urgencia: 'simples', desde: a.enviado_em || a.criado_em, texto: String(a.titulo || a.acao || 'sugestão da análise').slice(0, 120) })
  return out.sort((a, b) => (a.urgencia === b.urgencia ? (a.desde < b.desde ? -1 : 1) : a.urgencia === 'alta' ? -1 : 1))
}

// as linhas do que está esperando (o que é urgente com nome; o simples resumido numa linha)
export function textoPendencias(lista: Pendencia[]): string {
  const altas = lista.filter(p => p.urgencia === 'alta'), simples = lista.filter(p => p.urgencia === 'simples')
  const linhas = altas.map(p => `• ${p.texto}`)
  if (simples.length) linhas.push(`• e ${simples.map(p => p.texto).join('; ')}`)
  return linhas.join('\n')
}

// 13/11 (consolidar): um aviso novo pro dono leva junto tudo que ainda espera por ele (menos o próprio assunto do aviso)
export async function comPendencias(neg: any, texto: string, exceto: { lead_id?: string | null; conversa_id?: string | null } = {}) {
  const resto = (await pendenciasDoDono(neg).catch(() => [] as Pendencia[]))
    .filter(p => !(exceto.lead_id && p.lead_id === exceto.lead_id) && !(exceto.conversa_id && p.conversa_id === exceto.conversa_id))
  if (!resto.length) return texto
  return `${texto}\n\nAinda esperando por ti:\n${textoPendencias(resto)}`
}

// ---- a cobrança (rotina de hora em hora) ----
// cada pendência 'alta': cobrança 1 depois de 1 h (o aviso na hora já saiu quando a Maia passou/perguntou) e a 2 no dia seguinte.
// Depois disso, quem cobra é a equipe (humano.ts avisa a equipe em 3 h). Só de dia (horario.ts). Uma mensagem por negócio.
export async function cobraDono(relogio = new Date()) {
  const feitos: any[] = []
  // `relogio` só decide a janela de horário (o teste local passa outro); as idades contam do relógio de verdade
  const agora = Date.now()
  const negs = (await db.lista('negocios')).filter(n => n.dono_whatsapp && !['cancelado', 'pausado'].includes(n.status))
  for (const neg of negs) {
    const pend = await pendenciasDoDono(neg)
    const altas = pend.filter(p => p.urgencia === 'alta')
    if (!altas.length || !podeFalar(neg, relogio)) continue
    const cobs = await db.lista('eventos', { negocio_id: neg.id, tipo: 'cobranca_dono' }, { ordem: 'criado_em' })
    const vezes = (chave: string) => cobs.filter(e => (e.detalhe?.chaves || []).includes(chave))
    const vence = altas.filter(p => {
      const v = vezes(p.chave)
      if (!v.length) return agora - Date.parse(p.desde) >= 1 * H
      if (v.length === 1) return diaBR(agora) > diaBR(Date.parse(v[0].criado_em))
      return false
    })
    if (!vence.length) continue
    const nome = primeiro(neg.dono_nome)
    const texto = `${nome ? nome + ', ' : ''}ainda esperam por ti:\n${textoPendencias(pend)}\n\nCliente quer comprar? Responde ele por aí. Pergunta de cliente: me responde aqui que eu passo pra ele.`
    await mandaTexto(await conversaDoDono(neg), texto)
    await db.evento('cobranca_dono', neg.id, { chaves: vence.map(p => p.chave), niveis: vence.map(p => vezes(p.chave).length + 1) })
    for (const p of vence) feitos.push({ negocio: neg.id, chave: p.chave, tipo: p.tipo, nivel: vezes(p.chave).length + 1, ...(p.tipo === 'pergunta' ? { pergunta: p.chave.split(':')[1], lembrou: 'dono' } : {}) })
  }
  return feitos
}

// ---- 13/11: o pedido de verba (o dono pede, a equipe aprova) ----
export async function pedidosDeVerba(negocio_id?: string | null, status: string | null = 'pendente') {
  const evs = await db.lista('eventos', negocio_id ? { tipo: 'pedido_verba', negocio_id } : { tipo: 'pedido_verba' }, { ordem: 'criado_em', desc: true, limite: 200 })
  return evs.filter(e => !status || e.detalhe?.status === status)
}
export async function pedeVerba(neg: any, valor: number, por: 'dono' | 'dono_painel') {
  const v = Math.round(Number(valor) * 100) / 100
  if (!(v > 0) || v > 100000) return { ok: false as const, erro: 'valor inválido' }
  const acima = verbaAcimaDoTeto(neg, v)
  if (acima) {
    await avisaEquipe('pedido de verba acima do teto', `${neg.nome}: o dono pediu R$ ${v}/dia e ${acima}. Não virou pedido.`, neg.id)
    return { ok: false as const, acima_do_teto: true, erro: 'esse valor passa do limite combinado: a equipe confirma contigo antes' }
  }
  // um pedido pendente por negócio: o novo substitui o anterior
  for (const p of await pedidosDeVerba(neg.id)) await db.atualiza('eventos', { id: p.id }, { detalhe: { ...p.detalhe, status: 'substituido' } })
  const ev = await db.insere('eventos', { tipo: 'pedido_verba', negocio_id: neg.id, detalhe: { valor: v, atual: neg.verba_dia ?? null, por, status: 'pendente' } })
  await avisaEquipe('pedido de verba', `${neg.nome}: o dono pediu verba de R$ ${v}/dia (hoje ${neg.verba_dia != null ? 'R$ ' + neg.verba_dia : 'sem verba'}). Aprovar no painel da equipe (Hoje).`, neg.id)
  return { ok: true as const, pedido: ev.id, valor: v }
}
export async function decideVerba(pedido_id: string, aprova: boolean, por: string, motivo?: string | null) {
  const ev = await db.um('eventos', { id: pedido_id })
  if (!ev || ev.tipo !== 'pedido_verba') throw new Error('pedido não existe')
  if (ev.detalhe?.status !== 'pendente') throw new Error('esse pedido já foi decidido (' + ev.detalhe?.status + ')')
  const neg = await db.um('negocios', { id: ev.negocio_id })
  if (!neg) throw new Error('negócio não existe')
  const v = Number(ev.detalhe.valor)
  if (aprova) {
    const acima = verbaAcimaDoTeto(neg, v)
    if (acima) throw new Error(acima)
    await db.atualiza('negocios', { id: neg.id }, { verba_dia: v })
  }
  await db.atualiza('eventos', { id: ev.id }, { detalhe: { ...ev.detalhe, status: aprova ? 'aprovado' : 'recusado', por, motivo: motivo || null, decidido_em: new Date().toISOString() } })
  if (neg.dono_whatsapp) {
    const t = aprova ? `Tua verba mudou: agora são R$ ${v} por dia. A equipe aprovou e eu já sigo com esse valor.` : `Sobre a verba de R$ ${v} por dia: a equipe preferiu não mudar agora${motivo ? ` (${motivo})` : ''}. Fica como está${neg.verba_dia != null ? `, R$ ${neg.verba_dia} por dia` : ''}; qualquer coisa a gente conversa.`
    await mandaTexto(await conversaDoDono(neg), await comPendencias(neg, t)).catch(() => null)
  }
  return { ok: true, status: aprova ? 'aprovado' : 'recusado', verba_dia: aprova ? v : neg.verba_dia ?? null }
}

// ---- 13/11: problema técnico (avisa só a equipe; o recado pro dono espera a equipe aprovar) ----
export async function problemaTecnico(neg: any, d: { tipo: string; equipe: string; dono: string }) {
  if (!neg?.id) return null
  const ja = (await avisosDonoPendentes(neg.id)).find(e => e.detalhe?.tipo === d.tipo)
  await avisaEquipe('problema técnico: ' + d.tipo, `${neg.nome}: ${d.equipe}${ja ? '' : ' (o recado pro dono espera a tua aprovação no painel da equipe, Hoje)'}`, neg.id, true)
  if (ja) return ja
  return db.insere('eventos', { tipo: 'aviso_dono_pendente', negocio_id: neg.id, detalhe: { tipo: d.tipo, texto: d.dono, equipe: d.equipe, status: 'pendente' } })
}
export async function avisosDonoPendentes(negocio_id?: string | null) {
  const evs = await db.lista('eventos', negocio_id ? { tipo: 'aviso_dono_pendente', negocio_id } : { tipo: 'aviso_dono_pendente' }, { ordem: 'criado_em', desc: true, limite: 200 })
  return evs.filter(e => e.detalhe?.status === 'pendente')
}
export async function decideAvisoDono(id: string, aprova: boolean, por: string, texto?: string | null) {
  const ev = await db.um('eventos', { id })
  if (!ev || ev.tipo !== 'aviso_dono_pendente') throw new Error('aviso não existe')
  if (ev.detalhe?.status !== 'pendente') throw new Error('esse aviso já foi decidido (' + ev.detalhe?.status + ')')
  const final = String(texto || ev.detalhe.texto || '').trim()
  if (aprova && !final) throw new Error('falta o texto pro dono')
  if (aprova) {
    const neg = await db.um('negocios', { id: ev.negocio_id })
    if (neg?.dono_whatsapp) await mandaTexto(await conversaDoDono(neg), await comPendencias(neg, final))
  }
  await db.atualiza('eventos', { id: ev.id }, { detalhe: { ...ev.detalhe, texto: final, status: aprova ? 'enviado' : 'descartado', por, decidido_em: new Date().toISOString() } })
  return { ok: true, status: aprova ? 'enviado' : 'descartado' }
}

// o que a equipe tem pra aprovar (painel da equipe, Hoje)
export async function pendentesDaEquipe() {
  const negs = new Map((await db.lista('negocios')).map(n => [n.id, n]))
  const nome = (id: string) => negs.get(id)?.nome || '?'
  return {
    verba: (await pedidosDeVerba()).map(e => ({ id: e.id, negocio_id: e.negocio_id, negocio: nome(e.negocio_id), valor: e.detalhe.valor, atual: e.detalhe.atual ?? null, por: e.detalhe.por, em: e.criado_em })),
    avisos_dono: (await avisosDonoPendentes()).map(e => ({ id: e.id, negocio_id: e.negocio_id, negocio: nome(e.negocio_id), tipo: e.detalhe.tipo, texto: e.detalhe.texto, equipe: e.detalhe.equipe, em: e.criado_em })),
  }
}
