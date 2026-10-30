-- GRAVAÇÕES DE ENCONTROS, AULAS E REUNIÕES + "NOSSOS COMPROMISSOS" (escola, 29/10/2026)
--
-- Só CRIA coisa nova: três tabelas e a pasta privada dos áudios. Não mexe em nenhuma tabela que já existe.
-- Pode rodar de novo sem estragar nada (tudo é "se não existir").
--
-- Como funciona: o botão "Gravar" (ficha da entrega, agenda, turma, ou solto em /dashboard/gravacoes)
-- grava o microfone do PC em pedaços de 30 s, que sobem direto pra pasta "gravacoes". No "Finalizar",
-- o servidor junta os pedaços, transcreve (Deepgram, separando as vozes) e a IA preenche: o que foi
-- feito (registro do encontro), o próximo encontro, o que NÓS prometemos (compromissos), o que o cliente
-- ficou de fazer (pendências), outros compromissos com data, ideias de conteúdo e sinais (venda, risco).
-- A chave liga/desliga e o "aplicar sozinho" ficam em gravacao_config, por pessoa.

CREATE TABLE IF NOT EXISTS public.gravacoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,
  usuario_id      uuid,                 -- quem gravou (usuarios_perfil.id)
  contexto_tipo   text NOT NULL DEFAULT 'livre' CHECK (contexto_tipo IN ('encontro', 'agenda', 'turma', 'livre')),
  contexto_id     uuid,                 -- projeto_marcos.id / agenda_eventos.id / turmas.id
  projeto_id      uuid,
  titulo          text,
  status          text NOT NULL DEFAULT 'gravando' CHECK (status IN ('gravando', 'processando', 'pronta', 'aplicada', 'erro', 'descartada')),
  mime            text,
  partes          integer NOT NULL DEFAULT 0,
  duracao_s       integer,
  iniciada_em     timestamptz NOT NULL DEFAULT now(),
  finalizada_em   timestamptz,
  transcricao     text,
  analise         jsonb,                -- o que a IA entendeu
  aplicado        jsonb,                -- o que foi gravado no sistema a partir dela
  erro            text,
  apagar_audio_em timestamptz,          -- LGPD: o áudio some depois disso; fica só o texto
  audio_apagado   boolean NOT NULL DEFAULT false,
  criado_em       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gravacoes_org_data ON public.gravacoes (org_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS gravacoes_contexto ON public.gravacoes (contexto_tipo, contexto_id);

-- O QUE NÓS PROMETEMOS (o "te mando depois" dito em voz alta). Diferente de projeto_pendencias,
-- que é o que o CLIENTE nos deve.
CREATE TABLE IF NOT EXISTS public.compromissos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL,
  gravacao_id      uuid REFERENCES public.gravacoes(id) ON DELETE SET NULL,
  projeto_id       uuid,
  responsavel_id   uuid,                -- usuarios_perfil.id (Guto, Mateus...)
  descricao        text NOT NULL,
  trecho           text,                -- a frase da gravação de onde saiu
  prazo            date,
  pessoal          boolean NOT NULL DEFAULT false,
  status           text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'feito', 'cancelado')),
  agenda_evento_id uuid,                -- o lembrete que entrou na agenda
  criado_por       uuid,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  feito_em         timestamptz
);
CREATE INDEX IF NOT EXISTS compromissos_abertos ON public.compromissos (org_id, status, prazo);

CREATE TABLE IF NOT EXISTS public.gravacao_config (
  usuario_id      uuid PRIMARY KEY,
  org_id          uuid NOT NULL,
  ligado          boolean NOT NULL DEFAULT true,   -- a chave geral: desligado, ninguém grava nada
  aplicar_sozinho boolean NOT NULL DEFAULT true,   -- a IA já grava tudo no sistema (senão, espera o "Confirmar")
  apagar_audio_dias integer NOT NULL DEFAULT 60,
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gravacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compromissos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gravacao_config ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gravacoes' AND policyname = 'gravacoes_org') THEN
    CREATE POLICY gravacoes_org ON public.gravacoes FOR ALL USING (org_id = meu_org()) WITH CHECK (org_id = meu_org());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'compromissos' AND policyname = 'compromissos_org') THEN
    CREATE POLICY compromissos_org ON public.compromissos FOR ALL USING (org_id = meu_org()) WITH CHECK (org_id = meu_org());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gravacao_config' AND policyname = 'gravacao_config_org') THEN
    CREATE POLICY gravacao_config_org ON public.gravacao_config FOR ALL USING (org_id = meu_org()) WITH CHECK (org_id = meu_org());
  END IF;
END $$;

-- pasta privada dos áudios (o servidor lê com a chave de serviço; o navegador só sobe por link assinado)
INSERT INTO storage.buckets (id, name, public) VALUES ('gravacoes', 'gravacoes', false) ON CONFLICT (id) DO NOTHING;

SELECT 'gravacoes' t, count(*) FROM public.gravacoes UNION ALL SELECT 'compromissos', count(*) FROM public.compromissos UNION ALL SELECT 'gravacao_config', count(*) FROM public.gravacao_config;
