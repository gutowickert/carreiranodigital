// Maia: o custo real da IA (06/11). Cada chamada anota os tokens em maia_eventos 'uso_ia' (ia.ts); aqui vira dinheiro.
// 12/11 (custo): a tabela antiga usava o preço do Haiku 4.5 (US$ 1/5) pro Haiku 5.5, que custa US$ 0,10/0,50: o atendimento
// aparecia 10 vezes mais caro. Agora o preço é por modelo, com o preço do cache lido de cada um (tabela da Anthropic de 03/11/2026).
// Preço em US$ por milhão de tokens: [entrada, saída, cache lido]. MAIA_PRECOS='{"claude-haiku-5-5":[0.1,0.5,0.01]}' troca os valores.
// A voz (ElevenLabs) entra também: cada resposta em áudio anota os caracteres em 'voz_resposta' (voz.ts).
import { maiaDb as db } from './db'

const PRECOS: Record<string, [number, number, number]> = {
  'claude-haiku-5-5': [0.10, 0.50, 0.01],
  'claude-sonnet-5-5': [2, 10, 0.10],
  'claude-opus-5-5': [4, 20, 0.20],
}
// modelo que não está na tabela: o da mesma família (o preço da geração atual)
const FAMILIA: Record<string, [number, number, number]> = { haiku: PRECOS['claude-haiku-5-5'], sonnet: PRECOS['claude-sonnet-5-5'], opus: PRECOS['claude-opus-5-5'] }
export function preco(modelo: string): [number, number, number] {
  try {
    const p = JSON.parse(process.env.MAIA_PRECOS || '{}')[modelo]
    if (Array.isArray(p)) return [+p[0], +p[1], p[2] != null ? +p[2] : +p[0] * 0.1]
  } catch { /* usa a tabela */ }
  return PRECOS[modelo] || FAMILIA[Object.keys(FAMILIA).find(k => modelo.includes(k)) || 'sonnet']
}
const DOLAR = () => +(process.env.MAIA_DOLAR || 5.5)
// a voz: US$ por mil caracteres falados. Estimativa (plano Creator da ElevenLabs) até conferir na fatura: MAIA_VOZ_USD_1K troca
const VOZ_USD_1K = () => +(process.env.MAIA_VOZ_USD_1K || 0.22)

// custo em US$ de uma chamada: entrada normal, cache lido, cache gravado (125% da entrada) e saída
export const usd = (d: any) => { const [pi, po, pc] = preco(d.modelo || ''); return ((d.entrada || 0) * pi + (d.cache_lido || 0) * pc + (d.cache_gravado || 0) * pi * 1.25 + (d.saida || 0) * po) / 1e6 }
export const usdVoz = (d: any) => (d.caracteres || 0) / 1000 * VOZ_USD_1K()

// 07/11 (piloto): o custo de IA de um negócio desde uma data (total e por tipo: cliente, dono, peças, voz...), em reais
export async function custoDoNegocio(negocio_id: string, desde: string) {
  const evs = await db.lista('eventos', { tipo: 'uso_ia', negocio_id }, { desde: ['criado_em', desde] })   // 12/11 (Nando): o filtro da data vai pro banco
  const voz = await db.lista('eventos', { tipo: 'voz_resposta', negocio_id }, { desde: ['criado_em', desde] })
  const porTipo: Record<string, number> = {}
  let total = 0
  for (const e of evs) { const v = usd(e.detalhe || {}); total += v; const t = e.detalhe?.tipo || 'outro'; porTipo[t] = (porTipo[t] || 0) + v }
  for (const e of voz) { const v = usdVoz(e.detalhe || {}); total += v; porTipo.voz = (porTipo.voz || 0) + v }
  const brl = (v: number) => Math.round(v * DOLAR() * 100) / 100
  return { reais: brl(total), por_tipo: Object.fromEntries(Object.entries(porTipo).map(([t, v]) => [t, brl(v)])), chamadas: evs.length, audios: voz.length }
}

export async function custoIA(dias = 30) {
  const desde = Date.now() - dias * 86400e3
  const evs = (await db.lista('eventos', { tipo: 'uso_ia' })).filter(e => Date.parse(e.criado_em) >= desde)
  const voz = (await db.lista('eventos', { tipo: 'voz_resposta' })).filter(e => Date.parse(e.criado_em) >= desde)
  const porTipo: Record<string, { chamadas: number; usd: number; conversas: Set<string> }> = {}
  const porNegocio: Record<string, number> = {}
  const porModelo: Record<string, { chamadas: number; usd: number }> = {}
  let cacheLido = 0, entrada = 0
  for (const e of evs) {
    const d = e.detalhe || {}, v = usd(d), t = d.tipo || 'outro'
    const x = porTipo[t] ||= { chamadas: 0, usd: 0, conversas: new Set() }
    x.chamadas++; x.usd += v; if (d.conversa_id) x.conversas.add(d.conversa_id)
    if (e.negocio_id) porNegocio[e.negocio_id] = (porNegocio[e.negocio_id] || 0) + v
    cacheLido += d.cache_lido || 0; entrada += (d.entrada || 0) + (d.cache_lido || 0)
    // 08/11 (T11): o atendimento do cliente por modelo e fase do modelo misto (barato, refeito, direto)
    if (t === 'cliente') { const k = `${d.modelo || '?'} · ${d.fase || 'sem fase'}`; const y = porModelo[k] ||= { chamadas: 0, usd: 0 }; y.chamadas++; y.usd += v }
  }
  for (const e of voz) {
    const d = e.detalhe || {}, v = usdVoz(d)
    const x = porTipo.voz ||= { chamadas: 0, usd: 0, conversas: new Set() }
    x.chamadas++; x.usd += v; if (d.conversa_id) x.conversas.add(d.conversa_id)
    if (e.negocio_id) porNegocio[e.negocio_id] = (porNegocio[e.negocio_id] || 0) + v
  }
  const brl = (v: number) => Math.round(v * DOLAR() * 100) / 100
  const cli = porTipo.cliente
  return {
    dias, dolar: DOLAR(),
    cliente_por_modelo: Object.fromEntries(Object.entries(porModelo).map(([k, y]) => [k, { chamadas: y.chamadas, reais: Math.round(y.usd * DOLAR() * 1000) / 1000 }])),
    cliente_reais_por_conversa: cli?.conversas.size ? Math.round(cli.usd / cli.conversas.size * DOLAR() * 1000) / 1000 : null,
    por_tipo: Object.fromEntries(Object.entries(porTipo).map(([t, x]) => [t, { chamadas: x.chamadas, conversas: x.conversas.size, reais: brl(x.usd), reais_por_conversa: x.conversas.size ? brl(x.usd / x.conversas.size) : null }])),
    por_negocio: Object.fromEntries(Object.entries(porNegocio).map(([n, v]) => [n, brl(v)])),
    cache: entrada ? Math.round(cacheLido / entrada * 100) + '% da entrada veio do cache' : 'sem dados',
  }
}
