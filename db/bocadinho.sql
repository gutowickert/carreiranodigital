-- Bocadinho Doceria (31/10/2026): sistema do irmão do Guto, hospedado temporariamente na escola.
-- 5 tabelas separadas, sem ligação com nada da escola. Cada linha guarda um documento (dados jsonb).
-- RLS ligado e sem política: só o servidor (chave de serviço) lê e grava, pela rota /api/bocadinho,
-- que pede a senha do sistema (hash em bocadinho_config, id 'acesso').
create table if not exists bocadinho_contatos (id text primary key, dados jsonb not null default '{}', criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now());
create table if not exists bocadinho_pedidos  (id text primary key, dados jsonb not null default '{}', criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now());
create table if not exists bocadinho_gastos   (id text primary key, dados jsonb not null default '{}', criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now());
create table if not exists bocadinho_estoque  (id text primary key, dados jsonb not null default '{}', criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now());
create table if not exists bocadinho_config   (id text primary key, dados jsonb not null default '{}', criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now());
alter table bocadinho_contatos enable row level security;
alter table bocadinho_pedidos  enable row level security;
alter table bocadinho_gastos   enable row level security;
alter table bocadinho_estoque  enable row level security;
alter table bocadinho_config   enable row level security;
