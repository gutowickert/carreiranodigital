-- CHAVE SÓ DE LEITURA pro CRM de cada cliente (teunegócio OS) — 06/11/2026.
-- NÃO APLICADO. Rodar no SQL Editor do Supabase DE CADA CLIENTE (Wood, Dani Fell, Gaja). A escola não precisa: a Maia mora no mesmo banco.
--
-- Por quê: hoje a gente lê os CRMs com a chave de serviço (pode tudo) ou com o login do Guto. Pra Maia ler todo dia,
-- o certo é uma chave que SÓ LÊ, e só as tabelas que o vigia usa. Se a chave vazar, ninguém apaga nem muda nada.
--
-- Depois de rodar: o Nando gera um token (JWT) assinado com o "JWT Secret" do projeto (Settings → API), com
--   { "role": "maia_leitura", "iss": "supabase", "exp": <daqui a 1 ano> }
-- e guarda na Vercel como MAIA_CRM_<CLIENTE>_LEITURA (e a URL em MAIA_CRM_<CLIENTE>_URL). Nunca em arquivo, nunca no banco.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'maia_leitura') THEN
    CREATE ROLE maia_leitura NOLOGIN NOINHERIT;
  END IF;
END $$;
GRANT maia_leitura TO authenticator;          -- deixa a API (PostgREST) assumir o papel quando o token pedir
GRANT USAGE ON SCHEMA public TO maia_leitura;

-- só SELECT, só nas tabelas que o vigia lê (as que não existirem nesse cliente são puladas)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['leads','etapas','motivos_perda','matriculas','lead_andamentos','wa_conversas','wa_mensagens',
                           'webhook_logs','orcamentos','orcamento_aberturas','tarefas_lead','produtos','lead_produtos',
                           'artes','pedidos_producao','agenda_eventos']
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT ON public.%I TO maia_leitura', t);
      -- as tabelas têm RLS ligada: uma policy só de leitura, só pra esse papel
      EXECUTE format('DROP POLICY IF EXISTS maia_leitura_select ON public.%I', t);
      EXECUTE format('CREATE POLICY maia_leitura_select ON public.%I FOR SELECT TO maia_leitura USING (true)', t);
    END IF;
  END LOOP;
END $$;

COMMIT;

-- Pra conferir que só lê (rodar com o token novo, de fora):
--   GET  /rest/v1/leads?select=id&limit=1   → 200
--   POST /rest/v1/leads                     → 401/403 (tem que falhar)
-- Pra cortar o acesso: REVOKE maia_leitura FROM authenticator;
