# Lançamento da Maia pra base (15/11/2026)

A Maia atende, no WhatsApp da escola (51 99505-4548), só quem está na lista do lançamento. O resto do número segue com a IA do CRM, como sempre. Tudo só liga com `MAIA_LANCAMENTO_LIGADO=1` na Vercel.

Plano: https://claude.ai/artifact/7g9gPK37szMSRD62H8KMPX · Textos dos modelos: `docs/maia/LANCAMENTO-TEXTOS.md`

## Como funciona

1. **A lista (a "etiqueta maia") e o funil "Lançamento Maia"**: tabela `maia_lanc_contatos` (o CRM não tem etiqueta nem vários funis, então o funil é próprio). Etapas: Na lista → Disparado → Quero ver → Coletando → Material recebido → Amostra em produção → Amostra entregue → Testou → Fechamento (Rick) → Implantação marcada → Pago, e Agora não / Perdido. Entra pelo `scripts/maia-lancamento-importar.mjs`.
2. **Disparo**: tela de Disparos do CRM, público "Lançamento Maia" (remessa e versão do modelo). Variável 1 = `{nome}`. Cabeçalho: o link do encarte. A rotina de hora em hora marca "Disparado" quem recebeu.
3. **Modo Maia** (`lib/maia/lancamento/conversa.ts`): o webhook da escola (`app/api/wa-oficial/webhook`) pergunta se o número está na lista. Se está, a mensagem fica na caixa do CRM (o time vê tudo, e o que a Maia manda aparece com "[Maia]") e quem responde é a Maia. Ela espera uns 7 segundos (a pessoa manda várias fotos seguidas) e responde uma vez. A coleta é uma pergunta por vez: o que vende e pra quem, cidade, 2 ou 3 produtos com preço, como vende e horário, o que mais vende, a maior dificuldade, Instagram, 3 a 5 fotos e vídeos curtos, e a hora da entrega (amanhã às 10h ou às 15h; domingo pula pra segunda). "Agora não" agradece e para. Quem não tem negócio recebe o convite de indicação. Pergunta fora do roteiro vai pro time (fila "Dúvidas"). Pergunta de preço na coleta: "te mostro junto com a amostra". Sem limite de amostras por dia.
4. **Tela da equipe**: `/maia/operacao/lancamento.html` (a mesma senha do painel). Contadores por etapa, filas (Pra produzir, Rick: mandar áudio, Dúvidas, Retomada à mão, Aprovadas esperando a hora, Teste do time), e cada pessoa com a coleta, as fotos e os vídeos pra baixar, os 3 lugares da amostra (subir/trocar à mão ou "Gerar com a oficina" e escolher), a conversa pronta (editável) e "Aprovar e entregar" (na hora combinada ou agora).
5. **Página da amostra**: `/maia/amostra/<token>` (pública só depois de aprovada; a equipe vê a prévia antes). Conta as aberturas (sem contar a prévia do link do WhatsApp). A 1ª abertura põe a pessoa na fila do Rick.
6. **Teste ao vivo**: o botão da página abre o WhatsApp da escola com "...(modo teste)". A Maia responde como atendente daquele negócio, só com o que a pessoa contou; o que não sabe, "aprende na implantação". Sai com "sair" (não vira opt-out) ou depois de 30 min parado. Registra "Testou" e põe na fila do Rick.
7. **Fechamento e retomadas**: quem abre, testa, quer fechar ou tem dúvida depois da amostra vai pra fila "Rick: mandar áudio", com aviso pro Guto (WhatsApp do número da Maia + celular). Retomadas de quem parou na coleta ou não reagiu à amostra: ~20 h (texto), 3 dias e 6 dias (despedida), das 8h às 21h. Fora das 24 h só com modelo aprovado; sem modelo, vão pra fila "Retomada à mão".

Aviso pro Guto: só primeiro nome + negócio, nunca telefone nem as respostas.

## Variáveis na Vercel

| Variável | Valor | Obrigatória |
|---|---|---|
| `MAIA_LANCAMENTO_LIGADO` | `1` liga; sem ela nada muda no número da escola | sim |
| `MAIA_PAINEL_SENHA` | já existe (a senha do painel da equipe) | já tem |
| `MAIA_LANC_MODELO_ENTREGA` / `MAIA_LANC_MODELO_ENTREGA_BOTAO` | modelo pra entregar a amostra fora das 24 h | não |
| `MAIA_LANC_MODELO_RETOMADA` / `MAIA_LANC_MODELO_DESPEDIDA` | modelos das retomadas de 3 e 6 dias | não |
| `MAIA_LANC_ESPERA_MS` | espera antes de responder (padrão 7000) | não |
| `MAIA_LANC_TESTE_MIN` | minutos parado até sair do modo teste (padrão 30) | não |
| `MAIA_LANC_IA` | `0` desliga a IA da coleta e do teste (ficam as regras simples) | não |

A rotina de hora em hora (`/api/maia/rotina`, agendada no banco) faz as entregas na hora combinada, as retomadas e fecha o teste parado.

## Teste

```
rm -rf .teste-lancamento .next-teste-lanc
MAIA_LOCAL=1 MAIA_LOCAL_PASTA=.teste-lancamento MAIA_PAINEL_SENHA=teste123 MAIA_SEM_AVISO=1 NEXT_DIST_DIR=.next-teste-lanc npx next dev --webpack -p 3231
node scripts/maia-teste-lancamento.mjs http://localhost:3231 teste123 .teste-lancamento
```
