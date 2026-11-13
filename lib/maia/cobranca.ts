// Maia: a parte administrativa (13/11, decisões do Guto). Cada cliente da Maia:
//   1) vira cliente no CRM da escola (projetos + instalacoes, produto "maia"), igual Dani e GAJA, e o negócio guarda o
//      projeto em meta.financeiro.projeto_id (sem coluna nova);
//   2) paga a IMPLANTAÇÃO (R$ 497) numa cobrança avulsa do Asaas, com vencimento no dia da implantação ou antes;
//   3) paga a MENSALIDADE (R$ 997) numa assinatura do Asaas que começa na data combinada no 1º encontro. O dia dela vira
//      o mensalidade_dia/cobranca_desde do projeto, e o motor da escola (lib/mensalidades.ts) cria o previsto de cada mês;
//   4) pagou: a rotina (de hora em hora) dá baixa sozinha no financeiro, do jeito da tela de recorrentes
//      (grupo_recorrencia = projeto.id + mes_referencia; o previsto vira realizado; nunca duplica);
//   5) venceu e não pagou: no DIA SEGUINTE ao vencimento a equipe é avisada (urgente), UMA vez por cobrança. A Maia
//      NÃO desliga sozinha e continua atendendo: quem decide é a equipe.
// A conta do Asaas é a mesma do Oito e do Recado (ASAAS_API_KEY, lib/oito/asaas.ts). Sem a chave fora da Vercel, tudo é
// simulado (tabela local asaas_sim) e dá pra "pagar de mentira" no teste; na Vercel sem chave, falha (nunca finge).
import { maiaDb as db } from './db'
import { escola, ORG_ESCOLA } from './escola'
import { asaasApi, ASAAS_PAGO, simulado, podeSimular } from '@/lib/oito/asaas'

export const VALOR_MENSAL = 997
export const VALOR_IMPLANTACAO = 497
const CATEGORIA = 'mensalidade_cliente'
const UNIDADE = 'geral'
const DIA = 86400e3
export const hojeBR = (agora = new Date()) => new Date(agora.getTime() - 3 * 3600e3).toISOString().slice(0, 10)
const diaSeguinte = (d: string) => new Date(Date.parse(d + 'T12:00:00Z') + DIA).toISOString().slice(0, 10)
const mesRef = (d: string) => d.slice(0, 8) + '01'
const dig = (s: any) => String(s || '').replace(/\D/g, '')
const reais = (v: number) => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const br = (d: string) => d.split('-').reverse().join('/')

export type Pagamento = { id: string; value: number; dueDate: string; status: string; paymentDate?: string | null; invoiceUrl?: string | null }
export type Financeiro = {
  projeto_id?: string | null
  nome?: string; documento?: string; email?: string
  asaas_customer?: string | null
  implantacao?: { pagamento_id: string; valor: number; vence: string; link: string | null } | null
  assinatura?: { id: string; valor: number; primeira: string; dia: number } | null
  baixados?: string[]   // os pagamentos do Asaas que já viraram lançamento realizado
  avisados?: string[]   // as cobranças vencidas que já viraram aviso pra equipe (1 vez cada)
  situacao?: Situacao | null
}
export type Situacao = {
  implantacao: { status: 'sem_cobranca' | 'pendente' | 'atrasada' | 'paga'; valor?: number; vence?: string; link?: string | null; pago_em?: string | null }
  mensalidade: { status: 'sem_assinatura' | 'em_dia' | 'atrasada'; valor?: number; proxima?: string | null; link?: string | null; atrasadas: number; pago_ate?: string | null }
  conferido_em: string
}

export const financeiroDo = (neg: any): Financeiro => ({ ...(neg?.meta?.financeiro || {}) })
async function guarda(negocio_id: string, f: Financeiro) {
  const n = await db.um('negocios', { id: negocio_id })
  if (!n) throw new Error('negócio não existe')
  const [x] = await db.atualiza('negocios', { id: negocio_id }, { meta: { ...(n.meta || {}), financeiro: f } })
  return x
}

// ─────────────────────────── o Asaas (de verdade, ou simulado fora da Vercel)
function confereChave() { if (simulado() && !podeSimular()) throw new Error('falta a chave do Asaas (ASAAS_API_KEY) na Vercel: a cobrança não sai') }
const simId = (p: string) => `sim-${p}-${Math.random().toString(36).slice(2, 10)}`
const simLink = (id: string) => `https://sandbox.asaas.simulado/fatura/${id}`

async function clienteAsaas(neg: any, f: Financeiro): Promise<string> {
  if (f.asaas_customer) return f.asaas_customer
  confereChave()
  if (simulado()) return 'sim-cus-' + neg.id
  // não duplica: o mesmo CPF/CNPJ já cadastrado na conta (Oito, Recado ou outro negócio) é reaproveitado
  const doc = dig(f.documento)
  const ja = await asaasApi(`/customers?cpfCnpj=${doc}&limit=1`).catch(() => null)
  if (ja?.data?.[0]?.id) return ja.data[0].id as string
  const fone = dig(neg.dono_whatsapp).replace(/^55(?=\d{10,11}$)/, '')
  const c = await asaasApi('/customers', { method: 'POST', body: JSON.stringify({ name: f.nome || neg.nome, cpfCnpj: doc, email: f.email, mobilePhone: fone, externalReference: 'maia:' + neg.id, notificationDisabled: false }) })
  return c.id as string
}

async function criaCobrancaAvulsa(customer: string, d: { valor: number; vence: string; descricao: string; ref: string }): Promise<Pagamento> {
  if (simulado()) {
    const id = simId('pay')
    const p = { id, value: d.valor, dueDate: d.vence, status: 'PENDING', paymentDate: null, invoiceUrl: simLink(id) }
    await db.insere('asaas_sim', { ...p, assinatura: null, ref: d.ref })
    return p
  }
  const p = await asaasApi('/payments', { method: 'POST', body: JSON.stringify({ customer, billingType: 'UNDEFINED', value: d.valor, dueDate: d.vence, description: d.descricao, externalReference: d.ref }) })
  return { id: p.id, value: p.value, dueDate: p.dueDate, status: p.status, paymentDate: p.paymentDate || null, invoiceUrl: p.invoiceUrl || null }
}

async function criaAssinaturaMensal(customer: string, d: { valor: number; primeira: string; ref: string }) {
  if (simulado()) return 'sim-sub-' + Math.random().toString(36).slice(2, 10)
  const s = await asaasApi('/subscriptions', { method: 'POST', body: JSON.stringify({ customer, billingType: 'UNDEFINED', value: d.valor, nextDueDate: d.primeira, cycle: 'MONTHLY', description: 'Maia · mensalidade', externalReference: d.ref }) })
  return s.id as string
}

async function pagamento(id: string): Promise<Pagamento | null> {
  if (id.startsWith('sim-')) return (await db.um('asaas_sim', { id })) as Pagamento | null
  const p = await asaasApi(`/payments/${id}`).catch(() => null)
  return p ? { id: p.id, value: p.value, dueDate: p.dueDate, status: p.status, paymentDate: p.paymentDate || p.clientPaymentDate || null, invoiceUrl: p.invoiceUrl || null } : null
}

// as mensalidades da assinatura. Simulada: gera os meses da 1ª até o mês que vem (como o Asaas, que sempre deixa a próxima aberta)
async function pagamentosDaAssinatura(a: NonNullable<Financeiro['assinatura']>, agora: Date): Promise<Pagamento[]> {
  if (a.id.startsWith('sim-')) {
    const ja = await db.lista('asaas_sim', { assinatura: a.id })
    const limite = hojeBR(new Date(agora.getTime() + 31 * DIA))
    for (let d = new Date(a.primeira + 'T12:00:00Z'); hojeBR(d) <= limite || !ja.length; d.setUTCMonth(d.getUTCMonth() + 1)) {
      const venc = d.toISOString().slice(0, 10)
      if (ja.some(x => x.dueDate === venc)) continue
      const id = simId('pay')
      ja.push(await db.insere('asaas_sim', { id, value: a.valor, dueDate: venc, status: 'PENDING', paymentDate: null, invoiceUrl: simLink(id), assinatura: a.id }))
      if (venc > limite) break
    }
    return ja as Pagamento[]
  }
  const r = await asaasApi(`/subscriptions/${a.id}/payments?limit=50`)
  return (r.data || []).map((p: any) => ({ id: p.id, value: p.value, dueDate: p.dueDate, status: p.status, paymentDate: p.paymentDate || p.clientPaymentDate || null, invoiceUrl: p.invoiceUrl || null }))
}

// só no teste (fora da Vercel, sem chave): finge que o cliente pagou
export async function simulaPagamento(neg: any, qual: 'implantacao' | 'mensalidade', agora = new Date()) {
  if (!podeSimular()) throw new Error('simular pagamento só no modo de teste')
  const f = financeiroDo(neg)
  let id: string | undefined
  if (qual === 'implantacao') id = f.implantacao?.pagamento_id
  else if (f.assinatura) id = (await pagamentosDaAssinatura(f.assinatura, agora)).filter(p => !ASAAS_PAGO.includes(p.status)).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]?.id
  if (!id) throw new Error('não tem cobrança em aberto pra simular')
  await db.atualiza('asaas_sim', { id }, { status: 'RECEIVED', paymentDate: hojeBR(agora) })
  return { pagamento: id }
}

// ─────────────────────────── 1) o cliente no CRM da escola
export async function ligaCliente(negocio_id: string, d: { documento: string; email: string; nome?: string; projeto_id?: string | null; por?: string }) {
  const neg = await db.um('negocios', { id: negocio_id })
  if (!neg) throw new Error('negócio não existe')
  const doc = dig(d.documento)
  if (doc.length !== 11 && doc.length !== 14) throw new Error('CPF ou CNPJ inválido (a cobrança do Asaas precisa dele)')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(d.email || ''))) throw new Error('e-mail inválido (a fatura vai pra ele)')
  const f = financeiroDo(neg)
  const nome = String(d.nome || neg.nome).trim().slice(0, 120)
  let projeto_id = d.projeto_id || f.projeto_id || null
  if (projeto_id) {
    if (!(await escola.um('projetos', { id: projeto_id }))) throw new Error('esse cliente não existe no CRM da escola')
  } else {
    // mesmo nome em Clientes do CRM: liga no que já existe em vez de criar outro (seria o mesmo cliente duas vezes na cobrança)
    const inst = (await escola.lista('instalacoes', { org_id: ORG_ESCOLA, tipo: 'cliente' })).find(i => String(i.nome || '').trim().toLowerCase() === nome.toLowerCase() && i.projeto_id)
    if (inst) projeto_id = inst.projeto_id
    else {
      const proj = await escola.insere('projetos', {
        org_id: ORG_ESCOLA, cliente: nome, produto: 'maia', data_inicio: hojeBR(),
        status: 'manutencao', fim_tipo: 'manutencao', aviso_fim_dias: 30, prazo_meses: null, data_fim: null, fase: 'implantacao', participantes: [],
        mensalidade_valor: VALOR_MENSAL, mensalidade_dia: null, cobranca_desde: null,
        observacoes: `Cliente da Maia (negócio ${neg.id}). A cobrança é pelo Asaas, ligada no painel da Maia.`,
      })
      try {
        await escola.insere('instalacoes', { org_id: ORG_ESCOLA, nome, url: null, tipo: 'cliente', projeto_id: proj.id, observacoes: 'Cliente da Maia (cadastrado pelo painel da Maia).', atualizado_em: new Date().toISOString() })
      } catch (e) { await escola.apaga('projetos', { id: proj.id }); throw e }
      await escola.insere('projeto_andamentos', { org_id: ORG_ESCOLA, projeto_id: proj.id, tipo: 'criado', observacao: 'Contrato da Maia criado pelo painel da Maia.' }).catch(() => null)
      projeto_id = proj.id
    }
  }
  const novo: Financeiro = { ...f, projeto_id, nome, documento: doc, email: String(d.email).trim().toLowerCase() }
  await guarda(negocio_id, novo)
  await db.evento('cobranca_cliente', negocio_id, { projeto_id, por: d.por || 'equipe' })
  return { projeto_id }
}

// ─────────────────────────── 2) a implantação (avulsa)
export async function cobraImplantacao(negocio_id: string, d: { vence: string; valor?: number; por?: string }, agora = new Date()) {
  const neg = await db.um('negocios', { id: negocio_id })
  if (!neg) throw new Error('negócio não existe')
  const f = financeiroDo(neg)
  if (!f.projeto_id || !f.documento) throw new Error('liga o cliente no CRM primeiro (CPF/CNPJ e e-mail)')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.vence)) throw new Error('data de vencimento inválida')
  if (d.vence < hojeBR(agora)) throw new Error('o vencimento não pode ser antes de hoje')
  if (f.implantacao) {
    const p = await pagamento(f.implantacao.pagamento_id)
    if (p && ASAAS_PAGO.includes(p.status)) throw new Error('a implantação já está paga')
    if (p && p.status !== 'DELETED') return { ja: true, link: f.implantacao.link, vence: f.implantacao.vence }
  }
  const valor = d.valor && d.valor > 0 ? d.valor : VALOR_IMPLANTACAO
  const customer = await clienteAsaas(neg, f)
  const p = await criaCobrancaAvulsa(customer, { valor, vence: d.vence, descricao: `Maia · implantação · ${neg.nome}`, ref: 'maia-impl:' + neg.id })
  await escola.atualiza('projetos', { id: f.projeto_id }, { valor_implantacao: valor, implantacao_vence_em: d.vence })
  await guarda(negocio_id, { ...f, asaas_customer: customer, implantacao: { pagamento_id: p.id, valor, vence: d.vence, link: p.invoiceUrl || null } })
  await db.evento('cobranca_implantacao', negocio_id, { pagamento_id: p.id, valor, vence: d.vence, por: d.por || 'equipe', simulado: p.id.startsWith('sim-') })
  return { link: p.invoiceUrl || null, vence: d.vence, valor, simulado: p.id.startsWith('sim-') }
}

// ─────────────────────────── 3) a mensalidade (assinatura com a data combinada no 1º encontro)
export async function abreAssinatura(negocio_id: string, d: { primeira: string; valor?: number; por?: string }, agora = new Date()) {
  const neg = await db.um('negocios', { id: negocio_id })
  if (!neg) throw new Error('negócio não existe')
  const f = financeiroDo(neg)
  if (!f.projeto_id || !f.documento) throw new Error('liga o cliente no CRM primeiro (CPF/CNPJ e e-mail)')
  if (f.assinatura) throw new Error('a assinatura da mensalidade já está aberta')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.primeira)) throw new Error('data da 1ª mensalidade inválida')
  if (d.primeira < hojeBR(agora)) throw new Error('a 1ª mensalidade não pode vencer antes de hoje')
  const valor = d.valor && d.valor > 0 ? d.valor : VALOR_MENSAL
  const customer = await clienteAsaas(neg, f)
  const id = await criaAssinaturaMensal(customer, { valor, primeira: d.primeira, ref: 'maia:' + neg.id })
  const dia = Number(d.primeira.slice(8, 10))
  // o projeto passa a cobrar dessa data em diante: o motor cria o previsto de cada mês (nunca pra trás)
  await escola.atualiza('projetos', { id: f.projeto_id }, { mensalidade_valor: valor, mensalidade_dia: dia, cobranca_desde: d.primeira, status: 'ativo' })
  await guarda(negocio_id, { ...f, asaas_customer: customer, assinatura: { id, valor, primeira: d.primeira, dia } })
  await db.evento('cobranca_assinatura', negocio_id, { assinatura: id, valor, primeira: d.primeira, por: d.por || 'equipe', simulado: id.startsWith('sim-') })
  const pags = await pagamentosDaAssinatura({ id, valor, primeira: d.primeira, dia }, agora).catch(() => [])
  return { assinatura: id, primeira: d.primeira, dia, link: pags.sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]?.invoiceUrl || null, simulado: id.startsWith('sim-') }
}

// ─────────────────────────── 4) a baixa no financeiro da escola (o mesmo jeito da tela de recorrentes)
let contaCache: string | null | undefined
async function contaAsaas(): Promise<string | null> {
  if (process.env.MAIA_CONTA_ASAAS) return process.env.MAIA_CONTA_ASAAS
  if (contaCache !== undefined) return contaCache
  const contas = await escola.lista('contas_financeiras', { ativo: true }).catch(() => [])
  const achou: string | null = contas.find(c => /asaas/i.test(String(c.nome || '')))?.id || null
  contaCache = achou
  return achou
}

export async function baixa(projeto_id: string, tipo: 'implantacao' | 'mensalidade', p: Pagamento, cliente: string) {
  const recorrente = tipo === 'mensalidade'
  const doGrupo = await escola.lista('lancamentos_empresa', { org_id: ORG_ESCOLA, grupo_recorrencia: projeto_id, recorrente })
  const mes = mesRef(p.dueDate)
  const alvo = recorrente ? doGrupo.filter(l => String(l.mes_referencia).slice(0, 10) === mes) : doGrupo
  if (alvo.some(l => l.status === 'realizado')) return { ja: true }
  if (alvo.length > 1) return { conferir: `mais de um lançamento de ${recorrente ? 'mensalidade de ' + mes : 'implantação'} do ${cliente}` }
  const data_pagamento = String(p.paymentDate || hojeBR()).slice(0, 10)
  const conta_id = await contaAsaas()
  if (alvo[0]) {
    // o previsto que o motor criou vira o pagamento (sem criar outro: contaria o dinheiro duas vezes)
    await escola.atualiza('lancamentos_empresa', { id: alvo[0].id }, { status: 'realizado', data_pagamento, conta_id, valor: p.value })
    return { atualizado: alvo[0].id }
  }
  const l = await escola.insere('lancamentos_empresa', {
    org_id: ORG_ESCOLA, tipo: 'receita', categoria: CATEGORIA, unidade: UNIDADE,
    descricao: `${recorrente ? 'Mensalidade' : 'Implantação'} ${cliente}`, valor: p.value,
    mes_referencia: mes, data_vencimento: p.dueDate, data_pagamento, status: 'realizado', recorrente, grupo_recorrencia: projeto_id, conta_id,
  })
  return { criado: l.id }
}

// ─────────────────────────── 5) a conferência (rotina de hora em hora): baixa o que foi pago e avisa o que venceu
const pago = (p: Pagamento | null) => !!p && ASAAS_PAGO.includes(p.status)

export async function confereNegocio(neg: any, agora = new Date()) {
  let f = financeiroDo(neg)
  if (!f.projeto_id || (!f.implantacao && !f.assinatura)) return null
  const hoje = hojeBR(agora)
  const baixados = new Set(f.baixados || []), avisados = new Set(f.avisados || [])
  const out = { baixas: [] as any[], avisos: [] as string[] }
  const cliente = f.nome || neg.nome
  const vencidas: { tipo: string; p: Pagamento }[] = []
  const sit: Situacao = { implantacao: { status: 'sem_cobranca' }, mensalidade: { status: 'sem_assinatura', atrasadas: 0 }, conferido_em: agora.toISOString() }

  if (f.implantacao) {
    const p = await pagamento(f.implantacao.pagamento_id)
    if (pago(p)) {
      if (!baixados.has(p!.id)) { out.baixas.push({ implantacao: await baixa(f.projeto_id, 'implantacao', p!, cliente) }); baixados.add(p!.id) }
      sit.implantacao = { status: 'paga', valor: p!.value, vence: p!.dueDate, pago_em: p!.paymentDate || null }
    } else {
      const venc = p?.dueDate || f.implantacao.vence
      const atrasada = hoje > venc
      sit.implantacao = { status: atrasada ? 'atrasada' : 'pendente', valor: f.implantacao.valor, vence: venc, link: p?.invoiceUrl || f.implantacao.link }
      if (atrasada && p) vencidas.push({ tipo: 'implantação', p })
    }
  }

  if (f.assinatura) {
    const pags = (await pagamentosDaAssinatura(f.assinatura, agora)).filter(p => p.status !== 'DELETED').sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    for (const p of pags.filter(pago)) {
      if (baixados.has(p.id)) continue
      out.baixas.push({ mensalidade: await baixa(f.projeto_id, 'mensalidade', p, cliente) }); baixados.add(p.id)
    }
    const abertas = pags.filter(p => !pago(p))
    const atrasadas = abertas.filter(p => hoje > p.dueDate)
    for (const p of atrasadas) vencidas.push({ tipo: 'mensalidade', p })
    const proxima = abertas[0] || null
    const ultimaPaga = pags.filter(pago).map(p => p.dueDate).sort().pop() || null
    sit.mensalidade = { status: atrasadas.length ? 'atrasada' : 'em_dia', valor: f.assinatura.valor, proxima: proxima?.dueDate || null, link: proxima?.invoiceUrl || null, atrasadas: atrasadas.length, pago_ate: ultimaPaga }
  }

  // o aviso: no dia seguinte ao vencimento (hoje > vencimento), uma vez por cobrança. A Maia segue atendendo
  for (const { tipo, p } of vencidas) {
    if (avisados.has(p.id) || hoje < diaSeguinte(p.dueDate)) continue
    const { avisaTime } = await import('./acompanhamento')
    await avisaTime(`cobrança atrasada: ${neg.nome}`,
      `A ${tipo} de ${reais(p.value)} do ${neg.nome} venceu em ${br(p.dueDate)} e não foi paga.${p.invoiceUrl ? ` Link da fatura: ${p.invoiceUrl}` : ''}\nA Maia continua atendendo normalmente: vocês decidem o que fazer.`,
      neg.id, true)
    await db.evento('cobranca_atrasada', neg.id, { pagamento_id: p.id, tipo, valor: p.value, vence: p.dueDate })
    avisados.add(p.id); out.avisos.push(p.id)
  }

  f = { ...f, baixados: [...baixados], avisados: [...avisados], situacao: sit }
  await guarda(neg.id, f)
  return { negocio: neg.id, ...out, situacao: sit }
}

export async function confereCobrancas(agora = new Date()) {
  const negs = (await db.lista('negocios')).filter(n => n?.meta?.financeiro?.projeto_id && n.status !== 'cancelado')
  const feitos: any[] = []
  for (const n of negs) {
    try { const r = await confereNegocio(n, agora); if (r && (r.baixas.length || r.avisos.length)) feitos.push(r) }
    catch (e: any) { feitos.push({ negocio: n.id, erro: String(e?.message || e).slice(0, 200) }) }
  }
  return { negocios: negs.length, feitos }
}

// pro painel: a situação guardada (sem ir no Asaas) e o que falta fazer
export function situacaoDo(neg: any) {
  const f = financeiroDo(neg)
  return {
    ligado: !!f.projeto_id, projeto_id: f.projeto_id || null, nome: f.nome || null, documento: f.documento || null, email: f.email || null,
    implantacao: f.implantacao ? { vence: f.implantacao.vence, valor: f.implantacao.valor, link: f.implantacao.link } : null,
    assinatura: f.assinatura ? { primeira: f.assinatura.primeira, dia: f.assinatura.dia, valor: f.assinatura.valor } : null,
    situacao: f.situacao || null, simulado: simulado(),
  }
}
