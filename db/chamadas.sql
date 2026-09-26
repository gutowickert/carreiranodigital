-- CHAMADAS POR VOZ (E VÍDEO) DENTRO DO SISTEMA (25/09/2026). Rode no SQL Editor. SÓ ACRESCENTA.
--
-- O Guto e os clientes do CRM mandam um link simples pro lead; abre no navegador do celular ou
-- do computador, sem instalar nada; a conversa é gravada e transcrita e cai no histórico do
-- lead (tabela ligacoes), o mesmo que a IA já lê. Sem assinatura: WebRTC ponto a ponto entre
-- os dois navegadores, sinalização pelo Realtime do Supabase, gravação feita pelo navegador
-- de quem convidou em pedaços de 30s pro Storage, transcrição no Deepgram.

CREATE TABLE IF NOT EXISTS public.chamadas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,
  codigo          text NOT NULL UNIQUE,          -- o que vai na URL: /call/<codigo>
  chave_host      text NOT NULL,                 -- quem convidou entra com ?h=<chave>; só ele grava e encerra
  lead_id         uuid,
  lead_nome       text,
  telefone        text,
  criado_por      uuid,                          -- usuarios_perfil.id de quem convidou
  criado_por_nome text,                          -- como o lead vê quem está do outro lado ("Guto")
  com_video       boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando', 'em_andamento', 'encerrada', 'transcrita', 'erro')),
  criado_em       timestamptz NOT NULL DEFAULT now(),
  iniciada_em     timestamptz,
  encerrada_em    timestamptz,
  duracao_seg     integer,
  pedacos         integer NOT NULL DEFAULT 0,    -- quantos pedaços de gravação chegaram
  gravacao_path   text,                          -- chamadas/<codigo>/gravacao.webm no Storage
  transcricao     text,
  ligacao_id      uuid,                          -- a linha em ligacoes que alimenta o histórico do lead
  erro            text
);
CREATE INDEX IF NOT EXISTS chamadas_lead ON public.chamadas (lead_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS chamadas_org_data ON public.chamadas (org_id, criado_em DESC);

-- o bucket da gravação: privado; quem ouve pega uma URL assinada
INSERT INTO storage.buckets (id, name, public) VALUES ('chamadas', 'chamadas', false) ON CONFLICT (id) DO NOTHING;
