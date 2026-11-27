// Maia: o histórico do app WhatsApp Business na coexistência (27/11).
// Quem conecta pelo cadastro incorporado em coexistência pode trazer até 180 dias de conversas do app do celular. Regras da Meta
// (developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users):
//   - em até 24 h depois da conexão, e UMA VEZ SÓ, o parceiro pede POST /<PHONE_NUMBER_ID>/smb_app_data com
//     {"messaging_product":"whatsapp","sync_type":"smb_app_state_sync"} (contatos, 1º) e depois {"sync_type":"history"}.
//     A resposta ({request_id}) só diz que a Meta aceitou o pedido, não que o dono aceitou compartilhar.
//     Passou de 24 h ou já pediu: só desconectando o número e conectando de novo.
//   - o resultado chega no webhook: campo "history" (fases 0, 1 e 2, em pedaços fora de ordem, com progresso 0 a 100; mídia
//     das últimas 2 semanas vem no mesmo campo, mas em value.messages; o dono recusou → erro 2593109), "smb_app_state_sync"
//     (contatos) e "smb_message_echoes" (o que o dono manda pelo app a partir de agora).
//   - o app precisa estar inscrito nesses campos (inscrição do app, POST /<APP_ID>/subscriptions, com a chave do app).
// Nada disso vira conversa nem resposta: o bruto fica guardado no armazenamento (bucket privado "maia") e um evento registra.
import { maiaDb as db } from './db'
import { tokenWa } from './segredo'

const GRAPH = 'https://graph.facebook.com/v25.0'
const APP_ID = () => process.env.MAIA_META_APP_ID || '2069913353660247'          // app "Sistema CND" (o mesmo da conexão)
const APP_SECRET = () => process.env.MAIA_META_APP_SECRET || process.env.META_APP_SECRET || ''
export const PRAZO_MS = 24 * 3600e3
export const CODIGO_RECUSADO = 2593109
// os campos de webhook que a coexistência pede além dos de sempre (account_update a Meta também lista: entra junto)
export const CAMPOS_COEXISTENCIA = ['history', 'smb_message_echoes', 'smb_app_state_sync', 'account_update']
export const CAMPOS_GUARDADOS = new Set(['history', 'smb_message_echoes', 'smb_app_state_sync'])

// ---------------------------------------------------------------------------------------------------------------------------
// 1) o que chega no webhook: guarda o bruto e registra o evento (nunca responde, nunca cria conversa)

const PASTA: Record<string, string> = { history: 'historico', smb_message_echoes: 'echoes', smb_app_state_sync: 'contatos' }
const num = (x: any) => (x == null || x === '' || isNaN(Number(x)) ? null : Number(x))
const parte = (x: any) => String(x ?? 'x').replace(/[^\w.-]/g, '').slice(0, 20) || 'x'

// o resumo de um "value" do campo history (pode ter vários blocos; cada bloco tem fase, pedaço e progresso, ou erros)
export function resumoHistorico(v: any) {
  const blocos = Array.isArray(v?.history) ? v.history : []
  const fases = new Set<number>(), pedacos = new Set<number>(), erros: { codigo: number | null; titulo: string }[] = []
  let progresso: number | null = null, conversas = 0, mensagens = 0
  for (const h of blocos) {
    const m = h?.metadata || {}
    if (num(m.phase) != null) fases.add(num(m.phase)!)
    if (num(m.chunk_order) != null) pedacos.add(num(m.chunk_order)!)
    if (num(m.progress) != null) progresso = Math.max(progresso ?? 0, num(m.progress)!)
    for (const t of h?.threads || []) { conversas++; mensagens += (t?.messages || []).length }
    for (const e of h?.errors || []) erros.push({ codigo: num(e?.code), titulo: String(e?.title || e?.message || '').slice(0, 200) })
  }
  // mídia do histórico (últimas 2 semanas): vem no campo history, mas em value.messages
  const midias = Array.isArray(v?.messages) ? v.messages.length : 0
  return {
    fase: fases.size ? Math.max(...fases) : null, fases: [...fases], chunk: pedacos.size ? Math.min(...pedacos) : null, chunks: [...pedacos],
    progresso, conversas, mensagens, midias, erros, recusado: erros.some(e => e.codigo === CODIGO_RECUSADO),
  }
}

// o caminho no armazenamento: negocios/<id>/historico/<fase>-<chunk>-<timestamp>.json (echoes/ e contatos/ só com o timestamp)
export function caminhoDoBruto(negocio_id: string, campo: string, r: ReturnType<typeof resumoHistorico> | null, agora = Date.now()) {
  const ts = `${agora}-${Math.random().toString(36).slice(2, 8)}`   // dois pedaços no mesmo milissegundo não se sobrescrevem
  const pasta = `negocios/${negocio_id}/${PASTA[campo] || 'outros'}`
  if (campo !== 'history') return `${pasta}/${ts}.json`
  const fase = r?.recusado ? 'recusado' : r?.midias && !r.conversas ? 'midia' : parte(r?.fase)
  return `${pasta}/${fase}-${parte(r?.chunk)}-${ts}.json`
}

// guarda um "change" de um desses campos. Tenta 2 vezes; se o armazenamento falhar, o evento registra a falha (com o resumo)
export async function guardaDaCoexistencia(neg: any, campo: string, change: any, entradaId: string | null = null) {
  const v = change?.value || {}
  const r = campo === 'history' ? resumoHistorico(v) : null
  const caminho = caminhoDoBruto(neg.id, campo, r)
  const bruto = Buffer.from(JSON.stringify({ recebido_em: new Date().toISOString(), campo, waba_id: entradaId, value: v }), 'utf8')
  let guardou = false, falha: string | null = null
  for (let i = 0; i < 2 && !guardou; i++) {
    try { await db.sobe(caminho, bruto, 'application/json'); guardou = true } catch (e: any) { falha = String(e?.message || e).slice(0, 200) }
  }
  const base = { caminho: guardou ? caminho : null, bytes: bruto.length, ...(guardou ? {} : { falha_ao_guardar: falha }) }
  let tipo: string, detalhe: any
  if (campo === 'history') {
    tipo = r!.recusado ? 'historico_recusado' : 'historico_recebido'
    detalhe = { ...base, fase: r!.fase, fases: r!.fases, chunk: r!.chunk, chunks: r!.chunks, progresso: r!.progresso, conversas: r!.conversas, mensagens: r!.mensagens, midias: r!.midias, ...(r!.erros.length ? { erros: r!.erros } : {}) }
  } else if (campo === 'smb_message_echoes') {
    tipo = 'historico_eco'
    detalhe = { ...base, mensagens: (v.message_echoes || []).length }
  } else {
    tipo = 'historico_contatos'
    detalhe = { ...base, contatos: (v.state_sync || []).length }
  }
  await db.evento(tipo, neg.id, detalhe)
  // a equipe fica sabendo só do que importa: recusou, terminou (progresso 100) ou não conseguiu guardar
  const { avisaEquipe } = await import('./canal')
  if (tipo === 'historico_recusado') await avisaEquipe('histórico do WhatsApp recusado', `${neg.nome}: o dono não liberou o compartilhamento do histórico no app WhatsApp Business (erro ${CODIGO_RECUSADO}).`, neg.id).catch(() => null)
  else if (campo === 'history' && r!.progresso === 100) await avisaEquipe('histórico do WhatsApp completo', `${neg.nome}: a Meta terminou de mandar o histórico (progresso 100%).`, neg.id).catch(() => null)
  if (!guardou) await avisaEquipe('histórico do WhatsApp não foi guardado', `${neg.nome}: chegou um pedaço (${campo}) e o armazenamento falhou: ${falha}`, neg.id, true).catch(() => null)
  return { tipo, detalhe }
}

// ---------------------------------------------------------------------------------------------------------------------------
// 2) o pedido do histórico (uma vez só, até 24 h depois da conexão)

type Chamada = { ok: boolean; request_id?: string | null; erro?: string; codigo?: number | null; em: string }

async function smbAppData(phoneId: string, token: string, sync_type: 'smb_app_state_sync' | 'history'): Promise<Chamada> {
  const em = new Date().toISOString()
  try {
    const r = await fetch(`${GRAPH}/${phoneId}/smb_app_data`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', sync_type }), signal: AbortSignal.timeout(20000),
    })
    const j: any = await r.json().catch(() => ({}))
    if (!r.ok || j?.error) return { ok: false, erro: String(j?.error?.message || `HTTP ${r.status}`).slice(0, 300), codigo: j?.error?.code ?? null, em }
    return { ok: true, request_id: j?.request_id ? String(j.request_id) : null, em }
  } catch (e: any) { return { ok: false, erro: String(e?.message || 'falha na chamada').slice(0, 300), codigo: null, em } }
}

async function gravaWa(negocio_id: string, muda: (wa: any) => any) {
  const atual = await db.um('negocios', { id: negocio_id })
  const wa = muda({ ...(atual?.meta?.wa || {}) })
  await db.atualiza('negocios', { id: negocio_id }, { meta: { ...(atual?.meta || {}), wa } })
  return wa
}

// devolve { ok, ... } ou { ok: false, erro } com a explicação. Contatos primeiro, depois as mensagens (a ordem da Meta).
// O que a Meta já aceitou não é pedido de novo: se os contatos passaram e as mensagens falharam, a próxima tentativa (ainda nas
// 24 h) pede só as mensagens. historico_pedido_em só é gravado quando a Meta aceita o pedido das mensagens: daí em diante, recusa.
export async function pedeHistorico(negocio_id: string, agora = new Date()) {
  const neg = await db.um('negocios', { id: negocio_id })
  if (!neg) return { ok: false as const, erro: 'negócio não existe' }
  const wa = neg.meta?.wa || {}
  if (!neg.wa_phone_id || !wa.token) return { ok: false as const, erro: 'o WhatsApp desse negócio não está conectado' }
  if (!/^\d{5,25}$/.test(String(neg.wa_phone_id))) return { ok: false as const, erro: 'o número conectado (phone_number_id) está estranho' }
  if (wa.historico_pedido_em) return { ok: false as const, erro: `o histórico já foi pedido em ${String(wa.historico_pedido_em).slice(0, 16).replace('T', ' ')} (UTC). A Meta só deixa pedir uma vez por conexão; pra pedir de novo, o dono desconecta o número e conecta outra vez.`, historico: wa.historico || null }
  const conectado = Date.parse(wa.conectado_em || '')
  if (!conectado) return { ok: false as const, erro: 'não tem a data da conexão do WhatsApp (meta.wa.conectado_em): não dá pra saber se está dentro das 24 h' }
  const passou = agora.getTime() - conectado
  if (passou > PRAZO_MS) return { ok: false as const, erro: `passaram ${Math.floor(passou / 3600e3)} h da conexão (${String(wa.conectado_em).slice(0, 16).replace('T', ' ')} UTC). A Meta só aceita o pedido do histórico até 24 h depois de conectar; agora só desconectando o número e conectando de novo.` }
  // trava contra dois cliques: um pedido em andamento há menos de 2 min
  if (wa.historico?.pedindo_em && agora.getTime() - Date.parse(wa.historico.pedindo_em) < 120e3) return { ok: false as const, erro: 'já tem um pedido do histórico em andamento. Espera 2 minutos e confere de novo.' }
  const token = tokenWa(neg)
  if (!token) return { ok: false as const, erro: 'a chave do WhatsApp desse negócio não abriu (MAIA_CRIPTO_CHAVE mudou?). Precisa conectar de novo.' }

  await gravaWa(neg.id, w => ({ ...w, historico: { ...(w.historico || {}), pedindo_em: agora.toISOString() } }))
  const ant = wa.historico || {}
  const contatos: Chamada = ant.contatos?.ok ? ant.contatos : await smbAppData(String(neg.wa_phone_id), token, 'smb_app_state_sync')
  const mensagens: Chamada = await smbAppData(String(neg.wa_phone_id), token, 'history')
  const pediu = mensagens.ok
  const novo = await gravaWa(neg.id, w => {
    const h = { ...(w.historico || {}), contatos, mensagens, pedindo_em: null, tentativas: (w.historico?.tentativas || 0) + 1 }
    return { ...w, historico: h, ...(pediu ? { historico_pedido_em: mensagens.em } : {}) }
  })
  await db.evento(pediu ? 'historico_pedido' : 'historico_pedido_falhou', neg.id, {
    contatos: { ok: contatos.ok, request_id: contatos.request_id || null, erro: contatos.erro || null, codigo: contatos.codigo ?? null },
    mensagens: { ok: mensagens.ok, request_id: mensagens.request_id || null, erro: mensagens.erro || null, codigo: mensagens.codigo ?? null },
  })
  if (!pediu) return { ok: false as const, erro: 'a Meta não aceitou o pedido do histórico: ' + (mensagens.erro || '?') + (contatos.ok ? ' (os contatos passaram)' : ' · contatos: ' + (contatos.erro || '?')), historico: novo.historico }
  return { ok: true as const, historico_pedido_em: novo.historico_pedido_em, contatos, mensagens, aviso: 'A Meta aceitou o pedido. O histórico chega pelo webhook em pedaços (pode levar horas); cada pedaço vira um evento historico_recebido. Se o dono recusou no app, chega historico_recusado.' }
}

// ---------------------------------------------------------------------------------------------------------------------------
// 3) a inscrição do app nos campos da coexistência (lê o que já está inscrito e manda a união: nunca tira campo)

// o verify_token que o endereço do webhook do app espera (a Meta pode chamar o GET de verificação ao mudar a inscrição)
function verifyDoEndereco(url: string) {
  const p = (() => { try { return new URL(url).pathname.replace(/\/+$/, '') } catch { return '' } })()
  if (p === '/api/maia/whats/webhook') return process.env.MAIA_WA_VERIFY_TOKEN || 'maia-wa-2026'
  if (p === '/api/oito/whats/webhook') return process.env.OITO_WA_VERIFY_TOKEN || 'oito-wa-2026'
  if (p === '/api/wa-oficial/webhook') return process.env.WA_OFICIAL_VERIFY_TOKEN || 'cnd-wa-2026'
  return process.env.MAIA_APP_WEBHOOK_VERIFY_TOKEN || ''
}

const chaveApp = () => `${APP_ID()}|${APP_SECRET()}`

async function leInscricao() {
  if (!APP_SECRET()) return { ok: false as const, erro: 'falta o segredo do app no servidor (MAIA_META_APP_SECRET)' }
  try {
    const r = await fetch(`${GRAPH}/${APP_ID()}/subscriptions`, { headers: { Authorization: 'Bearer ' + chaveApp() }, signal: AbortSignal.timeout(15000) })
    const j: any = await r.json().catch(() => ({}))
    if (!r.ok || j?.error) return { ok: false as const, erro: 'a Meta não devolveu a inscrição do app: ' + String(j?.error?.message || r.status).slice(0, 200) }
    const s = (j.data || []).find((x: any) => x?.object === 'whatsapp_business_account') || null
    const campos: string[] = (s?.fields || []).map((f: any) => (typeof f === 'string' ? f : f?.name)).filter(Boolean)
    return { ok: true as const, existe: !!s, callback_url: s?.callback_url ? String(s.callback_url) : null, ativa: s ? s.active !== false : false, campos,
      versoes: Object.fromEntries((s?.fields || []).filter((f: any) => f?.name).map((f: any) => [f.name, f.version || null])) }
  } catch (e: any) { return { ok: false as const, erro: 'falha ao ler a inscrição do app: ' + String(e?.message || e).slice(0, 200) } }
}

// só lê (o "conferir inscrição")
export async function confereInscricaoApp() {
  const l = await leInscricao()
  if (!l.ok) return l
  const faltam = CAMPOS_COEXISTENCIA.filter(c => !l.campos.includes(c))
  return { ...l, app_id: APP_ID(), faltam, completo: l.existe && !faltam.length }
}

export async function garanteInscricaoApp() {
  const antes = await confereInscricaoApp()
  if (!antes.ok) return antes
  if (antes.completo) return { ...antes, mudou: false, aviso: 'o app já está inscrito em todos os campos da coexistência: nada a fazer' }
  if (!antes.existe || !antes.callback_url) return { ok: false as const, erro: 'o app ainda não tem inscrição de webhook do WhatsApp (whatsapp_business_account). Configura o endereço no painel do app (WhatsApp > Configuração) antes: não vou escolher um endereço sozinho.', antes }
  const verify = verifyDoEndereco(antes.callback_url)
  if (!verify) return { ok: false as const, erro: `não sei o verify_token do endereço ${antes.callback_url}. Põe na Vercel MAIA_APP_WEBHOOK_VERIFY_TOKEN com o token desse endereço e tenta de novo.`, antes }
  const uniao = [...new Set([...antes.campos, ...CAMPOS_COEXISTENCIA])]
  const corpo = new URLSearchParams({ object: 'whatsapp_business_account', callback_url: antes.callback_url, fields: uniao.join(','), include_values: 'true', verify_token: verify })
  try {
    const r = await fetch(`${GRAPH}/${APP_ID()}/subscriptions`, { method: 'POST', headers: { Authorization: 'Bearer ' + chaveApp(), 'Content-Type': 'application/x-www-form-urlencoded' }, body: corpo.toString(), signal: AbortSignal.timeout(20000) })
    const j: any = await r.json().catch(() => ({}))
    if (!r.ok || j?.error || j?.success === false) return { ok: false as const, erro: 'a Meta recusou a inscrição: ' + String(j?.error?.message || r.status).slice(0, 200), antes }
  } catch (e: any) { return { ok: false as const, erro: 'falha ao inscrever: ' + String(e?.message || e).slice(0, 200), antes } }
  const depois = await confereInscricaoApp()
  const perdeu = depois.ok ? antes.campos.filter(c => !depois.campos.includes(c)) : []
  await db.evento('webhooks_historico_inscritos', null, { antes: antes.campos, depois: depois.ok ? depois.campos : null, perdeu })
  return { ok: depois.ok && depois.completo && !perdeu.length, mudou: true, antes: antes.campos, depois: depois.ok ? depois.campos : null, faltam: depois.ok ? depois.faltam : null, perdeu, callback_url: antes.callback_url, ...(depois.ok ? {} : { erro: 'inscreveu, mas não consegui conferir: ' + depois.erro }) }
}
