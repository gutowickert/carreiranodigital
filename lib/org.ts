import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { supabaseDoUsuario } from '@/lib/supabase-user'

// Org nº 1 (Carreira no Digital) — id fixo criado na Fase 0.
export const ORG_CND = '00000000-0000-0000-0000-0000000000cd'

// Resolve o org a partir do TOKEN do request (header Authorization). É o que as rotas de
// leitura usam pra escopar por cliente. Sem token válido → CnD (preserva o comportamento atual).
export async function orgDaRequest(authorization?: string | null): Promise<string> {
  try {
    if (!authorization) return ORG_CND
    const { data } = await supabaseDoUsuario(authorization).auth.getUser()
    return (data.user?.app_metadata?.org_id as string) || ORG_CND
  } catch { return ORG_CND }
}

// Resolve o org do usuário logado (por auth_id ou email). Default = CnD.
// É o seam do multi-tenant: todo backend passa a saber "de qual cliente é esta operação".
export async function orgDoUsuario(opts: { email?: string | null; authId?: string | null }): Promise<string> {
  try {
    const email = (opts.email || '').toLowerCase().trim()
    const authId = (opts.authId || '').trim()
    if (!email && !authId) return ORG_CND
    let q = sb.from('usuarios_perfil').select('org_id')
    q = authId ? q.eq('auth_id', authId) : q.ilike('email', email)
    const { data } = await q.maybeSingle()
    return data?.org_id || ORG_CND
  } catch { return ORG_CND }
}

// Resolve o org a partir do número/instância de WhatsApp que RECEBEU a mensagem.
// Hoje só existe o número da CnD → CnD. Quando um 2º cliente conectar o número dele,
// basta cadastrar o mapeamento (tabela wa_instancias, Fase 4) e o webhook roteia sozinho.
export async function orgDaInstanciaWa(_numero?: string | null): Promise<string> {
  return ORG_CND
}
