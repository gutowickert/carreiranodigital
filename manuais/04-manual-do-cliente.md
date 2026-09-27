# O manual do cliente

A página que o cliente recebe, e a tua versão dela: **a mesma página, com o técnico dentro em outra cor**. Na apresentação, ela lê o manual dela; tu abre a tua versão e está no mesmo capítulo, com o bloco azul "Só tu vê · por trás" dizendo como aquilo funciona, o que dá errado e o que responder.

| Cliente | O link pra mandar pra ela | A tua versão, com o técnico |
| --- | --- | --- |
| Espaço Dani Fell | [crm-danifell.vercel.app/manual.html](https://crm-danifell.vercel.app/manual.html) | [abrir a versão interna](/manuais/dani-fell.html) |
| GAJA | em construção — sai na etapa "Primeiras modificações" do roteiro Sistema | — |

O manual do cliente é feito por cliente, com a logo e a cor dele, na implantação. O texto-base é o mesmo em todos (é o que a Máquina CND usa pra ensinar o sistema no atalho "Como faço…"); muda o que só aquele cliente tem. A versão interna é gerada da página dele por `node manuais/anotar.mjs` — as notas técnicas moram nesse script, por capítulo.
