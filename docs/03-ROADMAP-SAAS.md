# 03 — Roadmap do SaaS Multi-tenant

Onde estamos e o que vamos construir pra transformar o CRM da CnD num **produto vendável pros alunos** (cada aluno = um cliente/tenant com seu funil, sua cadência, sua IA e seu WhatsApp).

---

## 1. Onde estamos (o que JÁ é multi-tenant)

✅ **Pronto e funcionando:**
- `org_id` em todas as tabelas + **RLS** (isolamento entre clientes).
- Resolvedores de org (token, usuário) — [lib/org.ts](../lib/org.ts).
- Tabela `organizacoes` (nome, plano, ativo, branding, `config`).
- **Painel super-admin** ([/dashboard/admin/orgs](../app/dashboard/admin/orgs/page.tsx)) com uso, **custo de IA por cliente**, suspender/reativar, plano, branding, features on/off.
- **Onboarding num clique** (cria org + login admin + perfil).
- **Etapas do funil POR ORG** (tabela `etapas` com `papel`) + tela de edição.
- RBAC por usuário (`usuarios_perfil`).

🟡 **Existe mas ainda é "sabor CnD" / global (precisa virar por-org):**
- O **motor** decide por nomes fixos de etapa (não pelo `papel`).
- O **fluxo/cadência editável** é global (não por-org).
- O **cérebro da IA** (contexto, produtos, **preços**) é hardcoded ([lib/contexto-negocio.ts](../lib/contexto-negocio.ts)).
- O **WhatsApp** roteia só pra CnD (`orgDaInstanciaWa` é stub); a conexão web depende do Z-API (vendor).

---

## 2. Visão do produto — DOIS planos

O insight central: a IA tem duas naturezas, e só uma precisa do WhatsApp oficial.
- **IA que LÊ e PLANEJA** (resumo do cliente, cadência que gera **tarefa pro time**) → roda em qualquer conexão.
- **IA que ENVIA** (follow-up automático, disparo) → precisa do canal oficial.

| Capacidade | 🟢 **Básico** (Web/QR) | 🔵 **Pro** (Oficial) |
|---|---|---|
| Caixa de entrada + envio manual | ✅ | ✅ |
| Resumo de cliente por IA | ✅ | ✅ |
| Fluxo/cadência → gera tarefas pro time | ✅ | ✅ |
| Copiloto (IA sugere, humano envia) | ✅ | ✅ |
| IA responde/segue sozinha (auto-envio) | ❌ | ✅ |
| Disparos / broadcast | ❌ | ✅ |

**O Básico é o MVP do SaaS:** um "CRM com copiloto de IA" — lê tudo, resume cada cliente, e diz ao time o que fazer (tarefas por cadência), **sem enviar nada automático**. Sem burocracia da Meta e **sem risco de ban por auto-envio** (auto-envio em massa é o que banir número numa conexão não-oficial).

---

## 3. Decisões de arquitetura (ratificadas com o Guto)

1. **Motor "role-driven".** O motor passa a agir pelo **`papel`** da etapa (ativa/parking/ganho/perda), não pelo nome. Assim cada cliente cria o funil dele ("Orçamento → Visita → Proposta → Fechado") e o motor entende sozinho. **É o refactor central.**
2. **IA em 2 tempos: "planejar" vs "enviar".** Hoje o [followup-auto](../app/api/ia/followup-auto/route.ts) faz as duas coisas juntas. Vamos separar: **gerar tarefa** roda sempre; **enviar** só roda se `ia_envio` estiver ligado (= modo oficial).
3. **Config granular por org** (no `config` da `organizacoes`): `ia_resumo`, `ia_cadencia`, `copiloto` (liberados no Web) · `ia_envio`, `disparos` (só oficial). O modo de conexão trava o que pode.
4. **Contexto/preços da IA por org.** Mover o cérebro comercial de código → config por cliente (cada um com produtos, preços, posicionamento e tom dele).
5. **Gateway de WhatsApp próprio (não Z-API).** Construir nossa engine de WhatsApp Web, **base [Baileys](https://github.com/WhiskeySockets/Baileys)** (Node, multi-device via WebSocket, multi-sessão — sem navegador). Margem e controle; sem custo por instância de vendor.

---

## 4. O gateway de WhatsApp próprio (peça nova de infra)

**O que é:** um serviço que gerencia N sessões de WhatsApp Web (1 por cliente), cada uma pareada por **QR**, guarda a credencial da sessão por org, recebe mensagens e posta no nosso webhook (roteado por org), e expõe uma API de envio que o CRM chama. É o que o Z-API nos dá hoje — mas **nosso**.

**⚠️ Mudança de infra importante:** isso **não roda na Vercel** (serverless morre entre requisições). WhatsApp Web precisa de conexão **persistente** (WebSocket sempre no ar). Então entra a **primeira peça fora do Vercel+Supabase**: um **serviço always-on** (Railway / Fly.io / VPS) rodando o gateway Baileys, com storage das sessões.

**Bônus:** quando estiver de pé, a **própria CnD migra do Z-API pra ele** → mata a mensalidade do Z-API.

**Tradeoffs honestos:** continua não-oficial (risco de ban no número, igual hoje); a estabilidade/reconexão passa a ser **nossa** manutenção (era o que o Z-API cuidava). Vale pela margem e controle no produto.

---

## 5. Fases de construção

### Fase A — Fundação por-cliente (o motor)
- Motor **role-driven** (lê `etapas` + `papel` por org).
- Fluxo/cadência **por org** (`getFluxo(org)`).
- Contexto IA + preços + flags de capacidade **por org**.
- Separar "planejar tarefa" de "enviar" no follow-up.

### Fase B1 — Gateway WhatsApp Web próprio (Baileys)
- Serviço always-on + storage de sessão + pareamento por QR + roteamento por org.
- **Libera o plano Básico inteiro.**

### Fase B2 — WhatsApp Oficial multi-instância
- `wa_instancias` (org → credenciais oficiais) + roteamento no webhook + envio pela credencial do tenant.
- Liga o auto-envio e os disparos → **plano Pro.**

### Fase C — Self-serve + cobrança
- Telas pro admin do cliente editar fluxo/etapas/contexto/preços.
- Billing (o campo `plano` já existe; falta integrar pagamento).

**Sequência recomendada:** A → B1 (= **Básico/MVP pronto pra vender**) → B2 (Pro) → C.

---

## 6. Próximos passos imediatos

1. **Ambiente do Nando** — clonar repo, subir local, Claude Code (ver [01-ONBOARDING-DEV.md](01-ONBOARDING-DEV.md)).
2. **Prova de conceito barata:** validar o multi-tenant end-to-end com uma **2ª org** conectando WhatsApp por QR e vendo conversas — antes de mexer no motor. (Decidir se a PoC usa Z-API temporário ou já começa o gateway Baileys.)
3. **Atacar a Fase A** (motor role-driven) — é o que faz todo o resto encaixar.

---

## 7. Glossário rápido

- **org / tenant** — um cliente do SaaS (a CnD é a org nº1).
- **etapa / papel** — coluna do funil e seu arquétipo (ativa/parking/ganho/perda).
- **cadência** — a régua de tarefas/follow-ups de cada etapa.
- **tarefas_lead** — as tarefas por lead (o motor as gera; o time as executa).
- **motor** — o conjunto de crons que roda virada, follow-up, sync, etc.
- **Básico/Pro** — os dois planos (Web sem auto-envio / Oficial com auto-envio+disparo).
- **gateway** — nosso serviço próprio de WhatsApp Web (Baileys).
