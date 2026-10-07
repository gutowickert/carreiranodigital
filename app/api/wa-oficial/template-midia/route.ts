import { NextRequest, NextResponse } from 'next/server'
import { chamadaPermitida } from '@/lib/exigir-login'

// Cadastra na Meta um modelo de mensagem com MÍDIA no topo (vídeo ou imagem), que a rota
// criar-templates não faz (07/10/2026, disparo da Imersão Deu Venda). A Meta exige um exemplo da
// mídia: o servidor baixa o arquivo do link, sobe pela API de upload do app e usa o "handle" no
// modelo. O acesso da Meta (token) só existe aqui no servidor.
// POST { name, texto, exemplos: string[], botoes?: string[], midiaUrl, tipo?: 'VIDEO'|'IMAGE', categoria? }
// GET ?nome=a,b  → status dos modelos (APPROVED / PENDING / REJECTED + motivo)
export const maxDuration = 60
const TOKEN = process.env.WA_OFICIAL_TOKEN || ''
const WABA_ID = process.env.WA_OFICIAL_WABA_ID || ''
const GRAPH = 'https://graph.facebook.com/v25.0'

export async function POST(req: NextRequest) {
  if (!(await chamadaPermitida(req))) return NextResponse.json({ ok: false, error: 'não autorizado' }, { status: 401 })
  if (!TOKEN || !WABA_ID) return NextResponse.json({ ok: false, error: 'falta WA_OFICIAL_TOKEN/WA_OFICIAL_WABA_ID' })
  const b = await req.json().catch(() => ({} as any))
  const { name, texto, exemplos = [], botoes = [], midiaUrl } = b
  const tipo = b.tipo === 'IMAGE' ? 'IMAGE' : 'VIDEO'
  if (!name || !texto || !midiaUrl) return NextResponse.json({ ok: false, error: 'falta name, texto ou midiaUrl' })
  const auth = { Authorization: `Bearer ${TOKEN}` }
  try {
    const app = await (await fetch(`${GRAPH}/app`, { headers: auth })).json()
    if (!app.id) return NextResponse.json({ ok: false, etapa: 'app', error: app.error || app })
    const arq = Buffer.from(await (await fetch(midiaUrl)).arrayBuffer())
    const mime = tipo === 'VIDEO' ? 'video/mp4' : 'image/jpeg'
    const ses = await (await fetch(`${GRAPH}/${app.id}/uploads?file_name=exemplo&file_length=${arq.length}&file_type=${mime}`, { method: 'POST', headers: auth })).json()
    if (!ses.id) return NextResponse.json({ ok: false, etapa: 'sessao', error: ses.error || ses })
    const up = await (await fetch(`${GRAPH}/${ses.id}`, { method: 'POST', headers: { Authorization: `OAuth ${TOKEN}`, file_offset: '0' }, body: arq })).json()
    if (!up.h) return NextResponse.json({ ok: false, etapa: 'upload', error: up.error || up })
    const componentes: any[] = [
      { type: 'HEADER', format: tipo, example: { header_handle: [up.h] } },
      { type: 'BODY', text: texto, ...(exemplos.length ? { example: { body_text: [exemplos] } } : {}) },
    ]
    if (botoes.length) componentes.push({ type: 'BUTTONS', buttons: botoes.slice(0, 3).map((t: string) => ({ type: 'QUICK_REPLY', text: String(t).slice(0, 25) })) })
    const r = await (await fetch(`${GRAPH}/${WABA_ID}/message_templates`, {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, language: 'pt_BR', category: (b.categoria || 'MARKETING').toUpperCase(), components: componentes }),
    })).json()
    return NextResponse.json(r.id ? { ok: true, id: r.id, status: r.status } : { ok: false, etapa: 'modelo', error: r.error || r })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'falha' })
  }
}

export async function GET(req: NextRequest) {
  if (!(await chamadaPermitida(req))) return NextResponse.json({ ok: false, error: 'não autorizado' }, { status: 401 })
  const nomes = (req.nextUrl.searchParams.get('nome') || '').split(',').filter(Boolean)
  const r = await (await fetch(`${GRAPH}/${WABA_ID}/message_templates?fields=name,status,rejected_reason,category&limit=200`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json()
  const lista = (r.data || []).filter((t: any) => !nomes.length || nomes.includes(t.name))
  return NextResponse.json({ ok: true, templates: lista.map((t: any) => ({ nome: t.name, status: t.status, motivo: t.rejected_reason || null, categoria: t.category })) })
}
