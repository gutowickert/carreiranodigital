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
  ['maismilionaria', '+Milionária', '#2e3078'], ['timemania', 'Timemania', '#049645'], ['duplasena', 'Dupla Sena', '#a61324'],
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

// 28/11: os próximos sorteios no atendimento da lotérica (cache de 1 h: a Caixa muda o prêmio só depois de cada sorteio).
// Sem isso a Maia perguntava ao dono o prêmio estimado da Mega. Sempre "prêmio estimado", nunca promessa
let cacheCaixa: { em: number; txt: string } | null = null
export async function blocoCaixa(): Promise<string> {
  if (cacheCaixa && Date.now() - cacheCaixa.em < 3600e3) return cacheCaixa.txt
  const cs = await concursosCaixa().catch(() => [] as Concurso[])
  if (!cs.length) return ''
  const prox = cs.filter(c => c.dataProximoConcurso).sort((a, b) => +dia(a.dataProximoConcurso) - +dia(b.dataProximoConcurso))
  const txt = `\nPRÓXIMOS SORTEIOS (site da Caixa; é o prêmio ESTIMADO pela Caixa, nunca promessa de ganho; não pergunta isso ao dono):\n${prox.map(c => `- ${c.nome}: concurso ${c.numero + 1}, ${SEMANA[dia(c.dataProximoConcurso).getUTCDay()]} ${c.dataProximoConcurso.slice(0, 5)}, prêmio estimado ${reais(c.valorEstimadoProximoConcurso)}${c.acumulado ? ' (acumulado)' : ''}`).join('\n')}\nÚLTIMO RESULTADO de cada jogo (só se o cliente perguntar o resultado; conferir a cota DELE é com a equipe): ${cs.map(c => `${c.nome} ${c.numero} (${c.dataApuracao.slice(0, 5)}): ${c.listaDezenas.join(' ')}`).join(' | ')}`
  cacheCaixa = { em: Date.now(), txt }
  return txt
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

// 28/11 (Guto: "o padrão de story branco não é o que eles usam, legal seria usar cada jogo na sua cor oficial da Loterias Caixa"):
// fundo azul-marinho da marca (o mesmo das artes do Instagram deles), selo 18+, cada jogo num cartão na cor oficial da Caixa e o
// rodapé branco com o botão laranja do WhatsApp, como nos posts do @lotericadozart. Cores conferidas no CSS de loterias.caixa.gov.br
// (28/11): Mega #209869, Lotofácil #930089, Quina #260085, +Milionária #2E3078, Timemania verde #049645 com amarelo #FFF600,
// Lotomania #F78100. Dupla Sena #A61324 (o site usa #BF194E nas bolinhas), Dia de Sorte #CB852B e Super Sete #A8CF45 pela marca dos jogos.
type Cor = { fundo: string; tinta: string; bola: string; num: string; borda?: string; forte?: string }   // forte: a cor do jogo em cima do branco, quando a oficial é clara demais
const cor = (fundo: string, extra: Partial<Cor> = {}): Cor => ({ fundo, tinta: '#ffffff', bola: fundo, num: '#ffffff', ...extra })
const CORES: [RegExp, Cor][] = [
  [/virada/, cor('#209869', { tinta: '#f5c64f', borda: '#d9a93a' })],
  [/mega/, cor('#209869')],
  [/lotofacil/, cor('#930089')],
  [/quina/, cor('#260085')],
  [/milionaria/, cor('#2e3078')],
  [/timemania/, cor('#049645', { tinta: '#fff600', bola: '#fff600', num: '#049645', borda: '#049645' })],
  [/dupla/, cor('#a61324')],
  [/dia de sorte|diadesorte/, cor('#cb852b')],
  [/lotomania/, cor('#f78100')],
  [/super ?sete/, cor('#a8cf45', { tinta: '#1f3300', bola: '#a8cf45', num: '#1f3300', forte: '#4f7a0a' })],
]
const semAcento = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export const corDoJogo = (nome: string, neg?: any): Cor => CORES.find(([re]) => re.test(semAcento(nome)))?.[1] || cor(neg?.marca?.cores?.secundaria || LARANJA_PADRAO)

const AZUL_PADRAO = '#0b1f5c', LARANJA_PADRAO = '#ff6a00', CINZA = '#5a6275', AZUL_CLARO = '#c9d4f7'
const TOPO_AREA = 450, FIM_AREA = 1600   // onde vão os cartões (entre o título e o rodapé)
async function moldura(neg: any, titulo: string, sub: string, logo: string | null) {
  const azul = neg?.marca?.cores?.primaria || AZUL_PADRAO
  let s = `<defs><radialGradient id="fundo" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#1c3aa6"/><stop offset="1" stop-color="${azul}"/></radialGradient></defs>`
  s += `<rect width="1080" height="1920" fill="url(#fundo)"/>`
  if (logo) {
    // logo feito pra fundo escuro vai direto; logo comum vai numa plaquinha branca (como nos reels deles)
    if (/^escuro:/.test(logo)) s += `<image href="${logo.slice(7)}" x="250" y="70" width="580" height="190" preserveAspectRatio="xMidYMid meet"/>`
    else s += `<rect x="290" y="70" width="500" height="190" rx="36" fill="#ffffff"/><image href="${logo}" x="320" y="85" width="440" height="160" preserveAspectRatio="xMidYMid meet"/>`
  } else s += await texto(String(neg?.nome || ''), 540, 200, 70, '#ffffff', 'extrabold', 'meio', 720)
  s += `<circle cx="978" cy="118" r="48" fill="none" stroke="#ffffff" stroke-width="5"/>` + await texto('18+', 978, 131, 36, '#ffffff', 'extrabold', 'meio')
  s += await texto(titulo, 540, 352, 84, '#ffffff', 'extrabold', 'meio', 900)
  s += await texto(sub, 540, 410, 38, AZUL_CLARO, 'semibold', 'meio', 900)
  return s
}
async function rodape(neg: any) {
  const laranja = neg?.marca?.cores?.secundaria || LARANJA_PADRAO, azul = neg?.marca?.cores?.primaria || AZUL_PADRAO
  const zap = String(neg?.meta?.whatsapp_publico || neg?.contexto?.whatsapp_publico || '')
  let s = `<path d="M0 1690 Q0 1640 50 1640 H1030 Q1080 1640 1080 1690 V1920 H0 Z" fill="#ffffff"/>`
  s += `<rect x="90" y="1676" width="900" height="112" rx="56" fill="${laranja}"/>`
  s += await texto(zap ? `Bolões no WhatsApp ${zap}` : 'Bolões no nosso WhatsApp', 540, 1747, 44, '#ffffff', 'bold', 'meio', 820)
  s += await texto('Proibido para menores de 18 anos. Jogue com responsabilidade.', 540, 1858, 31, azul, 'semibold', 'meio', 940)
  return s
}
async function logoDataUri(neg: any): Promise<string | null> {
  const escuro = neg?.marca?.logo_fundo_escuro || neg?.marca?.logo_escuro
  const p = escuro || neg?.marca?.logo_horizontal || neg?.marca?.logo
  if (!p) return null
  try {
    let buf: Buffer
    if (/^https?:/.test(p)) { const r = await fetch(p, { signal: AbortSignal.timeout(20000) }); if (!r.ok) return null; buf = Buffer.from(await r.arrayBuffer()) }
    else buf = await db.baixa(p)
    const sharp = (await import('sharp')).default
    const png = await sharp(buf).resize({ width: 900, height: 300, fit: 'inside', withoutEnlargement: true }).png().toBuffer()
    return (escuro ? 'escuro:' : '') + 'data:image/png;base64,' + png.toString('base64')
  } catch { return null }
}
async function png(svg: string): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">${svg}</svg>`)).png().toBuffer()
}
const valor = (v: any) => (typeof v === 'number' ? reais(v) : String(v || ''))

export async function svgResultados(neg: any, cs: Concurso[], logo: string | null) {
  const ultimo = cs.map(c => c.dataApuracao).sort((a, b) => +dia(b) - +dia(a))[0]
  const res = cs.filter(c => c.dataApuracao === ultimo)
  let s = await moldura(neg, 'Resultados', `Sorteios de ${SEMANA[dia(ultimo).getUTCDay()]}, ${ultimo.slice(0, 5)}`, logo)
  // cartão: à esquerda o nome do jogo na cor dele; à direita as dezenas em bolinhas na cor do jogo. Muitos jogos no dia: tudo encolhe até caber
  const ESQ = 290, DIR = 900 - ESQ - 50, por = (n: number) => (n <= 8 ? n : n <= 16 ? Math.ceil(n / 2) : Math.ceil(n / 3))
  const medidas = (k: number) => res.map(c => {
    const n = c.listaDezenas.length, p = por(n), linhas = Math.ceil(n / p), g = 12 * k
    const d = Math.min(92 * k, (DIR - (p - 1) * g) / p)
    return { c, p, linhas, g, d, h: Math.max(190 * k, linhas * d + (linhas - 1) * g + 52 * k) }
  })
  let k = 1, m = medidas(k), vao = 22
  while (k > 0.5 && m.reduce((t, x) => t + x.h, 0) + vao * (m.length - 1) > FIM_AREA - TOPO_AREA) { k -= 0.04; m = medidas(k); vao = 16 }
  const total = m.reduce((t, x) => t + x.h, 0) + vao * (m.length - 1)
  let y = TOPO_AREA + Math.max(0, (FIM_AREA - TOPO_AREA - total) / 2)
  for (const { c, p, linhas, g, d, h } of m) {
    const k2 = corDoJogo(c.nome)
    s += `<rect x="90" y="${y}" width="900" height="${h}" rx="28" fill="#ffffff"/>`
    s += `<rect x="90" y="${y}" width="${ESQ}" height="${h}" rx="28" fill="${k2.fundo}"/><rect x="${90 + ESQ - 30}" y="${y}" width="30" height="${h}" fill="${k2.fundo}"/>`
    const meio = y + h / 2, tNome = Math.min(46, h * 0.24)
    s += await texto(c.nome, 90 + ESQ / 2, meio - (c.acumulado ? tNome * 0.25 : 0), tNome, k2.tinta, 'extrabold', 'meio', ESQ - 40)
    s += await texto(`concurso ${c.numero}`, 90 + ESQ / 2, meio + tNome * (c.acumulado ? 0.75 : 1), Math.min(27, h * 0.15), k2.tinta, 'semibold', 'meio', ESQ - 40)
    if (c.acumulado) s += await texto('ACUMULOU', 90 + ESQ / 2, meio + tNome * 1.65, Math.min(26, h * 0.14), k2.tinta, 'extrabold', 'meio', ESQ - 40)
    const n = c.listaDezenas, x0 = 90 + ESQ + 25, alturaBolas = linhas * d + (linhas - 1) * g
    for (let i = 0; i < n.length; i++) {
      const lin = Math.floor(i / p), naLinha = Math.min(p, n.length - lin * p), larg = naLinha * d + (naLinha - 1) * g
      const cx = x0 + (DIR - larg) / 2 + (i % p) * (d + g) + d / 2, cy = y + (h - alturaBolas) / 2 + lin * (d + g) + d / 2
      s += `<circle cx="${cx}" cy="${cy}" r="${d / 2}" fill="${k2.bola}"${k2.borda ? ` stroke="${k2.borda}" stroke-width="3"` : ''}/>` + await texto(n[i], cx, cy + d * 0.165, d * 0.46, k2.num, 'extrabold', 'meio')
    }
    y += h + vao
  }
  return { svg: s + await rodape(neg), data: ultimo, jogos: res.map(c => c.nome) }
}
export async function svgProximos(neg: any, cs: Concurso[], logo: string | null) {
  const prox = cs.filter(c => c.dataProximoConcurso).sort((a, b) => +dia(a.dataProximoConcurso) - +dia(b.dataProximoConcurso) || b.valorEstimadoProximoConcurso - a.valorEstimadoProximoConcurso)
  let s = await moldura(neg, 'Próximos sorteios', 'Prêmios estimados pela Caixa', logo)
  const vao = 16, h = Math.min(170, (FIM_AREA - TOPO_AREA - vao * (prox.length - 1)) / Math.max(1, prox.length))
  let y = TOPO_AREA + Math.max(0, (FIM_AREA - TOPO_AREA - (h * prox.length + vao * (prox.length - 1))) / 2)
  for (const c of prox) {
    const d = dia(c.dataProximoConcurso), k = corDoJogo(c.nome)
    s += `<rect x="90" y="${y}" width="900" height="${h}" rx="26" fill="${k.fundo}"${k.borda ? ` stroke="${k.borda}" stroke-width="4"` : ' stroke="#ffffff" stroke-opacity="0.22" stroke-width="2"'}/>`
    s += await texto(c.nome, 130, y + h * 0.47, Math.min(46, h * 0.31), k.tinta, 'extrabold', 'inicio', 400)
    s += await texto(`${SEMANA[d.getUTCDay()]}, ${c.dataProximoConcurso.slice(0, 5)}${c.acumulado ? ' · acumulada' : ''}`, 130, y + h * 0.78, Math.min(28, h * 0.19), k.tinta, 'semibold', 'inicio', 400)
    s += await texto('prêmio estimado', 950, y + h * 0.36, Math.min(24, h * 0.16), k.tinta, 'semibold', 'fim')
    s += await texto(reais(c.valorEstimadoProximoConcurso), 950, y + h * 0.74, Math.min(50, h * 0.33), k.tinta, 'extrabold', 'fim', 420)
    y += h + vao
  }
  return { svg: s + await rodape(neg), jogos: prox.map(c => c.nome) }
}
// um bolão num cartão da cor do jogo, com a cota numa plaquinha branca à direita (usado na lista e embaixo da foto)
async function cartaoBolao(neg: any, b: any, y: number, h: number) {
  const k = corDoJogo(String(b.jogo || ''), neg), f = Math.min(1, h / 220)
  let s = `<rect x="90" y="${y}" width="900" height="${h}" rx="28" fill="${k.fundo}"${k.borda ? ` stroke="${k.borda}" stroke-width="6"` : ' stroke="#ffffff" stroke-opacity="0.22" stroke-width="2"'}/>`
  const linhas: [string, number, 'extrabold' | 'semibold'][] = [[String(b.jogo || 'Bolão'), 50 * f, 'extrabold']]
  if (b.premio_estimado) linhas.push([`prêmio estimado ${valor(b.premio_estimado)}`, 29 * f, 'semibold'])
  const jogo = [b.jogos ? `${b.jogos} ${b.jogos > 1 ? 'jogos' : 'jogo'}` : '', b.numeros_por_jogo ? `${b.jogos ? 'de ' : ''}${b.numeros_por_jogo} números` : '', b.cotas ? `· ${b.cotas} cotas` : ''].filter(Boolean).join(' ')
  if (jogo) linhas.push([jogo, 29 * f, 'semibold'])
  const alt = linhas.reduce((t, [, tam]) => t + tam * 1.3, 0)
  let ty = y + (h - alt) / 2
  for (const [t, tam, peso] of linhas) { ty += tam * 1.3; s += await texto(t, 130, ty - tam * 0.3, tam, k.tinta, peso, 'inicio', b.preco_cota ? 540 : 820) }
  if (b.preco_cota) {
    const bh = Math.min(h - 40, 150), by = y + (h - bh) / 2
    s += `<rect x="710" y="${by}" width="250" height="${bh}" rx="22" fill="#ffffff"/>`
    s += await texto('cota', 835, by + bh * 0.36, 26 * Math.min(1, bh / 150), CINZA, 'semibold', 'meio')
    s += await texto(valor(b.preco_cota), 835, by + bh * 0.78, 54 * Math.min(1, bh / 150), k.forte || k.fundo, 'extrabold', 'meio', 220)
  }
  return s
}
// o bolão do dia: itens de lib/maia/boloes.ts (jogo, sorteio, premio_estimado, numeros_por_jogo, jogos, cotas, preco_cota, esgotado)
export async function svgBolao(neg: any, itens: any[], logo: string | null) {
  const vivos = itens.filter(i => !i.esgotado).slice(0, 6)
  let s = await moldura(neg, vivos.length > 1 ? 'Bolões de hoje' : 'Bolão de hoje', 'Garanta a sua cota', logo)
  const vao = 22, h = Math.min(230, (FIM_AREA - TOPO_AREA - vao * (vivos.length - 1)) / Math.max(1, vivos.length))
  let y = TOPO_AREA + Math.max(0, (FIM_AREA - TOPO_AREA - (h * vivos.length + vao * (vivos.length - 1))) / 2)
  for (const b of vivos) { s += await cartaoBolao(neg, b, y, h); y += h + vao }
  return { svg: s + await rodape(neg), qtd: vivos.length }
}
// 28/11: a foto que a equipe mandou (a ficha/arte do bolão) no meio do story, com moldura na cor do jogo e o cartão do bolão embaixo
export async function svgBolaoFoto(neg: any, foto: { uri: string; w: number; h: number }, itens: any[], logo: string | null) {
  const vivos = itens.filter(i => !i.esgotado).slice(0, 3)
  let s = await moldura(neg, vivos.length > 1 ? 'Bolões de hoje' : 'Bolão de hoje', 'Garanta a sua cota', logo)
  const hc = vivos.length <= 1 ? 210 : vivos.length === 2 ? 150 : 120, vao = 16
  const blocoCartoes = vivos.length ? hc * vivos.length + vao * (vivos.length - 1) : 0
  const topoCartoes = FIM_AREA - blocoCartoes
  const caixaH = topoCartoes - TOPO_AREA - (vivos.length ? 34 : 0) - 24, borda = 12
  const esc = Math.min((900 - 2 * borda) / foto.w, (caixaH - 2 * borda) / foto.h)
  const w = foto.w * esc, h = foto.h * esc, x = 540 - w / 2, y = TOPO_AREA + 10 + (caixaH - 2 * borda - h) / 2 + borda
  const k = corDoJogo(String(vivos[0]?.jogo || ''), neg)
  s += `<rect x="${x - borda}" y="${y - borda}" width="${w + 2 * borda}" height="${h + 2 * borda}" rx="34" fill="${vivos.length === 1 ? k.fundo : '#ffffff'}"${k.borda && vivos.length === 1 ? ` stroke="${k.borda}" stroke-width="5"` : ''}/>`
  s += `<clipPath id="foto"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="24"/></clipPath><image href="${foto.uri}" x="${x}" y="${y}" width="${w}" height="${h}" clip-path="url(#foto)" preserveAspectRatio="xMidYMid slice"/>`
  let yc = topoCartoes
  for (const b of vivos) { s += await cartaoBolao(neg, b, yc, hc); yc += hc + vao }
  return { svg: s + await rodape(neg), qtd: vivos.length }
}
// a foto do armazenamento, virada certa (EXIF) e reduzida, pra entrar no SVG
async function fotoDataUri(caminho: string) {
  const sharp = (await import('sharp')).default
  const { data, info } = await sharp(await db.baixa(caminho)).rotate().resize({ width: 1000, height: 1100, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer({ resolveWithObject: true })
  return { uri: 'data:image/jpeg;base64,' + data.toString('base64'), w: info.width, h: info.height }
}

// ---------- gera, guarda e pede a aprovação ----------
type Lote = 'manha' | 'bolao'
export async function geraLote(neg: any, lote: Lote, opc: { itens?: any[]; concursos?: Concurso[]; jaPostadas?: string[] } = {}) {
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
    const vivos = (opc.itens || []).filter(i => !i.esgotado)
    if (!vivos.length) throw new Error('sem bolão do dia pra montar o story')
    // 28/11: um story por foto que a equipe mandou (a foto + o cartão do bolão); os bolões que vieram só em texto ficam no story da lista.
    // Foto que já foi postada hoje não volta (a menina manda uma foto por vez: cada uma nova gera só o story dela)
    const fotos = [...new Set(vivos.map(i => i.foto).filter(Boolean))].filter(f => !(opc.jaPostadas || []).includes(f)).slice(0, 6) as string[]
    for (const f of fotos) {
      const ft = await fotoDataUri(f).catch(() => null)
      if (ft) await guarda('bolao-foto', (await svgBolaoFoto(neg, ft, vivos.filter(i => i.foto === f), logo)).svg)
      else vivos.forEach(i => { if (i.foto === f) i.foto = null })   // a foto sumiu: o bolão vai pro story da lista
    }
    const semFoto = vivos.filter(i => !i.foto)
    if (semFoto.length && !(opc.jaPostadas || []).includes('lista:' + semFoto.map(i => i.jogo + i.preco_cota).join('|'))) await guarda('bolao', (await svgBolao(neg, semFoto, logo)).svg)
    if (!imgs.length) return null
    const det = { data, lote, imgs, status: 'aguardando', fotos, ...(semFoto.length ? { lista: 'lista:' + semFoto.map(i => i.jogo + i.preco_cota).join('|') } : {}) }
    const ev = await db.evento('story_lote', neg.id, det)
    return { ...ev, detalhe: det }
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
  const n = ev.detalhe.imgs.length
  const qual = ev.detalhe.lote === 'manha' ? 'Os stories de hoje: resultados e próximos sorteios.' : n > 1 ? `Os ${n} stories do bolão de hoje.` : 'O story do bolão de hoje.'
  await mandaBotoes(cv, `${qual} Posto no Instagram?`, [{ id: `story:${ev.id}:sim`, titulo: 'Postar' }, { id: `story:${ev.id}:nao`, titulo: 'Agora não' }])
  return { pediu: true, lote: ev.id }
}

export async function publicaLote(neg: any, evento_id: string | number, por: string) {
  const ev = await db.um('eventos', { id: evento_id, tipo: 'story_lote' })
  if (!ev) throw new Error('lote de stories não existe')
  if (ev.detalhe?.status === 'postado') return { ja: true }
  if (ev.detalhe?.status === 'substituido') return { substituido: true }   // chegou foto nova e saiu um lote mais novo
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
    await mandaTexto(cv, r.substituido ? 'Esses foram trocados pelos mais novos (chegou bolão novo). Usa os botões da última mensagem.' : r.ja ? 'Esses já estão no Instagram.' : `Postado nos stories do Instagram ✅`)
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
  // 28/11: a menina pode mandar uma foto por bolão. O lote que ainda espera resposta é trocado pelo novo (que já leva tudo de hoje),
  // e o que já foi postado hoje não sai de novo
  const hoje = (await db.lista('eventos', { negocio_id: neg.id, tipo: 'story_lote' }, { ordem: 'criado_em', desc: true, limite: 30 })).filter((e: any) => e.detalhe?.data === hojeBR() && e.detalhe?.lote === 'bolao')
  for (const e of hoje.filter((e: any) => e.detalhe?.status === 'aguardando')) await db.atualiza('eventos', { id: e.id }, { detalhe: { ...e.detalhe, status: 'substituido' } })
  const jaPostadas = hoje.filter((e: any) => e.detalhe?.status === 'postado').flatMap((e: any) => [...(e.detalhe.fotos || []), ...(e.detalhe.lista ? [e.detalhe.lista] : [])])
  const ev = await geraLote(neg, 'bolao', { itens, jaPostadas })
  return ev ? pedeAprovacao(neg, ev) : null
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
