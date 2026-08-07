# 02 — Arquitetura do Sistema (como tudo funciona hoje)

Este documento explica a **lógica inteira** do CRM atual. Depois de ler, você entende o que cada peça faz e por quê.

---

## 1. Visão geral

O sistema é um **CRM de vendas por WhatsApp com IA**. O ciclo de vida:

```
Anúncio/site → clique no WhatsApp (/wa) → lead entra no CRM → conversa (humano + IA)
   → cadência de tarefas/follow-up → venda (HeroSpark) → pós-venda
```

**Stack:**
- **Next.js 16** (App Router) — front (`app/dashboard/*`) e back (`app/api/*`) no mesmo projeto.
- **Supabase** — Postgres (dados), Auth (login), RLS (isolamento por cliente), Storage (branding/mídia), pg_cron (agendador).
- **Vercel** — hospedagem (serverless). Deploy = `git push origin main`.
- **Anthropic (Claude)** — o cérebro das IAs.
- **WhatsApp** — dois canais: **Z-API** (web, principal) e **Cloud API oficial** (disparos/templates).

**Organização do código:**
- `app/dashboard/*` — as telas (React).
- `app/api/*` — os endpoints (lógica de servidor).
- `lib/*` — regras de negócio reutilizáveis (IA, fluxo, WhatsApp, Supabase clients, etc.).

---

## 2. Multi-tenant (o "seam" que já existe)

Tudo é escopado por **`org_id`**. A CnD é a org nº1: `00000000-0000-0000-0000-0000000000cd` (`ORG_CND` em [lib/org.ts](../lib/org.ts)).

Como o sistema sabe "de qual cliente é esta operação":
- **`orgDaRequest(auth)`** — lê o `org_id` do token do usuário logado (`app_metadata.org_id`). Sem token → CnD.
- **`orgDoUsuario({email})`** — resolve via tabela `usuarios_perfil` (usuário → org).
- **`orgDaInstanciaWa(numero)`** — resolveria pelo número de WhatsApp que recebeu a msg. **Hoje é um stub travado na CnD** (é uma das coisas a construir).

**Isolamento:** as leituras do dashboard usam o cliente `supabaseDoUsuario` ([lib/supabase-user.ts](../lib/supabase-user.ts)), e a **RLS** do Postgres filtra por org sozinha. O backend pesado usa `supabaseAdmin` (service_role) e escopa por `org_id` na query.

**Tabela `organizacoes`** — nome, slug, plano, ativo, cor, logo_url, `config` (jsonb com features). **Painel super-admin** em [/dashboard/admin/orgs](../app/dashboard/admin/orgs/page.tsx): lista clientes com uso e **custo de IA por org**, suspende/reativa, muda plano, faz branding e liga/desliga telas. Tem **onboarding num clique** ([app/api/admin/orgs/route.ts](../app/api/admin/orgs/route.ts) `PUT`): cria org + login admin + perfil.

**Permissões por usuário** (`usuarios_perfil`): `papel` (admin/…), `setor`, `leads_escopo` (todos/próprios), `crm_interno`, `crm_externo`, `wa_caixa`.

---

## 3. Modelo de dados (tabelas principais)

**Funil e leads:**
- `leads` — o lead (nome, whatsapp, email, **etapa**, turma, valor_venda, resumo_ia, atendido_por, utm_*, fbc/fbp, etc.).
- `etapas` — **as colunas do funil, POR ORG** (chave, label, ordem, cor, **papel**). Papel = `ativa` | `parking` (espera) | `ganho` | `perda`. É a base da personalização do funil.
- `lead_andamentos` — o histórico/timeline de cada lead (mudança de etapa, follow-up, nota, ligação…).

**Tarefas (o coração do follow-up — ver seção 5):**
- `tarefas_lead` — tarefas **por lead** (tipo, titulo, data_vencimento, concluida, cancelada). **É o que gera a Fila de Ligações e o follow-up.**
- `tarefas` — tarefas **por turma** (operacionais, não confundir com `tarefas_lead`).

**Produtos/turmas:**
- `produtos`, `cidades`, `turmas` (código, datas, status), `turma_datas`, `salas`, `professores`, `matriculas`.

**WhatsApp:**
- `wa_conversas` — a conversa (por lead, por canal: `web`/`oficial`).
- `wa_mensagens` — cada mensagem (direção, tipo, texto, status, canal).
- `wa_clicks` — cliques do `/wa` (ref, utm, fbclid) — atribuição.
- `wa_contatos` — pool de disparo (categorizado: comprador/interessado/perdido…).

**Outros:**
- `ligacoes` (registros de ligação via API4COM), `agenda_eventos` (agenda), `followup_templates` (templates aprovados na Meta), `organizacoes`, `usuarios_perfil`, `webhook_logs` (logs + também guarda o **fluxo editável** e os logs de custo de IA), `site_eventos` (tracking do site), financeiro (turmas/custos/transferências).

---

## 4. O funil e as etapas

As etapas da CnD (papel entre parênteses):
`aguardando_atendimento` (ativa — "Ligação/chegada") → `atendimento_inicial` (ativa) → `lote_preco_ok` (ativa) → `oferecer_bolsa` (ativa) → `agendado` / `proxima_turma` (parking) → `aguardando_pagamento` (ativa) → `ganho` / `perda`. Também `ligacao_boa` (quente do time).

> **Importante pro futuro:** hoje o motor decide por **nomes fixos** de etapa. No SaaS, cada cliente terá as etapas dele — por isso o motor vai passar a decidir pelo **papel** (ver [03-ROADMAP-SAAS.md](03-ROADMAP-SAAS.md)).

---

## 5. Princípio central: "as tarefas SÃO os follow-ups"

Esse é o conceito mais importante do sistema. Cada etapa tem uma **cadência** — uma sequência de tarefas que nascem em datas (D1, D2, D3…). Concluiu uma → nasce a próxima.

- **Definição da cadência:** [lib/sequencia-tarefas.ts](../lib/sequencia-tarefas.ts) (`SEQUENCIA_POR_ETAPA`). Ex.: `aguardando_atendimento` = `ligar_1` → `ligar_2_audio`; `oferecer_bolsa` = `bolsa_1` (D11) → `bolsa_2` (D12) → `demissao` (D13 → perda).
- **Fluxo editável ("gaveta FLUXO"):** [lib/fluxo.ts](../lib/fluxo.ts) (`getFluxo`/`setFluxo`) — a equipe edita a cadência pela tela; se não houver edição, cai no default do código. *(Hoje o fluxo editável é global, não por-org — item do roadmap.)*
- **Cada tarefa vira ação:** ligação (humano), áudio/mensagem (IA sugere e humano envia, ou automático).
- **Fila de Ligações** ([app/api/ligacoes/fila/route.ts](../app/api/ligacoes/fila/route.ts)): monta a fila do time a partir de `tarefas_lead` (tipo `ligar_agendado` = agendadas; `triagem_ligacao` = a ligar; etapa `aguardando_atendimento` = novos).

Ou seja: a IA/planejamento **gera tarefa**; o time (ou a IA no modo avançado) **executa**.

---

## 6. As DUAS IAs (não confundir)

O sistema tem dois cérebros de IA com papéis diferentes:

### a) IA de atendimento (conversa "sob medida")
Lê **todo o contexto** do lead e escreve resposta específica. Peças:
- [lib/atender-lead.ts](../lib/atender-lead.ts) — decide se a IA fala ou se é do time; responde no WhatsApp.
- [app/api/copiloto/sugerir](../app/api/copiloto/sugerir/route.ts) — **copiloto**: sugere a mensagem, o humano envia.
- [lib/atendimento-ia.ts](../lib/atendimento-ia.ts) + [lib/contexto-negocio.ts](../lib/contexto-negocio.ts) — o "cérebro comercial": posicionamento, produtos, **preços**, bolsa, tom. **Hoje é hardcoded pra CnD** (vira config por org no SaaS).
- [lib/resumo-lead.ts](../lib/resumo-lead.ts) — **resumo do cliente** (o que já foi falado, objeção, próximo passo). [lib/temperatura.ts](../lib/temperatura.ts) — classifica quente/frio.

### b) Motor de follow-up (cadência com templates aprovados)
Roda a régua fixa de follow-up. Fora da janela de 24h do WhatsApp, só manda **templates aprovados pela Meta**. Peça principal: [app/api/ia/followup-auto/route.ts](../app/api/ia/followup-auto/route.ts).

> **Regra da Meta:** dentro de 24h desde a última msg do cliente, a IA pode mandar texto livre; fora disso, só template aprovado.

---

## 7. Motores automáticos (crons)

O agendador (pg_cron) chama o **orquestrador** [app/api/ia/cron-run](../app/api/ia/cron-run/route.ts) em duas fases:

- **`fase=noite`** (~23h BRT): `virada` (interpreta quem respondeu no dia e move de etapa) → `sync-pool` (sincroniza leads → pool de disparo).
- **`fase=manha`** (~9h BRT): `resumos` (warming) → `virada` de ontem (rede de segurança) → `reconciliar` → `followup-auto` (dispara os follow-ups do dia) → `posse-funil` (frio vira da IA) → `garantir-tarefas` → `roteador-turma` (rola órfãos pra próxima turma) → `sync-pool`.

Outras engines em `app/api/ia/*`: `limpar-atrasados`, `retomar-time`, `ultimo-dia-lote`, `atender`, `ajuda`, `edicao`. Todas rodam **em lote com orçamento de tempo** (~52s) e são **idempotentes/resumíveis** (o cron chama de novo e continua de onde parou).

---

## 8. Blindagens (camada de coerência)

Travas que impedem a IA de fazer besteira (nascidas de bugs reais):
- **Preço:** nunca R$0, nunca inventar valor, nunca "sinal de R$100" no atendimento; preços fixos por produto.
- **Não rebaixar etapa** (no-downgrade): a cadência só anda pra frente.
- **Anti-repetição:** não manda o mesmo template 2x em 14 dias.
- **Engajado não recebe reabridor frio:** quem já respondeu não leva mensagem de "sumiço".
- **Prazo rolante, nome da empresa, boleto fantasma, etc.** Ver a lógica nas rotas de `virada`/`followup-auto` e no `copiloto`.

---

## 9. WhatsApp — os dois canais

- **Z-API (web, principal):** [lib/zapi.ts](../lib/zapi.ts) + webhook [app/api/webhook/zapi](../app/api/webhook/zapi/route.ts). Conexão não-oficial (QR). Recebe msg → cria/atualiza lead, pausa cadência silenciosa quando o cliente responde, classifica temperatura.
- **Cloud API oficial:** [lib/whatsapp-oficial.ts](../lib/whatsapp-oficial.ts) + [app/api/wa-oficial/*](../app/api/wa-oficial). Usado pra **disparos e templates** (envio em massa, reabertura fora de 24h). Webhook próprio.

**Atribuição — o `/wa`** ([app/wa/route.ts](../app/wa/route.ts)): o botão do site/anúncio aponta pra cá com turma + UTM + fbclid; ele grava o clique (`wa_clicks`) com um código `#ref`, e redireciona pro WhatsApp com esse código na mensagem. Quando a pessoa envia, o webhook lê o `#ref` e **cola a UTM/campanha no lead certo**.

---

## 10. Integrações externas

- **HeroSpark (vendas):** webhook [app/api/webhook/herospark](../app/api/webhook/herospark/route.ts) — casa o pagamento com o lead (por telefone/email), marca **ganho**, trata boleto parcelado.
- **API4COM (ligações):** telefonia — registra ligações (`ligacoes`), grava áudio; transcrição via Deepgram.
- **Deepgram:** transcrição de áudios/ligações pra IA entender.
- **Meta (CAPI/Ads):** [lib/capi.ts](../lib/capi.ts), [lib/meta-ads.ts](../lib/meta-ads.ts) — devolve conversão pro Meta e lê o gasto de anúncios (dashboard de tráfego).

---

## 11. Por onde começar a ler o código

1. [lib/org.ts](../lib/org.ts) — o seam multi-tenant.
2. [lib/sequencia-tarefas.ts](../lib/sequencia-tarefas.ts) — a cadência (o coração).
3. [app/api/ia/cron-run/route.ts](../app/api/ia/cron-run/route.ts) — como as automações são orquestradas.
4. [app/api/ia/followup-auto/route.ts](../app/api/ia/followup-auto/route.ts) e [app/api/ia/virada/route.ts](../app/api/ia/virada/route.ts) — os dois motores mais importantes.
5. [lib/contexto-negocio.ts](../lib/contexto-negocio.ts) — o cérebro comercial da IA.
6. [app/api/webhook/zapi/route.ts](../app/api/webhook/zapi/route.ts) — a porta de entrada das mensagens.
