-- Maia: o LANÇAMENTO pra base da escola (15/11/2026). Quem aplica é o Guto, no editor SQL do Supabase.
-- Rodar no MESMO banco das outras tabelas maia_* (o painel /maia/operacao mostra qual: "banco da escola" ou "banco próprio").
--
-- O que este arquivo faz (só CRIA coisa nova, não mexe em nenhuma tabela que já existe):
--   1. maia_lanc_contatos: cada pessoa da lista do lançamento (é a "etiqueta maia" + o funil "Lançamento Maia", com as etapas
--      Na lista → Disparado → Quero ver → Coletando → Material recebido → Amostra em produção → Amostra entregue → Testou →
--      Fechamento (Rick) → Implantação marcada → Pago | Agora não | Perdido). Guarda as respostas da coleta, a amostra e os contadores.
--   2. maia_lanc_msgs: a conversa da Maia com cada pessoa (o que entrou e o que saiu pelo número da escola).
--   3. maia_lanc_midias: as fotos e vídeos que a pessoa mandou e as peças da amostra (arquivos no bucket "maia", que já existe).
-- Só o servidor lê e grava (chave de serviço): segurança ligada e sem regra de acesso, igual às outras tabelas maia_*.
-- Pra desfazer: drop table maia_lanc_msgs, maia_lanc_midias, maia_lanc_contatos;

create table if not exists maia_lanc_contatos (
  id uuid primary key default gen_random_uuid(),
  telefone text not null unique,                 -- só dígitos com 55 (como veio na lista)
  wa_id text,                                    -- o número como a Meta manda (às vezes sem o 9): as respostas vão pra ele
  nome text,                                     -- primeiro nome (a variável {{1}} do modelo)
  nome_crm text,
  versao text not null default 'contato' check (versao in ('aluno','contato')),
  remessa int,
  posicao int,
  nota int,
  ramo text,
  cidade text,
  motivo text,                                   -- por que entrou na lista (a nota)
  ids_crm text,
  etapa text not null default 'na_lista' check (etapa in ('na_lista','disparado','quero_ver','coletando','material_recebido','em_producao',
    'amostra_entregue','testou','fechamento','implantacao_marcada','pago','agora_nao','perdido')),
  motivo_perda text,
  coleta jsonb not null default '{}'::jsonb,     -- as respostas: negócio, cidade, produtos com preço, como vende, o que mais vende, dificuldade, Instagram, hora
  estado jsonb not null default '{}'::jsonb,     -- a conversa: passo, modo teste, retomadas, dúvida pro time
  amostra jsonb not null default '{}'::jsonb,    -- as peças escolhidas (2 anúncios + 1 vídeo), a conversa pronta, quem aprovou
  token text unique,                             -- o link público da página da amostra
  entrega_em timestamptz,                        -- a hora combinada da entrega
  entregue_em timestamptz,
  aberturas int not null default 0,
  aberta_em timestamptz,
  testou_em timestamptz,
  rick_pendente_em timestamptz,                  -- fila "Rick: mandar áudio"
  rick_feito_em timestamptz,
  disparado_em timestamptz,
  ultima_entrada_em timestamptz,                 -- a última mensagem da pessoa (a janela de 24 h)
  ultima_saida_em timestamptz,
  negocio_id uuid,                               -- o negócio de apoio da oficina (maia_negocios), quando a equipe pede pra oficina gerar
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists maia_lanc_contatos_etapa on maia_lanc_contatos(etapa);
create index if not exists maia_lanc_contatos_wa on maia_lanc_contatos(wa_id);

create table if not exists maia_lanc_msgs (
  id uuid primary key default gen_random_uuid(),
  contato_id uuid not null references maia_lanc_contatos(id) on delete cascade,
  direcao text not null check (direcao in ('entrada','saida')),
  autor text not null default 'contato',         -- contato | maia | equipe | sistema
  tipo text not null default 'texto',            -- texto | imagem | video | audio | botao | modelo | outro
  texto text,
  midia_id text,                                 -- o id da mídia na Meta (entrada), baixada depois pro armazenamento
  mime text,
  wamid text,
  processado boolean not null default false,
  ok boolean,
  erro text,
  criado_em timestamptz not null default now()
);
create index if not exists maia_lanc_msgs_contato on maia_lanc_msgs(contato_id, criado_em);

create table if not exists maia_lanc_midias (
  id uuid primary key default gen_random_uuid(),
  contato_id uuid not null references maia_lanc_contatos(id) on delete cascade,
  tipo text not null check (tipo in ('foto','video')),
  origem text not null default 'contato',        -- contato (o material) | equipe (peça que a equipe subiu) | oficina
  path text not null,                            -- caminho no bucket "maia" (lanc-<id>/midias/... ou lanc-<id>/pecas/...)
  mime text,
  criado_em timestamptz not null default now()
);
create index if not exists maia_lanc_midias_contato on maia_lanc_midias(contato_id);

alter table maia_lanc_contatos enable row level security;
alter table maia_lanc_msgs enable row level security;
alter table maia_lanc_midias enable row level security;
