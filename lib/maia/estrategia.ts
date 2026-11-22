// Maia: o CICLO DE ESTRATÉGIA DE 15 DIAS (22/11, pedido do Guto: "a estratégia tem que ser repensada a cada 15 dias. A Maia
// precisa levar em consideração a sazonalidade de cada período antes de propor estratégias").
//
// QUANDO (22/11, Guto: "15 dias após o dia que cada negócio ligou"): ativação + 15, +30, +45... às 9h no fuso do negócio
// (rotina.ts). A ativação fica em contexto.ativado_em. Negócio sem nenhuma estratégia ganha a INICIAL na primeira rodada (na
// implantação). Se a rotina perder o dia (fora do ar), propõe no dia seguinte.
// JUNTO COM O RELATÓRIO DO MÊS: revisão que cai até 3 dias antes do dia do relatório (dia 2, ou o 1º dia que o negócio abre)
// e a equipe aprova antes do relatório sair: não vai sozinha; vai pro dono na MESMA mensagem do relatório (aprovacao.ts). Se o
// relatório não sair até o dia seguinte ao dele, a estratégia sai sozinha. Nas outras datas vai sozinha, na hora que a equipe aprova.
// O QUE ELA FAZ (sem IA: nenhum número inventado, custo zero):
//   1) lê os números da quinzena que passou (gasto, conversas, custo por conversa, vendas, métrica secundária, os anúncios
//      rodando: a mesma decisão da análise de 2 dias, relatorios.ts);
//   2) consulta o CALENDÁRIO (sazonalidade.ts) dos próximos 15 a 45 dias, com as datas do ramo e as do próprio negócio;
//   3) propõe a estratégia da quinzena: estimular o que vende e já testar outra oferta, pausar o que não vende, trocar o produto
//      que entra primeiro, a verba (sempre dentro do teto), a campanha e o recado pra base da data que pesa, e os cuidados do ramo.
// CAMINHO (igual ao recado pra base): aprovar_equipe → (equipe aprova) → aprovar_dono → (👍 do dono no WhatsApp OU no painel)
//   → aprovada. A equipe pode editar o texto ou cancelar; o dono pode pedir ajuste (volta pra equipe). Nada vai pro dono sem a
//   equipe aprovar, mesmo no negócio com "equipe aprova tudo" desligado. Aprovada, a equipe aplica (verba, pausa, anúncio novo):
//   aqui nada mexe na Meta.
// HISTÓRICO: tabela maia_estrategias (db/maia-estrategia.sql). Cada linha guarda o que foi proposto, os números e as datas que
//   pesaram, quem aprovou e quando, e (quando a próxima nasce) o RESULTADO da quinzena dela.
// CHAVE: só roda com MAIA_ESTRATEGIA_LIGADA=1 (rotina, ferramentas do WhatsApp, painel). Sem o SQL: fica indisponível, o resto segue.
import { maiaDb as db, maiaLocal } from './db'
import { numeros } from './funil'
import { horaLocal, fusoDo } from './horario'
import { tetoVerba } from './limites'
import { datasDaVez, fraseDaData, ddmm, somaDias, diasEntre, iso as isoDe, SEM_RECADO_DE_VENDA, leDia, datasProprias, type DataDaVez } from './sazonalidade'

export const estrategiaLigada = () => process.env.MAIA_ESTRATEGIA_LIGADA === '1'
export const HORA = 9
export const TITULO = 'Estratégia da quinzena'
export const STATUS_NOME: Record<string, string> = { aprovar_equipe: 'equipe revisando', aprovar_dono: 'esperando o dono', aprovada: 'aprovada', substituida: 'substituída pela seguinte', cancelada: 'cancelada' }
const R$ = (v: number) => 'R$ ' + (Math.round(v * 100) / 100).toLocaleString('pt-BR', { minimumFractionDigits: Math.round(v * 100) % 100 ? 2 : 0, maximumFractionDigits: 2 })
const plural = (n: number, s: string, p = s + 's') => `${n} ${n === 1 ? s : p}`
const primeiro = (s: any) => String(s || '').split(' ')[0] || ''

// ─────────────── a tabela existe? (sem o SQL, a função fica indisponível; o resto da Maia segue)
export const INDISPONIVEL = 'A estratégia de 15 dias ainda não está ligada: falta rodar o db/maia-estrategia.sql no banco.'
const faltaTabela = (e: any) => /does not exist|42P01|PGRST20\d|could not find the table|schema cache|banco 404/i.test(String(e?.message || e))
let temTabela = false, semTabelaAte = 0
export async function estrategiaDisponivel() {
  if (maiaLocal() || temTabela) return true
  if (Date.now() < semTabelaAte) return false
  try { await db.lista('estrategias', {}, { limite: 1, campos: 'id' }); temTabela = true; return true }
  catch (e) { if (faltaTabela(e)) { semTabelaAte = Date.now() + 10 * 60e3; return false } throw e }
}
async function exige() { if (!(await estrategiaDisponivel())) throw new Error(INDISPONIVEL) }

// ─────────────── o ciclo (puro). 22/11 (Guto): "15 dias após o dia que cada negócio ligou": revisa na ativação + 15, +30, +45...
// `ativacao` = AAAA-MM-DD em que o negócio ficou ativo. Sem ativação (ainda em implantação): a quinzena começa hoje (a inicial)
export const DIAS_DO_CICLO = 15
export function cicloDoDia(hoje: string, ativacao?: string | null) {
  if (!ativacao || hoje < ativacao) return { de: hoje, ate: somaDias(hoje, DIAS_DO_CICLO - 1) }
  const k = Math.floor(diasEntre(ativacao, hoje) / DIAS_DO_CICLO)
  const de = somaDias(ativacao, k * DIAS_DO_CICLO)
  return { de, ate: somaDias(de, DIAS_DO_CICLO - 1) }
}
export const cicloAnterior = (c: { de: string }) => ({ de: somaDias(c.de, -DIAS_DO_CICLO), ate: somaDias(c.de, -1) })
// dia de revisar: ativação + 15, +30... (o dia da ativação não: ali vale a inicial)
export const diaDeRevisar = (hoje: string, ativacao?: string | null) => !!ativacao && hoje > ativacao && diasEntre(ativacao, hoje) % DIAS_DO_CICLO === 0

// a data em que o negócio ficou ativo: contexto.ativado_em (meta.ts grava quando a 1ª campanha liga; a equipe grava quando muda o
// status pra ativo). Negócio que já era ativo antes disso: a 1ª campanha que ligou, senão o dia do cadastro (e fica gravado)
export async function dataDeAtivacao(neg: any): Promise<string | null> {
  const c = neg?.contexto || {}
  if (typeof c.ativado_em === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.ativado_em)) return c.ativado_em
  if (neg?.status !== 'ativo') return null
  const camps = (await db.lista('campanhas', { negocio_id: neg.id })).map(x => x.ativada_em).filter(Boolean).sort()
  const iso = camps[0] || neg.criado_em || new Date().toISOString()
  const dia = horaLocal(new Date(iso), fusoDo(neg)).data
  await marcaAtivacao(neg, dia)
  return dia
}
export async function marcaAtivacao(neg: any, dia?: string) {
  const n = (await db.um('negocios', { id: neg.id })) || neg
  if (n.contexto?.ativado_em) return n.contexto.ativado_em
  const d = dia || horaLocal(new Date(), fusoDo(n)).data
  await db.atualiza('negocios', { id: n.id }, { contexto: { ...(n.contexto || {}), ativado_em: d } })
  return d
}

// ─────────────── a proposta
export type Acao = { tipo: 'estimular' | 'pausar' | 'testar_oferta' | 'produto_entrada' | 'verba' | 'sazonal' | 'recado_base' | 'comecar'; texto: string; porque?: string; data?: string | null }

// os números da quinzena que passou (o mesmo jeito da análise de 2 dias) e a decisão dos anúncios
async function numerosDoPeriodo(neg: any, de: string, ate: string, agora: Date) {
  const deIso = new Date(de + 'T03:00:00Z').toISOString(), ateIso = new Date(Math.min(Date.parse(somaDias(ate, 1) + 'T03:00:00Z'), agora.getTime())).toISOString()
  const n = await numeros(neg.id, deIso, ateIso)
  let analise: any = null
  try { const R = await import('./relatorios'); analise = await R.dadosDaAnalise(neg, deIso, ateIso, agora, { semSazonal: true }) } catch { /* sem anúncio ou sem dados: segue só com os números */ }
  return {
    de, ate, gasto: n.gasto, conversas: analise?.conversas ?? n.conversas_meta ?? n.leads_novos, contatos: n.leads_novos, vendas: n.ganhos, receita: n.receita,
    custo_conversa: n.gasto > 0 && (analise?.conversas || n.leads_novos) ? Math.round(n.gasto / (analise?.conversas || n.leads_novos) * 100) / 100 : null,
    custo_venda: n.custo_por_venda, retorno: n.retorno,
    secundaria: analise?.secundaria ?? null, secundaria_nome: analise?.sec?.nome || null,
    vendas_historico: analise?.vendas_historico ?? null,
    decisao: analise?.decisao ? { conclusao: analise.decisao.conclusao, sugestoes: analise.decisao.sugestoes || [], em_teste: analise.decisao.em_teste || [] } : null,
  }
}

export function produtoDeEntrada(neg: any): string | null {
  const c = neg?.contexto || {}
  const v = c.estrategia?.produto_entrada || c.produto_entrada || c.mais_vendido || c.ficha?.mais_vendido || c.produto || c.ficha?.produto
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : null
}

// monta as ações (puro: os números, as datas e o negócio entram prontos; testado direto)
export function montaAcoes(neg: any, num: any | null, datas: ReturnType<typeof datasDaVez>, hoje: string, op: { recadoBase?: boolean } = {}): Acao[] {
  const acoes: Acao[] = []
  const teto = tetoVerba(neg), verba = Number(neg?.verba_dia) || null
  const produto = produtoDeEntrada(neg)
  const cpa = Number(neg?.contexto?.trafego?.cpa_meta) || null
  const sug = num?.decisao?.sugestoes || []
  // 1) o que os números mandam (a mesma regra da análise de 2 dias: estimula o que vende, pausa o que não vende, já testa outro)
  for (const s of sug) {
    if (s.tipo === 'estimular') acoes.push({ tipo: 'estimular', texto: s.texto, porque: s.motivo })
    else if (s.tipo === 'pausar') acoes.push({ tipo: 'pausar', texto: s.texto, porque: s.motivo })
    else if (s.tipo === 'testar') acoes.push({ tipo: 'testar_oferta', texto: s.texto, porque: s.motivo })
  }
  // oferta funcionando: estimula E já testa outra (toda oferta uma hora cansa)
  if (num && num.vendas > 0 && !acoes.some(a => a.tipo === 'testar_oferta'))
    acoes.push({ tipo: 'testar_oferta', texto: `manter o que está vendendo e já testar uma oferta nova com outro produto${produto ? ` (hoje entra primeiro: ${produto})` : ''}`, porque: `${plural(num.vendas, 'venda')} na quinzena: a oferta funciona, e toda oferta uma hora cansa` })
  // gastou e não vendeu nada: o produto que entra primeiro pode estar errado
  const gastouSemVender = num && num.gasto > 0 && num.vendas === 0 && !(num.vendas_historico > 0) && (cpa ? num.gasto >= 2 * cpa : num.conversas >= 10)
  if (gastouSemVender) acoes.push({ tipo: 'produto_entrada', texto: `rever o produto que entra primeiro${produto ? ` (hoje: ${produto})` : ''}: escolher um com bom potencial de venda, margem que pague o anúncio e diferencial, ou um produto parado no estoque pra girar rápido abaixo do mercado`, porque: `${R$(num.gasto)} investidos e nenhuma venda na quinzena` })
  if (num && !(num.gasto > 0)) acoes.push({ tipo: 'comecar', texto: `colocar o primeiro anúncio no ar${produto ? ` com o produto que entra primeiro (${produto})` : ''}`, porque: 'sem anúncio rodando não tem número pra decidir' })
  if (!num) acoes.push({ tipo: 'comecar', texto: `começar pelo produto que entra primeiro${produto ? ` (${produto})` : ''}: anúncio de prontidão pra quem já procura o que o negócio oferece`, porque: 'é a estratégia inicial: primeiro medir conversa e venda' })
  // 2) as datas que pesam na quinzena (no máximo 2: foco)
  const sem_venda = datas.grupos.some(g => SEM_RECADO_DE_VENDA.includes(g))
  for (const d of datas.pesam.slice(0, 2)) {
    const quando = d.inicio <= hoje ? 'já' : `a partir de ${ddmm(d.inicio)}`
    acoes.push({ tipo: 'sazonal', data: d.id, texto: `${d.nome}: ${d.dica}, no ar ${quando}${d.ate !== d.dia ? ` até ${ddmm(d.ate)}` : ` até ${ddmm(d.dia)}`}`, porque: d.porque })
    if (op.recadoBase && !sem_venda) acoes.push({ tipo: 'recado_base', data: d.id, texto: `recado pra base sobre ${d.nome} ${d.inicio <= hoje ? 'nesta semana' : `em ${ddmm(d.inicio)}`}`, porque: 'quem já comprou responde mais rápido e o custo é por mensagem' })
  }
  // 3) a verba: data forte na quinzena, oferta vendendo e verba abaixo do teto → sobe 30% durante a data (a equipe aprova antes)
  if (!acoes.some(a => a.tipo === 'estimular' && /verba/.test(a.texto)) && datas.pesam.length && num?.vendas > 0 && verba && verba < teto) {
    const para = Math.min(teto, Math.round(verba * 1.3))
    if (para > verba) acoes.push({ tipo: 'verba', data: datas.pesam[0].id, texto: `subir a verba de ${R$(verba)} pra ${R$(para)} por dia enquanto durar ${datas.pesam[0].nome} (dentro do teto de ${R$(teto)})`, porque: 'a data traz mais gente procurando, e a oferta já vende' })
  }
  return acoes
}

// o texto que vai pro dono (curto, de WhatsApp, só números do sistema)
export function textoDaProposta(neg: any, p: { ciclo: { de: string; ate: string }; motivo: string; num: any | null; datas: ReturnType<typeof datasDaVez>; acoes: Acao[]; hoje: string }) {
  const l: string[] = []
  const nome = primeiro(neg.dono_nome)
  l.push(`${p.motivo === 'inicial' ? 'Estratégia inicial' : TITULO} do ${neg.nome} (${ddmm(p.ciclo.de)} a ${ddmm(p.ciclo.ate)})${nome ? `, ${nome}` : ''}:`)
  const n = p.num
  if (n) {
    const partes = [n.gasto > 0 ? `investido ${R$(n.gasto)}` : 'sem anúncio rodando', `${plural(n.conversas || 0, 'conversa')}${n.custo_conversa != null ? ` (${R$(n.custo_conversa)} por conversa)` : ''}`,
      `${plural(n.vendas, 'venda')}${n.vendas ? ` somando ${R$(n.receita)}` : ''}`]
    if (n.secundaria != null && n.secundaria_nome) partes.push(`${n.secundaria} chegaram em "${n.secundaria_nome}"`)
    l.push(`Como foram os últimos 15 dias: ${partes.join(', ')}.`)
  }
  if (p.datas.pesam.length) { l.push('Datas que pesam agora:'); for (const d of p.datas.pesam.slice(0, 4)) l.push(`- ${fraseDaData(d, p.hoje)}`) }
  else l.push('Datas: nenhuma data forte do teu ramo nos próximos 15 dias.')
  if (p.datas.radar.length) l.push(`No radar: ${p.datas.radar.slice(0, 2).map(d => `${d.nome} (${ddmm(d.dia)}, anúncio a partir de ${ddmm(d.inicio)})`).join('; ')}.`)
  l.push('O que eu proponho:')
  p.acoes.forEach((a, i) => l.push(`${i + 1}. ${a.texto.charAt(0).toUpperCase() + a.texto.slice(1)}${a.porque ? ` (${a.porque})` : ''}.`))
  if (p.datas.cuidados.length) l.push(`Cuidados do teu ramo: ${p.datas.cuidados.join('; ')}.`)
  l.push('Topa seguir assim? Me dá um 👍, ou me diz o que mudar.')
  return l.join('\n')
}

async function existeBase(neg: any) {
  try { const R = await import('./recado'); if (!(await R.baseDisponivel())) return false; return (await R.baseDoNegocio(neg, 0)).ativos > 0 } catch { return false }
}

// ─────────────── propor (a rotina, a equipe ou a implantação chamam)
export async function propoeEstrategia(negArg: any, op: { agora?: Date; motivo?: 'inicial' | 'quinzena' | 'pedido'; por?: string; forcar?: boolean } = {}) {
  await exige()
  const neg = (await db.um('negocios', { id: negArg.id })) || negArg   // o calendário próprio pode ter mudado agora
  const agora = op.agora || new Date()
  const hoje = horaLocal(agora, fusoDo(neg)).data
  const ciclo = cicloDoDia(hoje, await dataDeAtivacao(neg))
  const todas = await db.lista('estrategias', { negocio_id: neg.id }, { ordem: 'criado_em' })
  const vivas = todas.filter(e => !['cancelada', 'substituida'].includes(e.status))
  if (!op.forcar && todas.some(e => e.status !== 'substituida' && e.ciclo_de === ciclo.de)) return { pulou: true, motivo: 'já tem estratégia desta quinzena' }
  const motivo = op.motivo || (todas.length ? 'quinzena' : 'inicial')
  // os números da quinzena que passou (a inicial, sem nada rodando ainda, vai sem números)
  const ant = cicloAnterior(ciclo)
  const temHistorico = motivo !== 'inicial' || (await db.lista('metricas_dia', { negocio_id: neg.id })).some(m => Number(m.gasto) > 0)
  const num = temHistorico ? await numerosDoPeriodo(neg, ant.de, ant.ate, agora) : null
  // SEMPRE o calendário antes de propor
  const datas = datasDaVez(neg, hoje)
  const acoes = montaAcoes(neg, num, datas, hoje, { recadoBase: await existeBase(neg) })
  const texto = textoDaProposta(neg, { ciclo, motivo, num, datas, acoes, hoje })
  // a que ainda esperava aprovação vira "substituída"; a última aprovada ganha o resultado da quinzena dela
  for (const e of vivas.filter(e => ['aprovar_equipe', 'aprovar_dono'].includes(e.status))) await db.atualiza('estrategias', { id: e.id }, { status: 'substituida' })
  const vigente = vivas.filter(e => e.status === 'aprovada').sort((a, b) => String(b.ciclo_de).localeCompare(String(a.ciclo_de)))[0]
  if (vigente && !vigente.resultado) await db.atualiza('estrategias', { id: vigente.id }, { resultado: await resultadoDe(neg, vigente, agora) })
  const e = await db.insere('estrategias', {
    negocio_id: neg.id, ciclo_de: ciclo.de, ciclo_ate: ciclo.ate, motivo, status: 'aprovar_equipe', texto,
    proposta: { acoes, cuidados: datas.cuidados, grupos: datas.grupos },
    numeros: num ? { ...num, decisao: num.decisao ? { conclusao: num.decisao.conclusao } : null } : null,
    sazonal: { hoje, pesam: datas.pesam, radar: datas.radar }, criado_por: op.por || 'maia',
  })
  await db.evento('estrategia_proposta', neg.id, { estrategia_id: e.id, ciclo: ciclo.de, motivo, datas: datas.pesam.map(d => d.id) })
  const { avisaEquipe } = await import('./canal')
  await avisaEquipe('estratégia da quinzena pra aprovar', `${neg.nome}: ${ddmm(ciclo.de)} a ${ddmm(ciclo.ate)}${datas.pesam.length ? ` (pesa: ${datas.pesam.slice(0, 2).map(d => d.nome).join(', ')})` : ''}`, neg.id)
  return { estrategia: e, texto, acoes, datas }
}

// o resultado da quinzena de uma estratégia aprovada (guardado quando a próxima nasce)
async function resultadoDe(neg: any, e: any, agora: Date) {
  const de = new Date(e.ciclo_de + 'T03:00:00Z').toISOString(), ate = new Date(Math.min(Date.parse(somaDias(e.ciclo_ate, 1) + 'T03:00:00Z'), agora.getTime())).toISOString()
  const n = await numeros(neg.id, de, ate)
  return { de: e.ciclo_de, ate: e.ciclo_ate, gasto: n.gasto, contatos: n.leads_novos, conversas: n.conversas_meta ?? null, vendas: n.ganhos, receita: n.receita, custo_venda: n.custo_por_venda, retorno: n.retorno, medido_em: agora.toISOString() }
}

async function estrategia(id: string) { const e = await db.um('estrategias', { id: String(id || '') }); if (!e) throw new Error('estratégia não existe'); return e }

// ─────────────── a equipe (painel de operação)
export async function equipeAprovaEstrategia(id: string, por: string) {
  await exige()
  const e = await estrategia(id)
  if (e.status !== 'aprovar_equipe') throw new Error('a estratégia não está esperando a equipe (' + (STATUS_NOME[e.status] || e.status) + ')')
  const neg = await db.um('negocios', { id: e.negocio_id })
  // 22/11 (Guto): a revisão que cai perto do relatório do mês vai junto com ele, numa mensagem só (aprovacao.ts junta)
  const rel = await relatorioQueJunta(neg, e, agoraTeste || new Date())
  if (rel) {
    const [x] = await db.atualiza('estrategias', { id: e.id }, { status: 'aprovar_dono', aprovado_equipe_por: por, aprovado_equipe_em: new Date().toISOString(), wamid_dono: null, nota: null, proposta: { ...limpa(e.proposta), espera_relatorio: rel } })
    await db.evento('estrategia_equipe_aprovou', e.negocio_id, { estrategia_id: e.id, por, junto_do_relatorio: rel })
    return x
  }
  const wamid = await mandaProDono(neg, e.texto)
  const [x] = await db.atualiza('estrategias', { id: e.id }, { status: 'aprovar_dono', aprovado_equipe_por: por, aprovado_equipe_em: new Date().toISOString(), wamid_dono: wamid, nota: null, proposta: { ...limpa(e.proposta), enviada_em: new Date().toISOString() } })
  await db.evento('estrategia_equipe_aprovou', e.negocio_id, { estrategia_id: e.id, por })
  return x
}
const limpa = (p: any) => { const { espera_relatorio, enviada_em, com_relatorio, sem_relatorio, ...r } = p || {}; void espera_relatorio; void enviada_em; void com_relatorio; void sem_relatorio; return r }
let agoraTeste: Date | null = null   // só o teste muda o "hoje" da junção com o relatório
export const relogioDeTeste = (d: Date | null) => { agoraTeste = d }
async function mandaProDono(neg: any, texto: string) {
  if (!neg?.dono_whatsapp) return null
  const { conversaDoDono, mandaTexto } = await import('./canal')
  const r = await mandaTexto(await conversaDoDono(neg), texto)
  return r?.wamid || null
}

// a revisão de 15 dias cai entre 3 dias antes do dia do relatório do mês e o próprio dia, e o relatório ainda não foi pro
// dono: devolve o dia do relatório (a estratégia espera ele). Senão null (vai sozinha)
export async function relatorioQueJunta(neg: any, e: any, agora = new Date()) {
  if (e.motivo !== 'quinzena') return null
  const R = await import('./relatorios')
  const [a, m] = String(e.ciclo_de).split('-').map(Number)
  for (const [ano, mes] of [[a, m], m === 12 ? [a + 1, 1] : [a, m + 1]]) {
    const rel = isoDe(ano, mes, R.diaDoRelatorio(neg, ano, mes))
    if (!(e.ciclo_de >= somaDias(rel, -3) && e.ciclo_de <= rel)) continue
    if (horaLocal(agora, fusoDo(neg)).data > rel) return null   // o dia do relatório já passou: vai sozinha
    const desde = new Date(somaDias(rel, -8) + 'T03:00:00Z').toISOString()
    const jaFoi = (await db.lista('pecas', { negocio_id: neg.id, tipo: 'relatorio' })).some(p => R.ehRelatorioMes(p) && p.enviado_dono_em && p.criado_em >= desde)
    return jaFoi ? null : rel
  }
  return null
}
export const segurada = (e: any) => e?.status === 'aprovar_dono' && !!e.proposta?.espera_relatorio && !e.proposta?.enviada_em

// aprovacao.ts: o relatório do mês está indo pro dono: as estratégias que esperavam por ele vão junto (o texto entra na mensagem)
export async function juntaAoRelatorio(negocio_id: string) {
  if (!estrategiaLigada() || !(await estrategiaDisponivel().catch(() => false))) return []
  return (await db.lista('estrategias', { negocio_id, status: 'aprovar_dono' })).filter(segurada)
}
export async function foiComORelatorio(ids: string[], wamid: string | null, peca_id: string) {
  for (const id of ids) {
    const e = await db.um('estrategias', { id })
    if (!e) continue
    await db.atualiza('estrategias', { id }, { wamid_dono: wamid, proposta: { ...(e.proposta || {}), enviada_em: new Date().toISOString(), com_relatorio: peca_id } })
  }
}
// a rotina: o relatório não saiu até o dia seguinte ao dele → a estratégia vai sozinha
export async function soltaSeguradas(neg: any, agora = new Date()) {
  const hoje = horaLocal(agora, fusoDo(neg)).data
  const feitas: string[] = []
  for (const e of (await db.lista('estrategias', { negocio_id: neg.id, status: 'aprovar_dono' })).filter(segurada)) {
    if (hoje <= somaDias(e.proposta.espera_relatorio, 1)) continue
    const wamid = await mandaProDono(neg, e.texto)
    await db.atualiza('estrategias', { id: e.id }, { wamid_dono: wamid, proposta: { ...(e.proposta || {}), enviada_em: new Date().toISOString(), sem_relatorio: true } })
    feitas.push(e.id)
  }
  return feitas
}
export async function equipeEditaEstrategia(id: string, texto: string, por: string) {
  await exige()
  const e = await estrategia(id)
  if (e.status !== 'aprovar_equipe') throw new Error('só dá pra editar antes de ir pro dono')
  const t = String(texto || '').trim()
  if (t.length < 40) throw new Error('o texto ficou curto demais')
  const [x] = await db.atualiza('estrategias', { id: e.id }, { texto: t.slice(0, 4000), editado_por: por })
  await db.evento('estrategia_editada', e.negocio_id, { estrategia_id: e.id, por })
  return x
}
export async function cancelaEstrategia(id: string, por: string, nota?: string) {
  await exige()
  const e = await estrategia(id)
  if (!['aprovar_equipe', 'aprovar_dono'].includes(e.status)) throw new Error('essa estratégia já está ' + (STATUS_NOME[e.status] || e.status))
  const [x] = await db.atualiza('estrategias', { id: e.id }, { status: 'cancelada', nota: nota ? String(nota).slice(0, 300) : e.nota || null })
  await db.evento('estrategia_cancelada', e.negocio_id, { estrategia_id: e.id, por, estava: e.status })
  return x
}

// ─────────────── o dono (WhatsApp e painel chamam as mesmas)
export async function estrategiasComDono(negocio_id: string) {
  if (!(await estrategiaDisponivel().catch(() => false))) return []
  // a que espera o relatório do mês ainda não chegou no dono: não conta
  return (await db.lista('estrategias', { negocio_id, status: 'aprovar_dono' }, { ordem: 'criado_em' }).catch(() => [] as any[])).filter(e => !segurada(e))
}
export async function estrategiaDaMensagem(negocio_id: string, wamid: string) {
  if (!wamid || !(await estrategiaDisponivel().catch(() => false))) return null
  return db.um('estrategias', { negocio_id, wamid_dono: wamid }).catch(() => null)
}
export async function donoAprovaEstrategia(negocio_id: string, id?: string | null, via = 'whatsapp') {
  await exige()
  const lista = id ? [await db.um('estrategias', { id: String(id), negocio_id })].filter(Boolean) as any[] : await estrategiasComDono(negocio_id)
  // só o que a EQUIPE já aprovou chega aqui (status aprovar_dono)
  const ok = lista.filter(e => e.status === 'aprovar_dono' && !segurada(e))
  if (id && !ok.length) throw new Error('essa estratégia não está esperando a tua aprovação')
  const neg = await db.um('negocios', { id: negocio_id })
  const { avisaEquipe } = await import('./canal')
  for (const e of ok) {
    await db.atualiza('estrategias', { id: e.id }, { status: 'aprovada', aprovado_dono_em: new Date().toISOString(), aprovado_via: via })
    await db.evento('estrategia_dono_aprovou', negocio_id, { estrategia_id: e.id, via })
    const acoes = (e.proposta?.acoes || []).map((a: any, i: number) => `${i + 1}. ${a.texto}`).join(' ')
    await avisaEquipe('dono aprovou a estratégia', `${neg?.nome}: ${ddmm(e.ciclo_de)} a ${ddmm(e.ciclo_ate)}. Aplicar: ${acoes}`.slice(0, 900), negocio_id, true)
  }
  return ok.map(e => ({ id: e.id, ciclo_de: e.ciclo_de, ciclo_ate: e.ciclo_ate }))
}
export async function donoAjustaEstrategia(negocio_id: string, id: string | null, nota: string, via = 'whatsapp') {
  await exige()
  const pend = id ? [await db.um('estrategias', { id: String(id), negocio_id })].filter(Boolean) as any[] : await estrategiasComDono(negocio_id)
  const e = pend.filter(x => x.status === 'aprovar_dono' && !segurada(x)).slice(-1)[0]
  if (!e) return { ok: false, erro: 'nenhuma estratégia esperando a aprovação do dono' }
  if (!String(nota || '').trim()) return { ok: false, erro: 'falta dizer o que mudar' }
  await db.atualiza('estrategias', { id: e.id }, { status: 'aprovar_equipe', nota: 'o dono pediu: ' + String(nota).slice(0, 300) })
  await db.evento('estrategia_dono_ajuste', negocio_id, { estrategia_id: e.id, via })
  const neg = await db.um('negocios', { id: negocio_id })
  const { avisaEquipe } = await import('./canal')
  await avisaEquipe('dono pediu ajuste na estratégia', `${neg?.nome}: ${String(nota).slice(0, 160)}`, negocio_id)
  return { ok: true, estrategia: e.id }
}

// ─────────────── o calendário próprio do negócio (contexto.calendario.datas): a implantação, a equipe e o dono (WhatsApp e painel)
export async function adicionaData(neg: any, d: { nome: string; dia: string; antecedencia_dias?: number | null; porque?: string | null; ate?: string | null }, por: string) {
  const nome = String(d.nome || '').trim().slice(0, 80)
  if (!nome) return { ok: false, erro: 'falta o nome da data' }
  const dia = leDia(d.dia)
  if (!dia) return { ok: false, erro: 'não entendi o dia: escreve assim, 25/12' }
  const n = (await db.um('negocios', { id: neg.id })) || neg
  const c = n.contexto || {}
  const datas = Array.isArray(c.calendario?.datas) ? [...c.calendario.datas] : []
  if (datas.length >= 30) return { ok: false, erro: 'o calendário do negócio já tem 30 datas: tira alguma antes' }
  const ant = Number(d.antecedencia_dias)
  const nova = { nome, dia: String(d.dia).trim(), ...(ant >= 0 && ant <= 120 ? { antecedencia_dias: Math.round(ant) } : {}), ...(d.porque ? { porque: String(d.porque).slice(0, 200) } : {}), ...(d.ate && leDia(d.ate) ? { ate: String(d.ate).trim() } : {}), por, em: new Date().toISOString() }
  datas.push(nova)
  await db.atualiza('negocios', { id: n.id }, { contexto: { ...c, calendario: { ...(c.calendario || {}), datas } } })
  await db.evento('calendario_data', n.id, { nome, dia: nova.dia, por })
  return { ok: true, data: nova, total: datas.length }
}
export async function tiraData(neg: any, indice: number, por: string) {
  const n = (await db.um('negocios', { id: neg.id })) || neg
  const c = n.contexto || {}
  const datas = Array.isArray(c.calendario?.datas) ? [...c.calendario.datas] : []
  if (!(indice >= 0 && indice < datas.length)) return { ok: false, erro: 'essa data não existe' }
  const [fora] = datas.splice(indice, 1)
  await db.atualiza('negocios', { id: n.id }, { contexto: { ...c, calendario: { ...(c.calendario || {}), datas } } })
  await db.evento('calendario_data_tirada', n.id, { nome: fora?.nome, por })
  return { ok: true, total: datas.length }
}

// ─────────────── os painéis
const resumoDe = (e: any) => ({ id: e.id, ciclo_de: e.ciclo_de, ciclo_ate: e.ciclo_ate, motivo: e.motivo, status: e.status, status_nome: STATUS_NOME[e.status] || e.status,
  texto: e.texto, acoes: e.proposta?.acoes || [], cuidados: e.proposta?.cuidados || [], datas: (e.sazonal?.pesam || []).map((d: DataDaVez) => ({ nome: d.nome, dia: d.dia, inicio: d.inicio })),
  numeros: e.numeros || null, resultado: e.resultado || null, criado_em: e.criado_em, aprovado_equipe_em: e.aprovado_equipe_em || null, aprovado_dono_em: e.aprovado_dono_em || null, aprovado_via: e.aprovado_via || null })
export async function painelEquipe(neg: any, agora = new Date()) {
  if (!(await estrategiaDisponivel().catch(() => false))) return { disponivel: false, erro: INDISPONIVEL, ligada: estrategiaLigada() }
  const hoje = horaLocal(agora, fusoDo(neg)).data
  const es = await db.lista('estrategias', { negocio_id: neg.id }, { ordem: 'criado_em', desc: true, limite: 24 })
  const cal = datasDaVez(neg, hoje)
  const ativ = await dataDeAtivacao(neg)
  return { disponivel: true, ligada: estrategiaLigada(), hoje, ativado_em: ativ, ciclo: cicloDoDia(hoje, ativ), proxima_revisao: ativ ? somaDias(cicloDoDia(hoje, ativ).ate, 1) : null, estrategias: es.map(e => ({ ...resumoDe(e), espera_relatorio: segurada(e) ? e.proposta.espera_relatorio : null, nota: e.nota || null, aprovado_equipe_por: e.aprovado_equipe_por || null, criado_por: e.criado_por || null })),
    calendario: { grupos: cal.grupos, pesam: cal.pesam, radar: cal.radar, cuidados: cal.cuidados, proprias: datasProprias(neg) } }
}
// o dono não vê a nota interna nem o texto que a equipe ainda está revisando
export async function painelDoDono(neg: any, agora = new Date()) {
  if (!estrategiaLigada()) return { ligada: false }
  if (!(await estrategiaDisponivel().catch(() => false))) return { ligada: true, disponivel: false }
  const hoje = horaLocal(agora, fusoDo(neg)).data
  const es = (await db.lista('estrategias', { negocio_id: neg.id }, { ordem: 'criado_em', desc: true, limite: 12 })).filter(e => ['aprovar_dono', 'aprovada'].includes(e.status))
  const cal = datasDaVez(neg, hoje)
  return { ligada: true, disponivel: true, pendente: es.filter(e => e.status === 'aprovar_dono' && !segurada(e)).map(resumoDe)[0] || null, historico: es.filter(e => e.status === 'aprovada').slice(0, 6).map(resumoDe),
    calendario: { pesam: cal.pesam.map(d => ({ nome: d.nome, dia: d.dia, inicio: d.inicio })), radar: cal.radar.map(d => ({ nome: d.nome, dia: d.dia, inicio: d.inicio })), proprias: datasProprias(neg) } }
}
// pro WhatsApp: a estratégia que vale agora (e a que espera o 👍)
export async function estrategiaAtual(neg: any) {
  if (!(await estrategiaDisponivel().catch(() => false))) return { erro: 'a estratégia de 15 dias ainda não está ligada: a equipe liga' }
  const es = await db.lista('estrategias', { negocio_id: neg.id }, { ordem: 'criado_em', desc: true, limite: 12 })
  const v = es.find(e => e.status === 'aprovada'), p = es.find(e => e.status === 'aprovar_dono' && !segurada(e))
const ativ = await dataDeAtivacao(neg)
  return { vigente: v ? { quinzena: `${ddmm(v.ciclo_de)} a ${ddmm(v.ciclo_ate)}`, acoes: (v.proposta?.acoes || []).map((a: any) => a.texto) } : null,
    esperando_o_dono: p ? { quinzena: `${ddmm(p.ciclo_de)} a ${ddmm(p.ciclo_ate)}`, texto: p.texto } : null,
    proxima_revisao: ativ ? ddmm(somaDias(cicloDoDia(horaLocal(new Date(), fusoDo(neg)).data, ativ).ate, 1)) : 'depois que o primeiro anúncio ligar' }
}

// ─────────────── a rotina (de hora em hora): 9h no fuso do negócio, na ativação + 15, +30... (ou no dia seguinte, se a rodada
// falhou); a inicial na 1ª rodada de quem não tem nenhuma; e solta a que esperava um relatório do mês que não saiu
export async function rotinaEstrategia(op: { agora?: Date; forcar?: boolean } = {}) {
  if (!estrategiaLigada()) return []
  if (!(await estrategiaDisponivel().catch(() => false))) return [{ indisponivel: INDISPONIVEL }]
  const agora = op.agora || new Date()
  const { negociosDoResumo } = await import('./rotina')
  const feitos: any[] = []
  for (const neg of await negociosDoResumo(new Date(agora.getTime() - 7 * 86400e3))) {
    try {
      const h = horaLocal(agora, fusoDo(neg))
      if (h.hora !== HORA && !op.forcar) continue
      for (const id of await soltaSeguradas(neg, agora)) feitos.push({ negocio: neg.id, solta_sem_relatorio: id })
      const tem = (await db.lista('estrategias', { negocio_id: neg.id }, { limite: 1, campos: 'id' })).length > 0
      const ativ = tem ? await dataDeAtivacao(neg) : null
      if (tem && !(diaDeRevisar(h.data, ativ) || diaDeRevisar(somaDias(h.data, -1), ativ))) continue
      const r: any = await propoeEstrategia(neg, { agora, motivo: tem ? 'quinzena' : 'inicial' })
      if (!r.pulou) feitos.push({ negocio: neg.id, estrategia: r.estrategia.id, datas: r.datas.pesam.map((d: any) => d.id) })
    } catch (e: any) { feitos.push({ negocio: neg.id, erro: String(e?.message || e).slice(0, 200) }) }
  }
  return feitos
}

// a frase de sazonalidade da análise de 2 dias (relatorios.ts), quando ela sugere mudar
export function linhaSazonalDaAnalise(neg: any, hoje: string) {
  const d = datasDaVez(neg, hoje).pesam[0]
  if (!d) return null
  return { id: d.id, texto: `Data que pesa agora: ${d.nome} (${ddmm(d.dia)}), ${d.inicio <= hoje ? 'campanha da data já no ar' : `anúncio a partir de ${ddmm(d.inicio)}`}` }
}
