-- ============================================================================================
-- PSI — o FINANCEIRO do consultório e a CONFIRMAÇÃO do dia anterior (07/11/2026).
-- Rode DEPOIS do db/psi.sql. Supabase > SQL Editor > colar este arquivo inteiro > Run.
-- Pode rodar mais de uma vez (tudo usa "if not exists" / "or replace" / "drop ... if exists").
-- Enquanto este arquivo não for rodado, o app continua funcionando: a tela Financeiro mostra um aviso
-- e as gravações tiram sozinhas as colunas novas (lib/psi/repo-supabase.ts).
--
-- O QUE A MORGANA PASSOU
--  · APAE: salário fixo (~R$ 2.300/mês). Imposto de 6% SÓ sobre o que entra da APAE.
--  · Mercado Montanha: salário fixo de R$ 2.500/mês.
--  · SESM (era "Clínica Mauri"): cobra por paciente atendido; ela paga R$ 370/mês de aluguel.
--  · Clínica Conecta: cobra por paciente atendido; 20% de cada atendimento fica pra clínica.
--  · Contador: ~R$ 200/mês (custo geral, de nenhum local).
-- ============================================================================================

-- ---------- LOCAIS: como cada um paga ----------
alter table psi_locais add column if not exists modelo         text not null default 'sessao';   -- 'salario' | 'sessao'
alter table psi_locais add column if not exists salario_mensal numeric(10,2);                    -- modelo 'salario': quanto entra por mês
alter table psi_locais add column if not exists repasse_pct    numeric(5,2);                     -- % de cada atendimento que fica pro local
alter table psi_locais add column if not exists imposto_pct    numeric(5,2);                     -- % de imposto sobre tudo que entra do local

alter table psi_locais drop constraint if exists psi_locais_modelo_check;
alter table psi_locais add constraint psi_locais_modelo_check check (modelo in ('salario','sessao'));
alter table psi_locais drop constraint if exists psi_locais_pct_check;
alter table psi_locais add constraint psi_locais_pct_check check (
  (repasse_pct is null or repasse_pct between 0 and 100) and (imposto_pct is null or imposto_pct between 0 and 100));

-- ---------- PACIENTES: quanto ela cobra de cada um ----------
-- (vazio = vale o valor_sessao do local; em local de salário não é usado)
alter table psi_pacientes add column if not exists valor_sessao numeric(10,2);

-- ---------- ATENDIMENTOS: a confirmação do dia anterior (tela "Confirmar amanhã") ----------
-- Só pros locais por atendimento. "Desmarcou" também troca a presença do atendimento pra 'desmarcou'.
-- O sistema NÃO manda mensagem: o botão só abre o WhatsApp dela com o texto pronto.
alter table psi_atendimentos add column if not exists confirmacao   text;
alter table psi_atendimentos add column if not exists confirmado_em timestamptz;
alter table psi_atendimentos drop constraint if exists psi_atendimentos_confirmacao_check;
alter table psi_atendimentos add constraint psi_atendimentos_confirmacao_check
  check (confirmacao is null or confirmacao in ('a_confirmar','confirmado','desmarcou'));

-- ---------- DESPESAS: custos fixos do mês (aluguel, contador) e avulsos ----------
-- recorrente = true: vale todo mês de `desde` até `ate` (inclusive; vazio = sem fim).
-- recorrente = false: vale só no `mes`. Meses no formato 'YYYY-MM'.
-- Trocou o valor do aluguel? O app fecha a linha antiga no mês anterior e abre uma nova (o passado não muda).
create table if not exists psi_despesas (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id),
  nome          text not null,
  valor         numeric(10,2) not null default 0 check (valor >= 0),
  local_id      uuid references psi_locais(id) on delete set null,   -- aluguel da SESM; vazio = geral (contador)
  recorrente    boolean not null default true,
  desde         text check (desde is null or desde ~ '^\d{4}-\d{2}$'),
  ate           text check (ate   is null or ate   ~ '^\d{4}-\d{2}$'),
  mes           text check (mes   is null or mes   ~ '^\d{4}-\d{2}$'),
  ativo         boolean not null default true,
  observacao    text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (recorrente or mes is not null)
);

create index if not exists psi_despesas_owner on psi_despesas (owner_id, recorrente, nome);
create index if not exists psi_despesas_local on psi_despesas (local_id);
create index if not exists psi_atend_confirmacao on psi_atendimentos (owner_id, data, confirmacao);

-- ---------- RLS: igual às outras psi_* (cada login só vê e grava o que é dele) ----------
alter table psi_despesas enable row level security;
revoke all on psi_despesas from anon;
drop policy if exists dono_ve     on psi_despesas;
drop policy if exists dono_cria   on psi_despesas;
drop policy if exists dono_altera on psi_despesas;
drop policy if exists dono_apaga  on psi_despesas;
create policy dono_ve     on psi_despesas for select to authenticated using (owner_id = auth.uid());
create policy dono_cria   on psi_despesas for insert to authenticated with check (owner_id = auth.uid());
create policy dono_altera on psi_despesas for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- despesa não é prontuário: pode apagar de verdade (lançou errado). A auditoria guarda que apagou.
create policy dono_apaga  on psi_despesas for delete to authenticated using (owner_id = auth.uid());

-- ---------- GATILHOS (as funções já existem no db/psi.sql) ----------
drop trigger if exists psi_atualizado on psi_despesas;
create trigger psi_atualizado before update on psi_despesas for each row execute function psi_tocar_atualizado();
drop trigger if exists psi_dono on psi_despesas;
create trigger psi_dono before update on psi_despesas for each row execute function psi_dono_fixo();
drop trigger if exists psi_audit on psi_despesas;
create trigger psi_audit after insert or update or delete on psi_despesas for each row execute function psi_auditar();

-- ============================================================================================
-- DEPOIS DE RODAR: os dados DELA (o Guto preenche; nada aqui mexe nas linhas dela sozinho)
--
-- psi_locais (uma linha por local, filtrar por nome e owner_id dela):
--   APAE ............. modelo = 'salario', salario_mensal = 2300, imposto_pct = 6
--   Mercado Montanha . modelo = 'salario', salario_mensal = 2500
--   Clínica Mauri .... nome = 'SESM', modelo = 'sessao', valor_sessao = <quanto ela cobra>, cobra_falta = <true/false>
--   Clínica Conecta .. modelo = 'sessao', valor_sessao = <quanto ela cobra>, repasse_pct = 20
-- psi_pacientes: valor_sessao = <valor do paciente> (só quem paga diferente do valor do local)
-- psi_despesas (owner_id = o dela; desde = o primeiro mês que vale, ex.: '2026-11'):
--   ('Aluguel da sala', 370, local_id = <id da SESM>, recorrente = true, desde = '2026-11')
--   ('Contador',        200, local_id = null,          recorrente = true, desde = '2026-11')
-- (Também dá pra fazer tudo pelo app: Mais > Locais e valores, e Financeiro > Despesa.)
--
-- Exemplo (troque o e-mail e confira antes de rodar):
-- update psi_locais l set nome = 'SESM' from auth.users u
--  where u.id = l.owner_id and u.email = 'EMAIL-DELA@exemplo.com' and l.nome = 'Clínica Mauri';
-- update psi_locais l set modelo = 'salario', salario_mensal = 2300, imposto_pct = 6 from auth.users u
--  where u.id = l.owner_id and u.email = 'EMAIL-DELA@exemplo.com' and l.nome = 'APAE';
-- update psi_locais l set modelo = 'salario', salario_mensal = 2500 from auth.users u
--  where u.id = l.owner_id and u.email = 'EMAIL-DELA@exemplo.com' and l.nome = 'Mercado Montanha';
-- update psi_locais l set repasse_pct = 20 from auth.users u
--  where u.id = l.owner_id and u.email = 'EMAIL-DELA@exemplo.com' and l.nome = 'Clínica Conecta';
-- insert into psi_despesas (owner_id, nome, valor, local_id, recorrente, desde)
-- select u.id, d.nome, d.valor, (select id from psi_locais where owner_id = u.id and nome = d.local), true, '2026-11'
--   from auth.users u, (values ('Aluguel da sala', 370, 'SESM'), ('Contador', 200, null)) as d(nome, valor, local)
--  where u.email = 'EMAIL-DELA@exemplo.com';
-- ============================================================================================
