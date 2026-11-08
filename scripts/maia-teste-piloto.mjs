// Maia: o teste dos ajustes do piloto (07/11). Roda contra o sistema em MODO LOCAL (MAIA_LOCAL=1), sem banco e sem WhatsApp.
// Uso: node scripts/maia-teste-piloto.mjs [url] [senha]     (padrão http://localhost:3195 teste123)
// A pasta do modo local (MAIA_LOCAL_PASTA do servidor) é lida direto pra conferir: PASTA=.teste-maia-piloto (padrão)
// Confere: áudio e foto do cliente (com a transcrição/descrição simulada), comprovante, tom "você", aviso de privacidade só na 1ª,
// retomada fora do horário não sai, maia_resposta fora das 24 h (aprovado e não aprovado), volta automática pra Maia,
// "devolve pra Maia" do dono, lembrete de pergunta sem resposta, contador do mês e apagar dados só do negócio certo.
import fs from 'node:fs'
import path from 'node:path'

const URL_ = process.argv[2] || 'http://localhost:3195'
const SENHA = process.argv[3] || 'teste123'
const PASTA = path.resolve(process.env.PASTA || '.teste-maia-piloto')
const log = (...a) => console.log(...a)
const relatorio = []
const anota = (ok, o) => { relatorio.push({ ok: !!ok, o }); log((ok ? '  ✔ ' : '  ✘ ') + o) }
const tab = (t) => { try { return JSON.parse(fs.readFileSync(path.join(PASTA, t + '.json'), 'utf8')) } catch { return [] } }

async function op(acao, corpo = {}) {
  const r = await fetch(URL_ + '/api/maia/operacao', { method: 'POST', headers: { 'x-senha': SENHA, 'content-type': 'application/json' }, body: JSON.stringify({ acao, por: 'teste', ...corpo }) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(acao + ': ' + (j.erro || r.status))
  return j
}
async function opErro(acao, corpo = {}) { try { await op(acao, corpo); return null } catch (e) { return e.message } }
async function ver(acao, q = {}) {
  const r = await fetch(URL_ + '/api/maia/operacao?' + new URLSearchParams({ acao, ...q }), { headers: { 'x-senha': SENHA } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(acao + ': ' + (j.erro || r.status))
  return j
}
const fala = (r) => (r?.respondeu?.mensagens || []).join(' / ')
const ferr = (r) => (r?.respondeu?.ferramentas || [])
const cliente = (negocio_id, telefone, nome, texto, extra = {}) => op('simular_cliente', { negocio_id, telefone, nome, texto, ...extra })
const b64 = (n = 2048) => Buffer.from(Array.from({ length: n }, (_, i) => (i * 37) % 256)).toString('base64')
const cvDe = async (negocio, tel) => (await ver('conversas', { negocio })).find(c => c.telefone === tel)
const msgsDe = async (cv) => cv ? ver('msgs', { conversa: cv.id }) : []
const hojeAs = (h) => new Date().toISOString().slice(0, 10) + `T${String(h + 3).padStart(2, '0')}:00:00.000Z`   // h em Brasília (UTC-3)
const TU = /\b(tu|teu|tua|teus|tuas|contigo)\b/i

async function main() {
  log('Maia · teste dos ajustes do piloto em ' + URL_ + ' (pasta ' + PASTA + ')')
  const res = await ver('resumo')
  if (res.modo !== 'local') throw new Error('o sistema NÃO está em modo local: teste cancelado pra não mexer no banco')
  if (res.meta_real) throw new Error('Meta real ligada: teste cancelado')
  anota(true, 'modo local, Meta simulada')

  const A = await op('criar_negocio', { nome: 'Bocadinho (teste piloto)', nicho: 'doceria', cidade: 'Estrela', dono_nome: 'Lia', dono_whatsapp: '5500077779001', plano: 'essencial',
    contexto: { produtos: 'Cookies artesanais. Caixa com 6 cookies R$ 45. Caixa com 12 cookies R$ 85. Sabores: chocolate, red velvet, pistache.', pagamento: 'pix ou cartão na retirada', entrega: 'retirada em Estrela; entrega em Estrela por R$ 8', horario: 'encomendas com 1 dia de antecedência' } })
  const B = await op('criar_negocio', { nome: 'Outro Negócio (teste piloto)', nicho: 'estética', cidade: 'Lajeado', dono_nome: 'Bia', dono_whatsapp: '5500077779002', contexto: { servicos: 'limpeza de pele R$ 180' } })
  anota(A.id && B.id, 'dois negócios criados')

  // ---------- 2. tom "você" (padrão) e aviso de privacidade só na 1ª ----------
  log('\n=== tom e aviso de privacidade')
  const T1 = '5500044440001'
  let r = await cliente(A.id, T1, 'Ana', 'Oi! Quanto custa a caixa com 6 cookies?')
  log('    Ana: Oi! Quanto custa a caixa com 6 cookies?\n    maia: ' + fala(r))
  const semAviso1 = (r?.respondeu?.mensagens || []).slice(0, -1).join(' ')
  anota(r?.respondeu?.aviso_privacidade === true && /assistente virtual \(IA\)/.test((r.respondeu.mensagens || []).slice(-1)[0] || ''), '1ª resposta termina com o aviso de privacidade')
  anota(!TU.test(fala(r)), 'tom padrão: trata o cliente por "você" (nenhum "tu/teu/tua/contigo")')
  anota(/45/.test(semAviso1), 'respondeu o preço da base (R$ 45)')
  r = await cliente(A.id, T1, 'Ana', 'E vocês entregam aqui em Estrela?')
  log('    Ana: E vocês entregam aqui em Estrela?\n    maia: ' + fala(r))
  const msgsAna = await msgsDe(await cvDe(A.id, T1))
  anota(r?.respondeu?.aviso_privacidade === false && msgsAna.filter(m => /Um aviso rápido/.test(m.texto || '')).length === 1, 'aviso de privacidade só na 1ª resposta (1 vez na conversa)')
  anota(!TU.test(fala(r)), 'segunda resposta também em "você"')
  // o tom e a privacidade mudam por negócio
  await op('config_atendimento', { negocio_id: B.id, tom: { pessoa: 'tu', gaucho: true, estilo: 'leve' }, privacidade: { ligado: false } })
  const nB = await ver('negocio', { id: B.id })
  anota(nB.meta?.atendimento?.tom?.pessoa === 'tu' && nB.meta?.atendimento?.tom?.gaucho === true && nB.meta?.atendimento?.privacidade?.ligado === false, 'tom "tu" com jeito gaúcho e aviso desligado salvos no negócio B')
  await op('atualizar_negocio', { id: B.id, nicho: 'estética facial', meta: { ad_account_id: '9' } })
  anota((await ver('negocio', { id: B.id })).meta?.atendimento?.tom?.pessoa === 'tu', 'salvar os outros dados não apaga o tom')

  // ---------- 1. áudio e foto do cliente ----------
  log('\n=== áudio e foto do cliente')
  const T2 = '5500044440002'
  r = await cliente(A.id, T2, 'Beto', '', { arquivo_b64: b64(), mime: 'audio/ogg', simulado: { transcricao: 'Oi, vocês têm cookie de pistache pra amanhã?' } })
  log('    Beto (áudio): Oi, vocês têm cookie de pistache pra amanhã?\n    maia: ' + fala(r))
  const cvBeto = await cvDe(A.id, T2)
  const mBeto = (await msgsDe(cvBeto)).find(m => m.autor === 'cliente')
  anota(mBeto?.tipo === 'audio' && /^\(áudio\) Oi, vocês têm cookie de pistache/.test(mBeto.texto), 'áudio do cliente virou texto (transcrição) na conversa')
  anota((r?.respondeu?.mensagens || []).length > 0 && !r.respondeu.midia_falhou, 'a Maia respondeu o áudio')
  anota(fs.existsSync(path.join(PASTA, 'arquivos', A.id, 'clientes', cvBeto.id)) && fs.readdirSync(path.join(PASTA, 'arquivos', A.id, 'clientes', cvBeto.id)).length === 1, 'o áudio ficou guardado na pasta do negócio (clientes/<conversa>)')
  anota(!tab('midias').some(m => m.negocio_id === A.id), 'o arquivo do cliente NÃO entrou na biblioteca de fotos dos anúncios')

  const T3 = '5500044440003'
  r = await cliente(A.id, T3, 'Caio', '', { arquivo_b64: b64(), mime: 'audio/ogg', simulado: { falhar: true } })
  log('    Caio (áudio que não deu pra ouvir)\n    maia: ' + fala(r))
  anota(r?.respondeu?.midia_falhou === true && /Não consegui ouvir esse áudio/.test(fala(r)) && /escrever/.test(fala(r)), 'áudio que não deu pra ouvir: diz com honestidade e pede pra escrever (sem IA)')

  const T4 = '5500044440004'
  r = await cliente(A.id, T4, 'Duda', '', { arquivo_b64: b64(), mime: 'image/jpeg', legenda: 'tem desse?', simulado: { descricao: 'uma caixa de cookies de chocolate com laço verde' } })
  log('    Duda (foto + "tem desse?")\n    maia: ' + fala(r))
  const mDuda = (await msgsDe(await cvDe(A.id, T4))).find(m => m.autor === 'cliente')
  anota(mDuda?.tipo === 'imagem' && /\(mandou uma foto: uma caixa de cookies/.test(mDuda.texto) && /tem desse\?/.test(mDuda.texto), 'foto do cliente virou descrição + legenda')
  anota((r?.respondeu?.mensagens || []).length > 0, 'a Maia respondeu a foto')
  const T4b = '5500044440014'
  r = await cliente(A.id, T4b, 'Edu', '', { arquivo_b64: b64(), mime: 'image/jpeg', simulado: { falhar: true } })
  anota(/Não consegui ver essa foto/.test(fala(r)), 'foto que não deu pra ver: diz com honestidade')

  const T5 = '5500044440005'
  r = await cliente(A.id, T5, 'Fábio', 'Quero uma caixa de 12 cookies pra retirar amanhã. Vou pagar no pix.')
  log('    Fábio: Quero uma caixa de 12 cookies pra retirar amanhã. Vou pagar no pix.\n    maia: ' + fala(r) + '  [' + ferr(r).join(', ') + ']')
  r = await cliente(A.id, T5, 'Fábio', '', { arquivo_b64: b64(), mime: 'image/jpeg', simulado: { descricao: 'comprovante de pix de R$ 85,00 para Bocadinho', comprovante: true } })
  log('    Fábio (comprovante)\n    maia: ' + fala(r) + '  [' + ferr(r).join(', ') + ']')
  const leadF = (await ver('leads', { negocio: A.id })).find(l => l.telefone === T5)
  const donoA = (await ver('conversas', { negocio: A.id })).find(c => c.canal === 'dono')
  const msgsDonoA = await msgsDe(donoA)
  anota(leadF && leadF.etapa !== 'ganho', `comprovante não vira venda sozinho (etapa ${leadF?.etapa})`)
  anota(msgsDonoA.some(m => /mandou um comprovante de pagamento/.test(m.texto || '') && m.texto.includes(T5)), 'o dono foi chamado pra conferir o comprovante')
  anota(!/(pagamento (foi )?confirmado|já caiu|caiu certinho|recebemos o pagamento)/i.test(fala(r)), 'a Maia não confirmou o pagamento pro cliente')

  // ---------- 3. retomada fora do horário não sai ----------
  log('\n=== retomada só de dia')
  await op('teste_vencer_retomadas')
  const antes = { cli: tab('msgs').filter(m => m.autor === 'maia').length, leads: tab('leads').map(l => [l.id, l.followups || 0]) }
  let rot = await op('rodar_rotina', { relogio: hojeAs(2) })
  const depois = tab('msgs').filter(m => m.autor === 'maia').length
  anota((rot.retomadas || []).length > 0 && (rot.retomadas || []).every(x => x.adiada || x.encerrado) && depois === antes.cli, `às 2h da manhã: ${(rot.retomadas || []).length} retomada(s) adiada(s), nenhuma mensagem saiu`)
  anota(tab('leads').every(l => (antes.leads.find(x => x[0] === l.id)?.[1] ?? 0) === (l.followups || 0)), 'a retomada adiada não foi contada como tentativa')
  rot = await op('rodar_rotina', { relogio: '2026-11-08T12:30:00.000Z' })   // domingo 9h30 em Brasília
  anota((rot.retomadas || []).every(x => x.adiada || x.encerrado), 'domingo antes das 10h: não sai')
  rot = await op('rodar_rotina', { relogio: hojeAs(14) })
  anota((rot.retomadas || []).some(x => x.numero), `às 14h: ${(rot.retomadas || []).filter(x => x.numero).length} retomada(s) saíram`)

  // ---------- 5. pergunta pro dono: prazo, lembrete em 1 h e equipe em 3 h ----------
  log('\n=== pergunta pro dono com prazo')
  const T6 = '5500044440006'
  r = await cliente(A.id, T6, 'Gabi', 'Vocês fazem cookie sem glúten? Quanto fica a caixa?')
  log('    Gabi: Vocês fazem cookie sem glúten? Quanto fica a caixa?\n    maia: ' + fala(r) + '  [' + ferr(r).join(', ') + ']')
  anota(ferr(r).some(f => f.startsWith('perguntar_ao_dono')), 'o que não está na base: perguntou pro dono (a IA ou a rede de segurança)')
  anota(/até[^.?!]{0,25}\s(as|às) \d{1,2}h/i.test(fala(r)), 'deu um prazo pro cliente ("até as Xh", "até amanhã às Xh")')
  await op('teste_pergunta_antiga', { negocio_id: A.id, horas: 4 })
  rot = await op('rodar_rotina', { relogio: hojeAs(15) })
  anota((rot.perguntas || []).some(x => x.lembrou === 'dono') && (rot.perguntas || []).some(x => x.lembrou === 'equipe'), 'pergunta sem resposta: lembrete pro dono (1 h) e aviso pra equipe (3 h)')
  rot = await op('rodar_rotina', { relogio: hojeAs(15) })
  anota(!(rot.perguntas || []).length, 'o lembrete não se repete')

  // ---------- 4. maia_resposta fora das 24 h ----------
  log('\n=== maia_resposta depois de 24 h')
  await op('teste_fechar_janela', { conversa_id: (await cvDe(A.id, T6)).id })
  r = await op('simular_dono', { negocio_id: A.id, texto: 'Faço sim, sem glúten a caixa com 6 sai R$ 55.' })
  log('    dono: Faço sim, sem glúten a caixa com 6 sai R$ 55.\n    maia: ' + fala(r) + '  [' + ferr(r).join(', ') + ']')
  let mG = await msgsDe(await cvDe(A.id, T6))
  anota(ferr(r).includes('responder_cliente') && mG.some(m => /^\(modelo maia_resposta\)/.test(m.texto)) && mG.some(m => m.status === 'na_fila'), 'dono respondeu depois de 24 h: saiu o modelo maia_resposta e a resposta ficou na fila')
  r = await cliente(A.id, T6, 'Gabi', 'Pode mandar')
  mG = await msgsDe(await cvDe(A.id, T6))
  anota(!r.respondeu && !mG.some(m => m.status === 'na_fila') && mG.some(m => /55/.test(m.texto) && m.status === 'enviado'), 'o cliente respondeu: a resposta guardada foi entregue (e a Maia não respondeu por cima)')

  await op('teste_modelos_status', { negocio_id: A.id, status: { maia_resposta: 'PENDING' } })
  const cvAna = await cvDe(A.id, T1)
  await op('teste_fechar_janela', { conversa_id: cvAna.id })
  const qtdDono = (await msgsDe(donoA)).length
  const env = await op('mandar_ao_cliente', { negocio_id: A.id, conversa_id: cvAna.id, texto: 'Oi Ana, aqui é a equipe: a entrega em Estrela sai amanhã às 10h.' })
  const donoDepois = await msgsDe(donoA)
  anota(env.na_fila && env.modelo === null && !(await msgsDe(cvAna)).some(m => /^\(modelo maia_resposta\)/.test(m.texto)), 'modelo NÃO aprovado: nada de modelo, a mensagem ficou guardada')
  anota(donoDepois.length > qtdDono && /ficou guardada/.test(donoDepois.slice(-1)[0].texto), 'o dono foi avisado (e a equipe, em aviso_equipe)')
  anota(tab('eventos').some(e => e.tipo === 'aviso_equipe' && e.negocio_id === A.id && /maia_resposta não aprovado/.test(e.detalhe?.titulo || '')), 'a equipe foi avisada do modelo não aprovado')
  const ehOutroNeg = await opErro('mandar_ao_cliente', { negocio_id: B.id, conversa_id: cvAna.id, texto: 'x' })
  anota(!!ehOutroNeg, 'a equipe não manda mensagem numa conversa de outro negócio')
  await op('teste_modelos_status', { negocio_id: A.id, status: { maia_resposta: 'APPROVED' } })

  // ---------- 5. volta pra Maia: 24 h sem ninguém, e "devolve pra Maia" do dono ----------
  log('\n=== conversa volta pra Maia')
  const cvBetoAtual = await cvDe(A.id, T2)
  await op('assumir', { conversa_id: cvBetoAtual.id })
  await op('assumir', { conversa_id: cvAna.id })
  rot = await op('rodar_rotina', { relogio: hojeAs(14) })
  anota((await cvDe(A.id, T2)).modo === 'humano', 'assumida há pouco: continua com a equipe')
  await op('teste_humano_antigo', { conversa_id: cvBetoAtual.id })
  rot = await op('rodar_rotina', { relogio: hojeAs(2) })
  anota((await cvDe(A.id, T2)).modo === 'humano', '24 h sem ninguém, mas de madrugada: espera a janela')
  rot = await op('rodar_rotina', { relogio: hojeAs(14) })
  anota((await cvDe(A.id, T2)).modo === 'ia' && (rot.devolvidas || []).some(x => x.conversa === cvBetoAtual.id), '24 h sem o dono/equipe falar: voltou sozinha pra Maia')
  anota((await cvDe(A.id, T1)).modo === 'humano', 'a outra conversa (assumida há pouco) continua com a equipe')
  r = await op('simular_dono', { negocio_id: A.id, texto: 'Maia, pode devolver a conversa da Ana pra ti.' })
  log('    dono: Maia, pode devolver a conversa da Ana pra ti.\n    maia: ' + fala(r))
  anota((await cvDe(A.id, T1)).modo === 'ia', '"devolve pra Maia" no WhatsApp do dono: a conversa da Ana voltou')

  // ---------- 7. contador do mês ----------
  log('\n=== contador das conversas do mês')
  let uso = await ver('uso_mes', { negocio: A.id })
  const simA = new Set(tab('conversas').filter(c => c.negocio_id === A.id && c.canal === 'cliente').map(c => c.telefone)).size
  anota(uso.conversas === 0 && uso.simuladas === simA && uso.franquia === 500, `simuladas contam à parte: ${uso.simuladas} simulada(s), ${uso.conversas} real(is), franquia ${uso.franquia} (Essencial)`)
  // 08/11: franquia pelo plano: Completa 1.000, Gestora sem franquia
  await op('atualizar_negocio', { id: B.id, plano: 'completa' })
  anota((await ver('uso_mes', { negocio: B.id })).franquia === 1000, 'plano Completa: franquia de 1.000')
  await op('atualizar_negocio', { id: B.id, plano: 'gestao' })
  const usoG = await ver('uso_mes', { negocio: B.id })
  anota(usoG.franquia === null && usoG.pct === null, 'plano Gestora: sem franquia')
  await op('atualizar_negocio', { id: B.id, plano: 'essencial' })
  anota(typeof uso.custo_ia === 'number' && uso.custo_ia > 0, `custo de IA do mês do negócio: R$ ${uso.custo_ia}`)
  // um contato "de verdade" (fora do 55000) no modo local: nada sai, mas conta
  const TR = '5551000000001'
  await cliente(A.id, TR, 'Hugo', 'Oi, vocês abrem sábado?')
  await cliente(A.id, TR, 'Hugo', 'E fazem caixa de presente?')
  uso = await ver('uso_mes', { negocio: A.id })
  anota(uso.conversas === 1, 'o mesmo contato com 2 mensagens no mês conta 1 conversa')
  await op('config_atendimento', { negocio_id: A.id, franquia: 1 })
  rot = await op('rodar_rotina', { relogio: hojeAs(14) })
  anota((rot.franquia || []).some(x => x.negocio === A.id && x.nivel === 100), 'passou da franquia: a equipe foi avisada (100%)')
  rot = await op('rodar_rotina', { relogio: hojeAs(14) })
  anota(!(rot.franquia || []).some(x => x.negocio === A.id), 'o aviso da franquia não se repete no mês')
  r = await cliente(A.id, TR, 'Hugo', 'Obrigado!')
  anota((r?.respondeu?.mensagens || []).length > 0, 'passar da franquia não bloqueia o atendimento')

  // ---------- 8. apagar dados só do negócio certo ----------
  log('\n=== apagar dados do contato (LGPD)')
  r = await cliente(B.id, T4, 'Duda', 'Oi, quanto é a limpeza de pele?')
  log('    Duda no negócio B: ' + fala(r))
  anota(r?.respondeu?.aviso_privacidade === false, 'negócio B com o aviso desligado: sem aviso de privacidade')
  const cvDudaA = await cvDe(A.id, T4), cvDudaB = await cvDe(B.id, T4)
  anota(!!(await opErro('apagar_contato', { negocio_id: B.id, conversa_id: cvDudaA.id, confirmar: true })), 'pedir pra apagar a conversa do negócio A pelo negócio B dá erro')
  anota(!!(await opErro('apagar_contato', { negocio_id: A.id, conversa_id: cvDudaA.id })), 'sem confirmar, não apaga')
  const pastaDuda = path.join(PASTA, 'arquivos', A.id, 'clientes', cvDudaA.id)
  const tinha = fs.existsSync(pastaDuda)
  const ap = await op('apagar_contato', { negocio_id: A.id, conversa_id: cvDudaA.id, confirmar: true })
  anota(tinha && !fs.existsSync(pastaDuda) && ap.midias >= 1, `as mídias da Duda no negócio A foram apagadas (${ap.midias})`)
  anota(!tab('conversas').some(c => c.id === cvDudaA.id) && !tab('msgs').some(m => m.conversa_id === cvDudaA.id) && !tab('leads').some(l => l.negocio_id === A.id && l.telefone === T4), 'conversa, mensagens e contato da Duda no negócio A apagados')
  anota(tab('conversas').some(c => c.id === cvDudaB.id) && tab('msgs').some(m => m.conversa_id === cvDudaB.id) && tab('leads').some(l => l.negocio_id === B.id && l.telefone === T4), 'o mesmo telefone no negócio B ficou intacto')
  const evAp = tab('eventos').filter(e => e.tipo === 'contato_apagado').slice(-1)[0]
  anota(evAp && !JSON.stringify(evAp.detalhe).includes(T4) && !/Duda/.test(JSON.stringify(evAp.detalhe)), 'o registro do apagamento não guarda nome nem telefone')
  // o do comprovante: o telefone dele nos recados pro dono vira [apagado]
  await op('apagar_contato', { negocio_id: A.id, conversa_id: (await cvDe(A.id, T5)).id, confirmar: true })
  anota(!tab('msgs').some(m => String(m.texto || '').includes(T5)), 'o telefone do Fábio sumiu também dos recados pro dono')
  const cvHugo = await cvDe(A.id, TR)
  await op('apagar_contato', { negocio_id: A.id, conversa_id: cvHugo.id, confirmar: true })
  anota((await ver('uso_mes', { negocio: A.id })).conversas === 1, 'contato apagado continua contando nas conversas do mês')

  // ---------- 08/11: prazo de guarda (12 meses sem mensagem) ----------
  log('\n=== prazo de guarda (LGPD)')
  const cvBetoG = await cvDe(A.id, T2), cvAnaG = await cvDe(A.id, T1)
  await op('teste_conversa_antiga', { conversa_id: cvBetoG.id, meses: 13 })
  await op('config_atendimento', { negocio_id: B.id, guarda_meses: 24 })
  await op('teste_conversa_antiga', { conversa_id: cvDudaB.id, meses: 13 })
  const pastaBeto = path.join(PASTA, 'arquivos', A.id, 'clientes', cvBetoG.id)
  rot = await op('rodar_rotina', { relogio: hojeAs(3), forcar_guarda: true })
  anota(!tab('conversas').some(c => c.id === cvBetoG.id) && !tab('msgs').some(m => m.conversa_id === cvBetoG.id) && !tab('leads').some(l => l.negocio_id === A.id && l.telefone === T2) && !fs.existsSync(pastaBeto), 'conversa sem mensagem há 13 meses: mensagens, mídias e contato apagados')
  anota(tab('conversas').some(c => c.id === cvAnaG.id), 'conversa recente ficou')
  anota(tab('conversas').some(c => c.id === cvDudaB.id), 'negócio com prazo de 24 meses: a de 13 meses ficou')
  const evG = tab('eventos').filter(e => e.tipo === 'contato_apagado' && e.detalhe?.motivo === 'prazo')
  anota(evG.length === 1 && !JSON.stringify(evG[0].detalhe).includes(T2) && !/Beto/.test(JSON.stringify(evG[0].detalhe)), 'registro com motivo "prazo", só contagens')
  rot = await op('rodar_rotina', { relogio: hojeAs(4) })
  anota(Array.isArray(rot.guarda) && rot.guarda.length === 0, 'a guarda roda 1x por dia (a 2ª rodada do dia não faz nada)')

  const falhas = relatorio.filter(x => !x.ok)
  log(`\n${relatorio.length - falhas.length} de ${relatorio.length} conferências passaram.`)
  if (falhas.length) log('Falharam:\n' + falhas.map(f => ' - ' + f.o).join('\n'))
}
main().catch(e => { console.error('\nERRO: ' + e.message); process.exit(1) })
