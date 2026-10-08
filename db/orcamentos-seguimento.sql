-- SEGUIMENTO DO ACEITE (escola, 08/10/2026)
--
-- Quando o cliente aceita a proposta pelo link, o sistema mostra uma faixa verde no topo de todas
-- as telas até alguém do time clicar em "Dei seguimento". Aqui fica quem clicou e quando.
-- Antes o aceite só virava uma linha no histórico do lead: o Rodrigo Zart aceitou em 08/10 e o
-- Eduardo Sehnem em 07/10, e ninguém foi avisado.
--
-- Só ACRESCENTA colunas. Não mexe em nada que já existe. Pode rodar de novo sem estragar nada.

ALTER TABLE public.orcamentos ADD COLUMN IF NOT EXISTS seguimento_em      timestamptz;
ALTER TABLE public.orcamentos ADD COLUMN IF NOT EXISTS seguimento_por     uuid;   -- usuarios_perfil.id
ALTER TABLE public.orcamentos ADD COLUMN IF NOT EXISTS seguimento_por_nome text;

-- conferência: deve mostrar as 3 colunas
SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentos' AND column_name LIKE 'seguimento%' ORDER BY 1;
