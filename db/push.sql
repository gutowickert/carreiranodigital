-- Inscrições de push (notificação no celular) por aparelho.
-- Rode no SQL Editor do Supabase.
create table if not exists public.wa_push_subs (
  id uuid primary key default gen_random_uuid(),
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  user_id uuid,
  criado_em timestamptz not null default now()
);
