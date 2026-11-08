// Maia Gestora (T15, 08/11): as regras do vigia, trazidas de ferramentas/maia-gestora/lib/regras.js (o método de 06/11 virado conta).
// SÓ FUNÇÕES PURAS: nada aqui lê banco, Meta ou CRM, nem manda mensagem. Quem lê é lib/maia/gestora-crm.ts e quem roda é
// lib/maia/gestora-rotina.ts. Este arquivo não importa nada, pra o teste rodar direto no node (scripts/maia-teste-gestora.mjs).
// Cada regra devolve avisos { nivel: 'urgente'|'atencao'|'info', tipo, titulo, texto, acao, numeros, pessoas?, lead_ids? }.
//   `pessoas` (primeiro nome + inicial) só vai na mensagem do próprio dono; nunca é gravado (maia_avisos guarda só os lead_ids).
//   Área da saúde (cliente.saude): nenhum nome, nem na mensagem.
// Regra de ouro: o aviso aponta, o dono decide. Nenhuma regra mexe em verba, pausa anúncio ou fala com o cliente final.

export type Nivel = 'urgente' | 'atencao' | 'info'
export type Aviso = { nivel: Nivel; tipo: string; titulo: string; texto: string; acao: string; numeros: Record<string, any>; pessoas?: string[]; lead_ids?: string[] }
export type LinhaMeta = { data: string; ad_id: string; ad_name?: string; campaign_name?: string; adset_name?: string; gasto: number; conversas: number; status?: string }
export type Limites = {
  gasto_sem_conversa: number; parou_fracao: number; custo_subiu: number; dias_quente_parado: number; primeira_resposta_min: number
  sem_resposta_horas: number; promessa_horas: number; capi_erros_min: number; janela_funil_dias: number
}
// a configuração de cada negócio (vem de maia_negocios.gestora): que etapa é quente, qual já é paga, se é área da saúde...
export type ClienteGestora = {
  saude?: boolean; conta_prepaga?: boolean; etapas_quentes?: Record<string, string>; etapas_pagas?: string[]
  etapa_paga_nome?: string; valor_etapa_paga?: number; preco_unidade_pedido_grande?: number; limites?: Partial<Limites>
}

// os mesmos números do clientes.json do protótipo
export const LIMITES: Limites = {
  gasto_sem_conversa: 15, parou_fracao: 0.2, custo_subiu: 1.6, dias_quente_parado: 2, primeira_resposta_min: 15,
  sem_resposta_horas: 2, promessa_horas: 24, capi_erros_min: 3, janela_funil_dias: 30,
}
export const limitesDo = (cl: ClienteGestora | null | undefined): Limites => ({ ...LIMITES, ...(cl?.limites || {}) })

// as regras que rodam de 2 em 2 horas (9h às 20h): só as da Meta que custam dinheiro se demorar
export const TIPOS_URGENTES_META = ['gasto_sem_conversa', 'parou_de_gastar']

const H = 3600e3, D = 86400e3
export const R$ = (v: number) => 'R$ ' + (Math.round(v * 100) / 100).toLocaleString('pt-BR', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })
const so8 = (t: any) => String(t || '').replace(/\D/g, '').slice(-8)
const mediana = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
export const diaBR = (ms: number) => new Date(ms - 3 * H).toISOString().slice(0, 10)
export const horaBRde = (ms: number) => new Date(ms - 3 * H).getUTCHours()
export const tempo = (min: number) => min < 60 ? Math.round(min) + ' min' : min < 48 * 60 ? (Math.round(min / 6) / 10).toString().replace('.', ',') + ' h' : Math.round(min / 1440) + ' dias'
// "THIAGO pereira da silva" → "Thiago P." (nunca o nome inteiro)
export const primeiroNome = (n: any) => { const p = String(n || '').replace(/[^\p{L}\s'-]/gu, ' ').trim().split(/\s+/); return p[0] ? p[0][0].toUpperCase() + p[0].slice(1).toLowerCase() + (p[1] ? ' ' + p[1][0].toUpperCase() + '.' : '') : 'sem nome' }
const ids = (ls: any[]) => [...new Set(ls.map(l => l?.id).filter(Boolean).map(String))]

// campanha de WhatsApp = a que traz conversa de verdade (1+ conversa a cada R$ 100). Anúncio pro site às vezes conta 1 ou 2 conversas soltas.
function campanhasWa(meta: LinhaMeta[]) {
  const c: Record<string, { g: number; v: number }> = {}
  for (const l of meta) { const x = c[l.campaign_name || ''] ||= { g: 0, v: 0 }; x.g += l.gasto; x.v += l.conversas }
  return new Set(Object.entries(c).filter(([n, x]) => x.v >= 3 && x.v / Math.max(x.g, 1) * 100 >= 1 || /whats/i.test(n)).map(([n]) => n))
}

// ═══════════════════════════ META
function porDia(linhas: LinhaMeta[], filtro: (l: LinhaMeta) => boolean = () => true) {
  const d: Record<string, { gasto: number; conversas: number }> = {}
  for (const l of linhas) if (filtro(l)) { const x = d[l.data] ||= { gasto: 0, conversas: 0 }; x.gasto += l.gasto; x.conversas += l.conversas }
  return d
}
const soma = (dias: Record<string, any>, de: string, ate: string, campo: string) => Object.entries(dias).filter(([k]) => k >= de && k <= ate).reduce((s, [, v]) => s + v[campo], 0)
export const menos = (dia: string, n: number) => new Date(Date.parse(dia + 'T12:00:00Z') - n * D).toISOString().slice(0, 10)

export function regrasMeta(ctx: { meta: LinhaMeta[]; hoje: string; horaBR: number; L: Limites; rascunhos?: any[]; cliente: ClienteGestora }): Aviso[] {
  const { meta, hoje, horaBR, L, rascunhos, cliente } = ctx
  const av: Aviso[] = []
  if (!meta.length) return av
  const campWa = campanhasWa(meta)
  const wa = (l: LinhaMeta) => campWa.has(l.campaign_name || '')
  const tudo = porDia(meta), soWa = porDia(meta, wa)

  // 1. gasto sem conversa (hoje e ontem), nas campanhas de WhatsApp
  for (const [dia, rot] of [[hoje, 'hoje'], [menos(hoje, 1), 'ontem']]) {
    const x = soWa[dia]
    if (x && x.gasto >= L.gasto_sem_conversa && x.conversas === 0) {
      av.push({ nivel: 'urgente', tipo: 'gasto_sem_conversa', titulo: `Gastou ${R$(x.gasto)} ${rot} e não chegou nenhuma conversa`,
        texto: `As campanhas de WhatsApp gastaram ${R$(x.gasto)} ${rot} com 0 conversas. O mais comum é o WhatsApp ter se desligado da página.`,
        acao: 'Conferir se o WhatsApp está ligado à página e se o anúncio abre a conversa. Antes de mexer em verba.', numeros: { dia, ...x } })
      break
    }
  }

  // 2. parou de gastar (saldo, cartão, reprovação) + quantas vezes parou em 14 dias
  const base: number[] = []; for (let i = 2; i <= 8; i++) base.push(tudo[menos(hoje, i)]?.gasto || 0)
  const media = base.reduce((s, v) => s + v, 0) / 7
  if (media >= 20) {
    const ontem = tudo[menos(hoje, 1)]?.gasto || 0, hj = tudo[hoje]?.gasto || 0
    const paradas: string[] = []; for (let i = 0; i < 14; i++) { const d = menos(hoje, i); if ((tudo[d]?.gasto || 0) < media * 0.15 && !(i === 0 && horaBR < 12)) paradas.push(d) }
    const parouHoje = horaBR >= 12 && hj < media * 0.1
    const voltou = !parouHoje && hj >= media * 0.4
    if (ontem < media * L.parou_fracao || parouHoje) {
      av.push({ nivel: voltou ? 'atencao' : 'urgente', tipo: 'parou_de_gastar',
        titulo: voltou ? `A conta ficou parada ontem (${R$(ontem)}) e voltou hoje${paradas.length >= 3 ? `: ${paradas.length} dias parados em 2 semanas` : ''}` : `A conta parou de gastar (${parouHoje ? 'hoje ' + R$(hj) : 'ontem ' + R$(ontem)}; o normal é ${R$(media)}/dia)`,
        texto: `Ninguém pausou nada e o gasto caiu pra perto de zero.${paradas.length >= 3 ? ` Em 14 dias, ${paradas.length} dias assim.` : ''}${cliente.conta_prepaga ? ' A conta é pré-paga: quase sempre é saldo.' : ''}`,
        acao: cliente.conta_prepaga ? 'Conferir o saldo em Cobrança e pôr verba pra uns 10 dias.' : 'Conferir cobrança (cartão), anúncio reprovado e se a campanha está ativa.', numeros: { media, ontem, hoje: hj, dias_parados_14d: paradas } })
    }
  }

  // 3. custo por conversa subiu (3 dias fechados x 7 dias antes)
  const r3 = { g: soma(soWa, menos(hoje, 3), menos(hoje, 1), 'gasto'), c: soma(soWa, menos(hoje, 3), menos(hoje, 1), 'conversas') }
  const r7 = { g: soma(soWa, menos(hoje, 10), menos(hoje, 4), 'gasto'), c: soma(soWa, menos(hoje, 10), menos(hoje, 4), 'conversas') }
  if (r3.c >= 3 && r7.c >= 5 && r3.g >= 30) {
    const a = r3.g / r3.c, b = r7.g / r7.c
    if (a >= b * L.custo_subiu) av.push({ nivel: 'atencao', tipo: 'custo_subiu', titulo: `A conversa ficou ${Math.round((a / b - 1) * 100)}% mais cara (${R$(b)} → ${R$(a)})`,
      texto: 'Comparando os últimos 3 dias com a semana antes.', acao: 'Ver qual anúncio puxou o custo e se algum anúncio novo entrou ou saiu.', numeros: { antes: b, agora: a } })
  }

  // 4. mudança feita pelo conector que ficou em rascunho (a API não mostra rascunho: só vem quando alguém passa a lista)
  const pend = (rascunhos || []).filter(r => !r.publicado)
  if (pend.length) av.push({ nivel: 'atencao', tipo: 'rascunho', titulo: `${pend.length} mudança(s) de verba ficaram em rascunho, sem publicar`,
    texto: pend.map(r => `${r.objeto}: ${r.campo} → ${R$(r.para)}`).join('; ') + '. A Meta ainda roda com o valor antigo.',
    acao: 'Abrir o Gerenciador e publicar (ou descartar) as mudanças em rascunho. Só com o sim do dono.', numeros: { pendentes: pend.length } })
  return av
}

// ═══════════════════════════ CRM
export function contexto(d: any) {
  const leads: any[] = d.leads || [], mats: any[] = (d.matriculas || []).filter((m: any) => m.status !== 'cancelada')
  const venda: Record<string, any[]> = {}; for (const m of mats) if (m.lead_id) (venda[m.lead_id] ||= []).push(m)
  const ultMsg: Record<string, number> = {}; for (const c of d.wa_conversas || []) if (c.lead_id && c.ultima_msg_em) ultMsg[c.lead_id] = Math.max(ultMsg[c.lead_id] || 0, Date.parse(c.ultima_msg_em))
  const ultAnd: Record<string, number> = {}, entrouEtapa: Record<string, number> = {}
  for (const a of d.lead_andamentos || []) {
    ultAnd[a.lead_id] = Math.max(ultAnd[a.lead_id] || 0, Date.parse(a.criado_em))
    if (a.etapa_nova) entrouEtapa[a.lead_id + '|' + a.etapa_nova] = Math.max(entrouEtapa[a.lead_id + '|' + a.etapa_nova] || 0, Date.parse(a.criado_em))
  }
  const lab = Object.fromEntries((d.etapas || []).map((e: any) => [e.chave, e.label]))
  const papel = Object.fromEntries((d.etapas || []).map((e: any) => [e.chave, e.papel]))
  return { leads, mats, venda, ultMsg, ultAnd, entrouEtapa, lab, papel }
}
export type Contexto = ReturnType<typeof contexto>

export function regrasCRM(ctx: { d: any; cliente: ClienteGestora; agora: number; L: Limites; resumo: Record<string, any> }): { av: Aviso[]; c: Contexto } {
  const { d, cliente, agora, L } = ctx
  const c = contexto(d), av: Aviso[] = []
  const nomes = (ls: any[]) => cliente.saude ? [] : ls.filter(l => l.nome).map(l => primeiroNome(l.nome))

  // 5. lead quente parado
  const quentes: any[] = []
  for (const l of c.leads) {
    const rot = cliente.etapas_quentes?.[l.etapa]
    if (!rot || c.venda[l.id]) continue
    // parado = há quantos dias está NESSA etapa (mensagem automática de retomada não conta como andar)
    const ult = c.entrouEtapa[l.id + '|' + l.etapa] || Date.parse(l.atualizado_em || l.criado_em)
    const dias = (agora - ult) / D
    if (dias >= L.dias_quente_parado) quentes.push({ ...l, rot, dias })
  }
  if (quentes.length) {
    quentes.sort((a, b) => b.dias - a.dias)
    const porEtapa = quentes.reduce((o: Record<string, number>, l) => (o[l.rot] = (o[l.rot] || 0) + 1, o), {})
    av.push({ nivel: quentes.length >= 5 ? 'urgente' : 'atencao', tipo: 'quente_parado', titulo: `${quentes.length} pessoa(s) a um passo da compra, há ${L.dias_quente_parado}+ dias na mesma etapa`,
      texto: Object.entries(porEtapa).map(([k, v]) => `${v} em "${k}"`).join(', ') + `. A mais antiga está parada há ${Math.round(quentes[0].dias)} dias.`,
      acao: 'Chamar hoje, uma por uma, com o que falta pra fechar (é dinheiro que não custa verba).',
      numeros: { total: quentes.length, por_etapa: porEtapa }, pessoas: quentes.slice(0, 10).map(l => `${primeiroNome(l.nome)} (${l.rot}, ${Math.round(l.dias)} dias)`).filter(() => !cliente.saude), lead_ids: ids(quentes) })
  }

  // 6 e 7. primeira resposta e conversa sem resposta (pelas mensagens)
  const msgs = (d.wa_mensagens || []).filter((m: any) => m.criado_em).sort((a: any, b: any) => a.criado_em.localeCompare(b.criado_em))
  const porConv: Record<string, any[]> = {}; for (const m of msgs) (porConv[m.conversa_id] ||= []).push(m)
  const conv: Record<string, any> = Object.fromEntries((d.wa_conversas || []).map((x: any) => [x.id, x]))
  const atrasos: number[] = [], semResp: any[] = [], promessas: any[] = [], grandes: any[] = []
  const okFim = /^(ok|ok+\W*|obrigad\w*|valeu|blz|beleza|combinado|t[aá] bom|show|perfeito|certo|top|👍|🙏|❤️|😊|sim|tmj|até)\W*$/i
  const promessa = /(deixa eu (confirmar|ver|verificar|checar|conferir)|vou (confirmar|verificar|ver|consultar|checar|conferir|falar com)|j[aá] te (retorno|falo|aviso|chamo)|te (retorno|aviso) (j[aá]|em breve|logo|amanh)|confirmo com|vou te passar|retorno em breve|vou levantar)/i
  for (const [id, ms] of Object.entries(porConv)) {
    if (conv[id]?.eh_grupo) continue
    // 1ª resposta: conversa que começou na janela com mensagem do cliente
    const ini = Date.parse(ms[0].criado_em)
    if (ms[0].direcao === 'recebida' && agora - ini <= 7 * D && !(conv[id]?.criado_em && Date.parse(conv[id].criado_em) < ini - H)) {
      const r = ms.find(m => m.direcao === 'enviada' && Date.parse(m.criado_em) >= ini)
      if (r) atrasos.push((Date.parse(r.criado_em) - ini) / 60000)
    }
    const ult = ms[ms.length - 1], t = Date.parse(ult.criado_em)
    if (ult.direcao === 'recebida' && agora - t >= L.sem_resposta_horas * H && agora - t <= 3 * D && !okFim.test(String(ult.texto || '').trim())) semResp.push({ id, horas: (agora - t) / H, lead: conv[id]?.lead_id })
    // prometeu voltar ("vou confirmar com o time", "deixa eu ver") e a conversa morreu sem venda
    const lead = conv[id]?.lead_id
    const prom = ms.filter(m => m.direcao === 'enviada' && promessa.test(m.texto || ''))
    if (prom.length && agora - t >= L.promessa_horas * H && !(lead && c.venda[lead])) promessas.push({ id, dias: (agora - t) / D, lead })
    // pedido grande: o cliente fala em quantidade (20+ copos, unidades...) e não comprou
    // "50 copos" escrito direto, ou "uns 30" respondendo a "quantos você precisa?" (fica a última resposta: a pessoa corrige)
    let qtd = 0
    ms.forEach((m, i) => {
      if (m.direcao !== 'recebida') return
      const tx = String(m.texto || '')
      const q1 = tx.match(/\b(\d{2,4})\s*(copos?|unidades?|un\b|pe[cç]as?|canecas?|garrafas?|kits?|camisetas?|brindes?|chaveiros?|t[aá]buas?|placas?)/i)
      const antes = ms.slice(0, i).reverse().find(x => x.direcao === 'enviada')
      const q2 = tx.length <= 40 && antes && /quant[oa]s|quantidade/i.test(antes.texto || '') && !/r\$|reais|anos|dia/i.test(tx) && tx.match(/\b(\d{2,4})\b/)
      const q3 = tx.length <= 40 && !/r\$|reais|anos|dia|hora/i.test(tx) && tx.match(/\b(?:uns|umas|cerca de|precis\w*|seriam|s[aã]o)\s+(\d{2,4})\b/i)
      if (q1) qtd = +q1[1]; else if (q2) qtd = +q2[1]; else if (q3) qtd = +q3[1]
    })
    if (qtd >= 20 && !(lead && c.venda[lead]) && agora - t >= L.dias_quente_parado * D) grandes.push({ id, qtd, lead, dias: (agora - t) / D })
  }
  const med = mediana(atrasos)
  ctx.resumo.primeira_resposta_min = med; ctx.resumo.primeira_resposta_n = atrasos.length
  if (med != null && atrasos.length >= 5 && med > L.primeira_resposta_min) {
    const lentos = atrasos.filter(a => a > 60).length
    av.push({ nivel: med > 60 ? 'urgente' : 'atencao', tipo: 'resposta_lenta', titulo: `Primeira resposta demora ${tempo(med)} (metade das conversas da semana)`,
      texto: `${atrasos.length} conversas novas em 7 dias; ${lentos} esperaram mais de 1 hora. Quem chega do anúncio esfria rápido.`,
      acao: 'Ligar a resposta automática fora do horário ou a IA do plantão, e combinar quem responde nos horários de pico.', numeros: { mediana_min: med, conversas: atrasos.length, mais_de_1h: lentos } })
  }
  const lp: Record<string, any> = Object.fromEntries(c.leads.map(l => [l.id, l]))
  if (semResp.length) {
    av.push({ nivel: semResp.length >= 5 ? 'urgente' : 'atencao', tipo: 'sem_resposta', titulo: `${semResp.length} conversa(s) esperando resposta há mais de ${L.sem_resposta_horas} h`,
      texto: `A última mensagem é do cliente e ninguém respondeu (últimos 3 dias). A mais antiga espera há ${tempo(Math.max(...semResp.map(s => s.horas)) * 60)}.`,
      acao: 'Responder agora, começando pela mais antiga.', numeros: { total: semResp.length }, pessoas: nomes(semResp.map(s => lp[s.lead] || {})).slice(0, 10), lead_ids: ids(semResp.map(s => lp[s.lead])) })
  }
  if (promessas.length) {
    av.push({ nivel: 'urgente', tipo: 'promessa_sem_volta', titulo: `${promessas.length} conversa(s) em que alguém prometeu voltar e não voltou`,
      texto: 'Alguém da conversa disse "vou confirmar / deixa eu ver / já te retorno", a pessoa não comprou e a conversa parou. Quem pergunta e fica sem volta compra de outro.',
      acao: 'Voltar com a resposta prometida hoje (preço, prazo, desconto de quantidade).', numeros: { total: promessas.length }, pessoas: nomes(promessas.map(p => lp[p.lead] || {})).slice(0, 10), lead_ids: ids(promessas.map(p => lp[p.lead])) })
  }

  if (grandes.length) {
    const un = grandes.reduce((s, g) => s + g.qtd, 0), pu = cliente.preco_unidade_pedido_grande
    av.push({ nivel: 'urgente', tipo: 'pedido_grande_parado', titulo: `${grandes.length} pedido(s) grande(s) parado(s): ${un} unidades${pu ? ' (uns ' + R$(un * pu) + ')' : ''}`,
      texto: 'Gente pedindo em quantidade (empresa, time, evento) que não fechou, e a conversa parou. Pedido grande demora mais, mas não pode esfriar.',
      acao: 'Mandar hoje o preço por quantidade e o prazo, e perguntar a data do evento. Não pausar o anúncio que trouxe esse pedido.', numeros: { pedidos: grandes.length, unidades: un },
      pessoas: cliente.saude ? [] : grandes.map(g => primeiroNome(lp[g.lead]?.nome) + ' (' + g.qtd + ' un.)'), lead_ids: ids(grandes.map(g => lp[g.lead])) })
  }

  // 8. envio pra Meta falhando (API de Conversões)
  const logs = (d.webhook_logs || []).filter((w: any) => /^capi/i.test(w.origem || '') && agora - Date.parse(w.recebido_em) <= 7 * D)
  if (logs.length >= L.capi_erros_min) {
    const motivo = (w: any) => {
      const p = typeof w.payload === 'string' ? (() => { try { return JSON.parse(w.payload) } catch { return {} } })() : (w.payload || {})
      let e: any = w.erro || p.erro || p.error || p.message || '?'
      if (typeof e === 'string' && e.trim().startsWith('{')) { try { e = JSON.parse(e) } catch { e = ((e.match(/"error_user_title":"([^"]*)/) || e.match(/"message":"([^"]*)/) || [, e]) as any)[1].trim() + '…' } }
      if (typeof e === 'object') e = e.error_user_title || e.message || JSON.stringify(e)
      return String(e).replace(/\s+/g, ' ').slice(0, 160)
    }
    const grupos = logs.reduce((o: Record<string, number>, w: any) => (o[motivo(w)] = (o[motivo(w)] || 0) + 1, o), {})
    const top = Object.entries(grupos).sort((a: any, b: any) => b[1] - a[1])[0] as [string, number]
    const semWaba = /WhatsApp Business|WABA|whatsapp_business_account|conta do WhatsApp/i.test(top[0])
    av.push({ nivel: 'atencao', tipo: 'capi_falhando', titulo: `${logs.length} envios pra Meta falharam em 7 dias`,
      texto: `As vendas e conversas não estão voltando pra Meta, então ela não aprende quem compra. Erro mais comum (${top[1]}x): "${top[0]}".`,
      acao: semWaba ? 'No Gerenciador de Eventos, ligar a conta do WhatsApp Business ao conjunto de dados (é ligação na Meta, não código).' : 'Ver o erro com o Nando; o código pode estar certo e faltar uma ligação na Meta.', numeros: { erros: logs.length, por_erro: grupos } })
  }
  const falhaWa = (d.webhook_logs || []).filter((w: any) => w.origem === 'wa-falha' && agora - Date.parse(w.recebido_em) <= 7 * D).length
  if (falhaWa >= 10) av.push({ nivel: 'info', tipo: 'wa_falha', titulo: `${falhaWa} mensagens de WhatsApp não foram entregues em 7 dias`, texto: 'Normalmente é janela de 24 h fechada ou número inválido.', acao: 'Ver se são retomadas fora da janela (aí precisa de modelo aprovado).', numeros: { falhas: falhaWa } })

  // 9. venda feita fora do card do anúncio
  const porFone: Record<string, any[]> = {}; for (const l of c.leads) if (so8(l.whatsapp)) (porFone[so8(l.whatsapp)] ||= []).push(l)
  const fora: any[] = []
  for (const m of c.mats) {
    if (agora - Date.parse(m.data_compra || m.criado_em) > L.janela_funil_dias * D) continue
    const l = c.leads.find(x => x.id === m.lead_id); if (!l || l.anuncio_id || l.ctwa_clid) continue
    const irmao = (porFone[so8(l.whatsapp)] || []).find(x => x.id !== l.id && (x.anuncio_id || x.ctwa_clid))
    if (irmao) fora.push({ l, irmao, valor: +m.valor_pago || 0 })
  }
  if (fora.length) av.push({ nivel: 'atencao', tipo: 'venda_fora_do_card', titulo: `${fora.length} venda(s) lançada(s) num card novo, longe do anúncio que trouxe a pessoa`,
    texto: `${R$(fora.reduce((s, f) => s + f.valor, 0))} em vendas que o anúncio não leva o crédito, e a venda não volta pra Meta.`,
    acao: 'Vender sempre no card que já existe (o do anúncio). Pedir pro Nando juntar os cards pelo telefone.', numeros: { vendas: fora.length }, lead_ids: ids(fora.map(f => f.l)) })

  // 10. etapa paga sem venda lançada (Dani: avaliação de R$ 200)
  if (cliente.etapas_pagas?.length) {
    const passou = new Set<string>((d.lead_andamentos || []).filter((a: any) => cliente.etapas_pagas!.includes(a.etapa_nova)).map((a: any) => a.lead_id))
    for (const l of c.leads) if (cliente.etapas_pagas.includes(l.etapa)) passou.add(l.id)
    const sem = [...passou].filter(id => !c.venda[id])
    if (sem.length) av.push({ nivel: 'atencao', tipo: 'etapa_paga_sem_venda', titulo: `${sem.length} pessoa(s) com ${cliente.etapa_paga_nome || 'etapa paga'} e nenhuma venda lançada`,
      texto: `Cada uma é dinheiro que entrou (${R$(cliente.valor_etapa_paga || 0)}), mas o sistema não conta. O anúncio parece pior do que é.`,
      acao: 'Lançar a etapa paga como evento de compra (sem virar ganho, pra não sair do acompanhamento). Combinar com o Nando.', numeros: { total: sem.length }, lead_ids: sem.map(String) })
  }

  // 11. abriu a proposta e ninguém chamou (escola: orcamento_aberturas)
  const ab = d.orcamento_aberturas || []
  if (ab.length) {
    const orc: Record<string, any> = Object.fromEntries((d.orcamentos || []).map((o: any) => [o.id, o]))
    const recentes = new Set<string>()
    for (const a of ab) {
      const t = Date.parse(a.aberto_em || a.criado_em || a.em || 0); if (!t || agora - t > 3 * D) continue
      const lead = a.lead_id || orc[a.orcamento_id]?.lead_id; if (!lead || c.venda[lead]) continue
      const lpp = c.leads.find(l => l.id === lead); if (lpp && (lpp.etapa === 'ganho' || lpp.etapa === 'perda')) continue
      recentes.add(lead)
    }
    if (recentes.size) av.push({ nivel: 'atencao', tipo: 'proposta_aberta', titulo: `${recentes.size} pessoa(s) abriram a proposta nos últimos 3 dias e não compraram`,
      texto: 'Quem abre a proposta está pensando no assunto agora. É a hora de ligar.', acao: 'Ligar hoje pra quem abriu.', numeros: { total: recentes.size },
      pessoas: nomes([...recentes].map(id => c.leads.find(l => l.id === id) || {})), lead_ids: [...recentes].map(String) })
  }
  return { av, c }
}

// ═══════════════════════════ FUNIL POR ANÚNCIO e RESUMO
export type LinhaFunil = { ad_id: string; anuncio: string; whatsapp?: boolean; gasto: number; conversas_meta?: number | null; fichas: number; vendas: number; receita: number; quentes: number; custo_conversa?: number | null; custo_venda?: number | null; custo_venda_potencial?: number | null }
export type Funil = { desde: string; tabela: LinhaFunil[]; extra: LinhaFunil[]; av: Aviso[] }

export function funil(ctx: { meta: LinhaMeta[]; agora: number; L: Limites; cliente: ClienteGestora }, c: Contexto): Funil {
  const { meta, agora, L } = ctx
  const desde = diaBR(agora - L.janela_funil_dias * D)
  const ads: Record<string, any> = {}
  const campWa = campanhasWa(meta)
  for (const l of meta) if (l.data >= desde) { const a = ads[l.ad_id] ||= { nome: l.ad_name, conj: l.adset_name, gasto: 0, conversas: 0, wa: campWa.has(l.campaign_name || '') }; a.gasto += l.gasto; a.conversas += l.conversas; a.nome = l.ad_name || a.nome; a.conj = l.adset_name || a.conj }
  const nomes2: Record<string, number> = {}; for (const a of Object.values(ads)) nomes2[a.nome] = (nomes2[a.nome] || 0) + 1
  const vez: Record<string, number> = {}; for (const a of Object.values(ads).sort((x: any, y: any) => y.gasto - x.gasto)) if (nomes2[a.nome] > 1) { const n = a.nome; vez[n] = (vez[n] || 0) + 1; a.nome = n + ' (cópia ' + vez[n] + ')' }
  const linhas: Record<string, { fichas: number; vendas: number; receita: number; aguardando: number }> = {}
  const chave = (l: any) => l.anuncio_id && ads[l.anuncio_id] ? String(l.anuncio_id) : null
  for (const l of c.leads) {
    if (diaBR(Date.parse(l.criado_em)) < desde) continue
    const k = chave(l) || (l.anuncio_id ? 'anuncio_fora' : l.origem === 'anuncio' ? 'anuncio_sem_id' : 'outros')
    const x = linhas[k] ||= { fichas: 0, vendas: 0, receita: 0, aguardando: 0 }
    x.fichas++
    if (c.venda[l.id]) { x.vendas++; x.receita += c.venda[l.id].reduce((s, m) => s + (+m.valor_pago || 0), 0) }
    if (ctx.cliente.etapas_quentes?.[l.etapa]) x.aguardando++
  }
  const tabela: LinhaFunil[] = Object.entries(ads).filter(([, a]) => a.gasto >= 1).map(([id, a]) => {
    const x = linhas[id] || { fichas: 0, vendas: 0, receita: 0, aguardando: 0 }
    const pot = x.vendas + x.aguardando / 2
    return { ad_id: id, anuncio: a.nome, whatsapp: a.wa, gasto: a.gasto, conversas_meta: a.conversas, fichas: x.fichas, vendas: x.vendas, receita: x.receita, quentes: x.aguardando,
      custo_conversa: a.conversas ? a.gasto / a.conversas : null, custo_venda: x.vendas ? a.gasto / x.vendas : null, custo_venda_potencial: pot ? a.gasto / pot : null }
  }).sort((a, b) => b.receita - a.receita || b.gasto - a.gasto)
  const NOME_EXTRA: Record<string, string> = { anuncio_fora: '(anúncio de antes do período)', anuncio_sem_id: '(veio de anúncio, sem o código)', outros: '(sem anúncio: indicação, site, manual)' }
  const extra: LinhaFunil[] = ['anuncio_fora', 'anuncio_sem_id', 'outros'].filter(k => linhas[k]).map(k => ({ ad_id: k, anuncio: NOME_EXTRA[k], gasto: 0, fichas: linhas[k].fichas, vendas: linhas[k].vendas, receita: linhas[k].receita, quentes: linhas[k].aguardando }))
  // anúncio que conversa barato e não vende (Dani: Liberação Miofascial)
  const av: Aviso[] = []
  const vendem = tabela.filter(t => t.vendas > 0)
  for (const t of tabela) {
    if (t.fichas >= 25 && t.vendas === 0 && t.quentes === 0 && vendem.length && t.gasto >= 80) av.push({ nivel: 'atencao', tipo: 'conversa_que_nao_vende', titulo: `"${t.anuncio}" traz conversa mas não vende`,
      texto: `${t.fichas} contatos e 0 vendas em ${L.janela_funil_dias} dias, com ${R$(t.gasto)} gastos. Quem vende é "${vendem[0].anuncio}".`,
      acao: 'Antes de cortar, ler as conversas desse anúncio. Se o público for outro, passar verba pra quem vende (com o sim do dono).', numeros: { fichas: t.fichas, gasto: t.gasto, ad_id: t.ad_id } })
    else if (t.whatsapp && t.gasto >= 80 && t.conversas_meta === 0 && t.fichas === 0) av.push({ nivel: 'atencao', tipo: 'anuncio_queimando', titulo: `"${t.anuncio}" gastou ${R$(t.gasto)} sem trazer ninguém`,
      texto: `0 conversas e 0 contatos no CRM em ${L.janela_funil_dias} dias, numa campanha de WhatsApp.`, acao: 'Ver se o anúncio abre o WhatsApp certo; se não entrega conversa, pausar (com o sim do dono).', numeros: { gasto: t.gasto, ad_id: t.ad_id } })
  }
  return { desde, tabela, extra, av }
}

export function resumo(ctx: { meta: LinhaMeta[]; agora: number; hoje: string; resumo: Record<string, any> }, c: Contexto, f: Funil) {
  const { meta, agora, hoje } = ctx
  const ini = diaBR(agora - 7 * D), iniAnt = diaBR(agora - 14 * D)
  const m7 = meta.filter(l => l.data > ini && l.data <= hoje), mAnt = meta.filter(l => l.data > iniAnt && l.data <= ini)
  const s = (ls: LinhaMeta[], k: 'gasto' | 'conversas') => ls.reduce((a, l) => a + l[k], 0)
  const gasto = s(m7, 'gasto'), conversas = s(m7, 'conversas'), gastoAnt = s(mAnt, 'gasto'), convAnt = s(mAnt, 'conversas')
  const novos = c.leads.filter(l => agora - Date.parse(l.criado_em) <= 7 * D)
  const vendas = c.mats.filter(m => agora - Date.parse(m.data_compra || m.criado_em) <= 7 * D)
  const lp: Record<string, any> = Object.fromEntries(c.leads.map(l => [l.id, l]))
  const vendAnuncio = vendas.filter(m => lp[m.lead_id]?.anuncio_id || lp[m.lead_id]?.ctwa_clid)
  const receita = vendas.reduce((a, m) => a + (+m.valor_pago || 0), 0)
  const melhor = f.tabela.filter(t => t.vendas).sort((a, b) => (a.custo_venda || 1e9) - (b.custo_venda || 1e9))[0]
  const pior = f.tabela.filter(t => t.whatsapp && !t.vendas && !t.quentes).sort((a, b) => b.gasto - a.gasto)[0]
  return Object.assign(ctx.resumo, {
    semana: { de: diaBR(agora - 6 * D), ate: hoje }, gasto, conversas, custo_conversa: conversas ? gasto / conversas : null,
    custo_conversa_antes: convAnt ? gastoAnt / convAnt : null, gasto_antes: gastoAnt,
    fichas_novas: novos.length, fichas_de_anuncio: novos.filter(l => l.anuncio_id || l.origem === 'anuncio').length,
    vendas: vendas.length, vendas_de_anuncio: vendAnuncio.length, receita, custo_venda: vendas.length && gasto ? gasto / vendas.length : null,
    melhor_anuncio: melhor ? { nome: melhor.anuncio, vendas: melhor.vendas, custo_venda: melhor.custo_venda } : null,
    pior_anuncio: pior && pior.gasto >= 30 ? { nome: pior.anuncio, gasto: pior.gasto, fichas: pior.fichas } : null,
  })
}

// ═══════════════════════════ UM NEGÓCIO INTEIRO (o rodaCliente do vigia, sem ler nem gravar nada)
const ORDEM: Record<Nivel, number> = { urgente: 0, atencao: 1, info: 2 }
export type Analise = { dia: string; dia_crm: string; avisos: Aviso[]; notas: string[]; resumo: Record<string, any>; funil: Funil; tem_crm: boolean }

// crm: as tabelas lidas do CRM (ou null quando não deu pra ler). dataDosDados: quando o CRM é uma foto baixada num dia (a Wood hoje).
// modo 'urgentes': só as regras da Meta que custam dinheiro se demorar (as de 2 em 2 horas).
export function analisa(e: { cliente: ClienteGestora; crm: any | null; dataDosDados?: string | null; meta: LinhaMeta[]; rascunhos?: any[]; agora: number; modo?: 'urgentes' | 'tudo'; notas?: string[] }): Analise {
  const L = limitesDo(e.cliente)
  const agoraReal = e.agora
  // dados baixados num dia (Wood): o "agora" do CRM é a hora do download, senão tudo pareceria parado
  const agora = e.dataDosDados ? Math.min(agoraReal, Date.parse(e.dataDosDados)) : agoraReal
  const hoje = diaBR(agora), horaBR = horaBRde(agora)
  // a Meta é sempre de hoje de verdade (mesmo quando o CRM é velho)
  const hojeReal = diaBR(agoraReal), horaReal = horaBRde(agoraReal)
  const notas = [...(e.notas || [])]
  const metaAteCrm = e.meta.filter(l => l.data <= hoje)
  const res: Record<string, any> = { dia: hoje }
  const avisos: Aviso[] = regrasMeta({ meta: e.meta, hoje: hojeReal, horaBR: horaReal, L, rascunhos: e.rascunhos || [], cliente: e.cliente })
  if (e.modo === 'urgentes') {
    const so = avisos.filter(a => a.nivel === 'urgente' && TIPOS_URGENTES_META.includes(a.tipo))
    return { dia: hojeReal, dia_crm: hoje, avisos: so, notas, resumo: res, funil: { desde: hoje, tabela: [], extra: [], av: [] }, tem_crm: !!e.crm }
  }
  if (hoje !== hojeReal) notas.push(`CRM velho: os avisos do CRM e o resumo são de ${hoje.split('-').reverse().join('/')}; os da Meta são de hoje.`)
  const ctx = { cliente: e.cliente, d: e.crm || {}, meta: metaAteCrm, hoje, horaBR, agora, L, resumo: res }
  let c = contexto({})
  if (e.crm) { const r = regrasCRM(ctx); avisos.push(...r.av); c = r.c }
  // o funil e o resumo cruzam Meta com CRM; sem CRM, ficam só os números da Meta (e os avisos do funil não valem)
  const f = funil(ctx, c)
  if (e.crm) avisos.push(...f.av)
  resumo(ctx, c, f)
  avisos.sort((a, b) => ORDEM[a.nivel] - ORDEM[b.nivel])
  return { dia: hojeReal, dia_crm: hoje, avisos, notas, resumo: res, funil: f, tem_crm: !!e.crm }
}

// ═══════════════════════════ QUANDO RODA (horário de Brasília)
//   7h: tudo (segunda: tudo + resumo da semana) · 9h, 11h, 13h, 15h, 17h e 19h: só as urgentes da Meta · resto: nada
export type ModoGestora = 'urgentes' | 'dia' | 'semana'
export function qualModo(relogio: Date): ModoGestora | null {
  const ms = relogio.getTime(), h = horaBRde(ms)
  if (h === 7) return new Date(ms - 3 * H).getUTCDay() === 1 ? 'semana' : 'dia'
  if (h >= 9 && h <= 20 && (h - 9) % 2 === 0) return 'urgentes'
  return null
}

// ═══════════════════════════ AS MENSAGENS
const ROT: Record<Nivel, string> = { urgente: 'URGENTE', atencao: 'ATENÇÃO', info: 'PRA SABER' }
const dataBR = (dia: string) => dia.split('-').reverse().join('/')

// a mensagem do dono (só os avisos DELE; nunca cita outro cliente). Na área da saúde, sem nome nenhum.
export function textoDono(nome: string, a: Analise, opc: { saude?: boolean; comNomes?: boolean } = {}) {
  const t = [`*Maia — ${nome}* (${dataBR(a.dia)})`, '']
  if (a.dia_crm !== a.dia) t.push(`_(CRM de ${dataBR(a.dia_crm)}: os avisos de anúncio são de hoje, os de conversa e etapa são daquele dia.)_`, '')
  if (!a.avisos.length) t.push('Tudo certo hoje: anúncio entregando, ninguém esperando resposta, nenhum lead quente parado.')
  a.avisos.forEach((x, i) => {
    t.push(`*${i + 1}. ${ROT[x.nivel]}: ${x.titulo}*`)
    t.push(x.texto)
    if (opc.comNomes && !opc.saude && x.pessoas?.length) t.push('Quem: ' + x.pessoas.join('; ') + '.')
    t.push('→ ' + x.acao, '')
  })
  if (opc.saude) t.push('_(área da saúde: os nomes ficam só no CRM, a mensagem não leva nome nem tratamento.)_')
  t.push('_Nada foi mexido, só aviso. Quem decide é tu._')
  return t.join('\n').trim()
}

// o resumo da semana + o funil por anúncio (segunda, 7h)
export function textoResumo(nome: string, a: Analise) {
  const r = a.resumo, f = a.funil
  const n = (v: any) => v == null ? '-' : R$(v)
  if (!r.semana) return `${nome}: sem números da semana.`
  const t = [`*${nome}: resumo da semana* (${dataBR(r.semana.de)} a ${dataBR(r.semana.ate)})`, '']
  t.push(`- Investido: ${n(r.gasto)} (semana anterior: ${n(r.gasto_antes)})`)
  t.push(`- Conversas que a Meta contou: ${r.conversas} · custo por conversa ${n(r.custo_conversa)} (antes: ${n(r.custo_conversa_antes)})`)
  if (a.tem_crm) {
    t.push(`- Contatos novos no CRM: ${r.fichas_novas} (${r.fichas_de_anuncio} de anúncio)`)
    t.push(`- Vendas: ${r.vendas} (${r.vendas_de_anuncio} de anúncio) · ${n(r.receita)} · custo por venda ${n(r.custo_venda)}`)
    if (r.primeira_resposta_min != null) t.push(`- Primeira resposta (metade das conversas): ${tempo(r.primeira_resposta_min)} (${r.primeira_resposta_n} conversas)`)
    if (r.melhor_anuncio) t.push(`- Anúncio que mais vende barato: ${r.melhor_anuncio.nome} (${r.melhor_anuncio.vendas} venda(s), ${n(r.melhor_anuncio.custo_venda)} cada)`)
    if (r.pior_anuncio) t.push(`- Anúncio que mais gastou sem venda: ${r.pior_anuncio.nome} (${n(r.pior_anuncio.gasto)}, ${r.pior_anuncio.fichas} contatos)`)
  } else t.push('- (sem o CRM: contatos e vendas não entram)')
  const top = [...f.tabela].slice(0, 6)
  if (top.length) {
    t.push('', `Funil por anúncio (desde ${dataBR(f.desde)}):`)
    for (const x of top) t.push(`· ${x.anuncio}: ${R$(x.gasto)}, ${x.conversas_meta ?? 0} conversas${a.tem_crm ? `, ${x.fichas} contatos, ${x.vendas} venda(s)${x.custo_venda ? ' (' + R$(x.custo_venda) + ' cada)' : ''}` : ''}`)
  }
  return t.join('\n')
}

// ═══════════════════════════ O MODELO maia_aviso (fora da janela de 24 h do dono)
// NÃO é pedido sozinho: a aprovação sai só quando alguém chamar pedeModeloAviso() (lib/maia/gestora-rotina.ts), com o sim do Guto.
// Depois de aprovado na WABA do Oito, MAIA_GESTORA_MODELO_AVISO=1 faz a rotina usar ele pra chamar o dono fora da janela.
export const MODELO_AVISO = {
  name: 'maia_aviso', category: 'UTILITY' as const, language: 'pt_BR',
  components: [
    { type: 'BODY', text: '{{1}}, tenho {{2}} avisos de hoje sobre {{3}}. Quer ver?', example: { body_text: [['Ana', '3', 'os anúncios e os contatos da Ótica Tempo de Visão']] } },
    { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Quero ver' }] },
  ],
}
export const paramsModeloAviso = (donoNome: string, n: number, negocio: string) => [String(donoNome || '').split(' ')[0] || 'tudo bem', String(n), `os anúncios e os contatos do ${negocio}`.slice(0, 120)]
