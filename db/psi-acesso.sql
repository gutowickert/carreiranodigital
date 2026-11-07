-- ============================================================================================
-- PSI: o login da Morgana é SÓ do consultório (07/11/2026). Rodar UMA vez no SQL Editor,
-- depois do db/psi.sql. Pode rodar de novo sem problema.
--
-- O que faz: quem tem perfil no consultório (psi_perfil) e NÃO tem perfil na escola (usuarios_perfil)
-- ganha a marca app_metadata.papel = 'psi' no login. Com a marca:
--  · o proxy.ts recusa qualquer /api da escola (403), sem nem ir ao banco;
--  · o painel (/dashboard) e o /login mandam a pessoa pro /psi;
--  · lib/org.ts não a trata como "da escola" (o padrão pra quem não tem empresa).
-- Ninguém da equipe é afetado: quem tem usuarios_perfil nunca recebe a marca.
-- (A app_metadata só o servidor/banco consegue mudar; a própria pessoa não consegue tirar a marca.)
-- ============================================================================================

create or replace function psi_marcar_papel() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  if not exists (select 1 from public.usuarios_perfil where id = new.owner_id) then
    update auth.users
       set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"papel":"psi"}'::jsonb
     where id = new.owner_id;
  end if;
  return new;
end $$;

revoke all on function psi_marcar_papel() from public, anon, authenticated;

drop trigger if exists psi_marcar_papel on psi_perfil;
create trigger psi_marcar_papel after insert on psi_perfil for each row execute function psi_marcar_papel();

-- quem JÁ entrou no consultório antes deste arquivo (ex.: a Morgana, se já tiver aberto o /psi)
update auth.users u
   set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) || '{"papel":"psi"}'::jsonb
 where exists (select 1 from psi_perfil p where p.owner_id = u.id)
   and not exists (select 1 from usuarios_perfil x where x.id = u.id);

-- OU marcar na mão, logo depois de criar o login dela (troque o e-mail):
-- update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"papel":"psi"}'::jsonb
--  where email = 'EMAIL-DELA@exemplo.com';

-- ============================================================================================
-- CONFERIR (só leitura): as tabelas da escola que o navegador lê direto usam a regra meu_org().
-- Se a função devolver a escola pra quem não tem perfil, um login sem empresa leria essas tabelas.
-- Rode e olhe o texto da função:
--   select pg_get_functiondef('public.meu_org'::regproc);
-- Se tiver algo como coalesce(..., '00000000-0000-0000-0000-0000000000cd'), avise antes de criar
-- o login dela: a correção é a função devolver null quando app_metadata.papel = 'psi'.
-- ============================================================================================
