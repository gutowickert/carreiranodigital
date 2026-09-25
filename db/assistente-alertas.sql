-- OS AVISOS POR EVENTO DO ASSISTENTE (25/09/2026). Rode no SQL Editor. SÓ ACRESCENTA.
--
-- O Guto fechou o que quer receber no WhatsApp durante o dia, POR EVENTO e não por horário:
-- venda fechada (acima de um valor, ou Deu Venda), campanha de cliente parada ou conta sem
-- saldo, lead quente há 2h sem resposta do time em horário comercial. Uma rotina de hora em
-- hora olha o banco e manda. Esta tabela é o que impede mandar o mesmo aviso duas vezes.

CREATE TABLE IF NOT EXISTS public.assistente_alertas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL,
  usuario_id  uuid NOT NULL REFERENCES public.usuarios_perfil(id) ON DELETE CASCADE,
  chave       text NOT NULL,          -- ex.: venda:<lead_id> · parada:<projeto_id>:2026-09-25 · sem_resposta:<conversa_id>:2026-09-25
  texto       text NOT NULL,
  enviado     boolean NOT NULL DEFAULT true,   -- false = janela de 24h fechada, ficou só registrado
  criado_em   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, chave)
);
CREATE INDEX IF NOT EXISTS assistente_alertas_usuario_data ON public.assistente_alertas (usuario_id, criado_em DESC);
