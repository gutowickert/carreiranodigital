// Teste da IA do Deu Venda (lib/ia-deu-venda.ts) e de quem vira lead pelo anúncio (lib/ctwa.ts).
// Não manda nada pra ninguém: só chama a decisão com conversas de exemplo.   npx tsx ferramentas/testes/ia-deu-venda.ts
import { readFileSync } from 'fs'
for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '') }

async function main() {
  const { codigoDaCampanha } = await import('../../lib/ctwa')
  const { decidirDeuVenda } = await import('../../lib/ia-deu-venda')
  const cods = ['deuvendalajeado', 'deuvendaportoalegre', 'anlportoalegre102601']
  const casos: [string | null, string | null][] = [
    ['DEUVENDA - ABO - LAJEADO / COM EDIÇÃO DE IA', 'deuvendalajeado'], ['DEUVENDA - WHATS - PORTO ALEGRE', 'deuvendaportoalegre'],
    ['Deu Venda POA conversas', 'deuvendaportoalegre'], ['ANLPORTOALEGRE102601 - ABO - 14/09', 'anlportoalegre102601'], ['Campanha qualquer', null], [null, null],
  ]
  let ok = 0
  for (const [c, esperado] of casos) { const r = codigoDaCampanha(c, cods); const b = r === esperado; ok += +b; console.log(b ? 'ok  ' : 'ERRO', JSON.stringify(c), '→', r) }
  console.log(`campanha → turma: ${ok} de ${casos.length}\n`)

  const key = process.env.ANTHROPIC_API_KEY!
  const conversas: [string, string, string][] = [
    ['primeira mensagem (pergunta pronta do anúncio)', 'Lajeado', 'Lead: Quero entender o Deu Venda'],
    ['lojista explicou, ainda morno', 'Lajeado', 'Lead: Quero entender o Deu Venda\nEscola: Oi! Que bom que chamou. Me conta, o que tu vende e em que cidade tu está?\nLead: tenho uma loja de roupa feminina em Estrela'],
    ['preço ANTES de explicar (espera: explica + vídeo, sem valor)', 'Porto Alegre', 'Lead: oi vi o anuncio\nEscola: Oi! Me conta, o que tu vende e em que cidade tu está?\nLead: sou dentista em canoas\nEscola: Que legal. Tu já anuncia ou já tentou anunciar?\nLead: ja tentei com agencia e nao deu nada. quanto custa?'],
    ['preço DEPOIS de explicar (espera: valor + especialista, pro time)', 'Porto Alegre', 'Lead: oi vi o anuncio\nEscola: Oi! Me conta, o que tu vende e em que cidade tu está?\nLead: sou dentista em canoas, ja tentei com agencia e nao deu nada\nEscola: Entendo. No Deu Venda tu senta com um especialista, a gente decide a estratégia do teu consultório e sobe a primeira campanha no mesmo dia, com a máquina de IA fazendo as peças. Depois são três meses de acompanhamento. Te mando um vídeo curtinho que mostra como funciona.\nEscola: [video: O Deu Venda em menos de 2 minutos]\nLead: gostei. e quanto fica?'],
    ['curioso já qualificado (espera: explica e manda o vídeo)', 'Lajeado', 'Lead: Quero entender o Deu Venda\nEscola: Oi! O que tu vende e em que cidade?\nLead: tenho uma pizzaria em teutonia\nEscola: Boa. Tu já anuncia ou já tentou?\nLead: impulsiono as vezes. mas como funciona isso de vcs?'],
    ['aceitou falar com o especialista', 'Lajeado', 'Lead: Quero entender o Deu Venda\nEscola: Oi! O que tu vende e em que cidade?\nLead: oficina mecanica em lajeado, ticket medio uns 800\nEscola: Boa. No Deu Venda um especialista decide a estratégia contigo e a gente sobe a campanha no mesmo dia, com 3 meses de acompanhamento. Posso pedir pro nosso especialista te chamar pra entender o teu negócio?\nLead: pode sim, pode me ligar amanha de tarde'],
    ['só quer aprender a anunciar', 'Lajeado', 'Lead: oi\nEscola: Oi! O que tu vende e em que cidade?\nLead: na verdade quero aprender a fazer anuncio pra trabalhar com isso, nao tenho negocio'],
  ]
  for (const [titulo, cidade, conversa] of conversas) {
    const { d } = await decidirDeuVenda(key, { nome: 'Carla Souza', cidade, conversa })
    console.log(`── ${titulo}\n   ação: ${d.acao} · ${d.temperatura}${d.mandar_video ? ' · MANDA O VÍDEO' : ''}\n   resposta: ${d.resposta}\n   pro time: ${d.resumo_pro_time}\n`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
