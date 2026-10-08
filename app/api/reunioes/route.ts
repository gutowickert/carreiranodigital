import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { usuarioDaRequest, criarReuniao, marcaDaEmpresa, reuniaoPorCodigo, falasDaReuniao, transcricaoEmTexto, excluirReuniao } from '@/lib/reunioes'

// AS REUNIÕES DO TIME (com login).
//   GET  → as reuniões da empresa, com os links (convidado e anfitrião) e o resumo quando pronto
//   POST → marca uma reunião: { titulo, contexto?, quando?, lead_id? } → os links
//   DELETE ?codigo= → exclui

// o endereço dos links: o da própria instalação (nunca cravado)
const origem = (req: Request) => (process.env.LINK_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '') || new URL(req.url).origin
const links = (req: Request, r: any) => ({ link: `${origem(req)}/r/${r.codigo}`, link_host: `${origem(req)}/r/${r.codigo}?h=${r.chave_host}` })

export async function GET(req: Request) {
  try {
    const eu = await usuarioDaRequest(req.headers.get('authorization'))
    if (!eu) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
    // ?transcricao=<codigo> → a conversa inteira, com o nome de quem falou
    const cod = new URL(req.url).searchParams.get('transcricao')
    if (cod) {
      const r = await reuniaoPorCodigo(cod)
      if (!r || r.org_id !== eu.org_id) return NextResponse.json({ ok: false, error: 'reunião não encontrada' })
      return NextResponse.json({ ok: true, texto: transcricaoEmTexto(r, await falasDaReuniao(r)) })
    }
    const { data } = await sb.from('reunioes').select('id, codigo, chave_host, titulo, contexto, apresentacao, quando, lead_id, lead_nome, criado_por_nome, status, criado_em, iniciada_em, encerrada_em, resumo, erro')
      .eq('org_id', eu.org_id).order('criado_em', { ascending: false }).limit(50)
    const ids = (data || []).map(r => r.id)
    const { data: pessoas } = ids.length ? await sb.from('reuniao_pessoas').select('reuniao_id, nome, papel, status, liberada_em').in('reuniao_id', ids) : { data: [] as any[] }
    const lista = (data || []).map(r => ({
      ...r, chave_host: undefined, ...links(req, r),
      pessoas: (pessoas || []).filter(p => p.reuniao_id === r.id && p.liberada_em).map(p => ({ nome: p.nome, papel: p.papel })),
    }))
    return NextResponse.json({ ok: true, reunioes: lista, empresa: (await marcaDaEmpresa(eu.org_id)).nome, eu: eu.nome })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}

export async function POST(req: Request) {
  try {
    const eu = await usuarioDaRequest(req.headers.get('authorization'))
    if (!eu) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
    const b = await req.json().catch(() => ({} as any))
    const titulo = (b.titulo || '').toString().trim().slice(0, 140)
    if (!titulo) return NextResponse.json({ ok: false, error: 'Dê um assunto pra reunião.' }, { status: 200 })
    let lead_nome: string | null = null
    if (b.lead_id) {
      const { data: lead } = await sb.from('leads').select('id, nome').eq('org_id', eu.org_id).eq('id', b.lead_id).maybeSingle()
      if (!lead) return NextResponse.json({ ok: false, error: 'lead não encontrado' }, { status: 200 })
      lead_nome = lead.nome
    }
    const r = await criarReuniao(eu.org_id, {
      titulo, contexto: (b.contexto || '').toString().slice(0, 30000) || null, quando: b.quando || null,
      lead_id: b.lead_id || null, lead_nome, criado_por: eu.id, criado_por_nome: eu.nome.split(' ')[0] || 'Anfitrião',
    })
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 200 })
    return NextResponse.json({ ok: true, codigo: r.reuniao.codigo, titulo, ...links(req, r.reuniao) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}

// PATCH → edita assunto, contexto e horário: { codigo, titulo?, contexto?, quando? }
export async function PATCH(req: Request) {
  try {
    const eu = await usuarioDaRequest(req.headers.get('authorization'))
    if (!eu) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
    const b = await req.json().catch(() => ({} as any))
    const upd: any = {}
    if (typeof b.titulo === 'string' && b.titulo.trim()) upd.titulo = b.titulo.trim().slice(0, 140)
    if (typeof b.contexto === 'string') upd.contexto = b.contexto.slice(0, 30000) || null
    if (b.quando !== undefined) upd.quando = b.quando || null
    if (typeof b.apresentacao === 'string') upd.apresentacao = b.apresentacao.trim().slice(0, 200) || null
    const { error } = await sb.from('reunioes').update(upd).eq('org_id', eu.org_id).eq('codigo', String(b.codigo || ''))
    return NextResponse.json(error ? { ok: false, error: error.message } : { ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}

// DELETE ?codigo= → exclui a reunião (com gravações, transcrição, chat e resumo)
export async function DELETE(req: Request) {
  try {
    const eu = await usuarioDaRequest(req.headers.get('authorization'))
    if (!eu) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
    const codigo = new URL(req.url).searchParams.get('codigo') || ''
    return NextResponse.json(await excluirReuniao(eu.org_id, codigo))
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
