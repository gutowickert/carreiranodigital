-- A unicidade da conversa passa a ser por (telefone, canal): o mesmo número pode
-- existir na caixa de atendimento (zapi) E na de disparos (oficial).
-- Antes era unique(telefone), o que impedia a 2ª caixa de criar a conversa.
alter table wa_conversas drop constraint if exists wa_conversas_telefone_key;
alter table wa_conversas add constraint wa_conversas_telefone_canal_key unique (telefone, canal);
