// Oito Posts: o webhook do WhatsApp de venda (14/10). Só recebe eventos da conta de WhatsApp do Oito
// (endereço próprio, configurado na WABA com override_callback_uri): o webhook da escola continua intocado.
//   GET  → verificação da Meta (hub.verify_token = OITO_WA_VERIFY_TOKEN)
//   POST → mensagens recebidas (grava, marca como lida e, 12 s depois, a IA vendedora responde) e status das enviadas
import { NextResponse, after } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { oitoDb as db } from '@/lib/oito/db'
import { conversaDe, marcaLida, fone } from '@/lib/oito/wa'
import { atendeConversa } from '@/lib/oito/vendedor'
import { avisaDono } from '@/lib/oito/servico'

export const maxDuration = 120
const VERIFY = () => process.env.OITO_WA_VERIFY_TOKEN || 'oito-wa-2026'
const SAIR = new Set(['sair', 'parar', 'pare', 'stop', 'cancelar', 'descadastrar', 'salir', 'no mas', 'no más'])
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

function textoDe(m: any) {
  if (m.type === 'text') return m.text?.body || ''
  if (m.type === 'button') return m.button?.text || m.button?.payload || ''
  if (m.type === 'interactive') return m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || ''
  if (m.type === 'reaction') return m.reaction?.emoji ? `(reagiu ${m.reaction.emoji})` : ''
  if (m.type === 'image') return '(mandou uma imagem)' + (m.image?.caption ? ' ' + m.image.caption : '')
  if (m.type === 'audio' || m.type === 'voice') return '(mandou um áudio)'
  if (m.type === 'video') return '(mandou um vídeo)'
  if (m.type === 'document') return '(mandou um arquivo)'
  if (m.type === 'sticker') return '(figurinha)'
  return `(${m.type})`
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
    // mensagens recebidas
    for (const m of v.messages || []) {
      if (await db.um('wa_msgs', { wamid: m.id })) continue   // a Meta repete eventos
      const nome = v.contacts?.find((x: any) => fone(x.wa_id) === fone(m.from))?.profile?.name || null
      const cv = await conversaDe(m.from, { nome })
      const texto = textoDe(m)
      await db.insere('wa_msgs', { conversa_id: cv.id, autor: 'cliente', tipo: m.type, texto, wamid: m.id, status: 'recebido' }).catch(() => null)
      const agora = new Date()
      const sair = SAIR.has(texto.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))
      await db.atualiza('wa_conversas', { id: cv.id }, {
        ultima_msg: texto.slice(0, 200), ultima_msg_em: agora.toISOString(), atualizado_em: agora.toISOString(), janela_ate: new Date(agora.getTime() + 24 * 3600e3).toISOString(),
        nao_lidas: (cv.nao_lidas || 0) + 1, proximo_followup_em: null, ...(nome && !cv.nome ? { nome } : {}), ...(sair ? { optout: true, modo: 'encerrada' } : {}),
      })
      await db.evento('wa_recebida', { cliente_id: cv.cliente_id || null, marca: cv.marca || null, detalhe: { conversa: cv.id } })
      marcaLida(m.id).catch(() => null)
      if (sair) continue
      if (cv.modo === 'ia') responder.add(cv.id)
      else avisaDono('WhatsApp: mensagem nova', `${cv.nome || cv.telefone}: ${texto.slice(0, 160)}`)
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
