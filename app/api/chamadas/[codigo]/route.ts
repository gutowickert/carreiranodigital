import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { chamadaPorCodigo, guardarPedaco, finalizarChamada } from '@/lib/chamadas'

export const maxDuration = 300

// UMA CHAMADA, pelo código do link. Sem login: o lead não tem conta. Quem convidou prova que é
// ele com a chave (?h= / campo h), e só ele grava pedaços e encerra.
//   GET  → o que a página precisa pra abrir: status, com quem, se o link é de host
//   POST → acao=entrou (marca o começo) · acao=pedaco (um trecho da gravação, multipart) · acao=encerrar

type Ctx = { params: Promise<{ codigo: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { codigo } = await params
  const ch = await chamadaPorCodigo(codigo)
  if (!ch) return NextResponse.json({ ok: false, error: 'chamada não encontrada' }, { status: 404 })
  const h = req.nextUrl.searchParams.get('h')
  const host = !!h && h === ch.chave_host
  return NextResponse.json({
    ok: true, codigo: ch.codigo, status: ch.status, com_video: ch.com_video, host,
    // o lead vê quem convidou; quem convidou vê o lead
    com_quem: host ? (ch.lead_nome || 'o convidado') : ch.criado_por_nome || 'a Carreira no Digital',
    empresa: 'Carreira no Digital',
  })
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { codigo } = await params
    const ch = await chamadaPorCodigo(codigo)
    if (!ch) return NextResponse.json({ ok: false, error: 'chamada não encontrada' }, { status: 404 })

    const ct = req.headers.get('content-type') || ''
    let acao = '', h = '', seq = 0, arquivo: File | null = null, mime = 'audio/webm'
    if (ct.includes('multipart/form-data')) {
      const fd = await req.formData()
      acao = String(fd.get('acao') || ''); h = String(fd.get('h') || ''); seq = Number(fd.get('seq') || 0)
      arquivo = fd.get('arquivo') as File | null; mime = String(fd.get('mime') || (arquivo as any)?.type || 'audio/webm')
    } else {
      const b = await req.json().catch(() => ({} as any))
      acao = String(b.acao || ''); h = String(b.h || '')
    }
    const host = !!h && h === ch.chave_host
    const agora = new Date().toISOString()

    if (acao === 'entrou') {
      // o começo da conversa: a primeira vez que um dos dois se conecta
      if (!ch.iniciada_em) await sb.from('chamadas').update({ iniciada_em: agora, status: 'em_andamento' }).eq('id', ch.id)
      return NextResponse.json({ ok: true })
    }
    if (!host) return NextResponse.json({ ok: false, error: 'só quem convidou pode fazer isso' }, { status: 403 })

    if (acao === 'pedaco') {
      if (!arquivo) return NextResponse.json({ ok: false, error: 'sem arquivo' }, { status: 200 })
      const buf = Buffer.from(await arquivo.arrayBuffer())
      if (!buf.length) return NextResponse.json({ ok: true, vazio: true })
      const r = await guardarPedaco(codigo, seq, buf, mime.split(';')[0])
      return NextResponse.json(r)
    }
    if (acao === 'encerrar') {
      if (ch.status === 'encerrada' || ch.status === 'transcrita') return NextResponse.json({ ok: true, ja: true })
      await sb.from('chamadas').update({ encerrada_em: agora, status: 'encerrada' }).eq('id', ch.id)
      // juntar, transcrever e gravar no histórico leva tempo: responde já e faz depois
      after(async () => { try { await finalizarChamada(codigo) } catch { /* fica em erro na tabela */ } })
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ ok: false, error: 'ação inválida' }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
