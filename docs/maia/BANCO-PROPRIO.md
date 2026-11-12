# Maia: banco próprio (T16) — 12/11/2026

Decisão do Nando em 12/11 ("quanto ao banco vamos fazer o próprio da Maia"). Feito na Janela da Maia. **A Maia em produção ainda usa o banco da escola**: a troca é colocar duas variáveis na Vercel da escola (passo 3 abaixo).

## O que já está feito (12/11)

- **Projeto Supabase `maia`** (`uxkmcjbaawplsqhzrpza`), organização CarreiraNoDigital, **região us-east-1**: a mesma da escola e das funções da Vercel (iad1). Em São Paulo, cada consulta atravessaria o continente duas vezes.
- **Estrutura:** `db/maia.sql` + `db/maia-social.sql` + `db/maia-gestora.sql` (sem a ligação de `projeto_id` com `public.projetos`, que só existe na escola). Comparado com o banco da escola, coluna por coluna, restrição por restrição, índice por índice, RLS e bucket: **idêntico**, fora essa ligação (271 × 270 linhas).
- **Dados (cópia de ensaio):** `scripts/maia-copiar-banco.mjs --executar` + `db/maia-banco-novo-sequencias.sql`. 2 negócios, 7 mídias, 10 peças, 23 contatos, 109 eventos de contato, 24 conversas, 219 mensagens, 10 tarefas, 131 eventos, 19 arquivos (6,8 MB), 0 erros. Na troca, rodar a cópia de novo (ela atualiza pelo id, não duplica).
- **Chaves:** em `.env.maia-db` na pasta de trabalho (fora do git; nunca mostradas): a senha do banco, `MAIA_SUPABASE_URL` e `MAIA_SUPABASE_SERVICE_KEY`.
- **Teste:** `scripts/maia-teste-banco-novo.mjs`, com o sistema apontando SÓ pro banco novo (o da escola com endereço falso, pra quebrar se algo ainda dependesse dele). Sem IA e sem Meta. **16/16**: painel diz `banco: proprio`, dados copiados inteiros, bucket privado, negócio, arquivo, campanha com teto e freio de IA gravam e leem no banco novo, e a limpeza não deixa sobra.
- **Conferido no código:** só `lib/maia/db.ts` fala com as tabelas `maia_*` e com o bucket `maia`. A demonstração (tabelas do Oito) e o webhook do número da Maia continuam no banco da escola, como previsto.

## A troca (falta: precisa de acesso à Vercel da escola)

1. A Vercel da escola é da conta do Guto. O Nando só enxerga o time NandoSystem. **O Guto convida o Nando pro projeto** (uma vez), ou ele mesmo põe as variáveis.
2. Rodar a cópia de novo (`--executar`) e `db/maia-banco-novo-sequencias.sql`. Hoje só tem dado de teste: não precisa pausar a Maia.
3. Vercel da escola, produção: `MAIA_SUPABASE_URL` e `MAIA_SUPABASE_SERVICE_KEY` (do `.env.maia-db`, pelo Terminal, sem mostrar) → Redeploy. O `MAIA_CRIPTO_CHAVE` continua o mesmo.
4. Conferir no painel: o resumo mostra `banco: proprio`.
5. Mudar a rotina de hora em hora (`maia-rotina`, pg_cron) do banco da escola pro novo, com a mesma chave, copiada de um banco pro outro sem aparecer na tela. Só depois do passo 4, senão roda duas vezes.
6. Depois de 1 semana estável: apagar as tabelas `maia_*` e o bucket `maia` do banco da escola.

## Como desfazer

Tirar as duas variáveis da Vercel e fazer redeploy: a Maia volta pro banco da escola (o código cai nele sozinho). O que foi gravado no banco novo nesse meio-tempo não volta sozinho: copiar de volta, se for o caso.
