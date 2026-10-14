-- MODELO "DEU VENDA: NOVO FORMATO" (escola, 14/10/2026, texto aprovado pelo Nando)
-- Pra reabrir conversa com quem se interessou pelo Deu Venda e parou de responder (fora das 24h só
-- sai modelo aprovado pela Meta). Oferta: o novo formato do Deu Venda (a Imersão Deu Venda).
-- Cadastrado pela API do banco em 14/10 e enviado à Meta pela rota /api/wa-oficial/criar-templates.
INSERT INTO public.followup_templates (org_id, chave, etapa, produto, nome_meta, categoria, tipo_janela, ordem, corpo, variaveis, status, ativo)
SELECT '00000000-0000-0000-0000-0000000000cd', 'deu_venda_novo_formato', NULL, 'deu_venda', 'cnd_deu_venda_novo_formato', 'marketing', 'template', 962,
       'Oi {{nome}}, aqui é da Carreira no Digital. Como tu se interessou pelo Deu Venda, queria te contar que abrimos um novo formato dele, com mais de 50% de desconto. Se quiser saber como funciona, é só responder esta mensagem.',
       'nome', 'rascunho', true
WHERE NOT EXISTS (SELECT 1 FROM public.followup_templates WHERE nome_meta = 'cnd_deu_venda_novo_formato');
