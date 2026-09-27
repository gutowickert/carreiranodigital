import { NextRequest, NextResponse } from 'next/server'
import { recursoLigado } from '@/lib/recurso'
import { quemUsaMaquina } from '@/lib/maquina-acesso'

export const maxDuration = 60

// FALAR COM A MÁQUINA — o áudio gravado na tela vira texto no campo, e a pessoa manda.
//
// ⚠️ O TEXTO VOLTA PRO CAMPO, NÃO VAI DIRETO PRA MÁQUINA. Transcrição erra nome, número e
// preço — justamente o que não pode ir errado pra uma máquina que escreve anúncio. A pessoa lê,
// corrige se precisar, e aí manda. É um clique a mais e evita a peça com o valor trocado.
//
//  POST { audio: base64, mime }  →  { ok, texto }
export async function POST(req: NextRequest) {
  try {
    if (!(await recursoLigado('maquina'))) return NextResponse.json({ ok: false, error: 'a Máquina ainda não está ligada nesta empresa' }, { status: 200 })
    if (!(await quemUsaMaquina(req.headers.get('authorization')))) return NextResponse.json({ ok: false, error: 'sem acesso' }, { status: 403 })
    const b = await req.json().catch(() => ({}))
    const key = process.env.DEEPGRAM_API_KEY
    if (!key) return NextResponse.json({ ok: false, error: 'A transcrição de áudio ainda não foi instalada nesta empresa (falta a chave da Deepgram). Escreve por enquanto.' }, { status: 200 })
    if (!b.audio) return NextResponse.json({ ok: false, error: 'sem áudio' }, { status: 200 })
    const buf = Buffer.from(b.audio, 'base64')
    if (buf.length < 2000) return NextResponse.json({ ok: false, error: 'áudio curto demais — segura o botão e fala' }, { status: 200 })
    const r = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=pt&smart_format=true&punctuate=true', {
      method: 'POST', headers: { Authorization: `Token ${key}`, 'Content-Type': b.mime || 'audio/webm' }, body: buf,
    })
    const j = await r.json()
    const texto = j?.results?.channels?.[0]?.alternatives?.[0]?.transcript || ''
    if (!texto) return NextResponse.json({ ok: false, error: 'não entendi o áudio — tenta de novo mais perto do microfone' }, { status: 200 })
    return NextResponse.json({ ok: true, texto })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
