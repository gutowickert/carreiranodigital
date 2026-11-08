// Maia: por onde ela fala (03/11).
//   canal 'dono'    → o número da Maia (hoje o do Oito): todos os donos falam com ela ali, e ela reconhece cada um pelo telefone
//   canal 'cliente' → o WhatsApp do próprio negócio (05/11: conectado pelo cadastro incorporado; ver wa-negocio.ts). Sem conexão, só simulado.
// 05/11: janela de 24 h do dono. Fora dela, o que é pro dono fica na fila (maia_eventos 'fila_dono'), sai o modelo aprovado
// chamando ele (MAIA_MODELO_DONO) e, quando ele responde, a fila é entregue (soltaFilaDoDono, chamada na entrada do dono).
// Telefones de simulação (começam com 55000) nunca saem pra Meta (mesma regra do Oito).
import { maiaDb as db, maiaLocal } from './db'
import { enviaTexto, enviaImagem, enviaVideo, enviaModelo, fone, ehSimulado } from '@/lib/oito/wa'
import { waDoNegocio, atendimentoLigado, enviaTextoNeg, enviaImagemNeg, enviaVideoNeg, enviaModeloNeg } from './wa-negocio'
export { janelaAbertaCv }

type Envio = { ok: boolean; wamid?: string; erro?: string; na_fila?: boolean }
type Saida = { tipo: 'texto' | 'imagem' | 'video'; texto: string; link?: string; peca_id?: string | null }
const simulado = (): Envio => ({ ok: true, wamid: 'sim-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) })
const janelaAberta = (cv: any) => !!cv?.janela_ate && cv.janela_ate > new Date().toISOString()
const janelaAbertaCv = janelaAberta

function simuladaCv(cv: any) { return ehSimulado(cv.telefone) || !!cv.simulada }

async function registra(cv: any, autor: 'maia' | 'equipe' | 'sistema', texto: string, r: Envio, tipo = 'texto', midia_id: string | null = null) {
  await db.insere('msgs', { conversa_id: cv.id, negocio_id: cv.negocio_id, autor, tipo, texto, midia_id, wamid: r.wamid || null, status: r.na_fila ? 'na_fila' : r.ok ? 'enviado' : 'falhou' })
  await db.atualiza('conversas', { id: cv.id }, { ultima_msg: texto.slice(0, 200), ultima_msg_em: new Date().toISOString() })
  return r
}

// o envio de verdade, pelo número certo
async function sai(cv: any, s: Saida): Promise<Envio> {
  if (simuladaCv(cv)) return simulado()
  if (cv.canal === 'cliente') {
    const neg = await db.um('negocios', { id: cv.negocio_id })
    if (!atendimentoLigado(neg)) return simulado()   // negócio sem WhatsApp conectado, ou atendimento ainda desligado pela equipe
    const w = waDoNegocio(neg)!
    const atual = (await db.um('conversas', { id: cv.id })) || cv
    if (!janelaAberta(atual)) return { ok: false, erro: 'fora da janela de 24 h: só com modelo (mandaModeloCliente)' }
    return s.tipo === 'imagem' ? enviaImagemNeg(w, cv.telefone, s.link!, s.texto) : s.tipo === 'video' ? enviaVideoNeg(w, cv.telefone, s.link!, s.texto) : enviaTextoNeg(w, cv.telefone, s.texto)
  }
  // canal do dono: o número da Maia. Fora da janela de 24 h, só modelo aprovado: guarda na fila e chama o dono.
  const atual = (await db.um('conversas', { id: cv.id })) || cv
  if (!janelaAberta(atual)) { await enfileira(atual, s); return { ok: true, na_fila: true } }
  return s.tipo === 'imagem' ? enviaImagem(cv.telefone, s.link!, s.texto) : s.tipo === 'video' ? enviaVideo(cv.telefone, s.link!, s.texto) : enviaTexto(cv.telefone, s.texto)
}

export async function mandaTexto(cv: any, texto: string, autor: 'maia' | 'equipe' | 'sistema' = 'maia') {
  return registra(cv, autor, texto, await sai(cv, { tipo: 'texto', texto }))
}
export async function mandaImagem(cv: any, link: string, legenda: string, autor: 'maia' | 'equipe' = 'maia', peca_id: string | null = null) {
  return registra(cv, autor, '(imagem) ' + legenda, await sai(cv, { tipo: 'imagem', texto: legenda, link, peca_id }), 'imagem')
}
export async function mandaVideo(cv: any, link: string, legenda: string, autor: 'maia' | 'equipe' = 'maia', peca_id: string | null = null) {
  return registra(cv, autor, '(vídeo) ' + legenda, await sai(cv, { tipo: 'video', texto: legenda, link, peca_id }), 'video')
}

// o cliente do negócio fora da janela de 24 h: só modelo aprovado na conta do negócio (maia_retomada, maia_resposta)
export async function mandaModeloCliente(cv: any, nome: string, params: string[], registro: string) {
  let r: Envio
  if (simuladaCv(cv)) r = simulado()
  else {
    const neg = await db.um('negocios', { id: cv.negocio_id })
    r = atendimentoLigado(neg) ? await enviaModeloNeg(waDoNegocio(neg)!, cv.telefone, nome, params) : simulado()
  }
  return registra(cv, 'maia', registro, r, 'modelo')
}

// ---- 07/11 (piloto): a resposta do dono ou da equipe pro cliente, mesmo depois de 24 h ----
// Dentro da janela de 24 h: texto normal. Fora dela o WhatsApp recusa texto livre: a resposta fica guardada (msgs 'na_fila' +
// maia_eventos 'fila_cliente') e sai o modelo aprovado maia_resposta ("Já tenho a resposta da sua pergunta... Posso te mandar?").
// Quando o cliente responde, a janela abre e a fila é entregue (soltaFilaDoCliente, chamada na entrada do cliente).
// Sem o modelo aprovado: a resposta fica na fila (sai quando o cliente escrever) e a equipe e o dono são avisados. Nunca se perde.

// o status dos modelos do negócio na Meta, guardado por 1 h em maia_eventos 'modelos_status'.
// Conversa simulada (ou negócio sem WhatsApp ligado): vale o último status anotado (o teste anota), senão "aprovado".
async function modeloAprovado(neg: any, cv: any, nome: string) {
  const ult = (await db.lista('eventos', { negocio_id: neg.id, tipo: 'modelos_status' }, { ordem: 'criado_em', desc: true, limite: 1 }))[0]
  if (simuladaCv(cv) || !atendimentoLigado(neg)) return (ult?.detalhe?.[nome] || 'APPROVED') === 'APPROVED'
  if (ult && Date.now() - Date.parse(ult.criado_em) < 3600e3 && ult.detalhe?.[nome] === 'APPROVED') return true
  const w = waDoNegocio(neg)
  if (!w?.waba) return false
  try {
    const { statusModelos } = await import('./modelos')
    const s: any = await statusModelos({ token: w.token, waba: w.waba })
    if (!s.ok) return false
    const st: Record<string, string> = {}
    for (const m of s.modelos || []) st[m.name] = m.status
    await db.evento('modelos_status', neg.id, st)
    return st[nome] === 'APPROVED'
  } catch { return false }
}

export async function mandaRespostaCliente(cv: any, texto: string, autor: 'maia' | 'equipe' = 'maia', assunto?: string | null) {
  const atual = (await db.um('conversas', { id: cv.id })) || cv
  if (janelaAberta(atual)) return { ...(await mandaTexto(atual, texto, autor)), como: 'texto' as const }
  const neg = await db.um('negocios', { id: atual.negocio_id })
  const msg = await db.insere('msgs', { conversa_id: atual.id, negocio_id: atual.negocio_id, autor, tipo: 'texto', texto, status: 'na_fila' })
  await db.evento('fila_cliente', atual.negocio_id, { conversa_id: atual.id, msg_id: msg.id, enviado: false })
  const lead = atual.lead_id ? await db.um('leads', { id: atual.lead_id }) : null
  const nome = String(lead?.nome || atual.nome || '').split(' ')[0]
  if (await modeloAprovado(neg, atual, 'maia_resposta')) {
    // um modelo só por conversa enquanto o cliente não responde (o resto espera junto na fila)
    const ja = (await db.lista('eventos', { negocio_id: atual.negocio_id, tipo: 'modelo_cliente' }, { ordem: 'criado_em', desc: true, limite: 20 }))
      .find(e => e.detalhe?.conversa_id === atual.id && e.detalhe?.ok && Date.now() - Date.parse(e.criado_em) < 24 * 3600e3)
    if (ja) return { ok: true, na_fila: true, como: 'fila' as const, modelo: 'maia_resposta' }
    if (!assunto && lead) {
      const perg = (await db.lista('lead_eventos', { lead_id: lead.id, tipo: 'pergunta_cliente' }, { ordem: 'criado_em', desc: true, limite: 1 }))[0]
      assunto = perg?.detalhe?.pergunta || lead.produto || null
    }
    const r = await mandaModeloCliente(atual, 'maia_resposta', [nome || 'tudo bem', neg?.nome || '', String(assunto || 'o que você perguntou').slice(0, 120)], '(modelo maia_resposta) avisando que a resposta está pronta')
    await db.evento('modelo_cliente', atual.negocio_id, { conversa_id: atual.id, modelo: 'maia_resposta', ok: r.ok, erro: r.erro || null })
    if (!r.ok) await avisaEquipe('o modelo maia_resposta não saiu', `${neg?.nome}: ${r.erro || '?'} (a resposta pro cliente ficou guardada e sai quando ele escrever)`, atual.negocio_id)
    return { ok: true, na_fila: true, como: 'modelo' as const, modelo: 'maia_resposta', modelo_ok: r.ok }
  }
  await avisaEquipe('maia_resposta não aprovado', `${neg?.nome}: uma resposta pro cliente ${nome || atual.telefone} ficou guardada (passou 24 h da última mensagem dele e o modelo maia_resposta não está aprovado). Sai quando ele escrever de novo.`, atual.negocio_id)
  if (neg?.dono_whatsapp) await mandaTexto(await conversaDoDono(neg), `Ó, a resposta pro ${nome || 'cliente'} ficou guardada: já passou 24 h da última mensagem dele e o WhatsApp só deixa mandar com o modelo aprovado, que ainda não saiu. Ela vai assim que ele escrever de novo, e a equipe já está vendo.`).catch(() => null)
  return { ok: true, na_fila: true, como: 'fila' as const, modelo: null }
}

// o cliente escreveu (a janela abriu): entrega as respostas guardadas, na ordem
export async function soltaFilaDoCliente(cv: any) {
  const fila = (await db.lista('eventos', { negocio_id: cv.negocio_id, tipo: 'fila_cliente' }, { ordem: 'criado_em' })).filter(e => !e.detalhe?.enviado && e.detalhe?.conversa_id === cv.id)
  let entregues = 0
  for (const e of fila) {
    const m = await db.um('msgs', { id: e.detalhe.msg_id })
    if (!m) { await db.atualiza('eventos', { id: e.id }, { detalhe: { ...e.detalhe, enviado: true, sumiu: true } }); continue }
    const r = await sai(cv, { tipo: 'texto', texto: m.texto })
    await db.atualiza('msgs', { id: m.id }, { status: r.ok ? 'enviado' : 'falhou', wamid: r.wamid || null, criado_em: new Date().toISOString() })
    await db.atualiza('eventos', { id: e.id }, { detalhe: { ...e.detalhe, enviado: true, ok: r.ok } })
    if (r.ok) entregues++
    else await avisaEquipe('resposta guardada não saiu', `${String(m.texto).slice(0, 120)} (${r.erro || '?'})`, cv.negocio_id)
  }
  return entregues
}

// ---- a fila do dono (fora da janela de 24 h) ----
const resumoFila = (itens: Saida[]) => {
  const pecas = itens.filter(i => i.tipo !== 'texto').length
  const textos = itens.length - pecas
  return [pecas ? `${pecas} ${pecas === 1 ? 'anúncio novo' : 'anúncios novos'} pra tu aprovar` : '', textos ? `${textos} ${textos === 1 ? 'recado' : 'recados'}` : ''].filter(Boolean).join(' e ')
}
async function enfileira(cv: any, s: Saida) {
  await db.evento('fila_dono', cv.negocio_id, { conversa_id: cv.id, ...s, enviado: false })
  // chama o dono com o modelo aprovado, no máximo uma vez a cada 6 h por conversa
  const ult = (await db.lista('eventos', { negocio_id: cv.negocio_id, tipo: 'modelo_dono' }, { ordem: 'criado_em', desc: true, limite: 1 }))[0]
  if (ult && Date.now() - Date.parse(ult.criado_em) < 6 * 3600e3) return
  const neg = await db.um('negocios', { id: cv.negocio_id })
  const fila = (await db.lista('eventos', { negocio_id: cv.negocio_id, tipo: 'fila_dono' })).filter(e => !e.detalhe?.enviado).map(e => e.detalhe as Saida)
  const nome = String(neg?.dono_nome || cv.nome || '').split(' ')[0] || 'tudo bem'
  const modelo = process.env.MAIA_MODELO_DONO || 'maia_novidades'
  const r = await enviaModelo(cv.telefone, modelo, 'pt_BR', [nome, neg?.nome || 'teu negócio', resumoFila(fila) || 'novidades'])
  await db.evento('modelo_dono', cv.negocio_id, { conversa_id: cv.id, ok: r.ok, erro: (r as any).erro || null })
  if (!r.ok) await avisaEquipe('o modelo pro dono não saiu', `${neg?.nome}: ${(r as any).erro || '?'} (as mensagens ficaram na fila até ele escrever)`, cv.negocio_id)
}

// o dono escreveu (a janela abriu): entrega o que estava na fila, na ordem em que entrou
export async function soltaFilaDoDono(cv: any) {
  const fila = (await db.lista('eventos', { negocio_id: cv.negocio_id, tipo: 'fila_dono' }, { ordem: 'criado_em' })).filter(e => !e.detalhe?.enviado && e.detalhe?.conversa_id === cv.id)
  for (const e of fila) {
    const s = e.detalhe as Saida
    const r = s.tipo === 'imagem' ? await enviaImagem(cv.telefone, s.link!, s.texto) : s.tipo === 'video' ? await enviaVideo(cv.telefone, s.link!, s.texto) : await enviaTexto(cv.telefone, s.texto)
    const tentativas = ((e.detalhe as any)?.tentativas || 0) + 1
    // falhou: volta pra fila (até 3 tentativas; depois a equipe é avisada)
    await db.atualiza('eventos', { id: e.id }, { detalhe: { ...s, conversa_id: cv.id, enviado: r.ok || tentativas >= 3, ok: r.ok, tentativas, wamid: r.wamid || null } })
    if (!r.ok && tentativas >= 3) await avisaEquipe('mensagem pro dono não saiu', `${s.texto.slice(0, 120)} (${(r as any).erro || '?'})`, cv.negocio_id)
    if (s.peca_id && r.wamid) await db.atualiza('pecas', { id: s.peca_id }, { wamid_envio: r.wamid })
  }
  return fila.length
}

// acha ou cria a conversa (por negócio, canal e telefone)
export async function conversa(negocio_id: string, canal: 'dono' | 'cliente', telefone: string, extra: { nome?: string | null; lead_id?: string | null } = {}) {
  const tel = fone(telefone)
  let cv = await db.um('conversas', { negocio_id, canal, telefone: tel })
  if (cv) return cv
  try {
    cv = await db.insere('conversas', { negocio_id, canal, telefone: tel, nome: extra.nome || null, lead_id: extra.lead_id || null, simulada: ehSimulado(tel) })
  } catch (e: any) { if (/duplicate|23505/.test(e.message)) cv = await db.um('conversas', { negocio_id, canal, telefone: tel }); else throw e }
  return cv!
}

// a conversa da Maia com o dono de um negócio
export async function conversaDoDono(neg: any) { return conversa(neg.id, 'dono', neg.dono_whatsapp, { nome: neg.dono_nome }) }

// o negócio de quem escreveu pro número da Maia (o dono ou alguém da equipe dele), ou null
export async function negocioDoTelefone(telefone: string) {
  const tel = fone(telefone)
  const alt = /^55\d{10}$/.test(tel) ? tel.slice(0, 4) + '9' + tel.slice(4) : /^55\d{2}9\d{8}$/.test(tel) ? tel.slice(0, 4) + tel.slice(5) : ''
  for (const t of [tel, alt].filter(Boolean)) {
    const n = await db.um('negocios', { dono_whatsapp: t })
    if (n && n.status !== 'cancelado') return n
  }
  const todos = await db.lista('negocios')
  return todos.find(n => n.status !== 'cancelado' && (n.equipe_whatsapp || []).some((x: string) => x === tel || x === alt)) || null
}

// avisa a equipe da escola (o Guto, no celular). No modo local só anota.
export async function avisaEquipe(titulo: string, texto: string, negocio_id: string | null = null, urgente = false) {
  await db.evento('aviso_equipe', negocio_id, { titulo, texto })
  if (maiaLocal() || process.env.MAIA_SEM_AVISO === '1') { console.log(`[aviso equipe] ${titulo}: ${texto}`); return }
  const { avisaDono } = await import('@/lib/oito/servico')
  avisaDono('Maia · ' + titulo, texto.slice(0, 200), urgente)
}
