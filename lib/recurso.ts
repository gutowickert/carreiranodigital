import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { ORG_CND } from '@/lib/org'

// Recursos que nascem DESLIGADOS e alguém liga de propósito: organizacoes.config.features.X = true.
//
// ⚠️ O MENU DA ESCOLA É OPT-OUT (some só se for `false`). Isto aqui é o contrário, e por uma razão:
// esconder do menu não basta quando a rota gasta dinheiro — quem tiver o endereço continua usando.
// A Máquina chama a Anthropic a cada mensagem; então a ROTA confere, e o padrão é desligado.
export async function recursoLigado(nome: string): Promise<boolean> {
  try {
    const { data } = await sb.from('organizacoes').select('config').eq('id', ORG_CND).maybeSingle()
    return (data?.config as any)?.features?.[nome] === true
  } catch { return false }
}

/** O nome e o modo da Máquina nesta empresa (Máquina CND / Studio Mkt). */
export async function configDaMaquina(): Promise<{ nome: string; modo: 'geral' | 'marketing' }> {
  try {
    const { data } = await sb.from('organizacoes').select('config').eq('id', ORG_CND).maybeSingle()
    const m = (data?.config as any)?.maquina || {}
    return { nome: m.nome || 'Máquina CND', modo: m.modo === 'marketing' ? 'marketing' : 'geral' }
  } catch { return { nome: 'Máquina CND', modo: 'geral' } }
}
