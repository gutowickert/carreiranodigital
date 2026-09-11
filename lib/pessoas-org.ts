import { supabaseAdmin as sb } from '@/lib/supabase-admin'

/** Quem pode ser dono de uma tarefa: as pessoas ATIVAS da empresa (mesma tabela da agenda). */
export async function pessoasAtivas(org: string): Promise<{ id: string; nome: string }[]> {
  const { data } = await sb.from('usuarios_perfil').select('id, nome').eq('org_id', org).eq('ativo', true).order('nome')
  return data || []
}
