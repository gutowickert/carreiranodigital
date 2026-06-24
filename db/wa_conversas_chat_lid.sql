-- Coluna pra guardar o @lid (identificador de privacidade do WhatsApp) de cada conversa.
-- SEM ela, o webhook não conseguia casar as mensagens que o vendedor envia do CELULAR
-- (que chegam só com o @lid) com a conversa do número real → a conversa do contato dividia.
-- Rode UMA vez no SQL Editor do Supabase.
alter table public.wa_conversas add column if not exists chat_lid text;
create index if not exists wa_conversas_chat_lid_idx on public.wa_conversas (chat_lid) where chat_lid is not null;
