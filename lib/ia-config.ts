import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// Config da automação da IA de atendimento. Guardada em webhook_logs (origem='ia-config'), última linha vence.
export type ConfigIA = {
  ativa: boolean            // liga/desliga a automação
  modo: 'semi' | 'auto'     // semi = IA rascunha, humano envia | auto = IA envia sozinha
  hora_ini: string          // horário comercial (fora dele a IA assume na hora, se auto)
  hora_fim: string
  fallback_horas: number    // horas sem resposta pra IA assumir (regra 2 lig→WA→Xh)
}
const PADRAO: ConfigIA = { ativa: false, modo: 'semi', hora_ini: '09:00', hora_fim: '19:00', fallback_horas: 2 }

export async function getConfigIA(): Promise<ConfigIA> {
  const { data } = await supabase.from('webhook_logs').select('payload').eq('origem', 'ia-config').order('recebido_em', { ascending: false }).limit(1).maybeSingle()
  return { ...PADRAO, ...((data?.payload as any) || {}) }
}

export async function setConfigIA(patch: Partial<ConfigIA>, por: string): Promise<ConfigIA> {
  const atual = await getConfigIA()
  const novo: ConfigIA = { ...atual, ...patch }
  await supabase.from('webhook_logs').insert({ origem: 'ia-config', evento: novo.ativa ? 'ligada' : 'desligada', status: 'processado', payload: { ...novo, por } })
  return novo
}
