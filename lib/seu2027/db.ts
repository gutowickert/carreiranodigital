// Seu 2027: acesso à tabela seu2027_pedidos do Supabase da escola (chave de serviço, só no servidor). Tabela em db/seu2027.sql.
import { randomBytes } from 'crypto'
export const novoCodigo = () => 'S27-' + Array.from(randomBytes(7)).map(b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('')
const U = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string
const K = () => process.env.SUPABASE_SERVICE_ROLE_KEY as string
const H = (extra: Record<string, string> = {}) => ({ apikey: K(), Authorization: 'Bearer ' + K(), 'Content-Type': 'application/json', ...extra })

async function req(caminho: string, opts: any = {}): Promise<any> {
  const r = await fetch(U() + caminho, { ...opts, headers: H(opts.headers), cache: 'no-store' })
  const t = await r.text()
  if (!r.ok) throw new Error(`banco ${r.status}: ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}

export const db = {
  insere: (linha: any) => req('/rest/v1/seu2027_pedidos', { method: 'POST', body: JSON.stringify(linha), headers: { Prefer: 'return=representation' } }).then((r: any[]) => r[0]),
  atualiza: (filtro: string, campos: any) => req(`/rest/v1/seu2027_pedidos?${filtro}`, { method: 'PATCH', body: JSON.stringify({ ...campos, atualizado_em: new Date().toISOString() }), headers: { Prefer: 'return=representation' } }),
  busca: (filtro: string) => req(`/rest/v1/seu2027_pedidos?${filtro}`),
  porCodigo: async (codigo: string) => ((await req(`/rest/v1/seu2027_pedidos?codigo=eq.${encodeURIComponent(codigo)}&limit=1`)) || [])[0] || null,
}
