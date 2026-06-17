-- ============================================================
-- CONTATOS FRIOS (listas importadas: interessados / compradores)
-- Base separada do CRM. Só vira lead quem responder um disparo.
-- Rode no SQL Editor do Supabase.
-- ============================================================

create table if not exists public.wa_contatos (
  id uuid primary key default gen_random_uuid(),
  nome text,
  telefone text not null unique,          -- só dígitos com DDI (ex: 5551999999999)
  email text,
  cidade text,                            -- rótulo livre (ex: Caxias, Porto Alegre)
  categoria text not null default 'interessado', -- interessado | comprador
  origem text,                            -- de onde veio (nome do arquivo/importação)
  status text not null default 'novo',    -- novo | enviado | respondeu | virou_lead | optout
  lead_id uuid references public.leads(id) on delete set null,
  notas text,                             -- situação/observação (ex: "Pago", "Reembolso")
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists wa_contatos_cidade_idx on public.wa_contatos (cidade);
create index if not exists wa_contatos_categoria_idx on public.wa_contatos (categoria);
create index if not exists wa_contatos_status_idx on public.wa_contatos (status);
