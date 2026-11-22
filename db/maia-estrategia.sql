-- Maia: o CICLO DE ESTRATÉGIA DE 15 DIAS (22/11/2026, lib/maia/estrategia.ts e lib/maia/sazonalidade.ts).
-- Uma tabela nova com o histórico das estratégias de cada negócio: o que a Maia propôs, os números e as datas do calendário
-- que pesaram, quem aprovou (equipe e dono) e, quando a quinzena seguinte começa, o resultado da quinzena dela.
-- Só o servidor acessa (chave de serviço): RLS ligada e sem policy, como as outras maia_*.
-- Pode rodar mais de uma vez (if not exists). Rodar no SQL Editor do Supabase do banco da Maia.
-- Enquanto não rodar: a Maia segue normal e a estratégia de 15 dias fica indisponível ("falta rodar o db/maia-estrategia.sql").
-- As datas próprias do negócio NÃO precisam de tabela: ficam em maia_negocios.contexto -> calendario -> datas.

create table if not exists maia_estrategias (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references maia_negocios(id) on delete cascade,
  ciclo_de date not null,                 -- a quinzena: dia 1 a 15, ou 16 ao fim do mês
  ciclo_ate date not null,
  motivo text not null default 'quinzena' check (motivo in ('inicial','quinzena','pedido')),
  status text not null default 'aprovar_equipe' check (status in ('aprovar_equipe','aprovar_dono','aprovada','substituida','cancelada')),
  texto text,                             -- o que vai pro WhatsApp do dono (a equipe pode editar antes)
  proposta jsonb not null default '{}',   -- as ações (estimular, pausar, testar oferta, produto de entrada, verba, data, recado) e os cuidados do ramo
  numeros jsonb,                          -- os números da quinzena anterior (gasto, conversas, custo por conversa, vendas, métrica secundária)
  sazonal jsonb not null default '{}',    -- as datas do calendário que pesaram e as do radar, com o dia em que o anúncio começa
  resultado jsonb,                        -- os números da própria quinzena (gravado quando a seguinte nasce)
  nota text,                              -- o ajuste que o dono pediu / observação da equipe
  criado_por text,
  editado_por text,
  wamid_dono text,                        -- a mensagem que foi pro dono (o 👍 em cima dela aprova)
  aprovado_equipe_por text,
  aprovado_equipe_em timestamptz,
  aprovado_dono_em timestamptz,
  aprovado_via text,                      -- whatsapp ou painel
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists maia_estrategias_negocio on maia_estrategias(negocio_id, criado_em desc);
create index if not exists maia_estrategias_status on maia_estrategias(status);
alter table maia_estrategias enable row level security;
