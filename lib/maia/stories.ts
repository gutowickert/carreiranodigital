// Maia: os stories diários da lotérica (28/11, pedido do Guto pra Lotérica do Zart).
// Hoje a menina da equipe pede pro Claude buscar os resultados no site da Caixa e posta à mão. Agora a Maia faz sozinha, 3 stories por dia:
//   1) resultados: os sorteios do último dia que teve sorteio (site da Caixa)
//   2) próximos sorteios: os próximos concursos com o prêmio estimado (site da Caixa)
//   3) bolão do dia: a lista que a equipe manda pra Maia toda manhã (lib/maia/boloes.ts chama bolaoDoDiaChegou)
// Como sai: a Maia gera as imagens (1080x1920, texto desenhado com a fonte Poppins: no servidor não tem fonte instalada) e manda pro
// dono no WhatsApp com os botões "Postar" / "Agora não". Postar publica como story no Instagram do negócio. Com meta.stories.direto = true
// publica sem perguntar. Só roda com meta.stories.ligado = true (desligado por padrão) e o Instagram ligado (meta.page_id + meta.ig_id).
// Se quiserem mais stories, a equipe faz à mão (Guto, 28/11).
import fs from 'node:fs'
import path from 'node:path'
import { maiaDb as db } from './db'

const CAIXA = 'https://servicebus2.caixa.gov.br/portaldeloterias/api/'
export const JOGOS: [string, string, string][] = [['megasena', 'Mega-Sena', '#209869'], ['quina', 'Quina', '#260085'], ['lotofacil', 'Lotofácil', '#930089'],
  ['maismilionaria', '+Milionária', '#2e3078'], ['timemania', 'Timemania', '#00a650'], ['duplasena', 'Dupla Sena', '#a61324'],
  ['diadesorte', 'Dia de Sorte', '#cb852b'], ['lotomania', 'Lotomania', '#f78100']]
const horaBR = (d = new Date()) => (d.getUTCHours() + 21) % 24
export const hojeBR = (d = new Date()) => new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10)
const dia = (s: string) => { const [d, m, a] = s.split('/'); return new Date(Date.UTC(+a, +m - 1, +d, 12)) }
const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const reais = (v: number) => v >= 1e6 ? 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' milhões' : 'R$ ' + Number(v || 0).toLocaleString('pt-BR', Number.isInteger(Number(v)) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const storiesLigado = (neg: any) => neg?.meta?.stories?.ligado === true

// ---------- os dados da Caixa ----------
export type Concurso = { api: string; nome: string; cor: string; numero: number; dataApuracao: string; listaDezenas: string[]; acumulado: boolean; dataProximoConcurso: string; valorEstimadoProximoConcurso: number }
export async function concursosCaixa(): Promise<Concurso[]> {
  const out: Concurso[] = []
  await Promise.all(JOGOS.map(async ([api, nome, cor]) => {
    try {
      const r = await fetch(CAIXA + api, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) })
      const j: any = await r.json()
      if (j?.numero && Array.isArray(j.listaDezenas)) out.push({ api, nome, cor, numero: j.numero, dataApuracao: j.dataApuracao, listaDezenas: j.listaDezenas, acumulado: !!j.acumulado, dataProximoConcurso: j.dataProximoConcurso, valorEstimadoProximoConcurso: Number(j.valorEstimadoProximoConcurso || 0) })
    } catch { /* um jogo fora do ar não derruba os outros */ }
  }))
  return JOGOS.map(([api]) => out.find(o => o.api === api)).filter(Boolean) as Concurso[]
}

// ---------- o desenho (texto vira contorno com a Poppins: não depende de fonte instalada no servidor) ----------
let fontes: Record<string, any> | null = null
async function fonte(peso: 'semibold' | 'bold' | 'extrabold') {
  if (!fontes) {
    const opentype: any = (await import('opentype.js')).default || (await import('opentype.js'))
    const dir = path.join(process.cwd(), 'lib/maia/fontes')
    const abre = (f: string) => { const b = fs.readFileSync(path.join(dir, f)); return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)) }
    fontes = { semibold: abre('Poppins-SemiBold.ttf'), bold: abre('Poppins-Bold.ttf'), extrabold: abre('Poppins-ExtraBold.ttf') }
  }
  return fontes[peso]
}
async function texto(t: string, x: number, y: number, tam: number, cor: string, peso: 'semibold' | 'bold' | 'extrabold' = 'bold', alinha: 'inicio' | 'meio' | 'fim' = 'inicio', larguraMax = 0) {
  const f = await fonte(peso)
  let w = f.getAdvanceWidth(t, tam)
  if (larguraMax && w > larguraMax) { tam = tam * larguraMax / w; w = larguraMax }
  const x0 = alinha === 'meio' ? x - w / 2 : alinha === 'fim' ? x - w : x
  return `<path d="${f.getPath(t, x0, y, tam).toPathData(1)}" fill="${cor}"/>`
}

const AZUL_PADRAO = '#1b2b6e', LARANJA_PADRAO = '#ef7d1a', CINZA = '#4a4a4a'
async function moldura(neg: any, titulo: string, sub: string, logo: string | null) {
  const azul = neg?.marca?.cores?.primaria || AZUL_PADRAO
  let s = `<rect width="1080" height="1920" fill="#ffffff"/>`
  s += logo ? `<image href="${logo}" x="240" y="90" width="600" height="190" preserveAspectRatio="xMidYMid meet"/>` : await texto(String(neg?.nome || ''), 540, 230, 70, azul, 'extrabold', 'meio', 900)
  s += await texto(titulo, 540, 390, 78, azul, 'extrabold', 'meio', 900)
  s += await texto(sub, 540, 450, 38, CINZA, 'semibold', 'meio', 900)
  return s
}
async function rodape(neg: any) {
  const laranja = neg?.marca?.cores?.secundaria || LARANJA_PADRAO
  const zap = String(neg?.meta?.whatsapp_publico || neg?.contexto?.whatsapp_publico || '')
  let s = `<rect x="90" y="1660" width="900" height="110" rx="26" fill="${laranja}"/>`
  s += await texto(zap ? `Bolões no WhatsApp ${zap}` : 'Bolões no nosso WhatsApp', 540, 1732, 44, '#ffffff', 'bold', 'meio', 840)
  s += await texto('Proibido para menores de 18 anos. Jogue com responsabilidade.', 540, 1840, 31, CINZA, 'semibold', 'meio', 940)
  return s
}
async function logoDataUri(neg: any): Promise<string | null> {
  const p = neg?.marca?.logo_horizontal || neg?.marca?.logo
  if (!p) return null
  try {
    const u = /^https?:/.test(p) ? p : await db.link(p, 600)
    const r = await fetch(u!, { signal: AbortSignal.timeout(20000) }); if (!r.ok) return null
    return `data:${r.headers.get('content-type') || 'image/jpeg'};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`
  } catch { return null }
}
async function png(svg: string): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">${svg}</svg>`)).png().toBuffer()
}

export async function svgResultados(neg: any, cs: Concurso[], logo: string | null) {
  const ultimo = cs.map(c => c.dataApuracao).sort((a, b) => +dia(b) - +dia(a))[0]
  const res = cs.filter(c => c.dataApuracao === ultimo)
  let s = await moldura(neg, 'Resultados', `Sorteios de ${SEMANA[dia(ultimo).getUTCDay()]}, ${ultimo.slice(0, 5)}`, logo)
  let y = 500; const alt = Math.min(240, Math.floor(1130 / Math.max(1, res.length)))
  for (const c of res) {
    const n = c.listaDezenas, grande = n.length > 10, por = grande ? 10 : n.length, r = grande ? 30 : 42, gap = grande ? 76 : 100
    s += await texto(c.nome, 90, y + 50, 46, c.cor, 'extrabold')
    s += await texto(`concurso ${c.numero}${c.acumulado ? ' · acumulou' : ''}`, 990, y + 50, 30, CINZA, 'semibold', 'fim')
    for (let i = 0; i < n.length; i++) {
      const cx = 90 + r + (i % por) * gap, cy = y + 110 + Math.floor(i / por) * (r * 2 + 12)
      s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c.cor}"/>` + await texto(n[i], cx, cy + r * 0.36, r * 0.95, '#ffffff', 'extrabold', 'meio')
    }
    y += alt
  }
  return { svg: s + await rodape(neg), data: ultimo, jogos: res.map(c => c.nome) }
}
export async function svgProximos(neg: any, cs: Concurso[], logo: string | null) {
  const azul = neg?.marca?.cores?.primaria || AZUL_PADRAO
  const prox = cs.filter(c => c.dataProximoConcurso).sort((a, b) => +dia(a.dataProximoConcurso) - +dia(b.dataProximoConcurso) || b.valorEstimadoProximoConcurso - a.valorEstimadoProximoConcurso)
  let s = await moldura(neg, 'Próximos sorteios', 'Prêmios estimados pela Caixa', logo)
  let y = 500; const alt = Math.min(150, Math.floor(1130 / Math.max(1, prox.length)))
  for (const c of prox) {
    const d = dia(c.dataProximoConcurso)
    s += `<rect x="90" y="${y}" width="900" height="${alt - 18}" rx="22" fill="#f4f6fb"/><rect x="90" y="${y}" width="16" height="${alt - 18}" rx="8" fill="${c.cor}"/>`
    s += await texto(c.nome, 134, y + 56, 42, c.cor, 'extrabold')
    s += await texto(`${SEMANA[d.getUTCDay()]}, ${c.dataProximoConcurso.slice(0, 5)}${c.acumulado ? ' · acumulada' : ''}`, 134, y + 98, 28, CINZA, 'semibold')
    s += await texto(reais(c.valorEstimadoProximoConcurso), 960, y + 80, 46, azul, 'extrabold', 'fim', 420)
    y += alt
  }
  return { svg: s + await rodape(neg), jogos: prox.map(c => c.nome) }
}
// o bolão do dia: itens de lib/maia/boloes.ts (jogo, sorteio, premio_estimado, numeros_por_jogo, jogos, cotas, preco_cota, esgotado)
export async function svgBolao(neg: any, itens: any[], logo: string | null) {
  const azul = neg?.marca?.cores?.primaria || AZUL_PADRAO, laranja = neg?.marca?.cores?.secundaria || LARANJA_PADRAO
  const vivos = itens.filter(i => !i.esgotado).slice(0, 6)
  let s = await moldura(neg, 'Bolões de hoje', 'Garanta a sua cota', logo)
  let y = 500; const alt = Math.min(220, Math.floor(1130 / Math.max(1, vivos.length)))
  for (const b of vivos) {
    const cor = JOGOS.find(j => new RegExp(j[1].replace('+', '\\+').replace(/-/g, '.?'), 'i').test(String(b.jogo || '')))?.[2] || azul
    s += `<rect x="90" y="${y}" width="900" height="${alt - 20}" rx="24" fill="#f4f6fb"/><rect x="90" y="${y}" width="16" height="${alt - 20}" rx="8" fill="${cor}"/>`
    s += await texto(String(b.jogo || 'Bolão'), 134, y + 60, 46, cor, 'extrabold', 'inicio', 520)
    if (b.premio_estimado) s += await texto(`prêmio estimado ${typeof b.premio_estimado === 'number' ? reais(b.premio_estimado) : b.premio_estimado}`, 134, y + 104, 28, CINZA, 'semibold', 'inicio', 560)
    const jogo = [b.jogos ? `${b.jogos} ${b.jogos > 1 ? 'jogos' : 'jogo'}` : '', b.numeros_por_jogo ? `de ${b.numeros_por_jogo} números` : '', b.cotas ? `· ${b.cotas} cotas` : ''].filter(Boolean).join(' ')
    if (jogo) s += await texto(jogo, 134, y + 146, 30, CINZA, 'semibold', 'inicio', 560)
    if (b.preco_cota) { s += await texto('cota', 960, y + 62, 28, CINZA, 'semibold', 'fim'); s += await texto(typeof b.preco_cota === 'number' ? reais(b.preco_cota) : String(b.preco_cota), 960, y + 120, 54, laranja, 'extrabold', 'fim', 330) }
    y += alt
  }
  return { svg: s + await rodape(neg), qtd: vivos.length }
}

// ---------- gera, guarda e pede a aprovação ----------
type Lote = 'manha' | 'bolao'
export async function geraLote(neg: any, lote: Lote, opc: { itens?: any[]; concursos?: Concurso[] } = {}) {
  const logo = await logoDataUri(neg)
  const data = hojeBR(), imgs: { tipo: string; caminho: string }[] = []
  const guarda = async (tipo: string, svg: string) => {
    const caminho = `${neg.id}/stories/${data}-${tipo}-${Math.random().toString(36).slice(2, 6)}.png`
    await db.sobe(caminho, await png(svg), 'image/png'); imgs.push({ tipo, caminho })
  }
  if (lote === 'manha') {
    const cs = opc.concursos || await concursosCaixa()
    if (!cs.length) throw new Error('o site da Caixa não respondeu')
    await guarda('resultados', (await svgResultados(neg, cs, logo)).svg)
    await guarda('proximos', (await svgProximos(neg, cs, logo)).svg)
  } else {
    const itens = opc.itens || []
    if (!itens.filter(i => !i.esgotado).length) throw new Error('sem bolão do dia pra montar o story')
    await guarda('bolao', (await svgBolao(neg, itens, logo)).svg)
  }
  const ev = await db.evento('story_lote', neg.id, { data, lote, imgs, status: 'aguardando' })
  return { ...ev, detalhe: { data, lote, imgs, status: 'aguardando' } }
}
const loteDoDia = async (negocio_id: string, lote: Lote, data = hojeBR()) =>
  (await db.lista('eventos', { negocio_id, tipo: 'story_lote' }, { ordem: 'criado_em', desc: true, limite: 20 })).find(e => e.detalhe?.data === data && e.detalhe?.lote === lote) || null

export async function pedeAprovacao(neg: any, ev: any) {
  if (neg?.meta?.stories?.direto === true) return publicaLote(neg, ev.id, 'direto')
  const { conversaDoDono, mandaImagem, mandaBotoes } = await import('./canal')
  const cv = await conversaDoDono(neg)
  for (const im of ev.detalhe.imgs) await mandaImagem(cv, (await db.link(im.caminho, 3 * 86400))!, '')
  const qual = ev.detalhe.lote === 'manha' ? 'Os stories de hoje: resultados e próximos sorteios.' : 'O story do bolão de hoje.'
  await mandaBotoes(cv, `${qual} Posto no Instagram?`, [{ id: `story:${ev.id}:sim`, titulo: 'Postar' }, { id: `story:${ev.id}:nao`, titulo: 'Agora não' }])
  return { pediu: true, lote: ev.id }
}

export async function publicaLote(neg: any, evento_id: string | number, por: string) {
  const ev = await db.um('eventos', { id: evento_id, tipo: 'story_lote' })
  if (!ev) throw new Error('lote de stories não existe')
  if (ev.detalhe?.status === 'postado') return { ja: true }
  const { publicaStoryIG } = await import('./social')
  const ids: string[] = []
  for (const im of ev.detalhe.imgs) ids.push(await publicaStoryIG(neg, (await db.link(im.caminho, 86400))!))
  await db.atualiza('eventos', { id: ev.id }, { detalhe: { ...ev.detalhe, status: 'postado', ig_ids: ids, por, postado_em: new Date().toISOString() } })
  return { postado: ids.length }
}

// o clique em "Postar" / "Agora não" (dono.ts chama com o id do botão "story:<evento>:sim|nao")
export async function respostaStory(neg: any, cv: any, evento_id: string, sim: boolean) {
  const { mandaTexto } = await import('./canal')
  const ev = await db.um('eventos', { id: evento_id, tipo: 'story_lote' })
  if (!ev || ev.negocio_id !== neg.id) return null
  if (!sim) {
    await db.atualiza('eventos', { id: ev.id }, { detalhe: { ...ev.detalhe, status: 'descartado' } })
    await mandaTexto(cv, 'Tá bem, não postei esses.'); return { descartado: true }
  }
  try {
    const r = await publicaLote(neg, ev.id, 'dono_whatsapp')
    await mandaTexto(cv, r.ja ? 'Esses já estão no Instagram.' : `Postado nos stories do Instagram ✅`)
    return r
  } catch (e: any) {
    await mandaTexto(cv, 'Não consegui postar agora. A equipe já foi avisada e resolve.')
    const { avisaEquipe } = await import('./canal')
    await avisaEquipe('story não postou', `${neg.nome}: ${String(e?.message || e).slice(0, 200)}`, neg.id).catch(() => null)
    return { erro: String(e?.message || e) }
  }
}

// a equipe mandou os bolões do dia (lib/maia/boloes.ts): monta o story do bolão e pede a aprovação
export async function bolaoDoDiaChegou(neg: any) {
  if (!storiesLigado(neg)) return null
  const { boloesDeHoje } = await import('./boloes')
  const b: any = await boloesDeHoje(neg)
  const itens = Array.isArray(b) ? b : b?.itens || []
  if (!itens.length) return null
  const ev = await geraLote(neg, 'bolao', { itens })
  return pedeAprovacao(neg, ev)
}

// a rotina de hora em hora (rotina.ts): às 8h (Brasília) os resultados e os próximos sorteios, 1 vez por dia
export async function rotinaStories(relogio = new Date(), opc: { forcar?: boolean } = {}) {
  if (!opc.forcar && horaBR(relogio) !== 8) return []
  const feitos: any[] = []
  let cs: Concurso[] | null = null
  for (const neg of (await db.lista('negocios')).filter((n: any) => storiesLigado(n) && !['cancelado', 'pausado'].includes(n.status))) {
    try {
      if (await loteDoDia(neg.id, 'manha')) continue
      cs = cs || await concursosCaixa()
      const ev = await geraLote(neg, 'manha', { concursos: cs })
      feitos.push({ negocio: neg.id, ...(await pedeAprovacao(neg, ev)) })
    } catch (e: any) { feitos.push({ negocio: neg.id, erro: String(e?.message || e).slice(0, 200) }) }
  }
  return feitos
}
