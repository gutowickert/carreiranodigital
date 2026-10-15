// Oito Posts: aba Campanhas do painel (13/10), em tempo real, no mesmo jeito do Recado.
// Lê a Meta na hora (mesma conta de anúncios do Recado: OITO_META_CONTA ou RECADO_META_CONTA) e separa por marca pelo NOME da campanha
// ("SALÃO NO FEED", "PRATO NO FEED", "PATA NO FEED", com ou sem acento/espaço). Cruza com o funil do site: visitas, testes, assinaturas, vendas.
// Por anúncio, o cruzamento usa utm_content = nome do anúncio (no Gerenciador: utm_content={{ad.name}}).
//   GET ?dias=1|7|30  (x-senha)
//       &regiao=br|latam  (15/10) só as campanhas e o site da região; o total da região fica na moeda dela (sem somar R$ com US$). Sem o parâmetro, tudo.
import { NextResponse } from 'next/server'
import { getAnunciosDia, campanhasCriadasEm, type AnuncioDia } from '@/lib/meta-ads'
import { oitoDb as db } from '@/lib/oito/db'
import { senhaOk, oitoConfig as cfg, Marca, MARCAS, rotuloMarca, regiaoDe, lerRegiao } from '@/lib/oito/config'

export const maxDuration = 60
const norm = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')
function marcaDaCampanha(nome: string): Marca | null {
  const n = norm(nome)
  // 15/10: o Feed al Día (espanhol; antes No Feed), uma campanha por nicho: "FEED AL DIA · SALON", "... · RESTAURANTE", "... · MASCOTAS"
  if (/(FEEDALDIA|NOFEED)(ES)?SALON/.test(n)) return 'divino'
  if (/(FEEDALDIA|NOFEED)(ES)?RESTAURANTE/.test(n)) return 'sabroso'
  if (/(FEEDALDIA|NOFEED)(ES)?MASCOTA/.test(n)) return 'peludo'
  if (n.includes('SALAONOFEED')) return 'salao'
  if (n.includes('PRATONOFEED')) return 'prato'
  if (n.includes('PATANOFEED')) return 'pata'
  // 13/10: as marcas em espanhol ("FEED DIVINO", "FEED SABROSO", "FEED PELUDO")
  if (n.includes('FEEDDIVINO')) return 'divino'
  if (n.includes('FEEDSABROSO')) return 'sabroso'
  if (n.includes('FEEDPELUDO')) return 'peludo'
  return null
}
const hojeBR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)
const diaBR = (ms: number) => new Date(ms - 3 * 3600e3).toISOString().slice(0, 10)
const r2 = (n: number) => +n.toFixed(2)
const USD_BRL = +(process.env.OITO_USD_BRL || 5.4)
const div = (a: number, b: number) => (b > 0 ? r2(a / b) : null)

export async function GET(req: Request) {
  if (!senhaOk(req.headers.get('x-senha'))) return NextResponse.json({ erro: 'senha' }, { status: 401 })
  const u = new URL(req.url), dias = Math.min(90, Math.max(1, +(u.searchParams.get('dias') || 1)))
  let ate = hojeBR(), desdeDia = dias === 1 ? ate : diaBR(Date.now() - (dias - 1) * 86400e3)
  // período personalizado (13/10): ?de=AAAA-MM-DD&ate=AAAA-MM-DD
  const de = u.searchParams.get('de'), ateP = u.searchParams.get('ate')
  if (de && ateP && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(de) && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(ateP) && de <= ateP) { desdeDia = de; ate = ateP < hojeBR() ? ateP : hojeBR() }
  const desdeTs = `${desdeDia}T03:00:00.000Z`, fimTs = new Date(new Date(ate + 'T03:00:00.000Z').getTime() + 86400e3).toISOString()
  const conta = process.env.OITO_META_CONTA || process.env.RECADO_META_CONTA
  const regiao = lerRegiao(u.searchParams.get('regiao')), MS = MARCAS.filter(m => !regiao || regiaoDe(m) === regiao)

  const [meta, clientes, eventos] = await Promise.all([
    conta ? getAnunciosDia(conta, desdeDia, ate) : Promise.resolve({ ok: false, error: 'falta a conta de anúncios (OITO_META_CONTA)', linhas: [] as AnuncioDia[] }),
    db.lista('clientes', {}, { ordem: 'criado_em', desc: true }),
    db.lista('eventos', {}, { ordem: 'criado_em', desc: true, limite: 8000 }),
  ])
  // 15/10: painel zerado: campanhas criadas antes de painel_desde ficam de fora (os números da Meta são por dia, não dá pra cortar na hora)
  const zero = String((await db.um('estado', { chave: 'painel_desde' }).catch(() => null))?.valor || '')
  let linhas = (meta.linhas || []).filter(l => { const m = marcaDaCampanha(l.campaign_name); return !!m && MS.includes(m) })
  // as campanhas têm o próprio corte (campanhas_desde): zerar o site de novo não pode esconder as campanhas novas que já estão rodando
  const corteCamp = String((await db.um('estado', { chave: 'campanhas_desde' }).catch(() => null))?.valor || '') || zero
  if (corteCamp) { const criadas = await campanhasCriadasEm(linhas.map(l => l.campaign_id)); linhas = linhas.filter(l => (criadas.get(l.campaign_id) || '9') >= corteCamp) }
  const exemplo = new Set(clientes.filter(c => c.exemplo).map(c => c.id))
  const ev = eventos.filter(e => e.criado_em >= desdeTs && e.criado_em < fimTs && (!zero || e.criado_em >= zero) && (!e.cliente_id || !exemplo.has(e.cliente_id)))
  const porCliente = new Map(clientes.map(c => [c.id, c]))

  // o site, por marca e por anúncio (utm_content)
  const site: Record<string, any> = {}
  for (const m of MS) site[m] = { visitas: new Set(), testes: 0, testes_meta: 0, assinaturas: 0, vendas: 0, por_anuncio: {} as Record<string, { testes: number; vendas: number }> }
  for (const e of ev) {
    const s = site[e.marca as string]; if (!s) continue
    const c: any = e.cliente_id ? porCliente.get(e.cliente_id) : null
    const anuncio = c?.utm?.utm_content ? String(c.utm.utm_content) : null
    const daMeta = c && /meta|facebook|instagram|fb|ig/i.test(String(c.utm?.utm_source || ''))
    if (e.tipo === 'visita') s.visitas.add(e.sessao || e.id)
    if (e.tipo === 'lead') { s.testes++; if (daMeta) s.testes_meta++; if (anuncio) { (s.por_anuncio[anuncio] ||= { testes: 0, vendas: 0 }).testes++ } }
    if (e.tipo === 'assinatura_aberta') s.assinaturas++
    if (e.tipo === 'pagou') { s.vendas++; if (anuncio) { (s.por_anuncio[anuncio] ||= { testes: 0, vendas: 0 }).vendas++ } }
  }

  // a Meta, por marca → campanha → anúncio
  const marcas: any = {}
  for (const m of MS) {
    const ls = linhas.filter(l => marcaDaCampanha(l.campaign_name) === m)
    const soma = (f: keyof AnuncioDia) => ls.reduce((a, l) => a + (+l[f] || 0), 0)
    const gasto = soma('gasto'), cliques = soma('cliques'), impressoes = soma('impressoes'), s = site[m]
    const campanhas = new Map<string, any>()
    for (const l of ls) {
      const c = campanhas.get(l.campaign_id) || { id: l.campaign_id, nome: l.campaign_name, gasto: 0, impressoes: 0, cliques: 0, leads_meta: 0, anuncios: new Map<string, any>() }
      c.gasto += l.gasto; c.impressoes += l.impressoes; c.cliques += l.cliques; c.leads_meta += l.leads
      const a = c.anuncios.get(l.ad_id) || { id: l.ad_id, nome: l.ad_name, conjunto: l.adset_name, gasto: 0, impressoes: 0, cliques: 0, leads_meta: 0 }
      a.gasto += l.gasto; a.impressoes += l.impressoes; a.cliques += l.cliques; a.leads_meta += l.leads
      c.anuncios.set(l.ad_id, a); campanhas.set(l.campaign_id, c)
    }
    marcas[m] = {
      nome: rotuloMarca(m),
      gasto: r2(gasto), impressoes, cliques, ctr: impressoes ? r2(cliques / impressoes * 100) : null, cpc: div(gasto, cliques),
      leads_meta: soma('leads'), visitas: s.visitas.size, testes: s.testes, testes_meta: s.testes_meta, assinaturas: s.assinaturas, vendas: s.vendas,
      custo_por_teste: div(gasto, s.testes), custo_por_venda: div(gasto, s.vendas), moeda: cfg.marcas[m].moeda, receita: s.vendas * cfg.marcas[m].preco, retorno: div(s.vendas * cfg.marcas[m].preco * (cfg.marcas[m].moeda === 'USD' ? USD_BRL : 1), gasto),
      conversao_clique_teste: cliques ? r2(s.testes / cliques * 100) : null, conversao_teste_venda: s.testes ? r2(s.vendas / s.testes * 100) : null,
      campanhas: [...campanhas.values()].map(c => ({ ...c, gasto: r2(c.gasto), ctr: c.impressoes ? r2(c.cliques / c.impressoes * 100) : null, cpc: div(c.gasto, c.cliques),
        anuncios: [...c.anuncios.values()].map((a: any) => { const x = s.por_anuncio[a.nome] || { testes: 0, vendas: 0 }; return { ...a, gasto: r2(a.gasto), ctr: a.impressoes ? r2(a.cliques / a.impressoes * 100) : null, cpc: div(a.gasto, a.cliques), testes: x.testes, vendas: x.vendas, custo_por_teste: div(a.gasto, x.testes) } })
          .sort((a: any, b: any) => b.gasto - a.gasto) })).sort((a, b) => b.gasto - a.gasto),
    }
  }
  // receita somada em reais (as marcas em dólar convertidas pela cotação de OITO_USD_BRL, padrão 5,40);
  // com ?regiao=latam a receita fica em dólar (todas as marcas da região são US$) e o retorno converte só pra dividir pelo gasto
  const emUsd = regiao === 'latam'
  const tot = (f: string) => MS.reduce((a, m) => a + (+marcas[m][f] || 0) * (f === 'receita' && !emUsd && cfg.marcas[m].moeda === 'USD' ? USD_BRL : 1), 0)
  return NextResponse.json({
    ok: !!meta.ok, erro: meta.ok ? null : meta.error, conta: conta ? 'ok' : null, desde: desdeDia, ate, dias, regiao, moeda_receita: emUsd ? 'USD' : 'BRL',
    total: { gasto: r2(tot('gasto')), cliques: tot('cliques'), impressoes: tot('impressoes'), testes: tot('testes'), vendas: tot('vendas'), receita: tot('receita'),
      custo_por_teste: div(tot('gasto'), tot('testes')), custo_por_venda: div(tot('gasto'), tot('vendas')), retorno: div(tot('receita') * (emUsd ? USD_BRL : 1), tot('gasto')) },
    marcas,
    // campanhas da conta que não entraram (pra conferir o nome): só as que têm "FEED" no nome
    fora: [...new Set((meta.linhas || []).filter(l => !marcaDaCampanha(l.campaign_name) && /FEED/i.test(l.campaign_name)).map(l => l.campaign_name))].slice(0, 10),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
