// A VERSÃO INTERNA DO MANUAL DO CLIENTE — a página dele, idêntica, com o técnico dentro em outra cor.
//
// ⚠️ POR QUE A MESMA PÁGINA, E NÃO UM MANUAL SEPARADO. Na apresentação, ela lê o manual dela no
// celular e o Nando lê o dele no computador: se as duas páginas forem iguais, ele sabe onde ela está
// só de olhar. O que ele tem a mais são os blocos azuis "Só tu vê" em cada capítulo — como funciona
// por trás, o que dá errado, o que responder. Ela nunca vê esses blocos: eles só existem nesta cópia.
//
//   node manuais/anotar.mjs ../crm-danifell/public/manual.html dani-fell
//
// Lê o manual público do cliente, injeta as notas por capítulo (pelo id da <section>) e grava em
// public/manuais/<cliente>.html — servido pela própria escola, só pra quem está logado abrir.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const [origem, cliente] = process.argv.slice(2)
if (!origem || !cliente) { console.error('uso: node manuais/anotar.mjs <manual-do-cliente.html> <chave-do-cliente>'); process.exit(1) }

// As notas, por id de capítulo (os ids das <section> da página do cliente). HTML simples.
const NOTAS = {
  'o-que-faz': `A IA de vendas (<code>lib/atendimento-ia.ts</code>, Sonnet 4.6) responde só nas etapas com "IA atende". O que ela sabe vem de <b>O que a IA sabe</b> (<code>ia_conhecimento</code>) e dos exemplos de vendas ganhas parecidas — ela não inventa preço nem condição. Os motores rodam por <code>pg_cron</code> às 9h e 23h chamando <code>/api/ia/cron-run</code> da própria instalação. <b>Se ela perguntar "e se a IA errar?"</b>: só fala o que está no conhecimento; o que não sabe vai pra IA pediu ajuda, e vocês corrigem na fonte uma vez.`,
  'entrar': `Login é Supabase Auth; o perfil (papel e setor) está em <code>usuarios_perfil</code>, e o menu esconde pelo papel — a rota confere de novo, então menu escondido não é decoração. Notificação é Web Push com as chaves VAPID da instalação, inscrição por aparelho em <code>wa_push_subs</code>, no nome de quem ligou. <b>iPhone</b> só recebe como app instalado e aberto pelo ícone. <b>"Não chegou"</b>: Ligar feito naquele aparelho? iPhone pelo ícone? permissão do navegador? desliga e liga de novo (refaz a inscrição).`,
  'dia-a-dia': `O Painel lê leads atrasados, conversas esperando resposta e tarefas vencidas — a ordem é "o que precisa de gente" primeiro. A Agenda junta quatro fontes (<code>agenda_eventos</code>, <code>tarefas</code>, <code>tarefas_lead</code>, <code>projeto_marcos</code>) e filtra por pessoa conforme o papel: admin vê todas. Mover pra etapa com data (avaliação agendada, retomar depois) pede a data e cria a tarefa do dia — é por isso que "a IA marcou" aparece na agenda.`,
  'whatsapp': `Cloud API da Meta no app da <b>empresa dela</b> (<code>WA_OFICIAL_*</code> na Vercel; webhook em <code>/api/wa-oficial/webhook</code> com o campo <code>messages</code> assinado). Mensagem chega → <code>wa_mensagens</code> → a IA decide → resposta. Uma pessoa mandando na conversa marca o atendimento como humano; a IA só volta quando o lead vai pra etapa com "IA atende". Fora da janela de 24h só sai template aprovado pela Meta. Áudio da cliente vira texto pela Deepgram — sem a chave, fica mudo. <b>Erro 190</b> = token expirado (usar token permanente de usuário do sistema). Coexistência: o número continua no WhatsApp Business do celular e entra aqui ao mesmo tempo.`,
  'funil': `As etapas vêm da tabela <code>etapas</code>, nunca do código: <code>papel</code> (ativa / parking / ganho / perda) e <code>ia_atende</code>. Ganho grava <code>valor_venda</code>, <code>produto_id</code> e <code>data_ganho</code> — é isso que alimenta Resultados e Caixa. Perda grava <code>motivo_perda_id</code>. Mover pra parking com data cria <code>tarefas_lead</code>. <b>Regra dura</b>: apagar etapa com lead dentro deixa o lead invisível pros motores (sem tarefa, sem follow-up, sem erro) — por isso o manual dela diz "mova antes".`,
  'tarefas': `A cadência por etapa está no <b>Fluxo Comercial</b> (<code>configuracoes</code>, chave <code>fluxo</code>): tipo (ligação, áudio, mensagem), dia D+N e limite. O motor da manhã gera as <code>tarefas_lead</code>; o da noite (só na Dani) vira a etapa de quem respondeu. Quem responde sai da cobrança porque a virada muda a etapa antes da próxima geração. <b>"A IA cobrou demais"</b>: olha a cadência daquela etapa e o "IA atende"; "retomar depois" respeita a data porque é parking com data.`,
  'cliente': `<b>Só existe na Dani.</b> <code>/ficha/[token]</code> e <code>/jornada/[token]</code> pelo token do lead, sem login; <code>lib/jornada.ts</code> monta a jornada e lista o que <b>nunca</b> sai pra cliente (grau de disbiose, "alterado", registro interno da sessão). Formulários <code>anamnese</code> e <code>checkin</code> em <code>formularios</code> (cada opção vale a posição; a última é sempre a melhor); medidas em <code>medidas</code>. A tela Área do cliente ordena por quem não abriu. Em outro cliente essa tela não existe — não prometer lá.`,
  'maquina': `<code>/api/maquina</code>: Sonnet 5 no modo geral (aqui), Opus 5 no marketing (GAJA); resposta transmitida; cache de 1 hora (uma conversa de 40 min custa ~US$ 0,50). Ferramentas do CRM só de leitura, com as tabelas de segredo fechadas (<code>usuarios_perfil</code>, <code>configuracoes</code>, tokens); <code>propor_*</code> vira cartão e só grava em <code>/api/maquina/executar</code> com o nome de quem confirmou. Ela <b>não tem</b> ferramenta de arquivo, git, deploy ou variável — "não mexe em código" é falta de mão, não promessa. O manual básico do sistema está no prompt: é por isso que ela responde "como faço pra…" com o nome do menu e do botão. Custo por pessoa em Custo da IA.`,
  'caixa': `Caixa (só na Dani) lê os leads em ganho do mês e os lançamentos de saída. Resultados agrega por origem e <code>utm_campaign</code>; Velocidade de Venda é <code>data_ganho − criado_em</code>; Análise de Conversão conta por etapa. Tudo depende do funil estar certo — número errado quase sempre é cartão na etapa errada ou venda sem valor. Preço muda em Produtos e entra no prompt da IA na próxima mensagem.`,
  'ajustes': `<b>O que a IA sabe</b> entra no prompt da IA de vendas na próxima mensagem (o cache do prompt invalida). Áudio pronto: <code>audios_prontos</code> com <code>quando_usar</code>, no bucket público <code>midias</code>, só <code>audio/ogg</code> opus — formato errado não chega e o sistema não avisa (<code>ffmpeg -c:a libopus</code>). Regras da Qualidade IA ficam em <code>webhook_logs</code> (origem <code>ia-regra</code>) e se integram ao contexto, não atropelam. Usuários: papel admin / gestor / vendedor decide o menu e o escopo de leads.`,
  'duvidas': `A versão completa das perguntas — as técnicas, as de dinheiro e as de medo — está no manual de Implantação (Sistemas → Manual → Implantação). Se a pergunta for técnica demais pra hora: "já vi, é X, volto em N minutos", com o X nomeado. Onde olhar quando quebra, na ordem: Custo da IA (gastou hoje?) → Webhook Logs → Vercel Logs → Supabase (<code>cron.job</code>, projeto pausado) → app Meta (token, webhook, template).`,
}

const html = readFileSync(origem, 'utf8')
let saida = html
let n = 0
for (const [id, nota] of Object.entries(NOTAS)) {
  // depois do bloco de abertura (eyebrow + título + lead) do capítulo, antes do corpo
  const re = new RegExp(`(<section id="${id}">\\s*<div class="abre">[\\s\\S]*?</div>)`)
  if (!re.test(saida)) { console.warn('capítulo sem lugar pra nota:', id); continue }
  saida = saida.replace(re, `$1\n        <aside class="tecnico"><span class="tecnico-rotulo">Só tu vê · por trás</span><p>${nota}</p></aside>`)
  n++
}

// o estilo do bloco técnico + a faixa no topo dizendo que esta é a versão interna
saida = saida.replace('</style>', `
  /* a versão interna: o técnico em outra cor, e a faixa que diz que a cliente não vê isto */
  .tecnico{border:1px dashed var(--pessoa);background:var(--pessoa-bg);color:var(--ink);border-radius:14px;padding:12px 16px;margin:0 0 18px;max-width:44rem;font-size:.95rem;line-height:1.55}
  .tecnico-rotulo{display:inline-block;font-size:.68rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--pessoa);margin-bottom:6px}
  .tecnico code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.85em;background:rgba(91,107,158,.12);padding:1px 5px;border-radius:5px}
  .tecnico p{margin:0}
  .faixa-interna{position:sticky;top:env(safe-area-inset-top,0px);z-index:10;background:var(--pessoa);color:#fff;font-size:.8rem;font-weight:700;letter-spacing:.06em;text-align:center;padding:7px 12px;margin:0 -20px}
</style>`)
saida = saida.replace('<div class="wrap">', `<div class="wrap">\n  <div class="faixa-interna">VERSÃO INTERNA — os blocos azuis são só teus; a cliente não vê</div>`)
saida = saida.replace(/<title>[^<]*<\/title>/, `<title>Manual (versão interna) — ${cliente}</title>`)

const destino = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'manuais')
mkdirSync(destino, { recursive: true })
writeFileSync(join(destino, `${cliente}.html`), saida)
console.log(`ok: ${n} capítulos anotados → public/manuais/${cliente}.html`)
