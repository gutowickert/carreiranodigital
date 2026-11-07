// Maia: o link assinado que a equipe manda pro dono conectar o WhatsApp (05/11). Vale 14 dias.
import { createHmac, timingSafeEqual } from 'crypto'

// 07/11 (segurança): a senha do Recado não assina mais o link (quem tem a senha do Recado não pode gerar link de conexão da Maia)
const SEGREDO = () => process.env.MAIA_CONECTAR_SEGREDO || process.env.MAIA_PAINEL_SENHA || ''
const VALIDADE_DIAS = 14

export function assinaLink(negocio_id: string, ate = Date.now() + VALIDADE_DIAS * 86400e3) {
  const exp = Math.floor(ate / 1000)
  const sig = createHmac('sha256', SEGREDO()).update(`${negocio_id}.${exp}`).digest('base64url').slice(0, 32)
  return `${exp}.${sig}`
}
export function linkOk(negocio_id: string, t: string) {
  const [exp, sig] = String(t || '').split('.')
  if (!negocio_id || !exp || !sig || !SEGREDO()) return false
  if (Number(exp) * 1000 < Date.now()) return false
  const certo = createHmac('sha256', SEGREDO()).update(`${negocio_id}.${exp}`).digest('base64url').slice(0, 32)
  const a = Buffer.from(sig), b = Buffer.from(certo)
  return a.length === b.length && timingSafeEqual(a, b)
}

