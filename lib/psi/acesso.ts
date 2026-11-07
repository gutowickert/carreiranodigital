// QUEM É SÓ DO CONSULTÓRIO (/psi). A Morgana tem login no mesmo Supabase da escola, mas não pode abrir
// nada da escola: nem telas, nem APIs. E o "sem empresa = escola" (lib/org.ts) NÃO vale pra ela.
//
// É "usuária psi" quem:
//  1. tem app_metadata.papel = 'psi' no login (gravado pelo banco: db/psi-acesso.sql), OU
//  2. tem perfil no consultório (psi_perfil) E NÃO tem perfil na escola (usuarios_perfil).
// A regra 2 garante que ninguém da equipe é afetado: quem tem usuarios_perfil nunca é bloqueado por ela,
// mesmo que um dia abra o /psi por curiosidade.
// SÓ SERVIDOR (usa a chave de serviço pra consultar as duas tabelas).
import { supabaseAdmin as sb } from '@/lib/supabase-admin'

/** org que não existe: rota que filtra por ela não acha nada */
export const ORG_NENHUMA = '00000000-0000-0000-0000-000000000000'

const cache = new Map<string, { psi: boolean; ate: number }>()

export async function ehUsuarioPsi(user: { id: string; app_metadata?: Record<string, unknown> } | null | undefined): Promise<boolean> {
  try {
    if (!user?.id) return false
    if (user.app_metadata?.papel === 'psi') return true
    const c = cache.get(user.id)
    if (c && c.ate > Date.now()) return c.psi
    let psi = false
    const { data: noConsultorio } = await sb.from('psi_perfil').select('owner_id').eq('owner_id', user.id).maybeSingle()
    if (noConsultorio) {
      const { data: naEscola } = await sb.from('usuarios_perfil').select('id').eq('id', user.id).maybeSingle()
      psi = !naEscola
    }
    cache.set(user.id, { psi, ate: Date.now() + 5 * 60_000 })
    return psi
  } catch { return false }
}
