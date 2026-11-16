// Maia: o LANÇAMENTO pra base da escola (15/11/2026). A base: as etapas do funil "Lançamento Maia", o banco (maia_lanc_*),
// o envio pelo número da escola (51 99505-4548, API oficial) e o aviso pro Guto.
//
// Tudo só roda com MAIA_LANCAMENTO_LIGADO=1 (o webhook da escola só chama isto com a chave ligada). No modo de teste
// (MAIA_LOCAL=1) nada sai pra Meta: as mensagens ficam só no arquivo local.
import crypto from 'node:crypto'
import { maiaDb as db, maiaLocal } from '../db'

export const lancamentoLigado = () => process.env.MAIA_LANCAMENTO_LIGADO === '1' || maiaLocal()
// 16/11: a ENTREGA NOVA (as peças dentro do WhatsApp, o botão "Testar agora", o acompanhamento depois da amostra e a página
// no formato da JamRock). Desligada = tudo como era. Ver lib/maia/lancamento/entrega.ts, conteudo.ts e pagina.ts
export const entregaV2 = () => process.env.MAIA_LANC_ENTREGA_V2 === '1'

// o número da escola (o mesmo do site e dos anúncios): o teste ao vivo abre o WhatsApp nele
export const WHATS_ESCOLA = () => (process.env.MAIA_LANC_WHATS || '5551995054548').replace(/\D/g, '')
export const SITE = () => (process.env.MAIA_LANC_SITE || 'https://www.carreiranodigital.com').replace(/\/+$/, '')

export const ETAPAS: { chave: string; nome: string }[] = [
  { chave: 'na_lista', nome: 'Na lista' },
  { chave: 'disparado', nome: 'Disparado' },
  { chave: 'quero_ver', nome: 'Quero ver' },
  { chave: 'coletando', nome: 'Coletando' },
  { chave: 'material_recebido', nome: 'Material recebido' },
  { chave: 'em_producao', nome: 'Amostra em produção' },
  { chave: 'amostra_entregue', nome: 'Amostra entregue' },
  { chave: 'testou', nome: 'Testou' },
  { chave: 'fechamento', nome: 'Fechamento (Rick)' },
  { chave: 'implantacao_marcada', nome: 'Implantação marcada' },
  { chave: 'pago', nome: 'Pago' },
  { chave: 'agora_nao', nome: 'Agora não' },
  { chave: 'perdido', nome: 'Perdido' },
]
export const ORDEM = Object.fromEntries(ETAPAS.map((e, i) => [e.chave, i])) as Record<string, number>
export const nomeEtapa = (k: string) => ETAPAS.find(e => e.chave === k)?.nome || k
// sobe de etapa só pra frente (Agora não e Perdido ficam fora da ordem: só mudam de propósito)
export const avanca = (atual: string, nova: string) => (ORDEM[nova] > ORDEM[atual] && ORDEM[atual] <= ORDEM.pago ? nova : atual)

export const primeiroNome = (s: any) => { const p = String(s || '').trim().split(/\s+/)[0] || ''; return /^\d|^tudo$/i.test(p) ? '' : p }
const r12 = () => crypto.randomBytes(9).toString('base64url')

// ---------- telefone: a Meta às vezes manda o celular brasileiro sem o 9 ----------
export const soDigitos = (t: any) => String(t || '').replace(/\D/g, '')
export function variantes(tel: string) {
  let t = soDigitos(tel)
  if (t && !t.startsWith('55') && t.length >= 10 && t.length <= 11) t = '55' + t
  const alt = /^55\d{10}$/.test(t) ? t.slice(0, 4) + '9' + t.slice(4) : /^55\d{2}9\d{8}$/.test(t) ? t.slice(0, 4) + t.slice(5) : ''
  return [t, alt].filter(Boolean)
}

// ---------- banco ----------
const PADRAO = () => ({ etapa: 'na_lista', coleta: {}, estado: {}, amostra: {}, aberturas: 0, versao: 'contato' })
export async function contatoDoTelefone(tel: string) {
  for (const t of variantes(tel)) {
    const c = (await db.um('lanc_contatos', { telefone: t })) || (await db.um('lanc_contatos', { wa_id: t }))
    if (c) return c
  }
  return null
}
export const contato = (id: string) => db.um('lanc_contatos', { id })
export const contatoDoToken = (token: string) => (/^[\w-]{8,40}$/.test(token) ? db.um('lanc_contatos', { token }) : Promise.resolve(null))
export async function salva(c: any, campos: Record<string, any>) {
  const [n] = await db.atualiza('lanc_contatos', { id: c.id }, { ...campos, atualizado_em: new Date().toISOString() })
  Object.assign(c, n || campos)
  return c
}
// mistura nos JSON (coleta, estado, amostra) sem apagar o resto
export async function salvaJson(c: any, campo: 'coleta' | 'estado' | 'amostra', parte: Record<string, any>) {
  const atual = (await contato(c.id)) || c
  return salva(c, { [campo]: { ...(atual[campo] || {}), ...parte } })
}
export async function novoContato(linha: Record<string, any>) {
  return db.insere('lanc_contatos', { ...PADRAO(), token: r12(), criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString(), ...linha })
}
export const garanteToken = async (c: any) => c.token || (await salva(c, { token: r12() })).token

export const msgs = (contato_id: string) => db.lista('lanc_msgs', { contato_id }, { ordem: 'criado_em' })
export const midias = (contato_id: string) => db.lista('lanc_midias', { contato_id }, { ordem: 'criado_em' })
export async function registra(c: any, m: { direcao: 'entrada' | 'saida'; autor: string; tipo?: string; texto?: string | null; midia_id?: string | null; mime?: string | null; wamid?: string | null; ok?: boolean; erro?: string | null; processado?: boolean }) {
  const agora = new Date().toISOString()
  const linha = await db.insere('lanc_msgs', { contato_id: c.id, tipo: 'texto', processado: m.direcao === 'saida', criado_em: agora, ...m })
  await salva(c, m.direcao === 'entrada' ? { ultima_entrada_em: agora } : { ultima_saida_em: agora })
  return linha
}
export const evento = (tipo: string, detalhe: any = {}) => db.evento(tipo, null, detalhe)

// ---------- a janela de 24 h (a última mensagem da pessoa) ----------
export const janelaAte = (c: any) => (c.ultima_entrada_em ? Date.parse(c.ultima_entrada_em) + 24 * 3600e3 : 0)
export const janelaAberta = (c: any, folgaMin = 2, agora = Date.now()) => janelaAte(c) - agora > folgaMin * 60e3

// ---------- envio pelo número da escola ----------
type Envio = { ok: boolean; wamid?: string | null; error?: string }
const simulado = (para: string) => maiaLocal() || /^55000/.test(para)
const paraDe = (c: any) => c.wa_id || c.telefone

// espelha a mensagem que saiu na conversa do CRM (caixa de Disparos/Entrada), pra o time ver o que a Maia falou
async function espelhaCrm(c: any, tipo: string, texto: string, r: Envio, midia?: { url: string; mime: string }) {
  if (simulado(paraDe(c))) return
  try {
    const { supabaseAdmin: sb } = await import('@/lib/supabase-admin')
    const { ORG_CND } = await import('@/lib/org')
    const tels = variantes(paraDe(c))
    const { data: conv } = await sb.from('wa_conversas').select('id').in('telefone', tels).eq('canal', 'oficial').limit(1).maybeSingle()
    if (!conv) return
    await sb.from('wa_mensagens').insert({ org_id: ORG_CND, conversa_id: conv.id, zapi_id: r.wamid || null, direcao: 'enviada', tipo, texto: '[Maia] ' + texto, midia_url: midia?.url || null, midia_mime: midia?.mime || null, status: r.ok ? 'enviada' : 'falha', canal: 'oficial', enviado_por: null })
    await sb.from('wa_conversas').update({ ultima_msg: ('Maia: ' + texto).slice(0, 200), ultima_msg_em: new Date().toISOString() }).eq('id', conv.id)
  } catch { /* espelhar nunca derruba o envio */ }
}

export async function mandaTexto(c: any, texto: string, autor: 'maia' | 'equipe' | 'sistema' = 'maia') {
  const para = paraDe(c)
  let r: Envio
  if (simulado(para)) r = { ok: true, wamid: 'local-' + r12() }
  else { const { enviarTexto } = await import('@/lib/whatsapp-oficial'); r = await enviarTexto(para, texto, { preview: /https?:\/\//.test(texto) }) }
  await registra(c, { direcao: 'saida', autor, tipo: 'texto', texto, wamid: r.wamid || null, ok: r.ok, erro: r.ok ? null : String(r.error || '').slice(0, 300) })
  await espelhaCrm(c, 'texto', texto, r)
  return r
}
export async function mandaMidia(c: any, tipo: 'image' | 'video', link: string, legenda: string, mime: string, path?: string | null) {
  const para = paraDe(c)
  let r: Envio
  if (simulado(para)) r = { ok: true, wamid: 'local-' + r12() }
  else { const { enviarMidiaLink } = await import('@/lib/whatsapp-oficial'); r = await enviarMidiaLink(para, tipo, link, legenda || undefined) }
  await registra(c, { direcao: 'saida', autor: 'maia', tipo: tipo === 'image' ? 'imagem' : 'video', texto: legenda, mime, midia_id: path || null, wamid: r.wamid || null, ok: r.ok, erro: r.ok ? null : String(r.error || '').slice(0, 300) })
  await espelhaCrm(c, tipo === 'image' ? 'imagem' : 'video', legenda, r, { url: link, mime })
  return r
}
// botões de resposta rápida (só dentro das 24 h); o clique volta como texto (o título do botão)
export async function mandaBotoes(c: any, corpo: string, botoes: { id: string; titulo: string }[]) {
  const para = paraDe(c)
  let r: Envio
  if (simulado(para)) r = { ok: true, wamid: 'local-' + r12() }
  else { const { enviarBotoes } = await import('@/lib/whatsapp-oficial'); r = await enviarBotoes(para, corpo, botoes) }
  const registro = `${corpo}\n[botões: ${botoes.map(b => b.titulo).join(' | ')}]`
  await registra(c, { direcao: 'saida', autor: 'maia', tipo: 'botoes', texto: registro, wamid: r.wamid || null, ok: r.ok, erro: r.ok ? null : String(r.error || '').slice(0, 300) })
  await espelhaCrm(c, 'texto', registro, r)
  return r
}
// fora das 24 h só modelo aprovado pela Meta. params = as variáveis do corpo; botaoUrl = o final do link do botão (se o modelo tiver)
// imagem = o link da imagem do cabeçalho (só nos modelos com cabeçalho de imagem)
export async function mandaModelo(c: any, nome: string, params: string[], registro: string, botaoUrl?: string | null, imagem?: string | null) {
  const para = paraDe(c)
  let r: Envio
  if (simulado(para)) r = { ok: true, wamid: 'local-' + r12() }
  else {
    const { enviarTemplate } = await import('@/lib/whatsapp-oficial')
    const comps: any[] = [{ type: 'body', parameters: params.map(t => ({ type: 'text', text: t })) }]
    if (imagem) comps.unshift({ type: 'header', parameters: [{ type: 'image', image: { link: imagem } }] })
    if (botaoUrl) comps.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: botaoUrl }] })
    r = await enviarTemplate(para, nome, 'pt_BR', comps)
  }
  await registra(c, { direcao: 'saida', autor: 'sistema', tipo: 'modelo', texto: `[modelo ${nome}] ${registro}`, wamid: r.wamid || null, ok: r.ok, erro: r.ok ? null : String(r.error || '').slice(0, 300) })
  await espelhaCrm(c, 'texto', `[modelo ${nome}] ${registro}`, r)
  return r
}

// ---------- a mídia que a pessoa mandou: baixa da Meta e guarda no bucket "maia" ----------
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/3gpp': '3gp' }
export const extDe = (mime: string) => EXT[String(mime || '').split(';')[0].trim()] || (/^video/.test(mime) ? 'mp4' : 'jpg')
export async function guardaMidia(c: any, m: { midia_id?: string | null; mime?: string | null; b64?: string | null }, origem = 'contato') {
  let buf: Buffer | null = null, mime = String(m.mime || 'image/jpeg')
  if (m.b64) buf = Buffer.from(m.b64, 'base64')
  else if (m.midia_id && !maiaLocal()) {
    const { baixarMidia } = await import('@/lib/whatsapp-oficial')
    const r = await baixarMidia(m.midia_id)
    if (!r.ok || !r.buffer) throw new Error('não baixou a mídia: ' + (r.error || '?'))
    buf = Buffer.from(r.buffer); mime = r.mime || mime
  }
  if (!buf || !buf.length) throw new Error('mídia vazia')
  const tipo = /^video\//.test(mime) ? 'video' : 'foto'
  const path = await db.sobe(`lanc-${c.id}/midias/${r12().slice(0, 10)}.${extDe(mime)}`, buf, mime)
  return db.insere('lanc_midias', { contato_id: c.id, tipo, origem, path, mime, criado_em: new Date().toISOString() })
}

// ---------- aviso pro Guto (WhatsApp pelo número da Maia, o mesmo caminho da /api/maia/avisar-guto) + o celular (ntfy) ----------
// Só vai primeiro nome + negócio: nada de telefone nem resposta da coleta.
export async function avisaGuto(titulo: string, texto: string, urgente = false) {
  await evento('lanc_aviso', { titulo, texto })
  const { avisaEquipe } = await import('../canal')
  await avisaEquipe(titulo, texto, null, urgente).catch(() => null)
  if (maiaLocal() || process.env.MAIA_SEM_AVISO === '1') return { ok: true, local: true }
  try {
    const { supabaseAdmin: sb } = await import('@/lib/supabase-admin')
    const { data } = await sb.from('usuarios_perfil').select('whatsapp').eq('email', 'guto.wickert@gmail.com').limit(1)
    const w = soDigitos(data?.[0]?.whatsapp)
    if (!w) return { ok: false, erro: 'sem whatsapp no perfil' }
    const { enviaTexto, conversaDe, registraSaida } = await import('@/lib/oito/wa')
    const cv = await conversaDe(w.length <= 11 ? '55' + w : w)
    const t = `Lançamento da Maia · ${titulo}\n${texto}`
    const r = await enviaTexto(cv.telefone, t)
    await registraSaida(cv, 'sistema', t, r)
    return { ok: r.ok }
  } catch (e: any) { return { ok: false, erro: String(e?.message || e) } }
}

// ---------- horas em Brasília (o servidor é UTC) ----------
export const horaBR = (d = new Date()) => (d.getUTCHours() + 21) % 24
export const diaSemanaBR = (d = new Date()) => new Date(d.getTime() - 3 * 3600e3).getUTCDay()
// um instante em Brasília (data AAAA-MM-DD + hora) → ISO
export const instanteBR = (dia: string, h: number, min = 0) => new Date(`${dia}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00-03:00`).toISOString()
export const diaBR = (d = new Date()) => new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10)
const somaDia = (dia: string, n: number) => { const d = new Date(dia + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
// o dia da entrega: amanhã (domingo pula pra segunda)
export function diaDaEntrega(agora = new Date()) {
  let d = somaDia(diaBR(agora), 1)
  if (new Date(d + 'T12:00:00Z').getUTCDay() === 0) d = somaDia(d, 1)
  return d
}
export function diaFalado(dia: string, agora = new Date()) {
  const amanha = somaDia(diaBR(agora), 1)
  const sem = new Date(dia + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'UTC' })
  const dm = dia.slice(8, 10) + '/' + dia.slice(5, 7)
  return dia === amanha ? `amanhã (${sem}, ${dm})` : `${sem}, ${dm}`
}
export const quandoFalado = (iso: string, agora = new Date()) => `${diaFalado(diaBR(new Date(iso)), agora)}, às ${horaBR(new Date(iso))}h`
