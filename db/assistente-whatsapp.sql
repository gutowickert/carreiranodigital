-- O ASSISTENTE DO TIME NO WHATSAPP (25/09/2026).
-- Rode no SQL Editor do Supabase. SÓ ACRESCENTA.
--
-- O Guto (e depois Nando e Rick) fala com o sistema pelo mesmo número oficial da escola:
-- recebe a agenda de manhã, pergunta qualquer coisa, manda por áudio "marca reunião quinta
-- às 14h" e o sistema grava. Duas exigências:
--
-- 1. O QUE ELE MANDA NÃO PODE VIRAR LEAD nem cair na caixa de entrada do time. Hoje o webhook
--    trata toda mensagem que chega como cliente. Por isso o número dele fica em
--    usuarios_perfil, e o webhook desvia ANTES de criar lead/conversa.
-- 2. A conversa dele com o assistente fica numa tabela própria (assistente_mensagens), não em
--    wa_conversas/wa_mensagens, que é o que a caixa do time lê.

BEGIN;

ALTER TABLE public.usuarios_perfil ADD COLUMN IF NOT EXISTS whatsapp text;
COMMENT ON COLUMN public.usuarios_perfil.whatsapp IS
  'WhatsApp pessoal de quem é do time. Mensagem vinda desse número vai pro assistente, nunca vira lead.';

-- a janela de 24h: a Meta só aceita texto livre nas 24h após a ÚLTIMA mensagem da pessoa.
-- Guardando quando ela escreveu por último, o sistema decide sozinho: livre ou template.
ALTER TABLE public.usuarios_perfil ADD COLUMN IF NOT EXISTS assistente_ultima_msg_em timestamptz;
ALTER TABLE public.usuarios_perfil ADD COLUMN IF NOT EXISTS assistente_bom_dia boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.usuarios_perfil.assistente_bom_dia IS 'Recebe a agenda do dia de manhã pelo WhatsApp.';

CREATE TABLE IF NOT EXISTS public.assistente_mensagens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL,
  usuario_id  uuid NOT NULL REFERENCES public.usuarios_perfil(id) ON DELETE CASCADE,
  papel       text NOT NULL CHECK (papel IN ('usuario', 'assistente', 'sistema')),
  texto       text NOT NULL,
  wamid       text UNIQUE,                 -- id da mensagem na Meta: o webhook reenvia, e isso evita responder duas vezes
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assistente_mensagens_usuario_data ON public.assistente_mensagens (usuario_id, criado_em DESC);

-- o Guto
UPDATE public.usuarios_perfil SET whatsapp = '5551981260653', assistente_bom_dia = true
 WHERE lower(email) = 'guto.wickert@gmail.com';

COMMIT;

-- ─────────────────────────────────────────────── apelido (25/09, depois do primeiro teste)
-- O cadastro diz "Luis Augusto Wickert" e o assistente chamou de "Luis". Ele é o Guto.
ALTER TABLE public.usuarios_perfil ADD COLUMN IF NOT EXISTS apelido text;
COMMENT ON COLUMN public.usuarios_perfil.apelido IS 'Como a pessoa é chamada de verdade (Guto, Nando). O assistente e o bom dia usam isso, não o nome do cadastro.';
UPDATE public.usuarios_perfil SET apelido = 'Guto' WHERE lower(email) = 'guto.wickert@gmail.com';
