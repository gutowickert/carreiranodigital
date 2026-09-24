-- A TURMA DA PROPOSTA
--
-- A data da turma era digitada na capa pelo vendedor. Funciona no dia em que ele lembra — e no dia
-- em que não lembrar, ou em que copiar de uma proposta antiga, o cliente recebe a data de uma
-- turma que já aconteceu. Turma é dado do sistema, não texto solto: passa a ser ESCOLHIDA de uma
-- lista, e a proposta imprime o que está no cadastro.
--
-- Fica obrigatória só pros produtos vendidos POR TURMA (lib/proposta-produtos, POR_TURMA). O Deu
-- Venda é implantação individual e segue sem turma.
ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS turma_id uuid REFERENCES public.turmas(id);

CREATE INDEX IF NOT EXISTS idx_orcamentos_turma ON public.orcamentos (turma_id) WHERE turma_id IS NOT NULL;
