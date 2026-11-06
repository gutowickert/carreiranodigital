-- Maia: a rotina de hora em hora pelo agendador do banco (05/11). A Vercel grátis só roda cron 1x por dia.
-- Roda aos 5 minutos de cada hora e chama /api/maia/rotina com a chave da rotina (MAIA_ROTINA_CHAVE, a mesma da Vercel).
-- Troca COLOCA_A_CHAVE pela chave antes de rodar no editor SQL do Supabase. Pra parar: select cron.unschedule('maia-rotina');
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('maia-rotina') where exists (select 1 from cron.job where jobname = 'maia-rotina');
select cron.schedule('maia-rotina', '5 * * * *', $$
  select net.http_get(
    url := 'https://www.carreiranodigital.com/api/maia/rotina',
    headers := jsonb_build_object('x-chave', 'COLOCA_A_CHAVE'),
    timeout_milliseconds := 120000
  )
$$);
