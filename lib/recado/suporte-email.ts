// Recado Encantado: a caixa do contato@ (Titan) dentro do painel (11/10).
// Lê por IMAP o que chegou (sem marcar nada como lido lá) e junta em conversas (recado_suporte + recado_suporte_msgs).
// A resposta dada no painel sai pelo Resend, do contato@, no mesmo fio (In-Reply-To), e a resposta do cliente volta pra caixa.
// Precisa de RECADO_SUPORTE_SENHA na Vercel (a senha da caixa contato@ no Titan). Sem ela, nada quebra: só não lê o e-mail.
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { recadoDb as db } from '@/lib/recado/db'
import { SUPORTE } from '@/lib/recado/email'
import { avisaDono } from '@/lib/recado/avisa-dono'

export const caixaLigada = () => !!process.env.RECADO_SUPORTE_SENHA
const CODIGO = /\b[A-Z]{3,10}-[A-Z0-9]{5}\b/
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// só o que a pessoa escreveu agora: corta a parte citada da mensagem anterior
export function limpaResposta(t: string) {
  const out: string[] = []
  for (const l of String(t || '').replace(/\r/g, '').split('\n')) {
    const s = l.trim()
    if (/^(Em|On)\b.{4,250}(escreveu|wrote)\s*:?\s*$/i.test(s) || /^-{2,}\s*(Mensagem original|Original Message|Forwarded)/i.test(s) || (/^(De|From):\s.+/i.test(s) && out.some(x => x.trim()))) break
    if (/^>/.test(s)) continue
    out.push(l)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 8000)
}

async function estado(chave: string, valor?: string) {
  if (valor === undefined) { const [r] = await db.busca('suporte_estado', `chave=eq.${chave}`); return r?.valor ?? null }
  await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/recado_suporte_estado`, { method: 'POST',
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY as string, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ chave, valor, atualizado_em: new Date().toISOString() }) })
}

// junta a mensagem na conversa certa: o fio do e-mail, senão a conversa aberta da mesma pessoa, senão uma nova
async function conversaDe(email: string, nome: string | null, assunto: string, texto: string, refs: string[], quando: Date) {
  for (const r of refs) {
    const [m] = await db.busca('suporte_msgs', `msg_id=eq.${encodeURIComponent(r)}&select=suporte_id`).catch(() => [])
    if (m) return m.suporte_id
  }
  // a resposta do cliente a um e-mail nosso (o fio do Resend não fica guardado): a conversa recente da mesma pessoa, aberta ou resolvida
  const recente = new Date(Date.now() - 7 * 864e5).toISOString()
  const [aberta] = await db.busca('suporte', `email=eq.${encodeURIComponent(email)}&atualizado_em=gte.${recente}&order=atualizado_em.desc&limit=1&select=id`).catch(() => [])
  if (aberta) return aberta.id
  const codigo = (assunto.match(CODIGO) || texto.match(CODIGO) || [])[0] || null
  const nova = await db.insere('suporte', { email, nome, assunto: assunto.slice(0, 200), mensagem: texto.slice(0, 2000), codigo, origem: 'email', criado_em: quando.toISOString(), atualizado_em: quando.toISOString(), nao_lidas: 0 })
  return nova.id
}

export async function sincroniza(): Promise<{ novas: number; erro?: string }> {
  if (!caixaLigada()) return { novas: 0, erro: 'Falta a senha da caixa contato@ (RECADO_SUPORTE_SENHA na Vercel).' }
  const c = new ImapFlow({ host: process.env.RECADO_SUPORTE_IMAP || 'imap.titan.email', port: 993, secure: true,
    auth: { user: process.env.RECADO_SUPORTE_USUARIO || SUPORTE, pass: process.env.RECADO_SUPORTE_SENHA as string }, logger: false })
  let novas = 0
  await c.connect()
  const lock = await c.getMailboxLock('INBOX')
  try {
    const ult = +(await estado('uid_inbox') || 0)
    // primeira leitura: só os últimos 14 dias; depois, só o que chegou desde a última
    const uids = ((await c.search(ult ? { uid: `${ult + 1}:*` } : { since: new Date(Date.now() - 14 * 864e5) }, { uid: true })) || []).filter(u => u > ult).sort((a, b) => a - b).slice(0, 40)
    for (const uid of uids) {
      try {
        const m: any = await c.fetchOne(String(uid), { source: true }, { uid: true })
        if (!m?.source) continue
        const p: any = await simpleParser(m.source)
        const de = p.from?.value?.[0] || {}, email = String(de.address || '').toLowerCase()
        if (!email || /@recadoencantando\.com\.br$/.test(email) || /mailer-daemon|postmaster|no-?reply/.test(email)) continue
        const texto = limpaResposta(p.text || (p.html ? String(p.html).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '') : '')) || '(mensagem sem texto)'
        const msgId = p.messageId || `uid-${uid}@titan`
        const [ja] = await db.busca('suporte_msgs', `msg_id=eq.${encodeURIComponent(msgId)}&select=id`).catch(() => [])
        if (ja) continue
        const quando = p.date || new Date(), assunto = String(p.subject || '').trim()
        const refs = [p.inReplyTo, ...(Array.isArray(p.references) ? p.references : p.references ? [p.references] : [])].filter(Boolean)
        const sid = await conversaDe(email, de.name || null, assunto, texto, refs, quando)
        await db.insere('suporte_msgs', { suporte_id: sid, quando: new Date(quando).toISOString(), direcao: 'entrada', de: email, texto, msg_id: msgId, uid })
        const [s] = await db.busca('suporte', `id=eq.${sid}&select=nao_lidas`)
        await db.atualiza('suporte', `id=eq.${sid}`, { status: 'aberto', resolvido_em: null, escalado_em: null, ia_erro_em: null, atualizado_em: new Date().toISOString(), nao_lidas: (s?.nao_lidas || 0) + 1 })
        novas++
        if (novas <= 3) await avisaDono('📩 E-mail no suporte', `${de.name || email}${assunto ? ' · ' + assunto : ''}\n${texto.slice(0, 300)}`, 'email').catch(() => null)
      } finally { await estado('uid_inbox', String(uid)) }
    }
  } finally { lock.release(); await c.logout().catch(() => null) }
  return { novas }
}

// autor: 'dono' (respondido no painel) ou 'ia' (o atendente automático, suporte-ia.ts)
export async function responde(id: string, texto: string, autor: 'dono' | 'ia' = 'dono') {
  const [s] = await db.busca('suporte', `id=eq.${id}&select=*`)
  if (!s) throw new Error('conversa não encontrada')
  const msgs: any[] = await db.busca('suporte_msgs', `suporte_id=eq.${id}&order=quando.asc`)
  const entradas = msgs.filter(m => m.direcao === 'entrada'), ult = entradas[entradas.length - 1]
  const refs = msgs.map(m => m.msg_id).filter((x: string) => x && !x.startsWith('uid-'))
  const base = s.assunto || `Recado Encantado${s.codigo ? ' · pedido ' + s.codigo : ''}`
  const assunto = /^re:/i.test(base) ? base : 'Re: ' + base
  const citado = ult ? `<div style="margin-top:22px;padding-left:12px;border-left:3px solid #e0d6f0;color:#6f6688;font-size:13px;white-space:pre-wrap">${esc(ult.texto)}</div>` : ''
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#2b2140"><div style="white-space:pre-wrap">${esc(texto)}</div>
<p style="margin-top:18px">Um abraço,<br><b>Equipe Recado Encantado</b><br><a href="mailto:${SUPORTE}" style="color:#e0569a">${SUPORTE}</a></p>${citado}</div>`
  const headers: Record<string, string> = {}
  const pai = [...msgs].reverse().find(m => m.msg_id && !m.msg_id.startsWith('uid-'))
  if (pai) { headers['In-Reply-To'] = pai.msg_id; headers['References'] = refs.join(' ') }
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `Recado Encantado <${SUPORTE}>`, to: [s.email], reply_to: SUPORTE, subject: assunto, html, text: texto + '\n\nUm abraço,\nEquipe Recado Encantado', headers }) })
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error('o e-mail não saiu: ' + (j.message || r.status))
  await db.insere('suporte_msgs', { suporte_id: id, direcao: 'saida', de: autor === 'ia' ? 'ia' : SUPORTE, texto, msg_id: null })
  await db.atualiza('suporte', `id=eq.${id}`, { atualizado_em: new Date().toISOString(), nao_lidas: 0, assunto: s.assunto || base,
    ...(autor === 'dono' ? { solucao: 'Tu respondeu: ' + texto.replace(/\s+/g, ' ').slice(0, 110) } : {}) })
  return { ok: true }
}
