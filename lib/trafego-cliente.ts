import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { getAnunciosDia, getDetalhesAnuncios, getAlcanceTotal, type AnuncioDia } from '@/lib/meta-ads'
import { hojeBR, menosDias, periodoAnterior, diasEntre } from '@/lib/periodos'

// O PAINEL DE TRÁFEGO DO CLIENTE.
//
// Duas metades:
//   sincronizarProjeto → lê a Meta por anúncio e por dia, grava, percebe o que mudou
//                        (anúncio novo, pausado) e destrava conquistas. Roda no cron e
//                        na primeira abertura da área do cliente.
//   lerPainel          → monta, a partir do banco, o que o dono vê: o veredito em uma
//                        frase, o funil, os anúncios que puxam e os que queimam, o que
//                        a gente fez, o placar. Não chama a Meta.
//
// O dono não quer CPM. Ele quer três respostas: tá funcionando, quanto me custa um
// cliente, e o que falta de mim. Tudo aqui serve a essas três.

type Projeto = {
  id: string; org_id: string; cliente: string; ad_account_id: string | null; data_inicio: string
  valor_cliente?: number | null; alvo_custo_resultado?: number | null; produto?: string
}

export type TipoResultado = 'conversa' | 'lead' | 'compra'

// a língua do dono: "pessoas que te chamaram", não "conversas iniciadas"
export const NOME_RESULTADO: Record<TipoResultado, { um: string; varios: string; frase: string }> = {
  conversa: { um: 'conversa no WhatsApp', varios: 'conversas no WhatsApp', frase: 'pessoas que te chamaram no WhatsApp' },
  lead: { um: 'contato deixado', varios: 'contatos deixados', frase: 'pessoas que deixaram contato' },
  compra: { um: 'compra', varios: 'compras', frase: 'compras feitas' },
}

const PAUSADO = (s: string) => /PAUSED|ARCHIVED|DELETED|DISAPPROVED/i.test(s || '')

// O resultado que vale pra campanha. Compra ganha de lead, lead ganha de conversa; sem
// nenhum, decide pelo objetivo da campanha (uma campanha de leads sem lead no dia continua
// sendo de leads).
function tipoDaLinha(l: AnuncioDia): TipoResultado {
  if (l.compras > 0) return 'compra'
  if (l.leads > 0) return 'lead'
  if (l.conversas > 0) return 'conversa'
  if (/LEADS/i.test(l.objective)) return 'lead'
  if (/SALES/i.test(l.objective) && /purchase/i.test(l.objective)) return 'compra'
  return 'conversa'
}
const valorDoTipo = (l: AnuncioDia, t: TipoResultado) => (t === 'compra' ? l.compras : t === 'lead' ? l.leads : l.conversas)

// ═══════════════════════════════════════════════════════════════ sincronizar

export async function sincronizarProjeto(p: Projeto, opts: { desde?: string; completo?: boolean } = {}) {
  if (!p.ad_account_id) return { ok: false, error: 'projeto sem conta de anúncio' }
  const hoje = hojeBR()
  const inicio = String(p.data_inicio).slice(0, 10)

  // Por padrão só os últimos 3 dias (a Meta ainda mexe nos números de ontem e anteontem).
  // `completo` refaz desde o início do contrato, limitado a 120 dias por chamada.
  let desde = opts.desde || (opts.completo ? inicio : menosDias(hoje, 3))
  if (desde < inicio) desde = inicio
  if (diasEntre(desde, hoje) > 120) desde = menosDias(hoje, 119)

  const r = await getAnunciosDia(p.ad_account_id, desde, hoje)
  if (!r.ok) return { ok: false, error: r.error }

  // 1) a foto diária
  const linhas = r.linhas.map(l => {
    const tipo = tipoDaLinha(l)
    return {
      org_id: p.org_id, projeto_id: p.id, ad_account_id: p.ad_account_id, data: l.data,
      campaign_id: l.campaign_id, campaign_name: l.campaign_name, adset_id: l.adset_id, adset_name: l.adset_name,
      ad_id: l.ad_id, ad_name: l.ad_name, objective: l.objective,
      gasto: l.gasto, impressoes: l.impressoes, alcance: l.alcance, cliques: l.cliques,
      conversas: l.conversas, leads: l.leads, compras: l.compras,
      resultados: valorDoTipo(l, tipo), tipo_resultado: tipo, atualizado_em: new Date().toISOString(),
    }
  })
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await sb.from('trafego_anuncios_dia').upsert(linhas.slice(i, i + 500), { onConflict: 'projeto_id,ad_id,data' })
    if (error) return { ok: false, error: 'gravar dias: ' + error.message }
  }

  // 2) o anúncio em si + o que mudou nele
  const ids = [...new Set(linhas.map(l => l.ad_id))]
  const detalhes = await getDetalhesAnuncios(ids)
  const { data: antes } = await sb.from('trafego_anuncios').select('ad_id, status, primeiro_dia').eq('projeto_id', p.id)
  const antesPor = Object.fromEntries((antes || []).map((a: any) => [a.ad_id, a]))

  const eventos: any[] = []
  const anuncios = ids.map(id => {
    const doAd = linhas.filter(l => l.ad_id === id)
    const ult = doAd[doAd.length - 1]
    const comGasto = doAd.filter(l => l.gasto > 0).map(l => l.data).sort()
    const primeiroAgora = comGasto[0] || null
    const velho = antesPor[id]
    const primeiro_dia = [velho?.primeiro_dia, primeiroAgora].filter(Boolean).sort()[0] || null
    const status = detalhes[id]?.status || velho?.status || ''

    if (!velho && primeiroAgora) {
      eventos.push({ org_id: p.org_id, projeto_id: p.id, data: primeiroAgora, tipo: 'anuncio_criado', ad_id: id, titulo: `Anúncio novo no ar: ${ult.ad_name}`, descricao: ult.campaign_name })
    } else if (velho && velho.status && !PAUSADO(velho.status) && PAUSADO(status)) {
      eventos.push({ org_id: p.org_id, projeto_id: p.id, data: hoje, tipo: 'anuncio_pausado', ad_id: id, titulo: `Anúncio pausado: ${ult.ad_name}`, descricao: ult.campaign_name })
    } else if (velho && PAUSADO(velho.status) && status && !PAUSADO(status)) {
      eventos.push({ org_id: p.org_id, projeto_id: p.id, data: hoje, tipo: 'anuncio_reativado', ad_id: id, titulo: `Anúncio de volta ao ar: ${ult.ad_name}`, descricao: ult.campaign_name })
    }
    return {
      projeto_id: p.id, ad_id: id, org_id: p.org_id, ad_name: ult.ad_name, campaign_name: ult.campaign_name, adset_name: ult.adset_name,
      objective: ult.objective, status, imagem_url: detalhes[id]?.imagem_url ?? null, primeiro_dia, visto_em: new Date().toISOString(),
    }
  })
  if (anuncios.length) {
    const { error } = await sb.from('trafego_anuncios').upsert(anuncios, { onConflict: 'projeto_id,ad_id' })
    if (error) return { ok: false, error: 'gravar anúncios: ' + error.message }
  }
  if (eventos.length) await sb.from('trafego_eventos').upsert(eventos, { onConflict: 'projeto_id,data,tipo,ad_id', ignoreDuplicates: true })

  // 3) o placar
  const conquistas = await avaliarConquistas(p)

  return { ok: true, dias: linhas.length, anuncios: anuncios.length, eventos: eventos.length, conquistas }
}

// ═══════════════════════════════════════════════════════════════ conquistas

const DEGRAUS_RESULTADO = [10, 50, 100, 250, 500, 1000, 2500, 5000]
const DEGRAUS_ALCANCE = [1000, 5000, 10000, 25000, 50000, 100000]
const fmtInt = (v: number) => v.toLocaleString('pt-BR')
const fmtBRL = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function avaliarConquistas(p: Projeto) {
  const hoje = hojeBR()
  const inicio = String(p.data_inicio).slice(0, 10)
  const { data: dias } = await sb.from('trafego_anuncios_dia').select('data, gasto, resultados, tipo_resultado').eq('projeto_id', p.id).order('data')
  if (!dias?.length) return 0

  const novas: any[] = []
  const add = (chave: string, titulo: string, descricao: string, valor: number | null, destravada_em: string, referencia = '') =>
    novas.push({ org_id: p.org_id, projeto_id: p.id, chave, referencia, titulo, descricao, valor, destravada_em })

  // por dia: soma de gasto e resultados, e o tipo que predomina
  const porDia: Record<string, { gasto: number; resultados: number }> = {}
  const porTipo: Record<string, number> = {}
  for (const d of dias) {
    porDia[d.data] = porDia[d.data] || { gasto: 0, resultados: 0 }
    porDia[d.data].gasto += Number(d.gasto); porDia[d.data].resultados += Number(d.resultados)
    porTipo[d.tipo_resultado] = (porTipo[d.tipo_resultado] || 0) + Number(d.resultados)
  }
  const tipo = (Object.entries(porTipo).sort((a, b) => b[1] - a[1])[0]?.[0] || 'conversa') as TipoResultado
  const nome = NOME_RESULTADO[tipo]
  const datas = Object.keys(porDia).sort()

  // primeira campanha no ar
  const primeiroGasto = datas.find(d => porDia[d].gasto > 0)
  if (primeiroGasto) add('primeira_campanha', 'Primeira campanha no ar', 'O teu negócio começou a aparecer pra quem está perto.', null, primeiroGasto)

  // degraus de resultado: o dia em que cruzou cada um
  let acum = 0
  const cruzou: Record<number, string> = {}
  for (const d of datas) {
    acum += porDia[d].resultados
    for (const g of DEGRAUS_RESULTADO) if (acum >= g && !cruzou[g]) cruzou[g] = d
  }
  for (const g of DEGRAUS_RESULTADO) if (cruzou[g]) {
    add(`resultados_${g}`, `${fmtInt(g)} ${nome.varios}`, `${fmtInt(g)} ${nome.frase} desde o começo do trabalho.`, g, cruzou[g])
  }

  // pessoas alcançadas desde o início (a Meta conta pessoa única; não dá pra somar dias)
  const alcance = p.ad_account_id ? await getAlcanceTotal(p.ad_account_id, inicio, hoje) : null
  if (alcance) for (const g of DEGRAUS_ALCANCE) if (alcance >= g) {
    add(`alcance_${g}`, `${fmtInt(g)} pessoas alcançadas`, `${fmtInt(alcance)} pessoas da tua região já viram o teu anúncio.`, alcance, hoje)
  }

  // meses: melhor mês e custo no alvo (só mês fechado, pra não destravar e desdestravar)
  const meses: Record<string, { gasto: number; resultados: number }> = {}
  for (const d of datas) { const m = d.slice(0, 7); meses[m] = meses[m] || { gasto: 0, resultados: 0 }; meses[m].gasto += porDia[d].gasto; meses[m].resultados += porDia[d].resultados }
  const fechados = Object.keys(meses).filter(m => m < hoje.slice(0, 7) && m > inicio.slice(0, 7)).sort()  // exclui o mês de início (parcial) e o atual
  let recorde = 0
  for (const m of fechados) {
    const x = meses[m]
    const ultimoDia = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10)
    if (x.resultados > recorde && recorde > 0) add('melhor_mes', 'Melhor mês até agora', `${nomeMes(m)}: ${fmtInt(x.resultados)} ${nome.varios}, mais que qualquer mês anterior.`, x.resultados, ultimoDia, m)
    if (x.resultados > recorde) recorde = x.resultados
    const alvo = p.alvo_custo_resultado ? Number(p.alvo_custo_resultado) : null
    if (alvo && x.resultados >= 10 && x.gasto / x.resultados <= alvo) {
      add('custo_no_alvo', 'Custo dentro do alvo', `${nomeMes(m)}: ${fmtBRL(x.gasto / x.resultados)} por ${nome.um}, abaixo do alvo de ${fmtBRL(alvo)}.`, x.gasto / x.resultados, ultimoDia, m)
    }
  }

  // primeira venda informada no placar
  const { data: placar } = await sb.from('projeto_placar').select('data, vendas').eq('projeto_id', p.id).gt('vendas', 0).order('data').limit(1)
  if (placar?.[0]) add('primeira_venda', 'Primeira venda que veio do anúncio', 'A primeira venda informada depois que a campanha entrou no ar.', Number(placar[0].vendas), String(placar[0].data).slice(0, 10))

  if (!novas.length) return 0
  const { data: gravadas } = await sb.from('projeto_conquistas').upsert(novas, { onConflict: 'projeto_id,chave,referencia', ignoreDuplicates: true }).select('id')
  return gravadas?.length || 0
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const nomeMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`

// ═══════════════════════════════════════════════════════════════ ler o painel

export type Painel = {
  ok: boolean; error?: string
  de: string; ate: string; de_anterior: string; ate_anterior: string
  tipo: TipoResultado; nome: { um: string; varios: string; frase: string }
  total: Totais; anterior: Totais | null
  porDia: { data: string; gasto: number; resultados: number }[]
  funil: { impressoes: number; cliques: number; resultados: number; vendas: number | null }
  anuncios: AnuncioPainel[]
  eventos: { data: string; tipo: string; titulo: string; descricao: string | null }[]
  conquistas: { chave: string; titulo: string; descricao: string | null; valor: number | null; destravada_em: string }[]
  proximas: { titulo: string; falta: number; de: number; progresso: number }[]
  analise: string[]
  valor_cliente: number | null; alvo_custo: number | null
  sincronizado_em: string | null
}
type Totais = { gasto: number; gastoSemImposto: number; impostoPct: number; impressoes: number; cliques: number; resultados: number; custo: number | null; ctr: number | null }
export type AnuncioPainel = {
  ad_id: string; nome: string; campanha: string; status: string; imagem_url: string | null
  gasto: number; impressoes: number; cliques: number; resultados: number; custo: number | null; ctr: number | null
  situacao: 'puxando' | 'queimando' | 'normal' | 'parado'
}

export async function lerPainel(p: Projeto, de: string, ate: string, impostoPct: number): Promise<Painel> {
  const hoje = hojeBR()
  const inicio = String(p.data_inicio).slice(0, 10)
  if (ate > hoje) ate = hoje
  if (de < inicio) de = inicio
  if (de > ate) [de, ate] = [ate, de]
  const [deAnt, ateAnt] = periodoAnterior(de, ate)
  const f = 1 + (impostoPct || 0) / 100

  const [{ data: dias }, { data: diasAnt }, { data: ads }, { data: eventos }, { data: conquistas }, { data: placar }, { data: ultimo }] = await Promise.all([
    sb.from('trafego_anuncios_dia').select('data, ad_id, gasto, impressoes, cliques, resultados, tipo_resultado').eq('projeto_id', p.id).gte('data', de).lte('data', ate),
    sb.from('trafego_anuncios_dia').select('gasto, impressoes, cliques, resultados').eq('projeto_id', p.id).gte('data', deAnt).lte('data', ateAnt),
    sb.from('trafego_anuncios').select('ad_id, ad_name, campaign_name, status, imagem_url, primeiro_dia').eq('projeto_id', p.id),
    sb.from('trafego_eventos').select('data, tipo, titulo, descricao').eq('projeto_id', p.id).gte('data', menosDias(ate, 45)).lte('data', ate).order('data', { ascending: false }).limit(30),
    sb.from('projeto_conquistas').select('chave, titulo, descricao, valor, destravada_em').eq('projeto_id', p.id).order('destravada_em', { ascending: false }),
    sb.from('projeto_placar').select('mes, vendas, comissao').eq('projeto_id', p.id).eq('mes', ate.slice(0, 7)).is('ponto_a', null).limit(1),
    sb.from('trafego_anuncios_dia').select('atualizado_em').eq('projeto_id', p.id).order('atualizado_em', { ascending: false }).limit(1),
  ])

  const soma = (ls: any[] | null): Totais => {
    const t = (ls || []).reduce((a, l) => { a.g += Number(l.gasto); a.i += Number(l.impressoes); a.c += Number(l.cliques); a.r += Number(l.resultados); return a }, { g: 0, i: 0, c: 0, r: 0 })
    return { gasto: t.g * f, gastoSemImposto: t.g, impostoPct: impostoPct || 0, impressoes: t.i, cliques: t.c, resultados: t.r, custo: t.r ? (t.g * f) / t.r : null, ctr: t.i ? (t.c / t.i) * 100 : null }
  }
  const total = soma(dias)
  const anterior = diasAnt?.length ? soma(diasAnt) : null

  // o tipo que predomina no período decide a língua do painel
  const porTipo: Record<string, number> = {}
  for (const d of dias || []) porTipo[d.tipo_resultado] = (porTipo[d.tipo_resultado] || 0) + Number(d.resultados)
  const tipo = (Object.entries(porTipo).sort((a, b) => b[1] - a[1])[0]?.[0] || 'conversa') as TipoResultado
  const nome = NOME_RESULTADO[tipo]

  // por dia (pro gráfico)
  const pd: Record<string, { gasto: number; resultados: number }> = {}
  for (const d of dias || []) { pd[d.data] = pd[d.data] || { gasto: 0, resultados: 0 }; pd[d.data].gasto += Number(d.gasto) * f; pd[d.data].resultados += Number(d.resultados) }
  const porDia = Object.entries(pd).map(([data, v]) => ({ data, ...v })).sort((a, b) => a.data.localeCompare(b.data))

  // por anúncio, com a situação de cada um
  const adsPor = Object.fromEntries((ads || []).map((a: any) => [a.ad_id, a]))
  const pa: Record<string, AnuncioPainel> = {}
  for (const d of dias || []) {
    const a = adsPor[d.ad_id]
    pa[d.ad_id] = pa[d.ad_id] || { ad_id: d.ad_id, nome: a?.ad_name || '(anúncio)', campanha: a?.campaign_name || '', status: a?.status || '', imagem_url: a?.imagem_url || null, gasto: 0, impressoes: 0, cliques: 0, resultados: 0, custo: null, ctr: null, situacao: 'normal' }
    const x = pa[d.ad_id]
    x.gasto += Number(d.gasto) * f; x.impressoes += Number(d.impressoes); x.cliques += Number(d.cliques); x.resultados += Number(d.resultados)
  }
  const anuncios = Object.values(pa).map(x => ({ ...x, custo: x.resultados ? x.gasto / x.resultados : null, ctr: x.impressoes ? (x.cliques / x.impressoes) * 100 : null }))
  const media = total.custo
  for (const x of anuncios) {
    if (x.gasto === 0) x.situacao = 'parado'
    else if (media != null && x.resultados >= 3 && x.custo! <= media * 1.15) x.situacao = 'puxando'
    else if (media != null && x.resultados >= 1 && x.custo! <= media * 0.8) x.situacao = 'puxando'
    else if (x.gasto >= total.gasto * 0.1 && (x.resultados === 0 || (media != null && x.custo! >= media * 2))) x.situacao = 'queimando'
  }
  anuncios.sort((a, b) => b.resultados - a.resultados || b.gasto - a.gasto)

  // as próximas conquistas (o que falta destravar)
  const { data: tudo } = await sb.from('trafego_anuncios_dia').select('resultados').eq('projeto_id', p.id)
  const acum = (tudo || []).reduce((s, l) => s + Number(l.resultados), 0)
  const proximas: Painel['proximas'] = []
  const proxR = DEGRAUS_RESULTADO.find(g => g > acum)
  if (proxR) proximas.push({ titulo: `${fmtInt(proxR)} ${nome.varios}`, falta: proxR - acum, de: proxR, progresso: Math.round((acum / proxR) * 100) })
  const alc = (conquistas || []).filter(c => c.chave.startsWith('alcance_')).sort((a, b) => Number(b.valor) - Number(a.valor))[0]
  const alcVal = alc ? Number(alc.valor) : 0
  const proxA = DEGRAUS_ALCANCE.find(g => g > alcVal)
  if (proxA && alcVal) proximas.push({ titulo: `${fmtInt(proxA)} pessoas alcançadas`, falta: proxA - alcVal, de: proxA, progresso: Math.round((alcVal / proxA) * 100) })

  const vendas = placar?.[0]?.vendas != null ? Number(placar[0].vendas) : null
  const analise = escreverAnalise({ de, ate, total, anterior, nome, anuncios, eventos: eventos || [], valor_cliente: p.valor_cliente ? Number(p.valor_cliente) : null, alvo: p.alvo_custo_resultado ? Number(p.alvo_custo_resultado) : null, vendas })

  return {
    ok: true, de, ate, de_anterior: deAnt, ate_anterior: ateAnt, tipo, nome, total, anterior, porDia,
    funil: { impressoes: total.impressoes, cliques: total.cliques, resultados: total.resultados, vendas },
    anuncios, eventos: eventos || [], conquistas: conquistas || [], proximas, analise,
    valor_cliente: p.valor_cliente ? Number(p.valor_cliente) : null, alvo_custo: p.alvo_custo_resultado ? Number(p.alvo_custo_resultado) : null,
    sincronizado_em: ultimo?.[0]?.atualizado_em || null,
  }
}

// ═══════════════════════════════════════════════════════════════ a análise escrita
//
// Regras, não IA: só diz o que o número sustenta. Sempre compara com o período anterior
// de mesmo tamanho, aponta o anúncio que puxou e o que queimou, conta o que foi feito, e
// traduz em clientes quando sabe quanto um cliente vale. Nunca promete.

function escreverAnalise(x: {
  de: string; ate: string; total: Totais; anterior: Totais | null; nome: Painel['nome']
  anuncios: AnuncioPainel[]; eventos: any[]; valor_cliente: number | null; alvo: number | null; vendas: number | null
}): string[] {
  const { total: t, anterior: a, nome } = x
  const out: string[] = []
  const br = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7)
  const periodo = x.de === x.ate ? `Em ${br(x.de)}` : `De ${br(x.de)} a ${br(x.ate)}`
  const pct = (n: number, d: number) => Math.round(((n - d) / d) * 100)

  if (!t.gasto && !t.resultados) { out.push(`${periodo} a campanha não rodou. Sem investimento, não tem número pra ler.`); return out }

  // 1. o veredito
  let v = `${periodo}, ${fmtInt(t.resultados)} ${t.resultados === 1 ? nome.um : nome.varios}${t.custo != null ? `, a ${fmtBRL(t.custo)} cada` : ''}, com ${fmtBRL(t.gasto)} investidos.`
  if (a && a.resultados) {
    const dr = pct(t.resultados, a.resultados)
    if (Math.abs(dr) >= 5) v += ` ${dr > 0 ? 'Foram' : 'Foram'} ${Math.abs(dr)}% ${dr > 0 ? 'a mais' : 'a menos'} que no período anterior`
    else v += ' Praticamente igual ao período anterior'
    if (a.custo && t.custo) {
      const dc = pct(t.custo, a.custo)
      v += Math.abs(dc) >= 5 ? `, e o custo ${dc < 0 ? 'caiu' : 'subiu'} ${Math.abs(dc)}%.` : ', com o custo estável.'
    } else v += '.'
  } else if (a && a.gasto === 0) v += ' Não tem período anterior pra comparar: a campanha começou agora.'
  if (x.alvo && t.custo != null) v += t.custo <= x.alvo ? ` Está abaixo do alvo de ${fmtBRL(x.alvo)}.` : ` Está acima do alvo de ${fmtBRL(x.alvo)}: é onde estamos trabalhando.`
  out.push(v)

  // 2. quem puxou
  const melhor = x.anuncios.find(an => an.situacao === 'puxando') || x.anuncios.find(an => an.resultados > 0)
  if (melhor && x.anuncios.length > 1) {
    out.push(`O anúncio que mais trouxe foi "${melhor.nome}": ${fmtInt(melhor.resultados)} ${melhor.resultados === 1 ? nome.um : nome.varios}${melhor.custo != null ? ` a ${fmtBRL(melhor.custo)}` : ''}.`)
  }

  // 3. quem queimou
  const queimando = x.anuncios.filter(an => an.situacao === 'queimando')
  if (queimando.length) {
    const q = queimando[0]
    const parado = PAUSADO(q.status)
    out.push(q.resultados === 0
      ? `"${q.nome}" gastou ${fmtBRL(q.gasto)} sem trazer resultado${parado ? ' e já foi pausado' : ', e vai ser pausado ou trocado'}.`
      : `"${q.nome}" está caro: ${fmtBRL(q.custo!)} por ${nome.um}${parado ? ', e já foi pausado' : ', e vai ser ajustado'}.`)
  }

  // 4. o que foi feito
  const criados = x.eventos.filter(e => e.tipo === 'anuncio_criado').length
  const pausados = x.eventos.filter(e => e.tipo === 'anuncio_pausado').length
  const ajustes = x.eventos.filter(e => e.tipo === 'ajuste').length
  const feitos: string[] = []
  if (criados) feitos.push(`${criados} ${criados === 1 ? 'anúncio novo' : 'anúncios novos'}`)
  if (pausados) feitos.push(`${pausados} ${pausados === 1 ? 'pausado' : 'pausados'}`)
  if (ajustes) feitos.push(`${ajustes} ${ajustes === 1 ? 'ajuste' : 'ajustes'} de campanha`)
  if (feitos.length) out.push(`Nas últimas semanas: ${feitos.join(', ')}.`)

  // 5. em clientes
  if (x.valor_cliente && t.gasto > 0) {
    const precisa = Math.ceil(t.gasto / x.valor_cliente)
    let s = `Com um cliente valendo ${fmtBRL(x.valor_cliente)}, o investimento se paga com ${precisa} ${precisa === 1 ? 'venda' : 'vendas'} entre ${t.resultados ? `essas ${fmtInt(t.resultados)} ${nome.varios}` : 'os contatos'}.`
    if (x.vendas != null) s += ` Neste mês foram informadas ${x.vendas} ${x.vendas === 1 ? 'venda' : 'vendas'}${x.vendas >= precisa ? ': o investimento já se pagou.' : '.'}`
    out.push(s)
  }
  return out
}
