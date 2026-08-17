# setup-nucleo — artefatos prontos pra Fase 1 (extração)

Complementa o roteiro [../docs/13-ROTEIRO-IMPLANTACAO-NANDO.md](../docs/13-ROTEIRO-IMPLANTACAO-NANDO.md).
Referência do que fica/sai: [../docs/12-INVENTARIO-NUCLEO.md](../docs/12-INVENTARIO-NUCLEO.md).

> ⚠️ Tudo aqui roda no **banco NOVO (a cópia)** — nunca no banco da escola.

## Ordem

### 1) Exportar o schema da escola (READ-ONLY, seguro)
Um comando só, contra o projeto da ESCOLA. É **leitura pura** (não altera nada). Duas formas:

- **Supabase CLI:** `supabase db dump --schema public -f schema.sql`
- **ou pg_dump:** `pg_dump --schema-only --no-owner --no-privileges "<DB_URL_ESCOLA>" > schema.sql`
- **ou** Dashboard do Supabase → Database → export do schema.

Guarda o `schema.sql` aqui nesta pasta.

### 2) Criar o Supabase NOVO e aplicar o schema
Aplica o `schema.sql` no projeto novo (o do produto/teste).

### 3) Remover as tabelas de escola
Roda o **`01-drop-escola.sql`** (já pronto nesta pasta) no banco NOVO. Tira as 38 tabelas de escola; mantém o núcleo.

### 4) Seguir o roteiro
Volta pro [doc 13](../docs/13-ROTEIRO-IMPLANTACAO-NANDO.md), passo 1.4 (apagar páginas/APIs/libs) em diante.

## Arquivos
- `01-drop-escola.sql` — DROP das tabelas SAI (pronto).
- `schema.sql` — tu gera no passo 1 (não vem no repo; sai da escola read-only).
