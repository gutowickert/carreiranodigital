# Cada sistema e suas peculiaridades

Todos saem do mesmo núcleo. O que muda de um para outro nunca está no código: está no banco daquela instalação (nome, cor, logo, produtos, etapas, o que a IA sabe) — e, em alguns, em telas que nasceram pra aquele negócio e depois viraram do núcleo.

## O núcleo (crm-nucleo)

O repositório base de toda instalação nova. Tem o `setup-nucleo/` com os passos de instalar do zero (schema, empresa, funil inicial, pastas, agendamentos) e os dois verificadores que acham defeito calado (`VERIFICAR.sql` e `verificar-consultas.mjs`). Toda correção feita num cliente que serve pra todos volta pra cá; quem instala o próximo parte daqui.

## A escola (carreiranodigital)

O sistema original, de onde o núcleo saiu. Tem tudo que é de escola e não foi pros clientes: turmas, chamada, alunos, professores, salas, módulos, NPS, orçamentos (propostas do Deu Venda e do ANL com aceite pelo link), agenda por turno, Entregas com os roteiros dos produtos (Deu Venda, Sistema, combos) e o monitor das entregas. A Máquina CND aqui é só pra admin e comercial (professor tem login), em modo geral.

## Espaço Dani Fell (crm-danifell)

Nutrição — o método Restaure seu Intestino. Contrato CRM + Tráfego, desde 16/09/2026. O que é só dela:

- **Área da cliente**: a ficha (anamnese e exames) e a jornada (sessões, check-in semanal, medidas, exames, conquistas) que a cliente abre no celular sem login. O que nunca sai pra cliente está escrito em `lib/jornada.ts` (grau de disbiose, "alterado", registro interno).
- **Caixa**: o mês em quatro números; entradas vêm das vendas do funil, só se lança o que sai.
- **Motor do fim do dia**: a virada noturna de quem respondeu, além do da manhã.
- **Funil próprio**: Chegou → Não respondeu (IA) → Em conversa → Avaliação agendada (IA) → Faltou (IA) → Pensando (IA) → Fechando → Retomar depois → Ganho / Perda.
- **Áudio pronto**: "O método Restaure seu Intestino", na voz da Dani.
- Usuários: Dani, Bruna e Suporte CND. Máquina CND em modo geral, todos com login entram.
- ⚠️ Em 27/09 *O que a IA sabe* estava vazio e o WhatsApp oficial não configurado — os dois entram na implantação.

## GAJA Corretora de Seguros (crm-gaja)

Corretora em Lajeado (Jhones, comercial; Eliana "Lana", administrativo e marketing). Combo Deu Venda + CRM + Tráfego, desde 08/09/2026. O que é só dela:

- **Apólices e renovações**: a apólice do cliente (PDF lido pela IA) vira a próxima venda com data; a fila de renovação é o coração do comercial.
- **Atender com duas áreas**: Comercial (Jhones) e Administrativo (Lana: sinistro, comissão, contas, lembretes de marketing) na mesma tela.
- **Máquina CND em modo marketing**: a máquina do Deu Venda de verdade — as instruções do Projeto do claude.ai, os 14 documentos do método sob demanda, e os documentos da GAJA (negócio, marca, ideias, o que responder, página, anúncios) na memória, reescritos pela própria máquina com versão. Roda no Opus 5.
- **O que a IA sabe** semeado das 73 respostas do questionário (9 seções).
- ⚠️ Faltam: login do Jhones e da Lana, a chave da Anthropic e da Deepgram na Vercel, e a decisão do WhatsApp (o número é o celular pessoal do Jhones). O produto "Plano de Saúde" está no cadastro e ele disse que não vende — perguntar antes de apagar.

## Jamrock Skateboarding (crm-jamrock)

Loja de skate. **Congelada por decisão do Nando (25/09/2026): nenhuma atualização até instrução específica.** Não recebe a Máquina, o custo por pessoa nem as correções do núcleo até ele liberar.

## Estado das instalações

| Sistema | Produto | Máquina CND | Chaves de IA | WhatsApp oficial |
| --- | --- | --- | --- | --- |
| Escola | — | geral, admin e comercial | sim | sim |
| Dani Fell | CRM + Tráfego | geral, todos | Anthropic sem crédito em 25/09; Deepgram sim | não configurado |
| GAJA | combo | marketing | nenhuma | indefinido |
| Jamrock | — | não | — | — |
