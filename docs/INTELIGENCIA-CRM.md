# Inteligência do CRM — Carreira No Digital

> Mapa de toda a "inteligência" que o CRM acumula, pensado para alimentar um **sistema de geração de conteúdo** no futuro. Números do snapshot mais recente entre parênteses.

## 1. Contexto do negócio
Escola de **cursos presenciais de marketing digital no RS**. Produtos: **Formação Completa (FC)**, **Anúncios para Negócios Locais (ANL)**, **Imersão IA para Conteúdo (IAC)**, **Mapa Digital (MD)**. Cidades: Porto Alegre, Caxias do Sul, Lajeado, Novo Hamburgo, Canoas. Preço atual: FC R$2.297, ANL R$797.

O ativo mais valioso pra conteúdo **não são os números — é a linguagem real** dos clientes (conversas + ligações) e o que já sabemos que **converte**.

---

## 2. Os ativos de inteligência (o que o CRM guarda)

### A. Inteligência de CONVERSA  ← a mina de ouro pra conteúdo
- **`wa_conversas` (~1.670)** e **`wa_mensagens` (~11.000)** — conversas reais de WhatsApp (2 números: atendimento Z-API + disparos Cloud API).
- **585 áudios**, **314 já transcritos** (Deepgram, prefixo 🎤 no `wa_mensagens.texto`).
- **`ligacoes` (~290)** — ligações do API4COM transcritas (`metadata.transcricao`).
- **Contém:** dores, desejos, dúvidas, objeções e as **frases exatas** que o cliente usa — e as que o vendedor usa quando fecha. É daqui que saem hooks, headlines, FAQ e copy que soam como o cliente fala.

### B. Inteligência de FUNIL / CONVERSÃO
- **`leads` (280)** — etapa, vendedor, `valor_venda`, `motivo_perda_id`, atribuição UTM/fbclid, `data_ganho`/`data_perda`.
  - Distribuição: **34 ganho**, **117 perda**, resto ativo (atendimento inicial 43, agendado 30, lote/preço ok 22, próxima turma 18, aguardando pagamento 15).
  - Etapas: aguardando_atendimento → atendimento_inicial → lote_preco_ok / nao_chegou_preco → oferecer_bolsa → pediu_prazo → aguardando_pagamento → agendado → proxima_turma → **ganho** / **perda**.
- **`lead_andamentos`** — histórico de cada ação no lead (quem fez, quando, mudança de etapa, anotações).
- **`motivos_perda` (7):** Preço Alto · Sem orçamento · Não tem interesse · Comprou de concorrente · Sem resposta · Data não compatível · Outro. → cada um é um tema de conteúdo de quebra de objeção.

### C. Inteligência de OFERTA / PRODUTO
- **`turmas`** — produto, cidade, data de início, `preco_venda`, status (em_vendas), bolsa. Turmas abertas hoje: FC Lajeado/PoA/Caxias (R$2.297), ANL PoA (R$797).
- **`matriculas` (38)** / **`alunos` (48)** — quem comprou, forma de pagamento, `ltv`.

### D. Inteligência de ATRIBUIÇÃO / TRÁFEGO
- `leads.utm_source/utm_campaign/utm_content`, `fbclid`, **`wa_clicks`** — qual anúncio/campanha trouxe cada lead.
- Dashboard de Tráfego (Meta): gasto real por campanha/criativo × leads × vendas → **qual mensagem/criativo converte**.

### E. Inteligência FINANCEIRA
- `lancamentos_empresa`, `contas_financeiras`, `naturezas_financeiras`, `financeiro_turma` — receita, custos, taxa de checkout, margem por turma.

---

## 3. A camada de IA já construída (reaproveitável)
- **Copiloto** — `POST /api/copiloto/sugerir` `{leadId | conversaId}`: lê a conversa (texto + áudios, transcrevendo na hora) + turmas abertas e devolve `{objecao, dica, rascunho}`. Modelo **claude-opus-4-8** (Anthropic SDK).
- **Análise de Conversão** — `GET/POST /api/analise-conversao`: relê conversas reais → `{resumo, o_que_funciona[], o_que_nao_funciona[], melhor_fluxo[], frases[]}` com exemplos reais. Guardada em `webhook_logs` (origem `analise-conversao`).
- **Playbook de Conversão** — `docs/playbook-conversao.md` (v3): estrutura de conversão destilada das vendas reais (texto + áudio + ligações).

---

## 4. Achados-chave do playbook (vão direto pra conteúdo)
- **Objeção de horário** ("trabalho à noite") é o **deal-killer nº1** — e a **turma da tarde** quase nunca é oferecida. (Perdemos vendas por isso.)
- **~81% das vendas tiveram áudio** — áudio pessoal de aproximação converte muito mais que só texto.
- **Descoberta antes do pitch** (perguntar o negócio/objetivo) separa ganho de perda.
- **Sinal de R$100 no Pix do CNPJ** = jogada de ouro de fechamento pra quem "não tem à vista".
- Reassurances que funcionam: **"é pra quem começa do zero"**, **"o curso vai acontecer mesmo"**, **"tu sai com o marketing do teu negócio rodando, não com apostila"**.

---

## 5. Como isso alimenta um gerador de conteúdo (ideias concretas)
| Fonte no CRM | Vira que conteúdo |
|---|---|
| `motivos_perda` + objeções reais das conversas | Posts/reels de **quebra de objeção** (1 por objeção) |
| Frases de dor/desejo em `wa_mensagens`/`ligacoes` | **Hooks e headlines** que soam como o cliente |
| Perguntas mais frequentes nas conversas | **FAQ / carrossel** |
| Linguagem dos `alunos` que compraram | Copy estilo **depoimento/prova social** |
| Ângulos vencedores (Tráfego + playbook) | **Roteiros de anúncio** |
| `turmas` em vendas (cidade/data/preço/bolsa) | Conteúdo de **urgência/vagas** |
| `o_que_funciona[]` da Análise de Conversão | **Temas semanais** que já sabemos que engajam/fecham |

---

## 6. Pontos de conexão técnica (pra plugar no futuro)
- **Banco:** Supabase (Postgres). Acesso por `service_role` (server-side) ou pela mesma lib `@/lib/supabase`.
- **Tabelas-núcleo:** `leads`, `lead_andamentos`, `matriculas`, `alunos`, `turmas`, `wa_conversas`, `wa_mensagens`, `ligacoes`, `motivos_perda`, `financeiro_turma`, `wa_clicks`.
- **IA:** Anthropic SDK já integrado (`ANTHROPIC_API_KEY` na Vercel), modelo `claude-opus-4-8`. STT: Deepgram (`DEEPGRAM_API_KEY`).
- **Endpoints reaproveitáveis:** `/api/copiloto/sugerir`, `/api/analise-conversao`.
- **Padrão de corpus:** `lib/analise-conversao.ts` já monta o corpus de conversas (paginado) — bom ponto de partida pra um "corpus de conteúdo".

### Sugestão de arquitetura pro gerador de conteúdo
1. **Extrator** — job que lê conversas/ligações/motivos de perda e destila em "insumos" (dores, objeções, frases, perguntas) num store próprio.
2. **Gerador** — Claude gera peças (posts, reels, anúncios, e-mails) a partir dos insumos + turmas abertas.
3. **Atrelamento ao CRM (futuro):** segmentar conteúdo por etapa/motivo (ex: nutrir quem está em `pediu_prazo` com prova social; reconquistar `perda` por "Preço Alto" com conteúdo de valor/parcelamento).
