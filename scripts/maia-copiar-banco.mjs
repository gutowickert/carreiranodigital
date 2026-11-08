// Maia: cópia dos dados da Maia do banco da ESCOLA pro banco PRÓPRIO da Maia (08/11, T16 do plano de passagem).
// Copia as tabelas maia_* e os arquivos do bucket "maia". Por padrão SÓ MOSTRA o que faria (conta linhas e arquivos);
// só copia de verdade com --executar.
//
// Antes (no banco NOVO, pelo SQL Editor do Supabase): db/maia.sql, db/maia-social.sql, db/maia-gestora.sql, o bucket "maia"
// privado (já vem no maia.sql) e db/maia-cron.sql. ATENÇÃO: o maia-gestora.sql liga maia_negocios.projeto_id à tabela
// public.projetos, que só existe no banco da escola: no banco novo, tirar o "REFERENCES public.projetos(id) ON DELETE SET NULL"
// dessa linha (a coluna fica, sem a ligação). Depois da cópia, rodar
// db/maia-banco-novo-sequencias.sql no banco novo (acerta os contadores das tabelas com id numérico).
//
// Variáveis (no ambiente; o script nunca mostra o valor delas):
//   origem:  NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY   (o banco da escola, como hoje)
//   destino: MAIA_SUPABASE_URL + MAIA_SUPABASE_SERVICE_KEY           (o banco novo)
// Uso:
//   node scripts/maia-copiar-banco.mjs                 → só mostra (lê a origem e o destino, não grava nada)
//   node scripts/maia-copiar-banco.mjs --executar      → copia (com a Maia pausada: MAIA_LIGADA=0 e sem rotina, ver o plano)
//   --sem-arquivos   não mexe no bucket (só as tabelas)
//   --tabelas=negocios,leads   só essas
// A cópia é "upsert" pelo id: rodar de novo não duplica (atualiza o que já existe). As chaves cifradas (meta.wa.token,
// social_token) vão como estão: o MAIA_CRIPTO_CHAVE tem que ser o MESMO no sistema que lê o banco novo.
const EXECUTAR = process.argv.includes('--executar')
const SEM_ARQUIVOS = process.argv.includes('--sem-arquivos')
const SO = (process.argv.find(a => a.startsWith('--tabelas=')) || '').split('=')[1]?.split(',').filter(Boolean) || null

const ORIGEM = { url: (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, ''), chave: process.env.SUPABASE_SERVICE_ROLE_KEY || '' }
const DESTINO = { url: (process.env.MAIA_SUPABASE_URL || '').replace(/\/+$/, ''), chave: process.env.MAIA_SUPABASE_SERVICE_KEY || '' }
// na ordem das chaves estrangeiras (o negócio antes de tudo; o contato antes dos eventos dele; a conversa antes das mensagens)
const TABELAS = ['negocios', 'midias', 'pecas', 'campanhas', 'leads', 'lead_eventos', 'conversas', 'msgs', 'tarefas', 'metricas_dia', 'eventos', 'avisos', 'crm_dia', 'funil_semana']
const COM_ID_NUMERICO = ['lead_eventos', 'eventos']
const log = (...a) => console.log(...a)
const H = (b, extra = {}) => ({ apikey: b.chave, Authorization: 'Bearer ' + b.chave, 'Content-Type': 'application/json', ...extra })
const host = (u) => { try { return new URL(u).host } catch { return '(inválido)' } }

async function conta(b, tab) {
  const r = await fetch(`${b.url}/rest/v1/maia_${tab}?select=*`, { method: 'HEAD', headers: H(b, { Prefer: 'count=exact', Range: '0-0' }) })
  if (r.status === 404) return null   // a tabela não existe nesse banco
  if (!r.ok && r.status !== 206) throw new Error(`maia_${tab}: ${r.status}`)
  const total = (r.headers.get('content-range') || '').split('/')[1]
  return total && total !== '*' ? Number(total) : 0
}

async function* paginas(b, tab) {
  for (let de = 0; ; de += 1000) {
    const r = await fetch(`${b.url}/rest/v1/maia_${tab}?select=*&order=criado_em.asc.nullsfirst`, { headers: H(b, { Range: `${de}-${de + 999}` }) })
    let linhas
    if (!r.ok) {
      // tabela sem criado_em: sem ordem
      const r2 = await fetch(`${b.url}/rest/v1/maia_${tab}?select=*`, { headers: H(b, { Range: `${de}-${de + 999}` }) })
      if (!r2.ok) throw new Error(`ler maia_${tab}: ${r2.status} ${(await r2.text()).slice(0, 200)}`)
      linhas = await r2.json()
    } else linhas = await r.json()
    if (!linhas.length) return
    yield linhas
    if (linhas.length < 1000) return
  }
}

async function grava(b, tab, linhas) {
  const r = await fetch(`${b.url}/rest/v1/maia_${tab}`, { method: 'POST', headers: H(b, { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify(linhas) })
  if (!r.ok) throw new Error(`gravar maia_${tab}: ${r.status} ${(await r.text()).slice(0, 300)}`)
}

// todos os arquivos do bucket "maia" (as pastas são listadas uma a uma)
async function arquivos(b, prefixo = '') {
  const out = []
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${b.url}/storage/v1/object/list/maia`, { method: 'POST', headers: H(b), body: JSON.stringify({ prefix: prefixo, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }) })
    if (!r.ok) throw new Error(`listar o bucket (${prefixo || 'raiz'}): ${r.status}`)
    const itens = await r.json()
    for (const i of itens) {
      const caminho = prefixo ? `${prefixo}/${i.name}` : i.name
      if (i.id == null) out.push(...await arquivos(b, caminho))   // pasta
      else out.push({ caminho, tamanho: Number(i.metadata?.size || 0), tipo: i.metadata?.mimetype || 'application/octet-stream' })
    }
    if (itens.length < 1000) break
  }
  return out
}

async function copiaArquivo(a) {
  const d = await fetch(`${ORIGEM.url}/storage/v1/object/maia/${a.caminho}`, { headers: { apikey: ORIGEM.chave, Authorization: 'Bearer ' + ORIGEM.chave } })
  if (!d.ok) throw new Error(`baixar ${a.caminho}: ${d.status}`)
  const buf = Buffer.from(await d.arrayBuffer())
  const u = await fetch(`${DESTINO.url}/storage/v1/object/maia/${a.caminho}`, { method: 'POST', headers: { apikey: DESTINO.chave, Authorization: 'Bearer ' + DESTINO.chave, 'Content-Type': a.tipo, 'x-upsert': 'true' }, body: buf })
  if (!u.ok) throw new Error(`subir ${a.caminho}: ${u.status} ${(await u.text()).slice(0, 200)}`)
}

async function main() {
  log(`Maia · cópia do banco da escola pro banco da Maia · ${EXECUTAR ? 'EXECUTANDO A CÓPIA' : 'só mostrando o que faria (nada é gravado)'}`)
  if (!ORIGEM.url || !ORIGEM.chave) throw new Error('falta a origem: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY')
  const temDestino = !!(DESTINO.url && DESTINO.chave)
  if (EXECUTAR && !temDestino) throw new Error('falta o destino: MAIA_SUPABASE_URL e MAIA_SUPABASE_SERVICE_KEY')
  if (temDestino && host(DESTINO.url) === host(ORIGEM.url)) throw new Error('a origem e o destino são o MESMO banco: cancelado')
  log(`origem: ${host(ORIGEM.url)} · destino: ${temDestino ? host(DESTINO.url) : '(não configurado: só a origem é lida)'}`)

  log('\nTabelas:')
  const plano = []
  for (const tab of TABELAS.filter(t => !SO || SO.includes(t))) {
    const o = await conta(ORIGEM, tab)
    const d = temDestino ? await conta(DESTINO, tab) : undefined
    plano.push({ tab, o, d })
    log(`  maia_${tab.padEnd(13)} origem: ${o == null ? 'não existe' : o + ' linhas'}${temDestino ? ` · destino: ${d == null ? 'NÃO EXISTE (rodar os .sql antes)' : d + ' linhas'}` : ''}${o ? ` → ${EXECUTAR ? 'copiando' : 'copiaria'} ${o} linhas` : ''}`)
  }
  const faltando = plano.filter(p => p.o && temDestino && p.d == null)
  if (faltando.length) { log(`\nATENÇÃO: no banco novo faltam ${faltando.map(p => 'maia_' + p.tab).join(', ')}. Rode os .sql antes de copiar.`); if (EXECUTAR) throw new Error('cancelado: tabelas faltando no destino') }

  let lista = []
  if (!SEM_ARQUIVOS) {
    lista = await arquivos(ORIGEM)
    const mb = lista.reduce((s, a) => s + a.tamanho, 0) / 1e6
    const porPasta = {}
    for (const a of lista) { const k = a.caminho.split('/').slice(1, 2)[0] || '(raiz)'; porPasta[k] = (porPasta[k] || 0) + 1 }
    log(`\nArquivos do bucket "maia": ${lista.length} (${mb.toFixed(1)} MB) · por tipo de pasta: ${JSON.stringify(porPasta)} → ${EXECUTAR ? 'copiando' : 'copiaria'} todos`)
  }

  if (!EXECUTAR) {
    log('\nNada foi gravado. Pra copiar de verdade: --executar (com a Maia pausada). Depois: db/maia-banco-novo-sequencias.sql no banco novo.')
    return
  }

  for (const p of plano.filter(x => x.o)) {
    let n = 0
    for await (const linhas of paginas(ORIGEM, p.tab)) { for (let i = 0; i < linhas.length; i += 500) await grava(DESTINO, p.tab, linhas.slice(i, i + 500)); n += linhas.length }
    const depois = await conta(DESTINO, p.tab)
    log(`  maia_${p.tab}: ${n} copiadas · destino agora com ${depois}${depois < p.o ? ' (MENOS que a origem: conferir)' : ''}`)
  }
  let ok = 0, falhas = 0
  for (const a of lista) { try { await copiaArquivo(a); ok++ } catch (e) { falhas++; log('  arquivo: ' + e.message) } }
  if (lista.length) log(`  arquivos: ${ok} copiados, ${falhas} com erro`)
  log(`\nPronto. Agora rode db/maia-banco-novo-sequencias.sql no banco novo (${COM_ID_NUMERICO.map(t => 'maia_' + t).join(', ')} têm id numérico).`)
}
main().catch(e => { console.error('ERRO: ' + e.message); process.exit(1) })
