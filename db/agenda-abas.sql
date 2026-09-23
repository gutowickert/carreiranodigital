-- As ABAS da agenda (23/09/2026). Rode no SQL Editor do Supabase. Pode rodar de novo: substitui.
--
-- A agenda deixou de abrir no "Tudo" (4 compromissos + 22 follow-ups + 57 marcos de entrega, tudo
-- misturado) e passou a abrir no "Meus". As outras abas são ÁREAS, cada uma com as pessoas dela.
-- Quem está em cada aba mora aqui, não no código: quando entrar ou sair alguém, troca-se aqui.
--
-- O que cada aba mostra:
--   • o que é de alguém da aba (dono, chamado pra ajudar, ou participante)
--   • mais o que está em `fontes` e NÃO tem dono — o mural de onde a área pega trabalho:
--       "lead"    = follow-up de cliente sem vendedor   → Comercial
--       "entrega" = marco de entrega sem responsável    → Deu venda
-- "Meus" e "Time" são fixas no código (a pessoa e todo mundo) e não ficam nesta lista.
--
-- Os IDs são de usuarios_perfil (Rick 73c588d5, Mateus b9c67274, Guto f3861b55, Nando a37df4fd).

DELETE FROM public.configuracoes WHERE chave = 'agenda.abas';

INSERT INTO public.configuracoes (chave, valor, tipo, categoria, descricao, ordem, sistema, org_id)
VALUES (
  'agenda.abas',
  '[
    {"chave": "comercial", "nome": "Comercial", "membros": ["73c588d5-da34-45f3-921c-e65ff7000684", "b9c67274-4bb1-4ec6-a965-c7eedfaa9c9b"], "fontes": ["lead"]},
    {"chave": "deu_venda", "nome": "Deu venda", "membros": ["b9c67274-4bb1-4ec6-a965-c7eedfaa9c9b", "f3861b55-9bee-4ffc-ad35-3eebdc1f7cd6"], "fontes": ["entrega"]},
    {"chave": "sistema",   "nome": "Sistema",   "membros": ["a37df4fd-f6f9-4603-a66a-e7258ad43004"], "fontes": []}
  ]',
  'texto', 'agenda',
  'As abas da agenda por área: nome, quem está em cada uma (ids de usuarios_perfil) e quais fontes sem dono entram nela (lead, entrega, turma, agenda).',
  1, true,
  '00000000-0000-0000-0000-0000000000cd'
);

SELECT chave, left(valor, 80) AS comeco FROM public.configuracoes WHERE chave = 'agenda.abas';
