-- Tabela que guarda cada clique no botão de WhatsApp (página /wa) ANTES da
-- pessoa mandar a mensagem. O webhook do Z-API casa a mensagem com o clique
-- pelo código `ref` e então cria o lead completo (turma + rateio + CAPI).
-- Rode este script no SQL Editor do Supabase.

create table if not exists public.wa_clicks (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  codigo_turma text,
  fbclid text,
  fbc text,
  fbp text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  event_id text,
  event_source_url text,
  client_ip text,
  user_agent text,
  visitor_id text,        -- id persistente do visitante no site (costura com site_eventos)
  sessao_id text,         -- id da sessão específica que gerou o clique
  lead_id uuid references public.leads(id) on delete set null,
  consumido_em timestamptz,
  criado_em timestamptz not null default now()
);

-- Busca rápida pelo ref ainda não consumido (usada no webhook).
create index if not exists wa_clicks_ref_idx on public.wa_clicks (ref) where consumido_em is null;

-- Costura site_eventos <-> wa_clicks <-> lead pela identidade do visitante.
create index if not exists wa_clicks_visitor_idx on public.wa_clicks (visitor_id) where visitor_id is not null;

-- Migração (banco já existente): rode estas duas linhas no SQL Editor do Supabase.
--   alter table public.wa_clicks add column if not exists visitor_id text;
--   alter table public.wa_clicks add column if not exists sessao_id text;
