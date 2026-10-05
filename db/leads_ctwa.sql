-- Anúncio direto pro WhatsApp (Click-to-WhatsApp), 05/10/2026.
-- ctwa_clid: o id do clique que a Meta manda no cartão de origem da 1ª mensagem. É com ele que a
--            venda e o lead qualificado voltam pra Meta pelo canal de mensagens (lib/ctwa.ts).
-- anuncio_id: o id do anúncio de onde a conversa veio (o nome vai em utm_content, como nos outros leads).
alter table leads add column if not exists ctwa_clid text;
alter table leads add column if not exists anuncio_id text;
