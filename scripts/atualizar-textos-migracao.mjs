import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = {}
for (const l of readFileSync(new URL('../.env.local', import.meta.url),'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g,'').trim()
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const ORG = '00000000-0000-0000-0000-0000000000cd'

// Reescrita: moldura "problema no número anterior" + CTA "responde com um oi" (a resposta abre a janela de 24h grátis).
// Variáveis padronizadas em 4 (nome, vendedor, curso, cidade) — sem prazo (a IA passa a data real depois da resposta).
const TEXTOS = {
  cnd_mudanca_atendimento: 'Oi {{nome}}, aqui é {{vendedor}} da Carreira no Digital. Tivemos um problema no nosso número de WhatsApp anterior e estamos te retornando por este novo número. Você tinha demonstrado interesse em {{curso}} em {{cidade}}. Me responde com um oi que eu te passo tudo por aqui — e salva este contato!',
  cnd_mudanca_lote: 'Oi {{nome}}, aqui é {{vendedor}} da Carreira no Digital. Tivemos um problema no nosso número de WhatsApp anterior — agora falo com você por este. A gente estava tratando da tua entrada em {{curso}} em {{cidade}}, com a condição do lote atual. Me responde com um oi que eu te atualizo o valor e o prazo — e salva este contato!',
  cnd_mudanca_agendado: 'Oi {{nome}}, aqui é {{vendedor}} da Carreira no Digital. Tivemos um problema no nosso número de WhatsApp anterior e voltei a falar por este. A gente tinha combinado de retomar sobre {{curso}} em {{cidade}}. Me responde com um oi que seguimos daqui — e salva este contato!',
  cnd_mudanca_pagamento: 'Oi {{nome}}, aqui é {{vendedor}} da Carreira no Digital. Tivemos um problema no nosso número de WhatsApp anterior — agora te atendo por este. Sobre tua matrícula em {{curso}} em {{cidade}}: me responde com um oi que eu te ajudo a concluir por aqui — e salva este contato!',
  cnd_mudanca_bolsa: 'Oi {{nome}}, aqui é {{vendedor}} da Carreira no Digital. Tivemos um problema no nosso número de WhatsApp anterior e estou te retornando por este. Sobre a tua entrada em {{curso}} em {{cidade}}, tenho uma condição que separei pra ti. Me responde com um oi que eu te explico — e salva este contato!',
}

for (const [nome_meta, corpo] of Object.entries(TEXTOS)) {
  const { error } = await sb.from('followup_templates')
    .update({ corpo, variaveis: 'nome,vendedor,curso,cidade', atualizado_em: new Date().toISOString() })
    .eq('org_id', ORG).eq('nome_meta', nome_meta)
  console.log(error ? `ERRO ${nome_meta}: ${error.message}` : `✓ ${nome_meta}`)
}
console.log('\nTextos atualizados.')
