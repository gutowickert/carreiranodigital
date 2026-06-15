-- Campos extras na campanha de disparo (guardar o template usado).
-- Rode no SQL Editor do Supabase.
alter table public.wa_disparos add column if not exists template_nome text;
alter table public.wa_disparos add column if not exists template_idioma text;
alter table public.wa_disparos add column if not exists categoria text;
