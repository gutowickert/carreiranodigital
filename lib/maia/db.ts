// Maia: banco e arquivos (03/11). O mesmo jeito do Oito (lib/oito/db.ts), com as tabelas maia_* e a pasta "maia" do storage.
//   Supabase (produção): chave de serviço, só no servidor
//   local (MAIA_LOCAL=1): arquivos JSON em .maia-local/, pra testar tudo sem tocar no banco
// Só igualdade nos filtros: o resto é feito em JS (a escala por negócio é pequena).
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

type Linha = Record<string, any>
type Filtro = Record<string, string | number | boolean | null>
type Opc = { ordem?: string; desc?: boolean; limite?: number; campos?: string }

// 07/11 (segurança): o modo local nunca vale na Vercel, mesmo com MAIA_LOCAL=1 lá: ele abre /api/maia/arquivo sem senha
// e deixa o webhook aceitar evento sem assinatura
export const maiaLocal = () => process.env.MAIA_LOCAL === '1' && !process.env.VERCEL
const PASTA = () => path.join(process.cwd(), process.env.MAIA_LOCAL_PASTA || '.maia-local')

const arq = (tab: string) => path.join(PASTA(), tab + '.json')
const le = (tab: string): Linha[] => { try { return JSON.parse(fs.readFileSync(arq(tab), 'utf8')) } catch { return [] } }
const grava = (tab: string, l: Linha[]) => { fs.mkdirSync(PASTA(), { recursive: true }); fs.writeFileSync(arq(tab), JSON.stringify(l, null, 1)) }
const casa = (l: Linha, f: Filtro) => Object.entries(f).every(([k, v]) => (v === null ? l[k] == null : String(l[k]) === String(v)))
// os valores padrão das colunas (no Supabase quem põe é o banco)
const PADRAO: Record<string, Linha> = {
  negocios: { plano: 'essencial', status: 'implantacao', contexto: {}, marca: {}, meta: {}, equipe_whatsapp: [], aprovacao_equipe: true, ativa_sozinha: false },
  midias: { usos: 0 },
  pecas: { status: 'gerando', midia_ids: [], versao: 1 },
  campanhas: { status: 'rascunho', publico: {}, peca_ids: [], meta_ad_ids: [], simulada: true },
  leads: { origem: 'anuncio', etapa: 'novo', followups: 0 },
  lead_eventos: { detalhe: {} },
  conversas: { modo: 'ia', nao_lidas: 0, ia_respostas: 0, simulada: false },
  msgs: { tipo: 'texto' },
  tarefas: { status: 'fila', dados: {}, resultado: {}, tentativas: 0 },
  eventos: { detalhe: {} },
}
const SERIAL = new Set(['lead_eventos', 'eventos'])
const COM_ATUALIZADO = new Set(['negocios', 'pecas', 'leads'])

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

export const maiaDb = {
  modo: () => (maiaLocal() ? 'local' : 'supabase'),

  async lista(tab: string, f: Filtro = {}, o: Opc = {}): Promise<Linha[]> {
    if (maiaLocal()) {
      let l = le(tab).filter(x => casa(x, f))
      if (o.ordem) l.sort((a, b) => (a[o.ordem!] > b[o.ordem!] ? 1 : a[o.ordem!] < b[o.ordem!] ? -1 : 0) * (o.desc ? -1 : 1))
      return o.limite ? l.slice(0, o.limite) : l
    }
    // o banco devolve no máximo 1000 por vez: pagina até acabar (ou até o limite pedido)
    const todas: Linha[] = []
    for (let de = 0; ; de += 1000) {
      const ate = o.limite ? Math.min(de + 999, o.limite - 1) : de + 999
      const p = [qs(f), `select=${o.campos || '*'}`, o.ordem ? `order=${o.ordem}.${o.desc ? 'desc' : 'asc'}` : ''].filter(Boolean).join('&')
      const parte: Linha[] = await req(`/rest/v1/maia_${tab}?${p}`, { headers: { Range: `${de}-${ate}` } })
      todas.push(...parte)
      if (parte.length < ate - de + 1 || (o.limite && todas.length >= o.limite)) break
    }
    return todas
  },
  async um(tab: string, f: Filtro): Promise<Linha | null> { return (await maiaDb.lista(tab, f, { limite: 1 }))[0] || null },

  async insere(tab: string, linha: Linha): Promise<Linha> {
    if (maiaLocal()) {
      const l = le(tab), agora = new Date().toISOString()
      const nova: Linha = { ...(PADRAO[tab] || {}), id: SERIAL.has(tab) ? l.length + 1 : crypto.randomUUID(), criado_em: agora, ...linha }
      if (COM_ATUALIZADO.has(tab)) nova.atualizado_em = agora
      // as chaves únicas que o banco garante
      if (tab === 'msgs' && nova.wamid && l.some(x => x.wamid === nova.wamid)) throw new Error('duplicate wamid 23505')
      if (tab === 'leads' && nova.telefone && l.some(x => x.negocio_id === nova.negocio_id && x.telefone === nova.telefone)) throw new Error('duplicate lead 23505')
      if (tab === 'conversas' && l.some(x => x.negocio_id === nova.negocio_id && x.canal === nova.canal && x.telefone === nova.telefone)) throw new Error('duplicate conversa 23505')
      if (tab === 'negocios' && nova.dono_whatsapp && l.some(x => x.dono_whatsapp === nova.dono_whatsapp)) throw new Error('duplicate dono 23505')
      l.push(nova); grava(tab, l); return nova
    }
    const r = await req(`/rest/v1/maia_${tab}`, { method: 'POST', body: JSON.stringify(linha), headers: { Prefer: 'return=representation' } })
    return r[0]
  },

  async atualiza(tab: string, f: Filtro, campos: Linha): Promise<Linha[]> {
    if (COM_ATUALIZADO.has(tab)) campos = { ...campos, atualizado_em: new Date().toISOString() }
    if (maiaLocal()) {
      const l = le(tab), mudou: Linha[] = []
      for (const x of l) if (casa(x, f)) { Object.assign(x, campos); mudou.push(x) }
      grava(tab, l); return mudou
    }
    return req(`/rest/v1/maia_${tab}?${qs(f)}`, { method: 'PATCH', body: JSON.stringify(campos), headers: { Prefer: 'return=representation' } })
  },

  async apaga(tab: string, f: Filtro) {
    if (maiaLocal()) { grava(tab, le(tab).filter(x => !casa(x, f))); return }
    await req(`/rest/v1/maia_${tab}?${qs(f)}`, { method: 'DELETE' })
  },

  evento(tipo: string, negocio_id: string | null, detalhe: any = {}) {
    return maiaDb.insere('eventos', { tipo, negocio_id, detalhe }).catch(() => null)
  },

  // ---------- arquivos (bucket privado "maia") ----------
  async sobe(caminho: string, buf: Buffer, tipo: string) {
    if (maiaLocal()) { const p = path.join(PASTA(), 'arquivos', caminho); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); return caminho }
    const r = await fetch(`${U()}/storage/v1/object/maia/${caminho}`, { method: 'POST', headers: { apikey: K(), Authorization: 'Bearer ' + K(), 'Content-Type': tipo, 'x-upsert': 'true' }, body: buf as any })
    if (!r.ok) throw new Error('storage ' + r.status + ': ' + (await r.text()).slice(0, 200))
    return caminho
  },
  async baixa(caminho: string): Promise<Buffer> {
    if (maiaLocal()) return fs.readFileSync(path.join(PASTA(), 'arquivos', caminho))
    const r = await fetch(`${U()}/storage/v1/object/maia/${caminho}`, { headers: { apikey: K(), Authorization: 'Bearer ' + K() } })
    if (!r.ok) throw new Error('storage ' + r.status)
    return Buffer.from(await r.arrayBuffer())
  },
  // link pra mostrar ou mandar no WhatsApp: assinado no Supabase; no modo local, servido pela própria API
  async link(caminho: string | null | undefined, segundos = 60 * 60 * 24 * 7): Promise<string | null> {
    if (!caminho) return null
    if (maiaLocal()) return `/api/maia/arquivo?p=${encodeURIComponent(caminho)}`
    const j = await req(`/storage/v1/object/sign/maia/${caminho}`, { method: 'POST', body: JSON.stringify({ expiresIn: segundos }) })
    return U() + '/storage/v1' + j.signedURL
  },
  // link de envio direto pro armazenamento (a oficina manda o vídeo sem passar pela Vercel). No modo local: null (vai em base64).
  async linkEnvio(caminho: string): Promise<string | null> {
    if (maiaLocal()) return null
    const j = await req(`/storage/v1/object/upload/sign/maia/${caminho}`, { method: 'POST', body: '{}', headers: { 'x-upsert': 'true' } })
    return U() + '/storage/v1' + j.url
  },
  arquivoLocal: (caminho: string) => path.join(PASTA(), 'arquivos', caminho),
}
