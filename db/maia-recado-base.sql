-- Maia: o RECADO PRA BASE (14/11/2026). A mensagem ativa pros clientes de sempre de um negócio (lib/maia/recado.ts).
-- Três tabelas novas, todas com o negocio_id. Só o servidor acessa (chave de serviço): RLS ligada e sem policy, como as outras maia_*.
-- Pode rodar mais de uma vez (if not exists). Rodar no SQL Editor do Supabase do banco da Maia.
-- Enquanto não rodar: a Maia segue normal e o recado pra base fica indisponível ("falta rodar o db/maia-recado-base.sql").

-- 1) a base de contatos de cada negócio (quem recebe os recados)
create table if not exists maia_base (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references maia_negocios(id) on delete cascade,
  telefone text not null,                 -- 55 + DDD + número
  nome text,
  etiquetas text[] not null default '{}', -- ex.: {mega,lotofacil,bolao}
  optout boolean not null default false,  -- pediu pra não receber mais ("Não quero receber", SAIR)
  optout_em timestamptz,
  origem text not null default 'importado' check (origem in ('importado','dono','conversa')),
  ultimo_recado_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (negocio_id, telefone)
);
alter table maia_base add column if not exists ultimo_recado_em timestamptz;
create index if not exists maia_base_negocio on maia_base(negocio_id);

-- 2) cada recado (o texto, pra quem vai, a aprovação e os números)
create table if not exists maia_recados (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references maia_negocios(id) on delete cascade,
  titulo text,
  pedido text,                            -- o que o dono ou a equipe pediu
  texto text,                             -- o recado (vai depois de "Oi, Nome!")
  etiquetas_alvo text[] not null default '{}',   -- vazio = toda a base
  midia_id uuid references maia_midias(id) on delete set null,
  modelo_nome text,                       -- o modelo de MARKETING na Meta (maia_recado_...)
  modelo_status text,                     -- PENDING, APPROVED, REJECTED, ERRO
  modelo_motivo text,
  status text not null default 'rascunho' check (status in ('rascunho','aprovar_equipe','aprovar_dono','aguardando_meta','agendado','enviando','enviado','cancelado')),
  nota text,                              -- o ajuste pedido / aviso pra equipe
  criado_por text,
  wamid_dono text,                        -- a mensagem que foi pro dono aprovar (o 👍 em cima dela aprova)
  aprovado_equipe_por text,
  aprovado_equipe_em timestamptz,
  aprovado_dono_em timestamptz,
  agendado_para timestamptz,
  iniciado_em timestamptz,
  enviado_em timestamptz,
  custo_msg numeric,
  enviados int not null default 0,
  entregues int not null default 0,
  falhas int not null default 0,
  respostas int not null default 0,
  quero int not null default 0,
  saidas int not null default 0,
  pulados int not null default 0,         -- ficaram de fora pelo intervalo (1 a cada 3 dias, 2 por semana)
  vendas int not null default 0,
  valor_vendas numeric not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table maia_recados add column if not exists modelo_motivo text;
alter table maia_recados add column if not exists iniciado_em timestamptz;
alter table maia_recados add column if not exists pulados int not null default 0;
create index if not exists maia_recados_negocio on maia_recados(negocio_id, criado_em desc);
create index if not exists maia_recados_status on maia_recados(status);

-- 3) cada mensagem que saiu (o intervalo por contato, o "entregue" da Meta e a resposta ligada ao recado)
create table if not exists maia_recado_envios (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references maia_negocios(id) on delete cascade,
  recado_id uuid not null references maia_recados(id) on delete cascade,
  base_id uuid references maia_base(id) on delete set null,
  telefone text not null,                 -- vira "apagado-..." quando o contato pede pra apagar os dados (LGPD)
  como text,                              -- modelo, texto, imagem
  status text not null default 'enviado' check (status in ('enviado','entregue','lido','falhou')),
  wamid text,
  erro text,
  enviado_em timestamptz,
  respondeu_em timestamptz,
  quero_em timestamptz,
  saiu_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (recado_id, telefone)
);
create index if not exists maia_recado_envios_tel on maia_recado_envios(negocio_id, telefone, criado_em desc);
create index if not exists maia_recado_envios_quando on maia_recado_envios(negocio_id, enviado_em);
create index if not exists maia_recado_envios_wamid on maia_recado_envios(wamid) where wamid is not null;

alter table maia_base enable row level security;
alter table maia_recados enable row level security;
alter table maia_recado_envios enable row level security;

-- 4) o contato que respondeu o recado entra no funil com origem 'base' (antes disso o código grava 'outro')
alter table maia_leads drop constraint if exists maia_leads_origem_check;
alter table maia_leads add constraint maia_leads_origem_check check (origem in ('anuncio','organico','indicacao','dono','outro','instagram','facebook','base'));
