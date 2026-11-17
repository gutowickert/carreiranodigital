// Maia, lançamento: a conversa no número da escola com quem está na lista do lançamento (15/11/2026).
//   1. o webhook da escola chama entrada() na hora (rápido: só acha a pessoa e guarda a mensagem) e processa() no after()
//   2. processa() espera uns segundos (a pessoa manda várias fotos ou mensagens seguidas) e responde UMA vez por tudo que chegou
//   3. a coleta: uma pergunta por vez (o que vende e pra quem, cidade, produtos com preço, como vende, o que mais vende,
//      a maior dificuldade, Instagram, 3 a 5 fotos e vídeos curtos, a hora da entrega)
//   4. o modo teste: a Maia responde como atendente do negócio da pessoa (sai com "sair" ou depois de 30 min parado)
//   5. depois da entrega: quem quer fechar, tem dúvida ou testou vai pra fila do Rick (áudio de fechamento)
// A Maia sempre diz que é IA, fala "tu", sem emoji, e mostra o valor antes do preço.
import { maiaLocal, maiaDb } from '../db'
import {
  contatoDoTelefone, contato as acha, salva, salvaJson, registra, msgs, midias, mandaTexto as mandaTextoBase, mandaMidia, guardaMidia, avisaGuto, avanca,
  primeiroNome, diaDaEntrega, diaFalado, instanteBR, quandoFalado, evento, variantes, entregaV2, timeFalando,
} from './base'
import { interpreta, lePosEntrega, ehQueroVer, ehAgoraNao, ehSair, ehDescadastro, ehPedeHumano, ehAutoResposta, ehGatilhoTeste, ehTestarAgora, lerHora, type Passo } from './interpreta'

export const TESTE_MIN = () => Math.max(5, +(process.env.MAIA_LANC_TESTE_MIN || 120))   // 17/11: era 30 min (a Maria saiu do teste no meio)
const ESPERA_MS = () => (maiaLocal() ? 0 : Math.max(0, +(process.env.MAIA_LANC_ESPERA_MS || 7000)))

export const PERGUNTAS: Record<Exclude<Passo, 'fotos' | 'hora'>, string> = {
  negocio: 'Pra começar: o que tu vende, e pra quem?',
  cidade: 'Em que cidade tu atende?',
  produtos: 'Me diz 2 ou 3 produtos ou serviços teus, com o preço de cada um.',
  // 17/11: só quando os produtos vieram sem preço. É o que a atendente do teste responde quando o cliente pergunta o valor
  faixa_preco: 'E a faixa de preço, mais ou menos? Do mais barato ao mais caro. É pra eu saber responder quando um cliente teu perguntar o valor.',
  como_vende: 'E como o cliente compra de ti? Entrega, retirada, horário marcado... E qual é o teu horário de atendimento?',
  carro_chefe: 'Do que tu vende, o que sai mais ou dá mais lucro?',
  dificuldade: 'Hoje, qual é a maior dificuldade pra vender mais?',
  instagram: 'Qual é o @ do teu Instagram? Se não tiver, é só dizer.',
}
export const PEDE_FOTOS = 'Agora o mais importante: me manda de 3 a 5 fotos do teu produto ou serviço e, se tiver, uns vídeos curtos do dia a dia. Pode ser do celular mesmo. Se tiver a logo da empresa, manda também. Eu só uso o que tu mandar.'
export const PEDE_VIDEO = 'Fotos recebidas! Tem uns vídeos curtos do dia a dia (até 1 minuto)? Se tiver, manda aqui. Se não tiver, é só dizer "sem vídeo".'
export const SEM_FOTO = 'Sem fotos eu não consigo, porque não invento imagem do teu negócio. Quando tiver, me manda aqui que eu faço.'
// Sem se apresentar de novo: a Maia já se apresentou no disparo (Guto, 15/11)
export const INTRO = 'Oba! Vou te fazer umas perguntas rápidas, uma de cada vez, e no fim te peço umas fotos e uns vídeos curtos. Leva uns 3 minutos.'
export const AGORA_NAO = 'Tranquilo! Não te chamo mais sobre isso.'
export const SEM_NEGOCIO = 'Entendi! A amostra é feita pro negócio de quem tem um. Mas se tu conhece alguém que tem negócio e ia gostar, me passa o nome e o WhatsApp da pessoa: se ela fechar, tu ganha comissão pela indicação.'
export const PRECO = 'Te mostro tudo junto com a amostra: o que eu faço, o que está incluso e o valor. Primeiro deixa eu fazer a tua!'
export const DUVIDA = 'Boa pergunta! Essa eu passo pro time da escola, que te responde aqui mesmo.'
export const HUMANO = 'Claro! Já chamei o time da escola: uma pessoa te responde aqui mesmo, em instantes.'

// 16/11 (Nando, depois da conversa da Cristina: a mesma pergunta 8 vezes): a Maia NUNCA manda de novo o mesmo texto que acabou
// de mandar. Se ia repetir (em 30 min), a conversa travou: passa pro time em silêncio (a pessoa já ouviu a pergunta)
async function mandaTexto(c: any, texto: string, autor?: 'maia' | 'equipe' | 'sistema') {
  const ultima = (await msgs(c.id)).filter((m: any) => m.direcao === 'saida').slice(-1)[0]
  if (ultima && ultima.texto === texto && Date.now() - Date.parse(ultima.criado_em || 0) < 30 * 60e3) {
    // 16/11 (Clarice: "Ok" duas vezes depois do material): repetir um aviso de espera não é conversa travada. Fica quieta
    if (/^(Anotado! A tua amostra chega|Recebi! Vai junto)/.test(texto)) return { ok: true, repetida: true, quieta: true } as any
    // 16/11 (Guto: "o time tem que ter algum lugar pra entender qual a dúvida"): o motivo diz o que travou e o que a pessoa mandou
    const recebida = (await msgs(c.id)).filter((m: any) => m.direcao === 'entrada').slice(-1)[0]
    const disse = !recebida ? '' : recebida.tipo && recebida.tipo !== 'texto' ? `mandou ${recebida.tipo}` : `respondeu "${String(recebida.texto || '').replace(/\s+/g, ' ').slice(0, 160)}${String(recebida.texto || '').length > 160 ? '...' : ''}"`
    await passaProTime(c, `a conversa travou: a Maia pediu "${texto.replace(/\s+/g, ' ').slice(0, 70)}..." e a pessoa ${disse || 'não respondeu o que ela pediu'}. Lê a conversa no cartão e responde pela caixa do CRM`, false)
    return { ok: true, repetida: true } as any
  }
  return mandaTextoBase(c, texto, autor)
}

// 16/11: a pessoa vai pro time. A Maia para de responder ela (e as retomadas param) até a equipe marcar a dúvida como
// resolvida na tela do lançamento. O time responde pela caixa do CRM da escola, onde a conversa inteira aparece
export async function passaProTime(c: any, motivo: string, avisaPessoa: boolean) {
  if (c.estado?.humano) return { ok: true, silencio: 'com o time' }
  await salvaJson(c, 'estado', { humano: { em: new Date().toISOString(), motivo } })
  await registraDuvida(c, motivo)
  await evento('lanc_humano', { contato: c.id, motivo })
  // só primeiro nome + negócio (regra do Guto: nunca telefone nem as respostas)
  await avisaGuto('Lançamento: falar com uma pessoa', `${rotulo(c)}: ${motivo}. A Maia parou de responder essa pessoa: responde pela caixa do CRM e marca a dúvida como resolvida na tela do lançamento.`, true).catch(() => null)
  if (avisaPessoa) await mandaTextoBase(c, HUMANO)
  return { ok: true, humano: true }
}
const OKS = ['Anotado!', 'Boa!', 'Show!', 'Perfeito!']
export const perguntaHora = (agora = new Date()) => `Pronto! Eu te entrego a amostra ${diaFalado(diaDaEntrega(agora), agora)}. Fica melhor de manhã, às 10h, ou de tarde, às 15h?`

const nomeNeg = (c: any) => c.coleta?.nome_negocio || (c.coleta?.negocio ? String(c.coleta.negocio).split(/[,.;]/)[0].slice(0, 60) : '') || 'teu negócio'
export const rotulo = (c: any) => `${primeiroNome(c.nome) || 'Contato ' + String(c.telefone).slice(-4)} (${c.coleta?.nome_negocio || (c.coleta?.negocio ? String(c.coleta.negocio).slice(0, 50) : 'negócio ainda não dito')})`

// ---------- 1. a entrada (síncrona, no webhook) ----------
export type Entrada = { telefone: string; nome?: string | null; tipo: string; texto?: string | null; midia_id?: string | null; mime?: string | null; wamid?: string | null; b64?: string | null }
// devolve tratado=true quando a mensagem é da Maia (aí a IA normal do CRM não responde)
export async function entrada(m: Entrada): Promise<{ tratado: boolean; contato_id?: string; msg_id?: string }> {
  const c = await contatoDoTelefone(m.telefone)
  if (!c) return { tratado: false }
  const t = String(m.texto || '')
  const volta = ehQueroVer(t) || ehGatilhoTeste(t)
  // quem recusou, perdeu ou já está com o time: a Maia só volta se a pessoa pedir pra ver (ou mandar o texto do teste)
  if (['agora_nao', 'perdido'].includes(c.etapa) && !c.estado?.indicacao && !volta) return { tratado: false }
  if (['implantacao_marcada', 'pago'].includes(c.etapa) && !ehGatilhoTeste(t)) return { tratado: false }
  // 16/11: "SAIR" (e as outras palavras de descadastro) fora do modo teste = pediu pra sair. O webhook da escola já registra
  // o descadastro; a Maia não pode responder (antes ela começava a coleta). Vira "perdido" e a mensagem segue pro CRM.
  const emTeste = c.estado?.modo === 'teste' && Date.parse(c.estado?.teste_ate || 0) > Date.now()
  if (!emTeste && ehDescadastro(t)) {
    await salva(c, { etapa: 'perdido', motivo_perda: 'pediu pra sair' })
    await salvaJson(c, 'estado', { indicacao: null })
    await evento('lanc_descadastro', { contato: c.id })
    return { tratado: false }
  }
  const tel = variantes(m.telefone)[0]
  if (tel && c.wa_id !== tel) await salva(c, { wa_id: tel })
  const tipo = m.tipo === 'imagem' || m.tipo === 'image' ? 'imagem' : m.tipo === 'video' ? 'video' : m.tipo === 'button' || m.tipo === 'botao' ? 'botao' : m.tipo === 'audio' ? 'audio' : (m.tipo === 'texto' || m.tipo === 'text' || m.tipo === 'interactive') ? 'texto' : 'outro'
  const linha = await registra(c, { direcao: 'entrada', autor: 'contato', tipo, texto: t || null, midia_id: m.midia_id || null, mime: m.mime || null, wamid: m.wamid || null, processado: false })
  // a mídia do teste local vem junto (base64): guarda já, pra o processa achar
  if (m.b64) { try { await guardaMidia(c, { b64: m.b64, mime: m.mime }); await (await import('../db')).maiaDb.atualiza('lanc_msgs', { id: linha.id }, { midia_id: 'local' }) } catch { /* segue */ } }
  return { tratado: true, contato_id: c.id, msg_id: linha.id }
}

// o texto de um áudio (no teste local, o id 'teste-audio:<fala>' faz de conta que foi transcrito)
async function ouve(midiaId: string): Promise<string | null> {
  if (process.env.MAIA_LOCAL === '1') return midiaId.startsWith('teste-audio:') ? midiaId.slice(12) : null
  const { transcreverMidiaOficial } = await import('@/lib/transcrever-audio')
  return transcreverMidiaOficial(midiaId)
}

// ---------- 2. o processamento (no after(), depois de uns segundos) ----------
export async function processa(contato_id: string, msg_id: string) {
  if (ESPERA_MS()) await new Promise(r => setTimeout(r, ESPERA_MS()))
  const c = await acha(contato_id)
  if (!c) return { ok: false }
  const todas = await msgs(c.id)
  const pend = todas.filter(m => m.direcao === 'entrada' && !m.processado)
  if (!pend.length) return { ok: true, nada: true }
  // só a última mensagem que chegou responde (as outras param aqui e ela responde por todas)
  const ultima = pend[pend.length - 1]
  if (ultima.id !== msg_id && pend.some(m => m.id === msg_id)) return { ok: true, esperando: ultima.id }
  const { maiaDb: db } = await import('../db')
  for (const m of pend) await db.atualiza('lanc_msgs', { id: m.id }, { processado: true })
  // as mídias: baixa da Meta e guarda no bucket (a do teste local já foi guardada na entrada)
  let fotos = 0, videos = 0
  for (const m of pend.filter(x => x.tipo === 'imagem' || x.tipo === 'video')) {
    try {
      if (m.midia_id !== 'local') await guardaMidia(c, { midia_id: m.midia_id, mime: m.mime })
      if (m.tipo === 'video') videos++; else fotos++
    } catch (e: any) { await evento('lanc_erro_midia', { contato: c.id, erro: String(e?.message || e).slice(0, 200) }) }
  }
  // os áudios viram texto (16/11: uma pessoa mandou áudio e a Maia disse que não ouvia). O texto fica na conversa com 🎤
  const ouvidos: Record<string, string> = {}
  for (const m of pend.filter(x => x.tipo === 'audio' && !x.texto && x.midia_id)) {
    const t = await ouve(String(m.midia_id))
    if (t) { ouvidos[m.id] = t; await db.atualiza('lanc_msgs', { id: m.id }, { texto: '🎤 ' + t }) }
  }
  const falas = pend.map(x => ouvidos[x.id] || (['texto', 'botao', 'outro', 'audio'].includes(x.tipo) && x.texto ? String(x.texto).replace(/^🎤 /, '') : '')).filter(Boolean)
  // 16/11: a saudação automática que chega junto com uma resposta de gente não entra na leitura (virava "o negócio" da pessoa)
  const deGente = falas.filter(f => !ehAutoResposta(f))
  const texto = (deGente.length ? deGente : falas).join('\n').trim()
  const audio = pend.some(x => x.tipo === 'audio' && !x.texto && !ouvidos[x.id])
  try { return await responde(c, texto, { fotos, videos, audio }) }
  catch (e: any) { await evento('lanc_erro', { contato: c.id, erro: String(e?.message || e).slice(0, 300) }); return { ok: false, erro: String(e?.message || e) } }
}

// 17/11 (Nando, Cristina Grossi): devolvida pra Maia, a pessoa tinha escrito enquanto estava com o time e ficou sem resposta.
// "Devolver e responder": tudo o que ela mandou depois da última mensagem que saiu (da Maia ou do time) é lido de novo, junto
export async function respondePendentes(c: any) {
  const todas = await msgs(c.id)
  let ult = -1
  todas.forEach((m: any, i: number) => { if (m.direcao === 'saida') ult = i })
  const pend = todas.slice(ult + 1).filter((m: any) => m.direcao === 'entrada')
  if (!pend.length) return { ok: true, nada: true }
  for (const m of pend) await maiaDb.atualiza('lanc_msgs', { id: m.id }, { processado: false })
  return processa(c.id, pend[pend.length - 1].id)
}

// 17/11 (Nando, Indiara): a pessoa viu a amostra e quer outra, de OUTRO negócio dela (da loja de roupas pra empresa de
// energia solar). Nada é apagado: a coleta, a amostra e o estado de antes ficam em estado.anteriores; as fotos de antes saem
// da contagem (origem 'contato_anterior'); a coleta recomeça do zero, fora do "com o time", e a Maia já faz a 1ª pergunta.
// O link da amostra continua o mesmo e passa a mostrar a nova quando ela for aprovada.
export async function novaAmostra(c: any, sobre = '') {
  const agora = new Date().toISOString()
  const { anteriores = [], ...estadoAntes } = c.estado || {}
  const guardada = { coleta: c.coleta || {}, amostra: c.amostra || {}, estado: estadoAntes, etapa: c.etapa, entregue_em: c.entregue_em || null, testou_em: c.testou_em || null, aberturas: c.aberturas || 0, guardada_em: agora }
  let fotos = 0
  for (const m of (await midias(c.id)).filter((m: any) => m.origem === 'contato')) { await maiaDb.atualiza('lanc_midias', { id: m.id }, { origem: 'contato_anterior' }); fotos++ }
  await salva(c, {
    etapa: 'coletando', coleta: {}, amostra: {}, entrega_em: null, entregue_em: null, aberturas: 0, aberta_em: null, testou_em: null,
    rick_pendente_em: null, rick_feito_em: null, motivo_perda: null,
    estado: { anteriores: [...anteriores, guardada], inicio_em: agora, passo: 'negocio', nova_amostra_em: agora },
  })
  const qual = String(sobre || '').trim().replace(/[.!?]+$/, '')
  await mandaTexto(c, `Boa! Então vamos fazer a amostra ${qual ? 'da ' + qual : 'do teu outro negócio'}. As mesmas perguntas rápidas, uma de cada vez, e no fim umas fotos.\n\nPra começar: o que vocês vendem ou fazem, e pra quem?`)
  await evento('lanc_nova_amostra', { contato: c.id, sobre: qual, guardadas: fotos })
  return { ok: true, guardadas: fotos }
}

type Novas = { fotos: number; videos: number; audio?: boolean }
async function responde(c: any, texto: string, novas: Novas) {
  const agora = Date.now()
  // 16/11: com o time, a Maia fica quieta (a mensagem já está na caixa do CRM)
  if (c.estado?.humano) return { ok: true, silencio: 'com o time' }
  // 16/11 (AT-3): o time escreveu pra ela nas últimas 2 h pela caixa do CRM: a Maia não fala junto
  if (timeFalando(c)) return { ok: true, silencio: 'o time está falando' }
  // modo teste
  if (c.estado?.modo === 'teste') {
    if (Date.parse(c.estado.teste_ate || 0) > agora) {
      if (ehSair(texto)) return saiTeste(c)
      if (texto) return respondeTeste(c, texto)
      return { ok: true, teste: 'midia ignorada' }
    }
    await salvaJson(c, 'estado', { modo: null })   // passou o tempo: sai calado e segue
  }
  // 16/11: pediu uma pessoa
  if (texto && ehPedeHumano(texto)) return passaProTime(c, 'pediu pra falar com uma pessoa', true)
  // 17/11: quem já testou e volta a escrever COMO CLIENTE ("precisa de entrada?", "quanto fica o modelo X?") volta pro teste sozinho
  if (texto && c.estado?.teste_desde && ['amostra_entregue', 'testou'].includes(c.etapa) && pareceCliente(texto)) {
    await salvaJson(c, 'estado', { modo: 'teste', teste_ate: new Date(Date.now() + TESTE_MIN() * 60e3).toISOString(), teste_desde: new Date().toISOString() })
    await evento('lanc_teste_volta', { contato: c.id })
    return respondeTeste((await acha(c.id)) || c, texto)
  }
  // 17/11: depois da amostra, perguntou pelo anúncio/vídeo ("onde está o card?"): manda as peças de novo, como estão agora
  const semAc = (texto || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const pecasDeNovo = !!texto && ['amostra_entregue', 'testou'].includes(c.etapa) && !!c.amostra?.pecas?.anuncio1 && (await import('./entrega')).pedeAsPecas(semAc)
  if (pecasDeNovo) await (await import('./entrega')).reenviaPecas(c)
  // 16/11 (entrega nova): o botão "Testar agora" da entrega liga o modo teste ali mesmo
  if (texto && (ehGatilhoTeste(texto) || (entregaV2() && ehTestarAgora(texto)))) return entraTeste(c)
  if (pecasDeNovo) return { ok: true, reenviou: true }
  if (novas.audio && !texto) { await mandaTexto(c, 'Não consegui ouvir esse áudio. Me escreve, por favor?'); return { ok: true } }
  // quem tinha recusado (ou sem negócio) e voltou
  if (c.estado?.indicacao && c.etapa === 'perdido' && !ehQueroVer(texto)) return indicacao(c, texto)
  if (['na_lista', 'disparado', 'agora_nao', 'perdido'].includes(c.etapa)) {
    if (ehAgoraNao(texto, true)) return agoraNao(c)
    // 16/11: saudação automática do WhatsApp da empresa não é "Quero ver": quieta, e a pessoa segue onde estava
    if (['na_lista', 'disparado'].includes(c.etapa) && texto && ehAutoResposta(texto)) {
      await salvaJson(c, 'estado', { auto_resposta: { em: new Date().toISOString() } })
      await evento('lanc_auto_resposta', { contato: c.id })
      return { ok: true, silencio: 'resposta automática' }
    }
    await salva(c, { etapa: 'quero_ver', motivo_perda: null })
    await salvaJson(c, 'estado', { indicacao: null, inicio_em: new Date().toISOString() })
    await evento('lanc_quero_ver', { contato: c.id })
    return coleta(c, ehQueroVer(texto) ? '' : texto, novas, true)
  }
  // 16/11: na coleta, o robô do WhatsApp da empresa respondendo a pergunta ("no momento não estamos atendendo") não é resposta
  if (['quero_ver', 'coletando'].includes(c.etapa) && texto && !novas.fotos && !novas.videos && ehAutoResposta(texto)) {
    await evento('lanc_auto_resposta', { contato: c.id, na: 'coleta' })
    return { ok: true, silencio: 'resposta automática' }
  }
  if (['quero_ver', 'coletando'].includes(c.etapa)) return coleta(c, texto, novas, false)
  if (['material_recebido', 'em_producao'].includes(c.etapa)) return aguardando(c, texto, novas)
  if (['amostra_entregue', 'testou'].includes(c.etapa)) {
    // 16/11 (entrega nova): a amostra saiu pelo modelo (fora das 24 h); a pessoa respondeu, então vão as peças, o botão e o link
    if (entregaV2() && c.amostra?.falta_resto && c.amostra?.entrega_v2) {
      const e = await import('./entrega')
      await e.mandaResto(c)
      if (texto && !ehQueroVer(texto) && (await lePosEntrega(texto)) !== 'outro') return e.posEntregaNova(c, texto)
      return { ok: true, resto: true }
    }
    if (entregaV2() && c.amostra?.entrega_v2) return (await import('./entrega')).posEntregaNova(c, texto)
    return posEntrega(c, texto)
  }
  if (c.etapa === 'fechamento') { await marcaRick(c, 'respondeu de novo na conversa'); return { ok: true, silencio: 'com o time' } }
  return { ok: true }
}

// ---------- 3. a coleta ----------
export const materialNoInstagram = (t: string) => {
  const s = t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  if (/\bnao\b/.test(s)) return false
  return /instagram\.com\//.test(s) || /^@[\w.]{2,30}$/.test(s.trim()) || /(pega|pegar|tira|tirar|usa|usar|ve|ver|olha|olhar|tem|ta|esta|estao|tudo)\b.{0,25}\b(insta|instagram|perfil|feed)\b/.test(s)
}
// 16/11 (Nando): saudação automática ("X agradece seu contato…") ou só um "Oi" não é resposta: não vira o negócio, a cidade etc.
export const soSaudacao = (v: string) => /^\s*(oi+|ol[aá]+|opa|e a[ií]|bom dia|boa tarde|boa noite|tudo bem\??)[\s!.,?]*$/i.test(v)
export function limpaCampos(campos: Record<string, any>) {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(campos)) if (!(typeof v === 'string' && (ehAutoResposta(v) || soSaudacao(v)))) out[k] = v
  return out
}
export async function contaMidias(c: any) {
  const ms = await midias(c.id)
  return { fotos: ms.filter(m => m.origem === 'contato' && m.tipo === 'foto').length, videos: ms.filter(m => m.origem === 'contato' && m.tipo === 'video').length }
}
// o próximo passo que falta (as fotos: 3, ou menos se a pessoa disse que só tem essas; o vídeo é opcional, mas pergunta)
export function proximoPasso(c: any, n: { fotos: number; videos: number }): Passo | 'video' | 'feito' {
  const k = c.coleta || {}
  for (const p of ['negocio', 'cidade', 'produtos', 'faixa_preco', 'como_vende', 'carro_chefe', 'dificuldade', 'instagram'] as const) {
    if (p === 'faixa_preco') { if (!k.faixa_preco && k.produtos && !/\d/.test(String(k.produtos))) return p; continue }
    if (!k[p]) return p
  }
  // 17/11: o link do Instagram (ou "pega do meu Instagram") vale como o material: a equipe pega as fotos de lá
  if (k.material_instagram) return 'feito'
  if (n.fotos < 3 && !(k.so_essas && n.fotos >= 1)) return 'fotos'
  if (!n.videos && !k.sem_video) return 'video'
  // 16/11 (Nando): sem a pergunta da hora (as pessoas paravam nela). Fotos e vídeo recebidos: fecha ("em até 24 horas")
  return 'feito'
}
const pergunta = (p: Passo | 'video' | 'feito') => p === 'fotos' ? PEDE_FOTOS : p === 'video' ? PEDE_VIDEO : p === 'hora' ? perguntaHora() : p === 'feito' ? '' : PERGUNTAS[p]

async function coleta(c: any, texto: string, novas: Novas, intro: boolean) {
  let n = await contaMidias(c)
  let passo = proximoPasso(c, n)
  const antes = c.estado?.passo || null
  const partes: string[] = intro ? [INTRO] : []
  // 17/11: na hora das fotos, a pessoa mandou o link do Instagram (ou "pega do meu insta"): vale como material, sem pedir foto de novo
  if (texto && (passo === 'fotos' || passo === 'video') && materialNoInstagram(texto)) {
    const ig = (texto.match(/https?:\/\/(www\.)?instagram\.com\/[^\s]+/i) || [])[0] || (texto.match(/@[\w.]{2,30}/) || [])[0] || c.coleta?.instagram || 'o Instagram'
    await salvaJson(c, 'coleta', { material_instagram: ig, sem_video: true })
    if (c.etapa === 'quero_ver') await salva(c, { etapa: 'coletando' })
    return fechaColeta((await acha(c.id)) || c, [...partes, 'Combinado, eu pego as fotos do teu Instagram.'])
  }
  if (texto) {
    const passoLeitura: Passo = passo === 'video' || passo === 'feito' ? 'fotos' : passo
    const l = await interpreta(texto, passoLeitura, c.coleta)
    const campos: any = limpaCampos(l.campos || {})
    if (campos.hora != null && passo !== 'hora') delete campos.hora
    if (Object.keys(campos).length) await salvaJson(c, 'coleta', campos)
    if (l.intencao === 'agora_nao') return agoraNao(c)
    if (l.intencao === 'sem_negocio') return semNegocio(c)
    if (l.intencao === 'sem_foto') { await salvaJson(c, 'estado', { sem_foto_em: new Date().toISOString(), passo: 'fotos' }); await mandaTexto(c, [...partes, SEM_FOTO].join('\n\n')); return { ok: true, passo: 'fotos' } }
    if (l.intencao === 'sem_video' || (passo === 'video' && l.intencao === 'responde') || (passo === 'video' && l.intencao === 'so_essas')) await salvaJson(c, 'coleta', { sem_video: true })
    if (l.intencao === 'so_essas' && passo === 'fotos') await salvaJson(c, 'coleta', { so_essas: true })
    if (l.intencao === 'preco' || l.intencao === 'duvida') {
      if (l.intencao === 'duvida') await registraDuvida(c, l.duvida || texto)
      await mandaTexto(c, [...partes, l.intencao === 'preco' ? PRECO : DUVIDA, pergunta(proximoPasso(c, n))].join('\n\n'))
      await salvaJson(c, 'estado', { passo: proximoPasso(c, n) })
      return { ok: true, passo: proximoPasso(c, n), [l.intencao]: true }
    }
    if (passo === 'hora' && l.campos?.hora == null) { await mandaTexto(c, 'Me diz só a hora que fica melhor amanhã: 10h ou 15h?'); return { ok: true, passo } }
  }
  if (c.etapa === 'quero_ver' && (texto || novas.fotos || novas.videos) && !intro) await salva(c, { etapa: 'coletando' })
  n = await contaMidias(c)
  passo = proximoPasso(c, n)
  // 16/11 (Nando): chegaram as fotos → avisa o time NA HORA pra começar a amostra (uma vez por pessoa), sem esperar o vídeo
  if ((novas.fotos || novas.videos) && (passo === 'video' || passo === 'feito')) await avisaMaterial(c, n)
  // a resposta
  if (passo === 'feito') return fechaColeta(c, partes)
  const recebi = novas.fotos || novas.videos
    ? `Recebi ${[novas.fotos ? `${novas.fotos} foto${novas.fotos > 1 ? 's' : ''}` : '', novas.videos ? `${novas.videos} vídeo${novas.videos > 1 ? 's' : ''}` : ''].filter(Boolean).join(' e ')}.`
    : ''
  let msg: string
  if (passo === 'fotos' && antes === 'fotos' && (novas.fotos || novas.videos)) msg = `${recebi} ${n.fotos < 3 ? `Manda mais ${3 - n.fotos} foto${3 - n.fotos > 1 ? 's' : ''} que já dá.` : ''}`.trim()
  else if (passo === antes && !texto && (novas.fotos || novas.videos)) msg = `${recebi} Já guardei.\n\n${pergunta(passo)}`
  else if (passo === antes && texto) msg = pergunta(passo)   // a resposta não serviu: pergunta de novo
  else msg = [recebi || (texto && !intro ? OKS[(c.estado?.oks || 0) % OKS.length] : ''), pergunta(passo)].filter(Boolean).join(' ')
  if (passo === 'video' && (novas.fotos || novas.videos) && antes === 'fotos') msg = PEDE_VIDEO
  await mandaTexto(c, [...partes, msg].join('\n\n'))
  await salvaJson(c, 'estado', { passo, oks: (c.estado?.oks || 0) + 1 })
  return { ok: true, passo }
}

// 16/11 (Nando): sem hora marcada. A amostra sai assim que a equipe aprovar; o prazo prometido é de 24 h (estado.prazo_em,
// pra a tela da equipe ordenar). Quem já tinha hora combinada (entrega_em) segue com ela
export const MATERIAL_RECEBIDO = 'Material recebido! Em até 24 horas eu te mando aqui como ficou: 2 anúncios e 1 vídeo feitos com as tuas fotos.'
async function avisaMaterial(c: any, n: { fotos: number; videos: number }) {
  const atual = (await acha(c.id)) || c
  if (atual.estado?.aviso_material) return
  const prazo = new Date(Date.now() + 24 * 3600e3).toISOString()
  await salvaJson(c, 'estado', { aviso_material: new Date().toISOString() })
  const ig = atual.coleta?.material_instagram
  await avisaGuto('material chegou, começar a amostra', `${rotulo(atual)} ${ig ? `pediu pra pegar as fotos do Instagram (${ig})${n.fotos ? ` e mandou ${n.fotos} foto(s)` : ''}` : `mandou ${n.fotos} foto(s)${n.videos ? ` e ${n.videos} vídeo(s)` : ''}`}. Prometido em até 24 h (até ${quandoFalado(prazo)}). Tela: www.carreiranodigital.com/maia/operacao/lancamento.html`, true)
}
export async function fechaColeta(c: any, partes: string[] = []) {
  const prazo = new Date(Date.now() + 24 * 3600e3).toISOString()
  await salva(c, { etapa: avanca(c.etapa, 'material_recebido') })
  await salvaJson(c, 'estado', { passo: 'feito', coleta_fim_em: new Date().toISOString(), prazo_em: prazo })
  await mandaTexto(c, [...partes, MATERIAL_RECEBIDO].join('\n\n'))
  await evento('lanc_material', { contato: c.id })
  // o aviso pro time sai quando as fotos chegam (avisaMaterial); aqui só se ainda não saiu (ex.: a rotina fechando quem parou)
  await avisaMaterial(c, await contaMidias(c))
  return { ok: true, passo: 'feito', prazo_em: prazo }
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

async function aguardando(c: any, texto: string, novas: Novas) {
  const quando = c.entrega_em ? quandoFalado(c.entrega_em) : 'em até 24 horas'
  if (novas.fotos || novas.videos) { await mandaTexto(c, 'Recebi! Vai junto pra equipe que está montando a tua amostra.'); if (!texto) return { ok: true } }
  if (!texto) return { ok: true }
  const h = /\b(hora|horario|mudar|trocar|pode ser|melhor)\b/i.test(texto) ? lerHora(texto) : null
  if (h != null && c.entrega_em) {
    const dia = new Date(Date.parse(c.entrega_em) - 3 * 3600e3).toISOString().slice(0, 10)
    const nova = instanteBR(dia, h)
    await salva(c, { entrega_em: nova }); await salvaJson(c, 'coleta', { hora: h })
    await mandaTexto(c, `Combinado, mudei pra ${quandoFalado(nova)}.`)
    return { ok: true, nova_hora: h }
  }
  if (texto.includes('?')) { await registraDuvida(c, texto); await mandaTexto(c, DUVIDA); return { ok: true, duvida: true } }
  // 16/11: "ok", "obrigada", "beleza" enquanto espera a amostra: não precisa de resposta
  if (/^\s*(ok+|okay|blz|beleza|obrigad[oa]s?|brigad[oa]|valeu|show|top|certo|combinado|perfeito|otimo|ótimo|aguardo|fico no aguardo|\p{Extended_Pictographic}+)[\s.!]*$/iu.test(texto)) return { ok: true, quieta: true }
  await mandaTexto(c, `Anotado! A tua amostra chega ${quando}.`)
  return { ok: true }
}

// ---------- 4. o modo teste ao vivo ----------
// parece mensagem de CLIENTE do negócio (não do dono falando com a escola): pergunta de preço, entrega, modelo, horário...
export const pareceCliente = (t: string) => {
  const s = t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  if (!s.includes('?')) return false
  if (/\b(maia|escola|amostra|anuncios?|video|sistema|voces|plano|contrat|implanta|mensalidade|teste|ia)\b/.test(s)) return false
  return /\b(quanto|valor|preco|precisa de entrada|entrada|tem (o|a|de|em|no|na|tamanho|cor)|entrega|frete|parcel|pix|cartao|tamanhos?|cor(es)?|modelos?|disponivel|estoque|orcamento|horario|abre|aberto|endereco|agenda|marcar|consulta|atende|faz (o|a|em)|serve|aceita)\b/.test(s)
}
export const TEXTO_TESTE = (neg: string) => `Quero testar a Maia como cliente da ${neg} (modo teste)`
async function entraTeste(c: any) {
  if (!c.coleta?.negocio) {
    await mandaTexto(c, 'O teste fica pronto junto com a tua amostra: primeiro eu preciso conhecer o teu negócio. ' + pergunta(proximoPasso(c, await contaMidias(c))))
    return { ok: true, teste: 'sem coleta' }
  }
  const ate = new Date(Date.now() + TESTE_MIN() * 60e3).toISOString()
  await salvaJson(c, 'estado', { modo: 'teste', teste_ate: ate, teste_desde: new Date().toISOString() })
  await mandaTexto(c, `Modo teste ligado! A partir de agora eu sou a atendente da ${nomeNeg(c)}. Me manda uma mensagem como se tu fosse um cliente que viu o anúncio. Pra sair, escreve "sair".`)
  await evento('lanc_teste_inicio', { contato: c.id })
  return { ok: true, teste: 'ligado' }
}

export async function saiTeste(c: any, porTempo = false) {
  await salvaJson(c, 'estado', { modo: null, teste_ate: null })
  const testou = !!c.testou_em
  // 16/11 (entrega nova): saiu do teste depois da amostra, a Maia pergunta na hora o que a pessoa achou (a resposta vai pro time)
  if (testou && entregaV2() && c.amostra?.entrega_v2 && ['amostra_entregue', 'testou'].includes(c.etapa)) {
    const { PERGUNTA_TESTE } = await import('./conteudo')
    await mandaTexto(c, `${porTempo ? 'Faz um tempinho que tu não escreve, então saí do modo teste' : 'Pronto, saí do modo teste'} e voltei a ser a Maia da escola. ${PERGUNTA_TESTE}`)
    await salvaJson(c, 'estado', { acomp: { ...((await acha(c.id))?.estado?.acomp || {}), esperando: 'opiniao_teste', perguntou_teste_em: new Date().toISOString(), perguntar_teste: false } })
    await marcaRick(c, 'fez o teste ao vivo')
    return { ok: true, teste: 'saiu', perguntou: true }
  }
  await mandaTexto(c, `${porTempo ? 'Faz um tempinho que tu não escreve, então saí do modo teste' : 'Pronto, saí do modo teste'} e voltei a ser a Maia da escola. ${testou ? 'Viu? É assim que eu atenderia cada cliente teu, a qualquer hora, e chamaria de novo quem sumisse. Se quiser colocar isso pra rodar no teu negócio, é só me dizer.' : 'Quando quiser testar, é só escrever "modo teste".'}`)
  if (testou) await marcaRick(c, 'fez o teste ao vivo')
  return { ok: true, teste: 'saiu' }
}

async function respondeTeste(c: any, texto: string) {
  await salvaJson(c, 'estado', { teste_ate: new Date(Date.now() + TESTE_MIN() * 60e3).toISOString() })
  const desde = c.estado?.teste_desde || new Date(0).toISOString()
  const hist = (await msgs(c.id)).filter(m => m.criado_em >= desde && m.tipo === 'texto').slice(-12)
  let resposta = ''
  const { respostaTeste } = await import('./teste')
  // 16/11 (Guto): no negócio de produto, a atendente mostra os modelos. As fotos que a pessoa mandou na coleta (sem a logo)
  // vão quando o cliente pede pra ver; 4 por vez, sem repetir as que já foram nesse teste
  const fotos = (await midias(c.id)).filter((m: any) => m.tipo === 'foto' && m.path && m.path !== c.amostra?.logo)
  resposta = await respostaTeste(c, hist, texto, fotos.length)
  const comFotos = /\[FOTOS\]/i.test(resposta)
  resposta = resposta.replace(/\s*\[FOTOS\]\s*/gi, ' ').trim()
  await mandaTexto(c, resposta)
  if (comFotos && fotos.length) {
    const ja = Number((await acha(c.id))?.estado?.teste_fotos || 0)
    const lote = Array.from({ length: Math.min(4, fotos.length) }, (_, i) => fotos[(ja + i) % fotos.length])
    for (const f of lote) {
      const link = await maiaDb.linkEnvio(f.path)
      if (link) await mandaMidia(c, 'image', link, '', f.mime || 'image/jpeg', f.path)
    }
    await salvaJson(c, 'estado', { teste_fotos: ja + lote.length })
  }
  // 16/11 (entrega nova): guarda as perguntas do teste pro cartão do Rick
  if (entregaV2()) await salvaJson(c, 'estado', { teste_perguntas: [...((await acha(c.id))?.estado?.teste_perguntas || []), texto.slice(0, 200)].slice(-10) })
  if (!c.testou_em) {
    await salva(c, { testou_em: new Date().toISOString(), etapa: avanca(c.etapa, 'testou') })
    await evento('lanc_testou', { contato: c.id })
    await marcaRick(c, 'fez o teste ao vivo')
  }
  return { ok: true, teste: 'respondeu' }
}

// ---------- 5. depois da entrega ----------
async function posEntrega(c: any, texto: string) {
  if (!texto) return { ok: true }
  const q = await lePosEntrega(texto)
  if (q === 'quer_fechar') {
    await salva(c, { etapa: avanca(c.etapa, 'fechamento') })
    await mandaTexto(c, 'Que bom! Vou chamar o time da escola pra combinar a tua implantação. Já já alguém te chama aqui, tá?')
    await marcaRick(c, 'quer fechar', true)
    return { ok: true, depois: q }
  }
  if (q === 'nao_quer') {
    await salva(c, { etapa: 'perdido', motivo_perda: texto.slice(0, 300) })
    await mandaTexto(c, 'Tranquilo, obrigada por ter olhado a amostra! Se mudar de ideia, é só me chamar aqui.')
    return { ok: true, depois: q }
  }
  if (q === 'duvida') {
    await registraDuvida(c, texto)
    await mandaTexto(c, DUVIDA)
    await marcaRick(c, 'tem uma dúvida depois da amostra')
    return { ok: true, depois: q }
  }
  if (!c.testou_em) await mandaTexto(c, `Que bom! Quer ver na prática? Escreve "modo teste" e me manda uma pergunta como se fosse um cliente teu (por exemplo, perguntando o preço), que eu respondo como atendente da ${nomeNeg(c)}.`)
  else { await mandaTexto(c, 'Obrigada! Vou pedir pro time te chamar pra mostrar como fica no dia a dia.'); await marcaRick(c, 'respondeu depois do teste') }
  return { ok: true, depois: q }
}

// ---------- os casos de saída ----------
async function agoraNao(c: any) {
  await salva(c, { etapa: 'agora_nao' })
  await mandaTexto(c, AGORA_NAO)
  await evento('lanc_agora_nao', { contato: c.id })
  return { ok: true, etapa: 'agora_nao' }
}
async function semNegocio(c: any) {
  await salva(c, { etapa: 'perdido', motivo_perda: 'sem negócio' })
  await salvaJson(c, 'estado', { indicacao: true })
  await mandaTexto(c, SEM_NEGOCIO)
  return { ok: true, etapa: 'perdido', indicacao: true }
}
async function indicacao(c: any, texto: string) {
  const tem = (texto.match(/\d/g) || []).length >= 10
  if (tem) {
    await salvaJson(c, 'estado', { indicacao: null, indicou: texto.slice(0, 300) })
    await mandaTexto(c, 'Valeu pela indicação! O time da escola vai chamar essa pessoa. Se ela fechar, a gente te avisa da comissão.')
    await avisaGuto('indicação', `${primeiroNome(c.nome) || 'Um contato'} indicou alguém (está na tela do lançamento).`)
    return { ok: true, indicou: true }
  }
  await salvaJson(c, 'estado', { indicacao: null })
  await registraDuvida(c, texto)
  await mandaTexto(c, DUVIDA)
  return { ok: true }
}

export async function registraDuvida(c: any, texto: string) {
  await salvaJson(c, 'estado', { duvida: { texto: texto.slice(0, 500), em: new Date().toISOString() } })
  await avisaGuto('dúvida pro time', `${rotulo(c)} perguntou uma coisa que a Maia não sabe. Responde pela caixa de Disparos do CRM.`)
}

// a fila "Rick: mandar áudio"
export async function marcaRick(c: any, motivo: string, urgente = false) {
  const atual = (await acha(c.id)) || c
  if (atual.rick_pendente_em && !atual.rick_feito_em) { await salvaJson(c, 'estado', { rick_motivo: motivo }); return false }
  await salva(c, { rick_pendente_em: new Date().toISOString(), rick_feito_em: null })
  await salvaJson(c, 'estado', { rick_motivo: motivo })
  await avisaGuto('Rick: mandar áudio', `${rotulo(atual)}: ${motivo}.`, urgente)
  return true
}
