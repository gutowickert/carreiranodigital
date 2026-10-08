import { NextRequest, NextResponse, after } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { reuniaoPorCodigo, marcaDaEmpresa, baterNaPorta, pessoaValida, quemEsta, guardarPedaco, transcreverPedaco, resumirReuniao, mensagensDaReuniao, novaMensagem } from '@/lib/reunioes'

export const maxDuration = 300

// UMA REUNIÃO, pelo código do link. Sem login: os convidados não têm conta. O anfitrião prova
// que é ele com a chave (h); cada convidado, com o token que recebe ao bater na porta.
//   GET  → o que a página precisa pra abrir (assunto, quem convida, a marca)
//   POST → acao = bater · estado · liberar · recusar · pedaco (multipart) · sair · encerrar · mensagens · mensagem (o chat)

type Ctx = { params: Promise<{ codigo: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { codigo } = await params
  const r = await reuniaoPorCodigo(codigo)
  if (!r) return NextResponse.json({ ok: false, error: 'reunião não encontrada' }, { status: 404 })
  const h = req.nextUrl.searchParams.get('h')
  const host = !!h && h === r.chave_host
  const marca = await marcaDaEmpresa(r.org_id)
  return NextResponse.json({
    ok: true, codigo: r.codigo, titulo: r.titulo, apresentacao: r.apresentacao || null, quando: r.quando, status: r.status, host, ia_ouvindo: !!r.ia_ouvindo,
    anfitriao: r.criado_por_nome || marca.nome, empresa: marca.nome, cor: marca.cor, logo: marca.logo,
  })
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { codigo } = await params
    const r = await reuniaoPorCodigo(codigo)
    if (!r) return NextResponse.json({ ok: false, error: 'reunião não encontrada' }, { status: 404 })

    const ct = req.headers.get('content-type') || ''
    let b: any = {}, arquivo: File | null = null
    if (ct.includes('multipart/form-data')) {
      const fd = await req.formData()
      fd.forEach((v, k) => { if (k !== 'arquivo') b[k] = String(v) })
      arquivo = fd.get('arquivo') as File | null
    } else b = await req.json().catch(() => ({}))
    const acao = String(b.acao || '')
    const host = !!b.h && b.h === r.chave_host
    const encerrada = r.status === 'encerrada' || r.status === 'resumida'

    if (acao === 'bater') {
      if (encerrada && !host) return NextResponse.json({ ok: true, status: 'encerrada' })
      const p = await baterNaPorta(r, { nome: String(b.nome || ''), host, pessoa_id: b.pessoa_id, token: b.token })
      // o anfitrião que volta a uma reunião encerrada por engano reabre ela
      if (host && encerrada) await sb.from('reunioes').update({ status: 'em_andamento', encerrada_em: null }).eq('id', r.id)
      return NextResponse.json({ ok: true, ...p })
    }

    if (acao === 'estado') {
      // quem está numa tela da reunião pergunta a cada poucos segundos: serve de "ainda estou aqui"
      const p = host ? null : await pessoaValida(r, b.pessoa_id, b.token)
      if (!host && !p) return NextResponse.json({ ok: false, error: 'não reconheci você nesta reunião' }, { status: 403 })
      if (b.pessoa_id) await sb.from('reuniao_pessoas').update({ visto_em: new Date().toISOString() }).eq('id', b.pessoa_id).eq('reuniao_id', r.id)
      const q = await quemEsta(r)
      return NextResponse.json({ ok: true, reuniao: r.status, ia: !!r.ia_ouvindo, status: p?.status || 'dentro', dentro: q.dentro, ...(host ? { esperando: q.esperando } : {}) })
    }

    if (acao === 'liberar' || acao === 'recusar') {
      if (!host) return NextResponse.json({ ok: false, error: 'só quem marcou a reunião pode fazer isso' }, { status: 403 })
      const upd = acao === 'liberar' ? { status: 'dentro', liberada_em: new Date().toISOString() } : { status: 'recusada' }
      await sb.from('reuniao_pessoas').update(upd).eq('id', String(b.alvo || '')).eq('reuniao_id', r.id)
      return NextResponse.json({ ok: true })
    }

    // LIGAR/DESLIGAR A IA (só o anfitrião): desligada, ninguém grava nem transcreve — sem custo
    if (acao === 'ia') {
      if (!host) return NextResponse.json({ ok: false, error: 'só quem marcou a reunião pode fazer isso' }, { status: 403 })
      await sb.from('reunioes').update({ ia_ouvindo: !!b.on }).eq('id', r.id)
      return NextResponse.json({ ok: true, ia: !!b.on })
    }

    if (acao === 'pedaco') {
      // a trava de verdade fica aqui: com a IA desligada, pedaço nenhum é guardado nem transcrito
      if (!r.ia_ouvindo) return NextResponse.json({ ok: true, pausado: true })
      const p = await pessoaValida(r, b.pessoa_id, b.token)
      if (!p || p.status !== 'dentro') return NextResponse.json({ ok: false, error: 'fora da reunião' }, { status: 403 })
      if (!arquivo) return NextResponse.json({ ok: false, error: 'sem arquivo' })
      const buf = Buffer.from(await arquivo.arrayBuffer())
      if (buf.length < 800) return NextResponse.json({ ok: true, vazio: true })
      // o relógio de cada aparelho é um: acerta o começo do pedaço pelo relógio do servidor
      const t0 = Number(b.t0 || 0), agoraCliente = Number(b.agora || 0)
      const emMs = t0 && agoraCliente ? t0 + (Date.now() - agoraCliente) : Date.now() - 20000
      const mime = String(b.mime || arquivo.type || 'audio/webm')
      const g = await guardarPedaco(r, p, emMs, buf, mime)
      if (!g.ok) return NextResponse.json(g)
      after(async () => { try { await transcreverPedaco(r, p, emMs, buf, mime, [(await marcaDaEmpresa(r.org_id)).nome]) } catch (e: any) { console.error('[reuniao] transcrever', e?.message) } })
      return NextResponse.json({ ok: true })
    }

    // O CHAT: só quem está dentro lê e escreve (o anfitrião também tem o próprio pessoa_id/token)
    if (acao === 'mensagens' || acao === 'mensagem') {
      const p = await pessoaValida(r, b.pessoa_id, b.token)
      if (!p || (p.status !== 'dentro' && !host)) return NextResponse.json({ ok: false, error: 'fora da reunião' }, { status: 403 })
      if (acao === 'mensagens') return NextResponse.json({ ok: true, mensagens: await mensagensDaReuniao(r) })
      const texto = String(b.texto || '').trim()
      if (!texto) return NextResponse.json({ ok: false, error: 'mensagem vazia' })
      return NextResponse.json({ ok: true, mensagem: await novaMensagem(r, p, texto) })
    }

    if (acao === 'sair') {
      const p = await pessoaValida(r, b.pessoa_id, b.token)
      if (p) await sb.from('reuniao_pessoas').update({ status: 'saiu' }).eq('id', p.id)
      return NextResponse.json({ ok: true })
    }

    // REABRIR (30/09): encerrou sem querer, ou a conversa continuou. Volta a ficar aberta com o mesmo link;
    // quem já tinha sido liberado entra de novo sem esperar, e o resumo é refeito no próximo fim.
    if (acao === 'reabrir') {
      if (!host) return NextResponse.json({ ok: false, error: 'só quem marcou a reunião pode reabrir' }, { status: 403 })
      await sb.from('reunioes').update({ status: 'em_andamento', encerrada_em: null }).eq('id', r.id)
      return NextResponse.json({ ok: true })
    }

    if (acao === 'encerrar') {
      if (!host) return NextResponse.json({ ok: false, error: 'só quem marcou a reunião pode encerrar' }, { status: 403 })
      if (encerrada) return NextResponse.json({ ok: true, ja: true })
      await sb.from('reunioes').update({ status: 'encerrada', encerrada_em: new Date().toISOString() }).eq('id', r.id)
      await sb.from('reuniao_pessoas').update({ status: 'saiu' }).eq('reuniao_id', r.id).in('status', ['dentro', 'esperando'])
      // os últimos pedaços ainda estão sendo transcritos: espera um pouco antes de resumir
      after(async () => { try { await new Promise(res => setTimeout(res, 25000)); await resumirReuniao(codigo) } catch { /* fica em erro na tabela */ } })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: false, error: 'ação inválida' })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
