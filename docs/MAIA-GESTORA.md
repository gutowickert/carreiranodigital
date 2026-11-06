# Maia Gestora — a Maia vigiando os clientes do teunegócio OS (proposta pro Nando, 06/11/2026)

**A ideia do Guto:** a escola, a Wood, a Dani Fell e a Gaja já rodam no teunegócio OS. A gente tem acesso às contas de anúncio e aos CRMs. A Maia pode ler os dois todo dia e avisar o dono do que precisa de atenção. Esses 4 viram os primeiros cases do tráfego automático, das análises e dos avisos.

**O protótipo já roda** (só leitura): `AGENTE DE MARKETING/ferramentas/maia-gestora/vigia.js`. Rodou nos 4 em 06/11 e achou 21 avisos. As regras ficam em `lib/regras.js` (JS puro, sem dependência), e é só trazer pra `lib/maia/gestora.ts`.

---

## 1. O que já existe (não precisa fazer)

| peça | onde | serve pra |
|---|---|---|
| Vários negócios num sistema só | `maia_negocios` (`db/maia.sql`), com `meta.ad_account_id`, `dono_whatsapp`, `status` | cadastrar os 4 como negócios da Maia |
| Gasto por anúncio por dia dos clientes | `trafego_anuncios_dia` + cron `/api/projetos/trafego/sync` (9h UTC, `FB_ADS_TOKEN`) | Wood, Dani e Gaja **já são gravados todo dia**. A escola não (não é um "projeto") |
| Saldo da conta pré-paga | `getStatusConta()` em `lib/meta-ads.ts` | aviso "a conta vai parar por saldo" antes de parar |
| Limites de alerta de tráfego | `LIMITES` em `lib/monitor-entregas.ts` (dias sem gasto, saldo baixo, custo 2× o alvo) | os mesmos números valem pro vigia |
| Avisos sem repetir | `assistente_alertas` (chave única) e `lib/assistente-alertas.ts` | o mesmo jeito em `maia_avisos` |
| Rotina de hora em hora | `/api/maia/rotina` + `db/maia-cron.sql` (pg_cron) | é ali que o vigia entra |
| Falar com o dono no WhatsApp | `conversaDoDono()` + `mandaTexto()` em `lib/maia/canal.ts`, fila fora da janela de 24 h, modelo `MAIA_MODELO_DONO` | mandar o aviso |
| Equipe aprova antes do dono | `aprovacao_equipe` + peça tipo `relatorio` (`geraRelatorio`) | primeiras semanas: tudo passa pelo Guto |
| Resumo da semana | `relatoriosDaSemana()` (segunda, 7h) | o resumo do vigia substitui/completa |
| 500 chamadas da Marketing API | `lib/maia/chamadas.ts` (`MAIA_APP_ADS_TOKEN`, `MAIA_CHAMADAS_CONTAS`) | **ler as 4 contas todo dia conta pras 500 chamadas** |
| Envio de venda pra Meta | `lib/maia/conversoes.ts` (Maia) e `webhook_logs` (teunegócio OS) | o vigia lê os erros do `webhook_logs` |

## 2. O que falta

1. **Conector de leitura por cliente** (`lib/maia/gestora-crm.ts`): lê as tabelas do teunegócio OS (`leads`, `etapas`, `matriculas`, `lead_andamentos`, `wa_conversas`, `wa_mensagens`, `webhook_logs`, `orcamentos`, `orcamento_aberturas`) **só com GET** e só a janela de datas que precisa. A escola lê direto (mesmo banco). Os outros leem com uma chave só de leitura (`db/teunegocio-os-leitura.sql`), guardada na Vercel como `MAIA_CRM_<CLIENTE>_URL` / `MAIA_CRM_<CLIENTE>_LEITURA`.
   - Atenção: os CRMs não têm as mesmas colunas (a escola não tem `anuncio_titulo`, por exemplo). O protótipo tira a coluna que falta e tenta de novo.
2. **Tabelas novas** (`db/maia-gestora.sql`, não aplicado): `maia_avisos` (um por problema por dia), `maia_crm_dia` (a foto do dia), `maia_funil_semana` (funil por anúncio fechado na segunda), e as colunas `crm`, `gestora` e `projeto_id` em `maia_negocios`.
3. **O vigia dentro da rotina** (`lib/maia/gestora.ts`, chamado em `roda()`):
   - **de 2 em 2 horas, das 9h às 20h**: só as regras de Meta urgentes (gasto sem conversa, conta parou). É o que mais custa dinheiro se demorar.
   - **7h todo dia**: todas as regras, grava em `maia_avisos` e manda **uma** mensagem com os avisos do dia.
   - **segunda 7h**: o resumo da semana e o funil por anúncio.
4. **A escola como "projeto"** (ou ler a conta dela direto): hoje a conta 1294787635603943 não está em `projetos`, então o gasto diário dela não é gravado.
5. **Modelo de mensagem aprovado** pra aviso fora da janela de 24 h (`maia_aviso`: "{{1}}, tenho {{2}} avisos de hoje sobre {{3}}. Quer ver?").
6. **Aba "Avisos" no painel `/maia/operacao`**: lista por negócio, com "resolvido", "ignorar" e "ajudou?" (o `util` calibra os limites).
7. **Rascunhos da Meta**: o conector às vezes salva a mudança como rascunho. A leitura de rascunho hoje só existe no conector (MCP). Na API, ler `/{conta}/ads?effective_status=...` não mostra rascunho: fica como checagem manual por enquanto.

## 3. As regras (o método de 06/11 virado conta)

| aviso | de onde | quando dispara | caso real |
|---|---|---|---|
| gasto sem conversa | Meta | campanhas de WhatsApp gastaram R$ 15+ no dia e 0 conversas | Wood 06/11 (WhatsApp desligado da página) |
| conta parou de gastar | Meta | ontem < 20% da média de 7 dias, ou hoje < 10% depois do meio-dia | Escola (saldo pré-pago, 5 dias em 14), Gaja (4 dias em 14) |
| custo por conversa subiu | Meta | últimos 3 dias 60%+ acima da semana antes | — |
| mudança em rascunho | conector | mudança de verba salva e não publicada | Wood 06/11 (R$ 8 e R$ 12 por dia) |
| lead quente parado | CRM | etapa quente há 2+ dias sem andar | Wood 11 aprovaram a arte e não pagaram; Escola 15; Gaja 15 |
| primeira resposta lenta | CRM | mediana > 15 min nas conversas novas da semana | Dani 53 min |
| conversa sem resposta | CRM | última mensagem do cliente há 2+ h (últimos 3 dias) | Dani 7, Gaja 2 |
| prometeu voltar e não voltou | CRM | "vou confirmar / deixa eu ver / já te retorno" e a conversa morreu sem venda | Wood (Coyote), Escola 5, Dani 4 |
| pedido grande parado | CRM | cliente pediu 20+ unidades e não fechou | Wood 3 pedidos, 110 unidades |
| envio pra Meta falhando | CRM (`webhook_logs`) | 3+ erros de `capi*` em 7 dias | Escola 26× "sem conta do WhatsApp Business no conjunto de dados"; Gaja 8× "CAPI não configurado" |
| venda fora do card | CRM | venda num card sem anúncio, mas o mesmo telefone tem card de anúncio | — |
| etapa paga sem venda | CRM | etapa que já é paga (avaliação) sem venda lançada | Dani 40 avaliações |
| abriu a proposta | CRM (`orcamento_aberturas`) | abriu nos últimos 3 dias e não comprou | Escola 4 |
| conversa que não vende | Meta + CRM | 25+ contatos, 0 vendas, outro anúncio vende | Dani "Liberação Miofascial" (98 contatos, 0 vendas) |
| anúncio queimando | Meta + CRM | campanha de WhatsApp, R$ 80+ e ninguém no CRM | — |

**Regra de ouro (do método):** o aviso aponta, o dono decide. Nenhuma regra mexe em verba, pausa anúncio ou manda mensagem pro cliente final. "Tráfego automático" de verdade (mexer na verba) só depois de umas semanas de aviso certo, e sempre com o "sim" do dono na conversa.

## 4. Privacidade

- Na mensagem pro dono vai o **primeiro nome + inicial** do cliente final (ele precisa saber quem chamar). Nunca o conteúdo da conversa.
- **Área da saúde (Dani):** a mensagem não leva nome nem tratamento. O dono vê quem é no CRM dele.
- `maia_avisos` guarda os **ids** dos leads, não os nomes.
- Aviso de um cliente nunca cita outro cliente.
- Chave de CRM só na Vercel. Nunca em tabela, arquivo ou página.

## 5. O que precisa de cada cliente

| | Escola | Wood | Dani Fell | Gaja |
|---|---|---|---|---|
| CRM | nada (mesmo banco) | **chave de leitura** (hoje só login e senha do Guto) | chave de leitura (hoje é a de serviço) | chave de leitura (hoje é a de serviço) |
| Meta (gasto por anúncio) | entrar em `projetos` ou leitura direta | já grava todo dia | já grava todo dia | já grava todo dia |
| Envio pra Meta | **ligar a conta do WhatsApp Business ao conjunto de dados** | conferir | **ligar o conjunto de dados do WhatsApp à conta de anúncio** | **configurar o CAPI (faltam FB_PIXEL_ID / FB_CAPI_TOKEN)** |
| Outros | saldo pré-pago (aviso de saldo) | publicar ou descartar os rascunhos; permissão de anunciante na página | — | ver por que a conta para (4 dias em 14) |
| Dono | WhatsApp + "ok" pra receber | idem | idem | idem |

## 6. Plano em 3 semanas

**Semana 1 (até 13/11): avisos só pro Guto**
- Nando: aplicar `db/maia-gestora.sql`; criar a chave de leitura na Dani e na Gaja (`db/teunegocio-os-leitura.sql`); trazer `regras.js` pra `lib/maia/gestora.ts` e ligar na rotina, mandando tudo pro WhatsApp do Guto (`avisaEquipe`).
- Guto: todo dia marca cada aviso como "ajudou" ou "ruído". Arruma as 3 ligações da Meta (escola, Dani, Gaja).

**Semana 2 (até 20/11): o dono recebe**
- Escola e Wood primeiro (a Wood precisa da chave de leitura do CRM dela).
- Modelo `maia_aviso` aprovado na Meta. Resumo da semana na segunda 7h.
- Ajustar os limites com o que o Guto marcou.

**Semana 3 (até 27/11): os 4 e os números do case**
- Dani e Gaja recebendo.
- Medir pro case: quanto dinheiro parado voltou (leads quentes que fecharam depois do aviso), quantas horas a conta ficou parada antes x depois, a primeira resposta antes x depois.
- Próximo passo (não antes): sugestão de verba com base na venda do CRM ("passa R$ 10 do anúncio X pro Y?"), que só acontece com o "sim" do dono.
