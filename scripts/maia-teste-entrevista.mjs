// Maia: o teste da ENTREVISTA DE IMPLANTAÇÃO pelo WhatsApp (lib/maia/entrevista.ts, 24/11, pedido do Guto).
// Modo local: o banco da Maia em .maia-teste/entrevista (MAIA_LOCAL=1), a IA, a internet e a transcrição FALSAS (nada sai pra rede),
// telefones 55000 (nunca saem pra Meta). Cobre: lê a internet antes de perguntar, pergunta só o que falta, confirma o achado,
// áudio, "pular" e a lista do que faltou, o acesso ao portfólio (aviso pro Nando), oficina x ótica, fim com resumo, cadastro,
// aviso pra equipe e convite da reunião, retomada só no que faltou, gatilho do pagamento e a chave desligada.
// Uso: node scripts/maia-teste-entrevista.mjs
import fs from 'node:fs'
import path from 'node:path'
import { createJiti } from 'jiti'

const RAIZ = path.resolve(import.meta.dirname, '..')
Object.assign(process.env, { MAIA_LOCAL: '1', MAIA_LOCAL_PASTA: '.maia-teste/entrevista', MAIA_SEM_AVISO: '1', ANTHROPIC_API_KEY: 'teste', DEEPGRAM_API_KEY: 'teste', MAIA_ENTREVISTA_LIGADA: '1' })
delete process.env.MAIA_EMAIL_ACESSO
fs.rmSync(path.join(RAIZ, '.maia-teste/entrevista'), { recursive: true, force: true })
process.chdir(RAIZ)

// ---------- a internet falsa ----------
const lidas = []
globalThis.__maiaEntrevistaFake = {
  async internet(fontes, neg) {
    lidas.push({ fontes, neg: neg.nome })
    if (!fontes.instagram) return {}
    return { instagram: { ok: true, perfil: { nome: neg.nome, bio: 'Seg a sex 8h às 18h · Rua das Flores, 100' } }, google: { ok: true, nota: 4.8, avaliacoes: 120 } }
  },
}
// ---------- a IA falsa: a leitura, a entrevista e a descrição de foto ----------
const pedidos = []
let resposta = null
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url))
  if (u.host === 'api.deepgram.com') return new Response(JSON.stringify({ results: { channels: [{ alternatives: [{ transcript: 'a troca de óleo sai 180 reais e a revisão 350, o que mais sai é revisão' }] }] } }), { status: 200 })
  if (u.host !== 'api.anthropic.com') throw new Error('fetch fora do roteiro: ' + url)
  const corpo = JSON.parse(opts.body)
  const system = Array.isArray(corpo.system) ? corpo.system.map(s => s.text).join('') : String(corpo.system || '')
  const pedido = corpo.messages[0].content.filter(c => c.type === 'text').map(c => c.text).join('')
  let txt
  if (/Você lê o que foi achado/.test(system)) {
    pedidos.push({ tipo: 'leitura', system, pedido })
    txt = JSON.stringify({ campos: { 'ficha.horario': { valor: 'segunda a sexta, das 8h às 18h', fonte: 'Instagram' }, 'ficha.endereco': { valor: 'Rua das Flores, 100', fonte: 'Instagram' }, 'contas.page_id': { valor: '123', fonte: 'x' } }, resumo: 'Perfil comercial com horário e endereço na bio; 4,8 no Google.' })
  } else if (/ENTREVISTA DA IMPLANTAÇÃO/.test(system)) {
    pedidos.push({ tipo: 'turno', system, pedido })
    txt = JSON.stringify(resposta || { mensagens: ['Oi! Vamos lá.'], campos: {}, confirmados: [], pulou: false, bloco_completo: false })
  } else txt = JSON.stringify({ descricao: 'fachada da oficina, foto nítida, serve pra anúncio' })
  return new Response(JSON.stringify({ content: [{ type: 'text', text: txt }], usage: { input_tokens: 10, output_tokens: 10 } }), { status: 200, headers: { 'content-type': 'application/json' } })
}

let ok = 0, n = 0
const confere = (x, m, extra) => { n++; if (x) ok++; console.log((x ? '  ✔ ' : '  ✘ ') + m + (x || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 400))) }
const jiti = createJiti(import.meta.url, { alias: { '@': RAIZ }, interopDefault: true, moduleCache: true })
const { maiaDb: db } = await jiti.import(path.join(RAIZ, 'lib/maia/db.ts'))
const E = await jiti.import(path.join(RAIZ, 'lib/maia/entrevista.ts'))
const D = await jiti.import(path.join(RAIZ, 'lib/maia/dono.ts'))
const C = await jiti.import(path.join(RAIZ, 'lib/maia/canal.ts'))

const neg = async (id) => db.um('negocios', { id })
const ent = async (id) => (await neg(id)).meta.entrevista
const saidas = async (cv) => (await db.lista('msgs', { conversa_id: cv.id }, { ordem: 'criado_em' })).filter(m => m.autor === 'maia').map(m => m.texto)
const avisos = async () => (await db.lista('eventos', {})).filter(e => e.tipo === 'aviso_equipe').map(e => e.detalhe.titulo + ' | ' + e.detalhe.texto)
async function diz(N, texto, r) {
  resposta = r || null
  const cv = await C.conversaDoDono(await neg(N.id))
  await db.insere('msgs', { conversa_id: cv.id, negocio_id: N.id, autor: 'dono', tipo: 'texto', texto, status: 'recebido' })
  await db.atualiza('conversas', { id: cv.id }, { janela_ate: new Date(Date.now() + 86400e3).toISOString() })
  return D.respondeDono(cv.id)
}
const ultTurno = () => pedidos.filter(p => p.tipo === 'turno').slice(-1)[0]

console.log('Maia · teste da entrevista de implantação (modo local, IA/internet falsas)')

// ========== OFICINA ==========
console.log('\n=== Começa lendo a internet (oficina, pelo painel)')
const of = await db.insere('negocios', { nome: 'Auto Center Silva', nicho: 'oficina mecânica', cidade: 'Campinas', dono_nome: 'Carlos', dono_whatsapp: '5500019991110001', status: 'implantacao', plano: 'completa', meta: {} })
let r = await E.comecaEntrevista(of.id, { instagram: '@autocentersilva', por: 'teste' })
let e = await ent(of.id)
const abertura = ultTurno()
confere(r.ok && e.status === 'andando' && lidas.length === 1 && lidas[0].fontes.instagram === 'autocentersilva', 'leu a internet (Instagram) ANTES da 1ª pergunta', { r, lidas })
confere(e.achados['ficha.horario']?.valor === 'segunda a sexta, das 8h às 18h' && e.achados['ficha.endereco'] && !e.achados['contas.page_id'], 'o que achou vira "a confirmar" (horário, endereço); campo técnico achado é descartado', e.achados)
confere(/ficha\.horario[^\n]*ACHOU NA INTERNET \(Instagram\), CONFIRMAR/.test(abertura.pedido) && /negocio\.regiao[^\n]*FALTA/.test(abertura.pedido) && /negocio\.nome[^\n]*JÁ SABE/.test(abertura.pedido) && /negocio\.cidade[^\n]*JÁ SABE/.test(abertura.pedido), 'a IA recebe: o que já sabe (nome, cidade), o que achou (confirmar) e o que FALTA (região): só pergunta o que falta', abertura.pedido.slice(0, 900))
confere(/PRIMEIRA MENSAGEM DA ENTREVISTA/.test(abertura.pedido) && /pular/.test(abertura.pedido) && /já deu uma olhada no Instagram/.test(abertura.pedido), 'abertura: explica o "pular", o áudio e que já olhou o Instagram')
confere(/NUNCA pergunte coisa técnica/.test(abertura.system) && !/contas\.page_id|ad_account/.test(abertura.pedido) && /debairros@hotmail\.com/.test(abertura.system), 'nada técnico é perguntado (IDs/conta de anúncio não aparecem); o passo a passo do acesso usa o e-mail do Nando')
const cvOf = await C.conversaDoDono(await neg(of.id))
confere((await saidas(cvOf)).length === 1, 'mandou a 1ª mensagem pro dono')

console.log('\n=== Confirma o achado e responde o que falta')
r = await diz(of, 'Isso, horário e endereço certos. Atendo Campinas, Valinhos e Vinhedo', { mensagens: ['Perfeito, anotado.', 'Agora: o que vocês mais fazem aí?'], campos: { 'negocio.regiao': 'Campinas, Valinhos e Vinhedo', 'contas.page_id': '999', 'ficha.mais_vendido': 'revisão (falou junto)' }, confirmados: ['ficha.horario', 'ficha.endereco'], bloco_completo: true })
e = await ent(of.id)
confere(e.respostas['ficha.horario'] === 'segunda a sexta, das 8h às 18h' && e.respostas['negocio.regiao'] && !e.achados['ficha.horario'] && e.blocos[e.bloco] === 'vende', 'confirmou: o achado vira resposta, a região entra, segue pro bloco "O que vende"', { bloco: e.blocos[e.bloco], resp: e.respostas })
confere(!e.respostas['contas.page_id'] && e.respostas['ficha.mais_vendido'] === 'revisão (falou junto)', 'o que ele falou de outro bloco já fica guardado; campo técnico que a IA mandou não entra')

console.log('\n=== Áudio')
await db.atualiza('conversas', { id: cvOf.id }, { janela_ate: new Date(Date.now() + 86400e3).toISOString() })
const rec = await D.recebeDoDono(await neg(of.id), { id: 'wamid.audio1', type: 'audio', audio: { id: 'x' } }, 'Carlos', { buf: Buffer.from('ogg'), mime: 'audio/ogg' })
resposta = { mensagens: ['Anotei: troca de óleo R$ 180 e revisão R$ 350.', 'Agora umas coisas da oficina: com que carros vocês trabalham?'], campos: { 'ficha.preco': 'Troca de óleo: R$ 180. Revisão: R$ 350', 'ficha.mais_vendido': 'revisão', 'ficha.produto': 'mecânica geral e revisão' }, confirmados: [], bloco_completo: true }
r = await D.respondeDono(rec.cv.id)
e = await ent(of.id)
confere(/\(áudio\) a troca de óleo sai 180/.test(rec.texto) && /DONO: \(áudio\) a troca de óleo/.test(ultTurno().pedido), 'o áudio chega transcrito e a IA lê a transcrição', rec.texto)
confere(e.respostas['ficha.preco'] && e.blocos[e.bloco] === 'oficina', 'o áudio preencheu os preços e foi pro bloco da oficina', e.blocos[e.bloco])

console.log('\n=== Foto vira material do negócio')
const recF = await D.recebeDoDono(await neg(of.id), { id: 'wamid.foto1', type: 'image', image: { id: 'y' } }, 'Carlos', { buf: Buffer.from('jpg'), mime: 'image/jpeg' })
confere((await db.lista('midias', { negocio_id: of.id })).length === 1 && /mandou uma foto: fachada/.test(recF.texto), 'a foto mandada na entrevista fica guardada como material (aba Arquivos)')
confere(/oficina\.servicos/.test(ultTurno().pedido) && /oficina\.leva_traz/.test(ultTurno().pedido) && /oficina\.preco_fixo/.test(ultTurno().pedido) && !/otica\./.test(ultTurno().pedido), 'oficina: perguntas de serviços, preço fixo x diagnóstico, garantia, guincho/leva e traz (nada de ótica)')

console.log('\n=== Pular')
const nPed = pedidos.length
r = await diz(of, 'Mecânica geral e freio. Atendo tudo nacional.', { mensagens: ['Anotado.', 'E garantia, quanto tempo vocês dão?'], campos: { 'oficina.servicos': 'mecânica geral e freio', 'oficina.marcas': 'carros nacionais' } })
r = await diz(of, 'pular', { mensagens: ['Tudo bem, anotei pra depois.', 'Vocês têm guincho ou leva e traz?'], campos: {}, pulados: ['oficina.garantia'] })
e = await ent(of.id)
confere(e.pulados.some(p => p.bloco === 'oficina' && p.campos.includes('oficina.garantia') && !p.campos.includes('oficina.leva_traz')) && e.blocos[e.bloco] === 'oficina', '"pular": pula SÓ aquela pergunta (garantia), salva e segue na próxima do mesmo bloco', e.pulados)
confere(/ELE PEDIU PRA PULAR a última pergunta/.test(ultTurno().pedido),'a IA é avisada que ele pediu pra pular (pra não insistir)')
r = await diz(of, 'depois eu vejo', { mensagens: ['Tranquilo.', 'O que tem preço fixo aí?'], campos: {} })
e = await ent(of.id)
confere(e.pulados.find(p => p.bloco === 'oficina').campos.includes('oficina.preco_fixo') && /oficina\.garantia[^\n]*ele pulou antes \(não insista\)/.test(ultTurno().pedido), '"depois" sem a IA dizer o quê: o código marca a 1ª pergunta que faltava (preço fixo); a garantia pulada chega pra IA como "não insista"', e.pulados)
r = await diz(of, 'pula essa parte toda da oficina', { mensagens: ['Tudo bem, anotei pra depois.', 'Quem é o cliente que mais compra de você?'], campos: {}, pulou: true })
e = await ent(of.id)
confere(e.pulados.find(p => p.bloco === 'oficina').campos.includes('oficina.leva_traz') && e.blocos[e.bloco] === 'cliente' && e.respostas['oficina.servicos'], 'pular o assunto inteiro: o resto do bloco fica faltando, o que já respondeu fica, segue pro próximo bloco')
r = await diz(of, 'Isso eu não tenho agora', { mensagens: ['Sem problema, fica pra depois.', 'Agora: como é a conversa até fechar um serviço?'], campos: { 'ficha.publico': 'dono de carro de 5 a 15 anos' }, confirmados: [], pulou: true })
e = await ent(of.id)
confere(e.respostas['ficha.publico'] && e.pulados.some(p => p.bloco === 'cliente' && p.campos.includes('ficha.diferencial') && !p.campos.includes('ficha.publico')) && e.blocos[e.bloco] === 'venda', 'pulo com outras palavras (a IA marca pulou): guarda o que respondeu, só o resto fica faltando')

console.log('\n=== Os outros blocos e o acesso ao portfólio')
r = await diz(of, 'O cliente chama, peço o carro, faço o orçamento e ele aprova. Pix, cartão em 3x. Desconto não dou.', { mensagens: ['Entendi.', 'Agora os números: quanto é uma venda média?'], campos: { 'funil.etapas': [{ etapa: 'chamou', proximo_passo: 'pedir modelo e ano' }, { etapa: 'orçamento', proximo_passo: 'marcar o horário' }], 'funil.sim': 'aprovou o orçamento e trouxe o carro', 'ficha.pagamento': 'Pix e cartão em até 3x', 'ficha.prazo': 'revisão no mesmo dia', 'limites.desconto_maximo': 'sem desconto', 'limites.nunca_prometer': 'prazo de peça importada', 'limites.passar_pro_dono': 'reclamação e orçamento acima de R$ 3 mil' }, bloco_completo: true })
r = await diz(of, 'Média 900, sobra uns 40%. Fecha em 2 dias. Anuncia revisão, raio de 10 km. Posso 30 por dia', { mensagens: ['Ótimo.', 'Os clientes: você ou tu?'], campos: { 'trafego.ticket_medio': 900, 'trafego.margem_por_venda': '40%', 'trafego.ciclo_venda_dias': 2, 'trafego.servico_foco': 'revisão', 'trafego.raio': '10 km', 'negocio.verba_dia': 30 }, bloco_completo: true })
r = await diz(of, 'Você. Leve. Não apareço, voz por cima. Pode mostrar serviço, sem placa de cliente. Eu aprovo, de noite.', { mensagens: ['Certo.', 'Agora manda umas fotos e vídeos reais?'], campos: { 'atendimento.tom.pessoa': 'você', 'atendimento.tom.estilo': 'leve', 'material.aparece': 'voz por cima', 'conteudo.temas': 'serviço feito; nunca placa de cliente', 'dono.aprovacao': 'ele mesmo, de noite' }, bloco_completo: true })
r = await diz(of, 'Mandei as fotos', { mensagens: ['Recebi!', 'Último passo: o acesso ao portfólio da empresa. Você tem o business.facebook.com?'], campos: { 'material.fotos': 'mandou 1 foto da fachada' }, bloco_completo: true })
e = await ent(of.id)
confere(e.blocos[e.bloco] === 'acesso' && /Acesso ao portfólio/.test(ultTurno().pedido) && /business\.facebook\.com/.test(ultTurno().system) && /Configurações/.test(ultTurno().system) && /ACESSO TOTAL \(administrador\)/.test(ultTurno().system) && /business\.facebook\.com\/overview/.test(ultTurno().system) && /mais de um portfólio/.test(ultTurno().system), 'bloco do acesso: passo a passo (Configurações > Pessoas > Adicionar > e-mail > acesso total), plano B sem portfólio e qual escolher se tiver mais de um')
r = await diz(of, 'Pronto, mandei o convite no portfólio Auto Center Silva', { mensagens: ['Recebi, obrigada! A equipe aceita do lado de cá.', 'Já te mando o resumo.'], campos: { 'contas.portfolio': 'Auto Center Silva' }, acesso_enviado: true, bloco_completo: true })
e = await ent(of.id)
const av1 = await avisos()
confere(e.acesso?.enviado && e.acesso.email === 'debairros@hotmail.com' && av1.some(a => /Nando: aceitar o convite do portfólio de Auto Center Silva/.test(a) && /debairros@hotmail\.com/.test(a)), 'mandou o convite: a Maia confirma e o Nando é avisado pra aceitar', av1.slice(-2))

console.log('\n=== Resumo, cadastro, aviso e reunião')
const s1 = await saidas(cvOf)
confere(e.status === 'resumo' && s1.some(t => /resumo do que eu entendi/.test(t)) && s1.some(t => /Ficou faltando/.test(t) && /garantia/.test(t) && /por que os clientes escolhem/.test(t)) && s1.some(t => /Tá tudo certo\?/.test(t)), 'no fim: o resumo pra conferir e a lista do que ficou faltando (o que pulou)', s1.slice(-4))
r = await diz(of, 'Na verdade a revisão é 380', { mensagens: ['Corrigido: revisão R$ 380.'], campos: { 'ficha.preco': 'Troca de óleo: R$ 180. Revisão: R$ 380' } })
e = await ent(of.id)
confere(e.status === 'resumo' && /380/.test(e.respostas['ficha.preco']) && (await saidas(cvOf)).slice(-6).some(t => /Revisão: R\$ 380/.test(t)), 'correção no resumo: muda o campo e manda o resumo de novo')
r = await diz(of, 'Sim, tudo certo')
e = await ent(of.id)
const cad = e.cadastro
const av2 = await avisos()
confere(e.status === 'reuniao' && cad && cad.negocio.nome === 'Auto Center Silva' && cad.ficha.horario === 'segunda a sexta, das 8h às 18h' && cad.funil.etapas.length === 2 && cad.trafego.margem_por_venda === 360 && cad.trafego.cpa_meta === 54 && cad.trafego.servico_foco === 'revisão' && cad.atendimento.tom.pessoa === 'voce', 'confirmou: o cadastro sai no formato do cadastro.json (margem 40% de 900 = 360; meta por cliente 15% = R$ 54)', cad)
confere(cad.a_confirmar.some(x => x.campo === 'oficina.garantia' && x.por === 'pulou na entrevista') && cad.a_confirmar.some(x => x.campo === 'contas.page_id' && x.quem === 'equipe') && cad.contas.acesso_admin.email === 'debairros@hotmail.com' && !(cad.ficha.perguntas || []).some(p => /garantia/i.test(p.pergunta)), 'o que pulou vai pro a_confirmar (dono); as contas pra reunião (equipe); o acesso enviado fica registrado')
confere(av2.some(a => /entrevista da implantação pronta: Auto Center Silva/.test(a) && /FALTA: .*garantia/.test(a)) && (await saidas(cvOf)).slice(-1)[0].match(/reunião por vídeo .*ligar as contas.*manhã ou tarde/), 'aviso pra equipe com o resumo e o que falta; convite pra reunião de contas', av2.slice(-1))
r = await diz(of, 'Terça de manhã')
e = await ent(of.id)
confere(e.status === 'feita' && e.reuniao_preferencia === 'Terça de manhã' && e.cadastro.combinados.reuniao_contas === 'Terça de manhã' && (await avisos()).some(a => /marcar a reunião de contas: Auto Center Silva/.test(a)), 'ele diz o período: anotado e a equipe é avisada pra marcar')
const P = E.painelEntrevista(await neg(of.id))
confere(P.tem && P.status === 'feita' && P.faltando.some(f => /garantia/.test(f)) && P.blocos.find(b => b.id === 'oficina').pulou && P.email_acesso === 'debairros@hotmail.com' && P.fica_pra_reuniao.length >= 4, 'painel: status, blocos, o que falta, o acesso e o que fica pra reunião', P)
const ctx = E.contextoDoCadastro(cad)
confere(ctx.preco && ctx.funil?.sim && ctx.limites?.desconto_maximo === 'sem desconto' && ctx.trafego?.cpa_meta === 54 && ctx.conteudo?.temas && ctx.aprovacao_dono, 'o cadastro vira o contexto do negócio (os mesmos campos do importar.mjs), pra equipe aplicar depois de revisar')

console.log('\n=== Retomada só no que faltou')
const nAntes = pedidos.length
r = await diz(of, 'oi, quero completar o que faltou', { mensagens: ['Vamos completar então! Sobre a oficina: tem garantia?'], campos: {} })
e = await ent(of.id)
confere(r?.ok && e.status === 'andando' && e.retomando && e.blocos[0] === 'oficina' && !e.blocos.includes('negocio') && !e.blocos.includes('numeros') && pedidos.length === nAntes + 1 && /ESTA É A RETOMADA/.test(ultTurno().pedido), 'retomada: só os blocos com falta (oficina, cliente...), sem repetir o resto', e.blocos)

// ========== ÓTICA ==========
console.log('\n=== Ótica (sem Instagram: pede e lê quando ele manda)')
const ot = await db.insere('negocios', { nome: 'Ótica Visão', nicho: 'Ótica', cidade: 'Natal', dono_whatsapp: '5500084991110002', status: 'implantacao', plano: 'completa', meta: { implantacao: 'online' } })
r = await E.comecaEntrevista(ot.id, {})
e = await ent(ot.id)
confere(e.nicho === 'otica' && e.blocos.includes('otica') && !e.blocos.includes('oficina') && Object.keys(e.achados).length === 0, 'ótica: o bloco da ótica entra e o da oficina não; sem @ não achou nada', e.blocos)
r = await diz(ot, 'meu insta é @oticavisaonatal', { mensagens: ['Achei! Vi que vocês abrem seg a sex das 8h às 18h, tá certo?'], campos: {} })
e = await ent(ot.id)
confere(e.fontes.instagram === 'oticavisaonatal' && lidas.some(l => l.fontes.instagram === 'oticavisaonatal') && e.achados['ficha.horario'] && /ACHOU NA INTERNET/.test(ultTurno().pedido), 'mandou o @ na conversa: ela lê o Instagram na hora e confirma em vez de perguntar')
e.bloco = e.blocos.indexOf('otica'); await db.atualiza('negocios', { id: ot.id }, { meta: { ...(await neg(ot.id)).meta, entrevista: e } })
r = await diz(ot, 'ok', { mensagens: ['Vocês aceitam receita de fora?'], campos: {} })
confere(/otica\.receita/.test(ultTurno().pedido) && /otica\.exame/.test(ultTurno().pedido) && /otica\.prazo/.test(ultTurno().pedido) && /otica\.crediario/.test(ultTurno().pedido) && /otica\.lentes/.test(ultTurno().pedido) && /otica\.armacoes/.test(ultTurno().pedido), 'ótica: lentes/marcas, receita, exame com parceiro, prazo, armação e crediário')

// ========== gatilhos e chave ==========
console.log('\n=== Pagamento, RS e chave')
const sp = await db.insere('negocios', { nome: 'Oficina SP', nicho: 'oficina', cidade: 'Santos', dono_whatsapp: '5513991110003', status: 'implantacao', plano: 'completa', meta: {} })
const rs = await db.insere('negocios', { nome: 'Oficina RS', nicho: 'oficina', cidade: 'Lajeado', dono_whatsapp: '5551991110004', status: 'implantacao', plano: 'completa', meta: {} })
await db.atualiza('negocios', { id: sp.id }, { dono_whatsapp: '5500013991110003' })   // simulado (não sai pra Meta), DDD 13
confere(E.ehOnline({ dono_whatsapp: '5513991110003' }) && !E.ehOnline({ dono_whatsapp: '5551991110004' }) && E.ehOnline({ dono_whatsapp: '5551991110004', meta: { implantacao: 'online' } }), 'oferta online = fora do RS pelo DDD (ou marcado online no negócio)')
r = await E.aoPagarImplantacao({ ...(await neg(rs.id)) })
confere(r === null && !(await ent(rs.id)), 'pagou a implantação, é do RS (presencial): não começa a entrevista')
r = await E.aoPagarImplantacao({ ...(await neg(sp.id)), dono_whatsapp: '5513991110003' })
confere(r?.ok && (await ent(sp.id))?.por === 'pagamento', 'pagou a implantação, fora do RS: a entrevista começa sozinha', r)
{ const x = await neg(sp.id); await db.atualiza('negocios', { id: sp.id }, { meta: { ...x.meta, entrevista: { ...x.meta.entrevista, status: 'feita', pulados: [{ bloco: 'acesso', campos: ['contas.acesso_enviado'], em: 'x' }], faltando: ['contas.acesso_enviado'] } } }) }
const nP2 = pedidos.length
r = await diz(sp, 'oi Maia, já mandei o convite lá no portfólio')
e = await ent(sp.id)
confere(r?.acesso && e.acesso?.enviado && !e.faltando.includes('contas.acesso_enviado') && pedidos.length === nP2 && (await avisos()).some(a => /Nando: aceitar o convite do portfólio de Oficina SP/.test(a)), 'mandou o convite DEPOIS da entrevista: registra sem IA, tira da lista do que falta e avisa o Nando')
confere(E.pedePular('Pular') && E.pedePular('(áudio) não sei') && E.pedePular('depois eu vejo') && !E.pedePular('pode anunciar revisão'), '"pular", "não sei" (até por áudio) e "depois" contam como pular')
confere(E.fontesDoTexto('meu site é www.oticavisao.com.br e o insta @oticavisao').site === 'www.oticavisao.com.br' && E.fontesDoTexto('instagram.com/autosilva').instagram === 'autosilva', 'acha o @ e o site no meio da mensagem')
process.env.MAIA_ENTREVISTA_LIGADA = ''
confere((await E.atendeEntrevista(await neg(ot.id), await C.conversaDoDono(await neg(ot.id)))) === null && (await E.comecaEntrevista(rs.id)).ok === false, 'sem MAIA_ENTREVISTA_LIGADA=1: não começa e não conduz (a conversa de sempre segue)')

console.log(`\n${ok}/${n} ok`)
process.exit(ok === n ? 0 : 1)
