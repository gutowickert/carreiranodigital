-- FUNIL "MAIA ONLINE" + HISTÓRICO DE ETAPAS (24/11/2026, pedido do Nando: "ajusta o funil da maia pro Guto
-- botar as campanhas pra rodar"). Pode rodar mais de uma vez.
--
-- 1) Funis separados no mesmo quadro (igual ao núcleo, setup 53): cada etapa diz de qual funil é
--    (`etapas.funil`). Com dois ou mais funis o Funil ganha uma aba por funil. Ganho e Perda ficam sem funil
--    (valem pros dois: a venda conta igual nos relatórios e manda o Purchase pra Meta do mesmo jeito).
-- 2) As etapas do Maia online: Novo (fez o quiz), Conversando, Reunião com o Rick, Proposta / link enviado.
--    Chaves combinadas com a janela da Maia: maia_novo, maia_conversando, maia_reuniao, maia_proposta, ganho, perda.
-- 3) Ponte com a vendedora da Maia (lib/maia/vendedora.ts, que NÃO é desta conversa e não foi mexido): ela anota
--    a etapa em `qualificacao.maia_etapa` (novo, conversando, reuniao, proposta, ganho, perdido) e não muda o
--    cartão. O gatilho abaixo faz as duas coisas andarem juntas: mudou o maia_etapa, o cartão anda; o time moveu o
--    cartão no Funil, o maia_etapa acompanha (senão a vendedora "voltaria" o lead na próxima mensagem).
--    Lead da Maia = turma 'maiaquiz' ou qualificacao.produto = 'Maia'. Lead novo da Maia nasce em maia_novo.
-- 4) `lead_etapas`: por onde cada cartão passou (igual ao núcleo, setup 50), pro "passaram por aqui" do Funil.

BEGIN;

ALTER TABLE public.etapas ADD COLUMN IF NOT EXISTS funil text;

-- a lista fixa de etapas que o banco aceita no lead ganha as da Maia (sem isto, todo lead novo da Maia falhava)
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_etapa_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_etapa_check CHECK (etapa = ANY (ARRAY['aguardando_atendimento','deu_venda',
  'atendimento_inicial','lote_preco_ok','nao_chegou_preco','oferecer_bolsa','pediu_prazo','aguardando_pagamento','ligacao_boa',
  'agendado','proxima_turma','ganho','perda','maia_novo','maia_conversando','maia_reuniao','maia_proposta']::text[]));

-- as etapas da escola ganham o funil "Escola" (Ganho e Perda ficam de todos)
UPDATE public.etapas SET funil = 'Escola'
 WHERE org_id = '00000000-0000-0000-0000-0000000000cd' AND funil IS NULL AND papel NOT IN ('ganho', 'perda');

INSERT INTO public.etapas (org_id, chave, label, ordem, cor, papel, ativo, funil)
SELECT '00000000-0000-0000-0000-0000000000cd', v.chave, v.label, v.ordem, v.cor, 'ativa', true, 'Maia online'
FROM (VALUES
  ('maia_novo',        'Novo (fez o quiz)',       30, '#c4b5fd'),
  ('maia_conversando', 'Conversando',             31, '#a78bfa'),
  ('maia_reuniao',     'Reunião com o Rick',      32, '#8b5cf6'),
  ('maia_proposta',    'Proposta / link enviado', 33, '#6d28d9')
) AS v(chave, label, ordem, cor)
WHERE NOT EXISTS (SELECT 1 FROM public.etapas e WHERE e.org_id = '00000000-0000-0000-0000-0000000000cd' AND e.chave = v.chave);

-- ---------- ponte maia_etapa <-> etapa do cartão ----------
CREATE OR REPLACE FUNCTION public.lead_maia_sincroniza() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  eh_maia boolean := coalesce(NEW.codigo_turma, '') = 'maiaquiz' OR coalesce(NEW.qualificacao->>'produto', '') = 'Maia';
  me_novo text; me_velho text; para_cartao text; para_maia text;
BEGIN
  IF NOT eh_maia THEN RETURN NEW; END IF;
  me_novo := NEW.qualificacao->>'maia_etapa';
  IF TG_OP = 'INSERT' THEN
    -- lead novo da Maia: nasce no funil dela (o quiz e a vendedora gravam 'aguardando_atendimento', a Ligação da escola)
    IF NEW.etapa IS NULL OR NEW.etapa NOT IN ('ganho', 'perda') THEN
      NEW.etapa := CASE coalesce(me_novo, 'novo') WHEN 'conversando' THEN 'maia_conversando' WHEN 'reuniao' THEN 'maia_reuniao'
        WHEN 'proposta' THEN 'maia_proposta' WHEN 'ganho' THEN 'ganho' WHEN 'perdido' THEN 'perda' ELSE 'maia_novo' END;
    END IF;
    RETURN NEW;
  END IF;
  me_velho := OLD.qualificacao->>'maia_etapa';
  IF me_novo IS DISTINCT FROM me_velho AND me_novo IS NOT NULL AND NEW.etapa IS NOT DISTINCT FROM OLD.etapa THEN
    -- a vendedora mudou a etapa dela: o cartão anda junto (ganho só pelo time, nunca pela IA)
    para_cartao := CASE me_novo WHEN 'novo' THEN 'maia_novo' WHEN 'conversando' THEN 'maia_conversando' WHEN 'reuniao' THEN 'maia_reuniao'
      WHEN 'proposta' THEN 'maia_proposta' WHEN 'perdido' THEN 'perda' ELSE NULL END;
    -- não tira do Ganho nem reabre perda por conta da IA
    IF para_cartao IS NOT NULL AND OLD.etapa NOT IN ('ganho') THEN
      NEW.etapa := para_cartao;
      IF para_cartao = 'perda' AND NEW.data_perda IS NULL THEN NEW.data_perda := now(); END IF;
    END IF;
  ELSIF NEW.etapa IS DISTINCT FROM OLD.etapa THEN
    -- o time moveu o cartão: a etapa da vendedora acompanha
    para_maia := CASE NEW.etapa WHEN 'maia_novo' THEN 'novo' WHEN 'maia_conversando' THEN 'conversando' WHEN 'maia_reuniao' THEN 'reuniao'
      WHEN 'maia_proposta' THEN 'proposta' WHEN 'ganho' THEN 'ganho' WHEN 'perda' THEN 'perdido' ELSE NULL END;
    IF para_maia IS NOT NULL THEN
      NEW.qualificacao := coalesce(NEW.qualificacao, '{}'::jsonb) || jsonb_build_object('maia_etapa', para_maia);
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_lead_maia_sincroniza ON public.leads;
CREATE TRIGGER trg_lead_maia_sincroniza BEFORE INSERT OR UPDATE OF etapa, qualificacao ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.lead_maia_sincroniza();

-- lead da Maia que já entrou antes deste script (na Ligação da escola) vai pro funil dela
UPDATE public.leads SET etapa = CASE coalesce(qualificacao->>'maia_etapa', 'novo') WHEN 'conversando' THEN 'maia_conversando'
  WHEN 'reuniao' THEN 'maia_reuniao' WHEN 'proposta' THEN 'maia_proposta' ELSE 'maia_novo' END
 WHERE org_id = '00000000-0000-0000-0000-0000000000cd' AND etapa = 'aguardando_atendimento'
   AND (codigo_turma = 'maiaquiz' OR qualificacao->>'produto' = 'Maia');

-- ---------- histórico: por onde cada cartão passou ----------
CREATE TABLE IF NOT EXISTS public.lead_etapas (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id    uuid REFERENCES public.organizacoes(id),
  lead_id   uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  etapa     text NOT NULL,
  entrou_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_etapas_etapa_idx ON public.lead_etapas (org_id, etapa, entrou_em);
CREATE INDEX IF NOT EXISTS lead_etapas_lead_idx ON public.lead_etapas (lead_id);
ALTER TABLE public.lead_etapas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_rw ON public.lead_etapas;
CREATE POLICY org_rw ON public.lead_etapas FOR ALL USING (org_id = meu_org()) WITH CHECK (org_id = meu_org());
DROP TRIGGER IF EXISTS trg_set_org_id ON public.lead_etapas;
CREATE TRIGGER trg_set_org_id BEFORE INSERT ON public.lead_etapas FOR EACH ROW EXECUTE FUNCTION public.set_org_id();

CREATE OR REPLACE FUNCTION public.lead_etapa_historico() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.etapa IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.etapa IS DISTINCT FROM OLD.etapa) THEN
    INSERT INTO lead_etapas (org_id, lead_id, etapa) VALUES (NEW.org_id, NEW.id, NEW.etapa);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_lead_etapa_historico ON public.leads;
-- sem 'OF etapa': a etapa também muda pelo gatilho da Maia quando só a qualificação foi gravada
CREATE TRIGGER trg_lead_etapa_historico AFTER INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.lead_etapa_historico();

-- o que já aconteceu antes: o que lead_andamentos anotou + a etapa atual de cada cartão (só na primeira vez)
INSERT INTO public.lead_etapas (org_id, lead_id, etapa, entrou_em)
SELECT l.org_id, a.lead_id, a.etapa_nova, a.criado_em
  FROM public.lead_andamentos a JOIN public.leads l ON l.id = a.lead_id
 WHERE a.etapa_nova IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.lead_etapas)
UNION ALL
SELECT l.org_id, l.id, l.etapa, l.criado_em FROM public.leads l
 WHERE l.etapa IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.lead_etapas)
   AND NOT EXISTS (SELECT 1 FROM public.lead_andamentos a WHERE a.lead_id = l.id AND a.etapa_nova = l.etapa);

-- "passaram por aqui": quantos cartões diferentes já entraram em cada etapa (da empresa de quem pergunta)
CREATE OR REPLACE FUNCTION public.funil_passaram() RETURNS TABLE(etapa text, qtd bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public' AS $$
  SELECT etapa, count(DISTINCT lead_id) FROM lead_etapas WHERE org_id = meu_org() GROUP BY etapa
$$;
GRANT EXECUTE ON FUNCTION public.funil_passaram() TO authenticated;

COMMIT;
