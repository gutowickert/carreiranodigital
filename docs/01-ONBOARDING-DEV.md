# 01 — Onboarding do Desenvolvedor

Guia passo a passo pra subir o sistema na tua máquina e trabalhar como o Guto trabalha (com Claude Code). Feito pra Windows (mas os passos valem pra Mac/Linux).

---

## Passo 0 — Acessos que o Guto precisa te liberar

Peça ao Guto:
1. **GitHub** — convite como colaborador no repositório do projeto.
2. **Vercel** — convite no time (pra ver builds/logs e fazer deploy).
3. **Supabase** — convite no projeto (pra ver o banco, rodar SQL, ver Auth/Storage).
4. **Anthropic Console** (opcional) — se você for mexer nos custos/uso de IA.
5. **O arquivo `.env.local`** — o Guto te passa por um canal seguro (as chaves secretas do sistema). **Nunca** comitar esse arquivo (já está no `.gitignore`).

> ⚠️ Isso te dá acesso de **dono** (chaves do banco, deploy, IA). É o certo pra quem assume a frente — só trate as chaves como confidenciais.

---

## Passo 1 — Instalar as ferramentas

| Ferramenta | Pra quê | Como |
|---|---|---|
| **Git** | versionar/clonar | https://git-scm.com |
| **Node.js LTS (v20+)** | rodar o Next | https://nodejs.org (pega a LTS) |
| **VS Code** | editor | https://code.visualstudio.com |
| **Claude Code** | teu par de programação/IA | ver Passo 5 |

Confira no terminal: `git --version`, `node --version` (deve ser ≥ 20), `npm --version`.

---

## Passo 2 — Clonar e instalar

```bash
git clone <URL-do-repo>       # o Guto te passa a URL
cd carreiranodigital
npm install
```

---

## Passo 3 — Configurar o `.env.local`

Cole na raiz do projeto o `.env.local` que o Guto te enviou. Ele contém as chaves abaixo (só os **nomes** aqui — os valores vêm com o Guto):

**Supabase (banco/auth):**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — acesso total ao banco (backend). **Secreto.**
- `SUPABASE_DB_URL` — string de conexão Postgres (pra DDL/migrations/cron via `psql`).

**IA:**
- `ANTHROPIC_API_KEY` — Claude (atendimento, resumo, follow-up).
- `DEEPGRAM_API_KEY` — transcrição de áudio/ligação.

**WhatsApp — Z-API (canal web, o principal hoje):**
- `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN`
- `WA_NUMERO_CENTRAL` — número central (só dígitos com DDI).

**WhatsApp — Cloud API oficial (disparos/templates):**
- `WA_OFICIAL_TOKEN`, `WA_OFICIAL_PHONE_ID`, `WA_OFICIAL_WABA_ID`, `WA_OFICIAL_NUMERO`, `WA_OFICIAL_VERIFY_TOKEN`
- `META_APP_ID`, `NEXT_PUBLIC_META_APP_ID`, `META_APP_SECRET`

**Ligações (API4COM):** `API4COM_TOKEN`, `API4COM_RAMAL_PADRAO`

**Meta Ads / CAPI (atribuição):** `FB_PIXEL_ID`, `FB_CAPI_TOKEN`, `FB_TEST_EVENT_CODE`, `FB_ADS_TOKEN`, `FB_AD_ACCOUNT_ID`

**Push (notificações):** `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`

**Automação/cron:** `CRON_SECRET` (protege os endpoints de cron)

> Nem toda chave é obrigatória pra rodar local — sem as de WhatsApp/IA algumas telas ficam inertes, mas o app sobe.

---

## Passo 4 — Rodar local

```bash
npm run dev
```
Abre em **http://localhost:3000**. Faça login com teu usuário do CRM (o mesmo `debairros@hotmail.com` — você já é **admin** na org da CnD, então vê todas as telas, inclusive `/dashboard/admin/orgs`).

Build de produção (pra testar): `npm run build && npm start`.

---

## Passo 5 — Claude Code (trabalhar como o Guto)

O Guto não programa "na mão" — ele conversa com o **Claude Code** dentro do repositório, e o Claude lê/edita/roda o código. Você vai fazer igual:

1. Instale o Claude Code (CLI ou extensão do VS Code) e logue na tua conta Claude.
2. Abra-o **na pasta do projeto** (`carreiranodigital`).
3. Converse em português, do jeito que o Guto faz: *"me explica como funciona a virada da noite"*, *"conserta o bug X"*, *"cria a tabela Y"*. Ele tem acesso aos arquivos, ao terminal e (via `.env.local`) consegue consultar o banco.

Cada um tem a **sua** sessão de Claude Code, mas no **mesmo código** — é assim que você trabalha "como o Guto".

---

## Passo 6 — Deploy

O deploy é automático pela Vercel: **`git push origin main`** publica em produção (`https://carreiranodigital.vercel.app`).

Fluxo recomendado:
```bash
git checkout -b minha-alteracao   # trabalhe numa branch
# ... edições ...
git add -A && git commit -m "descrição"
git push origin minha-alteracao   # abra PR, ou:
# git push origin main            # deploy direto (o padrão do time hoje)
```

---

## Passo 7 — Banco de dados (como o Guto opera)

Muita operação do dia a dia é feita por **scripts pontuais** que falam com o Supabase via `SUPABASE_SERVICE_ROLE_KEY` (a API PostgREST) — é o que você vê o Claude rodando (ex.: conferir a virada, medir vendas). Pra DDL/cron, usa-se o `SUPABASE_DB_URL` com `psql`.

- Dashboard do banco: painel do Supabase (tabelas, SQL editor, Auth, Storage).
- Os **crons** (pg_cron) chamam os endpoints de automação — ver [02-ARQUITETURA.md](02-ARQUITETURA.md#motores-automáticos-crons).

---

## Checklist final

- [ ] `npm run dev` sobe em localhost:3000
- [ ] Login funciona e você vê o dashboard completo
- [ ] Claude Code aberto na pasta do projeto e respondendo
- [ ] Leu o [AGENTS.md](../AGENTS.md) (breaking changes do Next)
- [ ] Leu a [02-ARQUITETURA.md](02-ARQUITETURA.md)
