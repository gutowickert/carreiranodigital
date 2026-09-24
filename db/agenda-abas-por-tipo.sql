-- AS ABAS DA AGENDA passam a filtrar TAMBÉM POR TIPO DE TRABALHO (24/09/2026).
-- Rode no SQL Editor do Supabase. Substitui a configuração anterior.
--
-- O PROBLEMA: a aba mostrava tudo de quem estava nela. O Mateus está no Comercial E no Deu venda,
-- então os follow-ups comerciais dele vazavam pro Deu venda — 48 itens, a maioria sem nada a ver
-- com entrega. Aba assim não serve pra nada: quem abre não confia no que está vendo.
--
-- Agora `fontes` diz o TIPO DE TRABALHO da área, e vale tanto pro que tem dono quanto pro que não
-- tem. A aba passa a ser "o trabalho DESTE TIPO feito por ESTAS pessoas".
--
--   agenda  = compromisso marcado (reunião, ligação)
--   lead    = follow-up de cliente do funil
--   turma   = tarefa
--   entrega = encontro de implantação com cliente que já comprou
--
-- `fontes` vazio = a aba não filtra por tipo (o Sistema é de uma pessoa só e mostra tudo dela).

DELETE FROM public.configuracoes WHERE chave = 'agenda.abas';

INSERT INTO public.configuracoes (chave, valor, tipo, categoria, descricao, ordem, sistema, org_id)
VALUES (
  'agenda.abas',
  '[
    {"chave": "comercial", "nome": "Comercial", "membros": ["73c588d5-da34-45f3-921c-e65ff7000684", "b9c67274-4bb1-4ec6-a965-c7eedfaa9c9b"], "fontes": ["lead", "agenda", "turma"]},
    {"chave": "deu_venda", "nome": "Deu venda", "membros": ["b9c67274-4bb1-4ec6-a965-c7eedfaa9c9b", "f3861b55-9bee-4ffc-ad35-3eebdc1f7cd6"], "fontes": ["entrega", "agenda"]},
    {"chave": "sistema",   "nome": "Sistema",   "membros": ["a37df4fd-f6f9-4603-a66a-e7258ad43004"], "fontes": []}
  ]',
  'texto', 'agenda',
  'As abas da agenda por área: nome, quem está nela, e os TIPOS de trabalho que ela mostra. Vazio em fontes = mostra tudo daquelas pessoas.',
  1, true,
  '00000000-0000-0000-0000-0000000000cd'
);

SELECT chave, left(valor, 100) AS comeco FROM public.configuracoes WHERE chave = 'agenda.abas';
