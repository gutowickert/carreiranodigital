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
  // 07/11 (Maia, segurança): a assinatura foi conferida DE VERDADE (com o segredo), e não só "passou porque o segredo falta"
  const assinado = !!process.env.META_APP_SECRET
  const meuNumero = process.env.OITO_WA_PHONE_ID
  const responder = new Set<string>()
  const maiaResponder = new Set<string>()
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
      // 03/11 (Maia): o dono de um negócio cliente da Maia fala com a Maia dele, não com o agente do Oito.
      // Só com MAIA_LIGADA=1 (as tabelas maia_* precisam existir no banco).
      // 07/11 (segurança): só com a assinatura da Meta conferida e só no número da Maia (OITO_WA_PHONE_ID). Sem isso o "from"
      // pode ser forjado e alguém se passaria pelo dono (veria números e contatos e mandaria mensagem pros clientes dele)
      const maiaPode = (assinado && !!meuNumero && v.metadata?.phone_number_id === meuNumero) || (process.env.MAIA_LOCAL === '1' && !process.env.VERCEL)
      if (process.env.MAIA_LIGADA === '1' && maiaPode) {
        const { negocioDoTelefone } = await import('@/lib/maia/canal')
        const neg = await negocioDoTelefone(m.from).catch(() => null)
        if (neg) {
          const { recebeDoDono } = await import('@/lib/maia/dono')
          const r = await recebeDoDono(neg, m, nome)
          if (r) { marcaLida(m.id).catch(() => null); if (r.responder) maiaResponder.add(r.cv.id) }
          continue
        }
      }
      const r = await recebe(m, nome)
      if (!r) continue
      marcaLida(m.id).catch(() => null)
      if (r.responder) responder.add(r.cv.id)
      else if (!r.sair) avisaDono('WhatsApp: mensagem nova', `${r.cv.nome || r.cv.telefone}: ${r.texto.slice(0, 160)}`)
    }
  }
  // a Maia responde o dono do mesmo jeito: espera ele terminar de mandar (fotos e vídeos costumam vir em sequência)
  if (maiaResponder.size) after(async () => {
    await espera(15000)
    const { maiaDb } = await import('@/lib/maia/db')
    const { respondeDono } = await import('@/lib/maia/dono')
    for (const id of maiaResponder) {
      const ult = (await maiaDb.lista('msgs', { conversa_id: id, autor: 'dono' }, { ordem: 'criado_em', desc: true, limite: 1 }))[0]
      if (ult && Date.now() - new Date(ult.criado_em).getTime() < 14000) continue
      await respondeDono(id).catch(async (e: any) => { const { avisaEquipe } = await import('@/lib/maia/canal'); await avisaEquipe('a Maia falhou com um dono', String(e?.message || e).slice(0, 160)) })
    }
  })
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
