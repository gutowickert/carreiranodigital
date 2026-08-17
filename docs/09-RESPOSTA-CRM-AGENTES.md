# Resposta do lado CRM aos Agentes — 17/08/2026

Documento forte. Concordamos com os 3 frames: **Conversão = atendimento IA do CRM** · **o contexto DERIVA (não vira config)** · **uma base, com as duas condições**. Respostas diretas.

## As 6 perguntas

**1 · Quem traduz contexto → resposta ao vivo:** o **CRM, na hora.** A IA de atendimento lê o contexto **+ o histórico REAL da conversa** (o dossiê inteiro do lead: as duas pontas do WhatsApp, ligações, andamentos) e compõe a resposta ao vivo — não quer roteiro pronto. **O degrau é nosso e está escrito:** a tradução mora no prompt da IA de atendimento do CRM, alimentado pelo config do contexto. Vocês entregam a *decisão* (objeção + prova); a gente *executa* ao vivo, com o que a pessoa acabou de dizer.

**2 · Chave de identidade:** o `id` interno (uuid, estável) é a verdade. O casamento no WhatsApp é por **telefone** (primário) + **email/CPF** (secundário, quando aparecem). Honesto: **troca de número quebra o casamento automático** (vira lead novo até merge manual). Limitação real — por isso vale o contexto/1º contato guardar email/CPF como âncora além do número.

**3 · Estados da venda:** o funil é **config por empresa** (etapas editáveis). Na escola hoje: …→ `agendado` → `aguardando_pagamento` (combinado, não pago) → `ganho` (pago) → `perda`. **Sim, existe separação** combinado vs pago. Os 3 de vocês (combinado → confirmado → perdido) mapeiam direto — e a **tradução a gente escreve** (item 3). Concordo com o alerta: sem tradução escrita, cada painel mostra número diferente pro mesmo mês.

**4 · Devolve pro Meta: SIM, já.** O CRM tem CAPI (`/api/capi/purchase`): dispara **Purchase** com **fbc/fbp** (click IDs capturados no 1º contato pelo tracking) + email/telefone com hash + externalId + valor. → **Resolve o item 4: quem devolve é o CRM. Os agentes NÃO devolvem, senão o Meta conta 2×.** Sobre janela e identificador exato: **não assumir número** — confirmamos na doc atual do Meta antes de prometer em aula.

**5 · Como o agente local lê o CRM:** o agente **puxa** (pull), não recebe push (máquina local não segura webhook). Duas formas: (a) **API de leitura** do CRM com chave escopada; (b) o CRM escreve um **export** periódico na pasta compartilhada que o agente lê. Recomendo (a) pro resultado de conversão, (b) pro update-back em lote. É o item 5 — fechamos quando for a hora.

**6 · O que o CRM precisa do contexto além da lista de vocês:**
- **`assistente`** — nome e como se apresenta (a trava "sou o assistente, não o dono" precisa disso).
- **`produtos[]`** — catálogo curto (a IA responde "vocês fazem X?").
- **`info_operacional`** — horário, endereço, contato, formas de pagamento (o que a IA resolve sozinha).
- **`handoff_humano[]`** — quando a IA PARA e passa pro dono (desconto, exceção, reclamação, negociação). É a fronteira "IA resolve info, dono fecha venda."

## O bloco derivado (item 1 — o urgente): concordamos 100%
`contexto.md` fica prosa/do dono; `contexto.config` **deriva** dele. Proposta de v1 dos campos (a fechar juntos):

```
negocio            { nome, o_que_faz, cidade_regiao? }
assistente         { nome, como_se_apresenta }
tratamento         "tu" | "voce"
palavras_proibidas []
tom                <resumo curto>
ofertas            [ { nome, piso, teto, preco, forma_pagamento } ]
produtos           [ { nome, descricao_curta } ]
antitese           <objeção nº1, nas palavras do cliente>
provas             [ { tipo, caminho, derruba_qual_objecao, validade } ]
tempo_decisao_dias N
capacidade_semanal N
porta              <produto de entrada>
info_operacional   { horario, endereco, contato, formas_pagamento }
handoff_humano     [ <desconto, exceção, reclamação, negociação> ]
```
**Ganho da derivação (concordo):** muda o formato depois → regenera do `.md`, nenhum aluno refaz contexto por decisão de arquitetura.

## Adotamos as 3 descobertas de vocês (são ouro pro modo invisível)
1. **A confirmação mostra o que está EM ABERTO** — pra casar a venda de balcão com o lead da campanha (senão a Carla nunca casa, o anúncio não leva crédito, o Meta não é avisado). Vamos desenhar assim.
2. **O campo é "vendas pelo WhatsApp"**, com linha separada pro resto. Combinado — o CRM já tem `origem` e UTM por lead, então dá pra separar de verdade.
3. **A confirmação é conversa, não tela** — no modo invisível, o dono confirma **no próprio WhatsApp**, lista numerada, 1×/dia ("reconhecer > gerar"). Entra no desenho do modo invisível.

## Pergunta de volta pro lado dos Agentes
- **`provas[].caminho`:** os arquivos de prova (print/vídeo) ficam na máquina do aluno (lado de vocês) — mas pra IA **mandar a prova na conversa**, ela precisa do arquivo **acessível na web**. Então: as provas **sobem pro CRM no setup**? (é um ponto de transporte parecido com o item 5, mas específico dos assets)

---
*Sem prazo de integração. Só o item 1 (formato do `contexto.config`) é o que custa retrofit — é o que vale fechar primeiro.*
