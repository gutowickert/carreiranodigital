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
  'o-que-faz': `<b>Como funciona:</b> a IA de vendas só responde nas etapas do funil marcadas pra ela atender. O que ela sabe dizer vem de um lugar só, a tela "O que a IA sabe", mais os exemplos de conversas que já viraram venda — ela imita o jeito que fechou antes. Dois motores rodam sozinhos, de manhã e à noite: o da noite vira a etapa de quem respondeu; o da manhã gera as cobranças do dia. <b>Se ela perguntar "e se a IA errar?":</b> a IA não inventa; o que não está escrito ela não promete, e o que não sabe ela para e chama vocês. Erro se corrige na fonte uma vez e não volta.`,
  'entrar': `<b>Como funciona:</b> cada pessoa tem o próprio login, e o papel dela (dona, gestora, vendedora) decide o que aparece no menu e o que ela pode fazer — o sistema confere isso de novo por baixo, então esconder do menu não é enfeite. A notificação é do navegador do celular: cada aparelho se inscreve separado, no nome de quem ligou. <b>No iPhone</b> a Apple só entrega notificação se o site foi adicionado à tela de início e aberto pelo ícone — por isso o manual insiste. <b>"Não chegou":</b> ligou naquele aparelho? iPhone aberto pelo ícone? permissão do navegador liberada? Desliga e liga de novo, que refaz a inscrição.`,
  'dia-a-dia': `<b>Como funciona:</b> o Painel junta três coisas que precisam de gente — cliente atrasado, conversa esperando resposta e tarefa vencida — e mostra isso antes de qualquer número, de propósito. A Agenda junta quatro fontes num calendário só: compromissos marcados à mão, tarefas, cobranças de cliente e marcos de projeto; cada uma vê a sua, a dona vê todas. Quando uma cliente vai pra uma etapa com data (avaliação agendada, retomar depois), o sistema pede a data e já cria a tarefa do dia — é assim que "a IA marcou" aparece na agenda sem ninguém digitar.`,
  'whatsapp': `<b>Como funciona:</b> o número dela entra no sistema pela API oficial da Meta, no cadastro da empresa dela (não no nosso). Cada mensagem que chega é guardada, a IA lê a conversa inteira e decide a resposta. Quando uma pessoa responde por cima, o sistema marca aquela conversa como atendimento humano e a IA cala; ela só volta quando a cliente for movida pra uma etapa em que a IA atende. <b>Regras da Meta que valem saber:</b> responder dentro de 24 horas da última mensagem da cliente é livre; depois disso só sai mensagem de modelo aprovado. Áudio da cliente vira texto por um serviço de transcrição — sem ele, o áudio chega mudo. <b>Se parar de chegar mensagem de um dia pro outro:</b> quase sempre é a chave de acesso da Meta que venceu; troca pela permanente. <b>Coexistência:</b> o número continua no WhatsApp Business do celular e entra aqui ao mesmo tempo. <b>A chamada (Chamar):</b> é voz/vídeo direto entre os dois navegadores, sem telefonia; quem convidou grava em pedaços de 30 segundos, e ao encerrar o sistema junta, manda pro serviço de transcrição (o mesmo do áudio) com o nome de cada lado e grava no histórico da cliente — é esse texto que a IA lê depois. <b>Se não conectar:</b> as duas saem e entram de novo; no 4G ajuda um servidor de apoio (conta grátis na Cloudflare, ainda não configurado). <b>Sem transcrição:</b> o botão Transcrever refaz; se ninguém falou, fica vazio mesmo.`,
  'funil': `<b>Como funciona:</b> as etapas são da empresa, não do sistema — dá pra renomear, criar e reordenar. Cada etapa tem um papel (ativa, esperando algo, ganho, perda) e a marca de quem atende (IA ou pessoa). Ganho pede produto e valor porque é essa venda que vira número nos Resultados e no Caixa; Perda pede o motivo porque é o motivo que a Máquina lê depois pra dizer por que se perde. <b>Por que "não apague etapa com cliente dentro":</b> o cliente fica numa etapa que os motores não conhecem — sem tarefa, sem cobrança, sem aviso. Ele some sem erro.`,
  'tarefas': `<b>Como funciona:</b> cada etapa tem uma cadência escrita no Fluxo Comercial — em quantos dias cobrar, por mensagem ou ligação, e quando parar. O motor da manhã lê essa cadência e cria as tarefas do dia; a mensagem sugerida é escrita pela IA na hora, com a conversa daquela cliente na frente. Quem responde sai da lista porque o motor da noite já mudou a etapa dela. <b>"A IA cobrou demais":</b> a resposta está na cadência daquela etapa, não na IA — ajusta lá. "Retomar depois" não recebe nada até a data porque é uma etapa de espera com data marcada.`,
  'cliente': `<b>Só existe na Dani.</b> A cliente abre a ficha e a jornada por um link com um código só dela — sem senha, e o código não se adivinha. A jornada é montada a partir do que vocês lançam (sessões, medidas, exames) e do check-in que ela responde; existe uma lista fixa do que nunca aparece pra ela (grau de disbiose, a palavra "alterado", o registro interno da sessão) — isso é regra do sistema, não cuidado de quem digita. No check-in, cada resposta vale a posição dela na lista, e a última é sempre a melhor: por isso subir no gráfico é melhorar. O botão <b>link</b> na lista só copia o link que ela já tem (é o mesmo código); não cria outro. <b>Em outro cliente</b> essa tela não existe — não prometer (na GAJA a área do cliente é outra: os seguros dele).`,
  'maquina': `<b>Como funciona:</b> é a mesma inteligência do site da Anthropic, dentro do sistema, com duas coisas a mais: ela lê os dados de verdade (clientes, vendas, funil, o que se perdeu) e guarda o que produz. Ela não muda nada sozinha: toda mudança vira um cartão, e só grava depois do clique, com o nome de quem confirmou. <b>Por que ela não pode estragar nada:</b> ela simplesmente não tem acesso a código, telas nem configuração — não é uma promessa, é falta de mão. E não lê as tabelas com segredo (logins, chaves). <b>Custo:</b> centavos por pergunta; acordar depois de uma hora parada custa um pouco mais. Custo da IA mostra por pessoa. O "Como faço…" funciona porque o manual básico do sistema está dentro dela.`,
  'caixa': `<b>Como funciona:</b> o Caixa (só na Dani) soma as vendas marcadas como Ganho no mês e o que vocês lançam de saída — não tem digitação de entrada, de propósito, pra não ter dois números diferentes pra mesma venda. Resultados separa as vendas por origem e por campanha; Velocidade de Venda conta os dias da primeira mensagem até o Ganho; Análise de Conversão conta quantas ficaram em cada etapa. <b>Número estranho</b> é quase sempre cartão na etapa errada ou venda marcada sem valor. Preço muda em Produtos e a IA já fala o novo na próxima mensagem.`,
  'ajustes': `<b>Como funciona:</b> o que está em "O que a IA sabe" entra na cabeça da IA na próxima mensagem — não precisa reiniciar nada, e é por isso que o manual diz "lê de novo antes de salvar". Áudio pronto: a IA escolhe mandar pelo texto de "quando usar"; o arquivo precisa estar no formato de mensagem de voz do WhatsApp, senão a Meta recusa em silêncio e ninguém vê — por isso manda pro suporte converter. Qualidade IA: a regra que vocês dão se integra ao que a IA já sabe, não atropela. Usuários: o papel de cada um decide o que ela vê.`,
  'duvidas': `A lista completa das perguntas — as técnicas, as de dinheiro e as de medo — está em Sistemas → Manual → Implantação, com a resposta pronta. <b>Quando não souber na hora:</b> "já vi, é isso, volto em tantos minutos" — dizendo o quê, nunca "não sei o que houve". <b>Onde olhar quando algo para</b>, nesta ordem: Custo da IA (a IA gastou hoje? se não, é chave ou etapa), Webhook Logs (a mensagem chegou? a resposta saiu?), depois a hospedagem e o banco, depois a Meta (chave de acesso, modelo de mensagem).`,
}

const html = readFileSync(origem, 'utf8')
let saida = html
// ⚠️ A VERSÃO INTERNA SÓ ESCUTA, NUNCA AVISA. A página dela manda "estou no capítulo X"; a cópia
// dele herdaria esse aviso e diria que ELA está onde ELE rolou — sobrescrevendo o sinal de verdade.
// Aconteceu (27/09): "quando eu mexo no interno fica dizendo que ela está nesse mesmo".
saida = saida.replace(/\n\s*\/\/ AVISA ONDE ELA ESTÁ[\s\S]*?marcar\(\);\n(?=\s*\}\)\(\);\s*<\/script>)/, '\n    marcar();\n')
if (/api\/manual\/presenca', \{ method: 'POST'/.test(saida)) { console.error('a versão interna ainda avisa presença — o padrão do aviso mudou na página do cliente'); process.exit(1) }
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

// ONDE ELA ESTÁ, EM TEMPO REAL. A versão interna pergunta à escola a cada 3 s em que capítulo a
// leitora está (a página dela avisa) e pinta o capítulo com um véu coral transparente, marca o
// índice e oferece o pulo pra lá. Passou 60 s sem sinal, some — ela fechou a página.
saida = saida.replace('</style>', `
  section.ela{position:relative;background:rgba(254,161,164,.18);outline:2px solid rgba(254,161,164,.55);outline-offset:14px;border-radius:12px;transition:background .3s ease}
  section.ela::after{content:"ela está aqui";position:absolute;top:-30px;right:0;font-size:.7rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#8F3A41;background:var(--coral);padding:4px 10px;border-radius:999px}
  nav.indice a.ela{box-shadow:inset 0 0 0 2px var(--coral)}
  nav.indice a.ela::after{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--coral-deep);margin-left:8px;animation:pulsa 1.2s ease-in-out infinite}
  @keyframes pulsa{0%,100%{opacity:.35}50%{opacity:1}}
  .ir-ela{position:fixed;right:18px;bottom:calc(18px + env(safe-area-inset-bottom,0px));z-index:20;background:var(--coral-deep);color:#fff;border:none;border-radius:999px;padding:12px 18px;font:700 .9rem "Nunito Sans",system-ui,sans-serif;box-shadow:var(--shadow);cursor:pointer;display:none}
  .ir-ela.on{display:inline-flex;align-items:center;gap:8px}
</style>`)
saida = saida.replace('</body>', `<button class="ir-ela" id="ir-ela" type="button">ir pra onde ela está</button>
<script>
  (function(){
    var cliente = ${JSON.stringify(cliente)};
    var botao = document.getElementById('ir-ela');
    var atualEla = '';
    function pintar(secao){
      document.querySelectorAll('section.ela').forEach(function(s){ s.classList.remove('ela'); });
      document.querySelectorAll('nav.indice a.ela').forEach(function(a){ a.classList.remove('ela'); });
      atualEla = secao || '';
      if (!secao) { botao.classList.remove('on'); return; }
      var s = document.getElementById(secao); if (s) s.classList.add('ela');
      var a = document.querySelector('nav.indice a[href="#' + secao + '"]'); if (a) a.classList.add('ela');
      var t = a ? a.textContent.replace(/^\d+\s*/, '').trim() : secao;
      botao.textContent = 'ela está em: ' + t + ' — ir pra lá';
      botao.classList.add('on');
    }
    botao.addEventListener('click', function(){ var s = document.getElementById(atualEla); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    function perguntar(){
      fetch('/api/manual/presenca?cliente=' + encodeURIComponent(cliente), { cache: 'no-store' })
        .then(function(r){ return r.json(); }).then(function(j){ pintar(j && j.secao ? j.secao : ''); }).catch(function(){});
    }
    perguntar(); setInterval(function(){ if (!document.hidden) perguntar(); }, 3000);
  })();
</script>
</body>`)

const destino = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'manuais')
mkdirSync(destino, { recursive: true })
writeFileSync(join(destino, `${cliente}.html`), saida)
console.log(`ok: ${n} capítulos anotados → public/manuais/${cliente}.html`)
