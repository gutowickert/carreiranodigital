-- 19/10, pedido do Guto: o cadastro do aluno da Imersão Deu Venda é automático.
-- Toda matrícula ativa numa turma da imersão (código 'imersaodv...') cria (ou liga) o aluno em imersao_alunos,
-- e o código do link fica gravado na própria matrícula (matriculas.imersao_codigo), pra aparecer na tela da turma.
alter table imersao_alunos add column if not exists matricula_id uuid unique;
alter table matriculas add column if not exists imersao_codigo text;

create or replace function imersao_turma_da(t turmas) returns text language sql immutable as $$
  select case
    when t.codigo ilike 'imersaodv%lajeado%' then 'laj-noite'
    when t.codigo ilike 'imersaodv%portoalegre%' and coalesce(t.observacoes, '') ilike '%noite%' then 'poa-noite'
    when t.codigo ilike 'imersaodv%portoalegre%' then 'poa-tarde'
    else null end
$$;

create or replace function imersao_matricula_auto() returns trigger language plpgsql security definer set search_path = public as $$
declare
  t turmas; chave text; a alunos; cod text; achado text;
begin
  if new.status is distinct from 'ativa' then return new; end if;
  select * into t from turmas where id = new.turma_id;
  if not found then return new; end if;
  chave := imersao_turma_da(t);
  if chave is null then return new; end if;
  select * into a from alunos where id = new.aluno_id;

  -- já tem link: só acompanha a troca de turma
  if new.imersao_codigo is not null then
    update imersao_alunos set turma = chave, matricula_id = new.id, atualizado_em = now() where codigo = new.imersao_codigo;
    return new;
  end if;
  -- já existe pela matrícula, ou foi cadastrado à mão com o mesmo nome na mesma turma (sem matrícula ainda): liga
  select codigo into achado from imersao_alunos where matricula_id = new.id limit 1;
  if achado is null then
    select codigo into achado from imersao_alunos
      where matricula_id is null and turma = chave
        and lower(trim(nome)) = lower(trim(coalesce(a.nome, '')))
      limit 1;
  end if;
  if achado is not null then
    update imersao_alunos set matricula_id = new.id, turma = chave,
      whatsapp = coalesce(whatsapp, a.whatsapp), atualizado_em = now() where codigo = achado;
    new.imersao_codigo := achado;
    return new;
  end if;
  -- novo: código de 8 letras e números, sem repetir
  loop
    cod := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
    exit when not exists (select 1 from imersao_alunos where codigo = cod);
  end loop;
  insert into imersao_alunos (codigo, nome, turma, whatsapp, feitos, matricula_id, criado_em, atualizado_em)
    values (cod, coalesce(nullif(trim(a.nome), ''), 'Aluno'), chave, a.whatsapp, '{}'::jsonb, new.id, now(), now());
  new.imersao_codigo := cod;
  return new;
end $$;

drop trigger if exists imersao_matricula_auto on matriculas;
create trigger imersao_matricula_auto before insert or update of turma_id, status, imersao_codigo on matriculas
  for each row execute function imersao_matricula_auto();
