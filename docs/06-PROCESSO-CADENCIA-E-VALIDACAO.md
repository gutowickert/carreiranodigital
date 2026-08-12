# 06 — O Novo Processo (Cadência por Lote Real) + Validação Diária do Nando

Guia único e definitivo do modelo por **lote real por turma** que está NO AR. Explica a jornada do lead ponta a ponta, quando cada mensagem dispara, o board por fase, e — no fim — **o checklist do que o Nando faz todo dia pra validar**.

> Complementa [04-PLANO-CADENCIA-LOTE-REAL.md](04-PLANO-CADENCIA-LOTE-REAL.md) (o plano) e [05-CADENCIA-COMO-FUNCIONA-E-ALVO.md](05-CADENCIA-COMO-FUNCIONA-E-ALVO.md) (mapa técnico). Este é o **manual de operação**.

---

## 1. O que mudou (em 30 segundos)

Antes a urgência era **fictícia** ("o lote vira em ~3 dias", inventado por lead). Agora é a **data real do lote da turma** (tabela `turma_lotes`), igual pra todos. O preço da mensagem, a urgência e a coluna do board saem todos do **lote vigente da turma**, calculado pela data de hoje.

**Guarda de ouro:** turma **sem** lote cadastrado = **comportamento antigo intacto**. Nada quebra. O modelo novo só age nas turmas com lote.

---

## 2. A jornada completa do lead (turma COM lote)

```
CHEGADA → ATENDIMENTO → LOTE/PREÇO OK / BOLSA → VIRADA → início da turma
 (fila     (apresentação   (reposição → nutrição → urgência)   (roteador rola
  ligação)  com preço real)                                     pra próxima turma)
```

| Etapa (coluna) | O que o motor faz | Mensagem |
|---|---|---|
| **Ligação** (chegada) | fila de ligação do time (humano liga 2×) | — |
| **Atendimento inicial** | apresenta o curso **com preço e data reais do lote**; se a virada estiver ≤3 dias, já entra urgência | `cnd_apresentacao_fc/anl` |
| **Lote/Preço OK** e **Oferecer bolsa** | **reposição** (1×, reancora) → **nutrição** (gotejar de cases) → **urgência** perto da virada | ver §3 |
| **Agendado / Pagamento / Ligação boa** | parking — é do time, motor não toca | — |
| **Ganho / Perda** | fim | — |

---

## 3. Quando cada mensagem dispara (o coração do modelo)

Tudo gira em torno do **`dv`** = **dias até a virada do lote vigente** da turma do lead.

| Situação (`dv`) | O que dispara | Template | Já aprovado? |
|---|---|---|---|
| Virada **longe** (`dv > 3`), 1º contato | **Reposição** (reancora no lote real) — 1× por lead | `cnd_reposicao_unico` (lote único: "segurei o valor") **ou** `cnd_reposicao_lote` (multi-lote: "estendi o lote 1") | ✅ |
| Virada **longe** (`dv > 3`), depois da reposição | **Nutrição** — 1 a cada ~3 dias, ciclando N1→N8 (cases + objeções) | `cnd_nutri_1` … `cnd_nutri_8` | ✅ |
| **3 dias antes** até a véspera (`dv` 1–3) | **Urgência** "a condição está encerrando" | `cnd_lote_virando_fc/anl` | ✅ |
| **No dia da virada** (`dv ≤ 0`) | **Urgência** "hoje é o último dia" | `cnd_lote_ultimo` | ✅ |
| Turma **já começou** | **Roteador** rola o lead pra próxima turma (1 toque) | `cnd_nova_turma` | ⚠️ *pendente Meta* |

**Regras que o motor respeita sozinho:**
- A **urgência** vale pra **qualquer etapa ativa** (inclusive Atendimento inicial) — ninguém fica de fora da virada ("beco do mudo" fechado).
- Fora da janela (virada longe) o card **espera** — não cutuca à toa.
- **1 mensagem por lead por dia**, no máximo. Cada template **1× por lead** (não repete em 14 dias).
- Preço e prazo saem **sempre do lote real** (nunca inventado). O lead que **responde** sai da automação e volta pro **time**.

---

## 4. O board "Por Fase" (CRM → Kanban → botão 📅 Por fase)

Reagrupa os cards pela **fase da turma** (calendário) em vez da etapa de negociação:

`Vendas abertas → Lote avançado → Último lote → Véspera`

- A **etapa de negociação** (Atendimento, Lote/Preço, Bolsa…) vira **tag** no card.
- Os cards **não arrastam** entre fases (a fase anda sozinha pela data). Clicar abre o lead normal.
- É **reversível**: sem clicar no botão, é o board por etapa de sempre.
- Turma sem lote → coluna "Sem lote".

Serve pra **enxergar a turma inteira andando junto** rumo à virada, não importa em que ponto da negociação cada um está.

---

## 5. As travas de segurança (por que é difícil dar erro)

- **Preço R$0 / inventado** → aborta o envio.
- **Prazo no passado** ("vale até uma data que já passou") → não envia.
- **Template não aprovado na Meta** → o motor nem tenta (só dispara `status='aprovado'`).
- **Engajado recente (24h)** → é do time, motor não toca.
- **Não rebaixa etapa**, não re-apresenta quem já viu o pitch.
- **Kill switch**: `ia-automacao {ligado:false}` desliga todos os envios.
- **Tudo tem `dryRun`**: dá pra ver o que ACONTECERIA antes de enviar.

---

## 6. ✅ O que o Nando faz no dia a dia pra VALIDAR

Rotina curta (5–10 min). O objetivo é **confiar no automático** vendo que ele faz o certo.

### A. De manhã — o motor já rodou (cron às ~9h). Confira:
1. **DryRun do motor** (não envia nada, só mostra o plano):
   ```
   POST https://carreiranodigital.vercel.app/api/ia/followup-auto
   body: { "dryRun": true, "limit": 400 }
   ```
   Olhe o `resumo`: `envio_real` (quantos toques), `vai_pro_time`, `vira_perda`, `pulado_sem_preco` (tem que ser **0**). E leia a `amostra` — as mensagens têm que fazer sentido (nome, preço e data certos).

2. **Board Por Fase** (CRM → 📅 Por fase): as turmas de agosto devem estar em **Último lote/Véspera**, as de setembro em **Vendas abertas**. Confira que ninguém quente sumiu.

3. **Abra 2–3 leads** que receberam toque hoje e veja o **histórico (andamentos)**: a mensagem certa, no momento certo, com o preço do lote certo.

### B. Sinais de que está tudo bem
- `pulado_sem_preco = 0` e `vira_perda` baixo/coerente.
- Reposição só 1× por lead; nutrição espaçada (~3 dias); urgência só perto da virada.
- Quem respondeu **saiu** da automação (aparece como "humano"/foi pro time).

### C. Se algo parecer errado
- **Não sai mensagem nova de um template novo?** Confira o status em **Configurações → Templates** (a tela sincroniza com a Meta). Só `aprovado` dispara.
- **Quer parar tudo agora?** Kill switch: `POST /api/ia/ia-automacao { "ligado": false }`.
- **Um lead específico está errado?** Abra o card, veja os andamentos, e me chama (Claude) com o nome + o que esperava.

### D. Cadastro que mantém o modelo vivo (quando abrir turma nova)
1. Cadastrar a turma + os **lotes** dela (`turma_lotes`: ordem, nome, preço Pix/cartão, `vale_ate`).
2. Pronto — o motor passa a ler o lote vigente e conduzir sozinho. Sem lote = modo antigo.

---

## 7. O que ainda depende de decisão/config (não é bug)

- **`cnd_nova_turma`** (roteador) pendente de aprovação na Meta → sem ele, leads de turma que já começou não rolam sozinhos pra próxima.
- **Turmas sem próxima turma** cadastrada → o roteador não tem pra onde rolar (Guto decide: fechar ou criar próxima).
- **Nutrição/reposição** hoje agem em Lote/Preço OK e Bolsa; em Atendimento inicial vale a **apresentação** (com data real) + a **urgência** perto da virada. Se quisermos o gotejar de cases também no Atendimento inicial, é um passo a mais.

---

*Status: modelo por lote real 100% no ar (Fases 1–5 + reposição + nutrição + urgência universal). 10 templates aprovados. Próximo grande passo do SaaS: motor **role-driven / por-org** ([[03-ROADMAP-SAAS]]) — a cadência deixa de ser código e vira dado da turma/cliente.*
