# Como os melhores produtos mostram dados (pesquisa rápida, 08/11/2026)

Objetivo: deixar o painel do dono, o painel da equipe e o site da Maia mais visuais, limpos e completos, sem pesar.

## O que vale copiar

| Ideia | De onde | Como entrou na Maia |
|---|---|---|
| **Um número-herói por tela.** O valor atual em destaque, com a tendência embaixo. | Stripe (cabeçalho de KPI em cima do gráfico de tendência) | Dono: "A cada R$ 1 investido, voltaram R$ X". Equipe: vendas da carteira + retorno do anúncio. |
| **Comparar com o período anterior** e dizer contra o quê (`vs 7 dias antes`). | Stripe (faixa de comparação), guias de dashboard SaaS | Chip ↑/↓ % em cada cartão, verde quando melhora (no custo e no tempo, menor é melhor). |
| **Sparkline**: gráfico do tamanho de uma palavra, sem eixo nem grade ("max data, min design"). | Tufte | Mini-gráfico em SVG puro dentro dos cartões (sem biblioteca). |
| **Interface calma**: a navegação recua, o conteúdo aparece; bordas finas pra agrupar; densidade sem cansar. | Linear (refresh de 2026) | Barra lateral clara e discreta; cartões brancos com borda fina; cor só onde tem significado. |
| **Primeiro o estado, depois os controles.** | Mercury | Topo do dono = resultado; ações ficam nas abas e nas folhas de baixo. |
| **Fila de trabalho é o centro** ("dashboard de finanças é lista de tarefas com gráfico"). | Ramp | "O que precisa de ti agora" em cartões por prioridade (urgente, de olho, pra saber). |
| **Números alinhados**: algarismos tabulares, moeda formatada, alinhados à direita em tabela. | Mercury | `font-variant-numeric: tabular-nums` em todo número; tabela da carteira alinhada à direita. |
| **Skeleton** quando a tela tem forma previsível; nunca "R$ 0" quando não há dado (mostrar "—" e explicar). | NN/g; guias de KPI | Esqueleto já no HTML do painel do dono; sem investimento, o ROI some e a frase explica. |
| **Cor com parcimônia** e nunca só cor pra dizer algo (sempre texto junto). | Guias de acessibilidade de dashboard | Roxo só pra ação e destaque; verde/âmbar/vermelho com rótulo escrito. |

## Referências

- Linear, "Behind the latest design refresh": https://linear.app/now/behind-the-latest-design-refresh
- Linear, "How we redesigned the Linear UI": https://linear.app/now/how-we-redesigned-the-linear-ui
- Stripe, gráficos da página inicial (comparação de período): https://support.stripe.com/questions/dashboard-home-page-charts-for-business-insights
- Stripe Apps, padrão de gráfico (KPI em cima da tendência): https://docs.stripe.com/stripe-apps/patterns/chart-layout
- Mercury, análise de design: https://www.925studios.co/blog/mercury-design-breakdown
- Ramp/Mercury e "fila de trabalho" em painéis financeiros: https://adminlte.io/blog/fintech-dashboard-design-examples/
- Tufte, sparklines: https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/
- NN/g, skeleton screens: https://www.nngroup.com/articles/skeleton-screens/
- Boas práticas de KPI e acessibilidade: https://www.fusioncharts.com/blog/dashboard-design-best-practices/

Observação: várias fontes são blogs de agência; usei só o que se repete entre elas e bate com o que os próprios produtos mostram.
