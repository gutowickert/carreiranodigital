import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = {}
for (const l of readFileSync(new URL('../.env.local', import.meta.url),'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g,'').trim()
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const ORG = '00000000-0000-0000-0000-0000000000cd'

// 1) inspeciona um template existente pra ver as colunas reais
const { data: amostra } = await sb.from('followup_templates').select('*').eq('org_id', ORG).limit(1)
console.log('COLUNAS:', amostra?.[0] ? Object.keys(amostra[0]).join(', ') : '(sem linhas)')
console.log('AMOSTRA:', JSON.stringify(amostra?.[0] || {}, null, 2))

// 2) maior ordem atual (pra os novos irem pro fim)
const { data: todos } = await sb.from('followup_templates').select('nome_meta, ordem').eq('org_id', ORG)
const maxOrdem = Math.max(0, ...(todos || []).map(t => Number(t.ordem) || 0))
console.log('\nTemplates existentes:', (todos || []).map(t => t.nome_meta).join(', '))
console.log('maxOrdem:', maxOrdem)

// 3) os 5 templates de migração de número (aviso "mudamos de número" + andamento por etapa)
const MIGRACAO = [
  { etapa: 'atendimento_inicial', nome_meta: 'cnd_mudanca_atendimento', variaveis: 'nome,vendedor,curso,cidade',
    corpo: 'Oi {{nome}}, aqui é {{vendedor}} da Carreira no Digital. Trocamos o número de atendimento — salva este contato! A gente tava conversando sobre {{curso}} em {{cidade}}. Me conta teu objetivo que eu te mostro como isso funciona no teu caso.' },
  { etapa: 'lote_preco_ok', nome_meta: 'cnd_mudanca_lote', variaveis: 'nome,vendedor,curso,cidade,prazo',
    corpo: 'Oi {{nome}}, {{vendedor}} da Carreira no Digital — agora atendo por este número, salva aí! Sobre {{curso}} em {{cidade}}: a condição do lote atual vale até {{prazo}}. Ainda dá tempo. Quer que eu te passe os detalhes?' },
  { etapa: 'agendado', nome_meta: 'cnd_mudanca_agendado', variaveis: 'nome,vendedor,curso,cidade',
    corpo: 'Oi {{nome}}, {{vendedor}} da Carreira no Digital — atendo por este número agora, salva aí! A gente tinha combinado de retomar sobre {{curso}} em {{cidade}}. Seguimos por aqui?' },
  { etapa: 'aguardando_pagamento', nome_meta: 'cnd_mudanca_pagamento', variaveis: 'nome,vendedor,curso,cidade',
    corpo: 'Oi {{nome}}, {{vendedor}} da Carreira no Digital — novo número de atendimento, salva este! Sobre tua matrícula em {{curso}} em {{cidade}}: conseguiu concluir o pagamento? Qualquer coisa eu te ajudo por aqui.' },
  { etapa: 'oferecer_bolsa', nome_meta: 'cnd_mudanca_bolsa', variaveis: 'nome,vendedor,curso,cidade',
    corpo: 'Oi {{nome}}, {{vendedor}} da Carreira no Digital — mudamos de número, salva este contato! Consegui uma condição especial pra tua entrada em {{curso}} em {{cidade}}. Posso te explicar como funciona?' },
]

// não duplica: pula os que já existem por nome_meta
const jaTem = new Set((todos || []).map(t => t.nome_meta))
const inserir = MIGRACAO.filter(t => !jaTem.has(t.nome_meta)).map((t, i) => ({
  org_id: ORG,
  etapa: t.etapa,
  produto: 'ambos',
  categoria: 'utilidade',
  tipo_janela: 'template',
  corpo: t.corpo,
  nome_meta: t.nome_meta,
  variaveis: t.variaveis,
  status: 'rascunho',
  ordem: maxOrdem + 10 + i,
  ativo: true,
}))

if (!inserir.length) { console.log('\nNada a inserir (todos os 5 já existem).'); process.exit(0) }

const { data: ins, error } = await sb.from('followup_templates').insert(inserir).select('nome_meta, etapa, ordem')
if (error) { console.error('\nERRO NO INSERT:', error.message); process.exit(1) }
console.log('\n✅ Inseridos', ins.length, 'templates de migração:')
for (const r of ins) console.log(`  ${r.nome_meta}  (${r.etapa}, ordem ${r.ordem})`)
