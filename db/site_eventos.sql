-- Eventos de comportamento nos sites/landing pages (topo do funil).
-- O snippet colado nos HTMLs manda os eventos pro endpoint /api/track, que grava aqui.
-- Cada linha é um evento (page_view, scroll_50/90, video_play/50, viu_oferta/preco,
-- cta_view, cta_click) amarrado por um `visitor_id` persistente + `sessao_id`.
-- Rode este script no SQL Editor do Supabase.

create table if not exists public.site_eventos (
  id uuid primary key default gen_random_uuid(),
  visitor_id text,        -- id persistente do visitante (mesmo id vai pro /wa como ?vid=)
  sessao_id text,         -- id da sessão (uma visita)
  evento text not null,   -- page_view | scroll_50 | scroll_90 | video_play | video_50 | viu_oferta | viu_preco | cta_view | cta_click
  url text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  fbclid text,
  codigo_turma text,      -- turma do anúncio (casa com wa_clicks / leads)
  ref text,
  meta jsonb,             -- payload extra do evento (ex: href do cta_click)
  user_agent text,
  client_ip text,
  criado_em timestamptz not null default now()
);

-- Consultas do Funil do Site: por período, por visitante e por turma.
create index if not exists site_eventos_criado_idx on public.site_eventos (criado_em);
create index if not exists site_eventos_visitor_idx on public.site_eventos (visitor_id);
create index if not exists site_eventos_turma_idx on public.site_eventos (codigo_turma) where codigo_turma is not null;
