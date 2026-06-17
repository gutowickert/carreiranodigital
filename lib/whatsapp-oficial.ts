// Envio pela API Oficial do WhatsApp (Cloud API / Meta).
// Usado pelos disparos. Atendimento normal continua no Z-API.
const TOKEN = process.env.WA_OFICIAL_TOKEN || ''
const PHONE_ID = process.env.WA_OFICIAL_PHONE_ID || ''
const GRAPH = 'https://graph.facebook.com/v25.0'

// Normaliza telefone: só dígitos, garante DDI 55 (Brasil)
export function foneOficial(raw: string): string {
  let d = (raw || '').replace(/\D/g, '')
  if (d && !d.startsWith('55') && d.length >= 10 && d.length <= 11) d = '55' + d
  return d
}

// Envia uma mensagem de TEXTO de SESSÃO (resposta livre). Só funciona dentro da
// janela de 24h após a última mensagem do contato; fora disso a Meta recusa e só
// vale TEMPLATE. Usado pela caixa "WhatsApp Disparos" pra responder quem respondeu.
export async function enviarTexto(to: string, body: string): Promise<{ ok: boolean; wamid?: string | null; error?: string }> {
  if (!TOKEN || !PHONE_ID) return { ok: false, error: 'Faltam WA_OFICIAL_TOKEN/WA_OFICIAL_PHONE_ID' }
  try {
    const res = await fetch(`${GRAPH}/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: foneOficial(to), type: 'text', text: { preview_url: false, body } }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: JSON.stringify((json && json.error) || json) }
    return { ok: true, wamid: json.messages?.[0]?.id || null }
  } catch (e: any) {
    return { ok: false, error: (e && e.message) || 'falha no envio' }
  }
}

// Envia uma mensagem de TEMPLATE (único jeito de iniciar conversa na API oficial).
// componentes = variáveis do template (ex: [{ type:'body', parameters:[{type:'text', text:'Guto'}] }])
export async function enviarTemplate(
  to: string,
  template: string,
  idioma = 'pt_BR',
  componentes?: any[]
): Promise<{ ok: boolean; wamid?: string | null; error?: string }> {
  if (!TOKEN || !PHONE_ID) return { ok: false, error: 'Faltam WA_OFICIAL_TOKEN/WA_OFICIAL_PHONE_ID' }
  const body: any = {
    messaging_product: 'whatsapp',
    to: foneOficial(to),
    type: 'template',
    template: { name: template, language: { code: idioma } },
  }
  if (componentes && componentes.length) body.template.components = componentes
  try {
    const res = await fetch(`${GRAPH}/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: JSON.stringify((json && json.error) || json) }
    return { ok: true, wamid: json.messages?.[0]?.id || null }
  } catch (e: any) {
    return { ok: false, error: (e && e.message) || 'falha no envio' }
  }
}
