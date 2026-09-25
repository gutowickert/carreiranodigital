-- A MÁQUINA CND — onde ela trabalha dentro do sistema, e onde o que ela faz FICA.
--
-- ⚠️ ESTA TABELA É O MOTIVO DE MUDAR DE CASA. A máquina do cliente hoje roda no claude.ai: ele
-- conversa, ela escreve o anúncio, e aquilo morre na conversa. Se a gente só puser um chat dentro
-- do CRM, fica PIOR que o claude.ai — mesma coisa, sem o histórico dele e sem os arquivos dele.
-- O que justifica a mudança é a peça virar REGISTRO: com data, com dono, com versão.
--
-- ⚠️ NOME DAS TABELAS É O MESMO DA GAJA (estudio_*), de propósito: é o mesmo motor em todos os
-- sistemas, e o nome de tabela ninguém vê. O que muda por empresa é o nome no MENU (Máquina CND,
-- Studio Mkt), e isso mora em organizacoes.config.maquina.
--
-- ⚠️ NA ESCOLA O org_id VAI EXPLÍCITO no insert (não existe o gatilho set_org_id daqui).

CREATE TABLE IF NOT EXISTS public.estudio_pecas (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id  uuid NOT NULL,

  -- o que é: anuncio, carrossel, roteiro, legenda, pagina, resposta_whatsapp, painel, outro.
  -- Sem lista fechada no banco: a lista de verdade sai das instruções da máquina.
  tipo    text NOT NULL,
  titulo  text NOT NULL,
  conteudo text NOT NULL,

  -- 'texto' se lê; 'html' se OLHA montado (página, comparativo, painel)
  formato text NOT NULL DEFAULT 'texto' CHECK (formato IN ('texto', 'html')),

  pedido        text,     -- o que a pessoa pediu, nas palavras dela
  produto_id    uuid REFERENCES public.produtos(id) ON DELETE SET NULL,
  lead_id       uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  tarefa_id     uuid,

  situacao      text NOT NULL DEFAULT 'rascunho'
                CHECK (situacao IN ('rascunho', 'aprovada', 'publicada', 'descartada')),
  publicada_em  timestamptz,

  -- "refaz mais curto" é o pedido mais comum: cada refação é linha nova apontando pra anterior
  versao_de  uuid REFERENCES public.estudio_pecas(id) ON DELETE SET NULL,

  criada_por    uuid,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estudio_pecas_org ON public.estudio_pecas (org_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_estudio_pecas_tipo ON public.estudio_pecas (org_id, tipo);

-- AS CONVERSAS (guardadas pra não perder o que já se explicou pra ela)
CREATE TABLE IF NOT EXISTS public.estudio_conversas (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id  uuid NOT NULL,
  titulo  text,
  mensagens jsonb NOT NULL DEFAULT '[]'::jsonb,
  criada_por uuid,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_estudio_conversas_org ON public.estudio_conversas (org_id, atualizado_em DESC);

-- AS FOTOS — balde PÚBLICO de propósito: a peça montada é HTML com <img src=…> e precisa continuar
-- abrindo daqui a um mês. Foto que vai virar anúncio é pública por natureza.
INSERT INTO storage.buckets (id, name, public) VALUES ('estudio', 'estudio', true) ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS estudio_ler ON storage.objects;
CREATE POLICY estudio_ler ON storage.objects FOR SELECT USING (bucket_id = 'estudio');
DROP POLICY IF EXISTS estudio_escrever ON storage.objects;
CREATE POLICY estudio_escrever ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'estudio');

-- LIGAR NA CND. Opt-in de propósito (o resto do menu da escola é opt-out): isto gasta dinheiro.
UPDATE public.organizacoes
SET config = coalesce(config, '{}'::jsonb)
  || jsonb_build_object('features', coalesce(config->'features', '{}'::jsonb) || '{"maquina": true}'::jsonb)
  || jsonb_build_object('maquina', coalesce(config->'maquina', '{}'::jsonb) || '{"nome": "Máquina CND", "modo": "geral"}'::jsonb)
WHERE id = '00000000-0000-0000-0000-0000000000cd';
