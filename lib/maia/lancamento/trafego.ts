// Maia, lançamento: quem chega pelo TRÁFEGO PAGO (19/11/2026). Anúncio de clique pro WhatsApp da escola (51 99505-4548)
// com a mensagem pronta "Quero a amostra grátis da Maia pra minha oficina". Antes disto, quem não estava na lista importada
// caía no plantão da IA do Deu Venda (que vendia o Deu Venda pra dono de oficina). Agora:
//   1. a mensagem pronta (ou o cartão do anúncio que fala da Maia) cria a pessoa no funil "Lançamento Maia", com o NICHO e a
//      ORIGEM (anúncio, clique, campanha, de onde veio) e a janela grátis de 72 h da conversa que começou num anúncio
//   2. a coleta já sabe o nicho: 3 perguntas curtas do ramo (sem perguntar o ramo de novo) e o material do ramo
//   3. a FILA: o limite de amostras por dia (MAIA_LANC_LIMITE_DIA, padrão 10). Fila cheia: a Maia diz o prazo de verdade
//   4. o ENCAIXE: nicho certo + material real (fotos ou Instagram). Vai no aviso pro time, que decide se produz
//   5. a LIGAÇÃO: quem testou a Maia escolhe um horário e o Rick recebe o aviso na hora
// Só com MAIA_LANC_TRAFEGO=1 (no teste local, sempre). Desligada, nada muda: quem não está na lista segue pro CRM.
import { maiaLocal, maiaDb as db } from '../db'
import { novoContato, variantes, salvaJson, salva, horaBR, diaBR, instanteBR, quandoFalado, evento, avisaGuto, primeiroNome } from './base'

export const trafegoLigado = () => process.env.MAIA_LANC_TRAFEGO === '1' || maiaLocal()
export const LIMITE_DIA = () => Math.max(1, +(process.env.MAIA_LANC_LIMITE_DIA || 10))

const sem = (s: any) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

// 19/11 (Guto): 3 nichos. Marcenaria saiu; qualquer outro ramo segue o caminho genérico (3 perguntas, sem nicho)
export type Nicho = 'serralheria' | 'estetica_auto' | 'oficina'
type Passo3 = 'cidade' | 'produtos' | 'como_vende'
type DefNicho = { nome: string; negocio: string; tua: string; re: RegExp; perguntas: Record<Passo3, string>; material: string; ig: string }

// a ordem importa: "estética automotiva" antes de "oficina" (as duas falam de carro)
export const NICHOS: Record<Nicho, DefNicho> = {
  estetica_auto: {
    nome: 'Estética automotiva', negocio: 'Estética automotiva', tua: 'tua estética automotiva',
    re: /estetica (automotiva|auto|de carros?|veicular)|lava[ -]?(jato|car|rapido)|polimento|vitrifica|detailing|higienizacao (de carro|automotiva|interna)|martelinho|envelopament|\bppf\b/,
    perguntas: {
      cidade: 'Pra começar: qual é o nome da tua estética automotiva e em que cidade vocês atendem?',
      produtos: 'Quais são os serviços carro-chefe aí? Polimento, vitrificação, higienização, lavagem detalhada... E qual dá mais lucro?',
      como_vende: 'E como o cliente agenda com vocês: horário marcado pelo WhatsApp, leva e traz...? Qual é o horário de atendimento?',
    },
    material: 'fotos de antes e depois dos carros e, se tiver, uns vídeos curtos do serviço sendo feito',
    ig: 'da tua estética',
  },
  oficina: {
    nome: 'Oficina mecânica', negocio: 'Oficina mecânica', tua: 'tua oficina',
    re: /oficina|mecanic|cambio|retifica|auto ?center|suspensao|injecao eletronica|embreagem|funilaria|auto ?eletrica|\bmotores\b/,
    perguntas: {
      cidade: 'Pra começar: qual é o nome da tua oficina e em que cidade vocês atendem?',
      produtos: 'Quais serviços são o carro-chefe aí (câmbio, retífica, suspensão, revisão...)? Trabalham com alguma marca ou tipo de carro em especial?',
      como_vende: 'E como o cliente chega até vocês: agenda pelo WhatsApp, traz o carro direto, pede orçamento por foto...? Qual é o horário de atendimento?',
    },
    material: 'fotos da oficina, dos carros no elevador e dos serviços prontos e, se tiver, uns vídeos curtos do dia a dia',
    ig: 'da tua oficina',
  },
  serralheria: {
    nome: 'Serralheria', negocio: 'Serralheria de portões automáticos e estruturas metálicas', tua: 'tua serralheria',
    re: /serralher|portao|portoes|estruturas? metalicas?|metalurgic|esquadria|corrimao|mezanino|galpoes|galpao|calheiro|\bgrades\b/,
    perguntas: {
      cidade: 'Pra começar: qual é o nome da tua serralheria e em que cidade vocês atendem?',
      produtos: 'O que vocês mais fazem? Portões automáticos, estruturas metálicas, coberturas, grades... E qual dá mais lucro?',
      como_vende: 'E como o cliente fecha com vocês: visita pra medir, orçamento por foto no WhatsApp...? Atendem obra de empresa ou só residência?',
    },
    material: 'fotos de obras prontas (portões automáticos, estruturas, o que tiver de mais bonito) e, se tiver, uns vídeos curtos de instalação ou do portão funcionando',
    ig: 'da tua serralheria',
  },
}
export const nichoDe = (texto: string): Nicho | null => {
  const s = sem(texto)
  for (const k of Object.keys(NICHOS) as Nicho[]) if (NICHOS[k].re.test(s)) return k
  return null
}
export const defNicho = (c: any): DefNicho | null => { const n = c?.coleta?.nicho; return n && (NICHOS as any)[n] ? (NICHOS as any)[n] : null }
export const doTrafego = (c: any) => !!c?.estado?.origem

// a mensagem pronta do anúncio: "Quero a amostra grátis da Maia pra minha oficina" (e as variações que a pessoa escreve)
export const ehPedidoAmostra = (t: string) => {
  const s = sem(t)
  return /\bamostras?\b/.test(s) && /\b(maia|gratis|gratuita|de graca)\b/.test(s)
}
// o cartão do anúncio (referral) fala da Maia
export type Referral = { adId?: string | null; ctwaClid?: string | null; headline?: string | null; body?: string | null; sourceUrl?: string | null } | null | undefined
const anuncioDaMaia = (r: Referral) => !!r && /\bmaia\b/i.test(`${r.headline || ''} ${r.body || ''}`)
export const querEntrar = (texto: string | null | undefined, r?: Referral) => trafegoLigado() && (ehPedidoAmostra(String(texto || '')) || anuncioDaMaia(r))

export function origemDe(r: Referral, agora = new Date()) {
  const em = agora.toISOString()
  return {
    canal: r?.adId ? 'anuncio' : 'mensagem_pronta',
    fonte: r?.sourceUrl ? (/instagram/i.test(r.sourceUrl) ? 'instagram' : 'facebook') : null,
    anuncio_id: r?.adId || null, ctwa_clid: r?.ctwaClid || null,
    titulo: r?.headline ? String(r.headline).slice(0, 120) : null, link: r?.sourceUrl || null,
    chegou_em: em,
    // conversa que começa num anúncio de clique pro WhatsApp: 72 h sem cobrança da Meta (a de texto livre segue sendo 24 h)
    janela_gratis_ate: r?.adId ? new Date(agora.getTime() + 72 * 3600e3).toISOString() : null,
  }
}

// fora dos 3 nichos: o ramo que a pessoa já escreveu na mensagem pronta ("pra minha marcenaria" → "marcenaria"), pra não perguntar de novo
export function ramoDito(t: any): string | null {
  const m = String(t || '').match(/\b(?:pra|para|pro|pros|pras) (?:a |o )?(?:minha|meu|nossa|nosso) ([^.!?\n]{3,60})/i)
  const r = m ? m[1].trim().replace(/[\s,;]+$/, '') : ''
  return r && !/^(neg[oó]cio|empresa|loja)$/i.test(r) ? r : null
}
// quem não está na lista e mandou a mensagem pronta (ou veio de anúncio da Maia): entra no funil
export async function novoDoAnuncio(m: { telefone: string; nome?: string | null; texto?: string | null; referral?: Referral }) {
  if (!querEntrar(m.texto, m.referral)) return null
  const tel = variantes(m.telefone)[0]
  if (!tel) return null
  const nicho = nichoDe([m.texto, m.referral?.headline, m.referral?.body].join(' '))
  const origem = origemDe(m.referral)
  const def = nicho ? NICHOS[nicho] : null
  try {
    const c = await novoContato({
      telefone: tel, wa_id: tel, nome: String(m.nome || '').slice(0, 60) || null, versao: 'contato', remessa: null,
      ramo: def?.nome || 'Outro (tráfego)', motivo: `tráfego: ${origem.canal === 'anuncio' ? 'anúncio ' + origem.anuncio_id : 'mensagem pronta'}`.slice(0, 200),
      coleta: nicho ? { nicho, negocio: def!.negocio } : (ramoDito(m.texto) ? { negocio: ramoDito(m.texto) } : {}),
      estado: { origem },
    })
    await evento('lanc_trafego_novo', { contato: c.id, nicho: nicho || 'outro', canal: origem.canal, anuncio: origem.anuncio_id })
    return c
  } catch { return null }   // o telefone entrou junto (duas mensagens no mesmo segundo): o próximo passo acha
}

// quem JÁ está na lista e clicou no anúncio: ganha o nicho e a origem, sem perder nada do que tinha
export async function marcaPedido(c: any, texto: string, r?: Referral) {
  const parte: any = {}
  if (!c.coleta?.nicho && !c.coleta?.negocio) {
    const n = nichoDe([texto, r?.headline, r?.body].join(' '))
    if (n) await salvaJson(c, 'coleta', { nicho: n, negocio: NICHOS[n].negocio })
  }
  if (!c.estado?.origem && (r?.adId || ehPedidoAmostra(texto))) parte.origem = origemDe(r)
  if (Object.keys(parte).length) await salvaJson(c, 'estado', parte)
}

// ---------- a coleta por nicho (no máximo 3 perguntas antes do material) ----------
export const PASSOS_NICHO: Passo3[] = ['cidade', 'produtos', 'como_vende']
export const PASSOS_TRAFEGO = ['negocio', 'cidade', 'produtos'] as const   // tráfego sem nicho reconhecido
export const PERGUNTAS_TRAFEGO: Record<string, string> = {
  negocio: 'Pra começar: o que vocês vendem ou fazem, e pra quem?',
  cidade: 'Qual é o nome do teu negócio e em que cidade vocês atendem?',
  produtos: 'Me diz 2 ou 3 produtos ou serviços que mais saem aí (com o preço, se tiver).',
}
export function passosDe(c: any): readonly string[] | null {
  if (defNicho(c)) return PASSOS_NICHO
  if (doTrafego(c)) return PASSOS_TRAFEGO
  return null   // a lista importada segue com as perguntas de sempre
}
export function perguntaNicho(p: string, c: any): string | null {
  const d = defNicho(c)
  if (d && (d.perguntas as any)[p]) return (d.perguntas as any)[p]
  if (doTrafego(c) && PERGUNTAS_TRAFEGO[p]) return PERGUNTAS_TRAFEGO[p]
  return null
}
export function pedeMaterialNicho(c: any, ig: string | null): string | null {
  const d = defNicho(c)
  if (!d) return null
  return ig
    ? `Agora o material: me manda de 3 a 5 ${d.material}, do celular mesmo. Se não tiver à mão, é só responder "pega do Instagram" que a gente monta a amostra com o que está no ${ig}.`
    : `Agora o material: me manda de 3 a 5 ${d.material}, do celular mesmo. Se não tiver à mão, é só me mandar o @ do Instagram ${d.ig} que a gente monta a amostra com o que está lá.`
}
// a 1ª mensagem: a Maia se apresenta (quem veio do anúncio ainda não conhece ela) e diz o que vem na amostra. Sem preço
export function introTrafego(c: any) {
  const d = defNicho(c)
  return `Oi${primeiroNome(c.nome) ? ', ' + primeiroNome(c.nome) : ''}! Aqui é a Maia, a inteligência artificial de marketing da Carreira no Digital. Vou montar a amostra grátis pra ${d ? d.tua : 'teu negócio'}: 2 anúncios, 1 vídeo com voz, 9 posts e uma página onde tu me testa atendendo um cliente teu. São no máximo 3 perguntas rápidas e depois umas fotos (ou só o teu Instagram).`
}

// ---------- a fila e o encaixe ----------
// quantas amostras estão na frente (material recebido ou em produção, ainda sem aprovar), fora a própria pessoa
export async function filaNaFrente(c: any) {
  const todos = await db.lista('lanc_contatos')
  return todos.filter((x: any) => x.id !== c.id && ['material_recebido', 'em_producao'].includes(x.etapa) && !x.amostra?.aprovada_em).length
}
// em quantos dias sai: até o limite, amanhã (1); passou, 2 dias; e assim por diante
export const diasDeFila = (naFrente: number, limite = LIMITE_DIA()) => 1 + Math.floor(naFrente / limite)
export function materialRecebidoTrafego(dias: number, soInstagram: boolean) {
  const com = soInstagram ? 'com o que está no teu Instagram' : 'com o teu material'
  const pecas = '2 anúncios, 1 vídeo com voz, 9 posts e a página pra tu me testar atendendo um cliente teu'
  return dias <= 1
    ? `Material recebido! Em até 24 horas eu te mando aqui a tua amostra, feita ${com}: ${pecas}.`
    : `Material recebido! Hoje a fila de amostras está cheia, então a tua fica pronta em até ${dias * 24} horas. Eu te mando aqui, feita ${com}: ${pecas}.`
}
export function encaixe(c: any, n: { fotos: number; videos: number }) {
  const motivos: string[] = []
  if (!defNicho(c)) motivos.push('fora dos 3 nichos do anúncio')
  if (!n.fotos && !n.videos && !c.coleta?.material_instagram) motivos.push('sem material')
  if (!n.fotos && !n.videos && c.coleta?.material_instagram) motivos.push('só o Instagram: conferir se tem fotos reais antes de produzir')
  const ok = !!defNicho(c) && (n.fotos >= 3 || n.videos > 0 || !!c.coleta?.material_instagram)
  return { ok, texto: ok && !motivos.length ? 'bom (nicho certo e material real)' : motivos.join('; ') || 'conferir' }
}

// ---------- a ligação com o Rick, depois do teste ----------
// os horários: de hora em hora, a partir de 1 h depois de agora, das 9h às 19h, de segunda a sábado. Fim do dia: amanhã
export function horariosLigacao(agora = new Date()): string[] {
  const out: string[] = []
  let t = agora.getTime() + 60 * 60e3
  for (let i = 0; i < 72 && out.length < 3; i++, t += 60 * 60e3) {
    const d = new Date(t), h = horaBR(d)
    const dia = diaBR(d), semana = new Date(dia + 'T12:00:00Z').getUTCDay()
    if (h < 9 || h > 19 || semana === 0) continue
    if (out.length && h - horaBR(new Date(out[out.length - 1])) < 2 && diaBR(new Date(out[out.length - 1])) === dia) continue
    out.push(instanteBR(dia, h))
  }
  return out
}
const hhmm = (iso: string) => `${horaBR(new Date(iso))}h`
export function ofereceLigacaoTexto(slots: string[], agora = new Date()) {
  const mesmoDia = slots.every(s => diaBR(new Date(s)) === diaBR(new Date(slots[0])))
  const lista = mesmoDia ? `${quandoFalado(slots[0], agora).replace(/, às \d+h$/, '')}: ${slots.map(hhmm).join(', ').replace(/, ([^,]*)$/, ' ou $1')}` : slots.map(s => quandoFalado(s, agora)).join('; ')
  return `Quer ver isso rodando no teu negócio? O Rick, especialista da escola, te liga e mostra em 15 minutos como fica, sem compromisso. Qual horário é melhor? ${lista}. Se preferir outro, me diz.`
}
export async function ofereceLigacao(c: any, agora = new Date()) {
  const slots = horariosLigacao(agora)
  await salvaJson(c, 'estado', { ligacao: { oferecida_em: agora.toISOString(), slots } })
  await evento('lanc_ligacao_oferecida', { contato: c.id })
  return ofereceLigacaoTexto(slots, agora)
}
// a resposta à oferta: um horário (dos oferecidos ou outro, das 8h às 20h), "não", ou outra coisa (segue o fluxo normal)
export function leHoraLigacao(texto: string, slots: string[], agora = new Date()): string | 'nao' | null {
  const s = sem(texto)
  if (/^(nao|agora nao|nao precisa|nao quero|depois|outra hora)\b/.test(s)) return 'nao'
  const m = s.match(/\b([01]?\d|2[0-3])\s*(h|:|hs|horas)\b|\bas ([01]?\d|2[0-3])\b|^([01]?\d|2[0-3])$/)
  let h = m ? +(m[1] ?? m[3] ?? m[4]) : null
  if (h == null) {
    if (/^(pode ser|qualquer|tanto faz|sim|bora|pode|ok|beleza)\b/.test(s) && slots.length) return slots[0]
    if (/primeir/.test(s) && slots[0]) return slots[0]
    if (/segund/.test(s) && slots[1]) return slots[1]
    if (/(terceir|ultim)/.test(s) && slots[2]) return slots[2]
    return null
  }
  if (h >= 1 && h <= 7) h += 12
  if (h < 8 || h > 20) return null
  const doSlot = slots.find(x => horaBR(new Date(x)) === h && (!/amanha/.test(s) || diaBR(new Date(x)) > diaBR(agora)))
  if (doSlot) return doSlot
  let dia = diaBR(agora)
  if (/amanha/.test(s) || h <= horaBR(agora)) { const d = new Date(Date.parse(dia + 'T12:00:00Z') + 24 * 3600e3); dia = d.toISOString().slice(0, 10) }
  return instanteBR(dia, h)
}
// devolve a resposta tratada, ou null quando a mensagem não é sobre o horário (aí segue o fluxo de sempre)
export async function respondeLigacao(c: any, texto: string, rotulo: string, agora = new Date()): Promise<string | null> {
  const lg = c.estado?.ligacao
  if (!lg?.oferecida_em || lg.hora || lg.recusou_em || !texto) return null
  if (agora.getTime() - Date.parse(lg.oferecida_em) > 48 * 3600e3) return null
  const r = leHoraLigacao(texto, lg.slots || [], agora)
  if (!r) return null
  if (r === 'nao') {
    await salvaJson(c, 'estado', { ligacao: { ...lg, recusou_em: agora.toISOString() } })
    await evento('lanc_ligacao_recusada', { contato: c.id })
    return 'Tranquilo! Se quiser conversar depois, é só me chamar aqui.'
  }
  await salvaJson(c, 'estado', { ligacao: { ...lg, hora: r, marcada_em: agora.toISOString() } })
  await salva(c, { etapa: ['amostra_entregue', 'testou'].includes(c.etapa) ? 'fechamento' : c.etapa })
  await evento('lanc_ligacao_marcada', { contato: c.id, hora: r })
  await avisaGuto(`Rick: LIGAR ${quandoFalado(r, agora)}`, `${rotulo} testou a Maia e marcou a ligação pra ${quandoFalado(r, agora)}. O telefone está no cartão da tela do lançamento (fila "Rick: ligar").`, true)
  return `Combinado! O Rick, da Carreira no Digital, te liga ${quandoFalado(r, agora)}. Se precisar mudar, é só me dizer aqui.`
}

// ---------- o que vai pro CRM e pra Meta (nunca derruba a conversa) ----------
// a nota no lead do CRM (o lead nasce pelo anúncio em lib/ctwa.ts): "quem atende é a Maia, não ligar antes da amostra"
export async function notaNoCrm(c: any) {
  if (maiaLocal() || !c?.telefone) return
  try {
    const { supabaseAdmin: sb } = await import('@/lib/supabase-admin')
    const suf = String(c.telefone).slice(-8)
    const { data: lead } = await sb.from('leads').select('id').ilike('whatsapp', `%${suf}%`).order('criado_em', { ascending: false }).limit(1).maybeSingle()
    if (!lead) return
    const d = defNicho(c)
    await sb.from('lead_andamentos').insert({ lead_id: lead.id, tipo: 'observacao', observacao: `Maia: pediu a amostra grátis pelo anúncio${d ? ` (${d.nome})` : ''}. Quem atende é a Maia, no quadro "Lançamento Maia". O Rick entra depois do teste.` })
  } catch { /* melhor esforço */ }
}
// o sinal pra Meta otimizar o anúncio: material recebido = lead qualificado (QualifiedLead, pelo clique do anúncio)
export async function sinalMeta(c: any, evento_: 'QualifiedLead' | 'Purchase', valor?: number) {
  const clid = c?.estado?.origem?.ctwa_clid
  if (maiaLocal() || !clid) return
  try {
    const { supabaseAdmin: sb } = await import('@/lib/supabase-admin')
    const suf = String(c.telefone).slice(-8)
    const { data: lead } = await sb.from('leads').select('id').ilike('whatsapp', `%${suf}%`).order('criado_em', { ascending: false }).limit(1).maybeSingle()
    if (!lead) return
    const { eventoMensagens } = await import('@/lib/ctwa')
    await eventoMensagens(evento_, { leadId: lead.id, ctwaClid: clid, telefone: c.telefone, codigoTurma: 'maia', valor: valor ?? null, eventId: `${evento_}-maia-${c.id}` })
  } catch { /* melhor esforço */ }
}
// os nomes da campanha, do conjunto e do anúncio (a API de anúncios), uma vez por pessoa, fora do webhook
export async function completaOrigem(c: any) {
  const o = c?.estado?.origem
  if (!o?.anuncio_id || o.nomes_em || maiaLocal()) return
  try {
    const { nomesDoAnuncio } = await import('@/lib/ctwa')
    const n = await nomesDoAnuncio(o.anuncio_id)
    await salvaJson(c, 'estado', { origem: { ...o, ...n, nomes_em: new Date().toISOString() } })
  } catch { /* melhor esforço */ }
}

// ---------- a medição: por nicho e por anúncio ----------
const PASSOU = (c: any, e: string, ORDEM: Record<string, number>) => ORDEM[c.etapa] >= ORDEM[e] && ORDEM[c.etapa] <= ORDEM.pago
export function funilTrafego(todos: any[], ORDEM: Record<string, number>) {
  const linha = () => ({ conversas: 0, material: 0, entregue: 0, testou: 0, ligacao: 0, fechamento: 0, pago: 0 })
  const porNicho: Record<string, any> = {}, porAnuncio: Record<string, any> = {}
  for (const c of todos.filter(doTrafego)) {
    const o = c.estado.origem
    const nicho = defNicho(c)?.nome || 'Outro'
    const anuncio = o.anuncio || o.titulo || (o.anuncio_id ? 'anúncio ' + o.anuncio_id : 'sem anúncio (mensagem pronta)')
    const chave = `${o.campanha ? o.campanha + ' › ' : ''}${anuncio}`
    for (const [mapa, k] of [[porNicho, nicho], [porAnuncio, chave]] as const) {
      const l = (mapa as any)[k] ||= linha()
      l.conversas++
      if (PASSOU(c, 'material_recebido', ORDEM)) l.material++
      if (c.entregue_em) l.entregue++
      if (c.testou_em) l.testou++
      if (c.estado?.ligacao?.hora) l.ligacao++
      if (PASSOU(c, 'fechamento', ORDEM)) l.fechamento++
      if (c.etapa === 'pago') l.pago++
    }
  }
  return { por_nicho: porNicho, por_anuncio: porAnuncio, limite_dia: LIMITE_DIA(), ligado: trafegoLigado() }
}
