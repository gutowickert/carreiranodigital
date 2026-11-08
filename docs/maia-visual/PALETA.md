# Paleta e regras do visual da Maia (08/11/2026)

Vale igual nos três: **painel do dono** (`/maia/painel`), **painel da equipe** (`/maia/operacao`) e **site** (`/maia`).

## Decisão

- **Fundo claro é o padrão, sempre.** O Guto pediu (08/11): "esses fundos escuros tão me incomodando". O escuro existe só como **opção no botão da lua** (painéis); nunca entra sozinho pelo celular. O site é só claro.
- **Cores da escola** (Carreira no Digital), com o roxo só como acento: botão, número-herói, gráfico, item ativo.
- **A Maia em pessoa**: o rosto oficial no topo dos painéis, no login, nos avatares da Maia e no site; as cenas do vídeo dela no site. Regra da escola: **a IA só aparece no rosto da Maia** (nada de foto de IA como exemplo de cliente; anúncio de exemplo é sempre de cliente real).
- **Fontes da escola**: Bricolage Grotesque (títulos e números) e Manrope (texto), servidas do próprio site (`/maia/fontes/`, 156 KB), sem Google.

## Tokens (claro, o padrão)

| Uso | Cor |
|---|---|
| fundo | `#f7f5fc` (lilás bem suave) |
| superfície (cartão) | `#ffffff`, borda `#ebe6f5`, sombra `0 1px 2px rgba(27,21,48,.04), 0 4px 16px rgba(27,21,48,.05)` |
| superfície 2 (trilho, campo, chip neutro) | `#f3f0fa` |
| borda forte | `#dcd5ec` |
| texto | `#1b1530` · apoio `#423a5c` · rótulo `#6b6485` · legenda `#77708f` (4,7:1 no branco) |
| roxo de ação (botão) | `#7c3aed` (texto branco: 5,7:1) |
| roxo de gráfico | `#8b5cf6` · fundo do item ativo `#f1ebfe` · texto roxo `#6d28d9` · linha/foco `#c4b5fd` |
| número-herói | fundo `linear-gradient(160deg, #f4eeff, #ffffff 70%)` |
| verde (bom, venda) | `#15803d` sobre `#dcfce7` |
| âmbar (atenção) | `#b45309` sobre `#fef3c7` |
| vermelho (ruim, atraso) | `#b91c1c` sobre `#fee2e2` |
| azul (informação) | `#1d4ed8` sobre `#dbeafe` |

## Tokens (escuro, só no botão)

Os da escola: fundo `#0f0c17`, superfícies `#171320` / `#1f1a2b`, borda `#261f36`, texto `#f4f1fb` / `#c9c2da` / `#9a93ae` / legenda `#8a83a0`, roxo `#8b5cf6` (texto roxo `#c4b5fd`), verde `#4ade80`, âmbar `#fbbf24`, vermelho `#fb7185`, azul `#93c5fd`.

## Regras

1. Um número-herói por tela. Dono: o retorno do anúncio. Equipe (Hoje): vendas da carteira + retorno.
2. Todo número de resultado tem **tendência contra o período anterior** (`↑ 12%`, `↓ 8%`, `= igual`, `novo`) e diz contra o quê.
3. Gráfico pequeno em **SVG puro** (sparkline, barras do funil). Sem biblioteca.
4. Cor tem significado: verde = bom, âmbar = atenção, vermelho = ruim, azul = informação, roxo = a marca/a Maia/ação. Sempre com texto junto.
5. Sem dado não é zero: mostra "—" e uma frase do porquê (ex.: sem investimento, sem ROI).
6. Celular primeiro: 16 px de margem, sem rolagem lateral, toque mínimo de 40 px.
7. Imagens em `public/maia/img/` (WebP, 6 a 45 KB), com `loading="lazy"` abaixo da dobra e **caminho absoluto** (`/maia/img/...`): em `/maia` (sem barra no fim) o caminho relativo não abria as fotos.

## Imagens

| arquivo | o que é |
|---|---|
| `maia-avatar.webp` (192 px) | rosto oficial recortado, pros avatares |
| `maia-rosto.webp` (720 px) | rosto oficial, foto grande do site |
| `maia-cena-*.webp` (880 px) | quadros do vídeo antigo; **fora do site desde 08/11** (a Maia mudava de um quadro pro outro) |
| `maia-estrategista`, `-trafego`, `-editora`, `-vendedora`, `-analista` (.webp, 640 px) | a faixa "Sete profissionais": a mesma Maia do avatar, no escritório claro (geradas em 08/11 com a foto `maia.jpg` de referência) |
| `maia-escritorio.webp` (720×900) | "Prazer, Maia": ela no escritório, da cintura pra cima, acenando |
| `maia-passo-cria`, `-atende`, `-mede`, `-melhora` (.webp, 560×700) | os 4 passos de "Como a Maia trabalha" (outro recorte das fotos da faixa) |
| `maia-tchau.webp` (420 px) | o círculo do fim da página |

## Cores de apoio do site (08/11)

Pra dar vida aos passos sem escurecer: laranja da Maia `#ea580c` (número grande) e `#c2410c` (texto, 5,2:1 no branco) sobre `#fff1e6`; faixas claras lilás `#f1ebfe`, pêssego `#fff1e6`, menta `#e9f8ef` e azul `#eef0ff` (anil `#4f46e5`). Sempre fundo claro.
