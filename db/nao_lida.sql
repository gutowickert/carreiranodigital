-- Marcador manual de "não lida" no lead: um atendente lê e não resolve,
-- e deixa marcado pra outro atendente pegar. Aparece na lista e no kanban do CRM.
-- Rode no SQL Editor do Supabase.

alter table public.leads add column if not exists nao_lida boolean not null default false;
