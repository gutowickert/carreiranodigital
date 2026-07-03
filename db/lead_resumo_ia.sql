-- Resumo da negociação por IA, cacheado no lead (aparece no card do CRM).
-- Gerado a partir da conversa do WhatsApp + andamentos. Regenera quando entra
-- mensagem/andamento novo (ou no botão "Atualizar"). Rode no SQL Editor do Supabase.

alter table public.leads add column if not exists resumo_ia jsonb;
alter table public.leads add column if not exists resumo_ia_em timestamptz;
