# Maia: ajustes antes do 1º cliente piloto (07/11/2026)

Branch `maia-ajustes-piloto` (worktree `C:\maia-ajustes`), feita a partir do `origin/main` (086776e).
**Nada foi publicado, nenhum SQL foi rodado, nenhuma chave foi mudada e nenhuma mensagem real saiu.**
Tudo espera o sim do Guto.

## SQL novo

**Nenhum.** Tudo cabe no que já existe no banco:

- as escolhas de cada negócio ficam em `maia_negocios.meta.atendimento` (JSON que já existe);
- os registros (fila, modelos, mídias, apagamentos, avisos) ficam em `maia_eventos` (já existe);
- as mídias dos clientes ficam no bucket privado `maia` que já existe, na pasta `<negocio>/clientes/<conversa>/`.

`meta.atendimento` fica assim (tudo opcional; sem nada, vale o padrão):

```json
{
  "tom": { "pessoa": "voce", "gaucho": false, "estilo": "leve" },
  "privacidade": { "ligado": true, "texto": "…", "link": "https://…" },
  "franquia": 1000,
  "fuso": "America/Sao_Paulo"
}
```

Ele só muda pela ação `config_atendimento` do painel. Salvar os outros dados do negócio não apaga isso.

## O que mudou, item por item

### 1. Áudio e foto do cliente
- O áudio é transcrito (Deepgram, a mesma função do dono) e a foto é descrita pela IA.
- O arquivo fica guardado na pasta do negócio (`maia/<negocio>/clientes/<conversa>/`), **fora** da biblioteca de fotos dos anúncios.
- Não deu pra baixar, ouvir ou ver: a Maia responde com uma frase fixa, sem IA ("Não consegui ouvir esse áudio. Consegue me escrever o que precisa, por favor?"). Nunca finge.
- Comprovante de pagamento em foto: a Maia diz que recebeu e que o dono confere. O dono é chamado no WhatsApp. A venda **não** é marcada sozinha.
- No webhook, áudio e foto são processados depois de responder 200 pra Meta.
- O simulador do painel ("Falar como um cliente do negócio") aceita foto e áudio.
- **Como ligar:** já vem ligado. Precisa de `DEEPGRAM_API_KEY` na Vercel (já usada pelo dono).

### 2. Tom por negócio
- Painel → negócio → Dados → card **"Jeito de falar com os clientes"**: tratamento (você/tu), jeito gaúcho (sim/não), estilo (leve/formal).
- Padrão: **"você", neutro e leve**. Com o dono, a Maia continua do jeito dela ("tu", gaúcho).
- Vale no atendimento e no texto da retomada (dentro das 24 h).
- **Como ligar:** já vem ligado (padrão "você"). Pra Bocadinho ou aluno gaúcho, trocar no card.

### 3. Retomada só de dia
- Retomadas pro cliente, lembretes e perguntas pro dono que a rotina manda sozinha: só **das 9h às 20h**, no fuso do negócio (Brasília por padrão), e **nunca no domingo antes das 10h**.
- Fora disso, a retomada não sai e não conta como tentativa: fica pra próxima rodada dentro da janela.
- Vale também quando a equipe força a rotina pelo painel.
- Resposta a quem escreveu não tem horário (é na hora).
- **Como ligar:** já vem ligado. Fuso de outro lugar: `meta.atendimento.fuso`.

### 4. Modelo maia_resposta em uso
- Quando o dono responde a pergunta de um cliente, ou a equipe manda pelo painel (campo novo na conversa do cliente), **depois de 24 h** da última mensagem dele:
  - a resposta fica guardada e sai o modelo aprovado `maia_resposta` ("Já tenho a resposta da sua pergunta... Posso te mandar?");
  - quando o cliente responde, a resposta guardada é entregue (e a Maia não responde por cima).
- Modelo **não aprovado**: a resposta fica guardada do mesmo jeito (sai quando o cliente escrever) e a equipe e o dono são avisados.
- O status dos modelos é perguntado à Meta e guardado por 1 h.
- **Como ligar:** já vem ligado. Precisa do `maia_resposta` aprovado em cada negócio (Painel → Modelos).

### 5. Conversa volta sozinha pra Maia
- Conversa de cliente passada pro dono (ou assumida pela equipe) volta pra Maia **depois de 24 h** sem o dono ou a equipe falar nela. O dono fica sabendo. Se o cliente ficou esperando, a equipe é avisada.
- O dono pode pedir no WhatsApp: "devolve pra Maia", "Maia, pode atender a Carla de novo". Funciona na hora, sem depender da IA.
- Pergunta de cliente esperando o dono: **lembrete pro dono em 1 h** (só de dia) e **aviso pra equipe em 3 h**.
- O cliente nunca fica sem prazo: "vou confirmar e te respondo hoje até as 16h" (calculado dentro da janela das 9h às 20h; sábado à noite vira "amanhã até as 12h").
- Se a IA prometer "vou confirmar" sem perguntar ao dono, o sistema pergunta sozinho.
- **Como ligar:** já vem ligado (roda na rotina de hora em hora).

### 6. Gancho
- Saiu a regra de "cidade e região" em todo gancho (peças e demonstração).
- Regra nova (06/11): **público + situação primeiro**, região com leveza e só quando ajuda.
- **Como ligar:** já vem ligado.

### 7. Contador das 1.000 conversas
- **O que é uma "conversa":** cada contato diferente (telefone) que mandou **pelo menos uma mensagem** pro WhatsApp do negócio no mês do calendário (do dia 1 às 0h, no fuso do negócio). O mesmo cliente escrevendo 30 vezes no mês = 1 conversa. Voltou no mês seguinte = conta de novo.
- Não contam: conversas simuladas (telefone 55000..., painel, testes), a conversa do dono com a Maia, e retomada que o cliente não respondeu.
- Contato apagado a pedido continua contando no mês em que conversou.
- Painel → negócio → Dados → card **"Conversas do mês"**: uso, % da franquia, custo de IA do mês e por conversa. Campo da franquia no card do jeito de atender (padrão 1.000).
- A equipe é avisada **uma vez em 80% e uma em 100%**. **Nunca bloqueia o atendimento.**
- API: `GET /api/maia/operacao?acao=uso_mes[&negocio=<id>]`.
- **Como ligar:** já vem ligado.

### 8. LGPD mínima
- **(a) Aviso de privacidade** no fim da 1ª resposta a um cliente novo: atendimento por IA, mensagens guardadas só pra atender, dá pra pedir pra apagar. Segue o tom (você/tu). Configurável por negócio (ligado, texto próprio, link https).
- **(b) Apagar dados:** Painel → negócio → Conversas → conversa do cliente → **"Apagar dados"** (pede confirmação). Apaga conversa, mensagens, contato do funil, histórico, as fotos e áudios dele e os registros técnicos ligados. **Só do negócio dele**: pedir com a conversa de outro negócio dá erro. O telefone dele nos recados da Maia pro dono vira `[apagado]`. Fica um registro `contato_apagado` só com contagens (sem nome nem telefone).
- Se o cliente pedir pra apagar, a Maia passa a conversa pro dono e a equipe apaga pelo painel.
- **Como ligar:** já vem ligado (aviso ligado por padrão).

### 9. Escola: a brecha do "vercel-cron"
- 12 rotas de cron aceitavam o user-agent "vercel-cron" como senha: `/api/analise-conversao/cron`, `/api/admin/transcrever-ligacoes/cron`, `/api/assistente/{alertas,bom-dia,relatorio,semana}`, `/api/ia/cron`, `/api/atendimento/orquestrar`, `/api/projetos/trafego/sync`, `/api/recado/{meta-sync,publicar,vigia}`.
- Agora só vale `Authorization: Bearer CRON_SECRET` (`lib/cron-auth.ts`), que a Vercel manda sozinha nos crons do `vercel.json` **quando `CRON_SECRET` existe no projeto**. A chave do pg_cron (`?chave=`) das rotas do assistente e do Recado continua valendo.
- **ANTES DE PUBLICAR:** conferir que `CRON_SECRET` está na Vercel (Production). Sem ela, esses crons param de rodar (ficam fechados, nunca abertos).

### Extras achados no teste
- Depois de marcar ganho ou perda, a mesma resposta da IA não volta a etapa pra trás.
- Regra da etapa "proposta" mais clara ("quero 1" depois de saber o preço = proposta).

## Testes

Em modo local (nada sai pra Meta nem pro banco):

```
npx next build
MAIA_LOCAL=1 MAIA_LOCAL_PASTA=.teste-maia-piloto MAIA_PAINEL_SENHA=teste123 MAIA_OFICINA_CHAVE=oficina123 npx next start -p 3195
node scripts/maia-teste-piloto.mjs http://localhost:3195 teste123     # 54 conferências
node scripts/maia-teste.mjs http://localhost:3195 teste123            # 45 conferências (apagar a pasta antes)
```

No modo de teste há ações que só funcionam localmente: `teste_fechar_janela`, `teste_modelos_status`, `teste_humano_antigo`, `teste_pergunta_antiga` e o `relogio` do `rodar_rotina`.
O `maia-teste.mjs` agora roda a rotina "às 14h de hoje" (senão, de noite, a retomada não sairia).

## O que ficou de fora
- Os modelos `maia_retomada` e `maia_resposta` que já foram pedidos à Meta usam "tu" ("Tu tinha falado com a gente..."). Pra negócio com "você", precisa pedir modelos novos (ex.: `maia_retomada_voce`).
- O texto dos anúncios continua em "tu" (o tom por negócio vale só no atendimento).
- Apagar dados não mexe nos avisos internos pra equipe (`aviso_equipe`), que podem citar o nome do cliente, nem no nome dele dentro de recados pro dono (só o telefone é trocado).
- Limite de mensagens por conversa do cliente e botões "fechou / não fechou".
- A Maia não responde em áudio no atendimento (só entende).
