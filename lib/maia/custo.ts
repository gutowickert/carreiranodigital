// Maia: o custo real da IA (06/11). Cada chamada anota os tokens em maia_eventos 'uso_ia' (ia.ts); aqui vira dinheiro.
// Preço em US$ por milhão de tokens. É estimativa até conferir na fatura: MAIA_PRECOS='{"claude-haiku-5-5":[1,5]}' troca os valores.
import { maiaDb as db } from './db'

const PADRAO: Record<string, [number, number]> = { haiku: [1, 5], sonnet: [3, 15], opus: [5, 25] }
function preco(modelo: string): [number, number] {
  try { const p = JSON.parse(process.env.MAIA_PRECOS || '{}'); if (p[modelo]) return p[modelo] } catch { /* usa o padrão */ }
  return PADRAO[(Object.keys(PADRAO).find(k => modelo.includes(k)) || 'sonnet')]
}
const DOLAR = () => +(process.env.MAIA_DOLAR || 5.5)

// custo em US$ de uma chamada: entrada normal, cache lido (10%), cache gravado (125%) e saída
const usd = (d: any) => { const [pi, po] = preco(d.modelo || ''); return ((d.entrada || 0) * pi + (d.cache_lido || 0) * pi * 0.1 + (d.cache_gravado || 0) * pi * 1.25 + (d.saida || 0) * po) / 1e6 }

// 07/11 (piloto): o custo de IA de um negócio desde uma data (total e por tipo: cliente, dono, peças...), em reais
export async function custoDoNegocio(negocio_id: string, desde: string) {
  const evs = (await db.lista('eventos', { tipo: 'uso_ia', negocio_id })).filter(e => e.criado_em >= desde)
  const porTipo: Record<string, number> = {}
  let total = 0
  for (const e of evs) { const v = usd(e.detalhe || {}); total += v; const t = e.detalhe?.tipo || 'outro'; porTipo[t] = (porTipo[t] || 0) + v }
  const brl = (v: number) => Math.round(v * DOLAR() * 100) / 100
  return { reais: brl(total), por_tipo: Object.fromEntries(Object.entries(porTipo).map(([t, v]) => [t, brl(v)])), chamadas: evs.length }
}

export async function custoIA(dias = 30) {
  const desde = Date.now() - dias * 86400e3
  const evs = (await db.lista('eventos', { tipo: 'uso_ia' })).filter(e => Date.parse(e.criado_em) >= desde)
  const porTipo: Record<string, { chamadas: number; usd: number; conversas: Set<string> }> = {}
  const porNegocio: Record<string, number> = {}
  let cacheLido = 0, entrada = 0
  for (const e of evs) {
    const d = e.detalhe || {}, v = usd(d), t = d.tipo || 'outro'
    const x = porTipo[t] ||= { chamadas: 0, usd: 0, conversas: new Set() }
    x.chamadas++; x.usd += v; if (d.conversa_id) x.conversas.add(d.conversa_id)
    if (e.negocio_id) porNegocio[e.negocio_id] = (porNegocio[e.negocio_id] || 0) + v
    cacheLido += d.cache_lido || 0; entrada += (d.entrada || 0) + (d.cache_lido || 0)
  }
  const brl = (v: number) => Math.round(v * DOLAR() * 100) / 100
  return {
    dias, dolar: DOLAR(),
    por_tipo: Object.fromEntries(Object.entries(porTipo).map(([t, x]) => [t, { chamadas: x.chamadas, conversas: x.conversas.size, reais: brl(x.usd), reais_por_conversa: x.conversas.size ? brl(x.usd / x.conversas.size) : null }])),
    por_negocio: Object.fromEntries(Object.entries(porNegocio).map(([n, v]) => [n, brl(v)])),
    cache: entrada ? Math.round(cacheLido / entrada * 100) + '% da entrada veio do cache' : 'sem dados',
  }
}
