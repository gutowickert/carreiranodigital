import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { exigeTurma } from '@/lib/proposta-produtos'
import { hojeBR } from '@/lib/periodos'

// TURMA QUE JÁ COMEÇOU SAI DE "EM VENDAS" SOZINHA (27/10/2026, pedido do Nando).
//
// ⚠️ O QUE ACONTECIA: ninguém trocava o status na mão, e em 27/10 havia cinco turmas já começadas
// (ou até terminadas) como "em vendas" — a Imersão de Porto Alegre de 20/10, as duas do ANL e a de
// Lajeado que começava naquela noite. Toda tela e toda IA que lê "turmas em vendas" (copiloto,
// fechamento, propostas, roteador) podia oferecer uma turma que já tinha passado.
//
// Vira `confirmada` (está acontecendo), NUNCA `realizada`: `realizada` é o que o botão "Fechar
// turma" grava DEPOIS de acertar os lançamentos do financeiro — marcar sozinho esconderia que o
// fechamento financeiro ainda não foi feito.
//
// Só produto vendido POR TURMA (lib/proposta-produtos, exigeTurma). O Deu Venda tem linha na tabela
// de turmas, mas é o "container" da oferta contínua de cada cidade, com início em setembro: se
// entrasse aqui, sairia de venda no primeiro dia.
export async function fecharVendasDasTurmasQueComecaram(org: string, aplicar = true) {
  const hoje = hojeBR()
  const { data } = await sb.from('turmas')
    .select('id, codigo, data_inicio, produtos(nome)')
    .eq('org_id', org).eq('status', 'em_vendas').lte('data_inicio', hoje)
  const alvo = (data || []).filter((t: any) => exigeTurma(t.produtos?.nome))
  if (aplicar && alvo.length) {
    await sb.from('turmas').update({ status: 'confirmada', atualizado_em: new Date().toISOString() })
      .eq('org_id', org).in('id', alvo.map(t => t.id)).eq('status', 'em_vendas')
  }
  return alvo.map((t: any) => t.codigo as string)
}
