-- NPS anônimo por turma (link enviado no grupo da turma). Sem identificação do
-- aluno. Agregado por turma, por professor (via turma_professores) e geral.
-- Rode no SQL Editor do Supabase.

create table if not exists public.nps_respostas (
  id uuid primary key default gen_random_uuid(),
  turma_id uuid references public.turmas(id) on delete set null,
  nota int not null,          -- 0 a 10 (recomendação = NPS)
  nota_professor int,         -- 0 a 10
  nota_conteudo int,          -- 0 a 10
  nota_estrutura int,         -- 0 a 10
  comentario text,
  criado_em timestamptz not null default now()
);
create index if not exists nps_respostas_turma_idx on public.nps_respostas (turma_id);
