// Maia: o ENSAIO GERAL (14/11). Um cliente inventado (uma marcenaria de Lajeado) passa pela vida inteira, na ordem real:
// cadastro da implantação (e a cobrança da implantação, paga) → pauta de material da implantação → o dono manda fotos e vídeos
// (pelo WhatsApp e pelo painel) → anúncios gerados (oficina simulada) → equipe aprova, dono aprova (painel e 👍) → campanha
// (Meta simulada) → clientes conversam e uma venda é contada (botão "Fechou" da pergunta das 18h) → análise de 2 em 2 dias
// (decide: pausa, sobe 30% e testa anúncio novo) → pauta do dia 1 (o dono manda, o lote do dia 4 não avisa ninguém) →
// relatório do mês → mensalidade vencida (aviso à equipe no dia seguinte, uma vez só) e paga (baixa) → pauta do dia 12
// (o dono não manda: a equipe é avisada no dia 15, uma vez).
// A passagem do tempo: a rotina de hora em hora roda com o `relogio` do modo local (o dia e a hora simulados) e, onde o
// código compara com a hora real de gravação, o teste mexe nas datas dos registros no arquivo do modo local.
//
// MODO LOCAL, SEM IA DE VERDADE, nada sai do computador: o servidor sobe com scripts/maia-ensaio-rede.mjs, que recusa toda
// saída pra internet e SIMULA a IA (só os anúncios, as conversas e os textos curtos; o resto recebe "IA fora do ar").
// Telefones de teste começam com 55000.
//
// Servidor (pasta limpa):
//   rm -rf .maia-teste/ensaio
//   MAIA_LOCAL=1 MAIA_LOCAL_PASTA=.maia-teste/ensaio MAIA_PAINEL_SENHA=teste123 MAIA_SEM_AVISO=1 MAIA_SEM_IA_MIDIA=1 \
//   MAIA_OFICINA_CHAVE=oficina123 MAIA_CONECTAR_SEGREDO=seg123 MAIA_GESTORA_META_PASTA=.maia-teste/ensaio/meta MAIA_APRENDE_SEM_IA=1 MAIA_CLIENTES_LIGADO=1 \
//   ANTHROPIC_API_KEY=ia-falsa NODE_OPTIONS=--import=./scripts/maia-ensaio-rede.mjs npx next dev --webpack -p 3230
// Teste:
//   node scripts/maia-teste-ensaio.mjs http://localhost:3230 teste123 .maia-teste/ensaio
import fs from 'node:fs'
import path from 'node:path'

const [URL_ = 'http://localhost:3230', SENHA = 'teste123', PASTA = '.maia-teste/ensaio'] = process.argv.slice(2)
const OFICINA = process.env.MAIA_OFICINA_CHAVE || 'oficina123'
let ok = 0, falha = 0
const confere = (nome, cond, extra = '') => { if (cond) { ok++; console.log('  ✔', nome) } else { falha++; console.log('  ✘', nome, extra ? '→ ' + String(extra).slice(0, 400) : '') } }
const etapa = (t) => console.log('\n' + t)

// ── a API da equipe (com senha), o painel do dono (com o token do link) e o arquivo do modo local
async function op(acao, corpo = {}) {
  const r = await fetch(URL_ + '/api/maia/operacao', { method: 'POST', headers: { 'x-senha': SENHA, 'content-type': 'application/json' }, body: JSON.stringify({ acao, por: 'ensaio', ...corpo }) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(acao + ': ' + (j.erro || r.status))
  return j
}
const opErro = async (acao, corpo) => { try { await op(acao, corpo); return null } catch (e) { return e.message } }
async function ver(acao, q = {}) {
  const r = await fetch(URL_ + '/api/maia/operacao?' + new URLSearchParams({ acao, ...q }), { headers: { 'x-senha': SENHA } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(acao + ': ' + (j.erro || r.status))
  return j
}
let TOKEN = ''
async function painel(corpo) {
  const r = await fetch(URL_ + '/api/maia/painel', { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'maia_dono=' + encodeURIComponent(TOKEN), 'x-maia-painel': '1', 'x-real-ip': '10.9.9.9' }, body: JSON.stringify(corpo) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error('painel ' + corpo.acao + ': ' + (j.erro || r.status))
  return j
}
const arq = tab => path.join(PASTA, tab + '.json')
const le = tab => { try { return JSON.parse(fs.readFileSync(arq(tab), 'utf8')) } catch { return [] } }
const grava = (tab, l) => fs.writeFileSync(arq(tab), JSON.stringify(l, null, 1))
const mexe = (tab, filtro, campos) => { const l = le(tab); let n = 0; for (const x of l) if (filtro(x)) { Object.assign(x, campos); n++ } grava(tab, l); return n }
const rodar = (relogio, extra = {}) => op('rodar_rotina', { relogio: relogio.toISOString(), ...extra })

// ── o calendário (horário de Brasília)
const D = 86400e3
const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)
const mais = (data, n) => new Date(Date.parse(data + 'T12:00:00Z') + n * D).toISOString().slice(0, 10)
const as = (data, h, min = 0) => new Date(Date.parse(data + 'T00:00:00-03:00') + h * 3600e3 + min * 60e3)
const semana = (data) => new Date(data + 'T12:00:00Z').getUTCDay()
const pad = n => String(n).padStart(2, '0')
const [ano0, mes0] = hoje.split('-').map(Number)
const M = mes0 === 12 ? `${ano0 + 1}-01` : `${ano0}-${pad(mes0 + 1)}`   // o mês que vem
const diaM = n => `${M}-${pad(n)}`
const mesDeHoje = hoje.slice(0, 7)
// dia de análise: não é segunda (tem o resumo da semana), nem do dia 1 ao 8 (aviso e relatório do mês) e o negócio abre (seg a sáb)
const podeAnalise = (data) => semana(data) !== 1 && semana(data) !== 0 && Number(data.slice(8, 10)) > 8
const proximoDiaDeAnalise = (depois) => { let d = mais(depois, 1); while (!podeAnalise(d)) d = mais(d, 1); return d }

// ── arquivos de mentira (o conteúdo não importa: a descrição vem do nome, MAIA_SEM_IA_MIDIA=1)
const JPG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64')
const MP4 = Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0, 0, 0, 0])
const b64 = b => b.toString('base64')

// a oficina "de mentira" (a mesma ideia do maia-teste.mjs): devolve a própria foto do dono como arte; a imagem da análise vira um JPG
async function oficinaFalsa() {
  let n = 0
  for (let i = 0; i < 30; i++) {
    const r = await fetch(URL_ + '/api/maia/oficina', { headers: { 'x-chave': OFICINA } }).then(r => r.json())
    if (!r.tarefa) break
    const buf = r.midia?.url ? Buffer.from(await fetch(URL_ + r.midia.url).then(x => x.arrayBuffer())) : JPG
    await fetch(URL_ + '/api/maia/oficina', { method: 'POST', headers: { 'x-chave': OFICINA, 'content-type': 'application/json' }, body: JSON.stringify({ tarefa_id: r.tarefa.id, arquivo_b64: b64(buf), mime: r.tarefa.tipo === 'video' ? 'video/mp4' : 'image/jpeg' }) })
    n++
  }
  return n
}
const avisosEquipe = (negId, re) => le('eventos').filter(e => e.tipo === 'aviso_equipe' && e.negocio_id === negId && (!re || re.test(`${e.detalhe?.titulo || ''} ${e.detalhe?.texto || ''}`)))
const msgsDoDono = (negId) => { const cv = le('conversas').find(c => c.negocio_id === negId && c.canal === 'dono'); return cv ? le('msgs').filter(m => m.conversa_id === cv.id) : [] }
const daMaiaProDono = (negId) => msgsDoDono(negId).filter(m => m.autor === 'maia')
const rede = () => { try { return fs.readFileSync(path.join(PASTA, 'ensaio-rede.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) } catch { return [] } }

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('Maia · ENSAIO GERAL em ' + URL_ + ' (pasta ' + PASTA + ') · hoje ' + hoje + ' · mês que vem ' + M)
const res = await ver('resumo')
if (res.modo !== 'local') { console.log('o sistema NÃO está em modo local: ensaio cancelado'); process.exit(2) }
if (res.meta_real) { console.log('Meta real ligada: ensaio cancelado'); process.exit(2) }
confere('modo local, Meta simulada', true)
const RUN = String(Date.now()).slice(-5)

// ─────────────────────────────── 1) a implantação: o cadastro e a cobrança da implantação
etapa('1) Implantação: cadastro e cobrança da implantação (R$ 497)')
const CONTEXTO = {
  produto: 'Tábuas de churrasco e bandejas de madeira, personalizadas com nome ou logo', preco: 'Tábua de churrasco personalizada: R$ 180. Bandeja: R$ 120',
  mais_vendido: 'Tábua de churrasco personalizada', publico: 'Quem procura um presente que dura ou quer deixar o churrasco mais bonito',
  pagamento: 'Pix ou cartão em até 3x', pix: 'CNPJ 00.000.000/0001-00', endereco: 'Rua das Acácias, 200, Centro, Lajeado',
  horario: 'segunda a sábado, das 9h às 18h', frete: 'Lajeado: grátis. Região: R$ 15. Retirada na loja sem custo', prazo: 'Pronta em 5 dias úteis',
  whatsapp: '550005199990' + RUN.slice(-3),
  funil: { sim: 'Pagou o Pix ou o cartão', etapas: [{ etapa: 'chegou', proximo_passo: 'Perguntar pra quem é e o nome que vai na peça' }, { etapa: 'orcamento', proximo_passo: 'Mandar o valor com o frete' }, { etapa: 'pagou', proximo_passo: 'Confirmar o prazo de entrega' }] },
  limites: { desconto_maximo: 'Até 5% no Pix', faixa_preco: 'Pode dizer os preços da tabela', nunca_prometer: 'Entrega antes de 5 dias úteis', passar_pro_dono: 'Pedido de empresa ou acima de 10 peças; reclamação' },
  trafego: { cpa_meta: 60, ciclo_venda_dias: 7 },
  implantacao: { ligar_ate: mais(hoje, 2) },
}
const neg = await op('criar_negocio', { nome: 'Marcenaria Pinheiro (ensaio)', nicho: 'marcenaria', cidade: 'Lajeado', dono_nome: 'Paulo Pinheiro', dono_whatsapp: '550009' + RUN, verba_dia: 30, meta: { ad_account_id: 'act_ensaio' + RUN, page_id: 'pg_ensaio' + RUN }, contexto: CONTEXTO })
let n0 = await ver('negocio', { id: neg.id })
confere('negócio criado, em implantação e no plano único', n0.status === 'implantacao' && n0.plano === 'completa', JSON.stringify({ st: n0.status, plano: n0.plano }))
confere('a ficha da implantação ficou guardada (funil, limites, tráfego)', n0.contexto?.funil?.etapas?.length === 3 && n0.contexto?.limites?.desconto_maximo && n0.contexto?.trafego?.cpa_meta === 60)
const faltaAntes = await ver('falta_ligar', { negocio: neg.id })
confere('"o que falta pra ligar" mostra pendências antes dos anúncios', JSON.stringify(faltaAntes).length > 20 && /false/.test(JSON.stringify(faltaAntes)), JSON.stringify(faltaAntes).slice(0, 200))
const lig = await op('cobranca_ligar', { negocio_id: neg.id, documento: '529.982.247-25', email: 'paulo@marcenaria-ensaio.com' })
confere('o cliente entra no CRM da escola (contrato da Maia)', !!lig.projeto_id, JSON.stringify(lig))
const imp = await op('cobranca_implantacao', { negocio_id: neg.id, vence: hoje })
confere('cobrança da implantação: R$ 497, com link da fatura (simulada)', imp.valor === 497 && /^https:\/\//.test(imp.link || '') && imp.simulado === true, JSON.stringify(imp))
const pagoImp = await op('cobranca_simular_pagamento', { negocio_id: neg.id, qual: 'implantacao' })
const lancImp = le('escola_lancamentos_empresa').filter(l => l.grupo_recorrencia === lig.projeto_id)
confere('a implantação foi paga: baixa no financeiro da escola (realizado, R$ 497)', pagoImp?.situacao?.implantacao?.status === 'paga' && lancImp.length === 1 && lancImp[0].status === 'realizado' && Number(lancImp[0].valor) === 497, JSON.stringify({ sit: pagoImp?.situacao?.implantacao, lancImp }))

// ─────────────────────────────── 2) a pauta de material da implantação
etapa('2) Pauta de material da implantação (o que a Maia pede pros primeiros anúncios)')
const pauta0 = await op('material_pauta', { negocio_id: neg.id, lote: 'implantacao' })
confere('a pauta pede 4 vídeos, 4 fotos, a do produto e alguém usando', pauta0.pauta?.detalhe?.status === 'aberta' && pauta0.pauta.detalhe.falta.videos === 4 && pauta0.pauta.detalhe.falta.fotos === 4 && /tábua de churrasco/i.test(pauta0.pauta.detalhe.falta.produto || '') && pauta0.pauta.detalhe.falta.pessoa === true, JSON.stringify(pauta0.pauta?.detalhe?.falta))
confere('a mensagem foi pro WhatsApp do dono, "pros primeiros anúncios"', daMaiaProDono(neg.id).some(m => /pros primeiros anúncios/.test(m.texto || '') && /vídeos curtos/.test(m.texto || '')), daMaiaProDono(neg.id).map(m => m.texto).join(' | '))
const linkP = await op('link_painel_dono', { negocio_id: neg.id })
TOKEN = new URL(linkP.link).searchParams.get('t') || ''
confere('o dono tem o link do painel', !!TOKEN)

// ─────────────────────────────── 3) o dono manda fotos e vídeos
etapa('3) O dono manda fotos e vídeos (2 pelo WhatsApp, o resto pelo painel)')
// pelo WhatsApp a Maia descreve a foto com IA (aqui a IA "está fora": a foto entra sem descrição, só com a legenda do dono)
await op('simular_dono', { negocio_id: neg.id, arquivo_b64: b64(JPG), mime: 'image/jpeg', legenda: 'tábua de churrasco pronta, com o nome gravado' })
await op('simular_dono', { negocio_id: neg.id, arquivo_b64: b64(JPG), mime: 'image/jpeg', legenda: 'bandeja de madeira na mesa posta' })
for (const nome of ['tábua de churrasco de perto, luz do dia', 'cliente segurando a tábua na entrega']) await painel({ acao: 'midia_subir', arquivo_b64: b64(JPG), mime: 'image/jpeg', nome })
for (const nome of ['gravando o nome na tábua', 'lixando a madeira', 'embalando a tábua pra entrega', 'a oficina por dentro']) await painel({ acao: 'midia_subir', arquivo_b64: b64(MP4), mime: 'video/mp4', nome })
const mat1 = await ver('material', { negocio: neg.id })
confere('o banco de mídias tem 4 fotos e 4 vídeos', mat1.banco?.filter?.(m => m.tipo === 'foto').length === 4 && mat1.banco.filter(m => m.tipo === 'video').length === 4, JSON.stringify(mat1.banco?.map?.(m => m.tipo)))
const p0 = mat1.pautas.find(p => p.lote === 'implantacao')
confere('chegou tudo: a pauta da implantação fechou sozinha', p0?.status === 'atendida' && (p0.recebidas || []).length === 8, JSON.stringify({ st: p0?.status, rec: p0?.recebidas?.length, falta: p0?.falta_agora }))

// ─────────────────────────────── 4) os anúncios e a oficina
etapa('4) Anúncios gerados e a oficina (simulada)')
const ger = await op('gerar_anuncios', { negocio_id: neg.id, quantidade: 2 })
confere('quem escreveu foi a IA SIMULADA da rede do ensaio (scripts/maia-ensaio-rede.mjs no servidor)', rede().some(x => x.tipo === 'ia_falsa' && x.o === 'anuncios'), 'suba o servidor com NODE_OPTIONS=--import=./scripts/maia-ensaio-rede.mjs')
confere('a Maia criou 2 anúncios e eles foram pra oficina', ger.ok && ger.pecas?.length === 2 && le('tarefas').filter(t => t.negocio_id === neg.id && t.status === 'fila').length === 2, JSON.stringify(ger))
const feitas = await oficinaFalsa()
let pecas = await ver('pecas', { negocio: neg.id })
confere('a oficina entregou e as 2 peças estão na revisão da equipe, com arquivo', feitas === 2 && pecas.filter(p => p.status === 'revisao_equipe' && p.arquivo_path).length === 2, JSON.stringify(pecas.map(p => [p.status, !!p.arquivo_path])))
confere('a equipe foi avisada das peças pra aprovar', avisosEquipe(neg.id, /peça pra aprovar/).length === 2)

// ─────────────────────────────── 5) a equipe aprova, o dono aprova
etapa('5) Equipe aprova, dono aprova (uma pelo painel, outra com 👍 no WhatsApp)')
for (const p of pecas) await op('aprovar_peca', { peca_id: p.id })
await op('pedir_joinha', { negocio_id: neg.id })
pecas = await ver('pecas', { negocio: neg.id })
confere('as 2 peças foram pro WhatsApp do dono, esperando o 👍', pecas.every(p => p.status === 'com_dono' && p.wamid_envio), JSON.stringify(pecas.map(p => p.status)))
confere('uma mensagem só pedindo o 👍 dos 2', daMaiaProDono(neg.id).filter(m => /esses 2 anúncios tão prontos/.test(m.texto || '')).length === 1)
const semJoinha = await opErro('criar_campanha', { negocio_id: neg.id })
confere('sem o 👍 do dono, a campanha NÃO é criada', !!semJoinha, semJoinha)
const [pA, pB] = pecas
await painel({ acao: 'aprovar', peca_id: pA.id })
await op('simular_dono', { negocio_id: neg.id, reacao: { emoji: '👍', wamid: pB.wamid_envio } })
pecas = await ver('pecas', { negocio: neg.id })
confere('o dono aprovou as 2 (painel e 👍)', pecas.every(p => p.status === 'aprovada' && p.aprovado_dono_em), JSON.stringify(pecas.map(p => [p.status, p.aprovado_dono_em])))

// ─────────────────────────────── 6) a campanha
etapa('6) Campanha (Meta simulada) e o começo da mensalidade (R$ 997, sem desconto)')
const camp = await op('criar_campanha', { negocio_id: neg.id, raio_km: 20 })
confere('campanha criada PAUSADA, simulada, R$ 30/dia, com os 2 anúncios e o WhatsApp do negócio', camp.status === 'criada_pausada' && camp.simulada === true && Number(camp.verba_dia) === 30 && camp.meta_ad_ids?.length === 2 && camp.publico?.whatsapp === CONTEXTO.whatsapp,JSON.stringify({ st: camp.status, sim: camp.simulada, v: camp.verba_dia, ads: camp.meta_ad_ids, pub: camp.publico }))
const at = await op('ativar_campanha', { campanha_id: camp.id })
n0 = await ver('negocio', { id: neg.id })
confere('equipe ligou: campanha ativa e o negócio passou pra "ativo"', at.status === 'ativa' && n0.status === 'ativo', JSON.stringify({ c: at.status, n: n0.status }))
confere('anúncio no ar em até 2 dias depois da implantação', Date.parse(at.ativada_em) - Date.parse(n0.criado_em) <= 2 * D)
confere('as peças estão "no ar"', (await ver('pecas', { negocio: neg.id })).every(p => p.status === 'no_ar'))
const [adA, adB] = camp.meta_ad_ids
// o WhatsApp do negócio conectado (o cadastro incorporado da Meta grava o número e a chave: aqui direto no arquivo, de mentira)
// e a equipe liga o atendimento. Os clientes de teste (55000...) continuam simulados: nada sai pra Meta
mexe('negocios', x => x.id === neg.id, { wa_phone_id: 'ph_ensaio' + RUN, meta: { ...n0.meta, wa: { ...(n0.meta?.wa || {}), token: 'tk_ensaio_falso', waba_id: 'waba_ensaio', numero: CONTEXTO.whatsapp } } })
const atd = await op('atendimento_clientes', { negocio_id: neg.id, ligado: true })
confere('WhatsApp do negócio conectado e a equipe ligou o atendimento (chave geral MAIA_CLIENTES_LIGADO=1 no servidor)', atd.atende === true && atd.chave_geral === true, JSON.stringify(atd))
const ass = await op('cobranca_assinatura', { negocio_id: neg.id, primeira: diaM(5) })
const mens = le('asaas_sim').filter(c => c.assinatura && c.assinatura === ass.assinatura)
confere('a mensalidade abre com R$ 997 já no 1º mês (sem desconto), vencendo dia 5', ass.dia === 5 && mens.length === 1 && Number(mens[0].value) === 997 && mens[0].dueDate === diaM(5), JSON.stringify({ ass, mens }).slice(0, 400))

// ─────────────────────────────── 7) clientes conversam e uma venda é contada
etapa('7) Clientes conversam (pelo anúncio) e uma venda é contada')
const cliente = (tel, nome, texto, anuncio) => op('simular_cliente', { negocio_id: neg.id, telefone: tel, nome, texto, anuncio })
const T = (i) => '55000777' + RUN + String(i).padStart(2, '0')
let r = await cliente(T(1), 'Carla', 'Oi! Vi o anúncio da tábua, faz com o nome do meu pai?', adA)
confere('1ª resposta pra Carla (IA simulada) e o aviso de privacidade no fim', (r.respondeu?.mensagens || []).length >= 1 && r.respondeu?.aviso_privacidade === true, JSON.stringify(r.respondeu))
r = await cliente(T(1), 'Carla', 'Qual o endereço de vocês?', adA)
confere('pergunta do endereço: resposta fixa da ficha, sem IA', (r.respondeu?.ferramentas || []).includes('resposta_fixa') && /Acácias/.test((r.respondeu?.mensagens || []).join(' ')), JSON.stringify(r.respondeu))
await cliente(T(2), 'Bruno', 'Boa tarde, quanto fica uma bandeja?', adA)
for (let i = 3; i <= 7; i++) { await cliente(T(i), 'Cliente ' + i, 'Oi, vi no Instagram', adB); await cliente(T(i), 'Cliente ' + i, 'Qual o horário de vocês?', adB) }
let leads = await ver('leads', { negocio: neg.id })
confere('7 contatos novos, todos marcados como vindos do anúncio certo', leads.length === 7 && leads.filter(l => l.anuncio_ref === adA).length === 2 && leads.filter(l => l.anuncio_ref === adB).length === 5, JSON.stringify(leads.map(l => [l.nome, l.anuncio_ref, l.etapa])))
const carla = leads.find(l => l.telefone === T(1))
await op('lead_etapa', { lead_id: carla.id, etapa: 'proposta', valor: 180, produto: 'tábua de churrasco' })
// a pergunta das 18h pro dono: "Fechou?" com os botões (forçada no relógio de hoje às 18h)
const rot18 = await rodar(as(hoje, 18), { forcar_relatorio: true })
const perg = daMaiaProDono(neg.id).filter(m => /Pra eu contar certinho as vendas: Carla/.test(m.texto || ''))
confere('18h: a Maia pergunta pro dono se a Carla fechou (com os botões)', perg.length === 1 && (rot18.confirmacoes || []).some(x => x.negocio === neg.id), JSON.stringify({ c: rot18.confirmacoes, e: rot18.confirmacoes_erro }))
r = await op('simular_dono', { negocio_id: neg.id, botao: { id: `venda:${carla.id}:sim`, titulo: 'Fechou' } })
const carla2 = (await ver('leads', { negocio: neg.id })).find(l => l.id === carla.id)
confere('o dono clicou "Fechou": a venda de R$ 180 foi contada', carla2.etapa === 'ganho' && Number(carla2.valor) === 180, JSON.stringify({ e: carla2.etapa, v: carla2.valor }))
const num = await ver('numeros', { negocio: neg.id })
confere('os números do negócio: 7 contatos, 1 venda, R$ 180', num.ganhos === 1 && Number(num.receita) === 180 && num.leads_novos === 7, JSON.stringify(num))

// ─────────────────────────────── 7b) a IA cai na hora da retomada (20 h depois)
etapa('7b) Retomada com a IA fora do ar: a tentativa não conta e sai na rodada seguinte')
await op('teste_vencer_retomadas')
const abertos = () => le('leads').filter(l => l.negocio_id === neg.id && !['ganho', 'perdido'].includes(l.etapa) && l.proximo_followup_em)
const nAb = abertos().length
let diaR = mais(hoje, 1); while (semana(diaR) === 0) diaR = mais(diaR, 1)   // retomada só sai em dia que o negócio abre, das 9h às 20h
const msgsClientes = () => le('msgs').filter(m => m.negocio_id === neg.id && m.autor === 'maia' && le('conversas').find(c => c.id === m.conversa_id)?.canal === 'cliente').length
const antesMsgs = msgsClientes()
fs.writeFileSync(path.join(PASTA, 'ia-fora'), '1')
let rr = await rodar(as(diaR, 14))
fs.rmSync(path.join(PASTA, 'ia-fora'), { force: true })
confere(`IA fora: as ${nAb} retomadas vencidas não contam, nada é mandado e cada erro fica anotado`, nAb === 6 && abertos().every(l => !l.followups) && msgsClientes() === antesMsgs && (rr.retomadas || []).filter(x => x.erro).length === nAb, JSON.stringify({ nAb, r: rr.retomadas, e: rr.retomadas_erro, f: abertos().map(l => l.followups) }))
rr = await rodar(as(diaR, 15))
confere('IA de volta: na rodada seguinte as 6 retomadas saem e contam (1ª de 3, escrita pela Maia)', (rr.retomadas || []).filter(x => x.numero === 1 && x.como === 'texto').length === nAb && abertos().every(l => l.followups === 1) && msgsClientes() === antesMsgs + nAb, JSON.stringify({ r: rr.retomadas, e: rr.retomadas_erro }))

// ─────────────────────────────── 8) a análise de 2 em 2 dias
etapa('8) A análise de 2 em 2 dias (decide com os números da Meta simulada)')
const A1 = proximoDiaDeAnalise(hoje), A2 = mais(A1, 1), A3 = proximoDiaDeAnalise(A2)
console.log(`   (dias de análise: ${A1}, ${A2} (não pode: menos de 2 dias), ${A3})`)
// a Meta simulada: os 2 anúncios gastaram R$ 15/dia cada nos últimos 5 dias (a leitura só-GET do modo local)
fs.mkdirSync(path.join(PASTA, 'meta'), { recursive: true })
const linhasMeta = [], metr = le('metricas_dia')
for (let k = 1; k <= 5; k++) {
  const d = mais(A1, -k)
  linhasMeta.push({ data: d, ad_id: adA, gasto: 15, conversas: 2 }, { data: d, ad_id: adB, gasto: 15, conversas: 2 })
  metr.push({ negocio_id: neg.id, dia: d, gasto: 30, conversas_iniciadas: 4 })
}
fs.writeFileSync(path.join(PASTA, 'meta', 'ensaio' + RUN + '.json'), JSON.stringify(linhasMeta))
grava('metricas_dia', metr)
let rotA = await rodar(as(A1, 8, 10))
const an1 = (rotA.analises || []).find(x => x.negocio === neg.id)
confere(`${A1} 8h: a análise saiu e a conclusão é "mudar"`, an1?.analise && an1.conclusao === 'mudar', JSON.stringify(rotA.analises || rotA.analises_erro))
const ev1 = le('eventos').filter(e => e.tipo === 'analise_2dias' && e.negocio_id === neg.id)
const sug = ev1[0]?.detalhe?.sugestoes || []
confere('pausar o anúncio que trouxe 5 contatos e nenhum orçamento', sug.some(s => s.tipo === 'pausar' && s.anuncio === adB), JSON.stringify(sug))
confere('subir 30% a verba do anúncio que vendeu (R$ 30 → R$ 39, dentro do teto de R$ 60)', sug.some(s => s.tipo === 'estimular' && s.anuncio === adA && s.verba_de === 30 && s.verba_para === 39), JSON.stringify(sug.find(s => s.tipo === 'estimular')))
confere('e a sugestão da semana: testar um anúncio novo', sug.some(s => s.tipo === 'testar'))
await oficinaFalsa()
let pAn = (await ver('pecas', { negocio: neg.id })).find(p => p.id === an1?.analise)
confere('a oficina fez a imagem e a análise foi pra equipe (sugestão de mudar passa sempre pela equipe)', pAn?.status === 'revisao_equipe' && pAn.arquivo_path && avisosEquipe(neg.id, /análise dos anúncios pra aprovar/).length === 1, JSON.stringify({ st: pAn?.status }))
await op('aprovar_peca', { peca_id: pAn.id })
confere('equipe aprovou: o dono recebeu a análise como imagem, com a legenda curta', daMaiaProDono(neg.id).some(m => m.tipo === 'imagem' && /Análise dos anúncios do Marcenaria Pinheiro/.test(m.texto || '') && /Topa testar\?/.test(m.texto || '')), JSON.stringify(daMaiaProDono(neg.id).slice(-1).map(m => [m.tipo, (m.texto || '').slice(0, 80)])))
// o tempo passa: a análise foi gravada agora (hora real); no ensaio ela "foi" no dia A1 às 8h
mexe('eventos', e => e.tipo === 'analise_2dias' && e.negocio_id === neg.id, { criado_em: as(A1, 8, 10).toISOString() })
rotA = await rodar(as(A2, 8, 10))
confere(`${A2} 8h: não repete (menos de 2 dias)`, !(rotA.analises || []).some(x => x.negocio === neg.id && x.analise), JSON.stringify(rotA.analises))
rotA = await rodar(as(A3, 8, 10))
confere(`${A3} 8h: a análise seguinte sai (2 dias depois)`, (rotA.analises || []).some(x => x.negocio === neg.id && x.analise), JSON.stringify(rotA.analises || rotA.analises_erro))
const ev2 = le('eventos').filter(e => e.tipo === 'analise_2dias' && e.negocio_id === neg.id)
confere('a 2ª análise não repete o "testar anúncio novo" (só 1 vez por semana)', ev2.length === 2 && !(ev2.find(e => e.criado_em !== as(A1, 8, 10).toISOString())?.detalhe?.sugestoes || []).some(s => s.tipo === 'testar'), JSON.stringify(ev2.map(e => (e.detalhe?.sugestoes || []).map(s => s.tipo))))
await oficinaFalsa()

// ─────────────────────────────── 9) pauta do dia 1 e o lote do dia 4
etapa(`9) Dia 1 (${diaM(1)}): a pauta do lote do dia 4`)
// o mês passou: as mídias da implantação já rodaram em vários anúncios (cansaram)
mexe('midias', m => m.negocio_id === neg.id, { usos: 3 })
let rotM = await rodar(as(diaM(1), 10))
let pts = (await ver('material', { negocio: neg.id })).pautas
const pIni = pts.find(p => p.lote === 'inicio')
confere('dia 1 às 10h: a Maia pede a pauta do lote do dia 4 (4 vídeos e 4 fotos)', pIni?.status === 'aberta' && pIni.data_lote === diaM(4) && pIni.falta.videos === 4 && pIni.falta.fotos === 4, JSON.stringify({ p: pIni, m: rotM.material }))
confere('a mensagem pro dono diz o prazo (até o dia 3)', daMaiaProDono(neg.id).some(m => /pros anúncios do dia 4/.test(m.texto || '') && /até o dia 3/.test(m.texto || '')))
await rodar(as(diaM(1), 15))
confere('rodando de novo no mesmo dia: não pede de novo', (await ver('material', { negocio: neg.id })).pautas.filter(p => p.lote === 'inicio').length === 1)
for (const nome of ['tábua de churrasco nova, de perto', 'cliente usando a bandeja no almoço', 'tábua com logo de empresa', 'kit de tábuas na vitrine']) await painel({ acao: 'midia_subir', arquivo_b64: b64(JPG), mime: 'image/jpeg', nome })
for (let i = 1; i <= 4; i++) await painel({ acao: 'midia_subir', arquivo_b64: b64(MP4), mime: 'video/mp4', nome: 'vídeo da tábua sendo feita ' + i })
pts = (await ver('material', { negocio: neg.id })).pautas
confere('o dono mandou pelo painel: a pauta do dia 1 fechou sozinha', pts.find(p => p.lote === 'inicio')?.status === 'atendida', JSON.stringify(pts.find(p => p.lote === 'inicio')?.falta_agora))

// ─────────────────────────────── 10) o relatório do mês
etapa(`10) Dia 2 (${diaM(2)}): o relatório do mês de ${mesDeHoje}`)
rotM = await rodar(as(diaM(2), 8, 10))
const relM = (rotM.analises || []).find(x => x.negocio === neg.id && x.relatorio)
const evRel = le('eventos').find(e => e.tipo === 'relatorio_mes' && e.negocio_id === neg.id)
confere('8h do dia do relatório: o relatório do mês saiu (sem IA, com as conclusões montadas)', !!relM && evRel?.detalhe?.mes === mesDeHoje && evRel.detalhe.conclusoes?.por_ia !== true, JSON.stringify({ a: rotM.analises, e: rotM.analises_erro }))
confere('com os números de verdade do mês: 1 venda de R$ 180 no WhatsApp', evRel?.detalhe?.dados?.whatsapp?.ganhos === 1 && Number(evRel.detalhe.dados.whatsapp.receita) === 180, JSON.stringify(evRel?.detalhe?.dados?.whatsapp))
const pRel = (await ver('pecas', { negocio: neg.id })).find(p => p.id === relM?.relatorio)
confere('o relatório vai pra equipe aprovar', pRel?.status === 'revisao_equipe' && avisosEquipe(neg.id, /relatório do mês pra aprovar/).length === 1)
await op('aprovar_peca', { peca_id: pRel.id })
confere('equipe aprovou: o dono recebe o resumo com o link da página do relatório', daMaiaProDono(neg.id).some(m => /^Relatório do mês/.test(m.texto || '') && /O relatório completo: http/.test(m.texto || '')), daMaiaProDono(neg.id).slice(-1).map(m => m.texto).join(''))

// ─────────────────────────────── 11) o lote do dia 4 e a mensalidade
etapa(`11) Dia 4 (lote, material chegou) e a mensalidade do dia 5 (vencida, aviso no dia seguinte, uma vez)`)
await rodar(as(diaM(4), 10))
confere('dia 4 (lote) com a pauta atendida: a equipe não é avisada', avisosEquipe(neg.id, /material do lote não chegou/).length === 0)
await rodar(as(diaM(5), 10))
confere('dia 5 (vence hoje, sem pagar): ainda não avisa', avisosEquipe(neg.id, /cobrança atrasada/).length === 0)
await rodar(as(diaM(6), 10))
const avCob = avisosEquipe(neg.id, /cobrança atrasada/)
confere('dia 6 (dia seguinte): a equipe é avisada, com o valor (R$ 997) e o link da fatura', avCob.length === 1 && /997/.test(avCob[0].detalhe?.texto || '') && /https:\/\//.test(avCob[0].detalhe?.texto || ''), JSON.stringify(avCob.map(a => a.detalhe)))
await rodar(as(diaM(6), 15)); await rodar(as(diaM(7), 10))
confere('rodando de novo (mesmo dia e no outro): não repete o aviso', avisosEquipe(neg.id, /cobrança atrasada/).length === 1)
confere('a Maia não é desligada por atraso', (await ver('negocio', { id: neg.id })).status === 'ativo')
const sitP = await op('cobranca_simular_pagamento', { negocio_id: neg.id, qual: 'mensalidade' })
const lancM = le('escola_lancamentos_empresa').filter(l => l.grupo_recorrencia === lig.projeto_id && l.recorrente === true)
confere('pagou a mensalidade: baixa no financeiro (R$ 997) e volta "em dia"', sitP?.situacao?.mensalidade?.status === 'em_dia' && lancM.length === 1 && lancM[0].status === 'realizado' && Number(lancM[0].valor) === 997, JSON.stringify({ s: sitP?.situacao?.mensalidade, lancM }))

// ─────────────────────────────── 12) pauta do dia 12 e o lote do dia 15 (o dono não manda)
etapa(`12) Dia 12: a pauta do lote do dia 15, e o dono não manda`)
mexe('midias', m => m.negocio_id === neg.id, { usos: 3 })   // as do dia 1 rodaram no lote do dia 4
await rodar(as(diaM(12), 10))
const pMeio = (await ver('material', { negocio: neg.id })).pautas.find(p => p.lote === 'meio')
confere('dia 12: a Maia pede 2 vídeos e 2 fotos pro lote do dia 15', pMeio?.status === 'aberta' && pMeio.data_lote === diaM(15) && pMeio.falta.videos === 2 && pMeio.falta.fotos === 2, JSON.stringify(pMeio))
confere('a pauta entra nas pendências do dono', JSON.stringify(await ver('pendencias_dono', { negocio: neg.id })).includes('material'), JSON.stringify(await ver('pendencias_dono', { negocio: neg.id })).slice(0, 300))
await rodar(as(diaM(15), 8))
confere('dia 15 antes das 9h: ainda não avisa', avisosEquipe(neg.id, /material do lote não chegou/).length === 0)
await rodar(as(diaM(15), 10))
const avMat = avisosEquipe(neg.id, /material do lote não chegou/)
confere('dia 15 às 10h: a equipe é avisada (o material não chegou) e a pauta vence', avMat.length === 1 && (await ver('material', { negocio: neg.id })).pautas.find(p => p.lote === 'meio')?.status === 'vencida')
await rodar(as(diaM(15), 14))
confere('rodando de novo no dia 15: não repete', avisosEquipe(neg.id, /material do lote não chegou/).length === 1)

// ─────────────────────────────── 13) nada saiu do computador
etapa('13) A rede: nada saiu pra internet')
const log = rede()
const fora = log.filter(x => x.tipo === 'bloqueada' && x.host !== 'registry.npmjs.org')   // registry.npmjs.org: o aviso de versão do próprio Next (modo dev), não o sistema
confere('nenhuma chamada do sistema tentou sair pra internet (Meta, WhatsApp, Asaas, banco)', fora.length === 0, JSON.stringify(fora.slice(0, 5)))
const ia = log.filter(x => x.tipo === 'ia_falsa'), recusada = log.filter(x => x.tipo === 'ia_recusada')
console.log(`   IA simulada: ${ia.length} resposta(s) (${[...new Set(ia.map(x => x.o))].join(', ')}); pedidos de IA fora do roteiro (responderam "IA fora do ar"): ${recusada.length}`)
for (const x of recusada) console.log('     · ' + (x.sistema || '').slice(0, 90) + ' | ' + (x.pedido || '').slice(0, 60))
const telefones = le('msgs').filter(m => m.negocio_id === neg.id).map(m => le('conversas').find(c => c.id === m.conversa_id)?.telefone).filter(Boolean)
confere('todas as mensagens foram pra telefones de teste (55000...)', telefones.length > 0 && telefones.every(t => String(t).startsWith('55000')), [...new Set(telefones)].join(', '))

console.log(`\n${ok} de ${ok + falha} conferências passaram.`)
process.exit(falha ? 1 : 0)
