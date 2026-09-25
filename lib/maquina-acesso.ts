import { supabaseDoUsuario } from '@/lib/supabase-user'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'

// QUEM ENTRA NA MÁQUINA — decisão do dono (25/09/2026): "só admin e comercial".
//
// ⚠️ A MÁQUINA LÊ O SISTEMA INTEIRO, e professor tem login aqui. Então o porteiro não é "tem
// sessão", é "tem sessão E é da equipe": papel admin, ou setor comercial. Mesma regra no menu
// (Layout) e nas três rotas — menu escondido é decoração se a rota responde pra qualquer um.
export type Perfil = { id: string; nome: string; email: string | null; papel: string | null; setor: string | null; ativo: boolean }

export function podeUsarMaquina(p: { papel?: string | null; setor?: string | null } | null | undefined): boolean {
  if (!p) return false
  if (p.papel === 'professor' || p.setor === 'professor') return false
  return p.papel === 'admin' || p.setor === 'comercial'
}

/** O perfil de quem chamou, ou null se não pode usar. */
export async function quemUsaMaquina(authorization: string | null): Promise<Perfil | null> {
  const { data: u } = await supabaseDoUsuario(authorization).auth.getUser().catch(() => ({ data: { user: null } as any }))
  if (!u?.user?.id) return null
  const { data: p } = await sb.from('usuarios_perfil').select('id, nome, email, papel, setor, ativo').eq('auth_id', u.user.id).maybeSingle()
  if (!p || p.ativo === false) return null
  return podeUsarMaquina(p) ? (p as Perfil) : null
}
