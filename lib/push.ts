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

/**
 * Manda um aviso pra UM aparelho só, pelo endereço dele.
 *
 * ⚠️ MORA AQUI, e não na rota que usa, porque este é o único arquivo que configura o VAPID e
 * conhece a biblioteca. Uma segunda cópia do `webpush` noutro arquivo significa duas
 * configurações pra manter e dois lugares pra esquecer de limpar endereço morto.
 *
 * Devolve o motivo quando falha, pra tela poder dizer o que aconteceu em vez de "não funcionou".
 */
export async function enviarPushPara(endpoint: string, titulo: string, corpo: string, url = '/dashboard/whatsapp'): Promise<{ ok: boolean; erro?: string; recadastrar?: boolean }> {
  if (!PUB || !PRIV) return { ok: false, erro: 'as chaves de notificação não estão configuradas nesta instalação' }
  const { data: s } = await supabase.from('wa_push_subs').select('endpoint, p256dh, auth').eq('endpoint', endpoint).maybeSingle()
  if (!s) return { ok: false, erro: 'este aparelho não está cadastrado no servidor', recadastrar: true }
  try {
    await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ titulo, corpo, url }))
    return { ok: true }
  } catch (e: any) {
    // endereço morto: limpa, e a tela oferece o cadastro de novo em vez de repetir o teste
    if (e?.statusCode === 410 || e?.statusCode === 404) {
      await supabase.from('wa_push_subs').delete().eq('endpoint', endpoint)
      return { ok: false, erro: 'o cadastro deste aparelho estava vencido — apaguei. Ativa de novo.', recadastrar: true }
    }
    return { ok: false, erro: `o servidor de notificações recusou (${e?.statusCode || 'erro'})` }
  }
}
