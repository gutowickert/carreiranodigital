# Cada sistema e suas peculiaridades

Todos saem do mesmo núcleo. O que muda de um para outro nunca está no código: está no banco daquela instalação (nome, cor, logo, produtos, etapas, o que a IA sabe) — e, em alguns, em telas que nasceram pra aquele negócio e depois viraram do núcleo.

## O núcleo (crm-nucleo)

O repositório base de toda instalação nova. Tem o `setup-nucleo/` com os passos de instalar do zero (schema, empresa, funil inicial, pastas, agendamentos) e os dois verificadores que acham defeito calado (`VERIFICAR.sql` e `verificar-consultas.mjs`). Toda correção feita num cliente que serve pra todos volta pra cá; quem instala o próximo parte daqui.

Desde 27–28/09/2026 o núcleo também traz: o **checklist dos 11 pré-requisitos antes do primeiro uso** (`SERVICOS-EXTERNOS.md`), a **conta Suporte CND protegida** (`25-conta-suporte-protegida.sql` — o dono não desativa, não rebaixa, não apaga), a **assinatura CarreiraNoDigital** pra telas de cliente (`components/AssinaturaCND`), a versão com três números no rodapé, e o motor que **para a etapa que não avança** (sem chave da IA, o warming não trava mais o resto da manhã). As **chamadas** (`26-chamadas.sql`) ainda vão pro núcleo.

## A escola (carreiranodigital)

O sistema original, de onde o núcleo saiu. Tem tudo que é de escola e não foi pros clientes: turmas, chamada, alunos, professores, salas, módulos, NPS, orçamentos (propostas do Deu Venda e do ANL com aceite pelo link), agenda por turno, Entregas com os roteiros dos produtos (Deu Venda, Sistema, combos) e o monitor das entregas. A Máquina CND aqui é só pra admin e comercial (professor tem login), em modo geral.

O que entrou em 27–28/09/2026:

- **Minha semana** (menu, aberta a todos): o que cada pessoa tem pra entregar — marketing da semana, clientes do Deu Venda, aulas e o que pediram pra ela — com o balão da agenda. Marketing de quem não é chefe fica **"esperando aprovação"** até o Nando, o Rick ou o Guto confirmar ou devolver com recado; os chefes veem o acompanhamento embaixo, com o placar das 4 semanas. O Mateus tem 1 a 3 stories por semana.
- **IA do fim de semana** (Inteligência Artificial → IA do fim de semana): de sexta 17h a segunda 5h, só tenta marcar a ligação de segunda com "nosso especialista", sem emoji e sem falar preço. **Em modo sombra** — escreve o que faria e não manda; a revisão do 1º fim de semana é na segunda 05/10.
- **Mais leve**: o Funil carrega os ativos primeiro (2,5 MB → 1 MB); o Monitor abre na hora e lê a Meta por trás; a logo do menu caiu de 506 KB pra 71 KB; o aviso de WhatsApp no menu chega em ~0,3 s (campainha).
- **Tráfego dos clientes**: número em cima de cada coluna, o maior em verde.
- **Orçamento**: resposta da IA cortada tenta de novo sozinha.
- **Venda sem e-mail** (29/09, pedido do Rick): `alunos.email` deixou de ser obrigatório no banco. A tela sempre disse "opcional", mas o banco recusava e o Ganho dava "Erro ao criar aluno". Agora se dá o Ganho e completa o e-mail depois.
- **Assistente do time no WhatsApp** (do Guto, 25/09): mensagem que chega no número da escola vinda do WhatsApp de alguém do time (hoje o Nando, final 7713, e o Guto, final 0653 — `usuarios_perfil.whatsapp`) vai pro assistente interno (agenda, bom dia, cadastro) e **não entra na caixa**. Efeito: o atendente não vê a resposta e a tela acha que a janela de 24h está fechada. **Desde 29/09: começando com `#lead`**, a mensagem vai pra caixa do time como se fosse de cliente (sem o "#lead") — é assim que se testa o atendimento. Lead de verdade nunca é desviado.
- **Chamadas por voz e vídeo** (do Guto): link `/conversa/<codigo>` com a prévia da marca, gravação em estéreo e transcrição com o nome de cada lado. Com ícone próprio no menu (vídeo; a Fila de Ligações segue com o telefone). Desde 28/09 a aba fechada também encerra, e a rede de segurança fecha as esquecidas — a primeira foi uma do Rick, que ficou "em andamento" e foi processada sozinha. Também desde 28/09: a espera toca "chamando" e mostra "abriu o link" / "entrou", e o convite vai com a capa da escola e o nome de quem chama (o Rick esperou 15 min numa tela muda sem saber que o cliente nem tinha aberto).

## Espaço Dani Fell (crm-danifell)

Nutrição — o método Restaure seu Intestino. Contrato CRM + Tráfego, desde 16/09/2026. **Endereço: espacodanifell.vercel.app** (o crm-danifell continua valendo pros links antigos). Primeiro uso em 29/09/2026 — **depois disso, toda mudança sobe a versão** (2.0.1, 2.0.2…). O que é só dela:

- **Área da cliente**: a ficha (anamnese e exames) e a jornada (sessões, check-in semanal, medidas, exames, conquistas) que a cliente abre no celular sem login. O que nunca sai pra cliente está escrito em `lib/jornada.ts` (grau de disbiose, "alterado", registro interno).
- **Caixa**: o mês em quatro números; entradas vêm das vendas do funil **e, desde 29/09 (v2.0.8), da entrada avulsa** (`caixa_entradas`, setup-danifell/19 — o que entra sem venda no card); saídas lançadas no mesmo formulário. Também desde 29/09 (v2.0.7): a **ficha da cliente salva sozinha** (2s depois de cada resposta e ao sair) e a Área do cliente conta só as perguntas da ficha (178, não 185).
- **Motor do fim do dia**: a virada noturna de quem respondeu, além do da manhã.
- **Funil próprio**: Chegou (time) → Não respondeu (IA) → Em conversa (time) → Avaliação agendada (IA responde) → Faltou (IA) → Pensando (IA, até D+90) → Ganho / Perda. "Fechando" e "Retomar depois" estão desativadas.
- **Áudio pronto**: "O método Restaure seu Intestino", na voz da Dani.
- **Chamadas por voz e vídeo** (desde 28/09): o botão Chamar no cartão da cliente, na conversa do WhatsApp e no Atender, no lugar do "Ligar" da API4COM (que ela não tem). Testado no ar: conecta, grava, transcreve com o nome de quem falou. A espera com som e passo a passo e o convite com capa também. Sem servidor de apoio próprio (Cloudflare), pode falhar no 4G.
- **Área do cliente**: o botão **link** do lado de "card" copia o link da ficha pra mandar pra cliente.
- **Anúncios ligados** (28/09): conta "Espaço Dani Fell" (700074957222765), campanha PRESENCIALWHATS de clique-pro-WhatsApp — a tela Tráfego mostra o gasto por anúncio (30 dias: R$ 1.241,75; o que mais gasta é PROVA SOCIAL BRUNA). A campanha não usa pixel, mas a pedido do Guto as **vendas do sistema vão pro Pixel RenasciFlora** (698521189967476 — o que já recebe as vendas da Kiwify): `FB_PIXEL_ID` + `FB_CAPI_TOKEN` desde 28/09. Cada venda registrada no card (Ganho com produto e valor) vira Purchase; cada lead novo do WhatsApp, Lead. Há um segundo app "Sistema Dani Fell" em desenvolvimento, sobra — pode apagar. ⚠️ A Meta avisa que vai pedir a **verificação da empresa** em breve.
- **Servidor de apoio da Cloudflare ligado** (29/09, na implantação): a chamada da Bruna com o Rick (redes diferentes) não conectou — o servidor público tinha caído. Conta Cloudflare nova da CND, TURN "Sistemas CND"; testado: 9 caminhos de retransmissão. ⚠️ O API Token foi colado no chat: trocar (Roll) e atualizar na Vercel. ⚠️ A ESCOLA também precisa (o projeto dela está na Vercel do Guto).
- **Em uso real desde 29/09 (~17h)**: a demonstração da implantação (25 leads + os testes da reunião) foi apagada e o follow-up automático religado. Sistema zerado, só configuração.
- **v2.1.3 (30/09)**: **datas no dia de Brasília.** Aviso do Guto ("no tráfego já é dia 30", à noite): o servidor da Vercel é UTC, então `new Date().toISOString().slice(0,10)` vira AMANHÃ depois das 21h. Trocado por `hojeBR()`/`isoBR()` (`lib/periodos.ts`) em tráfego, captação, painel, exames/medidas, agenda das entregas, ficha, data da venda no card, marcos, mês de Resultados/Vendedores e dias-até (entregas). ⚠️ **GAJA (8 pontos), núcleo (7) e escola (27) têm o mesmo defeito** — corrigir no núcleo e levar pra GAJA; escola só com aprovação.
- **v2.1.2 (30/09)**: IA **sem travessão** (pedido da Bruna): `semTravessao()` no atendimento e no copiloto troca " - ", "–", "—" por vírgula; entre números vira "a" (9h a 12h); hífen de palavra e telefone ficam. Regra também no prompt.
- **v2.1.1 (29/09)**: botão 🎧 (áudio pronto) também dentro do card do lead, na caixa de mensagem; no celular a caixa do card agora fica em cima e os botões embaixo (classe `wa-compor`).
- **v2.1.0 (29/09)**: (depois do .9 vem .1.0 — nunca 2.0.10, regra do Nando) botão **🎧 na conversa** manda os `audios_prontos` (o áudio do método da Dani) pelo número oficial; todo áudio (IA, 🎤, 🎧) vai com `voice: true` → chega como **áudio de conversa**, não como arquivo (o arquivo já era OGG/Opus, faltava a marcação); tema escuro: texto da mensagem enviada ficava escuro no balão verde (WhatsApp, card e disparos).
- **v2.0.9 (29/09)**: **só vira lead sozinho quem vem de anúncio** (`referral` da Meta) **ou de clique rastreado** (#ref do /wa); o resto fica só no WhatsApp com "+ Criar lead" (`lib/lead-do-wa.ts`). Antes todo contato virava lead. Aviso no celular de não-lead vai pra caixa principal. ⚠️ Achado no teste: o webhook do WhatsApp **não confere a assinatura da Meta** (X-Hub-Signature) — qualquer um que souber o endereço consegue injetar mensagem falsa. Corrigir com `META_APP_SECRET` (vale pra todos os sistemas).
- **v2.0.5–2.0.6 (29/09, na implantação)**: Automação IA sem o texto do funil da escola; **áudio da cliente no WhatsApp vira texto** embaixo do áudio (Deepgram na chegada, `lib/transcrever-audio-wa.ts`; a IA espera a transcrição antes de responder; botão 📝 Transcrever pros antigos) — ⚠️ a ESCOLA não tem isso (lá o áudio do lead continua cego pra IA): levar se o Nando aprovar; convite "Aqui é Bruna (Espaço Dani Fell)" (o "da Espaço" saía errado).
- **v2.0.2–2.0.4 (29/09, na implantação)**: Entregas → + Novo projeto puxa de um lead já criado (igual à escola; a rota `/api/projetos/leads` não existia na Dani — a busca de lead da tela Chamadas também estava quebrada por isso); a entrega não mostra mais "Conta de anúncio" nem "Placar" do contrato (na escola a entrega é tráfego pago; no Espaço é o tratamento).
- **v2.0.1 (29/09, na implantação)**: o Chamar manda o convite SEMPRE pelo WhatsApp oficial — do card, do Atender, da Fila e da tela Chamadas ele abria o wa.me e saía do celular pessoal (a Bruna notou). Fora da janela de 24h avisa e copia o link. ⚠️ Na escola é igual (card do lead abre o wa.me): levar se o Nando aprovar.
- **Sistema limpo pra implantação** (29/09 ~13h): apagados os 6 leads de teste (e histórico, tarefas, fichas, exames, medidas, check-ins, o projeto de entrega da "Aline (teste)"), as 2 conversas e chamadas de teste, e os 31 contatos fictícios do `demo-dados.mjs`. Ficou toda a configuração: produtos, etapas, o que a IA sabe, os 10 modelos aprovados, a cadência, os usuários e os logs.
- **Celular como app** (29/09, do mesmo jeito da escola): barra em cima, abas Painel/WhatsApp/Agenda/Funil embaixo e o "Mais"; ícone de app quadrado montado da logo (`app/icone/[tam]`); Agenda do mês com bolinhas por dia e a lista do dia embaixo (a da Dani não tem visão de semana, que foi o que o Guto adaptou na escola). Medido num iPhone simulado: nenhuma tela sobreposta nem transbordando. ⚠️ Em Tarefas de Leads o telefone quebrava no meio ("(51) 9900-" / "0001") — corrigido na Dani; na escola acontece igual. Falta levar o app pra GAJA e pro núcleo.
- **Tema escuro** (28/09, Dani e GAJA): a busca do menu em branco e a dica das caixas de busca mais clara — no cinza apagado não se lia. Falta levar pro núcleo.
- **Follow-up da IA** (28/09): cadência de 22/09 (`setup-danifell/04-cadencia.mjs`) + **10 modelos aprovados pela Meta** (`18-modelos-de-mensagem.sql`: 3 Não respondeu, 3 Faltou, 4 Pensando). **Ligados desde 28/09 ~19h40**: o 1º teste deu 131042 (sem cartão); a Dani cadastrou o cartão e o teste seguinte foi entregue. (A Meta levou uns minutos pra reconhecer o cartão.) Fora de propósito: Pensando D+1 (áudio da Dani) e D+14 (online) são dela; D+3 precisa de um relato real de cliente, com autorização.
- Usuários: Dani, Bruna e Suporte CND (🔒 protegida). **Desde 29/09 as duas são admin**, com todos os leads e a caixa do WhatsApp — estavam como vendedor, vendo só os próprios leads e sem a caixa: o sistema teria aberto vazio na implantação. Máquina CND em modo geral, todos com login entram. **Manual no menu** ("Manual do sistema", no pé) desde 29/09, também na GAJA.
- *O que a IA sabe* tem 9 seções (quem somos, como atende, o que vende e preço, o que nunca se faz, o método, a avaliativa, quando acha caro, o acompanhamento, o preparo). Em 28/09: crédito na Anthropic ok (IA, sugestão e Máquina testadas no ar) e WhatsApp oficial no ar.

## GAJA Corretora de Seguros (crm-gaja)

Corretora em Lajeado (Jhones, comercial; Eliana "Lana", administrativo e marketing). Combo Deu Venda + CRM + Tráfego, desde 08/09/2026. **Endereço: gajaseguros.vercel.app.** Apresentação em 30/09/2026. O que é só dela:

- **Apólices e renovações**: a apólice do cliente (PDF lido pela IA) vira a próxima venda com data; a fila de renovação é o coração do comercial.
- **Atender com duas áreas** (primeiro item de Vendas no menu desde 27/09): Comercial (Jhones) e Administrativo (Lana: sinistro, comissão, contas, lembretes de marketing) na mesma tela.
- **Área do cliente** (Vendas → Área do cliente): o cliente do Jhones entra pelo link + 3 primeiros números do CPF e vê os seguros dele, o que cobre, quanto paga, quando vence, o índice de proteção, os selos e "Quero entender" (vira tarefa pro vendedor). Link também no cartão do lead ("Link da área dele"). Falta o número de WhatsApp da corretora no campo da própria tela. Demonstração: Helena Barcellos (CPF 123) e Marcos Vinícius Rocha (CPF 987), fictícios.
- **A carteira do SGCOR** ainda não entrou: o caminho é exportar em Excel as apólices vigentes e importar (a importação por planilha ainda vai ser feita).
- **Máquina CND em modo marketing**: a máquina do Deu Venda de verdade — as instruções do Projeto do claude.ai, os 14 documentos do método sob demanda, e os documentos da GAJA (negócio, marca, ideias, o que responder, página, anúncios) na memória, reescritos pela própria máquina com versão. Roda no Opus 5.
- **O que a IA sabe** semeado das 73 respostas do questionário (9 seções).
- ⚠️ Faltam: login do Jhones e da Lana, a chave da Anthropic e da Deepgram na Vercel, a decisão do WhatsApp (o número é o celular pessoal do Jhones), a **cadência de follow-up** (Fluxo Comercial — o motor da manhã avisa "cadência não definida"), as **chamadas** (ainda não foram pra GAJA) e a carteira do SGCOR. O produto "Plano de Saúde" está no cadastro e ele disse que não vende — perguntar antes de apagar.

## Jamrock Skateboarding (crm-jamrock)

Loja de skate. **Congelada por decisão do Nando (25/09/2026): nenhuma atualização até instrução específica.** Não recebe a Máquina, o custo por pessoa nem as correções do núcleo até ele liberar.

## Estado das instalações

| Sistema | Endereço | Produto | Máquina CND | Chaves de IA | WhatsApp oficial | Chamadas |
| --- | --- | --- | --- | --- | --- | --- |
| Escola | carreiranodigital.vercel.app | — | geral, admin e comercial | sim | sim | sim |
| Dani Fell | espacodanifell.vercel.app | CRM + Tráfego | geral, todos | Anthropic sem crédito em 27/09; Deepgram sim | **no ar (28/09)** — (51) 99923-0533, número novo, app "Sistema Dani Fell"; nome em análise na Meta | sim (28/09) |
| GAJA | gajaseguros.vercel.app | combo | marketing | nenhuma | indefinido | não |
| Jamrock | jamrockskateboardingco.vercel.app | — | não | — | — | não |
