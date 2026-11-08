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
// 08/11: chamada que depende da IA de verdade: se a IA falhar (sem crédito, fora do ar), anota e segue (as conferências que dependem dela falham sozinhas)
const semIA = (p) => p.catch(e => { console.log('    (a IA falhou aqui: ' + String(e.message).slice(0, 90) + ')'); return null })
const b64 = (n = 2048) => Buffer.from(Array.from({ length: n }, (_, i) => (i * 37) % 256)).toString('base64')
const cvDe = async (negocio, tel) => (await ver('conversas', { negocio })).find(c => c.telefone === tel)
const msgsDe = async (cv) => cv ? ver('msgs', { conversa: cv.id }) : []
const hojeAs = (h) => new Date().toISOString().slice(0, 10) + `T${String(h + 3).padStart(2, '0')}:00:00.000Z`   // h em Brasília (UTC-3)
const PEDE_DETALHE = /\b(me (conta|conte|diz|diga|explica|explique|fala|fale|passa|manda|mande)|pode(ria)? (me )?(contar|dizer|explicar|detalhar|adiantar)|o que (aconteceu|houve))\b/i
const TU = /\b(tu|teu|tua|teus|tuas|contigo)\b/i

async function main() {
  log('Maia · teste dos ajustes do piloto em ' + URL_ + ' (pasta ' + PASTA + ')')
  const res = await ver('resumo')
  if (res.modo !== 'local') throw new Error('o sistema NÃO está em modo local: teste cancelado pra não mexer no banco')
  if (res.meta_real) throw new Error('Meta real ligada: teste cancelado')
  anota(true, 'modo local, Meta simulada')
  // SO_PENDENCIAS=1: roda só as conferências das pendências de 08/11 (pra conferir rápido; o teste completo roda tudo)
  if (process.env.SO_PENDENCIAS === '1') { await pendencias0811(); const f = relatorio.filter(x => !x.ok); log(`\n${relatorio.length - f.length} de ${relatorio.length} conferências passaram.`); return }

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
  // 08/11 (regra fixa da casa): primeiro o valor (o que vem na caixa), depois o número
  // a frase com o preço não pode ser a primeira depois da apresentação: antes dela vem o que tem na caixa (sabores)
  const antesDoPreco = semAviso1.slice(0, Math.max(0, semAviso1.indexOf('R$ 45'))).split(/(?<=[.!?])\s+/).slice(0, -1).join(' ')
  anota(/chocolate|red velvet|pistache|sabor/i.test(antesDoPreco), 'valor antes do preço: falou dos sabores numa frase antes da frase com o R$ 45')
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
  anota(fs.existsSync(path.join(PASTA, 'arquivos', A.id, 'clientes', cvBeto.id)) && fs.readdirSync(path.join(PASTA, 'arquivos', A.id, 'clientes', cvBeto.id)).filter(f => !f.startsWith('maia-')).length === 1, 'o áudio ficou guardado na pasta do negócio (clientes/<conversa>; a resposta em áudio da Maia, maia-*.ogg, fica junto)')
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
  anota(ferr(r).includes('responder_cliente') && mG.some(m => /^\(modelo maia_resposta_voce\)/.test(m.texto)) && mG.some(m => m.status === 'na_fila'), 'dono respondeu depois de 24 h: saiu o modelo maia_resposta_voce (negócio em "você") e a resposta ficou na fila')
  r = await cliente(A.id, T6, 'Gabi', 'Pode mandar')
  mG = await msgsDe(await cvDe(A.id, T6))
  anota(!r.respondeu && !mG.some(m => m.status === 'na_fila') && mG.some(m => /55/.test(m.texto) && m.status === 'enviado'), 'o cliente respondeu: a resposta guardada foi entregue (e a Maia não respondeu por cima)')

  await op('teste_modelos_status', { negocio_id: A.id, status: { maia_resposta: 'PENDING', maia_resposta_voce: 'PENDING' } })
  const cvAna = await cvDe(A.id, T1)
  await op('teste_fechar_janela', { conversa_id: cvAna.id })
  const qtdDono = (await msgsDe(donoA)).length
  const env = await op('mandar_ao_cliente', { negocio_id: A.id, conversa_id: cvAna.id, texto: 'Oi Ana, aqui é a equipe: a entrega em Estrela sai amanhã às 10h.' })
  const donoDepois = await msgsDe(donoA)
  anota(env.na_fila && env.modelo === null && !(await msgsDe(cvAna)).some(m => /^\(modelo maia_resposta(_voce)?\)/.test(m.texto)), 'modelo NÃO aprovado: nada de modelo, a mensagem ficou guardada')
  anota(donoDepois.length > qtdDono && /ficou guardada/.test(donoDepois.slice(-1)[0].texto), 'o dono foi avisado (e a equipe, em aviso_equipe)')
  anota(tab('eventos').some(e => e.tipo === 'aviso_equipe' && e.negocio_id === A.id && /maia_resposta não aprovado/.test(e.detalhe?.titulo || '')), 'a equipe foi avisada do modelo não aprovado')
  const ehOutroNeg = await opErro('mandar_ao_cliente', { negocio_id: B.id, conversa_id: cvAna.id, texto: 'x' })
  anota(!!ehOutroNeg, 'a equipe não manda mensagem numa conversa de outro negócio')
  await op('teste_modelos_status', { negocio_id: A.id, status: { maia_resposta: 'APPROVED', maia_resposta_voce: 'APPROVED' } })

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
  anota(uso.conversas === 0 && uso.simuladas === simA && uso.franquia === 1000, `simuladas contam à parte: ${uso.simuladas} simulada(s), ${uso.conversas} real(is), franquia ${uso.franquia} (negócio marcado "essencial" no banco = plano único)`)
  // 08/11 (plano único de R$ 997): 1.000 pra qualquer negócio ('essencial' antigo e 'completa'); Gestora sem franquia; a própria do negócio vale
  await op('atualizar_negocio', { id: B.id, plano: 'completa' })
  anota((await ver('uso_mes', { negocio: B.id })).franquia === 1000, 'plano único (marcado "completa"): franquia de 1.000')
  await op('config_atendimento', { negocio_id: B.id, franquia: 250 })
  anota((await ver('uso_mes', { negocio: B.id })).franquia === 250, 'franquia própria do negócio (meta.atendimento.franquia) continua valendo: 250')
  await op('config_atendimento', { negocio_id: B.id, franquia: null })
  anota((await ver('uso_mes', { negocio: B.id })).franquia === 1000, 'sem franquia própria, volta pra 1.000')
  const Cn = await op('criar_negocio', { nome: 'Negócio novo (teste plano único)', dono_whatsapp: '5500077779099', plano: 'essencial' })
  anota(Cn.plano === 'completa' && (await ver('uso_mes', { negocio: Cn.id })).franquia === 1000, 'negócio novo nasce no plano único ("completa", mesmo pedindo "essencial") com 1.000 conversas')
  // a oferta da demonstração: um plano só, R$ 997, 1º mês R$ 498,50, 1.000 conversas, social media dentro
  const of = await op('teste_funcoes', { texto: 'x' })
  const ot = of.oferta_texto || ''
  anota(of.oferta?.preco === 997 && of.oferta?.conversas === 1000 && ot.includes('R$ 997/mês') && ot.includes('R$ 498,50') && ot.includes('1.000 conversas') && /8 posts e 4 vídeos/.test(ot) && !/697|348|Essencial|Completa|500 conversas/.test(ot),
    'oferta da demonstração: plano único de R$ 997 (1º mês R$ 498,50), 1.000 conversas e social media; sem R$ 697 nem dois planos')
  const site = await (await fetch(URL_ + '/maia/index.html')).text()
  anota(!/697|348,50|Essencial|>Completa</.test(site) && (site.match(/class="plano unico"/g) || []).length === 1 && site.includes('R$ 997') && site.includes('498,50') && site.includes('1.000 conversas por mês'),
    'site /maia: um cartão só (R$ 997, 1º mês R$ 498,50, 1.000 conversas), nenhum R$ 697')
  anota(!site.includes('maia-rosto.webp" alt="Rosto da Maia"') && /Maia · trabalhando agora/.test(site) && /Tudo pelo WhatsApp/.test(site), 'site /maia: sem a foto pequena repetida no "Prazer, Maia" (o selo continua) e com o "Tudo pelo WhatsApp"')
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

  // ---------- 08/11: as correções do TESTE COMPLETO da Maia em produção (testes/maia-08-11) ----------
  await correcoes0811()
  // ---------- 08/11 (tarde): as pendências de código antes da passagem pro Nando ----------
  await pendencias0811()

  const falhas = relatorio.filter(x => !x.ok)
  log(`\n${relatorio.length - falhas.length} de ${relatorio.length} conferências passaram.`)
  if (falhas.length) log('Falharam:\n' + falhas.map(f => ' - ' + f.o).join('\n'))
}
// 08/11: um negócio novo (doceria, "você", terça a sábado) e um caso pra cada correção. As regras sem IA vão por teste_funcoes;
// as conversas usam a IA de verdade (como no teste de produção). FOTOS=<pasta> (opcional) liga o teste das peças com fotos reais.
async function correcoes0811() {
  log('\n=== 08/11: correções do teste completo (sem IA)')
  const fn = (texto, extra = {}) => op('teste_funcoes', { texto, ...extra })
  const V = { tom: { pessoa: 'voce', gaucho: false } }
  anota((await fn('Quero falar com uma pessoa.')).gatilho && (await fn('Comprei ontem e veio errado, que absurdo.')).gatilho && (await fn('Quero meu dinheiro de volta.')).gatilho, '1. pedido de pessoa, reclamação e devolução são reconhecidos na entrada')
  anota(!(await fn('Tu é robô?')).gatilho && !(await fn('Quero um bolo pra uma pessoa')).gatilho && !(await fn('Vocês fazem bolo de aniversário pra 50 pessoas?')).gatilho, '1. "tu é robô?", "bolo pra uma pessoa" e "bolo pra 50 pessoas" NÃO viram passagem')
  anota((await fn('Claro! Vou passar sua conversa para uma pessoa da equipe, que te responde por aqui.')).passou && !(await fn('Vou confirmar com o dono e te respondo hoje até as 14h.')).passou, '1. resposta que diz "vou passar sua conversa" é reconhecida; "vou confirmar com o dono" não')
  anota((await fn('Tá caro, não quero.')).recusou && !(await fn('Vocês fazem bolo de aniversário pra 50 pessoas?')).recusou, '3. "tá caro, não quero" é recusa; perguntar o que não faz não é')
  // 08/11 (noite): a conferência depois da resposta que põe o valor antes do preço (preco.ts), sem IA
  anota((await fn('Oi! Eu sou a assistente virtual do Bocadinho 😊 A caixa com 6 cookies sai R$ 45, e você escolhe entre chocolate, red velvet e pistache.')).preco_antes
    && !(await fn('Oi! Eu sou a assistente virtual do Bocadinho 😊 A caixa vem com 6 cookies artesanais, nos sabores chocolate, red velvet e pistache. Ela sai R$ 45.')).preco_antes
    && (await fn('Quanto custa a caixa de 16?')).pergunta_preco, 'valor antes do preço: a conferência reconhece a frase do R$ antes do valor (e não confunde com a ordem certa)')
  anota((await fn('Ah, tá caro pra mim, vou comprar na internet mesmo. Obrigada, não quero.')).recusa_firme && !(await fn('Não quero glúten no brownie')).recusa_firme, '3. recusa firme vira perdido pelo sistema; "não quero glúten" não')
  const CX = { contexto: { precos: 'caixa 4 cookies R$ 28; caixa 16 cookies R$ 98; brownie R$ 12' } }
  anota((await fn('Queria 1 caixa de 4 cookies.', CX)).quer_comprar && (await fn('Perfeito, quero 1. Já te mando o pix', CX)).quer_comprar && !(await fn('Quero uma informação', CX)).quer_comprar, '3. "queria 1 caixa" e "quero 1." viram proposta; "quero uma informação" não')
  anota((await fn('Aviso: marquei a cliente Marina como PERDIDA por engano. Pode reabrir o card dela no funil?')).interna && !(await fn('Tem cookie de limão?')).interna, '3. "marquei por engano... reabrir o card" é recado interno (não vai pro dono)')
  anota(!(await fn('Não')).motivo_claro && (await fn('Cliente pediu pra falar com uma pessoa')).motivo_claro, '4. motivo "Não" é recusado; motivo claro passa')
  anota((await fn('Sobre parcelar no cartão, eu não tenho essa informação aqui.')).nao_sabe && !(await fn('Não consigo passar contatos de outras pessoas.')).nao_sabe, '6. "não tenho essa informação" é pego pela rede de segurança')
  const tt = await fn('Oi, Helena! Qual tu prefere? Não é seguro pra ti. Posso anotar o teu pedido?', V)
  anota(tt.fora_do_tom.length > 0 && !TU.test(tt.acerta_tom), '2. "tu/pra ti/teu" num negócio "você" é pego e acertado: ' + tt.acerta_tom)
  anota((await fn('Pede o teu orçamento no WhatsApp', V)).cta === 'Peça seu orçamento no WhatsApp' && (await fn('Chama no WhatsApp', V)).cta === 'Chame no WhatsApp', '2. CTA no "você": "Peça seu orçamento", "Chame no WhatsApp"')
  const dd = await fn('terça a sábado, das 10h às 19h', { contexto: { horario: 'terça a sábado, das 10h às 19h' }, agora: '2026-11-08T15:00:00.000Z' })
  anota(JSON.stringify(dd.dias_texto) === '[2,3,4,5,6]' && /HOJE: domingo, 08\/11/.test(dd.dias.texto) && /AMANHÃ: segunda, 09\/11 \(o negócio NÃO abre\)/.test(dd.dias.texto) && /PRÓXIMO DIA QUE ABRE: terça, 10\/11/.test(dd.dias.texto), '5. "terça a sábado" → domingo 08/11: amanhã (segunda) não abre, próximo é terça 10/11')

  log('\n=== 08/11: correções do teste completo (com a IA)')
  const C = await op('criar_negocio', { nome: 'Doceria Teste (correções 08/11)', nicho: 'doceria', cidade: 'Estrela', dono_nome: 'Rê', dono_whatsapp: '5500077779003', plano: 'essencial',
    contexto: { precos: 'caixa 4 cookies R$ 28; caixa 16 cookies R$ 98; brownie R$ 12 a unidade; bolo de pote R$ 15', pagamento: 'pix e cartão', entrega: 'Estrela e Lajeado, taxa de R$ 8', retirada: 'retirada em Estrela', horario: 'terça a sábado, das 10h às 19h', encomenda: '1 dia de antecedência', evitar: 'NÃO faz bolo de aniversário grande; NÃO tem opção sem glúten', desconto: 'só acima de 3 caixas de 16 cookies: 10%' } })
  const donoC = async () => msgsDe((await ver('conversas', { negocio: C.id })).find(c => c.canal === 'dono'))
  const leadDe = async (tel) => (await ver('leads', { negocio: C.id })).find(l => l.telefone === tel)
  const ultMaia = async (tel) => (await msgsDe(await cvDe(C.id, tel))).filter(m => m.autor === 'maia').map(m => m.texto)

  // 1. pessoa e devolução: passa sempre (pela IA ou pelo sistema)
  let r = await cliente(C.id, '5500044440101', 'Olívia', 'Quero falar com uma pessoa.')
  log('    Olívia: Quero falar com uma pessoa.\n    maia: ' + fala(r) + '  [' + ferr(r).join(', ') + ']')
  anota((await cvDe(C.id, '5500044440101')).modo === 'humano' && (await donoC()).some(m => /Olívia/.test(m.texto) && /precisa de ti/.test(m.texto)), '1. "quero falar com uma pessoa": conversa com o dono (modo humano) e o dono avisado')
  anota(!(await leadDe('5500044440101')).proximo_followup_em, '1. conversa com gente não fica com retomada automática marcada')
  r = await cliente(C.id, '5500044440102', 'Rafael', 'Quero meu dinheiro de volta.')
  anota((await cvDe(C.id, '5500044440102')).modo === 'humano', '1. "quero meu dinheiro de volta": passou pro dono')
  log('    Rafael: Quero meu dinheiro de volta.\n    maia: ' + fala(r))
  anota(!PEDE_DETALHE.test(fala(r)), 'P1. na passagem (devolução) a Maia não pede detalhes ao cliente (quem responde é o dono)')

  // 4. áudio normal, respondido certo: NÃO passa pro dono
  r = await cliente(C.id, '5500044440103', 'Tiago', '', { arquivo_b64: b64(), mime: 'audio/ogg', simulado: { transcricao: 'Oi, tudo bem. Eu queria saber se vocês entregam em Lajeado, e quanto fica a entrega. Queria 1 caixa de 4 cookies.' } })
  log('    Tiago (áudio)\n    maia: ' + fala(r) + '  [' + ferr(r).join(', ') + ']')
  anota((await cvDe(C.id, '5500044440103')).modo === 'ia' && !(await donoC()).some(m => /Tiago/.test(m.texto) && /precisa de ti/.test(m.texto)), '4. áudio de conversa normal: a Maia segue atendendo (nada de "precisa de ti" pro dono)')

  // 3. o que o negócio não faz não é perda, e nada de confissão pro dono
  r = await cliente(C.id, '5500044440104', 'Marina', 'Vocês fazem bolo de aniversário pra 50 pessoas?')
  log('    Marina: Vocês fazem bolo de aniversário pra 50 pessoas?\n    maia: ' + fala(r) + '  [' + ferr(r).join(', ') + ']')
  anota((await leadDe('5500044440104')).etapa !== 'perdido', '3. pediu o que o negócio não faz: NÃO virou perdido (etapa ' + (await leadDe('5500044440104')).etapa + ')')
  anota(!(await donoC()).some(m => /engano|reabr|card/i.test(m.texto)), '3. nenhum recado "marquei por engano / reabrir o card" pro dono')

  // 3b. recusou → perdido; reaberto pela equipe → sai dos perdidos
  await cliente(C.id, '5500044440105', 'Kátia', 'Quanto sai a caixa de 16?')
  r = await cliente(C.id, '5500044440105', 'Kátia', 'Tá caro, não quero.')
  const kat = await leadDe('5500044440105')
  anota(kat.etapa === 'perdido' && kat.motivo_perda, '3. "tá caro, não quero": perdido com motivo (' + kat.motivo_perda + ')')
  const perdidosAntes = (await ver('numeros', { negocio: C.id })).perdidos
  await op('lead_etapa', { lead_id: kat.id, etapa: 'conversando' })
  const kat2 = await leadDe('5500044440105'), n2 = await ver('numeros', { negocio: C.id })
  anota(kat2.etapa === 'conversando' && !kat2.perdido_em && !kat2.motivo_perda && n2.perdidos === perdidosAntes - 1, '3. reaberto pela equipe: limpou a perda e o motivo, e saiu dos perdidos (' + perdidosAntes + ' → ' + n2.perdidos + ')')

  // 6. "não tenho essa informação" → pergunta pro dono com prazo
  r = await cliente(C.id, '5500044440106', 'Débora', 'Aceita pix? Dá pra parcelar no cartão?')
  log('    Débora: Aceita pix? Dá pra parcelar no cartão?\n    maia: ' + fala(r) + '  [' + ferr(r).join(', ') + ']')
  anota(ferr(r).some(f => f.startsWith('perguntar_ao_dono')) && /até[^.?!]{0,25}\s(as|às) \d{1,2}h/i.test(fala(r)), '6. parcelamento (não está na base): perguntou pro dono e deu prazo')

  // 2. o repasse da resposta do dono sai no tom do negócio
  r = await cliente(C.id, '5500044440107', 'Helena', 'Quanto custa a caixa com 8 cookies?')
  r = await op('simular_dono', { negocio_id: C.id, texto: 'Pra Helena: caixa de 8 não tenho, só a de 4 e a de 16. Qual tu prefere?' })
  log('    dono: Pra Helena: caixa de 8 não tenho... Qual tu prefere?\n    maia (pro dono): ' + fala(r) + '  [' + ferr(r).join(', ') + ']')
  const hel = (await ultMaia('5500044440107')).slice(-1)[0] || ''
  log('    repasse pra Helena: ' + hel)
  anota(ferr(r).includes('responder_cliente') && /8/.test(hel) && !TU.test(hel), '2. o repasse pra Helena saiu em "você" (sem tu/teu/pra ti)')

  // 5 e 7. dia fechado e comprovante (um aviso só pro dono)
  const amanha = new Date(Date.now() - 3 * 3600e3 + 86400e3).getUTCDay()
  await op('config_atendimento', { negocio_id: C.id, dias: [0, 1, 2, 3, 4, 5, 6].filter(d => d !== amanha) })
  r = await cliente(C.id, '5500044440108', 'Juliana', 'Quero 1 caixa de 16 pra retirar amanhã.')
  log('    Juliana: Quero 1 caixa de 16 pra retirar amanhã. (amanhã o negócio não abre)\n    maia: ' + fala(r))
  anota(/n[aã]o (abr|funcion|atend|trabalh|vamos estar|estamos|estaremos|dá|da pra|conseguimos|consigo|temos (atendimento|expediente))|fechad/i.test(fala(r)), '5. "retirar amanhã" num dia fechado: avisou que não dá e ofereceu outro dia')
  const antesDono = (await donoC()).length
  r = await cliente(C.id, '5500044440108', 'Juliana', '', { arquivo_b64: b64(), mime: 'image/jpeg', legenda: 'Já paguei. Tu é robô?', simulado: { descricao: 'Comprovante de Pix de R$ 98,00 para Doceria Teste', comprovante: true } })
  log('    Juliana (comprovante + "tu é robô?")\n    maia: ' + fala(r) + '  [' + ferr(r).join(', ') + ']')
  const sobreJu = (await donoC()).slice(antesDono).filter(m => /Juliana/.test(m.texto) && /comprovante|pagamento|pix|pagou/i.test(m.texto))
  anota(sobreJu.length === 1, '7. comprovante: o dono recebeu 1 aviso só (' + sobreJu.length + ')')
  anota(/\bIA\b|intelig[eê]ncia artificial|assistente virtual/i.test(fala(r)) && (await leadDe('5500044440108')).etapa !== 'ganho', '7. disse que é IA e não marcou venda sozinha')

  // 10. mensagens picadas com a espera do webhook: uma resposta só
  const t0 = Date.now()
  const pic = await Promise.all(['oi', 'queria uns cookies', 'pra sábado, entrega em Lajeado'].map((texto, i) => new Promise(ok => setTimeout(ok, i * 400)).then(() => cliente(C.id, '5500044440109', 'Lucas', texto, { esperar: true }))))
  const resp = pic.filter(x => x?.respondeu), juntou = pic.filter(x => x?.juntou)
  const avisos = (await msgsDe(await cvDe(C.id, '5500044440109'))).filter(m => /Um aviso rápido/.test(m.texto || '')).length
  log('    Lucas (3 picadas, esperando 12 s): ' + resp.map(fala).join(' | '))
  anota(resp.length === 1 && juntou.length === 2 && avisos === 1, '10. 3 mensagens picadas com a espera do webhook: 1 resposta, 1 aviso de privacidade (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)')

  // 9. painel do dono: a Olívia "contigo"; a Kátia fora das perdas; nenhuma pergunta interna esperando
  const lk = await op('link_painel_dono', { negocio_id: C.id })
  const tk = new URL(lk.link).searchParams.get('t')
  const pd = await (await fetch(URL_ + '/api/maia/painel?acao=tudo', { headers: { cookie: 'maia_dono=' + encodeURIComponent(tk), 'x-real-ip': '10.9.9.' + Math.floor(Math.random() * 200) } })).json()
  const oli = (pd.funil || []).find(l => l.telefone === '5500044440101')
  anota(oli && /^contigo/.test(oli.proxima_acao), '9. painel do dono: a Olívia aparece "' + (oli?.proxima_acao || '?') + '"')
  anota(!(pd.perdas || []).some(l => l.telefone === '5500044440105') && !(pd.esperando || []).some(e => /engano|reabr|card/i.test(e.texto || '')), '9. painel: a Kátia reaberta não conta como perda e nada de recado interno esperando')

  // 8f. vídeo do dono: a oficina tira os quadros (aqui sem quadros) e a descrição fica marcada
  await op('simular_dono', { negocio_id: C.id, arquivo_b64: b64(4096), mime: 'video/mp4', legenda: 'videozinho dos cookies' })
  const vid = tab('midias').find(m => m.negocio_id === C.id && m.tipo === 'video')
  anota(vid && /vídeo/i.test(vid.descricao || ''), '8f. vídeo do dono guardado com descrição inicial: ' + (vid?.descricao || '-'))
  const CH = { 'x-chave': process.env.OFICINA || 'oficina123' }
  const fila = await (await fetch(URL_ + '/api/maia/oficina', { headers: CH })).json()
  anota(fila.descrever?.midia_id === vid?.id && !fila.tarefa, '8f. fila vazia: a oficina recebe o vídeo pra tirar os quadros')
  const d = await (await fetch(URL_ + '/api/maia/oficina', { method: 'POST', headers: { ...CH, 'content-type': 'application/json' }, body: JSON.stringify({ midia_id: vid.id, quadros_b64: [], duracao: 15 }) })).json()
  anota(/Quadros:/.test(tab('midias').find(m => m.id === vid.id)?.descricao || '') && !(await (await fetch(URL_ + '/api/maia/oficina', { headers: CH })).json()).descrever, '8f. depois dos quadros o vídeo fica descrito e não volta pra fila: ' + (d.descricao || '').slice(0, 80))

  // 8b. logo do negócio
  const PNG1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  const lg = await op('subir_logo', { negocio_id: C.id, arquivo_b64: PNG1, mime: 'image/png' })
  anota(/\/marca\/logo-/.test(lg.marca?.logo_path || '') && !!(await opErro('subir_logo', { negocio_id: C.id, arquivo_b64: PNG1, mime: 'application/pdf' })), '8b. logo guardado no negócio (e só imagem)')

  // 2, 5, 8c-e. peças com fotos de verdade (FOTOS=<pasta com .jpg/.png>)
  const pasta = process.env.FOTOS
  if (!pasta || !fs.existsSync(pasta)) { log('    (sem FOTOS=<pasta>: o teste das peças com fotos reais ficou de fora)'); return }
  const fotos = fs.readdirSync(pasta).filter(f => /\.(jpe?g|png)$/i.test(f)).slice(0, 4)
  for (const f of fotos) await op('simular_dono', { negocio_id: C.id, arquivo_b64: fs.readFileSync(path.join(pasta, f)).toString('base64'), mime: /png$/i.test(f) ? 'image/png' : 'image/jpeg', legenda: f.replace(/\.\w+$/, '') })
  const g = await op('gerar_anuncios', { negocio_id: C.id, quantidade: 5, tema: 'um da caixa de 16, um do brownie, um falando do preço da caixa de 4, um pra presente e um de encomenda com 1 dia de antecedência' })
  const ps = tab('pecas').filter(p => g.pecas?.some(x => x.id === p.id))
  const ts = tab('tarefas').filter(t => ps.some(p => p.id === t.peca_id))
  for (const p of ps) log(`    peça: "${p.gancho}" · ${p.texto} · ${p.cta} [${ts.find(t => t.peca_id === p.id)?.dados?.layout || '-'}${ts.find(t => t.peca_id === p.id)?.dados?.preco ? ' · preço ' + ts.find(t => t.peca_id === p.id).dados.preco : ''}]`)
  anota(ps.length >= 3 && ps.every(p => !TU.test(`${p.gancho} ${p.texto} ${p.cta}`) && !/^(Pede|Chama|Agenda)\b/.test(p.cta || '')), '2. as peças saíram em "você" (texto e CTA)')
  anota(ps.every(p => !/\bamanh[ãa]\b|\bhoje\b/i.test(`${p.gancho} ${p.texto}`)), '5. nenhuma peça fala "hoje" ou "amanhã"')
  const pares = ts.filter(t => t.tipo === 'arte').map(t => t.dados?.midia_id + '|' + t.dados?.layout)
  anota(pares.length && new Set(pares).size === pares.length && ts.filter(t => t.tipo === 'arte').every(t => t.dados?.layout), '8e. nenhuma foto repete o layout no lote (' + pares.length + ' artes)')
  const precoP = ps.filter(p => /pre[cç]o/i.test(p.titulo || ''))
  anota(!precoP.length || precoP.every(p => /R\$\s?\d/.test(p.gancho) || ts.find(t => t.peca_id === p.id)?.dados?.preco), '8d. anúncio de preço mostra o preço na arte (gancho ou etiqueta)')
  anota(ps.every(p => !/potinh|pote(s)? de (creme|cobertura)|cobertura/i.test(`${p.gancho} ${p.texto}`)), '8c. nada de "potinhos de creme" (só aparece na foto, não está na base)')
  // nome próprio que só aparece na descrição das fotos (a marca na embalagem) não entra no anúncio
  const base = (C.nome + JSON.stringify(C.contexto)).toLowerCase()
  const daFoto = [...new Set(tab('midias').filter(m => m.negocio_id === C.id).flatMap(m => [...String(m.descricao || '').matchAll(/(?<=[\p{L},;]\s)(\p{Lu}\p{Ll}{3,})/gu)].map(x => x[1])).filter(w => !base.includes(w.toLowerCase())))]
  anota(ps.every(p => !daFoto.some(n => new RegExp(n, 'i').test(`${p.gancho} ${p.texto} ${p.cta}`))), '8c. nenhum nome que só aparece na foto entrou no anúncio (' + (daFoto.join(', ') || 'nenhum na foto') + ')')
}
// 08/11 (tarde): uma conferência pra cada pendência de código (PASSAGEM-NANDO, seção 5)
async function pendencias0811() {
  log('\n=== 08/11 (tarde): pendências de código')
  const fn = (texto, extra = {}) => op('teste_funcoes', { texto, ...extra })
  const sd = await fn('Entendo, sinto muito! Vou passar sua conversa pra uma pessoa da equipe. Enquanto isso, pode me contar o que aconteceu com o pedido?')
  anota(/passar sua conversa/.test(sd.sem_detalhe) && !/aconteceu/.test(sd.sem_detalhe), 'P1. na passagem, a frase que pede detalhe sai: "' + sd.sem_detalhe + '"')
  // P2. legenda de post (social) no tom do negócio ("você")
  const S = await op('criar_negocio', { nome: 'Doceria Social (teste pendências)', nicho: 'doceria', cidade: 'Estrela', dono_nome: 'Sol', dono_whatsapp: '5500077779011', plano: 'completa', contexto: { produtos: 'cookies artesanais; caixa com 6 R$ 45' } })
  const soc = async (acao, corpo) => { const x = await fetch(URL_ + '/api/maia/social', { method: 'POST', headers: { 'x-senha': SENHA, 'content-type': 'application/json' }, body: JSON.stringify({ acao, ...corpo }) }); return x.json() }
  const quandoPost = new Date(Date.now() + 3 * 86400e3).toISOString().slice(0, 16)
  await soc('criar_post', { negocio_id: S.id, quando: quandoPost, tipo: 'foto', midias: [{ url: 'https://exemplo.com/cookie.jpg', tipo: 'foto' }], legenda: 'Ó, tu já provou o nosso cookie de pistache? Pede o teu pelo WhatsApp!', tema: 'pistache' })
  const postS = tab('pecas').find(p => p.negocio_id === S.id)
  anota(postS && !TU.test(postS.texto) && /Peça seu/.test(postS.texto), 'P2. legenda escrita em "tu" num negócio "você" foi acertada: "' + (postS?.texto || '-') + '"')
  if (postS) {
    await semIA(op('ajustar_peca', { peca_id: postS.id, nota: 'deixa mais curta e convida pra encomendar a caixa com 6' }))
    const p2 = tab('pecas').find(p => p.id === postS.id)
    log('    legenda refeita pela IA: ' + (p2?.texto || '-').replace(/\n+/g, ' / '))
    anota(p2 && p2.versao > 1 && !TU.test(p2.texto), 'P2. a legenda refeita pela IA saiu em "você"')
  }
  // P3 (T2). modelos "você": pedidos na conexão (e pelo painel) e escolhidos pelo tom no envio
  const pm = await op('pedir_modelos_negocio', { negocio_id: S.id })
  const nomes = (pm.modelos || []).map(m => m.nome)
  anota(['maia_retomada', 'maia_resposta', 'maia_retomada_voce', 'maia_resposta_voce'].every(x => nomes.includes(x)) && pm.modelos.every(m => m.status === 'simulado'), 'P3. pedir_modelos_negocio pede as 4 versões (tu e você), simulado no modo local: ' + nomes.join(', '))
  const mv = (pm.modelos || []).filter(m => /_voce$/.test(m.nome))
  anota(mv.length === 2 && mv.every(m => !TU.test(m.texto) && /Você|sua/.test(m.texto)), 'P3. as versões _voce falam "você" ("Você tinha falado...", "da sua pergunta")')
  anota(tab('eventos').some(e => e.tipo === 'modelos_pedidos' && e.negocio_id === S.id && e.detalhe?.simulado), 'P3. o pedido ficou anotado (modelos_pedidos), sem ir pra Meta')
  anota((await fn('x', { tom: { pessoa: 'voce' } })).modelo_retomada === 'maia_retomada_voce' && (await fn('x', { tom: { pessoa: 'tu' } })).modelo_retomada === 'maia_retomada', 'P3. retomada fora das 24 h: "você" → maia_retomada_voce; "tu" → maia_retomada')
  const Tn = await op('criar_negocio', { nome: 'Barbearia Tu (teste pendências)', nicho: 'barbearia', cidade: 'Lajeado', dono_nome: 'Leo', dono_whatsapp: '5500077779012', contexto: { servicos: 'corte R$ 40' } })
  await op('config_atendimento', { negocio_id: Tn.id, tom: { pessoa: 'tu', gaucho: true } })
  await semIA(cliente(Tn.id, '5500044440301', 'Caio', 'Oi, quanto é o corte?'))
  const cvCaio = await cvDe(Tn.id, '5500044440301')
  await op('teste_fechar_janela', { conversa_id: cvCaio.id })
  const envTu = await op('mandar_ao_cliente', { negocio_id: Tn.id, conversa_id: cvCaio.id, texto: 'Oi Caio, aqui é a equipe: amanhã tem horário às 10h.' })
  anota(envTu.modelo === 'maia_resposta' && (await msgsDe(cvCaio)).some(m => /^\(modelo maia_resposta\)/.test(m.texto)), 'P3. negócio em "tu": a resposta depois de 24 h vai pelo maia_resposta')
  await semIA(cliente(S.id, '5500044440302', 'Duda', 'Oi, a caixa com 6 é quanto?'))
  const cvDuda = await cvDe(S.id, '5500044440302')
  await op('teste_fechar_janela', { conversa_id: cvDuda.id })
  await op('teste_modelos_status', { negocio_id: S.id, status: { maia_resposta_voce: 'PENDING', maia_resposta: 'APPROVED' } })
  const envV = await op('mandar_ao_cliente', { negocio_id: S.id, conversa_id: cvDuda.id, texto: 'Oi Duda, aqui é a equipe: a caixa com 6 sai R$ 45.' })
  anota(envV.modelo === 'maia_resposta', 'P3. negócio em "você" com o _voce ainda não aprovado: usa o outro aprovado (a resposta não fica presa)')
  // P4 (T11). modelo misto: resposta comum no barato; decisão de venda/passagem refeita no forte; as duas chamadas no custo
  const usoCli = tab('eventos').filter(e => e.tipo === 'uso_ia' && e.detalhe?.tipo === 'cliente')
  const fases = (f, m) => usoCli.filter(e => e.detalhe?.fase === f && (!m || String(e.detalhe?.modelo).includes(m))).length
  anota(fases('barato', 'haiku') > 0 && fases('direto', 'sonnet') > 0, `P4. resposta comum no haiku (${fases('barato', 'haiku')} chamadas) e pedido de pessoa/devolução direto no sonnet (${fases('direto', 'sonnet')})`)
  anota(fases('refeito', 'sonnet') > 0, `P4. decisão de venda (proposta/ganho/perdido) refeita no sonnet: ${fases('refeito', 'sonnet')} chamadas anotadas`)
  const ci = await ver('custo_ia', { dias: 1 })
  log('    custo do cliente por modelo: ' + JSON.stringify(ci.cliente_por_modelo) + ' · por conversa: R$ ' + ci.cliente_reais_por_conversa)
  anota(Object.keys(ci.cliente_por_modelo || {}).some(k => /haiku.*barato/.test(k)) && Object.keys(ci.cliente_por_modelo || {}).some(k => /sonnet/.test(k)), 'P4. custo_ia separa o custo do cliente por modelo e fase')
  // P5 (T12). a tabela de itens que ficaram de fora
  log('\n=== T12')
  // tom nos anúncios: já conferido acima ("2. as peças saíram em você", com FOTOS=) e no CTA sem IA
  anota((await fn('Pede o teu orçamento no WhatsApp', { tom: { pessoa: 'voce' } })).cta === 'Peça seu orçamento no WhatsApp', 'P5. tom nos anúncios: CTA no "você" (o texto das peças usa tomDoNegocio desde 08/11)')
  // limite de 40 respostas por conversa por dia + nome [apagado] nos recados e avisos
  await semIA(cliente(S.id, '5500044440303', 'Zuleica Prado', 'Oi, vocês fazem caixa de presente?'))
  const cvZu =await cvDe(S.id, '5500044440303')
  await op('teste_respostas_hoje', { conversa_id: cvZu.id, n: 40 })
  const rz = await cliente(S.id, '5500044440303', 'Zuleica Prado', 'E mais uma pergunta...')
  const cvZu2 = await cvDe(S.id, '5500044440303')
  anota(rz?.respondeu?.limite && cvZu2.modo === 'humano', 'P5. passou de 40 respostas hoje: a conversa foi pro dono (modo humano), sem chamar a IA')
  anota(tab('eventos').some(e => e.tipo === 'aviso_equipe' && e.negocio_id === S.id && /passou do limite/.test(e.detalhe?.titulo || '') && /Zuleica/.test(e.detalhe?.texto || '')), 'P5. a equipe foi avisada da conversa longa')
  const donoS = async () => msgsDe((await ver('conversas', { negocio: S.id })).find(c => c.canal === 'dono'))
  anota((await donoS()).some(m => /Zuleica Prado/.test(m.texto)), 'P5. (antes de apagar) o recado pro dono tem o nome dela')
  await op('apagar_contato', { negocio_id: S.id, conversa_id: cvZu2.id, confirmar: true })
  anota(!(await donoS()).some(m => /Zuleica|5500044440303/.test(m.texto)) && (await donoS()).some(m => /\[apagado\]/.test(m.texto)), 'P5. apagar contato: nome e telefone viraram [apagado] nos recados pro dono')
  anota(!tab('eventos').some(e => e.tipo === 'aviso_equipe' && /Zuleica/.test(JSON.stringify(e.detalhe || {}))), 'P5. apagar contato: o nome sumiu também dos avisos da equipe (aviso_equipe)')
  anota((await fn('Pra Helena: caixa de 8 não tenho. A Helenita quer 2.', { nome: 'Helena Souza', outros: ['Ana Lima'] })).tira_nome === 'Pra [apagado]: caixa de 8 não tenho. A Helenita quer 2.' && (await fn('Pra Ana: oi', { nome: 'Ana Souza', outros: ['Ana Lima'] })).tira_nome === 'Pra Ana: oi', 'P5. o primeiro nome sozinho só sai se nenhum outro contato do negócio tem o mesmo nome')
  // botões "Fechou" / "Não fechou" na pergunta das 18h + resumo do negócio em piloto (implantação)
  const Pv0 = await op('criar_negocio', { nome: 'Negócio Vazio (teste pendências)', nicho: 'loja', cidade: 'Estrela', dono_nome: 'Zé', dono_whatsapp: '5500077779014' })
  const lp = await op('lead_novo', { negocio_id: S.id, nome: 'Vera', telefone: '5500044440304', produto: 'caixa com 6' })
  await op('lead_etapa', { lead_id: lp.id, etapa: 'proposta', valor: 45, produto: 'caixa com 6' })
  const rotS = await op('rodar_rotina', { forcar_relatorio: true, relogio: hojeAs(18) })
  const btn = (await donoS()).filter(m => m.tipo === 'botoes' && /Vera/.test(m.texto))
  anota(btn.length === 1 && /\[Fechou\] \[Não fechou\]/.test(btn[0].texto), 'P5. a pergunta das 18h foi com os botões: ' + (btn[0]?.texto || '-'))
  const clique = await op('simular_dono', { negocio_id: S.id, botao: { id: `venda:${lp.id}:sim`, titulo: 'Fechou' } })
  const vera = (await ver('leads', { negocio: S.id })).find(l => l.id === lp.id)
  anota(clique.venda?.etapa === 'ganho' && vera.etapa === 'ganho' && Number(vera.valor) === 45 && !clique.respondeu, 'P5. o clique em "Fechou" virou venda de R$ 45 na hora (sem IA)')
  const leadTn = await op('lead_novo', { negocio_id: Tn.id, nome: 'Outro', telefone: '5500044440305' })
  await op('lead_etapa', { lead_id: leadTn.id, etapa: 'proposta' })
  const intruso = await semIA(op('simular_dono', { negocio_id: S.id, botao: { id: `venda:${leadTn.id}:nao`, titulo: 'Não fechou' } }))
  anota(!intruso?.venda && (await ver('leads', { negocio: Tn.id })).find(l => l.id === leadTn.id).etapa === 'proposta', 'P5. botão com contato de OUTRO negócio não mexe em nada')
  const negS = await ver('negocio', { id: S.id })
  const resumoP = await op('teste_resumo_negocios')
  anota(negS.status === 'implantacao' && resumoP.some(x => x.id === S.id) && !resumoP.some(x => x.id === Pv0.id), 'P5. o resumo da semana inclui o negócio em piloto (implantação, com contatos na semana); o recém-criado sem nada fica de fora')
  log('    resumos gerados nessa rotina: ' + (rotS.relatorios || []).length + (rotS.relatorios_erro ? ' (erro: ' + rotS.relatorios_erro.slice(0, 80) + ')' : ''))
  // aviso de privacidade: o do próprio negócio, sem repetir
  const avB = await fn('x', { contexto: { privacidade: 'Seus dados são usados só pra este atendimento, conforme a LGPD. Peça pra apagar quando quiser.' } })
  anota(/conforme a LGPD/.test(avB.aviso || '') && !/Um aviso rápido/.test(avB.aviso || ''), 'P5. a base tem aviso próprio: a Maia usa esse (e não o padrão por cima)')
  anota((await fn('Oi! Seus dados ficam guardados conforme a LGPD.')).ja_avisa && !(await fn('Oi! A caixa com 6 sai R$ 45.')).ja_avisa, 'P5. se a resposta da IA já avisou da privacidade, o aviso do sistema não vai junto')
  const Pv = await op('criar_negocio', { nome: 'Ótica Própria (teste pendências)', nicho: 'ótica', cidade: 'Lajeado', dono_nome: 'Ivo', dono_whatsapp: '5500077779013', contexto: { servicos: 'exame de vista R$ 80', privacidade: 'Aviso da Ótica Própria: seus dados são usados só pra este atendimento, conforme a LGPD. Peça pra apagar quando quiser.' } })
  const rpv = await semIA(cliente(Pv.id, '5500044440306', 'Nina', 'Quanto é o exame de vista?'))
  const mpv = await msgsDe(await cvDe(Pv.id, '5500044440306'))
  log('    Nina: Quanto é o exame de vista?\n    maia: ' + fala(rpv))
  anota(mpv.filter(m => m.autor === 'maia' && /LGPD|privacidade/i.test(m.texto)).length === 1 && !mpv.some(m => /Um aviso rápido/.test(m.texto)), 'P5. na conversa, o aviso de privacidade saiu 1 vez (o próprio do negócio) e o padrão não')
  // resposta em áudio (ElevenLabs): desde 08/11 LIGADA por padrão quando há ELEVENLABS_API_KEY (MAIA_VOZ_RESPOSTA=0 desliga)
  const tv = await op('teste_voz', { negocio_id: S.id, texto: 'Oi! A caixa com 6 cookies sai R$ 45. Quer que eu anote o seu pedido?' }).catch(e => ({ erro: e.message }))
  const arqV = tv.caminho ? path.join(PASTA, 'arquivos', tv.caminho) : ''
  anota(arqV && fs.existsSync(arqV) && fs.statSync(arqV).size > 1000 && /\.ogg$/.test(arqV), 'P5. ElevenLabs: o áudio da resposta foi gerado e guardado (' + (arqV ? path.basename(arqV) + ', ' + fs.statSync(arqV).size + ' bytes' : tv.erro || 'sem arquivo: falta ELEVENLABS_API_KEY?') + ')')
  const voz = (await fn('x')).voz_ligada
  if (process.env.ELEVENLABS_API_KEY && process.env.MAIA_VOZ_RESPOSTA !== '0') anota(voz === true, 'P5. voz ligada por padrão: com a chave da ElevenLabs e sem MAIA_VOZ_RESPOSTA, a voz está ligada')
  const ra = await semIA(cliente(S.id, '5500044440307', 'Otto', '', { arquivo_b64: b64(), mime: 'audio/ogg', simulado: { transcricao: 'Oi, quanto é a caixa com 6 cookies?' } }))
  const mOt =await msgsDe(await cvDe(S.id, '5500044440307'))
  if (!voz) anota(!ra?.respondeu?.audio && mOt.some(m => m.autor === 'maia' && m.tipo === 'texto' && /45/.test(m.texto)) && !mOt.some(m => m.autor === 'maia' && m.tipo === 'audio'), 'P5. voz desligada (padrão): o cliente mandou áudio e a resposta foi em texto')
  else {
    const arq = ra?.respondeu?.audio ? path.join(PASTA, 'arquivos', ra.respondeu.audio) : ''
    anota(arq && fs.existsSync(arq) && fs.statSync(arq).size > 1000 && mOt.some(m => m.autor === 'maia' && m.tipo === 'audio' && /45/.test(m.texto)), 'P5. voz ligada: a resposta virou áudio (ElevenLabs) e o arquivo foi gerado: ' + (arq ? path.basename(arq) + ' ' + (fs.existsSync(arq) ? fs.statSync(arq).size : 0) + ' bytes' : '-'))
    const mAud = mOt.find(m => m.autor === 'maia' && m.tipo === 'audio')
    anota(mAud && mAud.texto.startsWith('(áudio) ') && mAud.texto.length > 12 && !mOt.some(m => m.autor === 'maia' && m.tipo === 'texto' && m.texto === mAud.texto.slice(8)), 'P5. o texto do áudio ficou salvo na conversa ("' + (mAud?.texto || '').slice(0, 60) + '...") e não foi repetido por escrito')
    // o cliente que ESCREVEU recebe texto, mesmo com a voz ligada
    await semIA(cliente(S.id, '5500044440308', 'Téo', 'Oi, quanto é a caixa com 6 cookies?'))
    const mTe = await msgsDe(await cvDe(S.id, '5500044440308'))
    anota(mTe.some(m => m.autor === 'maia' && m.tipo === 'texto' && /45/.test(m.texto)) && !mTe.some(m => m.autor === 'maia' && m.tipo === 'audio'), 'P5. voz ligada, mas o cliente escreveu: a resposta foi em texto')
    // o dono vê o que foi dito no painel dele (a conversa mostra o texto do áudio)
    const lS = await op('link_painel_dono', { negocio_id: S.id })
    const tS = new URL(lS.link).searchParams.get('t'), ipS = { 'x-real-ip': '10.2.2.' + Math.floor(Math.random() * 200) }
    await fetch(URL_ + '/api/maia/painel', { method: 'POST', headers: { 'content-type': 'application/json', ...ipS }, body: JSON.stringify({ acao: 'entrar', t: tS }) })
    const cvO = await cvDe(S.id, '5500044440307')
    const pc = await (await fetch(URL_ + '/api/maia/painel?acao=conversa&id=' + cvO.id, { headers: { cookie: 'maia_dono=' + encodeURIComponent(tS), ...ipS } })).json().catch(() => ({}))
    anota((pc.msgs || []).some(m => m.autor === 'maia' && m.tipo === 'audio' && /45/.test(m.texto || '')), 'P5. no painel do dono, a resposta em áudio aparece com o que foi dito')
  }
  // P6. o campo dos dias que o negócio abre tem tela no painel da equipe (o clique de verdade: scripts/maia-teste-tela-equipe.mjs)
  const htmlOp = await (await fetch(URL_ + '/maia/operacao/')).text()
  anota(/name="dias"/.test(htmlOp) && /Dias que o negócio abre/.test(htmlOp) && /c\.dias=new FormData\(f\)\.getAll\('dias'\)/.test(htmlOp), 'P6. painel da equipe: o campo "dias que o negócio abre" está na tela e vai no config_atendimento')
  // P7 (T4, passo 5). a oficina entrega por link de envio direto ({tarefa_id, caminho}); o modo antigo (base64) continua valendo
  const CHO = { 'x-chave': process.env.OFICINA || 'oficina123' }
  const JPG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64')
  const pegaMinha = async (tid) => { for (let i = 0; i < 40; i++) { const j = await (await fetch(URL_ + '/api/maia/oficina', { headers: CHO })).json(); if (!j.tarefa) return null; if (j.tarefa.id === tid) return j } return null }
  const tk1 = await op('teste_tarefa_oficina', { negocio_id: S.id, arquivo_b64: JPG.toString('base64'), mime: 'image/jpeg' })
  const job = await pegaMinha(tk1.tarefa_id)
  const up = job?.upload?.arte
  anota(up?.url && /^http/.test(up.url) && /envio=/.test(up.url) && up.caminho.startsWith(S.id + '/pecas/'), 'P7. a fila dá o link de envio direto na pasta do negócio: ' + (up?.caminho || '-'))
  const ruim = await fetch(up.url.replace(/envio=\w+/, 'envio=errada'), { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: JPG })
  const naoChegou = await fetch(URL_ + '/api/maia/oficina', { method: 'POST', headers: { ...CHO, 'content-type': 'application/json' }, body: JSON.stringify({ tarefa_id: tk1.tarefa_id, caminho: up.caminho }) })
  anota(ruim.status === 403 && naoChegou.status === 400, 'P7. link com assinatura errada é recusado, e avisar sem o arquivo ter chegado também')
  const put = await fetch(up.url, { method: 'PUT', headers: { 'content-type': 'image/jpeg', 'x-upsert': 'true' }, body: JPG })
  const entrega = await fetch(URL_ + '/api/maia/oficina', { method: 'POST', headers: { ...CHO, 'content-type': 'application/json' }, body: JSON.stringify({ tarefa_id: tk1.tarefa_id, caminho: up.caminho }) })
  const pc1 = tab('pecas').find(p => p.id === tk1.peca_id)
  anota(put.ok && entrega.ok && pc1?.status === 'revisao_equipe' && pc1.arquivo_path === up.caminho && fs.existsSync(path.join(PASTA, 'arquivos', up.caminho)), 'P7. PUT do arquivo + POST só com {tarefa_id, caminho}: a peça foi pra revisão da equipe com o arquivo')
  const tk2 = await op('teste_tarefa_oficina', { negocio_id: S.id, arquivo_b64: JPG.toString('base64'), mime: 'image/jpeg' })
  await pegaMinha(tk2.tarefa_id)
  const antigo = await fetch(URL_ + '/api/maia/oficina', { method: 'POST', headers: { ...CHO, 'content-type': 'application/json' }, body: JSON.stringify({ tarefa_id: tk2.tarefa_id, arquivo_b64: JPG.toString('base64'), mime: 'image/jpeg' }) })
  const pc2 = tab('pecas').find(p => p.id === tk2.peca_id)
  anota(antigo.ok && pc2?.status === 'revisao_equipe' && pc2.arquivo_path, 'P7. a oficina antiga (arquivo em base64) continua sendo aceita')
  const outro = await fetch(URL_ + '/api/maia/oficina', { method: 'POST', headers: { ...CHO, 'content-type': 'application/json' }, body: JSON.stringify({ tarefa_id: tk2.tarefa_id, caminho: Tn.id + '/pecas/x.jpg' }) })
  anota(outro.status === 400, 'P7. caminho de outro negócio é recusado')
  // P8 (T16). o painel mostra qual banco a Maia usa (local aqui; "proprio" com MAIA_SUPABASE_URL/_SERVICE_KEY; senão "escola")
  anota((await ver('resumo')).banco === 'local', 'P8. o resumo diz qual banco a Maia está usando (aqui: local)')
}
main().catch(e => { console.error('\nERRO: ' + e.message); process.exit(1) })
