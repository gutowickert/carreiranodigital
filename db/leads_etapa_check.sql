-- Atualiza a constraint de etapas do lead pra incluir 'agendado' e 'proxima_turma'
-- (foram adicionadas depois; a constraint antiga barrava o lead de ir pra elas —
-- o andamento era gravado, mas o update da etapa falhava com 23514).
-- Rode no SQL Editor do Supabase.
alter table public.leads drop constraint if exists leads_etapa_check;
alter table public.leads add constraint leads_etapa_check check (etapa in (
  'aguardando_atendimento',
  'atendimento_inicial',
  'lote_preco_ok',
  'nao_chegou_preco',
  'oferecer_bolsa',
  'pediu_prazo',
  'aguardando_pagamento',
  'agendado',
  'proxima_turma',
  'ganho',
  'perda'
));
