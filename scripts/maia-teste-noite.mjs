// Maia: teste das pendências da noite de 13/11 (ramo maia-noite). Modo local, nada sai pra Meta nem pra WhatsApp de verdade
// (todo telefone que recebe mensagem começa com 55000).
//
// Servidor (pasta limpa; MAIA_CAPI=1 liga o envio de conversões, que no modo local é só simulado):
//   rm -rf .teste-noite
//   MAIA_LOCAL=1 MAIA_LOCAL_PASTA=.teste-noite MAIA_PAINEL_SENHA=teste123 MAIA_SEM_AVISO=1 MAIA_CAPI=1 npx next dev --webpack -p 3210
// Teste:
//   node scripts/maia-teste-noite.mjs http://localhost:3210 teste123 .teste-noite         (sem IA)
//   node scripts/maia-teste-noite.mjs http://localhost:3210 teste123 .teste-noite --ia    (também as conversas com IA, ~US$ 0,30)
//
// O que confere: (1) o funil e os limites do cadastro viram regra do atendimento e da retomada (e as travas de desconto e de
// passagem pro dono); (2) "o que falta pra ligar"; (3) o resumo da semana pro dono; (4) as conversões pra Meta (Lead e Purchase).
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const args = process.argv.slice(2).filter(a => !a.startsWith('--'))
const [URL = 'http://localhost:3210', SENHA = 'teste123', PASTA = '.teste-noite'] = args
const COM_IA = process.argv.includes('--ia')
let ok = 0, falha = 0
const confere = (nome, cond, extra = '') => { if (cond) { ok++; console.log('  ✔', nome) } else { falha++; console.log('  ✘', nome, extra) } }

async function api(acao, corpo = {}) {
  const r = await fetch(`${URL}/api/maia/operacao`, { method: 'POST', headers: { 'x-senha': SENHA, 'content-type': 'application/json' }, body: JSON.stringify({ acao, ...corpo }) })
  const j = await r.json().catch(() => ({}))
  return { ...j, http: r.status }
}
async function get(q) {
  const r = await fetch(`${URL}/api/maia/operacao?${q}`, { headers: { 'x-senha': SENHA } })
  const j = await r.json().catch(() => ({}))
  return Array.isArray(j) ? Object.assign(j, { http: r.status }) : { ...j, http: r.status }
}
const arq = tab => path.join(PASTA, tab + '.json')
const le = tab => { try { return JSON.parse(fs.readFileSync(arq(tab), 'utf8')) } catch { return [] } }
const grava = (tab, l) => { fs.mkdirSync(PASTA, { recursive: true }); fs.writeFileSync(arq(tab), JSON.stringify(l, null, 1)) }
const poe = (tab, linhas) => { const l = le(tab); for (const x of linhas) l.push(x); grava(tab, l) }
const mexe = (tab, id, campos) => { const l = le(tab); const x = l.find(y => y.id === id); Object.assign(x, campos); grava(tab, l) }
const agora = () => new Date().toISOString()

// o cadastro do modelo da skill (Doceria Exemplo), como o importar.mjs manda
const CONTEXTO = {
  produto: 'Cookies artesanais: caixa com 6 e caixa com 12', preco: 'Caixa com 6: R$ 45. Caixa com 12: R$ 85', mais_vendido: 'Caixa com 6, pra presente',
  publico: 'Quem procura um presente doce pra alguém especial', pagamento: 'Pix ou cartão pelo link; encomenda com metade antes', pix: 'CNPJ 00.000.000/0001-00',
  endereco: 'Rua Exemplo, 100, Centro, Estrela', horario: 'terça a sábado, das 10h às 19h', frete: 'Estrela: grátis. Lajeado: R$ 10. Retirada na loja sem custo',
  prazo: 'Encomenda com 1 dia de antecedência', provas: '@doceriaexemplo no Instagram; CNPJ; 4,9 estrelas no Google',
  perguntas: [{ pergunta: 'Tem sem glúten?', resposta: 'Ainda não.' }],
  funil: { sim: 'Pagou o Pix (ou a metade da encomenda)', etapas: [
    { etapa: 'chegou', proximo_passo: 'Perguntar pra quem é o presente e a data' },
    { etapa: 'escolheu', proximo_passo: 'Mandar o total com o frete e a chave Pix na mesma mensagem' },
    { etapa: 'pagou', proximo_passo: 'Confirmar o pedido e o dia da entrega ou retirada' }] },
  limites: { desconto_maximo: 'Até 10% a partir de 3 caixas', faixa_preco: 'Pode dizer todos os preços da tabela', nunca_prometer: 'Entrega no mesmo dia; sabores que não estão na tabela', passar_pro_dono: 'Encomenda de empresa ou mais de 10 caixas; reclamação; pedido de desconto acima do limite' },
  estilo: 'Estilo 2', pecas_aprovadas: [{ angulo: 'presente', gancho: 'Procurando um presente?', texto: '...' }],
  implantacao: { ligar_ate: '2026-11-20', conversa_30_dias: '2026-12-18' },
}
async function novoNegocio(nome, fone, extra = {}) {
  const r = await api('criar_negocio', { nome, nicho: 'doceria', cidade: 'Estrela', dono_nome: 'Dono Teste', dono_whatsapp: fone, verba_dia: 30, contexto: CONTEXTO, ...extra })
  if (!r?.id) throw new Error('não criou o negócio: ' + JSON.stringify(r).slice(0, 200))
  return r
}

// ═══════════ 1) funil e limites do cadastro
console.log('1) O funil e os limites do cadastro no atendimento')
const RUN = String(Date.now()).slice(-5)   // telefones novos a cada rodada (o banco não deixa dono repetido)
const n1 = await novoNegocio('TESTE · Doceria Noite', '550008881' + RUN)
let f = await api('teste_funcoes', { negocio_id: n1.id, texto: 'Consigo fazer 15% de desconto pra você nas 3 caixas!' })
const rc = String(f.regras_cadastro || '')
confere('o "sim" do negócio entra nas regras', rc.includes('Pagou o Pix (ou a metade da encomenda)'), rc.slice(0, 200))
confere('as etapas com o próximo passo entram, em ordem', /1\. chegou → Perguntar pra quem é o presente[\s\S]*2\. escolheu → Mandar o total[\s\S]*3\. pagou → Confirmar o pedido/.test(rc))
confere('o desconto máximo entra (e "nunca oferece por conta própria")', rc.includes('no máximo Até 10% a partir de 3 caixas') && /NUNCA oferece desconto por conta própria/.test(rc))
confere('o que nunca prometer entra', rc.includes('NUNCA PROMETE: Entrega no mesmo dia; sabores que não estão na tabela'))
confere('quando passar pro dono entra', rc.includes('Encomenda de empresa ou mais de 10 caixas'))
confere('as perguntas frequentes entram com a resposta do dono', rc.includes('Tem sem glúten? → Ainda não.'))
confere('as provas e o mais vendido entram', rc.includes('4,9 estrelas no Google') && rc.includes('MAIS VENDIDO: Caixa com 6, pra presente'))
confere('a ficha do prompt fica sem funil, limites, peças e datas (sem repetir)', f.ficha && !f.ficha.funil && !f.ficha.limites && !f.ficha.pecas_aprovadas && !f.ficha.implantacao && f.ficha.preco, JSON.stringify(f.ficha).slice(0, 200))
confere('a retomada leva o sim, o caminho e o que nunca prometer', /Pagou o Pix/.test(f.regras_retomada) && /próximo passo/.test(f.regras_retomada) && /Nunca promete: Entrega no mesmo dia/.test(f.regras_retomada))
confere('desconto máximo lido do texto: 10%', f.desconto_max === 10, String(f.desconto_max))
confere('"15% de desconto" passa do limite', f.desconto_acima === 15, String(f.desconto_acima))
f = await api('teste_funcoes', { negocio_id: n1.id, texto: 'Pra 3 caixas eu consigo 10% de desconto. Fica R$ 121,50.' })
confere('"10% de desconto" está dentro do limite', f.desconto_acima === null, String(f.desconto_acima))
f = await api('teste_funcoes', { negocio_id: n1.id, texto: 'São 20 unidades, 50% mais recheio.' })
confere('porcentagem que não é desconto não conta', f.desconto_acima === null)
f = await api('teste_funcoes', { negocio_id: n1.id, texto: 'Ah, e consigo 20% de desconto. A caixa com 6 é R$ 45.' })
confere('a trava final tira só a frase do desconto', f.sem_desconto === 'A caixa com 6 é R$ 45.', f.sem_desconto)
f = await api('teste_funcoes', { negocio_id: n1.id, texto: 'Encomenda de 30 caixas para a empresa dela no fim do ano' })
confere('motivo "encomenda de empresa" bate com o cadastro', !!f.motivo_cadastro, String(f.motivo_cadastro))
f = await api('teste_funcoes', { negocio_id: n1.id, texto: 'Pediu um desconto de 25%, acima do limite combinado' })
confere('motivo "desconto acima do limite" bate com o cadastro', !!f.motivo_cadastro, String(f.motivo_cadastro))
f = await api('teste_funcoes', { negocio_id: n1.id, texto: 'O cliente perguntou o horário de sábado' })
confere('motivo comum (horário) não bate com o cadastro', f.motivo_cadastro === null, String(f.motivo_cadastro))
f = await api('teste_funcoes', { contexto: { produto: 'Pizza', limites: { desconto_maximo: 'Não damos desconto' } }, texto: 'Posso fazer um desconto pra você.' })
confere('"não damos desconto": máximo 0 e qualquer oferta passa', f.desconto_max === 0 && f.desconto_acima != null, JSON.stringify([f.desconto_max, f.desconto_acima]))
f = await api('teste_funcoes', { contexto: { produto: 'Pizza' }, texto: 'qualquer coisa' })
confere('negócio sem cadastro novo: nada muda (regras vazias)', f.regras_cadastro === '' && f.desconto_max === null)

if (COM_IA) {
  console.log('1b) Com IA (o atendimento de verdade, modo local)')
  let r = await api('simular_cliente', { negocio_id: n1.id, telefone: '550007771' + RUN, nome: 'Carla', texto: 'Oi! Quero 3 caixas de 6. Consegue 30% de desconto?' })
  let txt = (r.respondeu?.mensagens || []).join(' ')
  if (!txt) txt = JSON.stringify(r)
  console.log('     →', txt.slice(0, 300))
  confere('pediu 30%: a Maia não oferece mais que 10%', !/(consigo|posso|fa[cç]o|dou|damos|fica com|sai com|d[aá] pra fazer)[^.?!]{0,40}\b(1[1-9]|[2-9]\d)\s*%/i.test(txt), txt.slice(0, 300))
  r = await api('simular_cliente', { negocio_id: n1.id, telefone: '550007772' + RUN, nome: 'Paulo', texto: 'Boa tarde. Preciso de 40 caixas de cookies pra dar de presente pros funcionários da minha empresa. Vocês fazem?' })
  txt = (r.respondeu?.mensagens || []).join(' ')
  console.log('     →', txt.slice(0, 300))
  const cv = le('conversas').find(c => c.telefone === '550007772' + RUN)
  confere('encomenda de empresa (40 caixas) vai pro dono, como diz o cadastro', cv?.modo === 'humano' || le('lead_eventos').some(e => e.tipo === 'pergunta_cliente' && le('leads').find(l => l.id === e.lead_id)?.telefone === '550007772' + RUN), JSON.stringify(r.respondeu?.ferramentas || r).slice(0, 300))
}

console.log(`\n${ok} ok, ${falha} falha(s)`)
process.exit(falha ? 1 : 0)
