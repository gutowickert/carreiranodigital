import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { lerPainel, type Painel, type AnuncioPainel } from '@/lib/trafego-cliente'
import { getStatusConta, type StatusConta } from '@/lib/meta-ads'
import { impostoMetaPct } from '@/lib/imposto-meta'
import { hojeBR, menosDias, diasEntre } from '@/lib/periodos'
import { ROTEIROS, situacaoMarco, LOCAIS, type Produto } from '@/lib/entrega'

// O MONITOR DAS ENTREGAS: a tela interna do Guto e do Mateus pra decidir em grupo.
//
// A tela decide a ORDEM, não eles: cada cliente ganha uma cor calculada por regras, com
// os alertas e a recomendação escrita. Em cinco segundos sabem pra quem olhar. Positivos
// em cima, negativos embaixo (decisão do Guto).
//
// Os LIMITES ficam num lugar só, pra mudar em um minuto quando a prática mostrar outro número.

export const LIMITES = {
  diasSemGasto: 3,         // sem gasto há N dias com anúncio ativo = conta parou (saldo, cartão, bloqueio)
  custoVsAlvo: 2,          // custo por resultado acima de N× o alvo do cliente = vermelho
  custoVsMedia: 2,         // sem alvo: acima de N× a média dos últimos 30 dias = vermelho
  altaCustoPct: 30,        // custo subiu mais de N% contra o período anterior = amarelo
  idadeCriativo: 21,       // criativo que puxa com mais de N dias no ar = fadiga chegando
  queimaPct: 20,           // um anúncio com mais de N% da verba sem resultado = amarelo
  minResultados: 3,        // abaixo disso não se afirma nada sobre custo
  diasSemSync: 2,          // sem sincronizar há mais de N dias = o dado da tela está velho
  saldoBaixo: 50,          // conta pré-paga com menos de R$ N = avisar antes que pare
  minGastoLeitura: 80,     // abaixo de R$ N no período não se lê "anúncio queimando": é ruído
  janelaDias: 7,           // a leitura padrão do monitor
}

export type Nivel = 'verde' | 'amarelo' | 'vermelho' | 'cinza'
export type Alerta = { nivel: 'vermelho' | 'amarelo'; chave: string; titulo: string; detalhe?: string; acao?: string; contatar?: boolean }

export type CardMonitor = {
  id: string; cliente: string; whatsapp: string | null; produto: string; produtoNome: string; cor: string
  fase: string | null; faseLabel: string | null; responsavel: string | null
  data_inicio: string; data_fim: string | null; dia_do_contrato: number
  tem_conta: boolean; conta: StatusConta | null; portal_chave: string | null; valor_cliente: number | null; alvo_custo: number | null
  painel: Painel | null
  nivel: Nivel; alertas: Alerta[]; recomendacoes: string[]
  proximo: { titulo: string; data: string | null; estado: string; situacao: string; local: string | null } | null
  atrasados: number
  sparkline: { data: string; resultados: number; gasto: number }[]
  anuncios_ativos: number; idade_criativo: number | null
}

const fmtBRL = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const PAUSADO = (s: string) => /PAUSED|ARCHIVED|DELETED|DISAPPROVED/i.test(s || '')

export async function montarMonitor(org: string, dias = LIMITES.janelaDias) {
  const hoje = hojeBR()
  const de = menosDias(hoje, dias - 1)
  const [{ data: projetos }, { data: pessoas }, pct] = await Promise.all([
    sb.from('projetos').select('*').eq('org_id', org).in('status', ['ativo', 'manutencao']).order('cliente'),
    sb.from('usuarios_perfil').select('id, nome, apelido').eq('org_id', org),
    impostoMetaPct(org),
  ])
  const nomePessoa = Object.fromEntries((pessoas || []).map((p: any) => [p.id, p.apelido || p.nome.split(' ')[0]]))

  const cards = await Promise.all((projetos || []).map(p => montarCard(p, de, hoje, pct, nomePessoa)))

  // positivos em cima, negativos embaixo; dentro do nível, quem traz mais resultado primeiro
  const ordem: Record<Nivel, number> = { verde: 0, amarelo: 1, vermelho: 2, cinza: 3 }
  cards.sort((a, b) => ordem[a.nivel] - ordem[b.nivel] || (b.painel?.total.resultados || 0) - (a.painel?.total.resultados || 0))

  const comConta = cards.filter(c => c.painel)
  const soma = (f: (c: CardMonitor) => number) => comConta.reduce((s, c) => s + f(c), 0)
  const gasto = soma(c => c.painel!.total.gasto), resultados = soma(c => c.painel!.total.resultados)
  const gastoAnt = soma(c => c.painel!.anterior?.gasto || 0), resultadosAnt = soma(c => c.painel!.anterior?.resultados || 0)

  // quem contatar hoje: alertas que dependem do cliente, mais reconfirmações
  const contatar = cards.flatMap(c => c.alertas.filter(a => a.contatar).map(a => ({ id: c.id, cliente: c.cliente, whatsapp: c.whatsapp, nivel: a.nivel, motivo: a.titulo, acao: a.acao || null })))

  // os encontros dos próximos 7 dias, de todos os clientes
  const ate7 = menosDias(hoje, -7)
  const { data: marcos } = await sb.from('projeto_marcos').select('id, titulo, natureza, estado, data_combinada, data_prevista, local, responsavel_id, reconfirmacao_resposta, projetos!inner(id, cliente, status)')
    .eq('org_id', org).eq('natureza', 'encontro').not('estado', 'in', '("concluido","cancelado")')
  const encontros = (marcos || []).map((m: any) => ({ ...m, quando: m.data_combinada || (m.data_prevista ? `${String(m.data_prevista).slice(0, 10)}T12:00:00-03:00` : null) }))
    .filter((m: any) => m.projetos?.status === 'ativo' && m.quando && m.quando.slice(0, 10) >= hoje && m.quando.slice(0, 10) <= ate7)
    .sort((a: any, b: any) => a.quando.localeCompare(b.quando))
    .map((m: any) => ({ id: m.id, projeto_id: m.projetos.id, cliente: m.projetos.cliente, titulo: m.titulo, quando: m.quando, combinado: !!m.data_combinada, estado: m.estado, situacao: situacaoMarco(m), local: LOCAIS.find(l => l.chave === m.local)?.nome || null, responsavel: nomePessoa[m.responsavel_id] || null, reconfirmado: !!m.reconfirmacao_resposta }))

  return {
    ok: true, de, ate: hoje, dias,
    resumo: {
      clientes: cards.length, com_conta: comConta.length,
      gasto, resultados, custo: resultados ? gasto / resultados : null,
      gastoAnt, resultadosAnt, custoAnt: resultadosAnt ? gastoAnt / resultadosAnt : null,
      por_nivel: { verde: cards.filter(c => c.nivel === 'verde').length, amarelo: cards.filter(c => c.nivel === 'amarelo').length, vermelho: cards.filter(c => c.nivel === 'vermelho').length, cinza: cards.filter(c => c.nivel === 'cinza').length },
    },
    cards, contatar, encontros, limites: LIMITES,
  }
}

async function montarCard(p: any, de: string, hoje: string, pct: number, nomePessoa: Record<string, string>): Promise<CardMonitor> {
  const r = ROTEIROS[p.produto as Produto]
  const inicio = String(p.data_inicio).slice(0, 10)
  const base: CardMonitor = {
    id: p.id, cliente: p.cliente, whatsapp: p.whatsapp || null, produto: p.produto, produtoNome: r?.nome || p.produto, cor: r?.cor || '#9ca3af',
    fase: p.fase, faseLabel: r?.fases.find(f => f.chave === p.fase)?.label || p.fase, responsavel: nomePessoa[p.responsavel_id] || null,
    data_inicio: inicio, data_fim: p.data_fim ? String(p.data_fim).slice(0, 10) : null, dia_do_contrato: diasEntre(inicio, hoje),
    tem_conta: !!p.ad_account_id, conta: null, portal_chave: p.portal_chave || null, valor_cliente: p.valor_cliente != null ? Number(p.valor_cliente) : null, alvo_custo: p.alvo_custo_resultado != null ? Number(p.alvo_custo_resultado) : null,
    painel: null, nivel: 'cinza', alertas: [], recomendacoes: [], proximo: null, atrasados: 0, sparkline: [], anuncios_ativos: 0, idade_criativo: null,
  }

  // ── a entrega (marcos) vale pra todo cliente, com ou sem conta
  const { data: marcos } = await sb.from('projeto_marcos').select('id, titulo, natureza, estado, ordem, data_combinada, data_prevista, local, reconfirmacao_resposta').eq('projeto_id', p.id).order('ordem')
  const pendentes = (marcos || []).filter((m: any) => m.estado !== 'concluido' && m.estado !== 'cancelado')
  const prox = pendentes.find((m: any) => m.natureza === 'encontro') || pendentes[0]
  if (prox) base.proximo = { titulo: prox.titulo, data: prox.data_combinada || (prox.data_prevista ? String(prox.data_prevista).slice(0, 10) : null), estado: prox.estado, situacao: situacaoMarco(prox), local: LOCAIS.find(l => l.chave === prox.local)?.nome || null }
  // a sessão de implantação (o primeiro encontro do roteiro) já aconteceu? Decide se "sem campanha" é normal ou é problema
  const primeiroEncontro = (marcos || []).find((m: any) => m.natureza === 'encontro')
  const sessaoFeita = primeiroEncontro?.estado === 'concluido'
  // três atrasos diferentes, três avisos diferentes:
  //   previsto e a data passou   → ninguém marcou com o cliente: vermelho, ligar
  //   combinado/confirmado e passou → aconteceu (ou não) e ninguém fechou no sistema: interno, amarelo
  //   etapa interna e passou     → trabalho nosso atrasado: amarelo
  const semMarcar: any[] = [], semFechar: any[] = [], internas: any[] = []
  for (const m of pendentes) {
    const s = situacaoMarco(m)
    if (s !== 'atrasado' && s !== 'a_remarcar') continue
    base.atrasados++
    if (m.natureza !== 'encontro') internas.push(m)
    else if (m.estado === 'previsto' || s === 'a_remarcar') semMarcar.push(m)
    else semFechar.push(m)
  }
  if (semMarcar.length) base.alertas.push({ nivel: 'vermelho', chave: 'encontro_atrasado', titulo: semMarcar.length === 1 ? `"${semMarcar[0].titulo}" passou da data prevista e não foi marcado` : `${semMarcar.length} encontros passaram da data sem marcar`, acao: 'Ligar e marcar a data', contatar: true })
  if (semFechar.length) base.alertas.push({ nivel: 'amarelo', chave: 'encontro_sem_fechar', titulo: `"${semFechar[0].titulo}" era ${String(semFechar[0].data_combinada).slice(0, 10).split('-').reverse().join('/')} e não foi fechado no sistema`, acao: 'Dar como feito na ficha (ou remarcar)' })
  if (internas.length) base.alertas.push({ nivel: 'amarelo', chave: 'etapa_interna', titulo: `Etapa nossa atrasada: ${internas[0].titulo}`, acao: 'Concluir ou ajustar o prazo na ficha' })
  const amanha = menosDias(hoje, -1)
  const semReconf = pendentes.find((m: any) => m.estado === 'combinado' && m.data_combinada && new Date(m.data_combinada).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) === amanha && !m.reconfirmacao_resposta)
  if (semReconf) base.alertas.push({ nivel: 'amarelo', chave: 'reconfirmar', titulo: `Encontro amanhã sem reconfirmação: ${semReconf.titulo}`, acao: 'Mandar a reconfirmação', contatar: true })
  if (p.status === 'ativo' && !pendentes.length) base.alertas.push({ nivel: 'amarelo', chave: 'sem_proximo', titulo: 'Sem próximo passo no roteiro', acao: 'Definir o que vem agora ou encerrar' })

  // ── configuração que trava o painel do cliente
  if (!base.portal_chave) base.alertas.push({ nivel: 'amarelo', chave: 'sem_portal', titulo: 'Cliente ainda sem o link do portal', acao: 'Gerar o link na ficha e mandar pra ele' })
  if (base.tem_conta && base.valor_cliente == null) base.alertas.push({ nivel: 'amarelo', chave: 'sem_valor_cliente', titulo: 'Falta "quanto vale um cliente novo"', acao: 'Preencher na ficha, no bloco da meta' })

  if (!base.tem_conta) {
    base.nivel = base.alertas.some(a => a.nivel === 'vermelho') ? 'vermelho' : 'cinza'
    if (!base.alertas.length) base.alertas.push({ nivel: 'amarelo', chave: 'sem_conta', titulo: 'Sem conta de anúncio ligada', acao: 'Ligar a conta na ficha quando a campanha começar' })
    return base
  }

  // ── o tráfego
  const [painel, conta, { data: d14 }, { data: d30 }, { data: ads }] = await Promise.all([
    lerPainel(p, de, hoje, pct),
    getStatusConta(p.ad_account_id),
    sb.from('trafego_anuncios_dia').select('data, gasto, resultados').eq('projeto_id', p.id).gte('data', menosDias(hoje, 13)),
    sb.from('trafego_anuncios_dia').select('gasto, resultados').eq('projeto_id', p.id).gte('data', menosDias(hoje, 29)),
    sb.from('trafego_anuncios').select('ad_id, ad_name, status, primeiro_dia').eq('projeto_id', p.id),
  ])
  base.painel = painel
  base.conta = conta

  // sparkline dos 14 dias, com os dias vazios como zero
  const porDia: Record<string, { resultados: number; gasto: number }> = {}
  for (const l of d14 || []) { porDia[l.data] = porDia[l.data] || { resultados: 0, gasto: 0 }; porDia[l.data].resultados += Number(l.resultados); porDia[l.data].gasto += Number(l.gasto) * (1 + pct / 100) }
  for (let i = 13; i >= 0; i--) { const d = menosDias(hoje, i); base.sparkline.push({ data: d, ...(porDia[d] || { resultados: 0, gasto: 0 }) }) }

  const t = painel.total, ant = painel.anterior
  const ativos = (ads || []).filter((a: any) => !PAUSADO(a.status))
  base.anuncios_ativos = ativos.length
  const puxa = painel.anuncios.find(a => a.situacao === 'puxando')
  const adPuxa = puxa ? (ads || []).find((a: any) => a.ad_id === puxa.ad_id) : null
  base.idade_criativo = adPuxa?.primeiro_dia ? diasEntre(String(adPuxa.primeiro_dia).slice(0, 10), hoje) : null
  const m30 = (d30 || []).reduce((a, l) => ({ g: a.g + Number(l.gasto) * (1 + pct / 100), r: a.r + Number(l.resultados) }), { g: 0, r: 0 })
  const media30 = m30.r >= LIMITES.minResultados ? m30.g / m30.r : null
  const nome = painel.nome

  // ── a campanha ainda não começou? Antes da sessão é normal (cinza); depois da sessão é problema
  // (se a conta não pode ser lida, não dá pra afirmar que não há campanha: fica só o aviso de acesso)
  const semCampanha = conta.ok && t.gasto === 0 && ativos.length === 0
  let aguardando = false
  if (semCampanha && !sessaoFeita) aguardando = true
  if (!conta.ok && t.gasto === 0) aguardando = true
  if (semCampanha && sessaoFeita) base.alertas.push({ nivel: 'vermelho', chave: 'sem_campanha', titulo: 'Implantação feita e nenhuma campanha rodando', acao: 'Subir a campanha hoje: o cliente saiu da sessão esperando ela no ar' })

  // ── a conta: acesso, ativa, saldo
  if (!conta.ok) base.alertas.push({ nivel: 'amarelo', chave: 'conta_sem_acesso', titulo: 'O sistema não consegue ler a conta de anúncio', detalhe: conta.error, acao: 'Dar acesso ao usuário do sistema no Business Manager' })
  else if (conta.ativa === false) base.alertas.push({ nivel: 'vermelho', chave: 'conta_inativa', titulo: 'Conta de anúncio desativada na Meta', detalhe: `status ${conta.status}`, acao: 'Ver o motivo no Business Manager e avisar o cliente', contatar: true })
  else if (conta.prepago && conta.saldo != null) {
    if (conta.saldo <= 0 && ativos.length) base.alertas.push({ nivel: 'vermelho', chave: 'sem_saldo', titulo: 'Conta pré-paga sem saldo, com anúncio ativo', detalhe: conta.saldo_texto || undefined, acao: 'Pedir ao cliente pra colocar verba hoje', contatar: true })
    else if (conta.saldo <= 0) base.alertas.push({ nivel: 'amarelo', chave: 'sem_saldo', titulo: 'Conta pré-paga sem saldo', acao: 'Combinar com o cliente a verba antes da campanha subir', contatar: true })
    else if (conta.saldo < LIMITES.saldoBaixo) base.alertas.push({ nivel: 'amarelo', chave: 'saldo_baixo', titulo: `Saldo baixo: ${fmtBRL(conta.saldo)}`, acao: 'Avisar o cliente pra recarregar', contatar: true })
  }

  // ── vermelhos: a campanha parou ou está jogando dinheiro fora
  const ultimos = base.sparkline.slice(-LIMITES.diasSemGasto)
  if (ativos.length && ultimos.every(d => d.gasto === 0) && base.dia_do_contrato > LIMITES.diasSemGasto) base.alertas.push({ nivel: 'vermelho', chave: 'sem_gasto', titulo: `Sem gasto há ${LIMITES.diasSemGasto} dias com ${ativos.length} ${ativos.length === 1 ? 'anúncio ativo' : 'anúncios ativos'}`, acao: 'Conferir saldo, cartão e se a campanha não foi pausada', contatar: true })
  // rodou e parou: tudo pausado. Três dias pode ser ajuste de propósito (amarelo); o dobro
  // disso, num cliente que paga pela campanha no ar, é vermelho.
  else if (!ativos.length && ultimos.every(d => d.gasto === 0) && base.sparkline.some(d => d.gasto > 0)) {
    let parado = 0
    for (let i = base.sparkline.length - 1; i >= 0 && base.sparkline[i].gasto === 0; i--) parado++
    const grave = parado >= LIMITES.diasSemGasto * 2
    base.alertas.push({ nivel: grave ? 'vermelho' : 'amarelo', chave: 'parou', titulo: `Campanha parada há ${parado} dias: tudo pausado, nenhum anúncio ativo`, acao: grave ? 'Reativar ou subir a próxima campanha hoje' : 'Foi de propósito? Se não, reativar' })
  }
  if (t.gasto > 0 && t.resultados === 0 && !ultimos.every(d => d.gasto === 0)) base.alertas.push({ nivel: 'vermelho', chave: 'sem_resultado', titulo: `${fmtBRL(t.gasto)} em ${LIMITES.janelaDias} dias sem nenhum resultado`, acao: 'Trocar criativo ou público hoje' })
  if (t.custo != null && t.resultados >= LIMITES.minResultados) {
    if (base.alvo_custo && t.custo > base.alvo_custo * LIMITES.custoVsAlvo) base.alertas.push({ nivel: 'vermelho', chave: 'custo_alvo', titulo: `Custo ${fmtBRL(t.custo)}, mais de ${LIMITES.custoVsAlvo}× o alvo de ${fmtBRL(base.alvo_custo)}`, acao: 'Rever público e oferta' })
    else if (!base.alvo_custo && media30 && t.custo > media30 * LIMITES.custoVsMedia) base.alertas.push({ nivel: 'vermelho', chave: 'custo_media', titulo: `Custo ${fmtBRL(t.custo)}, mais de ${LIMITES.custoVsMedia}× a média de 30 dias (${fmtBRL(media30)})`, acao: 'Rever público e oferta' })
  }

  // ── amarelos: sinal de desgaste ou de descuido
  if (ant && ant.custo && t.custo && t.resultados >= LIMITES.minResultados && ant.resultados >= LIMITES.minResultados) {
    const sub = Math.round(((t.custo - ant.custo) / ant.custo) * 100)
    if (sub > LIMITES.altaCustoPct) base.alertas.push({ nivel: 'amarelo', chave: 'custo_subiu', titulo: `Custo subiu ${sub}% contra o período anterior`, acao: 'Ver se é o criativo cansando ou o público saturado' })
  }
  if (base.idade_criativo != null && base.idade_criativo > LIMITES.idadeCriativo && puxa) base.alertas.push({ nivel: 'amarelo', chave: 'criativo_velho', titulo: `"${puxa.nome}" puxa há ${base.idade_criativo} dias`, acao: 'Preparar o próximo criativo antes de cansar' })
  if (ativos.length === 1 && t.gasto > 0) base.alertas.push({ nivel: 'amarelo', chave: 'um_anuncio', titulo: 'Só um anúncio ativo, sem teste rodando', acao: 'Subir um segundo anúncio pra comparar' })
  // com pouca verba no período, "32% da verba" são R$ 10: não se afirma nada
  const queimando = t.gasto >= LIMITES.minGastoLeitura ? painel.anuncios.filter(a => a.situacao === 'queimando' && !PAUSADO(a.status) && a.gasto / t.gasto * 100 >= LIMITES.queimaPct) : []
  for (const q of queimando.slice(0, 2)) base.alertas.push({ nivel: 'amarelo', chave: 'queimando_' + q.ad_id, titulo: `"${q.nome}" levou ${Math.round(q.gasto / t.gasto * 100)}% da verba ${q.resultados ? `a ${fmtBRL(q.custo!)} cada` : 'sem resultado'}`, acao: `Pausar "${q.nome}"` })
  if (painel.sincronizado_em && diasEntre(String(painel.sincronizado_em).slice(0, 10), hoje) - 1 > LIMITES.diasSemSync) base.alertas.push({ nivel: 'amarelo', chave: 'sem_sync', titulo: `Dados da Meta de ${String(painel.sincronizado_em).slice(0, 10).split('-').reverse().join('/')}`, acao: 'Sincronizar' })

  // ── recomendações: o que fazer, na ordem
  const rec: string[] = []
  for (const a of base.alertas.filter(a => a.nivel === 'vermelho')) if (a.acao) rec.push(a.acao)
  if (puxa && (!base.alvo_custo || (puxa.custo != null && puxa.custo <= base.alvo_custo)) && t.resultados >= LIMITES.minResultados && !base.alertas.some(a => a.nivel === 'vermelho')) rec.push(`Escalar "${puxa.nome}": subir a verba uns 20% e acompanhar 3 dias`)
  for (const a of base.alertas.filter(a => a.nivel === 'amarelo')) if (a.acao && !rec.includes(a.acao)) rec.push(a.acao)
  if (!rec.length && t.resultados > 0) rec.push('Manter. Nada pede ação esta semana.')
  base.recomendacoes = rec.slice(0, 5)

  // configuração pendente não pinta o card: é lembrete, não leitura da campanha
  const CONFIG = ['sem_portal', 'sem_valor_cliente']
  base.nivel = base.alertas.some(a => a.nivel === 'vermelho') ? 'vermelho'
    : aguardando ? 'cinza'
    : base.alertas.some(a => a.nivel === 'amarelo' && !CONFIG.includes(a.chave)) ? 'amarelo' : 'verde'
  return base
}

export type { Painel, AnuncioPainel }
