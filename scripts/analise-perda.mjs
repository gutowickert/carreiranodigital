import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = {}
for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim() }
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const ORG = '00000000-0000-0000-0000-0000000000cd'
const now = Date.now(), DIA = 864e5
const suf = s => (s || '').replace(/\D/g, '').slice(-8)
const ATIVAS = ['atendimento_inicial', 'lote_preco_ok', 'oferecer_bolsa', 'agendado', 'aguardando_pagamento', 'proxima_turma', 'aguardando_atendimento']

let leads = [], from = 0
for (;;) { const { data } = await sb.from('leads').select('id,nome,etapa,whatsapp,criado_em').eq('org_id', ORG).in('etapa', ATIVAS).range(from, from + 999); if (!data || !data.length) break; leads.push(...data); if (data.length < 1000) break; from += 1000 }
console.log('leads ativos:', leads.length)
const porEtapa = {}
for (const l of leads) porEtapa[l.etapa] = (porEtapa[l.etapa] || 0) + 1
console.log('por etapa:', JSON.stringify(porEtapa))

let convs = [], cf = 0
for (;;) { const { data } = await sb.from('wa_conversas').select('id,lead_id,telefone').eq('org_id', ORG).range(cf, cf + 999); if (!data || !data.length) break; convs.push(...data); if (data.length < 1000) break; cf += 1000 }
const convDeLead = {}, convPorTel = {}
for (const c of convs) { if (c.lead_id) (convDeLead[c.lead_id] = convDeLead[c.lead_id] || []).push(c.id); const s = suf(c.telefone); if (s.length === 8) (convPorTel[s] = convPorTel[s] || []).push(c.id) }
const convIdsDoLead = l => [...new Set([...(convDeLead[l.id] || []), ...(convPorTel[suf(l.whatsapp)] || [])])]
const allCids = convs.map(c => c.id)

const ultRec = {}, temEnviada = {}, ultRecTxt = {}
for (let i = 0; i < allCids.length; i += 150) {
  const chunk = allCids.slice(i, i + 150); let mf = 0
  for (;;) {
    const { data } = await sb.from('wa_mensagens').select('conversa_id,direcao,status,texto,criado_em').in('conversa_id', chunk).range(mf, mf + 999)
    if (!data || !data.length) break
    for (const m of data) {
      const t = +new Date(m.criado_em); const inb = (m.direcao === 'recebida' || m.status === 'recebida')
      if (inb) { if (!ultRec[m.conversa_id] || t > ultRec[m.conversa_id]) { ultRec[m.conversa_id] = t; ultRecTxt[m.conversa_id] = (m.texto || '').slice(0, 90) } }
      else temEnviada[m.conversa_id] = true
    }
    if (data.length < 1000) break; mf += 1000
  }
}

const NEG = /n[aã]o (tenho|quero|vou|posso|consigo|me interess|tenho interess|era isso|deu)|desist|sem interess|n[aã]o obrigad|caro demais|sem condi[cç]|outro momento|mais pra frente|talvez depois|agora n[aã]o|fica pra depois|n[aã]o vai dar/i
const cand = {}, negs = []
for (const l of leads) {
  const cids = convIdsDoLead(l)
  let ur = 0, ut = '', enviou = false
  for (const c of cids) { if (ultRec[c] && ultRec[c] > ur) { ur = ultRec[c]; ut = ultRecTxt[c] || '' } if (temEnviada[c]) enviou = true }
  const respondeu = ur > 0
  const diasResp = respondeu ? Math.floor((now - ur) / DIA) : Math.floor((now - +new Date(l.criado_em)) / DIA)
  const ehNeg = respondeu && NEG.test(ut)
  const etapaVenda = ['atendimento_inicial', 'lote_preco_ok', 'oferecer_bolsa'].includes(l.etapa)
  let motivo = null
  if (ehNeg) motivo = 'disse_nao'
  else if (etapaVenda && respondeu && diasResp >= 14 && enviou) motivo = 'respondeu_e_sumiu_14d'
  else if (etapaVenda && !respondeu && diasResp >= 14 && enviou) motivo = 'nunca_respondeu_14d'
  if (motivo) { (cand[l.etapa + '|' + motivo] = cand[l.etapa + '|' + motivo] || []).push({ id: l.id, nome: l.nome, dias: diasResp, ut }); if (ehNeg) negs.push({ nome: l.nome, etapa: l.etapa, ut: ut.slice(0, 55) }) }
}
console.log('\n=== CANDIDATOS A PERDA (etapa | motivo : qtd) ===')
let tot = 0
for (const [k, v] of Object.entries(cand).sort()) { console.log('  ' + k + ': ' + v.length); tot += v.length }
console.log('TOTAL candidatos a perda:', tot)
console.log('\n=== amostra: DISSERAM NAO (' + negs.length + ') ===')
for (const n of negs.slice(0, 14)) console.log('  [' + n.etapa + '] ' + n.nome + ' :: ' + n.ut)
