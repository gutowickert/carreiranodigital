// Lotérica do Zart (23/11/2026): os bolões que a equipe cadastra no painel (public/zart/painel.html).
// Sem tabela no banco: tudo fica no Storage da escola (bucket "estudio", pasta zart/):
//   zart/boloes.json  -> a lista de bolões
//   zart/config.json  -> só o hash da senha do painel ({"hash": sha256("zart:" + senha)})
//   zart/cotas/*.webp -> as fotos das cotas (com o código da aposta tapado)
// GET é público (o site da lotérica fica na hospedagem do Rodrigo e lê daqui, por isso o CORS aberto).
// POST precisa da senha no cabeçalho x-zart-senha. O prêmio e o próximo concurso vêm da API da Caixa (cache de 1 h).
import { NextRequest, NextResponse } from 'next/server'
import { createHash, randomBytes } from 'crypto'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'
// a API da Caixa recusa servidor de fora do Brasil: esta rota roda em São Paulo
export const preferredRegion = 'gru1'

const BUCKET = 'estudio'
const ARQ_BOLOES = 'zart/boloes.json'
const ARQ_CONFIG = 'zart/config.json'
const PASTA_FOTOS = 'zart/cotas/'
const ID = /^[a-z0-9]{6,24}$/
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-zart-senha',
}

type Bolao = {
  id: string; jogo: string; destaque?: string; concurso: number | null; sorteio: string
  numeros: number | null; jogos: number; cotas: number | null; preco: number | null
  foto: string | null; esgotado: boolean; a_confirmar: boolean
  premio?: string | null; acumulada?: boolean
}
type Dados = { atualizado: string; boloes: Bolao[] }

const json = (b: any, status = 200, extra: Record<string, string> = {}) =>
  NextResponse.json(b, { status, headers: { ...CORS, ...extra } })

// ---------- storage ----------
const store = () => sb.storage.from(BUCKET)
// leitura direta, sem cache nenhum (o fetch do Next e o CDN do Storage podiam devolver a versão anterior)
// devolve null só quando o arquivo não existe; qualquer outra falha dá erro (pra nunca gravar por cima com a lista vazia)
async function lerJson(path: string): Promise<any | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const r = await fetch(`${base}/storage/v1/object/authenticated/${BUCKET}/${path}?v=${Date.now()}`, {
    headers: { Authorization: `Bearer ${chave}`, apikey: chave, 'Cache-Control': 'no-cache' },
    cache: 'no-store',
  })
  if (r.status === 400 || r.status === 404) {
    const t = await r.text()
    if (/not.?found/i.test(t)) return null
    throw new Error('storage ' + r.status)
  }
  if (!r.ok) throw new Error('storage ' + r.status)
  return JSON.parse(await r.text())
}
async function gravarJson(path: string, obj: any) {
  const corpo = Buffer.from(JSON.stringify(obj, null, 1), 'utf8')
  const { error } = await store().upload(path, corpo, { upsert: true, contentType: 'application/json', cacheControl: '0' })
  if (error) throw new Error(error.message)
}
async function lerDados(): Promise<Dados> {
  const d = await lerJson(ARQ_BOLOES)
  if (d && Array.isArray(d.boloes)) return d
  if (d === null) return { atualizado: hojeBR(), boloes: [] }
  throw new Error('boloes.json estranho')
}

// ---------- senha (mesmo jeito da Bocadinho: só o hash fica guardado) ----------
let hashCache: { h: string; em: number } | null = null
async function senhaOk(req: NextRequest) {
  const s = req.headers.get('x-zart-senha') || ''
  if (!s || s.length > 80) return false
  if (!hashCache || Date.now() - hashCache.em > 60_000) {
    const c = await lerJson(ARQ_CONFIG).catch(() => null)
    hashCache = { h: c?.hash || '', em: Date.now() }
  }
  return !!hashCache.h && createHash('sha256').update('zart:' + s).digest('hex') === hashCache.h
}

// ---------- datas no horário de Brasília ----------
function hojeBR() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
const brParaIso = (d?: string) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : null }

// ---------- Caixa ----------
type InfoCaixa = { concurso: number | null; data: string | null; premio: number | null; acumulado: boolean; acumuladoVirada: number | null }
const cacheCaixa = new Map<string, { em: number; info: InfoCaixa | null }>()
const UMA_HORA = 3600_000

function chaveDoJogo(jogo: string): string | null {
  const j = jogo.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()
  if (j.startsWith('MEGA DA VIRADA')) return 'virada'
  if (j.startsWith('MEGA')) return 'megasena'
  if (j.startsWith('LOTOFACIL')) return 'lotofacil'
  if (j.startsWith('QUINA')) return 'quina'
  if (j.startsWith('DUPLA')) return 'duplasena'
  if (j.startsWith('TIMEMANIA')) return 'timemania'
  if (j.startsWith('+MILIONARIA') || j.startsWith('MAIS MILIONARIA')) return 'maismilionaria'
  if (j.startsWith('LOTOMANIA')) return 'lotomania'
  if (j.startsWith('DIA DE SORTE')) return 'diadesorte'
  if (j.startsWith('SUPER SETE')) return 'supersete'
  return null
}

async function caixa(chave: string): Promise<InfoCaixa | null> {
  const c = cacheCaixa.get(chave)
  if (c && Date.now() - c.em < (c.info ? UMA_HORA : 5 * 60_000)) return c.info
  let info: InfoCaixa | null = null
  try {
    const r = await fetch(`https://servicebus2.caixa.gov.br/portaldeloterias/api/${chave}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 3600 },
    } as RequestInit)
    if (r.ok) {
      const d = await r.json()
      const num = (v: any) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : null)
      info = {
        concurso: num(d.numeroConcursoProximo),
        data: brParaIso(d.dataProximoConcurso),
        premio: num(d.valorEstimadoProximoConcurso),
        acumulado: !!d.acumulado,
        acumuladoVirada: num(d.valorAcumuladoConcursoEspecial),
      }
    }
  } catch { /* a Caixa falhou: o site segue sem número */ }
  cacheCaixa.set(chave, { em: Date.now(), info })
  return info
}

// "R$ 65 milhões", "R$ 3,5 milhões", "R$ 1 bilhão", "R$ 800 mil"
function reais(v: number) {
  const f = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  if (v >= 1e9) { const n = Math.floor(v / 1e8) / 10; return `R$ ${f(n)} ${n < 2 ? 'bilhão' : 'bilhões'}` }
  if (v >= 1e6) { const n = Math.floor(v / 1e5) / 10; return `R$ ${f(n)} ${n < 2 ? 'milhão' : 'milhões'}` }
  if (v >= 1e3) return `R$ ${Math.floor(v / 1e3).toLocaleString('pt-BR')} mil`
  return `R$ ${Math.floor(v).toLocaleString('pt-BR')}`
}

// a Virada só aparece na API quando ela é o próximo concurso da Mega (a Caixa não publica antes)
function viradaDe(mega: InfoCaixa | null, ano: string) {
  if (mega && mega.data === `${ano}-12-31`) return { concurso: mega.concurso, premio: mega.premio ? reais(mega.premio) : null, valor: mega.premio, data: mega.data }
  return { concurso: null, premio: null, valor: null, data: `${ano}-12-31` }
}

const TODOS_JOGOS = ['megasena', 'lotofacil', 'quina', 'duplasena', 'timemania', 'maismilionaria', 'lotomania', 'diadesorte', 'supersete']

async function completar(boloes: Bolao[], todosOsJogos = false) {
  const chaves = new Set<string>(todosOsJogos ? TODOS_JOGOS : ['megasena'])
  for (const b of boloes) { const k = chaveDoJogo(b.jogo); if (k && k !== 'virada') chaves.add(k) }
  const infos: Record<string, InfoCaixa | null> = {}
  await Promise.all([...chaves].map(async k => { infos[k] = await caixa(k) }))
  const ano = hojeBR().slice(0, 4)
  const virada = viradaDe(infos.megasena, ano)
  const saida = boloes.map(b => {
    const k = chaveDoJogo(b.jogo)
    const o: Bolao = { ...b, premio: null, acumulada: false }
    if (k === 'virada') {
      o.destaque = 'virada'
      if (!o.concurso && virada.concurso && o.sorteio === virada.data) o.concurso = virada.concurso
      if (virada.premio && (!o.concurso || o.concurso === virada.concurso)) o.premio = virada.premio
      return o
    }
    const i = k ? infos[k] : null
    if (i) {
      if (!o.concurso && i.concurso && (!o.sorteio || o.sorteio === i.data)) o.concurso = i.concurso
      if (!o.sorteio && i.data) o.sorteio = i.data
      if (o.concurso && o.concurso === i.concurso && i.premio) { o.premio = reais(i.premio); o.acumulada = i.acumulado }
    }
    return o
  })
  const caixaResumo: Record<string, any> = {}
  for (const [k, i] of Object.entries(infos)) if (i) caixaResumo[k] = { concurso: i.concurso, data: i.data, premio: i.premio ? reais(i.premio) : null, acumulado: i.acumulado }
  if (infos.megasena?.acumuladoVirada) caixaResumo.megasena.acumulado_para_virada = reais(infos.megasena.acumuladoVirada)
  return { boloes: saida, virada: { concurso: virada.concurso, premio: virada.premio, data: virada.data }, caixa: caixaResumo }
}

// ---------- rotas ----------
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET(req: NextRequest) {
  const dados = await lerDados().catch(() => null)
  if (!dados) return json({ ok: false, erro: 'leitura' }, 500)
  const todos = req.nextUrl.searchParams.get('todos') === '1' && (await senhaOk(req))
  const hoje = hojeBR()
  const lista = todos ? dados.boloes : dados.boloes.filter(b => !b.sorteio || b.sorteio >= hoje)
  const c = await completar(lista, todos) // o painel recebe o próximo sorteio de todos os jogos (pra sugerir a data)
  return json(
    { ok: true, atualizado: dados.atualizado, hoje, ...c },
    200,
    todos ? { 'Cache-Control': 'no-store' } : { 'Cache-Control': 'public, max-age=0, must-revalidate', 'CDN-Cache-Control': 'public, max-age=15' } // o navegador sempre pergunta; a Vercel guarda 15 s,
  )
}

const int = (v: any, min: number, max: number) => { const n = Math.round(Number(v)); return v === '' || v == null || !isFinite(n) || n < min || n > max ? null : n }
const preco = (v: any) => { const n = Number(String(v ?? '').replace(',', '.')); return v === '' || v == null || !isFinite(n) || n <= 0 || n > 100000 ? null : Math.round(n * 100) / 100 }
const minhaFoto = (u: any) => typeof u === 'string' && u.includes(`/${BUCKET}/${PASTA_FOTOS}`)
async function apagarFoto(u: string | null | undefined) {
  if (!u || !minhaFoto(u)) return
  const path = PASTA_FOTOS + u.split(`/${PASTA_FOTOS}`)[1].split('?')[0]
  await store().remove([path]).catch(() => {})
}

export async function POST(req: NextRequest) {
  if (!(await senhaOk(req))) return json({ ok: false, erro: 'senha' }, 401)
  let b: any
  try { b = await req.json() } catch { return json({ ok: false, erro: 'corpo' }, 400) }
  if (b.acao === 'login') return json({ ok: true })

  // foto: o painel já manda reduzida (webp ~1200px); aqui só confere e guarda
  if (b.acao === 'foto') {
    const m = /^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(String(b.dados || ''))
    if (!m) return json({ ok: false, erro: 'formato' }, 400)
    const buf = Buffer.from(m[2], 'base64')
    if (buf.length > 3_000_000) return json({ ok: false, erro: 'grande' }, 400)
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1]
    const path = `${PASTA_FOTOS}${Date.now().toString(36)}-${randomBytes(4).toString('hex')}.${ext}`
    const { error } = await store().upload(path, buf, { contentType: `image/${m[1]}`, cacheControl: '31536000', upsert: false })
    if (error) return json({ ok: false, erro: error.message }, 500)
    return json({ ok: true, url: store().getPublicUrl(path).data.publicUrl })
  }

  const dados = await lerDados()
  const achar = (id: any) => dados.boloes.findIndex(x => x.id === String(id || ''))

  if (b.acao === 'salvar') {
    const e = b.bolao || {}
    const jogo = String(e.jogo || '').trim().toUpperCase().slice(0, 60)
    const sorteio = /^\d{4}-\d{2}-\d{2}$/.test(String(e.sorteio || '')) ? String(e.sorteio) : ''
    if (!jogo) return json({ ok: false, erro: 'Escolha o jogo.' }, 400)
    if (!sorteio) return json({ ok: false, erro: 'Coloque a data do sorteio.' }, 400)
    const foto = e.foto == null || e.foto === '' ? null : String(e.foto)
    if (foto && !minhaFoto(foto) && !/^cotas\/[\w.-]+$/.test(foto)) return json({ ok: false, erro: 'foto' }, 400)
    const novo: Bolao = {
      id: ID.test(String(e.id || '')) ? String(e.id) : randomBytes(6).toString('hex'),
      jogo,
      ...(chaveDoJogo(jogo) === 'virada' ? { destaque: 'virada' } : {}),
      concurso: int(e.concurso, 1, 99999),
      sorteio,
      numeros: int(e.numeros, 1, 100),
      jogos: int(e.jogos, 1, 1000) || 1,
      cotas: int(e.cotas, 1, 10000),
      preco: preco(e.preco),
      foto,
      esgotado: !!e.esgotado,
      a_confirmar: !!e.a_confirmar,
    }
    const i = achar(novo.id)
    if (i >= 0) {
      if (dados.boloes[i].foto !== novo.foto) await apagarFoto(dados.boloes[i].foto)
      dados.boloes[i] = novo
    } else dados.boloes.push(novo)
    dados.atualizado = hojeBR()
    await gravarJson(ARQ_BOLOES, dados)
    return json({ ok: true, id: novo.id })
  }

  if (b.acao === 'esgotado' || b.acao === 'a_confirmar') {
    const i = achar(b.id)
    if (i < 0) return json({ ok: false, erro: 'nao_existe' }, 404)
    dados.boloes[i][b.acao as 'esgotado' | 'a_confirmar'] = !!b.valor
    dados.atualizado = hojeBR()
    await gravarJson(ARQ_BOLOES, dados)
    return json({ ok: true })
  }

  if (b.acao === 'remover') {
    const i = achar(b.id)
    if (i < 0) return json({ ok: false, erro: 'nao_existe' }, 404)
    await apagarFoto(dados.boloes[i].foto)
    dados.boloes.splice(i, 1)
    dados.atualizado = hojeBR()
    await gravarJson(ARQ_BOLOES, dados)
    return json({ ok: true })
  }

  // foto enviada mas o bolão não foi salvo (a pessoa desistiu): apaga pra não sobrar lixo
  if (b.acao === 'descartar_foto') {
    if (!dados.boloes.some(x => x.foto === b.url)) await apagarFoto(b.url)
    return json({ ok: true })
  }

  return json({ ok: false, erro: 'acao' }, 400)
}
