-- Canal da conversa/mensagem: 'zapi' (atendimento, número antigo) ou 'oficial' (disparos, Cloud API).
-- Reaproveita as tabelas da caixa de entrada, separando os dois números por canal.
alter table wa_conversas add column if not exists canal text not null default 'zapi';
alter table wa_mensagens add column if not exists canal text not null default 'zapi';

-- garante que tudo que já existe fica como 'zapi' (caixa atual)
update wa_conversas set canal = 'zapi' where canal is null;
update wa_mensagens set canal = 'zapi' where canal is null;

-- a caixa de disparos casa conversa por (telefone, canal)
create index if not exists idx_wa_conversas_canal on wa_conversas (canal, ultima_msg_em desc);
