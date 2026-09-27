# O manual do cliente — em paralelo

O cliente lê o manual dele, capítulo por capítulo; tu lê este, no mesmo capítulo, com o que está por trás. Os capítulos são os mesmos, na mesma ordem. Cada um tem **o que o cliente lê** (o resumo do que está na página dele) e **por trás** (como funciona de verdade, o que pode dar errado, e o que responder se perguntarem).

## Os links pra mandar

| Cliente | O manual dele | Estado |
| --- | --- | --- |
| Espaço Dani Fell | [crm-danifell.vercel.app/manual.html](https://crm-danifell.vercel.app/manual.html) | pronto — página pública, sem login, com a marca dela |
| GAJA | — | em construção; sai da implantação |

A página do cliente é feita por cliente, na etapa "Primeiras modificações" do roteiro Sistema, com a logo e a cor dele. O texto-base é o mesmo em todos; muda o que só aquele cliente tem.

## 1 · O que o sistema faz

**O cliente lê:** o WhatsApp vira atendimento organizado; a IA responde, anota a etapa, cobra quem sumiu; vocês entram só onde uma pessoa faz diferença. A lista de telas em uma linha cada. O que o sistema não faz.

**Por trás:** a IA de vendas (`lib/atendimento-ia.ts`, Sonnet 4.6) responde só nas etapas com "IA atende"; o que ela sabe vem de `ia_conhecimento` (tela *O que a IA sabe*) e dos exemplos de vendas ganhas parecidas. Os motores rodam por `pg_cron` às 9h e 23h chamando `/api/ia/cron-run` da própria instalação. Se o cliente perguntar "e se a IA errar?": ela só fala o que está no conhecimento, e o que não sabe vai pra *IA pediu ajuda*.

## 2 · Entrar e o celular

**O cliente lê:** o endereço, o login de cada um, adicionar à tela de início, abrir pelo ícone, ligar as notificações no fim do menu.

**Por trás:** login é Supabase Auth; o perfil (papel e setor) está em `usuarios_perfil`, e o menu esconde pelo papel — a rota confere de novo. Notificação é Web Push com as chaves VAPID da instalação, inscrição por aparelho em `wa_push_subs` no nome de quem ligou. iPhone só recebe como app instalado (PWA) aberto pelo ícone. "Não chegou": Ligar feito naquele aparelho? iPhone pelo ícone? permissão do navegador? desliga e liga.

## 3 · Painel e Agenda

**O cliente lê:** o Painel abre com o que precisa de gente, depois os números; a Agenda junta compromissos, tarefas, cobranças e marcos.

**Por trás:** o Painel lê leads atrasados, conversas esperando resposta e tarefas vencidas; a Agenda junta quatro fontes (`agenda_eventos`, `tarefas`, `tarefas_lead`, `projeto_marcos`) e mostra por pessoa conforme o papel — admin vê todos. Etapa com data (agendado, retomar depois) cria a tarefa do dia ao mover.

## 4 · WhatsApp e a IA

**O cliente lê:** as conversas entram pela API oficial; a IA responde no tom da empresa; chama vocês quando não sabe; responder por cima faz ela parar; devolver é mover pra uma etapa da IA.

**Por trás:** Cloud API da Meta no app do cliente (`WA_OFICIAL_*` na Vercel, webhook em `/api/wa-oficial/webhook` com o campo `messages` assinado). Mensagem do cliente → `wa_mensagens` → a IA decide (cache do prompt por conversa) → resposta. Uma pessoa mandando na conversa marca o atendimento como humano; a IA só volta quando o lead vai pra etapa com "IA atende". Fora da janela de 24h só sai template aprovado. Áudio do cliente vira texto pela Deepgram — sem a chave, fica mudo. Erro 190 = token expirado.

## 5 · O Funil

**O cliente lê:** cada cliente é um cartão; mover, ganhar (produto e valor), perder (motivo); abrir o cartão mostra tudo.

**Por trás:** as etapas vêm da tabela `etapas` (nunca do código): `papel` ativa/parking/ganho/perda e `ia_atende`. Ganho grava `valor_venda`, `produto_id`, `data_ganho` — é isso que alimenta Resultados e Caixa. Perda grava `motivo_perda_id`. Mover pra etapa de parking com data cria `tarefas_lead`. Regra dura: nunca escrever chave de etapa no código; apagar etapa com lead dentro deixa lead invisível pros motores.

## 6 · Tarefas e a cobrança

**O cliente lê:** a lista de quem cobrar hoje, com a mensagem sugerida; concluir cria a próxima; o motor roda de manhã e à noite; quem pediu depois só recebe na data.

**Por trás:** a cadência por etapa está em *Fluxo Comercial* (`configuracoes`, chave `fluxo`): tipo (ligação, áudio, mensagem), dia D+N, limite. O motor da manhã gera as `tarefas_lead`; o da noite vira etapa de quem respondeu. Quem responde sai da cobrança porque a virada muda a etapa. "A IA cobrou demais": olha a cadência daquela etapa e o `ia_atende`.

## 7 · A cliente (ficha, jornada, check-in)

**O cliente lê:** a cliente abre a ficha e a jornada pelo link sem login; vocês lançam medidas, exames e sessões; o check-in semanal vira gráfico; o que a cliente nunca vê.

**Por trás (só na Dani):** `/ficha/[token]` e `/jornada/[token]` por token do lead; `lib/jornada.ts` monta tudo e lista o que nunca sai (grau de disbiose, "alterado", registro interno). Formulários `anamnese` e `checkin` em `formularios`; medidas em `medidas`. A tela *Área do cliente* ordena por quem não abriu. Em outro cliente essa tela não existe — não prometer.

## 8 · Máquina CND

**O cliente lê:** uma IA que conhece o sistema e o negócio; perguntar, aprender o sistema, produzir, pesquisar; falar por áudio; o cartão de Confirmar; o que ela não faz.

**Por trás:** `/api/maquina` — Sonnet 5 no modo geral, Opus 5 no marketing; streaming; cache de 1h; ferramentas do CRM só de leitura (`consultar`/`agregar` com tabelas de segredo fechadas) mais `propor_*` que vira cartão e só grava em `/api/maquina/executar` com o nome de quem confirmou. Ela não tem ferramenta de arquivo, git, deploy ou env — a regra "não mexe em código" é falta de mão, não prompt. Custo por pessoa em *Custo da IA*.

## 9 · Caixa e resultados

**O cliente lê:** o mês em quatro números; entradas vêm das vendas; a venda que não aparece é cartão fora de Ganho; Resultados e Velocidade de Venda saem do funil.

**Por trás:** Caixa (só na Dani) lê os leads em ganho do mês e os lançamentos de saída. Resultados agrega por origem e `utm_campaign`; Velocidade de Venda é `data_ganho - criado_em`; Análise de Conversão conta por etapa. Tudo depende do funil estar certo — número errado quase sempre é cartão na etapa errada ou venda sem valor.

## 10 · Ajustes

**O cliente lê:** o que eles mesmos mudam — produtos, o que a IA sabe, áudios, etapas, fluxo, motivos de perda, qualidade IA, usuários — e as duas regras (reler antes de salvar; não apagar etapa com cliente dentro).

**Por trás:** *O que a IA sabe* entra no prompt da IA de vendas na próxima mensagem (cache invalida). Áudio pronto: `audios_prontos` com `quando_usar`, bucket público `midias`, só `audio/ogg` opus — formato errado não chega e não avisa. Regras da *Qualidade IA* ficam em `webhook_logs` (origem `ia-regra`) e se integram ao contexto. Usuários: papel admin/gestor/vendedor decide o menu e o escopo de leads.

## 11 · Dúvidas

**O cliente lê:** as respostas curtas (IA errou → corrigir na fonte; cliente sumiu → Perda ou Retomar depois; notificação; venda no Caixa; custo; o que não fazer) e o canal: Suporte CND pelo WhatsApp.

**Por trás:** a tabela "As dúvidas que vão surgir" do manual de Implantação tem a versão completa, com as de dinheiro e as de medo. Se a pergunta for técnica demais pra responder na hora, "já vi, é X, volto em N minutos" — e a resposta entra aqui depois.
