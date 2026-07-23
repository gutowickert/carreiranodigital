import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = {}
for (const l of readFileSync(new URL('../.env.local', import.meta.url),'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g,'').trim()
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const ORG = '00000000-0000-0000-0000-0000000000cd'

const ETAPAS = ['atendimento_inicial', 'lote_preco_ok', 'agendado', 'aguardando_pagamento', 'oferecer_bolsa']
const suf = (p) => (p || '').replace(/\D/g, '').slice(-8)

for (const etapa of ETAPAS) {
  // leads ativos dessa etapa
  const { data: leads } = await sb.from('leads').select('id, nome, whatsapp').eq('org_id', ORG).eq('etapa', etapa)
  const total = (leads || []).length
  if (!total) { console.log(`\n===== ${etapa}: 0 leads =====`); continue }

  // pra cada lead, acha a conversa e conta msgs recebidas (do cliente) e enviadas (nossas)
  const dist = { '0': 0, '1': 0, '2-3': 0, '4+': 0 } // qtd de msgs RECEBIDAS do cliente
  let semConversa = 0
  const amostraFalou = []   // leads que conversaram de verdade (>=2 recebidas)
  const amostraMudo = []    // leads que quase não falaram (0-1 recebida)

  for (const ld of leads) {
    // conversa por lead_id
    let convIds = []
    const { data: c1 } = await sb.from('wa_conversas').select('id').eq('org_id', ORG).eq('lead_id', ld.id)
    if (c1?.length) convIds = c1.map(c => c.id)
    // fallback por telefone (sufixo 8 díg)
    if (!convIds.length && ld.whatsapp) {
      const s = suf(ld.whatsapp)
      if (s.length === 8) {
        const { data: c2 } = await sb.from('wa_conversas').select('id, telefone').eq('org_id', ORG).ilike('telefone', `%${s}`)
        if (c2?.length) convIds = c2.map(c => c.id)
      }
    }
    if (!convIds.length) { semConversa++; dist['0']++; if (amostraMudo.length < 6) amostraMudo.push({ nome: ld.nome, recebidas: 0, ult: '(sem conversa vinculada)' }); continue }

    const { data: msgs } = await sb.from('wa_mensagens').select('direcao, texto, criado_em').in('conversa_id', convIds).order('criado_em', { ascending: true })
    const recebidas = (msgs || []).filter(m => m.direcao === 'recebida')
    const nRec = recebidas.length
    const bucket = nRec === 0 ? '0' : nRec === 1 ? '1' : nRec <= 3 ? '2-3' : '4+'
    dist[bucket]++
    const ultRec = recebidas.length ? (recebidas[recebidas.length - 1].texto || '(mídia)') : '—'
    if (nRec >= 2 && amostraFalou.length < 5) amostraFalou.push({ nome: ld.nome, recebidas: nRec, ult: (ultRec || '').slice(0, 70) })
    if (nRec <= 1 && amostraMudo.length < 6) amostraMudo.push({ nome: ld.nome, recebidas: nRec, ult: (ultRec || '').slice(0, 70) })
  }

  const mudos = dist['0'] + dist['1']
  const pctMudo = Math.round((mudos / total) * 100)
  console.log(`\n===== ${etapa}: ${total} leads =====`)
  console.log(`  recebidas do cliente → 0 msg: ${dist['0']} | 1 msg: ${dist['1']} | 2-3: ${dist['2-3']} | 4+: ${dist['4+']}`)
  console.log(`  "quase não falaram" (0-1 recebida): ${mudos}/${total} = ${pctMudo}%   (sem conversa vinculada: ${semConversa})`)
  console.log(`  — amostra que CONVERSOU (>=2):`)
  for (const a of amostraFalou) console.log(`      ${a.nome} [${a.recebidas}] "${a.ult}"`)
  console.log(`  — amostra que QUASE NÃO falou (0-1):`)
  for (const a of amostraMudo) console.log(`      ${a.nome} [${a.recebidas}] "${a.ult}"`)
}
console.log('\n(fim)')
