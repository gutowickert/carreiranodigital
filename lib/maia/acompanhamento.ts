// Maia: o acompanhamento dos negócios NOVOS pela equipe (13/11). O Guto começa com 1-2 negócios e o time olha tudo de perto.
//   1) as primeiras conversas: nas 5 primeiras conversas REAIS de clientes de um negócio (sem simulação e sem demonstração),
//      quando chega a 1ª mensagem do cliente, a equipe recebe um aviso com o link direto pra conversa (acompanhar ao vivo).
//      Quantas: meta.acompanhar_primeiras (ou contexto.acompanhar_primeiras) no negócio; padrão 5; 0 desliga.
//   2) a análise da manhã (7h, pela rotina): se o negócio está em acompanhamento (30 dias desde a 1ª conversa real, ou
//      meta.acompanhar = true) e teve conversa real ontem: os números calculados aqui (conversas, preço antes do valor, demora,
//      passagens pro dono, perguntas que ela não soube, cliente que sumiu), trechos pra olhar e sugestões. A IA (barata) só
//      escreve as conclusões. Fica no evento 'analise_manha' (painel: /maia/operacao/aprendizado.html) e vai um aviso curto.
//   3) quem recebe: avisaTime = o aviso de sempre (avisaEquipe: o tópico do ntfy RECADO_NTFY_TOPICO, quem assinar recebe no
//      celular) + WhatsApp pelo número da Maia pra cada número em MAIA_AVISO_EQUIPE_WHATS (separados por vírgula). Nada no código.
import { maiaDb as db, maiaLocal } from './db'
import { avisaEquipe } from './canal'
import { precoAntesDoValor } from './preco'

const H = 3600e3, DIA = 86400e3
const horaBR = (d = new Date()) => (d.getUTCHours() + 21) % 24
const diaSemanaBR = (d = new Date()) => new Date(d.getTime() - 3 * H).getUTCDay()
export const conversaReal = (cv: any) => cv?.canal === 'cliente' && cv.simulada !== true && !/^55000/.test(String(cv.telefone || ''))
const ehDemo = (n: any) => !!n?.contexto?.demo
const base = () => process.env.MAIA_URL_PUBLICA || (maiaLocal() ? `http://localhost:${process.env.PORT || 3000}` : 'https://www.carreiranodigital.com')
export const linkConversa = (cv: any) => `${base()}/maia/operacao/aprendizado.html#conversa/${cv.id}`
export const linkAnalises = (neg: any) => `${base()}/maia/operacao/aprendizado.html#acompanhar/${neg.id}`

// ---------- quem é a equipe ----------
export const fonesDoTime = () => String(process.env.MAIA_AVISO_EQUIPE_WHATS || '').split(',').map(x => x.replace(/\D/g, '')).filter(x => x.length >= 12)

// o aviso pro time: o de sempre (celular, via ntfy) + o WhatsApp de cada um (texto pelo número da Maia; só chega dentro da
// janela de 24 h de quem escreveu pra Maia: fora dela a Meta recusa e fica só o aviso do celular). No modo local só anota.
export async function avisaTime(titulo: string, texto: string, negocio_id: string | null, urgente = false) {
  await avisaEquipe(titulo, texto, negocio_id, urgente)
  const fones = fonesDoTime()
  if (!fones.length || maiaLocal() || process.env.MAIA_SEM_AVISO === '1') return { whats: 0 }
  const { enviaTexto } = await import('@/lib/oito/wa')
  let n = 0
  for (const f of fones) { const r: any = await enviaTexto(f, `Maia · ${titulo}\n${texto}`).catch(() => null); if (r?.ok) n++ }
  return { whats: n }
}

// ---------- 1) as primeiras conversas ----------
export const limitePrimeiras = (neg: any) => {
  const v = neg?.meta?.acompanhar_primeiras ?? neg?.contexto?.acompanhar_primeiras
  const n = Number(v)
  return v === undefined || v === null || v === '' || isNaN(n) ? 5 : Math.max(0, Math.round(n))
}

// chamada quando a mensagem do cliente acabou de ser gravada (gancho em atendente.ts, recebeDoCliente). Nunca derruba nada.
export async function acompanhaPrimeiras(neg: any, cv: any) {
  if (!neg || ehDemo(neg) || neg.status === 'cancelado' || !conversaReal(cv)) return null
  const limite = limitePrimeiras(neg)
  if (!limite) return null
  const doCliente = await db.lista('msgs', { conversa_id: cv.id, autor: 'cliente' }, { limite: 2 })
  if (doCliente.length > 1) return null   // não é a 1ª mensagem dessa conversa
  const ja = await db.lista('eventos', { tipo: 'acompanha_conversa', negocio_id: neg.id })
  if (ja.some(e => e.detalhe?.conversa_id === cv.id) || ja.length >= limite) return null
  const reais = (await db.lista('conversas', { negocio_id: neg.id, canal: 'cliente' }, { ordem: 'criado_em' })).filter(conversaReal)
  const pos = reais.findIndex(c => c.id === cv.id) + 1
  if (pos < 1 || pos > limite) return null
  await db.evento('acompanha_conversa', neg.id, { conversa_id: cv.id, n: pos, limite })
  const quem = String(cv.nome || 'um cliente').split(' ')[0].slice(0, 20)
  const link = linkConversa(cv)
  await avisaTime(`conversa ${pos} de ${limite} · ${String(neg.nome).slice(0, 30)}`, `${quem} mandou a 1ª mensagem. Acompanha ao vivo: ${link}`, neg.id, true)
  return { n: pos, limite, link }
}

// ---------- 2) a análise da manhã ----------
export async function emAcompanhamento(neg: any, agora = new Date()) {
  if (!neg || ehDemo(neg) || neg.status === 'cancelado' || neg.status === 'pausado') return false
  if (neg.meta?.acompanhar === false) return false
  if (neg.meta?.acompanhar === true) return true
  const reais = (await db.lista('conversas', { negocio_id: neg.id, canal: 'cliente' }, { ordem: 'criado_em' })).filter(conversaReal)
  if (!reais.length) return false
  const dias = Math.max(1, Number(neg.meta?.acompanhar_dias) || 30)
  return agora.getTime() - Date.parse(reais[0].criado_em) <= dias * DIA
}

// o dia de ontem no horário de Brasília: [início, fim) em ISO e a data 'AAAA-MM-DD'
export function ontemBR(agora = new Date()) {
  const br = new Date(agora.getTime() - 3 * H)
  const hoje0 = Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate(), 3, 0, 0)
  const ini = new Date(hoje0 - DIA), fim = new Date(hoje0)
  return { de: ini.toISOString(), ate: fim.toISOString(), dia: new Date(hoje0 - DIA - 3 * H + 12 * H).toISOString().slice(0, 10) }
}

const curto = (t: any, n = 160) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s }
const DEMORA_MIN = () => Math.max(1, Number(process.env.MAIA_ACOMPANHA_DEMORA_MIN) || 5)

// os números do dia (sem IA). intervalo = [de, ate)
export async function numerosDoDia(neg: any, de: string, ate: string) {
  const cvs = (await db.lista('conversas', { negocio_id: neg.id, canal: 'cliente' })).filter(conversaReal)
  const [todasMsgs, humanos, perguntas, correcoes] = await Promise.all([
    db.lista('msgs', { negocio_id: neg.id }, { ordem: 'criado_em', desde: ['criado_em', de] }),
    db.lista('eventos', { tipo: 'modo_humano', negocio_id: neg.id }, { desde: ['criado_em', de] }),
    db.lista('lead_eventos', { negocio_id: neg.id, tipo: 'pergunta_cliente' }, { desde: ['criado_em', de] }),
    db.lista('eventos', { tipo: 'correcao_time', negocio_id: neg.id }, { desde: ['criado_em', de] }),
  ])
  const ids = new Set(cvs.map(c => c.id)), noDia = (x: any) => x.criado_em >= de && x.criado_em < ate
  const msgs = todasMsgs.filter(m => ids.has(m.conversa_id) && noDia(m))
  const porCv = new Map<string, any[]>()
  for (const m of msgs) { if (!porCv.has(m.conversa_id)) porCv.set(m.conversa_id, []); porCv.get(m.conversa_id)!.push(m) }
  const ativas = cvs.filter(c => (porCv.get(c.id) || []).some(m => m.autor === 'cliente'))
  const trechos: { conversa_id: string; nome: string; tipo: string; texto: string; msg_id?: any }[] = []
  const nomeCv = (c: any) => curto(c.nome || 'cliente ' + String(c.telefone || '').slice(-4), 30)
  let respostasMaia = 0, precoAntes = 0, demoradas = 0, semResposta = 0, somaEspera = 0, esperas = 0
  const { foraDoTom } = await import('./tom')
  let foraTom = 0
  for (const c of ativas) {
    const l = porCv.get(c.id) || []
    for (let i = 0; i < l.length; i++) {
      const m = l[i]
      if (m.autor === 'maia') {
        respostasMaia++
        if (precoAntesDoValor(String(m.texto || ''))) { precoAntes++; trechos.push({ conversa_id: c.id, nome: nomeCv(c), tipo: 'preço antes do valor', texto: curto(m.texto), msg_id: m.id }) }
        const tom = foraDoTom(neg, String(m.texto || ''))
        if (tom.length) { foraTom++; trechos.push({ conversa_id: c.id, nome: nomeCv(c), tipo: 'fora do tom: ' + tom[0], texto: curto(m.texto), msg_id: m.id }) }
      }
      // demora: da 1ª mensagem do cliente (de um bloco) até a próxima resposta de quem atende
      if (m.autor === 'cliente' && (i === 0 || l[i - 1].autor !== 'cliente')) {
        const resp = l.slice(i + 1).find(x => x.autor === 'maia' || x.autor === 'equipe' || x.autor === 'dono')
        const humano = c.modo === 'humano'
        if (!resp) { if (!humano) { semResposta++; trechos.push({ conversa_id: c.id, nome: nomeCv(c), tipo: 'ficou sem resposta', texto: curto(m.texto) }) } continue }
        const min = (Date.parse(resp.criado_em) - Date.parse(m.criado_em)) / 60e3
        somaEspera += min; esperas++
        if (min > DEMORA_MIN()) { demoradas++; trechos.push({ conversa_id: c.id, nome: nomeCv(c), tipo: `demorou ${Math.round(min)} min`, texto: curto(m.texto) }) }
      }
    }
  }
  const passagens = humanos.filter(noDia).filter(e => ids.has(e.detalhe?.conversa_id))
  for (const e of passagens) { const c = cvs.find(x => x.id === e.detalhe.conversa_id); trechos.push({ conversa_id: e.detalhe.conversa_id, nome: c ? nomeCv(c) : 'cliente', tipo: 'passou pro dono', texto: curto(e.detalhe?.motivo || '') }) }
  const naoSoube = perguntas.filter(noDia)
  for (const p of naoSoube) { const c = cvs.find(x => x.lead_id === p.lead_id); trechos.push({ conversa_id: c?.id || '', nome: c ? nomeCv(c) : 'cliente', tipo: 'não soube responder', texto: curto(p.detalhe?.pergunta || '') }) }
  // cliente que sumiu: escreveu ontem, a última mensagem da conversa (até agora) é de quem atende e faz 2 h+ sem resposta
  const sumiu: any[] = []
  for (const c of ativas) {
    const ult = todasMsgs.filter(m => m.conversa_id === c.id).slice(-1)[0]
    if (!ult || ult.autor === 'cliente' || Date.now() - Date.parse(ult.criado_em) < 2 * H) continue
    const lead = c.lead_id ? await db.um('leads', { id: c.lead_id }) : null
    if (lead && ['ganho', 'perdido'].includes(lead.etapa)) continue
    const ultCli = todasMsgs.filter(m => m.conversa_id === c.id && m.autor === 'cliente').slice(-1)[0]
    sumiu.push({ conversa_id: c.id, nome: nomeCv(c), etapa: lead?.etapa || '?', ultima_do_cliente: curto(ultCli?.texto, 120), ultima_da_maia: curto(ult.texto, 120) })
  }
  for (const s of sumiu) trechos.push({ conversa_id: s.conversa_id, nome: s.nome, tipo: `sumiu (etapa ${s.etapa})`, texto: `cliente: "${s.ultima_do_cliente}" → última resposta: "${s.ultima_da_maia}"` })
  return {
    numeros: {
      conversas: ativas.length, novas: ativas.filter(c => noDia(c)).length, msgs_cliente: msgs.filter(m => m.autor === 'cliente').length, respostas_maia: respostasMaia,
      preco_antes_do_valor: precoAntes, fora_do_tom: foraTom, demoradas, sem_resposta: semResposta, espera_media_min: esperas ? Math.round(somaEspera / esperas * 10) / 10 : null,
      passagens_dono: passagens.length, nao_soube: naoSoube.length, sumiram: sumiu.length, correcoes_time: correcoes.filter(noDia).length,
      vendas: 0,
    },
    trechos: trechos.slice(0, 12), sumiu,
  }
}

// sugestões sem IA (sempre saem; a IA, se ligada, escreve as conclusões por cima dos mesmos números)
function sugestoesDosNumeros(n: any): string[] {
  const s: string[] = []
  if (n.preco_antes_do_valor) s.push(`Corrigir as ${n.preco_antes_do_valor} resposta(s) com preço antes do valor (botão "isso está errado" na conversa), pra virar regra.`)
  if (n.nao_soube) s.push(`Pôr no cadastro (perguntas frequentes) a resposta das ${n.nao_soube} pergunta(s) que ela não soube.`)
  if (n.passagens_dono) s.push(`Olhar as ${n.passagens_dono} passagem(ns) pro dono: se o motivo era fácil, ensinar a resposta.`)
  if (n.demoradas || n.sem_resposta) s.push(`Ver por que ${n.demoradas + n.sem_resposta} mensagem(ns) demoraram ou ficaram sem resposta (limite do dia, erro da IA, conversa com a equipe).`)
  if (n.sumiram) s.push(`${n.sumiram} cliente(s) sumiram: conferir a última resposta de cada um e se a retomada está marcada.`)
  if (n.fora_do_tom) s.push(`Revisar o tom: ${n.fora_do_tom} resposta(s) fora do tom combinado.`)
  if (!s.length) s.push('Nada fora do normal: dá pra seguir olhando por amostra.')
  return s
}

export async function analisaDia(neg: any, opc: { agora?: Date; forcar?: boolean } = {}) {
  const { de, ate, dia } = ontemBR(opc.agora || new Date())
  const antigas = (await db.lista('eventos', { tipo: 'analise_manha', negocio_id: neg.id })).filter(e => e.detalhe?.dia === dia)
  if (antigas.length && !opc.forcar) return { pulou: 'já feita', dia }
  const d = await numerosDoDia(neg, de, ate)
  if (!d.numeros.conversas) return { pulou: 'sem conversa real ontem', dia }
  const leadsGanhos = (await db.lista('leads', { negocio_id: neg.id, etapa: 'ganho' })).filter(l => l.ganho_em && l.ganho_em >= de && l.ganho_em < ate)
  d.numeros.vendas = leadsGanhos.length
  const sugestoes = sugestoesDosNumeros(d.numeros)
  let conclusoes = '', ia = false
  if (process.env.ANTHROPIC_API_KEY && process.env.MAIA_APRENDE_SEM_IA !== '1') {
    try {
      const { emJson } = await import('./ia')
      const { modeloBarato } = await import('./misto')
      const r = await emJson<{ conclusoes: string; sugestoes?: string[] }>(
        'Tu és a analista da equipe da Carreira no Digital olhando como a Maia (IA que atende clientes de pequenos negócios no WhatsApp) foi ontem. Escreves pra EQUIPE (não pro dono), em português simples, curto e direto. Usa SÓ os números e trechos que vieram; não inventa nenhum número.',
        `NEGÓCIO: ${neg.nome} (${neg.nicho || ''}). DIA: ${dia}.\nNÚMEROS (calculados pelo sistema): ${JSON.stringify(d.numeros)}\nTRECHOS: ${JSON.stringify(d.trechos.map(t => ({ tipo: t.tipo, cliente: t.nome, texto: t.texto })))}\nSUGESTÕES JÁ CALCULADAS: ${JSON.stringify(sugestoes)}\nDevolve {"conclusoes":"3 a 5 frases: como ela foi, o que mais chama atenção","sugestoes":["até 4 sugestões de correção, concretas"]}`,
        [], { modelo: modeloBarato(), uso: { tipo: 'analise_manha', negocio_id: neg.id } })
      conclusoes = String(r?.conclusoes || '').trim().slice(0, 1200)
      if (Array.isArray(r?.sugestoes) && r.sugestoes.length) sugestoes.splice(0, sugestoes.length, ...r.sugestoes.map(x => String(x).slice(0, 300)).slice(0, 4))
      ia = !!conclusoes
    } catch { /* sem IA: fica o texto dos números */ }
  }
  const n = d.numeros
  if (!conclusoes) conclusoes = `Ontem: ${n.conversas} conversa(s) real(is) (${n.novas} nova(s)), ${n.respostas_maia} resposta(s) da Maia${n.espera_media_min != null ? `, espera média de ${n.espera_media_min} min` : ''}. ` +
    `Pontos: ${[n.preco_antes_do_valor && `${n.preco_antes_do_valor} preço antes do valor`, n.fora_do_tom && `${n.fora_do_tom} fora do tom`, n.demoradas && `${n.demoradas} demora(s)`, n.sem_resposta && `${n.sem_resposta} sem resposta`, n.passagens_dono && `${n.passagens_dono} passagem(ns) pro dono`, n.nao_soube && `${n.nao_soube} pergunta(s) que ela não soube`, n.sumiram && `${n.sumiram} cliente(s) que sumiram`].filter(Boolean).join(', ') || 'nenhum'}.`
  const pontos = n.preco_antes_do_valor + n.fora_do_tom + n.demoradas + n.sem_resposta + n.passagens_dono + n.nao_soube + n.sumiram
  const ev = await db.insere('eventos', { tipo: 'analise_manha', negocio_id: neg.id, detalhe: { dia, de, ate, numeros: n, trechos: d.trechos, sumiu: d.sumiu, conclusoes, sugestoes, ia, pontos } })
  await avisaTime(`análise de ontem · ${String(neg.nome).slice(0, 30)}`, `${n.conversas} conversa(s), ${pontos} ponto(s) pra olhar. ${linkAnalises(neg)}`, neg.id)
  return { feita: true, dia, evento: ev.id, numeros: n }
}

// ---------- a rotina (gancho em rotina.ts, de hora em hora) ----------
export async function rotinaAprendizado(opc: { relogio?: Date; forcar?: boolean } = {}) {
  const agora = opc.relogio || new Date(), r: any = {}
  const ap = await import('./aprendizado')
  try { r.regras_sincronizadas = await ap.sincronizaRegras() } catch (e: any) { r.sincroniza_erro = e.message }
  if (opc.forcar || horaBR(agora) === 7) {
    r.analises = []
    for (const neg of await db.lista('negocios')) {
      try { if (await emAcompanhamento(neg, agora)) r.analises.push({ negocio: neg.id, ...(await analisaDia(neg, { agora })) }) } catch (e: any) { r.analises.push({ negocio: neg.id, erro: e.message }) }
    }
  }
  // segunda 8h: a Maia propõe as regras novas da semana (a equipe aprova no painel)
  if (opc.forcar || (diaSemanaBR(agora) === 1 && horaBR(agora) === 8)) {
    try {
      const novas = await ap.propoeRegras({ por: 'rotina' })
      r.propostas = novas.length
      if (novas.length) await avisaTime('regras novas pra aprovar', `A Maia juntou as correções da semana e propôs ${novas.length} regra(s). Aprova ou recusa: ${base()}/maia/operacao/aprendizado.html#regras`, null)
    } catch (e: any) { r.propostas_erro = e.message }
  }
  return r
}
