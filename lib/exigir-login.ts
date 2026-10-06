import { supabaseDoUsuario } from '@/lib/supabase-user'

// QUEM ESTÁ CHAMANDO (06/10/2026, achado na Wood Arte): rotas que gastam IA ou mandam WhatsApp não
// podem ficar abertas. A rota de simular conversa respondia a qualquer um na internet — bastava saber
// o endereço pra gastar o crédito da Anthropic do cliente. Devolve o id do usuário logado (pelo token
// do request) ou null; a rota responde 401 quando vier null. A tela manda o token com `fetchAuth`.
export async function usuarioLogado(req: Request): Promise<string | null> {
  const auth = req.headers.get('authorization')
  if (!auth) return null
  try {
    const { data } = await supabaseDoUsuario(auth).auth.getUser()
    return data.user?.id || null
  } catch { return null }
}

// QUEM PODE CHAMAR uma rota que gasta IA ou manda WhatsApp (06/10/2026, achado na Wood Arte): quem
// está LOGADO no sistema (a tela manda o token com `fetchAuth`), ou o PRÓPRIO SERVIDOR — os motores e
// as rotas que chamam outras por dentro mandam `Authorization: Bearer <CRON_SECRET>` (`cabecalhoInterno`).
// Antes estas rotas usavam `orgDaRequest`, que sem token cai na empresa da instalação: qualquer um na
// internet mandava WhatsApp pelo número do cliente, disparava em massa e gastava o crédito da IA.
//
// NA ESCOLA (06/10/2026): a Vercel da escola é do Guto e daqui não dá pra conferir se o CRON_SECRET
// está configurado lá (os crons da escola aceitam o user-agent da Vercel justamente porque ele pode
// faltar). Sem ele, a senha interna seria vazia e os motores levariam 401 calados. Então a senha
// interna é o CRON_SECRET quando existe, senão a chave de serviço do Supabase (que sempre existe e
// nunca sai do servidor: a chamada interna vai do servidor pro próprio endereço).
const senhaInterna = () => process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
export async function chamadaPermitida(req: Request): Promise<boolean> {
  const auth = req.headers.get('authorization')
  const segredos = [process.env.CRON_SECRET, process.env.SUPABASE_SERVICE_ROLE_KEY].filter(Boolean)
  if (auth && segredos.some(x => auth === `Bearer ${x}`)) return true
  return !!(await usuarioLogado(req))
}
export const cabecalhoInterno = (): Record<string, string> =>
  senhaInterna() ? { Authorization: `Bearer ${senhaInterna()}` } : {}

// O E-MAIL de quem chama, tirado do LOGIN — nunca do corpo ou do endereço do pedido, que qualquer um
// escreve (e a lista de administradores da IA é pública: NEXT_PUBLIC_IA_ADMINS).
export async function emailLogado(req: Request): Promise<string> {
  const auth = req.headers.get('authorization')
  if (!auth) return ''
  try {
    const { data } = await supabaseDoUsuario(auth).auth.getUser()
    return (data.user?.email || '').toLowerCase()
  } catch { return '' }
}
