import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// Salvar conversas ESTRATÉGICAS do Agente Interno (só o que o dono marca como importante).
// Guarda em webhook_logs (origem='agente-conversa') pra não exigir tabela nova.
//  POST {email, titulo, mensagens, resumo?} -> salva
//  GET  ?email=            -> lista as salvas do usuário
//  GET  ?id=               -> abre uma (com as mensagens)
//  DELETE ?id=             -> apaga
const PERMITIDOS = ['guto.wickert@gmail.com', 'debairros@hotmail.com', 'ricardovognach@hotmail.com']
const ok = (e: string) => PERMITIDOS.includes((e || '').toLowerCase())

export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}))
    const email = (b.email || '').toLowerCase()
    if (!ok(email)) return NextResponse.json({ ok: false, error: 'sem acesso' }, { status: 200 })
    if (!Array.isArray(b.mensagens) || !b.mensagens.length) return NextResponse.json({ ok: false, error: 'nada pra salvar' }, { status: 200 })
    const titulo = (b.titulo || b.mensagens.find((m: any) => m.role === 'user')?.content || 'Conversa').toString().slice(0, 120)
    const { data, error } = await supabase.from('webhook_logs')
      .insert({ origem: 'agente-conversa', evento: 'salva', status: 'processado', payload: { email, titulo, resumo: (b.resumo || '').toString().slice(0, 500), mensagens: b.mensagens } })
      .select('id').single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
    return NextResponse.json({ ok: true, id: data.id, titulo })
  } catch (e: any) { return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 }) }
}

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')
    const email = (req.nextUrl.searchParams.get('email') || '').toLowerCase()
    if (id) {
      const { data } = await supabase.from('webhook_logs').select('payload, recebido_em').eq('id', id).eq('origem', 'agente-conversa').maybeSingle()
      if (!data || !ok((data.payload as any)?.email)) return NextResponse.json({ ok: false, error: 'não encontrada' }, { status: 200 })
      const p: any = data.payload
      return NextResponse.json({ ok: true, titulo: p.titulo, mensagens: p.mensagens || [], em: data.recebido_em })
    }
    if (!ok(email)) return NextResponse.json({ ok: false, error: 'sem acesso' }, { status: 200 })
    const { data } = await supabase.from('webhook_logs').select('id, payload, recebido_em').eq('origem', 'agente-conversa').order('recebido_em', { ascending: false }).limit(200)
    const salvas = (data || []).filter((r: any) => (r.payload?.email || '').toLowerCase() === email)
      .map((r: any) => ({ id: r.id, titulo: r.payload?.titulo || 'Conversa', resumo: r.payload?.resumo || '', em: r.recebido_em, n: (r.payload?.mensagens || []).length }))
    return NextResponse.json({ ok: true, salvas })
  } catch (e: any) { return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 }) }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ ok: false, error: 'falta id' }, { status: 200 })
    await supabase.from('webhook_logs').delete().eq('id', id).eq('origem', 'agente-conversa')
    return NextResponse.json({ ok: true })
  } catch (e: any) { return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 }) }
}
