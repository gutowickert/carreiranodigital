# Painel do dono da Maia (07/11/2026)

O dono gere tudo pelo WhatsApp. O painel é pra **acompanhar**: resultados, funil, retomadas, atendimento, anúncios e avisos.
Feito pro celular (abre de dentro do WhatsApp).

## Onde está

| parte | arquivo |
|---|---|
| página | `public/maia/painel/index.html` → `/maia/painel` |
| API | `app/api/maia/painel/route.ts` → `/api/maia/painel` |
| link, versão e os dados | `lib/maia/painel-dono.ts` |
| botão da equipe | `/maia/operacao` > negócio > Dados > "Painel do dono" (`link_painel_dono`, `painel_dono_revogar`) |
| pelo WhatsApp | ferramenta `link_do_painel` em `lib/maia/dono.ts` (+ garantia: pediu "painel" e o link não saiu, vai o link) |
| resumo da semana | `lib/maia/aprovacao.ts`: o resumo aprovado pela equipe vai com o link |

## Como o dono entra

1. Recebe o link (pedindo "meu painel" pra Maia, no resumo de segunda, ou a equipe manda). Vale **30 dias**.
2. Abre: a página troca o link por um cookie httpOnly (Secure, SameSite=Lax, só em `/api/maia/painel`) e tira o token da barra de endereço.
3. Venceu? A página mostra o botão "Pedir um link novo pra Maia" (abre o WhatsApp com "me manda o link do meu painel").

**Cancelar os links de um negócio:** botão "Trocar link (cancela os antigos)". Sobe `meta.painel_versao` e todo link antigo para na hora. Não precisa de SQL.

## Segurança

- O negócio vem **só** do token conferido no servidor (assinatura HMAC com chave derivada só pro painel). Nada do pedido escolhe o negócio.
- O link de conectar o WhatsApp não abre o painel, e o do painel não abre a conexão.
- A resposta não leva chave, token, nota da equipe, id de negócio nem nada de outro negócio. Avisos só aparecem depois que foram pro dono.
- 10 links errados em 15 min no mesmo IP = 15 min bloqueado.
- Ações (venda, perda, aprovar, pedir mudança) usam as mesmas funções do WhatsApp, só em coisa do negócio dele, e pedem um cabeçalho que só a página manda.

## Testar

```
MAIA_LOCAL=1 MAIA_LOCAL_PASTA=.teste-maia-dono MAIA_PAINEL_SENHA=teste123 MAIA_OFICINA_CHAVE=oficina123 MAIA_CONECTAR_SEGREDO=seg123 npx next start -p 3190
node scripts/maia-teste.mjs http://localhost:3190 teste123                       # cria os 3 negócios de teste
MAIA_LOCAL_PASTA=.teste-maia-dono node scripts/maia-teste-painel-dono.mjs http://localhost:3190 teste123
node scripts/maia-prints-painel-dono.mjs http://localhost:3190 teste123 Ótica  # prints nesta pasta
```

## Prints

`1-topo.png`, `2-funil.png`, `3-retomadas.png`, `4-atendimento.png`, `5-conversa.png`, `6-anuncios.png` e `lado-a-lado.png` (430 px de largura, dados do teste local).

## Visual novo e retorno do anúncio (08/11)

Fundo claro, a Maia falando no topo e o **retorno do anúncio** como número-herói ("a cada R$ 1 investido, voltaram R$ X"),
com tendência contra o período anterior e mini-gráficos. Abrir `/maia/painel` sem link nem cookie mostra
"Abre o painel pelo link que a Maia te mandou"; "Esse link venceu" só quando um link existiu e foi recusado.
Detalhes, paleta e prints novos: `docs/maia-visual/`.
