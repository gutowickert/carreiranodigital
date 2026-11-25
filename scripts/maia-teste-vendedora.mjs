// Maia: o teste da VENDEDORA da Maia no número da Maia (lib/maia/vendedora.ts, 24/11, doc do Guto "Maia vende a Maia").
// Modo local: o banco do número da Maia em .oito-local (OITO_LOCAL=1), o CRM da escola FALSO (globalThis.__maiaEscolaFake),
// a IA e a Meta simuladas (telefones 55000 não saem pra Meta). Nada toca banco nem WhatsApp de verdade.
// Uso: node scripts/maia-teste-vendedora.mjs
import fs from 'node:fs'
import path from 'node:path'
import { createJiti } from 'jiti'

const RAIZ = path.resolve(import.meta.dirname, '..')
fs.rmSync(path.join(RAIZ, '.oito-local'), { recursive: true, force: true })
Object.assign(process.env, { OITO_LOCAL: '1', MAIA_LOCAL: '1', MAIA_LOCAL_PASTA: '.maia-teste/vendedora', MAIA_SEM_AVISO: '1', ANTHROPIC_API_KEY: 'teste', MAIA_VENDEDORA_LIGADA: '1' })
fs.rmSync(path.join(RAIZ, '.maia-teste/vendedora'), { recursive: true, force: true })
process.chdir(RAIZ)

// ---------- o CRM da escola falso ----------
const leads = [], andamentos = [], pushes = []
globalThis.__maiaEscolaFake = {
  async achaLead(suf) { return leads.filter(l => String(l.whatsapp).endsWith(suf)).slice(-1)[0] || null },
  async criaLead(l) { const n = { id: 'L' + (leads.length + 1), codigo_turma: 'maiaquiz', ...l }; leads.push(n); return n },
  async atualizaLead(id, c) { Object.assign(leads.find(l => l.id === id), c) },
  async andamento(lead_id, texto, etapa) { andamentos.push({ lead_id, texto, etapa }) },
  async push(t, x) { pushes.push(t) },
  async leadsQuiz(desde, ate) { return leads.filter(l => l.codigo_turma === 'maiaquiz' && l.criado_em && l.criado_em >= desde && l.criado_em <= ate) },
}
// ---------- a IA simulada: responde conforme a última mensagem do dono ----------
const pedidos = []
let roteiroIA = null
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url))
  if (u.host !== 'api.anthropic.com') throw new Error('fetch fora do roteiro: ' + url)
  const corpo = JSON.parse(opts.body)
  pedidos.push({ system: corpo.system, pedido: corpo.messages[0].content })
  const ult = (corpo.messages[0].content.match(/DONO DO NEGÓCIO: (.*)\n?/g) || []).slice(-1)[0] || ''
  let txt = roteiroIA ? roteiroIA(ult) : '<msg>Oi! Aqui é a Maia.</msg><acao>nenhuma</acao><resumo>teste</resumo>'
  return new Response(JSON.stringify({ content: [{ type: 'text', text: txt }] }), { status: 200, headers: { 'content-type': 'application/json' } })
}

let ok = 0, n = 0
const confere = (x, m, extra) => { n++; if (x) ok++; console.log((x ? '  ✔ ' : '  ✘ ') + m + (x || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 300))) }
const jiti = createJiti(import.meta.url, { alias: { '@': RAIZ }, interopDefault: true, moduleCache: true })
const { oitoDb: db } = await jiti.import(path.join(RAIZ, 'lib/oito/db.ts'))
const { atendeConversa } = await jiti.import(path.join(RAIZ, 'lib/oito/vendedor.ts'))
const V = await jiti.import(path.join(RAIZ, 'lib/maia/vendedora.ts'))

async function conversa(tel, nome) { return db.insere('wa_conversas', { telefone: tel, nome, fase: 'maia', modo: 'ia', ia_respostas: 0, rascunho: {} }) }
async function diz(cv, texto) { await db.insere('wa_msgs', { conversa_id: cv.id, autor: 'cliente', tipo: 'text', texto, status: 'recebido' }); await db.atualiza('wa_conversas', { id: cv.id }, { ultima_msg: texto }) }
const saidas = async (cv) => (await db.lista('wa_msgs', { conversa_id: cv.id }, { ordem: 'criado_em' })).filter(m => m.autor === 'ia')
const conv = async (cv) => db.um('wa_conversas', { id: cv.id })

console.log('Maia · teste da vendedora (modo local, CRM da escola falso, IA simulada)')

// 1. quem fez o quiz: a IA recebe o diagnóstico e o treinamento; o lead do quiz é o mesmo (não cria outro)
console.log('\n=== Fez o quiz e chamou')
leads.push({ id: 'Q1', nome: 'Silva', whatsapp: '19991234567', codigo_turma: 'maiaquiz', qualificacao: { maia_quiz: 'abc', produto: 'Maia', nicho: 'oficina', negocio: 'Auto Center Silva', cidade: 'Campinas', uf: 'SP', principal: 'Cliente novo que chega pelo anúncio', oportunidade_mes: 9000, ganho_anuncio_mes: 6000, pontos: [{ ponto: 'Cliente novo pelo anúncio', valor_mes: 6000 }] } })
const c1 = await conversa('5500019991234567', 'Silva')
await diz(c1, 'Oi! Fiz o diagnóstico da Maia pra Auto Center Silva, de Campinas/SP. Quero começar.')
roteiroIA = () => '<msg>Oi! Aqui é a Maia. Vi o diagnóstico da Auto Center Silva: o maior ganho foi cliente novo chegando pelo anúncio, uns R$ 6 mil por mês.</msg><msg>Quer que eu te explique como eu faço isso na prática?</msg><acao>nenhuma</acao><resumo>oficina em Campinas, quer entender</resumo>'
let r = await atendeConversa(c1.id)
const p0 = pedidos[0]
confere(r?.ok && r.lead_id === 'Q1' && leads.length === 1, 'achou o lead do quiz pelo telefone (não criou outro)', r)
confere(/DIAGNÓSTICO DO QUIZ:\s*\nNegócio: Auto Center Silva \(oficina mecânica\), Campinas\/SP/.test(p0.pedido) && /R\$\s6\.000/.test(p0.pedido) && /Cliente novo que chega pelo anúncio/.test(p0.pedido), 'a IA recebe o diagnóstico (negócio, cidade, ponto principal e os números)', p0.pedido.slice(0, 400))
confere(/R\$ 497/.test(p0.system) && /R\$ 797/.test(p0.system) && /Rick/.test(p0.system) && /Sem emoji/.test(p0.system) && /NUNCA:/.test(p0.system), 'o treinamento da Parte 2 vai inteiro (oferta R$ 497 e R$ 797, Rick, sem emoji, o que nunca fazer)')
confere((await saidas(c1)).length === 2 && leads[0].qualificacao.maia_etapa === 'conversando' && andamentos.some(a => a.lead_id === 'Q1' && /começou a conversar/.test(a.texto) && a.etapa === 'maia_conversando'), 'mandou as 2 mensagens; o lead vira "conversando" com andamento (etapa maia_conversando do funil)')

// 2. quer começar: avisa a equipe, etapa proposta, a IA segue ligada
console.log('\n=== Quer começar')
await diz(c1, 'Quero começar sim, de manhã pode ser')
roteiroIA = () => '<msg>Perfeito! Vou pedir pra equipe te mandar o link do 1º mês (R$ 497, já com a implantação) e combinar o dia da implantação por vídeo.</msg><acao>comecar</acao><periodo>manhã</periodo><resumo>Auto Center Silva, Campinas: quer começar</resumo>'
r = await atendeConversa(c1.id)
confere(r.acao === 'comecar' && leads[0].qualificacao.maia_etapa === 'proposta' && andamentos.some(a => /Quer começar \(manhã\)/.test(a.texto) && a.etapa === 'maia_proposta') && pushes.some(t => /quer começar/.test(t)), 'quer começar: etapa "proposta", andamento com o período e aviso pro time', { r, pushes })
confere((await conv(c1)).modo === 'ia', 'depois de "quer começar" a IA segue ligada (responde dúvida até a equipe mandar o link)')

// 3. chamou direto (sem quiz): cria o lead na turma maiaquiz e oferece o quiz
console.log('\n=== Chamou direto')
const c2 = await conversa('5500051988887777', 'Ótica Luz')
await diz(c2, 'Oi, vi o anúncio da Maia, como funciona?')
roteiroIA = () => '<msg>Oi! Aqui é a Maia. Qual é o seu negócio e em que cidade?</msg><msg>Se quiser, faça o diagnóstico de 1 minuto: www.carreiranodigital.com/maia/quiz/otica</msg><acao>nenhuma</acao><resumo>chamou direto</resumo>'
r = await atendeConversa(c2.id)
const novo = leads.find(l => l.id === r.lead_id)
confere(novo && novo.codigo_turma === 'maiaquiz' && novo.origem === 'whatsapp' && novo.qualificacao.origem === 'whatsapp_maia' && /chamou direto/.test(novo.negocio), 'chamou sem o quiz: cria o lead na turma maiaquiz (cai no funil da Maia)', novo)
confere(/não fez o quiz/.test(pedidos.slice(-1)[0].pedido) && (await conv(c2)).rascunho.maia.lead_id === novo.id, 'a IA sabe que não tem diagnóstico; a conversa guarda o lead')
r = await atendeConversa(c2.id)
confere(leads.length === 2, 'na 2ª resposta não cria outro lead')

// 4. RS: passa pra equipe e a IA para
console.log('\n=== RS e pedido de pessoa')
leads.push({ id: 'Q3', nome: 'Rui', whatsapp: '51977776666', qualificacao: { maia_quiz: 'x', nicho: 'oficina', negocio: 'Oficina do Rui', cidade: 'Lajeado', uf: 'RS', principal: 'Retomada', oportunidade_mes: 3000 } })
const c3 = await conversa('5500051977776666', 'Rui')
await diz(c3, 'Oi, fiz o diagnóstico')
roteiroIA = () => '<msg>Oi! Que bom que fez o diagnóstico. A nossa equipe vai falar com você pra ver a melhor forma pra quem é do RS.</msg><acao>rs</acao><resumo>Oficina do Rui, Lajeado/RS</resumo>'
r = await atendeConversa(c3.id)
confere(/ele é do RS/.test(pedidos.slice(-1)[0].pedido) && r.acao === 'rs' && (await conv(c3)).modo === 'humano' && pushes.some(t => /RS/.test(t)), 'lead do RS: a IA é avisada, passa pra equipe e fica quieta (modo humano)', r)
// 5. perdido com motivo
const c4 = await conversa('5500011955554444', 'Ana')
await diz(c4, 'Não tenho interesse, obrigado')
roteiroIA = () => '<msg>Tudo bem, obrigada por ter olhado. Se mudar de ideia, é só me chamar aqui.</msg><acao>perdido</acao><motivo>sem interesse</motivo><resumo>não quis</resumo>'
r = await atendeConversa(c4.id)
const l4 = leads.find(l => l.id === r.lead_id)
confere(l4.qualificacao.maia_etapa === 'perdido' && l4.qualificacao.maia_motivo_perda === 'sem interesse' && andamentos.some(a => /Perdido: sem interesse/.test(a.texto) && a.etapa === 'perda'), 'perdido: etapa e motivo no lead')

// 6. IA falhou: passa pra equipe; chave desligada: volta pra demonstração antiga
console.log('\n=== Falhas e chave')
const c5 = await conversa('5500011933332222', 'Beto')
await diz(c5, 'Oi')
roteiroIA = () => 'sem formato'
r = await atendeConversa(c5.id)
confere(r.erro && (await conv(c5)).modo === 'humano' && pushes.some(t => /falhou/.test(t)), 'a IA respondeu fora do formato: nada sai, passa pra equipe', r)
// 8. a rotina: chamar quem fez o quiz e não chamou (24/11, pedido do Guto) e a retomada 20 h / 3 dias / 6 dias
console.log('\n=== Rotina: quiz sem conversa e retomada')
const R = await jiti.import(path.join(RAIZ, 'lib/maia/vendedora-rotina.ts'))
const T0 = new Date('2026-11-25T13:00:00Z')   // 10h de Brasília, quarta
const hAtras = (h) => new Date(T0.getTime() - h * 3600e3).toISOString()
leads.push({ id: 'QZ1', nome: 'Carlos Lima', whatsapp: '5500011944443333', codigo_turma: 'maiaquiz', criado_em: hAtras(2), qualificacao: { maia_quiz: 'q1', nicho: 'oficina', negocio: 'Auto Lima', cidade: 'Santos', uf: 'SP', principal: 'Cliente novo que chega pelo anúncio', ganho_anuncio_mes: 5000 } })
leads.push({ id: 'QZ2', nome: 'Recente', whatsapp: '5500011944442222', codigo_turma: 'maiaquiz', criado_em: hAtras(0.05), qualificacao: { maia_quiz: 'q2', nicho: 'otica', negocio: 'Ótica Nova', uf: 'SP' } })
leads.push({ id: 'QZ3', nome: 'Gaúcho', whatsapp: '5500051944441111', codigo_turma: 'maiaquiz', criado_em: hAtras(3), qualificacao: { maia_quiz: 'q3', nicho: 'oficina', negocio: 'Oficina Sul', uf: 'RS' } })
leads.push({ id: 'QZ4', nome: 'Já Chamou', whatsapp: '5500011944440000', codigo_turma: 'maiaquiz', criado_em: hAtras(4), qualificacao: { maia_quiz: 'q4', nicho: 'otica', negocio: 'Ótica Ok', uf: 'SP' } })
const cJa = await conversa('5500011944440000', 'Já Chamou'); await diz(cJa, 'Oi, fiz o diagnóstico')
let rc = await R.chamaQuemNaoChamou(T0)
const cvQ = (await db.lista('wa_conversas', {})).find(c => c.telefone.endsWith('44443333'))
const msQ = cvQ ? await db.lista('wa_msgs', { conversa_id: cvQ.id }) : []
const qz1 = leads.find(l => l.id === 'QZ1')
confere(rc.length === 1 && rc[0].lead === 'QZ1' && cvQ && cvQ.fase === 'maia' && cvQ.modo === 'ia' && cvQ.rascunho.maia.lead_id === 'QZ1' && msQ.some(m => /maia_diagnostico/.test(m.texto) && /Auto Lima/.test(m.texto) && /5\.000/.test(m.texto)) && qz1.qualificacao.maia_chamado_em, 'fez o quiz há 2 h e não chamou: a Maia chama com o modelo do diagnóstico (nome, negócio, ganho) e a conversa já aponta pro lead', { rc, msQ })
confere(!leads.find(l => l.id === 'QZ2').qualificacao.maia_chamado_em && !leads.find(l => l.id === 'QZ3').qualificacao.maia_chamado_em && leads.find(l => l.id === 'QZ4').qualificacao.maia_chamado_em === 'já tinha conversa', 'não chama: quem fez há menos de 5 min, quem é do RS, nem quem já escreveu')
// 24/11: quiz às 20h30 ainda chama (janela do quiz até 21h); às 21h30 não chama e avisa o time 1x
leads.push({ id: 'QZ5', nome: 'Noite', whatsapp: '5500011944445555', codigo_turma: 'maiaquiz', criado_em: new Date('2026-11-25T23:20:00Z').toISOString(), qualificacao: { maia_quiz: 'q5', nicho: 'otica', negocio: 'Ótica Noite', uf: 'SP' } })
let rn = await R.chamaQuemNaoChamou(new Date('2026-11-25T23:30:00Z'), { soLead: 'QZ5' })
confere(Array.isArray(rn) && rn.length === 1 && rn[0].lead === 'QZ5' && rn[0].chamado, 'quiz às 20h20: a Maia chama às 20h30 (janela do quiz até 21h)', rn)
leads.push({ id: 'QZ6', nome: 'Tarde da noite', whatsapp: '5500011944446666', codigo_turma: 'maiaquiz', criado_em: new Date('2026-11-26T00:30:00Z').toISOString(), qualificacao: { maia_quiz: 'q6', nicho: 'otica', negocio: 'Ótica Tarde', uf: 'SP' } })
rn = await R.chamaQuemNaoChamou(new Date('2026-11-26T00:35:00Z'), { soLead: 'QZ6' })
const q6 = leads.find(l => l.id === 'QZ6').qualificacao
confere(rn.pulou === 'fora do horário' && !q6.maia_chamado_em && q6.maia_aviso_fora, 'quiz às 21h30: não chama, avisa o time (1x) e fica pra 9h', { rn, q6 })
rc = await R.chamaQuemNaoChamou(T0)
confere(rc.length === 0, 'rodar de novo não chama de novo')
confere((await R.chamaQuemNaoChamou(new Date('2026-11-25T02:00:00Z'))).pulou === 'fora do horário', 'de madrugada não chama (quiz: das 9h às 21h)')
// retomada: Carlos não respondeu a chamada do quiz
const cv1 = () => db.um('wa_conversas', { id: cvQ.id })
let rr = await R.retomaVenda(new Date(T0.getTime() + 24 * 3600e3))
confere(Array.isArray(rr) && !rr.some(x => x.conversa === cvQ.id), '1 dia depois da chamada do quiz: sem a janela de 24 h aberta, não manda texto livre (espera os 3 dias)')
rr = await R.retomaVenda(new Date(T0.getTime() + 3 * 86400e3 + 3600e3))
confere(rr.some(x => x.conversa === cvQ.id && x.qual === '3d') && (await db.lista('wa_msgs', { conversa_id: cvQ.id })).some(m => /maia_venda_retomada/.test(m.texto)), '3 dias: modelo de retomada', rr)
rr = await R.retomaVenda(new Date(T0.getTime() + 3 * 86400e3 + 7200e3))
confere(!rr.some(x => x.conversa === cvQ.id), 'não repete a de 3 dias')
rr = await R.retomaVenda(new Date(T0.getTime() + 6 * 86400e3 + 3600e3))
confere(rr.some(x => x.conversa === cvQ.id && x.qual === '6d') && qz1.qualificacao.maia_etapa === 'perdido' && qz1.qualificacao.maia_motivo_perda === 'não respondeu a retomada' && andamentos.some(a => a.lead_id === 'QZ1' && a.etapa === 'perda'), '6 dias: despedida e o lead vai pra Perda (não respondeu)', rr)
// respondeu depois da chamada: 20 h sem resposta à Maia → texto livre (janela aberta), e as marcas recomeçam
const cR = await conversa('5500011922221111', 'Rita')
await db.atualiza('wa_conversas', { id: cR.id }, { rascunho: { maia: { lead_id: 'Q1', venda: true } } })
await db.insere('wa_msgs', { conversa_id: cR.id, autor: 'cliente', tipo: 'text', texto: 'Quanto custa?', status: 'recebido', criado_em: new Date(T0.getTime() - 21 * 3600e3).toISOString() })
await db.insere('wa_msgs', { conversa_id: cR.id, autor: 'ia', tipo: 'texto', texto: 'O 1º mês é R$ 497...', status: 'enviado', criado_em: new Date(T0.getTime() - 20.5 * 3600e3).toISOString() })
rr = await R.retomaVenda(T0)
confere(rr.some(x => x.conversa === cR.id && x.qual === '20h') && (await db.lista('wa_msgs', { conversa_id: cR.id })).some(m => /Ficou alguma dúvida/.test(m.texto || '')), '20 h sem responder (janela aberta): texto livre da retomada', rr)
const cT = await conversa('5500011922220000', 'Time na conversa')
await db.atualiza('wa_conversas', { id: cT.id }, { rascunho: { maia: { lead_id: 'Q1' } } })
await db.insere('wa_msgs', { conversa_id: cT.id, autor: 'dono', tipo: 'texto', texto: 'Oi, aqui é o Rick', status: 'enviado', criado_em: new Date(T0.getTime() - 4 * 86400e3).toISOString() })
rr = await R.retomaVenda(new Date(T0.getTime() + 3600e3))
confere(!rr.some(x => x.conversa === cT.id), 'o time falou por último: a Maia não retoma por cima')

// 7. número do time (recebe os avisos) não vira lead nem é atendido
process.env.MAIA_AVISO_EQUIPE_WHATS = '5500051999997713'
const c6 = await conversa('5500051999997713', 'Time')
await diz(c6, 'Ver agora')
const nLeads = leads.length, nPed = pedidos.length
r = await atendeConversa(c6.id)
confere(r?.pulou === 'número do time' && leads.length === nLeads && pedidos.length === nPed && (await conv(c6)).fase === 'equipe' && (await conv(c6)).modo === 'humano', 'número do time: não cria lead, não chama a IA, sai da venda (fase equipe)', r)
process.env.MAIA_VENDEDORA_LIGADA = ''
confere(V.vendedoraLigada() === false, 'sem MAIA_VENDEDORA_LIGADA=1 a vendedora fica desligada (segue a demonstração antiga)')

console.log(`\n${ok}/${n} ok`)
process.exit(ok === n ? 0 : 1)
