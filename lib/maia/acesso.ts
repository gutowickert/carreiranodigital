// Maia: quem pode mexer (03/11). O painel da equipe usa uma senha (MAIA_PAINEL_SENHA; se não houver, a do painel do Oito/Recado)
// e a oficina usa uma chave própria (MAIA_OFICINA_CHAVE). Comparação em tempo constante.
import { timingSafeEqual } from 'node:crypto'

const igual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y) }

export function equipeOk(req: Request) {
  const s = process.env.MAIA_PAINEL_SENHA || process.env.RECADO_PAINEL_SENHA || ''
  const v = req.headers.get('x-senha') || ''
  return !!s && !!v && igual(s, v)
}

export function oficinaOk(req: Request) {
  const s = process.env.MAIA_OFICINA_CHAVE || ''
  const v = req.headers.get('x-chave') || ''
  return !!s && !!v && igual(s, v)
}

export const naoAutorizado = () => Response.json({ erro: 'não autorizado' }, { status: 401 })
