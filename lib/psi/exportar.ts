// Tudo que sai do sistema: PDF (relatório do mês e documentos), planilha (XLSX e CSV) e o botão
// Compartilhar do celular (WhatsApp, e-mail...). Roda só no aparelho: nada é mandado pra servidor.
import type { Perfil } from './tipos'
import type { Relatorio } from './relatorio'
import { datasCurtas } from './relatorio'
import { dataBR, dataExtenso, hojeBR, nomeMes } from './datas'

// ------------------------------------------------------------------ o logo (public/psi/logo.png ou .svg)
let logoCache: { data: string; w: number; h: number } | null | undefined
export async function carregarLogo(): Promise<{ data: string; w: number; h: number } | null> {
  if (logoCache !== undefined) return logoCache
  for (const src of ['/psi/logo.png', '/psi/logo.svg']) {
    try {
      const r = await fetch(src, { cache: 'no-cache' })
      if (!r.ok) continue
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const img = await new Promise<HTMLImageElement>((ok, nao) => { const i = new Image(); i.onload = () => ok(i); i.onerror = nao; i.src = url })
      const escala = 400 / Math.max(img.naturalWidth || 400, img.naturalHeight || 400)
      const c = document.createElement('canvas')
      c.width = Math.round((img.naturalWidth || 400) * escala); c.height = Math.round((img.naturalHeight || 400) * escala)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      logoCache = { data: c.toDataURL('image/png'), w: c.width, h: c.height }
      return logoCache
    } catch { /* tenta o próximo */ }
  }
  logoCache = null
  return null
}

const CACAU: [number, number, number] = [107, 79, 63]
const CAFE: [number, number, number] = [162, 123, 92]
const AREIA: [number, number, number] = [232, 213, 196]

type JsPDF = import('jspdf').jsPDF

async function novoPdf() {
  const { jsPDF } = await import('jspdf')
  return new jsPDF({ unit: 'mm', format: 'a4' })
}

/** cabeçalho: logo + nome + CRP; devolve onde o texto pode começar */
async function cabecalho(doc: JsPDF, perfil: Perfil): Promise<number> {
  const logo = await carregarLogo()
  let x = 20
  if (logo) {
    const h = 19, w = Math.min(44, h * logo.w / logo.h)
    doc.addImage(logo.data, 'PNG', 20, 10, w, h)
    x = 20 + w + 5
  }
  doc.setTextColor(...CACAU)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12)
  doc.text(perfil.nome || '', x, 18)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5)
  doc.setTextColor(...CAFE)
  doc.text(['Psicóloga' + (perfil.crp ? ` — CRP ${perfil.crp}` : ''), [perfil.telefone, perfil.email].filter(Boolean).join('  ·  ')].filter(Boolean), x, 23)
  doc.setDrawColor(...AREIA); doc.setLineWidth(0.6)
  doc.line(20, 32, 190, 32)
  return 42
}

function rodapes(doc: JsPDF, texto?: string) {
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...CAFE)
    if (texto) doc.text(texto, 20, 287)
    doc.text(`Página ${i} de ${n}`, 190, 287, { align: 'right' })
  }
}

// ------------------------------------------------------------------ relatório do mês
export async function pdfRelatorio(rel: Relatorio, perfil: Perfil): Promise<Blob> {
  const doc = await novoPdf()
  const { default: autoTable } = await import('jspdf-autotable')
  let y = await cabecalho(doc, perfil)
  doc.setTextColor(...CACAU); doc.setFont('helvetica', 'bold'); doc.setFontSize(14)
  doc.text(`Atendimentos realizados — ${rel.local?.nome || 'todos os locais'}`, 20, y)
  y += 7
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11)
  const mes = nomeMes(rel.mes)
  doc.text(`Mês de referência: ${mes.charAt(0).toUpperCase() + mes.slice(1)}`, 20, y)
  y += 5
  autoTable(doc, {
    startY: y,
    head: [['Paciente', 'Datas dos atendimentos', 'Qtd.']],
    body: rel.linhas.map(l => [l.paciente, datasCurtas(l.datas), String(l.quantidade)]),
    foot: [['Total', `${rel.pacientes} paciente${rel.pacientes === 1 ? '' : 's'}`, String(rel.total)]],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 2.4, textColor: [60, 44, 36], lineColor: [221, 203, 187], lineWidth: 0.2 },
    headStyles: { fillColor: [232, 213, 196], textColor: [107, 79, 63], fontStyle: 'bold' },
    footStyles: { fillColor: [246, 239, 232], textColor: [107, 79, 63], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 62 }, 2: { cellWidth: 16, halign: 'center' } },
    margin: { left: 20, right: 20 },
  })
  // @ts-expect-error lastAutoTable é posto pelo plugin
  let fim = (doc.lastAutoTable?.finalY || y) + 22
  if (fim > 260) { doc.addPage(); fim = 40 }
  doc.setDrawColor(...CACAU); doc.setLineWidth(0.3)
  doc.line(65, fim, 145, fim)
  doc.setFontSize(10); doc.setTextColor(...CACAU)
  doc.text([perfil.nome || '', 'Psicóloga' + (perfil.crp ? ` — CRP ${perfil.crp}` : '')], 105, fim + 5, { align: 'center' })
  rodapes(doc, `Emitido em ${dataBR(hojeBR())}`)
  return doc.output('blob')
}

// ------------------------------------------------------------------ documento (declaração, atestado, relatório)
export interface ConteudoDocumento {
  titulo: string
  blocos: { subtitulo?: string; texto: string }[]
  cidade: string
  data: string
  preencherComTracos?: boolean // atestado: o espaço que sobra leva traços (CFP 06/2019)
}

export async function pdfDocumento(c: ConteudoDocumento, perfil: Perfil): Promise<Blob> {
  const doc = await novoPdf()
  let y = await cabecalho(doc, perfil) + 6
  doc.setTextColor(...CACAU); doc.setFont('helvetica', 'bold'); doc.setFontSize(15)
  doc.text(c.titulo.toUpperCase(), 105, y, { align: 'center' })
  y += 12
  const larg = 170
  for (const b of c.blocos) {
    if (b.subtitulo) {
      if (y > 260) { doc.addPage(); y = 40 }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5)
      doc.text(b.subtitulo, 20, y); y += 6.5
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11.5); doc.setTextColor(50, 38, 31)
    for (const par of b.texto.split(/\n+/).filter(Boolean)) {
      const linhas = doc.splitTextToSize(par, larg) as string[]
      for (const l of linhas) {
        if (y > 262) { doc.addPage(); y = 40 }
        doc.text(l, 20, y, { maxWidth: larg, align: 'justify' }); y += 6
      }
      y += 3
    }
    doc.setTextColor(...CACAU)
  }
  if (c.preencherComTracos && y < 200) {
    doc.setDrawColor(...AREIA)
    for (let yy = y; yy < 200; yy += 6) doc.line(20, yy, 190, yy)
    y = 204
  }
  y += 6
  if (y > 235) { doc.addPage(); y = 50 }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11.5)
  doc.text(`${c.cidade || ''}${c.cidade ? ', ' : ''}${dataExtenso(c.data)}.`, 190, y, { align: 'right' })
  y += 26
  doc.setDrawColor(...CACAU); doc.setLineWidth(0.3)
  doc.line(65, y, 145, y)
  doc.text([perfil.nome || '', 'Psicóloga' + (perfil.crp ? ` — CRP ${perfil.crp}` : '')], 105, y + 5.5, { align: 'center' })
  rodapes(doc, 'Documento sigiloso.')
  return doc.output('blob')
}

// ------------------------------------------------------------------ planilhas
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function linhasPlanilha(rel: Relatorio, perfil: Perfil): (string | number)[][] {
  const mes = nomeMes(rel.mes)
  return [
    [`Atendimentos realizados — ${rel.local?.nome || 'todos os locais'} — ${mes}`],
    [`Profissional: ${perfil.nome || ''}${perfil.crp ? ` (CRP ${perfil.crp})` : ''}`],
    [],
    ['Paciente', 'Datas dos atendimentos', 'Quantidade'],
    ...rel.linhas.map(l => [l.paciente, datasCurtas(l.datas), l.quantidade]),
    ['Total', `${rel.pacientes} paciente${rel.pacientes === 1 ? '' : 's'}`, rel.total],
  ]
}

export function csvRelatorio(rel: Relatorio, perfil: Perfil): Blob {
  const q = (v: string | number) => typeof v === 'number' ? String(v) : `"${v.replace(/"/g, '""')}"`
  const txt = linhasPlanilha(rel, perfil).map(l => l.map(q).join(';')).join('\r\n')
  return new Blob(['﻿' + txt], { type: 'text/csv;charset=utf-8' }) // o BOM faz o Excel ler os acentos
}

export async function xlsxRelatorio(rel: Relatorio, perfil: Perfil): Promise<Blob> {
  const JSZip = (await import('jszip')).default
  const linhas = linhasPlanilha(rel, perfil)
  const col = (i: number) => String.fromCharCode(65 + i)
  const cabec = 4, ultima = linhas.length
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="38" customWidth="1"/><col min="2" max="2" width="60" customWidth="1"/><col min="3" max="3" width="13" customWidth="1"/></cols><sheetData>${
    linhas.map((l, r) => `<row r="${r + 1}">${l.map((v, c) => {
      const ref = `${col(c)}${r + 1}`
      const s = r === 0 ? 1 : (r + 1 === cabec || r + 1 === ultima) ? 2 : 0
      return typeof v === 'number'
        ? `<c r="${ref}" s="${s}"><v>${v}</v></c>`
        : `<c r="${ref}" t="inlineStr" s="${s}"><is><t xml:space="preserve">${esc(v)}</t></is></c>`
    }).join('')}</row>`).join('')
  }</sheetData></worksheet>`
  const z = new JSZip()
  z.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`)
  z.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`)
  z.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Atendimentos" sheetId="1" r:id="rId1"/></sheets></workbook>`)
  z.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`)
  z.file('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="13"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8D5C4"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`)
  z.file('xl/worksheets/sheet1.xml', sheet)
  return z.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

// ------------------------------------------------------------------ mandar pra fora
export const nomeArquivo = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()

export function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = nome
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/** Abre o "Compartilhar" do celular com o arquivo. Sem suporte (computador), baixa o arquivo. Devolve como saiu. */
export async function compartilhar(blob: Blob, nome: string, titulo: string): Promise<'compartilhado' | 'baixado' | 'cancelado'> {
  const arquivo = new File([blob], nome, { type: blob.type })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.share && nav.canShare?.({ files: [arquivo] })) {
    try { await nav.share({ files: [arquivo], title: titulo }); return 'compartilhado' }
    catch (e) { if ((e as Error).name === 'AbortError') return 'cancelado' }
  }
  baixar(blob, nome)
  return 'baixado'
}
