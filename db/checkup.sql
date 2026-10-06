-- Check-up de IA do teunegócio OS (06/10/2026). Isca do funil do sistema: o dono responde perguntas,
-- recebe o diagnóstico (lib/checkup) e vira lead do comercial. Página pública: /checkup.

-- cada diagnóstico feito (o relatório abre por /checkup/r/<codigo>)
create table if not exists checkup_diagnosticos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizacoes(id),
  codigo text not null unique,            -- 6 letras/números, vai no link e na mensagem do WhatsApp
  lead_id uuid references leads(id) on delete set null,
  nome text,
  whatsapp text,
  nicho text,                             -- slug do catálogo (lib/checkup/nichos)
  respostas jsonb not null,
  conta jsonb not null,                   -- números da fórmula (lib/checkup/conta.ts): a IA não altera
  texto jsonb not null,                   -- o que a IA escreveu
  origem jsonb,                           -- utm, referência, página
  aberto_em timestamptz,                  -- primeira vez que o relatório foi aberto
  criado_em timestamptz not null default now()
);
create index if not exists checkup_diagnosticos_lead on checkup_diagnosticos(lead_id);
alter table checkup_diagnosticos enable row level security;   -- só o servidor (service role) lê e grava

-- produto e turma-recipiente do teunegócio OS no CRM da escola (mesmo modelo do Deu Venda:
-- fora da cadência dos cursos; status 'planejada' pra não entrar na lista de turmas à venda do copiloto)
insert into produtos (org_id, nome, tipo, ativo, descricao, num_professores, vagas_padrao, meta_matriculas, preco_venda)
select '00000000-0000-0000-0000-0000000000cd', 'teunegócio OS', 'Sistema', true,
  'Sistema integrado com IA para o negócio local: atendimento, vendas, agenda, entregas, financeiro e placar, ajustado ao jeito do cliente. Implantação com especialista. Sem preço público: o especialista passa na conversa.', 1, 1, 10, 0
where not exists (select 1 from produtos where org_id = '00000000-0000-0000-0000-0000000000cd' and nome = 'teunegócio OS');

insert into turmas (org_id, codigo, produto_id, cidade_id, sala_id, data_inicio, data_fim, preco_venda, vagas, meta_matriculas, tipo_localidade, status, motor_cadencia, observacoes)
select '00000000-0000-0000-0000-0000000000cd', 'teunegociooscheckup',
  (select id from produtos where org_id = '00000000-0000-0000-0000-0000000000cd' and nome = 'teunegócio OS'),
  t.cidade_id, t.sala_id, '2026-10-06', '2027-12-31', 0, 999, 10, 'sede_propria', 'planejada', 'nenhum',
  'teunegócio OS · leads do Check-up de IA (/checkup). Não é turma: é o recipiente dos leads do sistema. Fora da cadência dos cursos e do atendimento por IA: o comercial atende (o especialista).'
from turmas t where t.codigo = 'deuvendalajeado'
and not exists (select 1 from turmas where codigo = 'teunegociooscheckup');
