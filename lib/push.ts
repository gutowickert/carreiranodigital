import webpush from 'web-push'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

const PUB = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
const PRIV = process.env.VAPID_PRIVATE_KEY || ''
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:contato@carreiranodigital.com.br'
if (PUB && PRIV) {
  try { webpush.setVapidDetails(SUBJECT, PUB, PRIV) } catch { /* ignore */ }
}

// Envia push pra todos os aparelhos inscritos. Remove inscrições mortas.
export async function enviarPush(titulo: string, corpo: string, url = '/dashboard/whatsapp') {
  if (!PUB || !PRIV) return
  const { data: subs } = await supabase.from('wa_push_subs').select('endpoint, p256dh, auth')
  if (!subs || !subs.length) return
  const payload = JSON.stringify({ titulo, corpo, url })
  await Promise.all(subs.map(async (s: any) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
    } catch (e: any) {
      if (e?.statusCode === 410 || e?.statusCode === 404) {
        await supabase.from('wa_push_subs').delete().eq('endpoint', s.endpoint)
      }
    }
  }))
}
