# Resposta do lado CRM — tracking do site + `contexto.config` v1

*Lado CRM → lado dos Agentes. 17/08/2026.*

---

## A · Tracking do site (Agente 7) — o CRM já tem pronto

O tracking do **anúncio** a gente tocou; o do **site** faltava. Boa notícia: o CRM já roda isso em produção (o "funil do site" da CnD). O site gerado só precisa implementar estes ganchos:

**1 · Todo CTA de WhatsApp passa pelo `/wa` do CRM — nunca `wa.me` direto.**
`https://<crm>/wa?utm_source=…&utm_medium=…&utm_campaign=…&utm_content=…&src=<url_pagina>&vid=<id_visitante>&sid=<sessao>` (+ `fbclid` se veio do anúncio).
O `/wa` captura fbclid→fbc, UTM e origem, gera um `ref`, registra o clique, e redireciona pro `wa.me` com **`#ref` na mensagem** → o webhook casa a mensagem ao clique → **lead nasce atribuído**.

**2 · Eventos do site → `POST /api/track`** (pageview, clique, etc.) com o mesmo `vid`, via `navigator.sendBeacon`. Costura a jornada no site ao lead (`site_eventos` / `funil-site`).

**3 · ⚠️ Armadilha:** `sendBeacon` cross-origin tem que ir como **`text/plain`** — senão o preflight CORS barra e o evento se perde.

**4 · ⚠️ Regra dura:** **nenhum botão pula o `/wa`.** Botão direto pro `wa.me` gera lead **órfão** (sem fbclid/UTM). A CnD tem exatamente essa pendência hoje.

**5 · A conexão que fecha o círculo:** sem o `/wa`, não existe `fbc` → **o item 4 (devolutiva pro Meta) não funciona.** Então o tracking do site/anúncio é **pré-requisito** da atribuição de venda no Meta. Site (7) e Anúncio (5) usam o **mesmo esquema `/wa` + `/api/track`**.

---

## B · Sobre o `contexto.config` v1 — aceito. Reações:

**Arquitetura `.md` (fonte) → `.json` (derivado) + `conversa.md`:** fechado, é o certo. Mesma origem, dois consumidores, não conflita.

**Os 6 campos acrescentados — todos aceitos:**
- `ferida`, `voz.tese`, `publicos[]` → sim, a IA de atendimento precisa dos três (a ferida pro "fazer ver o problema"; a tese pro posicionamento; os públicos pra mandar o case certo).
- **`travas[]` → o CRM VAI ENFORÇAR.** A IA de atendimento e o motor de preço **não vendem a oferta errada**. É a mesma família das blindagens que já temos (R$0, prazo vencido). Trava cruzada entre ofertas entra nessa lógica.
- `versao`/`gerado_em`/`gerado_de` → sim, o CRM compara `gerado_em` pra saber se a config está velha.
- `negocio.id` → sim, é a **âncora do tenant** no CRM (o que hoje é o `org_id`).

**As travas de prova (`autorizado` / `dados_pessoais_removidos` / `validade`) → o CRM respeita no ENVIO.** Regra que a gente adiciona no send path:
> A IA só **anexa** uma prova se `autorizado === true` **E** `dados_pessoais_removidos === true` **E** `validade` não vencida. Fora disso: no máximo cita em texto, **nunca manda o arquivo**.

É a extensão natural das blindagens. E vocês têm razão — na conversa ao vivo isso pesa mais que no anúncio, porque ninguém revisa antes. Fechado.

**Provas sobem contínuo (não no setup), local é mestre, `url` é cópia:** aceito. Os dois campos (`caminho_local` mestre / `url` cópia web) é o modelo certo.

---

## C · As 3 perguntas em aberto de vocês

**1 · Prova preferida por público — sugestão ou obrigação?**
→ **Obrigação de casar o público; liberdade só DENTRO dele.** A IA lê o público do lead (do que ele disse que faz) e **só usa prova cujo `para_publico` bate**; dentro do que bate, pega a preferida/mais forte. Nunca manda o case de floricultura pro dono de oficina. Resolve o teu medo do "usa sempre a mais forte, do público errado".

**2 · Quem gera o `url` da prova e quando?**
→ **O CRM, ao RECEBER o arquivo** (é ele que hospeda). O agente sobe o `caminho_local`; o CRM guarda web-accessible e **devolve o `url`** (popula no config). `caminho_local` continua mestre.

**3 · Frequência da regeneração da config?**
→ De acordo com a proposta: regenera quando `contexto.md`/`estrategia.md` mudar; o CRM compara `gerado_em` e recarrega. (via export na pasta — item 5)

---

## D · Itens fechados

- **Item 5 (transporte):** v1 = **export na pasta** (concordo — sem chave, offline, mesmo mecanismo que a escola usa). API com chave escopada é o upgrade quando frescor doer.
- **Item 4 (Meta):** fechado — CRM devolve, agentes não. Anúncio **e** site entregam o link `/wa` marcado (é o que gera o `fbc`).
- **Item 2 (identidade):** guardar email/CPF no 1º contato vira **instrução da IA de atendimento**, não boa vontade. Fechado.
- **Item 3 (estados):** tradução escrita do lado de vocês; o painel do CRM lê **combinado** e **confirmado**.

---

## E · Dois pontos que o CRM levanta de volta

**1 · `handoff_humano` é lista de gatilho — a EXECUÇÃO é do CRM.** Quando a IA bate num gatilho (desconto, exceção, reclamação, negociação), ela **para e avisa o dono** (o CRM já "lembra o dono de quem ficou sem resposta"). Só confirmando quem executa: o CRM.

**2 · Campo de `operacao` vazio → a IA NÃO inventa.** Se `horario/endereco/pagamento/contato` está em branco, a IA **nunca chuta** — diz "confirmo com o dono" / handoff. É a blindagem "nunca inventar" aplicada à info operacional. Então vale o agente **marcar o que está vazio** (string vazia já resolve), pra IA saber que é lacuna, não ausência.

---

## Fechamento

Só o **item 1 (formato do `contexto.config`)** custa retrofit — e ele está **bom pra fechar**, com os 4 ajustes acima:
1. travas de prova respeitadas no envio,
2. prova casa o público (obrigatório),
3. `url` gerado pelo CRM ao receber,
4. `operacao` vazia não é inventada.

Se concordarem com esses 4, **esse é o contrato do `contexto.config` v1**. O resto (transporte, url, regeneração) amadurece junto, sem pressa.
