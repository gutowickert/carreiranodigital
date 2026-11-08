# Visual novo da Maia (08/11/2026)

Painel do dono, painel da equipe e site `/maia`: fundo claro como padrão, a Maia em pessoa, retorno do anúncio (ROI) como número-herói.
Pesquisa: `PESQUISA.md`. Paleta e regras: `PALETA.md`. Folha antes × depois: `antes-x-depois.jpg`.

## O retorno (ROI) no painel do dono

- **Conta:** `a cada R$ 1 investido, voltaram R$ X` = receita das vendas do período ÷ investimento em anúncio do período (o mesmo número do `retorno` do `/api/maia/operacao?acao=numeros`).
- **Período:** o mesmo dos botões (hoje / 7 dias / este mês). Embaixo: "Investiu R$ A → Vendeu R$ B", ROAS (X×), quanto sobrou depois do anúncio e a tendência.
- **Investimento:** é o total de anúncio do negócio no período (`maia_metricas_dia`). As vendas são todas as marcadas no período; a nota diz quanto veio de clientes do anúncio.
- **Sem investimento:** o número-herói vira "Vendas que a Maia atendeu" e a frase explica que, sem investimento, não dá pra calcular o retorno.
- Código: `lib/maia/painel-dono.ts` (`retornoDe`, `periodoAnterior`, `periodos[p].roi`, `periodos[p].anterior`, `serie`). Teste: `scripts/maia-teste-painel-dono.mjs` (seção 6b).

## Prints

```
node scripts/maia-prints-visual.mjs http://localhost:3195 teste123 depois   # depois do maia-teste.mjs e do maia-teste-painel-dono.mjs
node scripts/maia-folha-visual.mjs                                          # junta antes e depois
```

`<antes|depois>-<tela>-<430|1440>-<claro|escuro>.png` (os do site em `.jpg`). Telas: `dono`, `dono-funil`, `equipe-hoje`, `equipe-negocio`, `site`, `dono-sem-link`.
Os "antes" são os arquivos do `origin/main` (ef410c4) com os mesmos dados de teste.
