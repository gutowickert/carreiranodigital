// Maia (02/11): manda um texto pro WhatsApp do Guto pelo número do Oito/Maia (pedido dele: receber os resultados do trabalho no WhatsApp).
// Só manda pro WhatsApp do perfil do Guto, nunca pra outro número, e só com a chave (comparada pelo hash, a chave não fica no código).
// Texto livre: funciona dentro da janela de 24 h (ele precisa ter escrito pra esse número no último dia).
import { NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'crypto'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { enviaTexto, conversaDe, registraSaida } from '@/lib/oito/wa'

const HASH = 'ea952bd55612eb6f2be5ed5e509966d8e43dea167e9f34c2d199a99a2d12d390'
const EMAIL = 'guto.wickert@gmail.com'

export async function POST(req: Request) {
  const chave = req.headers.get('x-maia-chave') || ''
  const h = Buffer.from(createHash('sha256').update(chave).digest('hex')), certo = Buffer.from(HASH)
  if (!chave || h.length !== certo.length || !timingSafeEqual(h, certo)) return NextResponse.json({ erro: 'chave' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const textos: string[] = (Array.isArray(b.textos) ? b.textos : [b.texto]).map((t: any) => String(t || '').trim()).filter(Boolean).slice(0, 5)
  if (!textos.length) return NextResponse.json({ erro: 'sem texto' }, { status: 400 })
  const { data } = await sb.from('usuarios_perfil').select('whatsapp').eq('email', EMAIL).limit(1)
  const w = String(data?.[0]?.whatsapp || '').replace(/\D/g, '')
  if (!w) return NextResponse.json({ erro: 'sem whatsapp no perfil' }, { status: 400 })
  const cv = await conversaDe(w.length <= 11 ? '55' + w : w)
  const res = []
  for (const t of textos) { const r = await enviaTexto(cv.telefone, t); await registraSaida(cv, 'sistema', t, r); res.push({ ok: r.ok, erro: r.ok ? undefined : r.erro }) }
  return NextResponse.json({ ok: res.every(r => r.ok), res })
}
