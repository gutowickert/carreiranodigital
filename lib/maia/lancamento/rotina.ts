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

const H = 3600e3, D = 24 * H
export const RETOMADA = [20 * H, 3 * D, 6 * D]

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
  for (const c of todos) {
    const fase: 'coleta' | 'amostra' | null = ['quero_ver', 'coletando'].includes(c.etapa) ? 'coleta' : (c.etapa === 'amostra_entregue' && !c.testou_em) ? 'amostra' : null
    if (!fase || c.estado?.modo === 'teste') continue
    if (!c.ultima_saida_em || (c.ultima_entrada_em && c.ultima_entrada_em > c.ultima_saida_em)) continue   // a vez é nossa só se a última foi nossa
    const r = c.estado?.retomada || {}
    // a contagem recomeça quando a fase muda ou quando a pessoa respondeu depois da última retomada
    const n = r.fase === fase && (!c.ultima_entrada_em || c.ultima_entrada_em < r.ultima_em) ? r.n || 0 : 0
    // 20 h, 3 dias e 6 dias contam do momento em que a pessoa parou (a nossa última mensagem antes da 1ª retomada)
    const base = n > 0 && r.base ? Date.parse(r.base) : Date.parse(fase === 'amostra' ? (c.entregue_em || c.ultima_saida_em) : c.ultima_saida_em)
    if (n >= 3 || t - base < RETOMADA[n]) continue
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
    if (janelaAberta(c, 2, agora.getTime())) await saiTeste(c, true); else await salvaJson(c, 'estado', { modo: null })
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
  try { r.entregas = await entregasAgendadas(agora) } catch (e: any) { r.entregas_erro = e.message }
  try { r.testes = await testesParados(agora) } catch (e: any) { r.testes_erro = e.message }
  try { r.retomadas = await retomadas(agora) } catch (e: any) { r.retomadas_erro = e.message }
  try { r.disparados = await marcaDisparados() } catch (e: any) { r.disparados_erro = e.message }
  return r
}
export { janelaAte }
