# 13 — Roteiro de Implantação (pro Nando executar)

*O passo a passo pra tirar o núcleo do CRM e instalar num cliente. Nando executa; Guto + Claude do lado na 1ª vez.*
*Referência do que fica/sai: [12-INVENTARIO-NUCLEO.md](12-INVENTARIO-NUCLEO.md).*

> **Regra sagrada:** o CRM da escola (repo `carreiranodigital` + Supabase + Vercel + WhatsApp da escola) **não se toca em nenhum passo.** Tudo abaixo é em **infra NOVA**.

---

# FASE 1 — Extrair o núcleo (UMA VEZ, com apoio)

*Esta fase é a mais delicada (mexe em código e schema). Faz uma vez, cria o repo do produto, e não repete. Tem partes de dev, não é só apagar — os pontos marcados 🛠️ pedem o Claude do lado.*

## 1.1 · Copiar o repo
1. Cria um repo novo no GitHub (ex.: `crm-nucleo`).
2. Copia o código do `carreiranodigital` pra ele (clone + push pro novo remote, ou "template"). **Não é fork ligado** — é cópia independente.

## 1.2 · Novo Supabase + schema
1. Cria um **projeto Supabase novo** (o do produto/teste).
2. Exporta o schema da escola (só estrutura, **leitura, não toca nos dados**):
   `pg_dump --schema-only --no-owner <DB_URL_ESCOLA> > schema.sql`
3. Aplica o `schema.sql` no Supabase novo.

## 1.3 · 🛠️ Remover as tabelas de escola (SAI)
No banco NOVO, dropa as tabelas SAI. **⚠️ Cuidado com FKs** — `leads.turma_id`, `matriculas.turma_id/aluno_id` apontam pra tabelas que vão sair. Ordem: derruba as constraints primeiro, ou usa `CASCADE`. Faz com o Claude do lado (ele gera o script certo pro estado real do banco).

Tabelas a dropar (do inventário): `alunos, turmas, turma_datas, turma_presencas, turma_professores, briefings_turma, disparos_turma, financeiro_turma, salas, professores, professor_cidades, pagamentos_professores, presenca_diaria, escala_escolhas, agenda_aulas, agenda_eventos, materiais_curso, produto_modulos, produto_tarefas_template, pipeline_produtos, recomendacoes_produto, recomendacoes, comissoes, contas_financeiras, lancamentos_empresa, lancamentos_financeiros, naturezas_financeiras, transferencias, transferencias_caixa, custos_fixos, cidades, equipamentos, alocacoes_equipamento, calendario_editorial, entregas_marketing, entregas_servico, contratos_servico, vendedor_config_turma`.

**Mantém (não dropa):** `turma_lotes` (DORM), `matriculas` (vira `vendas`), `prospeccoes_externas`, `prospeccao_andamentos`, `indicacoes`, `metricas_campanha`, `nps`, `nps_respostas`, `rateio_estado`, `metas_vendedor`.

## 1.4 · 🛠️ Remover páginas/APIs/libs de escola (SAI)
No repo novo, apaga (lista do inventário):
- **Páginas:** `alunos turmas turmas-mensagens lotes matriculas-orfas chamada salas professores modulos agenda comissoes financeiro transferencias cidades crm-externo`
- **APIs:** `chamada escala professor(es) certificado transferencias` + `ia/roteador-turma ia/ultimo-dia-lote ia/sem-cidade-perda` + `wa-oficial/agenda wa-oficial/migrar-proxima-turma` + `turmas/*` (fases, lotes-abertos, mensagens) + `wa/backfill-lid wa/sincronizar-historico wa/sync-lidas` (Z-API) + `webhook/zapi`
- **Libs:** `cert-assets.ts zapi.ts`

**Depois de apagar, o build vai quebrar** (imports órfãos). 🛠️ Rodar `npm run build`, e ir consertando os imports quebrados um a um (é o loop normal — o Claude ajuda). Só termina quando **compila limpo**.

## 1.5 · 🛠️ Generalizar (o que era da escola vira config)
- `lib/contexto-negocio.ts` + `contexto-central.ts` → passam a **ler o contexto do negócio** (o `contexto.config`) em vez do texto cravado da escola.
- `matriculas` → renomear conceito pra **`vendas`** (tabela + a tela que registra).
- `org` / `ORG_CND` → **seed de 1 org** (a instância), sem multi-tenant.
- Branding (Carreira no Digital, Mateus, produtos) → **config**.
- Menu: esconder/remover os itens SAI (o mecanismo de esconder tela do menu já existe em `components/Layout.tsx`).

## 1.5-bis · 🔴 VARREDURA de URL e identidade cravadas (CRÍTICO — fazer cedo)
*O acidente mais grave: se a URL da escola ficar cravada, o cron do cliente roda os motores DA ESCOLA (manda WhatsApp pros leads da escola, 2×/dia). Parametrizar ANTES de qualquer deploy.*

**URLs da escola → `process.env.NEXT_PUBLIC_BASE_URL`:**
- `app/api/ia/cron-run/route.ts:10` — `const BASE = 'https://carreiranodigital.vercel.app'` **(o pior — o orquestrador dos motores)**
- `app/auth/callback/route.ts:16` — redirect fixo do login
- `lib/agente-tools.ts:202` — fallback de URL

**Identidade da escola → config do negócio (`contexto.config`) ou remover:**
- `lib/kb.ts:39` — telefone (51) 9686-4727, site carreiranodigital.com, sede Lajeado/RS (+ linha 18)
- `app/termos/page.tsx` e `app/politica-privacidade/page.tsx` — "Carreira No Digital" + contato@carreiranodigital.com.br
- `app/agentes/page.tsx` — landing dos 10 agentes do curso (**apaga inteira**)
- nome "Carreira no Digital" / vendedor "Mateus" em: `followup-auto`, `retomar-time`, `wa-oficial/enviar-template`, `migrar-antigos`, `migrar-proxima-turma`, `recuperar-falhas`, `lib/org.ts`

## 1.6 · Build limpo = núcleo pronto
`npm run build` passa → **o repo do núcleo está pronto.** Guarda esse repo — é a base de toda instalação futura.

---

# FASE 2 — Instalar num cliente (POR CLIENTE — o que o Nando domina)

*Esta é a parte repetível. Depois da 1ª, cada cliente novo é só isso.*

## 2.1 · Pedir as credenciais do cliente
- **Supabase** (projeto dele) · **Anthropic** (chave dele) · **WhatsApp Cloud API** (Meta Business dele — o passo mais chato) · **Vercel** (conta dele).

## 2.2 · Banco do cliente
- Supabase novo do cliente → aplica o schema do **núcleo** (o já limpo da Fase 1).

## 2.3 · Deploy
- Repo do núcleo → Vercel do cliente. Preenche as **envs** (Supabase, Anthropic, WhatsApp, base URL).

## 2.4 · Seed inicial
- 1 **org** (a empresa) + 1 **admin** (o dono/operador).
- Etapas base + fluxo/cadência base + templates base.

## 2.4-bis · 🔴 Recriar os crons (pg_cron) — senão o motor NUNCA roda
O `pg_dump --schema-only` do `public` **não traz os agendamentos** (vivem em `cron.job`). Sem recriar, o sistema **parece funcionar e não faz follow-up nenhum**. No Supabase do cliente: habilita `pg_cron` + `pg_net`, e recria os jobs que chamam o **cron-run do CLIENTE** (a `NEXT_PUBLIC_BASE_URL` dele), fase manhã (~9h) e noite (~23h). Referência: os jobs `ia-manha-*` / `ia-noite-*` da escola — mesma estrutura, só troca a URL.

## 2.5 · Config do negócio
- **Contexto** (o `contexto.config` — dos agentes, ou preenchido na mão por ora).
- **Produtos/serviços** dele.
- **Funil** (etapas) e **cadência** (fluxo — via conversa com o agente interno).
> **Venda no v1:** sem HeroSpark/checkout integrado, a venda entra **na mão** (registro ligado ao lead). A camada de Integrações (webhook de checkout) vem depois.

## 2.6 · Conectar o WhatsApp
- WhatsApp Cloud API do cliente (número dele) → webhook apontando pro deploy. Submeter templates na Meta dele.

## 2.7 · Smoke test (validar que roda)
- Cria um lead de teste → manda uma msg no WhatsApp → vê cair na inbox → a IA responde → dispara um teste → o follow-up gera tarefa. Se os 5 acontecem, **está no ar.**
- **🔴 Teste de RLS (isolamento):** loga como usuário do cliente e confirma que ele **não vê dado de outra org**. As policies vêm no dump, mas o `auth` do Supabase novo é próprio — é comum vir sem efeito ou dar conflito. Se vazar, revisar as policies antes de qualquer dado real.

---

# Checkpoints (onde o Nando valida com a gente)
1. Fim da 1.4 — **build compila limpo** sem as telas de escola.
2. Fim da Fase 1 — **núcleo roda** (login + board vazio + WhatsApp conecta).
3. Fim de 2.7 — **smoke test passa** no cliente.

# Cuidados
- **Nunca** rodar comando destrutivo no banco/repo da **escola**.
- O `pg_dump` da escola é **só leitura** (estrutura).
- Cada cliente = **infra 100% isolada** (Supabase, Vercel, WhatsApp, IA próprios).
- Dúvida ou build quebrado → chama o Claude (o loop de conserto de import é normal).

---

*Fase 1 é uma vez. Fase 2 é o que se repete a cada cliente — é onde o Nando ganha a experiência que vira autonomia.*
