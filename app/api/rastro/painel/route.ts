// Rastro: os números de um projeto num período (senha própria, RASTRO_SENHA, no cabeçalho x-senha).
//   GET ?projeto=tizon&de=AAAA-MM-DD&ate=AAAA-MM-DD   (dias inteiros no horário de Brasília; padrão: hoje)
// Junta as vendas (rastro_vendas) com o gasto de cada anúncio na Meta (getAnunciosDia) pelo id do anúncio que vem no utm_content.
import { NextResponse } from 'next/server'
import { rastroDb, senhaRastro, separa } from '@/lib/rastro'
import { getAnunciosDia, type AnuncioDia } from '@/lib/meta-ads'

export const maxDuration = 60
const r2 = (n: number) => +n.toFixed(2)
const div = (a: number, b: number) => (b > 0 ? r2(a / b) : null)
const hojeBR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)
const diaBR = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 10)

export async function GET(req: Request) {
  if (!senhaRastro(req.headers.get('x-senha'))) return NextResponse.json({ erro: 'senha' }, { status: 401 })
  const u = new URL(req.url)
  const projetos = await rastroDb.projetos()
  const p = projetos.find(x => x.slug === u.searchParams.get('projeto')) || projetos[0]
  if (!p) return NextResponse.json({ erro: 'nenhum projeto cadastrado' }, { status: 404 })
  const ok = (d: string | null) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d)
  let de = u.searchParams.get('de'), ate = u.searchParams.get('ate')
  if (!ok(de) || !ok(ate) || de! > ate!) { de = hojeBR(); ate = hojeBR() }
  if (ate! > hojeBR()) ate = hojeBR()
  const deTs = de + 'T03:00:00.000Z', ateTs = new Date(new Date(ate + 'T03:00:00.000Z').getTime() + 86400e3).toISOString()

  const [vendasT, meta, ultima] = await Promise.all([
    rastroDb.vendas(p.id, deTs, ateTs),
    getAnunciosDia(p.conta_meta, de!, ate!),
    rastroDb.ultima(p.id).catch(() => null),
  ])
  const linhas: AnuncioDia[] = meta.linhas || []
  const aprovadas = vendasT.filter(v => v.status === 'aprovada')
  const perdidas = vendasT.filter(v => ['reembolsada', 'chargeback'].includes(v.status))

  // a árvore campanha → conjunto → anúncio, com o gasto da Meta
  const camp = new Map<string, any>(), adParaCamp = new Map<string, any>(), adPorNome = new Map<string, any>()
  const novo = (id: string, nome: string) => ({ id, nome, gasto: 0, impressoes: 0, cliques: 0, compras_meta: 0, vendas: 0, faturamento: 0, liquido: 0 })
  for (const l of linhas) {
    const c = camp.get(l.campaign_id) || { ...novo(l.campaign_id, l.campaign_name), conjuntos: new Map<string, any>() }
    const s = c.conjuntos.get(l.adset_id) || { ...novo(l.adset_id, l.adset_name), anuncios: new Map<string, any>() }
    const a = s.anuncios.get(l.ad_id) || novo(l.ad_id, l.ad_name)
    for (const o of [c, s, a]) { o.gasto += l.gasto; o.impressoes += l.impressoes; o.cliques += l.cliques; o.compras_meta += l.compras }
    s.anuncios.set(l.ad_id, a); c.conjuntos.set(l.adset_id, s); camp.set(l.campaign_id, c)
    adParaCamp.set(l.ad_id, { c, s, a }); adPorNome.set(l.ad_name, { c, s, a })
  }

  // cada venda vai pro anúncio (pelo id do utm_content; se não tiver, pelo nome), senão pra campanha, senão pra "outras origens"
  const origens: Record<string, any> = { anuncio: { nome: 'Anúncio da Meta identificado', vendas: 0, faturamento: 0 }, campanha: { nome: 'Meta, sem o anúncio identificado', vendas: 0, faturamento: 0 },
    outra: { nome: 'Outra origem (link com utm)', vendas: 0, faturamento: 0 }, sem: { nome: 'Sem origem (orgânico, direto, sem utm)', vendas: 0, faturamento: 0 } }
  const rotulo = new Map<string, string>()
  for (const v of aprovadas) {
    const bruto = +v.valor_bruto || 0, liq = +v.valor_liquido || 0
    const alvo = (v.anuncio_id && adParaCamp.get(v.anuncio_id)) || (v.utm_content && adPorNome.get(separa(v.utm_content).nome))
    let o = 'sem'
    if (alvo) { for (const x of [alvo.c, alvo.s, alvo.a]) { x.vendas++; x.faturamento += bruto; x.liquido += liq } o = 'anuncio'; rotulo.set(v.id, 'Anúncio: ' + alvo.a.nome) }
    else if (v.campanha_id && camp.get(v.campanha_id)) { const c = camp.get(v.campanha_id); c.vendas++; c.faturamento += bruto; c.liquido += liq; o = 'campanha'; rotulo.set(v.id, 'Campanha: ' + c.nome) }
    else if (v.utm_content || v.utm_campaign) { o = /fb|facebook|meta|ig|instagram/i.test(String(v.utm_source || '')) || v.anuncio_id || v.campanha_id ? 'campanha' : 'outra'; rotulo.set(v.id, (v.utm_content ? separa(v.utm_content).nome : separa(v.utm_campaign).nome) + (o === 'campanha' ? ' (fora do período ou de outra conta)' : '')) }
    else if (v.utm_source || v.src) { o = 'outra'; rotulo.set(v.id, 'Origem: ' + (v.utm_source || v.src)) }
    else rotulo.set(v.id, 'Sem origem')
    origens[o].vendas++; origens[o].faturamento += bruto
  }

  const met = (o: any) => ({ id: o.id, nome: o.nome, gasto: r2(o.gasto), impressoes: o.impressoes, cliques: o.cliques, ctr: o.impressoes ? r2(o.cliques / o.impressoes * 100) : null, cpc: div(o.gasto, o.cliques),
    compras_meta: o.compras_meta, vendas: o.vendas, faturamento: r2(o.faturamento), liquido: r2(o.liquido), roas: div(o.faturamento, o.gasto), cpa: div(o.gasto, o.vendas), lucro: r2(o.liquido - o.gasto) })
  const ordena = (a: any, b: any) => b.gasto - a.gasto || b.faturamento - a.faturamento
  const campanhas = [...camp.values()].map(c => ({ ...met(c), conjuntos: [...c.conjuntos.values()].map((s: any) => ({ ...met(s), anuncios: [...s.anuncios.values()].map(met).sort(ordena) })).sort(ordena) })).sort(ordena)

  const gasto = linhas.reduce((s, l) => s + l.gasto, 0), fat = aprovadas.reduce((s, v) => s + (+v.valor_bruto || 0), 0), liq = aprovadas.reduce((s, v) => s + (+v.valor_liquido || 0), 0)
  // por dia (gasto da Meta x faturamento)
  const dias: Record<string, any> = {}
  for (let t = new Date(de + 'T12:00:00Z').getTime(); t <= new Date(ate + 'T12:00:00Z').getTime(); t += 86400e3) { const d = new Date(t).toISOString().slice(0, 10); dias[d] = { dia: d, gasto: 0, faturamento: 0, vendas: 0 } }
  for (const l of linhas) if (dias[l.data]) dias[l.data].gasto += l.gasto
  for (const v of aprovadas) { const d = diaBR(v.aprovado_em); if (dias[d]) { dias[d].faturamento += +v.valor_bruto || 0; dias[d].vendas++ } }
  // por hora, quando o período é um dia só (as vendas; o gasto por hora fica pra depois)
  const horas = de === ate ? Array.from({ length: 24 }, (_, h) => ({ h, vendas: 0, faturamento: 0 })) : null
  if (horas) for (const v of aprovadas) { const h = new Date(new Date(v.aprovado_em).getTime() - 3 * 3600e3).getUTCHours(); horas[h].vendas++; horas[h].faturamento += +v.valor_bruto || 0 }
  const produtos: Record<string, any> = {}
  for (const v of aprovadas) { const k = v.produto || '(sem nome)'; (produtos[k] ||= { nome: k, vendas: 0, faturamento: 0 }); produtos[k].vendas++; produtos[k].faturamento += +v.valor_bruto || 0 }

  return NextResponse.json({
    projeto: { slug: p.slug, nome: p.nome, conta: p.conta_meta, webhook: `${u.origin}/api/rastro/kiwify/${p.token}` },
    projetos: projetos.map(x => ({ slug: x.slug, nome: x.nome })), de, ate, agora: new Date().toISOString(),
    meta: { ok: !!meta.ok, erro: meta.ok ? null : meta.error || null }, ultima_venda_recebida: ultima,
    total: { gasto: r2(gasto), faturamento: r2(fat), liquido: r2(liq), vendas: aprovadas.length, roas: div(fat, gasto), cpa: div(gasto, aprovadas.length), lucro: r2(liq - gasto),
      ticket: div(fat, aprovadas.length), reembolsos: perdidas.length, reembolsos_valor: r2(perdidas.reduce((s, v) => s + (+v.valor_bruto || 0), 0)),
      cliques: linhas.reduce((s, l) => s + l.cliques, 0), impressoes: linhas.reduce((s, l) => s + l.impressoes, 0), compras_meta: linhas.reduce((s, l) => s + l.compras, 0) },
    dias: Object.values(dias).map((d: any) => ({ ...d, gasto: r2(d.gasto), faturamento: r2(d.faturamento) })), horas,
    origens: Object.values(origens).map((o: any) => ({ ...o, faturamento: r2(o.faturamento) })),
    produtos: Object.values(produtos).map((x: any) => ({ ...x, faturamento: r2(x.faturamento) })).sort((a: any, b: any) => b.faturamento - a.faturamento),
    campanhas,
    vendas: vendasT.slice(0, 80).map(v => ({ em: v.aprovado_em, produto: v.produto, valor: +v.valor_bruto || 0, status: v.status, metodo: v.metodo, origem: rotulo.get(v.id) || (v.utm_content ? separa(v.utm_content).nome : v.utm_source || 'Sem origem') })),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
