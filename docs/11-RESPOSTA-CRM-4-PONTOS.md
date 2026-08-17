# Resposta do lado CRM aos 4 pontos abertos — 17/08/2026

Verifiquei os pontos 1 e 2 no código do webhook antes de responder.

## 1 · Lead que chega sem `/wa` (modo wa.me) — o CRM ingere?

**Ingere, mas precisa de marcação PARSEÁVEL, não prosa livre.** Hoje o webhook cria+atribui o lead lendo o **`#ref`** na 1ª mensagem (o fluxo do `/wa`). Um "vim pelo anúncio X" solto, **sem token reconhecido, hoje NÃO vira lead** (cai como resposta de disparo frio).

**Proposta (reusa a convenção que já existe):** no modo wa.me, a mensagem pré-preenchida termina com um token `#`, ex.:
> `Vim pelo anúncio!` + `\n\n#<utm_campaign>` (ex.: `#anlcaxias082601`)

O webhook lê o token → **cria o lead + grava `origem` e `utm_campaign`**. Sem `fbc`, o Meta fica **"sem atribuição"** (como vocês já escreveram), mas o funil **credita a campanha** — não "origem desconhecida". Só precisa ser um padrão fixo, não texto livre.

## 2 · Anúncio → WhatsApp direto (sem site) — o CRM lê a referência?

**Hoje NÃO. É um gap — e vale corrigir, porque é o caminho CERTO pro aluno sem site.**

O click-to-WhatsApp (CTWA) da Meta entrega no webhook um objeto **`referral`** com `ctwa_clid`, `source_id` (o anúncio), headline/body. Isso é **atribuição nativa, sem site, sem `/wa`** — e o `ctwa_clid` é o **equivalente do `fbc`** pra devolutiva no Meta.

**Recomendação (muda o que vocês prometem em aula):**
- Aluno **sem site** → o padrão é **anúncio click-to-WhatsApp (CTWA)**, não wa.me-com-texto.
- **O CRM adiciona a leitura do `referral`** no webhook (é do nosso lado — assumo). Aí: lead atribuído + `ctwa_clid` → fecha o Meta, sem site nenhum.
- O wa.me-texto (ponto 1) vira o **fallback** pra quem não roda CTWA.

Ou seja: pro funil sem site, CTWA é melhor que o hack do texto — dá atribuição real. Só falta o CRM ler o `referral`, que a gente constrói.

## 3 · ⚠️ LGPD do tracking (vid/sid)

Concordo — é real, e a exposição é do aluno. Divisão de responsabilidade:

- **O snippet de tracking é nosso** (`/wa`, `/api/track`, o cookie `vid`). Então **o CRM escreve o TEXTO** do que é coletado + a base legal (a gente é quem sabe o que captura: vid, fbclid, utm).
- **O site é de vocês.** Então **o agente de site embute o aviso/banner** por padrão, usando esse texto. **Nenhum site nasce rastreando sem aviso.**
- **O tracking do CRM fica consent-aware:** config liga/desliga o modo consentimento; sem consentimento, não seta o cookie / não dispara o beacon. A gente adiciona.
- **Base legal** (consentimento vs legítimo interesse) — nenhum de nós é advogado; o default sai **conservador (aviso + consentimento)**. Fica marcado como decisão jurídica, mas o produto não sai sem aviso.
- **De acordo em resolver ANTES do agente de site:** a gente fecha o texto + o modo consent antes de vocês gerarem o site.

## 4 · Quem instala o CRM no aluno (o teto de escala)

Real. **Hoje é team-touch** (Nando/nós): Supabase novo, envs, deploy, **conectar o WhatsApp Cloud API** (o gargalo = verificação Meta Business por número), seed. O teto = banda do time.

**Caminho pro self-serve (desenhar desde já):**
1. **Deploy templatizado** — botão Vercel + template Supabase (ou Docker one-liner).
2. **WhatsApp por OAuth de Business** — o doc já cita (CLI/conexão oficiais abr/2026, OAuth sem app de dev). **É o que tira o time do meio** — o aluno conecta o próprio número.
3. **Contexto auto-seed** pelos agentes — menos config na mão.

O **real gargalo é a verificação Meta Business + Cloud API por número.** É onde o self-serve trava. Vale investigar o OAuth de Business como caminho. Concordo: não é problema agora, é problema quando vender bem — mas nada no núcleo pode **impedir** o self-serve depois.

## Sobre a matriz e o insight do agente de contexto

De acordo com a matriz (nenhum é pré-requisito do outro, por desenho). E o insight de vocês é o mais importante do documento:

> **Mesmo o cliente que só quer o CRM precisa de um contexto.** Hoje seria na mão; com os agentes, sai pronto e **na voz do dono**. Isso faz do agente de contexto uma peça de valor pro lado do Nando **mesmo em cliente que nunca vê um terminal** — é o que separa a IA de atendimento de qualquer bot de WhatsApp do mercado.

E leva a uma conclusão prática: **a primeira ponte que vale ligar, mesmo no mundo "separados", é `contexto → config do CRM`.** Baixo esforço, alto valor, entrega sozinha (o cliente CRM-only já ganha). Todo o resto (tracking, update-back) pode esperar amadurecer. Então o `contexto.config` v1 não é só "o item urgente do contrato" — é **o primeiro ponto de integração que vale a pena construir de verdade.**

## To-dos que caem do lado CRM (assumidos)
- Ler o `referral` (CTWA) no webhook — atribuição sem site (ponto 2).
- Parser de token `#<campanha>` no modo wa.me (ponto 1).
- Tracking consent-aware + o texto de aviso/base legal (ponto 3).
- Roadmap de self-serve: deploy templatizado + WhatsApp OAuth + contexto auto-seed (ponto 4).

## Continua em aberto (os dois lados marcaram)
- **Janela de conversão offline do Meta** — não dá pra ensinar em aula sem o número confirmado. **Assumo verificar na doc atual do Meta** (Events Manager) antes de virar promessa. Não chuto.
- LGPD (acima, a resolver antes do agente de site).
- Operação da instalação (ponto 4).
