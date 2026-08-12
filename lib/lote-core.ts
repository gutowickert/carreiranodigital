// 📅 LOTE / FASE — funções PURAS (sem acesso a banco), seguras pra usar no client (board) e no server.
// O cálculo de lote vigente + fase da turma pela DATA. lib/lote.ts re-exporta tudo daqui e adiciona as consultas.

export type Lote = { ordem: number; nome: string; preco_pix: number; preco_cartao: number; parcela_cartao: number; vale_ate: string }
export type Fase = 'vendas_abertas' | 'lote_avancado' | 'ultimo_lote' | 'vespera' | 'encerrada'

// hoje em BRT (yyyy-mm-dd) — a virada do lote é por DIA, não por hora.
export function hojeBRT(): string { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) }
const diasEntre = (a: string, b: string) => Math.round((+new Date(b + 'T00:00:00') - +new Date(a + 'T00:00:00')) / 864e5)

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

// Ordem das fases no board (esquerda → direita = mais longe → mais perto da turma).
export const ORDEM_FASE: Fase[] = ['vendas_abertas', 'lote_avancado', 'ultimo_lote', 'vespera', 'encerrada']
