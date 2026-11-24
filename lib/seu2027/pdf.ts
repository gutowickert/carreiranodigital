// Seu 2027: o PDF do mapa, gerado no servidor com jsPDF (já é dependência do sistema; roda na Vercel sem navegador).
// Fontes padrão do PDF (Times nos títulos, Helvetica no texto): aceitam todos os acentos do português.
import { jsPDF } from 'jspdf'
import { NUMEROS, MESES, AREAS } from './calculos'
import type { Numeros } from './calculos'
import type { Textos } from './ia'

const COR = { fundo: [251, 248, 242], tinta: [43, 37, 64], suave: [108, 100, 128], ouro: [176, 141, 87], lilas: [236, 231, 244], linha: [222, 212, 196] } as const
const W = 210, H = 297, M = 20, LARG = W - 2 * M

export function gerarPdf(d: { nome: string; foco: string | null; numeros: Numeros; textos: Textos; codigo?: string }): Buffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const n = d.numeros, t = d.textos
  const primeiro = d.nome.split(' ')[0]
  let y = M

  const cor = (c: readonly number[]) => doc.setTextColor(c[0], c[1], c[2])
  const fundo = () => { doc.setFillColor(...(COR.fundo as [number, number, number])); doc.rect(0, 0, W, H, 'F'); rodape() }
  let pagina = 1
  function rodape() {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); cor(COR.suave)
    doc.text(`Seu 2027 · mapa de ${d.nome}`, M, H - 10)
    doc.text(String(pagina), W - M, H - 10, { align: 'right' })
  }
  const novaPagina = () => { doc.addPage(); pagina++; fundo(); y = M + 4 }
  const cabe = (alt: number) => { if (y + alt > H - 20) novaPagina() }

  function titulo(txt: string, sobre?: string) {
    cabe(24)
    if (sobre) { doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setCharSpace(0.8); cor(COR.ouro); doc.text(sobre.toUpperCase(), M, y); doc.setCharSpace(0); y += 8.5 }
    doc.setFont('times', 'normal'); doc.setFontSize(21); cor(COR.tinta); doc.text(txt, M, y); y += 4
    doc.setDrawColor(...(COR.ouro as [number, number, number])); doc.setLineWidth(0.4); doc.line(M, y, M + 18, y); y += 8
  }
  function paragrafo(txt: string, tam = 10.5, larg = LARG, x = M) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(tam); cor(COR.tinta)
    for (const par of String(txt || '').split(/\n+/)) {
      const linhas = doc.splitTextToSize(par, larg) as string[]
      for (const l of linhas) { cabe(6); doc.text(l, x, y); y += tam * 0.5 }
      y += 3
    }
  }
  // a carta do arcano: desenho próprio, geométrico (moldura, numeral, sol de linhas e uma estrela de oito pontas)
  function carta(x: number, yy: number, w: number, h: number) {
    doc.setFillColor(255, 255, 255); doc.setDrawColor(...(COR.ouro as [number, number, number])); doc.setLineWidth(0.6)
    doc.roundedRect(x, yy, w, h, 3, 3, 'FD'); doc.setLineWidth(0.25); doc.roundedRect(x + 2.5, yy + 2.5, w - 5, h - 5, 2, 2, 'S')
    doc.setFont('times', 'normal'); doc.setFontSize(13); cor(COR.ouro); doc.text(n.arcanoRomano, x + w / 2, yy + 11, { align: 'center' })
    const cx = x + w / 2, cy = yy + h / 2 + 1, r = w * 0.27
    doc.setDrawColor(...(COR.ouro as [number, number, number])); doc.setLineWidth(0.25); doc.circle(cx, cy, r, 'S'); doc.circle(cx, cy, r * 0.62, 'S')
    for (let i = 0; i < 24; i++) { const a = (i * Math.PI * 2) / 24; doc.line(cx + Math.cos(a) * r * 1.08, cy + Math.sin(a) * r * 1.08, cx + Math.cos(a) * r * (i % 2 ? 1.22 : 1.38), cy + Math.sin(a) * r * (i % 2 ? 1.22 : 1.38)) }
    const pts: [number, number][] = []
    for (let i = 0; i < 16; i++) { const a = (i * Math.PI) / 8 - Math.PI / 2, rr = i % 2 ? r * 0.22 : r * 0.55; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]) }
    doc.setFillColor(...(COR.tinta as [number, number, number]))
    doc.lines(pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]), pts[0][0], pts[0][1], [1, 1], 'F', true)
    doc.setFont('times', 'normal'); doc.setFontSize(11); cor(COR.tinta); doc.text(n.arcanoNome, cx, yy + h - 8, { align: 'center' })
  }

  // ── capa ──
  fundo()
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); cor(COR.ouro); doc.text('S E U   2 0 2 7', W / 2, 46, { align: 'center' })
  doc.setFont('times', 'normal'); doc.setFontSize(30); cor(COR.tinta); doc.text('O mapa do seu ano', W / 2, 62, { align: 'center' })
  doc.setFontSize(16); cor(COR.suave); doc.text(d.nome, W / 2, 73, { align: 'center' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(`nascimento em ${n.nascimento.split('-').reverse().join('/')}`, W / 2, 80, { align: 'center' })
  carta(W / 2 - 24, 92, 48, 78)
  const caixas = [
    ['Ano pessoal', String(n.anoPessoal), NUMEROS[n.anoPessoal].tema],
    ['Arcano do ano', n.arcanoRomano, n.arcanoNome],
    ['Número do destino', String(n.destino), NUMEROS[n.destino].tema],
  ]
  caixas.forEach(([rot, num, sub], i) => {
    const bw = 52, gap = 7, x = M + 4 + i * (bw + gap), yy = 186
    doc.setFillColor(...(COR.lilas as [number, number, number])); doc.roundedRect(x, yy, bw, 36, 3, 3, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); cor(COR.suave); doc.text(rot.toUpperCase(), x + bw / 2, yy + 8, { align: 'center' })
    doc.setFont('times', 'normal'); doc.setFontSize(22); cor(COR.tinta); doc.text(num, x + bw / 2, yy + 21, { align: 'center' })
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); cor(COR.suave); doc.text(sub, x + bw / 2, yy + 29, { align: 'center' })
  })
  y = 238; paragrafo(t.abertura, 11, LARG - 16, M + 8)

  // ── os três números ──
  novaPagina()
  titulo(`Ano pessoal ${n.anoPessoal}: ${NUMEROS[n.anoPessoal].tema}`, 'O tom do seu ano')
  paragrafo(t.ano_pessoal)
  y += 4; titulo(`${n.arcanoNome}`, `Arcano do ano · ${n.arcanoRomano}`)
  paragrafo(t.arcano)
  y += 4; titulo(`Número do destino ${n.destino}`, 'O seu caminho')
  paragrafo(t.destino)

  // ── os 12 meses ──
  novaPagina()
  titulo('Os 12 meses de 2027', 'Mês a mês')
  for (const m of t.meses) {
    const mn = n.meses[m.mes - 1]
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
    const linhas = doc.splitTextToSize(m.texto, LARG - 22) as string[]
    cabe(12 + linhas.length * 5)
    doc.setFillColor(...(COR.lilas as [number, number, number])); doc.circle(M + 6, y + 1, 6, 'F')
    doc.setFont('times', 'normal'); doc.setFontSize(13); cor(COR.tinta); doc.text(String(mn.numero), M + 6, y + 3, { align: 'center' })
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(`${MESES[m.mes - 1].replace(/^./, c => c.toUpperCase())} · ${m.titulo}`, M + 17, y + 2)
    y += 7.5
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); cor(COR.tinta)
    for (const l of linhas) { doc.text(l, M + 17, y); y += 5 }
    y += 4
  }

  // ── as áreas ──
  y += 6; cabe(70)
  titulo('As áreas da sua vida em 2027', 'Amor, trabalho, dinheiro e emocional')
  for (const k of ['amor', 'trabalho', 'dinheiro', 'emocional'] as const) {
    cabe(20); doc.setFont('times', 'normal'); doc.setFontSize(14); cor(COR.ouro); doc.text(AREAS[k], M, y); y += 6
    paragrafo(t[k]); y += 1
  }
  if (t.foco) { cabe(20); doc.setFont('times', 'normal'); doc.setFontSize(14); cor(COR.ouro); doc.text(d.foco ? `O que você mais quer: ${AREAS[d.foco].toLowerCase()}` : 'O centro do seu ano', M, y); y += 6; paragrafo(t.foco) }

  // ── conselhos e datas ──
  y += 6; cabe(70)
  titulo('Três conselhos para 2027', 'Para levar com você')
  t.conselhos.forEach((c, i) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5)
    const linhas = doc.splitTextToSize(c, LARG - 14) as string[]
    cabe(8 + linhas.length * 5.5)
    doc.setFont('times', 'normal'); doc.setFontSize(20); cor(COR.ouro); doc.text(String(i + 1), M + 2, y + 3)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); cor(COR.tinta)
    for (const l of linhas) { doc.text(l, M + 12, y); y += 5.5 }
    y += 5
  })
  y += 4; titulo('Meses e dias favoráveis', 'Quando o ano sopra a favor')
  paragrafo(t.favoraveis)
  y += 6; cabe(30)
  doc.setFont('times', 'italic'); doc.setFontSize(13); cor(COR.tinta)
  for (const l of doc.splitTextToSize(t.fechamento, LARG - 20) as string[]) { cabe(7); doc.text(l, W / 2, y, { align: 'center' }); y += 6.5 }
  y += 8; cabe(10)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); cor(COR.suave)
  doc.text('Conteúdo de autoconhecimento e entretenimento. Não substitui orientação profissional.', W / 2, y, { align: 'center' })

  return Buffer.from(doc.output('arraybuffer'))
}
