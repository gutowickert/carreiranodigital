# Recado pra base

## O que é

É uma mensagem que a Maia manda **pros clientes de sempre** de um negócio, avisando uma novidade.
Exemplo da lotérica: "abriu o bolão da Mega da Virada, 10 cotas de R$ 50".

A mensagem chega no WhatsApp do próprio negócio, com o nome da pessoa e dois botões:
**Quero participar** e **Não quero receber**.

- Quem toca em **Quero participar** (ou responde "quero") vira contato no funil e a Maia passa a conversa
  pro dono ou pro time do negócio **fechar**. O dono recebe o aviso na hora, igual quando um cliente quer comprar.
- Quem toca em **Não quero receber** (ou responde SAIR / parar) sai da lista na hora e nunca mais recebe.
- Quem responde outra coisa ("quanto é a cota?") é atendido pela Maia normal, e ela sabe de qual recado a pessoa veio.
- Quando a equipe ou o dono marca a venda desse contato, ela soma no recado.

A Maia **não vende e não cobra pelo WhatsApp**: o recado avisa e chama ("responde aqui que a gente separa a sua").

## O caminho de um recado

1. Alguém pede o recado (o dono no WhatsApp ou no painel dele, ou a equipe no painel da equipe).
2. A Maia escreve: curto, primeiro o que a pessoa ganha e depois o preço, chamando pra responder.
3. **A equipe aprova** (ou pede ajuste pra Maia, ou edita o texto direto).
4. **O dono aprova**: 👍 no WhatsApp, "pode mandar", ou o botão Aprovar no painel. Ele vê antes quantos contatos
   vão receber e o custo estimado. Se pedir ajuste, a Maia refaz e volta pra equipe.
5. A Maia pede o modelo da mensagem na Meta (modelo de marketing do negócio). A Meta aprova em minutos ou horas.
6. Aprovado, a rotina manda **em lotes** (até 200 por hora), **só no horário comercial do negócio** (9h às 20h,
   domingo a partir das 10h). No fim, o dono recebe "Pronto: foi pra X contatos".

Se a Meta recusar o modelo, o recado volta pra equipe com o motivo e a equipe é avisada.

## Como usar

**Equipe (painel da equipe, dentro do negócio, aba Base)**
- Importar contatos: colar a lista (uma linha por pessoa: `nome;telefone;etiquetas`) ou subir o `.csv`.
  Dá pra incluir quem já comprou do negócio (ganha a etiqueta "comprou").
- Ver os contatos, procurar, tirar alguém da lista ou apagar.
- Novo recado: escrever o que avisar, escolher a etiqueta (vazio = toda a base), a data e uma imagem (opcional).
- Em cada recado: aprovar, pedir ajuste, editar o texto, cancelar, e os números.
- Custo por mensagem e mensagens por hora (padrão R$ 0,35 e 200).

**Dono pelo WhatsApp da Maia**
- Mandar a lista: a planilha em `.csv` (no Excel: Salvar como, CSV), o cartão `.vcf` ou os contatos do celular.
  A Maia responde quantos entraram, quantos já estavam e quantos números não deu pra ler.
  Planilha `.xlsx` ela não lê: pede pra salvar em `.csv`.
- Pedir o recado: "manda pra base que abriu o bolão da Mega da Virada, 10 cotas de R$ 50".
- Aprovar: 👍 em cima da mensagem do recado, ou "pode mandar". Ajustar: dizer o que mudar. Cancelar: "cancela o recado".
- Perguntar: "como foi o recado?", "quantos tem na minha base?".

**Dono pelo painel dele** (cartão "Recado pra base", no Resumo)
- Novo recado, Importar contatos, Aprovar e Pedir ajuste. Os números de cada recado aparecem ali.

## Os números

Enviados, entregues, responderam, querem participar, saíram da lista e vendas (com o valor).
Aparecem no painel da equipe, no painel do dono e numa linha do resumo da semana.

## Os limites (pra ninguém se incomodar)

- Quem saiu da lista nunca recebe (reimportar a planilha não traz a pessoa de volta).
- **1 recado por contato a cada 3 dias** e **no máximo 2 por semana**. Quem estiver dentro disso fica de fora
  daquele recado (aparece como "ficaram de fora pelo intervalo").
- Só no horário comercial do negócio.
- Só vai pra quem tem a etiqueta escolhida (sem etiqueta: toda a base).

## Custo

Cada mensagem de marketing é cobrada **pela Meta, direto do negócio** (o cartão da conta do WhatsApp do negócio).
A Maia mostra a estimativa antes de aprovar: contatos x R$ 0,35 (o valor muda na aba Base).
Quem está com a conversa aberta nas últimas 24 h recebe como mensagem normal.

## O que precisa rodar no banco (uma vez)

Arquivo: `db/maia-recado-base.sql` (pode rodar mais de uma vez, não estraga nada).
Rodar no SQL Editor do Supabase do banco da Maia. Ele cria as tabelas `maia_base`, `maia_recados` e
`maia_recado_envios` (com a mesma proteção das outras tabelas da Maia) e deixa o funil aceitar a origem "base".

**Se não rodar:** a Maia segue funcionando igual. Só o recado fica indisponível: o painel mostra
"falta rodar o db/maia-recado-base.sql", e a lista mandada pelo WhatsApp não entra (a equipe é avisada).

Pra mandar de verdade, o WhatsApp do negócio tem que estar conectado e com o atendimento ligado
(o mesmo que a Maia já precisa pra atender os clientes). Sem isso o recado fica parado e a equipe é avisada.

## Loteria e a política da Meta (cuidado)

A Meta tem regra própria pra loteria e aposta. Por isso:
- O recado **avisa e chama**. Nada de vender, mandar Pix, link de pagamento ou "garanta já pagando" pelo WhatsApp.
- Quem quer participar vai pro time da lotérica, que combina e fecha (no balcão ou como já faz hoje).
- A Maia nunca promete prêmio nem diz que a pessoa vai ganhar.
- A lotérica já mandou os documentos pra aprovação no Facebook. Enquanto a Meta não liberar a conta, o modelo
  pode ser recusado: o recado volta pra equipe com o motivo.

## Apagar dados (LGPD)

"Apagar dados deste contato" (o que já existe no painel da equipe) também tira a pessoa da base.
Os envios ficam só como número, sem o telefone, pra conta do recado continuar certa.

## Teste

`node scripts/maia-teste-recado.mjs` (modo local, IA simulada, nada sai pra internet).
Com o servidor do ensaio no ar, `node scripts/maia-teste-recado.mjs http://localhost:3230 teste123` confere também
as rotas dos painéis.
