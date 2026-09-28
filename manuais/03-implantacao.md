# Implantação — o manual interno

O que fazer depois que o sistema está pronto: ligar o que falta, o dia da implantação, e as perguntas que o cliente vai fazer, com a resposta pronta. O roteiro com as datas está em Entregas (roteiro Sistema); aqui está o como.

## Antes de começar: o que precisa existir

A regra de tudo: **toda conta é do cliente, no nome dele, paga por ele** (decidido em 19/08/2026). Nenhuma chave da escola vai pra Vercel de cliente. Isso inclui Anthropic e Deepgram, que exigem cartão internacional — é a barreira real, e a implantação tem que ajudar nesse passo ou a IA nunca liga.

Se faltar, o sistema **não quebra, só finge que funciona**: os motores rodam no horário e não decidem nada.

**O checklist completo dos 11 pré-requisitos** está em `setup-nucleo/SERVICOS-EXTERNOS.md` → "Checklist antes do PRIMEIRO USO" (nasceu dos esquecimentos de 27–28/09/2026: o crédito da Anthropic, a ligação da Dani, o endereço do login). **Passa por ele antes de marcar o primeiro uso, e avisa o dono do que depende dele.**

| Item | Onde | Sem isso |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` no nome do cliente, com limite de gasto **e crédito** | Vercel do cliente (`vercel env add ... production --sensitive`) | IA de vendas muda; Máquina responde "chave não instalada"; chave sem crédito é recusada calada |
| `DEEPGRAM_API_KEY` | Vercel | áudio do cliente chega mudo; Falar na Máquina não transcreve |
| WhatsApp oficial (5 variáveis `WA_OFICIAL_*` + 3 `META_*`) | Vercel + app Meta do cliente | nenhuma conversa entra |
| Endereço com a marca do cliente | `npx vercel domains add <marca>.vercel.app <projeto>` (grátis, na hora) ou domínio próprio (`sistema.<marca>.com.br`: CNAME → `cname.vercel-dns.com` no registro.br dele) | o link vai pro cliente final com `crm-x.vercel.app` |
| O endereço novo em 4 lugares | `NEXT_PUBLIC_BASE_URL` (e republicar); os agendamentos (`cron.alter_job`, o `update` direto em `cron.job` é recusado); a escola em Sistemas → Clientes; **Supabase → Authentication → URL Configuration**: Site URL e Redirect URLs (`/**`, o novo e o antigo) | o "esqueci a senha" manda pro endereço errado — já achamos `localhost:3000` na Dani |
| Ligação | **chamada pelo navegador** (`26-chamadas.sql`, Deepgram) ou API4COM (`API4COM_TOKEN`) | o botão Ligar aparece e não liga |
| Servidor de apoio das chamadas (TURN) | conta grátis na Cloudflare → `CF_TURN_KEY_ID` e `CF_TURN_API_TOKEN` | a chamada falha às vezes no 4G |
| Login de cada usuário, com o papel certo; o de suporte se chama "Suporte CND" e é protegido (`25-conta-suporte-protegida.sql`) | Ajustes → Usuários | ninguém entra; o dono pode desativar o suporte sem querer |
| Cadência de follow-up | Ajustes → Fluxo Comercial | o motor da manhã avisa "cadência não definida" e nenhum follow-up sai |
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

O passo a passo (número novo — o caminho que funcionou na Dani em 28/09/2026, ~1h30 com o cliente):

1. **Conferir que o número está livre**: abrir `https://wa.me/55DDDNUMERO` no celular. "Convidar para o WhatsApp" / "não está no WhatsApp" = livre. Se abrir uma conversa, o número está em uso: cadastrar na API tira ele daquele celular.
2. developers.facebook.com → Criar app → caso de uso **"Conectar-se com clientes pelo WhatsApp"**, no portfólio do cliente. Dentro do caso de uso (lápis → Personalizar) → **Configuração da API** → Continuar (a Meta cria a conta com um número de TESTE +1 555 — ignora).
3. Mesma tela, no fim: **Adicionar número de telefone** (nome de exibição, categoria, código por SMS/ligação). Depois, no campo "De", o número do cliente → anota a **Identificação do número** e a **da conta do WhatsApp Business** (não são segredo).
4. **Token permanente**: business.facebook.com → Configurações → Usuários do sistema. A Meta recusa nome que pareça marca ("SuporteCND", "Sistema WhatsApp") e conta não verificada tem limite — **usar o usuário que já existir** (na Dani, o "Conversions API System User"). Atribuir a ele o app e a conta do WhatsApp (a certa: a do ID anotado, não a "Test" nem a "Aplicativo WhatsApp Business") com controle total → Gerar token, validade Nunca, `whatsapp_business_messaging` + `whatsapp_business_management`. **Outro administrador do portfólio precisa aprovar** (Configurações → **Pedidos** → Needs review → Aprovar; a Meta não notifica). Depois de aprovado, gerar de novo no usuário.
5. Vercel: o token o dono cola no Terminal (`vercel env add WA_OFICIAL_TOKEN production --sensitive`); `WA_OFICIAL_PHONE_ID`, `WA_OFICIAL_WABA_ID`, `WA_OFICIAL_NUMERO` (só dígitos, 55 + DDD + 9 dígitos) e `WA_OFICIAL_VERIFY_TOKEN` (uma palavra qualquer) a gente coloca. Deploy.
6. Conferir e ligar pelo próprio sistema: `/api/wa-oficial/status` (o número tem que bater com o ID; `status` PENDING = ainda não registrado) → o dono abre `/api/wa-oficial/register?pin=NNNNNN` com um PIN de 6 dígitos que ELE guarda (vira a verificação em duas etapas) → status **CONNECTED** → `/api/wa-oficial/subscribe` (inscreve o app na conta).
7. App → caso de uso → **Configuração**: webhook `https://<domínio>/api/wa-oficial/webhook`, o mesmo verify token, Verificar e salvar, e **assinar `messages`**.
8. **Publicar o app** (Configurações do app → Básico: `/politica-privacidade` e `/termos` do sistema, categoria; depois Publicar). Sem publicar, a Meta só manda webhook de teste — nenhuma mensagem real entra.
9. Teste real de um celular de fora: manda "oi", aparece em *WhatsApp*; responde pelo sistema e o status vira "lido".
10. **Templates** (fora da janela de 24h só sai template aprovado) e **forma de pagamento** na conta do WhatsApp — só pros disparos de follow-up; responder cliente é grátis.

⚠️ A tela *Conectar WhatsApp* (Cadastro Incorporado, 3 variáveis `META_*`) grava o número em `wa_oficial_config`, que **só o follow-up lê**. A caixa de mensagens, o envio e o webhook usam as variáveis `WA_OFICIAL_*`. Pra coexistência (o número atual continua no app WhatsApp Business) o Cadastro Incorporado é o único caminho — e depois ainda é preciso pôr o token e os IDs nas `WA_OFICIAL_*`.

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

## Chamadas por voz e vídeo (no lugar da telefonia)

A ligação do sistema é **pelo navegador**: o botão **Chamar** (cartão do lead, conversa do WhatsApp, Atender, Fila de ligações) cria um link `/conversa/<codigo>`, que vai pelo WhatsApp com a prévia da marca do cliente ("Dani te convidou pra uma conversa"). O cliente toca e entra, sem instalar nada; voz ou vídeo. Quem convidou grava; ao encerrar, a gravação é juntada, transcrita na Deepgram com o nome de quem falou e vai pra `ligacoes` — o histórico do lead que a IA lê. Não precisa de API4COM nem de número de telefone.

1. `setup-nucleo/26-chamadas.sql` no Supabase do cliente (tabela protegida + pasta de gravações privada).
2. `DEEPGRAM_API_KEY` (a transcrição). Sem ela, grava e não transcreve.
3. Recomendado: servidor de apoio da Cloudflare (`CF_TURN_KEY_ID`, `CF_TURN_API_TOKEN`), grátis até 1 TB/mês. Sem ele usa um público que falha às vezes no 4G.
4. **Nenhuma chamada se perde**: se quem convidou fechar a aba sem Encerrar, a tela avisa o servidor na saída; e se mesmo assim uma ficar parada (bateria, internet), o sistema fecha, transcreve e manda pro card sozinho depois de 10 minutos sem gravação nova (ao abrir a tela Chamadas e no motor da manhã/noite). O que se perde é só o finalzinho que ainda não tinha subido (até 30 s).
5. **A espera não é muda** (desde 28/09): enquanto o outro lado não entra, toca um "chamando" (dá pra desligar) e a tela de quem convidou mostra o passo a passo — convite enviado (com o tempo de espera), **o cliente abriu o link** (um plim; ele avisa antes mesmo de clicar em Entrar) e **entrou** (outro som). Com a aba escondida, o título muda e sai um aviso no computador. Depois de 3 minutos sem abrir, a tela só orienta: o mesmo convite continua valendo — **nunca mandar um segundo link** (cliente desconfia de link, acha que é vírus).
6. **O convite chega com capa**: mandado pela conversa do WhatsApp, vai com a prévia do link ligada (logo, "Fulano te convidou pra uma conversa"), e o texto diz quem chama e de qual empresa ("Aqui é Ricardo, da Carreira no Digital"), com o link sozinho na última linha. Antes de 28/09 ia um endereço solto. Só o convite liga a prévia (`preview` em `/api/wa/enviar`); as outras mensagens seguem sem.
7. Testar com dois aparelhos antes do primeiro uso: Chamar → mandar o link → os dois entram → falar → encerrar → em 1–2 minutos aparece no histórico do lead com a transcrição.

O nome de quem convida vem do login (o Suporte CND aparece como "Suporte" pro cliente — pra teste, tudo bem; no dia a dia quem chama é a pessoa do cliente). A tela da chamada mostra **a logo da empresa** no topo (do cadastro; sem logo, o nome) e a assinatura discreta da CarreiraNoDigital; a prévia do link no WhatsApp também leva a assinatura, no pé. Na escola, a tela tem a logo da Carreira no Digital e a mesma assinatura.

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
| 85–100 | notificações no celular de cada um; uma **chamada de teste** (Chamar → link no celular de alguém) | eles |
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
| Preciso de telefonia pra ligar pro cliente? | Não. O Chamar manda um link; o cliente entra pelo navegador, com voz ou vídeo, e a conversa fica gravada e escrita no histórico. |
| O meu cliente precisa instalar alguma coisa? | Não. Toca no link, libera o microfone e entra. |
| O sistema muda depois de instalado? | Muda com vocês: cada ajuste que pedirem ganha um número de versão (aparece no rodapé do menu) pra vocês saberem o que mudou. |

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
| a chamada não conecta | sair e entrar de novo dos dois lados | logo depois de publicar/ligar o servidor falha às vezes; no 4G, falta o servidor de apoio (Cloudflare) |
| chamada sem transcrição | Vercel env; tela Chamadas → Transcrever | falta `DEEPGRAM_API_KEY`, ou ninguém falou |
| chamada não apareceu no card | tela Chamadas (abrir já processa as paradas) | foi feita sem lead (pela tela Chamadas): vincular ao lead ali; ou ainda nos 10 min da rede de segurança |
| o motor da manhã não fez follow-up | Supabase: `net._http_response` (o registro do motor) | "parou sem progresso": falta crédito/chave da IA; "cadência não definida": montar o Fluxo Comercial |
| o "esqueci a senha" abre página errada | Supabase → Authentication → URL Configuration | Site URL velho (`localhost:3000`) |

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

O jeito rápido: na Máquina, "me conta como foi o mês: vendas, o que a IA atendeu, o que se perdeu, quanto custou". Fecha com **uma mudança** combinada. Toda mudança depois do primeiro uso sobe a versão (`npm version patch --no-git-tag-version` no mesmo commit) e entra nos manuais na mesma hora. A trimestral (dia 90) é o placar dos 90 dias, antes e depois, e a mensalidade daqui pra frente — sai com a leitura mensal seguinte marcada.
