// Maia, lançamento (16/11/2026): a ENTREGA NOVA e o ACOMPANHAMENTO depois da amostra. Só roda com MAIA_LANC_ENTREGA_V2=1
// (desligada, a entrega e as retomadas seguem como antes, em amostra.ts e rotina.ts).
//
// 1. A entrega dentro do WhatsApp: o anúncio 1 e o 2 como imagem, o vídeo como vídeo (se tiver), a frase da principal
//    oportunidade com o botão "Testar agora" (liga o modo teste ali mesmo) e, por último, o link da página.
//    Fora das 24 h: o modelo de entrega (MAIA_LANC_MODELO_ENTREGA) e o resto vai quando a pessoa responder.
// 2. O acompanhamento (a rotina de hora em hora, das 8h às 21h), só pra quem recebeu a entrega nova:
//    - saiu do teste: a Maia pergunta na hora o que a pessoa achou (a resposta vai pro time)
//    - entregue e não abriu em 3 h: reenvia o anúncio 1 ("Fiz esse pra ti. Quer ver o resto e testar?")
//    - 20 h depois do áudio do Rick, sem resposta: "O que achou da amostra?" com 2 botões
//    - no dia seguinte, sem resposta e QUENTE (abriu 2+ vezes ou testou): fila "Rick: ligar"
//    - 3 dias: uma ideia nova pro negócio, sem cobrar; 6 dias: a despedida, e para
//    Qualquer resposta da pessoa interrompe a sequência e vai pro time. "Agora não" e "sair" param tudo.
//    Fora das 24 h: os modelos (MAIA_LANC_MODELO_REENVIO, _POS_AUDIO, _IDEIA, _DESPEDIDA); sem modelo, vai pra
//    fila "Retomada à mão" com o texto pronto.
import { maiaDb as db, maiaLocal } from '../db'
import {
  contato as acha, salva, salvaJson, mandaTexto, mandaMidia, mandaModelo, mandaBotoes, janelaAberta, garanteToken, avanca, evento,
  primeiroNome, horaBR, diaBR, avisaGuto, entregaV2,
} from './base'
import { marcaRick, registraDuvida, rotulo, DUVIDA } from './conversa'
import { linkAmostra, marcaEntregue } from './amostra'
import { fraseEntrega, nomeDoNegocio, ideiaNova, textoDespedida, PERGUNTA_TESTE, REENVIO, POS_AUDIO, LINK_FINAL } from './conteudo'
import { lePosEntrega, ehQueroVer } from './interpreta'

const H = 3600e3, D = 24 * H
const PAUSA_MS = () => (maiaLocal() ? 0 : Math.max(0, +(process.env.MAIA_LANC_PAUSA_MS || 1500)))
const pausa = () => (PAUSA_MS() ? new Promise(r => setTimeout(r, PAUSA_MS())) : Promise.resolve())
const sem = (s: string) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
const ehVideo = (p: any) => /^video/.test(p?.mime || '') || /\.(mp4|mov)$/i.test(p?.path || '')
// a sequência nova só vale pra quem recebeu a entrega nova (quem recebeu antes segue nas retomadas de antes)
export const naSequencia = (c: any) => entregaV2() && !!c.amostra?.entrega_v2
export const BOTAO_TESTE = { id: 'lanc_testar', titulo: 'Testar agora' }
export const BOTOES_POS_AUDIO = [{ id: 'lanc_conversar', titulo: 'Quero conversar' }, { id: 'lanc_duvida', titulo: 'Ficou dúvida' }]

const saudacao = (d = new Date()) => { const h = horaBR(d); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite' }

// ---------- 1. a entrega ----------
// as peças: anúncio 1, anúncio 2 e o vídeo (se tiver). Só o anúncio 1 é obrigatório sair.
async function mandaPecas(c: any, legenda1: string) {
  const p = c.amostra?.pecas || {}
  const legendas: Record<string, string> = { anuncio1: legenda1, anuncio2: 'E esse é o anúncio 2.', video: 'E o vídeo.' }
  let enviadas = 0
  for (const slot of ['anuncio1', 'anuncio2', 'video']) {
    const x = p[slot]
    if (!x?.path) continue
    const link = await db.link(x.path, 60 * 60 * 24 * 7)
    if (!link) { if (slot === 'anuncio1') return { ok: false, erro: 'sem link do anúncio 1' }; continue }
    const r = await mandaMidia(c, ehVideo(x) ? 'video' : 'image', link, legendas[slot], x.mime || (ehVideo(x) ? 'video/mp4' : 'image/jpeg'), x.path)
    if (!r.ok && slot === 'anuncio1') return { ok: false, erro: r.error || 'o WhatsApp recusou o anúncio 1' }
    if (r.ok) enviadas++
    await pausa()
  }
  return { ok: true, enviadas }
}
// a frase da oportunidade com o botão "Testar agora" e, por último, o link da página
async function mandaTesteELink(c: any, frase = true) {
  const corpo = `${frase ? fraseEntrega(c) + '\n\n' : ''}Quer ver como eu atenderia um cliente teu? Toca em "Testar agora" e me manda uma pergunta como se fosse cliente.`
  await mandaBotoes(c, corpo, [BOTAO_TESTE])
  await pausa()
  return mandaTexto(c, LINK_FINAL(linkAmostra(c)))
}

export async function entregaNova(c: any) {
  const atual = (await acha(c.id)) || c
  if (atual.entregue_em) return { ok: true, ja: true }
  await garanteToken(atual)
  const nome = primeiroNome(atual.nome), neg = nomeDoNegocio(atual)
  if (janelaAberta(atual, 5)) {
    const r = await mandaPecas(atual, `${saudacao()}${nome ? ', ' + nome : ''}! A tua amostra ficou pronta. Esse é o anúncio 1 que eu fiz pra ${neg}, com as tuas fotos.`)
    if (!r.ok) {
      await salvaJson(atual, 'amostra', { falha: String(r.erro || 'erro').slice(0, 200) })
      await avisaGuto('amostra não saiu', `${rotulo(atual)}: o WhatsApp recusou o anúncio 1. Vê na tela do lançamento.`, true)
      return { ok: false, erro: r.erro }
    }
    const l = await mandaTesteELink(atual)
    if (!l.ok) { await salvaJson(atual, 'amostra', { falha: 'as peças saíram, mas o link não: ' + String(l.error || '').slice(0, 150) }); await avisaGuto('link da amostra não saiu', `${rotulo(atual)}: as peças saíram, mas o link não. Manda o link à mão pela caixa de Disparos.`, true) }
    await salvaJson(atual, 'amostra', { entrega_v2: true, falta_resto: false })
    return marcaEntregue(atual, 'whatsapp')
  }
  const modelo = process.env.MAIA_LANC_MODELO_ENTREGA
  if (!modelo) {
    await salvaJson(atual, 'amostra', { falha: 'janela de 24 h fechada e sem modelo de entrega (MAIA_LANC_MODELO_ENTREGA)' })
    await avisaGuto('amostra parada', `${rotulo(atual)}: a janela de 24 h fechou e não tem modelo de entrega aprovado. Manda à mão pela caixa de Disparos.`, true)
    return { ok: false, erro: 'janela fechada e sem modelo' }
  }
  const comBotao = process.env.MAIA_LANC_MODELO_ENTREGA_BOTAO === '1'
  const r = await mandaModelo(atual, modelo, [nome || 'tudo bem'], `amostra pronta ${linkAmostra(atual)}`, comBotao ? atual.token : null)
  if (!r.ok) { await salvaJson(atual, 'amostra', { falha: String(r.error || 'erro').slice(0, 200) }); await avisaGuto('amostra não saiu', `${rotulo(atual)}: o modelo foi recusado.`, true); return { ok: false, erro: r.error } }
  // as peças, o botão e o link vão quando a pessoa responder (aí a janela abre)
  await salvaJson(atual, 'amostra', { entrega_v2: true, falta_resto: true })
  return marcaEntregue(atual, 'modelo')
}

// a pessoa respondeu ao modelo (a janela abriu): manda as peças, o botão e o link
export async function mandaResto(c: any) {
  await salvaJson(c, 'amostra', { falta_resto: false })
  const nome = primeiroNome(c.nome)
  await mandaPecas(c, `${nome ? nome + ', e' : 'E'}sse é o anúncio 1 que eu fiz pra ${nomeDoNegocio(c)}, com as tuas fotos.`)
  await mandaTesteELink(c)
  await evento('lanc_resto', { contato: c.id })
  return { ok: true, resto: true }
}

// ---------- o que a pessoa fez (pro cartão do Rick e a fila "Rick: ligar") ----------
export const quente = (c: any) => (c.aberturas || 0) >= 2 || !!c.testou_em
export function atividade(c: any) {
  const ps: string[] = c.estado?.teste_perguntas || []
  const n = c.aberturas || 0
  return {
    aberturas: n, testou: !!c.testou_em, perguntas: ps.slice(-6),
    texto: [n ? `abriu ${n} ${n > 1 ? 'vezes' : 'vez'}` : 'não abriu', c.testou_em ? 'testou' : 'não testou', ps.length ? `perguntou no teste: ${ps.slice(-3).map(q => `"${q.slice(0, 80)}"`).join(', ')}` : ''].filter(Boolean).join(' · '),
  }
}

// ---------- 2. o que a pessoa responde depois da entrega nova: interrompe a sequência e vai pro time ----------
export async function posEntregaNova(c: any, texto: string) {
  if (!texto) return { ok: true }
  const s = sem(texto)
  const a = c.estado?.acomp || {}
  // 16/11 (Nando, Cristina Grossi): depois do "Valeu! Vou passar pro time", cada nova mensagem recebia o mesmo texto de novo
  const jaPassou = !!a.passou_time_em
  await salvaJson(c, 'estado', { acomp: { ...a, parado: true, respondeu_em: new Date().toISOString(), esperando: null }, rick_texto: texto.slice(0, 400) })
  if (/quero conversar|gostei,? quero|colocar (a maia )?rodando|quero colocar/.test(s)) {
    await salva(c, { etapa: avanca(c.etapa, 'fechamento') })
    await mandaTexto(c, 'Que bom! Vou chamar o time da escola pra conversar contigo. Já já alguém te chama aqui, tá?')
    await marcaRick(c, 'quer conversar', true)
    return { ok: true, depois: 'quer_conversar' }
  }
  if (/^ficou (uma )?duvida[!. ]*$/.test(s)) {
    await mandaTexto(c, 'Me conta qual é a dúvida? O time da escola te responde aqui mesmo.')
    await marcaRick(c, 'ficou com dúvida depois da amostra')
    return { ok: true, depois: 'ficou_duvida' }
  }
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
  if (a.esperando === 'opiniao_teste') {
    await mandaTexto(c, 'Valeu por me contar! Vou passar pro time da escola, que já te chama aqui.')
    await marcaRick(c, 'contou o que achou do teste')
    return { ok: true, depois: 'opiniao_teste' }
  }
  if (ehQueroVer(texto) || /\b(resto|link|ver tudo|testar)\b/.test(s)) {
    await mandaTesteELink(c, false)
    await marcaRick(c, 'respondeu depois da amostra')
    return { ok: true, depois: 'quer_ver' }
  }
  if (jaPassou) {
    // já avisou que o time vem: fica quieta; o time fica sabendo do que chegou (no máximo 1 aviso a cada 30 min)
    if (!(await marcaRick(c, 'mandou mais mensagens depois da amostra')) && Date.now() - Date.parse(a.aviso_de_novo_em || 0) > 30 * 60e3) {
      await avisaGuto('Rick: respondeu de novo', `${rotulo(c)} mandou mais: "${texto.slice(0, 160)}". Responde pela caixa do CRM.`)
      await salvaJson(c, 'estado', { acomp: { ...(((await acha(c.id)) || c).estado?.acomp || {}), aviso_de_novo_em: new Date().toISOString() } })
    }
    return { ok: true, depois: q, quieta: true }
  }
  if (!c.testou_em) await mandaBotoes(c, 'Valeu! Vou passar pro time da escola, que já te chama aqui. Enquanto isso, se quiser ver como eu atenderia um cliente teu, toca em "Testar agora".', [BOTAO_TESTE])
  else await mandaTexto(c, 'Valeu! Vou passar pro time da escola, que já te chama aqui.')
  await salvaJson(c, 'estado', { acomp: { ...(((await acha(c.id)) || c).estado?.acomp || {}), passou_time_em: new Date().toISOString() } })
  await marcaRick(c, 'respondeu depois da amostra')
  return { ok: true, depois: q }
}

// ---------- 3. o acompanhamento (a rotina, das 8h às 21h) ----------
type Modelo = { nome?: string; params: string[]; imagem?: string | null }
async function envia(c: any, t: number, passo: string, texto: string, modelo: Modelo, comoJanela: () => Promise<any>) {
  if (janelaAberta(c, 10, t)) { await comoJanela(); return 'texto' }
  if (modelo.nome) { await mandaModelo(c, modelo.nome, modelo.params, texto, null, modelo.imagem || null); return 'modelo' }
  await salvaJson(c, 'estado', { retomada: { fase: 'acomp', passo, n: 1, como: 'a_mao', texto, ultima_em: new Date(t).toISOString() } })
  return 'a_mao'
}

export async function acompanhamento(agora = new Date()) {
  const h = horaBR(agora)
  if (!entregaV2() || h < 8 || h >= 21) return []
  const t = agora.getTime(), iso = new Date(t).toISOString(), feitos: any[] = []
  for (const c of await db.lista('lanc_contatos')) {
    if (!['amostra_entregue', 'testou'].includes(c.etapa) || !c.entregue_em || !naSequencia(c)) continue
    if (c.estado?.humano) continue   // 16/11: com o time, sem acompanhamento automático
    if (c.estado?.time_em && t - Date.parse(c.estado.time_em) < 24 * 3600e3) continue   // 16/11: o time falou nas últimas 24 h
    if (c.estado?.modo === 'teste' && Date.parse(c.estado.teste_ate || 0) > t) continue
    const a = c.estado?.acomp || {}
    if (a.parado || a.fim) continue
    const ent = Date.parse(c.entregue_em), nome = primeiroNome(c.nome) || 'tudo bem'
    const marca = async (parte: any, passo: string, como: string) => {
      await salvaJson(c, 'estado', { acomp: { ...a, ...parte } })
      await evento('lanc_acomp', { contato: c.id, passo, como })
      feitos.push({ contato: c.id, passo, como })
    }
    try {
      // 0. saiu do teste de noite: a pergunta vai de manhã (só dentro da janela)
      if (a.perguntar_teste && !a.perguntou_teste_em) {
        if (janelaAberta(c, 10, t)) { await mandaTexto(c, `${primeiroNome(c.nome) ? 'Oi, ' + primeiroNome(c.nome) + '! ' : ''}${PERGUNTA_TESTE}`); await marca({ perguntar_teste: false, perguntou_teste_em: iso, esperando: 'opiniao_teste' }, 'pergunta_teste', 'texto') }
        else await marca({ perguntar_teste: false }, 'pergunta_teste', 'pulado')
        continue
      }
      // 1. entregue e não abriu em 3 h: reenvia o anúncio 1
      const a1 = c.amostra?.pecas?.anuncio1
      if (!c.aberta_em && !c.testou_em && !a.reenvio_em && t - ent >= 3 * H && a1?.path) {
        const link = await db.link(a1.path, 60 * 60 * 24 * 7)
        const como = await envia(c, t, 'reenvio', REENVIO, { nome: process.env.MAIA_LANC_MODELO_REENVIO, params: [nome], imagem: link },
          () => mandaMidia(c, ehVideo(a1) ? 'video' : 'image', link || '', REENVIO, a1.mime || 'image/jpeg', a1.path))
        if (como === 'modelo') await salvaJson(c, 'amostra', { falta_resto: true })
        await marca({ reenvio_em: iso }, 'reenvio', como)
        continue
      }
      // 2. 20 h depois do áudio do Rick (marcado como feito), sem resposta: "O que achou da amostra?" com 2 botões
      if (c.rick_feito_em && !a.pos_audio_em && t - Date.parse(c.rick_feito_em) >= 20 * H) {
        const como = await envia(c, t, 'pos_audio', `${POS_AUDIO} (botões: Gostei, quero conversar | Ficou dúvida)`, { nome: process.env.MAIA_LANC_MODELO_POS_AUDIO, params: [nome] },
          () => mandaBotoes(c, POS_AUDIO, BOTOES_POS_AUDIO))
        await marca({ pos_audio_em: iso }, 'pos_audio', como)
        continue
      }
      // 3. no dia seguinte, sem resposta e quente: fila "Rick: ligar" (com o telefone e o resumo do que fez, na tela da equipe)
      if (a.pos_audio_em && !a.ligar && diaBR(agora) > diaBR(new Date(a.pos_audio_em)) && quente(c)) {
        await marca({ ligar: { em: iso, resumo: atividade(c).texto } }, 'ligar', 'fila')
        await avisaGuto('Rick: ligar', `${rotulo(c)} não respondeu depois do áudio, mas está quente. Está na fila "Rick: ligar" da tela do lançamento.`)
        continue
      }
      // 4. 3 dias sem resposta: uma ideia nova pro negócio, sem cobrar
      if (!a.ideia_em && t - ent >= 3 * D) {
        const { ideia, texto } = ideiaNova(c)
        const como = await envia(c, t, 'ideia', texto, { nome: process.env.MAIA_LANC_MODELO_IDEIA, params: [nome, nomeDoNegocio(c), ideia.replace(/\s+/g, ' ').slice(0, 500)] }, () => mandaTexto(c, texto))
        await marca({ ideia_em: iso }, 'ideia', como)
        continue
      }
      // 5. 6 dias: a despedida, e para
      if (a.ideia_em && !a.despedida_em && t - ent >= 6 * D) {
        const texto = textoDespedida(c, linkAmostra(c))
        const como = await envia(c, t, 'despedida', texto, { nome: process.env.MAIA_LANC_MODELO_DESPEDIDA, params: [nome] }, () => mandaTexto(c, texto))
        await marca({ despedida_em: iso, fim: true }, 'despedida', como)
        continue
      }
    } catch (e: any) { feitos.push({ contato: c.id, erro: String(e?.message || e).slice(0, 200) }) }
  }
  return feitos
}
