// Oito Posts: aviso de venda no WhatsApp (13/10), pelo número oficial da escola, com o modelo próprio "oito_aviso_venda"
// (fora da janela de 24 h a Meta só aceita modelo aprovado). Vai pro Guto (pelo perfil dele, como no Recado), pro Rick e pro Nando.
// Os números extras ficam em OITO_AVISO_WHATS (separados por vírgula); sem a variável, vale a lista abaixo.
import { enviarTemplate } from '@/lib/whatsapp-oficial'

export const MODELO_AVISO = 'oito_aviso_venda'
const PADRAO = ['5551981260498', '5551995187713']   // Rick, Nando

const limpo = (s: string) => String(s || '').replace(/[\n\r\t]+/g, ' · ').replace(/\s{2,}/g, ' ').trim().slice(0, 900)

export async function avisaVendaWhats(marcaNome: string, detalhe: string) {
  const extras = (process.env.OITO_AVISO_WHATS || PADRAO.join(',')).split(',').map(n => n.replace(/\D/g, '')).filter(n => n.length >= 12)
  const destinos = new Set(extras)
  // o Guto: o mesmo perfil que recebe os avisos do Recado
  const quem = process.env.RECADO_AVISO_WHATS_EMAIL || process.env.RECADO_AVISO_EMAIL
  if (quem) {
    try {
      const { supabaseAdmin: sb } = await import('@/lib/supabase-admin')
      const { data } = await sb.from('usuarios_perfil').select('whatsapp').eq('email', quem).not('whatsapp', 'is', null).limit(1)
      const w = String(data?.[0]?.whatsapp || '').replace(/\D/g, '')
      if (w) destinos.add(w.length <= 11 ? '55' + w : w)
    } catch {}
  }
  const params = [{ type: 'body', parameters: [{ type: 'text', text: limpo(marcaNome) }, { type: 'text', text: limpo(detalhe) }] }]
  const res = await Promise.all([...destinos].map(n => enviarTemplate(n, MODELO_AVISO, 'pt_BR', params).then(r => ({ n: n.slice(-4), ok: r.ok, erro: r.error })).catch(e => ({ n: n.slice(-4), ok: false, erro: String(e) }))))
  return res
}
