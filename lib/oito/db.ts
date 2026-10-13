// Oito Posts: banco e arquivos. Dois modos:
//   Supabase (produção): tabelas oito_* e a pasta "oito" do storage, com a chave de serviço (só no servidor)
//   local (OITO_LOCAL=1): arquivos JSON em .oito-local/, pra testar a máquina inteira sem tocar no banco
// Só igualdade nos filtros: o resto (datas, contagens) é feito em JS, a escala é pequena.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

type Linha = Record<string, any>
type Filtro = Record<string, string | number | boolean | null>
type Opc = { ordem?: string; desc?: boolean; limite?: number; campos?: string }

const LOCAL = () => process.env.OITO_LOCAL === '1'
const PASTA = path.join(process.cwd(), '.oito-local')

// ---------- modo local ----------
const arq = (tab: string) => path.join(PASTA, tab + '.json')
const le = (tab: string): Linha[] => { try { return JSON.parse(fs.readFileSync(arq(tab), 'utf8')) } catch { return [] } }
const grava = (tab: string, l: Linha[]) => { fs.mkdirSync(PASTA, { recursive: true }); fs.writeFileSync(arq(tab), JSON.stringify(l, null, 1)) }
const casa = (l: Linha, f: Filtro) => Object.entries(f).every(([k, v]) => (v === null ? l[k] == null : String(l[k]) === String(v)))
const PADRAO: Record<string, Linha> = {
  clientes: { status: 'teste', exemplo: false, contexto: {}, fotos_modo: 'ia' },
  lotes: { status: 'fila', tentativas: 0, custo_usd: 0 },
  posts: { status: 'pronto' },
  fotos: { usos: 0 },
  eventos: { detalhe: {} },
}

// ---------- modo Supabase ----------
const U = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string
const K = () => process.env.SUPABASE_SERVICE_ROLE_KEY as string
const H = (extra: Record<string, string> = {}) => ({ apikey: K(), Authorization: 'Bearer ' + K(), 'Content-Type': 'application/json', ...extra })
async function req(caminho: string, opts: any = {}): Promise<any> {
  const r = await fetch(U() + caminho, { ...opts, headers: H(opts.headers), cache: 'no-store' })
  const t = await r.text()
  if (!r.ok) throw new Error(`banco ${r.status}: ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}
const qs = (f: Filtro) => Object.entries(f).map(([k, v]) => v === null ? `${k}=is.null` : `${k}=eq.${encodeURIComponent(String(v))}`).join('&')

export const oitoDb = {
  modo: () => (LOCAL() ? 'local' : 'supabase'),

  async lista(tab: string, f: Filtro = {}, o: Opc = {}): Promise<Linha[]> {
    if (LOCAL()) {
      let l = le(tab).filter(x => casa(x, f))
      if (o.ordem) l.sort((a, b) => (a[o.ordem!] > b[o.ordem!] ? 1 : a[o.ordem!] < b[o.ordem!] ? -1 : 0) * (o.desc ? -1 : 1))
      return o.limite ? l.slice(0, o.limite) : l
    }
    const p = [qs(f), `select=${o.campos || '*'}`, o.ordem ? `order=${o.ordem}.${o.desc ? 'desc' : 'asc'}` : '', o.limite ? `limit=${o.limite}` : ''].filter(Boolean).join('&')
    return req(`/rest/v1/oito_${tab}?${p}`)
  },
  async um(tab: string, f: Filtro): Promise<Linha | null> { return (await oitoDb.lista(tab, f, { limite: 1 }))[0] || null },

  async insere(tab: string, linha: Linha): Promise<Linha> {
    if (LOCAL()) {
      const l = le(tab), agora = new Date().toISOString()
      const nova = { ...(PADRAO[tab] || {}), ...(tab === 'eventos' ? { id: l.length + 1 } : { id: crypto.randomUUID() }), criado_em: agora, ...linha }
      if (tab === 'clientes') nova.atualizado_em = agora
      l.push(nova); grava(tab, l); return nova
    }
    const r = await req(`/rest/v1/oito_${tab}`, { method: 'POST', body: JSON.stringify(linha), headers: { Prefer: 'return=representation' } })
    return r[0]
  },

  async atualiza(tab: string, f: Filtro, campos: Linha): Promise<Linha[]> {
    if (tab === 'clientes') campos = { ...campos, atualizado_em: new Date().toISOString() }
    if (LOCAL()) {
      const l = le(tab), mudou: Linha[] = []
      for (const x of l) if (casa(x, f)) { Object.assign(x, campos); mudou.push(x) }
      grava(tab, l); return mudou
    }
    return req(`/rest/v1/oito_${tab}?${qs(f)}`, { method: 'PATCH', body: JSON.stringify(campos), headers: { Prefer: 'return=representation' } })
  },

  async apaga(tab: string, f: Filtro) {
    if (LOCAL()) { grava(tab, le(tab).filter(x => !casa(x, f))); return }
    await req(`/rest/v1/oito_${tab}?${qs(f)}`, { method: 'DELETE' })
  },

  evento(tipo: string, dados: { cliente_id?: string | null; marca?: string | null; sessao?: string | null; detalhe?: any } = {}) {
    return oitoDb.insere('eventos', { tipo, cliente_id: dados.cliente_id || null, marca: dados.marca || null, sessao: dados.sessao || null, detalhe: dados.detalhe || {} }).catch(() => null)
  },

  // ---------- arquivos ----------
  async sobe(caminho: string, buf: Buffer, tipo: string) {
    if (LOCAL()) { const p = path.join(PASTA, 'arquivos', caminho); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); return caminho }
    const r = await fetch(`${U()}/storage/v1/object/oito/${caminho}`, { method: 'POST', headers: { apikey: K(), Authorization: 'Bearer ' + K(), 'Content-Type': tipo, 'x-upsert': 'true' }, body: buf as any })
    if (!r.ok) throw new Error('storage ' + r.status + ': ' + (await r.text()).slice(0, 200))
    return caminho
  },
  async baixa(caminho: string): Promise<Buffer> {
    if (LOCAL()) return fs.readFileSync(path.join(PASTA, 'arquivos', caminho))
    const r = await fetch(`${U()}/storage/v1/object/oito/${caminho}`, { headers: { apikey: K(), Authorization: 'Bearer ' + K() } })
    if (!r.ok) throw new Error('storage ' + r.status)
    return Buffer.from(await r.arrayBuffer())
  },
  // link pra mostrar ou baixar: assinado no Supabase, servido pela própria API no modo local
  async link(caminho: string | null | undefined, segundos = 60 * 60 * 24 * 7): Promise<string | null> {
    if (!caminho) return null
    if (LOCAL()) return `/api/oito/arquivo?p=${encodeURIComponent(caminho)}`
    const j = await req(`/storage/v1/object/sign/oito/${caminho}`, { method: 'POST', body: JSON.stringify({ expiresIn: segundos }) })
    return U() + '/storage/v1' + j.signedURL
  },
  async links(caminhos: (string | null | undefined)[]): Promise<(string | null)[]> {
    const so = caminhos.filter(Boolean) as string[]
    if (LOCAL() || !so.length) return Promise.all(caminhos.map(c => oitoDb.link(c)))
    const j = await req(`/storage/v1/object/sign/oito`, { method: 'POST', body: JSON.stringify({ expiresIn: 60 * 60 * 24 * 7, paths: so }) })
    const m = new Map<string, string>(j.map((x: any) => [x.path, x.signedURL ? U() + '/storage/v1' + x.signedURL : null]))
    return caminhos.map(c => (c ? m.get(c) || null : null))
  },
  arquivoLocal: (caminho: string) => path.join(PASTA, 'arquivos', caminho),
}

// código curto do cliente, sem letras que confundem (0/O, 1/I)
export const novoCodigo = () => Array.from(crypto.randomBytes(6), b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('')
