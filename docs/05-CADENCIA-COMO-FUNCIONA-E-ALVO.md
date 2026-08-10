# 05 — A Cadência do CRM: como funciona hoje e pra onde vamos

Documento-âncora pra desenvolver a **nova cadência por turma**. Explica a mecânica EXATA de hoje (arquivos, tabelas, funções) e o alvo. Nando + o Claude dele partem daqui.

> Complementa: [02-ARQUITETURA.md](02-ARQUITETURA.md) (visão geral) e [04-PLANO-CADENCIA-LOTE-REAL.md](04-PLANO-CADENCIA-LOTE-REAL.md) (o plano de produto). Este aqui é o **mapa técnico** da cadência.

---

# PARTE 1 — Como funciona HOJE (mecânica exata)

## O princípio: "as tarefas SÃO os follow-ups"
Cada etapa do funil tem uma **cadência** = uma sequência de tarefas que nascem em datas (D1, D2, D3…). Concluiu uma tarefa → nasce a próxima. Não existe um "agendador de mensagens" separado: a régua de tarefas **é** o follow-up.

## As peças (arquivos + tabelas)
| Peça | Onde | Papel |
|---|---|---|
| **Funil** | tabela `etapas` (por org: chave, label, ordem, cor, **papel**) | as colunas do funil. `papel` = `ativa` / `parking` (espera) / `ganho` / `perda` |
| **Tarefas do lead** | tabela `tarefas_lead` (tipo, data_vencimento, concluida, cancelada) | as tarefas/follow-ups por lead. Alimenta a Fila de Ligações |
| **A régua (código)** | [lib/sequencia-tarefas.ts](../lib/sequencia-tarefas.ts) → `SEQUENCIA_POR_ETAPA` | define, por etapa, a sequência de toques (chave, dias, ação, próxima) |
| **A régua editável** | [lib/fluxo.ts](../lib/fluxo.ts) → `getFluxo`/`setFluxo` | a "gaveta FLUXO" que a equipe edita. Lê do banco; se vazio, cai no `SEQUENCIA_POR_ETAPA`. **Hoje é GLOBAL (não por-org)** |
| **O motor** | [app/api/ia/followup-auto/route.ts](../app/api/ia/followup-auto/route.ts) | decide, por lead: enviar toque X / avançar etapa / esperar / nada. Envia templates aprovados |
| **A virada** | [app/api/ia/virada/route.ts](../app/api/ia/virada/route.ts) | à noite, interpreta quem RESPONDEU e move de etapa |
| **Orquestrador** | [app/api/ia/cron-run/route.ts](../app/api/ia/cron-run/route.ts) | o pg_cron chama; roda a sequência da fase (noite/manhã) em lote |
| **Templates** | tabela `followup_templates` (nome_meta, corpo, variaveis, status) | os templates aprovados na Meta que o motor dispara |

## A régua D1–D13 (hoje, em `SEQUENCIA_POR_ETAPA`)
Os `dias` são **GAP**: 1ª tarefa = dias após ENTRAR na etapa; próximas = dias após CONCLUIR a anterior.

- **`aguardando_atendimento`** (Ligação/Chegada): `ligar_1` (D0) → `ligar_2_audio` (D0). Liga 2× no mesmo dia; se não atende, manda áudio pedindo horário.
- **`atendimento_inicial`** (D2–D3): `msg_horario` (D+1, "seguir no WhatsApp + descoberta") → `apresentacao_completa` (D+1, apresentação com preço/lote).
- **`lote_preco_ok`**: `lote_virando` (D+3) → `pos_virada_lote` (D+1).
- **`oferecer_bolsa`** (D7–D13): `bolsa_1` (D+4) → `bolsa_2` (D+1) → `demissao` (D+1 → move pra Perda).
- **Estacionamentos** (`agendado`, `proxima_turma`, `aguardando_pagamento`, `ganho`, `perda`): sem cadência automática.

## O RELÓGIO de hoje: conta da CHEGADA do lead
O motor calcula a entrada na etapa (`entradaEtapa` = a última `mudanca_etapa` genuína pra aquela etapa; ignora correção da própria IA pra não resetar o relógio). O 1º toque conta D+X da **entrada**; os seguintes, do **último toque**. Ou seja: **tudo gira em torno de quando o lead chegou/mudou de etapa**, não de uma data de turma.

## O "lote" de hoje é FICTÍCIO ⚠️
A urgência ("o lote está virando") é o toque `lote_virando` que dispara **~3 dias após o lead receber a oferta** — um prazo **inventado e rolante por lead**. Dois leads da mesma turma veem prazos diferentes. Não existe data real de lote.

## Como o motor decide (followup-auto, resumido)
Pra cada lead frio: `cad = fluxo.cadencia[etapa]`; acha o próximo toque cujo template **ainda não foi enviado** e que **não seja reabridor frio pra quem já engajou**. Se achar e estiver "due" (chegou o D+X) → **envia o template** (preenche variáveis). Se **esgotou** os toques da etapa → consulta a interpretação da IA: se ela diz OUTRA etapa válida → **avança**; se diz a MESMA (ou nada) → **DEIXA PARADO** (trava anti-ping-pong).

## ⚠️ O problema conhecido: becos sem saída
`atendimento_inicial` e `lote_preco_ok` **terminam a régua sem avançar sozinhos** de etapa. Um lead **mudo** que esgotou a régua fica **parado pra sempre** (a interpretação segue dizendo a mesma etapa). Resultado real: **220 leads empilhados** (145 só em atendimento_inicial). No modelo por-turma isso some (todo lead anda rumo a uma data real).

## Blindagens (travas de saída, no motor)
Nunca preço **R$0**/inventado; **não repete** o mesmo template em 14 dias (checa `lead_andamentos`); **engajado não recebe reabridor frio**; **prazo vencido** (data no passado) não vai; **cooldown de 7 dias** pós-reativação do roteador; não rebaixa etapa.

## As duas naturezas da IA (importante pro SaaS)
- **LER/PLANEJAR** — resumo do cliente + a cadência que gera **tarefa**. Não envia nada.
- **ENVIAR** — o passo de disparo do `followup-auto` (manda o template). Hoje as duas coisas estão **juntas** no mesmo arquivo.

---

# PARTE 2 — Pra onde VAMOS (cadência por turma)

## A virada de chave
Trocar o **relógio único da chegada** por **dois relógios**: chegada (primeiro toque, reativo) **+** turma (urgência ancorada nas **datas reais do lote**). E o "lote fictício" vira **lote real, dado da turma**.

## Estrutura nova: `turma_lotes`
Por turma: `{ ordem, nome, preco_pix, preco_cartao, vale_ate (data real) }`. Substitui o preço hardcoded ([lib/contexto-negocio.ts](../lib/contexto-negocio.ts)) e o `lote_virando` fictício. Templates e blindagens passam a ler o **lote vigente da turma**.

## Os dois relógios
- **Relógio A (chegada):** D1 ligação → D2 puxa WhatsApp → D3 apresentação **com o lote vigente real**. Reativo à chegada.
- **Relógio B (turma):** toques ancorados nas datas do lote — "lote fecha em 3 dias" → "lote virou (sobe pra X)" → "último lote" → "véspera da turma" → início da turma → **roteador** (rola pra próxima turma). Dispara **só o que ainda está à frente** do lead; todos da turma convergem na mesma data real.

## Motor "role-driven" (o refactor central)
Hoje o motor decide por **nomes fixos** de etapa. Precisa decidir pelo **`papel`** (ativa/parking/ganho/perda), que a tabela `etapas` já tem. Assim cada turma/cliente tem funil próprio sem reprogramar. Também: **cadência por-org** (`getFluxo(org)` em vez de global).

## IA em 2 tempos
Separar no `followup-auto` o **"gerar tarefa"** (sempre roda) do **"enviar"** (só se a capacidade `ia_envio` estiver ligada). É o que viabiliza o plano Básico do SaaS ([03-ROADMAP-SAAS.md](03-ROADMAP-SAAS.md)).

## O que muda em cada arquivo (mapa da obra)
- `lib/sequencia-tarefas.ts` — aposentar o `lote_virando` fictício; a régua passa a se ancorar no lote da turma.
- `lib/fluxo.ts` — `getFluxo(org)` por-org.
- `app/api/ia/followup-auto/route.ts` — ler `etapas`+`papel` da org; ler o **lote vigente da turma** (datas reais) pra montar urgência e preço; separar planejar/enviar; corrigir o beco sem saída (avançar mudo tocado rumo à turma).
- `app/api/ia/virada/route.ts` — mover por papel; encerrar o relógio no início da turma → roteador.
- `lib/contexto-negocio.ts` — preços saem do código, vêm do lote/config por org.
- **Nova tabela** `turma_lotes` + tela pra cadastrar os lotes.

---

# PARTE 3 — Por onde COMEÇAR (Nando + Claude)

**Piloto antes de virar o funil inteiro:**
1. **Modelar 1 turma real** (ex.: ANL PoA setembro, início 08/09) com os lotes reais em `turma_lotes`.
2. **Motor lê o lote da turma** (Relógio B) só nessa turma — valida em `dryRun`.
3. **Re-ancorar os leads** dessa turma no calendário do lote (dryRun mostra pra onde cada um vai).
4. **Generalizar** pras demais turmas.
5. Aposentar o `lote_virando` fictício.

**Ordem de leitura do código:** `sequencia-tarefas.ts` → `fluxo.ts` → `followup-auto/route.ts` → `virada/route.ts` → `cron-run/route.ts`. Depois `etapas/route.ts` e `followup-templates/route.ts`.

**Tudo é `dryRun` primeiro.** Nenhuma mudança de dado em produção sem o Guto ver os números antes (movimento de lead e disparo em massa já causaram sustos — ver as blindagens).
