# Maia: limites de segurança (12/11/2026)

Branch `maia-limites`. Feito na Janela da Maia (Nando + Claude). **Não publicado:** junta e publica o Nando, com o ok do Guto.

## Por quê

Antes do 1º cliente de verdade, a Maia tinha só um limite (40 respostas por conversa por dia). Faltavam tetos pra quando algo dá errado:

- **Verba:** nada impedia uma campanha com verba diária alta. O dono podia mudar a verba conversando com a Maia (`salvar_contexto`), e a campanha usava esse número.
- **Custo de IA:** era anotado, mas nada parava se disparasse (conversa em círculo, robô do outro lado).
- **Enxurrada:** muitos números novos de uma vez (ataque, disparo errado) e a Maia responderia todos com IA.
- **Demonstração:** o número da Maia é público. Sem teto, qualquer um com muitos números gasta a nossa IA.

## O que muda

Tudo em `lib/maia/limites.ts`. Cada teto tem um padrão no código, uma troca geral por variável e uma troca por negócio em `meta.limites` (painel → `atualizar_negocio`).

| Teto | Padrão | Variável | Por negócio | Passou, o que acontece |
| --- | --- | --- | --- | --- |
| Verba por dia | R$ 60 | `MAIA_TETO_VERBA_DIA` | `meta.limites.verba_max_dia` | Campanha não é criada (`criar_campanha`) nem ligada (`ativar_campanha`): erro com o motivo. O dono não salva verba acima disso pela conversa: a Maia diz que a equipe confirma, e a equipe é avisada. |
| Custo de IA no dia (Brasília) | R$ 20 | `MAIA_TETO_IA_DIA` | `meta.limites.ia_max_dia` | Até a meia-noite, a Maia para de responder clientes e o dono. O cliente recebe uma frase fixa ("uma pessoa da equipe responde aqui mesmo") e a conversa vai pro modo humano. O dono recebe UM recado e a equipe UM aviso urgente por dia. O 👍 do dono continua valendo (não usa IA). |
| Contatos novos na última hora | 30 | `MAIA_TETO_NOVAS_HORA` | `meta.limites.conversas_novas_hora` | Os novos dessa hora vão direto pro modo humano, com a frase fixa e o aviso de privacidade. Quem já conversava segue normal. Os simulados (55000…) não contam. Um recado pro dono e um aviso pra equipe por dia. |
| Demonstrações novas no dia | 40 | `MAIA_TETO_DEMOS_DIA` | — | A conversa conta na 1ª vez que chega na parte com IA (a 1ª resposta é fixa, sem custo). Passou: modo humano no número da Maia, sem IA, e um aviso pra equipe no dia. |

**Referência de custo** (08/11): uma conversa de cliente custa ~R$ 0,04 a 0,12 de IA. A franquia de 1.000 por mês dá ~33 por dia. R$ 20 num dia é umas 10 vezes um dia cheio: só estoura com algo errado. Anúncio bombando de verdade pode passar dos 30 contatos novos por hora: aí sobe o teto do negócio.

**Mudanças de apoio:**
- `lib/maia/db.ts`: opção `desde: [coluna, valor]` (filtro `>=` no banco), pra contar o dia sem trazer a tabela inteira.
- `lib/maia/custo.ts`: o custo do negócio usa esse filtro (antes listava todo o histórico de `uso_ia` e filtrava em JS).
- `app/api/maia/operacao`: ação `limites` (só leitura: os tetos e o uso de hoje de um negócio). O "salvar" do painel não apaga mais `meta.limites` sem querer (só sai mandando `limites: {}`).
- Novos tipos em `maia_eventos`: `limite_atingido` (motivo + texto, 1 por dia por motivo e negócio) e `demo_iniciada`.

## Teste que prova

`scripts/maia-teste-limites.mjs`, sem IA e no modo local (instruções no topo do arquivo). Resultado em 12/11: **18/18**.

- Verba: R$ 80 com teto 50 recusada e nada gravado; R$ 40 criada pausada; o teto sobrevive ao "salvar" do painel; o teto baixado pra 30 impede ligar a campanha de 40.
- IA do dia: cliente vai pro modo humano com a frase fixa; o 2º cliente também; a equipe é avisada 1 vez; o dono recebe 1 recado.
- Enxurrada: 31 contatos novos na hora → o 32º vai pra equipe, com o aviso de privacidade; contatos de 2 h atrás não contam.

**O que NÃO foi testado:**
- O teto das demonstrações: o fluxo usa as tabelas do Oito no banco da escola, que não têm modo local.
- A recusa da verba alta pela conversa com o dono: precisa de IA.
- O teste completo do Guto (`maia-teste.mjs`, 45 conferências) não rodou: a chave da Anthropic no `.env.local` desta máquina está vencida (401). Conferido sem IA: mensagem normal de cliente e de dono, num negócio sem gasto, passa pelos freios e chega na IA.
- **Antes de publicar:** rodar `maia-teste.mjs`, `maia-teste-piloto.mjs` e este teste numa máquina com a chave válida.

## Como desfazer

Cada teto: pôr um número alto na variável (ex.: `MAIA_TETO_IA_DIA=1000`) e fazer redeploy. Tudo: reverter os commits deste branch.
