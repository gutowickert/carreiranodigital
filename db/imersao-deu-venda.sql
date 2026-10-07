-- Imersão Deu Venda (07/10/2026, decidido pelo Guto): 3 encontros de 3 h + encontro de resultado ~20 dias depois
-- + 30 dias de grupo. Turma pequena. R$ 1.497 (ex-aluno R$ 1.297, quem passa é o comercial).
-- Fora da cadência automática dos cursos (motor_cadencia = 'nenhum'): o comercial atende.
-- Os códigos são os mesmos que a página da Imersão já usa nos botões (o lead cai direto na turma).

insert into produtos (org_id, nome, tipo, ativo, descricao, num_professores, vagas_padrao, meta_matriculas, preco_venda)
select '00000000-0000-0000-0000-0000000000cd', 'Imersão Deu Venda', 'Imersão', true,
  'Imersão presencial em 3 encontros de 3 h: estratégia; artes, vídeos editados pela IA e campanha no Facebook/Instagram pelo Claude; ajuste, atendimento no WhatsApp e site da empresa. Encontro de resultado ~20 dias depois e 30 dias no grupo da turma. A máquina de IA fica com o aluno. R$ 1.497 (ex-aluno R$ 1.297).',
  1, 12, 10, 1497
where not exists (select 1 from produtos where org_id = '00000000-0000-0000-0000-0000000000cd' and nome = 'Imersão Deu Venda');

insert into turmas (org_id, codigo, produto_id, cidade_id, sala_id, data_inicio, data_fim, preco_venda, vagas, meta_matriculas,
                    perc_trafego, perc_imposto, tipo_localidade, status, motor_cadencia, observacoes)
select '00000000-0000-0000-0000-0000000000cd', v.codigo,
  (select id from produtos where org_id = '00000000-0000-0000-0000-0000000000cd' and nome = 'Imersão Deu Venda'),
  v.cidade_id::uuid, v.sala_id::uuid, v.ini::date, v.fim::date, 1497, 12, 10, 0.10, 0.08, 'sede_propria', 'em_vendas', 'nenhum', v.obs
from (values
  ('imersaodvportoalegre102601', '1a0370fc-79ce-427a-9f22-8539f5131bba', '9b7e7aa3-6999-482e-8f7b-57284654c82c', '2026-10-20', '2026-11-03',
   'Imersão Deu Venda · Porto Alegre · TARDE (14:00–17:15). Encontros 20, 21 e 22/10; resultado 03/11. R$ 1.497 (ex-aluno R$ 1.297). Página: /imersao/porto-alegre.'),
  ('imersaodvportoalegre102602', '1a0370fc-79ce-427a-9f22-8539f5131bba', '9b7e7aa3-6999-482e-8f7b-57284654c82c', '2026-10-20', '2026-11-03',
   'Imersão Deu Venda · Porto Alegre · NOITE (19:00–22:15). Encontros 20, 21 e 22/10; resultado 03/11. R$ 1.497 (ex-aluno R$ 1.297). Página: /imersao/porto-alegre.'),
  ('imersaodvlajeado102601', '9e91f704-86b4-42ce-b8ec-35ed8e70e94a', 'c480f3f7-16ca-4e2f-9fa4-e7091eeaf7ae', '2026-10-27', '2026-11-09',
   'Imersão Deu Venda · Lajeado · NOITE (19:00–22:15). Encontros 27, 28 e 29/10; resultado 09/11. R$ 1.497 (ex-aluno R$ 1.297). Página: /imersao/lajeado.')
) as v(codigo, cidade_id, sala_id, ini, fim, obs)
where not exists (select 1 from turmas t where t.codigo = v.codigo);
