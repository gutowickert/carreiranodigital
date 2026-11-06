-- MAIA GESTORA (06/11/2026): a Maia vigia os clientes que já usam o teunegócio OS (escola, Wood, Dani Fell, Gaja)
-- e manda os avisos do dia e o resumo da semana pro dono.
-- NÃO APLICADO. Quem aplica é o Guto/Nando, no SQL Editor do Supabase da escola (o mesmo banco das tabelas maia_*).
-- SÓ ACRESCENTA: nenhuma tabela ou coluna existente muda de comportamento. RLS ligada e sem policy (só o servidor lê), como as maia_*.

BEGIN;

-- 1 · o negócio pode ser só "gerido": a Maia lê o CRM dele (teunegócio OS) e a conta de anúncio, e não atende os clientes dele
ALTER TABLE maia_negocios DROP CONSTRAINT IF EXISTS maia_negocios_plano_check;
ALTER TABLE maia_negocios ADD CONSTRAINT maia_negocios_plano_check CHECK (plano IN ('essencial','completa','gestao'));

-- de onde a Maia lê o CRM. NUNCA a chave aqui: só o NOME da variável de ambiente que guarda a chave de leitura.
--   {"tipo":"teunegocio","mesmo_banco":true}                                     → a escola (o CRM está neste banco)
--   {"tipo":"teunegocio","url_env":"MAIA_CRM_DANI_URL","chave_env":"MAIA_CRM_DANI_LEITURA"}
-- e as regras do funil daquele negócio (que etapa é "quente", qual etapa já é paga):
--   {"etapas_quentes":{"aguardando_pagamento":"aguardando pagamento"},"etapas_pagas":["lote_preco_ok"],"valor_etapa_paga":200,"saude":true,"conta_prepaga":true}
ALTER TABLE maia_negocios ADD COLUMN IF NOT EXISTS crm jsonb DEFAULT '{}';
ALTER TABLE maia_negocios ADD COLUMN IF NOT EXISTS gestora jsonb DEFAULT '{}';
-- o projeto de tráfego (tabela projetos) do mesmo cliente: daí sai o gasto por anúncio por dia (trafego_anuncios_dia), que a rotina já grava
ALTER TABLE maia_negocios ADD COLUMN IF NOT EXISTS projeto_id uuid REFERENCES public.projetos(id) ON DELETE SET NULL;

-- 2 · os avisos: um por problema por dia (a chave impede mandar o mesmo aviso duas vezes)
CREATE TABLE IF NOT EXISTS maia_avisos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id    uuid NOT NULL REFERENCES maia_negocios(id) ON DELETE CASCADE,
  dia           date NOT NULL,
  tipo          text NOT NULL,      -- gasto_sem_conversa, parou_de_gastar, custo_subiu, rascunho, quente_parado, resposta_lenta,
                                    -- sem_resposta, promessa_sem_volta, pedido_grande_parado, capi_falhando, venda_fora_do_card,
                                    -- etapa_paga_sem_venda, proposta_aberta, conversa_que_nao_vende, anuncio_queimando
  nivel         text NOT NULL CHECK (nivel IN ('urgente','atencao','info')),
  titulo        text NOT NULL,
  texto         text,
  acao          text,
  numeros       jsonb DEFAULT '{}',
  lead_ids      uuid[] DEFAULT '{}', -- os leads do CRM do cliente (ids de lá). Nome NÃO é guardado aqui: a tela busca na hora
  status        text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','revisao_equipe','enviado','resolvido','ignorado')),
  enviado_em    timestamptz,
  wamid_envio   text,
  resolvido_em  timestamptz,
  util          boolean,             -- o Guto/dono marca se o aviso ajudou (é assim que a gente calibra os limites)
  criado_em     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (negocio_id, dia, tipo)
);
CREATE INDEX IF NOT EXISTS maia_avisos_neg_dia ON maia_avisos (negocio_id, dia DESC);
CREATE INDEX IF NOT EXISTS maia_avisos_status ON maia_avisos (status, criado_em);

-- 3 · a foto do CRM de cada dia (pra comparar semana com semana sem reler tudo)
CREATE TABLE IF NOT EXISTS maia_crm_dia (
  negocio_id            uuid NOT NULL REFERENCES maia_negocios(id) ON DELETE CASCADE,
  dia                   date NOT NULL,
  leads_novos           int DEFAULT 0,
  leads_de_anuncio      int DEFAULT 0,
  vendas                int DEFAULT 0,
  vendas_de_anuncio     int DEFAULT 0,
  receita               numeric DEFAULT 0,
  quentes_parados       int DEFAULT 0,
  primeira_resposta_min numeric,
  sem_resposta          int DEFAULT 0,
  capi_erros            int DEFAULT 0,
  PRIMARY KEY (negocio_id, dia)
);

-- 4 · o funil por anúncio, fechado toda segunda (gasto da Meta + o que o CRM diz que virou venda)
CREATE TABLE IF NOT EXISTS maia_funil_semana (
  negocio_id     uuid NOT NULL REFERENCES maia_negocios(id) ON DELETE CASCADE,
  semana         date NOT NULL,      -- a segunda-feira
  ad_id          text NOT NULL,
  ad_nome        text,
  gasto          numeric DEFAULT 0,
  conversas_meta int DEFAULT 0,
  contatos_crm   int DEFAULT 0,
  vendas         int DEFAULT 0,
  receita        numeric DEFAULT 0,
  quentes        int DEFAULT 0,
  PRIMARY KEY (negocio_id, semana, ad_id)
);

ALTER TABLE maia_avisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE maia_crm_dia ENABLE ROW LEVEL SECURITY;
ALTER TABLE maia_funil_semana ENABLE ROW LEVEL SECURITY;

COMMIT;

-- 5 · os 4 primeiros (rodar DEPOIS, trocando os telefones; status 'implantacao' = nada vai pro dono ainda)
-- insert into maia_negocios (nome, nicho, cidade, plano, status, dono_nome, dono_whatsapp, meta, crm, gestora, projeto_id) values
--  ('Escola Carreira no Digital','educação','Lajeado','gestao','implantacao','Guto','55...', '{"ad_account_id":"1294787635603943"}', '{"tipo":"teunegocio","mesmo_banco":true}', '{"etapas_quentes":{"ligacao_boa":"proposta enviada","lote_preco_ok":"urgência enviada","aguardando_pagamento":"aguardando pagamento"},"conta_prepaga":true}', null),
--  ('Wood','gravação a laser','Arroio do Meio','gestao','implantacao','Anderson','55...', '{"ad_account_id":"2047099432524113"}', '{"tipo":"teunegocio","url_env":"MAIA_CRM_WOOD_URL","chave_env":"MAIA_CRM_WOOD_LEITURA"}', '{"etapas_quentes":{"arte_enviada":"arte enviada","ajuste_arte":"ajuste de arte","aguardando_pagamento":"aprovou a arte, falta pagar"},"preco_unidade_pedido_grande":31}', 'a4798bb4-7e1f-45e6-9735-9472ec1a576d'),
--  ('Espaço Dani Fell','estética','Estrela','gestao','implantacao','Dani','55...', '{"ad_account_id":"700074957222765"}', '{"tipo":"teunegocio","url_env":"MAIA_CRM_DANI_URL","chave_env":"MAIA_CRM_DANI_LEITURA"}', '{"saude":true,"etapas_quentes":{"lote_preco_ok":"pensando (já fez a avaliação)","nao_compareceu":"faltou na avaliação"},"etapas_pagas":["lote_preco_ok"],"valor_etapa_paga":200}', '31f4df9a-43ca-4d94-90db-9f7a47c86569'),
--  ('Gaja Seguros','seguros','Lajeado','gestao','implantacao','Jhones','55...', '{"ad_account_id":"2194662637340244"}', '{"tipo":"teunegocio","url_env":"MAIA_CRM_GAJA_URL","chave_env":"MAIA_CRM_GAJA_LEITURA"}', '{"etapas_quentes":{"aguardando_dados":"aguardando dados","lote_preco_ok":"cotação enviada","oferecer_bolsa":"negociação","aguardando_pagamento":"fechado, emitindo"}}', '505f4f7a-2a42-4e38-a9cc-8c0ec1481c88');
