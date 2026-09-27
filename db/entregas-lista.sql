-- A LISTA DO QUE FAZER EM CADA MARCO — o padrão de implantação, riscável na ficha do projeto.
--
-- ⚠️ POR QUE UMA COLUNA NO MARCO, E NÃO UMA TABELA DE TAREFAS. A lista é curta (3 a 7 itens), vive
-- e morre com o marco, e ninguém filtra por ela. Uma tabela daria junção, política e gatilho pra
-- gerenciar sete caixinhas. O padrão mora no código (lib/entrega.ts, ROTEIROS[...].marcos[].lista);
-- aqui fica a cópia daquele projeto, com o que já foi riscado.
--
-- Formato: [{"item": "Combinar a data da apresentação", "feito": false}, ...]

ALTER TABLE public.projeto_marcos ADD COLUMN IF NOT EXISTS lista jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.projeto_marcos.lista IS
  'O que fazer neste marco, item a item, com o que já foi riscado. Nasce do roteiro (lib/entrega.ts); "aplicar a lista padrão" na ficha preenche nos projetos antigos.';
