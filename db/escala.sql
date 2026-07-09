-- Escala Douglas × Julio: guarda quem vai dar cada aula.
-- A /escala e a /api/escala já usam esta tabela; ela só não tinha sido criada.
-- Rode isto no SQL Editor do Supabase.

create table if not exists public.escala_escolhas (
  chave         text primary key,           -- `${turma_id}|${modulo_id|'anl'}`
  turma_id      uuid,
  modulo_id     uuid,
  escolha       text not null default 'julio',  -- 'douglas' | 'julio'
  atualizado_em timestamptz not null default now()
);

-- (opcional) deixa a leitura em tempo real pela API já é via service_role, não precisa de RLS.
