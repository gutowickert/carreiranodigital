// Maia: o teste do RECADO PRA BASE (14/11, lib/maia/recado.ts). 1º cliente: uma lotérica (bolão da Mega da Virada).
// Roda os módulos direto, sem servidor, em MODO LOCAL (arquivos em .maia-teste/recado), com a IA SIMULADA pela rede do ensaio
// (scripts/maia-ensaio-rede.mjs: nada sai pra internet; o texto do recado e a ferramenta do dono vêm com resposta fixa).
// Todo telefone de teste começa com 55000 (nunca sai pra Meta).
// Uso: node scripts/maia-teste-recado.mjs
// Opcional, com o servidor do ensaio no ar (veja o cabeçalho de scripts/maia-teste-ensaio.mjs), confere também as rotas
// dos painéis (equipe e dono): node scripts/maia-teste-recado.mjs http://localhost:3230 teste123
import fs from 'node:fs'
import path from 'node:path'
import { createJiti } from 'jiti'

const RAIZ = path.resolve(import.meta.dirname, '..')
const PASTA = '.maia-teste/recado'
fs.rmSync(path.join(RAIZ, PASTA), { recursive: true, force: true })
Object.assign(process.env, { MAIA_LOCAL: '1', MAIA_LOCAL_PASTA: PASTA, MAIA_SEM_AVISO: '1', MAIA_SEM_IA_MIDIA: '1', ANTHROPIC_API_KEY: 'ia-falsa', MAIA_PAINEL_SENHA: 'teste-recado' })
delete process.env.MAIA_CLIENTES_LIGADO
process.chdir(RAIZ)
await import('./maia-ensaio-rede.mjs')   // nada sai pra internet; a IA é simulada (anota tudo em <pasta>/ensaio-rede.jsonl)

const jiti = createJiti(import.meta.url, { alias: { '@': RAIZ }, interopDefault: true, moduleCache: true })
const imp = (f) => jiti.import(path.join(RAIZ, f))
const { maiaDb: db } = await imp('lib/maia/db.ts')
const R = await imp('lib/maia/recado.ts')
const D_ = await imp('lib/maia/dono.ts')
const A = await imp('lib/maia/atendente.ts')
const F = await imp('lib/maia/funil.ts')
const L = await imp('lib/maia/lgpd.ts')
const P = await imp('lib/maia/pendencias.ts')
const C = await imp('lib/maia/canal.ts')
const PD = await imp('lib/maia/painel-dono.ts')
const RS = await imp('lib/maia/resumo-semana.ts')
const ROT = await imp('lib/maia/rotina.ts')

let ok = 0, falha = 0
const confere = (nome, cond, extra = '') => { if (cond) { ok++; console.log('  ✔', nome) } else { falha++; console.log('  ✘', nome, extra ? '→ ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 500) : '') } }
const erroDe = async (fn) => { try { await fn(); return null } catch (e) { return String(e.message || e) } }
const etapa = (t) => console.log('\n' + t)
let seq = 0
const wid = () => 'teste-in-' + Date.now() + '-' + (++seq)

// o relógio: hoje às 11h no horário de Brasília (e os dias seguintes)
const H = 3600e3, DIA = 24 * H
const hojeBR = new Date(Date.now() - 3 * H).toISOString().slice(0, 10)
const T0 = new Date(`${hojeBR}T14:00:00Z`)   // 11h em Brasília
const em = (dias, horas = 0) => new Date(T0.getTime() + dias * DIA + horas * H)
const msgsDono = async (neg) => { const cv = await C.conversaDoDono(neg); return (await db.lista('msgs', { conversa_id: cv.id }, { ordem: 'criado_em' })).map(m => m.texto) }
const avisos = async (id, re) => (await db.lista('eventos', { tipo: 'aviso_equipe', negocio_id: id })).filter(e => re.test(e.detalhe?.titulo || ''))
const rec = async (id) => db.um('recados', { id })
const envios = async (recado_id) => db.lista('recado_envios', { recado_id })
// roda a rotina de hora em hora a partir de `inicio` até o recado terminar (ou n vezes)
async function rodaAte(recado_id, inicio, max = 8) {
  for (let i = 0; i < max; i++) { await R.rotinaRecados(new Date(inicio.getTime() + i * H)); const r = await rec(recado_id); if (r.status === 'enviado' || r.status === 'cancelado') return i + 1 }
  return max
}
// o caminho inteiro de um recado criado pela equipe: equipe aprova → dono aprova (painel) → Meta aprova → rotina manda
async function fluxo(neg, pedido, etiquetas, inicio, max = 8) {
  const r = await R.criaRecado(neg, { pedido, etiquetas, por: 'equipe' })
  await R.equipeAprovaRecado(r.id, 'teste')
  await R.donoAprovaRecado(neg.id, r.id, 'painel')
  await R.statusMetaSimulado(r.id, 'APPROVED')
  const rodadas = await rodaAte(r.id, inicio, max)
  return { ...(await rec(r.id)), rodadas }
}

etapa('0) O telefone (55 + DDD + número)')
confere('celular com DDD e 9: vira 55 + DDD + número', R.normalizaTel('(51) 99999-1234') === '5551999991234')
confere('celular sem o 9: ganha o 9', R.normalizaTel('51 9999-1234') === '5551999991234')
confere('fixo fica como está', R.normalizaTel('(51) 3714-1234') === '555137141234')
confere('já com +55: fica igual', R.normalizaTel('+55 51 99999-1234') === '5551999991234')
confere('sem DDD, curto ou DDD com zero: inválido (o 0 da operadora na frente sai)', R.normalizaTel('99999-1234') === null && R.normalizaTel('123') === null && R.normalizaTel('(10) 99999-1234') === null && R.normalizaTel('051 99999-1234') === '5551999991234')
confere('o mesmo número com e sem o 9 é reconhecido', R.variantes('5551999991234').includes('555199991234'))

etapa('1) A lotérica e a base de contatos (importar com repetidos e inválidos)')
const neg = await db.insere('negocios', { nome: 'Lotérica Trevo da Sorte', nicho: 'lotérica', cidade: 'Lajeado', dono_nome: 'José Almeida', dono_whatsapp: '5500077770001', plano: 'completa', status: 'ativo', contexto: { produto: 'jogos e bolões da Caixa', horario: 'segunda a sábado, das 8h às 18h' } })
const lista = [
  'nome;telefone;etiquetas',
  'Ana Souza;+55 (000) 1111-0001;mega, bolão',
  'Bruno Lima;5500011110002;mega',
  'Carla Dias;55 000 1111 0003;lotofácil',
  'Davi Rocha;5500011110004;"mega, lotofácil"',
  'Eva Prado;5500011110005;',
  'Fábio Nunes;5500011110006;mega',
  'Gil Torres;5500011110007;mega',
  'Hugo Melo;5500011110008;lotofácil',
  'Ana Souza;5500011110001;quina',        // repetida, com etiqueta nova
  'Zé;123;mega',                           // inválido
  'Maria;sem telefone;',                   // inválido
].join('\n')
let imp1 = await R.importaBase(neg, { texto: lista, por: 'equipe' })
confere('8 contatos entraram, 1 repetido e 2 inválidos', imp1.novos === 8 && imp1.repetidos === 1 && imp1.invalidos === 2, imp1)
let ana = await db.um('base', { negocio_id: neg.id, telefone: '5500011110001' })
confere('etiquetas sem acento e somadas da linha repetida (mega, bolao, quina)', ['mega', 'bolao', 'quina'].every(e => ana?.etiquetas?.includes(e)), ana?.etiquetas)
const imp2 = await R.importaBase(neg, { texto: 'Bruno Lima;5500011110002;mega', por: 'equipe' })
confere('importar de novo quem já está: não duplica (1 já estava)', imp2.novos === 0 && imp2.ja_estavam === 1 && (await db.lista('base', { negocio_id: neg.id })).length === 8, imp2)
// quem já comprou da lotérica entra junto (opção "incluir quem já comprou")
const iara = await F.novoLead(neg.id, { telefone: '5500011110009', nome: 'Iara Lopes', origem: 'dono' }, 'dono')
await F.ganhou(iara, 30, 'bolão da Quina', 'dono')
await F.novoLead(neg.id, { telefone: '5500011110010', nome: 'João Sem Compra', origem: 'organico' }, 'maia')
const imp3 = await R.importaBase(neg, { texto: '', incluir: 'compraram', por: 'equipe' })
const iaraBase = await db.um('base', { negocio_id: neg.id, telefone: '5500011110009' })
confere('"incluir quem já comprou": só quem comprou entra, com a etiqueta "comprou"', imp3.novos === 1 && iaraBase?.etiquetas?.includes('comprou') && !(await db.um('base', { negocio_id: neg.id, telefone: '5500011110010' })), imp3)
const mais = Array.from({ length: 20 }, (_, i) => `Cliente ${i + 1};55000222200${String(i + 1).padStart(2, '0')};mega`).join('\n')
await R.importaBase(neg, { texto: mais, por: 'equipe' })
let b = await R.baseDoNegocio(neg)
confere('a base fica com 29 contatos e as etiquetas contadas', b.total === 29 && b.ativos === 29 && b.etiquetas.find(e => e.nome === 'mega')?.n === 25, { total: b.total, etq: b.etiquetas })

etapa('2) O dono manda a lista pelo WhatsApp (planilha .csv, contatos e .xlsx)')
const csv = Buffer.from('nome,telefone\nKátia Ramos,5500033330001\nLeo Faria,5500033330002\nLeo Faria,5500033330002\nsem número,abc\n', 'utf8')
let rd = await D_.recebeDoDono(neg, { id: wid(), type: 'document', document: { mime_type: 'text/csv', filename: 'clientes.csv' } }, 'José', { buf: csv, mime: 'text/csv' })
let ult = (await msgsDono(neg)).slice(-1)[0] || ''
confere('a planilha .csv entra sem IA e a Maia confirma quantos entraram', rd?.responder === false && /Recebi a lista: 2 contatos novos entraram/.test(ult) && /1 repetido/.test(ult) && /1 número não deu pra ler/.test(ult), ult)
rd = await D_.recebeDoDono(neg, { id: wid(), type: 'contacts', contacts: [{ name: { formatted_name: 'Mara Pires' }, phones: [{ phone: '+55 000 3333-0003', wa_id: '5500033330003' }] }] }, 'José')
ult = (await msgsDono(neg)).slice(-1)[0] || ''
confere('contato compartilhado do celular também entra', /1 contato novo entrou/.test(ult) && !!(await db.um('base', { negocio_id: neg.id, telefone: '5500033330003' })), ult)
rd = await D_.recebeDoDono(neg, { id: wid(), type: 'document', document: { mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: 'clientes.xlsx' } }, 'José', { buf: Buffer.from('PK'), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
ult = (await msgsDono(neg)).slice(-1)[0] || ''
confere('planilha .xlsx: a Maia explica como salvar em .csv', /formato \.csv/.test(ult), ult)
confere('a lista não virou foto no banco de mídias', (await db.lista('midias', { negocio_id: neg.id })).length === 0)
// os 3 da lista do dono saem da base (pra conta dos próximos passos ficar em 29)
for (const t of ['5500033330001', '5500033330002', '5500033330003']) { const c = await db.um('base', { negocio_id: neg.id, telefone: t }); if (c) await R.mudaContato(neg, c.id, { apagar: true }, 'teste') }
confere('a equipe apaga um contato da base', (await R.baseDoNegocio(neg)).total === 29)

etapa('3) O dono pede o recado pelo WhatsApp')
await D_.recebeDoDono(neg, { id: wid(), type: 'text', text: { body: 'manda pra base que abriu o bolão da Mega da Virada, 10 cotas de R$ 50' } }, 'José')
const resp = await D_.respondeDono((await C.conversaDoDono(neg)).id)
let r1 = (await db.lista('recados', { negocio_id: neg.id }))[0]
confere('a Maia chamou a ferramenta e o recado nasceu esperando a equipe', resp?.ferramentas?.includes('recado_pra_base') && r1?.status === 'aprovar_equipe' && r1?.criado_por === 'dono', { resp, st: r1?.status })
confere('a Maia confirmou pro dono', /Fechado!/.test((await msgsDono(neg)).slice(-1)[0] || ''))
confere('o texto: sem saudação, valor antes do preço e chamando pra responder', r1 && !/^oi/i.test(r1.texto) && r1.texto.indexOf('prêmio') >= 0 && r1.texto.indexOf('prêmio') < r1.texto.indexOf('R$') && /Responde aqui/.test(r1.texto), r1?.texto)
confere('a equipe foi avisada pra aprovar (com o custo estimado)', (await avisos(neg.id, /recado pra base pra aprovar/)).some(e => /29 contatos/.test(e.detalhe.texto) && e.detalhe.texto.includes('R$ 11,60')))
confere('o dono não pode aprovar antes da equipe', /não está esperando a tua aprovação/.test(await erroDe(() => R.donoAprovaRecado(neg.id, r1.id, 'painel')) || ''))

etapa('4) A equipe pede ajuste e aprova; vai pro dono com o custo')
const antes = r1.texto
await R.equipeAjustaRecado(r1.id, 'fala que as cotas são poucas', 'equipe')
r1 = await rec(r1.id)
confere('o ajuste da equipe refaz o texto e continua com a equipe', r1.texto !== antes && /poucas/.test(r1.texto) && r1.status === 'aprovar_equipe', r1.texto)
const ap = await R.equipeAprovaRecado(r1.id, 'equipe')
r1 = await rec(r1.id)
ult = (await msgsDono(neg)).slice(-1)[0] || ''
confere('aprovado pela equipe: espera o dono, com a prévia, os botões e o custo', r1.status === 'aprovar_dono' && /Oi, \(nome da pessoa\)!/.test(ult) && /\[Quero participar\] \[Não quero receber\]/.test(ult) && /Vai pra 29 contatos/.test(ult) && ult.includes('R$ 11,60') && ap.estimativa.custo === 11.6, ult)
confere('o recado entra nas pendências do dono', (await P.pendenciasDoDono(neg)).some(p => p.tipo === 'recado'))
const pdono = await R.painelDoDono(neg)
confere('o painel do dono mostra o recado com a estimativa (sem a nota interna)', pdono.disponivel && pdono.recados[0].status === 'aprovar_dono' && pdono.recados[0].estimativa.contatos === 29 && pdono.recados[0].nota === null)

etapa('5) O dono aprova com 👍; o WhatsApp (Meta simulada) aprova o modelo')
await D_.recebeDoDono(neg, { id: wid(), type: 'reaction', reaction: { emoji: '👍', message_id: r1.wamid_dono } }, 'José')
r1 = await rec(r1.id)
confere('o 👍 em cima do recado pede o modelo de MARKETING na Meta', r1.status === 'aguardando_meta' && /^maia_recado_bolao_da_mega_da_virada_\d{4}_[0-9a-f]{4}$/.test(r1.modelo_nome) && r1.modelo_status === 'PENDING', r1.modelo_nome)
confere('a Maia confirma pro dono', /Aprovado ✅/.test((await msgsDono(neg)).slice(-1)[0] || ''))
await R.rotinaRecados(em(0))
confere('sem a Meta aprovar, nada sai', (await rec(r1.id)).status === 'aguardando_meta' && (await envios(r1.id)).length === 0)
await R.statusMetaSimulado(r1.id, 'APPROVED')
await R.rotinaRecados(em(0, 11))   // 22h
confere('a Meta aprovou de noite: fica agendado e não manda fora do horário', (await rec(r1.id)).status === 'agendado' && (await envios(r1.id)).length === 0)

etapa('6) A rotina manda em lotes, no horário, respeitando o optout')
const carla = await db.um('base', { negocio_id: neg.id, telefone: '5500011110003' })
await R.mudaContato(neg, carla.id, { optout: true }, 'equipe')
// o Bruno falou com a lotérica há pouco: a janela de 24 h está aberta (recebe como texto, sem modelo)
const cvBruno = await C.conversa(neg.id, 'cliente', '5500011110002', { nome: 'Bruno Lima' })
await db.atualiza('conversas', { id: cvBruno.id }, { janela_ate: new Date(Date.now() + 20 * H).toISOString() })
await db.atualiza('negocios', { id: neg.id }, { meta: { ...(neg.meta || {}), recado: { lote: 10 } } })
await R.rotinaRecados(em(0))
confere('1ª rodada (11h): 10 contatos, status "enviando"', (await envios(r1.id)).length === 10 && (await rec(r1.id)).status === 'enviando')
await R.rotinaRecados(em(0, 1))
confere('2ª rodada (12h): mais 10', (await envios(r1.id)).length === 20)
await R.rotinaRecados(em(0, 2))
r1 = await rec(r1.id)
let es1 = await envios(r1.id)
confere('3ª rodada (13h): os 8 que faltavam e o recado termina (28 = 29 menos a Carla)', es1.length === 28 && r1.status === 'enviado' && r1.enviados === 28, { n: es1.length, st: r1.status })
confere('quem pediu pra sair (Carla) não recebeu', !es1.some(e => e.telefone === '5500011110003'))
confere('com a janela aberta vai como texto (com o jeito de responder); o resto pelo modelo', es1.find(e => e.telefone === '5500011110002')?.como === 'texto' && es1.filter(e => e.como === 'modelo').length === 27)
const txtBruno = (await db.lista('msgs', { conversa_id: cvBruno.id })).map(m => m.texto).join('\n')
confere('o texto pro Bruno leva o nome, o recado e "responder QUERO / SAIR"', /^Oi, Bruno! /.test(txtBruno) && /responder QUERO/.test(txtBruno) && /responde SAIR/.test(txtBruno), txtBruno)
confere('o dono recebe o "pronto: foi pra 28 contatos"', (await msgsDono(neg)).some(t => /Pronto: o recado "Bolão da Mega da Virada" foi pra 28 contatos/.test(t)))
await R.rotinaRecados(em(0, 3))
confere('rodando de novo: ninguém recebe duas vezes', (await envios(r1.id)).length === 28)
const wAna = es1.find(e => e.telefone === '5500011110001').wamid, wDavi = es1.find(e => e.telefone === '5500011110004').wamid
await R.anotaStatusEnvio(wAna, 'entregue'); await R.anotaStatusEnvio(wDavi, 'lido'); await R.anotaStatusEnvio(wDavi, 'entregue')
confere('entregue/lido da Meta contam (e "entregue" não volta atrás de "lido")', (await R.reconta(r1.id)).entregues === 2 && (await db.um('recado_envios', { wamid: wDavi })).status === 'lido')

etapa('7) As respostas: "Quero participar", "Não quero receber" e uma pergunta')
const antesDono = (await msgsDono(neg)).length
const rA = await A.recebeDoCliente(neg, { telefone: '5500011110001', nome: 'Ana Souza', texto: 'Quero participar', wamid: wid() })
let leadAna = await db.um('leads', { negocio_id: neg.id, telefone: '5500011110001' })
const cvAna = await db.um('conversas', { id: rA.cv.id })
confere('"Quero participar" vira contato no funil (origem base, proposta, com o recado)', rA.responder === false && leadAna?.origem === 'base' && leadAna?.etapa === 'proposta' && leadAna?.produto === 'Bolão da Mega da Virada', leadAna)
confere('a conversa passa pro time do negócio fechar (a Maia não vende)', cvAna.modo === 'humano' && (await db.lista('eventos', { negocio_id: neg.id, tipo: 'modo_humano' })).some(e => e.detalhe?.tipo === 'fechar' && e.detalhe?.conversa_id === cvAna.id))
const novasDono = (await msgsDono(neg)).slice(antesDono).join('\n')
confere('o dono é avisado na hora: "quer fechar"', /Ana Souza \(5500011110001\) quer fechar: respondeu "Quero participar" no recado "Bolão da Mega da Virada"/.test(novasDono), novasDono)
const txtAna = (await db.lista('msgs', { conversa_id: cvAna.id })).filter(m => m.autor === 'maia').map(m => m.texto).join('\n')
confere('a Ana recebe "uma pessoa fala com você" (no "você" do negócio, sem Pix nem link)', /uma pessoa fala com você por aqui mesmo/.test(txtAna) && !/pix|link/i.test(txtAna), txtAna)
confere('a pendência "quer fechar" aparece pro dono', (await P.pendenciasDoDono(neg)).some(p => p.tipo === 'fechar' && p.lead_id === leadAna.id))
const rB = await A.recebeDoCliente(neg, { telefone: '5500011110002', nome: 'Bruno Lima', texto: 'Não quero receber', wamid: wid() })
const bruno = await db.um('base', { negocio_id: neg.id, telefone: '5500011110002' })
confere('"Não quero receber": sai da lista na hora, sem virar contato do funil e sem IA', rB.responder === false && bruno.optout === true && !!bruno.optout_em && !(await db.um('leads', { negocio_id: neg.id, telefone: '5500011110002' })))
confere('a Maia confirma educadamente', /Pronto, você não vai mais receber esses avisos da?o? Lotérica Trevo da Sorte/.test((await db.lista('msgs', { conversa_id: cvBruno.id }, { ordem: 'criado_em' })).slice(-1)[0]?.texto || ''))
const rD = await A.recebeDoCliente(neg, { telefone: '5500011110004', nome: 'Davi Rocha', texto: 'Quanto custa a cota? Dá pra pagar na hora?', wamid: wid() })
const leadDavi = await db.um('leads', { negocio_id: neg.id, telefone: '5500011110004' })
confere('uma pergunta: vira contato (origem base) e a Maia atende normal', rD.responder === true && leadDavi?.origem === 'base' && (await db.lista('lead_eventos', { lead_id: leadDavi.id })).some(e => e.tipo === 'recado_resposta'))
const ctxD = await R.contextoDoRecado(neg, '5500011110004')
confere('a Maia sabe de qual recado ele veio (e que não vende pelo WhatsApp)', /RECEBEU O RECADO PRA BASE "Bolão da Mega da Virada"/.test(ctxD) && /não vende nem cobra/.test(ctxD), ctxD)
const respD = await A.respondeCliente(rD.cv.id)
confere('a resposta da Maia sai (IA simulada)', (respD?.mensagens || []).length > 0, respD)
r1 = await R.reconta(r1.id).then(() => rec(r1.id))
confere('os números do recado: 3 responderam, 1 quer, 1 saiu', r1.respostas === 3 && r1.quero === 1 && r1.saidas === 1, { respostas: r1.respostas, quero: r1.quero, saidas: r1.saidas })
const rF = await A.recebeDoCliente(neg, { telefone: '5500011110006', nome: 'Fábio Nunes', texto: 'quero', wamid: wid() })
confere('"quero" escrito (1ª resposta) também vale como "Quero participar"', rF.quero === true && (await rec(r1.id)).quero === 2)

etapa('8) A venda marcada soma no recado')
await F.ganhou(leadAna, 100, 'cota do bolão', 'equipe')
r1 = await rec(r1.id)
confere('a equipe marca a venda da Ana: o recado conta 1 venda de R$ 100', r1.vendas === 1 && Number(r1.valor_vendas) === 100)
await F.ganhou(await db.um('leads', { id: leadAna.id }), 100, 'cota do bolão', 'equipe')
confere('marcar de novo a mesma venda não conta duas vezes', (await rec(r1.id)).vendas === 1)
await D_.respostaDeVenda(neg, await C.conversaDoDono(neg), leadDavi.id, true)
await F.ganhou(await db.um('leads', { id: leadDavi.id }), 50, null, 'dono')
r1 = await rec(r1.id)
confere('o dono conta a venda do Davi: 2 vendas, R$ 150', r1.vendas === 2 && Number(r1.valor_vendas) === 150, { vendas: r1.vendas, valor: r1.valor_vendas })
const iaraDepois = await rec(r1.id)
await F.ganhou(await db.um('leads', { id: iara.id }), 30, null, 'dono')
confere('venda de quem não respondeu o recado não soma', (await rec(r1.id)).vendas === iaraDepois.vendas)

etapa('9) Os limites: etiqueta, 1 a cada 3 dias, 2 por semana, optout e ajuste do dono')
const r2 = await R.criaRecado(neg, { pedido: 'Lotofácil da Independência acumulada, bolão com 8 cotas de R$ 25', etiquetas: ['lotofácil'], por: 'equipe' })
confere('etiqueta que ninguém tem é recusada', /nenhum contato da base tem a etiqueta/.test(await erroDe(() => R.criaRecado(neg, { pedido: 'teste de etiqueta', etiquetas: ['dupla sena'], por: 'equipe' })) || ''))
await R.equipeEditaRecado(r2.id, { texto: 'A Lotofácil da Independência está acumulada e o bolão da loja abriu. São 8 cotas de R$ 25. Quer participar? Responde aqui que a gente separa a sua.' }, 'equipe')
await R.equipeAprovaRecado(r2.id, 'equipe')
const aj = await R.donoAjustaRecado(neg.id, r2.id, 'põe que dá pra pagar na loja')
confere('o dono pede ajuste: volta pra equipe com o pedido dele', aj.ok && (await rec(r2.id)).status === 'aprovar_equipe' && /o dono pediu/.test((await rec(r2.id)).nota || ''))
await R.equipeAprovaRecado(r2.id, 'equipe')
await R.donoAprovaRecado(neg.id, r2.id, 'painel')
await R.statusMetaSimulado(r2.id, 'APPROVED')
await rodaAte(r2.id, em(1))
const x2 = await rec(r2.id)
confere('1 dia depois, pra "lotofacil": Davi e Hugo já receberam há menos de 3 dias (pulados), Carla saiu', x2.status === 'enviado' && x2.enviados === 0 && x2.pulados === 2, { st: x2.status, env: x2.enviados, pul: x2.pulados })
confere('o dono fica sabendo que não foi pra ninguém', (await msgsDono(neg)).some(t => /não foi pra ninguém/.test(t)))
const x3 = await fluxo(neg, 'Quina de São João acumulada, bolão com 10 cotas de R$ 20', null, em(3, 3))
const es3 = await envios(x3.id)
confere('3 dias depois, pra toda a base: 27 recebem (Carla e Bruno saíram)', x3.enviados === 27 && !es3.some(e => ['5500011110002', '5500011110003'].includes(e.telefone)), { env: x3.enviados })
const x4 = await fluxo(neg, 'Mega-Sena acumulada, bolão com 5 cotas de R$ 40', null, em(6, 6))
confere('6 dias depois: ninguém recebe o 3º recado da semana (máximo 2 por semana)', x4.enviados === 0 && x4.pulados === 27, { env: x4.enviados, pul: x4.pulados })
const x5 = await R.criaRecado(neg, { pedido: 'Dupla Sena de Páscoa', por: 'equipe' })
await R.cancelaRecado(x5.id, 'equipe')
await R.rotinaRecados(em(7))
confere('recado cancelado não sai', (await rec(x5.id)).status === 'cancelado' && (await envios(x5.id)).length === 0)
const r6 = await R.criaRecado(neg, { pedido: 'Timemania acumulada', por: 'equipe' })
await R.equipeAprovaRecado(r6.id, 'equipe'); await R.donoAprovaRecado(neg.id, r6.id, 'painel')
await R.statusMetaSimulado(r6.id, 'REJECTED', 'INVALID_FORMAT')
await R.rotinaRecados(em(7))
confere('a Meta recusou o modelo: volta pra equipe ajustar e a equipe é avisada', (await rec(r6.id)).status === 'aprovar_equipe' && /a Meta recusou/.test((await rec(r6.id)).nota || '') && (await avisos(neg.id, /a Meta recusou o recado/)).length === 1)

etapa('10) Painéis, resumo da semana e a rotina inteira')
const pr = await R.painelRecados(neg)
const p1 = pr.find(x => x.id === r1.id)
confere('painel da equipe: números do recado (enviados, entregues, responderam, quero, saíram, vendas)', p1.numeros.enviados === 28 && p1.numeros.entregues === 2 && p1.numeros.respostas === 4 && p1.numeros.quero === 2 && p1.numeros.saidas === 1 && p1.numeros.vendas === 2 && p1.custo_real === 11.2, p1.numeros)
const dp = await PD.dadosDoPainel(neg)
confere('painel do dono: o cartão do recado com a base e os números', dp.recado?.disponivel && dp.recado.base.ativos === 27 && dp.recado.recados.some(x => x.id === r1.id && x.numeros.vendas === 2))
const dsem = await RS.dadosDaSemana(neg, em(-1), em(8))
const tsem = RS.textoResumo(neg, dsem)
confere('o resumo da semana tem a linha do recado pra base', /Recado pra base: 2 recados pra 55 contatos, 2 quiseram participar, 2 vendas/.test(tsem), tsem)
confere('o recado não aparece como "melhor anúncio"', !/Melhor anúncio/.test(tsem))
const rot = await ROT.roda({ relogio: em(10) })
confere('a rotina de hora em hora roda o recado sem erro', Array.isArray(rot.recados) && !rot.recados_erro, rot.recados_erro)

etapa('11) Apagar dados (LGPD)')
const antesL = await rec(r1.id)
const lg = await L.apagaContato(neg.id, { lead_id: leadDavi.id }, 'equipe')
confere('apagar os dados do Davi tira ele da base', lg.base >= 1 && !(await db.um('base', { negocio_id: neg.id, telefone: '5500011110004' })), lg)
confere('o telefone dele some dos envios, mas a conta do recado continua', !(await db.lista('recado_envios', { negocio_id: neg.id })).some(e => e.telefone === '5500011110004') && (await R.reconta(r1.id)).enviados === antesL.enviados)

etapa('12) WhatsApp do negócio desligado: número de verdade não sai')
const neg2 = await db.insere('negocios', { nome: 'Lotérica Real', dono_nome: 'Rui', dono_whatsapp: '5500077770002', plano: 'completa', status: 'ativo' })
await R.importaBase(neg2, { texto: 'Cliente Real;(51) 99999-1234;mega', por: 'equipe' })
const y = await fluxo(neg2, 'bolão da Mega da Virada aberto', null, em(0), 2)
confere('o recado fica parado (nada sai) e a equipe é avisada uma vez', y.status === 'agendado' && (await envios(y.id)).length === 0 && (await avisos(neg2.id, /recado pra base parado/)).length === 1, { st: y.status })

etapa('13) Nada saiu pra internet')
const log = fs.readFileSync(path.join(RAIZ, PASTA, 'ensaio-rede.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l))
const bloqueadas = log.filter(l => l.tipo === 'bloqueada')
confere('nenhuma tentativa de falar com a Meta/WhatsApp (graph.facebook.com)', !bloqueadas.some(l => /facebook|whatsapp/.test(l.host)), bloqueadas)
confere('a IA usada foi só a simulada (recado, ferramenta e conversa)', log.some(l => l.o === 'recado') && log.some(l => l.o === 'ferramenta') && !log.some(l => l.tipo === 'ia_fora'))
if (bloqueadas.length) console.log('    (bloqueadas pela rede de teste, nada saiu: ' + [...new Set(bloqueadas.map(l => l.host))].join(', ') + ')')

etapa('14) Sem o SQL rodado: a função fica indisponível e o resto segue')
{
  const chaves = ['MAIA_LOCAL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'MAIA_SUPABASE_URL', 'MAIA_SUPABASE_SERVICE_KEY']
  const salva = Object.fromEntries(chaves.map(k => [k, process.env[k]])), fetchAntes = globalThis.fetch
  Object.assign(process.env, { MAIA_LOCAL: '0', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_SERVICE_ROLE_KEY: 'x' })
  delete process.env.MAIA_SUPABASE_URL; delete process.env.MAIA_SUPABASE_SERVICE_KEY
  globalThis.fetch = async (u) => /maia_(base|recados|recado_envios)/.test(String(u))
    ? new Response(JSON.stringify({ code: 'PGRST205', message: "Could not find the table 'public.maia_base' in the schema cache" }), { status: 404 })
    : new Response('[]', { status: 200 })
  try {
    confere('baseDisponivel() diz que não', (await R.baseDisponivel()) === false)
    confere('criar recado dá o erro claro do SQL', /falta rodar o db\/maia-recado-base.sql/.test(await erroDe(() => R.criaRecado(neg, { pedido: 'bolão de teste', por: 'equipe' })) || ''))
    confere('a resposta do cliente segue o caminho normal (sem recado)', (await R.respostaDaBase(neg, { telefone: '5500011110001', texto: 'Quero participar' })) === null)
    confere('a rotina pula o recado sem erro', (await R.rotinaRecados(em(0))).indisponivel === true)
  } finally { for (const k of chaves) { if (salva[k] === undefined) delete process.env[k]; else process.env[k] = salva[k] } globalThis.fetch = fetchAntes }
}

// ─── opcional: as rotas dos painéis, com o servidor do ensaio no ar
const [URL_, SENHA] = process.argv.slice(2)
if (URL_) {
  etapa('15) As rotas dos painéis (servidor ' + URL_ + ')')
  const op = async (acao, corpo = {}) => { const r = await fetch(URL_ + '/api/maia/operacao', { method: 'POST', headers: { 'x-senha': SENHA, 'content-type': 'application/json' }, body: JSON.stringify({ acao, por: 'teste-recado', ...corpo }) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(acao + ': ' + (j.erro || r.status)); return j }
  const ver = async (acao, q = {}) => { const r = await fetch(URL_ + '/api/maia/operacao?' + new URLSearchParams({ acao, ...q }), { headers: { 'x-senha': SENHA } }); return r.json() }
  const n = await op('criar_negocio', { nome: 'Lotérica Rota', dono_whatsapp: '5500077770099', dono_nome: 'Tina' })
  const im = await op('base_importar', { negocio_id: n.id, texto: 'Ana;5500044440001;mega\nBia;5500044440002;mega\nx;12;', incluir: null })
  confere('equipe: importar pela rota', im.novos === 2 && im.invalidos === 1, im)
  const rc = await op('recado_criar', { negocio_id: n.id, pedido: 'abriu o bolão da Mega da Virada, 10 cotas de R$ 50' })
  confere('equipe: criar recado pela rota (com a estimativa)', rc.status === 'aprovar_equipe' && rc.estimativa?.contatos === 2, rc)
  await op('recado_aprovar', { recado_id: rc.id })
  const g = await ver('base', { negocio: n.id })
  confere('equipe: a aba Base lista a base e o recado esperando o dono', g.disponivel && g.base.total === 2 && g.recados[0].status === 'aprovar_dono', g)
  await op('atualizar_negocio', { id: n.id, meta: { ad_account_id: 'x' } })
  await op('base_config', { negocio_id: n.id, custo_msg: '0,40' })
  await op('atualizar_negocio', { id: n.id, meta: { ad_account_id: 'y' } })
  confere('salvar os Dados não apaga o custo por mensagem do recado', (await ver('base', { negocio: n.id })).custo_msg === 0.4)
  const lk = await op('link_painel_dono', { negocio_id: n.id })
  const t = String(lk.link || lk.url || '').split('t=')[1]
  if (t) {
    const ent = await fetch(URL_ + '/api/maia/painel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ acao: 'entrar', t }) })
    const ck = 'maia_dono=' + encodeURIComponent(t)
    const pn = async (corpo) => { const r = await fetch(URL_ + '/api/maia/painel', { method: 'POST', headers: { 'content-type': 'application/json', cookie: ck, 'x-maia-painel': '1' }, body: JSON.stringify(corpo) }); return { ok: r.ok, j: await r.json().catch(() => ({})) } }
    const tudo = await (await fetch(URL_ + '/api/maia/painel?acao=tudo', { headers: { cookie: ck } })).json()
    confere('dono: o painel traz o cartão do recado', ent.ok && tudo.recado?.disponivel && tudo.recado.recados[0]?.status === 'aprovar_dono', tudo.recado)
    const a = await pn({ acao: 'recado_aprovar', recado_id: rc.id })
    confere('dono: aprovar pelo painel pede o modelo', a.ok && (await ver('base', { negocio: n.id })).recados[0].status === 'aguardando_meta', a.j)
    const v = await pn({ acao: 'recado_criar', pedido: 'oi' })
    confere('dono: erro de regra volta com a frase (não "não deu")', !v.ok && /escreve o que o recado tem que avisar/.test(v.j.erro || ''), v.j)
    const ib = await pn({ acao: 'base_importar', texto: 'Caio;5500044440003;quina' })
    confere('dono: importar pelo painel', ib.ok && ib.j.novos === 1, ib.j)
  } else confere('link do painel do dono', false, lk)
}

console.log(`\n${ok} de ${ok + falha} conferências passaram.`)
process.exit(falha ? 1 : 0)
