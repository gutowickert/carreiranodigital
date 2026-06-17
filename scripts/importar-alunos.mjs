// Importa COMPRADORES (alunos/formação/gestor) do workbook xlsx "importação alunos sistema".
// Restaura quem foi rebaixado a interessado. Categoria = comprador (re-promove).
// Uso: node scripts/importar-alunos.mjs [--dry]
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'

const dry = process.argv.includes('--dry')

function lerEnv() {
  const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  const env = {}
  for (const l of txt.split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim() }
  return env
}

// normalização BR (igual ao importar-lista.mjs)
function normFone(raw, dddPadrao = '51') {
  let d = (raw || '').toString().replace(/\D/g, '').replace(/^0+/, '')
  if (!d) return ''
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {}
  else if (d.length === 10 || d.length === 11) d = '55' + d
  else if (d.length === 8 || d.length === 9) d = '55' + dddPadrao + d
  else return ''
  if (d.length === 12) { const ddd = d.slice(2, 4), local = d.slice(4); if (/^[6-9]/.test(local)) d = '55' + ddd + '9' + local }
  if (!d.startsWith('55') || (d.length !== 12 && d.length !== 13)) return ''
  return d
}

function cidadeAba(nome) {
  const n = nome.toLowerCase()
  if (n.includes('santa cruz') || /\bscs\b/.test(n)) return 'Santa Cruz do Sul'
  if (n.includes('caxias')) return 'Caxias do Sul'
  if (n.includes('bento')) return 'Bento Gonçalves'
  if (n.includes('hamburgo')) return 'Novo Hamburgo'
  if (n.includes('porto') || /\bpoa\b/.test(n)) return 'Porto Alegre'
  if (n.includes('lajeado') || n.includes('janeiro') || n.includes('março') || n.includes('marco')) return 'Lajeado'
  return null
}

const wb = XLSX.readFile(new URL('./_alunos.xlsx', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const agora = new Date().toISOString()
const porFone = new Map()
let totalLinhas = 0, totalInvalidos = 0
const porAba = []

for (const aba of wb.SheetNames) {
  const ws = wb.Sheets[aba]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' })
  // acha a linha de cabeçalho (tem "nome" e "telefone")
  let h = -1, colNome = -1, colTel = -1, colEmail = -1
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const low = rows[i].map(c => c.toString().trim().toLowerCase())
    const iN = low.findIndex(c => /^nome/.test(c))
    const iT = low.findIndex(c => /telefone|celular|whats|fone/.test(c))
    if (iN >= 0 && iT >= 0) { h = i; colNome = iN; colTel = iT; colEmail = low.findIndex(c => /e-?mail/.test(c)); break }
  }
  if (h < 0) { porAba.push(`${aba}: (sem cabeçalho Nome/Telefone — pulada)`); continue }
  const cidade = cidadeAba(aba)
  let lidos = 0, validos = 0
  for (let r = h + 1; r < rows.length; r++) {
    const row = rows[r]
    const foneRaw = (row[colTel] ?? '').toString()
    if (!foneRaw.replace(/\D/g, '')) continue
    lidos++; totalLinhas++
    const tel = normFone(foneRaw)
    if (!tel) { totalInvalidos++; continue }
    validos++
    const nome = (row[colNome] ?? '').toString().trim()
    const email = colEmail >= 0 ? (row[colEmail] ?? '').toString().trim() : ''
    const ex = porFone.get(tel)
    if (ex) { if (!ex.nome && nome) ex.nome = nome; if (!ex.email && email) ex.email = email; if (!ex.cidade && cidade) ex.cidade = cidade; continue }
    porFone.set(tel, { telefone: tel, nome: nome || null, email: email || null, cidade: cidade || null, categoria: 'comprador', origem: aba, status: 'novo', atualizado_em: agora })
  }
  porAba.push(`${aba}  ->  ${cidade || '(sem cidade)'}  | ${validos} válidos de ${lidos}`)
}

const registros = [...porFone.values()]
console.log('Por aba:'); porAba.forEach(l => console.log('  ' + l))
console.log(`\nTotal: ${totalLinhas} linhas | ${registros.length} compradores únicos | ${totalInvalidos} inválidos`)
console.log('Amostra:', registros.slice(0, 4).map(r => `${r.nome || '—'} <${r.telefone}> [${r.cidade || '?'}]`).join(' | '))

if (dry) { console.log('\n[--dry] nada gravado.'); process.exit(0) }

const env = lerEnv()
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
let salvos = 0
for (let i = 0; i < registros.length; i += 500) {
  const chunk = registros.slice(i, i + 500)
  const { error } = await sb.from('wa_contatos').upsert(chunk, { onConflict: 'telefone', ignoreDuplicates: false })
  if (error) { console.error('ERRO no upsert:', error.message); process.exit(1) }
  salvos += chunk.length
}
console.log(`\nOK: ${salvos} compradores gravados (categoria=comprador, sobrescreve interessado).`)
