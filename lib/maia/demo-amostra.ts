// Maia: a amostra da demonstração grátis (06/11). O plano do teste no tráfego: o funil É a demonstração.
//   - os números REAIS da campanha do teste (conta MAIA_DEMO_CONTA, campanhas com "MAIA DEMO" no nome), em cache por umas horas
//   - as fotos e o vídeo do lead viram um pedido de amostra: até 10 por semana (MAIA_DEMO_LIMITE; a equipe revisa cada uma),
//     passou disso entra na fila com a data certa. Foto ruim: a Maia pede outra e explica como tirar.
//   - a peça sai pela oficina (o mesmo caminho do pecas.ts), cai no painel pra EQUIPE aprovar e vai pro lead pelo número do Oito
//   - a retomada única de 24 h e a fila das semanas seguintes (rotina de hora em hora, rotina.ts)
// O pedido mora num negócio da Maia com contexto.demo (status 'pausado' e sem dono_whatsapp): as peças, as mídias e as tarefas
// usam as tabelas que já existem, e nenhuma rotina de cliente (retomada, relatório, métricas) mexe nele.
import crypto from 'node:crypto'
import { oitoDb as odb } from '@/lib/oito/db'
import { enviaTexto, enviaImagem, enviaVideo, enviaModelo, registraSaida, janelaAberta } from '@/lib/oito/wa'
import { maiaDb as db, maiaLocal } from './db'
import { avisaEquipe } from './canal'
import { emJson } from './ia'
import { hojeBR, isoBR } from '@/lib/periodos'

export const LIMITE_SEMANA = () => Math.max(1, +(process.env.MAIA_DEMO_LIMITE || 10))
const CUSTO_MAX = () => +(process.env.MAIA_DEMO_CUSTO_MAX || 15)
// o modelo aprovado no número do Oito pra chamar o lead fora das 24 h (o mesmo que chama os donos)
const MODELO_LEAD = () => process.env.MAIA_DEMO_MODELO || process.env.MAIA_MODELO_DONO || 'maia_novidades'

export const TEXTO_RETOMADA = 'Tu sumiu, então eu voltei 😄 Isso que eu acabei de fazer contigo, eu faço com cada cliente teu que para de responder.'

export const rs = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const primeiro = (s: any) => { const p = String(s || '').trim().split(/\s+/)[0] || ''; return /^\d/.test(p) ? '' : p }
const horaBR = (d = new Date()) => (d.getUTCHours() + 21) % 24

// ---------- os números reais da campanha do teste ----------
type Numeros = { gasto: number; conversas: number; custo: number | null }
export type NumerosDemo = { total: Numeros | null; semana: Numeros | null; em: string; erro?: string }
const HORAS_CACHE = 3
let cache: NumerosDemo | null = null
const fresco = (n: NumerosDemo | null) => !!n && Date.now() - Date.parse(n.em) < HORAS_CACHE * 3600e3
const r2 = (n: number) => Math.round(n * 100) / 100
const conta = (gasto: number, conversas: number): Numeros => ({ gasto: r2(gasto), conversas, custo: conversas ? r2(gasto / conversas) : null })

async function leInsights(params: Record<string, string>): Promise<Numeros> {
  const { leMeta, contaAct } = await import('./meta')
  const j = await leMeta(`${contaAct(process.env.MAIA_DEMO_CONTA as string)}/insights`, {
    level: 'account', fields: 'spend,actions', filtering: JSON.stringify([{ field: 'campaign.name', operator: 'CONTAIN', value: 'MAIA DEMO' }]), ...params,
  })
  const d = (j.data || [])[0]
  if (!d) return conta(0, 0)
  const conv = (d.actions || []).find((a: any) => a.action_type === 'onsite_conversion.messaging_conversation_started_7d')
  return conta(Number(d.spend || 0), Number(conv?.value || 0))
}

// total (desde o começo da campanha) e últimos 7 dias. Sem conta configurada ou com erro: null (e aí nenhum número aparece)
export async function numerosDemo(): Promise<NumerosDemo> {
  if (fresco(cache)) return cache!
  const agora = new Date().toISOString()
  // teste local: MAIA_DEMO_TESTE_NUMEROS='{"total":{"gasto":120,"conversas":16},"semana":{"gasto":60,"conversas":9}}'
  if (maiaLocal() && process.env.MAIA_DEMO_TESTE_NUMEROS) {
    const t = JSON.parse(process.env.MAIA_DEMO_TESTE_NUMEROS)
    return { total: t.total ? conta(t.total.gasto, t.total.conversas) : null, semana: t.semana ? conta(t.semana.gasto, t.semana.conversas) : null, em: agora }
  }
  if (!process.env.MAIA_DEMO_CONTA) return (cache = { total: null, semana: null, em: agora })
  // o que outra instância já leu (maia_eventos 'demo_numeros', uma linha só)
  const ev = await db.um('eventos', { tipo: 'demo_numeros' }).catch(() => null)
  if (ev && fresco(ev.detalhe)) return (cache = ev.detalhe as NumerosDemo)
  let n: NumerosDemo
  try {
    const hoje = hojeBR(), semana = isoBR(new Date(Date.now() - 6 * 86400e3))
    const [total, sem] = await Promise.all([leInsights({ date_preset: 'maximum' }), leInsights({ time_range: JSON.stringify({ since: semana, until: hoje }) })])
    n = { total, semana: sem, em: agora }
  } catch (e: any) {
    // deu erro: tenta de novo em meia hora (e até lá, sem número)
    n = { total: null, semana: null, em: new Date(Date.now() - (HORAS_CACHE - 0.5) * 3600e3).toISOString(), erro: String(e?.message || e).slice(0, 200) }
  }
  cache = n
  try { if (ev) await db.atualiza('eventos', { id: ev.id }, { detalhe: n }); else await db.insere('eventos', { tipo: 'demo_numeros', negocio_id: null, detalhe: n }) } catch { /* fica só na memória */ }
  return n
}

// a primeira resposta, em segundos e sem IA: o número só aparece se for real e bom (até R$ 15 por conversa)
export async function primeiraMensagem(origem: string | null | undefined) {
  const n = await numerosDemo().catch(() => null)
  const t = n?.total
  const custo = t && t.conversas > 0 && t.custo != null && t.custo <= CUSTO_MAX() ? t.custo : null
  const semConv = n?.semana?.conversas || 0
  if (origem === 'site') return `Oi! Eu sou a Maia, uma IA. Eu faço o marketing de negócio local: crio os anúncios, atendo os clientes no WhatsApp e conto as vendas.${custo != null ? ` No anúncio que eu tô rodando agora, cada conversa custou ${rs(custo)} até aqui.` : ''} Quer ver o que eu faria pelo teu negócio?`
  const dado = custo != null ? ` Até agora cada conversa custou ${rs(custo)}.` : semConv >= 10 ? ` Essa semana ele já trouxe ${semConv} conversas.` : ''
  return `Oi! Eu sou a Maia, uma IA. Esse anúncio que te trouxe aqui fui eu que fiz: roteiro, edição e campanha.${dado} Quer ver o que eu faria pelo teu negócio?`
}

// o bloco de números reais que vai pra IA na proposta (nunca exemplo)
export async function blocoNumeros() {
  const n = await numerosDemo().catch(() => null)
  const s = n?.semana, t = n?.total
  const desde = new Date(Date.now() - 7 * 86400e3).toISOString()
  const cvs = await odb.lista('wa_conversas', { fase: 'maia' }).catch(() => [] as any[])
  const conversas = cvs.filter(c => !c.simulado && (c.rascunho?.maia?.inicio || c.criado_em) >= desde).length
  const amostras = (await negociosDemo().catch(() => [] as any[])).filter(x => !x.contexto.demo.simulado && x.contexto.demo.pedido_em >= desde).length
  const camp = s && s.gasto > 0
    ? `Campanha "MAIA DEMO" (a que trouxe ele), últimos 7 dias: ${rs(s.gasto)} investidos, ${s.conversas} conversas iniciadas${s.custo != null ? `, ${rs(s.custo)} por conversa` : ''}.`
    : 'Campanha: sem número agora (não fala de número da campanha).'
  // a primeira mensagem usa o total desde o começo; a semana é outro recorte. Os dois são verdade: a IA não "corrige" um pelo outro
  const tot = t && t.conversas > 0 && t.custo != null && t.custo <= CUSTO_MAX() ? `\nDesde o começo da campanha: ${rs(t.gasto)}, ${t.conversas} conversas, ${rs(t.custo)} por conversa (é o número da primeira mensagem; está certo, não corrige).` : ''
  return `${camp}${tot}\nDemonstração, últimos 7 dias: ${conversas} donos de negócio conversaram com a Maia e ${amostras} receberam ou vão receber uma amostra.`
}

// ---------- a semana das amostras (segunda a domingo, horário de Brasília) ----------
const somaDias = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
export function segundaDe(d = new Date()) { const dia = isoBR(d), dow = new Date(dia + 'T12:00:00Z').getUTCDay(); return somaDias(dia, -((dow + 6) % 7)) }
export const diaTxt = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC' })

export const ehDemo = (n: any) => !!n?.contexto?.demo
export async function negociosDemo() { return (await db.lista('negocios')).filter(ehDemo) }

export async function vagasDaSemana(semana = segundaDe()) {
  const usadas = (await negociosDemo()).filter(n => n.contexto.demo.semana === semana).length
  return { semana, usadas, limite: LIMITE_SEMANA() }
}
// a semana com vaga (esta, se ainda tiver) e o dia em que a amostra chega
export async function proximaVaga() {
  const ns = await negociosDemo(), lim = LIMITE_SEMANA()
  let s = segundaDe()
  for (let i = 0; i < 52; i++, s = somaDias(s, 7)) {
    if (ns.filter(x => x.contexto.demo.semana === s).length < lim) return { semana: s, agora: i === 0, entrega: i === 0 ? somaDias(hojeBR(), 1) : somaDias(s, 1) }
  }
  return { semana: s, agora: false, entrega: somaDias(s, 1) }
}

// ---------- a oficina está de pé? (ela pergunta a fila a cada 5 s; o GET da oficina marca aqui) ----------
let ultimaMarca = 0
export async function marcaOficinaViva() {
  if (Date.now() - ultimaMarca < 60e3) return
  ultimaMarca = Date.now()
  const ev = await db.um('eventos', { tipo: 'oficina_viva' })
  const detalhe = { em: new Date().toISOString() }
  if (ev) await db.atualiza('eventos', { id: ev.id }, { detalhe }); else await db.insere('eventos', { tipo: 'oficina_viva', negocio_id: null, detalhe })
}
export async function oficinaViva() {
  if (process.env.MAIA_OFICINA_LIGADA === '1') return true
  const ev = await db.um('eventos', { tipo: 'oficina_viva' }).catch(() => null)
  return !!ev?.detalhe?.em && Date.now() - Date.parse(ev.detalhe.em) < 10 * 60e3
}

// ---------- o estado da demonstração na conversa do Oito (wa_conversas.rascunho.maia) ----------
export async function salvaMaia(cv_id: string, campos: Record<string, any>) {
  const atual: any = await odb.um('wa_conversas', { id: cv_id })
  const r = atual?.rascunho || {}
  const maia = { ...(r.maia || {}), ...campos }
  await odb.atualiza('wa_conversas', { id: cv_id }, { rascunho: { ...r, maia } })
  return maia
}

async function fala(cv: any, texto: string) { await registraSaida(cv, 'ia', texto, await enviaTexto(cv.telefone, texto)) }

// ---------- as fotos que chegaram: servem pra anúncio? ----------
type Vista = { path: string; mime: string; serve: boolean; nota: number; descricao: string; problema: string }
async function olhaFotos(fotos: { path: string; mime: string }[], sobre: string): Promise<Vista[]> {
  if (!fotos.length) return []
  try {
    const imgs = await Promise.all(fotos.slice(0, 4).map(async f => ({ b64: (await odb.baixa(f.path)).toString('base64'), mime: /png/.test(f.mime) ? 'image/png' : /webp/.test(f.mime) ? 'image/webp' : 'image/jpeg' })))
    const r = await emJson<{ fotos: { serve: boolean; nota: number; descricao: string; problema: string }[] }>(
      'Tu és a Maia, uma IA de marketing. Tu olhas fotos que donos de pequenos negócios mandam pra virar anúncio.',
      `O negócio: ${sobre || 'não sei ainda'}.\nPra cada foto, na ordem: serve pra anúncio? Serve quando o produto (ou o serviço, o lugar, o resultado) aparece bem: nítida, com luz, ocupando boa parte da foto. NÃO serve: escura, tremida, produto pequeno demais, print de tela, documento, foto de outra empresa.\nDevolve {"fotos":[{"serve":true,"nota":0-10,"descricao":"o que aparece, até 12 palavras","problema":"se não serve, o motivo em até 5 palavras, completando a frase \"a foto ficou...\" (ex.: escura, tremida, com o produto pequeno)"}]}`,
      imgs)
    return fotos.slice(0, 4).map((f, i) => ({ ...f, serve: r.fotos?.[i]?.serve !== false, nota: +(r.fotos?.[i]?.nota ?? 5), descricao: String(r.fotos?.[i]?.descricao || ''), problema: String(r.fotos?.[i]?.problema || '').replace(/^(ficou|está|esta|tá)\s+/i, '').replace(/[.]+$/, '') }))
  } catch {
    // sem a IA não trava o lead: a equipe confere na aprovação
    return fotos.map(f => ({ ...f, serve: true, nota: 5, descricao: '', problema: '' }))
  }
}

const DICA_FOTO = 'Dica: perto de uma janela, com a luz de frente pro produto, o celular parado e o produto ocupando quase a foto toda, com o fundo limpo.'

// chamada no começo de cada resposta da demo: se chegou foto ou vídeo novo, quem responde é isto (mensagens fixas).
// Devolve as mensagens que saíram, ou null quando não tinha mídia nova (aí a IA responde normalmente).
export async function midiasNovas(cv: any): Promise<string[] | null> {
  const r = cv.rascunho || {}, mx = r.maia || {}
  const todas: { path: string; mime: string }[] = r.midias || []
  const desde = mx.vistas ?? mx.base ?? 0
  const novas = todas.slice(desde)
  if (!novas.length) return null
  await salvaMaia(cv.id, { vistas: todas.length })   // marca já, pra outra resposta não processar de novo
  let neg: any = mx.amostra ? await db.um('negocios', { id: mx.amostra }) : null
  if (neg && ['enviada', 'aguardando_janela'].includes(neg.contexto?.demo?.status)) return null   // a amostra já foi: a IA segue a conversa
  const fotos = novas.filter(m => /^image\//.test(m.mime)), videos = novas.filter(m => /^video\//.test(m.mime))
  const ent = mx.entrevista || {}
  const vistas = await olhaFotos(fotos, [ent.negocio, ent.produto, ent.nicho, mx.resumo].filter(Boolean).join(', '))
  const boas = [...(mx.fotos_boas || []), ...vistas.filter(v => v.serve)]
  const ruins = vistas.filter(v => !v.serve)
  const vids = [...(mx.videos || []), ...videos]
  await salvaMaia(cv.id, { fotos_boas: boas, videos: vids })
  const msgs: string[] = []

  // já tem pedido (em produção ou na fila): o que chegar depois entra junto
  if (neg) {
    if (videos.length && !neg.contexto.demo.video) { await juntaMidias(neg, [], [videos[0]]); msgs.push('Vídeo recebido ✅ Vai junto na tua amostra.') }
    else if (vistas.some(v => v.serve)) msgs.push('Recebi ✅ Já tá com a equipe junto com as outras.')
    else if (ruins.length) msgs.push(`Essa ficou ${ruins[0].problema || 'difícil de usar'}, mas tudo bem: com as que tu já mandou dá pra fazer.`)
    for (const t of msgs) await fala(cv, t)
    return msgs
  }

  const basta = boas.length >= 2 || (boas.length >= 1 && vids.length >= 1)
  if (!basta) {
    if (ruins.length) msgs.push(`${ruins.length > 1 ? 'Essas fotos ficaram' : 'Essa foto ficou'} ${ruins[0].problema || 'difícil de usar num anúncio'}. Me manda outra? ${DICA_FOTO}`)
    else if (boas.length === 1) msgs.push('Recebi ✅ Me manda mais uma foto (ou o vídeo curto) que eu já começo.')
    else if (vids.length) msgs.push('Recebi o vídeo ✅ Me manda também uma foto do produto que eu já começo.')
    for (const t of msgs) await fala(cv, t)
    return msgs.length ? msgs : null
  }

  // basta: o pedido de amostra (com vaga nesta semana, ou na fila com a data certa)
  const vaga = await proximaVaga()
  neg = await criaPedido(cv, mx, boas, vids.slice(0, 1), vaga)
  const temVideo = vids.length > 0
  const peca = temVideo ? 'com arte, vídeo editado e texto' : 'com arte e texto'
  // sem a cidade o gancho sai sem a região: pergunta antes de mandar pra oficina (cidadeChegou continua quando ele responder)
  if (neg.contexto.demo.status === 'falta_cidade') msgs.push('Recebi ✅ Só me diz uma coisa: o teu negócio fica em que cidade? Ela vai no anúncio.')
  else if (vaga.agora) msgs.push(`Recebi ✅ Amanhã te devolvo o anúncio pronto, ${peca}, pro teu negócio. A equipe da Carreira no Digital revisa antes de chegar em ti.`)
  else msgs.push(`Recebi ✅ Essa semana a equipe já tá revisando as ${LIMITE_SEMANA()} amostras que dá pra fazer com cuidado. A tua entrou na fila e chega ${diaTxt(vaga.entrega)}: o anúncio pronto, ${peca}.`)
  if (ruins.length) msgs.push(`(Uma das fotos ficou ${ruins[0].problema || 'ruim'}, então usei as outras.)`)
  if (neg.contexto.demo.status !== 'falta_cidade') msgs.push('Enquanto isso, quer ver como eu atenderia um cliente teu? Finge que tu é um cliente que viu o anúncio e me manda uma mensagem.')
  for (const t of msgs) await fala(cv, t)
  await odb.atualiza('wa_conversas', { id: cv.id }, { etapa: 'amostra_pedida' })
  return msgs
}

// copia as mídias da conversa do Oito pro armazenamento da Maia (pasta do negócio) e cria as linhas de maia_midias
async function copiaMidia(neg: any, m: { path: string; mime: string; descricao?: string; nota?: number }) {
  const buf = await odb.baixa(m.path)
  const video = /^video\//.test(m.mime)
  const ext = video ? (/quicktime/.test(m.mime) ? 'mov' : /3gpp/.test(m.mime) ? '3gp' : 'mp4') : /png/.test(m.mime) ? 'png' : /webp/.test(m.mime) ? 'webp' : 'jpg'
  const caminho = await db.sobe(`${neg.id}/midias/${crypto.randomUUID().slice(0, 8)}.${ext}`, buf, m.mime)
  return db.insere('midias', { negocio_id: neg.id, tipo: video ? 'video' : 'foto', path: caminho, mime: m.mime, descricao: m.descricao || (video ? 'vídeo curto que o dono mandou' : null) })
}

async function criaPedido(cv: any, mx: any, boas: Vista[], vids: { path: string; mime: string }[], vaga: { semana: string; agora: boolean; entrega: string }) {
  const e = mx.entrevista || {}
  const lead = cv.nome || 'Lead ' + String(cv.telefone).slice(-4)
  const demo = {
    lead, telefone: cv.telefone, conversa_oito: cv.id, simulado: !!cv.simulado, pedido_em: new Date().toISOString(),
    semana: vaga.semana, entrega: vaga.entrega, status: !e.cidade ? 'falta_cidade' : vaga.agora ? 'producao' : 'fila', video: vids.length > 0,
  }
  const neg = await db.insere('negocios', {
    nome: e.negocio || `${primeiro(lead) || lead} (demonstração)`, nicho: e.nicho || null, cidade: e.cidade || null,
    regiao: e.cidade ? `${e.cidade} e região` : null, dono_nome: lead, dono_whatsapp: null, status: 'pausado', plano: 'completa',
    contexto: { produto: e.produto || null, preco: e.preco || null, publico: e.publico || null, como_compra: e.como_compra || null, resumo: mx.resumo || null, demo },
  })
  await salvaMaia(cv.id, { amostra: neg.id })
  // as fotos melhores primeiro (a arte usa a primeira)
  for (const f of [...boas].sort((a, b) => b.nota - a.nota).slice(0, 3)) await copiaMidia(neg, f)
  for (const v of vids) await copiaMidia(neg, v)
  await db.evento('demo_amostra_pedida', neg.id, { lead, semana: vaga.semana, na_fila: !vaga.agora })
  if (demo.status === 'falta_cidade') return neg
  if (vaga.agora) await produz(neg)
  else await avisaEquipe('amostra na fila', `${lead} (${neg.nome}): as ${LIMITE_SEMANA()} da semana acabaram, entra ${diaTxt(vaga.entrega)}`, neg.id)
  return neg
}

async function atualizaDemo(neg: any, campos: Record<string, any>) {
  const atual = (await db.um('negocios', { id: neg.id })) || neg
  const contexto = { ...(atual.contexto || {}), demo: { ...(atual.contexto?.demo || {}), ...campos } }
  await db.atualiza('negocios', { id: neg.id }, { contexto })
  return contexto.demo
}

// a cidade chegou depois das fotos (demo.ts chama quando a entrevista pega a cidade): segue pra oficina, ou pra fila da semana dela
export async function cidadeChegou(cv_id: string, ent: Record<string, string>) {
  const cv: any = await odb.um('wa_conversas', { id: cv_id })
  const id = cv?.rascunho?.maia?.amostra
  if (!id || !ent.cidade) return false
  const neg = await db.um('negocios', { id })
  if (neg?.contexto?.demo?.status !== 'falta_cidade') return false
  const contexto = { ...neg.contexto, produto: neg.contexto.produto || ent.produto || null, preco: neg.contexto.preco || ent.preco || null, publico: neg.contexto.publico || ent.publico || null }
  await db.atualiza('negocios', { id }, { cidade: ent.cidade, regiao: ent.cidade + ' e região', ...(ent.negocio && /demonstração/.test(neg.nome) ? { nome: ent.negocio } : {}), contexto })
  const agora = neg.contexto.demo.semana <= segundaDe()
  const atual = await db.um('negocios', { id })
  await atualizaDemo(atual, { status: agora ? 'producao' : 'fila' })
  if (agora) await produz(await db.um('negocios', { id }))
  return true
}

// manda fazer a peça pela oficina: um anúncio em imagem (a melhor foto) e, se tiver vídeo, um anúncio em vídeo
export async function produz(neg: any) {
  const { geraAnuncios } = await import('./pecas')
  const ms = await db.lista('midias', { negocio_id: neg.id }, { ordem: 'criado_em' })
  const foto = ms.find(m => m.tipo === 'foto'), video = ms.find(m => m.tipo === 'video')
  let feitas = 0
  if (foto) { const r: any = await geraAnuncios(neg, { quantidade: 1, midia_ids: [foto.id] }); feitas += r.pecas?.length || 0 }
  if (video) { const r: any = await geraAnuncios(neg, { quantidade: 1, midia_ids: [video.id] }); feitas += r.pecas?.length || 0 }
  const viva = await oficinaViva()
  const lead = neg.contexto?.demo?.lead
  if (!feitas) {
    await atualizaDemo(neg, { status: 'sem_peca', produzido_em: new Date().toISOString() })
    await avisaEquipe('amostra sem peça', `${lead} (${neg.nome}): a Maia não achou mídia que sirva. Vê as fotos no painel e fala com o lead.`, neg.id, true)
    return 0
  }
  await atualizaDemo(neg, { status: viva ? 'producao' : 'esperando_oficina', produzido_em: new Date().toISOString() })
  if (!viva) await avisaEquipe('amostra esperando a oficina', `${lead} (${neg.nome}): a oficina não está ligada. Liga a oficina pra amostra sair até ${diaTxt(neg.contexto.demo.entrega)}.`, neg.id, true)
  return feitas
}

// mídia que chegou depois do pedido (o vídeo, normalmente)
async function juntaMidias(neg: any, fotos: Vista[], vids: { path: string; mime: string }[]) {
  for (const f of fotos) await copiaMidia(neg, f)
  for (const v of vids) {
    const m = await copiaMidia(neg, v)
    await atualizaDemo(neg, { video: true })
    // se já está em produção, o vídeo vira peça agora; na fila, entra quando a vez dele chegar
    if (neg.contexto?.demo?.status !== 'fila') { const { geraAnuncios } = await import('./pecas'); await geraAnuncios(neg, { quantidade: 1, midia_ids: [m.id] }) }
  }
}

// ---------- a entrega pro lead (quando a equipe aprova no painel; aprovacao.ts chama) ----------
export async function entregaAmostra(peca: any, neg: any, por: string) {
  await db.atualiza('pecas', { id: peca.id }, { status: 'aprovada', aprovado_equipe_por: por, aprovado_equipe_em: new Date().toISOString() })
  const d = neg.contexto.demo
  const cv: any = await odb.um('wa_conversas', { id: d.conversa_oito })
  if (!cv || cv.optout) {
    await avisaEquipe('amostra aprovada, mas o lead saiu', `${d.lead}: pediu pra sair do WhatsApp. A amostra não foi.`, neg.id)
    return { ok: false, status: 'aprovada', erro: 'o lead saiu da conversa' }
  }
  if (!janelaAberta(cv)) {
    // fora das 24 h só vale modelo aprovado: chama o lead uma vez e entrega quando ele responder (demo.ts chama entregaSePendente)
    if (!d.chamou_em) {
      const r = await enviaModelo(cv.telefone, MODELO_LEAD(), 'pt_BR', [primeiro(d.lead) || 'tudo bem', neg.nome, 'a tua amostra de anúncio ficou pronta'])
      await registraSaida(cv, 'sistema', `[modelo ${MODELO_LEAD()}] a amostra ficou pronta`, r, 'modelo')
      if (!r.ok) await avisaEquipe('o aviso da amostra não saiu', `${d.lead}: ${(r as any).erro || '?'}`, neg.id)
    }
    await atualizaDemo(neg, { status: 'aguardando_janela', chamou_em: d.chamou_em || new Date().toISOString() })
    return { ok: true, status: 'aprovada', esperando_lead: true }
  }
  return entregaPendentes(neg, cv)
}

// manda as peças aprovadas que ainda não foram; quando não sobra nada na oficina nem na revisão, fecha com a mensagem curta
export async function entregaPendentes(neg: any, cv: any) {
  const ps = await db.lista('pecas', { negocio_id: neg.id }, { ordem: 'criado_em' })
  let ok = true
  for (const p of ps.filter(p => p.status === 'aprovada' && !p.enviado_dono_em)) {
    const link = await db.link(p.arquivo_path)
    const legenda = [p.gancho, p.texto, p.cta].filter(Boolean).join('\n\n')
    const video = p.tipo === 'anuncio_video' || p.tipo === 'video'
    const r = link ? (video ? await enviaVideo(cv.telefone, link, legenda) : await enviaImagem(cv.telefone, link, legenda)) : await enviaTexto(cv.telefone, legenda)
    await registraSaida(cv, 'ia', `(amostra, ${video ? 'vídeo' : 'arte'}) ${legenda}`, r, video ? 'video' : 'imagem')
    await db.atualiza('pecas', { id: p.id }, { enviado_dono_em: new Date().toISOString(), wamid_envio: r.wamid || null })
    ok = ok && r.ok
  }
  const falta = ps.some(p => ['gerando', 'revisao_equipe', 'ajuste_equipe', 'ajuste_dono'].includes(p.status))
  const foram = ps.filter(p => p.status === 'aprovada')
  if (!falta && foram.length && neg.contexto?.demo?.status !== 'enviada') {
    const tem = foram.some(p => p.tipo === 'anuncio_video') ? 'Arte, vídeo editado e texto' : 'Arte e texto'
    await fala(cv, `Tá aí a tua amostra 👆 ${tem}, feitos pra ${neg.nome}. Isso é o que eu faria toda semana pro teu negócio. Quer ver como ficaria rodando, e quanto custa?`)
    await atualizaDemo(neg, { status: 'enviada', entregue_em: new Date().toISOString() })
    await odb.atualiza('wa_conversas', { id: cv.id }, { etapa: 'amostra_entregue' })
    await db.evento('demo_amostra_entregue', neg.id, { lead: neg.contexto?.demo?.lead })
  } else if (!falta && foram.length) await atualizaDemo(neg, { status: 'enviada' })
  return { ok, status: 'aprovada', entregue: true }
}

// o lead voltou a escrever: se a amostra estava esperando a janela das 24 h abrir, entrega agora
export async function entregaSePendente(cv: any) {
  const id = cv.rascunho?.maia?.amostra
  if (!id) return false
  const neg = await db.um('negocios', { id })
  if (neg?.contexto?.demo?.status !== 'aguardando_janela') return false
  await entregaPendentes(neg, cv)
  return true
}

// ---------- o que roda de hora em hora (rotina.ts chama) ----------
// a retomada única: ele sumiu (20 a 24 h sem responder a nossa última mensagem, ainda dentro da janela de 24 h), das 8h às 22h
export async function retomadasDemo() {
  const h = horaBR()
  if (h < 8 || h >= 22) return []
  const agora = Date.now(), feitos: string[] = []
  const cvs = await odb.lista('wa_conversas', { fase: 'maia' })
  for (const cv of cvs) {
    if (feitos.length >= 20) break
    if (cv.modo !== 'ia' || cv.optout || !cv.janela_ate) continue
    if (cv.simulado && !maiaLocal()) continue
    const mx = cv.rascunho?.maia || {}
    if (mx.retomada_em || ['sem_interesse', 'quer_comecar'].includes(cv.etapa)) continue
    const fim = Date.parse(cv.janela_ate), sumiu = agora - (fim - 24 * 3600e3)
    if (sumiu < 20 * 3600e3 || fim - agora < 10 * 60e3) continue
    const ultima = (await odb.lista('wa_msgs', { conversa_id: cv.id }, { ordem: 'criado_em', desc: true, limite: 1 }))[0]
    if (!ultima || ultima.autor === 'cliente') continue
    // a amostra está com a gente (fila, oficina, revisão): a vez é nossa, não cobra o lead
    if (mx.amostra) { const n = await db.um('negocios', { id: mx.amostra }); if (n && !['enviada', 'sem_peca', 'falta_cidade'].includes(n.contexto?.demo?.status)) continue }
    await salvaMaia(cv.id, { retomada_em: new Date().toISOString() })
    await fala(cv, TEXTO_RETOMADA)
    feitos.push(String(cv.telefone).slice(-4))
  }
  return feitos
}

// a fila: na segunda, os pedidos da semana entram na oficina; e quem esperava a oficina volta pra produção quando ela liga
export async function filaDemo() {
  const seg = segundaDe(), feitos: string[] = []
  const viva = await oficinaViva()
  for (const n of await negociosDemo()) {
    const d = n.contexto.demo
    if (d.status === 'fila' && d.semana <= seg) { await produz(n); feitos.push(n.nome) }
    else if (d.status === 'esperando_oficina' && viva) await atualizaDemo(n, { status: 'producao' })
  }
  return feitos
}

export async function rotinaDemo() {
  const r: any = {}
  try { r.retomadas = await retomadasDemo() } catch (e: any) { r.retomadas_erro = e.message }
  try { r.fila = await filaDemo() } catch (e: any) { r.fila_erro = e.message }
  return r
}

// ---------- pro painel ----------
export function statusAmostra(d: any, ps: any[], viva: boolean) {
  if (d.status === 'fila') return 'fila'
  if (d.status === 'sem_peca') return 'sem_peca'
  if (d.status === 'falta_cidade') return 'falta_cidade'
  if (ps.length && ps.every(p => p.status === 'descartada')) return 'descartada'
  if (ps.some(p => p.status === 'revisao_equipe')) return 'pra_aprovar'
  if (ps.some(p => ['gerando', 'ajuste_equipe', 'ajuste_dono'].includes(p.status))) return viva ? 'oficina' : 'esperando_oficina'
  if (ps.some(p => p.status === 'erro')) return 'erro'
  if (d.status === 'aguardando_janela') return 'esperando_lead'
  if (d.status === 'enviada') return 'enviada'
  return d.status || 'producao'
}

export async function painelAmostras() {
  const [ns, pecas, viva] = await Promise.all([negociosDemo(), db.lista('pecas'), oficinaViva()])
  const semana = segundaDe()
  const lista = ns.map(n => {
    const d = n.contexto.demo, ps = pecas.filter(p => p.negocio_id === n.id)
    return {
      negocio_id: n.id, negocio: n.nome, lead: d.lead, telefone: d.telefone, simulado: !!d.simulado, status: statusAmostra(d, ps, viva),
      semana: d.semana, entrega: d.entrega, pedido_em: d.pedido_em, entregue_em: d.entregue_em || null,
      produto: n.contexto?.produto || null, cidade: n.cidade, pecas: ps.map(p => ({ id: p.id, tipo: p.tipo, status: p.status })),
    }
  }).sort((a, b) => String(b.pedido_em).localeCompare(String(a.pedido_em)))
  return { semana, usadas: lista.filter(x => x.semana === semana).length, limite: LIMITE_SEMANA(), oficina_viva: viva, lista }
}
