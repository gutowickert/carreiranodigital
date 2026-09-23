import { supabaseAdmin as sb } from '@/lib/supabase-admin'

// A COBRANÇA DAS MENSALIDADES — o motor que transforma "R$ 1.500, dia 10" em dinheiro previsto.
//
// Até aqui, `projetos.mensalidade_dia` e `mensalidade_valor` eram texto na tela: a Dani estava
// cadastrada com dia 10 e R$ 1.500 desde setembro e nada acontecia. São R$ 3.000/mês entre ela e a
// GAJA que não apareciam no financeiro como receita prevista.
//
// ⚠️ NUNCA GERA PARA TRÁS. A trava é `projetos.cobranca_desde`:
//   • vazia  → não gera NADA para aquele projeto (é também a trava do cadastro pela metade)
//   • com data → gera desta data em diante, nunca antes
// A Dani e o Jhones já pagaram setembro à mão. Sem esta regra, ligar o motor criaria duas cobranças
// em aberto de um dinheiro que já entrou, e alguém iria atrás de cliente que não deve nada.
//
// ⚠️ É IDEMPOTENTE. Roda quantas vezes quiser: antes de inserir, procura se o lançamento daquele
// mês daquele projeto já existe (`grupo_recorrencia` + `mes_referencia`). O orquestrador chama isto
// duas vezes por dia — se não fosse idempotente, seriam duas cobranças por dia.

const ORG = '00000000-0000-0000-0000-0000000000cd'
const CATEGORIA = 'mensalidade_cliente'
const MESES_À_FRENTE = 1   // gera o mês atual e o próximo: o Rick vê o que vem antes de chegar

// ⚠️ DOIS FORMATOS QUE O FINANCEIRO JÁ USA, e que quebram calado se a gente inventar outro:
//   • `mes_referencia` é uma DATA, sempre o dia 1 do mês ("2026-10-01") — conferido nos 400
//     lançamentos existentes. Escrever "2026-10" não entra.
//   • `unidade` é 'geral' em todos eles. As telas de fluxo e de custo filtram por isso; sem a
//     unidade, o lançamento existe no banco e não aparece em relatório nenhum.
const UNIDADE = 'geral'

type Projeto = {
  id: string; cliente: string; status: string
  mensalidade_dia: number | null; mensalidade_valor: number | null; cobranca_desde: string | null
  valor_implantacao: number | null; implantacao_vence_em: string | null
}

const mesRef = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`

/** O vencimento daquele mês. Dia 31 em mês de 30 cai no último dia — não pula o mês. */
function vencimento(ano: number, mes0: number, dia: number): string {
  const ultimo = new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate()
  const d = Math.min(Math.max(1, dia), ultimo)
  return `${ano}-${String(mes0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export async function gerarMensalidades(hoje = new Date()) {
  const criados: string[] = []
  const pulados: string[] = []

  // só projeto vivo e com a cobrança ligada. `interno` (JamRock, Núcleo) nem chega aqui: não tem
  // projeto, e sem projeto não há mensalidade.
  const { data: projetos } = await sb.from('projetos')
    .select('id, cliente, status, mensalidade_dia, mensalidade_valor, cobranca_desde, valor_implantacao, implantacao_vence_em')
    .eq('org_id', ORG).in('status', ['ativo', 'manutencao']).not('cobranca_desde', 'is', null)

  for (const p of (projetos || []) as Projeto[]) {
    // cadastro pela metade não vira cobrança: não existe cobrança "quase certa"
    if (!p.mensalidade_dia || !p.mensalidade_valor) { pulados.push(`${p.cliente}: falta dia ou valor`); continue }

    const desde = p.cobranca_desde
    if (!desde) continue   // a consulta já filtra, mas o tipo não sabe disso
    const inicio = new Date(desde + 'T12:00:00Z')
    const limite = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + MESES_À_FRENTE, 1))

    for (let d = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), 1)); d <= limite; d.setUTCMonth(d.getUTCMonth() + 1)) {
      const ref = mesRef(new Date(d))
      const vence = vencimento(d.getUTCFullYear(), d.getUTCMonth(), p.mensalidade_dia)
      if (vence < desde) continue   // o mês do início pode começar depois do dia do vencimento

      const { data: existe } = await sb.from('lancamentos_empresa')
        .select('id').eq('org_id', ORG).eq('grupo_recorrencia', p.id).eq('mes_referencia', ref).maybeSingle()
      if (existe) continue

      const { error } = await sb.from('lancamentos_empresa').insert({
        org_id: ORG, tipo: 'receita', categoria: CATEGORIA, unidade: UNIDADE,
        descricao: `Mensalidade ${p.cliente}`,
        valor: p.mensalidade_valor, mes_referencia: ref, data_vencimento: vence,
        status: 'previsto', recorrente: true, grupo_recorrencia: p.id,
      })
      if (!error) criados.push(`${p.cliente} ${ref}`)
    }

    // A IMPLANTAÇÃO é UM lançamento só, na data combinada. Quem não cobra setup tem isto vazio —
    // é o caso da Dani e do Jhones.
    //
    // ⚠️ Este não se acha pelo mês: `mes_referencia` é data, e o mês da implantação pode ser o mesmo
    // de uma mensalidade. A marca que o distingue é `recorrente = false` no mesmo grupo.
    if (p.valor_implantacao && p.implantacao_vence_em) {
      const { data: existe } = await sb.from('lancamentos_empresa')
        .select('id').eq('org_id', ORG).eq('grupo_recorrencia', p.id).eq('recorrente', false).maybeSingle()
      if (!existe) {
        const { error } = await sb.from('lancamentos_empresa').insert({
          org_id: ORG, tipo: 'receita', categoria: CATEGORIA, unidade: UNIDADE,
          descricao: `Implantação ${p.cliente}`,
          valor: p.valor_implantacao, mes_referencia: mesRef(new Date(p.implantacao_vence_em + 'T12:00:00Z')),
          data_vencimento: p.implantacao_vence_em,
          status: 'previsto', recorrente: false, grupo_recorrencia: p.id,
        })
        if (!error) criados.push(`${p.cliente} implantação`)
      }
    }
  }

  return { criados, pulados }
}

/** As mensalidades em aberto, pra tela de Instalações e pro aviso. */
export async function mensalidadesEmAberto() {
  const { data } = await sb.from('lancamentos_empresa')
    .select('id, descricao, valor, data_vencimento, mes_referencia, status, grupo_recorrencia')
    .eq('org_id', ORG).eq('categoria', CATEGORIA).eq('status', 'previsto')
    .order('data_vencimento')
  return data || []
}
