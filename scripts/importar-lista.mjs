// Importa uma lista de contatos frios (interessados/compradores) direto no Supabase.
// Reusa a MESMA logica do endpoint app/api/wa-oficial/contatos/importar/route.ts
// (parser CSV/VCF + normalizacao BR + dedup), mas roda fora do Next.
//
// Uso:
//   node scripts/importar-lista.mjs "<arquivo>" <categoria> [cidade] [ddd]
//   categoria: interessado | comprador   (default interessado)
//   cidade:    vazio => deriva do nome do arquivo
//   ddd:       default 51
//
// Ex: node scripts/importar-lista.mjs "C:\\...\\kommo_..._LAJEADO.csv" interessado
//
// Passe --dry para so parsear e mostrar o resumo, sem gravar.

import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { createClient } from '@supabase/supabase-js'

// ---- env (le .env.local na raiz) ----
function lerEnv() {
  const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  const env = {}
  for (const linha of txt.split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
  return env
}

// ---- mesmas funcoes do route.ts ----
function parseDelim(text, delim) {
  const rows = []
  let row = [], cur = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else q = false }
      else cur += c
    } else {
      if (c === '"') q = true
      else if (c === delim) { row.push(cur); cur = '' }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
      else if (c === '\r') { /* ignora */ }
      else cur += c
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row) }
  return rows
}

function normFone(raw, dddPadrao) {
  let d = (raw || '').replace(/\D/g, '').replace(/^0+/, '')
  if (!d) return ''
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) { /* ja tem DDI */ }
  else if (d.length === 10 || d.length === 11) d = '55' + d
  else if (d.length === 8 || d.length === 9) d = '55' + dddPadrao + d
  else return ''
  if (d.length === 12) {
    const ddd = d.slice(2, 4)
    const local = d.slice(4)
    if (/^[6-9]/.test(local)) d = '55' + ddd + '9' + local
  }
  if (!d.startsWith('55') || (d.length !== 12 && d.length !== 13)) return ''
  return d
}

// mesma heuristica do app/dashboard/listas/page.tsx
function cidadeDoArquivo(nome) {
  let base = nome.replace(/\.(csv|vcf)$/i, '').replace(/\s*\(\d+\)\s*$/, '')
  const aposData = base.match(/\d{4}[-_]\d{2}[-_]\d{2}[\s_]+(.+)$/)
  if (aposData) base = aposData[1]
  else base = base.split('_').slice(2).join(' ')
  const limpa = base.replace(/[_\s]+/g, ' ').trim()
  if (!limpa || /^\d/.test(limpa) || !/[a-zà-ú]/i.test(limpa)) return ''
  // Capitaliza por palavra (lida com acento) e mantem conectivos minusculos
  const conect = new Set(['de', 'do', 'da', 'dos', 'das', 'e'])
  return limpa.toLowerCase().split(' ')
    .map((w, i) => (i > 0 && conect.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function parseTexto(texto, formato) {
  const linhas = []
  if (texto.includes('BEGIN:VCARD')) {
    for (const c of texto.split(/BEGIN:VCARD/i)) {
      if (!/END:VCARD/i.test(c)) continue
      const fn = c.match(/^FN[^:\r\n]*:(.+)$/im)
      const tel = c.match(/^TEL[^:\r\n]*:(.+)$/im)
      const telv = tel ? tel[1].trim() : ''
      if (!telv.replace(/\D/g, '')) continue
      linhas.push({ nome: fn ? fn[1].trim() : '', telefone: telv, email: '', notas: '' })
    }
  } else if (formato === 'csv') {
    const rows = parseDelim(texto, ',')
    let h = -1, header = []
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const low = rows[i].map(c => (c || '').replace(/^﻿/, '').trim().toLowerCase())
      const temNome = low.some(c => /nome|name/.test(c))
      const temFone = low.some(c => /telefone|phone|celular|whats/.test(c))
      if (temNome && temFone) { h = i; header = low; break }
    }
    if (h < 0) throw new Error('nao encontrei colunas Nome e Telefone no arquivo')
    const find = re => header.findIndex(c => re.test(c))
    const iNomeFull = find(/nome completo|full ?name/)
    const iNome = iNomeFull >= 0 ? iNomeFull : find(/^(nome|name|firstname|first ?name|primeiro ?nome)$/)
    const iLast = iNomeFull >= 0 ? -1 : find(/^(lastname|last ?name|sobrenome)$/)
    const iEmail = find(/e-?mail/)
    const iFone = find(/telefone|phone|celular|whats/)
    const iCidade = find(/cidade|city/)
    const colsNotas = header.map((c, idx) => /valor|mentoria|situa|status|obs/.test(c) ? idx : -1).filter(x => x >= 0)
    for (let r = h + 1; r < rows.length; r++) {
      const row = rows[r]; if (!row) continue
      const fone = iFone < row.length ? (row[iFone] || '') : ''
      if (!fone.replace(/\D/g, '')) continue
      const nome = [iNome >= 0 ? row[iNome] : '', iLast >= 0 ? row[iLast] : ''].filter(Boolean).join(' ').trim()
      const email = iEmail >= 0 ? (row[iEmail] || '') : ''
      let cid = iCidade >= 0 ? (row[iCidade] || '').trim() : ''
      if (!cid && iFone + 1 < row.length) { const nxt = (row[iFone + 1] || '').trim(); if (nxt && !/\d{6,}/.test(nxt)) cid = nxt }
      const notas = colsNotas.map(idx => (row[idx] || '').trim()).filter(Boolean).join(' · ')
      linhas.push({ nome, telefone: fone, email, notas, cidade: cid })
    }
  } else {
    const rows = texto.includes('\t')
      ? parseDelim(texto, '\t')
      : texto.split(/\r?\n/).map(l => l.split(/\s{2,}/))
    for (const row of rows) {
      const cells = row.map(s => (s || '').trim()).filter(s => s.length)
      if (!cells.length) continue
      const email = cells.find(c => c.includes('@')) || ''
      const fone = cells.find(c => c.replace(/\D/g, '').length >= 8 && /\d/.test(c)) || ''
      if (!fone) continue
      const nome = cells[0] === fone || cells[0] === email ? '' : cells[0]
      const notas = cells.filter(c => c !== nome && c !== email && c !== fone).join(' ').trim()
      linhas.push({ nome, telefone: fone, email, notas })
    }
  }
  return linhas
}

// ---- main ----
const argv = process.argv.slice(2)
const flags = argv.filter(a => a.startsWith('--'))
const pos = argv.filter(a => !a.startsWith('--'))
const [arquivo, catArg, cidadeArg, dddArg] = pos
const dry = flags.includes('--dry')
const sobrescrever = flags.includes('--sobrescrever') // forca atualizar cidade/dados mesmo se telefone ja existe
if (!arquivo) { console.error('uso: node scripts/importar-lista.mjs "<arquivo>" <categoria> [cidade] [ddd] [--dry] [--sobrescrever]'); process.exit(1) }

const categoria = catArg === 'comprador' ? 'comprador' : 'interessado'
const dddPadrao = (dddArg || '51').replace(/\D/g, '').slice(0, 2) || '51'
const nomeArq = basename(arquivo)
const cidade = ((cidadeArg || cidadeDoArquivo(nomeArq)) || '').trim() || null
const formato = /\.vcf$/i.test(nomeArq) ? 'vcf' : 'csv'

const texto = readFileSync(arquivo, 'utf8')
const linhas = parseTexto(texto, formato)

const recebidos = linhas.length
let invalidos = 0
const exemplosInvalidos = []
const porFone = new Map()
const agora = new Date().toISOString()
for (const l of linhas) {
  const tel = normFone(l.telefone, dddPadrao)
  if (!tel) { invalidos++; if (exemplosInvalidos.length < 8) exemplosInvalidos.push(l.telefone); continue }
  const ex = porFone.get(tel)
  if (ex) {
    if (!ex.nome && l.nome) ex.nome = l.nome
    if (!ex.email && l.email) ex.email = l.email
    if (!ex.notas && l.notas) ex.notas = l.notas
    if (!ex.cidade && l.cidade) ex.cidade = l.cidade
    continue
  }
  porFone.set(tel, {
    telefone: tel, nome: l.nome || null, email: l.email || null,
    cidade: cidade || l.cidade || null, categoria, origem: nomeArq, notas: l.notas || null,
    status: 'novo', atualizado_em: agora,
  })
}
const registros = [...porFone.values()]

console.log(`\nArquivo:   ${nomeArq}`)
console.log(`Categoria: ${categoria} | DDD padrao: ${dddPadrao} | Cidade: ${cidade || '(do arquivo/linha)'}`)
console.log(`Linhas lidas: ${recebidos} | validos unicos: ${registros.length} | invalidos: ${invalidos}`)
if (exemplosInvalidos.length) console.log(`Exemplos invalidos: ${exemplosInvalidos.join(', ')}`)
console.log('Amostra:', registros.slice(0, 3).map(r => `${r.nome || '—'} <${r.telefone}>`).join(' | '))

if (dry) { console.log('\n[--dry] nada gravado.'); process.exit(0) }

const env = lerEnv()
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) { console.error('faltou NEXT_PUBLIC_SUPABASE_URL / chave no .env.local'); process.exit(1) }
const supabase = createClient(url, key)

let salvos = 0
const lote = 500
for (let i = 0; i < registros.length; i += lote) {
  const chunk = registros.slice(i, i + lote)
  const { error } = await supabase
    .from('wa_contatos')
    .upsert(chunk, { onConflict: 'telefone', ignoreDuplicates: sobrescrever ? false : categoria !== 'comprador' })
  if (error) { console.error('ERRO no upsert:', error.message); process.exit(1) }
  salvos += chunk.length
}
console.log(`\nOK: ${salvos} registros enviados ao Supabase (dedup por telefone; comprador sobrescreve interessado).`)
