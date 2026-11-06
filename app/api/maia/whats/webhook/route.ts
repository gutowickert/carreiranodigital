// Maia: o webhook do WhatsApp dos NEGÓCIOS (05/11, pro Tech Provider). Cada negócio conectado pelo cadastro incorporado
// tem a conta (WABA) inscrita com este endereço (override_callback_uri, na conexão), então só chega aqui o que é dos negócios.
//   GET  → verificação da Meta (hub.verify_token = MAIA_WA_VERIFY_TOKEN)
//   POST → mensagens dos clientes do negócio (a Maia atende, se a equipe ligou o atendimento), o eco do que o dono
//          respondeu pelo celular (coexistência: a Maia fica quieta 2 h naquela conversa) e o status das enviadas
import { NextResponse, after } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { maiaDb as db } from '@/lib/maia/db'
import { conversa, avisaEquipe } from '@/lib/maia/canal'
import { recebeDoCliente, respondeCliente } from '@/lib/maia/atendente'
import { atendimentoLigado, waDoNegocio, marcaLidaNeg } from '@/lib/maia/wa-negocio'

export const maxDuration = 120
const VERIFY = () => process.env.MAIA_WA_VERIFY_TOKEN || 'maia-wa-2026'
const espera = (ms: number) => new Promise(r => setTimeout(r, ms))
const QUIETA_MS = 2 * 3600e3   // depois que o dono responde pelo celular, a Maia não fala naquela conversa por 2 h

export async function GET(req: Request) {
  const u = new URL(req.url)
  if (u.searchParams.get('hub.mode') === 'subscribe' && u.searchParams.get('hub.verify_token') === VERIFY()) return new Response(u.searchParams.get('hub.challenge') || '', { status: 200 })
  return new Response('não', { status: 403 })
}

function assinaturaOk(corpo: string, cab: string | null) {
  const seg = process.env.MAIA_META_APP_SECRET || process.env.META_APP_SECRET
  if (!seg) return true
  if (!cab) return false
  const a = Buffer.from(cab), b = Buffer.from('sha256=' + createHmac('sha256', seg).update(corpo, 'utf8').digest('hex'))
  return a.length === b.length && timingSafeEqual(a, b)
}

// o texto de qualquer tipo de mensagem
function textoDe(m: any) {
  if (m.type === 'text') return m.text?.body || ''
  if (m.type === 'button') return m.button?.text || ''
  if (m.type === 'interactive') return m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || ''
  if (m.type === 'reaction') return `(reagiu ${m.reaction?.emoji || ''})`
  if (m.type === 'image') return '(mandou uma foto)' + (m.image?.caption ? ' ' + m.image.caption : '')
  if (m.type === 'video') return '(mandou um vídeo)' + (m.video?.caption ? ' ' + m.video.caption : '')
  if (m.type === 'audio') return '(mandou um áudio)'
  if (m.type === 'document') return '(mandou um arquivo)' + (m.document?.caption ? ' ' + m.document.caption : '')
  if (m.type === 'location') return '(mandou a localização)'
  return `(${m.type || 'mensagem'})`
}

export async function POST(req: Request) {
  const corpo = await req.text()
  if (!assinaturaOk(corpo, req.headers.get('x-hub-signature-256'))) return NextResponse.json({ erro: 'assinatura' }, { status: 401 })
  const b = JSON.parse(corpo || '{}')
  const responder = new Map<string, string>()   // conversa → negócio
  for (const entry of b.entry || []) for (const ch of entry.changes || []) {
    const v = ch.value || {}
    const phoneId = v.metadata?.phone_number_id
    if (!phoneId) continue
    const neg = await db.um('negocios', { wa_phone_id: String(phoneId) }).catch(() => null)
    if (!neg || neg.status === 'cancelado') continue

    for (const s of v.statuses || []) {
      const st = s.status === 'delivered' ? 'entregue' : s.status === 'read' ? 'lido' : s.status === 'failed' ? 'falhou' : s.status === 'sent' ? 'enviado' : s.status
      await db.atualiza('msgs', { wamid: s.id }, { status: st }).catch(() => null)
    }

    // coexistência: o que o dono respondeu pelo app do celular chega como eco. Fica na conversa e a Maia sai de cena 2 h.
    for (const e of v.message_echoes || []) {
      const cv = await conversa(neg.id, 'cliente', e.to)
      if (e.id && (await db.um('msgs', { wamid: e.id }))) continue
      await db.insere('msgs', { conversa_id: cv.id, negocio_id: neg.id, autor: 'dono', tipo: e.type || 'texto', texto: textoDe(e), wamid: e.id || null, status: 'enviado' }).catch(() => null)
      await db.atualiza('conversas', { id: cv.id }, { ultima_msg: textoDe(e).slice(0, 200), ultima_msg_em: new Date().toISOString() })
    }

    for (const m of v.messages || []) {
      const nome = v.contacts?.find((x: any) => String(x.wa_id) === String(m.from))?.profile?.name || null
      const referral = m.referral ? { source_id: m.referral.source_id, headline: m.referral.headline } : null
      const r = await recebeDoCliente(neg, { telefone: m.from, nome, texto: textoDe(m), wamid: m.id, referral }).catch(async (e: any) => { await avisaEquipe('erro na entrada de cliente', String(e?.message || e).slice(0, 160), neg.id); return null })
      if (!r) continue
      if (atendimentoLigado(neg)) { marcaLidaNeg(waDoNegocio(neg)!, m.id).catch(() => null); if (r.responder) responder.set(r.cv.id, neg.id) }
    }
  }

  // espera o cliente terminar de mandar e responde só se nada mais chegou e o dono não falou nas últimas 2 h
  if (responder.size) after(async () => {
    await espera(12000)
    for (const [id, negocio_id] of responder) {
      const msgs = await db.lista('msgs', { conversa_id: id }, { ordem: 'criado_em', desc: true, limite: 20 })
      const ultCliente = msgs.find(x => x.autor === 'cliente')
      if (ultCliente && Date.now() - Date.parse(ultCliente.criado_em) < 11000) continue
      const ultDono = msgs.find(x => x.autor === 'dono')
      if (ultDono && Date.now() - Date.parse(ultDono.criado_em) < QUIETA_MS) continue
      await respondeCliente(id).catch(async (e: any) => { await avisaEquipe('a Maia falhou com um cliente', String(e?.message || e).slice(0, 160), negocio_id) })
    }
  })
  return NextResponse.json({ ok: true })
}
