# Maia: pedir as permissões do Instagram e do Facebook na Meta (análise do app)

Escrito em 16/11/2026 pra tarefa do Nando (documento do Guto, item 4; roteiros da tarefa T10 da passagem). App **Sistema CND (2069913353660247)**.

## Antes de gravar

0a. **O login do dono (16/11):** o link de conectar (aba Dados → "Gerar link pro dono conectar") agora tem um 2º botão, **"Conectar Instagram e Facebook"**: o dono entra com o Facebook, marca a página e o Instagram, e a Maia guarda a chave da página (cifrada). É ESSE login que os vídeos A, B e C mostram no começo. O botão só aparece com a configuração do social criada na Meta (Login do Facebook para Empresas → Configurações → Criar configuração, "Token de acesso do usuário", permissões `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`, `read_insights`, `business_management`) e o ID dela em `MAIA_META_CONFIG_SOCIAL` (ou no padrão do código, `app/api/maia/conectar/social/route.ts`). Teste: `scripts/maia-teste-conectar-social.mjs` (18/18, Meta de mentira).
0. ✅ (publicada em 16/11) **A aba Social do painel da equipe tem que estar no ar.** Em 16/11 ela não está no main nem em nenhum ramo enviado (só a parte por trás, `/api/maia/social`). O documento do Guto diz que está com o Claude dele, esperando o SQL do recado (`db/maia-recado-base.sql`) e o "publica". Pedir pro Guto enviar o ramo; sem a tela, os vídeos A, B e C não têm o que mostrar. O vídeo D não depende dela.
1. O domínio do login já liberado (Login do Facebook para Empresas → Configurações → SDK do JavaScript ligado, domínios `https://www.carreiranodigital.com/` e `https://carreiranodigital.com/`). Sem isso o login nem abre no vídeo.
2. Uma conta de teste com uma Página do Facebook e um Instagram profissional ligado a ela (pode ser a da escola).
3. Gravação de tela no Mac: Cmd+Shift+5 → "Gravar tela inteira". 1 a 2 minutos por vídeo. Sem áudio, com a legenda em inglês abaixo colada num texto na tela ou falada em inglês.
4. Onde pedir: developers.facebook.com → app Sistema CND → **Análise do app → Permissões e recursos** → em cada permissão, **Solicitar acesso avançado**. Cada uma pede: o texto de uso (abaixo, em inglês), o vídeo e as instruções de teste.

## Enquanto a Meta não aprova

Com acesso padrão, as permissões já funcionam pra quem tem uma função no app. Pra lotérica (quinta, 19/11): pôr o dono, ou quem administra o Instagram dela, como **Testador** (Funções do app → Funções → Adicionar pessoas → Testador). Ele aceita em developers.facebook.com/requests. Daí a Maia posta por ele normalmente.

## As permissões

| Permissão | Pra quê na Maia | Vídeo |
|---|---|---|
| `instagram_content_publish` | postar no Instagram do cliente o post que a equipe e o dono aprovaram | A |
| `instagram_basic` | ler o perfil e os posts do Instagram do cliente (pra montar a grade e não repetir) | A |
| `instagram_manage_insights` | ler alcance, salvamentos e curtidas dos posts pra mostrar ao dono | B |
| `pages_show_list` | listar as Páginas no login, pro dono escolher a dele | A |
| `pages_manage_posts` | postar na Página do Facebook do cliente o mesmo post aprovado | C |
| `pages_read_engagement` | ler os posts e o engajamento da Página | C |
| `read_insights` | ler os números da Página pro relatório do dono | B |
| `whatsapp_business_manage_events` | mandar pra Meta as conversas e vendas que acontecem no WhatsApp do cliente (pra o anúncio aprender com quem compra) | D |

Um vídeo pode servir pra mais de uma permissão: a Meta pede um por permissão, então sobe o mesmo arquivo em cada uma que ele mostra.

### Vídeo A · login e post no Instagram (`instagram_content_publish`, `instagram_basic`, `pages_show_list`)
1. Abrir o link de conectar do painel da equipe → "Conectar Instagram e Facebook" → escolher a Página e a conta do Instagram → permitir → "Pronto! … conectados à Maia".
2. Painel da equipe → o negócio → aba Social → um post agendado (foto da biblioteca do negócio + legenda).
3. Mostrar a aprovação da equipe e o 👍 do dono no WhatsApp.
4. Abrir o Instagram e mostrar o post publicado.

Texto de uso (colar no campo "How will your app use this permission"):
> Maia is a marketing assistant for small businesses. The business owner logs in with Facebook Login for Business and selects their Facebook Page and Instagram professional account. Our team and the owner review and approve every post before it is published. After the owner approves, Maia publishes the approved photo and caption to the owner's Instagram account at the scheduled time. We use instagram_basic to read the account profile and recent posts so we do not repeat content, and pages_show_list so the owner can pick which Page to connect. We never publish anything the owner has not approved.

### Vídeo B · resultados dos posts (`instagram_manage_insights`, `read_insights`)
1. Mesmo login.
2. Painel → resultados do post publicado (alcance, salvamentos, curtidas).
3. O relatório do mês que o dono recebe, usando esses números.

> After a post is published, Maia reads the post's reach, saves and likes (and the Page's insights) only to show the business owner how their own posts performed, in a weekly and monthly report inside our dashboard. The data is not shared with anyone else.

### Vídeo C · Página do Facebook (`pages_manage_posts`, `pages_read_engagement`)
1. Login escolhendo a Página.
2. O mesmo post agendado, marcando a rede Facebook.
3. O post publicado na Página.

> The owner can choose to publish the same approved post on their Facebook Page. Maia publishes it only after the team and the owner approve it, and reads the Page's posts and engagement to show the owner the results.

### Vídeo D · eventos do WhatsApp (`whatsapp_business_manage_events`)
1. O WhatsApp do negócio conectado (painel → conectado).
2. Uma conversa de um cliente que veio de um anúncio, a etapa mudando pra "venda".
3. No Gerenciador de Eventos da Meta, o evento chegando (com o código de teste `MAIA_CAPI_TESTE`).

> When a customer who clicked a click-to-WhatsApp ad starts a conversation or completes a purchase with the business, Maia sends that event to Meta through the Conversions API for Business Messaging, so the business's ads can optimize for people who actually buy. We only send events for the connected business's own WhatsApp conversations.

## Instruções de teste (campo "Test instructions", igual pra todas)

> Open https://www.carreiranodigital.com/maia/operacao, log in with the test password provided below, open the business "TESTE", go to the Social tab and click "Connect" to log in with Facebook. Approve the scheduled post and check it on the connected Instagram account.

A senha do painel vai no campo próprio da Meta, nunca neste arquivo.

## Depois de enviar

Avisar o Guto. A Meta costuma levar alguns dias. Se não sair até quarta (18/11), vale o plano B do testador pra lotérica, acima.
