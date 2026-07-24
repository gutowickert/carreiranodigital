import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = {}
for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim() }
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const ORG = '00000000-0000-0000-0000-0000000000cd'
const MOTIVO_SEM_RESPOSTA = 'f972b270-691a-4e24-bd79-3b7583970a51'
const now = Date.now(), DIA = 864e5
const suf = s => (s || '').replace(/\D/g, '').slice(-8)
const NEG = /n[aã]o (tenho|quero|vou|posso|consigo|me interess|tenho interess|era isso|deu)|desist|sem interess|n[aã]o obrigad|caro demais|sem condi[cç]|outro momento|mais pra frente|talvez depois|agora n[aã]o|fica pra depois|n[aã]o vai dar/i

const { data: leads } = await sb.from('leads').select('id,nome,etapa,whatsapp,criado_em,vendedor_id').eq('org_id', ORG).eq('etapa', 'lote_preco_ok')
let convs = [], cf = 0
for (;;) { const { data } = await sb.from('wa_conversas').select('id,lead_id,telefone').eq('org_id', ORG).range(cf, cf + 999); if (!data || !data.length) break; convs.push(...data); if (data.length < 1000) break; cf += 1000 }
const convDeLead = {}, convPorTel = {}
for (const c of convs) { if (c.lead_id) (convDeLead[c.lead_id] = convDeLead[c.lead_id] || []).push(c.id); const s = suf(c.telefone); if (s.length === 8) (convPorTel[s] = convPorTel[s] || []).push(c.id) }
const convIdsDoLead = l => [...new Set([...(convDeLead[l.id] || []), ...(convPorTel[suf(l.whatsapp)] || [])])]
const allCids = [...new Set(leads.flatMap(convIdsDoLead))]
const ultRec = {}, temEnviada = {}, ultRecTxt = {}
for (let i = 0; i < allCids.length; i += 150) {
  const chunk = allCids.slice(i, i + 150); let mf = 0
  for (;;) {
    const { data } = await sb.from('wa_mensagens').select('conversa_id,direcao,status,texto,criado_em').in('conversa_id', chunk).range(mf, mf + 999)
    if (!data || !data.length) break
    for (const m of data) { const t = +new Date(m.criado_em); const inb = (m.direcao === 'recebida' || m.status === 'recebida'); if (inb) { if (!ultRec[m.conversa_id] || t > ultRec[m.conversa_id]) { ultRec[m.conversa_id] = t; ultRecTxt[m.conversa_id] = (m.texto || '').slice(0, 90) } } else temEnviada[m.conversa_id] = true }
    if (data.length < 1000) break; mf += 1000
  }
}
const alvo = []
for (const l of leads) {
  const cids = convIdsDoLead(l)
  let ur = 0, ut = '', enviou = false
  for (const c of cids) { if (ultRec[c] && ultRec[c] > ur) { ur = ultRec[c]; ut = ultRecTxt[c] || '' } if (temEnviada[c]) enviou = true }
  const respondeu = ur > 0
  const diasResp = respondeu ? Math.floor((now - ur) / DIA) : Math.floor((now - +new Date(l.criado_em)) / DIA)
  const ehNeg = respondeu && NEG.test(ut)
  if (respondeu && !ehNeg && diasResp >= 14 && enviou) alvo.push({ ...l, diasResp, ut })
}
console.log('ALVO (lote, respondeu e sumiu 14+ dias):', alvo.length)
const agora = new Date().toISOString()
for (const l of alvo) {
  await sb.from('leads').update({ etapa: 'perda', data_perda: agora, motivo_perda_id: MOTIVO_SEM_RESPOSTA, atualizado_em: agora }).eq('id', l.id)
  await sb.from('tarefas_lead').update({ cancelada: true, cancelada_em: agora, atualizado_em: agora }).eq('lead_id', l.id).eq('concluida', false).eq('cancelada', false)
  await sb.from('lead_andamentos').insert({ lead_id: l.id, vendedor_id: l.vendedor_id, tipo: 'mudanca_etapa', etapa_anterior: 'lote_preco_ok', etapa_nova: 'perda', observacao: `Perda (Sem resposta): recebeu preço/lote e sumiu há ${l.diasResp} dias. Última fala: "${(l.ut || '').slice(0, 50)}"` })
  console.log(`  ✗ ${l.nome} | ${l.diasResp}d | "${(l.ut || '').slice(0, 45)}"`)
}
console.log('marcados como perda:', alvo.length)
