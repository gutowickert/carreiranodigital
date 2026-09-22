-- Orçamentos: nome do cliente na proposta + aceite do cliente (22/09/2026).
-- Rode no SQL Editor do Supabase. SÓ ACRESCENTA COLUNAS — nada que existe hoje muda, e orçamento
-- já publicado continua funcionando com estes campos em branco.
--
-- ── POR QUE O NOME DO CLIENTE VIRA CAMPO PRÓPRIO
-- A proposta imprimia o nome do lead direto. O lead do José estava cadastrado como "Jose Poa 2" — o
-- apelido que veio do WhatsApp — e foi isso que saiu na capa, no cabeçalho de todas as páginas e no
-- endereço do link (/proposta/jose-2-...). Corrigir o nome no CRM não serve: é ele que casa com o
-- contato do WhatsApp. Então o nome que aparece NA PROPOSTA passa a ser escolhido na hora de montar,
-- e o cadastro do lead segue como está.
--
-- ── POR QUE O ACEITE FICA AQUI, E O QUE ELE É
-- A última página tinha três linhas de assinatura, pra imprimir. No lugar disso o cliente marca que
-- leu e aceitou, escrevendo o nome dele.
--
-- ⚠️ ISSO NÃO É ASSINATURA DIGITAL. Não tem certificado nem validade de documento assinado: é o
-- registro de que alguém com o link escreveu aquele nome e clicou, naquela data e hora. Serve como
-- prova de que a proposta foi lida e aceita, não como contrato assinado.

alter table public.orcamentos add column if not exists cliente_nome       text;
alter table public.orcamentos add column if not exists aceito_em          timestamptz;
alter table public.orcamentos add column if not exists aceito_nome        text;
alter table public.orcamentos add column if not exists aceito_dispositivo text;

comment on column public.orcamentos.cliente_nome is
  'Nome do cliente COMO SAI NA PROPOSTA. Vazio = usa o nome do lead. Não mexe no cadastro do lead.';
comment on column public.orcamentos.aceito_em is
  'Quando o cliente marcou "li e aceito" na página pública. Vazio = ainda não aceitou.';
comment on column public.orcamentos.aceito_nome is
  'O nome que o cliente digitou ao aceitar. Registro de aceite, não assinatura digital.';

-- ── Conferência: as quatro colunas existem e estão vazias
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'orcamentos'
  and column_name in ('cliente_nome', 'aceito_em', 'aceito_nome', 'aceito_dispositivo')
order by column_name;
