// Maia: o teste da social media e da devolução de conversas/vendas pra Meta (06/11).
// Roda os módulos direto (sem servidor), em MODO LOCAL (arquivos em .maia-teste/social) e com o fetch SIMULADO:
// nenhuma chamada sai pra Meta nem pra IA (qualquer endereço fora do roteiro aqui embaixo derruba o teste).
// Uso: node scripts/maia-teste-social.mjs
import fs from 'node:fs'
import path from 'node:path'
import { createJiti } from 'jiti'

const RAIZ = path.resolve(import.meta.dirname, '..')
const PASTA = '.maia-teste/social'
fs.rmSync(path.join(RAIZ, PASTA), { recursive: true, force: true })
Object.assign(process.env, {
  MAIA_LOCAL: '1', MAIA_LOCAL_PASTA: PASTA, MAIA_META_REAL: '1', MAIA_CAPI_LIGADO: '1', MAIA_SOCIAL_LIGADO: '1',
  MAIA_SOCIAL_ESPERA_MS: '1', MAIA_SOCIAL_TOKEN: 'tk_sistema', MAIA_CLIENTES_LIGADO: '', ANTHROPIC_API_KEY: 'teste',
})
for (const k of ['MAIA_CAPI_TOKEN', 'MAIA_ADS_TOKEN', 'FB_ADS_TOKEN', 'MAIA_CAPI_TESTE', 'MAIA_CAPI_PARCEIRO']) delete process.env[k]
process.chdir(RAIZ)

// ---------- o fetch simulado ----------
const chamadas = []
let roteiro = {}   // ajustes por teste
const seq = { c: 0 }
const resp = (j, status = 200) => new Response(JSON.stringify(j), { status, headers: { 'content-type': 'application/json' } })
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url))
  const metodo = (opts.method || 'GET').toUpperCase()
  const corpo = opts.body instanceof URLSearchParams ? Object.fromEntries(opts.body) : typeof opts.body === 'string' ? JSON.parse(opts.body) : null
  const auth = opts.headers?.Authorization || opts.headers?.authorization || ''
  if (u.host === 'api.anthropic.com') {
    const sistema = JSON.stringify(corpo.system)
    chamadas.push({ host: 'ia', modelo: corpo.model, sistema })
    if (/analista de social media/.test(sistema)) return resp({ content: [{ type: 'text', text: JSON.stringify({ resumo: 'Reels sobre bastidores alcançaram o dobro das fotos.', repetir: ['reels de bastidores'], testar: ['carrossel com antes e depois'], parar: ['foto de produto sem contexto'], plano: [{ semana: 1, dia: 'terça', horario: '18h', tipo: 'reels', tema: 'bastidores', formato: 'bastidor', ideia: 'mostrar o copo sendo gravado' }] }) }], usage: { input_tokens: 10, output_tokens: 10 }, stop_reason: 'end_turn' })
    if (/social media do negócio/.test(sistema)) return resp({ content: [{ type: 'text', text: '{"legenda":"Legenda nova, mais curta. #lajeado"}' }], usage: { input_tokens: 5, output_tokens: 5 }, stop_reason: 'end_turn' })
    throw new Error('IA chamada fora do roteiro: ' + sistema.slice(0, 120))
  }
  if (u.host !== 'graph.facebook.com') throw new Error('fetch fora do roteiro: ' + url)
  const c = u.pathname.replace(/^\/v25\.0\//, '')
  const q = Object.fromEntries(u.searchParams)
  chamadas.push({ host: 'meta', metodo, c, q, corpo, auth })
  if (roteiro.antes) { const r = roteiro.antes(metodo, c, q, corpo); if (r) return r }
  // conversões
  if (/^W\d+\/dataset$/.test(c)) return metodo === 'GET' ? resp({ data: [] }) : resp({ id: 'DS_' + c.split('/')[0] })
  if (/^DS_.+\/events$/.test(c)) return resp({ events_received: corpo.data.length, fbtrace_id: 'x' })
  // social
  if (c === 'P1' && q.fields === 'access_token') return resp({ access_token: 'tk_pagina', id: 'P1' })
  if (c === 'IG1/media') return resp({ id: 'CT' + (++seq.c) })
  if (/^CT\d+$/.test(c) && q.fields === 'status_code,status') return resp({ status_code: 'FINISHED' })
  if (c === 'IG1/content_publishing_limit') return resp({ data: [{ quota_usage: 2, config: { quota_total: 100, quota_duration: 86400 } }] })
  if (c === 'IG1/media_publish') return resp({ id: 'IGM' + (++seq.c) })
  if (/^IGM\d+$/.test(c) && q.fields === 'permalink') return resp({ permalink: 'https://www.instagram.com/p/x' + c })
  if (c === 'P1/photos') return resp(corpo.published === 'false' ? { id: 'FBF' + (++seq.c) } : { id: 'FBF' + (++seq.c), post_id: 'P1_' + (++seq.c) })
  if (c === 'P1/feed') return resp({ id: 'P1_' + (++seq.c) })
  if (c === 'P1/videos') return resp({ id: 'FBV' + (++seq.c) })
  if (/^FBV\d+$/.test(c) && q.fields === 'post_id') return resp({ post_id: 'P1_v' + c })
  if (/^IGM\d+\/insights$/.test(c)) return resp({ data: q.metric.split(',').map(n => ({ name: n, period: 'lifetime', values: [{ value: n === 'reach' ? 500 : n === 'views' ? 900 : 12 }] })) })
  if (/^P1_.+\/insights$/.test(c)) return resp({ data: q.metric.split(',').map(n => ({ name: n, period: 'lifetime', values: [{ value: n === 'post_reactions_by_type_total' ? { like: 7, love: 2 } : 100 }] })) })
  if (/^P1_.+$/.test(c) && /comments/.test(q.fields || '')) return resp({ shares: { count: 3 }, comments: { summary: { total_count: 4 } }, reactions: { summary: { total_count: 9 } } })
  return resp({ error: { message: 'rota não simulada: ' + metodo + ' ' + c } }, 400)
}
const daMeta = (f = () => true) => chamadas.filter(x => x.host === 'meta' && f(x))
const zera = () => { chamadas.length = 0; roteiro = {} }

// ---------- o placar ----------
const placar = []
const confere = (ok, o) => { placar.push({ ok: !!ok, o }); console.log((ok ? '  ✔ ' : '  ✘ ') + o) }
const falha = async (fn) => { try { await fn(); return null } catch (e) { return e.message } }

const jiti = createJiti(import.meta.url, { alias: { '@': RAIZ }, interopDefault: true, moduleCache: true })
const { maiaDb: db } = await jiti.import(path.join(RAIZ, 'lib/maia/db.ts'))
const { recebeDoCliente } = await jiti.import(path.join(RAIZ, 'lib/maia/atendente.ts'))
const { ganhou } = await jiti.import(path.join(RAIZ, 'lib/maia/funil.ts'))
const S = await jiti.import(path.join(RAIZ, 'lib/maia/social.ts'))
const { equipeAjuste } = await jiti.import(path.join(RAIZ, 'lib/maia/aprovacao.ts'))
const { roda } = await jiti.import(path.join(RAIZ, 'lib/maia/rotina.ts'))

console.log('Maia · teste da social media e da API de conversões (modo local, fetch simulado)')
const neg = await db.insere('negocios', {
  nome: 'Wood Brindes (teste social)', nicho: 'brindes', cidade: 'Lajeado', plano: 'completa', status: 'ativo',
  dono_nome: 'Rafa', dono_whatsapp: '5500077779001', wa_phone_id: 'PH1',
  meta: { page_id: 'P1', ig_id: 'IG1', wa: { waba_id: 'W1', token: 'tk_negocio', numero: '5551999990000', atende: false } },
})

// ===== PEÇA 1: conversões =====
console.log('\n=== API de conversões (WhatsApp)')
zera()
const r1 = await recebeDoCliente(neg, { telefone: '5500011119001', nome: 'Carla', texto: 'Oi, vi o anúncio', wamid: 'w1', referral: { source_id: 'AD1', ctwa_clid: 'CLID_A' } })
let ds = daMeta(x => /dataset$/.test(x.c)), evs = daMeta(x => /events$/.test(x.c))
confere(ds.length === 2 && ds[0].metodo === 'GET' && ds[1].metodo === 'POST' && ds.every(x => x.auth === 'Bearer tk_negocio'), 'conjunto de dados: lê a WABA e cria (com a chave do negócio)')
const negDs = await db.um('negocios', { id: neg.id })
confere(negDs.meta.wa.dataset_id === 'DS_W1' && negDs.meta.wa.token === 'tk_negocio' && negDs.meta.page_id === 'P1', 'dataset_id guardado em meta.wa (sem apagar o resto)')
const e1 = evs[0]?.corpo?.data?.[0] || {}
confere(evs.length === 1 && e1.event_name === 'LeadSubmitted' && e1.action_source === 'business_messaging' && e1.messaging_channel === 'whatsapp' && e1.user_data.whatsapp_business_account_id === 'W1' && e1.user_data.ctwa_clid === 'CLID_A' && e1.event_id && e1.event_time > 1.7e9, 'LeadSubmitted com action_source, messaging_channel, WABA, ctwa_clid, event_id e event_time')
const cl = await db.lista('lead_eventos', { lead_id: r1.lead.id, tipo: 'ctwa' })
confere(cl.length === 1 && cl[0].detalhe.ctwa_clid === 'CLID_A', 'o ctwa_clid ficou guardado no lead (lead_eventos ctwa)')
zera()
await recebeDoCliente(neg, { telefone: '5500011119001', nome: 'Carla', texto: 'E entrega?', wamid: 'w2', referral: { source_id: 'AD1', ctwa_clid: 'CLID_A' } })
confere(daMeta().length === 0, 'mesma pessoa, mesmo clique: não manda de novo (a Meta não tira duplicado)')
zera()
await ganhou(await db.um('leads', { id: r1.lead.id }), 350, 'copo', 'maia')
evs = daMeta(x => /events$/.test(x.c))
const p1 = evs[0]?.corpo?.data?.[0] || {}
confere(evs.length === 1 && p1.event_name === 'Purchase' && p1.custom_data?.currency === 'BRL' && p1.custom_data?.value === 350 && p1.user_data.ctwa_clid === 'CLID_A' && !daMeta(x => /dataset$/.test(x.c)).length, 'venda marcada → Purchase R$ 350 em BRL (o dataset já guardado não é pedido de novo)')
const capis = await db.lista('eventos', { negocio_id: neg.id, tipo: 'capi' })
confere(capis.filter(e => e.detalhe.evento !== 'dataset').length === 2 && capis.every(e => e.detalhe.ok), 'cada envio anotado em maia_eventos capi (ok)')
// falha da Meta não derruba
zera(); roteiro.antes = (m, c) => /events$/.test(c) ? resp({ error: { message: 'Invalid ctwa_clid' } }, 400) : null
const rf = await recebeDoCliente(neg, { telefone: '5500011119002', nome: 'Beto', texto: 'Oi', wamid: 'w3', referral: { source_id: 'AD1', ctwa_clid: 'CLID_B' } })
const capErr = (await db.lista('eventos', { negocio_id: neg.id, tipo: 'capi' })).filter(e => !e.detalhe.ok)
confere(rf && rf.lead && capErr.length === 1 && /Invalid ctwa_clid/.test(capErr[0].detalhe.erro), 'a Meta recusou: o atendimento seguiu e o erro ficou anotado')
// sem clique: nada vai
zera()
const rs = await recebeDoCliente(neg, { telefone: '5500011119003', nome: 'Dani', texto: 'Oi, quanto custa?', wamid: 'w4', referral: null })
await ganhou(rs.lead, 89, 'copo', 'maia')
confere(daMeta().length === 0, 'lead sem clique de anúncio: nem LeadSubmitted nem Purchase')
// chave desligada
zera(); process.env.MAIA_CAPI_LIGADO = ''
await recebeDoCliente(neg, { telefone: '5500011119004', nome: 'Eva', texto: 'Oi', wamid: 'w5', referral: { source_id: 'AD1', ctwa_clid: 'CLID_C' } })
confere(daMeta().length === 0, 'sem MAIA_CAPI_LIGADO=1 nada vai pra Meta')
process.env.MAIA_CAPI_LIGADO = '1'
// origem pelo link do perfil
const ri = await recebeDoCliente(neg, { telefone: '5500011119005', nome: 'Fabi', texto: 'Oi! Vim pelo Instagram', wamid: 'w6', referral: null })
const rfb = await recebeDoCliente(neg, { telefone: '5500011119006', nome: 'Gil', texto: 'vim pelo facebook, tem copo?', wamid: 'w7', referral: null })
const rn = await recebeDoCliente(neg, { telefone: '5500011119005', nome: 'Fabi', texto: 'outra mensagem', wamid: 'w8', referral: null })
confere(ri.lead.origem === 'instagram' && rfb.lead.origem === 'facebook' && rn.lead.origem === 'instagram' && rs.lead.origem === 'organico', 'o texto do link do perfil marca a origem (instagram / facebook); sem ele, organico')
const lk = await S.linkDoPerfil(neg.id, 'instagram')
confere(lk.link === 'https://wa.me/5551999990000?text=Vim%20pelo%20Instagram', 'link do perfil: ' + lk.link)

// ===== PEÇA 2: social media =====
console.log('\n=== Social media')
const passado = new Date(Date.now() - 3600e3).toISOString()
const JPG = 'https://exemplo.supabase.co/storage/v1/object/sign/maia/x/foto1.jpg?token=a'
confere(/JPEG/.test(await falha(() => S.criaPost(neg.id, { quando: passado, tipo: 'foto', midias: [{ url: 'https://x/a.png' }], legenda: 'oi' }))), 'foto PNG é recusada (o Instagram só aceita JPEG)')
confere(/reels leva 1 vídeo/.test(await falha(() => S.criaPost(neg.id, { quando: passado, tipo: 'reels', midias: [{ url: JPG }], legenda: 'oi' }))), 'reels sem vídeo é recusado')
// 08/11: plano único: a social media vale também pro negócio marcado "essencial" (antigo); só a Maia Gestora não tem
const essencial = await db.insere('negocios', { nome: 'Essencial antigo (teste)', plano: 'essencial', dono_whatsapp: '5500077779002' })
confere(!/Gestora|plano/.test(String(await falha(() => S.criaPost(essencial.id, { quando: passado, tipo: 'foto', midias: [{ url: JPG }], legenda: 'oi' })))), 'plano único: o negócio marcado "essencial" também tem social media')
const gestao = await db.insere('negocios', { nome: 'Gestora (teste)', plano: 'gestao', dono_whatsapp: '5500077779003' })
confere(/Gestora/.test(await falha(() => S.criaPost(gestao.id, { quando: passado, tipo: 'foto', midias: [{ url: JPG }], legenda: 'oi' }))), 'a Maia Gestora (só leitura) não tem social media')

let foto = await S.criaPost(neg.id, { quando: passado, tipo: 'foto', midias: [{ url: JPG }], legenda: 'Copo térmico com a foto de quem tu ama. Lajeado e região.', tema: 'presente', formato: 'produto', objetivo: 'venda' })
let pc = await db.um('pecas', { id: foto.detalhe.peca_id })
confere(foto.detalhe.status === 'rascunho' && pc.status === 'revisao_equipe' && pc.tipo === 'post', 'post criado: rascunho, peça na revisão da equipe')
zera()
confere(/dois 👍/.test(await falha(() => S.publica(foto.id, { forcar: true }))) && daMeta().length === 0, 'sem os dois 👍 não publica (nem com publicar_agora)')
foto = await S.aprovaEquipe(foto.id, 'teste')
pc = await db.um('pecas', { id: foto.detalhe.peca_id })
const cvd = await db.um('conversas', { negocio_id: neg.id, canal: 'dono' })
const msgsDono = await db.lista('msgs', { conversa_id: cvd.id })
confere(foto.detalhe.status === 'aprovado_equipe' && pc.status === 'com_dono' && msgsDono.some(m => m.tipo === 'imagem' && /Post pro Instagram e Facebook/.test(m.texto)) && pc.wamid_envio, 'equipe aprovou → foi pro dono no WhatsApp com a legenda (👍 em cima aprova)')
confere(/dois 👍/.test(await falha(() => S.publica(foto.id, { forcar: true }))), 'só com a equipe ainda não publica')
foto = await S.aprovaDono(foto.id)
confere(foto.detalhe.status === 'agendado', 'dono deu 👍 → agendado')
zera()
let pub = await S.publicaVencidos()
foto = await S.umPost(foto.id)
const igCria = daMeta(x => x.c === 'IG1/media')[0], fbFoto = daMeta(x => x.c === 'P1/photos')[0]
confere(foto.detalhe.status === 'publicado' && igCria?.corpo.image_url === JPG && /Copo térmico/.test(igCria?.corpo.caption) && daMeta(x => x.c === 'IG1/media_publish')[0]?.corpo.creation_id === 'CT1', 'Instagram: container com image_url + legenda → FINISHED → media_publish')
confere(daMeta(x => x.c === 'IG1/content_publishing_limit').length === 1, 'conferiu o limite de posts de 24 h antes de publicar')
confere(fbFoto?.corpo.url === JPG && /Copo térmico/.test(fbFoto?.corpo.message) && fbFoto.auth === 'Bearer tk_pagina' && daMeta(x => x.c === 'P1' && x.q.fields === 'access_token')[0]?.auth === 'Bearer tk_sistema', 'Facebook: /photos com a chave da PÁGINA (tirada da chave do sistema)')
confere(foto.detalhe.ig.permalink && foto.detalhe.fb.post_id && (await db.um('pecas', { id: foto.detalhe.peca_id })).status === 'no_ar', 'ids e link do post guardados; peça no_ar')
zera(); await S.publicaVencidos(); await S.publica(foto.id, { forcar: true })
confere(daMeta(x => x.metodo === 'POST').length === 0, 'post publicado não sai de novo')

// reels: processando → a próxima rodada publica
let reels = await S.criaPost(neg.id, { quando: passado, tipo: 'reels', midias: [{ url: 'https://exemplo/x/video.mp4' }], legenda: 'Bastidor: como a gente grava o teu copo.', tema: 'bastidores', formato: 'bastidor' })
await S.aprovaEquipe(reels.id, 'teste'); await S.aprovaDono(reels.id)
zera(); roteiro.antes = (m, c, q) => /^CT\d+$/.test(c) && q.fields === 'status_code,status' ? resp({ status_code: 'IN_PROGRESS' }) : null
await S.publicaVencidos()
reels = await S.umPost(reels.id)
const reelsCria = daMeta(x => x.c === 'IG1/media')[0]
confere(reels.detalhe.status === 'processando' && reelsCria?.corpo.media_type === 'REELS' && reelsCria.corpo.video_url && reels.detalhe.ig.container && !daMeta(x => x.c === 'IG1/media_publish').length, 'reels: vídeo ainda processando → fica "processando" com o container guardado')
confere(daMeta(x => x.c === 'P1/videos').length === 1 && reels.detalhe.fb.video_id, 'Facebook: vídeo subiu em /videos (uma vez)')
zera()
await S.publicaVencidos()
reels = await S.umPost(reels.id)
confere(reels.detalhe.status === 'publicado' && !daMeta(x => x.c === 'IG1/media').length && !daMeta(x => x.c === 'P1/videos').length && daMeta(x => x.c === 'IG1/media_publish').length === 1, 'próxima rodada: mesmo container, publicou, sem repetir o vídeo no Facebook')

// carrossel
let car = await S.criaPost(neg.id, { quando: passado, tipo: 'carrossel', midias: [{ url: JPG }, { url: JPG.replace('foto1', 'foto2') }, { url: JPG.replace('foto1', 'foto3') }], legenda: 'Antes e depois.', tema: 'antes e depois', formato: 'carrossel' })
await S.aprovaEquipe(car.id, 'teste'); await S.aprovaDono(car.id)
zera(); await S.publicaVencidos()
car = await S.umPost(car.id)
const filhos = daMeta(x => x.c === 'IG1/media' && x.corpo.is_carousel_item === 'true'), mae = daMeta(x => x.c === 'IG1/media' && x.corpo.media_type === 'CAROUSEL')[0]
const feed = daMeta(x => x.c === 'P1/feed')[0]
confere(car.detalhe.status === 'publicado' && filhos.length === 3 && mae?.corpo.children.split(',').length === 3 && mae.corpo.caption === 'Antes e depois.', 'carrossel no Instagram: 3 itens + container CAROUSEL com children')
confere(daMeta(x => x.c === 'P1/photos' && x.corpo.published === 'false').length === 3 && JSON.parse(feed?.corpo.attached_media || '[]').length === 3, 'carrossel no Facebook: 3 fotos sem publicar + /feed com attached_media')

// erro no Instagram → erro e aviso; publicar_agora depois publica sem duplicar o Facebook
let er = await S.criaPost(neg.id, { quando: passado, tipo: 'foto', midias: [{ url: JPG }], legenda: 'Teste de erro.' })
await S.aprovaEquipe(er.id, 'teste'); await S.aprovaDono(er.id)
zera(); roteiro.antes = (m, c) => c === 'IG1/media' ? resp({ error: { message: 'Only photo or video can be accepted as media type.' } }, 400) : null
await S.publicaVencidos()
er = await S.umPost(er.id)
confere(er.detalhe.status === 'erro' && /Instagram/.test(er.detalhe.erro) && er.detalhe.fb.post_id, 'Instagram recusou: status erro com o motivo (o Facebook saiu)')
zera(); await S.publicaVencidos()
confere(daMeta().length === 0, 'a rotina não fica tentando o que deu erro')
zera(); er = await S.publica(er.id, { forcar: true, por: 'teste' })
confere(er.detalhe.status === 'publicado' && !daMeta(x => x.c === 'P1/photos').length, 'publicar_agora depois do erro: publicou só no Instagram (o Facebook não duplicou)')

// limite de 24 h
let lim = await S.criaPost(neg.id, { quando: passado, tipo: 'foto', midias: [{ url: JPG }], legenda: 'Teste de limite.', redes: ['instagram'] })
await S.aprovaEquipe(lim.id, 'teste'); await S.aprovaDono(lim.id)
zera(); roteiro.antes = (m, c) => c === 'IG1/content_publishing_limit' ? resp({ data: [{ quota_usage: 100, config: { quota_total: 100 } }] }) : null
await S.publicaVencidos()
lim = await S.umPost(lim.id)
confere(lim.detalhe.status === 'processando' && /limite/.test(lim.detalhe.erro) && !daMeta(x => x.c === 'IG1/media_publish').length, 'no limite de 24 h do Instagram: não publica, espera a próxima rodada')
zera(); await S.publicaVencidos()
confere((await S.umPost(lim.id)).detalhe.status === 'publicado', 'limite liberou: publicou')

// post do futuro não sai
let fut = await S.criaPost(neg.id, { quando: '2099-01-01T18:00', tipo: 'foto', midias: [{ url: JPG }], legenda: 'Futuro.' })
await S.aprovaEquipe(fut.id, 'teste'); await S.aprovaDono(fut.id)
zera(); await S.publicaVencidos()
confere((await S.umPost(fut.id)).detalhe.status === 'agendado' && daMeta(x => x.metodo === 'POST').length === 0 && fut.detalhe.quando === '2099-01-01T21:00:00.000Z', 'agendado pro futuro (18h de Brasília = 21h UTC): não sai antes da hora')

// ajuste da equipe num post: só a legenda, sem oficina
let aj = await S.criaPost(neg.id, { quando: passado, tipo: 'foto', midias: [{ url: JPG }], legenda: 'Legenda comprida demais pra testar o ajuste.' })
const tarefasAntes = (await db.lista('tarefas')).length
await equipeAjuste(aj.detalhe.peca_id, 'deixa mais curta', 'teste')
aj = await S.umPost(aj.id); const pcAj = await db.um('pecas', { id: aj.detalhe.peca_id })
confere(pcAj.status === 'revisao_equipe' && pcAj.versao === 2 && /Legenda nova/.test(pcAj.texto) && (await db.lista('tarefas')).length === tarefasAntes && aj.detalhe.status === 'rascunho', 'ajuste da equipe reescreveu só a legenda (versão 2), sem tarefa na oficina')

// resultados
zera(); roteiro.antes = (m, c, q) => /^IGM\d+\/insights$/.test(c) && q.metric.includes(',') && q.metric.includes('ig_reels_avg_watch_time') ? resp({ error: { message: 'metric not supported' } }, 400) : null
let lidos = await S.leResultados({ negocio_id: neg.id })
const igIns = daMeta(x => /^IGM\d+\/insights$/.test(x.c))
const res1 = await db.lista('eventos', { negocio_id: neg.id, tipo: 'social_resultado' })
confere(lidos.length === 5 && res1.length === 5 && lidos.every(x => x.ig && !x.erro), 'resultados: 5 posts publicados lidos, um retrato do dia por post')
confere(igIns.some(x => x.q.metric === 'views,reach,likes,comments,saved,shares,total_interactions,follows,profile_visits'), 'métricas atuais do Instagram (views, reach, likes, comments, saved, shares, total_interactions, follows, profile_visits)')
const rr = res1.find(e => e.detalhe.post === reels.id)
confere(rr?.detalhe.ig.reach === 500 && rr.detalhe.ig.views === 900 && igIns.filter(x => !x.q.metric.includes(',')).length >= 8, 'reels: a Meta recusou o pacote → pediu uma por uma e guardou as que vieram')
const rf1 = res1.find(e => e.detalhe.post === foto.id)
confere(rf1?.detalhe.fb.post_reactions_by_type_total === 9 && rf1.detalhe.fb.comentarios === 4 && rf1.detalhe.fb.compartilhamentos === 3 && daMeta(x => /^P1_.+\/insights$/.test(x.c))[0]?.q.metric === 'post_media_view,post_total_media_view_unique,post_reactions_by_type_total,post_clicks', 'Facebook: post_media_view, post_total_media_view_unique, reações, comentários e compartilhamentos')
confere(daMeta(x => /^FBV\d+$/.test(x.c) && x.q.fields === 'post_id').length === 1, 'vídeo do Facebook: achou o post do vídeo pra ler os números')
await S.leResultados({ negocio_id: neg.id })
confere((await db.lista('eventos', { negocio_id: neg.id, tipo: 'social_resultado' })).length === 5, 'leu de novo no mesmo dia: atualizou o retrato, não duplicou')

// análise do mês
zera()
const mes = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7)
const an = await S.analiseDoMes(neg.id, { mes })
const ia = chamadas.filter(x => x.host === 'ia')
const pAn = await db.um('pecas', { id: an.peca_id })
confere(ia.length === 1 && ia[0].modelo === 'claude-opus-5-5', 'análise do mês com o modelo maior (' + ia[0]?.modelo + ')')
confere(pAn?.tipo === 'relatorio' && pAn.status === 'revisao_equipe' && /Repetir: reels de bastidores/.test(pAn.texto) && /Testar:/.test(pAn.texto) && /Parar:/.test(pAn.texto) && /plano do mês que vem/.test(pAn.texto), 'virou peça de relatório na revisão da equipe (repetir, testar, parar e o plano)')
console.log('    ' + pAn.texto.replace(/\n/g, '\n    '))
confere((await S.analiseDoMes(neg.id, { mes })).pulou === 'já feita', 'a análise do mês não repete')

// a rotina
process.env.MAIA_SOCIAL_LIGADO = ''
zera(); let rot = await roda()
confere(!rot.social && !daMeta().length, 'rotina sem MAIA_SOCIAL_LIGADO=1: a social não roda')
process.env.MAIA_SOCIAL_LIGADO = '1'
let rotina = await db.lista('eventos', { negocio_id: neg.id, tipo: 'social_post' })
let ult = await S.criaPost(neg.id, { quando: passado, tipo: 'foto', midias: [{ url: JPG }], legenda: 'Pela rotina.' })
await S.aprovaEquipe(ult.id, 'teste'); await S.aprovaDono(ult.id)
zera(); rot = await roda()
confere(rot.social?.publicados?.some(x => x.post === ult.id && x.status === 'publicado'), 'rotina com MAIA_SOCIAL_LIGADO=1 publicou o post vencido')

// sem Meta real: simulado
process.env.MAIA_META_REAL = ''
let simu = await S.criaPost(neg.id, { quando: passado, tipo: 'foto', midias: [{ url: JPG }], legenda: 'Simulado.' })
await S.aprovaEquipe(simu.id, 'teste'); await S.aprovaDono(simu.id)
zera(); simu = await S.publica(simu.id)
confere(simu.detalhe.status === 'publicado' && /^sim_/.test(simu.detalhe.ig.media_id) && daMeta().length === 0, 'sem MAIA_META_REAL=1: publica simulado, nada sai pra Meta')

const falhas = placar.filter(x => !x.ok)
console.log(`\n${placar.length - falhas.length} de ${placar.length} conferências passaram.`)
if (falhas.length) { console.log('Falharam:\n' + falhas.map(f => ' - ' + f.o).join('\n')); process.exit(1) }
