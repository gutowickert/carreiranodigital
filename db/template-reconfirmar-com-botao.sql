-- O TEMPLATE DA RECONFIRMAÇÃO, AGORA COM BOTÃO (24/09/2026).
-- Rode no SQL Editor do Supabase.
--
-- POR QUE UM NOME NOVO: o `cnd_reconfirmar_encontro` já foi submetido à Meta — sem botões, porque
-- a mudança que os habilita ainda não estava publicada na hora. Nome de template apagado na Meta
-- fica bloqueado por semanas, então não dá pra reaproveitar o mesmo. O antigo pode ser apagado lá
-- depois, sem pressa; ninguém vai usá-lo.
--
-- OS BOTÕES SÃO O PONTO: o clique volta sem ambiguidade nenhuma. O motor também entende resposta
-- digitada ("sim", "ok", "beleza"), mas isso é a rede de segurança — não o caminho principal.

UPDATE public.followup_templates
SET nome_meta = 'cnd_confirmar_encontro',
    status    = 'rascunho',      -- volta pra rascunho pra poder ser submetido de novo
    botoes    = 'Sim, confirmado|Não vou poder',
    atualizado_em = now()
WHERE chave = 'reconfirmar_encontro'
  AND org_id = '00000000-0000-0000-0000-0000000000cd';

-- conferência: tem que sair `rascunho`, com os dois botões e o texto que o Nando aprovou
SELECT chave, nome_meta, status, categoria, botoes, corpo
FROM public.followup_templates WHERE chave = 'reconfirmar_encontro';
