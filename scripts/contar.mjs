import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = {}
for (const l of readFileSync(new URL('../.env.local', import.meta.url),'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g,'').trim()
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const total = await sb.from('wa_contatos').select('*',{count:'exact',head:true})
console.log('TOTAL wa_contatos:', total.count)
// busca todas as cidades em paginas e conta
const cont = {}
let from = 0
for (;;) {
  const { data, error } = await sb.from('wa_contatos').select('cidade').range(from, from+999)
  if (error) { console.error(error.message); break }
  for (const r of data) cont[r.cidade ?? '(sem cidade)'] = (cont[r.cidade ?? '(sem cidade)']||0)+1
  if (data.length < 1000) break
  from += 1000
}
console.log('\nPor cidade:')
for (const [c,n] of Object.entries(cont).sort((a,b)=>b[1]-a[1])) console.log(`  ${String(n).padStart(5)}  ${c}`)
