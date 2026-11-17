// Maia: teste do LANÇAMENTO pra base (15/11/2026). Modo local: nada sai pra Meta nem pra WhatsApp (telefones 55000...),
// sem IA (as regras simples de lancamento/interpreta.ts e teste.ts), banco em arquivos JSON.
//
// Servidor (pasta limpa):
//   rm -rf .teste-lancamento .next-teste-lanc
//   MAIA_LOCAL=1 MAIA_LOCAL_PASTA=.teste-lancamento MAIA_PAINEL_SENHA=teste123 MAIA_SEM_AVISO=1 NEXT_DIST_DIR=.next-teste-lanc npx next dev --webpack -p 3231
// Teste:
//   node scripts/maia-teste-lancamento.mjs http://localhost:3231 teste123 .teste-lancamento
import fs from 'node:fs'
import path from 'node:path'

const [URL = 'http://localhost:3231', SENHA = 'teste123', PASTA = '.teste-lancamento'] = process.argv.slice(2)
let ok = 0, falha = 0
const confere = (nome, cond, extra = '') => { if (cond) { ok++; console.log('  ✔', nome) } else { falha++; console.log('  ✘', nome, typeof extra === 'string' ? extra : JSON.stringify(extra).slice(0, 400)) } }
async function post(corpo, senha = SENHA) {
  const r = await fetch(`${URL}/api/maia/lancamento`, { method: 'POST', headers: { 'x-senha': senha, 'content-type': 'application/json' }, body: JSON.stringify({ por: 'teste', ...corpo }) })
  return { ...(await r.json().catch(() => ({}))), http: r.status }
}
async function get(q, senha = SENHA) { const r = await fetch(`${URL}/api/maia/lancamento?${q}`, { headers: { 'x-senha': senha } }); return { ...(await r.json().catch(() => ({}))), http: r.status } }
const arq = tab => path.join(PASTA, 'maia_' + tab + '.json')
const arqL = tab => path.join(PASTA, tab + '.json')
const le = tab => { for (const f of [arqL(tab), arq(tab)]) { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { } } return [] }
const grava = (tab, l) => fs.writeFileSync(arqL(tab), JSON.stringify(l, null, 1))
const contato = tel => le('lanc_contatos').find(c => c.telefone === tel)
const ultimas = (tel, n = 1) => { const c = contato(tel); return le('lanc_msgs').filter(m => m.contato_id === c.id && m.direcao === 'saida').slice(-n).map(m => m.texto || '') }
const diz = (telefone, texto, tipo = 'texto') => post({ acao: 'simular_entrada', telefone, texto, tipo })
const foto = (telefone, n = 1) => post({ acao: 'simular_entrada', telefone, tipo: 'imagem', mime: 'image/jpeg', b64: Buffer.from('foto-teste-' + n).toString('base64') })
const video = telefone => post({ acao: 'simular_entrada', telefone, tipo: 'video', mime: 'video/mp4', b64: Buffer.from('video-teste').toString('base64') })
const R = String(Date.now()).slice(-6)
const INICIO = Date.now() - 1000   // os avisos contam só desta rodada (a pasta de teste guarda as anteriores)
const T = { ana: '55000' + R + '01', beto: '55000' + R + '02', caio: '55000' + R + '03', duda: '55000' + R + '04', time: '55000' + R + '05' }

console.log('0) Senha e lista')
confere('sem senha: 401', (await get('acao=lista', 'errada')).http === 401)
let r = await post({ acao: 'adicionar', telefone: T.ana, nome: 'Ana', versao: 'aluno', remessa: 1 })
if (r.http !== 200) { console.log('o servidor não está no modo local:', r); process.exit(1) }
for (const [k, v] of Object.entries({ beto: 'Beto', caio: 'Caio', duda: 'Duda' })) await post({ acao: 'adicionar', telefone: T[k], nome: v, remessa: 1 })
await post({ acao: 'adicionar', telefone: T.time, nome: 'Guto', remessa: 0, versao: 'aluno' })
confere('telefone repetido não entra 2 vezes', (await post({ acao: 'adicionar', telefone: T.ana, nome: 'Ana' })).http === 400)
let l = await get('acao=lista')
confere('a lista tem os 5, todos "Na lista"', l.lista.filter(c => String(c.telefone).includes(R)).every(c => c.etapa === 'na_lista') && l.lista.filter(c => String(c.telefone).includes(R)).length === 5)
confere('quem não está na lista não é da Maia (a IA do CRM segue)', (await diz('55000' + R + '99', 'Quero ver')).tratado === false)

console.log('1) "Quero ver" e a coleta, uma pergunta por vez')
r = await diz(T.ana, 'Quero ver', 'botao')
confere('o botão "Quero ver" é da Maia', r.tratado === true)
let m = ultimas(T.ana)[0]
confere('a Maia não se apresenta de novo e faz a 1ª pergunta', !/Aqui é a Maia/.test(m) && /perguntas rápidas/.test(m) && /o que tu vende, e pra quem/i.test(m), m)
confere('sem emoji', !/\p{Extended_Pictographic}/u.test(m))
confere('etapa Quero ver', contato(T.ana).etapa === 'quero_ver')
await diz(T.ana, 'Cookies artesanais pra quem quer dar presente')
confere('etapa Coletando', contato(T.ana).etapa === 'coletando')
confere('pergunta a cidade', /cidade/i.test(ultimas(T.ana)[0]), ultimas(T.ana)[0])
r = await diz(T.ana, 'Quanto custa isso que tu faz?')
confere('preço na coleta: valor depois, e repete a pergunta', /Te mostro tudo junto com a amostra/.test(ultimas(T.ana)[0]) && /cidade/i.test(ultimas(T.ana)[0]), ultimas(T.ana)[0])
await diz(T.ana, 'Estrela')
confere('pergunta os produtos com preço', /preço/i.test(ultimas(T.ana)[0]))
r = await diz(T.ana, 'Vocês emitem nota fiscal pra empresa?')
confere('dúvida fora do roteiro: passa pro time', /passo pro time/i.test(ultimas(T.ana)[0]) && !!contato(T.ana).estado.duvida, ultimas(T.ana)[0])
await diz(T.ana, 'Caixa com 6 cookies R$ 45, caixa com 12 R$ 85')
await diz(T.ana, 'Entrega em Estrela e retirada, de terça a sábado das 10h às 19h')
await diz(T.ana, 'A caixa com 6')
await diz(T.ana, 'Pouca gente me conhece fora de Estrela')
confere('pergunta o Instagram', /Instagram/i.test(ultimas(T.ana)[0]))
await diz(T.ana, 'não tenho')
confere('"não tenho" Instagram não é recusa', contato(T.ana).coleta.instagram === 'não tem' && contato(T.ana).etapa === 'coletando')
confere('pede 3 a 5 fotos e vídeos', /3 a 5 fotos/.test(ultimas(T.ana)[0]))
await foto(T.ana, 1); await foto(T.ana, 2)
confere('2 fotos: pede mais 1', /Manda mais 1 foto/.test(ultimas(T.ana)[0]), ultimas(T.ana)[0])
await foto(T.ana, 3)
confere('3 fotos: pergunta dos vídeos', /vídeos curtos/.test(ultimas(T.ana)[0]), ultimas(T.ana)[0])
const avisosAna = () => le('eventos').filter(e => e.tipo === 'lanc_aviso' && Date.parse(e.criado_em) >= INICIO && /material chegou/.test(e.detalhe.titulo) && /Ana/.test(e.detalhe.texto)).length
confere('chegaram as fotos: o time é avisado NA HORA (antes do vídeo)', avisosAna() === 1)
await video(T.ana)
// 16/11 (Nando): sem a pergunta da hora; fecha com "Material recebido! Em até 24 horas..."
confere('vídeo: fecha a coleta sem perguntar hora', /Material recebido/.test(ultimas(T.ana)[0]) && /24 horas/.test(ultimas(T.ana)[0]) && !/10h|15h/.test(ultimas(T.ana)[0]), ultimas(T.ana)[0])
let a = contato(T.ana)
confere('Material recebido, sem hora marcada e com o prazo de 24 h pra equipe', a.etapa === 'material_recebido' && !a.entrega_em && !!a.estado.prazo_em, a)
confere('guardou 3 fotos e 1 vídeo no armazenamento', le('lanc_midias').filter(x => x.contato_id === a.id && x.origem === 'contato').length === 4 && fs.existsSync(path.join(PASTA, 'arquivos', le('lanc_midias').find(x => x.contato_id === a.id).path)))
confere('aviso pro time do material (só primeiro nome + negócio)', le('eventos').some(e => e.tipo === 'lanc_aviso' && /material chegou/.test(e.detalhe.titulo) && /Ana/.test(e.detalhe.texto) && !e.detalhe.texto.includes(T.ana)))
confere('o aviso do material sai uma vez só (não repete ao fechar)', avisosAna() === 1, String(avisosAna()))
await diz(T.ana, 'Valeu!')
confere('depois: confirma o prazo de 24 horas', /24 horas/.test(ultimas(T.ana)[0]), ultimas(T.ana)[0])

console.log('2) Agora não, sem negócio')
await diz(T.beto, 'Agora não', 'botao')
confere('"Agora não": agradece e não insiste', ultimas(T.beto)[0] === 'Tranquilo! Não te chamo mais sobre isso.' && contato(T.beto).etapa === 'agora_nao')
confere('depois do "Agora não", outra mensagem volta pro CRM', (await diz(T.beto, 'oi, sobre o curso')).tratado === false)
r = await diz(T.beto, 'Quero ver')
confere('mas "Quero ver" depois traz de volta pra Maia', r.tratado === true && contato(T.beto).etapa === 'quero_ver')
await diz(T.caio, 'Quero ver', 'botao')
await diz(T.caio, 'Não tenho negócio, só estudo')
confere('sem negócio: convite pra indicar', /indicação/.test(ultimas(T.caio)[0]) && contato(T.caio).etapa === 'perdido')
await diz(T.caio, 'Minha tia: Rosa 51 99999-0000')
confere('a indicação vai pro time', /Valeu pela indicação/.test(ultimas(T.caio)[0]))
// 16/11: "SAIR" respondendo ao disparo é descadastro: a Maia não responde nem começa a coleta
const eva = '55000' + R + '06'
await post({ acao: 'adicionar', telefone: eva, nome: 'Eva', remessa: 1 })
r = await diz(eva, 'SAIR')
confere('"SAIR" ao disparo: não é da Maia (o CRM registra o descadastro)', r.tratado === false, r)
confere('"SAIR": vira perdido, sem nenhuma mensagem da Maia', contato(eva).etapa === 'perdido' && le('lanc_msgs').filter(m => m.contato_id === contato(eva).id && m.direcao === 'saida').length === 0)
confere('depois do "SAIR", um "oi" não traz a Maia de volta', (await diz(eva, 'oi')).tratado === false)
r = await diz(eva, 'Parar.')
confere('"Parar." também é descadastro', r.tratado === false)

// 16/11: pediu uma pessoa → a Maia avisa UMA vez e fica quieta até a equipe resolver; e nunca repete a mesma mensagem
const fe = '55000' + R + '91', gi = '55000' + R + '92'
await post({ acao: 'adicionar', telefone: fe, nome: 'Fê', remessa: 1 }); await post({ acao: 'adicionar', telefone: gi, nome: 'Gi', remessa: 1 })
await diz(fe, 'Quero ver', 'botao')
const saidasDe = tel => le('lanc_msgs').filter(m => m.contato_id === contato(tel).id && m.direcao === 'saida').length
let antes = saidasDe(fe)
await diz(fe, 'Chama um humano')
confere('pediu humano: a Maia avisa que chamou o time', saidasDe(fe) === antes + 1 && /chamei o time/.test(ultimas(fe)[0]) && !!contato(fe).estado.humano && !!contato(fe).estado.duvida, ultimas(fe)[0])
antes = saidasDe(fe)
await diz(fe, 'Oi? Alguém?'); await diz(fe, 'Vende roupa')
confere('com o time: a Maia não responde mais essa pessoa', saidasDe(fe) === antes)
await post({ acao: 'duvida_resolvida', id: contato(fe).id })
await diz(fe, 'Roupa feminina pra mulheres de 30 a 50')
confere('dúvida resolvida: a pessoa volta pra Maia', saidasDe(fe) === antes + 1 && !contato(fe).estado.humano)
await diz(gi, 'Quero ver', 'botao')
await post({ acao: 'simular_entrada', telefone: gi, tipo: 'audio' })
await post({ acao: 'simular_entrada', telefone: gi, tipo: 'audio' })
const ga = le('lanc_msgs').filter(m => m.contato_id === contato(gi).id && m.direcao === 'saida').map(m => m.texto)
confere('a Maia não repete a mesma mensagem: na 2ª vez passa pro time', ga.filter(t => /ouvir esse áudio/.test(t)).length === 1 && !!contato(gi).estado.humano, ga)
{ const au = '55000' + R + '98'
  await post({ acao: 'adicionar', telefone: au, nome: 'Áudio Teste' })
  await diz(au, 'Quero ver', 'botao')
  const p0 = ultimas(au)[0]
  await post({ acao: 'simular_entrada', telefone: au, tipo: 'audio', midia_id: 'teste-audio:Eu tenho uma loja de roupa feminina em Lajeado' })
  const ma = le('lanc_msgs').filter(m => m.contato_id === contato(au).id && m.tipo === 'audio')
  confere('áudio: a fala fica na conversa com 🎤', ma.length === 1 && ma[0].texto === '🎤 Eu tenho uma loja de roupa feminina em Lajeado', ma)
  confere('áudio: a Maia entende e faz a próxima pergunta (não diz que não ouve)', !/ouvir/.test(ultimas(au)[0]) && ultimas(au)[0] !== p0 && !contato(au).estado.humano, ultimas(au).slice(0, 2))
  await post({ acao: 'simular_entrada', telefone: au, tipo: 'audio', midia_id: 'nao-transcreve' })
  confere('áudio que não deu pra transcrever: pede pra escrever', /ouvir esse áudio/.test(ultimas(au)[0]), ultimas(au)[0]) }
// 16/11: "Oi" ou a saudação automática nunca viram o negócio da pessoa (o painel mostrava "Olá, assim que possível retorno…")
{ const sa = '55000' + R + '89'
  await post({ acao: 'adicionar', telefone: sa, nome: 'Saudação Teste' })
  await diz(sa, 'Quero ver', 'botao')
  await diz(sa, 'Oi')
  confere('"Oi" na pergunta do negócio: não vira o negócio, pergunta de novo', !contato(sa).coleta?.negocio && /o que tu vende/.test(ultimas(sa)[0]), [contato(sa).coleta, ultimas(sa)[0]])
  await diz(sa, 'Bela Flor agradece seu contato. Como podemos ajudar?')
  confere('saudação automática na coleta: não vira o negócio', !contato(sa).coleta?.negocio, contato(sa).coleta)
  await diz(sa, 'Vendo flores e cestas pra presente')
  confere('a resposta de verdade vira o negócio', /flores/.test(contato(sa).coleta?.negocio || ''), contato(sa).coleta) }

// 16/11: a saudação automática do WhatsApp da empresa não abre a coleta; o botão "Quero ver" depois abre normal
const hu = '55000' + R + '93'
await post({ acao: 'adicionar', telefone: hu, nome: 'Hugo', remessa: 1 })
for (const auto of ['‎Imobiliária Univale agradece seu contato. Como podemos ajudar?', 'Olá! 👋 Seja bem-vindo(a) à Encanta Pet! 🐾 Em breve retornamos.', 'Olá, obrigado pela mensagem 😃 Estou em atendimento, assim que possível te respondo.']) await diz(hu, auto)
confere('saudação automática: a Maia não responde e não abre a coleta', le('lanc_msgs').filter(m => m.contato_id === contato(hu).id && m.direcao === 'saida').length === 0 && ['na_lista', 'disparado'].includes(contato(hu).etapa), contato(hu).etapa)
await diz(hu, 'Quero ver', 'botao')
confere('depois o "Quero ver" de verdade abre a coleta', contato(hu).etapa === 'quero_ver' && /o que tu vende/i.test(ultimas(hu)[0] || ''), ultimas(hu)[0])
await diz(hu, 'Vendo móveis planejados pra quem está reformando a casa')
confere('e uma resposta de verdade na coleta segue a coleta (não é saudação)', contato(hu).etapa === 'coletando')

// 16/11 (AT-3): o time respondeu pela caixa do CRM → a Maia fica quieta 2 h; depois volta sozinha
const iv = '55000' + R + '94'
await post({ acao: 'adicionar', telefone: iv, nome: 'Ivo', remessa: 1 })
await diz(iv, 'Quero ver', 'botao')
await post({ acao: 'simular_time', telefone: iv, texto: 'Oi Ivo, aqui é o Guto da escola. Me conta do teu negócio?' })
const msIv = () => le('lanc_msgs').filter(m => m.contato_id === contato(iv).id && m.direcao === 'saida')
confere('a mensagem do time entra na conversa como "equipe"', msIv().slice(-1)[0]?.autor === 'equipe' && !!contato(iv).estado.time_em)
let nIv = msIv().length
await diz(iv, 'Tenho uma loja de roupas')
confere('o time falou: a Maia não responde junto', msIv().length === nIv)
{ const csIv = le('lanc_contatos'); const dIv = csIv.find(x => x.telefone === iv); dIv.estado.time_em = new Date(Date.now() - 5 * 3600e3).toISOString(); grava('lanc_contatos', csIv) }
await diz(iv, 'Roupa feminina em Lajeado')
confere('5 h depois do time: a Maia continua fora (não volta sozinha)', msIv().length === nIv)
confere('a tela mostra "Com o time"', !!(await get('acao=lista')).lista.find(x => x.id === contato(iv).id).com_time)
await post({ acao: 'devolver', id: contato(iv).id })
await diz(iv, 'Roupa feminina pra mulheres de 30 a 50')
confere('"Devolver pra Maia": ela volta a responder', msIv().length === nIv + 1 && msIv().slice(-1)[0]?.autor === 'maia' && !contato(iv).estado.time_em)

// 16/11: quem parou na antiga pergunta da hora (coleta completa) recebe o fechamento sozinho na rotina, dentro da janela
const jo = '55000' + R + '95'
await post({ acao: 'adicionar', telefone: jo, nome: 'Jo', remessa: 1 })
{ const csJ = le('lanc_contatos'); const dJ = csJ.find(x => x.telefone === jo); const relJ = new Date('2026-11-17T17:00:00Z')
  dJ.etapa = 'coletando'; dJ.coleta = { negocio: 'Pizzaria', cidade: 'Lajeado', produtos: 'Pizza R$ 60', como_vende: 'Entrega', carro_chefe: 'Calabresa', dificuldade: 'Pouco movimento', instagram: '@pizza', so_essas: true, sem_video: true }
  dJ.estado = { passo: 'hora' }; dJ.ultima_entrada_em = new Date(relJ - 3600e3).toISOString(); dJ.ultima_saida_em = new Date(relJ - 3500e3).toISOString(); grava('lanc_contatos', csJ)
  const mids = le('lanc_midias'); mids.push({ id: 'midia-jo-1', contato_id: dJ.id, tipo: 'foto', origem: 'contato', path: `lanc-${dJ.id}/midias/x.jpg`, mime: 'image/jpeg', criado_em: new Date().toISOString() }); grava('lanc_midias', mids)
  const rJ = await post({ acao: 'rodar_rotina', relogio: relJ.toISOString() })
  confere('parou na pergunta da hora: a rotina fecha a coleta com o "em até 24 horas"', contato(jo).etapa === 'material_recebido' && /Material recebido/.test(ultimas(jo)[0] || ''), rJ) }

// 16/11 (Nando): follow-up de 1 h na coleta e pra quem só mandou a saudação automática
{ const relF = new Date('2026-11-17T17:00:00Z')   // 14h em Brasília
  const ka = '55000' + R + '96', le2 = '55000' + R + '97'
  await post({ acao: 'adicionar', telefone: ka, nome: 'Ka', remessa: 1 }); await post({ acao: 'adicionar', telefone: le2, nome: 'Leo', remessa: 1 })
  await diz(ka, 'Quero ver', 'botao')
  const ajusta = (tel, f) => { const cs2 = le('lanc_contatos'); const x = cs2.find(y => y.telefone === tel); f(x); grava('lanc_contatos', cs2) }
  ajusta(ka, x => { x.ultima_entrada_em = new Date(relF - 55 * 60e3).toISOString(); x.ultima_saida_em = new Date(relF - 50 * 60e3).toISOString(); x.estado.retomada = null })
  let rr = await post({ acao: 'rodar_rotina', relogio: relF.toISOString() })
  confere('coleta: com 50 min ainda não retoma', !(rr.retomadas || []).some(x => x.contato === contato(ka).id))
  ajusta(ka, x => { x.ultima_entrada_em = new Date(relF - 75 * 60e3).toISOString(); x.ultima_saida_em = new Date(relF - 70 * 60e3).toISOString() })
  rr = await post({ acao: 'rodar_rotina', relogio: relF.toISOString() })
  confere('coleta: 1 h depois de parar, a Maia retoma com a pergunta que falta', (rr.retomadas || []).some(x => x.contato === contato(ka).id && x.n === 1 && x.como === 'texto') && /Ficou faltando pouco/.test(ultimas(ka)[0]), rr.retomadas)
  await diz(le2, 'Imobiliária Teste agradece seu contato. Como podemos ajudar?')
  ajusta(le2, x => { x.estado.auto_resposta.em = new Date(relF - 30 * 60e3).toISOString(); x.ultima_entrada_em = new Date(relF - 30 * 60e3).toISOString() })
  rr = await post({ acao: 'rodar_rotina', relogio: relF.toISOString() })
  confere('saudação automática: com 30 min ainda não segue', !(rr.segue_auto || []).includes(contato(le2).id))
  ajusta(le2, x => { x.estado.auto_resposta.em = new Date(relF - 70 * 60e3).toISOString(); x.ultima_entrada_em = new Date(relF - 70 * 60e3).toISOString() })
  rr = await post({ acao: 'rodar_rotina', relogio: new Date('2026-11-18T00:30:00Z').toISOString() })
  confere('saudação automática: de noite (21h30) não manda', !(rr.segue_auto || []).includes(contato(le2).id))
  rr = await post({ acao: 'rodar_rotina', relogio: relF.toISOString() })
  confere('saudação automática: 1 h depois, UMA mensagem dizendo que é a Maia (IA) e o que é', (rr.segue_auto || []).includes(contato(le2).id) && /Maia, a IA/.test(ultimas(le2)[0]) && /quero ver/.test(ultimas(le2)[0]), rr.segue_auto)
  rr = await post({ acao: 'rodar_rotina', relogio: new Date(+relF + 3600e3).toISOString() })
  confere('saudação automática: não manda de novo', !(rr.segue_auto || []).includes(contato(le2).id))
  await diz(le2, 'quero ver')
  confere('depois do follow-up, "quero ver" abre a coleta', contato(le2).etapa === 'quero_ver') }

console.log('3) A tela da equipe: lista, contato e as peças')
l = await get('acao=lista')
confere('contadores por etapa', l.conta.material_recebido >= 1 && l.conta.agora_nao === 0 && l.conta.quero_ver >= 1, l.conta)
const ida = contato(T.ana).id
let c = await get('acao=contato&id=' + ida)
confere('o contato tem a coleta, as fotos com link e a conversa', c.coleta.produtos && c.midias.length === 4 && c.midias.every(x => x.url) && c.msgs.length > 10)
confere('a fila de dúvidas mostra a Ana', l.lista.find(x => x.id === ida).duvida)
confere('aprovar sem as peças: recusa', /faltam os 2 anúncios/.test((await post({ acao: 'aprovar', id: ida, agora: true })).erro || ''))
async function sobe(slot, mime, conteudo) {
  const x = await post({ acao: 'link_envio', id: ida, mime })
  const u = new globalThis.URL(x.url, URL).href
  const p = await fetch(u, { method: 'PUT', headers: { 'content-type': mime }, body: Buffer.from(conteudo) })
  if (!p.ok) return { erro: 'put ' + p.status }
  return post({ acao: 'definir_peca', id: ida, slot, caminho: x.caminho, mime })
}
confere('sobe o anúncio 1', (await sobe('anuncio1', 'image/jpeg', 'arte1')).ok)
confere('etapa Amostra em produção', contato(T.ana).etapa === 'em_producao')
confere('sobe o anúncio 2 e o vídeo', (await sobe('anuncio2', 'image/png', 'arte2')).ok && (await sobe('video', 'video/mp4', 'video')).ok)
confere('arquivo de outro lugar: recusa', (await post({ acao: 'definir_peca', id: ida, slot: 'anuncio1', caminho: 'outro/pecas/x.jpg', mime: 'image/jpeg' })).http === 400)
confere('legenda', (await post({ acao: 'legenda', id: ida, slot: 'anuncio1', legenda: 'Presente que chega quentinho. <script>alert(1)</script>' })).ok)
r = await post({ acao: 'gerar_oficina', id: ida })
confere('gerar com a oficina sem IA: avisa o erro sem quebrar', r.http === 400 || r.ok, r)
confere('o negócio de apoio da oficina não aparece na demonstração do Oito', !le('negocios').filter(n => n.contexto?.demo?.lancamento).length || (await fetch(`${URL}/api/maia/operacao?acao=amostras`, { headers: { 'x-senha': SENHA } }).then(x => x.json()).then(j => !(j.lista || []).some(x => x.negocio_id === contato(T.ana).negocio_id)).catch(() => true)))
r = await post({ acao: 'gerar_conversa', id: ida })
confere('a conversa pronta (sem IA) usa os preços que a pessoa deu', r.ok && r.conversa.some(f => /R\$ 45/.test(f.texto)) && r.retomada, r)
confere('salvar conversa com 1 fala só: recusa', (await post({ acao: 'salvar_conversa', id: ida, texto: 'Maia: oi' })).http === 400)
confere('salvar conversa editada', (await post({ acao: 'salvar_conversa', id: ida, texto: 'Cliente: Oi! Vi o anúncio.\nMaia: Oi! Aqui é a Maia, assistente virtual. A caixa com 6 vai de presente, com laço: R$ 45.\nCliente: Quero pra sábado\nMaia: Anotado! Confirmo com a dona.\nRetomada: Oi! Ainda dá pra garantir a tua caixa.' })).ok)

console.log('4) A página da amostra')
const tok = contato(T.ana).token
let pg = await fetch(`${URL}/maia/amostra/${tok}`)
confere('antes de aprovar, a página não abre pro público', pg.status === 404)
pg = await fetch(`${URL}/maia/amostra/${tok}?previa=1`)
let html = await pg.text()
confere('a prévia da equipe abre', pg.status === 200 && /Prévia da equipe/.test(html))
r = await post({ acao: 'aprovar', id: ida, agora: true })
a = contato(T.ana)
confere('aprovar e entregar agora: manda o link pela Maia', r.ok && a.entregue_em && a.etapa === 'amostra_entregue' && ultimas(T.ana).some(t => t.includes('/maia/amostra/' + tok)), r)
pg = await fetch(`${URL}/maia/amostra/${tok}`, { headers: { 'user-agent': 'Mozilla/5.0 (iPhone)' } }); html = await pg.text()
const ordem = ['Anúncio 1', 'Anúncio 2', 'Vídeo editado', 'Eu atendo, levo até o pedido', 'No outro dia', 'Agora testa tu', 'Edita os vídeos', 'O que muda', 'O que está incluso', 'Quanto custa', 'Importante:']
const pos = ordem.map(t => html.indexOf(t))
confere('a página tem tudo, na ordem (anúncios, conversa, teste, funções, dia a dia, incluso, preço, frase)', pos.every((p, i) => p > 0 && (i === 0 || p > pos[i - 1])), ordem.filter((t, i) => pos[i] < 0))
confere('as 10 funções (cria, edita vídeos, posta, campanha, 24 h, retoma, mede, relatório, responde na hora, painel)', ['Cria os anúncios', 'Edita os vídeos', 'Posta no Instagram', 'Coloca a campanha no ar', 'Atende 24 horas', 'Retoma quem sumiu', 'Mede as vendas', 'relatório', 'Te responde na hora', 'painel'].every(t => html.includes(t)))
confere('preço: ativação de R$ 997 por R$ 497, depois R$ 997 por mês, no ar em 2 dias', /Ativação/.test(html) && /de R\$ 997/.test(html) && /por R\$ 497/.test(html) && /R\$ 997 por mês/.test(html) && /2 dias depois da implantação/.test(html))
confere('a frase da implantação presencial e individual', /feita com pouca informação\. A implantação de verdade é presencial e individual, com um especialista/.test(html))
confere('o valor vem antes do preço', html.indexOf('O que está incluso') < html.indexOf('R$ 497'))
confere('o botão do teste abre o WhatsApp da escola com o texto do modo teste', html.includes('https://wa.me/5551995054548?text=') && /modo%20teste/.test(html))
confere('sem emoji e sem script do contato (escapado)', !/\p{Extended_Pictographic}/u.test(html.replace(/<style[\s\S]*?<\/style>/, '')) && !html.includes('<script>alert(1)') && html.includes('&lt;script&gt;'))
confere('a única imagem de IA é a da Maia (o resto são os arquivos do contato)', (html.match(/<img [^>]*src="([^"]+)"/g) || []).every(t => /maia-avatar|api\/maia\/arquivo/.test(t)))
a = contato(T.ana)
confere('contou 1 abertura e pôs na fila do Rick', a.aberturas === 1 && a.aberta_em && a.rick_pendente_em && a.estado.rick_motivo === 'abriu a amostra')
await fetch(`${URL}/maia/amostra/${tok}`, { headers: { 'user-agent': 'WhatsApp/2.23' } })
await fetch(`${URL}/maia/amostra/${tok}?previa=1`)
confere('prévia do link do WhatsApp e da equipe não contam', contato(T.ana).aberturas === 1)
confere('token errado: 404', (await fetch(`${URL}/maia/amostra/xxxxxxxxxxxx`)).status === 404)

console.log('5) O teste ao vivo')
await diz(T.ana, 'Quero testar a Maia como cliente da Cookies artesanais pra quem quer dar presente (modo teste)')
confere('liga o modo teste', /Modo teste ligado/.test(ultimas(T.ana)[0]) && contato(T.ana).estado.modo === 'teste')
await diz(T.ana, 'Oi, quanto custa a caixa?')
m = ultimas(T.ana)[0]
confere('responde como atendente do negócio, com os preços da coleta', /Aqui é da/.test(m) && !/Maia|intelig|assistente virtual/i.test(m) && /R\$ 45/.test(m), m)
a = contato(T.ana)
confere('registra "Testou"', a.testou_em && a.etapa === 'testou')
await diz(T.ana, 'Vocês aceitam vale-refeição?')
confere('o que não sabe: confirma com a equipe, sem falar em dono nem implantação', /equipe/.test(ultimas(T.ana)[0]) && !/dono|implantação/i.test(ultimas(T.ana)[0]), ultimas(T.ana)[0])
r = await diz(T.ana, 'sair')
confere('"sair" sai do modo teste (e não vira opt-out)', /saí do modo teste/.test(ultimas(T.ana)[0]) && !contato(T.ana).estado.modo)
await post({ acao: 'rick_feito', id: ida })
confere('Rick: áudio mandado tira da fila', (await get('acao=lista')).lista.find(x => x.id === ida).rick_pendente === false)
await diz(T.ana, 'Gostei! Quero contratar, como faço pra começar?')
confere('quer fechar: etapa Fechamento (Rick) e volta pra fila do Rick', contato(T.ana).etapa === 'fechamento' && (await get('acao=lista')).lista.find(x => x.id === ida).rick_pendente)
r = await diz(T.ana, 'pode ser terça')
confere('no fechamento a Maia fica quieta (o time responde no CRM)', r.tratado === true && /Já já alguém te chama/.test(ultimas(T.ana)[0]))

console.log('6) A rotina: entrega na hora combinada, retomadas, teste parado')
// a Duda faz a coleta toda e a equipe aprova pra entregar na hora combinada
await diz(T.duda, 'Quero ver', 'botao')
for (const t of ['Salão de beleza pra noivas', 'Lajeado', 'Escova R$ 60, progressiva R$ 250', 'Horário marcado, segunda a sábado', 'Progressiva', 'Pouco cliente na semana', '@salaoduda']) await diz(T.duda, t)
for (let i = 0; i < 3; i++) await foto(T.duda, i)
await diz(T.duda, 'sem vídeo')
await diz(T.duda, '10')
const dd = contato(T.duda)
confere('Duda: sem vídeo também fecha a coleta', dd.etapa === 'material_recebido' && dd.coleta.sem_video, dd.estado)
// quem combinou hora antes de 16/11 (entrega_em) segue com ela: simula isso na Duda pra conferir a entrega agendada
{ const csD = le('lanc_contatos'); const dD = csD.find(x => x.telefone === T.duda); dD.entrega_em = new Date(Date.now() + 20 * 3600e3).toISOString(); grava('lanc_contatos', csD) }
// as peças direto no arquivo (o caminho da tela já foi testado) e a aprovação pra hora combinada
let cs = le('lanc_contatos'), d = cs.find(x => x.telefone === T.duda)
d.amostra = { pecas: { anuncio1: { path: `lanc-${d.id}/pecas/a.jpg`, mime: 'image/jpeg' }, anuncio2: { path: `lanc-${d.id}/pecas/b.jpg`, mime: 'image/jpeg' }, video: { path: `lanc-${d.id}/pecas/c.mp4`, mime: 'video/mp4' } } }
grava('lanc_contatos', cs)
r = await post({ acao: 'aprovar', id: d.id })
confere('aprovar na hora combinada: fica agendada', r.agendada && !contato(T.duda).entregue_em, r)
const entregaEm = Date.parse(contato(T.duda).entrega_em)
// 16/11: a janela de 24 h conta da última mensagem; rodando o teste de manhã cedo, ela fecha antes da hora combinada e a
// entrega sai antes de propósito (pra não precisar de modelo). Aqui a última mensagem fica 1 h antes da entrega: janela aberta
cs = le('lanc_contatos'); d = cs.find(x => x.telefone === T.duda); d.ultima_entrada_em = new Date(entregaEm - 3600e3).toISOString(); grava('lanc_contatos', cs)
r = await post({ acao: 'rodar_rotina', relogio: new Date(entregaEm - 2 * 3600e3).toISOString() })
confere('antes da hora não entrega', !contato(T.duda).entregue_em)
// a janela de 24 h da Duda está aberta (ela escreveu agora): na hora combinada entrega
cs = le('lanc_contatos'); d = cs.find(x => x.telefone === T.duda); d.ultima_entrada_em = new Date(entregaEm - 3600e3).toISOString(); grava('lanc_contatos', cs)
r = await post({ acao: 'rodar_rotina', relogio: new Date(entregaEm + 60e3).toISOString() })
confere('na hora combinada a rotina entrega', !!contato(T.duda).entregue_em && contato(T.duda).etapa === 'amostra_entregue', r)
// retomada da coleta: o Beto parou no meio (a última mensagem foi nossa, há 21 h); relógio às 14h de Brasília
const rel = new Date('2026-11-17T17:00:00Z')
cs = le('lanc_contatos'); let b = cs.find(x => x.telefone === T.beto)
b.ultima_entrada_em = new Date(rel - 22 * 3600e3).toISOString(); b.ultima_saida_em = new Date(rel - 21 * 3600e3).toISOString()
// 16/11: começa sem retomada (rodando de madrugada, a rotina da Duda, "amanhã às 10h", fica a mais de 20 h e já retomava o Beto antes)
b.estado.retomada = null; grava('lanc_contatos', cs)
r = await post({ acao: 'rodar_rotina', relogio: rel.toISOString() })
confere('retomada de ~20 h dentro das 24 h: texto com a pergunta que falta', (r.retomadas || []).some(x => x.contato === b.id && x.como === 'texto' && x.n === 1) && /Ficou faltando pouco/.test(ultimas(T.beto)[0]) && /o que tu vende/i.test(ultimas(T.beto)[0]), r)
// o envio grava a hora de verdade; no relógio do teste, a retomada saiu em "rel"
cs = le('lanc_contatos'); b = cs.find(x => x.telefone === T.beto); b.ultima_saida_em = rel.toISOString(); grava('lanc_contatos', cs)
r = await post({ acao: 'rodar_rotina', relogio: new Date(+rel + 3600e3).toISOString() })
confere('não repete a retomada na hora seguinte', !(r.retomadas || []).some(x => x.contato === b.id))
r = await post({ acao: 'rodar_rotina', relogio: new Date(+rel + 3 * 86400e3).toISOString() })
confere('3 dias, janela fechada e sem modelo: vai pra "retomada à mão"', (r.retomadas || []).some(x => x.contato === b.id && x.n === 2 && x.como === 'a_mao') && (await get('acao=lista')).lista.find(x => x.id === b.id).retomada_a_mao, r)
r = await post({ acao: 'rodar_rotina', relogio: new Date(+rel + 6 * 86400e3).toISOString() })
const ret3 = contato(T.beto).estado.retomada
confere('6 dias: a despedida', ret3.n === 3 && /Tentei falar contigo, entendo a correria/.test(ret3.texto || ''), ret3)
r = await post({ acao: 'rodar_rotina', relogio: new Date(+rel + 9 * 86400e3).toISOString() })
confere('depois da despedida, para', !(r.retomadas || []).some(x => x.contato === b.id))
r = await post({ acao: 'rodar_rotina', relogio: new Date('2026-11-17T02:00:00Z').toISOString() })
confere('de madrugada não retoma ninguém', !(r.retomadas || []).length)
// teste parado: a Duda liga o teste e some
await diz(T.duda, 'modo teste')
cs = le('lanc_contatos'); d = cs.find(x => x.telefone === T.duda); d.estado.teste_ate = new Date(Date.now() - 60e3).toISOString(); grava('lanc_contatos', cs)
r = await post({ acao: 'rodar_rotina' })
confere('teste parado há mais de 30 min: sai do modo teste', (r.testes || []).includes(d.id) && !contato(T.duda).estado.modo && /saí do modo teste/.test(ultimas(T.duda)[0]), r)

console.log('7) O teste do time (remessa 0)')
await diz(T.time, 'Quero ver', 'botao')
confere('o Guto na lista de teste passa pela Maia como cliente', contato(T.time).etapa === 'quero_ver')
r = await post({ acao: 'zerar', id: contato(T.time).id })
confere('zerar o teste do time: volta pra "Na lista" sem conversa', r.ok && contato(T.time).etapa === 'na_lista' && !le('lanc_msgs').some(x => x.contato_id === contato(T.time).id))
confere('zerar quem é da remessa de verdade: recusa', (await post({ acao: 'zerar', id: ida })).http === 400)

r = await post({ acao: 'remover', id: contato(T.time).id })
confere('tirar o time da lista: o número volta pro atendimento de antes', r.ok && !contato(T.time) && (await diz(T.time, 'oi')).tratado === false)
confere('tirar da lista quem é da remessa de verdade: recusa', (await post({ acao: 'remover', id: ida })).http === 400)

// ======================================================================================================================
// 16/11: a ENTREGA NOVA (MAIA_LANC_ENTREGA_V2). Tudo acima roda com a chave desligada (o comportamento de antes).
// ======================================================================================================================
console.log('8) Entrega nova: as peças dentro do WhatsApp, o botão "Testar agora" e a pergunta ao sair do teste')
const saidas = tel => { const c = contato(tel); return le('lanc_msgs').filter(m => m.contato_id === c.id && m.direcao === 'saida') }
const muda = (tel, f) => { const cs = le('lanc_contatos'); const x = cs.find(y => y.telefone === tel); f(x); grava('lanc_contatos', cs); return x }
const COLETA = n => ({ negocio: 'Pizzaria pra família', nome_negocio: n, cidade: 'Lajeado', produtos: 'Pizza grande R$ 60, média R$ 45', como_vende: 'Entrega e retirada, de terça a domingo das 18h às 23h', carro_chefe: 'Pizza de calabresa', dificuldade: 'Pouco movimento durante a semana', instagram: '@' + n.toLowerCase().replace(/\W/g, ''), hora: 10 })
// alguém com a coleta feita e as 2 artes prontas (sem vídeo), janela de 24 h aberta
async function pronto(tel, nome, neg, op = {}) {
  await post({ acao: 'adicionar', telefone: tel, nome, remessa: 1 })
  const x = muda(tel, x => {
    x.etapa = 'material_recebido'; x.coleta = COLETA(neg); x.entrega_em = new Date(Date.now() - 60e3).toISOString()
    x.ultima_entrada_em = op.janelaFechada ? new Date(Date.now() - 30 * 3600e3).toISOString() : new Date(Date.now() - 3600e3).toISOString()
    x.amostra = { pecas: { anuncio1: { path: `lanc-${x.id}/pecas/a1.jpg`, mime: 'image/jpeg', legenda: 'A calabresa que sai do forno a lenha.' }, anuncio2: { path: `lanc-${x.id}/pecas/a2.jpg`, mime: 'image/jpeg' }, ...(op.video ? { video: { path: `lanc-${x.id}/pecas/v.mp4`, mime: 'video/mp4' } } : {}) } }
  })
  return x
}
r = await post({ acao: 'chave_v2', ligar: true })
confere('liga a chave da entrega nova (só no teste local)', r.v2 === true && (await get('acao=lista')).v2 === true, r)
const F = { fabi: '55000' + R + '11', gil: '55000' + R + '12', hugo: '55000' + R + '13', ivo: '55000' + R + '14', jo: '55000' + R + '15', kika: '55000' + R + '16' }
// a Fabi faz a coleta de verdade (com fotos), pra ter capa, logo e grade
await post({ acao: 'adicionar', telefone: F.fabi, nome: 'Fabi', remessa: 1 })
await diz(F.fabi, 'Quero ver', 'botao')
for (const t of ['Doces de festa pra aniversário', 'Lajeado', 'Brigadeiro gourmet R$ 3, bolo de pote R$ 12', 'Encomenda com 2 dias, retirada ou entrega', 'Brigadeiro gourmet', 'Pouca gente fora do bairro me conhece', '@docesdafabi']) await diz(F.fabi, t)
for (let i = 0; i < 4; i++) await foto(F.fabi, 10 + i)
await diz(F.fabi, 'sem vídeo'); await diz(F.fabi, '10')
let fa = contato(F.fabi)
confere('Fabi: coleta completa com 4 fotos', fa.etapa === 'material_recebido' && le('lanc_midias').filter(x => x.contato_id === fa.id).length === 4, fa.etapa)
const idf = fa.id
muda(F.fabi, x => { x.amostra = { pecas: { anuncio1: { path: `lanc-${x.id}/pecas/a1.jpg`, mime: 'image/jpeg', legenda: 'Brigadeiro de festa feito na hora.' }, anuncio2: { path: `lanc-${x.id}/pecas/a2.jpg`, mime: 'image/jpeg' } } } })
// os campos novos da tela da equipe
confere('salvar textos: "o que vimos" fora do formato é recusado', (await post({ acao: 'salvar_textos', id: idf, vimos: 'só uma frase solta' })).http === 400)
confere('salvar textos: cor fora do formato é recusada', (await post({ acao: 'salvar_textos', id: idf, cor: 'vermelho' })).http === 400)
r = await post({ acao: 'salvar_textos', id: idf, nome_negocio: 'Doces da Fabi', cor: '#e8202e', frase_entrega: 'A principal oportunidade: mostrar o brigadeiro de perto pra quem está montando festa em Lajeado.', vimos: '3 de 12 posts mostram os doces → Mostrar os doces de perto, com o WhatsApp na bio\nA bio leva pro Facebook → Trocar pelo link do WhatsApp\nSó orgânico, sem anúncio visível → Anúncio pra quem está montando festa em Lajeado e região' })
fa = contato(F.fabi)
confere('salvar textos: nome, cor, frase e 3 pontos do "o que vimos"', r.ok && fa.coleta.nome_negocio === 'Doces da Fabi' && fa.amostra.cor === '#e8202e' && fa.amostra.vimos.length === 3 && fa.amostra.vimos[1].oportunidade === 'Trocar pelo link do WhatsApp', fa.amostra)
const mids = le('lanc_midias').filter(x => x.contato_id === idf)
confere('marcar a logo e a capa (só foto do contato)', (await post({ acao: 'marcar_logo', id: idf, midia_id: mids[0].id })).ok && (await post({ acao: 'marcar_capa', id: idf, midia_id: mids[1].id })).ok && (await post({ acao: 'marcar_logo', id: idf, midia_id: 'outra' })).http === 400)
confere('grade com 2 fotos é recusada; com 3 fica', (await post({ acao: 'salvar_grade', id: idf, itens: mids.slice(1, 3).map(m => ({ midia_id: m.id, titulo: 'x' })) })).http === 400 && (await post({ acao: 'salvar_grade', id: idf, itens: mids.slice(1, 4).map((m, i) => ({ midia_id: m.id, titulo: ['Brigadeiro', 'Bolo de pote', 'Mesa de festa'][i], tipo: 'produto' })) })).grade === 3)
r = await post({ acao: 'gerar_roteiros', id: idf })
confere('gerar roteiros (sem IA: 1 roteiro de uns 30 s, 5 cenas, sem preço)', r.ok && r.roteiros.length === 1 && r.roteiros[0].cenas.length === 5 && !/R\$/.test(r.texto) && /^# /.test(r.texto), r)
confere('salvar roteiros editados (texto da tela) e recusar vazio', (await post({ acao: 'salvar_roteiros', id: idf, texto: r.texto.replace('Quem já quer comprar', 'Quem vai fazer festa') + '\n\n# Presente | Pra dezembro\n0 a 3s | Gancho | a caixa de doces | Vai dar presente?\n3 a 9s | Solução | os doces na caixa | Caixa de brigadeiro gourmet.\n9 a 15s | Chamada | o celular | Chama no WhatsApp.' })).ok && contato(F.fabi).amostra.roteiros.length === 2 && contato(F.fabi).amostra.roteiros[0].titulo === 'Quem vai fazer festa' && (await post({ acao: 'salvar_roteiros', id: idf, texto: 'nada' })).http === 400)
c = await get('acao=contato&id=' + idf)
confere('a tela da equipe recebe os campos novos', c.nova && c.nova.nome_negocio === 'Doces da Fabi' && /→/.test(c.nova.vimos) && /# Quem vai fazer festa/.test(c.nova.roteiros) && c.nova.grade.length === 3 && c.nova.frase_padrao)
// aprova e entrega agora (a janela está aberta: ela escreveu agora), sem vídeo
const nAntes = saidas(F.fabi).length
r = await post({ acao: 'aprovar', id: idf, agora: true })
fa = contato(F.fabi)
const novas = saidas(F.fabi).slice(nAntes)
confere('sem vídeo também aprova na entrega nova', r.ok && fa.entregue_em && fa.etapa === 'amostra_entregue' && fa.amostra.entrega_v2 === true, r)
confere('entrega: anúncio 1 e 2 como imagem, primeiro', novas[0]?.tipo === 'imagem' && /anúncio 1/.test(novas[0].texto) && /Doces da Fabi/.test(novas[0].texto) && novas[1]?.tipo === 'imagem' && /anúncio 2/.test(novas[1].texto), novas.map(m => m.tipo + ': ' + m.texto))
confere('entrega: a frase da oportunidade com o botão "Testar agora"', novas[2]?.tipo === 'botoes' && novas[2].texto.includes('mostrar o brigadeiro de perto') && /\[botões: Testar agora\]/.test(novas[2].texto), novas[2])
confere('entrega: por último o link da página', novas.length === 4 && novas[3].tipo === 'texto' && novas[3].texto.startsWith('Quer ver tudo, com os roteiros, a análise e o plano? Tá aqui: ') && novas[3].texto.includes('/maia/amostra/' + fa.token))
confere('entrega: as imagens levam o arquivo das peças (sem emoji)', novas[0].midia_id === `lanc-${idf}/pecas/a1.jpg` && !novas.some(m => /\p{Extended_Pictographic}/u.test(m.texto || '')))
// com vídeo: vai como vídeo, depois das imagens
await pronto(F.jo, 'Jo', 'Forno do Jo', { video: true })
r = await post({ acao: 'aprovar', id: contato(F.jo).id, agora: true })
confere('com vídeo: imagem, imagem, vídeo, botão, link', saidas(F.jo).map(m => m.tipo).join(',') === 'imagem,imagem,video,botoes,texto', saidas(F.jo).map(m => m.tipo))
// o botão "Testar agora" liga o modo teste ali mesmo
r = await diz(F.fabi, 'Testar agora')
confere('o botão "Testar agora" liga o modo teste', r.teste === 'ligado' && contato(F.fabi).estado.modo === 'teste' && /Modo teste ligado/.test(ultimas(F.fabi)[0]) && /Doces da Fabi/.test(ultimas(F.fabi)[0]), r)
await diz(F.fabi, 'Oi, quanto custa o brigadeiro?')
confere('no teste responde como a Doces da Fabi, com os preços da coleta', /Aqui é da Doces da Fabi/.test(ultimas(F.fabi)[0]) && /R\$ 3/.test(ultimas(F.fabi)[0]), ultimas(F.fabi)[0])
await diz(F.fabi, 'Vocês fazem doce sem açúcar?')
confere('guarda as perguntas do teste pro cartão do Rick', (contato(F.fabi).estado.teste_perguntas || []).length === 2)
r = await diz(F.fabi, 'sair')
fa = contato(F.fabi)
confere('saiu do teste: a Maia pergunta na hora o que achou', /saí do modo teste/.test(ultimas(F.fabi)[0]) && ultimas(F.fabi)[0].endsWith('E aí, curtiu como ela atendeu teu cliente? O que tu achou?') && fa.estado.acomp.esperando === 'opiniao_teste' && !fa.estado.modo, ultimas(F.fabi)[0])
await post({ acao: 'rick_feito', id: idf })
r = await diz(F.fabi, 'Achei muito rápida, gostei do jeito')
fa = contato(F.fabi)
let lf = (await get('acao=lista')).lista.find(x => x.id === idf)
confere('a resposta vai pro time (fila do Rick) com o texto, e para a sequência', /Valeu por me contar/.test(ultimas(F.fabi)[0]) && lf.rick_pendente && lf.rick_texto === 'Achei muito rápida, gostei do jeito' && fa.estado.acomp.parado, lf)
confere('o cartão do Rick mostra o que a pessoa fez (aberturas, teste, perguntas)', lf.atividade.testou === true && lf.atividade.perguntas.length === 2 && /testou/.test(lf.atividade.texto) && /sem açúcar/.test(lf.atividade.texto), lf.atividade)
confere('o aviso pro Guto não leva a resposta nem o telefone', !le('eventos').some(e => e.tipo === 'lanc_aviso' && (/Achei muito rápida/.test(e.detalhe.texto) || e.detalhe.texto.includes(F.fabi))))

console.log('9) A página nova da amostra')
const tf = contato(F.fabi).token
pg = await fetch(`${URL}/maia/amostra/${tf}`, { headers: { 'user-agent': 'Mozilla/5.0 (iPhone)' } }); html = await pg.text()
const ordemNova = ['Amostra feita pela Maia', 'Testar a Maia agora', 'Quero colocar rodando', 'O que a gente viu', 'Os anúncios', 'Tu grava, a Maia monta', 'Uma ideia de grade do Instagram', 'Agora testa tu', 'Tudo que a Maia faz', 'Como começa', 'Ativação de', 'Dúvidas comuns', 'Bora colocar']
const posN = ordemNova.map(t => html.indexOf(t))
confere('a página nova tem tudo, na ordem', pg.status === 200 && posN.every((p, i) => p > 0 && (i === 0 || p > posN[i - 1])), ordemNova.filter((t, i) => posN[i] < 0))
confere('entrada: logo da pessoa, os cards do que ela contou e a foto de capa', /<img class="logo" src="[^"]*api\/maia\/arquivo/.test(html) && /O que mais sai/.test(html) && /Brigadeiro gourmet/.test(html) && /class="foto"[^>]*background-image/.test(html))
confere('"o que vimos" em 3 cards coloridos, com o número em destaque', (html.match(/class="v c\d"/g) || []).length === 3 && /<b class="num">3<\/b>/.test(html) && /Trocar pelo link do WhatsApp/.test(html))
confere('os 3 estilos de vídeo e os roteiros em storyboard (tempo, o que filmar, a fala)', ['Voz por cima das cenas', 'Falando pra câmera', 'Misturando os dois', 'Quem vai fazer festa', 'Como gravar'].every(t => html.includes(t)) && (html.match(/class="card rot-card r\d"/g) || []).length === 2 && /class="tq">0 a 4s/.test(html) && /class="balao"/.test(html))
confere('"Tudo que a Maia faz": os 11 cards, números marcados "exemplo"', /<i>11<\/i><h3>12 posts por mês/.test(html) && (html.match(/class="ex">exemplo/g) || []).length >= 6)
confere('a oferta: R$ 997 por R$ 497, depois R$ 997 por mês, no ar 2 dias depois, presencial e individual, sem fidelidade', /<s>R\$ 997<\/s>/.test(html) && /<b>R\$ 497<\/b>/.test(html) && /R\$ 997 por mês/.test(html) && /2 dias depois/.test(html) && /presencial e individual/.test(html) && /sem fidelidade/i.test(html))
confere('o valor vem antes do preço (o R$ 497 só depois de "Como começa")', html.indexOf('R$ 497') > html.indexOf('Como começa'))
confere('sem prova de cliente, sem emoji, só tema claro', !/Wood|Segatto/.test(html) && !/\p{Extended_Pictographic}/u.test(html.replace(/<style[\s\S]*?<\/style>/, '')) && !/prefers-color-scheme:\s*dark/.test(html))
confere('as imagens são só a da Maia e os arquivos do contato', (html.match(/<img [^>]*src="([^"]+)"/g) || []).every(t => /maia-avatar|api\/maia\/arquivo/.test(t)))
confere('os botões abrem o WhatsApp da escola (teste e "colocar rodando")', html.includes('https://wa.me/5551995054548?text=Quero%20testar%20a%20Maia%20como%20cliente%20da%20Doces%20da%20Fabi%20(modo%20teste)') && html.includes('Quero%20colocar%20a%20Maia%20rodando%20na%20Doces%20da%20Fabi'))
confere('a página nova continua contando as aberturas', contato(F.fabi).aberturas === 1)
// sem os campos opcionais: some o "o que vimos", a grade e a logo (vai o nome escrito na cor da marca)
const tj = contato(F.jo).token
html = await (await fetch(`${URL}/maia/amostra/${tj}?previa=1`)).text()
confere('sem "o que vimos", sem grade e sem logo: as seções somem e o nome vai escrito', !html.includes('O que a gente viu') && !html.includes('grade do Instagram') && !html.includes('class="logo"') && /<h1 class="nome [gmp]">Forno do <span>Jo<\/span><\/h1>/.test(html) && html.includes('Tu grava, a Maia monta') && html.includes('O vídeo que a Maia montou'))
confere('os roteiros saem da coleta (rascunho feito na aprovação)', /class="card rot-card r1"/.test(html) && /Pizza de calabresa/i.test(html))

console.log('10) O acompanhamento depois da amostra (relógio simulado)')
const E = Date.parse('2026-11-17T13:00:00Z')   // 10h em Brasília
const roda = async ms => post({ acao: 'rodar_rotina', relogio: new Date(ms).toISOString() })
const fez = (r, tel, passo) => (r.acompanhamento || []).find(x => x.contato === contato(tel).id && (!passo || x.passo === passo))
await pronto(F.gil, 'Gil', 'Forno do Gil')
await post({ acao: 'aprovar', id: contato(F.gil).id, agora: true })
muda(F.gil, x => { x.entregue_em = new Date(E).toISOString(); x.ultima_entrada_em = new Date(E - 3600e3).toISOString() })
r = await roda(E + 2 * 3600e3)
confere('2 h depois da entrega: nada ainda', !fez(r, F.gil), r.acompanhamento)
r = await roda(E + 3 * 3600e3 + 60e3)
let sg = saidas(F.gil).slice(-1)[0]
confere('3 h sem abrir: reenvia o anúncio 1 como imagem', fez(r, F.gil, 'reenvio')?.como === 'texto' && sg.tipo === 'imagem' && sg.texto === 'Fiz esse pra ti. Quer ver o resto e testar?' && sg.midia_id === `lanc-${contato(F.gil).id}/pecas/a1.jpg`, r.acompanhamento)
r = await roda(E + 4 * 3600e3 + 60e3)
confere('não repete o reenvio', !fez(r, F.gil))
const tg = contato(F.gil).token
for (let i = 0; i < 2; i++) await fetch(`${URL}/maia/amostra/${tg}`, { headers: { 'user-agent': 'Mozilla/5.0 (Android)' } })
let lg = (await get('acao=lista')).lista.find(x => x.id === contato(F.gil).id)
confere('abriu 2 vezes: vai pra fila "Rick: mandar áudio" com o que fez', lg.rick_pendente && lg.rick_motivo === 'abriu a amostra' && /abriu 2 vezes/.test(lg.atividade.texto) && /não testou/.test(lg.atividade.texto), lg)
await post({ acao: 'rick_feito', id: contato(F.gil).id })
const A = E + 5 * 3600e3   // o Rick mandou o áudio às 15h
muda(F.gil, x => { x.rick_feito_em = new Date(A).toISOString(); x.ultima_entrada_em = new Date(A + 2 * 3600e3).toISOString() })   // a janela fica aberta (ela abriu a conversa)
r = await roda(A + 19 * 3600e3)
confere('19 h depois do áudio: nada ainda', !fez(r, F.gil), r.acompanhamento)
r = await roda(A + 20 * 3600e3 + 60e3)
sg = saidas(F.gil).slice(-1)[0]
confere('20 h depois do áudio, sem resposta: "O que achou da amostra?" com os 2 botões', fez(r, F.gil, 'pos_audio')?.como === 'texto' && sg.tipo === 'botoes' && /^O que achou da amostra\?/.test(sg.texto) && /\[botões: Quero conversar \| Ficou dúvida\]/.test(sg.texto), r.acompanhamento)
r = await roda(A + 21 * 3600e3)
confere('no mesmo dia não vai pra fila de ligar', !fez(r, F.gil, 'ligar'))
// o Hugo também recebeu o áudio e a pergunta, mas é frio (abriu 1 vez, não testou)
await pronto(F.hugo, 'Hugo', 'Forno do Hugo')
await post({ acao: 'aprovar', id: contato(F.hugo).id, agora: true })
muda(F.hugo, x => { x.entregue_em = new Date(E).toISOString(); x.aberturas = 1; x.aberta_em = new Date(E + 3600e3).toISOString(); x.rick_feito_em = new Date(A).toISOString(); x.estado.acomp = { pos_audio_em: new Date(A + 20 * 3600e3 + 60e3).toISOString() } })
const DIA2 = Date.parse('2026-11-19T11:00:00Z')   // dia seguinte à pergunta, 8h em Brasília
r = await roda(DIA2)
lg = (await get('acao=lista')).lista.find(x => x.id === contato(F.gil).id)
confere('dia seguinte, sem resposta e quente (abriu 2+): fila "Rick: ligar" com o resumo', fez(r, F.gil, 'ligar') && lg.ligar && /abriu 2 vezes/.test(lg.ligar.resumo), r.acompanhamento)
confere('o frio (abriu 1 vez, não testou) não entra na fila de ligar', !fez(r, F.hugo, 'ligar') && !(await get('acao=lista')).lista.find(x => x.id === contato(F.hugo).id).ligar)
confere('o aviso "Rick: ligar" pro Guto não leva o telefone', le('eventos').some(e => e.tipo === 'lanc_aviso' && e.detalhe.titulo === 'Rick: ligar' && /Gil/.test(e.detalhe.texto) && !e.detalhe.texto.includes(F.gil)))
confere('"Liguei" tira da fila', (await post({ acao: 'ligar_feito', id: contato(F.gil).id })).ok && !(await get('acao=lista')).lista.find(x => x.id === contato(F.gil).id).ligar)
r = await roda(E + 3 * 86400e3 + 60e3)
let rg = contato(F.gil).estado.retomada
confere('3 dias: a ideia nova (janela fechada e sem modelo: vai pra "Retomada à mão" com o texto)', fez(r, F.gil, 'ideia')?.como === 'a_mao' && rg.como === 'a_mao' && /tive uma ideia/.test(rg.texto) && /Forno do Gil/.test(rg.texto) && !/R\$|cobr/i.test(rg.texto), rg)
confere('o Hugo (frio) também recebe a ideia no 3º dia', fez(r, F.hugo, 'ideia'))
r = await roda(E + 4 * 86400e3)
confere('não repete a ideia', !fez(r, F.gil))
r = await roda(E + 6 * 86400e3 + 60e3)
rg = contato(F.gil).estado.retomada
confere('6 dias: a despedida educada, com a porta aberta', fez(r, F.gil, 'despedida') && /Tentei falar contigo, entendo a correria/.test(rg.texto) && /fico à disposição/.test(rg.texto) && contato(F.gil).estado.acomp.fim)
r = await roda(E + 8 * 86400e3)
confere('depois da despedida, para', !fez(r, F.gil))
r = await roda(Date.parse('2026-11-18T01:00:00Z'))   // 22h em Brasília
confere('fora das 8h às 21h não manda nada', !(r.acompanhamento || []).length)
// com o modelo aprovado, fora da janela vai o modelo (a ideia leva o nome, o negócio e a ideia)
await post({ acao: 'chave_v2', ligar: true, modelos: { IDEIA: 'maia_lanc_ideia', DESPEDIDA: 'maia_lanc_despedida' } })
muda(F.hugo, x => { x.estado.acomp = { pos_audio_em: x.estado.acomp.pos_audio_em }; x.ultima_entrada_em = new Date(E - 30 * 3600e3).toISOString() })
r = await roda(E + 3 * 86400e3 + 2 * 3600e3)
confere('fora da janela, com modelo: a ideia vai pelo modelo', fez(r, F.hugo, 'ideia')?.como === 'modelo' && /^\[modelo maia_lanc_ideia\] /.test(saidas(F.hugo).slice(-1)[0].texto), saidas(F.hugo).slice(-1)[0])

console.log('11) Resposta interrompe, "Agora não" para, e a entrega fora das 24 h')
await pronto(F.ivo, 'Ivo', 'Forno do Ivo')
await post({ acao: 'aprovar', id: contato(F.ivo).id, agora: true })
muda(F.ivo, x => { x.entregue_em = new Date(E).toISOString() })
r = await diz(F.ivo, 'Bem legal, depois vejo com calma')
let li = (await get('acao=lista')).lista.find(x => x.id === contato(F.ivo).id)
confere('qualquer resposta para a sequência e vai pro time, com o texto', contato(F.ivo).estado.acomp.parado && li.rick_pendente && li.rick_texto === 'Bem legal, depois vejo com calma' && /Vou passar pro time/.test(ultimas(F.ivo)[0]), li)
confere('quem não testou recebe o botão "Testar agora" junto', saidas(F.ivo).slice(-1)[0].tipo === 'botoes' && /Testar agora/.test(saidas(F.ivo).slice(-1)[0].texto))
// 16/11 (Cristina Grossi): mais mensagens depois disso não recebem o mesmo "Valeu! Vou passar pro time" de novo
{ const n0 = saidas(F.ivo).length
  await diz(F.ivo, 'Gostei'); await diz(F.ivo, 'Quero outro video')
  confere('depois do "vou passar pro time", a Maia fica quieta nas próximas mensagens', saidas(F.ivo).length === n0, saidas(F.ivo).slice(n0).map(m => m.texto))
  confere('e o time fica sabendo do que chegou (o texto novo na fila)', contato(F.ivo).estado.rick_texto === 'Quero outro video', contato(F.ivo).estado) }
// 16/11 (Maria): "Ok" depois da amostra não manda o teste e o link de novo
{ const n0 = saidas(F.ivo).length; await diz(F.ivo, 'Ok')
  confere('"Ok" depois da amostra: a Maia não responde', saidas(F.ivo).length === n0, saidas(F.ivo).slice(n0).map(m => m.texto)) }
r = await roda(E + 3 * 3600e3 + 60e3)
const r2 = await roda(E + 3 * 86400e3 + 60e3)
confere('depois de responder, a Maia não manda mais nada da sequência', !fez(r, F.ivo) && !fez(r2, F.ivo))
r = await diz(F.jo, 'Quero conversar')
confere('botão "Quero conversar": Fechamento e fila do Rick', contato(F.jo).etapa === 'fechamento' && (await get('acao=lista')).lista.find(x => x.id === contato(F.jo).id).rick_pendente && /time da escola/.test(ultimas(F.jo)[0]))
r = await diz(F.hugo, 'Ficou dúvida')
confere('botão "Ficou dúvida": pergunta qual e passa pro time', /Me conta qual é a dúvida/.test(ultimas(F.hugo)[0]) && (await get('acao=lista')).lista.find(x => x.id === contato(F.hugo).id).rick_pendente && contato(F.hugo).estado.acomp.parado)
r = await diz(F.hugo, 'Agora não')
confere('"Agora não" para tudo (Perdido)', contato(F.hugo).etapa === 'perdido' && !fez(await roda(E + 6 * 86400e3 + 60e3), F.hugo))
// fora das 24 h: vai o modelo de entrega; quando a pessoa responde, vão as peças, o botão e o link
await post({ acao: 'chave_v2', ligar: true, modelos: { ENTREGA: 'maia_amostra_pronta' } })
await pronto(F.kika, 'Kika', 'Forno da Kika', { janelaFechada: true })
r = await post({ acao: 'aprovar', id: contato(F.kika).id, agora: true })
confere('janela fechada: entrega pelo modelo e guarda o resto', r.entregue === 'modelo' && contato(F.kika).amostra.falta_resto === true && saidas(F.kika).length === 1 && /^\[modelo maia_amostra_pronta\]/.test(saidas(F.kika)[0].texto), r)
await diz(F.kika, 'Oi! Quero ver')
confere('a pessoa respondeu: vão as peças, o botão e o link', saidas(F.kika).slice(1).map(m => m.tipo).join(',') === 'imagem,imagem,botoes,texto' && !contato(F.kika).amostra.falta_resto && !contato(F.kika).estado.acomp?.parado, saidas(F.kika).map(m => m.tipo))
// "sair" fora do teste depois da entrega = descadastro (para tudo)
r = await diz(F.kika, 'SAIR')
confere('"sair" fora do teste para tudo (descadastro)', r.tratado === false && contato(F.kika).etapa === 'perdido')
// ===== 17/11: as correções da análise do 1º dia =====
console.log('11) 17/11: entrega dupla, ajuste, teste que volta, Instagram como material, faixa de preço')
await post({ acao: 'chave_v2', ligar: true, modelos: { ENTREGA: null } })
{ const lu = '55000' + R + '21'
  await pronto(lu, 'Lu', 'Luh Modas')
  const id = contato(lu).id
  await Promise.all([post({ acao: 'aprovar', id, agora: true }), post({ acao: 'aprovar', id, agora: true })])
  const a1 = saidas(lu).filter(m => /anúncio 1/.test(m.texto || ''))
  confere('dois "mandar agora" ao mesmo tempo: a amostra sai UMA vez', a1.length === 1 && le('eventos').filter(e => e.tipo === 'lanc_entregue' && e.detalhe.contato === id).length === 1, saidas(lu).map(m => m.tipo + ': ' + (m.texto || '').slice(0, 30)))
  // ajuste depois da amostra: aviso urgente pro time
  const av0 = le('eventos').filter(e => e.tipo === 'lanc_aviso' && /AJUSTE/.test(e.detalhe.titulo)).length, n0 = saidas(lu).length
  await diz(lu, 'Não gostei da foto do anúncio 2, faltou o meu celular')
  confere('pedido de ajuste: aviso URGENTE pro time e "anotado" uma vez', le('eventos').filter(e => e.tipo === 'lanc_aviso' && /AJUSTE/.test(e.detalhe.titulo)).length === av0 + 1 && /Anotado! Vou passar o ajuste/.test(ultimas(lu)[0]) && saidas(lu).length === n0 + 1 && contato(lu).estado.rick_motivo === 'pediu ajuste na amostra', ultimas(lu, 2))
  await diz(lu, 'Quero outro vídeo também')
  confere('2º ajuste logo depois: não repete o "anotado" nem o aviso (10 min)', saidas(lu).length === n0 + 1 && le('eventos').filter(e => e.tipo === 'lanc_aviso' && /AJUSTE/.test(e.detalhe.titulo)).length === av0 + 1)
  // o teste: dura 2 h; e quem já testou e escreve como cliente volta pro teste sozinho
  await post({ acao: 'devolver', id }); muda(lu, x => { x.estado.acomp = {} })
  await diz(lu, 'Testar agora')
  const ate = Date.parse(contato(lu).estado.teste_ate)
  confere('o modo teste dura 2 h', contato(lu).estado.modo === 'teste' && ate - Date.now() > 110 * 60e3, contato(lu).estado)
  await diz(lu, 'sair')
  const n1 = saidas(lu).length
  await diz(lu, 'Lindas! Precisa de entrada pra encomendar?')
  confere('depois do teste, escreveu como cliente: volta pro teste e a atendente responde', contato(lu).estado.modo === 'teste' && saidas(lu).length === n1 + 1 && !/Maia da escola/.test(ultimas(lu)[0]), ultimas(lu)[0]) }
{ // faixa de preço e Instagram como material
  const pr = '55000' + R + '22'
  await post({ acao: 'adicionar', telefone: pr, nome: 'Pri', remessa: 1 })
  await diz(pr, 'Quero ver', 'botao')
  for (const t of ['Vestidos de festa pra mulheres', 'Estrela', 'Vestido longo e vestido curto']) await diz(pr, t)
  confere('produtos sem preço: pergunta a faixa de preço', /faixa de preço/.test(ultimas(pr)[0]), ultimas(pr)[0])
  await diz(pr, 'De 150 a 600 reais')
  confere('a faixa fica guardada e a conversa segue', contato(pr).coleta.faixa_preco === 'De 150 a 600 reais' && /como o cliente compra/.test(ultimas(pr)[0]), [contato(pr).coleta, ultimas(pr)[0]])
  for (const t of ['Pela loja e entrega, das 9h às 18h', 'Vestido longo', 'Pouca gente me conhece', '@vestidosdapri']) await diz(pr, t)
  confere('chegou nas fotos', /me manda de 3 a 5 fotos/.test(ultimas(pr)[0]), ultimas(pr)[0])
  await diz(pr, 'Pega as fotos do meu Instagram, tem tudo lá')
  const cp = contato(pr)
  confere('"pega do Instagram": vale como material, sem pedir foto de novo', cp.etapa === 'material_recebido' && /@vestidosdapri/.test(cp.coleta.material_instagram) && /Combinado, eu pego as fotos do teu Instagram/.test(ultimas(pr)[0]) && /Material recebido/.test(ultimas(pr)[0]), [cp.etapa, cp.coleta, ultimas(pr)[0]])
  confere('o time é avisado de pegar do Instagram', le('eventos').some(e => e.tipo === 'lanc_aviso' && /material chegou/.test(e.detalhe.titulo) && /Instagram/.test(e.detalhe.texto) && Date.parse(e.criado_em) >= INICIO)) }
{ // "Devolver e responder": o que a pessoa mandou enquanto estava com o time é respondido na hora
  const pr = '55000' + R + '22'
  await post({ acao: 'simular_time', telefone: pr, texto: 'Oi Pri, já estamos montando' })
  const n0 = saidas(pr).length
  await diz(pr, 'Olá'); await diz(pr, 'Quero testar a Maia como cliente da Vestidos da Pri (modo teste)')
  confere('com o time: o pedido de teste fica sem resposta da Maia', saidas(pr).length === n0)
  const rr = await post({ acao: 'devolver', id: contato(pr).id, responder: true })
  confere('"Devolver e responder": a Maia liga o teste que ela pediu', rr.ok && contato(pr).estado.modo === 'teste' && /Modo teste ligado/.test(ultimas(pr)[0]) && saidas(pr).length === n0 + 1, [rr, ultimas(pr)[0]]) }
{ // "onde está o card desse anúncio?" + pedido de teste, devolvidos juntos: manda as peças de novo e liga o teste
  const cg = '55000' + R + '24'
  await pronto(cg, 'Cris', 'Cris Imóveis')
  await post({ acao: 'aprovar', id: contato(cg).id, agora: true })
  await post({ acao: 'simular_time', telefone: cg, texto: 'Oi Cris, editamos o anúncio 2' })
  const n0 = saidas(cg).length
  await diz(cg, 'Onde Está o card desse Amincio'); await diz(cg, 'Quero testar a Maia como cliente da Cris Imóveis (modo teste)')
  await post({ acao: 'devolver', id: contato(cg).id, responder: true })
  const nv = saidas(cg).slice(n0).map(m => m.tipo + ': ' + (m.texto || '').slice(0, 40))
  confere('devolvida com "onde está o card?" e o teste: reenvia as peças e o link, e liga o teste', nv.filter(x => /^imagem/.test(x)).length === 2 && nv.some(x => /Quer ver tudo/.test(x)) && /Modo teste ligado/.test(nv[nv.length - 1]) && contato(cg).estado.modo === 'teste', nv)
  await diz(cg, 'sair')
  const n1 = saidas(cg).length
  await diz(cg, 'Não recebi o vídeo')
  confere('"não recebi o vídeo" depois da amostra: manda as peças de novo', saidas(cg).slice(n1).filter(m => m.tipo === 'imagem').length === 2, saidas(cg).slice(n1).map(m => m.tipo)) }
{ // o time mandou a mesma mensagem 2x (script + caixa): entra uma vez só
  const du = '55000' + R + '23'
  await post({ acao: 'adicionar', telefone: du, nome: 'Du', remessa: 1 })
  await post({ acao: 'simular_time', telefone: du, texto: 'Oi Du, aqui é o Rick' }); await post({ acao: 'simular_time', telefone: du, texto: 'Oi Du, aqui é o Rick' })
  confere('mensagem do time repetida em seguida não duplica na conversa', le('lanc_msgs').filter(m => m.contato_id === contato(du).id && m.autor === 'equipe').length === 1) }
await post({ acao: 'chave_v2', ligar: false, modelos: { ENTREGA: null, IDEIA: null, DESPEDIDA: null } })
confere('desliga a chave no fim (o servidor volta ao comportamento de antes)', (await get('acao=lista')).v2 === false)

console.log(`\n${ok} ok, ${falha} falha(s)`)
process.exit(falha ? 1 : 0)
