-- RECONFIRMAÇÃO DO ENCONTRO E A REGIÃO DO ATENDIMENTO (24/09/2026).
-- Rode no SQL Editor do Supabase. SÓ ACRESCENTA — nada que existe muda de comportamento.
--
-- DOIS PROBLEMAS QUE CUSTAM DIA DE TRABALHO:
--
-- 1. O Rick não sabe em que cidade está o compromisso que o Guto já marcou. Dá pra fazer dois
--    atendimentos no mesmo dia na MESMA região; em regiões diferentes, não dá tempo do
--    deslocamento. Hoje o lugar não existe em lugar nenhum do sistema — nem no encontro, nem no
--    projeto, nem no cliente. Ele não sabe porque a informação nunca foi guardada.
--
-- 2. Ninguém reconfirma com o cliente antes de a equipe pegar a estrada. Quando a pessoa só lembra
--    em cima da hora, o time já está se deslocando — e perde o dia.

BEGIN;

-- ─────────────────────────────────────────────────────────── 1 · onde é o encontro
--
-- ⚠️ O LUGAR É DO ENCONTRO, NÃO DO CLIENTE. Varia: às vezes a equipe vai até a empresa pra captar
-- imagens dos produtos pro anúncio. Guardar no cliente daria a resposta errada na metade das vezes.
--
-- São quatro lugares, mas o que trava o dia são DUAS regiões — por isso o `local` guarda os quatro
-- e a região sai dele no código (lib/entrega.ts), em vez de virar uma segunda coluna que pode
-- discordar da primeira.

ALTER TABLE public.projeto_marcos ADD COLUMN IF NOT EXISTS local text
  CHECK (local IS NULL OR local IN ('sede_lajeado', 'regiao_lajeado', 'sede_poa', 'regiao_poa'));

COMMENT ON COLUMN public.projeto_marcos.local IS
  'Onde o encontro acontece. sede_lajeado e regiao_lajeado = região de Lajeado; sede_poa e regiao_poa = região de Porto Alegre. Dois no mesmo dia só na MESMA região.';

CREATE INDEX IF NOT EXISTS projeto_marcos_local_idx ON public.projeto_marcos (data_prevista, local)
  WHERE local IS NOT NULL AND estado NOT IN ('concluido', 'cancelado');

-- ──────────────────────────────────────────────────── 2 · a reconfirmação com o cliente
--
-- ⚠️ O MOTOR OLHA A DATA, NÃO O ESTADO. A máquina de estados prevê `combinado` (o time acertou) e
-- `confirmado` (reconfirmado depois) — mas na prática o time marca tudo direto como `confirmado`:
-- os 8 encontros dos próximos dias estão todos assim. Um motor preso ao nome do estado não
-- mandaria mensagem nenhuma. Estas colunas são a memória do MOTOR, e não se confundem com o estado
-- que o time usa pra se organizar.

ALTER TABLE public.projeto_marcos ADD COLUMN IF NOT EXISTS reconfirmacao_enviada_em  timestamptz;
ALTER TABLE public.projeto_marcos ADD COLUMN IF NOT EXISTS reconfirmacao_2a_em       timestamptz;
ALTER TABLE public.projeto_marcos ADD COLUMN IF NOT EXISTS reconfirmacao_resposta    text
  CHECK (reconfirmacao_resposta IS NULL OR reconfirmacao_resposta IN ('sim', 'nao'));
ALTER TABLE public.projeto_marcos ADD COLUMN IF NOT EXISTS reconfirmacao_resposta_em timestamptz;

COMMENT ON COLUMN public.projeto_marcos.reconfirmacao_enviada_em IS
  'Quando a IA mandou a 1ª reconfirmação (2 dias antes). Preenchida = não manda de novo. É o que impede o motor, que roda 2x por dia, de mandar duas vezes.';
COMMENT ON COLUMN public.projeto_marcos.reconfirmacao_2a_em IS
  'A 2ª tentativa, 1 dia antes, quando a 1ª não teve resposta. No mesmo momento o dono do encontro é avisado — não se espera a 2ª falhar: 1 dia antes ainda dá pra ligar, no dia da viagem não.';
COMMENT ON COLUMN public.projeto_marcos.reconfirmacao_resposta IS
  'O que o cliente respondeu no botão: sim | nao. A IA NÃO REMARCA — quando é não, ela avisa quem atende e para. Data nova se combina com gente.';

COMMIT;

-- ───────────────────────────────────────── 3 · o template da reconfirmação (rascunho)
--
-- Mensagem 2 dias antes cai FORA DA JANELA DE 24 HORAS do WhatsApp: só sai por template aprovado
-- pela Meta, e a aprovação leva dias. Entra como `rascunho` — quem submete é a tela
-- Templates de Follow-up, de propósito: submeter é ação que fala com a Meta em nome da empresa.
--
-- `utility` e não `marketing`: é confirmação de compromisso, não oferta. Aprova mais rápido e a
-- conversa sai mais barata.
--
-- OS BOTÕES SÃO O PONTO. Com texto livre o cliente responde "acho que sim" ou "só se for de manhã"
-- e alguém tem que adivinhar; numa decisão que custa uma viagem, adivinhar é caro. O clique volta
-- como uma mensagem cujo texto é o rótulo do botão — é assim que o motor entende sem interpretar.

ALTER TABLE public.followup_templates ADD COLUMN IF NOT EXISTS botoes text;
COMMENT ON COLUMN public.followup_templates.botoes IS
  'Botões de resposta rápida, separados por | (no máximo 3, 25 caracteres cada). Vazio = template só de texto.';

INSERT INTO public.followup_templates (org_id, chave, nome_meta, categoria, tipo_janela, ordem, corpo, variaveis, botoes, status, ativo)
SELECT '00000000-0000-0000-0000-0000000000cd', 'reconfirmar_encontro', 'cnd_reconfirmar_encontro', 'utility', 'template', 50,
  'Oi {{nome}}! Aqui é da Carreira no Digital. Passando pra confirmar o nosso encontro: {{data}} às {{hora}}, {{local}}. Tá tudo certo pra ti?',
  'nome,data,hora,local',
  'Sim, confirmado|Não vou poder',
  'rascunho', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.followup_templates
  WHERE chave = 'reconfirmar_encontro' AND org_id = '00000000-0000-0000-0000-0000000000cd'
);

-- ─────────────────────────────────────────────────────────────────── conferência
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'projeto_marcos'
  AND column_name IN ('local', 'reconfirmacao_enviada_em', 'reconfirmacao_2a_em', 'reconfirmacao_resposta', 'reconfirmacao_resposta_em')
ORDER BY column_name;

SELECT chave, nome_meta, categoria, status, botoes FROM public.followup_templates WHERE chave = 'reconfirmar_encontro';
