-- Relatório de disparos: marca quem respondeu + view de resumo por campanha.
-- Rode no SQL Editor do Supabase.

-- quando o contato respondeu o disparo (atribuído à campanha mais recente dele)
alter table public.wa_disparo_envios add column if not exists respondeu_em timestamptz;

-- resumo agregado por campanha (funil: enviado -> entregue -> lido, + falhas/respostas/custo)
create or replace view public.wa_disparo_resumo as
select
  disparo_id,
  count(*)                                                   as contatos,
  count(*) filter (where status in ('enviado','entregue','lido')) as enviados_ok,
  count(*) filter (where status in ('entregue','lido'))      as entregues,
  count(*) filter (where status = 'lido')                    as lidos,
  count(*) filter (where status = 'falha')                   as falhas,
  count(*) filter (where respondeu_em is not null)           as respostas,
  coalesce(sum(custo), 0)                                    as custo
from public.wa_disparo_envios
group by disparo_id;
