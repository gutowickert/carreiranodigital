# Chaves da Maia na Vercel (07/11/2026)

Lista de tudo que a Maia lê do ambiente (`process.env`), conferida no código da branch `maia-hoje`.
Nenhum valor secreto está escrito aqui. Onde diz **"uma senha longa inventada"**: gerar uma de 40+ caracteres
(ex.: no PowerShell `[Convert]::ToBase64String((1..32|%{Get-Random -Max 256}))`) e guardar no cofre de senhas.

Legenda da última coluna: **já existe?** = provavelmente já está na Vercel porque a escola ou o Oito usam em produção
(conferir em Vercel > projeto > Settings > Environment Variables; daqui não dá pra ver).

---

## A) Obrigatórias pra publicar com a Maia DESLIGADA e segura

Com estas, o código pode ir pro ar sem abrir nada. O que acontece quando falta foi conferido no código.

| Variável | O que é | Valor | De onde tirar / igual a quê | Se faltar | Já existe? |
|---|---|---|---|---|---|
| `MAIA_PAINEL_SENHA` | senha do painel `/maia/operacao` (vê TODOS os negócios) e da API social | uma senha longa inventada | só a equipe sabe. **Não** usar a mesma do Recado (desde 07/11 a do Recado não vale aqui) | painel fica fechado (401 sempre). Não abre nada, mas ninguém usa | não |
| `MAIA_OFICINA_CHAVE` | chave da oficina (o PC/Railway que faz arte e vídeo) em `/api/maia/oficina` | uma senha longa inventada | **igual** à `MAIA_OFICINA_CHAVE` do `maia-oficina` (no PC ou na Railway) | oficina fica fechada | não |
| `MAIA_ROTINA_CHAVE` | chave que o agendador do banco (pg_cron) manda pra `/api/maia/rotina` | uma senha longa inventada | **igual** ao `COLOCA_A_CHAVE` do `db/maia-cron.sql` antes de rodar | rotina só abre com `CRON_SECRET`; sem as duas, fica fechada | não |
| `CRON_SECRET` | segredo dos crons da Vercel (a escola usa) | uma senha longa inventada | a Vercel manda sozinha como `Authorization: Bearer ...` nos crons | a rotina da Maia segue pela `MAIA_ROTINA_CHAVE`. **Desde 07/11 o user-agent `vercel-cron` NÃO vale mais como senha na Maia** | provável |
| `META_APP_SECRET` | segredo do app da Meta que assina os webhooks do WhatsApp (escola/Oito) | o "Chave secreta do app" | Meta for Developers > app do WhatsApp do Oito > Configurações do app > Básico > Chave secreta | webhook da Maia (`/api/maia/whats/webhook`) recusa tudo (seguro). O do Oito aceita sem assinatura (risco do Oito) e **não deixa nenhuma mensagem ir pra Maia** | o manual de 08/10 diz que faltava na Vercel do Guto: **conferir** |
| `MAIA_CONECTAR_SEGREDO` | assina o link de 14 dias que o dono abre pra conectar o WhatsApp | uma senha longa inventada | só no servidor | usa a `MAIA_PAINEL_SENHA` (funciona; separado é melhor: trocar a senha do painel não invalida os links) | não |
| `MAIA_WA_VERIFY_TOKEN` | palavra que a Meta confere ao cadastrar o webhook dos negócios | uma senha longa inventada | **igual** ao "Verificar token" que se digita na Meta ao configurar o webhook `/api/maia/whats/webhook` (e vai na inscrição de cada conta) | usa `maia-wa-2026`, que está no código (público). Baixo risco, mas trocar | não |
| `MAIA_URL_PUBLICA` | endereço oficial do site | `https://www.carreiranodigital.com` | — | links e o webhook dos negócios usam o endereço de quem chamou (pode ser uma prévia `*.vercel.app`) | não |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | banco (o mesmo da escola) | — | já usadas pela escola | nada da Maia funciona | **sim** |
| `ANTHROPIC_API_KEY` | IA | — | já usada pela escola | a IA não responde | **sim** |

**Deixar SEM valor (ou fora da Vercel) pra ela nascer desligada:** `MAIA_LIGADA`, `MAIA_CLIENTES_LIGADO`, `MAIA_META_REAL`,
`MAIA_CAPI_LIGADO`, `MAIA_SOCIAL_LIGADO`, `MAIA_DEMO_ROTINA`, `MAIA_OFICINA_LIGADA`.

**NUNCA pôr na Vercel:** `MAIA_LOCAL`, `MAIA_LOCAL_PASTA`, `MAIA_DEMO_TESTE_NUMEROS` (só pro teste no computador).
Desde 07/11 o código ignora `MAIA_LOCAL` na Vercel, mas não custa não pôr.

---

## B) Pra ligar a Maia no número dela (o número do Oito)

| Variável | O que é | Valor | De onde tirar / igual a quê | Já existe? |
|---|---|---|---|---|
| `MAIA_LIGADA` | liga a conversa dos donos no número do Oito | `1` | — (só depois do `db/maia.sql` aplicado) | não |
| `META_APP_SECRET` | ver grupo A. **Sem ela a Maia não recebe nenhum dono** (trava de 07/11: sem assinatura conferida, o "from" pode ser forjado) | — | ver A | conferir |
| `OITO_WA_PHONE_ID` | id do número do Oito/Maia na Meta | número (id) | WhatsApp Manager > Telefones > id do número. **Sem ele a Maia não recebe dono** (trava de 07/11) | **sim** (Oito no ar) |
| `OITO_WA_TOKEN` (ou `WA_OFICIAL_TOKEN`) | chave pra mandar mensagem pelo número do Oito | — | usuário do sistema do portfólio | **sim** |
| `OITO_WA_WABA_ID` | conta do WhatsApp do Oito (modelos de mensagem) | número (id) | WhatsApp Manager | **sim** |
| `OITO_WA_VERIFY_TOKEN` | verificação do webhook do Oito | — | já configurado | **sim** |
| `MAIA_MODELO_DONO` | nome do modelo aprovado que chama o dono fora das 24 h | `maia_novidades` (padrão) | o nome do modelo aprovado na WABA do Oito (painel: "criar modelo do dono") | não precisa |
| `RECADO_NTFY_TOPICO` | aviso no celular do Guto (avisos da equipe) | — | já usado pelo Recado/Oito | **sim** |
| `DEEPGRAM_API_KEY` | transcreve o áudio do dono e da demonstração | — | já usado pela escola | **sim** |
| `ELEVENLABS_API_KEY` | voz da Maia na demonstração (sem ela, só texto) | — | ElevenLabs > API keys | talvez |
| `MAIA_VOZ_ID` | voz | padrão no código | ElevenLabs > Voices | não precisa |
| `MAIA_OFICINA_LIGADA` | diz que a oficina está de pé (a demonstração promete data) | `1` quando a oficina rodar sempre | — | não |
| `MAIA_DEMO_ROTINA` | a rotina manda a retomada e a amostra da demonstração pra lead de verdade | `1` só quando a demonstração for testada | — | não |
| `MAIA_DEMO_CONTA` | conta de anúncio da escola cujos números a demonstração mostra | id da conta (sem `act_`) | Gerenciador de Anúncios | não |
| `MAIA_META_REAL` | campanhas, social e envio pra Meta de verdade (sem: tudo simulado) | `1` | — | não |
| `MAIA_ADS_TOKEN` (ou `FB_ADS_TOKEN`) | chave da Marketing API pra criar campanha pausada e ler números | — | usuário do sistema com acesso às contas | `FB_ADS_TOKEN` **sim** |
| `MAIA_SOCIAL_LIGADO` / `MAIA_SOCIAL_TOKEN` | social media do plano Completa (posta e lê) | `1` / chave | sem `MAIA_SOCIAL_TOKEN` usa a do tráfego (`MAIA_ADS_TOKEN`/`FB_ADS_TOKEN`) | não |

---

## C) Pra conectar o 1º cliente (Tech Provider / cadastro incorporado)

| Variável | O que é | Valor | De onde tirar / igual a quê | Já existe? |
|---|---|---|---|---|
| `MAIA_META_APP_SECRET` | segredo do app **Sistema CND (2069913353660247)**: troca a autorização pela chave do negócio e assina os webhooks dos negócios | "Chave secreta do app" | Meta for Developers > app 2069913353660247 > Configurações do app > Básico > Chave secreta. Se o `META_APP_SECRET` já for desse mesmo app, pode ficar só ele | não |
| `MAIA_META_APP_ID` | app do cadastro incorporado | `2069913353660247` (padrão no código) | — | não precisa |
| `MAIA_META_CONFIG_ID` | configuração do Login para Empresas (WhatsApp) | `2310936702790535` (padrão no código) | app 2069913353660247 > Login do Facebook para Empresas > Configurações | não precisa |
| `MAIA_CRIPTO_CHAVE` | cifra no banco a chave do WhatsApp e do social de cada negócio | uma senha longa inventada | só no servidor. **Pôr ANTES do 1º cliente conectar e nunca mais trocar** (trocar = as chaves guardadas param de abrir e cada dono conecta de novo). Guardar cópia no cofre | não |
| `MAIA_CLIENTES_LIGADO` | chave geral: a Maia pode mandar mensagem pros clientes dos negócios | `1` | além dela, a equipe liga negócio por negócio no painel | não |
| `MAIA_WA_VERIFY_TOKEN`, `MAIA_URL_PUBLICA`, `MAIA_CONECTAR_SEGREDO` | ver grupo A | | | |
| `MAIA_CAPI_LIGADO` | devolve conversa e venda pra Meta (Conversions API) | `1` | — | não |
| `MAIA_CAPI_TOKEN` | chave reserva da CAPI quando o negócio não tem a dele | — | usuário do sistema | não |
| `MAIA_CAPI_TESTE` | código de teste do Gerenciador de Eventos (só durante o teste) | `TEST...` | Gerenciador de Eventos > Testar eventos | não |
| `MAIA_CAPI_PARCEIRO` | `partner_agent` (identifica a CND como parceira) | texto curto | — | não |
| `MAIA_APP_ADS_TOKEN` / `MAIA_CHAMADAS_CONTAS` | placar das 500 chamadas pro acesso avançado da Marketing API | chave do app 2069913353660247 / ids das contas separados por vírgula | — | não |

---

## D) Opcionais (o padrão do código é bom)

| Variável | Padrão |
|---|---|
| `MAIA_MODELO` | `claude-sonnet-5-5` (conversa com o dono, peças) |
| `MAIA_MODELO_CLIENTE` | `claude-haiku-5-5` (atendimento do cliente do negócio) |
| `MAIA_MODELO_ANALISE` | `claude-opus-5-5` (análise do mês do social) |
| `OITO_MODELO` | modelo da demonstração se `MAIA_MODELO` não existir |
| `MAIA_DEMO_LIMITE` | `10` amostras por semana |
| `MAIA_DEMO_CUSTO_MAX` | `15` (reais: custo por conversa acima disso a demonstração não cita) |
| `MAIA_DEMO_MODELO` | modelo de mensagem pra lead da demonstração (padrão: o do dono) |
| `MAIA_PRECOS` / `MAIA_DOLAR` | tabela de preço da IA (JSON) / `5.5` — só pro custo no painel |
| `MAIA_OFERTA` | JSON que muda os planos/preços que a Maia fala |
| `MAIA_SOCIAL_ESPERA_MS` | `5000` |
| `MAIA_SEM_AVISO` | `1` silencia os avisos no celular (só pra teste) |

## Fora da Vercel: a oficina (`maia-oficina/`, no PC ou na Railway)

`MAIA_URL` (= `https://www.carreiranodigital.com`), `MAIA_OFICINA_CHAVE` (**igual** à da Vercel), `DEEPGRAM_API_KEY`,
`CHROME_PATH`, `FFMPEG`, `FFPROBE`, `OFICINA_MAX_MB`, `MANTER_TRABALHO`.

## No banco (não é Vercel, mas tem que bater)

- `db/maia-cron.sql`: o `COLOCA_A_CHAVE` = `MAIA_ROTINA_CHAVE`.
- `db/maia.sql`: o bucket `maia` privado e as conferências do fim do arquivo (as duas consultas têm que voltar vazias).
