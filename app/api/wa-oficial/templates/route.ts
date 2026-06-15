import { NextResponse } from 'next/server'

// Lista os templates APROVADOS da conta (pro dropdown da tela de disparo).
const TOKEN = process.env.WA_OFICIAL_TOKEN || ''
const WABA_ID = process.env.WA_OFICIAL_WABA_ID || ''
const GRAPH = 'https://graph.facebook.com/v25.0'

export async function GET() {
  if (!TOKEN || !WABA_ID) return NextResponse.json({ ok: false, error: 'config faltando', templates: [] }, { status: 200 })
  try {
    const res = await fetch(`${GRAPH}/${WABA_ID}/message_templates?fields=name,language,status,category,components&limit=200`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return NextResponse.json({ ok: false, error: JSON.stringify(json.error || json), templates: [] }, { status: 200 })
    const templates = (json.data || [])
      .filter((t: any) => t.status === 'APPROVED')
      .map((t: any) => {
        const body = (t.components || []).find((c: any) => c.type === 'BODY')
        const header = (t.components || []).find((c: any) => c.type === 'HEADER')
        const vars = (body?.text?.match(/\{\{\d+\}\}/g) || []).length
        return {
          nome: t.name, idioma: t.language, categoria: (t.category || '').toLowerCase(),
          variaveis: vars, header: header ? (header.format || '').toLowerCase() : null,
          corpo: body?.text || '',
        }
      })
    return NextResponse.json({ ok: true, templates })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'falha', templates: [] }, { status: 200 })
  }
}
