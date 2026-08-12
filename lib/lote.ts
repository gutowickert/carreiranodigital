import { supabaseAdmin as sb } from '@/lib/supabase-admin'

// 📅 LOTE / FASE DA TURMA — a fundação do modelo de cadência por lote real.
// Lê a tabela `turma_lotes` (preço Pix/cartão + data de virada de cada lote) e calcula, PELA DATA:
//   • o LOTE VIGENTE (qual preço vale hoje)  • a FASE da turma (onde o card fica no board por fase)
// É só leitura/cálculo — não muda nada do que já roda. O motor (followup/virada) e o board consomem daqui.

export type Lote = { ordem: number; nome: string; preco_pix: number; preco_cartao: number; parcela_cartao: number; vale_ate: string }
export type Fase = 'vendas_abertas' | 'lote_avancado' | 'ultimo_lote' | 'vespera' | 'encerrada'

// hoje em BRT (yyyy-mm-dd) — a virada do lote é por DIA, não por hora.
export function hojeBRT(): string { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) }
const diasEntre = (a: string, b: string) => Math.round((+new Date(b + 'T00:00:00') - +new Date(a + 'T00:00:00')) / 864e5)

// Lotes de uma turma (ordenados). Turma sem lotes cadastrados → [] (o motor cai no modo antigo).
export async function getLotes(turmaId: string): Promise<Lote[]> {
  const { data } = await sb.from('turma_lotes')
    .select('ordem, nome, preco_pix, preco_cartao, parcela_cartao, vale_ate')
    .eq('turma_id', turmaId).order('ordem')
  return (data || []) as Lote[]
}

// LOTE VIGENTE: o de menor ordem cujo vale_ate ainda não passou. Todos passaram → o último (cheio).
export function loteVigente(lotes: Lote[], hoje = hojeBRT()): Lote | null {
  if (!lotes.length) return null
  return lotes.find(l => l.vale_ate >= hoje) || lotes[lotes.length - 1]
}

// FASE da turma HOJE (o que decide a coluna no board por fase):
//   encerrada (turma já começou) · vespera (≤2 dias) · ultimo_lote (no último lote) ·
//   vendas_abertas (no 1º lote) · lote_avancado (lote do meio, só existe com 3+ lotes)
export function faseTurma(lotes: Lote[], dataInicio: string, hoje = hojeBRT()): Fase {
  if (!dataInicio) return 'vendas_abertas'
  if (hoje >= dataInicio) return 'encerrada'
  if (diasEntre(hoje, dataInicio) <= 2) return 'vespera'
  const vig = loteVigente(lotes, hoje)
  if (!vig) return 'vendas_abertas'
  const ordens = lotes.map(l => l.ordem)
  const ehUltimo = vig.ordem === Math.max(...ordens)
  const ehPrimeiro = vig.ordem === Math.min(...ordens)
  if (ehUltimo) return 'ultimo_lote'   // lote único (agosto) ou último de vários
  if (ehPrimeiro) return 'vendas_abertas'
  return 'lote_avancado'
}

// Dias até a VIRADA do lote atual (quando o preço sobe). Negativo/null = sem virada à frente.
export function diasAteVirada(lotes: Lote[], hoje = hojeBRT()): number | null {
  const vig = loteVigente(lotes, hoje)
  if (!vig) return null
  return diasEntre(hoje, vig.vale_ate)
}

// Rótulo legível da fase (pro board/labels).
export const LABEL_FASE: Record<Fase, string> = {
  vendas_abertas: 'Vendas abertas', lote_avancado: 'Lote avançado',
  ultimo_lote: 'Último lote', vespera: 'Véspera', encerrada: 'Encerrada',
}

// Pacote pronto pra uma turma: lote vigente + próximo + fase + dias até virar. Uma consulta, tudo mastigado.
export async function contextoLote(turmaId: string, dataInicio: string, hoje = hojeBRT()) {
  const lotes = await getLotes(turmaId)
  if (!lotes.length) return null // turma sem lote real → motor usa o modo antigo
  const vig = loteVigente(lotes, hoje)!
  const prox = lotes.find(l => l.ordem > vig.ordem) || null
  return {
    temLote: true,
    fase: faseTurma(lotes, dataInicio, hoje),
    loteVigente: vig,
    proximoLote: prox,
    diasAteVirada: diasAteVirada(lotes, hoje),
    lotes,
  }
}
