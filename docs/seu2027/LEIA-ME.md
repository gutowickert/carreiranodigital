# Seu 2027 — o mapa do ano (R$ 37, Kiwify)

Página de venda: `/seu2027` · Página do mapa (o link que a pessoa guarda): `/seu2027/mapa?c=S27-...`

## Como funciona

1. A pessoa preenche nome, nascimento, e-mail e o foco (opcional) na página de venda. O sistema guarda o pedido
   (`seu2027_pedidos`, status `aguardando_pagamento`) e manda pro checkout da Kiwify com `?sck=S27-XXXX` (+ nome, e-mail e UTMs).
2. A Kiwify avisa a compra aprovada em `/api/seu2027/kiwify` (assinatura conferida com `KIWIFY_WEBHOOK_TOKEN`).
   O pedido é achado pelo `sck`; se não vier, pelo e-mail. Compra sem formulário vira `falta_dados` e recebe e-mail pra completar.
3. Pedido pago: o código faz as contas (`lib/seu2027/calculos.ts`), a IA escreve o texto (`lib/seu2027/ia.ts`, claude-sonnet-5-5,
   uns R$ 0,20 por mapa), salva no pedido e manda o link por e-mail (Resend). A Meta recebe o Purchase pelo servidor.
4. A página do mapa se atualiza sozinha: aguardando → escrevendo → mapa pronto, com o PDF (`/api/seu2027/pdf`).
   Sem código no navegador, ela pede o e-mail e manda o link pra lá (`/api/seu2027/reenviar`).

## Contas (sempre código, nunca IA)

- reduzir: soma os dígitos até 1–9; para em 11 ou 22 (mestres).
- Ano pessoal: todos os dígitos de dia + mês + 2027 → reduzir. 05/11 → 0+5+1+1+2+0+2+7 = 18 → 9.
- Destino: todos os dígitos da data completa → reduzir. 05/11/1985 → 30 → 3.
- Arcano do ano (ordem de Marselha, 8 = Justiça, 11 = Força): dia + mês + 11 (2+0+2+7); acima de 22 soma os dígitos; 22 = O Louco.
  5 + 11 + 11 = 27 → 9 = O Eremita. O XIII aparece como "A Transformação" e o XV como "O Desejo" (tom positivo).
- Mês pessoal: ano pessoal (11→2, 22→4) + número do mês → reduzir.
- Meses favoráveis: meses cujo mês pessoal combina com a área (tabela AFINIDADE). Dias: os que somam o ano pessoal.

## O que configurar na Kiwify

1. Produto "Seu 2027: o mapa do seu ano", R$ 37, entrega "sem área de membros / link externo" (a entrega é nossa).
2. Checkout: copiar o link e pôr em `KIWIFY_CHECKOUT_URL` na Vercel.
3. Página de obrigado personalizada: `https://carreiranodigital.com/seu2027/mapa`.
4. Webhook (Apps → Webhooks): URL `https://carreiranodigital.com/api/seu2027/kiwify`, eventos Compra aprovada, Reembolso e Chargeback,
   produto Seu 2027 (e os do bump/upsell). Copiar o token pra `KIWIFY_WEBHOOK_TOKEN` na Vercel.
5. Order bump "Mapa do casal 2027" — R$ 19. Texto: "Some o mapa de quem você ama e veja como os anos de vocês dois se encontram em 2027."
6. Upsell "2027 mês a mês" — R$ 47. Texto: "Um guia para cada mês, com o que fazer, o que evitar e as melhores datas de cada um."
   ATENÇÃO: a entrega do bump e do upsell ainda não existe no sistema (o aviso só anota o produto no pedido). Não ligar antes.
7. Pixel: NÃO cadastrar o pixel dentro da Kiwify (o nosso sistema já manda PageView, InitiateCheckout e Purchase, com o mesmo
   eventID no navegador e no servidor). Se preferir o pixel da Kiwify, pôr `SEU2027_PURCHASE_PELO_SITE=0` e não pôr `SEU2027_CAPI_TOKEN`.

## Variáveis na Vercel

Novas: `KIWIFY_CHECKOUT_URL`, `KIWIFY_WEBHOOK_TOKEN`, `SEU2027_PIXEL_ID`, `SEU2027_CAPI_TOKEN` (ou usa o `FB_CAPI_TOKEN`),
`SEU2027_EMAIL_DE` (remetente num domínio verificado no Resend; padrão `seu2027@recadoencantando.com.br`), `SEU2027_TESTE_CHAVE`.
Opcionais: `SEU2027_URL_SITE` e `SEU2027_DOMINIO` (domínio próprio), `SEU2027_MODELO`, `SEU2027_PURCHASE_PELO_SITE`.
Já existentes: `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Banco

`db/seu2027.sql` (uma tabela, pode rodar de novo sem estragar). Sem a tabela, a página de venda ainda manda pro checkout,
mas o pedido não é guardado e o mapa não sai.

## Modo de teste

`POST /api/seu2027/teste` com cabeçalho `x-chave: <SEU2027_TESTE_CHAVE>` e `{ "nome": "...", "nascimento": "AAAA-MM-DD", "formato": "pdf" }`:
gera um mapa de verdade sem pagamento e sem banco.

## Fica pra depois

Áudio narrado (gancho em `lib/seu2027/entrega.ts`, `gerarAudio`, ligado por `SEU2027_AUDIO=1`); entrega do bump e do upsell.
