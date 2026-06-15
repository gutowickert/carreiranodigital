-- Marca conversas que são de GRUPO do WhatsApp, pra aparecerem na caixa de
-- entrada com a tag "Grupo" e não tentarem virar lead/aluno.
-- Rode no SQL Editor do Supabase.

alter table public.wa_conversas add column if not exists eh_grupo boolean not null default false;
