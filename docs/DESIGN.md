# Padrão visual Carreira no Digital — coordenadas pra sites e novas telas

Este é o padrão do sistema desde 11/09/2026. Serve pra qualquer coisa nova da marca: sites,
landing pages, telas do sistema. Passe este arquivo inteiro pra IA que for construir. O que está
aqui é decisão tomada; não é sugestão.

## 1. A ideia em uma frase

Roxo elétrico do logo puxando pro magenta, sobre neutros **tingidos de roxo** (nunca cinza puro),
com **vidro** (superfícies translúcidas sobre uma luz colorida ao fundo), **relevo fino** em poucos
lugares que gritam, títulos e números numa fonte **condensada** (eco do wordmark do logo), e
nenhum emoji. Escuro é o padrão; o claro existe e é tão cuidado quanto.

## 2. Cores — os tokens (nomes e valores exatos)

Use SEMPRE os tokens (`var(--nome)`). Nunca hex solto no meio do código.

### Tema escuro (padrão)
```css
:root, [data-theme="dark"] {
  --bg: #0f0c17;            /* fundo da página */
  --surface: #171320;       /* cards, painéis sólidos */
  --surface-2: #1f1a2b;     /* campo, chip neutro, fundo de linha */
  --border: #261f36;
  --border-strong: #372e4c;
  --text: #f4f1fb;
  --text-2: #c9c2da;        /* texto secundário */
  --text-muted: #9a93ae;    /* rótulos */
  --text-faint: #736c88;    /* legendas */
  --on-accent: #ffffff;
  --accent: #8b5cf6;        /* a cor de clique */
  --accent-soft: #b39bff;   /* a cor de clique sobre fundo escuro (links, ativo) */
  --accent-bg: #2a1b4d;     /* fundo do item ativo / chip da marca */
  --green: #34d399;  --green-strong: #4ade80;  --green-bg: #0b2e24;
  --red: #fb7185;    --red-bg: #3b1520;
  --amber: #fbbf24;  --amber-bg: #3a2a0a;
  --blue: #60a5fa;   --blue-bg: #14243f;
  --grad: linear-gradient(135deg, #7c3aed, #c026d3);   /* o gradiente do logo */
  --grad-escuro: #4c1d95;                                /* a "borda de baixo" do botão que afunda */
  --glow: rgba(139,92,246,.35);
  --ring: rgba(139,92,246,.35);                          /* foco */
  /* vidro */
  --glass: linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.035));
  --glass-border: rgba(255,255,255,.14);
  --glass-hi: rgba(255,255,255,.26);       /* fio de luz na borda de cima */
  --glass-sheen: rgba(255,255,255,.09);    /* reflexo diagonal */
  --glass-shadow: 0 18px 50px rgba(0,0,0,.55);
  --glass-field: rgba(255,255,255,.06);    /* campo de formulário sobre vidro */
  /* a luz atrás do vidro */
  --blob-1: rgba(139,92,246,.60);  /* roxo */
  --blob-2: rgba(217,70,239,.42);  /* magenta */
  --blob-3: rgba(56,189,248,.26);  /* azul, o "ar" */
  --grid: rgba(255,255,255,.03);   /* grão de circuito */
}
```

### Tema claro
```css
[data-theme="light"] {
  --bg: #f6f4fb;  --surface: #ffffff;  --surface-2: #f1eef8;
  --border: #e4dff0;  --border-strong: #cfc8e3;
  --text: #17122a;  --text-2: #3d3654;  --text-muted: #6e6885;  --text-faint: #9891ad;
  --on-accent: #ffffff;
  --accent: #6d28d9;  --accent-soft: #6d28d9;  --accent-bg: #ede7fb;
  --green: #15a34a;  --green-strong: #15803d;  --green-bg: #d6f5e0;
  --red: #dc2626;    --red-bg: #fde7e7;
  --amber: #c2680c;  --amber-bg: #fdeecb;
  --blue: #2563eb;   --blue-bg: #dce9fe;
  --grad: linear-gradient(135deg, #7c3aed, #c026d3);  --grad-escuro: #3b1a7a;
  --glow: rgba(109,40,217,.22);  --ring: rgba(109,40,217,.28);
  --glass: linear-gradient(180deg, rgba(255,255,255,.74), rgba(255,255,255,.50));
  --glass-border: rgba(255,255,255,.92);  --glass-hi: rgba(255,255,255,1);  --glass-sheen: rgba(255,255,255,.5);
  --glass-shadow: 0 14px 40px rgba(76,29,149,.13);  --glass-field: rgba(255,255,255,.6);
  --blob-1: rgba(139,92,246,.42);  --blob-2: rgba(217,70,239,.30);  --blob-3: rgba(56,189,248,.22);
  --grid: rgba(76,29,149,.05);
}
```

### Como usar as cores
- **Gradiente (`--grad`) só onde a marca fala:** botão principal, avatar, marca, o topo de um hero. Em mais nenhum lugar. Gradiente em tudo é o que faz parecer gerado.
- **Cor pelo significado:** verde = bom/ganho, âmbar = atenção, vermelho = ruim/atrasado, azul = informação, roxo = marca/IA. Nunca usar a cor da marca pra dizer "bom".
- **Neutros nunca cinza puro.** Todo cinza tem um fio de roxo (os valores acima).

## 3. Tipografia

Duas fontes do Google Fonts. Carregar as duas (no Next, pelo `next/font`; num site estático, pelo `<link>`).

| Papel | Fonte | Como |
|---|---|---|
| Texto, botões, campos, rótulos | **Manrope** 400/500/600/700/800 | base 14px no sistema, 16px em site; `line-height 1.55` |
| Títulos e números grandes | **Bricolage Grotesque** (variável: eixos `opsz` e `wdth`) | `font-variation-settings: 'opsz' 96, 'wdth' 85; letter-spacing: -0.025em` |

- Título de página / seção: Bricolage 700, 26–36px.
- Hero de site: Bricolage 800, 40–84px, `'wdth' 88`, `letter-spacing: -0.035em`, `line-height .98`. Uma palavra ou trecho pode levar o gradiente (`background-clip: text`).
- Número grande (KPI): Bricolage 700–800, 34–64px, `'wdth' 78–82`, `font-variant-numeric: tabular-nums`. O prefixo "R$" fica em Manrope 600, menor e apagado.
- Rótulo miúdo (eyebrow, cabeçalho de tabela, título de grupo): Manrope 800, 10.5–11.5px, caixa alta, `letter-spacing: .08–.12em`, cor `--text-muted`/`--text-faint`.
- Escala de tamanhos: **12 · 13 · 14 · 16 · 20 · 26 · 34 · 48** (site: até 84 no hero). Não inventar 11.5, 12.5 etc. em coisa nova.
- Texto corrido com no máximo ~65 caracteres por linha.

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,300..800&display=swap">
```

## 4. Raios, espaçamento, ícones

- **Raios — só quatro:** `6px` (chip pequeno, campo pequeno) · `10px` (botão, campo, card pequeno) · `16px` (card, painel, modal) · `999px` (pílula).
- **Espaçamento:** múltiplos de 4. Entre cards, 12–14px; padding de card, 18–20px; padding de página, `clamp(16px, 4vw, 48px)`.
- **Ícones:** [Lucide](https://lucide.dev), traço 1.75px (2.2 dentro de botão/chip), tamanho 14–17px em interface, 20–24 em site. **Nunca emoji** como ícone: cada sistema desenha diferente e não parece produto.

## 5. As receitas (CSS pronto)

### A luz de fundo (obrigatória pra o vidro existir)
Fixa, atrás de tudo, desenhada uma vez. Sem ela, vidro vira cinza translúcido sobre cinza.
```css
.luz-de-fundo {
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background:
    radial-gradient(40% 44% at 14% 6%, var(--blob-1), transparent 70%),
    radial-gradient(30% 34% at 90% 92%, var(--blob-2), transparent 70%),
    radial-gradient(26% 30% at 64% 42%, var(--blob-3), transparent 70%),
    repeating-linear-gradient(90deg, var(--grid) 0 1px, transparent 1px 44px),
    repeating-linear-gradient(0deg,  var(--grid) 0 1px, transparent 1px 44px);
}
/* o conteúdo fica por cima: position: relative; z-index: 1 */
```

### Vidro (peça que fica parada)
```css
.vidro {
  position: relative;
  background: var(--glass);
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  box-shadow: inset 0 1px 0 var(--glass-hi), var(--glass-shadow);
  backdrop-filter: blur(22px) saturate(1.4); -webkit-backdrop-filter: blur(22px) saturate(1.4);
}
.vidro::after {  /* o reflexo diagonal no canto de cima */
  content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  background: linear-gradient(135deg, var(--glass-sheen) 0%, transparent 38%);
}
```
**Vidro leve** (sem desfoque, custo zero — pra listas e cards repetidos): a mesma coisa sem as duas linhas de `backdrop-filter`.

**Regra "não pode travar nunca":** desfoque (`backdrop-filter`) só em peça que fica PARADA na tela — menu, cabeçalho fixo, cards de número, painéis, modais, hero de site. NUNCA em lista que rola, em card repetido dezenas de vezes, em coluna de kanban. E o site/sistema oferece um interruptor "vidro ligado/desligado" guardado no navegador (`localStorage`), que zera todo desfoque com `[data-vidro="off"] * { backdrop-filter: none !important }`.

### Relevo fino (o "3D" das letras) — só em quem grita
Extrusão de 2px e uma sombra macia por trás: flutua, não pesa. Nunca em texto de leitura, chip ou card.
```css
.relevo-marca  { text-shadow: 1px 1px 0 var(--accent), 2px 2px 0 var(--accent), 0 10px 22px rgba(0,0,0,.28); }
.relevo-titulo { text-shadow: 1px 1px 0 var(--accent-bg), 2px 2px 0 var(--accent-bg), 0 8px 16px rgba(0,0,0,.18); }
.relevo-numero { text-shadow: 1px 1px 0 var(--accent), 2px 2px 0 var(--accent), 0 10px 22px rgba(0,0,0,.26); }
/* o "no" do logo, em texto vivo */
.relevo-no { color: #fff; -webkit-text-stroke: 1.5px #7c3aed; paint-order: stroke fill; text-shadow: 2px 2px 0 #1a0b33, 0 8px 16px rgba(0,0,0,.3); }
```
Onde entra: a marca, o título da tela/seção (um por tela), o número principal (um por tela).

### A chapa (o logo forjado num tijolo de vidro grosso)
Fundo escuro fixo nos dois temas (o logo tem letras brancas). Borda de cima clara (a luz bate), borda de baixo escura (a espessura), reflexo diagonal, sombra macia embaixo (flutua).
```css
.chapa {
  position: relative; overflow: hidden; border-radius: 14px; padding: 16px 24px;
  background: linear-gradient(160deg, rgba(255,255,255,.16), rgba(255,255,255,.04) 42%, rgba(0,0,0,.18)), #150a2b;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.42), inset 0 -3px 0 rgba(0,0,0,.5),
              inset 1px 0 0 rgba(255,255,255,.14), inset -1px 0 0 rgba(0,0,0,.35),
              0 0 0 1px rgba(124,58,237,.45), 0 22px 40px -16px rgba(0,0,0,.65), 0 3px 8px -2px rgba(0,0,0,.35);
}
.chapa::after { content: ""; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(115deg, transparent 30%, rgba(255,255,255,.10) 44%, rgba(255,255,255,.02) 52%, transparent 60%); }
```
No sistema, a chapa fica inclinada em 3D com o logo flutuando (dez cópias do logo empilhadas 1px atrás da outra, mais escuras, em `perspective: 700px; rotateX(10deg) rotateY(-18deg)`, animação de flutuar de 5.5s e giro ao arrastar). Num site, a chapa parada já basta; o 3D é pra o hero se quiser.

### Botão principal (o único com gradiente; afunda no clique)
```css
.btn-principal {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 9px 15px; font: 700 13.5px Manrope; color: #fff; border: 0; border-radius: 10px;
  background: var(--grad);
  box-shadow: 0 3px 0 var(--grad-escuro), 0 12px 20px -8px var(--glow);
  transition: transform .06s ease, box-shadow .06s ease;
}
.btn-principal:active { transform: translateY(3px); box-shadow: 0 0 0 var(--grad-escuro), 0 4px 8px -4px rgba(0,0,0,.3); }
```
- **Secundário:** fundo `--surface` (ou `--glass-field` sobre vidro), borda `--border-strong`, texto `--text-2`, peso 600.
- **Fantasma:** sem fundo, texto `--text-muted`.
- **Perigo:** fundo `--red-bg`, borda e texto `--red`.

### Chip (estado)
```css
.chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px 3px 8px;
  border-radius: 999px; font: 700 12px Manrope; }
/* tons: bom (--green sobre --green-bg) · atenção (--amber/--amber-bg) · ruim (--red/--red-bg)
         info (--blue/--blue-bg) · marca (--accent-soft/--accent-bg) · neutro (--text-muted/--surface-2) */
```
Sempre com ícone Lucide de 13px e o texto dizendo o que importa ("2 dias atrasado", não "atrasado").

### Card de número (KPI)
Rótulo 12.5px 600 `--text-muted` · número Bricolage 34px 700 `'wdth' 82` · variação num chip (▲ verde / ▼ vermelho) · mini-barras dos últimos dias (a última cheia, as outras a 42%) · rodapé 12px `--text-muted`. Card de vidro. **Só um por tela em relevo** (`.relevo-numero`), o número mais importante. Card com problema: borda `--red`, rótulo e número em `--red`.

### Campo de formulário
Fundo `--bg` (ou `--glass-field` sobre vidro), borda 1px `--border-strong`, raio 10px, padding 10px 12px, 14px. Foco: `box-shadow: 0 0 0 3px var(--ring)`. Rótulo em cima, 12.5px 600 `--text-2`. `box-sizing: border-box` em todo controle (senão o `width: 100%` + padding vaza do card). Select com seta própria (SVG chevron, `appearance: none`) e **sempre com largura máxima** — um select não encolhe abaixo da opção mais longa sozinho.

### Estado vazio
Ícone Lucide 22px num quadrado `--surface-2` de 44px, título 14.5px 700, uma frase do que fazer. Nunca "Nenhum registro."

### Carregando
Esqueleto com brilho passando (`.esqueleto`), no formato do que vai aparecer. Nunca o texto "Carregando...".

## 6. Gráficos

- **Sem gráfico de linhas.** Tudo em barras (colunas verticais para tempo, barras horizontais para categorias). Sequência temporal dentro de card: mini-barras.
- Barras na cor da marca (`--accent`), topo arredondado 4px; negativo em `--red`; comparação entre duas séries em `--green` × `--red`.
- Grade só horizontal, tracejada, cor `--glass-border`. Eixos sem linha, tick 11px `--text-faint`.
- Tooltip: `--surface`, borda `--border-strong`, raio 10px, número em `tabular-nums`.
- Dentro de card de vidro; título do card 13.5px 700 e o total à direita em Bricolage 22px.

## 7. Menu, cabeçalho, modal (pra sistemas)

- Menu lateral 236px de vidro (`.vidro-menu`: só `background: var(--glass)` + blur 26px, sem raio), marca na chapa no topo, caixa de busca ⌘K, grupos por TRABALHO (Vendas, Alunos, Marketing, Números, IA, Ajustes), item com ícone 17px + nome 13.5px, item ativo com fundo `--accent-bg`, texto `--accent-soft` e barra de 2px `--accent` à esquerda. Rodapé: avatar no gradiente, interruptor de vidro, sol/lua do tema, Sair.
- Cabeçalho de página: título Bricolage 28px 700 com `.relevo-titulo`, linha de contexto 13px `--text-muted`, ações à direita (um principal, os outros secundários).
- Modal: fundo `rgba(8,4,20,.55)` + `blur(6px)`; painel `.vidro` com `background: var(--surface)` (legibilidade), 470–600px, título Bricolage 19–22px, botão fechar redondo 30px com ícone X.

## 8. Site (o que muda em relação ao sistema)

- Fundo com a luz (`.luz-de-fundo`) em toda a página; seções em vidro sobre ela.
- Hero: título Bricolage 800 condensado com um trecho no gradiente, subtítulo Manrope 16–18px `--text-2`, um botão principal e um secundário. Pode levar a chapa com o logo em 3D e o circuito de pontos (34 pontos ligados quando perto, canvas, opacidade .55) — é o mesmo do login.
- Base 16px; largura de leitura 65 caracteres; espaço entre seções 80–120px.
- Provas sociais, números, preços: em cards de número (Bricolage). Depoimento: card de vidro com aspas em Bricolage.
- Não usar: emoji, gradiente em tudo, cinza puro, fonte Inter/Space Grotesk, cantos `rounded-lg` genéricos, sombra pesada em tudo, gráfico de linha, animação em cima de animação.

## 9. Acessibilidade e conforto

- Contraste mínimo 4.5:1 em texto corrido (os tokens acima já cumprem nos dois temas).
- Foco visível: `outline: 2px solid var(--accent); outline-offset: 2px`.
- `prefers-reduced-motion`: flutuar e brilhar param. `prefers-reduced-transparency`: vidro vira sólido.
- Os dois temas definidos por token; nunca uma cor que só existe num tema.

## 10. Frase pra colar na IA

> Construa seguindo o padrão visual "Carreira no Digital" (arquivo DESIGN.md anexo): tema escuro
> padrão com neutros tingidos de roxo (#0f0c17 / #171320), tema claro lavanda (#f6f4fb / #fff),
> acento #8b5cf6 (escuro) / #6d28d9 (claro), gradiente 135° #7c3aed→#c026d3 só no botão principal,
> na marca e no hero; Manrope no texto e Bricolage Grotesque condensada ('wdth' 85, opsz 96) em
> títulos e números; raios 6/10/16/999; ícones Lucide, nunca emoji; superfícies de vidro
> (translúcidas, borda clara em cima, reflexo diagonal, sombra macia) sobre uma luz de fundo fixa
> roxa/magenta/azul; desfoque só em peças paradas; relevo de 2px só na marca, no título e no
> número principal; gráficos só em barras; cor pelo significado (verde bom, âmbar atenção,
> vermelho ruim, azul info, roxo marca). Use os tokens CSS do arquivo, com os nomes exatos.
