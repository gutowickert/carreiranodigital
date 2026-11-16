// Maia, lançamento: a conversa no número da escola com quem está na lista do lançamento (15/11/2026).
//   1. o webhook da escola chama entrada() na hora (rápido: só acha a pessoa e guarda a mensagem) e processa() no after()
//   2. processa() espera uns segundos (a pessoa manda várias fotos ou mensagens seguidas) e responde UMA vez por tudo que chegou
//   3. a coleta: uma pergunta por vez (o que vende e pra quem, cidade, produtos com preço, como vende, o que mais vende,
//      a maior dificuldade, Instagram, 3 a 5 fotos e vídeos curtos, a hora da entrega)
//   4. o modo teste: a Maia responde como atendente do negócio da pessoa (sai com "sair" ou depois de 30 min parado)
//   5. depois da entrega: quem quer fechar, tem dúvida ou testou vai pra fila do Rick (áudio de fechamento)
// A Maia sempre diz que é IA, fala "tu", sem emoji, e mostra o valor antes do preço.
import { maiaLocal } from '../db'
import {
  contatoDoTelefone, contato as acha, salva, salvaJson, registra, msgs, midias, mandaTexto, guardaMidia, avisaGuto, avanca,
  primeiroNome, diaDaEntrega, diaFalado, instanteBR, quandoFalado, evento, variantes,
} from './base'
import { interpreta, lePosEntrega, ehQueroVer, ehAgoraNao, ehSair, ehDescadastro, ehGatilhoTeste, lerHora, type Passo } from './interpreta'
import { diagLigado, arrobaDe, marcaLogo, geraDiagnostico } from './diagnostico'

export const TESTE_MIN = () => Math.max(5, +(process.env.MAIA_LANC_TESTE_MIN || 30))
const ESPERA_MS = () => (maiaLocal() ? 0 : Math.max(0, +(process.env.MAIA_LANC_ESPERA_MS || 7000)))

export const PERGUNTAS: Record<Exclude<Passo, 'fotos' | 'hora'>, string> = {
  negocio: 'Pra começar: o que tu vende, e pra quem?',
  cidade: 'Em que cidade tu atende?',
  produtos: 'Me diz 2 ou 3 produtos ou serviços teus, com o preço de cada um.',
  como_vende: 'E como o cliente compra de ti? Entrega, retirada, horário marcado... E qual é o teu horário de atendimento?',
  carro_chefe: 'Do que tu vende, o que sai mais ou dá mais lucro?',
  dificuldade: 'Hoje, qual é a maior dificuldade pra vender mais?',
  instagram: 'Qual é o @ do teu Instagram? Se não tiver, é só dizer.',
}
export const PEDE_FOTOS = 'Agora o mais importante: me manda de 3 a 5 fotos do teu produto ou serviço e, se tiver, uns vídeos curtos do dia a dia. Pode ser do celular mesmo. Eu só uso o que tu mandar.'
export const PEDE_VIDEO = 'Fotos recebidas! Tem uns vídeos curtos do dia a dia (até 1 minuto)? Se tiver, manda aqui. Se não tiver, é só dizer "sem vídeo".'
// 16/11 (raio-x, MAIA_LANC_DIAGNOSTICO=1): junto com as fotos, a logo (opcional)
export const pedeFotos = () => (diagLigado() ? PEDE_FOTOS + ' Se tiver a logo da empresa, manda também.' : PEDE_FOTOS)
export const SEM_FOTO = 'Sem fotos eu não consigo, porque não invento imagem do teu negócio. Quando tiver, me manda aqui que eu faço.'
// Sem se apresentar de novo: a Maia já se apresentou no disparo (Guto, 15/11)
export const INTRO = 'Oba! Vou te fazer umas perguntas rápidas, uma de cada vez, e no fim te peço umas fotos e uns vídeos curtos. Leva uns 3 minutos.'
export const AGORA_NAO = 'Tranquilo! Não te chamo mais sobre isso.'
export const SEM_NEGOCIO = 'Entendi! A amostra é feita pro negócio de quem tem um. Mas se tu conhece alguém que tem negócio e ia gostar, me passa o nome e o WhatsApp da pessoa: se ela fechar, tu ganha comissão pela indicação.'
export const PRECO = 'Te mostro tudo junto com a amostra: o que eu faço, o que está incluso e o valor. Primeiro deixa eu fazer a tua!'
export const DUVIDA = 'Boa pergunta! Essa eu passo pro time da escola, que te responde aqui mesmo.'
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
  if (m.b64) { try { const g = await guardaMidia(c, { b64: m.b64, mime: m.mime }); await (await import('../db')).maiaDb.atualiza('lanc_msgs', { id: linha.id }, { midia_id: 'local:' + g.id }) } catch { /* segue */ } }
  return { tratado: true, contato_id: c.id, msg_id: linha.id }
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
  const lote: { tipo: string; id: string | null; legenda: string }[] = []
  for (const m of pend.filter(x => x.tipo === 'imagem' || x.tipo === 'video')) {
    try {
      const local = String(m.midia_id || '').startsWith('local')
      const g = local ? null : await guardaMidia(c, { midia_id: m.midia_id, mime: m.mime })
      lote.push({ tipo: m.tipo, id: g?.id || (local ? String(m.midia_id).slice(6) || null : null), legenda: m.texto || '' })
      if (m.tipo === 'video') videos++; else fotos++
    } catch (e: any) { await evento('lanc_erro_midia', { contato: c.id, erro: String(e?.message || e).slice(0, 200) }) }
  }
  let texto = pend.filter(x => ['texto', 'botao', 'outro', 'audio'].includes(x.tipo) && x.texto).map(x => x.texto).join('\n').trim()
  const audio = pend.some(x => x.tipo === 'audio' && !x.texto)
  // 16/11 (raio-x): "essa é a logo" (na legenda da foto ou numa mensagem junto) marca a foto como a logo da empresa.
  // A logo não conta como foto do produto, e o texto que só fala da logo não vira resposta da coleta
  let logo = false
  if (diagLigado()) {
    const falaLogo = (t: any) => /\blogo(marca|tipo)?\b/i.test(String(t || ''))
    const fotosLote = lote.filter(x => x.tipo === 'imagem' && x.id)
    let alvo = fotosLote.find(x => falaLogo(x.legenda))?.id || null
    if (!alvo && falaLogo(texto)) alvo = fotosLote[fotosLote.length - 1]?.id || (await midias(c.id)).filter(x => x.origem === 'contato' && x.tipo === 'foto').pop()?.id || null
    if (alvo) {
      try {
        await marcaLogo(c, alvo, 'contato'); logo = true
        if (fotosLote.some(x => x.id === alvo)) fotos--
        texto = texto.split('\n').filter(l => !(falaLogo(l) && l.length < 80)).join('\n').trim()
      } catch { /* a equipe marca na tela */ }
    }
  }
  try { return await responde(c, texto, { fotos, videos, audio, logo }) }
  catch (e: any) { await evento('lanc_erro', { contato: c.id, erro: String(e?.message || e).slice(0, 300) }); return { ok: false, erro: String(e?.message || e) } }
}

type Novas = { fotos: number; videos: number; audio?: boolean; logo?: boolean }
async function responde(c: any, texto: string, novas: Novas) {
  const agora = Date.now()
  // modo teste
  if (c.estado?.modo === 'teste') {
    if (Date.parse(c.estado.teste_ate || 0) > agora) {
      if (ehSair(texto)) return saiTeste(c)
      if (texto) return respondeTeste(c, texto)
      return { ok: true, teste: 'midia ignorada' }
    }
    await salvaJson(c, 'estado', { modo: null })   // passou o tempo: sai calado e segue
  }
  if (texto && ehGatilhoTeste(texto)) return entraTeste(c)
  if (novas.logo && !texto && !novas.fotos && !novas.videos && !['quero_ver', 'coletando'].includes(c.etapa)) { await mandaTexto(c, 'Recebi a logo! Vai junto pra equipe.'); return { ok: true, logo: true } }
  if (novas.audio && !texto) { await mandaTexto(c, 'Ainda não consigo ouvir áudio por aqui. Me escreve, por favor?'); return { ok: true } }
  // quem tinha recusado (ou sem negócio) e voltou
  if (c.estado?.indicacao && c.etapa === 'perdido' && !ehQueroVer(texto)) return indicacao(c, texto)
  if (['na_lista', 'disparado', 'agora_nao', 'perdido'].includes(c.etapa)) {
    if (ehAgoraNao(texto, true)) return agoraNao(c)
    await salva(c, { etapa: 'quero_ver', motivo_perda: null })
    await salvaJson(c, 'estado', { indicacao: null, inicio_em: new Date().toISOString() })
    await evento('lanc_quero_ver', { contato: c.id })
    return coleta(c, ehQueroVer(texto) ? '' : texto, novas, true)
  }
  if (['quero_ver', 'coletando'].includes(c.etapa)) return coleta(c, texto, novas, false)
  if (['material_recebido', 'em_producao'].includes(c.etapa)) return aguardando(c, texto, novas)
  if (['amostra_entregue', 'testou'].includes(c.etapa)) return posEntrega(c, texto)
  if (c.etapa === 'fechamento') { await marcaRick(c, 'respondeu de novo na conversa'); return { ok: true, silencio: 'com o time' } }
  return { ok: true }
}

// ---------- 3. a coleta ----------
export async function contaMidias(c: any) {
  const ms = await midias(c.id)
  const logoId = diagLigado() ? c.amostra?.logo?.midia_id || null : null   // a logo não conta como foto do produto
  return { fotos: ms.filter(m => m.origem === 'contato' && m.tipo === 'foto' && m.id !== logoId).length, videos: ms.filter(m => m.origem === 'contato' && m.tipo === 'video').length }
}
// o próximo passo que falta (as fotos: 3, ou menos se a pessoa disse que só tem essas; o vídeo é opcional, mas pergunta)
export type PassoColeta = Passo | 'video' | 'feito' | 'nome_empresa' | 'instagram_ok'
export function proximoPasso(c: any, n: { fotos: number; videos: number }): PassoColeta {
  const k = c.coleta || {}
  for (const p of ['negocio', 'cidade', 'produtos', 'como_vende', 'carro_chefe', 'dificuldade', 'instagram'] as const) if (!k[p]) return p
  // 16/11 (raio-x): o nome exato da empresa e o @ certo (pro Instagram e pra Biblioteca de Anúncios)
  if (diagLigado()) {
    if (!k.nome_confirmado) return 'nome_empresa'
    if (k.instagram && !/^n[aã]o tem$/i.test(String(k.instagram)) && !arrobaDe(k.instagram) && !k.instagram_confirmado) return 'instagram_ok'
  }
  if (n.fotos < 3 && !(k.so_essas && n.fotos >= 1)) return 'fotos'
  if (!n.videos && !k.sem_video) return 'video'
  if (k.hora == null) return 'hora'
  return 'feito'
}
export const perguntaNome = (c: any) => c.coleta?.nome_negocio
  ? `Pra eu fazer também um raio-x do teu negócio: o nome da empresa é "${c.coleta.nome_negocio}" mesmo, do jeito que aparece no Instagram? Se for outro, me escreve o certo.`
  : 'Pra eu fazer também um raio-x do teu negócio: qual é o nome da tua empresa, do jeito que aparece no Instagram ou na fachada?'
export const PERGUNTA_ARROBA = 'Me confirma só o @ do teu Instagram, do jeito que aparece no perfil (ex.: @minhaloja)?'
export const pergunta = (p: PassoColeta, c?: any) => p === 'fotos' ? pedeFotos() : p === 'video' ? PEDE_VIDEO : p === 'hora' ? perguntaHora() : p === 'feito' ? '' : p === 'nome_empresa' ? perguntaNome(c || {}) : p === 'instagram_ok' ? PERGUNTA_ARROBA : PERGUNTAS[p]
const semAc = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
// a resposta do nome da empresa e do @ (null = não é resposta: pergunta ou recusa)
export function respostaDiag(c: any, passo: 'nome_empresa' | 'instagram_ok', texto: string): Record<string, any> | null {
  const s = semAc(texto)
  if (ehAgoraNao(texto) || (/\?\s*$/.test(texto) && s.split(/\s+/).length >= 3)) return null
  if (passo === 'instagram_ok') {
    const h = arrobaDe(texto)
    if (h) return { instagram: '@' + h, instagram_confirmado: true }
    if (/^(nao|sem|nenhum)\b|nao tenho|nao tem/.test(s)) return { instagram: 'não tem', instagram_confirmado: true }
    return { instagram_confirmado: true }
  }
  if (c.coleta?.nome_negocio && /^(sim|isso|exato|correto|certo|e isso|e esse|e sim|isso mesmo|s|ss|aham|uhum|positivo|confirmo|pode ser)\b/.test(s)) return { nome_confirmado: true }
  const nome = texto.trim().replace(/^(o nome da empresa (e|é)|o nome (e|é)|se chama|chama(-se)?|nome:?|(é|e))\s+/i, '').replace(/^["'\u201c\u201d]+|["'\u201c\u201d.!]+$/g, '').trim().slice(0, 80)
  return nome ? { nome_negocio: nome, nome_confirmado: true } : null
}

async function coleta(c: any, texto: string, novas: Novas, intro: boolean) {
  let n = await contaMidias(c)
  let passo = proximoPasso(c, n)
  const antes = c.estado?.passo || null
  const partes: string[] = intro ? [INTRO] : []
  let lido = false
  if (texto && (passo === 'nome_empresa' || passo === 'instagram_ok')) {
    const r = respostaDiag(c, passo, texto)
    if (r) { await salvaJson(c, 'coleta', r); lido = true }
    else if (ehAgoraNao(texto)) return agoraNao(c)
    else {
      await registraDuvida(c, texto)
      await mandaTexto(c, [...partes, DUVIDA, pergunta(passo, c)].join('\n\n'))
      return { ok: true, passo, duvida: true }
    }
  }
  if (texto && !lido) {
    const passoLeitura: Passo = passo === 'video' ? 'fotos' : passo === 'feito' ? 'hora' : (passo === 'nome_empresa' || passo === 'instagram_ok') ? 'instagram' : passo
    const l = await interpreta(texto, passoLeitura, c.coleta)
    const campos: any = { ...(l.campos || {}) }
    if (campos.hora != null && passo !== 'hora') delete campos.hora
    if (Object.keys(campos).length) await salvaJson(c, 'coleta', campos)
    if (l.intencao === 'agora_nao') return agoraNao(c)
    if (l.intencao === 'sem_negocio') return semNegocio(c)
    if (l.intencao === 'sem_foto') { await salvaJson(c, 'estado', { sem_foto_em: new Date().toISOString(), passo: 'fotos' }); await mandaTexto(c, [...partes, SEM_FOTO].join('\n\n')); return { ok: true, passo: 'fotos' } }
    if (l.intencao === 'sem_video' || (passo === 'video' && l.intencao === 'responde') || (passo === 'video' && l.intencao === 'so_essas')) await salvaJson(c, 'coleta', { sem_video: true })
    if (l.intencao === 'so_essas' && passo === 'fotos') await salvaJson(c, 'coleta', { so_essas: true })
    if (l.intencao === 'preco' || l.intencao === 'duvida') {
      if (l.intencao === 'duvida') await registraDuvida(c, l.duvida || texto)
      await mandaTexto(c, [...partes, l.intencao === 'preco' ? PRECO : DUVIDA, pergunta(proximoPasso(c, n), c)].join('\n\n'))
      await salvaJson(c, 'estado', { passo: proximoPasso(c, n) })
      return { ok: true, passo: proximoPasso(c, n), [l.intencao]: true }
    }
    if (passo === 'hora' && l.campos?.hora == null) { await mandaTexto(c, 'Me diz só a hora que fica melhor amanhã: 10h ou 15h?'); return { ok: true, passo } }
  }
  if (c.etapa === 'quero_ver' && (texto || novas.fotos || novas.videos || novas.logo) && !intro) await salva(c, { etapa: 'coletando' })
  n = await contaMidias(c)
  passo = proximoPasso(c, n)
  // a resposta
  if (passo === 'feito') return fechaColeta(c, partes)
  const recebi = novas.fotos || novas.videos || novas.logo
    ? `Recebi ${[novas.fotos ? `${novas.fotos} foto${novas.fotos > 1 ? 's' : ''}` : '', novas.videos ? `${novas.videos} vídeo${novas.videos > 1 ? 's' : ''}` : '', novas.logo ? 'a logo' : ''].filter(Boolean).join(' e ')}.`
    : ''
  let msg: string
  if (passo === 'fotos' && antes === 'fotos' && (novas.fotos || novas.videos || novas.logo)) msg = `${recebi} ${n.fotos < 3 ? `Manda mais ${3 - n.fotos} foto${3 - n.fotos > 1 ? 's' : ''} que já dá.` : ''}`.trim()
  else if (passo === antes && !texto && (novas.fotos || novas.videos || novas.logo)) msg = `${recebi} Já guardei.\n\n${pergunta(passo, c)}`
  else if (passo === antes && texto) msg = pergunta(passo, c)   // a resposta não serviu: pergunta de novo
  else msg = [recebi || (texto && !intro ? OKS[(c.estado?.oks || 0) % OKS.length] : ''), pergunta(passo, c)].filter(Boolean).join(' ')
  if (passo === 'video' && (novas.fotos || novas.videos) && antes === 'fotos') msg = PEDE_VIDEO
  await mandaTexto(c, [...partes, msg].join('\n\n'))
  await salvaJson(c, 'estado', { passo, oks: (c.estado?.oks || 0) + 1 })
  return { ok: true, passo }
}

async function fechaColeta(c: any, partes: string[]) {
  const dia = diaDaEntrega()
  const entrega = instanteBR(dia, c.coleta.hora)
  await salva(c, { etapa: avanca(c.etapa, 'material_recebido'), entrega_em: entrega })
  await salvaJson(c, 'estado', { passo: 'feito', coleta_fim_em: new Date().toISOString() })
  await mandaTexto(c, [...partes, `Combinado! ${cap(quandoFalado(entrega))} eu te mando aqui a tua amostra: 2 anúncios e 1 vídeo feitos com as tuas fotos${diagLigado() ? ', e um raio-x dos teus anúncios e do teu Instagram' : ''}. Até lá!`].join('\n\n'))
  await evento('lanc_material', { contato: c.id })
  const n = await contaMidias(c)
  await avisaGuto('material novo', `${rotulo(c)} mandou ${n.fotos} foto(s) e ${n.videos} vídeo(s). Entrega combinada: ${quandoFalado(entrega)}. Tela: /maia/operacao/lancamento.html`)
  // 16/11: o raio-x do negócio sai sozinho aqui (se falhar, a rotina de hora em hora tenta de novo, e a equipe tem o botão)
  if (diagLigado()) { try { await geraDiagnostico(c, { por: 'auto' }) } catch (e: any) { await evento('lanc_diag_erro', { contato: c.id, erro: String(e?.message || e).slice(0, 200) }) } }
  return { ok: true, passo: 'feito', entrega_em: entrega }
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

async function aguardando(c: any, texto: string, novas: Novas) {
  const quando = c.entrega_em ? quandoFalado(c.entrega_em) : 'amanhã'
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
  await mandaTexto(c, `Anotado! A tua amostra chega ${quando}.`)
  return { ok: true }
}

// ---------- 4. o modo teste ao vivo ----------
export const TEXTO_TESTE = (neg: string) => `Quero testar a Maia como cliente da ${neg} (modo teste)`
async function entraTeste(c: any) {
  if (!c.coleta?.negocio) {
    await mandaTexto(c, 'O teste fica pronto junto com a tua amostra: primeiro eu preciso conhecer o teu negócio. ' + pergunta(proximoPasso(c, await contaMidias(c)), c))
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
  resposta = await respostaTeste(c, hist, texto)
  await mandaTexto(c, resposta)
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
