// Maia: as chaves dos negócios guardadas cifradas no banco (07/11, segurança).
// A chave do WhatsApp de cada negócio (meta.wa.token, do cadastro incorporado) e a do social (meta.social_token) ficam no
// mesmo banco da escola. Com MAIA_CRIPTO_CHAVE na Vercel, elas são gravadas cifradas (AES-256-GCM): quem vê a tabela
// (SQL Editor, backup, uma chave de serviço vazada) não vê a chave do cliente. Sem MAIA_CRIPTO_CHAVE grava como veio (como antes).
// O que já estava gravado sem cifra continua funcionando (decifra devolve o texto como está).
import crypto from 'node:crypto'

const PREFIXO = 'enc1:'
const chave = () => { const k = process.env.MAIA_CRIPTO_CHAVE || ''; return k ? crypto.createHash('sha256').update(k).digest() : null }

export function cifra(texto: string | null | undefined): string | null {
  if (!texto) return texto ?? null
  if (String(texto).startsWith(PREFIXO)) return String(texto)
  const k = chave()
  if (!k) return String(texto)
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', k, iv)
  const corpo = Buffer.concat([c.update(String(texto), 'utf8'), c.final()])
  return PREFIXO + Buffer.concat([iv, c.getAuthTag(), corpo]).toString('base64url')
}

export function decifra(texto: string | null | undefined): string {
  const t = String(texto || '')
  if (!t.startsWith(PREFIXO)) return t
  const k = chave()
  if (!k) return ''   // cifrado, mas a chave sumiu da Vercel: trata como sem chave (o envio falha e avisa)
  try {
    const b = Buffer.from(t.slice(PREFIXO.length), 'base64url')
    const d = crypto.createDecipheriv('aes-256-gcm', k, b.subarray(0, 12))
    d.setAuthTag(b.subarray(12, 28))
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8')
  } catch { return '' }
}

// as chaves de um negócio, já decifradas (só no servidor; nunca sai em resposta de API)
export const tokenWa = (neg: any) => decifra(neg?.meta?.wa?.token)
export const tokenSocial = (neg: any) => decifra(neg?.meta?.social_token)

// o negócio como pode sair pro painel: sem nenhuma chave
export function semChaves(n: any) {
  if (!n || !n.meta) return n
  const meta = { ...n.meta }
  if (meta.wa) meta.wa = { ...meta.wa, token: meta.wa.token ? '(guardada)' : null }
  if (meta.social_token) meta.social_token = '(guardada)'
  return { ...n, meta }
}
