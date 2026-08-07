# Documentação — Carreira no Digital (CRM + SaaS)

Bem-vindo, Nando. Esta pasta é o teu ponto de partida pra assumir a frente do CRM e do projeto multi-tenant (SaaS).

Leia nesta ordem:

1. **[01-ONBOARDING-DEV.md](01-ONBOARDING-DEV.md)** — instala tudo e sobe o sistema na tua máquina (repo, Node, Claude Code, banco, deploy). Comece por aqui.
2. **[02-ARQUITETURA.md](02-ARQUITETURA.md)** — como o sistema atual funciona por dentro: dados, funil, as duas IAs, os motores automáticos, as blindagens, WhatsApp e integrações. É a lógica inteira do que já roda.
3. **[03-ROADMAP-SAAS.md](03-ROADMAP-SAAS.md)** — onde estamos no multi-tenant e o que vamos construir: os planos Básico/Pro, o motor "role-driven", o gateway de WhatsApp próprio, as fases e os próximos passos.

## Resumo de 30 segundos

- **O que é:** um CRM de vendas por WhatsApp com IA, feito pra escola Carreira no Digital (cursos presenciais de marketing/anúncios no RS). A IA lê conversas, resume clientes, roda uma cadência comercial e (no modo avançado) responde e dispara sozinha.
- **Stack:** Next.js 16 (App Router) + Supabase (Postgres/Auth/RLS/Storage) + Vercel + Anthropic (Claude). WhatsApp por Z-API (web) e Cloud API (oficial).
- **Pra onde vai:** virar **SaaS multi-tenant** — vender o CRM como assinatura pros alunos, cada um com seu funil, sua cadência, sua IA e seu WhatsApp.
- **Como trabalhamos:** com **Claude Code** dentro do repositório (é o "você" com quem o Guto conversa). Você vai trabalhar do mesmo jeito.

## Convenção crítica do projeto

Leia o **[AGENTS.md](../AGENTS.md)** na raiz: esta versão do Next.js tem breaking changes — **sempre confira os guias em `node_modules/next/dist/docs/`** antes de escrever código de framework. Não confie na memória de versões antigas do Next.
