-- Quiz de diagnóstico da Maia (24/11/2026): /maia/quiz/oficina e /maia/quiz/otica.
-- Pode rodar mais de uma vez (só cria o que não existe).
--
-- O diagnóstico é guardado na tabela do check-up (checkup_diagnosticos, db/checkup.sql), com nicho
-- 'maia-oficina' ou 'maia-otica': não precisa de tabela nova. O relatório /checkup/r/<código> não abre esses.
--
-- O que este arquivo cria: o produto "Maia" (se ainda não houver um com esse nome) e a turma-recipiente
-- 'maiaquiz', onde caem os leads dos dois quizzes (o nicho vai na qualificação do lead e no campo "negócio").
-- Sem esta turma a API continua funcionando: o lead entra sem turma (codigo_turma 'maiaquiz') e sem rateio.

insert into produtos (org_id, nome, tipo, ativo, descricao, num_professores, vagas_padrao, meta_matriculas, preco_venda)
select '00000000-0000-0000-0000-0000000000cd', 'Maia', 'Sistema', true,
  'Maia: IA de marketing pro pequeno negócio. Atende o WhatsApp com o nome do negócio, retoma orçamento, manda recado pra base, roda anúncios e manda relatório. Online: 1º mês R$ 497 com implantação, depois R$ 797/mês, sem fidelidade.', 1, 1, 10, 797
where not exists (select 1 from produtos where org_id = '00000000-0000-0000-0000-0000000000cd' and nome ilike 'maia%');

-- mesmo modelo da teunegociooscheckup: fora da cadência dos cursos e do atendimento por IA (o comercial atende);
-- status 'planejada' pra não entrar na lista de turmas à venda do copiloto
insert into turmas (org_id, codigo, produto_id, cidade_id, sala_id, data_inicio, data_fim, preco_venda, vagas, meta_matriculas, tipo_localidade, status, motor_cadencia, observacoes)
select '00000000-0000-0000-0000-0000000000cd', 'maiaquiz',
  (select id from produtos where org_id = '00000000-0000-0000-0000-0000000000cd' and nome ilike 'maia%' order by (nome = 'Maia') desc limit 1),
  t.cidade_id, t.sala_id, '2026-11-24', '2027-12-31', 797, 999, 10, 'sede_propria', 'planejada', 'nenhum',
  'Maia · leads do Quiz de diagnóstico (/maia/quiz/oficina e /maia/quiz/otica). Não é turma: é o recipiente dos leads. O nicho está na qualificação do lead. Fora da cadência e do atendimento por IA: o comercial atende.'
from turmas t where t.codigo = 'deuvendalajeado'
and not exists (select 1 from turmas where codigo = 'maiaquiz');

-- Rateio: a turma nova entra sem vendedor definido. Se o rateio da escola precisar de regra por turma,
-- configurar a 'maiaquiz' no CRM (Turmas) do mesmo jeito que a 'teunegociooscheckup'.
