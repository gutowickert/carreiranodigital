-- SEGURANÇA 14/10/2026 (e-mail do Supabase "Table publicly accessible", Security Advisor: 8 erros).
-- Rodado pelo Nando no SQL Editor em 14/10; os 8 erros sumiram. Estas tabelas só são usadas pelo
-- SERVIDOR com a chave de serviço (supabaseAdmin), que passa pela trava: ligar o RLS SEM nenhuma regra
-- fecha a chave pública (anon) e não muda nada pro sistema. Conferido antes: nenhuma tela lê direto do
-- navegador e nenhuma escuta ao vivo (postgres_changes). Tabela nova: SEMPRE com `enable row level security`.
alter table public.trafego_eventos      enable row level security;
alter table public.trafego_anuncios_dia enable row level security;
alter table public.trafego_anuncios     enable row level security;
alter table public.projeto_conquistas   enable row level security;
alter table public.assistente_mensagens enable row level security;
alter table public.assistente_alertas   enable row level security;
alter table public.chamadas             enable row level security;
-- a visão consulta com as travas de quem pede (security invoker), não com as do criador
alter view public.wa_disparo_resumo set (security_invoker = true);
