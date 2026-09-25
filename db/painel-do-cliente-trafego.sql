-- PAINEL DO CLIENTE: O TRÁFEGO POR ANÚNCIO, GUARDADO TODO DIA (25/09/2026).
-- Rode no SQL Editor do Supabase. SÓ ACRESCENTA. Nada que existe muda de comportamento.
--
-- O QUE FALTAVA
--
-- A área do cliente (/cliente?k=...) lê o TOTAL da conta de anúncio, ao vivo, a cada abertura.
-- Não sabe qual anúncio trouxe o quê. Por isso não responde a pergunta que o dono faz:
-- "qual anúncio está funcionando?". E como é tudo ao vivo, cada abertura são 4 chamadas na
-- Meta por cliente. Descendo pra anúncio isso viraria dezenas, e a tela ia travar.
--
-- A SAÍDA
--
-- Uma rotina diária lê a Meta por anúncio e por dia e grava aqui. A tela lê do banco:
-- rápida, sem limite de API, e com histórico que a Meta não devolve depois (anúncio
-- apagado some do gerenciador; aqui fica).

BEGIN;

-- ─────────────────────────────────────────────── 1 · o que um cliente novo vale
--
-- R$ 5,88 por conversa não significa nada sozinho. Pra Dani, com pacote de tratamento, é
-- barato. Pra uma ótica com ticket de R$ 400, depende. É UM número, perguntado na
-- implantação, que transforma o painel de métricas num placar de dinheiro: quantos clientes
-- o investimento precisa trazer pra se pagar.

ALTER TABLE public.projetos ADD COLUMN IF NOT EXISTS valor_cliente numeric;
COMMENT ON COLUMN public.projetos.valor_cliente IS
  'Quanto vale um cliente novo pro negócio (ticket médio ou valor do pacote), em R$. Perguntado na implantação. É o que dá sentido ao custo por conversa.';

-- O custo por resultado que a escola considera BOM pra esse cliente. Com ele a análise escrita
-- sabe dizer "abaixo do alvo" em vez de só "subiu / desceu".
ALTER TABLE public.projetos ADD COLUMN IF NOT EXISTS alvo_custo_resultado numeric;
COMMENT ON COLUMN public.projetos.alvo_custo_resultado IS
  'Custo por conversa (ou lead) que a escola considera bom pra esse cliente, em R$. Sem ele, a análise só compara com o período anterior.';

-- ─────────────────────────────────────────────── 2 · a foto diária de cada anúncio
--
-- Uma linha por anúncio por dia. `resultados` é o número que importa pro objetivo daquela
-- campanha (conversa no WhatsApp, lead no formulário, compra) e `tipo_resultado` diz qual é,
-- porque o painel fala na língua do dono: "pessoas que te chamaram", não "conversas iniciadas".

CREATE TABLE IF NOT EXISTS public.trafego_anuncios_dia (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,
  projeto_id      uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  ad_account_id   text NOT NULL,
  data            date NOT NULL,
  campaign_id     text,
  campaign_name   text,
  adset_id        text,
  adset_name      text,
  ad_id           text NOT NULL,
  ad_name         text,
  objective       text,
  gasto           numeric NOT NULL DEFAULT 0,        -- como a Meta mostra, SEM imposto (o imposto entra na leitura)
  impressoes      integer NOT NULL DEFAULT 0,
  alcance         integer NOT NULL DEFAULT 0,
  cliques         integer NOT NULL DEFAULT 0,
  conversas       integer NOT NULL DEFAULT 0,        -- WhatsApp: conversas iniciadas
  leads           integer NOT NULL DEFAULT 0,        -- formulário / site
  compras         integer NOT NULL DEFAULT 0,
  resultados      integer NOT NULL DEFAULT 0,        -- o que vale pro objetivo da campanha
  tipo_resultado  text NOT NULL DEFAULT 'conversa' CHECK (tipo_resultado IN ('conversa', 'lead', 'compra')),
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (projeto_id, ad_id, data)
);
CREATE INDEX IF NOT EXISTS trafego_anuncios_dia_projeto_data ON public.trafego_anuncios_dia (projeto_id, data);
COMMENT ON TABLE public.trafego_anuncios_dia IS
  'Foto diária de cada anúncio das contas dos clientes, gravada pela rotina /api/projetos/trafego/sync. A área do cliente lê daqui, não da Meta.';

-- ─────────────────────────────────────────────── 3 · o anúncio em si (nome, imagem, estado)
--
-- Separado do dia porque muda pouco e a imagem do criativo é o que faz o dono reconhecer
-- "ah, aquele anúncio". `visto_em` é a última vez que a Meta devolveu esse anúncio: se parou
-- de vir, foi apagado no gerenciador, e aqui a história dele continua.

CREATE TABLE IF NOT EXISTS public.trafego_anuncios (
  projeto_id      uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  ad_id           text NOT NULL,
  org_id          uuid NOT NULL,
  ad_name         text,
  campaign_name   text,
  adset_name      text,
  objective       text,
  status          text,                                -- ACTIVE, PAUSED, CAMPAIGN_PAUSED, ADSET_PAUSED, ARCHIVED...
  imagem_url      text,                                -- thumbnail do criativo (URL da Meta, expira, a rotina renova)
  primeiro_dia    date,                                -- primeiro dia com gasto: "quando esse anúncio nasceu"
  visto_em        timestamptz NOT NULL DEFAULT now(),
  criado_em       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (projeto_id, ad_id)
);

-- ─────────────────────────────────────────────── 4 · o que a gente fez
--
-- O bloco que ninguém constrói e que segura o contrato: se a tela só mostra número, no mês 3
-- o cliente pergunta pelo que está pagando. A rotina detecta sozinha: anúncio que apareceu pela
-- primeira vez (criado), anúncio que era ativo e virou pausado (pausado), e o contrário
-- (reativado). Quem quiser pode registrar à mão um ajuste que a Meta não mostra (troca de
-- público, mudança de verba).

CREATE TABLE IF NOT EXISTS public.trafego_eventos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,
  projeto_id      uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  data            date NOT NULL,
  tipo            text NOT NULL CHECK (tipo IN ('anuncio_criado', 'anuncio_pausado', 'anuncio_reativado', 'ajuste')),
  ad_id           text,
  titulo          text NOT NULL,
  descricao       text,
  autor           text NOT NULL DEFAULT 'sistema',
  criado_em       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (projeto_id, data, tipo, ad_id)
);
CREATE INDEX IF NOT EXISTS trafego_eventos_projeto_data ON public.trafego_eventos (projeto_id, data DESC);

-- ─────────────────────────────────────────────── 5 · o placar (as conquistas)
--
-- Gamificação que não é medalha decorativa: cada conquista destrava com DADO REAL da Meta ou do
-- placar, avaliada pela rotina diária. Primeira campanha no ar, primeiras 10 conversas, mil
-- pessoas da cidade alcançadas, custo abaixo do alvo, melhor mês até agora. Como destrava
-- sozinha, o cliente volta na tela pra ver se destravou.
--
-- `valor` guarda o número do momento (ex.: 131 conversas) pra frase da conquista não envelhecer.
-- `melhor_mes` pode destravar de novo: por isso a chave inclui o mês em `referencia`.

CREATE TABLE IF NOT EXISTS public.projeto_conquistas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,
  projeto_id      uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  chave           text NOT NULL,                       -- primeira_campanha, conversas_10, alcance_1000, custo_no_alvo, melhor_mes, primeira_venda...
  referencia      text NOT NULL DEFAULT '',            -- ex.: o mês, quando a conquista é mensal
  titulo          text NOT NULL,
  descricao       text,
  valor           numeric,
  destravada_em   date NOT NULL,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (projeto_id, chave, referencia)
);

COMMIT;
