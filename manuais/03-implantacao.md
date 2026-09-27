# Implantação — o manual interno

O que fazer depois que o sistema está pronto: ligar o que falta, o dia da implantação, e as perguntas que o cliente vai fazer, com a resposta pronta. O roteiro com as datas está em Entregas (roteiro Sistema); aqui está o como.

## Antes de começar: o que precisa existir

A regra de tudo: **toda conta é do cliente, no nome dele, paga por ele** (decidido em 19/08/2026). Nenhuma chave da escola vai pra Vercel de cliente. Isso inclui Anthropic e Deepgram, que exigem cartão internacional — é a barreira real, e a implantação tem que ajudar nesse passo ou a IA nunca liga.

Se faltar, o sistema **não quebra, só finge que funciona**: os motores rodam no horário e não decidem nada.

| Item | Onde | Sem isso |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` no nome do cliente, com limite de gasto | Vercel do cliente (`vercel env add ... production --sensitive`) | IA de vendas muda; Máquina responde "chave não instalada" |
| `DEEPGRAM_API_KEY` | Vercel | áudio do cliente chega mudo; Falar na Máquina não transcreve |
| WhatsApp oficial (5 variáveis `WA_OFICIAL_*` + 3 `META_*`) | Vercel + app Meta do cliente | nenhuma conversa entra |
| Domínio com a marca do cliente | Vercel → Domains | o link vai pro cliente final com `crm-x.vercel.app` |
| Login de cada usuário, com o papel certo; o de suporte se chama "Suporte CND" | Ajustes → Usuários | ninguém entra |
| *O que a IA sabe* preenchido | Inteligência Artificial → O que a IA sabe | a IA responde "não sei" pra tudo |
| Produtos com preço | Vendas → Produtos | a IA não fala valor |
| Etapas com "IA atende" marcado onde ela conduz | Ajustes → Etapas do Funil | a IA não responde em etapa nenhuma |
| `features.maquina = true` e `config.maquina.nome` | banco, `organizacoes.config` | o bloco Máquina CND não aparece |
| `VERIFICAR.sql` e `verificar-consultas.mjs` rodados | terminal | tabela sem proteção ou gatilho — defeito calado |

Pergunta que resolve metade dos problemas depois: **quem paga o cartão internacional?** Decide antes da implantação, não na frente do cliente.

## Ligar o WhatsApp oficial (API da Meta)

O passo mais chato e o único caminho que funciona: **Cloud API da Meta, no app Meta da empresa do cliente**. Z-API não serve. O app precisa ser do cliente porque é ele que recebe a permissão sobre o número.

O que o cliente precisa ter antes (pede na apresentação, não no dia):

1. **Gerenciador de Negócios da Meta** da empresa, com ele como administrador. Verificação da empresa (CNPJ) resolve o limite de 250 conversas/dia.
2. **Um número** com a decisão tomada: número novo, ou o atual pela coexistência (continua no app **WhatsApp Business** do celular e entra no sistema ao mesmo tempo). O WhatsApp comum não coexiste.
3. **Forma de pagamento** na conta de WhatsApp Business.

O passo a passo:

1. No app Meta do cliente: app do tipo Negócios, produto WhatsApp, configuração de Cadastro Incorporado. Anota `NEXT_PUBLIC_META_APP_ID`, `NEXT_PUBLIC_META_CONFIG_ID`, `META_APP_SECRET`.
2. Vercel: grava as três e faz deploy — sem elas a tela *Conectar WhatsApp* não deixa conectar.
3. Com o cliente logado no Facebook dele, *Conectar WhatsApp* no sistema e o fluxo da Meta. O sistema grava `phone_number_id` e `waba_id`.
4. **Token permanente** de usuário do sistema no Gerenciador de Negócios (`whatsapp_business_messaging` e `whatsapp_business_management`). O token temporário **expira em 24h** — causa nº 1 de "parou de chegar mensagem".
5. Vercel: `WA_OFICIAL_TOKEN`, `WA_OFICIAL_WABA_ID`, `WA_OFICIAL_PHONE_ID`, `WA_OFICIAL_NUMERO` (só dígitos, com 55), `WA_OFICIAL_VERIFY_TOKEN`. Deploy.
6. App Meta → WhatsApp → Configuração: webhook `https://<domínio>/api/wa-oficial/webhook`, o mesmo verify token, e **assinar o campo `messages`**.
7. **Templates**: fora da janela de 24h só sai template aprovado. Submete os de follow-up na conta dele; aprovação leva de minutos a 2 dias.
8. Teste real de um celular de fora: aparece em *WhatsApp* e a IA responde. Senão, *Webhook Logs*.

| Sintoma | Causa quase sempre |
| --- | --- |
| conectou, nenhuma mensagem entra | campo `messages` não assinado, ou verify token diferente |
| entrava e parou depois de um dia | token temporário expirou (erro 190) |
| a IA responde e o cliente não recebe | sem forma de pagamento, ou fora da janela sem template |
| "número já está em uso" | está no WhatsApp comum — migrar pro Business ou número novo |
| áudio não chega como voz | só `audio/ogg` opus; converter com `ffmpeg -c:a libopus` |

As telas da Meta mudam de nome. Na primeira hesitação, pede **print da tela inteira** e guia pelo que aparece.

## A IA de vendas

A IA só é tão boa quanto *O que a IA sabe*. Nasce vazio de propósito; vazio significa "não sei" e passa pra uma pessoa.

1. **Chave da Anthropic** com limite de gasto. Sem crédito: "credit balance too low" e a IA some sem avisar.
2. ***O que a IA sabe***: as seções (o que funcionou na GAJA): quem somos, o que vendemos, quem é o cliente, por que nós, como falamos, antes de cotar, renovação, preço e condições, marketing. Veio do Deu Venda? `o-meu-negocio.md` e `o-que-responder.md` são a fonte. Não veio? o questionário, ou *Ditar* na tela.
3. **Produtos com preço.**
4. **Etapas**: "IA atende" nas que ela conduz.
5. **Fluxo Comercial**: a cadência por etapa, ajustada com o cliente.
6. **Áudios prontos** em `audio/ogg` opus, bucket público, com o "quando usar".
7. **Os motores**: `setup-nucleo/04-crons.sql` com a URL do cliente, `pg_cron` + `pg_net` habilitados. O dump do schema **não traz os agendamentos**.
8. **Deepgram**.

Testar antes: na Máquina, *Testar a IA de vendas* com três situações reais. O que sair errado se corrige em *O que a IA sabe* (falta informação) ou em *Qualidade IA* (jeito de falar).

O modelo é o Sonnet 4.6 (o Sonnet 5 escreveu mais longo e estourou o limite no teste). Custo típico: US$ 0,05 por conversa atendida.

## Máquina CND

1. `db/maquina.sql` no Supabase do cliente: tabelas, balde `estudio`, `features.maquina = true`, `config.maquina = {nome, modo}`.
2. **Modo geral** (padrão): Sonnet 5, centavos por pergunta. **Modo marketing** (GAJA): Opus 5, precisa dos documentos do cliente em `estudio_documentos` (o export do Projeto do claude.ai).
3. Quem entra: login ativo que não seja professor (na escola: admin e comercial).
4. Chaves: Anthropic (obrigatória) e Deepgram (pro Falar).

Custo em *Custo da IA*, linha `maquina`, por pessoa: geral US$ 0,02–0,10 por pergunta e ~US$ 0,05 pra acordar depois de 1h; marketing US$ 0,37 pra acordar e US$ 0,03–0,10 por volta.

## Notificações no celular

Chaves VAPID geradas na instalação; `db/push.sql`. Cada pessoa liga o próprio aparelho: fim do menu → *Notificações no celular* → Ligar. **iPhone**: só com o sistema adicionado à Tela de Início e **aberto pelo ícone**. Quando não chega: (1) Ligar feito naquele aparelho? (2) iPhone pelo ícone? (3) permissão do navegador? (4) desliga e liga de novo; (5) `VAPID_*` e `push.sql`.

## O dia da implantação: as 2 horas

| Minuto | O que acontece | Quem faz |
| --- | --- | --- |
| 0–10 | cada um entra com o próprio login, no celular e no computador | eles |
| 10–30 | WhatsApp: conectar e mandar uma mensagem real de fora; ver entrar; ver a IA responder | eles mandam |
| 30–45 | *O que a IA sabe*: ler uma seção, mudar uma linha, ver a IA usar | eles mudam |
| 45–70 | o tour pelo manual: Painel, IA pediu ajuda, Funil (mover, marcar venda de teste), Tarefas | eles clicam |
| 70–85 | Máquina CND: "como foi a semana?" e "como faço pra…" | eles perguntam |
| 85–100 | notificações no celular de cada um | eles |
| 100–110 | contrato assinado pelo sistema | ele |
| 110–120 | combinar a leitura do mês, o canal de suporte, e as 3 coisas de amanhã | tu |

As 3 coisas de amanhã, mandadas no grupo ao sair: abrir o Painel e IA pediu ajuda às 9h; responder o que a IA não resolveu; mover pra Ganho a primeira venda com valor.

O que não fazer no dia: mexer em código, criar etapa nova na hora, prometer integração que não existe. Apagar a venda e o lead de teste antes de ir embora.

## As dúvidas que vão surgir

| Pergunta | Resposta |
| --- | --- |
| A IA vai falar besteira pro meu cliente? | Só fala o que está em *O que a IA sabe*. O que não sabe, para e chama vocês. Toda conversa fica visível; o que sair errado se corrige na fonte uma vez. |
| Posso desligar a IA numa conversa? | Sim: responde por cima que ela para; ou move pra uma etapa de pessoa. |
| Ela marca horário sozinha? | Não. Combina, move a etapa e cria a tarefa; a agenda é de vocês. |
| Quanto custa a IA por mês? | Por uso, na conta do cliente: R$ 50 a 250 em uso normal. *Custo da IA* mostra dia a dia. |
| Vou perder meu WhatsApp normal? | Com a coexistência, o número continua no WhatsApp Business do celular. Com o WhatsApp comum não dá. |
| Meus dados ficam onde? | No teu banco, na tua conta. A escola entra com login teu, quando tu pede suporte; cada ação fica registrada. |
| E se o sistema cair? | As mensagens ficam na Meta e entram quando volta. Supabase gratuito pausa após 7 dias sem uso. |
| Preciso de cartão internacional? | Pra Anthropic e Deepgram, sim. Cartão virtual de banco digital resolve. |
| A IA vai cobrar meu cliente demais? | A cadência é a que vocês definem. Quem responde sai da cobrança; quem pediu depois só recebe na data. |
| Posso criar ou apagar etapa? | Criar e renomear, sim. Apagar só sem cliente dentro. |
| Por que não um Kommo, um RD? | Aqui a IA atende e cobra sozinha, o funil é do teu jeito, e não tem preço por usuário. E é teu. |
| A Máquina pode estragar alguma coisa? | Não consegue: não tem acesso a código nem configuração, e tudo que muda passa pelo Confirmar. |
| E se eu quiser sair? | Os dados são teus e o banco é teu. |
| Quantas pessoas podem usar? | Quantas quiser, sem custo por pessoa. |

## Quando quebra: onde olhar primeiro

| Sintoma | Olha aqui | Causa comum |
| --- | --- | --- |
| a IA parou de responder | Custo da IA → Webhook Logs | chave sem crédito, chave removida, etapa sem "IA atende" |
| mensagem não entra | Webhook Logs → app Meta | token expirado (190), `messages` não assinado, verify token |
| a IA responde e o cliente não recebe | Webhook Logs | sem pagamento na Meta, fora da janela sem template, template reprovado |
| follow-up não acontece | Supabase: `cron.job`, `cron.job_run_details` | crons não recriados, URL errada, Supabase pausado |
| tela vazia sem erro | Vercel Logs; `verificar-consultas.mjs` | coluna que não existe, junção com tabela ausente |
| notificação não chega | botão Ligar no aparelho | iPhone fora do ícone, permissão, inscrição antiga |
| áudio sem texto | Vercel env | falta `DEEPGRAM_API_KEY` |
| erro 500 | Vercel Logs | migração SQL não rodada, env faltando |

O que dizer ao cliente: "já vi, é X, volto em N minutos", com o X nomeado. Depois de consertar, uma linha na ficha do projeto.

## Depois: a leitura do mês e a trimestral

A leitura do mês (dias 30 e 60) leva o que a automação fez e o que deu de lucro, e muda de assunto a cada mês:

| O número | De onde |
| --- | --- |
| conversas atendidas pela IA e cobranças sem gente | Custo da IA + Webhook Logs |
| vendas, valor e origem | Resultados |
| o que se perdeu e por quê | Motivos de perda |
| dias da primeira mensagem à venda | Velocidade de Venda |
| onde o funil vaza | Análise de Conversão |
| quanto a IA custou | Custo da IA |

O jeito rápido: na Máquina, "me conta como foi o mês: vendas, o que a IA atendeu, o que se perdeu, quanto custou". Fecha com **uma mudança** combinada. A trimestral (dia 90) é o placar dos 90 dias, antes e depois, e a mensalidade daqui pra frente — sai com a leitura mensal seguinte marcada.
