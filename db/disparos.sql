-- ============================================================
-- DISPAROS WHATSAPP (API Oficial / Cloud API) — estrutura base
-- Rode no SQL Editor do Supabase.
-- ============================================================

-- Listas de disparo (manual, por turma, por cidade, leads ou alunos)
create table if not exists public.wa_listas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  tipo text not null default 'manual', -- manual | turma | cidade | leads | alunos
  turma_id uuid references public.turmas(id) on delete set null,
  cidade_id uuid references public.cidades(id) on delete set null,
  criado_em timestamptz not null default now()
);

-- Contatos de cada lista (pode vir de lead/aluno do sistema ou importado)
create table if not exists public.wa_lista_contatos (
  id uuid primary key default gen_random_uuid(),
  lista_id uuid not null references public.wa_listas(id) on delete cascade,
  nome text,
  telefone text not null,         -- só dígitos com DDI (ex: 5551999999999)
  email text,
  lead_id uuid references public.leads(id) on delete set null,
  aluno_id uuid references public.alunos(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists wa_lista_contatos_lista_idx on public.wa_lista_contatos (lista_id);
create unique index if not exists wa_lista_contatos_uniq on public.wa_lista_contatos (lista_id, telefone);

-- Opt-out GLOBAL: quem pediu pra sair nunca mais recebe (compliance)
create table if not exists public.wa_optout (
  telefone text primary key,      -- só dígitos com DDI
  motivo text,
  criado_em timestamptz not null default now()
);

-- Templates aprovados na Meta (espelho local pra montar o disparo)
create table if not exists public.wa_templates (
  id uuid primary key default gen_random_uuid(),
  nome text not null,             -- nome EXATO do template na Meta
  categoria text not null default 'marketing', -- marketing | utility | authentication
  idioma text not null default 'pt_BR',
  corpo text,                     -- preview do texto (com {{1}}, {{2}}...)
  num_variaveis int not null default 0,
  status text not null default 'aprovado',
  criado_em timestamptz not null default now()
);

-- Campanha de disparo
create table if not exists public.wa_disparos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  lista_id uuid references public.wa_listas(id) on delete set null,
  template_id uuid references public.wa_templates(id) on delete set null,
  agendado_para timestamptz,      -- null = imediato
  status text not null default 'rascunho', -- rascunho | agendado | enviando | concluido | cancelado
  total int not null default 0,
  enviados int not null default 0,
  falhas int not null default 0,
  criado_por uuid,
  criado_em timestamptz not null default now()
);

-- Envio individual (1 por contato) — log + status + custo
create table if not exists public.wa_disparo_envios (
  id uuid primary key default gen_random_uuid(),
  disparo_id uuid not null references public.wa_disparos(id) on delete cascade,
  telefone text not null,
  nome text,
  lead_id uuid references public.leads(id) on delete set null,
  aluno_id uuid references public.alunos(id) on delete set null,
  status text not null default 'pendente', -- pendente | enviado | entregue | lido | falha
  wamid text,                     -- id da mensagem retornado pela Meta
  erro text,
  custo numeric(10,4),            -- custo estimado da mensagem
  enviado_em timestamptz,
  atualizado_em timestamptz not null default now()
);
create index if not exists wa_disparo_envios_disparo_idx on public.wa_disparo_envios (disparo_id);
create index if not exists wa_disparo_envios_wamid_idx on public.wa_disparo_envios (wamid) where wamid is not null;
