-- Aviso de proposta aberta (23/09/2026).
-- Rode no SQL Editor do Supabase. SÓ ACRESCENTA COLUNA — nada que existe hoje muda.
--
-- POR QUE ESTA COLUNA: quando o cliente abre a proposta, o time recebe um aviso no celular. Mas a
-- pessoa que está lendo abre, fecha, volta, rola a página — e cada uma dessas seria um aviso. O
-- limite de "uma vez por dia por proposta" precisa ser guardado em algum lugar, e é aqui.
--
-- A primeira abertura sempre avisa. Depois disso, só avisa de novo se passou um dia — porque voltar
-- a ler dois dias depois é sinal de decisão, e essa é justamente a hora de ligar.

alter table public.orcamentos add column if not exists avisado_em timestamptz;

comment on column public.orcamentos.avisado_em is
  'Quando o time foi avisado pela última vez de que o cliente abriu esta proposta. Vazio = nunca avisou.';

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'orcamentos' and column_name = 'avisado_em';
