# 07 — Extração do Núcleo do CRM (produto instalável, isolado)

Plano pra **tirar o CRM da escola** e deixar só o **núcleo genérico** — limpo, personalizável, pronto pro Nando **implantar isolado em outra empresa**. Sem SaaS/multi-tenant: cada empresa, uma instância própria (Supabase, Vercel, WhatsApp/Meta e IA dela).

> Status: **sugestão pra Guto revisar** (decisões dele já embutidas). Nada é cortado até a fronteira ser aprovada.

---

## 1. Princípios

1. **Cópia isolada.** O CRM da escola (que roda a venda, o motor, os disparos) **não se toca**. A extração acontece num **repo/Supabase novos**. A escola segue com o Nando.
2. **Personalização = dado/config, nunca código clonado.** O que muda de empresa pra empresa é config (org, funil, cadência, contexto da IA, produtos), não fork divergente.
3. **Núcleo enxuto.** Só o que é CRM de verdade. Escola (financeiro, turmas, matrículas) sai inteiro.

---

## 2. A fronteira (decisões do Guto embutidas)

### ✅ FICA — o CRM genérico
Leads · Funil/Board · Fila de Ligações · WhatsApp (inbox + atendimento IA + conectar) · Disparos + Listas · **Follow-up (motor + templates + IA que configura a cadência)** · Etapas · Fluxo/Cadência · Motivos de perda · Tarefas de lead · Copiloto/IA · Mapa do funil · Usuários · Configurações · Webhook · Qualidade/Uso da IA · **Produtos** · **Vendas (ex-Matrículas, generalizado)** · **NPS** · **Fechamento (genérico, de venda/período)** · **Integrações** (o dono liga as que precisar)

### ✅ FICA + material de implantação — Captação / Tracking (COMPLETO)
**Captação, Tráfego, Funil do Site, Análise de conversão** ficam **com o tracking completo** (link `/wa`, UTM, `site_eventos`, pixel, captura fbclid/utm). O Nando recebe **material de implantação** (seção 6) ensinando a wirar numa empresa nova.

### ❌ SAI — é da escola
Financeiro (lançamentos, caixas, contas, comissões, transferências, fluxo de caixa) · **Turmas + Lotes** · Alunos (o cliente vira o próprio lead) · Chamada · Salas · Professores · Módulos · Agenda de aulas · Escala · **CRM externo** · **Cidades** (a escola usa por turma; empresa comum não precisa — se precisar depois, edita/ensina a editar)

> **HeroSpark** deixa de ser código cravado → vira **um exemplo** dentro da camada de **Integrações** (o dono liga o checkout/pagamento/sistema que ele usa).
> **Matrícula → Venda:** o registro de venda fica (valor, forma, produto, ligado ao lead). O que sai é o módulo **financeiro/contábil** por trás (caixas, lançamentos). O CRM registra a venda; a contabilidade é da empresa.

### 🔄 GENERALIZA — vira config por instância
- `contexto-negocio.ts` (cravado pra escola) → **contexto do negócio por instância**
- `org_id` / `ORG_CND` → seed de 1 org por install
- **Agente interno** → **personalizável** (prompts que citam "a escola" viram parâmetro do negócio)
- Prompts de IA (atendimento, copiloto, resumos) → parametrizados pelo contexto do negócio
- Nomes/branding (Carreira no Digital, Mateus, produtos) → config

---

## 2b. Os 4 ramos-teste (garantia de que ficou genérico)

Em vez de escolher 1 cliente-piloto agora, desenhamos o produto contra **4 ramos diferentes** — se a config dá conta dos 4, ficou genérico de verdade:

| Ramo | Ticket | Ciclo | O que estressa no CRM |
|---|---|---|---|
| **Brindes / camisetas** | baixo-médio | curto | volume, orçamento/catálogo, follow-up rápido |
| **Clínica / emagrecimento** (sessões presenciais **ou** curso online) | médio-alto | médio | **agendamento de sessões**, pacote, nutrição |
| **Seguros** | recorrente | longo | **renovação/recorrência**, ciclo longo |
| **Corretor imobiliário** | alto | longo | poucos leads de alto valor, **diagnóstico**, ciclo longo |

**O que os 4 têm em comum (= o núcleo):** leads · funil · cadência/follow-up · venda · WhatsApp · disparo. **Nenhum tem "turma/lote".** O que muda entre eles é **dado** (etapas, cadência, contexto da IA, produtos), não código.

**O único que chega perto de precisar de estrutura extra** é a **clínica com sessões presenciais** (agenda de sessões/pacote) — e é justamente pra onde a estrutura **dormente de turma/lote** serviria, se um dia quisermos. Por isso não arrancamos, só desligamos.

> **Piloto:** não precisa travar 1 cliente agora. Desenhamos contra os 4; o cliente real a gente escolhe depois do setup pronto.

---

## 3. O Follow-up + a IA (levar junto pra "cadastrar o followup")

O **motor de follow-up vai junto** — é um dos maiores valores do produto. Mas ele deixa de ser "por lote" e passa a ser **por config da empresa**:

- **A cadência é dado** (`fluxo` editável) — cada empresa monta a sua: etapas, toques, dias, templates.
- **A IA cadastra o followup** — o agente interno já sabe editar o fluxo (`getFluxo`/`setFluxo`/`aplicarPatch`). É essa IA que o dono conversa pra montar a cadência dele ("quero 3 toques, o 1º no dia seguinte…"). **Isso vai pro produto** — é o "cadastrar o followup" que tu falou.
- **O motor por lote fica dormente.** Já tem a guarda `sem lote = comportamento antigo`: numa empresa sem turmas, ele roda a cadência normal por etapa. Não precisa arrancar — só não cadastrar lotes. Se um dia a empresa tiver algo com "data que vira" (uma turma, um lançamento), a estrutura já está lá.

**Resumo:** vai o motor + os templates + a IA que configura a cadência. Não vai a amarração a turma/lote (fica opcional/dormente).

---

## 3b. Dois modos de uso (o mesmo núcleo)

O `contexto.md` do método diz que pro negócio pequeno o CRM **não aparece** — roda atrás do WhatsApp. O núcleo serve os dois modos sem virar dois produtos:

- **Modo INVISÍVEL (solo / negócio pequeno):** o dono só vê o **WhatsApp vendendo mais**. A instância isolada é o cérebro atrás: conversa entra pelo webhook → vira lead/histórico → **IA atende e sugere (copiloto)** → quando fecha, **captura a venda sozinha**. O painel existe, mas o dono quase não abre.
- **Modo PAINEL (time / mini-agência):** o funil, a fila, os disparos aparecem — como na escola hoje.

**Implicações pro produto:**
1. A **ponte WhatsApp** (webhook + IA + captura automática da venda) é o **coração** — tem que estar redonda no núcleo.
2. **"Local" ≠ offline.** O WhatsApp oficial manda webhook → precisa de endereço público. Então "na estrutura do cliente" = instância dedicada **internet-reachable** (recomendado: contas próprias do cliente na nuvem — Supabase + Vercel + WhatsApp + IA dele). VPS ou on-premise-com-túnel são possíveis, mas mais peso operacional.
3. O material de implantação (seção 6) ganha um **"modo invisível"**: instalar pra dono solo que só quer o WhatsApp turbinado, sem aprender painel.

---

## 4. O que vira o "setup inicial" (personalização)

Ao instalar numa empresa nova, o que se configura (dado, não código):
1. **A org** (1 empresa) + **1 admin**.
2. **O contexto do negócio** (o "contexto.md" do teu método): o que faz, oferta/piso-teto, tom, objeção nº1, provas → alimenta a IA de atendimento e o copiloto.
3. **O funil** (etapas) da empresa.
4. **A cadência** (fluxo) — via conversa com a IA.
5. **Os produtos/serviços** dela.
6. **As credenciais**: Supabase, Anthropic, WhatsApp Cloud API (Meta da empresa), Vercel.

---

## 5. Mecânica da extração (como fazer, sem quebrar a escola)

1. **Repo novo** = cópia do código (a base do produto).
2. **Supabase novo** = `pg_dump --schema-only` do atual → subir só as tabelas do NÚCLEO (dropar as da escola).
3. **Strip** = remover páginas/APIs/libs da escola (lista da seção 2).
4. **Generalizar** = trocar o hardcoded por config (seção 4).
5. **Seed** = script que sobe 1 org limpa + etapas/fluxo/templates base.
6. **Deploy** = Vercel + envs da empresa.
7. **Smoke test** = criar lead, conectar WhatsApp de teste, disparar, follow-up rodar.

---

## 6. Material de implantação pro Nando (entregável à parte)

Um guia de instalação (tipo o [06](06-PROCESSO-CADENCIA-E-VALIDACAO.md), mas de setup) cobrindo:
- **Checklist de credenciais** (Supabase, Anthropic, Meta/WhatsApp, Vercel) — o que pedir pra empresa.
- **Passo a passo do install** (repo → Supabase → envs → seed → deploy).
- **Configurar o contexto do negócio** (o formulário/entrevista que vira o `contexto`).
- **Ligar a Captação/Tracking:** como wirar o link `/wa`, UTM e os eventos do site da empresa (a parte mais técnica — botão de WhatsApp, sendBeacon, fbclid/utm).
- **Conectar o WhatsApp oficial** da empresa (Cloud API, número dela).
- **Montar a cadência** com a IA + submeter templates na Meta da empresa.

---

## 7. Primeiros passos concretos (quando aprovar)

1. **Fronteira aprovada** (este doc).
2. **Mapa arquivo-por-arquivo** FICA/SAI/GENERALIZA (páginas, APIs, libs, tabelas) — o inventário fino.
3. **Cópia isolada** (repo + Supabase novos) — sem tocar na escola.
4. **Strip + generalização** na cópia.
5. **Seed + primeiro install de teste** (numa infra nossa, pra testar o processo antes de botar num cliente).
6. **Material de implantação** pro Nando.
7. **Piloto num cliente real** na estrutura dele.

---

## 8. Decisões (fechadas com o Guto em 17/08)

- ✅ **Agente interno** → entra no **v1** (é o que cadastra o followup).
- ✅ **Captação** → **tracking completo** (link/UTM/WhatsApp + pixel + site_eventos).
- ✅ **CRM externo** → **SAI**.
- ✅ **Matrículas → Vendas** (fica, generalizado). **NPS** fica. **Fechamento** fica genérico. **Integrações** viram camada configurável (HeroSpark = exemplo).
- ✅ **Piloto** → não trava 1 cliente; desenha contra os **4 ramos** (brindes/camisetas, clínica/emagrecimento, seguros, corretor imobiliário).

**Próximo:** com a fronteira fechada, eu parto pro **mapa arquivo-por-arquivo** (seção 7, passo 2) e a gente começa a extração na cópia isolada.
