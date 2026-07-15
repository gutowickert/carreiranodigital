import { CONTEXTO_NEGOCIO } from '@/lib/contexto-negocio'
import { getFluxo, fluxoTexto } from '@/lib/fluxo'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'

// ═══════════════════════════════════════════════════════════════════════
// CÉREBRO CENTRAL — a FONTE ÚNICA de verdade sobre a empresa que TODA IA lê.
// Consolida num lugar só o que as duas "bocas" da IA precisam saber da Carreira No Digital:
//  • posicionamento + produtos (ANL/FC) + condições/preços  (contexto-negocio.ts)
//  • fluxo comercial: etapas, cadência de tarefas, prioridade da fila  (fluxo.ts — editável no Agente)
//  • regras vivas definidas pela equipe  (ia-regra — editável no Agente)
// Motor de vendas e Agente Interno importam DAQUI. Editar o conhecimento = editar uma fonte só.
// ═══════════════════════════════════════════════════════════════════════

export async function contextoCentral(): Promise<string> {
  let s = CONTEXTO_NEGOCIO + '\n\n'

  // Fluxo comercial atual (etapas + cadência de tarefas + prioridade) — editável pela equipe
  try {
    const fx = await getFluxo()
    s += '# ' + fluxoTexto(fx) + '\n\n'
  } catch { /* segue sem o fluxo se falhar */ }

  // Regras vivas da equipe (ajustes de comportamento definidos no Agente Interno)
  try {
    const { data: regras } = await sb.from('webhook_logs').select('payload').eq('origem', 'ia-regra')
    const txt = (regras || []).map((r: any) => r.payload?.texto).filter(Boolean)
    if (txt.length) s += `# AJUSTES DA EQUIPE (regras vivas — definidas no Agente Interno; INCORPORE ao contexto, harmonizando com bom senso, sem atropelar o resto):\n${txt.map((t: string) => `- ${t}`).join('\n')}\n\n`
  } catch { /* segue sem regras se falhar */ }

  return s
}
