import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { ROTEIROS, marcosDoRoteiro, dataFimContrato, LOCAIS, type Produto, type Local } from '@/lib/entrega'
import { pessoasAtivas } from '@/lib/pessoas-org'

// CRIAR UMA ENTREGA (projeto + os marcos do roteiro). Um caminho só, usado pela tela de
// Entregas e pelo assistente do WhatsApp ("cadastra o Fulano no Deu Venda, sessão terça às
// 14h na sede de POA"). Antes isso vivia dentro da rota, e o assistente não tinha como.

export type DadosProjeto = {
  cliente: string; produto: Produto; data_inicio: string
  whatsapp?: string | null; lead_id?: string | null; responsavel_id?: string | null; participantes?: string[]
  prazo_meses?: number | null; fim_tipo?: string | null; aviso_fim_dias?: number | null
  mensalidade_dia?: number | null; mensalidade_valor?: number | null; observacoes?: string | null
  // a primeira sessão foi combinada na venda: hora de verdade e o lugar (a data_inicio é o dia dela)
  sessao_em?: string | null   // ISO com hora
  local?: Local | null
  autor?: string | null
}

export async function criarProjeto(org: string, b: DadosProjeto): Promise<{ ok: true; id: string; marcos: number; cliente: string; sessao: string | null } | { ok: false; error: string }> {
  const cliente = (b.cliente || '').toString().trim()
  const produto = b.produto
  const dataInicio = (b.data_inicio || '').toString().slice(0, 10)
  if (!cliente) return { ok: false, error: 'informe o cliente' }
  if (!ROTEIROS[produto]) return { ok: false, error: 'produto inválido' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataInicio)) return { ok: false, error: 'informe a data de início' }
  if (b.local && !LOCAIS.some(l => l.chave === b.local)) return { ok: false, error: 'local inválido' }

  const r = ROTEIROS[produto]
  const prazo = b.prazo_meses != null ? Number(b.prazo_meses) : r.prazoMeses

  // quem mais responde pelo projeto: só pessoa ativa da empresa, sem repetir o responsável
  let participantes: string[] = []
  if (Array.isArray(b.participantes) && b.participantes.length) {
    const validos = new Set((await pessoasAtivas(org)).map(x => x.id))
    participantes = [...new Set(b.participantes.map(x => String(x)))].filter(x => validos.has(x) && x !== b.responsavel_id)
  }

  const { data: proj, error } = await sb.from('projetos').insert({
    org_id: org,
    lead_id: b.lead_id || null,
    cliente: cliente.slice(0, 120),
    whatsapp: (b.whatsapp || '').toString().replace(/\D/g, '') || null,
    produto,
    data_inicio: dataInicio,
    responsavel_id: b.responsavel_id || null,
    participantes,
    prazo_meses: prazo,
    fim_tipo: b.fim_tipo && ['encerra', 'renegocia', 'manutencao'].includes(b.fim_tipo) ? b.fim_tipo : r.fimTipo,
    aviso_fim_dias: b.aviso_fim_dias != null ? Number(b.aviso_fim_dias) : r.avisoFimDias,
    data_fim: dataFimContrato(produto, dataInicio, prazo),
    mensalidade_dia: b.mensalidade_dia ?? null,
    mensalidade_valor: b.mensalidade_valor ?? null,
    fase: r.fases[0]?.chave || null,
    status: 'ativo',
    observacoes: (b.observacoes || '').toString().slice(0, 2000) || null,
  }).select('*').single()
  if (error) return { ok: false, error: error.message }

  // marco nasce sem dono: herda o responsável do projeto (a agenda faz esse fallback)
  const marcos = marcosDoRoteiro(produto, dataInicio).map(m => ({ ...m, org_id: org, projeto_id: proj.id, responsavel_id: null }))
  // a sessão combinada na venda ganha a hora real e o lugar
  const sessao = marcos.find(m => m.estado === 'combinado')
  if (sessao && (b.sessao_em || b.local)) {
    if (b.sessao_em) sessao.data_combinada = new Date(b.sessao_em).toISOString()
    ;(sessao as any).local = b.local || null
  }
  await sb.from('projeto_marcos').insert(marcos)

  await sb.from('projeto_andamentos').insert({
    org_id: org, projeto_id: proj.id, tipo: 'criado',
    observacao: `Projeto de ${r.nome} criado — início em ${dataInicio.split('-').reverse().join('/')}, ${marcos.length} marcos no roteiro.`,
    autor: b.autor || null,
  })
  if (b.lead_id) {
    try { await sb.from('lead_andamentos').insert({ lead_id: b.lead_id, tipo: 'entrega', observacao: `📦 Entrou em entrega: ${r.nome}, início ${dataInicio.split('-').reverse().join('/')}.` }) } catch { /* segue */ }
  }
  return { ok: true, id: proj.id, marcos: marcos.length, cliente: proj.cliente, sessao: sessao?.data_combinada || null }
}
