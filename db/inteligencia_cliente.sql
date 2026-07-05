-- Dossiê de "voz do cliente" por produto (+ cidade), destilado das conversas
-- reais (ganho/perda) pra alimentar o sistema de geração de conteúdo.
-- Cacheado aqui; regenera sob demanda ou por cron. Rode no SQL Editor do Supabase.

create table if not exists public.inteligencia_cliente (
  id uuid primary key default gen_random_uuid(),
  produto text not null,              -- nome do produto (ex: "Anúncios para Negócios Locais")
  cidade text not null default '',    -- nome da cidade; '' = todas as cidades do produto
  dossie jsonb,                       -- o dossiê estruturado (dores, desejos, objeções, frases...)
  n_ganhos int not null default 0,
  n_perdas int not null default 0,
  gerado_em timestamptz,
  atualizado_em timestamptz not null default now()
);
create unique index if not exists inteligencia_cliente_seg on public.inteligencia_cliente (produto, cidade);
