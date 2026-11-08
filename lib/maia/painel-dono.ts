// Maia: o PAINEL DO DONO (07/11). O dono gere tudo pelo WhatsApp, mas tem um painel só dele pra acompanhar
// resultados, funil, retomadas (follow-up), atendimento, anúncios e avisos. Página: /maia/painel · API: /api/maia/painel.
//
// ACESSO (sem senha nova): link mágico assinado por negócio. O token leva o negócio, a versão e a validade, e a assinatura
// usa uma chave DERIVADA só pra isso (o link de conectar o WhatsApp não abre o painel e o do painel não abre a conexão).
//   token = <negocio_id>.<versao>.<exp>.<assinatura>
// Revogar: a equipe troca a versão (meta.painel_versao do negócio) e todo link antigo para de abrir na hora.
// O negocio_id vem SÓ daqui (do token conferido no servidor), nunca do pedido.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { maiaDb as db, maiaLocal } from './db'
import { numeros } from './funil'

export const VALIDADE_DIAS = 30
export const COOKIE = 'maia_dono'

// MAIA_PAINEL_DONO_SEGREDO (opcional) ou o mesmo segredo do link de conexão; a chave é derivada com o propósito "painel-dono"
const raiz = () => process.env.MAIA_PAINEL_DONO_SEGREDO || process.env.MAIA_CONECTAR_SEGREDO || process.env.MAIA_PAINEL_SENHA || ''
const chave = () => createHmac('sha256', raiz()).update('maia:painel-dono:v1').digest()
const assina = (negocio_id: string, versao: number, exp: number) =>
  createHmac('sha256', chave()).update(`painel-dono.${negocio_id}.${versao}.${exp}`).digest('base64url').slice(0, 43)

export const versaoDe = (neg: any) => Math.max(0, Math.floor(Number(neg?.meta?.painel_versao) || 0))

export function tokenPainel(neg: any, ate = Date.now() + VALIDADE_DIAS * 86400e3) {
  if (!raiz()) throw new Error('falta o segredo do link (MAIA_CONECTAR_SEGREDO) no servidor')
  const exp = Math.floor(ate / 1000), v = versaoDe(neg)
  return `${neg.id}.${v}.${exp}.${assina(neg.id, v, exp)}`
}

// confere a assinatura e a validade (a versão é conferida contra o negócio em negocioDoToken)
export function leToken(t: string | null | undefined): { negocio_id: string; versao: number; exp: number } | null {
  const p = String(t || '').split('.')
  if (p.length !== 4 || !raiz()) return null
  const [negocio_id, vs, es, sig] = p
  if (!/^[0-9a-f-]{36}$/i.test(negocio_id) || !/^\d{1,6}$/.test(vs) || !/^\d{9,11}$/.test(es) || !/^[\w-]{43}$/.test(sig)) return null
  const versao = Number(vs), exp = Number(es)
  if (exp * 1000 < Date.now()) return null
  const a = Buffer.from(sig), b = Buffer.from(assina(negocio_id, versao, exp))
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return { negocio_id, versao, exp }
}

// o negócio do token, ou null (assinatura errada, vencido, revogado, negócio cancelado ou inexistente)
export async function negocioDoToken(t: string | null | undefined) {
  const l = leToken(t)
  if (!l) return null
  const neg = await db.um('negocios', { id: l.negocio_id })
  if (!neg || neg.status === 'cancelado' || versaoDe(neg) !== l.versao) return null
  return { neg, exp: l.exp }
}

export const basePublica = () => process.env.MAIA_URL_PUBLICA || (maiaLocal() ? `http://localhost:${process.env.PORT || 3000}` : 'https://www.carreiranodigital.com')
export function linkPainel(neg: any, base = basePublica()) { return `${base}/maia/painel?t=${tokenPainel(neg)}` }

// revoga todos os links do painel desse negócio (a equipe usa quando o dono perdeu o celular, trocou de sócio etc.)
export async function revogaLinks(negocio_id: string, por = 'equipe') {
  const n = await db.um('negocios', { id: negocio_id })
  if (!n) throw new Error('negócio não existe')
  const v = versaoDe(n) + 1
  await db.atualiza('negocios', { id: n.id }, { meta: { ...(n.meta || {}), painel_versao: v } })
  await db.evento('painel_dono_revogado', n.id, { por, versao: v })
  return { ...n, meta: { ...(n.meta || {}), painel_versao: v } }
}

// o número da Maia (o do Oito), pro botão "Fale com a Maia no WhatsApp"
export const numeroMaia = () => String(process.env.MAIA_WA_NUMERO || '5551993767137').replace(/\D/g, '')

// ---------- os dados ----------
// hoje no Brasil (o servidor é UTC)
export const hojeBR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)
export function periodo(p: string): [string, string] {
  const h = hojeBR(), d = (n: number) => new Date(Date.parse(h) - n * 86400e3).toISOString().slice(0, 10)
  if (p === 'hoje') return [h + 'T03:00:00.000Z', new Date().toISOString()]
  if (p === 'ontem') return [d(1) + 'T03:00:00.000Z', h + 'T03:00:00.000Z']
  if (p === 'mes') return [h.slice(0, 8) + '01T03:00:00.000Z', new Date().toISOString()]
  if (p === '30dias') return [d(30) + 'T03:00:00.000Z', new Date().toISOString()]
  return [d(7) + 'T03:00:00.000Z', new Date().toISOString()]
}

// 08/11: o período ANTERIOR do mesmo tamanho, pra mostrar a tendência (↑/↓ %) no painel do dono
//   hoje → ontem até esta hora · semana → os 7 dias antes · mês → o mês passado, do dia 1 até o mesmo ponto
export function periodoAnterior(p: string, de: string, ate: string): [string, string] {
  const L = Date.parse(ate) - Date.parse(de)
  if (p === 'mes') {
    const h = hojeBR(), y = Number(h.slice(0, 4)), m = Number(h.slice(5, 7))
    const ini = Date.UTC(m === 1 ? y - 1 : y, m === 1 ? 11 : m - 2, 1, 3)
    return [new Date(ini).toISOString(), new Date(Math.min(ini + L, Date.parse(de))).toISOString()]   // nunca passa do dia 1 deste mês
  }
  const passo = p === 'hoje' ? 86400e3 : Math.max(L, 86400e3)
  return [new Date(Date.parse(de) - passo).toISOString(), new Date(Date.parse(de) - passo + L).toISOString()]
}

// 08/11: o RETORNO (ROI) do período: "a cada R$ 1 investido em anúncio, voltaram R$ X".
//   por_real (= ROAS) = receita das vendas do período ÷ investimento em anúncio do período.
//   O investimento é o TOTAL de anúncio do negócio no período (maia_metricas_dia, igual ao /api/maia/operacao?acao=numeros);
//   as vendas são todas as marcadas no período (vendido_anuncio separa as de contatos que vieram de anúncio).
//   Sem investimento: por_real = null (o painel mostra só as vendas e explica por quê).
export function retornoDe(n: { gasto?: number | null; receita?: number | null; ganhos?: number | null }, doAnuncio: { n: number; receita: number }) {
  const r2 = (x: number) => Math.round(x * 100) / 100
  const investido = r2(Number(n.gasto) || 0), vendido = r2(Number(n.receita) || 0)
  const tem = investido > 0
  return {
    investido, vendido, vendas: Number(n.ganhos) || 0,
    vendido_anuncio: r2(doAnuncio.receita), vendas_anuncio: doAnuncio.n,
    por_real: tem ? r2(vendido / investido) : null,   // R$ que voltaram pra cada R$ 1 investido (= ROAS)
    saldo: tem ? r2(vendido - investido) : null,      // vendeu − investiu
    tem_investimento: tem,
    base: 'negocio' as const,                         // investimento = total de anúncio do negócio no período
  }
}

const ABERTAS = ['novo', 'conversando', 'interessado', 'proposta']
const r1 = (n: number) => Math.round(n * 10) / 10
// tabelas da Gestora (db/maia-gestora.sql) podem ainda não existir no banco: sem elas, lista vazia
const talvez = async (tab: string, f: any, o: any = {}) => { try { return await db.lista(tab, f, o) } catch { return [] } }

// o que sai de um lead pro painel (sem nada interno)
const leadPub = (l: any) => ({
  id: l.id, nome: l.nome, telefone: l.telefone, etapa: l.etapa, origem: l.origem, produto: l.produto, valor: l.valor,
  motivo_perda: l.motivo_perda, resumo: l.resumo, followups: l.followups || 0, proximo_followup_em: l.proximo_followup_em,
  ultimo_contato_em: l.ultimo_contato_em, criado_em: l.criado_em, ganho_em: l.ganho_em, perdido_em: l.perdido_em,
})

// conversas atendidas pela Maia e o tempo médio da primeira resposta (minutos), num período
function atendimento(convs: any[], msgs: any[], de: string, ate: string) {
  const porCv = new Map<string, any[]>()
  for (const m of msgs) (porCv.get(m.conversa_id) || porCv.set(m.conversa_id, []).get(m.conversa_id)!).push(m)
  let atendidas = 0
  const tempos: number[] = []
  for (const cv of convs) {
    const ms = (porCv.get(cv.id) || []).sort((a, b) => (a.criado_em < b.criado_em ? -1 : 1))
    if (ms.some(m => m.autor === 'maia' && m.criado_em >= de && m.criado_em <= ate)) atendidas++
    const primeira = ms.find(m => m.autor === 'cliente')
    if (primeira && primeira.criado_em >= de && primeira.criado_em <= ate) {
      const resp = ms.find(m => m.criado_em >= primeira.criado_em && (m.autor === 'maia' || m.autor === 'dono'))
      if (resp) tempos.push((Date.parse(resp.criado_em) - Date.parse(primeira.criado_em)) / 60e3)
    }
  }
  return { conversas_atendidas: atendidas, primeira_resposta_min: tempos.length ? r1(tempos.reduce((s, x) => s + x, 0) / tempos.length) : null }
}

export async function dadosDoPainel(neg: any) {
  const id = neg.id
  const [leads, convsTodas, evs, pecas, camps, avisosTodos] = await Promise.all([
    db.lista('leads', { negocio_id: id }, { ordem: 'atualizado_em', desc: true }),
    db.lista('conversas', { negocio_id: id }, { ordem: 'ultima_msg_em', desc: true }),
    db.lista('lead_eventos', { negocio_id: id }, { ordem: 'criado_em' }),
    db.lista('pecas', { negocio_id: id }, { ordem: 'criado_em', desc: true }),
    db.lista('campanhas', { negocio_id: id }, { ordem: 'criado_em', desc: true }),
    talvez('avisos', { negocio_id: id }, { ordem: 'criado_em', desc: true, limite: 60 }),
  ])
  const convs = convsTodas.filter(c => c.canal === 'cliente')
  const msgsCli = (await Promise.all(convs.map(c => db.lista('msgs', { conversa_id: c.id }, { ordem: 'criado_em' })))).flat()
  const agora = new Date().toISOString()
  const leadDe = new Map(leads.map(l => [l.id, l]))

  // 1) os números de hoje, da semana e do mês (os mesmos do /api/maia/operacao?acao=numeros e da ferramenta "numeros" do WhatsApp)
  //    + o período anterior do mesmo tamanho (tendência) e o retorno do anúncio (ROI), 08/11
  const deAnuncio = (l: any) => l.origem === 'anuncio' || !!l.anuncio_ref
  const vendasAnuncio = (de: string, ate: string) => {
    const g = leads.filter(l => l.ganho_em && l.ganho_em >= de && l.ganho_em <= ate && deAnuncio(l))
    return { n: g.length, receita: g.reduce((s, l) => s + (Number(l.valor) || 0), 0) }
  }
  const periodos: any = {}
  for (const p of ['hoje', 'semana', 'mes']) {
    const [de, ate] = periodo(p), [dA, aA] = periodoAnterior(p, de, ate)
    const atual = { ...(await numeros(id, de, ate)), ...atendimento(convs, msgsCli, de, ate) }
    const ant = { ...(await numeros(id, dA, aA)), ...atendimento(convs, msgsCli, dA, aA) }
    periodos[p] = {
      de, ate, ...atual,
      roi: retornoDe(atual, vendasAnuncio(de, ate)),
      anterior: { de: dA, ate: aA, leads_novos: ant.leads_novos, ganhos: ant.ganhos, receita: ant.receita, gasto: ant.gasto, conversao: ant.conversao,
        conversas_atendidas: ant.conversas_atendidas, primeira_resposta_min: ant.primeira_resposta_min, retorno: ant.retorno, custo_por_venda: ant.custo_por_venda },
    }
  }

  //    + os últimos 30 dias, dia a dia (no Brasil), pros mini-gráficos
  const met = await talvez('metricas_dia', { negocio_id: id })
  const diaBR = (iso: string) => new Date(Date.parse(iso) - 3 * 3600e3).toISOString().slice(0, 10)
  const dias: string[] = []
  for (let i = 29; i >= 0; i--) dias.push(new Date(Date.parse(hojeBR()) - i * 86400e3).toISOString().slice(0, 10))
  const pos = new Map(dias.map((d, i) => [d, i]))
  const zero = () => dias.map(() => 0)
  const serie = { dias, contatos: zero(), vendas: zero(), receita: zero(), gasto: zero(), conversas: zero() }
  for (const l of leads) {
    const a = l.criado_em ? pos.get(diaBR(l.criado_em)) : undefined
    if (a !== undefined) serie.contatos[a]++
    const b = l.ganho_em ? pos.get(diaBR(l.ganho_em)) : undefined
    if (b !== undefined) { serie.vendas[b]++; serie.receita[b] += Number(l.valor) || 0 }
  }
  for (const m of met) { const i = pos.get(String(m.dia).slice(0, 10)); if (i !== undefined) serie.gasto[i] += Number(m.gasto) || 0 }
  const jaContou = new Set<string>()   // conversas que a Maia atendeu em cada dia
  for (const m of msgsCli) {
    if (m.autor !== 'maia') continue
    const d = diaBR(m.criado_em), i = pos.get(d)
    if (i !== undefined && !jaContou.has(m.conversa_id + d)) { jaContou.add(m.conversa_id + d); serie.conversas[i]++ }
  }

  // 2) o que a Maia está esperando do dono
  const recente = (iso: string, dias: number) => Date.now() - Date.parse(iso) < dias * 86400e3
  const esperando: any[] = []
  for (const e of evs.filter(e => e.tipo === 'pergunta_dono' && recente(e.criado_em, 7))) {
    const l = leadDe.get(e.lead_id)
    if (l && l.etapa === 'proposta' && !esperando.some(x => x.lead_id === l.id && x.tipo === 'fechou')) esperando.push({ tipo: 'fechou', lead_id: l.id, nome: l.nome || l.telefone, texto: `A Maia perguntou se ${l.nome || 'esse contato'} fechou${l.produto ? ' (' + l.produto + (l.valor ? ', R$ ' + l.valor : '') + ')' : ''}.`, em: e.criado_em })
  }
  for (const e of evs.filter(e => e.tipo === 'pergunta_cliente')) {
    const respondida = evs.some(x => x.tipo === 'pergunta_respondida' && x.lead_id === e.lead_id && x.criado_em > e.criado_em)
    const l = leadDe.get(e.lead_id)
    if (!respondida && l && ABERTAS.includes(l.etapa)) esperando.push({ tipo: 'pergunta', lead_id: l.id, nome: l.nome || l.telefone, texto: `${l.nome || 'Um cliente'} perguntou: ${e.detalhe?.pergunta || '?'}. A Maia espera a tua resposta no WhatsApp pra repassar.`, em: e.criado_em })
  }
  for (const c of convs.filter(c => c.modo === 'humano')) {
    const l = leadDe.get(c.lead_id)
    if (!l || ABERTAS.includes(l.etapa)) esperando.push({ tipo: 'conversa', lead_id: c.lead_id, conversa_id: c.id, nome: c.nome || l?.nome || c.telefone, texto: `A Maia passou a conversa com ${c.nome || l?.nome || 'esse cliente'} pra ti: ela não responde mais ali.`, em: c.ultima_msg_em })
  }
  const pecasDono = pecas.filter(p => p.status === 'com_dono')
  if (pecasDono.length) esperando.unshift({ tipo: 'joinha', texto: `${pecasDono.length === 1 ? '1 anúncio espera' : pecasDono.length + ' anúncios esperam'} o teu 👍.`, em: pecasDono[0].enviado_dono_em })

  // 3) as retomadas (follow-up): agendadas, atrasadas, feitas e respondidas
  const motivoDe = (l: any) => {
    const nota = evs.filter(e => e.lead_id === l.id && e.tipo === 'nota' && e.detalhe?.motivo).slice(-1)[0]
    return nota?.detalhe?.motivo || (l.followups ? `retomada ${Math.min((l.followups || 0) + 1, 3)} de 3 (parou de responder)` : 'parou de responder')
  }
  const comGenteR = new Set(convs.filter(c => c.modo === 'humano').map(c => c.lead_id))
  const agendadas = leads.filter(l => ABERTAS.includes(l.etapa) && l.proximo_followup_em && !comGenteR.has(l.id))
    .sort((a, b) => (a.proximo_followup_em < b.proximo_followup_em ? -1 : 1))
    .map(l => ({ lead_id: l.id, nome: l.nome || l.telefone, telefone: l.telefone, etapa: l.etapa, produto: l.produto, quando: l.proximo_followup_em, atrasada: l.proximo_followup_em <= agora, motivo: motivoDe(l), numero: (l.followups || 0) + 1 }))
  const feitas = evs.filter(e => e.tipo === 'followup' && recente(e.criado_em, 30)).reverse().map(e => {
    const l = leadDe.get(e.lead_id)
    const respondeu = !!l && msgsCli.some(m => m.autor === 'cliente' && m.criado_em > e.criado_em && convs.find(c => c.id === m.conversa_id)?.lead_id === l.id)
    return { lead_id: e.lead_id, nome: l?.nome || l?.telefone || 'contato', numero: e.detalhe?.numero || null, em: e.criado_em, respondeu, etapa: l?.etapa || null }
  })

  // 4) o funil em colunas (as abertas que já levaram retomada vão pra "retomada")
  const coluna = (l: any) => l.etapa === 'ganho' ? 'ganho' : l.etapa === 'perdido' ? 'perdido' : (l.followups || 0) > 0 ? 'retomada' : l.etapa === 'novo' ? 'novo' : l.etapa === 'proposta' ? 'proposta' : 'conversa'
  const comGente = new Set(convs.filter(c => c.modo === 'humano').map(c => c.lead_id || leads.find(x => x.telefone === c.telefone)?.id).filter(Boolean))
  const proxima = (l: any) => {
    if (l.etapa === 'ganho') return `vendeu${l.valor ? ' R$ ' + l.valor : ''}`
    if (l.etapa === 'perdido') return l.motivo_perda || 'perdido'
    // 08/11 (teste completo, #14): conversa com gente vem antes de tudo: é "contigo", nunca "a Maia retoma amanhã"
    if (comGente.has(l.id)) return 'contigo: a Maia passou a conversa'
    const esp = esperando.find(x => x.lead_id === l.id)
    if (esp?.tipo === 'fechou') return 'a Maia perguntou se fechou: responde no WhatsApp'
    if (esp?.tipo === 'pergunta') return 'a Maia espera a tua resposta'
    if (esp?.tipo === 'conversa') return 'contigo: a Maia passou a conversa'
    if (l.proximo_followup_em) return (l.proximo_followup_em <= agora ? 'retomada atrasada' : 'a Maia retoma') + ' em ' + l.proximo_followup_em.slice(0, 10)
    if (l.etapa === 'proposta') return 'esperando o cliente decidir'
    return 'a Maia está conversando'
  }
  const funil = leads.map(l => ({ ...leadPub(l), coluna: coluna(l), proxima_acao: proxima(l), conversa_id: convs.find(c => c.lead_id === l.id || c.telefone === l.telefone)?.id || null }))

  // 5) o atendimento: as conversas com os clientes
  const conversas = convs.map(c => {
    const l = leadDe.get(c.lead_id) || leads.find(x => x.telefone === c.telefone)
    const status = c.modo === 'humano' ? 'dono' : l && !ABERTAS.includes(l.etapa) ? 'encerrada' : 'maia'
    return { id: c.id, nome: c.nome || l?.nome || null, telefone: c.telefone, status, ultima_msg: c.ultima_msg, ultima_msg_em: c.ultima_msg_em, etapa: l?.etapa || null, valor: l?.valor ?? null, lead_id: l?.id || null, simulada: !!c.simulada }
  })

  // 6) anúncios e campanhas (só o que o dono vê: nada que ainda está com a equipe, sem as notas internas)
  const visiveis = pecas.filter(p => ['com_dono', 'aprovada', 'no_ar'].includes(p.status) && p.tipo !== 'relatorio' && p.tipo !== 'texto')
  const anuncios = await Promise.all(visiveis.map(async p => ({ id: p.id, tipo: p.tipo, status: p.status, gancho: p.gancho, texto: p.texto, cta: p.cta, criado_em: p.criado_em, aprovado_dono_em: p.aprovado_dono_em, campanha_id: p.campanha_id, arquivo_url: await db.link(p.arquivo_path, 60 * 60 * 24) })))
  const em_preparo = pecas.filter(p => ['gerando', 'revisao_equipe', 'ajuste_equipe', 'ajuste_dono'].includes(p.status) && p.tipo !== 'relatorio').length
  const campanhas = camps.filter(c => c.status !== 'rascunho').map(c => {
    const ids = new Set((c.meta_ad_ids || []).map(String))
    const ls = leads.filter(l => l.anuncio_ref && ids.has(String(l.anuncio_ref)))
    const ganhos = ls.filter(l => l.etapa === 'ganho')
    return { id: c.id, nome: c.nome, status: c.status, verba_dia: c.verba_dia, ativada_em: c.ativada_em, criado_em: c.criado_em, simulada: !!c.simulada, anuncios: (c.peca_ids || []).length,
      contatos: ls.length, vendas: ganhos.length, receita: ganhos.reduce((s, l) => s + (Number(l.valor) || 0), 0) }
  })

  // 7) vendas e perdas (do mês), e os avisos da Maia que já foram pro dono
  const [deMes] = periodo('mes')
  const vendas = leads.filter(l => l.ganho_em && l.ganho_em >= deMes).sort((a, b) => (a.ganho_em < b.ganho_em ? 1 : -1)).map(leadPub)
  const perdas = leads.filter(l => l.perdido_em && l.perdido_em >= deMes).sort((a, b) => (a.perdido_em < b.perdido_em ? 1 : -1)).map(leadPub)
  const avisos = avisosTodos.filter(a => a.status === 'enviado' || a.status === 'resolvido').map(a => ({ id: a.id, dia: a.dia, nivel: a.nivel, titulo: a.titulo, texto: a.texto, acao: a.acao, status: a.status }))

  return {
    negocio: { nome: neg.nome, dono: String(neg.dono_nome || '').split(' ')[0] || null, nicho: neg.nicho, cidade: neg.cidade, plano: neg.plano, status: neg.status, verba_dia: neg.verba_dia ?? null,
      whatsapp_conectado: !!neg.wa_phone_id, maia_atende: neg?.meta?.wa?.atende === true },
    periodos, serie, esperando, retomadas: { agendadas, atrasadas: agendadas.filter(x => x.atrasada).length, feitas, respondidas: feitas.filter(x => x.respondeu).length },
    funil, conversas, anuncios, em_preparo, campanhas, vendas, perdas, avisos,
    whatsapp_maia: numeroMaia(), gerado_em: agora,
  }
}

// a conversa completa de um cliente (só se a conversa é do negócio do token)
export async function conversaDoPainel(neg: any, conversa_id: string) {
  const cv = await db.um('conversas', { id: conversa_id, negocio_id: neg.id })
  if (!cv || cv.canal !== 'cliente') return null
  const msgs = await db.lista('msgs', { conversa_id: cv.id, negocio_id: neg.id }, { ordem: 'criado_em' })
  return {
    conversa: { id: cv.id, nome: cv.nome, telefone: cv.telefone, modo: cv.modo },
    msgs: msgs.map(m => ({ autor: m.autor === 'equipe' || m.autor === 'sistema' ? 'maia' : m.autor, tipo: m.tipo, texto: m.texto, criado_em: m.criado_em, status: m.status })),
  }
}
