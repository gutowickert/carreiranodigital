// Recado Encantado: acesso às tabelas recado_* e à pasta de arquivos "recado" do Supabase da escola (chave de serviço, só no servidor).
const U = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string
const K = () => process.env.SUPABASE_SERVICE_ROLE_KEY as string
const H = (extra: Record<string, string> = {}) => ({ apikey: K(), Authorization: 'Bearer ' + K(), 'Content-Type': 'application/json', ...extra })

async function req(caminho: string, opts: any = {}): Promise<any> {
  const r = await fetch(U() + caminho, { ...opts, headers: H(opts.headers) })
  const t = await r.text()
  if (!r.ok) throw new Error(`banco ${r.status}: ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}

export const recadoDb = {
  insere: (tab: string, linha: any) => req(`/rest/v1/recado_${tab}`, { method: 'POST', body: JSON.stringify(linha), headers: { Prefer: 'return=representation' } }).then((r: any[]) => r[0]),
  atualiza: (tab: string, filtro: string, campos: any) => req(`/rest/v1/recado_${tab}?${filtro}`, { method: 'PATCH', body: JSON.stringify(campos), headers: { Prefer: 'return=representation' } }),
  busca: (tab: string, filtro: string) => req(`/rest/v1/recado_${tab}?${filtro}`),
  rpc: (fn: string, args: any) => req(`/rest/v1/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) }),
  evento: (pedido_id: string, tipo: string, detalhe: any = {}) => req('/rest/v1/recado_eventos', { method: 'POST', body: JSON.stringify({ pedido_id, tipo, detalhe }) }),
  sobe: async (caminho: string, buffer: Buffer, tipo: string) => {
    const r = await fetch(`${U()}/storage/v1/object/recado/${caminho}`, { method: 'POST', headers: { apikey: K(), Authorization: 'Bearer ' + K(), 'Content-Type': tipo, 'x-upsert': 'true' }, body: buffer as any })
    if (!r.ok) throw new Error('storage ' + r.status + ': ' + (await r.text()).slice(0, 200))
    return caminho
  },
  linkAssinado: async (caminho: string, segundos = 60 * 60 * 24 * 30) => {
    const j = await req(`/storage/v1/object/sign/recado/${caminho}`, { method: 'POST', body: JSON.stringify({ expiresIn: segundos }) })
    return U() + '/storage/v1' + j.signedURL
  },
}
