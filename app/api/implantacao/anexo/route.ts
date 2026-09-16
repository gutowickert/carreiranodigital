import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'

// Anexos da entrevista de implantação (public/implantacao/*.html): áudio gravado na página,
// foto e documento. O arquivo sobe direto do navegador pro bucket privado `implantacao`
// (URL assinada, sem passar pelo limite de corpo da função) e a lista de cada pergunta fica
// em implantacao_respostas, no campo "<pergunta>__anexos", como JSON. Áudio é transcrito
// no Deepgram na hora da confirmação, pra resposta falada virar texto legível.
export const maxDuration = 120

const BUCKET = 'implantacao'
const MAX_BYTES = 50 * 1024 * 1024

type Anexo = { path: string; nome: string; mime: string; tamanho: number; tipo: 'audio' | 'imagem' | 'arquivo'; transcricao?: string | null; criado_em: string }

async function autorizado(slug: unknown, k: unknown) {
  if (typeof slug !== 'string' || typeof k !== 'string' || !slug || !k) return null
  const { data } = await sb.from('implantacoes').select('slug, chave').eq('slug', slug).maybeSingle()
  return data && data.chave === k ? data : null
}

const campoValido = (c: unknown): c is string => typeof c === 'string' && !!c && c.length <= 100 && !c.includes('__')
const tipoDe = (mime: string): Anexo['tipo'] => mime.startsWith('audio/') ? 'audio' : mime.startsWith('image/') ? 'imagem' : 'arquivo'

async function lerLista(slug: string, campo: string): Promise<Anexo[]> {
  const { data } = await sb.from('implantacao_respostas').select('valor').eq('slug', slug).eq('campo', campo + '__anexos').maybeSingle()
  try { const v = JSON.parse(data?.valor || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}

async function gravarLista(slug: string, campo: string, lista: Anexo[]) {
  const { error } = await sb.from('implantacao_respostas').upsert(
    { slug, campo: campo + '__anexos', valor: JSON.stringify(lista), meta: { tipo: 'anexos', pergunta_campo: campo, total: lista.length }, atualizado_em: new Date().toISOString() },
    { onConflict: 'slug,campo' })
  if (error) throw new Error(error.message)
}

async function comUrl(lista: Anexo[]) {
  if (!lista.length) return []
  const { data } = await sb.storage.from(BUCKET).createSignedUrls(lista.map(a => a.path), 6 * 3600)
  const urls = new Map((data || []).map(s => [s.path, s.signedUrl]))
  return lista.map(a => ({ ...a, url: urls.get(a.path) || null }))
}

async function transcrever(path: string, mime: string): Promise<string | null> {
  const chave = process.env.DEEPGRAM_API_KEY
  if (!chave) return null
  try {
    const { data, error } = await sb.storage.from(BUCKET).download(path)
    if (error || !data) return null
    const r = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=pt&smart_format=true&punctuate=true', {
      method: 'POST',
      headers: { Authorization: `Token ${chave}`, 'Content-Type': mime.split(';')[0] || 'audio/webm' },
      body: Buffer.from(await data.arrayBuffer()),
    })
    const j: any = await r.json().catch(() => null)
    const txt = j?.results?.channels?.[0]?.alternatives?.[0]?.transcript
    return r.ok && typeof txt === 'string' ? (txt.trim() || '(áudio sem fala)') : null
  } catch { return null }
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const imp = await autorizado(sp.get('slug'), sp.get('k'))
  if (!imp) return NextResponse.json({ ok: false, error: 'link inválido' }, { status: 403 })
  const { data, error } = await sb.from('implantacao_respostas').select('campo, valor').eq('slug', imp.slug).like('campo', '%\\_\\_anexos')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  const anexos: Record<string, unknown[]> = {}
  for (const row of data || []) {
    let lista: Anexo[] = []
    try { lista = JSON.parse(row.valor || '[]') } catch {}
    if (Array.isArray(lista) && lista.length) anexos[row.campo.replace(/__anexos$/, '')] = await comUrl(lista)
  }
  return NextResponse.json({ ok: true, anexos })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ ok: false, error: 'corpo inválido' }, { status: 400 })
  const imp = await autorizado(body.slug, body.k)
  if (!imp) return NextResponse.json({ ok: false, error: 'link inválido' }, { status: 403 })
  if (!campoValido(body.campo)) return NextResponse.json({ ok: false, error: 'pergunta inválida' }, { status: 400 })
  const campo = body.campo

  try {
    // 1. o navegador pede onde subir o arquivo
    if (body.acao === 'preparar') {
      const tamanho = Number(body.tamanho) || 0
      if (tamanho <= 0 || tamanho > MAX_BYTES) return NextResponse.json({ ok: false, error: 'arquivo acima de 50 MB' }, { status: 400 })
      const nome = String(body.nome || 'arquivo')
      const ext = (nome.match(/\.([a-z0-9]{1,6})$/i)?.[1] || String(body.mime || '').split('/')[1]?.split(';')[0] || 'bin').toLowerCase()
      const path = `${imp.slug}/${campo.replace(/[^a-z0-9._-]/gi, '_')}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path)
      if (error || !data) throw new Error(error?.message || 'não deu pra preparar o envio')
      return NextResponse.json({ ok: true, path, url: data.signedUrl })
    }

    // 2. subiu: entra na lista da pergunta (e o áudio vira texto)
    if (body.acao === 'confirmar') {
      const path = String(body.path || '')
      if (!path.startsWith(imp.slug + '/')) return NextResponse.json({ ok: false, error: 'arquivo inválido' }, { status: 400 })
      const mime = String(body.mime || 'application/octet-stream')
      const tipo = tipoDe(mime)
      const item: Anexo = {
        path, nome: String(body.nome || 'arquivo').slice(0, 160), mime, tamanho: Number(body.tamanho) || 0, tipo,
        transcricao: tipo === 'audio' ? await transcrever(path, mime) : null,
        criado_em: new Date().toISOString(),
      }
      const lista = (await lerLista(imp.slug, campo)).filter(a => a.path !== path)
      lista.push(item)
      await gravarLista(imp.slug, campo, lista)
      return NextResponse.json({ ok: true, anexos: await comUrl(lista) })
    }

    // 3. tirar um anexo
    if (body.acao === 'remover') {
      const path = String(body.path || '')
      const lista = await lerLista(imp.slug, campo)
      if (!lista.some(a => a.path === path)) return NextResponse.json({ ok: true, anexos: await comUrl(lista) })
      await sb.storage.from(BUCKET).remove([path])
      const nova = lista.filter(a => a.path !== path)
      await gravarLista(imp.slug, campo, nova)
      return NextResponse.json({ ok: true, anexos: await comUrl(nova) })
    }

    return NextResponse.json({ ok: false, error: 'ação inválida' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 500 })
  }
}
