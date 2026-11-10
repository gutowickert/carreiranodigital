// Análise rápida de um site pro diagnóstico (conector MCP): baixa o HTML com segurança (sem SSRF),
// tira título, descrição, h1, texto do topo, WhatsApp, pixel da Meta, tag do Google, telefones,
// e mede a velocidade no celular pelo PageSpeed Insights (GOOGLE_API_KEY, se existir).
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const MAX_BYTES = 3_000_000
const MAX_REDIRECTS = 5

// ---------- proteção contra SSRF ----------
function ipv4Privado(ip: string): boolean {
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some(n => isNaN(n))) return true
  const [a, b] = p
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 192 && b === 0 && p[2] === 0) || (a === 198 && (b === 18 || b === 19))
}
function ipPrivado(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) return ipv4Privado(ip)
  if (v === 6) {
    const s = ip.toLowerCase()
    const m = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (m) return ipv4Privado(m[1])
    return s === '::' || s === '::1' || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || s.startsWith('::ffff:') || s.startsWith('64:ff9b:')
  }
  return true
}

// devolve um motivo de recusa, ou null se a URL pode ser acessada
export async function urlInsegura(u: URL): Promise<string | null> {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'só aceito endereços http ou https'
  if (u.username || u.password) return 'endereço com usuário/senha não é aceito'
  if (u.port && !['80', '443', '8080', '8443'].includes(u.port)) return 'porta não permitida'
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan') || host.endsWith('.home.arpa'))
    return 'endereço interno não é aceito'
  if (isIP(host)) return ipPrivado(host) ? 'endereço interno/privado não é aceito' : null
  if (!host.includes('.')) return 'endereço interno não é aceito'
  try {
    const ips = await lookup(host, { all: true, verbatim: true })
    if (!ips.length) return 'o domínio não existe'
    if (ips.some(i => ipPrivado(i.address))) return 'o domínio aponta pra um endereço interno/privado'
  } catch { return 'o domínio não existe (DNS não encontrou)' }
  return null
}

export function normalizarUrl(entrada: string): URL | null {
  let s = String(entrada || '').trim()
  if (!s) return null
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s
  try { return new URL(s) } catch { return null }
}

// ---------- download do HTML, conferindo cada redirecionamento ----------
async function baixar(inicial: URL, sinal: AbortSignal): Promise<{ status: number; url: string; html: string }> {
  let atual = inicial
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const motivo = await urlInsegura(atual)
    if (motivo) throw new Error(i ? `redirecionou pra um endereço recusado (${motivo})` : motivo)
    const r = await fetch(atual, {
      redirect: 'manual', signal: sinal, cache: 'no-store',
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8', 'accept-language': 'pt-BR,pt;q=0.9,en;q=0.5' },
    })
    const destino = r.headers.get('location')
    if (r.status >= 300 && r.status < 400 && destino) {
      atual = new URL(destino, atual)
      try { await r.body?.cancel() } catch {}
      continue
    }
    // lê no máximo MAX_BYTES
    let html = ''
    if (r.body) {
      const leitor = r.body.getReader()
      const dec = new TextDecoder('utf-8')
      let total = 0
      while (true) {
        const { done, value } = await leitor.read()
        if (done) break
        total += value.byteLength
        html += dec.decode(value, { stream: true })
        if (total > MAX_BYTES) { try { await leitor.cancel() } catch {} ; break }
      }
    }
    return { status: r.status, url: atual.toString(), html }
  }
  throw new Error('redirecionamentos demais')
}

// ---------- extração ----------
const ENT: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ccedil: 'ç', atilde: 'ã', otilde: 'õ',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', acirc: 'â', ecirc: 'ê', ocirc: 'ô', agrave: 'à',
  Ccedil: 'Ç', Atilde: 'Ã', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
}
function decodificar(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      try { return String.fromCodePoint(n) } catch { return m }
    }
    return ENT[e] ?? m
  })
}
const limpar = (s: string) => decodificar(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()

function meta(html: string, nome: string): string | null {
  const re = new RegExp(`<meta\\b[^>]*(?:name|property)\\s*=\\s*["']${nome}["'][^>]*>`, 'i')
  const tag = html.match(re)?.[0]
  const c = tag?.match(/content\s*=\s*("([^"]*)"|'([^']*)')/i)
  return c ? limpar(c[2] ?? c[3] ?? '') || null : null
}

function textoVisivel(html: string): string {
  const corpo = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html
  return limpar(corpo
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1>/gi, ' '))
}

function telefones(html: string, texto: string): string[] {
  const achados: string[] = []
  const add = (t: string) => {
    const d = t.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
    if (d.length < 10 || d.length > 11 || /^(\d)\1+$/.test(d)) return
    const f = d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
    if (!achados.includes(f)) achados.push(f)
  }
  for (const m of html.matchAll(/href\s*=\s*["']tel:([^"']+)["']/gi)) { try { add(decodeURIComponent(m[1])) } catch { add(m[1]) } }
  for (const m of texto.matchAll(/(?:\+?55[\s.-]?)?\(?\b\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g)) add(m[0])
  return achados.slice(0, 3)
}

function linksWhatsapp(html: string): string[] {
  const out: string[] = []
  for (const m of html.matchAll(/(?:https?:)?\/\/(?:wa\.me|api\.whatsapp\.com|web\.whatsapp\.com|chat\.whatsapp\.com)\/[^"'\s<>)]*|whatsapp:\/\/[^"'\s<>)]*/gi)) {
    const l = decodificar(m[0]).slice(0, 200)
    if (!out.includes(l)) out.push(l)
    if (out.length >= 5) break
  }
  return out
}

// ---------- PageSpeed (celular) ----------
async function velocidadeCelular(url: string): Promise<{ velocidade: any; motivo?: string }> {
  const chave = process.env.GOOGLE_API_KEY
  const q = new URLSearchParams({ url, strategy: 'mobile', category: 'performance', locale: 'pt-BR' })
  if (chave) q.set('key', chave)
  try {
    const r = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`, { signal: AbortSignal.timeout(45_000), cache: 'no-store' })
    const j: any = await r.json().catch(() => null)
    if (!r.ok || !j || j.error) {
      const bruta = String(j?.error?.message || `HTTP ${r.status}`)
      const msg = /quota/i.test(bruta) ? 'acabou a cota diária do Google' : bruta
      return { velocidade: null, motivo: `PageSpeed falhou${chave ? '' : ' (sem GOOGLE_API_KEY a cota grátis do Google costuma acabar)'}: ${String(msg).slice(0, 200)}` }
    }
    const lh = j.lighthouseResult || {}
    const a = lh.audits || {}
    const score = lh.categories?.performance?.score
    return {
      velocidade: {
        nota_0a100: typeof score === 'number' ? Math.round(score * 100) : null,
        leitura: typeof score === 'number' ? (score >= 0.9 ? 'rápido' : score >= 0.5 ? 'médio' : 'lento') : null,
        primeira_pintura: a['first-contentful-paint']?.displayValue ?? null,
        maior_elemento_lcp: a['largest-contentful-paint']?.displayValue ?? null,
        bloqueio_total: a['total-blocking-time']?.displayValue ?? null,
        mudanca_layout_cls: a['cumulative-layout-shift']?.displayValue ?? null,
        indice_velocidade: a['speed-index']?.displayValue ?? null,
      },
    }
  } catch (e: any) {
    return { velocidade: null, motivo: 'PageSpeed não respondeu a tempo: ' + String(e?.message || e).slice(0, 150) }
  }
}

// ---------- função principal ----------
export async function analisarSite(entrada: string) {
  const u = normalizarUrl(entrada)
  if (!u) return { ok: false, erro: 'endereço inválido' }
  const recusa = await urlInsegura(u)
  if (recusa) return { ok: false, erro: `endereço recusado: ${recusa}` }

  const pagespeed = velocidadeCelular(u.toString())
  let pagina: { status: number; url: string; html: string } | null = null
  let erroAbrir: string | null = null
  try { pagina = await baixar(u, AbortSignal.timeout(12_000)) } catch (e: any) {
    erroAbrir = e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'o site não respondeu em 12 segundos' : String(e?.cause?.code || e?.message || e)
  }
  const ps = await pagespeed

  if (!pagina) {
    return { ok: true, abriu: false, status: null, url_final: null, erro: erroAbrir, velocidade: ps.velocidade, ...(ps.motivo ? { velocidade_motivo: ps.motivo } : {}) }
  }
  const { html } = pagina
  const texto = textoVisivel(html)
  const titulo = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => limpar(m[1])).filter(Boolean).slice(0, 3)
  return {
    ok: true,
    abriu: pagina.status >= 200 && pagina.status < 400,
    status: pagina.status,
    url_final: pagina.url,
    titulo: titulo ? limpar(titulo) || null : null,
    descricao: meta(html, 'description') || meta(html, 'og:description'),
    h1s,
    texto_topo: texto.slice(0, 400),
    links_whatsapp: linksWhatsapp(html),
    tem_pixel_meta: /fbq\(|connect\.facebook\.net\/[a-z_]+\/fbevents\.js/i.test(html),
    tem_google_tag: /gtag\(|googletagmanager\.com/i.test(html),
    telefones: telefones(html, texto),
    velocidade: ps.velocidade,
    ...(ps.motivo ? { velocidade_motivo: ps.motivo } : {}),
    ...(texto.length < 80 ? { observacao: 'quase nenhum texto no HTML: o site provavelmente monta a página por JavaScript (o conteúdo real pode não aparecer aqui)' } : {}),
  }
}
