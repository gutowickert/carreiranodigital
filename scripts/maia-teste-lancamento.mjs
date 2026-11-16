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
confere('a Maia se apresenta como IA e faz a 1ª pergunta', /Maia/.test(m) && /\bIA\b/.test(m) && /o que tu vende, e pra quem/i.test(m), m)
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
await video(T.ana)
confere('vídeo: pergunta a hora (10h ou 15h)', /10h/.test(ultimas(T.ana)[0]) && /15h/.test(ultimas(T.ana)[0]), ultimas(T.ana)[0])
await diz(T.ana, 'de tarde')
let a = contato(T.ana)
confere('Material recebido, com a hora combinada às 15h', a.etapa === 'material_recebido' && new Date(Date.parse(a.entrega_em) - 3 * 3600e3).getUTCHours() === 15, a)
confere('a Maia confirma a entrega', /Combinado!/.test(ultimas(T.ana)[0]))
confere('guardou 3 fotos e 1 vídeo no armazenamento', le('lanc_midias').filter(x => x.contato_id === a.id && x.origem === 'contato').length === 4 && fs.existsSync(path.join(PASTA, 'arquivos', le('lanc_midias').find(x => x.contato_id === a.id).path)))
confere('aviso pro Guto do material novo (só primeiro nome + negócio)', le('eventos').some(e => e.tipo === 'lanc_aviso' && /material novo/.test(e.detalhe.titulo) && /Ana/.test(e.detalhe.texto) && !e.detalhe.texto.includes(T.ana)))
await diz(T.ana, 'pode ser às 10h então? melhor')
confere('mudou a hora da entrega pra 10h', new Date(Date.parse(contato(T.ana).entrega_em) - 3 * 3600e3).getUTCHours() === 10, ultimas(T.ana)[0])

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
confere('o que não sabe: aprende na implantação', /implantação/.test(ultimas(T.ana)[0]))
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
confere('Duda: sem vídeo também chega na hora', dd.etapa === 'material_recebido' && dd.coleta.sem_video, dd.estado)
// as peças direto no arquivo (o caminho da tela já foi testado) e a aprovação pra hora combinada
let cs = le('lanc_contatos'), d = cs.find(x => x.telefone === T.duda)
d.amostra = { pecas: { anuncio1: { path: `lanc-${d.id}/pecas/a.jpg`, mime: 'image/jpeg' }, anuncio2: { path: `lanc-${d.id}/pecas/b.jpg`, mime: 'image/jpeg' }, video: { path: `lanc-${d.id}/pecas/c.mp4`, mime: 'video/mp4' } } }
grava('lanc_contatos', cs)
r = await post({ acao: 'aprovar', id: d.id })
confere('aprovar na hora combinada: fica agendada', r.agendada && !contato(T.duda).entregue_em, r)
const entregaEm = Date.parse(contato(T.duda).entrega_em)
r = await post({ acao: 'rodar_rotina', relogio: new Date(entregaEm - 2 * 3600e3).toISOString() })
confere('antes da hora não entrega', !contato(T.duda).entregue_em)
// a janela de 24 h da Duda está aberta (ela escreveu agora): na hora combinada entrega
cs = le('lanc_contatos'); d = cs.find(x => x.telefone === T.duda); d.ultima_entrada_em = new Date(entregaEm - 3600e3).toISOString(); grava('lanc_contatos', cs)
r = await post({ acao: 'rodar_rotina', relogio: new Date(entregaEm + 60e3).toISOString() })
confere('na hora combinada a rotina entrega', !!contato(T.duda).entregue_em && contato(T.duda).etapa === 'amostra_entregue', r)
// retomada da coleta: o Beto parou no meio (a última mensagem foi nossa, há 21 h); relógio às 14h de Brasília
const rel = new Date('2026-11-17T17:00:00Z')
cs = le('lanc_contatos'); let b = cs.find(x => x.telefone === T.beto)
b.ultima_entrada_em = new Date(rel - 22 * 3600e3).toISOString(); b.ultima_saida_em = new Date(rel - 21 * 3600e3).toISOString(); grava('lanc_contatos', cs)
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

console.log(`\n${ok} ok, ${falha} falha(s)`)
process.exit(falha ? 1 : 0)
