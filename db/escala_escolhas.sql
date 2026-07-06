-- Escolhas de escala do Douglas (link público /escala). O que ele NÃO marcar
-- fica com o Julio. Uma linha por evento (turma ANL inteira, ou módulo de FC).
-- Rode no SQL Editor do Supabase.

create table if not exists public.escala_escolhas (
  chave text primary key,          -- turma_id + '|' + (modulo_id ou 'anl')
  turma_id uuid,
  modulo_id uuid,
  escolha text not null default 'julio',   -- 'douglas' | 'julio'
  atualizado_em timestamptz not null default now()
);
