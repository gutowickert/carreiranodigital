import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { sugerirAtendimento } from '@/lib/atendimento-ia'

// Ferramentas SÓ-LEITURA do Agente Interno. Cobrem o sistema inteiro:
// específicas (vendas/financeiro/marketing/tráfego/turmas/NPS) + genéricas (esquema/consultar/agregar).

const diasEntre = (a: string, b: string) => (+new Date(a) - +new Date(b)) / 864e5
const stat = (arr: number[]) => {
  const s = [...arr].sort((x, y) => x - y); const n = s.length
  if (!n) return { n: 0, media: 0, mediana: 0 }
  const med = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
  return { n, media: +(s.reduce((a, b) => a + b, 0) / n).toFixed(1), mediana: +med.toFixed(1) }
}
const emRange = (d: string | null, desde?: string, ate?: string) => !!d && (!desde || d >= desde) && (!ate || d <= ate)
const OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'ilike', 'like', 'in', 'is'])
const HOJE = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

// naturezas financeiras: chave (= categoria do lançamento) -> nome amigável
async function naturezas(): Promise<Record<string, string>> {
  const { data } = await supabase.from('naturezas_financeiras').select('chave, nome')
  return Object.fromEntries((data || []).map((n: any) => [n.chave, n.nome]))
}

// Esquema resumido do banco (o que o agente precisa saber pra consultar direito)
const ESQUEMA = `TABELAS PRINCIPAIS (Postgres/Supabase):
- leads: id, nome, whatsapp, email, origem, campanha(vazio), utm_source, utm_campaign(ex "FCPORTOALEGRE072601 - ABO"), utm_medium, utm_content, turma_id, codigo_turma, vendedor_id, etapa('novo'|'agendado'|'aguardando_pagamento'|'ganho'|'perda'|...), valor_venda, data_ganho, data_perda, motivo_perda_id, motivo_ganho, criado_em, resumo_ia. (venda = etapa 'ganho'; campanha do anúncio fica em utm_campaign)
- matriculas: id, aluno_id, turma_id, lead_id, status('ativa'|'cancelada'), valor_pago, forma_pagamento, parcelas, data_compra, concluido, criado_em
- alunos: id, nome, email, whatsapp, cpf, cidade, estado, ltv
- turmas: id, codigo, produto_id, cidade_id, sala_id, data_inicio, data_fim, preco_venda, vagas, status('planejada'|'em_vendas'|'confirmada'|'realizada'|'cancelada')
- produtos: id, nome. cidades: id, nome. professores: id, nome, email, ativo
- turma_professores: turma_id, professor_id, modulo_id. turma_datas: turma_id, data, horario_inicio, horario_fim, modulo_id. turma_presencas: matricula_id, turma_data_id, presente
- lancamentos_empresa: id, tipo('receita'|'custo'), valor, categoria(ex 'pessoal','aluguel','marketing','teste','outro'), subcategoria, descricao, status('realizado'|'previsto'), data_vencimento, data_pagamento, mes_referencia, turma_id, conta_id. (DESPESA = tipo 'custo')
- contas_financeiras: id, nome, tipo. nps_respostas: turma_id, nota, nota_professor, nota_conteudo, nota_estrutura, comentario
- wa_conversas: id, telefone, nome, lead_id, canal. wa_mensagens: conversa_id, direcao, tipo, texto, criado_em (GRANDE ~9k linhas, sempre filtre/limite). ligacoes: lead_id, duracao, metadata
- escala_escolhas: chave, turma_id, escolha('douglas'|'julio'). usuarios_perfil: id, nome, email, papel, setor
- naturezas_financeiras: chave, nome, ativo. motivos_perda: id, nome. contas_financeiras: id, nome, tipo. salas: id, nome, cidade_id

⚠️ TRADUZA IDs/CHAVES — nunca mostre UUID cru. Mapa de referência (coluna → tabela.campo do nome):
- lancamentos_empresa.categoria = naturezas_financeiras.chave → nome (ex: 'teste'='Tráfego Pago Escola', 'pessoal'='Professores', 'estrutura'='Estrutura/Investimentos', 'turma'='Receita'). A ferramenta financeiro já traduz.
- lancamentos_empresa.conta_id = contas_financeiras.id → nome
- leads.motivo_perda_id = motivos_perda.id → nome (use a ferramenta 'perdas')
- turmas.produto_id = produtos.id → nome | turmas.cidade_id = cidades.id → nome | turmas.sala_id = salas.id → nome
- turma_professores.professor_id / matriculas... = professores.id → nome
- *.turma_id = turmas.id → codigo | matriculas.aluno_id = alunos.id → nome | *.lead_id = leads.id → nome
- modulo_id = modulos.id → nome (tabela modulos pode estar vazia; se não achar, diga "módulo" genérico)
Quando usar consultar/agregar e aparecer um *_id, faça uma consulta extra na tabela de referência pra mostrar o NOME.
OBS: gasto de anúncio (tráfego) NÃO está no banco — use a ferramenta 'trafego' (vem ao vivo da Meta).`

export const TOOLS = [
  { name: 'panorama_vendas', description: 'Números de vendas num período: ganhos, perdas, receita, ticket, conversão, velocidade (dias lead→compra).', input_schema: { type: 'object', properties: { desde: { type: 'string' }, ate: { type: 'string' } } } },
  { name: 'financeiro', description: 'Receita, DESPESA (tipo custo) e saldo num período, com quebra por categoria. Use pra faturamento, despesas, saldo, custos.', input_schema: { type: 'object', properties: { desde: { type: 'string' }, ate: { type: 'string' }, incluir_previsto: { type: 'boolean', description: 'inclui lançamentos previstos (default só realizado)' } } } },
  { name: 'marketing', description: 'Vendas por ORIGEM e por CAMPANHA (utm_campaign). Use pra "de onde vêm as vendas", "qual campanha vendeu mais".', input_schema: { type: 'object', properties: { desde: { type: 'string' }, ate: { type: 'string' } } } },
  { name: 'trafego', description: 'Gasto de anúncio (Meta, ao vivo) + CAC, CPL e ROAS no período. Exige desde e ate. Use pra "quanto gastamos em anúncio", "CAC", "custo por lead/venda", "ROAS".', input_schema: { type: 'object', properties: { desde: { type: 'string', description: 'YYYY-MM-DD' }, ate: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['desde', 'ate'] } },
  { name: 'turmas_status', description: 'Turmas com matriculados, vagas e ocupação.', input_schema: { type: 'object', properties: { status: { type: 'string' } } } },
  { name: 'nps', description: 'NPS geral e notas médias (professor, conteúdo, estrutura).', input_schema: { type: 'object', properties: {} } },
  { name: 'perdas', description: 'Motivos de perda dos leads (traduzidos), num período. Use pra "por que perdemos", "principais motivos de perda".', input_schema: { type: 'object', properties: { desde: { type: 'string' }, ate: { type: 'string' } } } },
  { name: 'detalhe_lead', description: 'Detalhe de um lead pelo nome.', input_schema: { type: 'object', properties: { nome: { type: 'string' } }, required: ['nome'] } },
  { name: 'esquema', description: 'Lista as tabelas e colunas do banco. Use ANTES de consultar/agregar quando precisar saber onde estão os dados.', input_schema: { type: 'object', properties: {} } },
  { name: 'consultar', description: 'Consulta genérica em QUALQUER tabela (só leitura). Escolha tabela, colunas, filtros, ordem e limite. Use pra qualquer coisa que as ferramentas específicas não cobrem.', input_schema: { type: 'object', properties: { tabela: { type: 'string' }, colunas: { type: 'string', description: 'ex "nome,valor_venda" ou "*"' }, filtros: { type: 'array', items: { type: 'object', properties: { coluna: { type: 'string' }, op: { type: 'string', description: 'eq,neq,gt,gte,lt,lte,ilike,in,is' }, valor: {} } } }, ordenar: { type: 'string' }, ascendente: { type: 'boolean' }, limite: { type: 'number' } }, required: ['tabela'] } },
  { name: 'agregar', description: 'Conta e/ou soma linhas de uma tabela, opcionalmente agrupando por uma coluna. Use pra totais e "por X". Ex: somar valor_venda de leads ganho agrupando por codigo_turma.', input_schema: { type: 'object', properties: { tabela: { type: 'string' }, filtros: { type: 'array', items: { type: 'object', properties: { coluna: { type: 'string' }, op: { type: 'string' }, valor: {} } } }, somar: { type: 'string', description: 'coluna numérica a somar (opcional)' }, agrupar_por: { type: 'string', description: 'coluna pra agrupar (opcional)' } }, required: ['tabela'] } },
  { name: 'propor_despesas', description: 'Propõe cadastrar UMA ou VÁRIAS despesas (lote). NÃO grava — gera uma proposta que o usuário confirma na tela (cartão com botão Confirmar). Use quando pedirem pra lançar/cadastrar despesa(s). Se faltar valor ou descrição, pergunte antes.', input_schema: { type: 'object', properties: { despesas: { type: 'array', items: { type: 'object', properties: { descricao: { type: 'string' }, valor: { type: 'number' }, categoria: { type: 'string', description: 'pessoal, aluguel, marketing, estrutura, taxa_financeira, imposto, sistemas, deslocamentos, telefone_internet, salarios, outro' }, data: { type: 'string', description: 'YYYY-MM-DD, default hoje' }, status: { type: 'string', description: 'realizado ou previsto (default realizado)' }, conta: { type: 'string', description: 'nome da conta (default Conta Bancária PJ)' } }, required: ['descricao', 'valor'] } } }, required: ['despesas'] } },
  { name: 'propor_lead', description: 'Propõe CRIAR ou ATUALIZAR um lead — inclui MUDAR ANDAMENTO/ETAPA, corrigir erros do atendimento, reetiquetar turma/cidade, marcar ganho/perda, registrar venda. NÃO grava — gera proposta pra confirmar. Pra atualizar, informe o nome em "busca".', input_schema: { type: 'object', properties: { acao: { type: 'string', description: 'criar ou atualizar' }, busca: { type: 'string', description: 'nome do lead (quando atualizar)' }, dados: { type: 'object', description: 'campos: nome, whatsapp, origem, etapa (novo/atendimento_inicial/agendado/aguardando_pagamento/proxima_turma/ganho/perda), valor_venda, codigo_turma, data_ganho, motivo_ganho' } }, required: ['acao'] } },
  { name: 'simular_atendimento', description: 'TESTA/simula o que a IA de VENDAS responderia — pra validar fluxo, funil, mensagens e timing. Passe um lead REAL (nome) OU uma situação hipotética (texto). A IA de vendas busca vendas ganhas similares e sugere a resposta no nosso tom.', input_schema: { type: 'object', properties: { lead: { type: 'string', description: 'nome de um lead real (opcional)' }, situacao: { type: 'string', description: 'situação/conversa hipotética a testar (opcional) — ex: "lead novo de Caxias pergunta se serve pra quem não entende nada"' }, produto: { type: 'string', description: 'FC ou ANL (ajuda a simulação)' }, cidade: { type: 'string' } } } },
  { name: 'listar_regras_ia', description: 'Lista as REGRAS/ajustes que já estão ativas no cérebro da IA de VENDAS (definidas pela equipe).', input_schema: { type: 'object', properties: {} } },
  { name: 'propor_regra_ia', description: 'Propõe ADICIONAR ou REMOVER um AJUSTE/refinamento no treinamento da IA de VENDAS. É um ajuste que se INTEGRA ao contexto que já existe (complementa ou corrige uma parte), NÃO uma prioridade que atropela o resto. Use SEMPRE que o usuário der uma orientação/correção pra IA de vendas (ex: "nunca ofereça bolsa antes do dia 7", "seja mais breve"). NÃO aplica sozinho — vira um cartão pra confirmar.', input_schema: { type: 'object', properties: { acao: { type: 'string', description: 'adicionar ou remover' }, texto: { type: 'string', description: 'o ajuste em português, claro e direto (ao adicionar)' }, id: { type: 'string', description: 'id do ajuste (ao remover)' } }, required: ['acao'] } },
]

function aplicaFiltros(q: any, filtros: any[]) {
  for (const f of (filtros || [])) {
    if (!f?.coluna || !OPS.has(f.op)) continue
    if (f.op === 'in') q = q.in(f.coluna, Array.isArray(f.valor) ? f.valor : String(f.valor).split(','))
    else if (f.op === 'is') q = q.is(f.coluna, f.valor === 'null' ? null : f.valor)
    else if (f.op === 'ilike' || f.op === 'like') q = q.ilike(f.coluna, `%${f.valor}%`)
    else q = q[f.op](f.coluna, f.valor)
  }
  return q
}

export async function runTool(name: string, input: any, origin?: string): Promise<any> {
  const { desde, ate } = input || {}

  if (name === 'esquema') return { esquema: ESQUEMA }

  if (name === 'propor_despesas') {
    const nat = await naturezas() // chave -> nome
    const porNome: Record<string, string> = {}; for (const [ch, nm] of Object.entries(nat)) porNome[nm.toLowerCase()] = ch
    const resolveChave = (c: string) => { const x = (c || '').toString().trim(); if (nat[x]) return x; if (porNome[x.toLowerCase()]) return porNome[x.toLowerCase()]; return 'outro' }
    const itens = (input?.despesas || []).map((d: any) => {
      const chave = resolveChave(d.categoria)
      return { descricao: String(d.descricao || '').slice(0, 200), valor: Math.round((Number(d.valor) || 0) * 100) / 100, categoria: chave, natureza: nat[chave] || chave, data: d.data || HOJE(), status: d.status === 'previsto' ? 'previsto' : 'realizado', conta: d.conta || 'Conta Bancária PJ' }
    }).filter((d: any) => d.valor > 0 && d.descricao)
    if (!itens.length) return { erro: 'informe pelo menos uma despesa com descrição e valor' }
    return { proposta: { tipo: 'despesas', itens }, n: itens.length, total: itens.reduce((s: number, d: any) => s + d.valor, 0) }
  }
  if (name === 'propor_lead') {
    const acao = input?.acao === 'criar' ? 'criar' : 'atualizar'
    if (acao === 'atualizar' && !input?.busca) return { erro: 'pra atualizar, informe o nome do lead em "busca"' }
    return { proposta: { tipo: 'lead', acao, busca: input?.busca || '', dados: input?.dados || {} } }
  }

  if (name === 'consultar') {
    if (!input?.tabela) return { erro: 'informe a tabela' }
    let q = supabase.from(input.tabela).select(input.colunas || '*')
    q = aplicaFiltros(q, input.filtros)
    if (input.ordenar) q = q.order(input.ordenar, { ascending: input.ascendente !== false })
    q = q.limit(Math.min(input.limite || 50, 200))
    const { data, error } = await q
    if (error) return { erro: error.message }
    return { total: (data || []).length, dados: data || [] }
  }

  if (name === 'agregar') {
    if (!input?.tabela) return { erro: 'informe a tabela' }
    const cols = [input.agrupar_por, input.somar].filter(Boolean).join(',') || '*'
    let q = supabase.from(input.tabela).select(cols)
    q = aplicaFiltros(q, input.filtros)
    q = q.limit(8000)
    const { data, error } = await q
    if (error) return { erro: error.message }
    const rows = data || []
    if (!input.agrupar_por) {
      const soma = input.somar ? rows.reduce((s: number, r: any) => s + (Number(r[input.somar]) || 0), 0) : undefined
      return { n: rows.length, soma: soma != null ? Math.round(soma * 100) / 100 : undefined }
    }
    const m: Record<string, { grupo: string; n: number; soma: number }> = {}
    for (const r of rows as any[]) {
      const g = (r[input.agrupar_por] ?? '(vazio)') + ''
      m[g] = m[g] || { grupo: g, n: 0, soma: 0 }
      m[g].n++; if (input.somar) m[g].soma += Number(r[input.somar]) || 0
    }
    return { grupos: Object.values(m).map(x => ({ ...x, soma: Math.round(x.soma * 100) / 100 })).sort((a, b) => (input.somar ? b.soma - a.soma : b.n - a.n)).slice(0, 50) }
  }

  if (name === 'panorama_vendas') {
    const { data } = await supabase.from('leads').select('etapa, valor_venda, data_ganho, data_perda, criado_em').in('etapa', ['ganho', 'perda'])
    const ganhos = (data || []).filter(l => l.etapa === 'ganho' && (!desde && !ate ? true : emRange(l.data_ganho, desde, ate)))
    const perdas = (data || []).filter(l => l.etapa === 'perda' && (!desde && !ate ? true : emRange(l.data_perda, desde, ate)))
    const receita = ganhos.reduce((s, l) => s + (l.valor_venda || 0), 0)
    const vel = stat(ganhos.filter(l => l.data_ganho && l.criado_em).map(l => diasEntre(l.data_ganho, l.criado_em)).filter(d => d >= 0))
    const tot = ganhos.length + perdas.length
    return { periodo: { desde: desde || 'início', ate: ate || 'hoje' }, ganhos: ganhos.length, perdas: perdas.length, receita, ticket_medio: ganhos.length ? Math.round(receita / ganhos.length) : 0, conversao_pct: tot ? Math.round(ganhos.length / tot * 100) : 0, velocidade_dias: vel }
  }

  if (name === 'financeiro') {
    let q = supabase.from('lancamentos_empresa').select('tipo, valor, categoria, data_pagamento, data_vencimento, status')
    if (!input?.incluir_previsto) q = q.eq('status', 'realizado')
    const dataCol = input?.incluir_previsto ? 'data_vencimento' : 'data_pagamento'
    if (desde) q = q.gte(dataCol, desde)
    if (ate) q = q.lte(dataCol, ate)
    const { data } = await q
    const nomeNat = await naturezas() // chave -> nome amigável
    const rec = (data || []).filter(l => l.tipo === 'receita')
    const cus = (data || []).filter(l => l.tipo === 'custo')
    const somaCat: Record<string, number> = {}
    for (const l of cus) { const c = l.categoria || 'outro'; somaCat[c] = (somaCat[c] || 0) + (l.valor || 0) }
    const receita = rec.reduce((s, l) => s + (l.valor || 0), 0)
    const despesa = cus.reduce((s, l) => s + (l.valor || 0), 0)
    return { periodo: { desde: desde || 'início', ate: ate || 'hoje' }, considerando: input?.incluir_previsto ? 'realizado+previsto' : 'só realizado', receita: Math.round(receita), despesa: Math.round(despesa), saldo: Math.round(receita - despesa), despesa_por_natureza: Object.entries(somaCat).map(([chave, v]) => ({ natureza: nomeNat[chave] || chave, chave, valor: Math.round(v) })).sort((a, b) => b.valor - a.valor) }
  }

  if (name === 'marketing') {
    let q = supabase.from('leads').select('origem, utm_campaign, etapa, valor_venda, criado_em')
    if (desde) q = q.gte('criado_em', desde)
    if (ate) q = q.lte('criado_em', ate)
    const { data } = await q
    const grupo = (campo: string) => {
      const m: Record<string, any> = {}
      for (const l of (data || [])) {
        const k = (l as any)[campo] || (campo === 'utm_campaign' ? '(sem campanha)' : '(sem origem)')
        m[k] = m[k] || { chave: k, leads: 0, vendas: 0, receita: 0 }
        m[k].leads++; if (l.etapa === 'ganho') { m[k].vendas++; m[k].receita += l.valor_venda || 0 }
      }
      return Object.values(m).map((x: any) => ({ ...x, conversao_pct: x.leads ? Math.round(x.vendas / x.leads * 100) : 0 })).sort((a: any, b: any) => b.vendas - a.vendas)
    }
    return { por_origem: grupo('origem'), por_campanha: grupo('utm_campaign') }
  }

  if (name === 'trafego') {
    if (!desde || !ate) return { erro: 'informe desde e ate (YYYY-MM-DD)' }
    let spend = 0, campanhas: any[] = []
    try {
      const base = origin || 'https://carreiranodigital.vercel.app'
      const r = await fetch(`${base}/api/meta/spend?since=${desde}&until=${ate}`).then(x => x.json())
      if (r?.ok) { spend = r.total || 0; campanhas = (r.campaigns || []).map((c: any) => ({ campanha: c.name, gasto: Math.round(c.spend) })).sort((a: any, b: any) => b.gasto - a.gasto).slice(0, 12) }
      else return { erro: 'Meta não retornou o gasto: ' + (r?.error || '?') }
    } catch (e: any) { return { erro: 'falha ao buscar gasto na Meta: ' + (e?.message || '') } }
    const { data: leads } = await supabase.from('leads').select('etapa, valor_venda, data_ganho, criado_em').gte('criado_em', desde).lte('criado_em', ate)
    const nLeads = (leads || []).length
    const ganhos = (leads || []).filter(l => l.etapa === 'ganho')
    const receita = ganhos.reduce((s, l) => s + (l.valor_venda || 0), 0)
    return {
      periodo: { desde, ate }, gasto_anuncio: Math.round(spend), leads: nLeads, vendas: ganhos.length, receita: Math.round(receita),
      cac: ganhos.length ? Math.round(spend / ganhos.length) : null, cpl: nLeads ? Math.round(spend / nLeads) : null, roas: spend ? +(receita / spend).toFixed(2) : null,
      por_campanha: campanhas,
    }
  }

  if (name === 'turmas_status') {
    let q = supabase.from('turmas').select('id, codigo, data_inicio, vagas, status, produtos(nome), cidades(nome)').order('data_inicio', { ascending: false }).limit(80)
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

  if (name === 'listar_regras_ia') {
    const { data } = await supabase.from('webhook_logs').select('id, payload, recebido_em').eq('origem', 'ia-regra').order('recebido_em')
    return { regras: (data || []).map((r: any) => ({ id: r.id, texto: r.payload?.texto, em: r.recebido_em })) }
  }
  if (name === 'propor_regra_ia') {
    const acao = input?.acao === 'remover' ? 'remover' : 'adicionar'
    if (acao === 'adicionar' && !input?.texto) return { erro: 'informe o texto da regra' }
    if (acao === 'remover' && !input?.id) return { erro: 'informe o id da regra a remover (use listar_regras_ia)' }
    return { proposta: { tipo: 'regra_ia', acao, texto: (input?.texto || '').toString().slice(0, 500), id: input?.id || '' } }
  }

  if (name === 'simular_atendimento') {
    let leadId: string | undefined
    if (input?.lead) { const { data } = await supabase.from('leads').select('id').ilike('nome', `%${input.lead}%`).limit(1).maybeSingle(); leadId = (data as any)?.id }
    const r = await sugerirAtendimento({ leadId, situacaoTexto: leadId ? undefined : input?.situacao, produtoHint: input?.produto, cidadeHint: input?.cidade })
    return r.ok ? { sugestao: r.sugestao, baseado_em_vendas: r.baseado_em_n } : { erro: r.error }
  }

  if (name === 'perdas') {
    let q = supabase.from('leads').select('motivo_perda_id, data_perda').eq('etapa', 'perda')
    if (desde) q = q.gte('data_perda', desde)
    if (ate) q = q.lte('data_perda', ate)
    const { data } = await q
    const { data: mot } = await supabase.from('motivos_perda').select('id, nome')
    const nomeM = Object.fromEntries((mot || []).map((m: any) => [m.id, m.nome]))
    const cont: Record<string, number> = {}
    for (const l of (data || [])) { const k = l.motivo_perda_id ? (nomeM[l.motivo_perda_id] || 'Outro') : '(sem motivo)'; cont[k] = (cont[k] || 0) + 1 }
    const total = (data || []).length
    return { total_perdas: total, motivos: Object.entries(cont).map(([motivo, n]) => ({ motivo, n, pct: total ? Math.round(n / total * 100) : 0 })).sort((a, b) => b.n - a.n) }
  }

  if (name === 'detalhe_lead') {
    const { data } = await supabase.from('leads').select('nome, etapa, origem, utm_campaign, valor_venda, codigo_turma, criado_em, data_ganho, data_perda, resumo_ia, observacoes').ilike('nome', `%${input?.nome || ''}%`).limit(3)
    return { encontrados: (data || []).length, leads: data || [] }
  }

  return { erro: 'ferramenta desconhecida' }
}
