// Maia: teste do HISTÓRICO DA COEXISTÊNCIA (27/11, lib/maia/historico.ts). Modo local, Meta de mentira, nada sai pra internet.
// Servidor (pasta limpa):
//   rm -rf .teste-maia-historico
//   MAIA_LOCAL=1 MAIA_LOCAL_PASTA=.teste-maia-historico MAIA_PAINEL_SENHA=teste123456789 MAIA_SEM_AVISO=1 \
//   MAIA_META_APP_SECRET=segredo-app-falso MAIA_CLIENTES_LIGADO=1 MAIA_ESPERA_MS=300 \
//   MAIA_META_FALSA_LOG=.teste-maia-historico/meta-falsa.jsonl \
//   NODE_OPTIONS=--import=./scripts/maia-rede-meta-falsa-historico.mjs npx next dev --webpack -p 3270
// Teste: node scripts/maia-teste-historico.mjs http://localhost:3270 teste123456789 .teste-maia-historico
// Confere: inscrição do app (união, sem perder campo), pedido do histórico (contatos e depois mensagens, uma vez só, 24 h,
// falha da Meta deixa tentar de novo só o que faltou), webhooks history (2 pedaços, mídia, recusado 2593109), eco e contatos
// guardados no armazenamento com evento, e que NADA disso vira conversa nem resposta.
import fs from 'node:fs'
import path from 'node:path'
import { createHmac } from 'node:crypto'

const [URL_ = 'http://localhost:3270', SENHA = 'teste123456789', PASTA = '.teste-maia-historico'] = process.argv.slice(2)
const SEGREDO_APP = process.env.MAIA_META_APP_SECRET || 'segredo-app-falso'
const LOG = path.join(PASTA, 'meta-falsa.jsonl')
let ok = 0, falha = 0
const confere = (nome, cond, extra = '') => { if (cond) { ok++; console.log('  ✔', nome) } else { falha++; console.log('  ✘', nome, typeof extra === 'string' ? extra : JSON.stringify(extra).slice(0, 400)) } }
const op = (acao, corpo = {}) => fetch(URL_ + '/api/maia/operacao', { method: 'POST', headers: { 'x-senha': SENHA, 'content-type': 'application/json' }, body: JSON.stringify({ acao, por: 'teste', ...corpo }) }).then(async r => ({ ...(await r.json().catch(() => ({}))), http: r.status }))
const tab = (t) => { try { return JSON.parse(fs.readFileSync(path.join(PASTA, t + '.json'), 'utf8')) } catch { return [] } }
const grava = (t, l) => fs.writeFileSync(path.join(PASTA, t + '.json'), JSON.stringify(l, null, 1))
const chamadas = () => { try { return fs.readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) } catch { return [] } }
const espera = (ms) => new Promise(r => setTimeout(r, ms))
const arquivos = (negId, pasta) => { const d = path.join(PASTA, 'arquivos', 'negocios', negId, pasta); try { return fs.readdirSync(d) } catch { return [] } }
async function ate(cond, ms = 15000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await cond()) return true; await espera(300) } return false }

// o webhook com a assinatura da Meta (x-hub-signature-256 com o segredo do app)
async function webhook(payload, { assina = true, bruto = null } = {}) {
  const corpo = bruto ?? JSON.stringify(payload)
  const h = { 'content-type': 'application/json' }
  if (assina) h['x-hub-signature-256'] = 'sha256=' + createHmac('sha256', SEGREDO_APP).update(corpo, 'utf8').digest('hex')
  const t0 = Date.now()
  const r = await fetch(URL_ + '/api/maia/whats/webhook', { method: 'POST', headers: h, body: corpo })
  return { http: r.status, ms: Date.now() - t0, j: await r.json().catch(() => null) }
}
const envelope = (phone, field, value) => ({ object: 'whatsapp_business_account', entry: [{ id: 'WABA-' + phone, changes: [{ field, value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '5551999990000', phone_number_id: phone }, ...value } }] }] })

// um negócio "conectado": cria pelo painel e liga o WhatsApp direto no arquivo do modo local (como a conexão gravaria)
async function negocioConectado(nome, fone, phone, conectadoHa) {
  const n = await op('criar_negocio', { nome, dono_whatsapp: fone, cidade: 'Lajeado' })
  const l = tab('negocios'), x = l.find(y => y.id === n.id)
  x.wa_phone_id = phone
  x.meta = { ...(x.meta || {}), wa: { token: 'TOKEN-TESTE-HISTORICO', waba_id: 'WABA-' + phone, conectado_em: new Date(Date.now() - conectadoHa).toISOString(), inscrito: true, atende: true } }
  grava('negocios', l)
  return n.id
}

async function main() {
  console.log('Histórico da coexistência —', URL_)
  const A = await negocioConectado('Loja A (teste histórico)', '5500088880001', '555000111', 2 * 3600e3)
  const B = await negocioConectado('Loja B (teste histórico)', '5500088880002', '555000333', 25 * 3600e3)
  const C = await negocioConectado('Loja C (teste histórico)', '5500088880003', '555000222', 3600e3)

  console.log('\n1. inscrição do app nos campos da coexistência')
  const c0 = await op('conferir_webhooks_historico')
  confere('conferir: lê os campos atuais e diz o que falta', c0.ok && c0.campos.includes('messages') && ['history', 'smb_message_echoes', 'smb_app_state_sync'].every(f => c0.faltam.includes(f)), c0)
  const i1 = await op('inscrever_webhooks_historico')
  const post = chamadas().filter(c => c.metodo === 'POST' && /subscriptions/.test(c.p))
  const campos = String(post.at(-1)?.fields || '').split(',')
  confere('inscrever: manda a união (os de antes + history, smb_message_echoes, smb_app_state_sync)', i1.ok && ['messages', 'message_echoes', 'history', 'smb_message_echoes', 'smb_app_state_sync'].every(f => campos.includes(f)), { i1, campos })
  confere('inscrever: nenhum campo de antes some', i1.ok && i1.perdeu?.length === 0 && i1.depois.includes('messages') && i1.depois.includes('message_echoes'), i1)
  confere('inscrever: chave do app (APP_ID|segredo), mesmo endereço, verify_token do webhook da Maia', post.at(-1)?.chave_ok && post.at(-1)?.verify_ok && post.at(-1)?.callback_url === 'https://carreiranodigital.com/api/maia/whats/webhook' && post.at(-1)?.object === 'whatsapp_business_account', post.at(-1))
  const i2 = await op('inscrever_webhooks_historico')
  confere('inscrever de novo: já está tudo, não manda nada', i2.ok && i2.mudou === false && chamadas().filter(c => c.metodo === 'POST' && /subscriptions/.test(c.p)).length === 1, i2)
  const semSenha = await fetch(URL_ + '/api/maia/operacao', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ acao: 'pedir_historico', negocio_id: A }) })
  confere('sem a senha da equipe: recusa', semSenha.status === 401 || semSenha.status === 403, semSenha.status)

  console.log('\n2. pedir o histórico')
  const p1 = await op('pedir_historico', { negocio_id: A })
  const smbA = chamadas().filter(c => c.sync_type && c.phone === '555000111')
  confere('A (conectado há 2 h): a Meta aceita', p1.ok && p1.http === 200 && !!p1.historico_pedido_em, p1)
  confere('A: contatos primeiro, depois o histórico, com a chave do negócio decifrada', smbA.length === 2 && smbA[0].sync_type === 'smb_app_state_sync' && smbA[1].sync_type === 'history' && smbA.every(c => c.chave_ok && c.messaging_product === 'whatsapp'), smbA)
  const waA = tab('negocios').find(x => x.id === A).meta.wa
  confere('A: grava historico_pedido_em e o resultado (request_id) em meta.wa', !!waA.historico_pedido_em && waA.historico?.mensagens?.request_id === 'req-history-555000111' && waA.historico?.contatos?.ok, waA.historico)
  confere('A: a resposta não leva a chave', !JSON.stringify(p1).includes('TOKEN-TESTE'))
  const p2 = await op('pedir_historico', { negocio_id: A })
  confere('A de novo: recusa (é uma vez só) e não chama a Meta', !p2.ok && p2.http === 400 && /uma vez/.test(p2.erro) && chamadas().filter(c => c.sync_type && c.phone === '555000111').length === 2, p2)
  const p3 = await op('pedir_historico', { negocio_id: B })
  confere('B (conectado há 25 h): recusa com o motivo das 24 h e não chama a Meta', !p3.ok && /24 h/.test(p3.erro) && !chamadas().some(c => c.phone === '555000333'), p3)
  const p4 = await op('pedir_historico', { negocio_id: C })
  const waC = tab('negocios').find(x => x.id === C).meta.wa
  confere('C: a Meta falha no histórico → erro claro, NÃO marca como pedido', !p4.ok && /não aceitou/.test(p4.erro) && !waC.historico_pedido_em && waC.historico?.contatos?.ok, { p4, h: waC.historico })
  const p5 = await op('pedir_historico', { negocio_id: C })
  const smbC = chamadas().filter(c => c.sync_type && c.phone === '555000222')
  confere('C de novo: pede só o que faltou (histórico), e agora passa', p5.ok && smbC.length === 3 && smbC.filter(c => c.sync_type === 'smb_app_state_sync').length === 1, { p5, smbC })
  const p6 = await op('pedir_historico', { negocio_id: 'nao-existe' })
  confere('negócio que não existe: erro', !p6.ok && p6.http === 400, p6)
  const p7 = await op('pedir_historico', { negocio_id: A, agora: new Date(Date.now() + 3 * 86400e3).toISOString() })
  confere('o relógio do modo de teste vale (e mesmo assim A segue recusado por já ter pedido)', !p7.ok, p7)

  console.log('\n3. os webhooks da coexistência')
  const msgsAntes = tab('msgs').length, convAntes = tab('conversas').length, msgApi = () => chamadas().filter(c => c.mensagem).length
  const msgApiAntes = msgApi()
  const thread = (tel, n) => ({ id: tel, context: { wa_id: tel }, messages: Array.from({ length: n }, (_, i) => ({ from: i % 2 ? '5551999990000' : tel, id: `wamid.HIST.${tel}.${i}`, timestamp: String(1739230955 + i), type: 'text', text: { body: i % 2 ? 'resposta antiga do negócio' : 'quanto custa? quero comprar' }, history_context: { status: 'READ' } })) })
  const h1 = await webhook(envelope('555000111', 'history', { history: [{ metadata: { phase: 0, chunk_order: 1, progress: 40 }, threads: [thread('5551988880001', 3), thread('5551988880002', 2)] }] }))
  const h2 = await webhook(envelope('555000111', 'history', { history: [{ metadata: { phase: 0, chunk_order: 2, progress: 100 }, threads: [thread('5551988880003', 4)] }] }))
  const hm = await webhook(envelope('555000111', 'history', { messages: [{ from: '5551988880001', id: 'wamid.HIST.MIDIA.1', timestamp: '1738796547', type: 'image', image: { caption: 'foto antiga', mime_type: 'image/jpeg', sha256: 'x', id: '123456' } }] }))
  const hr = await webhook(envelope('555000222', 'history', { history: [{ errors: [{ code: 2593109, title: 'History sync is turned off by the business from the WhatsApp Business App', message: 'History sync is turned off by the business from the WhatsApp Business App', error_data: { details: 'History sharing is turned off by the business' } }] }] }))
  const he = await webhook(envelope('555000111', 'smb_message_echoes', { message_echoes: [{ from: '5551999990000', to: '5551977770001', id: 'wamid.ECO.1', timestamp: '1739321024', type: 'text', text: { body: 'Oi! Respondi pelo celular' } }] }))
  const hc = await webhook(envelope('555000111', 'smb_app_state_sync', { state_sync: [{ type: 'contact', contact: { full_name: 'Cliente Antigo', first_name: 'Cliente', phone_number: '5551988880001' }, action: 'add', metadata: { timestamp: '1738346006' } }, { type: 'contact', contact: { full_name: 'Outro', first_name: 'Outro', phone_number: '5551988880002' }, action: 'add', metadata: { timestamp: '1738346007' } }] }))
  const todos = [h1, h2, hm, hr, he, hc]
  confere('todos respondem 200 (e rápido: < 3 s cada)', todos.every(x => x.http === 200 && x.ms < 3000), todos.map(x => [x.http, x.ms]))
  await ate(() => arquivos(A, 'historico').length >= 3 && arquivos(C, 'historico').length >= 1 && arquivos(A, 'echoes').length >= 1 && arquivos(A, 'contatos').length >= 1)
  const hA = arquivos(A, 'historico').sort()
  confere('history: os 2 pedaços guardados em negocios/<id>/historico/<fase>-<chunk>-<ts>.json', hA.some(f => /^0-1-\d+-\w+\.json$/.test(f)) && hA.some(f => /^0-2-\d+-\w+\.json$/.test(f)), hA)
  confere('history: a mídia (value.messages) guardada como midia-…', hA.some(f => /^midia-/.test(f)), hA)
  const bruto = JSON.parse(fs.readFileSync(path.join(PASTA, 'arquivos', 'negocios', A, 'historico', hA.find(f => f.startsWith('0-1-'))), 'utf8'))
  confere('history: o bruto guardado é o payload da Meta (threads e mensagens)', bruto.campo === 'history' && bruto.value.history[0].threads.length === 2 && bruto.waba_id === 'WABA-555000111', bruto)
  confere('recusado: guardado em historico/recusado-…', arquivos(C, 'historico').some(f => /^recusado-/.test(f)), arquivos(C, 'historico'))
  confere('echoes e contatos guardados nas pastas echoes/ e contatos/', arquivos(A, 'echoes').length === 1 && arquivos(A, 'contatos').length === 1)
  await ate(() => tab('eventos').filter(e => /^historico_(recebido|recusado|eco|contatos)$/.test(e.tipo)).length >= 6)
  const ev = tab('eventos')
  const rec = ev.filter(e => e.tipo === 'historico_recebido' && e.negocio_id === A)
  const e1 = rec.find(e => e.detalhe.chunk === 1), e2 = rec.find(e => e.detalhe.chunk === 2), em = rec.find(e => e.detalhe.midias === 1)
  confere('evento historico_recebido do pedaço 1: fase 0, progresso 40, 2 conversas, 5 mensagens', e1 && e1.detalhe.fase === 0 && e1.detalhe.progresso === 40 && e1.detalhe.conversas === 2 && e1.detalhe.mensagens === 5 && /historico\/0-1-/.test(e1.detalhe.caminho), e1)
  confere('evento historico_recebido do pedaço 2: progresso 100, 4 mensagens', e2 && e2.detalhe.progresso === 100 && e2.detalhe.mensagens === 4, e2)
  confere('evento da mídia do histórico', !!em, rec)
  const er = ev.find(e => e.tipo === 'historico_recusado' && e.negocio_id === C)
  confere('2593109 vira historico_recusado (com o código)', er && er.detalhe.erros?.[0]?.codigo === 2593109, er)
  confere('eventos do eco e dos contatos (com as quantidades)', ev.some(e => e.tipo === 'historico_eco' && e.detalhe.mensagens === 1) && ev.some(e => e.tipo === 'historico_contatos' && e.detalhe.contatos === 2))

  await espera(1500)   // a espera do webhook (MAIA_ESPERA_MS=300) já teria passado
  const msgs = tab('msgs'), convs = tab('conversas')
  confere('o histórico NÃO vira mensagem (nenhum wamid do histórico em msgs)', !msgs.some(m => String(m.wamid || '').startsWith('wamid.HIST')), msgs.filter(m => String(m.wamid || '').startsWith('wamid.HIST')))
  confere('o histórico e os contatos NÃO abrem conversa', !convs.some(c => /^555198888000/.test(String(c.telefone))), convs.map(c => c.telefone))
  confere('o eco entra só como fala do dono (o que já era assim), sem nenhuma fala de cliente nem da Maia', msgs.length - msgsAntes === 1 && msgs.at(-1).autor === 'dono' && convs.length - convAntes === 1, msgs.slice(msgsAntes))
  confere('ninguém recebeu mensagem: nenhum POST /messages na Meta', msgApi() === msgApiAntes, chamadas().filter(c => c.mensagem))
  confere('nenhuma tarefa nova da IA', !tab('tarefas').length || tab('tarefas').every(t => !/HIST/.test(JSON.stringify(t))))

  console.log('\n4. segurança e robustez do webhook')
  const sa = await webhook(envelope('555000111', 'history', { history: [] }), { assina: false })
  confere('sem assinatura: 401', sa.http === 401, sa)
  const jr = await webhook(null, { bruto: '{isso não é json' })
  confere('JSON quebrado (assinado): 200, sem derrubar', jr.http === 200, jr)
  const desc = await webhook(envelope('999999999', 'history', { history: [{ metadata: { phase: 1, chunk_order: 1, progress: 10 }, threads: [] }] }))
  confere('número que não é de nenhum negócio: 200, nada guardado', desc.http === 200, desc)

  console.log('\n5. controle: uma mensagem normal (campo messages) ainda entra no atendimento')
  const antes = tab('msgs').length
  const n1 = await webhook(envelope('555000111', 'messages', { contacts: [{ wa_id: '5551966660001', profile: { name: 'Nova' } }], messages: [{ from: '5551966660001', id: 'wamid.NOVA.1', timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'Oi, vocês abrem sábado?' } }] }))
  const entrou = await ate(() => tab('msgs').length > antes && tab('msgs').some(m => m.wamid === 'wamid.NOVA.1' && m.autor === 'cliente'), 8000)
  confere('mensagem nova de cliente entra como sempre (o filtro não travou o atendimento)', n1.http === 200 && entrou)

  console.log(`\n${ok} ok, ${falha} falha(s)`)
  process.exit(falha ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })
