// Recado Encantado: e-mail pra família (Guto 10/10: sem WhatsApp na oferta; a entrega é a página da família, o link vai por e-mail).
// Resend (RESEND_API_KEY na Vercel; remetente RECADO_EMAIL_DE, padrão recado@recadoencantando.com.br). Sem a chave, não envia e não quebra.
import { recadoConfig as cfg } from '@/lib/recado/config'

export const linkFamilia = (codigo: string) => `${cfg.urlSite}/obrigado.html?c=${encodeURIComponent(codigo)}`

// suporte (11/10): o endereço aparece no rodapé dos e-mails da família e responder o e-mail cai nele
export const SUPORTE = process.env.RECADO_SUPORTE_EMAIL || 'contato@recadoencantando.com.br'
const rodapeSuporte = () => `<p style="font-size:13px;color:#5f5578;margin-top:10px">Precisa de ajuda? Responde este e-mail ou escreve pra <a href="mailto:${SUPORTE}" style="color:#e0569a">${SUPORTE}</a>.</p>`

export function moldura(titulo: string, texto: string, botao: string, link: string, suporte = true) {
  return `<div style="background:#f8edd8;padding:28px 12px;font-family:Arial,sans-serif"><div style="max-width:520px;margin:0 auto;background:#fff8ec;border-radius:20px;padding:30px 26px;color:#2b2140">
<div style="font-size:22px;font-weight:bold;color:#2a1f6b;margin-bottom:6px">Recado Encantado</div>
<h1 style="font-size:26px;color:#e0569a;margin:14px 0 10px">${titulo}</h1>
<p style="font-size:16px;line-height:1.55;margin:0 0 22px">${texto}</p>
<a href="${link}" style="display:inline-block;background:#e0569a;color:#fff;text-decoration:none;font-weight:bold;font-size:17px;padding:14px 26px;border-radius:999px">${botao}</a>
<p style="font-size:13px;color:#5f5578;margin-top:24px">Guarda este e-mail: o botão leva sempre pra página da família, onde ficam o vídeo e tudo o que chega.</p>${suporte ? rodapeSuporte() : ''}
</div></div>`
}

export async function enviaEmail(para: string, assunto: string, html: string) {
  const chave = process.env.RESEND_API_KEY
  if (!chave || !para) return { enviado: false, motivo: 'e-mail não configurado' }
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + chave, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.RECADO_EMAIL_DE || 'Recado Encantado <recado@recadoencantando.com.br>', to: [para], reply_to: SUPORTE, subject: assunto, html }) })
    const j: any = await r.json().catch(() => ({}))
    return r.ok ? { enviado: true, id: j.id } : { enviado: false, motivo: 'Resend ' + r.status + ': ' + JSON.stringify(j).slice(0, 160) }
  } catch (e: any) { return { enviado: false, motivo: e.message } }
}
