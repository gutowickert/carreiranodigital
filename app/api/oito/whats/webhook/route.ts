// Oito Posts: o webhook do WhatsApp de venda (14/10). Só recebe eventos da conta de WhatsApp do Oito
// (endereço próprio, configurado na WABA com override_callback_uri): o webhook da escola continua intocado.
//   GET  → verificação da Meta (hub.verify_token = OITO_WA_VERIFY_TOKEN)
//   POST → mensagens recebidas (grava, marca como lida e, 12 s depois, a IA vendedora responde) e status das enviadas
import { NextResponse, after } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { oitoDb as db } from '@/lib/oito/db'
import { marcaLida, fone } from '@/lib/oito/wa'
import { recebe } from '@/lib/oito/entrada'
import { atendeConversa } from '@/lib/oito/vendedor'
import { avisaDono } from '@/lib/oito/servico'

export const maxDuration = 120
const VERIFY = () => process.env.OITO_WA_VERIFY_TOKEN || 'oito-wa-2026'
const espera = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function GET(req: Request) {
  const u = new URL(req.url)
  if (u.searchParams.get('hub.mode') === 'subscribe' && u.searchParams.get('hub.verify_token') === VERIFY()) return new Response(u.searchParams.get('hub.challenge') || '', { status: 200 })
  return new Response('não', { status: 403 })
}

function assinaturaOk(corpo: string, cab: string | null) {
  const seg = process.env.META_APP_SECRET
  if (!seg) return true
  if (!cab) return false
  const a = Buffer.from(cab), b = Buffer.from('sha256=' + createHmac('sha256', seg).update(corpo, 'utf8').digest('hex'))
  return a.length === b.length && timingSafeEqual(a, b)
}


export async function POST(req: Request) {
  const corpo = await req.text()
  if (!assinaturaOk(corpo, req.headers.get('x-hub-signature-256'))) return NextResponse.json({ erro: 'assinatura' }, { status: 401 })
  const b = JSON.parse(corpo || '{}')
  const meuNumero = process.env.OITO_WA_PHONE_ID
  const responder = new Set<string>()
  for (const entry of b.entry || []) for (const ch of entry.changes || []) {
    const v = ch.value || {}
    if (meuNumero && v.metadata?.phone_number_id && v.metadata.phone_number_id !== meuNumero) continue
    // status das que a gente mandou
    for (const s of v.statuses || []) {
      const st = s.status === 'delivered' ? 'entregue' : s.status === 'read' ? 'lido' : s.status === 'failed' ? 'falhou' : s.status === 'sent' ? 'enviado' : s.status
      await db.atualiza('wa_msgs', { wamid: s.id }, { status: st, ...(s.errors?.[0] ? { erro: String(s.errors[0].title || s.errors[0].message || '').slice(0, 200) } : {}) }).catch(() => null)
    }
    // mensagens recebidas (15/10: a entrada grava, guarda as imagens e descobre a marca; o agente responde)
    for (const m of v.messages || []) {
      const nome = v.contacts?.find((x: any) => fone(x.wa_id) === fone(m.from))?.profile?.name || null
      const r = await recebe(m, nome)
      if (!r) continue
      marcaLida(m.id).catch(() => null)
      if (r.responder) responder.add(r.cv.id)
      else if (!r.sair) avisaDono('WhatsApp: mensagem nova', `${r.cv.nome || r.cv.telefone}: ${r.texto.slice(0, 160)}`)
    }
  }
  // espera uns segundos (a pessoa costuma mandar 2 ou 3 mensagens seguidas) e responde só se nada mais chegou
  if (responder.size) after(async () => {
    await espera(12000)
    for (const id of responder) {
      const ult = (await db.lista('wa_msgs', { conversa_id: id, autor: 'cliente' }, { ordem: 'criado_em', desc: true, limite: 1 }))[0]
      if (ult && Date.now() - new Date(ult.criado_em).getTime() < 11000) continue   // chegou outra: a chamada dela responde
      await atendeConversa(id)
    }
  })
  return NextResponse.json({ ok: true })
}
