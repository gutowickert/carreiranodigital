# 12 — Inventário do Núcleo (FICA / GENERALIZA / SAI)

*O mapa fino pra extração. Cada página, lib, grupo de API e tabela classificado.*
*Legenda: **FICA** = núcleo genérico · **GEN** = fica, mas vira config/renomeia · **SAI** = escola, remove · **DORM** = fica desligado (guardado).*

---

## 1. Páginas (`app/dashboard/`)

### FICA (núcleo)
`crm` (board) · `leads` · `ligacoes` (fila) · `whatsapp` (inbox) · `whatsapp-conectar` · `whatsapp-disparos` · `atender` · `disparos` · `agenda-disparos` · `listas` · `followup-ia` · `followup-templates` · `etapas` · `fluxo` · `motivos-perda` · `tarefas` · `mapa-funil` · `qualidade-ia` · `automacao-ia` · `ia-uso` · `ia-ajuda` · `produtos` · `usuarios` · `vendedores` · `configuracoes` · `webhook-logs` · `recuperar-historico` · `captacao` · `funil-site` · `trafego` · `analise-conversao` · `velocidade-venda` · `desempenho` · `admin`

### GEN (fica, generaliza)
- `agente-interno` → **personalizável** (prompts do negócio, não da escola)
- `inteligencia-cliente` → **personalizável**
- `nps` → genérico (qualquer negócio)
- `fechamento` → genérico (fechamento de venda/período, não de turma)
- **`matriculas` → `vendas`** (renomeia + generaliza; a venda liga no lead, sem o financeiro por trás)

### SAI (escola)
`alunos` · `turmas` · `turmas-mensagens` · `lotes` · `matriculas-orfas` · `chamada` · `salas` · `professores` · `modulos` · `agenda` (aulas) · `comissoes` · `financeiro` · `transferencias` · `cidades` · `crm-externo`

---

## 2. Libs (`lib/`)

### FICA
`api` · `api4com` (telefonia/ligação) · `atender-lead` · `atendimento-ia` · `audio` · `capi` (Meta) · `configuracoes` · `entender-midia` · `fluxo` · `historico-lead` (dossiê) · `ia-config` · `ia-uso` · `inteligencia-cliente` · `interpretar-followup` · `lead-do-wa` · `meta-ads` · `push` · `resumo-lead` · `saudacao` · `sequencia-tarefas` · `supabase(-admin/-user)` · `temperatura` · `transcrever-audio` · `transcrever-ligacao` · `whatsapp-oficial` · `analise-conversao`

### GEN (vira config)
- `contexto-negocio` + `contexto-central` → **o contexto do negócio** (hoje cravado na escola → lê o `contexto.config` por instância)
- `kb` (base de conhecimento) → **KB por negócio**
- `org` → resolução de org (single-tenant: seed 1 org)
- `rateio` (`rateio_estado`) → regra de distribuição de lead (generaliza)
- `agente-tools` → ferramentas do agente interno (personalizável)

### DORM (fica desligado)
- `lote-core` · `lote` → o motor por lote, **guardado** (sem turma_lotes, roda cadência normal)

### SAI
- `cert-assets` (certificados) · `zapi` (Z-API antigo, já desativado — a conexão web vem depois)

---

## 3. API (`app/api/`)

### FICA — o motor (`ia/`)
`followup-auto` · `virada` · `cron-run` · `resumos` · `reconciliar` · `garantir-tarefas` · `limpar-atrasados` · `posse-funil` · `retomar-time` · `sem-cidade-perda`\* · `sync-pool` · `atender` · `ajuda` · `edicao`
*\*`sem-cidade-perda` é meio escola (turma), revisar; `roteador-turma` e `ultimo-dia-lote` → **SAI/DORM** (turma).*

### FICA — WhatsApp (`wa-oficial/`, `wa/`)
`conectar` · `contatos` · `criar-templates` · `disparar` · `disparo-respondentes` · `editar-templates` · `enviar-template` · `midia` · `recuperar-falhas` · `register` · `relatorio` · `responder` · `status` · `subscribe` · `templates` · `ultimos-envios` · `upload-midia` · `webhook` · `wa/enviar` · `wa/config` · `wa/marcar-lida`
→ **SAI/DORM:** `wa-oficial/agenda`, `migrar-proxima-turma` (turma) · `wa/backfill-lid`, `sincronizar-historico`, `sync-lidas` (Z-API antigo)

### FICA — tracking + captação
`capi` · `track` · `site` · `funil-site` (+ `anuncios`, `eventos`, `jornadas`) · `meta` · `webhook/api4com` (ligação)

### FICA — núcleo diverso
`etapas` · `fluxo` · `followup-templates` · `tarefas` · `produtos` · `atendimento` · `copiloto` · `agente` · `mapa-funil` · `velocidade-venda` · `analise-conversao` · `dashboard-followup` · `qualidade-ia` · `ia-uso` · `inteligencia-cliente` · `lead` · `ligacao(es)` · `push` · `org` · `admin`

### GEN
- `webhook/herospark` → **camada de Integrações** (o dono liga o checkout dele; HeroSpark vira exemplo)
- `nps` · `fechamento` → genéricos
- `turmas/*` (`fases`, `lotes-abertos`, `mensagens`) → **DORM** (só ligam com turma_lotes)

### SAI
`chamada` · `escala` · `professor(es)` · `certificado` · `transferencias` · (financeiro dentro de outros)

---

## 4. Tabelas (79 → núcleo)

### FICA (núcleo)
`leads` · `lead_andamentos` · `ligacoes` · `motivos_perda` · `etapas` · `tarefas_lead` · `tarefa_templates` · `tarefas` · `followup_templates` · `produtos` · `inteligencia_cliente` · `contatos_lead` · `metricas_campanha` · `site_eventos` · `wa_clicks` · `webhook_logs` · `usuarios` · `usuarios_perfil` · `configuracoes` · `metas_vendedor` · **todas `wa_*`** (`conversas`, `mensagens`, `contatos`, `disparos`, `disparo_envios`, `disparo_resumo`, `listas`, `lista_contatos`, `optout`, `oficial_config`, `templates`, `push_subs`)

### GEN (renomeia/generaliza)
- **`matriculas` → `vendas`** (o registro da venda, ligado ao lead)
- `organizacoes` → a org da instância · `unidades` → opcional
- `nps` + `nps_respostas` → genéricos
- `rateio_estado` → regra de distribuição
- `prospeccoes_externas` + `prospeccao_andamentos` → opcional (prospecção ativa, se genérico)

### SAI (escola)
`alunos` · `turmas` · `turma_lotes`\* · `turma_datas` · `turma_presencas` · `turma_professores` · `briefings_turma` · `disparos_turma` · `financeiro_turma` · `salas` · `professores` · `professor_cidades` · `pagamentos_professores` · `presenca_diaria` · `escala_escolhas` · `agenda_aulas` · `agenda_eventos` · `materiais_curso` · `produto_modulos` · `produto_tarefas_template` · `pipeline_produtos` · `recomendacoes_produto` · `recomendacoes` · `comissoes` · `contas_financeiras` · `lancamentos_empresa` · `lancamentos_financeiros` · `naturezas_financeiras` · `transferencias` · `transferencias_caixa` · `custos_fixos` · `cidades` · `equipamentos` · `alocacoes_equipamento` · `calendario_editorial` · `entregas_marketing` · `entregas_servico` · `contratos_servico` · `indicacoes`
*\*`turma_lotes` fica no schema (DORM) pro motor por lote não quebrar; só não é usada sem turmas.*

---

## 5. Zonas cinza pra tua conferência

1. **`sem-cidade-perda`** (motor) — é regra de escola (lead sem cidade da turma → perda). Generaliza ou tira?
2. **`prospeccoes_externas` / `indicacoes`** — prospecção ativa e indicação. Genérico (todo negócio) ou escola? (recomendo manter genérico)
3. **`metricas_campanha`** — métricas de anúncio. Fica (é do tracking) — confirmar.
4. **`vendedores` vs solo** — no modo invisível (dono solo) não tem vendedores; a tela fica, só vazia. Ok?
5. **`agenda`** (aulas) sai, mas a **clínica com sessões** vai querer agenda de sessões depois — deixamos a porta (DORM) ou tiramos limpo?

---

## Resumo dos números
- **Páginas:** ~34 FICA · 5 GEN · 15 SAI
- **Libs:** ~27 FICA · 6 GEN · 2 DORM · 2 SAI
- **Tabelas:** ~35 FICA/GEN · ~40 SAI

Mais da metade do peso (financeiro + turmas + escola) **sai** — sobra um CRM enxuto de lead + WhatsApp + follow-up + venda + tracking.
