import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// Ferramentas SÓ-LEITURA do Agente Interno. Cada uma roda uma consulta e devolve JSON compacto.

const dias = (a: string, b: string) => (+new Date(a) - +new Date(b)) / 864e5
const stat = (arr: number[]) => {
  const s = [...arr].sort((x, y) => x - y); const n = s.length
  if (!n) return { n: 0, media: 0, mediana: 0 }
  const med = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
  return { n, media: +(s.reduce((a, b) => a + b, 0) / n).toFixed(1), mediana: +med.toFixed(1) }
}
const emRange = (d: string | null, desde?: string, ate?: string) => !!d && (!desde || d >= desde) && (!ate || d <= ate)

export const TOOLS = [
  { name: 'panorama_vendas', description: 'Números gerais de vendas num período: ganhos, perdas, receita, ticket médio, taxa de conversão e velocidade média (dias entre lead entrar e comprar). Use pra "quantas vendas", "faturamento", "conversão", "quanto vendemos".', input_schema: { type: 'object', properties: { desde: { type: 'string', description: 'data inicial ISO (YYYY-MM-DD), opcional' }, ate: { type: 'string', description: 'data final ISO, opcional' } } } },
  { name: 'listar_leads', description: 'Lista leads com filtros. Use pra "quais leads...", "quem está em X", "leads da origem Y".', input_schema: { type: 'object', properties: { etapa: { type: 'string', description: 'ex: ganho, perda, novo, agendado, aguardando_pagamento' }, origem: { type: 'string' }, desde: { type: 'string' }, ate: { type: 'string' }, texto: { type: 'string', description: 'busca no nome' }, limite: { type: 'number' } } } },
  { name: 'financeiro', description: 'Receitas, despesas e saldo num período (lançamentos pagos). Use pra "quanto entrou", "despesas", "saldo", "caixa".', input_schema: { type: 'object', properties: { desde: { type: 'string' }, ate: { type: 'string' } } } },
  { name: 'marketing_origens', description: 'Desempenho por origem/campanha dos leads: quantos leads, quantas vendas, conversão e receita por origem. Use pra "de onde vêm as vendas", "qual canal converte mais".', input_schema: { type: 'object', properties: { desde: { type: 'string' }, ate: { type: 'string' } } } },
  { name: 'turmas_status', description: 'Turmas com matriculados, vagas e ocupação. Use pra "quantos alunos na turma X", "ocupação", "turmas abertas".', input_schema: { type: 'object', properties: { status: { type: 'string', description: 'ex: em_vendas, confirmada, planejada, realizada' } } } },
  { name: 'nps', description: 'NPS geral e notas médias (professor, conteúdo, estrutura). Use pra "satisfação", "nps", "avaliação dos alunos".', input_schema: { type: 'object', properties: {} } },
  { name: 'detalhe_lead', description: 'Detalhe de um lead específico pelo nome: etapa, valor, turma, resumo da negociação. Use pra "como está o lead fulano".', input_schema: { type: 'object', properties: { nome: { type: 'string' } }, required: ['nome'] } },
]

export async function runTool(name: string, input: any): Promise<any> {
  const { desde, ate } = input || {}
  if (name === 'panorama_vendas') {
    const { data } = await supabase.from('leads').select('etapa, valor_venda, data_ganho, data_perda, criado_em').in('etapa', ['ganho', 'perda'])
    const ganhos = (data || []).filter(l => l.etapa === 'ganho' && (!desde && !ate ? true : emRange(l.data_ganho, desde, ate)))
    const perdas = (data || []).filter(l => l.etapa === 'perda' && (!desde && !ate ? true : emRange(l.data_perda, desde, ate)))
    const receita = ganhos.reduce((s, l) => s + (l.valor_venda || 0), 0)
    const vel = stat(ganhos.filter(l => l.data_ganho && l.criado_em).map(l => dias(l.data_ganho, l.criado_em)).filter(d => d >= 0))
    const tot = ganhos.length + perdas.length
    return { periodo: { desde: desde || 'início', ate: ate || 'hoje' }, ganhos: ganhos.length, perdas: perdas.length, receita, ticket_medio: ganhos.length ? Math.round(receita / ganhos.length) : 0, conversao_pct: tot ? Math.round(ganhos.length / tot * 100) : 0, velocidade_dias: vel }
  }
  if (name === 'listar_leads') {
    let q = supabase.from('leads').select('nome, etapa, origem, valor_venda, codigo_turma, criado_em, data_ganho').order('criado_em', { ascending: false }).limit(Math.min(input?.limite || 25, 100))
    if (input?.etapa) q = q.eq('etapa', input.etapa)
    if (input?.origem) q = q.ilike('origem', `%${input.origem}%`)
    if (input?.texto) q = q.ilike('nome', `%${input.texto}%`)
    if (desde) q = q.gte('criado_em', desde)
    if (ate) q = q.lte('criado_em', ate)
    const { data } = await q
    return { total: (data || []).length, leads: data || [] }
  }
  if (name === 'financeiro') {
    let q = supabase.from('lancamentos_empresa').select('tipo, valor, categoria, data_pagamento, status').eq('status', 'realizado')
    if (desde) q = q.gte('data_pagamento', desde)
    if (ate) q = q.lte('data_pagamento', ate)
    const { data } = await q
    const rec = (data || []).filter(l => l.tipo === 'receita').reduce((s, l) => s + (l.valor || 0), 0)
    const desp = (data || []).filter(l => l.tipo === 'despesa').reduce((s, l) => s + (l.valor || 0), 0)
    return { periodo: { desde: desde || 'início', ate: ate || 'hoje' }, receita: Math.round(rec), despesa: Math.round(desp), saldo: Math.round(rec - desp), lancamentos: (data || []).length }
  }
  if (name === 'marketing_origens') {
    let q = supabase.from('leads').select('origem, etapa, valor_venda, data_ganho, criado_em')
    if (desde) q = q.gte('criado_em', desde)
    if (ate) q = q.lte('criado_em', ate)
    const { data } = await q
    const m: Record<string, any> = {}
    for (const l of (data || [])) {
      const o = l.origem || '(sem origem)'
      m[o] = m[o] || { origem: o, leads: 0, ganhos: 0, receita: 0 }
      m[o].leads++; if (l.etapa === 'ganho') { m[o].ganhos++; m[o].receita += l.valor_venda || 0 }
    }
    return { origens: Object.values(m).map((x: any) => ({ ...x, conversao_pct: x.leads ? Math.round(x.ganhos / x.leads * 100) : 0 })).sort((a: any, b: any) => b.ganhos - a.ganhos) }
  }
  if (name === 'turmas_status') {
    let q = supabase.from('turmas').select('id, codigo, data_inicio, data_fim, vagas, status, produtos(nome), cidades(nome)').order('data_inicio', { ascending: false }).limit(80)
    if (input?.status) q = q.eq('status', input.status)
    const { data: ts } = await q
    const ids = (ts || []).map((t: any) => t.id)
    const cont: Record<string, number> = {}
    if (ids.length) { const { data: ms } = await supabase.from('matriculas').select('turma_id').in('turma_id', ids).neq('status', 'cancelada'); for (const m of (ms || [])) cont[m.turma_id] = (cont[m.turma_id] || 0) + 1 }
    return { turmas: (ts || []).map((t: any) => ({ codigo: t.codigo, produto: t.produtos?.nome, cidade: t.cidades?.nome, inicio: t.data_inicio, status: t.status, vagas: t.vagas, matriculados: cont[t.id] || 0, ocupacao_pct: t.vagas ? Math.round((cont[t.id] || 0) / t.vagas * 100) : null })) }
  }
  if (name === 'nps') {
    const { data } = await supabase.from('nps_respostas').select('nota, nota_professor, nota_conteudo, nota_estrutura')
    const rs = data || []; const n = rs.length
    if (!n) return { n: 0 }
    const prom = rs.filter(r => r.nota >= 9).length, det = rs.filter(r => r.nota <= 6).length
    const avg = (k: string) => { const v = rs.filter((r: any) => r[k] != null); return v.length ? +(v.reduce((s: number, r: any) => s + r[k], 0) / v.length).toFixed(1) : 0 }
    return { respostas: n, nps: Math.round((prom / n - det / n) * 100), promotores: prom, detratores: det, media_professor: avg('nota_professor'), media_conteudo: avg('nota_conteudo'), media_estrutura: avg('nota_estrutura') }
  }
  if (name === 'detalhe_lead') {
    const { data } = await supabase.from('leads').select('nome, etapa, origem, valor_venda, codigo_turma, criado_em, data_ganho, data_perda, resumo_ia, observacoes').ilike('nome', `%${input?.nome || ''}%`).limit(3)
    return { encontrados: (data || []).length, leads: data || [] }
  }
  return { erro: 'ferramenta desconhecida' }
}
