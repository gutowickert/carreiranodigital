-- ÁREA DE PRODUTO — instalações e cobrança de mensalidade (23/09/2026).
-- Rode no SQL Editor do Supabase. SÓ ACRESCENTA — nada que existe hoje muda de comportamento.
--
-- O QUE ISTO RESOLVE
-- Rodam 4 sistemas e a escola conhecia 1. Os clientes existem em Entregas, mas com o NOME DA PESSOA:
-- o CRM da GAJA está cadastrado como "Jhones Azambuja", e nada no sistema dizia que um era o outro.
-- E a mensalidade, que já estava guardada no projeto (a Dani com dia 10 / R$ 1.500), não gerava nada:
-- era texto na tela. São R$ 3.000/mês que não apareciam no financeiro.

BEGIN;

-- ─────────────────────────────────────────────────────────── 1 · as instalações
--
-- POR QUE UMA TABELA PRÓPRIA, e não um campo em `projetos`: instalação e entrega não são a mesma
-- coisa. O JamRock é um sistema SEM contrato (é do Nando, roda de graça) e o Núcleo é o molde de
-- onde saem os novos. Os dois precisam existir na lista e nunca entrar em cobrança.
-- Quando existe contrato, `projeto_id` liga os dois mundos — é esse campo que finalmente diz
-- "o crm-gaja é o contrato do Jhones".

CREATE TABLE IF NOT EXISTS public.instalacoes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  nome          text NOT NULL,              -- o nome do SISTEMA (GAJA Corretora), não o do contrato
  url           text,                       -- endereço público. NUNCA senha nem token: só o link
  projeto_id    uuid REFERENCES public.projetos(id) ON DELETE SET NULL,
  tipo          text NOT NULL DEFAULT 'cliente' CHECK (tipo IN ('cliente', 'interno')),
  ativo         boolean NOT NULL DEFAULT true,
  observacoes   text,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.instalacoes.tipo IS
  'cliente = paga e entra na cobrança. interno = nosso (JamRock, Núcleo): aparece na lista e NUNCA gera cobrança nem aviso.';
COMMENT ON COLUMN public.instalacoes.url IS
  'Só o endereço público do sistema. Credencial de cliente não mora aqui — quem clica cai no login dele.';

CREATE INDEX IF NOT EXISTS instalacoes_org_idx ON public.instalacoes (org_id, ativo);

-- ⚠️ FECHADA PRO NAVEGADOR (proteção de linha, nenhuma regra). O acesso é só pelas rotas do
-- servidor, que conferem quem está pedindo — igual `implantacoes` e `implantacao_respostas`.
-- Aqui tem endereço de sistema de cliente e, junto na tela, valor de contrato.
ALTER TABLE public.instalacoes ENABLE ROW LEVEL SECURITY;
DO $limpa$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'instalacoes' LOOP
    EXECUTE format('DROP POLICY %I ON public.instalacoes', p.policyname);
  END LOOP;
END $limpa$;

-- ───────────────────────────────────────────────────── 2 · a cobrança no projeto
--
-- `mensalidade_dia` e `mensalidade_valor` JÁ EXISTEM e já são preenchidos na tela de Entregas.
-- O que falta é o resto.

ALTER TABLE public.projetos ADD COLUMN IF NOT EXISTS valor_implantacao   numeric;
ALTER TABLE public.projetos ADD COLUMN IF NOT EXISTS implantacao_vence_em date;
ALTER TABLE public.projetos ADD COLUMN IF NOT EXISTS cobranca_desde       date;

-- ⚠️ `cobranca_desde` É A TRAVA DO "NUNCA PARA TRÁS", e é a coluna mais importante deste arquivo.
-- A Dani e o Jhones já pagaram setembro à mão. Se o motor olhar pro passado, ele cria duas
-- cobranças em aberto de um dinheiro que já entrou, e alguém vai atrás de cliente que não deve
-- nada — o tipo de erro que queima a confiança na ferramenta no primeiro dia.
--
-- VAZIA = O MOTOR NÃO GERA NADA para aquele projeto. É também a trava do cadastro pela metade:
-- o dia do Jhones está como 10 no banco, mas ainda não foi decidido de verdade, então ele fica
-- sem data de início até alguém confirmar.
COMMENT ON COLUMN public.projetos.cobranca_desde IS
  'A partir de quando o motor gera a mensalidade. VAZIA = não gera nada. Nunca gera antes desta data: o que foi pago à mão fica como está.';
COMMENT ON COLUMN public.projetos.valor_implantacao IS
  'Cobrança única de setup, quando houver. Vazia = não tem. Gera um lançamento só, em implantacao_vence_em.';

-- ─────────────────────────────────────────────── 3 · a categoria no financeiro
-- Separa essa receita das outras no relatório do Rick.

INSERT INTO public.naturezas_financeiras (chave, nome, ativo, ordem, org_id)
SELECT 'mensalidade_cliente', 'Mensalidade de cliente', true, 20, '00000000-0000-0000-0000-0000000000cd'
WHERE NOT EXISTS (
  SELECT 1 FROM public.naturezas_financeiras
  WHERE chave = 'mensalidade_cliente' AND org_id = '00000000-0000-0000-0000-0000000000cd'
);

-- ──────────────────────────────────────────── 4 · os quatro sistemas de hoje
-- URLs conferidas em 23/09/2026: as duas primeiras respondem 200; o JamRock mora num endereço
-- que não segue o padrão (por isso está escrito aqui, e não deduzido); o Núcleo não é publicado,
-- é o molde de onde saem as cópias.

INSERT INTO public.instalacoes (org_id, nome, url, projeto_id, tipo, observacoes)
SELECT v.org_id, v.nome, v.url, v.projeto_id, v.tipo, v.obs
FROM (VALUES
  ('00000000-0000-0000-0000-0000000000cd'::uuid, 'Espaço Dani Fell', 'https://crm-danifell.vercel.app',
   (SELECT id FROM public.projetos WHERE cliente = 'Espaço Dani Fell' LIMIT 1), 'cliente',
   'Saúde e beleza através do intestino, Estrela/RS. Área da cliente (ficha, exames, jornada) ligada.'),
  ('00000000-0000-0000-0000-0000000000cd'::uuid, 'GAJA Corretora de Seguros', 'https://crm-gaja.vercel.app',
   (SELECT id FROM public.projetos WHERE cliente = 'Jhones Azambuja' LIMIT 1), 'cliente',
   'O contrato está no nome do Jhones Azambuja. Questionário de implantação em andamento.'),
  ('00000000-0000-0000-0000-0000000000cd'::uuid, 'JamRock', 'https://jamrockskateboardingco.vercel.app',
   NULL, 'interno',
   'Do Nando, roda de graça. Sem contrato e sem cobrança.'),
  ('00000000-0000-0000-0000-0000000000cd'::uuid, 'Núcleo', NULL,
   NULL, 'interno',
   'O molde de onde saem as instalações novas. Não é publicado.')
) AS v(org_id, nome, url, projeto_id, tipo, obs)
WHERE NOT EXISTS (SELECT 1 FROM public.instalacoes i WHERE i.nome = v.nome AND i.org_id = v.org_id);

-- ─────────────────────────────────────── 5 · os valores combinados (23/09/2026)
--
-- Dani: R$ 1.500 até o dia 10 · primeira paga à mão em setembro → o motor começa em OUTUBRO.
-- Jhones (GAJA): R$ 1.500, mas o DIA AINDA NÃO FOI DEFINIDO. Por isso fica sem `cobranca_desde`:
--   o valor entra pra não se perder, e nenhuma cobrança nasce até alguém confirmar o dia.
-- Nenhum dos dois teve valor de implantação.

UPDATE public.projetos
SET mensalidade_valor = 1500, mensalidade_dia = 10, cobranca_desde = DATE '2026-10-01', atualizado_em = now()
WHERE cliente = 'Espaço Dani Fell';

UPDATE public.projetos
SET mensalidade_valor = 1500, cobranca_desde = NULL, atualizado_em = now()
WHERE cliente = 'Jhones Azambuja';

COMMIT;

-- ─────────────────────────────────────────────────────────────── conferência
SELECT i.nome, i.tipo, coalesce(i.url, '—') AS url, coalesce(p.cliente, '—') AS contrato,
       coalesce(p.mensalidade_valor::text, '—') AS valor,
       coalesce(p.mensalidade_dia::text, '—') AS dia,
       coalesce(p.cobranca_desde::text, 'não gera') AS cobra_desde
FROM public.instalacoes i
LEFT JOIN public.projetos p ON p.id = i.projeto_id
ORDER BY i.tipo, i.nome;

SELECT c.relname AS tabela, c.relrowsecurity AS protecao_de_linha,
       (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'instalacoes') AS regras_deve_ser_zero
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'instalacoes';
