# Consultório da Morgana (/psi)

Sistema da Morgana Schena Wickert, psicóloga. Ela usa pelo celular, como um aplicativo com ícone na tela inicial.
Fica dentro do sistema da escola, no endereço **/psi**, mas é uma área separada: tem login próprio, cores próprias e não tem nenhum menu da escola.

Prints das telas no celular: pasta `docs/psi/prints/`. Lá também estão dois PDFs de exemplo, a planilha da APAE e uma declaração.
Pesquisa sobre os concorrentes e as regras do CFP e da LGPD: `docs/psi/PESQUISA.md`.

---

## O que tem

| Tela | O que faz |
|---|---|
| **Início** | Mostra onde ela está hoje (os locais do dia), os próximos pacientes e os atendimentos que **faltam registrar**. Tem o botão grande **"Planilha da APAE — mês"** e um resumo do mês: realizados, faltas e quanto tem a receber. Do dia 25 em diante aparece o aviso "Hora de gerar a planilha da APAE". |
| **Agenda** | Abre no **dia** e tem também a visão da **semana**. Cada local aparece como um bloco com a sua cor. **Blocos fixos:** APAE na segunda e na sexta, das 07:30 às 11:30, e Mercado Montanha na terça, das 08:00 às 15:00. **Mauri (quarta) e Conecta (quinta):** sem horário fixo; aparece o dia do local e cada paciente fica no seu próprio horário. No bloco há o botão "Marcar paciente", com a opção "toda semana neste horário". Tocar no paciente leva direto pro registro. |
| **Registrar atendimento** | Tudo numa tela só: paciente (busca, ou cadastro rápido de um paciente novo), dia, hora, local e presença (**realizado, faltou, desmarcou, remarcado**). Se foi realizado, já abre o campo da **evolução**. Também marca se a sessão já foi paga ou ainda está a receber. |
| **Pacientes** | Busca instantânea pelo nome, sem precisar acertar acento nem maiúscula. Filtro por local com um toque. |
| **Prontuário** | Tem quatro abas. **Evoluções:** linha do tempo com a data, o tipo e o local. **Prontuário:** identificação, demanda, objetivos, histórico, procedimentos e encerramento. **Atendimentos.** **Arquivos e documentos:** anexos e cópia de cada documento que ela emitiu. |
| **Evolução** | **Corrigir** guarda a versão anterior inteira. **Apagar** exige um motivo: a evolução sai da linha do tempo, mas continua guardada no banco e no histórico. |
| **Documentos** | Declaração, atestado psicológico e relatório psicológico, no modelo da Resolução CFP 06/2019. O formulário já vem preenchido com o que o sistema sabe, como o último atendimento, a demanda e o número de sessões. Gera o PDF com o logo, o nome e o CRP dela e abre o **Compartilhar** do celular. A cópia fica guardada no prontuário. |
| **Relatórios** | **Planilha por local:** é o pedido da APAE. Mostra o nome do paciente, as datas dos atendimentos do mês e a quantidade por paciente, com o total no fim. Sai em **PDF** ou **planilha (Excel)** pelo Compartilhar, ou em CSV. **Resumo do mês:** realizados, faltas e desmarcações de cada local, valor a receber e valor já recebido. |
| **Mais** | **Meus dados:** nome, CRP e cidade que vão nos documentos. **Locais e valores:** valor por sessão, forma de pagamento, se cobra a falta e a cor do local. **Rotina da semana.** **Histórico de acessos:** quem abriu ou alterou cada prontuário, e quando. **Lembretes por WhatsApp:** aparece como desligado. |

**Segurança e regras (CFP e LGPD)**
- Cada login só enxerga o que é seu. Essa trava fica no próprio banco, nas tabelas `psi_*`. Ninguém da escola vê os dados dela pelo sistema.
- Paciente, evolução e documento não são apagados de verdade. O CFP pede que o prontuário seja guardado por no mínimo 5 anos.
- O histórico de acessos anota quem fez cada coisa, quando fez e quais campos mudou. Ele nunca guarda o texto clínico, e ninguém consegue apagar esse histórico.
- Os anexos ficam num armazenamento **privado**. Cada vez que ela abre um arquivo, o sistema gera um link que vale só 5 minutos.
- O "modo offline" do aplicativo guarda só as telas. Os dados dos pacientes não ficam guardados no aparelho.

---

## Passo 1: aplicar o banco (uma vez)

1. Entre no Supabase da escola, no menu **SQL Editor**, e clique em **New query**.
2. Cole o conteúdo inteiro de `db/psi.sql` e clique em **Run**.
3. Pronto. Se rodar de novo não estraga nada: o arquivo só cria o que ainda não existe.

Os 4 locais e a rotina da semana não precisam ser criados à mão. O sistema cria tudo sozinho no **primeiro acesso** dela.

## Passo 2: criar o login da Morgana

1. Entre no Supabase, no menu **Authentication**, depois **Users**, depois **Add user** e **Create new user**.
2. Preencha o e-mail dela e uma senha. Marque **Auto Confirm User**.
3. Mande pra ela o endereço do sistema, o e-mail e a senha.
4. No primeiro acesso, peça pra ela abrir **Mais**, depois **Meus dados**, e preencher o **CRP** e a **cidade**. Esses dados aparecem nos documentos.

**Trocar a senha:** no mesmo lugar (Authentication > Users), clique nos três pontinhos do usuário dela e escolha "Send password recovery" ou "Reset password".

**Trava da escola (obrigatório, uma vez):** rode `db/psi-acesso.sql` no SQL Editor. Ele marca o login dela como "só do consultório" (`papel = psi`). A marca entra sozinha no primeiro acesso dela ao /psi. Se quiser, dá pra marcar à mão logo depois de criar o login: a linha comentada está no próprio arquivo.

**O que a trava faz** (o login dela fica no mesmo Supabase da escola):
- **APIs da escola** (`proxy.ts`): qualquer chamada a `/api/...` com o login dela é recusada (erro 403). O proxy só lê o token, então quem é da escola não sente diferença.
- **Painel e login** (`components/Layout.tsx`, `app/login/page.tsx`): se ela abrir /dashboard ou /login, é mandada pro /psi.
- **"Sem empresa = escola"** (`lib/org.ts`, `lib/exigir-login.ts`): essa regra não vale pra ela. Pra essas funções, ela não está logada no sistema da escola e não tem empresa.

**Quem é tratado como "só do consultório":**
- quem tem a marca `papel = psi` no login; OU
- quem tem perfil no consultório e **não** tem perfil na escola (`usuarios_perfil`).

Ninguém da equipe é afetado, mesmo que abra o /psi.

**Falta conferir uma coisa no banco:** as tabelas que o navegador lê direto usam a regra `meu_org()`, e a definição dela não está no código. O fim do `db/psi-acesso.sql` tem a consulta pra conferir. Se essa regra devolver "escola" pra quem não tem empresa, me avise antes de criar o login dela.

## Passo 3: instalar o ícone no celular

**iPhone (Safari):**
1. Abra o endereço do sistema terminado em **/psi** no **Safari**. Tem que ser no Safari: o Chrome do iPhone não instala.
2. Toque no botão **Compartilhar**, o quadrado com a seta pra cima.
3. Escolha **Adicionar à Tela de Início** e toque em **Adicionar**.
4. O ícone com o "M" aparece na tela. Daqui pra frente, é só abrir por ele.

**Android (Chrome):**
1. Abra o endereço **/psi** no **Chrome**.
2. Toque nos **três pontinhos** no canto de cima.
3. Escolha **Instalar app** (em alguns celulares aparece **Adicionar à tela inicial**) e confirme.

## Testar sem banco (modo de teste)

Abra `/psi?exemplo=1`. Aparece uma faixa amarela avisando que é o modo de teste. Os pacientes são **inventados** e ficam guardados só naquele aparelho, sem tocar no banco. Pra sair, use o botão "Sair do teste" ou abra `/psi?exemplo=0`.

Pra rodar no computador: `npm run dev` e depois abrir `http://localhost:3000/psi?exemplo=1`.

---

## O que fica pra depois (a estrutura já existe, DESLIGADA)

**Lembretes por WhatsApp**
- Já existem as tabelas `psi_lembretes` (a fila de mensagens) e `psi_consentimentos` (quem autorizou, por qual canal e de que jeito).
- O interruptor fica em `psi_config.lembretes_ligados`, que hoje está desligado.
- Hoje **nada lê** essas tabelas.
- Pra ligar, é preciso:
  1. Criar um motor no servidor que pegue os lembretes `pendente` com `enviar_em <= agora`.
  2. Antes de mandar, conferir que o paciente autorizou (consentimento aceito e não revogado).
  3. Usar um **modelo aprovado** no WhatsApp, porque fora da janela de 24h só modelo é aceito.
  4. Gravar a resposta do paciente ("confirmou" ou "desmarcou") e atualizar o atendimento.
- O consentimento de menores tem que vir do responsável (LGPD, art. 14).

**Maia (atendente de IA)**
- O ponto de ligação é a tabela `psi_eventos_integracao`, uma caixa de saída de eventos de **agenda**. Exemplos de evento: `sessao_agendada`, `sessao_desmarcada`.
- Ela **não leva nenhum dado clínico**. A Maia lê dessa caixa e marca como `processado_em`.
- O que a Maia pode fazer fica em `psi_config.maia_pode`. Exemplos: `confirmar_sessao`, `remarcar`.
- **Nunca** dar à Maia acesso a evoluções, prontuário ou documentos.
- Quando for ligar, a Maia lê e grava pelo servidor, com uma função própria restrita à agenda. Ela não deve usar a chave de serviço pra ler as tabelas `psi_*`.

**Outras ideias**
- Trava com PIN ou digital ao abrir o aplicativo.
- Agenda com arrastar e soltar.
- Recibo de pagamento em PDF.
- Atendimento on-line com link da sessão.
- Exportar o prontuário inteiro de um paciente, pra quando ele pedir cópia.

---

## Onde está o código

- `app/psi/`: a página, o visual (`psi.css`) e as telas (`_app/telas/`).
- `lib/psi/`: tipos, datas, agenda, relatório, documentos (modelos do CFP), exportação (PDF, planilha, compartilhar) e o acesso ao banco. O acesso ao banco tem duas versões: `repo-supabase.ts` (o banco de verdade) e `repo-exemplo.ts` (o modo de teste).
- `public/psi/`: logo, ícones, `manifest.webmanifest` e `sw.js`.
- `db/psi.sql`: o banco.
