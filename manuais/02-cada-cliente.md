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
- **Chamadas por voz e vídeo** (do Guto): link `/conversa/<codigo>` com a prévia da marca, gravação em estéreo e transcrição com o nome de cada lado. Com ícone próprio no menu (vídeo; a Fila de Ligações segue com o telefone). Desde 28/09 a aba fechada também encerra, e a rede de segurança fecha as esquecidas — a primeira foi uma do Rick, que ficou "em andamento" e foi processada sozinha.

## Espaço Dani Fell (crm-danifell)

Nutrição — o método Restaure seu Intestino. Contrato CRM + Tráfego, desde 16/09/2026. **Endereço: espacodanifell.vercel.app** (o crm-danifell continua valendo pros links antigos). Primeiro uso em 29/09/2026 — **depois disso, toda mudança sobe a versão** (2.0.1, 2.0.2…). O que é só dela:

- **Área da cliente**: a ficha (anamnese e exames) e a jornada (sessões, check-in semanal, medidas, exames, conquistas) que a cliente abre no celular sem login. O que nunca sai pra cliente está escrito em `lib/jornada.ts` (grau de disbiose, "alterado", registro interno).
- **Caixa**: o mês em quatro números; entradas vêm das vendas do funil, só se lança o que sai.
- **Motor do fim do dia**: a virada noturna de quem respondeu, além do da manhã.
- **Funil próprio**: Chegou → Não respondeu (IA) → Em conversa → Avaliação agendada (IA) → Faltou (IA) → Pensando (IA) → Fechando → Retomar depois → Ganho / Perda.
- **Áudio pronto**: "O método Restaure seu Intestino", na voz da Dani.
- **Chamadas por voz e vídeo** (desde 28/09): o botão Chamar no cartão da cliente, na conversa do WhatsApp e no Atender, no lugar do "Ligar" da API4COM (que ela não tem). Testado no ar: conecta, grava, transcreve com o nome de quem falou. Sem servidor de apoio próprio (Cloudflare), pode falhar no 4G.
- **Área do cliente**: o botão **link** do lado de "card" copia o link da ficha pra mandar pra cliente.
- Usuários: Dani, Bruna e Suporte CND (🔒 protegida). ⚠️ Dani e Bruna estão como *vendedor* — se uma delas for a dona, mudar o papel na implantação. Máquina CND em modo geral, todos com login entram.
- *O que a IA sabe* tem 9 seções (quem somos, como atende, o que vende e preço, o que nunca se faz, o método, a avaliativa, quando acha caro, o acompanhamento, o preparo). ⚠️ Em 27/09: conta da Anthropic sem crédito e WhatsApp oficial não configurado.

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
| Dani Fell | espacodanifell.vercel.app | CRM + Tráfego | geral, todos | Anthropic sem crédito em 27/09; Deepgram sim | não configurado | sim (28/09) |
| GAJA | gajaseguros.vercel.app | combo | marketing | nenhuma | indefinido | não |
| Jamrock | jamrockskateboardingco.vercel.app | — | não | — | — | não |
