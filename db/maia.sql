-- Maia: a agência inteira numa IA, pra vários negócios num sistema só (03/11/2026).
-- Cada linha leva o negocio_id. Só o servidor acessa (chave de serviço): RLS ligada e sem policy, como as tabelas oito_*.
-- NÃO APLICADO. Rodar no SQL Editor do Supabase só depois do sim do Guto.

create table if not exists maia_negocios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  nicho text,
  cidade text,
  regiao text,                       -- como vai no gancho: "Lajeado e região"
  dono_nome text,
  dono_whatsapp text unique,         -- é por ele que a Maia reconhece o dono no WhatsApp dela
  equipe_whatsapp text[] default '{}',  -- outras pessoas do negócio que também falam com a Maia
  plano text default 'essencial' check (plano in ('essencial','completa')),
  status text default 'implantacao' check (status in ('implantacao','ativo','pausado','cancelado')),
  contexto jsonb default '{}',       -- o que ela sabe do negócio (serviços, preços, público, tom, horário, perguntas...)
  marca jsonb default '{}',          -- cores, fontes, logo_path
  meta jsonb default '{}',           -- ad_account_id, page_id, ig_id
  verba_dia numeric,                 -- quanto o dono topou investir por dia (reais)
  wa_phone_id text,                  -- o WhatsApp do próprio negócio, quando o Tech Provider liberar
  aprovacao_equipe boolean default true,  -- tudo que ela gera passa pela equipe antes de ir pro dono
  ativa_sozinha boolean default false,    -- campanha liga com o 👍 do dono, sem a equipe (desligado até o Guto confiar)
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

-- fotos e vídeos curtos que o dono manda pelo WhatsApp
create table if not exists maia_midias (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references maia_negocios(id) on delete cascade,
  tipo text not null check (tipo in ('foto','video','logo','audio')),
  path text not null,                -- no storage (pasta maia/)
  mime text,
  legenda text,                      -- o que o dono escreveu junto
  descricao text,                    -- o que a Maia viu na foto
  duracao numeric,
  usos int default 0,
  criado_em timestamptz default now()
);
create index if not exists maia_midias_neg on maia_midias(negocio_id, criado_em desc);

-- tudo que a Maia gera: anúncio, post, vídeo editado, relatório. Caminho: equipe → dono → no ar
create table if not exists maia_pecas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references maia_negocios(id) on delete cascade,
  tipo text not null check (tipo in ('anuncio_imagem','anuncio_video','post','video','relatorio','texto')),
  status text not null default 'gerando' check (status in ('gerando','revisao_equipe','ajuste_equipe','com_dono','ajuste_dono','aprovada','no_ar','descartada','erro')),
  titulo text,
  gancho text,                       -- a frase de cima (região + público)
  texto text,                        -- a legenda / o texto do anúncio / o relatório
  cta text,
  midia_ids uuid[] default '{}',     -- as fotos e vídeos do dono usados
  arquivo_path text,                 -- a arte ou o vídeo pronto
  versao int default 1,
  nota_equipe text,
  nota_dono text,
  aprovado_equipe_por text,
  aprovado_equipe_em timestamptz,
  enviado_dono_em timestamptz,
  aprovado_dono_em timestamptz,
  wamid_envio text,                  -- a mensagem em que foi pro dono (o 👍 em cima dela aprova)
  campanha_id uuid,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);
create index if not exists maia_pecas_status on maia_pecas(status, criado_em);
create index if not exists maia_pecas_neg on maia_pecas(negocio_id, criado_em desc);

create table if not exists maia_campanhas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references maia_negocios(id) on delete cascade,
  nome text,
  status text default 'rascunho' check (status in ('rascunho','criada_pausada','ativa','pausada','encerrada','erro')),
  verba_dia numeric,
  publico jsonb default '{}',        -- cidade, raio, idade
  peca_ids uuid[] default '{}',
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_ids text[] default '{}',
  simulada boolean default true,     -- true = não foi pra Meta (teste)
  erro text,
  ativada_por text,
  ativada_em timestamptz,
  criado_em timestamptz default now()
);

-- o funil de vendas de cada negócio
create table if not exists maia_leads (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references maia_negocios(id) on delete cascade,
  telefone text,
  nome text,
  origem text default 'anuncio' check (origem in ('anuncio','organico','indicacao','dono','outro')),
  anuncio_ref text,                  -- id do anúncio na Meta (CTWA) ou da peça
  etapa text default 'novo' check (etapa in ('novo','conversando','interessado','proposta','ganho','perdido')),
  produto text,
  valor numeric,
  motivo_perda text,
  resumo text,
  followups int default 0,
  proximo_followup_em timestamptz,
  ultimo_contato_em timestamptz,
  ganho_em timestamptz,
  perdido_em timestamptz,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now(),
  unique (negocio_id, telefone)
);
create index if not exists maia_leads_follow on maia_leads(proximo_followup_em) where proximo_followup_em is not null;

create table if not exists maia_lead_eventos (
  id bigserial primary key,
  negocio_id uuid not null references maia_negocios(id) on delete cascade,
  lead_id uuid references maia_leads(id) on delete cascade,
  tipo text not null,                -- criado, etapa, ganho, perdido, followup, nota
  de text, para text, valor numeric,
  autor text,                        -- maia, dono, equipe
  detalhe jsonb default '{}',
  criado_em timestamptz default now()
);

-- conversas no WhatsApp: com o dono (canal 'dono') e, depois do Tech Provider, com os clientes do negócio (canal 'cliente')
create table if not exists maia_conversas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references maia_negocios(id) on delete cascade,
  canal text not null check (canal in ('dono','cliente')),
  telefone text not null,
  nome text,
  lead_id uuid references maia_leads(id) on delete set null,
  modo text default 'ia' check (modo in ('ia','humano')),
  janela_ate timestamptz,
  ultima_msg text,
  ultima_msg_em timestamptz,
  nao_lidas int default 0,
  ia_respostas int default 0,
  simulada boolean default false,
  criado_em timestamptz default now(),
  unique (negocio_id, canal, telefone)
);

create table if not exists maia_msgs (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references maia_conversas(id) on delete cascade,
  negocio_id uuid not null,
  autor text not null check (autor in ('dono','cliente','maia','equipe','sistema')),
  tipo text default 'texto',
  texto text,
  midia_id uuid,
  wamid text unique,
  status text,
  criado_em timestamptz default now()
);
create index if not exists maia_msgs_cv on maia_msgs(conversa_id, criado_em);

-- fila do que precisa de máquina (arte, vídeo) e do que roda depois (relatório, follow-up)
create table if not exists maia_tarefas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid references maia_negocios(id) on delete cascade,
  tipo text not null check (tipo in ('arte','video','gerar_pecas','relatorio')),
  status text default 'fila' check (status in ('fila','rodando','feito','erro')),
  peca_id uuid,
  dados jsonb default '{}',
  resultado jsonb default '{}',
  tentativas int default 0,
  pego_em timestamptz,
  criado_em timestamptz default now()
);
create index if not exists maia_tarefas_fila on maia_tarefas(status, criado_em);

-- números da Meta por dia, por negócio (o sincronizador grava)
create table if not exists maia_metricas_dia (
  negocio_id uuid not null references maia_negocios(id) on delete cascade,
  dia date not null,
  gasto numeric default 0,
  impressoes int default 0,
  alcance int default 0,
  conversas_iniciadas int default 0,
  cliques int default 0,
  primary key (negocio_id, dia)
);

create table if not exists maia_eventos (
  id bigserial primary key,
  negocio_id uuid,
  tipo text not null,
  detalhe jsonb default '{}',
  criado_em timestamptz default now()
);

alter table maia_negocios enable row level security;
alter table maia_midias enable row level security;
alter table maia_pecas enable row level security;
alter table maia_campanhas enable row level security;
alter table maia_leads enable row level security;
alter table maia_lead_eventos enable row level security;
alter table maia_conversas enable row level security;
alter table maia_msgs enable row level security;
alter table maia_tarefas enable row level security;
alter table maia_metricas_dia enable row level security;
alter table maia_eventos enable row level security;

-- arquivos: criar o bucket privado "maia" no Storage (fotos, vídeos e peças prontas).
