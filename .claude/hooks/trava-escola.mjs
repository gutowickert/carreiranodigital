// A TRAVA DA ESCOLA — regra dura pra quem não é o Guto nem o Nando (hoje: o Rick). 01/10/2026.
//
// A escola é operação viva: mexeu e enviou, entrou no ar pra todo mundo. As regras estão escritas no
// AGENTS.md, mas regra escrita depende de o Claude lembrar. Esta trava não depende: ela roda antes de
// cada ação do Claude e OBRIGA o programa a pedir um clique de confirmação da pessoa, que não dá pra
// marcar como "permitir sempre".
//
//   1ª confirmação → antes de mudar qualquer arquivo ("tu já viu e aprovou o desenho?").
//                    Vale por 45 minutos de trabalho; depois pergunta de novo.
//   2ª confirmação → antes de PUBLICAR (git push), sempre.
//   Proibido       → forçar envio, desfazer histórico, mexer nas chaves, gravar direto no banco.
//
// Pra quem é da lista LIVRES, a trava não faz nada.
//
// Chamado pelo .claude/settings.json nos eventos PreToolUse (decide) e PostToolUse (marca que a
// pessoa aprovou). Escrito em Node porque roda igual no Windows e no Mac.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const LIVRES = ['guto.wickert@gmail.com', '315395128+nando-carreiranodigital@users.noreply.github.com']
const MINUTOS = 45

let entrada = {}
try { entrada = JSON.parse(fs.readFileSync(0, 'utf8') || '{}') } catch { /* sem entrada: não trava */ }
const git = c => { try { return execSync('git config ' + c, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return '' } }
const email = git('user.email').toLowerCase()
if (LIVRES.includes(email)) process.exit(0)

const quem = git('user.name') || email || 'tu'
const evento = entrada.hook_event_name || 'PreToolUse'
const ferramenta = entrada.tool_name || ''
const marca = path.join(os.tmpdir(), 'trava-escola-' + String(entrada.session_id || 'sessao').replace(/[^a-zA-Z0-9-]/g, '') + '.json')
const responder = (decisao, motivo) => { console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decisao, permissionDecisionReason: motivo } })); process.exit(0) }
const EDITA = ['Edit', 'Write', 'NotebookEdit', 'MultiEdit']

// depois que a pessoa clicou e a edição aconteceu: guarda a hora, pra não perguntar a cada arquivo
if (evento === 'PostToolUse') {
  if (EDITA.includes(ferramenta)) { try { fs.writeFileSync(marca, JSON.stringify({ aprovado: Date.now() })) } catch { /* só pergunta de novo */ } }
  process.exit(0)
}

if (EDITA.includes(ferramenta)) {
  const arq = String(entrada.tool_input?.file_path || '')
  if (/(^|[\\/])\.env/.test(arq)) responder('deny', 'PROIBIDO: o arquivo das chaves (.env) não se altera. Se uma chave precisa mudar, fala com o Guto ou o Nando.')
  if (/[\\/]\.claude[\\/]/.test(arq) || /AGENTS\.md$|CLAUDE\.md$/.test(arq)) responder('deny', 'PROIBIDO: as regras e a trava da escola só mudam com o Guto ou o Nando.')
  let aprovado = 0
  try { aprovado = JSON.parse(fs.readFileSync(marca, 'utf8')).aprovado || 0 } catch { /* primeira vez */ }
  if (Date.now() - aprovado < MINUTOS * 60000) process.exit(0)
  responder('ask', `1ª CONFIRMAÇÃO, ${quem}: o Claude vai começar a MUDAR o sistema da escola. Ele já te explicou o que vai mudar, em que tela, e o risco? Só aprova se tu viu e concordou com o desenho. (Arquivo: ${arq.split(/[\\/]/).slice(-2).join('/')})`)
}

if (ferramenta === 'Bash' || ferramenta === 'PowerShell') {
  const c = String(entrada.tool_input?.command || '')
  if (/\bgit\s+push\b[^|;&]*(--force|-f\b|--force-with-lease)/.test(c) || /\bgit\s+(reset\s+--hard|clean\s+-|rebase\b|filter-branch|checkout\s+--\s|restore\s)/.test(c))
    responder('deny', 'PROIBIDO: forçar o envio ou desfazer histórico pode apagar o trabalho do Guto. Para e chama o Guto ou o Nando.')
  if (/SERVICE_ROLE|service_role/.test(c) || /\bpsql\b/.test(c) || (/supabase/i.test(c) && /\b(insert|update|delete|upsert|drop|alter|truncate)\b/i.test(c)))
    responder('deny', 'PROIBIDO: gravar direto no banco de dados da escola. Mudança de dado passa pelas telas do sistema; mudança de estrutura, só com o Guto.')
  if (/\bvercel\b/.test(c) && /(--prod|deploy|env\s+(add|rm|pull))/.test(c))
    responder('deny', 'PROIBIDO: a Vercel da escola é do Guto. A publicação acontece sozinha quando o código é enviado (git push).')
  if (/(^|[\s;&|"'])(cat|type|more|less|head|tail|Get-Content)\b[^|;&]*\.env/.test(c))
    responder('deny', 'PROIBIDO: mostrar o arquivo das chaves (.env) na conversa.')
  if (/\bgit\s+push\b/.test(c))
    responder('ask', `2ª CONFIRMAÇÃO, ${quem}: isto PUBLICA a mudança. Entra no ar na escola pra todo mundo, na hora. O Claude já te mostrou o resumo do que mudou e o que ele testou? Não tem ninguém em chamada agora? Só aprova se sim.`)
}
process.exit(0)
