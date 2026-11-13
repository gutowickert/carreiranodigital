// Maia: a ANÁLISE DE 2 EM 2 DIAS e o RELATÓRIO DO MÊS pro dono (13/11). As contas e os textos estão em relatorios-conta.ts
// (puro, testado direto no node); aqui é a parte que lê o banco, grava e agenda.
//
// 1) Análise (curta, SEM IA): o que aconteceu com anúncios e vendas desde a última. Custo por conversa, quantos chegaram na
//    métrica secundária (contexto.trafego.metricas_secundarias), vendas, e UMA conclusão: segue / segura mais uns dias de teste /
//    sugiro mudar (com a pergunta se o dono topa). Vira peça 'relatorio' ("Análise ...") que a EQUIPE aprova (aprovacao.ts) e vai
//    pro WhatsApp do dono, igual ao resumo da semana (fora da janela de 24 h: fila + modelo maia_novidades, canal.ts). Sugestão de
//    mudar passa SEMPRE pela equipe, mesmo no negócio com "equipe aprova tudo" desligado.
// 2) Relatório do mês: no dia 1 o aviso ("amanhã separa uma horinha...", com o tom do mês) e no dia 2 o relatório: uma página
//    com cards (aberta pelo link do painel do dono: /maia/relatorio) e um resumo curto no WhatsApp com o link. Os números saem
//    do código; a IA (modelo forte, MAIA_MODELO_RELATORIO) só escreve as conclusões e passa pela trava: número que ela escrever e
//    não estiver nos dados derruba o texto dela e vale o texto sem IA. Custo anotado como uso_ia tipo 'relatorio_mes' (custo.ts).
// 3) Agenda (rotina.ts, de hora em hora): às 8h no fuso do negócio. Análise a cada 2 dias por negócio com anúncio (pula a
//    segunda, que já tem o resumo da semana, e os dias do aviso e do relatório); aviso e relatório no 1º dia que o negócio abre a
//    partir do dia 2 (o aviso no dia antes). Dias que abre: horario.ts (meta.atendimento.dias ou o horário escrito).
// 4) O dono pede pelo WhatsApp ("me manda a análise", "o relatório do mês"): ferramenta em dono.ts → pedidoDoDono. E vê no painel.
// Gravação sem mudar o banco: peças (maia_pecas) + eventos 'analise_2dias', 'relatorio_mes_aviso' e 'relatorio_mes' (os números
// do mês e as conclusões ficam no detalhe do evento: a página é montada na hora a partir dele).
import { maiaDb as db, maiaLocal } from './db'
import { numeros } from './funil'
import { tetoVerba } from './limites'
import { horaLocal, fusoDo, diasQueAbre } from './horario'
import { tokenPainel, basePublica } from './painel-dono'
import * as C from './relatorios-conta'

const DIA = 86400e3
const ABERTAS = ['novo', 'conversando', 'interessado', 'proposta']
const r2 = (n: number) => Math.round(n * 100) / 100
const deAnuncio = (l: any) => !!l.anuncio_ref || l.origem === 'anuncio'
const primeiro = (s: any) => String(s || '').split(' ')[0] || null
const dentro = (iso: any, de: string, ate: string) => !!iso && iso >= de && iso <= ate

// ─────────────────────────── leitura comum
type AdInfo = { nome: string; campanha_id: string | null; campanha: string | null; verba_dia: number | null; ativa: boolean; inicio: string | null }
async function infoDosAnuncios(neg: any): Promise<Map<string, AdInfo>> {
  const m = new Map<string, AdInfo>()
  for (const c of await db.lista('campanhas', { negocio_id: neg.id })) {
    const ids = (c.meta_ad_ids || []).map(String)
    for (let i = 0; i < ids.length; i++) {
      const p = c.peca_ids?.[i] ? await db.um('pecas', { id: c.peca_ids[i] }) : null
      m.set(ids[i], { nome: String(p?.gancho || p?.titulo || `anúncio ${ids[i]}`), campanha_id: c.id, campanha: c.nome || null, verba_dia: c.verba_dia != null ? Number(c.verba_dia) : null, ativa: c.status === 'ativa', inicio: c.ativada_em || c.criado_em || null })
    }
  }
  return m
}

// gasto e conversas POR ANÚNCIO (a mesma leitura só-GET da Gestora: banco do tráfego, arquivo no modo local, Graph API).
// Sem conta de anúncio ou sem leitura: lista vazia (o total do negócio continua vindo de maia_metricas_dia)
async function linhasPorAnuncio(neg: any) {
  if (!neg?.meta?.ad_account_id) return []
  try { const { lerMeta } = await import('./gestora-crm'); return (await lerMeta(neg)).linhas } catch { return [] }
}

async function leadsComEventos(neg: any) {
  const leads = await db.lista('leads', { negocio_id: neg.id })
  const evs = await db.lista('lead_eventos', { negocio_id: neg.id })
  const porLead = new Map<string, any[]>()
  for (const e of evs) (porLead.get(e.lead_id) || porLead.set(e.lead_id, []).get(e.lead_id)!).push(e)
  return { leads, evs, porLead }
}

// os anúncios num período: contatos, secundária, vendas (do funil) e gasto/conversas (da Meta, quando vem por anúncio)
function anunciosDoPeriodo(o: { leads: any[]; porLead: Map<string, any[]>; info: Map<string, AdInfo>; linhas: any[]; sec: C.Secundaria; de: string; ate: string }): C.AnuncioNum[] {
  const { leads, porLead, info, linhas, sec, de, ate } = o
  const diaDe = de.slice(0, 10), diaAte = ate.slice(0, 10)
  const ids = new Set<string>([...leads.filter(l => l.anuncio_ref).map(l => String(l.anuncio_ref))])
  for (const l of linhas) if (l.data >= diaDe && l.data <= diaAte && (l.gasto > 0 || l.conversas > 0)) ids.add(String(l.ad_id))
  for (const [id, x] of info) if (x.ativa) ids.add(id)
  const temMeta = linhas.length > 0
  const out: C.AnuncioNum[] = []
  for (const id of ids) {
    const ls = leads.filter(l => String(l.anuncio_ref || '') === id)
    const lm = linhas.filter(l => String(l.ad_id) === id && l.data >= diaDe && l.data <= diaAte)
    const x = info.get(id)
    const primeiroDia = [...linhas.filter(l => String(l.ad_id) === id && l.gasto > 0).map(l => l.data + 'T12:00:00.000Z'), ...ls.map(l => l.criado_em)].sort()[0] || null
    const contatos = ls.filter(l => dentro(l.criado_em, de, ate)).length
    const secundaria = sec.etapa ? ls.filter(l => dentro(C.chegouEm(l, porLead.get(l.id) || [], sec.etapa), de, ate)).length : null
    const ganhos = ls.filter(l => dentro(l.ganho_em, de, ate))
    const nomeMeta = lm.find(l => l.ad_name)?.ad_name
    out.push({ id, nome: x?.nome || nomeMeta || (id === 'simulado' ? 'anúncio de teste' : `anúncio ${id}`), campanha_id: x?.campanha_id || null, campanha: x?.campanha || lm[0]?.campaign_name || null,
      verba_dia: x?.verba_dia ?? null, campanha_ativa: x ? x.ativa : true, inicio: x?.inicio || primeiroDia,
      gasto: temMeta ? r2(lm.reduce((s, l) => s + (+l.gasto || 0), 0)) : null, conversas: temMeta ? lm.reduce((s, l) => s + (+l.conversas || 0), 0) : null,
      contatos, secundaria, vendas: ganhos.length, receita: r2(ganhos.reduce((s, l) => s + (Number(l.valor) || 0), 0)) })
  }
  // só o que teve movimento no período (ou está no ar)
  return out.filter(a => a.contatos || a.vendas || (a.gasto || 0) > 0 || (a.secundaria || 0) > 0 || info.get(a.id)?.ativa)
    .sort((a, b) => (b.vendas - a.vendas) || ((b.secundaria || 0) - (a.secundaria || 0)) || (b.contatos - a.contatos))
}

// ═══════════════════════════ 1) A ANÁLISE DE 2 EM 2 DIAS
export async function ultimaAnalise(negocio_id: string) {
  return (await db.lista('eventos', { negocio_id, tipo: 'analise_2dias' }, { ordem: 'criado_em', desc: true, limite: 1 }))[0] || null
}

// o período: desde o fim da última análise (no mínimo 2 dias, no máximo 7)
export async function periodoDaAnalise(neg: any, agora = new Date()) {
  const ult = await ultimaAnalise(neg.id)
  const fim = agora.getTime()
  let ini = ult?.detalhe?.ate ? Date.parse(ult.detalhe.ate) : fim - 2 * DIA
  ini = Math.max(Math.min(ini, fim - 2 * DIA), fim - 7 * DIA)
  return { de: new Date(ini).toISOString(), ate: new Date(fim).toISOString() }
}

export async function dadosDaAnalise(neg: any, de: string, ate: string, agora = new Date()) {
  const sec = C.secundariaDo(neg), ciclo = C.cicloDo(neg)
  const n = await numeros(neg.id, de, ate)
  const { leads, porLead } = await leadsComEventos(neg)
  const info = await infoDosAnuncios(neg), linhas = await linhasPorAnuncio(neg)
  const contatos = leads.filter(l => deAnuncio(l) && dentro(l.criado_em, de, ate)).length
  const secundaria = sec.etapa ? leads.filter(l => deAnuncio(l) && dentro(C.chegouEm(l, porLead.get(l.id) || [], sec.etapa), de, ate)).length : null
  // a decisão olha os últimos 30 dias de cada anúncio (2 dias é pouco pra julgar), e o histórico de vendas de anúncio
  const de30 = new Date(agora.getTime() - 30 * DIA).toISOString()
  const anuncios = anunciosDoPeriodo({ leads, porLead, info, linhas, sec, de: de30, ate })
  const vendas_historico = leads.filter(l => l.etapa === 'ganho' && deAnuncio(l)).length
  const decisao = C.decide({ anuncios, vendas_historico, ciclo: ciclo.dias, teto: tetoVerba(neg), agora: agora.getTime(), secundaria: sec })
  const d: C.DadosAnalise = { negocio: neg.nome, dono: primeiro(neg.dono_nome), de, ate, gasto: n.gasto, conversas: n.conversas_meta || contatos, contatos, secundaria, sec, vendas: n.ganhos, receita: n.receita, decisao, ciclo }
  return { ...d, anuncios, vendas_historico }
}

export async function geraAnalise(neg: any, op: { agora?: Date; de?: string; ate?: string } = {}) {
  const agora = op.agora || new Date()
  const p = op.de && op.ate ? { de: op.de, ate: op.ate } : await periodoDaAnalise(neg, agora)
  const d = await dadosDaAnalise(neg, p.de, p.ate, agora)
  const texto = C.textoAnalise(d)
  const peca = await db.insere('pecas', { negocio_id: neg.id, tipo: 'relatorio', status: 'revisao_equipe', titulo: `${C.TITULO_ANALISE} ${p.de.slice(0, 10)} a ${p.ate.slice(0, 10)}`, texto })
  await db.evento('analise_2dias', neg.id, { peca_id: peca.id, de: p.de, ate: p.ate, conclusao: d.decisao.conclusao, julga_por: d.decisao.julga_por, sugestoes: d.decisao.sugestoes, em_teste: d.decisao.em_teste,
    numeros: { gasto: d.gasto, conversas: d.conversas, contatos: d.contatos, secundaria: d.secundaria, vendas: d.vendas, receita: d.receita }, secundaria_nome: d.sec.nome, secundaria_padrao: d.sec.padrao })
  // "sugiro mudar" passa SEMPRE pela equipe (é verba e anúncio); o resto segue a regra do negócio
  if (neg.aprovacao_equipe === false && d.decisao.conclusao !== 'mudar') { const { equipeAprova } = await import('./aprovacao'); await equipeAprova(peca.id, 'automatico') }
  else { const { avisaEquipe } = await import('./canal'); await avisaEquipe('análise dos anúncios pra aprovar', `${neg.nome}: ${d.decisao.conclusao === 'mudar' ? 'SUGESTÃO DE MUDANÇA: ' + d.decisao.sugestoes.map(s => s.texto).join('; ') : d.decisao.conclusao === 'segura' ? 'segura mais uns dias' : 'segue como está'}`.slice(0, 400), neg.id) }
  return { peca, dados: d }
}

// ═══════════════════════════ 2) O RELATÓRIO DO MÊS
// o mês no Brasil: do dia 1 às 00h até o último dia às 23h59 (o servidor é UTC: +3 h)
export function limitesDoMes(mes: string) {
  const [a, m] = mes.split('-').map(Number)
  const ini = Date.UTC(a, m - 1, 1, 3), fim = Date.UTC(m === 12 ? a + 1 : a, m === 12 ? 0 : m, 1, 3) - 1
  return { de: new Date(ini).toISOString(), ate: new Date(fim).toISOString() }
}
export const mesAnteriorDe = (agora: Date, fuso = 'America/Sao_Paulo') => { const h = horaLocal(agora, fuso).data; const [a, m] = h.split('-').map(Number); return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}` }

export async function dadosDoMes(neg: any, mes: string): Promise<C.DadosMes> {
  const { de, ate } = limitesDoMes(mes)
  const sec = C.secundariaDo(neg), ciclo = C.cicloDo(neg)
  // o gasto e as conversas da Meta pelo DIA do mês (numeros() pega o dia inteiro das pontas: o dia 1 do mês seguinte entraria)
  const todasMet = await db.lista('metricas_dia', { negocio_id: neg.id })
  const doMes = (mm: string) => { const ms = todasMet.filter(x => String(x.dia).slice(0, 7) === mm); return { ms, gasto: r2(ms.reduce((s, x) => s + (Number(x.gasto) || 0), 0)), conversas: ms.reduce((s, x) => s + (Number(x.conversas_iniciadas) || 0), 0) } }
  const metM = doMes(mes)
  const n = { ...(await numeros(neg.id, de, ate)), gasto: metM.gasto, conversas_meta: metM.conversas }
  const { leads, porLead } = await leadsComEventos(neg)
  const info = await infoDosAnuncios(neg), linhas = await linhasPorAnuncio(neg)

  // WhatsApp: conversas com mensagem do cliente no mês, a Maia atendendo, a 1ª resposta
  const convs = (await db.lista('conversas', { negocio_id: neg.id })).filter(c => c.canal === 'cliente')
  const doCliente = new Set(convs.map(c => c.id))
  const msgs = (await db.lista('msgs', { negocio_id: neg.id }, { ordem: 'criado_em' })).filter(m => doCliente.has(m.conversa_id))
  const noMes = msgs.filter(m => dentro(m.criado_em, de, ate))
  const conversas = new Set(noMes.filter(m => m.autor === 'cliente').map(m => m.conversa_id)).size
  const conversas_atendidas = new Set(noMes.filter(m => m.autor === 'maia').map(m => m.conversa_id)).size
  const porCv = new Map<string, any[]>()
  for (const m of msgs) (porCv.get(m.conversa_id) || porCv.set(m.conversa_id, []).get(m.conversa_id)!).push(m)
  const tempos: number[] = []
  for (const [, ms] of porCv) {
    const pri = ms.find(m => m.autor === 'cliente')
    if (!pri || !dentro(pri.criado_em, de, ate)) continue
    const resp = ms.find(m => m.criado_em >= pri.criado_em && m.autor !== 'cliente')
    if (resp) tempos.push((Date.parse(resp.criado_em) - Date.parse(pri.criado_em)) / 60e3)
  }
  // a IA passou pro time (modo humano pela Maia ou pelo sistema) e o que o time fez depois
  const passagens = (await db.lista('eventos', { negocio_id: neg.id, tipo: 'modo_humano' })).filter(e => dentro(e.criado_em, de, ate) && ['maia', 'sistema'].includes(String(e.detalhe?.por || 'maia')))
  const motivos: Record<string, number> = {}
  let reclamacoes = 0, respondidas = 0, paradas = 0, vendasDepois = 0
  const tResp: number[] = []
  const agoraMs = Date.now()
  for (const e of passagens) {
    const mot = String(e.detalhe?.motivo || 'sem motivo').trim().replace(/[.!\s]+$/, '').slice(0, 80) || 'sem motivo'
    motivos[mot] = (motivos[mot] || 0) + 1
    if (/reclama/i.test(mot)) reclamacoes++
    const ms = porCv.get(e.detalhe?.conversa_id) || []
    const resp = ms.find(m => m.criado_em > e.criado_em && m.autor !== 'cliente')
    if (resp) { respondidas++; tResp.push((Date.parse(resp.criado_em) - Date.parse(e.criado_em)) / 60e3) }
    const ult = ms[ms.length - 1]
    // parou com o time: ninguém respondeu, ou a última mensagem é do cliente e ficou mais de 24 h sem resposta
    if (!resp || (ult?.autor === 'cliente' && agoraMs - Date.parse(ult.criado_em) > DIA && ult.criado_em > e.criado_em)) paradas++
    const cv = convs.find(c => c.id === e.detalhe?.conversa_id)
    const l = cv?.lead_id ? leads.find(x => x.id === cv.lead_id) : null
    if (l?.ganho_em && l.ganho_em > e.criado_em) vendasDepois++
  }
  const ordena = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]) as [string, number][]

  // tráfego: o total da conta (maia_metricas_dia) + por anúncio
  const anuncios = anunciosDoPeriodo({ leads, porLead, info, linhas, sec, de, ate }).map(a => ({ ...a, qualificado: a.vendas > 0 || (a.secundaria || 0) > 0, custo_conversa: a.gasto != null && a.conversas ? r2(a.gasto / a.conversas) : null }))
  const diasGasto = metM.ms.filter(m => Number(m.gasto) > 0).length
  const contatosAnuncio = leads.filter(l => deAnuncio(l) && dentro(l.criado_em, de, ate))
  const vendasAnuncio = leads.filter(l => deAnuncio(l) && dentro(l.ganho_em, de, ate))
  const conversasMes = n.conversas_meta || contatosAnuncio.length
  const mexidas: { dia: string; texto: string }[] = []
  for (const e of await db.lista('eventos', { negocio_id: neg.id, tipo: 'campanha_pausada' })) if (dentro(e.criado_em, de, ate)) { const c = await db.um('campanhas', { id: e.detalhe?.campanha }); mexidas.push({ dia: e.criado_em, texto: `pausada a campanha "${c?.nome || 'sem nome'}"` }) }
  for (const c of await db.lista('campanhas', { negocio_id: neg.id })) if (dentro(c.ativada_em, de, ate)) mexidas.push({ dia: c.ativada_em, texto: `ligada a campanha "${c.nome || 'sem nome'}" (${C.R$(Number(c.verba_dia) || 0)} por dia)` })
  for (const e of await db.lista('eventos', { negocio_id: neg.id, tipo: 'analise_2dias' })) if (dentro(e.criado_em, de, ate)) for (const s of e.detalhe?.sugestoes || []) mexidas.push({ dia: e.criado_em, texto: `a Maia sugeriu ${s.texto}` })
  mexidas.sort((a, b) => (a.dia < b.dia ? -1 : 1))

  // orgânico: os posts publicados no mês, com o último retrato dos resultados (social.ts)
  const posts = (await db.lista('eventos', { negocio_id: neg.id, tipo: 'social_post' })).filter(p => p.detalhe?.status === 'publicado' && dentro(p.detalhe?.publicado_em, de, ate))
  const pecas = await db.lista('pecas', { negocio_id: neg.id })
  const listaPosts = posts.map(p => {
    const ig = p.detalhe.resultado?.ig || {}, fb = p.detalhe.resultado?.fb || {}
    const pc = pecas.find(x => x.id === p.detalhe.peca_id)
    return { dia: p.detalhe.publicado_em, tipo: String(p.detalhe.tipo || 'post'), tema: p.detalhe.tema || null, legenda: String(pc?.texto || pc?.gancho || ''),
      alcance: (ig.reach || 0) + (fb.post_total_media_view_unique || 0), interacoes: (ig.total_interactions || 0) + (fb.reacoes || fb.post_reactions_by_type_total || 0) + (fb.comentarios || 0) + (fb.compartilhamentos || 0),
      views: (ig.views || 0) + (fb.post_media_view || 0), salvos: ig.saved || 0 }
  }).sort((a, b) => (a.dia < b.dia ? -1 : 1))
  const alcanceTot = listaPosts.reduce((s, p) => s + p.alcance, 0)
  // o que estimular / tirar: por tema (ou tipo), com 2+ posts no grupo; o melhor e o pior pelo alcance médio
  const grupos: Record<string, { n: number; alc: number }> = {}
  for (const p of listaPosts) { const k = p.tema ? `posts sobre ${p.tema}` : `${p.tipo}`; const g = grupos[k] ||= { n: 0, alc: 0 }; g.n++; g.alc += p.alcance }
  const gs = Object.entries(grupos).filter(([, g]) => g.n >= 2).map(([k, g]) => ({ k, media: g.alc / g.n })).sort((a, b) => b.media - a.media)
  const mediaGeral = listaPosts.length ? alcanceTot / listaPosts.length : 0
  const estimular = gs[0] && gs[0].media >= mediaGeral ? `${gs[0].k} (${Math.round(gs[0].media)} de alcance médio)` : (listaPosts.length ? (() => { const b = [...listaPosts].sort((x, y) => y.alcance - x.alcance)[0]; return b.tema ? `posts sobre ${b.tema}` : `${b.tipo}` })() : null)
  const pior = gs.length > 1 ? gs[gs.length - 1] : null
  const tirar = pior && pior.media < mediaGeral * 0.6 ? `${pior.k} (${Math.round(pior.media)} de alcance médio, abaixo da média de ${Math.round(mediaGeral)})` : null
  const { socialLigado } = await import('./social').catch(() => ({ socialLigado: () => false }))

  // criação: as peças do mês (anúncios e posts; relatório não conta)
  const criadas = pecas.filter(p => dentro(p.criado_em, de, ate) && !['relatorio', 'texto'].includes(p.tipo))
  const porTipo: Record<string, number> = {}
  for (const p of criadas) porTipo[p.tipo] = (porTipo[p.tipo] || 0) + 1

  // o mês anterior (pra comparar e dar o tom)
  const [a, m] = mes.split('-').map(Number), mesAnt = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`
  const la = limitesDoMes(mesAnt), metA = doMes(mesAnt), nAnt = { ...(await numeros(neg.id, la.de, la.ate)), gasto: metA.gasto, conversas_meta: metA.conversas }
  const anterior = nAnt.ganhos || nAnt.gasto || nAnt.leads_novos ? { vendas: nAnt.ganhos, receita: nAnt.receita, gasto: nAnt.gasto, conversas: nAnt.conversas_meta } : null

  return {
    negocio: neg.nome, dono: primeiro(neg.dono_nome), mes, de, ate, teto: tetoVerba(neg), sec, ciclo,
    whatsapp: { conversas, contatos_novos: n.leads_novos, ganhos: n.ganhos, receita: n.receita, perdas: n.perdidos, motivos: ordena(n.motivos_perda || {}),
      passadas: passagens.length, passadas_motivos: ordena(motivos), reclamacoes,
      time: { passadas: passagens.length, respondidas, tempo_medio_min: tResp.length ? Math.round(tResp.reduce((s, x) => s + x, 0) / tResp.length) : null, sem_resposta: passagens.length - respondidas, paradas, vendas_depois: vendasDepois },
      primeira_resposta_min: tempos.length ? Math.round(tempos.reduce((s, x) => s + x, 0) / tempos.length * 10) / 10 : null, conversas_atendidas },
    trafego: { gasto: n.gasto, conversas: conversasMes, custo_conversa: C.custoPorConversa(n.gasto, conversasMes), contatos_anuncio: contatosAnuncio.length,
      secundaria: sec.etapa ? contatosAnuncio.concat(leads.filter(l => deAnuncio(l) && !dentro(l.criado_em, de, ate))).filter(l => dentro(C.chegouEm(l, porLead.get(l.id) || [], sec.etapa), de, ate)).length : null,
      vendas: vendasAnuncio.length, receita: r2(vendasAnuncio.reduce((s, l) => s + (Number(l.valor) || 0), 0)),
      dias_com_gasto: diasGasto, verba_media_dia: diasGasto ? r2(n.gasto / diasGasto) : null, retorno: n.gasto ? r2(n.receita / n.gasto) : null, anuncios, mexidas },
    organico: { posts: listaPosts, estimular, tirar, total: listaPosts.length, alcance: alcanceTot, social_ligado: socialLigado(),
      contatos: leads.filter(l => ['instagram', 'facebook', 'organico'].includes(l.origem) && dentro(l.criado_em, de, ate)).length },
    criacao: { criadas: criadas.length, aprovadas: criadas.filter(p => p.aprovado_dono_em).length, no_ar: criadas.filter(p => p.status === 'no_ar').length, por_tipo: porTipo },
    anterior,
  }
}

// as conclusões: com IA (modelo forte) quando dá, senão as montadas; a trava dos números vale campo a campo
const usaIA = () => !!process.env.ANTHROPIC_API_KEY && process.env.MAIA_RELATORIO_IA !== '0' && (!maiaLocal() || process.env.MAIA_RELATORIO_IA === '1')
export async function conclusoesDoMes(neg: any, d: C.DadosMes, ia = usaIA()): Promise<C.Conclusoes> {
  const base = C.conclusoesSemIA(d)
  if (!ia) return base
  try {
    const { emJson, JEITO } = await import('./ia')
    const proj = C.projecao(d)
    const r = await emJson<any>(`${JEITO}\nAgora tu és a analista de resultados do negócio e escreve as conclusões do relatório do mês pro dono ler numa página. Frases curtas e diretas, no "tu". USA SÓ OS NÚMEROS QUE VIERAM (copiados igual); não calcula número novo, não promete venda. Sem emoji.`,
      `NEGÓCIO: ${neg.nome} (${neg.nicho || ''}, ${neg.cidade || ''})
NÚMEROS DO MÊS (calculados pelo sistema): ${JSON.stringify({ ...d, organico: { ...d.organico, posts: d.organico.posts.slice(0, 20) } }).slice(0, 14000)}
PROJEÇÃO (calculada): ${JSON.stringify(proj)}
RASCUNHO SEM IA (melhora o jeito de dizer, sem mudar os números): ${JSON.stringify(base)}
Devolve {"resumo":"2 a 3 frases: o mês e o que mais importa","atendimento":"onde a IA precisou de ajuda","time":"onde o time pode melhorar","trafego":"o que funcionou e o que não nos anúncios","organico":"o que estimular e o que tirar","proximo_mes":["até 4 ações concretas"]}`,
      [], { modelo: process.env.MAIA_MODELO_RELATORIO || 'claude-opus-5-5', uso: { tipo: 'relatorio_mes', negocio_id: neg.id } })
    const dadosTodos = { d, proj, base }
    const ok = (k: keyof C.Conclusoes) => typeof r?.[k] === 'string' && r[k].trim() && C.iaSoComNumerosDados(r[k], dadosTodos)
    const out: C.Conclusoes = { ...base, por_ia: true }
    let trocou = 0
    for (const k of ['resumo', 'atendimento', 'time', 'trafego', 'organico'] as const) if (ok(k)) { (out as any)[k] = String(r[k]).trim(); trocou++ }
    if (Array.isArray(r?.proximo_mes)) { const p = r.proximo_mes.map(String).filter((x: string) => x.trim() && C.iaSoComNumerosDados(x, dadosTodos)).slice(0, 4); if (p.length) { out.proximo_mes = p; trocou++ } }
    out.por_ia = trocou > 0
    return out
  } catch (e: any) {
    const { avisaEquipe } = await import('./canal')
    await avisaEquipe('relatório do mês sem IA', `${neg.nome}: a IA não respondeu (${String(e?.message || e).slice(0, 120)}); foi com as conclusões montadas`, neg.id)
    return base
  }
}

export async function geraAvisoMes(neg: any, mes: string) {
  const ja = (await db.lista('eventos', { negocio_id: neg.id, tipo: 'relatorio_mes_aviso' })).find(e => e.detalhe?.mes === mes)
  if (ja) return { pulou: 'aviso já feito', peca_id: ja.detalhe.peca_id }
  const d = await dadosDoMes(neg, mes)
  const tom = C.tomDoMes(d)
  const texto = C.textoAviso(d, tom)
  const peca = await db.insere('pecas', { negocio_id: neg.id, tipo: 'texto', status: 'revisao_equipe', titulo: `Aviso do relatório ${mes}`, texto })
  await db.evento('relatorio_mes_aviso', neg.id, { mes, peca_id: peca.id, tom })
  if (neg.aprovacao_equipe === false) { const { equipeAprova } = await import('./aprovacao'); await equipeAprova(peca.id, 'automatico') }
  else { const { avisaEquipe } = await import('./canal'); await avisaEquipe('aviso do relatório do mês pra aprovar', `${neg.nome}: ${tom === 'boas' ? 'boas notícias' : 'precisamos olhar juntos'}`, neg.id) }
  return { peca, tom, texto }
}

export async function geraRelatorioMes(neg: any, mes: string, op: { forcar?: boolean; ia?: boolean } = {}) {
  const ja = (await db.lista('eventos', { negocio_id: neg.id, tipo: 'relatorio_mes' })).find(e => e.detalhe?.mes === mes)
  if (ja && !op.forcar) return { pulou: 'relatório já feito', peca_id: ja.detalhe.peca_id }
  const d = await dadosDoMes(neg, mes)
  const c = await conclusoesDoMes(neg, d, op.ia)
  const texto = C.textoRelatorioWhats(d, c)
  const peca = await db.insere('pecas', { negocio_id: neg.id, tipo: 'relatorio', status: 'revisao_equipe', titulo: `${C.TITULO_MES} ${mes}`, texto })
  await db.evento('relatorio_mes', neg.id, { mes, peca_id: peca.id, dados: d, conclusoes: c, tom: C.tomDoMes(d) })
  // o relatório do mês passa sempre pela equipe quando tem texto da IA; sem IA, segue a regra do negócio
  if (neg.aprovacao_equipe === false && !c.por_ia) { const { equipeAprova } = await import('./aprovacao'); await equipeAprova(peca.id, 'automatico') }
  else { const { avisaEquipe } = await import('./canal'); await avisaEquipe('relatório do mês pra aprovar', `${neg.nome}: ${C.nomeDoMes(mes)}, ${d.whatsapp.ganhos} venda(s), ${C.R$(d.whatsapp.receita)}`, neg.id) }
  return { peca, dados: d, conclusoes: c, html: C.htmlRelatorio(d, c, { gerado_em: new Date().toISOString() }) }
}

// o link da página do relatório (o mesmo token do painel do dono: abre o painel e o relatório)
export function linkRelatorio(neg: any, peca_id: string) {
  return `${basePublica()}/maia/relatorio?t=${tokenPainel(neg)}&id=${encodeURIComponent(peca_id)}`
}
export const ehRelatorioMes = (p: any) => p?.tipo === 'relatorio' && String(p.titulo || '').startsWith(C.TITULO_MES)
export const ehAnalise = (p: any) => p?.tipo === 'relatorio' && String(p.titulo || '').startsWith(C.TITULO_ANALISE)

// a página do relatório pro painel do dono: só do negócio do token e só o que já foi pro dono (a equipe aprovou)
export async function paginaDoRelatorio(neg: any, peca_id: string, op: { painel?: string | null } = {}) {
  const p = await db.um('pecas', { id: peca_id, negocio_id: neg.id })
  if (!p || !ehRelatorioMes(p) || p.status !== 'aprovada') return null
  const ev = (await db.lista('eventos', { negocio_id: neg.id, tipo: 'relatorio_mes' }, { ordem: 'criado_em', desc: true })).find(e => e.detalhe?.peca_id === p.id)
  if (!ev?.detalhe?.dados) return null
  return C.htmlRelatorio(ev.detalhe.dados, ev.detalhe.conclusoes || C.conclusoesSemIA(ev.detalhe.dados), { gerado_em: ev.criado_em, painel: op.painel ?? '/maia/painel' })
}

// ═══════════════════════════ o painel do dono e o pedido pelo WhatsApp
export async function analisesEnviadas(negocio_id: string, limite = 6) {
  const ps = await db.lista('pecas', { negocio_id, tipo: 'relatorio' }, { ordem: 'criado_em', desc: true })
  return ps.filter(p => ehAnalise(p) && p.status === 'aprovada' && p.enviado_dono_em).slice(0, limite).map(p => ({ id: p.id, titulo: p.titulo, texto: p.texto, enviado_em: p.enviado_dono_em }))
}
export async function relatoriosEnviados(negocio_id: string, limite = 12) {
  const ps = await db.lista('pecas', { negocio_id, tipo: 'relatorio' }, { ordem: 'criado_em', desc: true })
  return ps.filter(p => ehRelatorioMes(p) && p.status === 'aprovada' && p.enviado_dono_em).slice(0, limite)
    .map(p => ({ id: p.id, mes: String(p.titulo).slice(C.TITULO_MES.length).trim(), nome: C.nomeDoMes(String(p.titulo).slice(C.TITULO_MES.length).trim()), texto: p.texto, enviado_em: p.enviado_dono_em }))
}

// o dono pediu pelo WhatsApp. Devolve o que a Maia responde (a IA da conversa repassa do jeito dela)
export async function pedidoDoDono(neg: any, qual: 'analise' | 'relatorio_mes', agora = new Date()) {
  if (qual === 'relatorio_mes') {
    const [ult] = await relatoriosEnviados(neg.id, 1)
    if (ult) return { ok: true, mes: ult.nome, link: linkRelatorio(neg, ult.id), resumo: ult.texto, obs: 'manda o link inteiro, sem mudar nada (é pessoal)' }
    const mes = mesAnteriorDe(agora, fusoDo(neg))
    const esperando = (await db.lista('pecas', { negocio_id: neg.id, tipo: 'relatorio' })).find(p => ehRelatorioMes(p) && p.status === 'revisao_equipe')
    if (esperando) return { ok: true, obs: 'o relatório está com a equipe conferindo: chega pra ele assim que aprovarem' }
    const g: any = await geraRelatorioMes(neg, mes)
    return { ok: true, obs: g.pulou ? 'o relatório já foi feito e está com a equipe' : `fiz o relatório de ${C.nomeDoMes(mes)} agora: a equipe confere e chega pra ele em seguida` }
  }
  const [ult] = await analisesEnviadas(neg.id, 1)
  if (ult && agora.getTime() - Date.parse(ult.enviado_em) < 2 * DIA) return { ok: true, analise: ult.texto, obs: 'é a análise mais recente (menos de 2 dias): repassa o texto' }
  // os números de agora vão na hora (são do sistema); a conclusão sai depois que a equipe olha
  const p = await periodoDaAnalise(neg, agora)
  const d = await dadosDaAnalise(neg, p.de, p.ate, agora)
  const esperando = (await db.lista('pecas', { negocio_id: neg.id, tipo: 'relatorio' })).find(x => ehAnalise(x) && x.status === 'revisao_equipe')
  if (!esperando) await geraAnalise(neg, { agora })
  return { ok: true, numeros_agora: C.textoAnalise(d, false), obs: 'manda os números agora; a conclusão (seguir, segurar ou mudar) chega depois que a equipe conferir' }
}

// ═══════════════════════════ 3) A AGENDA (rotina.ts chama de hora em hora)
const HORA = 8
// o 1º dia a partir do dia 2 do mês em que o negócio abre (até o dia 8); sem saber os dias, o dia 2
export const diaDoRelatorio = (neg: any, ano: number, mes: number) => C.diaDoRelatorioCom(diasQueAbre(neg), ano, mes)

// quem recebe: os mesmos do resumo da semana (ativo, ou implantação que já atende), fora demonstração
async function negocios(agora: Date) { const { negociosDoResumo } = await import('./rotina'); return negociosDoResumo(new Date(agora.getTime() - 7 * DIA)) }

export async function rotinaRelatorios(op: { agora?: Date; forcar?: boolean } = {}) {
  const agora = op.agora || new Date()
  const feitos: any[] = []
  for (const neg of await negocios(agora)) {
    try {
      const h = horaLocal(agora, fusoDo(neg))
      if (h.hora !== HORA && !op.forcar) continue
      const [ano, mes, dia] = h.data.split('-').map(Number)
      const diaRel = diaDoRelatorio(neg, ano, mes)
      const mesPassado = mesAnteriorDe(agora, fusoDo(neg))
      // o relatório do mês passado (no dia dele, ou depois se ainda não saiu, até o dia 8)
      if (dia >= diaRel && dia <= 8) {
        const r: any = await geraRelatorioMes(neg, mesPassado)
        if (!r.pulou) { feitos.push({ negocio: neg.id, relatorio: r.peca.id }); continue }
      }
      // o aviso: no dia antes do relatório
      if (dia === diaRel - 1) {
        const r: any = await geraAvisoMes(neg, mesPassado)
        if (!r.pulou) feitos.push({ negocio: neg.id, aviso: r.peca.id, tom: r.tom })
        continue
      }
      // a análise: a cada 2 dias, só pra quem tem anúncio (gasto nos últimos 7 dias ou campanha no ar), e em dia que o negócio abre.
      // Pula a segunda (tem o resumo da semana) e o dia do relatório
      if (h.diaSemana === 1 || dia === diaRel) continue
      const abre = diasQueAbre(neg)
      if (abre && !abre.includes(h.diaSemana)) continue
      const ult = await ultimaAnalise(neg.id)
      if (ult && agora.getTime() - Date.parse(ult.criado_em) < 44 * 3600e3) continue
      const temAnuncio = (await db.lista('campanhas', { negocio_id: neg.id })).some(c => c.status === 'ativa')
        || (await db.lista('metricas_dia', { negocio_id: neg.id })).some(m => Number(m.gasto) > 0 && m.dia >= new Date(agora.getTime() - 7 * DIA).toISOString().slice(0, 10))
      if (!temAnuncio) continue
      const r = await geraAnalise(neg, { agora })
      feitos.push({ negocio: neg.id, analise: r.peca.id, conclusao: r.dados.decisao.conclusao })
    } catch (e: any) { feitos.push({ negocio: neg.id, erro: String(e?.message || e).slice(0, 200) }) }
  }
  return feitos
}
