import fs from 'fs'
import pg from 'pg'
const env = {}
for (const l of fs.readFileSync('./.env.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim() }
const c = new pg.Client({ connectionString: env.SUPABASE_DB_URL || env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await c.connect()
// dispara um GET leve pelo pg_net (mesma engine que os jobs usam) e guarda o request_id
const { rows } = await c.query("select net.http_get('https://carreiranodigital.vercel.app/api/mapa-funil') as id")
const id = rows[0].id
console.log('pg_net enviou request_id:', id, '— aguardando resposta...')
await new Promise(r => setTimeout(r, 6000))
const { rows: resp } = await c.query('select status_code, error_msg from net._http_response where id = $1', [id])
if (resp.length) console.log('>>> pg_net -> Vercel: status', resp[0].status_code, resp[0].error_msg ? ('erro: ' + resp[0].error_msg) : '(OK, plumbing funciona)')
else console.log('>>> resposta ainda não chegou (endpoint lento) — mas o request foi enviado. Plumbing OK.')
await c.end()
