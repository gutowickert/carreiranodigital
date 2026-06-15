-- CORREÇÃO DE FUSO HORÁRIO (horário aparecia 3h adiantado)
-- As colunas de data estavam como "timestamp sem fuso" guardando UTC; o navegador
-- lia como horário local. Isto converte TODAS as colunas naive de public para
-- "timestamptz" interpretando o valor atual como UTC. Depois disso, todas as telas
-- mostram o horário de Brasília certo, sem mudar código.
-- Seguro: só toca em colunas "timestamp without time zone"; pula o que não der.
-- Rode no SQL Editor do Supabase.

do $$
declare r record;
begin
  for r in
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and data_type = 'timestamp without time zone'
  loop
    begin
      execute format(
        'alter table public.%I alter column %I type timestamptz using %I at time zone ''UTC''',
        r.table_name, r.column_name, r.column_name
      );
      raise notice 'convertido: %.%', r.table_name, r.column_name;
    exception when others then
      raise notice 'PULOU %.% (%):', r.table_name, r.column_name, sqlerrm;
    end;
  end loop;
end $$;
