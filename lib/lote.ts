import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { loteVigente, faseTurma, diasAteVirada, hojeBRT, type Lote } from '@/lib/lote-core'

// 📅 LOTE / FASE DA TURMA — a fundação do modelo de cadência por lote real.
// As funções PURAS (cálculo por data) moram em lib/lote-core.ts (reusáveis no client). Aqui ficam só as
// CONSULTAS ao banco (turma_lotes) + o pacote pronto. É só leitura/cálculo — não muda nada do que já roda.

export * from '@/lib/lote-core'

// Lotes de uma turma (ordenados). Turma sem lotes cadastrados → [] (o motor cai no modo antigo).
export async function getLotes(turmaId: string): Promise<Lote[]> {
  const { data } = await sb.from('turma_lotes')
    .select('ordem, nome, preco_pix, preco_cartao, parcela_cartao, vale_ate')
    .eq('turma_id', turmaId).order('ordem')
  return (data || []) as Lote[]
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
