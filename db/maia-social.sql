-- Maia: social media e devolução de conversas/vendas pra Meta (06/11). Quem aplica é o Guto.
-- A agenda, os resultados e os envios pra Meta usam as tabelas que já existem (maia_pecas + maia_eventos com detalhe JSON:
-- 'social_post', 'social_resultado', 'social_analise', 'social_publicado', 'capi'; o clique do anúncio em maia_lead_eventos 'ctwa').
-- A única mudança: o lead pode nascer com origem 'instagram' ou 'facebook' (o link do perfil com "Vim pelo Instagram").
-- Enquanto isso não for aplicado, o código grava 'organico' e guarda a origem certa no evento 'criado' do lead.
alter table maia_leads drop constraint if exists maia_leads_origem_check;
alter table maia_leads add constraint maia_leads_origem_check check (origem in ('anuncio','organico','indicacao','dono','outro','instagram','facebook'));

-- pra rotina achar rápido os posts e os envios de cada negócio
create index if not exists maia_eventos_tipo_neg on maia_eventos(tipo, negocio_id, criado_em);
