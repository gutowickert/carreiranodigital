-- Maia (08/11, T16): rodar no banco NOVO da Maia, DEPOIS da cópia (scripts/maia-copiar-banco.mjs --executar).
-- As tabelas com id numérico (bigserial) receberam os ids do banco antigo: o contador precisa continuar depois do maior id,
-- senão a próxima linha nova bate num id que já existe. Pode rodar mais de uma vez.
select setval(pg_get_serial_sequence('maia_lead_eventos', 'id'), coalesce((select max(id) from maia_lead_eventos), 0) + 1, false);
select setval(pg_get_serial_sequence('maia_eventos', 'id'), coalesce((select max(id) from maia_eventos), 0) + 1, false);
