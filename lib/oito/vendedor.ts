// Oito Posts: a venda 1 a 1 no WhatsApp (14/10).
//   1. O FOLLOW-UP: quem fez o teste grátis e não assinou recebe 3 mensagens (modelos aprovados pela Meta, porque é a gente que puxa a conversa):
//      ~20 min depois do teste pronto · no dia seguinte, 10h · 3 dias depois, 10h. Para quando a pessoa responde, assina ou pede SAIR.
//   2. O VENDEDOR: quando a pessoa responde, a IA conversa (tira dúvida, quebra objeção, manda o link de assinar) com o que sabe
//      do produto (o mesmo do suporte), do negócio dela e dos 2 posts que ela recebeu. Passa a vez pro dono quando precisa.
// O dono assume no painel (aba WhatsApp): no modo "humano" a IA não responde.
import { oitoDb as db } from './db'
import { oitoConfig as cfg, Marca, emEspanhol, precoTxt } from './config'
import { SABE, SABE_ES } from './suporte'
import { enviaTexto, enviaModelo, conversaDe, registraSaida, waLigado } from './wa'
import { avisaDono } from './servico'

const MODELO = process.env.OITO_MODELO || 'claude-sonnet-5-5'
export const MAX_IA_VENDA = 14   // respostas da IA por conversa antes de chamar o dono
const BASE = () => process.env.OITO_URL_BASE || 'https://carreiranodigital.vercel.app'

// os modelos (criados na conta do WhatsApp do Oito; ver sistema/whatsapp-modelos.md). {{1}} nome · {{2}} marca · {{3}} negócio
export const MODELOS = {
  pt: ['oito_teste_pronto', 'oito_seguimento_1', 'oito_seguimento_2'],
  es: ['oito_es_prueba_lista', 'oito_es_seguimiento_1', 'oito_es_seguimiento_2'],
}
// 16/10: as versões novas (a 1ª pede a aprovação, não vende; tudo mais leve). Tenta a _v2; se a Meta ainda não aprovou, vai a antiga.
export async function enviaModeloNovo(tel: string, modelo: string, idioma: string, corpo: string[], botoes: any[] = []) {
  const r = await enviaModelo(tel, modelo + '_v2', idioma, corpo, botoes)
  if (r.ok) return { ...r, modelo: modelo + '_v2' }
  return { ...(await enviaModelo(tel, modelo, idioma, corpo, botoes)), modelo }
}
const hojeHora = (dias: number, hora: number, tz = -3) => { const d = new Date(Date.now() + tz * 3600e3); d.setUTCDate(d.getUTCDate() + dias); d.setUTCHours(hora - tz, 0, 0, 0); return d }
const primeiro = (s: any) => String(s || '').trim().split(/\s+/)[0] || ''

// quando o teste fica pronto, a conversa entra na fila do follow-up (chamado pela rota de follow-up, que varre os testes prontos)
// 16/10: o 1º passo é NA HORA (era 20 min depois) e a conversa já nasce em "aprovando_teste": quando a pessoa responder,
// o agente sabe que ela já viu os 2 posts (no site) e segue pra opinião e venda. Vale pro espanhol também (mesmo número).
export async function agendaFollowup(c: any) {
  if (!c?.whatsapp || c.exemplo || c.status !== 'teste') return null
  const cv = await conversaDe(c.whatsapp, { nome: c.responsavel || c.nome_negocio })
  if (cv.followup_etapa > 0 || cv.proximo_followup_em || cv.optout) return cv
  await db.atualiza('wa_conversas', { id: cv.id }, { cliente_id: c.id, marca: c.marca, fase: 'aprovando_teste', proximo_followup_em: new Date().toISOString() })
  return { ...cv, cliente_id: c.id, marca: c.marca, fase: 'aprovando_teste' }
}

// 16/10: o teste do site ficou pronto → o WhatsApp chama a pessoa na mesma hora (chamado pelo fim do lote, não espera a varredura)
export async function chamaNaHora(c: any) {
  if (!waLigado()) return 'whatsapp desligado'
  const cv = await agendaFollowup(c)
  if (!cv) return 'sem whatsapp ou não é teste'
  if (cv.followup_etapa > 0) return 'já chamado'
  const atual = await db.um('wa_conversas', { id: cv.id })
  return passoFollowup(atual)
}

// manda o próximo passo do follow-up de uma conversa (se ainda faz sentido)
async function passoFollowup(cv: any) {
  const c = cv.cliente_id ? await db.um('clientes', { id: cv.cliente_id }) : null
  const parar = !c || cv.optout || cv.modo !== 'ia' || ['ativo', 'aguardando_pagamento', 'cancelado'].includes(c.status) || cv.followup_etapa >= 3
    || (cv.ultima_msg_em && (await ultimaDoCliente(cv.id)))
  if (parar) { await db.atualiza('wa_conversas', { id: cv.id }, { proximo_followup_em: null }); return 'parou' }
  const m = c.marca as Marca, es = emEspanhol(m), etapa = cv.followup_etapa
  const nome = primeiro(c.responsavel) || c.nome_negocio
  const r = await enviaModeloNovo(cv.telefone, MODELOS[es ? 'es' : 'pt'][etapa], es ? 'es' : 'pt_BR', [nome, cfg.marcas[m].nome, c.nome_negocio],
    etapa === 0 ? [{ tipo: 'url', indice: 0, valor: `${m}/teste.html?c=${c.codigo}` }] : [])
  const modelo = r.modelo
  await registraSaida(cv, 'sistema', `[modelo ${modelo}] follow-up ${etapa + 1} de 3`, r, 'modelo')
  const prox = etapa === 0 ? hojeHora(1, 10) : etapa === 1 ? hojeHora(2, 10) : null
  await db.atualiza('wa_conversas', { id: cv.id }, { followup_etapa: etapa + 1, proximo_followup_em: r.ok && prox ? prox.toISOString() : null })
  if (r.ok) await db.evento('wa_followup', { cliente_id: c.id, marca: m, detalhe: { etapa: etapa + 1, modelo } })
  return r.ok ? 'enviado ' + (etapa + 1) : 'falhou: ' + r.erro
}
const ultimaDoCliente = async (id: string) => (await db.lista('wa_msgs', { conversa_id: id, autor: 'cliente' }, { limite: 1 })).length > 0

// a varredura (o gerador chama a cada 2 min): põe na fila quem teve o teste pronto e manda os passos vencidos
export async function rodaFollowups() {
  // 15/10: o e-mail roda sempre; o WhatsApp só com o número ligado
  const { rodaFollowupEmail } = await import('./followup-email')
  const email = await rodaFollowupEmail().catch((e: any) => ({ erro: e?.message }))
  if (!waLigado()) return { ligado: false, email }
  const desde = new Date(Date.now() - 3 * 86400e3).toISOString()
  const prontos = (await db.lista('eventos', { tipo: 'teste_pronto' }, { ordem: 'criado_em', desc: true, limite: 200 })).filter(e => e.criado_em > desde)
  const vistos = new Set<string>(), novos: string[] = []
  for (const e of prontos) {
    if (!e.cliente_id || vistos.has(e.cliente_id)) continue
    vistos.add(e.cliente_id)
    const c = await db.um('clientes', { id: e.cliente_id })
    if (!c || c.exemplo || c.status !== 'teste') continue
    // 16/10: o espanhol (Feed al Día) passou a usar o mesmo WhatsApp ("No Feed", +55), com os modelos em espanhol (antes: só e-mail)
    const cv = await db.um('wa_conversas', { telefone: String(c.whatsapp || '') })
    if (!cv) { await agendaFollowup(c); novos.push(c.codigo) }
  }
  const agora = new Date().toISOString(), envios: string[] = []
  const vencidos = (await db.lista('wa_conversas', {}, { ordem: 'proximo_followup_em', limite: 300 })).filter(cv => cv.proximo_followup_em && cv.proximo_followup_em <= agora).slice(0, 20)
  for (const cv of vencidos) envios.push(cv.telefone.slice(-4) + ': ' + (await passoFollowup(cv).catch(e => 'erro ' + e.message)))
  const retomadas = await retomaConversas().catch((e: any) => ['erro ' + e.message])
  return { ligado: true, novos, envios, retomadas }
}

// 15/10: quem começou pelo WhatsApp e parou no meio do funil (sem responder a nossa última mensagem) recebe até 2 lembretes por fase:
//   1º: 3 h depois da última mensagem dele, ainda dentro das 24 h (texto livre, da fase) · 2º: 2 dias depois, com o modelo aprovado
//   (só depois do teste: o modelo fala dos posts). Só das 9h às 20h (Brasília). Para com SAIR, modo humano ou se ele responder.
// 16/10: mais leves e menos de cobrança (pedido do Guto)
const RETOMA: Record<string, string> = {
  novo: 'Oi{n}! Ficamos na metade 🙂 Faltam só umas respostas pra eu montar os seus 2 posts grátis. Quando tiver um minutinho, é só seguir por aqui.',
  entrevista: 'Oi{n}! Ficamos na metade 🙂 Faltam só umas respostas pra eu montar os seus 2 posts grátis. Quando tiver um minutinho, é só seguir por aqui.',
  aprovando_teste: 'Oi{n}! Conseguiu dar uma olhada nos 2 posts? Quero muito saber o que achou. Se quiser trocar alguma coisa, eu ajusto.',
  venda: 'Oi{n}! Se ficou alguma dúvida, pode perguntar sem compromisso. E se preferir pensar com calma, tudo bem também 🙂',
  aguardando_pagamento: 'Oi{n}! Só pra você não ficar sem os posts: o link de pagamento continua valendo. Se deu algum problema, me conta que eu resolvo.',
}
const RETOMA_ES: Record<string, string> = {
  novo: '¡Hola{n}! Quedamos a mitad de camino 🙂 Faltan solo unas respuestas para armar tus 2 posts gratis. Cuando tengas un minuto, seguimos por aquí.',
  entrevista: '¡Hola{n}! Quedamos a mitad de camino 🙂 Faltan solo unas respuestas para armar tus 2 posts gratis. Cuando tengas un minuto, seguimos por aquí.',
  aprovando_teste: '¡Hola{n}! ¿Alcanzaste a ver los 2 posts? Me encantaría saber qué te parecieron. Si quieres cambiar algo, lo ajusto.',
  venda: '¡Hola{n}! Si te quedó alguna duda, pregúntame sin compromiso. Y si prefieres pensarlo con calma, también está bien 🙂',
  aguardando_pagamento: '¡Hola{n}! Para que no te quedes sin tus posts: el enlace de pago sigue activo. Si hubo algún problema, cuéntame y lo resolvemos.',
}
async function retomaConversas() {
  const hora = new Date(Date.now() - 3 * 3600e3).getUTCHours()
  if (hora < 9 || hora >= 20) return []
  const agora = Date.now(), feitos: string[] = []
  // as conversas do follow-up do formulário (fase novo com passo enviado) seguem no fluxo delas
  const cvs = (await db.lista('wa_conversas', { modo: 'ia' }, { ordem: 'ultima_msg_em', desc: true, limite: 300 }))
    .filter(cv => !cv.optout && !cv.simulado && RETOMA[cv.fase] && cv.janela_ate && !(cv.followup_etapa > 0 && cv.fase === 'novo'))
  for (const cv of cvs.slice(0, 200)) {
    if (feitos.length >= 10) break
    const ultima = (await db.lista('wa_msgs', { conversa_id: cv.id }, { ordem: 'criado_em', desc: true, limite: 1 }))[0]
    if (!ultima || ultima.autor === 'cliente') continue // a vez é nossa: quem responde é o agente, não o lembrete
    const passou = agora - (new Date(cv.janela_ate).getTime() - 24 * 3600e3)
    const r = cv.rascunho || {}, feito = (r.retoma || {})[cv.fase] || 0
    const c = cv.cliente_id ? await db.um('clientes', { id: cv.cliente_id }) : null
    if (c && (c.exemplo || ['ativo', 'cancelado'].includes(c.status))) continue // exemplo = teste nosso: sem lembrete
    const nome = primeiro(cv.nome || c?.responsavel), n = nome && !/^\d/.test(nome) ? ', ' + nome : ''
    let res: any = null
    if (feito === 0 && passou > 3 * 3600e3 && passou < 23 * 3600e3) {
      const txt = ((cv.marca && emEspanhol(cv.marca as Marca) ? RETOMA_ES : RETOMA)[cv.fase] || RETOMA[cv.fase]).replace('{n}', n)
      res = await enviaTexto(cv.telefone, txt); await registraSaida(cv, 'sistema', txt, res)
    } else if (feito === 1 && passou > 48 * 3600e3 && passou < 6 * 86400e3 && c && ['aprovando_teste', 'venda', 'aguardando_pagamento'].includes(cv.fase)) {
      const m = c.marca as Marca, es = emEspanhol(m)
      res = await enviaModeloNovo(cv.telefone, MODELOS[es ? 'es' : 'pt'][1], es ? 'es' : 'pt_BR', [nome || c.nome_negocio, cfg.marcas[m].nome, c.nome_negocio])
      await registraSaida(cv, 'sistema', `[modelo ${res.modelo}] lembrete 2 (${cv.fase})`, res, 'modelo')
    } else continue
    await db.atualiza('wa_conversas', { id: cv.id }, { rascunho: { ...r, retoma: { ...(r.retoma || {}), [cv.fase]: feito + 1 } } })
    if (res?.ok) await db.evento('wa_retoma', { cliente_id: cv.cliente_id || null, marca: cv.marca || null, detalhe: { fase: cv.fase, lembrete: feito + 1 } })
    feitos.push(`${cv.telefone.slice(-4)} ${cv.fase} ${feito + 1}${res?.ok ? '' : ' falhou'}`)
  }
  return feitos
}

// ---------- o vendedor ----------
const VENDE = (m: Marca, es: boolean) => es ? `
TU PAPEL AHORA: eres quien vende ${cfg.marcas[m].nome} por WhatsApp, uno a uno, a dueños de negocios que ya probaron los 2 posts gratis.
- Mensajes cortos de WhatsApp (1 a 3 frases), naturales, sin parecer robot. Una pregunta por vez. Sin listas largas.
- Primero entiende: ¿qué le pareció la prueba? ¿quién hace hoy su Instagram? ¿qué le falta?
- Valor: 8 posts listos al mes con su marca, por ${precoTxt(m)}, sin permanencia, menos de lo que cobra cualquier community manager; listos 30 minutos después del pago; pide ajustes.
- Objeción de precio: compara con el costo de su tiempo y de un freelancer; NUNCA das descuento.
- Cuando quiera suscribirse: manda el enlace de la prueba (el botón "Suscribirme" está ahí): LINK_ASSINAR
- Si pide hablar con una persona, descuento, algo fuera de lo que sabes o se enoja: passar_para_humano true y dices que alguien del equipo sigue la conversación aquí mismo.
- Si dice que no le interesa: agradece, deja la puerta abierta, no insistas.` : `
TEU PAPEL AGORA: tu és quem vende o ${cfg.marcas[m].nome} pelo WhatsApp, no 1 a 1, pra donos de negócio que já fizeram o teste grátis de 2 posts.
- Mensagens curtas de WhatsApp (1 a 3 frases), naturais, sem cara de robô. Uma pergunta por vez. Nada de lista comprida.
- Primeiro entende: o que achou do teste? quem faz o Instagram hoje? o que está faltando?
- Valor: 8 posts prontos por mês com a marca dele, por ${precoTxt(m)}, sem fidelidade, mais barato que qualquer social media (freelancer cobra de R$ 500 a 1.500); prontos 30 minutos depois do pagamento; dá pra pedir ajuste.
- Objeção de preço: compara com o tempo dele e com o freelancer; NUNCA dá desconto.
- Quando ele quiser assinar: manda o link do teste (o botão "Assinar" está lá): LINK_ASSINAR
- Se pedir pra falar com uma pessoa, pedir desconto, algo fora do que tu sabes, ou se irritar: passar_para_humano true e diz que alguém da equipe continua a conversa aqui mesmo.
- Se disser que não tem interesse: agradece, deixa a porta aberta, não insiste.`

async function contextoVenda(cv: any) {
  const c = cv.cliente_id ? await db.um('clientes', { id: cv.cliente_id }) : null
  if (!c) return { c: null, texto: 'PESSOA: ainda não fez o teste (não achamos o WhatsApp dela no cadastro). Descobre o tipo de negócio e convida pro teste grátis de 2 posts no site da marca certa: salão/beleza → https://www.salaonofeed.com.br · restaurante/comida → https://www.pratonofeed.com.br · pet shop → https://www.patanofeed.com.br' }
  const posts = (await db.lista('posts', { cliente_id: c.id }, { ordem: 'criado_em' })).filter(p => p.status !== 'substituido').slice(0, 4)
  const x = c.contexto || {}
  return { c, texto: `CLIENTE: ${c.responsavel || '-'}, dono(a) de ${c.nome_negocio} (${c.cidade}${c.bairro ? ', ' + c.bairro : ''}). Situação: ${c.status}. Instagram: ${c.instagram ? '@' + c.instagram : 'não informou'}.
O que contou do negócio: serviços ${x.servicos || '-'}; carro-chefe ${x.carro_chefe || '-'}; tom ${x.tom || '-'}.
Os posts que ele recebeu no teste: ${posts.map(p => `"${String(p.titulo || '').replace(/\*/g, '')}"`).join(' e ') || '(nenhum ainda)'}.` }
}

export async function respondeVenda(cv: any) {
  const { c, texto } = await contextoVenda(cv)
  const m = ((c?.marca || cv.marca || 'salao') as Marca), es = emEspanhol(m)
  const link = c ? cfg.url(m, 'teste.html?c=' + c.codigo) : ''
  const msgs = await db.lista('wa_msgs', { conversa_id: cv.id }, { ordem: 'criado_em' })
  const historico = msgs.slice(-30).map(x => `${x.autor === 'cliente' ? 'CLIENTE' : x.autor === 'sistema' ? 'NÓS (mensagem automática)' : x.autor === 'dono' ? 'EQUIPE' : 'TU'}: ${x.texto}`).join('\n')
  const sistema = (es ? SABE_ES(m) : SABE(m)) + VENDE(m, es).replace('LINK_ASSINAR', link || '(ainda sem teste: convida pro teste no site)')
  const pedido = `${texto}\n\nCONVERSA NO WHATSAPP:\n${historico}\n\nResponde a(s) última(s) mensagem(ns) do cliente. Devolve SÓ este JSON:
{"mensagens":["1 ou 2 mensagens curtas, na ordem"],"passar_para_humano":false,"etapa":"interessado|duvida|objecao|quer_assinar|sem_interesse","resumo":"o que o cliente quer, em uma frase"}`
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY as string, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODELO, max_tokens: 1500, thinking: { type: 'between_tools' }, system: sistema, messages: [{ role: 'user', content: pedido }] }),
    signal: AbortSignal.timeout(45000),
  })
  const j = await r.json()
  if (!r.ok) throw new Error('IA ' + r.status)
  const txt = j.content.map((x: any) => x.text || '').join('')
  return JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1)) as { mensagens: string[]; passar_para_humano: boolean; etapa: string; resumo: string }
}

// depois que o cliente escreve (o webhook espera uns segundos pra juntar mensagens seguidas)
export async function atendeConversa(id: string) {
  // 15/10: o agente do WhatsApp (agente.ts) faz o funil inteiro; o vendedor antigo fica só de reserva
  try { const { atende } = await import('./agente'); return await atende(id) } catch (e: any) {
    await db.atualiza('wa_conversas', { id }, { modo: 'humano' })
    const cv = await db.um('wa_conversas', { id })
    avisaDono('WhatsApp (agente falhou), assume', `${cv?.nome || cv?.telefone}: ${String(e?.message || '').slice(0, 120)}`)
    return
  }
}
export async function atendeConversaAntigo(id: string) {
  const cv = await db.um('wa_conversas', { id })
  if (!cv || cv.modo !== 'ia' || cv.optout) return
  if ((cv.ia_respostas || 0) >= MAX_IA_VENDA) {
    await db.atualiza('wa_conversas', { id }, { modo: 'humano' })
    avisaDono('WhatsApp: conversa longa, assume', `${cv.nome || cv.telefone}: ${String(cv.ultima_msg || '').slice(0, 140)}`)
    return
  }
  try {
    const o = await respondeVenda(cv)
    for (const t of (o.mensagens || []).filter(Boolean).slice(0, 3)) await registraSaida(cv, 'ia', t, await enviaTexto(cv.telefone, t))
    await db.atualiza('wa_conversas', { id }, { ia_respostas: (cv.ia_respostas || 0) + 1, etapa: o.etapa || cv.etapa, ...(o.passar_para_humano ? { modo: 'humano' } : {}) })
    if (o.passar_para_humano) avisaDono('WhatsApp: cliente quer falar contigo', `${cv.nome || cv.telefone}: ${o.resumo || ''}`.slice(0, 200))
    else if (o.etapa === 'quer_assinar') avisaDono('WhatsApp: quer assinar 💰', `${cv.nome || cv.telefone}: ${o.resumo || ''}`.slice(0, 200), true)
  } catch (e: any) {
    await db.atualiza('wa_conversas', { id }, { modo: 'humano' })
    avisaDono('WhatsApp (IA falhou), assume', `${cv.nome || cv.telefone}: ${String(cv.ultima_msg || '').slice(0, 140)}`)
  }
}
