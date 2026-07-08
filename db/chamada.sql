-- Chamada (presença por dia) + acompanhamento do aluno na turma.
-- Base pros relatórios: % presença, % conclusão, % rodou campanha, % gerou lead,
-- % vendeu. Rode no SQL Editor do Supabase.

-- presença de cada aluno em cada dia de aula
create table if not exists public.turma_presencas (
  id uuid primary key default gen_random_uuid(),
  matricula_id uuid not null references public.matriculas(id) on delete cascade,
  turma_data_id uuid not null references public.turma_datas(id) on delete cascade,
  presente boolean not null default false,
  atualizado_em timestamptz not null default now(),
  unique (matricula_id, turma_data_id)
);
create index if not exists turma_presencas_mat_idx on public.turma_presencas (matricula_id);

-- acompanhamento do aluno (o professor preenche na turma)
alter table public.matriculas add column if not exists nicho text;
alter table public.matriculas add column if not exists ja_rodava_anuncios boolean;
alter table public.matriculas add column if not exists rodou_campanha boolean;
alter table public.matriculas add column if not exists gerou_lead boolean;
alter table public.matriculas add column if not exists vendeu boolean;
alter table public.matriculas add column if not exists concluido boolean;
