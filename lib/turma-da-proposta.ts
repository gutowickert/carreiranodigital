import { supabaseAdmin as sb } from '@/lib/supabase-admin'

// A TURMA DENTRO DA PROPOSTA.
//
// Antes, a data da turma era digitada na capa pelo vendedor. Funciona no dia em que ele lembra —
// e o dia em que não lembrar, ou em que copiar de uma proposta antiga, a proposta sai com data de
// uma turma que já passou. Turma é dado do sistema, não texto: aqui ela é ESCOLHIDA de uma lista,
// e a proposta imprime o que está no cadastro.
//
// ⚠️ O TURNO E O HORÁRIO MORAM EM `observacoes`. A tabela `turmas` não tem coluna pra isso, e a
// escola escreve "Turma da noite (19:00–22:15)" na observação. É de lá que eles saem. No dia em que
// existir coluna própria, é só trocar a leitura aqui — o resto do sistema não precisa saber.

export type TurmaResumo = {
  id: string
  codigo: string
  cidade: string
  sala: string | null
  endereco: string | null
  data_inicio: string
  data_fim: string
  turno: string | null
  horario: string | null
  preco_venda: number | null
  vagas: number | null
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** "Turma da noite (19:00–22:15)" → { turno: 'noite', horario: '19:00–22:15' } */
export function turnoEHorario(observacoes: string | null): { turno: string | null; horario: string | null } {
  const o = observacoes || ''
  const m = o.match(/turma\s+d[ao]\s+(manh[ãa]|tarde|noite)\s*(?:\(([^)]+)\))?/i)
  if (!m) return { turno: null, horario: null }
  return { turno: m[1].toLowerCase(), horario: (m[2] || '').trim() || null }
}

/**
 * As datas do jeito que se fala.
 *   mesmo mês, dias seguidos → "6, 7 e 8 de outubro"
 *   mesmo mês, um intervalo  → "6 a 12 de outubro"
 *   meses diferentes         → "29 de setembro a 1 de outubro"
 *   um dia só                → "6 de outubro"
 */
export function datasDaTurma(inicio: string, fim: string): string {
  const [ai, mi, di] = inicio.slice(0, 10).split('-').map(Number)
  const [af, mf, df] = (fim || inicio).slice(0, 10).split('-').map(Number)
  const mesI = MESES[mi - 1], mesF = MESES[mf - 1]
  if (ai !== af || mi !== mf) return `${di} de ${mesI} a ${df} de ${mesF}`
  if (di === df) return `${di} de ${mesI}`
  if (df - di === 1) return `${di} e ${df} de ${mesI}`
  if (df - di === 2) return `${di}, ${di + 1} e ${df} de ${mesI}`
  return `${di} a ${df} de ${mesI}`
}

/** Uma linha só, pra caber num seletor: "Porto Alegre · 6, 7 e 8 de outubro · noite (19:00–22:15)" */
export function rotuloDaTurma(t: TurmaResumo): string {
  const quando = datasDaTurma(t.data_inicio, t.data_fim)
  const turno = t.turno ? ` · ${t.turno}${t.horario ? ` (${t.horario})` : ''}` : ''
  return `${t.cidade} · ${quando}${turno}`
}

/**
 * As turmas que ainda dá pra vender de um produto.
 *
 * ⚠️ SÓ `em_vendas` E SÓ O QUE AINDA NÃO COMEÇOU. Turma cancelada ou já realizada na lista é um
 * erro esperando a pressa de alguém — e o estrago aparece no documento que vai pro cliente.
 */
export async function turmasDoProduto(org: string, produtoId: string | null, hojeISO?: string): Promise<TurmaResumo[]> {
  if (!produtoId) return []
  const hoje = hojeISO || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

  const { data: turmas } = await sb.from('turmas')
    .select('id, codigo, cidade_id, sala_id, data_inicio, data_fim, preco_venda, vagas, observacoes, status')
    .eq('org_id', org).eq('produto_id', produtoId).eq('status', 'em_vendas')
    .gte('data_inicio', hoje).order('data_inicio')
  if (!turmas?.length) return []

  const [{ data: cidades }, { data: salas }] = await Promise.all([
    sb.from('cidades').select('id, nome').eq('org_id', org),
    sb.from('salas').select('id, nome, endereco').eq('org_id', org),
  ])
  const C = Object.fromEntries((cidades || []).map((c: any) => [c.id, c.nome]))
  const S = Object.fromEntries((salas || []).map((s: any) => [s.id, s]))

  return turmas.map((t: any) => {
    const { turno, horario } = turnoEHorario(t.observacoes)
    const sala = t.sala_id ? S[t.sala_id] : null
    return {
      id: t.id, codigo: t.codigo,
      cidade: C[t.cidade_id] || '—',
      sala: sala?.nome || null,
      endereco: sala?.endereco || null,
      data_inicio: t.data_inicio, data_fim: t.data_fim,
      turno, horario,
      preco_venda: t.preco_venda, vagas: t.vagas,
    }
  })
}

/** A turma de um orçamento, pra imprimir na proposta. */
export async function turmaDoOrcamento(turmaId: string | null): Promise<TurmaResumo | null> {
  if (!turmaId) return null
  const { data: t } = await sb.from('turmas')
    .select('id, codigo, org_id, cidade_id, sala_id, data_inicio, data_fim, preco_venda, vagas, observacoes').eq('id', turmaId).maybeSingle()
  if (!t) return null
  const [{ data: cidade }, { data: sala }] = await Promise.all([
    sb.from('cidades').select('nome').eq('id', t.cidade_id).maybeSingle(),
    t.sala_id ? sb.from('salas').select('nome, endereco').eq('id', t.sala_id).maybeSingle() : Promise.resolve({ data: null } as any),
  ])
  const { turno, horario } = turnoEHorario(t.observacoes)
  return {
    id: t.id, codigo: t.codigo, cidade: cidade?.nome || '—',
    sala: sala?.nome || null, endereco: sala?.endereco || null,
    data_inicio: t.data_inicio, data_fim: t.data_fim, turno, horario,
    preco_venda: t.preco_venda, vagas: t.vagas,
  }
}
