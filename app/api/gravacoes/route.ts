import { NextRequest, NextResponse, after } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { meuPerfil } from '@/lib/quem-eu-vejo'
import { BUCKET, configDe, salvarConfig, caminhoParte, extDe, processarGravacao, aplicarGravacao, type Contexto } from '@/lib/gravacoes'

export const maxDuration = 300

// GRAVAÇÕES (29/10/2026) — ver lib/gravacoes.ts.
//  GET  ?id=…            → uma gravação (status, análise, o que foi aplicado)
//  GET  ?contexto=encontro&contexto_id=… → a última gravação daquele encontro/compromisso/turma
//  GET                   → config + gravações recentes + compromissos abertos
//  POST {acao:'config', ligado?, aplicar_sozinho?, apagar_audio_dias?}
//  POST {acao:'iniciar', contexto_tipo, contexto_id?, titulo?, mime}      → {id}
//  POST {acao:'url_parte', id, seq}                                       → {url} (link assinado de upload)
//  POST {acao:'parte_ok', id, seq}                                        → conta os pedaços
//  POST {acao:'finalizar', id, duracao_s}                                 → processa depois da resposta
//  POST {acao:'reprocessar', id} · {acao:'aplicar', id, escolhas?} · {acao:'descartar', id}
//  POST {acao:'compromisso', id, status}  (feito / cancelado / aberto)
const erro = (m: string, s = 200) => NextResponse.json({ ok: false, error: m }, { status: s })

async function quem(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const eu = await meuPerfil(auth)
  return { auth, eu }
}

export async function GET(req: NextRequest) {
  const { eu } = await quem(req)
  if (!eu) return erro('faça login', 401)
  const q = req.nextUrl.searchParams
  const id = q.get('id')
  if (id) {
    const { data } = await sb.from('gravacoes').select('*').eq('id', id).eq('org_id', eu.org_id).maybeSingle()
    if (!data) return erro('gravação não encontrada')
    const { data: comp } = await sb.from('compromissos').select('*').eq('gravacao_id', id)
    return NextResponse.json({ ok: true, gravacao: data, compromissos: comp || [] })
  }
  const ctx = q.get('contexto'), ctxId = q.get('contexto_id')
  if (ctx && ctxId) {
    const { data } = await sb.from('gravacoes').select('id, status, titulo, criado_em, analise, aplicado, erro, duracao_s').eq('org_id', eu.org_id).eq('contexto_tipo', ctx).eq('contexto_id', ctxId).neq('status', 'descartada').order('criado_em', { ascending: false }).limit(1)
    return NextResponse.json({ ok: true, gravacao: data?.[0] || null, config: await configDe(eu.id) })
  }
  const [cfg, gs, cs, pessoas] = await Promise.all([
    configDe(eu.id),
    sb.from('gravacoes').select('id, status, titulo, contexto_tipo, contexto_id, projeto_id, criado_em, duracao_s, erro, analise, aplicado, usuario_id').eq('org_id', eu.org_id).neq('status', 'descartada').order('criado_em', { ascending: false }).limit(60),
    sb.from('compromissos').select('*').eq('org_id', eu.org_id).eq('status', 'aberto').order('prazo', { ascending: true, nullsFirst: false }).limit(300),
    sb.from('usuarios_perfil').select('id, nome, apelido').eq('org_id', eu.org_id).eq('ativo', true),
  ])
  return NextResponse.json({ ok: true, eu: eu.id, config: cfg, gravacoes: gs.data || [], compromissos: cs.data || [], pessoas: pessoas.data || [] })
}

export async function POST(req: NextRequest) {
  const { auth, eu } = await quem(req)
  if (!eu) return erro('faça login', 401)
  const b = await req.json().catch(() => ({} as any))
  const acao = String(b.acao || '')
  const origem = req.nextUrl.origin

  if (acao === 'config') {
    const c: any = {}
    if (typeof b.ligado === 'boolean') c.ligado = b.ligado
    if (typeof b.aplicar_sozinho === 'boolean') c.aplicar_sozinho = b.aplicar_sozinho
    if (Number.isFinite(Number(b.apagar_audio_dias))) c.apagar_audio_dias = Math.max(1, Math.min(365, Math.round(Number(b.apagar_audio_dias))))
    return NextResponse.json({ ok: true, config: await salvarConfig(eu.id, eu.org_id, c) })
  }

  if (acao === 'iniciar') {
    const cfg = await configDe(eu.id)
    if (!cfg.ligado) return erro('A gravação está desligada. Liga em Gravações.')
    const tipo: Contexto = ['encontro', 'agenda', 'turma', 'livre'].includes(b.contexto_tipo) ? b.contexto_tipo : 'livre'
    let projeto_id: string | null = null
    if (tipo === 'encontro' && b.contexto_id) {
      const { data: m } = await sb.from('projeto_marcos').select('projeto_id').eq('id', b.contexto_id).eq('org_id', eu.org_id).maybeSingle()
      if (!m) return erro('encontro não encontrado')
      projeto_id = m.projeto_id
    }
    const { data, error } = await sb.from('gravacoes').insert({
      org_id: eu.org_id, usuario_id: eu.id, contexto_tipo: tipo, contexto_id: b.contexto_id || null, projeto_id,
      titulo: b.titulo ? String(b.titulo).slice(0, 160) : null, mime: String(b.mime || 'audio/webm').slice(0, 60), status: 'gravando',
    }).select('id').single()
    if (error || !data) return erro(error?.message || 'não consegui começar a gravação')
    return NextResponse.json({ ok: true, id: data.id })
  }

  const id = String(b.id || '')
  const { data: g } = await sb.from('gravacoes').select('id, org_id, usuario_id, status, mime, partes').eq('id', id).eq('org_id', eu.org_id).maybeSingle()
  if (!g && acao !== 'compromisso') return erro('gravação não encontrada')

  if (acao === 'url_parte') {
    if (g!.status !== 'gravando') return erro('essa gravação já foi finalizada')
    const seq = Math.max(0, Math.floor(Number(b.seq) || 0))
    const path = caminhoParte(g!.org_id, g!.id, seq, extDe(g!.mime || 'audio/webm'))
    const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true })
    if (error || !data) return erro(error?.message || 'não consegui o link de envio')
    return NextResponse.json({ ok: true, url: data.signedUrl })
  }
  if (acao === 'parte_ok') {
    const seq = Math.floor(Number(b.seq) || 0)
    if (seq + 1 > (g!.partes || 0)) await sb.from('gravacoes').update({ partes: seq + 1 }).eq('id', id)
    return NextResponse.json({ ok: true })
  }
  if (acao === 'finalizar' || acao === 'reprocessar') {
    await sb.from('gravacoes').update({ status: 'processando', finalizada_em: new Date().toISOString(), ...(b.duracao_s ? { duracao_s: Math.round(Number(b.duracao_s)) } : {}), erro: null }).eq('id', id)
    // espera uns segundos pelo último pedaço e processa depois de responder
    after(async () => { await new Promise(r => setTimeout(r, acao === 'finalizar' ? 4000 : 0)); await processarGravacao(id, origem, auth) })
    return NextResponse.json({ ok: true })
  }
  if (acao === 'aplicar') {
    try { const feito = await aplicarGravacao(id, origem, auth, b.escolhas || null); return NextResponse.json({ ok: true, aplicado: feito }) }
    catch (e: any) { return erro(e?.message || 'erro ao aplicar') }
  }
  if (acao === 'descartar') {
    const pasta = `${g!.org_id}/${g!.id}`
    const { data: arqs } = await sb.storage.from(BUCKET).list(pasta, { limit: 10000 })
    if (arqs?.length) await sb.storage.from(BUCKET).remove(arqs.map(a => `${pasta}/${a.name}`))
    await sb.from('gravacoes').update({ status: 'descartada', audio_apagado: true, transcricao: null }).eq('id', id)
    return NextResponse.json({ ok: true })
  }
  if (acao === 'compromisso') {
    const st = ['aberto', 'feito', 'cancelado'].includes(b.status) ? b.status : 'feito'
    const { data: c } = await sb.from('compromissos').select('id, agenda_evento_id').eq('id', id).eq('org_id', eu.org_id).maybeSingle()
    if (!c) return erro('compromisso não encontrado')
    await sb.from('compromissos').update({ status: st, feito_em: st === 'feito' ? new Date().toISOString() : null }).eq('id', c.id)
    if (c.agenda_evento_id) await sb.from('agenda_eventos').update({ concluido: st !== 'aberto' }).eq('id', c.agenda_evento_id)
    return NextResponse.json({ ok: true })
  }
  return erro('ação inválida')
}
