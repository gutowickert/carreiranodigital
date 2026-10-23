// LIMPAR OS ENCONTROS DO MEIO das entregas que já existem (23/10/2026).
//
// Desde 23/10/2026 a entrega nasce só com o PRIMEIRO e o ÚLTIMO encontro do roteiro; os do meio quem
// atende cria na ficha ("+ Novo encontro"). As entregas criadas antes disso ainda têm os encontros do
// meio que o roteiro calculou e ninguém combinou. Este script lista (e, com a flag, retira) esses.
//
// O QUE ENTRA NA LISTA (tem que valer TUDO):
//   - entrega ATIVA (projetos.status = 'ativo')
//   - marco de natureza 'encontro'
//   - NÃO é o primeiro nem o último encontro da entrega (pela ordem; cancelados não contam)
//   - estado 'previsto', sem data combinada, sem confirmação, sem conclusão
// Fica SEMPRE: o primeiro e o último encontro, e todo encontro combinado, confirmado, a remarcar,
// concluído ou cancelado. Tarefa interna e marco nem são olhados.
//
// COMO RODAR (a conexão vem de SUPABASE_DB_URL no .env.local; o endereço nunca é impresso):
//   node scripts/limpar-encontros-do-meio.js                 → SIMULAÇÃO: só lista, não muda nada
//   node scripts/limpar-encontros-do-meio.js --projeto=<id>  → simulação de uma entrega só
//   node scripts/limpar-encontros-do-meio.js --apagar        → APAGA o que listou (pede a flag de propósito)
// O `pg` não está nas dependências do sistema: rode com NODE_PATH apontando pra um node_modules que
// tenha o pg (ex.: NODE_PATH="C:/Users/carre/Desktop/Oito Posts/sistema/node_modules").
//
// Ao apagar: tudo numa transação só, as condições são conferidas DE NOVO no próprio DELETE (se alguém
// combinou um desses no meio do caminho, ele não é apagado), e cada entrega ganha uma linha nos
// andamentos dizendo o que saiu.

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const APAGAR = process.argv.includes('--apagar')
const SO_PROJETO = (process.argv.find(a => a.startsWith('--projeto=')) || '').slice('--projeto='.length) || null

function urlDoBanco() {
  const arq = path.join(__dirname, '..', '.env.local')
  const linha = fs.readFileSync(arq, 'utf8').split(/\r?\n/).find(l => /^SUPABASE_DB_URL\s*=/.test(l))
  if (!linha) throw new Error('SUPABASE_DB_URL não está no .env.local')
  return linha.replace(/^SUPABASE_DB_URL\s*=\s*/, '').trim().replace(/^["']|["']$/g, '')
}

const br = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—')
const quando = m => m.data_combinada
  ? new Date(m.data_combinada).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '~' + br(m.data_prevista)

const ehDoMeioSoPrevisto = m =>
  m.estado === 'previsto' && !m.data_combinada && !m.confirmado_em && !m.concluido_em

async function main() {
  const c = new Client({ connectionString: urlDoBanco(), ssl: { rejectUnauthorized: false } })
  await c.connect()
  try {
    if (!APAGAR) await c.query('SET default_transaction_read_only = on')   // simulação: o banco recusa qualquer escrita

    const params = []
    let filtro = ''
    if (SO_PROJETO) { params.push(SO_PROJETO); filtro = 'AND p.id = $1' }
    const { rows } = await c.query(`
      SELECT p.id AS projeto_id, p.org_id, p.cliente, p.produto,
             m.id, m.ordem, m.titulo, m.estado, m.data_prevista::text AS data_prevista, m.data_combinada, m.confirmado_em, m.concluido_em, m.ancora
        FROM projetos p
        JOIN projeto_marcos m ON m.projeto_id = p.id
       WHERE p.status = 'ativo' AND m.natureza = 'encontro' ${filtro}
       ORDER BY p.cliente, p.id, m.ordem`, params)

    const porProjeto = new Map()
    for (const r of rows) {
      if (!porProjeto.has(r.projeto_id)) porProjeto.set(r.projeto_id, { id: r.projeto_id, org_id: r.org_id, cliente: r.cliente, produto: r.produto, encontros: [] })
      porProjeto.get(r.projeto_id).encontros.push(r)
    }

    const plano = []   // { projeto, sai: [...], fica: [...] }
    for (const pj of porProjeto.values()) {
      const vivos = pj.encontros.filter(m => m.estado !== 'cancelado')
      if (vivos.length <= 2) { plano.push({ projeto: pj, sai: [], fica: vivos.map(m => ({ m, motivo: 'só tem as pontas' })) }); continue }
      const primeiro = vivos[0], ultimo = vivos[vivos.length - 1]
      const sai = [], fica = []
      for (const m of vivos) {
        if (m.id === primeiro.id) fica.push({ m, motivo: 'primeiro encontro' })
        else if (m.id === ultimo.id) fica.push({ m, motivo: 'último encontro' })
        else if (ehDoMeioSoPrevisto(m)) sai.push(m)
        else fica.push({ m, motivo: m.estado })
      }
      plano.push({ projeto: pj, sai, fica })
    }

    const total = plano.reduce((s, x) => s + x.sai.length, 0)
    console.log(APAGAR ? '=== MODO APAGAR ===' : '=== SIMULAÇÃO (nada é alterado; use --apagar pra apagar) ===')
    console.log(`Entregas ativas olhadas: ${plano.length}. Encontros do meio só previstos: ${total}.\n`)
    for (const { projeto: pj, sai, fica } of plano) {
      if (!sai.length) continue
      console.log(`■ ${pj.cliente} (${pj.produto})  [${pj.id}]`)
      for (const m of sai) console.log(`   - SAI : ${m.titulo} — previsto ${br(m.data_prevista)}`)
      for (const { m, motivo } of fica) console.log(`   + fica: ${m.titulo} — ${m.estado} ${quando(m)} (${motivo})`)
      console.log('')
    }
    const semNada = plano.filter(x => !x.sai.length).map(x => x.projeto.cliente)
    if (semNada.length) console.log(`Sem nada pra tirar (${semNada.length}): ${semNada.join(', ')}\n`)

    if (!APAGAR) { console.log('Simulação: nada foi apagado.'); return }
    if (!total) { console.log('Nada pra apagar.'); return }

    await c.query('BEGIN')
    let apagados = 0
    for (const { projeto: pj, sai } of plano) {
      if (!sai.length) continue
      // as condições de novo, no DELETE: o que foi combinado desde a listagem não sai
      const { rows: foram } = await c.query(`
        DELETE FROM projeto_marcos
         WHERE id = ANY($1::uuid[]) AND projeto_id = $2 AND natureza = 'encontro' AND estado = 'previsto'
           AND data_combinada IS NULL AND confirmado_em IS NULL AND concluido_em IS NULL
        RETURNING titulo`, [sai.map(m => m.id), pj.id])
      if (!foram.length) continue
      apagados += foram.length
      await c.query(`INSERT INTO projeto_andamentos (org_id, projeto_id, tipo, observacao, autor) VALUES ($1, $2, 'nota', $3, $4)`, [
        pj.org_id, pj.id,
        `🧹 Encontros do meio que ainda estavam só previstos foram retirados (agora os do meio se criam na ficha, com "+ Novo encontro"): ${foram.map(f => f.titulo).join(', ')}.`,
        'script limpar-encontros-do-meio',
      ])
    }
    await c.query('COMMIT')
    console.log(`Apagados: ${apagados} encontro(s).`)
  } catch (e) {
    try { await c.query('ROLLBACK') } catch { /* nada aberto */ }
    throw e
  } finally {
    await c.end()
  }
}

main().catch(e => { console.error('ERRO:', e.message); process.exit(1) })
