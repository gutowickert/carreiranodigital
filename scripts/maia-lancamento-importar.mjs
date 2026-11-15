// Lançamento da Maia (15/11/2026): põe a lista no funil "Lançamento Maia" (a etiqueta maia = estar em maia_lanc_contatos).
// QUEM RODA É O GUTO, no computador dele (lê as chaves do .env.local na raiz do sistema). Antes, o db/maia-lancamento.sql aplicado.
//
// Sem --aplicar, só MOSTRA o que faria (não grava nada). Quem já está na lista não é mexido (nem a etapa, nem a conversa).
//
//   node scripts/maia-lancamento-importar.mjs "C:\Users\carre\Desktop\Projeto Atendente IA\lancamento-maia-disparos\remessa-1-500.csv"
//   node scripts/maia-lancamento-importar.mjs "...\remessa-1-500.csv" --aplicar
//
// O TESTE DO TIME (remessa 0): Guto, Nando, Mateus e Rick, com o WhatsApp do perfil de cada um no CRM (usuarios_perfil).
// Quem não for achado, passa à mão: --fone Mateus:5551999999999 (pode repetir).
//   node scripts/maia-lancamento-importar.mjs --teste-time
//   node scripts/maia-lancamento-importar.mjs --teste-time --aplicar
import { readFileSync } from 'node:fs'
import crypto from 'node:crypto'

const args = process.argv.slice(2)
const APLICAR = args.includes('--aplicar')
const TIME = args.includes('--teste-time')
const arquivo = args.find(a => !a.startsWith('--') && !/^\w+:\d+$/.test(a))
const fonesMao = []
for (let i = 0; i < args.length; i++) if (args[i] === '--fone' && args[i + 1]) fonesMao.push(args[++i])

function lerEnv() {
  // o .env.local da raiz desta cópia; se não tiver (a cópia de teste C:maia-lancamento), o do sistema em C:carreiranodigital
  let txt = ''
  for (const f of [new URL('../.env.local', import.meta.url), 'C:/carreiranodigital/.env.local']) { try { txt = readFileSync(f, 'utf8'); break } catch { } }
  if (!txt) { console.error('Não achei o .env.local.'); process.exit(1) }
  const env = {}
  for (const l of txt.split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim() }
  return env
}
const env = { ...lerEnv(), ...process.env }
const proprio = !!(env.MAIA_SUPABASE_URL && env.MAIA_SUPABASE_SERVICE_KEY)
const U = proprio ? env.MAIA_SUPABASE_URL : env.NEXT_PUBLIC_SUPABASE_URL
const K = proprio ? env.MAIA_SUPABASE_SERVICE_KEY : env.SUPABASE_SERVICE_ROLE_KEY
if (!U || !K) { console.error('Faltou a URL ou a chave do banco no .env.local.'); process.exit(1) }
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }
async function rest(caminho, opts = {}, url = U, h = H) {
  const r = await fetch(url + caminho, { ...opts, headers: { ...h, ...(opts.headers || {}) } })
  const t = await r.text()
  if (!r.ok) throw new Error(`banco ${r.status}: ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}

function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false
  text = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = '' }
    else cur += c
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  const [cab, ...resto] = rows.filter(r => r.some(x => x.trim()))
  return resto.map(r => Object.fromEntries(cab.map((k, i) => [k.trim(), (r[i] || '').trim()])))
}
const so = t => String(t || '').replace(/\D/g, '')
const variantes = t => { t = so(t); if (t && !t.startsWith('55') && t.length >= 10 && t.length <= 11) t = '55' + t; const alt = /^55\d{10}$/.test(t) ? t.slice(0, 4) + '9' + t.slice(4) : /^55\d{2}9\d{8}$/.test(t) ? t.slice(0, 4) + t.slice(5) : ''; return [t, alt].filter(Boolean) }

let linhas = []
if (TIME) {
  // o WhatsApp do perfil no CRM (banco da escola)
  const SU = env.NEXT_PUBLIC_SUPABASE_URL, SK = env.SUPABASE_SERVICE_ROLE_KEY
  const HS = { apikey: SK, Authorization: 'Bearer ' + SK }
  const perfis = await rest('/rest/v1/usuarios_perfil?select=nome,whatsapp,email', {}, SU, HS).catch(() => [])
  for (const quem of ['Guto', 'Nando', 'Mateus', 'Rick']) {
    const mao = fonesMao.find(f => f.toLowerCase().startsWith(quem.toLowerCase() + ':'))
    const p = perfis.find(x => new RegExp('^' + quem, 'i').test(String(x.nome || '')) || (quem === 'Nando' && /^lu[ií]s fernando/i.test(String(x.nome || ''))) || (quem === 'Rick' && /^ricardo/i.test(String(x.nome || ''))))
    const fone = mao ? so(mao.split(':')[1]) : so(p?.whatsapp)
    if (!fone) { console.log(`  FALTA o WhatsApp de ${quem}: passa com --fone ${quem}:55519XXXXXXXX`); continue }
    linhas.push({ telefone: variantes(fone)[0], nome: quem, versao: 'aluno', remessa: 0, posicao: linhas.length + 1, motivo: 'teste do time (passa pelo fluxo inteiro como cliente)' })
  }
} else {
  if (!arquivo) { console.error('Diz o arquivo da remessa (CSV) ou --teste-time.'); process.exit(1) }
  linhas = parseCSV(readFileSync(arquivo, 'utf8')).map(r => ({
    telefone: variantes(r.telefone)[0], nome: r.primeiro_nome && r.primeiro_nome !== 'tudo bem' ? r.primeiro_nome : null, nome_crm: r.nome_no_crm || null,
    versao: r.versao_do_modelo === 'aluno' ? 'aluno' : 'contato', remessa: +r.remessa || null, posicao: +r.posicao || null, nota: +r.nota_encaixe || null,
    ramo: r.ramo || null, cidade: r.cidade || null, motivo: r.motivo || null, ids_crm: r.ids_no_crm || null,
  })).filter(l => l.telefone && l.telefone.length >= 12)
}

// quem já está na lista fica como está
const ja = new Set()
for (let de = 0; ; de += 1000) {
  const parte = await rest(`/rest/v1/maia_lanc_contatos?select=telefone,wa_id`, { headers: { Range: `${de}-${de + 999}` } })
  for (const x of parte) { for (const v of variantes(x.telefone)) ja.add(v); if (x.wa_id) ja.add(x.wa_id) }
  if (parte.length < 1000) break
}
// o opt-out global da escola (quem pediu pra sair não entra)
let optout = new Set()
try {
  const SU = env.NEXT_PUBLIC_SUPABASE_URL, SK = env.SUPABASE_SERVICE_ROLE_KEY
  for (let de = 0; ; de += 1000) {
    const p = await rest('/rest/v1/wa_optout?select=telefone', { headers: { Range: `${de}-${de + 999}` } }, SU, { apikey: SK, Authorization: 'Bearer ' + SK })
    for (const x of p) for (const v of variantes(x.telefone)) optout.add(v)
    if (p.length < 1000) break
  }
} catch { console.log('  (não consegui ler o opt-out da escola; a tela de disparo confere de novo)') }

const novos = linhas.filter(l => !variantes(l.telefone).some(v => ja.has(v)) && !variantes(l.telefone).some(v => optout.has(v)))
const fora = linhas.filter(l => variantes(l.telefone).some(v => optout.has(v)))
console.log(`Banco: ${proprio ? 'próprio da Maia' : 'da escola'}`)
console.log(`No arquivo: ${linhas.length} · já na lista: ${linhas.length - novos.length - fora.length} · pediram pra sair: ${fora.length} · novos: ${novos.length}`)
console.log(`  aluno: ${novos.filter(l => l.versao === 'aluno').length} · contato: ${novos.filter(l => l.versao === 'contato').length}`)
for (const l of novos.slice(0, 5)) console.log(`  ex.: ${l.nome || '(sem nome)'} · final ${l.telefone.slice(-4)} · ${l.versao} · remessa ${l.remessa}`)
if (!APLICAR) { console.log('\nNada foi gravado. Pra gravar, roda de novo com --aplicar.'); process.exit(0) }
const agora = new Date().toISOString()
for (let i = 0; i < novos.length; i += 200) {
  const lote = novos.slice(i, i + 200).map(l => ({ ...l, etapa: 'na_lista', token: crypto.randomBytes(9).toString('base64url'), criado_em: agora, atualizado_em: agora }))
  await rest('/rest/v1/maia_lanc_contatos', { method: 'POST', body: JSON.stringify(lote), headers: { Prefer: 'return=minimal,resolution=ignore-duplicates' } })
}
console.log(`\nGravados: ${novos.length}. Eles aparecem na tela /maia/operacao/lancamento.html e no modo "Lançamento Maia" da tela de Disparos.`)
