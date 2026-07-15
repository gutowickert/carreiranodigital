import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

export const maxDuration = 60

// Transcreve gravações de ligações da API4COM usando o Groq (Whisper).
// Roda no servidor (onde o API4COM_TOKEN já existe), então ninguém precisa copiar token.
// Trigger: POST { groqKey, limite?, teste?, debug? }  — groqKey é a chave do Groq (gate simples).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const dgKey: string = body.dgKey || body.groqKey || ''
  const limite: number = body.teste ? 1 : (body.limite || 5)
  const debug: boolean = !!body.debug || !!body.teste
  if (!dgKey) return NextResponse.json({ ok: false, error: 'falta dgKey (chave Deepgram)' }, { status: 200 })

  const token = process.env.API4COM_TOKEN || ''
  if (!token) return NextResponse.json({ ok: false, error: 'API4COM_TOKEN ausente no servidor' }, { status: 200 })

  // ligações com gravação e conversa real (>10s), ainda sem transcrição
  const { data: ligs } = await supabase.from('ligacoes')
    .select('id, gravacao_url, duracao, metadata')
    .not('gravacao_url', 'is', null)
    .gt('duracao', 10)
    .order('criado_em', { ascending: false })
    .limit(400)
  const pendentes = (ligs || []).filter(l => !(l.metadata && (l.metadata.transcrita || l.metadata.transcricao))).slice(0, limite)

  // tenta baixar a gravação com várias estratégias de auth
  async function baixar(url: string) {
    const tentativas: any[] = [
      { nome: 'auth-raw', headers: { Authorization: token } },
      { nome: 'auth-bearer', headers: { Authorization: `Bearer ${token}` } },
      { nome: 'sem-auth', headers: {} as any },
      { nome: 'token-query', url: url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token) },
    ]
    for (const t of tentativas) {
      try {
        const r = await fetch(t.url || url, { headers: t.headers || {} })
        const ct = r.headers.get('content-type') || ''
        if (r.ok && (ct.includes('audio') || ct.includes('octet') || ct.includes('mpeg'))) {
          return { ok: true, buf: Buffer.from(await r.arrayBuffer()), via: t.nome, ct }
        }
        if (debug) tentativas._log = (tentativas._log || []).concat(`${t.nome}:${r.status}/${ct}`)
      } catch (e: any) { if (debug) tentativas._log = (tentativas._log || []).concat(`${t.nome}:ERR`) }
    }
    return { ok: false, log: (tentativas as any)._log || [] }
  }

  let ok = 0, falha = 0
  const dbg: any[] = []
  for (const l of pendentes) {
    const b = await baixar(l.gravacao_url)
    if (!b.ok) { falha++; if (debug) dbg.push({ id: l.id.slice(0, 8), baixou: false, log: b.log }); continue }
    const kb = Math.round(b.buf.length / 1024)
    try {
      const tr = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=pt&smart_format=true&punctuate=true', {
        method: 'POST',
        headers: { Authorization: `Token ${dgKey}`, 'Content-Type': b.ct || 'audio/mpeg' },
        body: b.buf,
      })
      const rawResp = await tr.text()
      let j: any = null; try { j = JSON.parse(rawResp) } catch {}
      const txt = j?.results?.channels?.[0]?.alternatives?.[0]?.transcript
      if (!tr.ok || typeof txt !== 'string') {
        falha++; if (debug) dbg.push({ id: l.id.slice(0, 8), baixou: true, via: b.via, ct: b.ct, kb, dgStatus: tr.status, dgRaw: rawResp.slice(0, 250) }); continue
      }
      const meta = { ...(l.metadata || {}), transcricao: txt.trim(), transcrita: true }
      await supabase.from('ligacoes').update({ metadata: meta }).eq('id', l.id)
      ok++
      if (debug) dbg.push({ id: l.id.slice(0, 8), baixou: true, via: b.via, ct: b.ct, kb, dur: l.duracao, preview: txt.trim().slice(0, 120) })
    } catch (e: any) { falha++; if (debug) dbg.push({ id: l.id.slice(0, 8), baixou: true, via: b.via, ct: b.ct, kb, erro: e.message }) }
  }

  const restam = (ligs || []).filter(l => !(l.metadata && l.metadata.transcricao)).length - ok
  return NextResponse.json({ ok: true, processados: pendentes.length, transcritos: ok, falhas: falha, restam: Math.max(0, restam), debug: debug ? dbg : undefined })
}

export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'transcrever-ligacoes' })
}
