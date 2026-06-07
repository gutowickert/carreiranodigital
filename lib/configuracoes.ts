import { supabase } from './supabase'

let cache: Record<string, string> | null = null
let cacheTime = 0
const TTL = 60 * 1000 // 60 segundos de cache

export async function carregarConfiguracoes(): Promise<Record<string, string>> {
  const agora = Date.now()
  if (cache && (agora - cacheTime) < TTL) return cache

  const { data } = await supabase.from('configuracoes').select('chave, valor')
  if (!data) return cache || {}

  const novoCache: Record<string, string> = {}
  data.forEach(c => { novoCache[c.chave] = c.valor })
  cache = novoCache
  cacheTime = agora
  return novoCache
}

export async function getConfig(chave: string, padrao: string = ''): Promise<string> {
  const c = await carregarConfiguracoes()
  return c[chave] || padrao
}

export async function getConfigNumero(chave: string, padrao: number = 0): Promise<number> {
  const valor = await getConfig(chave, padrao.toString())
  const n = parseFloat(valor)
  return isNaN(n) ? padrao : n
}

export function invalidarCache() {
  cache = null
  cacheTime = 0
}