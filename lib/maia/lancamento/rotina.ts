// Maia, lançamento: o que roda de hora em hora (lib/maia/rotina.ts chama, só com MAIA_LANCAMENTO_LIGADO=1).
//   1. entrega as amostras aprovadas na hora combinada (ou antes, se a janela de 24 h vai fechar antes)
//   2. fecha o modo teste parado há mais de 30 min
//   3. as retomadas no jeito do Guto: ~20 h (texto, dentro das 24 h), 3 dias e 6 dias (modelo aprovado; a de 6 dias se despede)
//      pra quem parou no meio da coleta ou recebeu a amostra e sumiu. Das 8h às 21h. Sem o modelo configurado, a de 3 e a
//      de 6 dias ficam pra equipe fazer à mão (o painel mostra "retomada à mão")
//   4. marca "Disparado" quem recebeu o modelo de abertura (lê os envios dos disparos do CRM)
import { maiaDb as db, maiaLocal } from '../db'
import { salva, salvaJson, mandaTexto, mandaModelo, janelaAberta, janelaAte, horaBR, primeiroNome, evento, variantes } from './base'
import { proximoPasso, contaMidias, PERGUNTAS, PEDE_FOTOS, PEDE_VIDEO, perguntaHora, saiTeste } from './conversa'
import { entrega, horaDeEntregar, linkAmostra, nomeNeg } from './amostra'
import { acompanhamento, naSequencia } from './entrega'

const H = 3600e3, D = 24 * H
export const RETOMADA = [20 * H, 3 * D, 6 * D]
// 16/11 (Nando): na COLETA (tocou em "Quero ver" e parou, ex.: sem mandar as fotos) a 1ª retomada é 1 h depois; a 2ª em 20 h
// (ainda dentro da janela de 24 h) e a despedida em 6 dias
export const RETOMADA_COLETA = [1 * H, 20 * H, 6 * D]
// 16/11 (Nando): quem só mandou a saudação automática do WhatsApp (não viu o disparo ainda): UMA mensagem 1 h depois, dentro da
// janela de 24 h que a própria saudação abriu, das 8h às 20h. Se responder, segue o caminho normal; se o robô responder, a Maia ignora
export const SEGUE_AUTO = 'Oi! Aqui é a Maia, a IA de marketing da Carreira no Digital. Te mandei há pouco a ideia de fazer uma amostra grátis pro teu negócio: 2 anúncios e 1 vídeo com as tuas fotos, prontos em até 24 horas. Quer ver? É só responder "quero ver".'
export async function segueAutoResposta(agora = new Date()) {
  const h = horaBR(agora)
  if (h < 8 || h >= 20) return []
  const t = agora.getTime(), feitos: any[] = []
  for (const c of await db.lista('lanc_contatos')) {
    if (!['na_lista', 'disparado'].includes(c.etapa)) continue
    const a = c.estado?.auto_resposta
    if (!a?.em || c.estado?.auto_segue || c.estado?.humano) continue
    if (c.estado?.time_em) continue
    if (t - Date.parse(a.em) < H || !janelaAberta(c, 10, t)) continue
    await mandaTexto(c, SEGUE_AUTO)
    await salvaJson(c, 'estado', { auto_segue: { em: new Date(t).toISOString() } })
    await evento('lanc_segue_auto', { contato: c.id })
    feitos.push(c.id)
  }
  return feitos
}

function perguntaPendente(p: string) {
  return p === 'fotos' ? PEDE_FOTOS : p === 'video' ? PEDE_VIDEO : p === 'hora' ? perguntaHora() : (PERGUNTAS as any)[p] || ''
}
export function textoRetomada(c: any, n: number, fase: 'coleta' | 'amostra', pendente = '') {
  const oi = primeiroNome(c.nome) ? `Oi, ${primeiroNome(c.nome)}!` : 'Oi!'
  if (fase === 'coleta') {
    if (n === 0) return `${oi} Ficou faltando pouco pra eu fazer a tua amostra grátis. ${pendente}`.trim()
    if (n === 1) return `${oi} Aqui é a Maia de novo. A tua amostra grátis está quase pronta pra começar: falta só um pouquinho de informação. Quer seguir?`
    return `${oi} Tentei falar contigo, entendo a correria. Vou parar por aqui, mas a tua amostra grátis continua guardada: quando quiser, é só me chamar.`
  }
  if (n === 0) return `${oi} Conseguiu olhar a amostra que eu fiz pra ${nomeNeg(c)}? ${linkAmostra(c)}\n\nSe quiser, me manda uma pergunta como se fosse um cliente teu, que eu respondo como atendente do teu negócio. É só escrever "modo teste".`
  if (n === 1) return `${oi} A tua amostra continua no link, com os 2 anúncios e o vídeo. Quer ver como eu atenderia um cliente teu?`
  return `${oi} Tentei falar contigo, entendo a correria. A amostra ficou top e continua no link. Vou parar por aqui e fico à disposição.`
}

export async function retomadas(agora = new Date()) {
  const h = horaBR(agora)
  if (h < 8 || h >= 21) return []
  const t = agora.getTime(), feitos: any[] = []
  const todos = await db.lista('lanc_contatos')
  // 16/11 (sem a pergunta da hora): quem parou na hora já mandou tudo: fecha a coleta ("em até 24 horas"), dentro da janela
  const { fechaColeta } = await import('./conversa')
  for (const c of todos) {
    if (!['quero_ver', 'coletando'].includes(c.etapa) || c.estado?.humano || c.estado?.modo === 'teste') continue
    if (c.estado?.time_em) continue
    if (proximoPasso(c, await contaMidias(c)) !== 'feito' || !janelaAberta(c, 10, t)) continue
    try { await fechaColeta(c); c.etapa = 'material_recebido'; feitos.push({ contato: c.id, fechou: true }) } catch { /* segue */ }
  }
  for (const c of todos) {
    if (c.estado?.humano) continue   // 16/11: com o time, sem retomada
    if (c.estado?.time_em) continue   // 16/11: o time está com a pessoa (até "Devolver pra Maia")
    const fase: 'coleta' | 'amostra' | null = ['quero_ver', 'coletando'].includes(c.etapa) ? 'coleta' : (c.etapa === 'amostra_entregue' && !c.testou_em) ? 'amostra' : null
    if (!fase || c.estado?.modo === 'teste') continue
    // 16/11: quem recebeu a entrega nova está no acompanhamento (entrega.ts), não nesta retomada
    if (fase === 'amostra' && naSequencia(c)) continue
    if (!c.ultima_saida_em || (c.ultima_entrada_em && c.ultima_entrada_em > c.ultima_saida_em)) continue   // a vez é nossa só se a última foi nossa
    const r = c.estado?.retomada || {}
    // a contagem recomeça quando a fase muda ou quando a pessoa respondeu depois da última retomada
    const n = r.fase === fase && (!c.ultima_entrada_em || c.ultima_entrada_em < r.ultima_em) ? r.n || 0 : 0
    // 20 h, 3 dias e 6 dias contam do momento em que a pessoa parou (a nossa última mensagem antes da 1ª retomada)
    const base = n > 0 && r.base ? Date.parse(r.base) : Date.parse(fase === 'amostra' ? (c.entregue_em || c.ultima_saida_em) : c.ultima_saida_em)
    if (n >= 3 || t - base < (fase === 'coleta' ? RETOMADA_COLETA : RETOMADA)[n]) continue
    // 16/11: no mínimo 3 h entre uma retomada e a próxima (se a 1ª saiu atrasada, a 2ª não vem colada)
    if (n > 0 && r.ultima_em && t - Date.parse(r.ultima_em) < 3 * H) continue
    let pendente = ''
    if (fase === 'coleta') pendente = perguntaPendente(proximoPasso(c, await contaMidias(c)))
    const texto = textoRetomada(c, n, fase, pendente)
    let como = ''
    if (janelaAberta(c, 10, t)) { await mandaTexto(c, texto); como = 'texto' }
    else {
      const modelo = n >= 2 ? process.env.MAIA_LANC_MODELO_DESPEDIDA : process.env.MAIA_LANC_MODELO_RETOMADA
      if (modelo) { await mandaModelo(c, modelo, [primeiroNome(c.nome) || 'tudo bem'], texto); como = 'modelo' }
      else como = 'a_mao'
    }
    await salvaJson(c, 'estado', { retomada: { fase, n: n + 1, base: new Date(base).toISOString(), ultima_em: new Date(t).toISOString(), como, texto: como === 'a_mao' ? texto : null } })
    await evento('lanc_retomada', { contato: c.id, fase, n: n + 1, como })
    feitos.push({ contato: c.id, fase, n: n + 1, como })
  }
  return feitos
}

export async function entregasAgendadas(agora = new Date()) {
  const feitos: any[] = []
  for (const c of await db.lista('lanc_contatos')) {
    if (!horaDeEntregar(c, agora.getTime())) continue
    try { feitos.push({ contato: c.id, ...(await entrega(c)) }) } catch (e: any) { feitos.push({ contato: c.id, erro: String(e?.message || e) }) }
  }
  return feitos
}

export async function testesParados(agora = new Date()) {
  const feitos: string[] = []
  for (const c of await db.lista('lanc_contatos')) {
    if (c.estado?.modo !== 'teste' || Date.parse(c.estado.teste_ate || 0) > agora.getTime()) continue
    const h = horaBR(agora)
    // 16/11 (entrega nova): de noite (fora das 8h às 21h) sai calado; a pergunta "o que tu achou" vai de manhã pelo acompanhamento
    if (naSequencia(c) && c.testou_em && ['amostra_entregue', 'testou'].includes(c.etapa) && (h < 8 || h >= 21)) await salvaJson(c, 'estado', { modo: null, teste_ate: null, acomp: { ...(c.estado?.acomp || {}), perguntar_teste: true } })
    else if (janelaAberta(c, 2, agora.getTime())) await saiTeste(c, true); else await salvaJson(c, 'estado', { modo: null })
    feitos.push(c.id)
  }
  return feitos
}

// quem recebeu o modelo de abertura vira "Disparado" (os envios ficam no banco da escola: wa_disparo_envios)
export async function marcaDisparados() {
  if (maiaLocal()) return 0
  const lista = (await db.lista('lanc_contatos', { etapa: 'na_lista' }))
  if (!lista.length) return 0
  const { supabaseAdmin: sb } = await import('@/lib/supabase-admin')
  const desde = new Date(Date.now() - 3 * D).toISOString()
  const tels = new Map<string, any>()
  for (const c of lista) for (const v of variantes(c.telefone)) tels.set(v, c)
  let n = 0
  const chaves = [...tels.keys()]
  for (let i = 0; i < chaves.length; i += 200) {
    const { data } = await sb.from('wa_disparo_envios').select('telefone, enviado_em, status').in('telefone', chaves.slice(i, i + 200)).gte('enviado_em', desde).in('status', ['enviado', 'entregue', 'lido'])
    for (const e of data || []) {
      const c = tels.get(e.telefone)
      if (c && c.etapa === 'na_lista') { await salva(c, { etapa: 'disparado', disparado_em: e.enviado_em }); n++ }
    }
  }
  return n
}

export async function rotinaLancamento(agora = new Date()) {
  const r: any = {}
  // 17/11: quem a equipe devolveu com "responder" e ainda não foi respondido (a tela marca; a rotina garante)
  try {
    const { respondePendentes } = await import('./conversa')
    r.devolvidos = []
    for (const c of await db.lista('lanc_contatos')) if (c.estado?.responder_pendente && !c.estado?.time_em && !c.estado?.humano) {
      await salvaJson(c, 'estado', { responder_pendente: null })
      r.devolvidos.push({ contato: c.id, ...(await respondePendentes(c)) })
    }
  } catch (e: any) { r.devolvidos_erro = e.message }
  // 17/11: amostra de outro negócio marcada no banco (estado.nova_amostra_pendente = "empresa de energia solar"): a rotina faz
  try {
    const { novaAmostra } = await import('./conversa')
    for (const c of await db.lista('lanc_contatos')) if (c.estado?.nova_amostra_pendente) {
      const sobre = String(c.estado.nova_amostra_pendente)
      await salvaJson(c, 'estado', { nova_amostra_pendente: null })
      ;(r.novas_amostras ||= []).push({ contato: c.id, ...(await novaAmostra((await db.um('lanc_contatos', { id: c.id })) || c, sobre === 'true' ? '' : sobre)) })
    }
  } catch (e: any) { r.novas_amostras_erro = e.message }
  try { r.entregas = await entregasAgendadas(agora) } catch (e: any) { r.entregas_erro = e.message }
  try { r.testes = await testesParados(agora) } catch (e: any) { r.testes_erro = e.message }
  try { r.retomadas = await retomadas(agora) } catch (e: any) { r.retomadas_erro = e.message }
  try { r.segue_auto = await segueAutoResposta(agora) } catch (e: any) { r.segue_auto_erro = e.message }
  try { r.acompanhamento = await acompanhamento(agora) } catch (e: any) { r.acompanhamento_erro = e.message }
  try { r.disparados = await marcaDisparados() } catch (e: any) { r.disparados_erro = e.message }
  return r
}
export { janelaAte }
