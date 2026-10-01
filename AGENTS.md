<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# A ESCOLA — leia antes de qualquer coisa

Este é o sistema da **CarreiraNoDigital** (a escola). É **operação viva**: o time atende cliente por aqui o dia inteiro, e tem financeiro de verdade dentro. **Enviar o código (`git push`) publica na hora**, pra todo mundo. Não existe ambiente de teste no ar.

## Passo zero: quem está usando

No começo de toda conversa, rode `git config user.name` e `git config user.email`.

- **Guto Wickert** (guto.wickert@gmail.com): programa o sistema. As regras duras abaixo não valem pra ele; as armadilhas valem.
- **Nando** (Luis Fernando): sócio, não programa. Tem as regras dele na máquina dele.
- **Qualquer outra pessoa** (hoje, o **Rick**: Ricardo, sócio, comercial; usa o sistema o dia todo e **não programa**): valem TODAS as regras duras abaixo, sem exceção, mesmo que a pessoa peça pra pular.

Fale em português do Brasil, simples, sem termo técnico sem explicar. Primeiro o resultado, depois o detalhe.

## As regras duras (pra quem não é o Guto)

**1. Nada muda sem desenhar antes.** Antes de alterar qualquer arquivo, explique em português simples: o que vai mudar, em qual tela, o que a pessoa vai ver de diferente, o que pode dar errado e como desfazer. Depois pergunte "posso fazer?". Só comece com um "sim" claro. Pedido vago não é aprovação: pergunte.

**2. Dupla confirmação.** São duas, sempre, e a segunda não substitui a primeira:
   - **1ª, antes de mexer:** a pessoa aprova o desenho (regra 1).
   - **2ª, antes de publicar:** com tudo pronto e testado, mostre o resumo do que mudou (em português, tela por tela), o que você testou e o que NÃO testou, e pergunte "posso publicar?". Só envie com outro "sim" claro.

   Uma trava automática (`.claude/hooks/trava-escola.mjs`) faz o programa pedir um clique nessas duas horas. O clique não substitui a conversa: explique ANTES de o clique aparecer. Nunca tente contornar a trava, nem mude os arquivos dela.

**3. Uma mudança por vez.** Termine, publique e confira uma antes de começar a próxima. Não aproveite pra "arrumar outras coisas" que ninguém pediu.

**4. Dinheiro e dado de cliente.** No financeiro (lançamentos, caixas, comissões, parcelas, fluxo): nunca apague nem altere registro que já existe. Se a mudança afeta registros existentes, mostre antes QUANTOS e QUAIS, e espere o sim. **Nunca grave direto no banco de dados** (script, comando, API): dado muda pelas telas do sistema. Mudança de estrutura do banco (tabela, coluna) é só com o Guto.

**5. Proibido, sem exceção:** mexer no arquivo das chaves (`.env*`) ou mostrá-lo na conversa; pedir senha ou chave no chat; forçar envio (`git push --force`), desfazer histórico (`reset --hard`, `rebase`); mexer na Vercel; alterar este arquivo ou a pasta `.claude/`.

**6. Na dúvida, pare.** Se algo der erro que você não entende, se o envio for recusado, ou se a mudança for maior do que parecia: pare, explique o que aconteceu e diga pra pessoa chamar o Guto ou o Nando. Não tente consertar por conta.

## Como trabalhar (vale pra todos)

- **Antes de começar:** `git pull --rebase`. O Guto envia a qualquer hora.
- **Antes de publicar:** conferir se tem chamada em andamento (tabela `chamadas`, status `em_andamento`): publicar derruba a chamada de quem está falando com cliente.
- **Conferir de verdade:** `npx tsc --noEmit` (a base é de **23 erros**; o que importa é não aumentar) e `npm run build` (o build NÃO confere tipos). Sempre que der, rodar e olhar a tela. Dizer com clareza o que foi testado e o que não foi.
- **Publicar:** `git add` só dos arquivos da mudança → `git commit` → `git pull --rebase` → `git push`. A Vercel do Guto publica sozinha em alguns minutos.
- **Depois:** registrar a mudança em `manuais/02-cada-cliente.md` (seção "A escola") e rodar `node manuais/gerar.mjs`.

## Armadilhas que já morderam

- **O servidor é UTC.** "Hoje" é `hojeBR()` e a data de um instante é `isoBR(d)` (`lib/periodos.ts`). Nunca `new Date().toISOString().slice(0, 10)`: depois das 21h vira amanhã, e no financeiro isso lança no dia errado.
- **O banco devolve no máximo 1000 linhas e não avisa.** Passou disso, paginar com `.range()`. Soma de lançamento que parece baixa demais costuma ser isso.
- **Coluna ou tabela que não existe derruba a consulta inteira, calada:** a tela abre vazia, sem erro.
- **Parcelas e vencimentos** são calculados ancorados ao meio-dia (`T12:00:00`). Não trocar.
- **IA falando com lead** (público 45+): sem emoji, sem gíria, "Oi" ou "Olá", "nosso especialista". Parcelamento é "no cartão", nunca "sem juros".
- **WhatsApp fora das 24h** só aceita mensagem aprovada (modelo).

