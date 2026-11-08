-- MAIA GESTORA (T15, 08/11/2026): os 4 primeiros negócios que a Gestora vigia (escola, Wood, Dani Fell, Gaja).
-- NÃO APLICADO. Rodar no SQL Editor do Supabase da escola (o mesmo banco das maia_*), DEPOIS do db/maia-gestora.sql
-- (as colunas crm, gestora, projeto_id e o plano 'gestao' já existem em produção: conferido só lendo em 08/11).
-- Sem chave nenhuma aqui: só o NOME das variáveis (MAIA_CRM_*), que ficam na Vercel.
--   dono_whatsapp vazio de propósito: na semana 1 só a equipe recebe (avisaEquipe). Quando o dono for receber direto,
--   preencher o telefone dele (é único: nunca o mesmo número de outro negócio) e pôr o id em MAIA_GESTORA_DONOS.
--   status 'implantacao': a Gestora lê e avisa a equipe; o atendimento da Maia não liga pra esses negócios.
--   gestora.rascunhos: a lista de mudanças em rascunho na Meta (a API não mostra rascunho; quem vê no conector anota aqui).

insert into maia_negocios (nome, nicho, cidade, plano, status, dono_nome, meta, crm, gestora, projeto_id)
select * from (values
  ('Escola Carreira no Digital', 'educação', 'Lajeado', 'gestao', 'implantacao', 'Guto',
   '{"ad_account_id":"1294787635603943"}'::jsonb,
   '{"tipo":"teunegocio","mesmo_banco":true}'::jsonb,
   '{"etapas_quentes":{"ligacao_boa":"proposta enviada","lote_preco_ok":"urgência enviada","aguardando_pagamento":"aguardando pagamento"},"conta_prepaga":true}'::jsonb,
   null::uuid),
  ('Wood', 'gravação a laser', 'Arroio do Meio', 'gestao', 'implantacao', 'Anderson',
   '{"ad_account_id":"2047099432524113"}'::jsonb,
   '{"tipo":"teunegocio","url_env":"MAIA_CRM_WOOD_URL","chave_env":"MAIA_CRM_WOOD_LEITURA"}'::jsonb,
   '{"etapas_quentes":{"arte_enviada":"arte enviada","ajuste_arte":"ajuste de arte","aguardando_pagamento":"aprovou a arte, falta pagar"},"preco_unidade_pedido_grande":31}'::jsonb,
   'a4798bb4-7e1f-45e6-9735-9472ec1a576d'::uuid),
  ('Espaço Dani Fell', 'estética', 'Estrela', 'gestao', 'implantacao', 'Dani',
   '{"ad_account_id":"700074957222765"}'::jsonb,
   '{"tipo":"teunegocio","url_env":"MAIA_CRM_DANI_URL","chave_env":"MAIA_CRM_DANI_LEITURA"}'::jsonb,
   '{"saude":true,"etapas_quentes":{"lote_preco_ok":"pensando (já fez a avaliação)","nao_compareceu":"faltou na avaliação"},"etapas_pagas":["lote_preco_ok"],"etapa_paga_nome":"avaliação feita (R$ 200)","valor_etapa_paga":200}'::jsonb,
   '31f4df9a-43ca-4d94-90db-9f7a47c86569'::uuid),
  ('Gaja Seguros', 'seguros', 'Lajeado', 'gestao', 'implantacao', 'Jhones',
   '{"ad_account_id":"2194662637340244"}'::jsonb,
   '{"tipo":"teunegocio","url_env":"MAIA_CRM_GAJA_URL","chave_env":"MAIA_CRM_GAJA_LEITURA"}'::jsonb,
   '{"etapas_quentes":{"aguardando_dados":"aguardando dados","lote_preco_ok":"cotação enviada","oferecer_bolsa":"negociação","aguardando_pagamento":"fechado, emitindo"}}'::jsonb,
   '505f4f7a-2a42-4e38-a9cc-8c0ec1481c88'::uuid)
) as v(nome, nicho, cidade, plano, status, dono_nome, meta, crm, gestora, projeto_id)
where not exists (select 1 from maia_negocios n where n.plano = 'gestao' and n.nome = v.nome);
