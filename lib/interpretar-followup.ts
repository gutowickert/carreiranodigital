import { type Dossie } from '@/lib/historico-lead'
import { gerarResumo } from '@/lib/resumo-lead'

// Onde o lead REALMENTE está no fluxo, pro motor não disparar template incoerente pela etapa gravada.
// USA O RESUMO CACHEADO (leads.resumo_ia) — se está fresco (sem atividade nova depois), lê de graça;
// só REGENERA o resumo quando o lead teve movimento. Uma fonte só (o resumo), com cache.
type LeadInfo = { id: string; nome?: string | null; whatsapp?: string | null; etapa?: string | null; codigo_turma?: string | null; resumo_ia?: any; resumo_ia_em?: string | null }

export async function interpretarFollowup(sb: any, org: string, d: Dossie, lead: LeadInfo): Promise<{ etapa: string; motivo: string; fonte: 'cache' | 'gerado' } | null> {
  const cache = lead.resumo_ia
  const cacheEm = lead.resumo_ia_em
  // fresco = tem etapaReal e o resumo é mais novo que a última atividade do lead
  const fresco = cache?.etapaReal && cacheEm && (!d.ultimoContatoEm || cacheEm >= d.ultimoContatoEm)
  if (fresco) return { etapa: String(cache.etapaReal), motivo: String(cache.ondeParou || ''), fonte: 'cache' }
  // sem resumo ou desatualizado → gera (e cacheia em leads.resumo_ia pra próxima vez ser de graça)
  const r = await gerarResumo(sb, org, lead, d).catch(() => null)
  if (r?.etapaReal) return { etapa: String(r.etapaReal), motivo: String(r.ondeParou || ''), fonte: 'gerado' }
  return null
}
