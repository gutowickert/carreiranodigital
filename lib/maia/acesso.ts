// Maia: quem pode mexer (03/11). O painel da equipe usa uma senha (MAIA_PAINEL_SENHA) e a oficina usa uma chave própria
// (MAIA_OFICINA_CHAVE). Comparação em tempo constante. Sem a variável na Vercel, a rota fica fechada (nunca aberta).
// 07/11 (segurança): a senha do painel do Recado NÃO vale mais aqui (o painel da Maia vê todos os negócios: precisa de senha
// própria), e quem erra a senha 10 vezes em 15 min fica 15 min bloqueado (por IP, por instância do servidor).
import { timingSafeEqual } from 'node:crypto'

const igual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y) }

const JANELA_MS = 15 * 60e3, MAX_ERROS = 10
const erros = new Map<string, { n: number; desde: number }>()
const ipDe = (req: Request) => (req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0] || 'sem-ip').trim()

function confere(req: Request, segredo: string, cab: string) {
  const ip = ipDe(req), agora = Date.now()
  const e = erros.get(ip)
  if (e && agora - e.desde > JANELA_MS) erros.delete(ip)
  const atual = erros.get(ip)
  if (atual && atual.n >= MAX_ERROS) return false
  const v = req.headers.get(cab) || ''
  const ok = !!segredo && !!v && igual(segredo, v)
  if (!ok && v) {
    erros.set(ip, { n: (atual?.n || 0) + 1, desde: atual?.desde || agora })
    if (erros.size > 5000) erros.clear()   // nunca cresce sem fim
  }
  return ok
}

export const equipeOk = (req: Request) => confere(req, process.env.MAIA_PAINEL_SENHA || '', 'x-senha')
export const oficinaOk = (req: Request) => confere(req, process.env.MAIA_OFICINA_CHAVE || '', 'x-chave')

export const naoAutorizado = () => Response.json({ erro: 'não autorizado' }, { status: 401 })
