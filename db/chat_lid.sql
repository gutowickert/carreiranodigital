-- Guarda o chatLid (identificador estável do WhatsApp) na conversa, pra unir
-- mensagens recebidas (número real) com as enviadas pelo celular (que chegam
-- identificadas por @lid). Sem isso, responder pelo celular cria conversa duplicada.
-- Rode no SQL Editor do Supabase.

alter table public.wa_conversas add column if not exists chat_lid text;
create index if not exists wa_conversas_chat_lid_idx on public.wa_conversas (chat_lid) where chat_lid is not null;
