# Maia: pendências da noite de 13/11/2026 (ramo `maia-noite`)

Feito a partir do `main` (fe097b2). **Não publicado.** Nada de estrutura do banco mudou (sem SQL pendente): tudo novo mora em
campos JSON que já existem (`negocios.contexto`, `negocios.meta`, `maia_eventos`, `maia_pecas`).

## 1. A Maia usa o funil e os limites do cadastro (`lib/maia/cadastro.ts`)

O cadastro da implantação (skill `implantacao-maia` → `importar.mjs`) grava em `contexto`: `funil {sim, etapas[]}`,
`limites {desconto_maximo, faixa_preco, nunca_prometer, passar_pro_dono}`, `perguntas[]`, `provas`, `mais_vendido`.
Antes isso ia pro atendimento só como JSON solto. Agora vira instrução clara no atendimento e na retomada:

- o "sim" do negócio (o que conta como venda) e o próximo passo de cada etapa;
- desconto máximo ("nunca oferece por conta própria"), faixa de preço, o que nunca prometer, quando passar pro dono;
- perguntas frequentes com a resposta do dono, provas (quando o cliente desconfia), o mais vendido (quando está em dúvida);
- a regra fixa da casa (valor antes do preço) continua igual.

Travas sem IA:
- **Desconto acima do máximo** (ex.: "15% de desconto" com máximo de 10%): a resposta é reescrita uma vez no modelo forte;
  se insistir, a frase do desconto sai e a pergunta vai pro dono (o cliente ganha o prazo de resposta).
- **Passagem pro dono**: o motivo que bate com o "quando passar pro dono" do cadastro (ex.: "encomenda de empresa") passa a valer.

A ficha que vai no prompt fica sem `funil`, `limites`, `pecas_aprovadas`, `estilo` e `implantacao` (sem repetir e mais barato).

## 2. "O que falta pra ligar" (`lib/maia/ligar.ts`)

- API: `GET /api/maia/operacao?acao=falta_ligar&negocio=<id>` (ou sem `negocio`: todos). Só lê.
- Itens obrigatórios: dados do negócio, ficha, funil, limites, conta de anúncio, página, Instagram, número do WhatsApp dos
  anúncios **conferido**, WhatsApp do negócio conectado, WhatsApp do dono, 3 anúncios aprovados, verba dentro do teto.
- Recomendações (não travam): tu/você escolhido, perguntas frequentes, modelos de mensagem aprovados, o dono já falou com a
  Maia, chave geral `MAIA_CLIENTES_LIGADO`.
- `POST {acao:'conferir_whatsapp', negocio_id, numero?, conferido?}`: a equipe marca que o botão de um anúncio de teste abre
  o número certo (fica em `meta.whatsapp_conferido`; trocou o número, volta a pendente).
- Painel da equipe: aba **Pra ligar** em cada negócio e o selo "pronto pra ligar / faltam N" na lista (só em implantação).

## 3. Resumo da semana pro dono (`lib/maia/resumo-semana.ts`)

Já existia (segunda 7h, a IA escrevia). Agora o texto sai pronto, **sem IA**: conversas, contatos novos, vendas e
agendamentos, quanto vendeu, quanto foi pro anúncio, "a cada R$ X investidos, voltaram R$ Y", o melhor anúncio (pelo gancho)
e uma sugestão. Caminho de sempre: a equipe aprova na aba Aprovar (ou vai direto, se "equipe aprova tudo" estiver desligado)
e vai pro WhatsApp do dono com o link do painel.

- **Janela de 24 h:** se o dono não falou com a Maia nas últimas 24 h, o resumo fica na fila e sai o modelo **`maia_novidades`**
  (número da Maia): "Oi, {nome}! A Maia tem novidades do {negócio} pra ti: **o resumo da semana**. Me responde aqui que eu te
  mando tudo." Quando ele responde, a fila entrega o resumo. Esse modelo já existe no código (`lib/maia/modelos.ts`,
  `MODELO_DONO`); **precisa estar aprovado na WABA do número da Maia** (painel da equipe → Rotina → "criar modelo do dono", ou
  `POST {acao:'criar_modelo_dono'}`) e conferir em `GET acao=modelos`.
- `POST {acao:'resumo_semana', negocio_id}` = prévia do texto (não grava nem manda); com `gerar: true` cria a peça.
- Painel do dono: o último resumo enviado aparece na aba Resumo (os anteriores dobrados).

## 4. Conversões pra Meta (`lib/maia/conversoes.ts`)

Já estava pronto (06/11): `LeadSubmitted` na 1ª mensagem que chega do clique no anúncio (com `ctwa_clid`) e `Purchase` quando
o contato vira venda (valor, BRL, `event_id` próprio e conferência antes, porque essa API não tira repetido). Mudou:
- liga com `MAIA_CAPI=1` (ou `MAIA_CAPI_LIGADO=1`, como antes). Desligado por padrão.
- o conjunto de dados (dataset) **só é criado** na Meta com `MAIA_CAPI_CRIAR_DATASET=1`; sem ela vale o que já existe na conta
  do WhatsApp do negócio (ou o guardado em `meta.wa.dataset_id`). Sem dataset ou sem chave, nada sai (fica anotado o motivo).
- `GET acao=capi&negocio=<id>`: placar (enviados, falhas, últimos).
- **Sinal**: o sistema não tem "sinal pago" separado. Comprovante de pagamento vai pro dono conferir; quando ele confirma, vira
  venda (e aí sai o `Purchase`). Contato que não veio de anúncio de WhatsApp não vai pra Meta (sem `ctwa_clid`).

## Testes (modo local, 13/11)

`scripts/maia-teste-noite.mjs` (instruções no topo). Ver o resultado no relatório do commit/PR.

## Telas da Maia no ar (www.carreiranodigital.com)

| Endereço | Pra quê | Quem usa | Como entra |
| --- | --- | --- | --- |
| `/maia` | página de venda da Maia (o que é, preço, "fale no WhatsApp") | público | aberta |
| `/maia/operacao` | painel da equipe: Hoje, Aprovar, Negócios (peças, funil, conversas, números, campanhas, Pra ligar, dados, simulador), Rotina | equipe | senha da equipe (`MAIA_PAINEL_SENHA` da Vercel) |
| `/maia/operacao/avisos.html` | avisos da Maia Gestora (o que ela viu nos anúncios e nos CRMs) | equipe | a mesma senha da equipe |
| `/maia/painel` | painel do dono: resultados, retorno do anúncio, funil, retomadas, conversas, anúncios (👍), vendas, avisos, resumo da semana | dono do negócio | link mágico que a Maia manda no WhatsApp (vale 30 dias; a equipe gera ou troca no painel) |
| `/maia/conectar` | o dono liga o WhatsApp do negócio na Maia (entra com o Facebook) | dono do negócio | link assinado que a equipe gera no painel (vale 14 dias) |
