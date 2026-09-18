-- Orçamentos gerados a partir da conversa com o lead (ligação transcrita e/ou WhatsApp).
-- A IA escreve só a capa e as objeções; o resto da proposta é modelo fixo no código.
-- Rode no SQL Editor do Supabase. Não altera nenhuma tabela existente.
--
-- POR QUE O PREÇO É COPIADO PRA CÁ, e não lido de `produtos` na hora de abrir:
-- proposta enviada é documento. Se o preço do produto subir semana que vem, a proposta que o
-- cliente tem na mão não pode mudar sozinha. O valor é copiado do cadastro no momento da geração.
--
-- ACESSO: proteção de linha LIGADA e nenhuma regra, de propósito — igual ao que a escola faz nas
-- tabelas que só as rotas tocam. O navegador (chave pública) não lê nem escreve; quem lê e grava é
-- /api/orcamentos/*, com a chave de serviço, depois de conferir o login. A página pública da
-- proposta também passa pela rota, então o link aberto não expõe a tabela.

create table if not exists public.orcamentos (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null,
  lead_id           uuid not null,

  -- o que foi ofertado, congelado no momento da geração
  produto_id        uuid,
  produto_nome      text,
  preco_vista       numeric(12,2),
  preco_parcelado   numeric(12,2),
  parcelas          int,
  validade_dias     int not null default 15,

  -- o que o vendedor preencheu na tela (o que a IA não tem como saber)
  contexto          jsonb not null default '{}'::jsonb,   -- { o_que_vende, regiao }
  -- de onde a IA leu: { ligacoes: [id], conversas: [id], mensagens: n, caracteres: n }
  fontes            jsonb not null default '{}'::jsonb,

  -- o que a IA escreveu e o que o vendedor editou por cima
  capa              jsonb not null default '{}'::jsonb,   -- { titulo, subtitulo }
  objecoes          jsonb not null default '[]'::jsonb,   -- [{ ordem, titulo, citacao, texto_ia, texto_final, situacao }]
  editado_por       uuid,
  editado_em        timestamptz,

  -- situação e endereço público
  situacao          text not null default 'rascunho',     -- rascunho | publicado | cancelado
  slug              text,                                  -- endereço público, criado ao publicar
  publicado_em      timestamptz,

  -- custo da geração (o mesmo número que aparece em Custo da IA)
  modelo            text,
  tokens_entrada    int,
  tokens_saida      int,
  custo_usd         numeric(10,6),

  criado_por        uuid,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

create index if not exists orcamentos_lead_idx on public.orcamentos (org_id, lead_id, criado_em desc);
create index if not exists orcamentos_situacao_idx on public.orcamentos (org_id, situacao, criado_em desc);
create unique index if not exists orcamentos_slug_idx on public.orcamentos (slug) where slug is not null;

-- Cada vez que o cliente abre o link. É daqui que sai o "✓ Abriu a proposta" no card do lead.
-- Uma linha por abertura; a tela mostra a contagem e a última.
create table if not exists public.orcamento_aberturas (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  orcamento_id  uuid not null references public.orcamentos (id) on delete cascade,
  criado_em     timestamptz not null default now(),
  dispositivo   text,          -- celular | computador (do cabeçalho do navegador)
  referencia    text           -- de onde veio o clique, quando o navegador informa
);

create index if not exists orcamento_aberturas_idx on public.orcamento_aberturas (orcamento_id, criado_em desc);

alter table public.orcamentos enable row level security;
alter table public.orcamento_aberturas enable row level security;

-- ── Conferência: as duas tabelas existem, protegidas e sem regra ───────────────
select c.relname as tabela,
       c.relrowsecurity as protecao_ligada,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as regras
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname in ('orcamentos', 'orcamento_aberturas')
 order by c.relname;
