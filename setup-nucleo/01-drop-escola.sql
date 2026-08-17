-- 01-drop-escola.sql — remove as tabelas de ESCOLA (SAI) do núcleo.
-- ⚠️ RODA NO BANCO NOVO (a cópia), NUNCA no banco da escola.
-- CASCADE derruba as FKs dependentes (ex.: leads.turma_id, matriculas.turma_id).
-- As COLUNAS (turma_id etc.) ficam nas tabelas do núcleo — viram campos soltos, sem quebrar.
BEGIN;
DROP TABLE IF EXISTS alunos                    CASCADE;
DROP TABLE IF EXISTS turmas                    CASCADE;
DROP TABLE IF EXISTS turma_datas               CASCADE;
DROP TABLE IF EXISTS turma_presencas           CASCADE;
DROP TABLE IF EXISTS turma_professores         CASCADE;
DROP TABLE IF EXISTS briefings_turma           CASCADE;
DROP TABLE IF EXISTS disparos_turma            CASCADE;
DROP TABLE IF EXISTS financeiro_turma          CASCADE;
DROP TABLE IF EXISTS vendedor_config_turma     CASCADE;
DROP TABLE IF EXISTS salas                     CASCADE;
DROP TABLE IF EXISTS professores               CASCADE;
DROP TABLE IF EXISTS professor_cidades         CASCADE;
DROP TABLE IF EXISTS pagamentos_professores    CASCADE;
DROP TABLE IF EXISTS presenca_diaria           CASCADE;
DROP TABLE IF EXISTS escala_escolhas           CASCADE;
DROP TABLE IF EXISTS agenda_aulas              CASCADE;
DROP TABLE IF EXISTS agenda_eventos            CASCADE;
DROP TABLE IF EXISTS materiais_curso           CASCADE;
DROP TABLE IF EXISTS produto_modulos           CASCADE;
DROP TABLE IF EXISTS produto_tarefas_template  CASCADE;
DROP TABLE IF EXISTS pipeline_produtos         CASCADE;
DROP TABLE IF EXISTS recomendacoes_produto     CASCADE;
DROP TABLE IF EXISTS recomendacoes             CASCADE;
DROP TABLE IF EXISTS comissoes                 CASCADE;
DROP TABLE IF EXISTS contas_financeiras        CASCADE;
DROP TABLE IF EXISTS lancamentos_empresa       CASCADE;
DROP TABLE IF EXISTS lancamentos_financeiros   CASCADE;
DROP TABLE IF EXISTS naturezas_financeiras     CASCADE;
DROP TABLE IF EXISTS transferencias            CASCADE;
DROP TABLE IF EXISTS transferencias_caixa      CASCADE;
DROP TABLE IF EXISTS custos_fixos              CASCADE;
DROP TABLE IF EXISTS cidades                   CASCADE;
DROP TABLE IF EXISTS equipamentos              CASCADE;
DROP TABLE IF EXISTS alocacoes_equipamento     CASCADE;
DROP TABLE IF EXISTS calendario_editorial      CASCADE;
DROP TABLE IF EXISTS entregas_marketing        CASCADE;
DROP TABLE IF EXISTS entregas_servico          CASCADE;
DROP TABLE IF EXISTS contratos_servico         CASCADE;
COMMIT;
-- Mantidas de propósito: turma_lotes (DORM), matriculas (vira 'vendas'),
-- prospeccoes_externas, prospeccao_andamentos, indicacoes, metricas_campanha,
-- nps, nps_respostas, rateio_estado, metas_vendedor.
