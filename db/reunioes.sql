-- REUNIÕES POR VÍDEO COM VÁRIAS PESSOAS (escola, 08/10/2026)
--
-- Veio da JamRock (lá: setup-nucleo/90 a 93, de 29 e 30/09), juntado num script só. Só CRIA coisa
-- nova: três tabelas, duas colunas e a pasta das gravações. Não mexe em nenhuma tabela que já existe.
-- Pode rodar de novo sem estragar nada (tudo é "se não existir").
--
-- Como funciona: cada navegador se conecta com cada um dos outros (a sinalização vai pelo Realtime
-- do Supabase, sem tabela). Quem abre o link cai na sala de espera e só entra quando quem marcou
-- libera. Cada pessoa grava o próprio microfone em pedaços curtos (só com a IA ligada): a transcrição
-- sai com o nome certo de quem falou. Quem conduz vê sugestões ao vivo; no fim sai o resumo.
--
-- Diferença da JamRock: a escola não tem o gatilho set_org_id (o servidor sempre grava o org_id),
-- então ele não entra aqui. A proteção de linha usa o meu_org(), que existe no banco da escola.

CREATE TABLE IF NOT EXISTS public.reunioes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,
  codigo          text NOT NULL UNIQUE,
  chave_host      text NOT NULL,
  titulo          text NOT NULL,
  contexto        text,                 -- a pauta / a proposta: é o que a IA usa pra sugerir
  quando          timestamptz,
  lead_id         uuid,
  lead_nome       text,
  criado_por      uuid,
  criado_por_nome text,
  status          text NOT NULL DEFAULT 'marcada' CHECK (status IN ('marcada', 'em_andamento', 'encerrada', 'resumida', 'erro')),
  criado_em       timestamptz NOT NULL DEFAULT now(),
  iniciada_em     timestamptz,
  encerrada_em    timestamptz,
  sugestoes       jsonb,
  sugestoes_em    timestamptz,
  sugestoes_falas integer NOT NULL DEFAULT 0,
  resumo          jsonb,
  erro            text
);
CREATE INDEX IF NOT EXISTS reunioes_org_data ON public.reunioes (org_id, criado_em DESC);

-- a IA nasce desligada: quem conduz liga quando a conversa começa de verdade (sem custo antes disso)
ALTER TABLE public.reunioes ADD COLUMN IF NOT EXISTS ia_ouvindo boolean NOT NULL DEFAULT false;
-- texto opcional que troca o "Reunião com a <empresa>" da entrada, do link e do aviso de gravação
ALTER TABLE public.reunioes ADD COLUMN IF NOT EXISTS apresentacao text;

CREATE TABLE IF NOT EXISTS public.reuniao_pessoas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL,
  reuniao_id   uuid NOT NULL REFERENCES public.reunioes(id) ON DELETE CASCADE,
  nome         text NOT NULL,
  papel        text NOT NULL DEFAULT 'convidado' CHECK (papel IN ('host', 'convidado')),
  token        text NOT NULL,
  status       text NOT NULL DEFAULT 'esperando' CHECK (status IN ('esperando', 'dentro', 'recusada', 'saiu')),
  criado_em    timestamptz NOT NULL DEFAULT now(),
  liberada_em  timestamptz,
  visto_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reuniao_pessoas_reuniao ON public.reuniao_pessoas (reuniao_id, criado_em);

CREATE TABLE IF NOT EXISTS public.reuniao_falas (
  id          bigserial PRIMARY KEY,
  org_id      uuid NOT NULL,
  reuniao_id  uuid NOT NULL REFERENCES public.reunioes(id) ON DELETE CASCADE,
  pessoa_id   uuid,
  nome        text NOT NULL,
  em          timestamptz NOT NULL,
  texto       text NOT NULL,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reuniao_falas_reuniao ON public.reuniao_falas (reuniao_id, em);

-- o chat da reunião (ideia do Rick): todos escrevem e veem; entra na transcrição e no resumo
CREATE TABLE IF NOT EXISTS public.reuniao_mensagens (
  id          bigserial PRIMARY KEY,
  org_id      uuid NOT NULL,
  reuniao_id  uuid NOT NULL REFERENCES public.reunioes(id) ON DELETE CASCADE,
  pessoa_id   uuid,
  nome        text NOT NULL,
  texto       text NOT NULL,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reuniao_mensagens_reuniao ON public.reuniao_mensagens (reuniao_id, criado_em);

-- proteção de linha: quem lê e grava é o servidor (chave de serviço); o navegador não acessa direto
ALTER TABLE public.reunioes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_rw ON public.reunioes;
CREATE POLICY org_rw ON public.reunioes USING (org_id = meu_org()) WITH CHECK (org_id = meu_org());

ALTER TABLE public.reuniao_pessoas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_rw ON public.reuniao_pessoas;
CREATE POLICY org_rw ON public.reuniao_pessoas USING (org_id = meu_org()) WITH CHECK (org_id = meu_org());

ALTER TABLE public.reuniao_falas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_rw ON public.reuniao_falas;
CREATE POLICY org_rw ON public.reuniao_falas USING (org_id = meu_org()) WITH CHECK (org_id = meu_org());

ALTER TABLE public.reuniao_mensagens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_rw ON public.reuniao_mensagens;
CREATE POLICY org_rw ON public.reuniao_mensagens USING (org_id = meu_org()) WITH CHECK (org_id = meu_org());

-- as gravações: privadas; quem ouve pega um endereço assinado
INSERT INTO storage.buckets (id, name, public) VALUES ('reunioes', 'reunioes', false) ON CONFLICT (id) DO NOTHING;

-- conferência: deve mostrar 4 linhas (reunioes, reuniao_pessoas, reuniao_falas, reuniao_mensagens)
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'reuni%' ORDER BY 1;
