// Oito Posts: as caixas contato@ das 3 marcas (HostGator) dentro do suporte do painel (13/10), igual ao Recado.
// As caixas ficam no Titan (MX das marcas = mx1.titan.email), igual ao Recado: IMAP em imap.titan.email.
// Lê por IMAP o que chegou, abre/continua o chamado (origem 'email'), a IA responde e a resposta sai por e-mail, do contato@ da marca,
// no mesmo fio. A resposta dada pelo dono no painel também sai por e-mail.
// Precisa das senhas das caixas na Vercel: OITO_EMAIL_SENHA_SALAO, OITO_EMAIL_SENHA_PRATO, OITO_EMAIL_SENHA_PATA.
// Sem a senha de uma marca, aquela caixa só não é lida; nada quebra.
// 15/10: o Feed al Día (divino/sabroso/peludo) tem UMA caixa (FEEDALDIA.email), com a senha em OITO_EMAIL_SENHA_FEEDALDIA (ou _NOFEED). Ela é lida
// uma vez só, e o chamado fica no nicho do cliente que escreveu.
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { oitoDb as db } from './db'
import { oitoConfig as cfg, Marca, MARCAS, emEspanhol, feedAlDia, FEEDALDIA, envFeedAlDia } from './config'
import { chaveResend } from './email'
import { novaMensagemCliente } from './suporte'

const ehFeedAlDia = (a: any) => !!a && !!cfg.marcas[a as Marca] && feedAlDia(a as Marca)
const mesmoGrupo = (a: any, b: Marca) => a === b || (feedAlDia(b) && ehFeedAlDia(a))
const senha = (m: Marca) => { const v = feedAlDia(m) ? envFeedAlDia('EMAIL_SENHA') : process.env['OITO_EMAIL_SENHA_' + m.toUpperCase()]; return v ? v.trim().replace(/^["']|["']$/g, '') : v }
export const caixasLigadas = () => MARCAS.filter(m => !!senha(m))
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// só o que a pessoa escreveu agora: corta a mensagem anterior citada
function limpa(t: string) {
  const linhas = String(t || '').replace(/\r/g, '').split('\n'), out: string[] = []
  for (const l of linhas) {
    if (/^>/.test(l) || /^(Em|On) .+(escreveu|wrote):?\s*$/i.test(l) || /^-{2,}\s*(Mensagem original|Original Message)/i.test(l) || /^De: .+/i.test(l) && out.length) break
    out.push(l)
  }
  return out.join('\n').trim().slice(0, 4000)
}

async function estado(chave: string, valor?: any) {
  if (valor === undefined) return (await db.um('estado', { chave }))?.valor || null
  const r = await db.atualiza('estado', { chave }, { valor })
  if (!r.length) await db.insere('estado', { chave, valor })
}

export async function respondeEmail(ch: any, texto: string, autor: 'ia' | 'dono') {
  const m = (ch.marca || 'salao') as Marca, dom = cfg.marcas[m].dominio, nome = cfg.marcas[m].nome
  const chave = chaveResend(m), de = cfg.marcas[m].email, es = emEspanhol(m)
  if (!chave || !ch.contato || !/@/.test(ch.contato)) return { ok: false }
  const base = ch.email_assunto || `${nome} · ${es ? 'atención' : 'atendimento'}`
  const assunto = /^re:/i.test(base) ? base : 'Re: ' + base
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#222"><div style="white-space:pre-wrap">${esc(texto)}</div>
<p style="margin-top:18px">${es ? 'Un abrazo,<br><b>Equipo' : 'Um abraço,<br><b>Equipe'} ${esc(nome)}</b><br>${feedAlDia(m) ? (envFeedAlDia('DOMINIO') ? `<a href="https://${envFeedAlDia('DOMINIO')}">${envFeedAlDia('DOMINIO')}</a>` : '') : `<a href="https://www.${dom}">${dom}</a>`}</p></div>`
  const headers: Record<string, string> = {}
  if (ch.email_ref) { headers['In-Reply-To'] = ch.email_ref; headers['References'] = ch.email_ref }
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + chave, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `${nome} <${de}>`, to: [ch.contato], reply_to: de, subject: assunto, html, text: texto + (es ? `\n\nUn abrazo,\nEquipo ${nome}` : `\n\nUm abraço,\nEquipe ${nome}`), headers }) })
  return { ok: r.ok, autor }
}

async function lerCaixa(m: Marca) {
  // 16/10: a caixa do Feed al Día fica na HostGator (cPanel), não no Titan
  const host = feedAlDia(m) ? (envFeedAlDia('EMAIL_IMAP') || 'br1100.hostgator.com.br') : (process.env.OITO_EMAIL_IMAP || "imap.titan.email")
  const c = new ImapFlow({ host, port: 993, secure: true,
    auth: { user: cfg.marcas[m].email, pass: senha(m) as string }, logger: false, tls: { rejectUnauthorized: false } })
  let novas = 0
  await c.connect()
  const lock = await c.getMailboxLock('INBOX')
  try {
    const ult = +((await estado('caixa_' + m))?.uid || 0)
    // primeira leitura: só os últimos 3 dias; depois, só o que chegou desde a última
    const uids = ((await c.search(ult ? { uid: `${ult + 1}:*` } : { since: new Date(Date.now() - 3 * 864e5) }, { uid: true })) || []).filter(u => u > ult).sort((a, b) => a - b).slice(0, 30)
    for (const uid of uids) {
      try {
        const msg: any = await c.fetchOne(String(uid), { source: true }, { uid: true })
        if (!msg?.source) continue
        const p: any = await simpleParser(msg.source)
        const de = p.from?.value?.[0] || {}, email = String(de.address || '').toLowerCase()
        // ignora as próprias marcas e o Recado (evita duas IAs se respondendo em loop), robôs e avisos automáticos
        if (!email || /@(salaonofeed|pratonofeed|patanofeed|recadoencantando|recadoencantado)\.com\.br$/.test(email) || /@feed(divino|sabroso|peludo)\.com$/.test(email) || email.endsWith('@' + FEEDALDIA.dominio) || /mailer-daemon|postmaster|no-?reply|resend\.dev|amazonses/.test(email)) continue
        if (p.headers?.get('auto-submitted') && String(p.headers.get('auto-submitted')) !== 'no') continue
        // e-mail automático não vira chamado (13/10): newsletter, boas-vindas e confirmação de serviços, notificações
        const prec = String(p.headers?.get('precedence') || '').toLowerCase()
        if (p.headers?.get('list-unsubscribe') || /bulk|list|junk/.test(prec)) continue
        if (/@([a-z0-9-]+.)*(titan.email|resend.com|hostgator.com(.br)?|facebookmail.com|meta.com|google.com|accounts.google.com|vercel.com|asaas.com|supabase.(io|com)|hotmart.com)$/.test(email)) continue
        if (/^(notifications?|updates?|news|newsletter|alerts?|info|team|suporte@titan|marketing)@/.test(email)) continue
        const texto = limpa(p.text || (p.html ? String(p.html).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '') : '')) || '(mensagem sem texto)'
        const assunto = String(p.subject || '').trim().slice(0, 200)
        // continua o chamado aberto dessa pessoa (últimos 7 dias) ou abre um novo
        const recente = new Date(Date.now() - 7 * 864e5).toISOString()
        let ch = (await db.lista('chamados', { contato: email, origem: 'email' }, { ordem: 'atualizado_em', desc: true, limite: 5 })).find(x => mesmoGrupo(x.marca, m))
        if (!ch || ch.atualizado_em < recente || ch.status === 'resolvido') {
          const cli = (await db.lista('clientes', { email }))[0], doGrupo = !!cli && mesmoGrupo(cli.marca, m)
          ch = await db.insere('chamados', { cliente_id: doGrupo ? cli.id : null, marca: doGrupo ? cli.marca : m, nome: de.name || cli?.nome_negocio || email, contato: email, origem: 'email', assunto: (assunto || texto).slice(0, 120), email_assunto: assunto || null, status: 'aberto' })
        }
        if (p.messageId) { await db.atualiza('chamados', { id: ch.id }, { email_ref: p.messageId }); ch.email_ref = p.messageId }
        const antes = (await db.lista('chamado_msgs', { chamado_id: ch.id })).length
        // 15/10: SAIR / SALIR para o follow-up por e-mail
        if (/^\s*(sair|salir|parar|stop)\b/i.test(texto)) { const cli = (await db.lista('clientes', { email }))[0]; if (cli) await db.evento('email_sair', { cliente_id: cli.id, marca: cli.marca, detalhe: {} }) }
        await novaMensagemCliente(ch, (assunto && antes === 0 ? `[${assunto}]\n` : '') + texto)
        // se a IA respondeu, a resposta sai por e-mail
        const msgs = await db.lista('chamado_msgs', { chamado_id: ch.id }, { ordem: 'criado_em' })
        const ultima = msgs[msgs.length - 1]
        if (msgs.length > antes + 1 && ultima?.autor === 'ia') await respondeEmail({ ...ch, marca: ch.marca || m }, ultima.texto, 'ia')
        novas++
      } finally { await estado('caixa_' + m, { uid, em: new Date().toISOString() }) }
    }
  } finally { lock.release(); await c.logout().catch(() => null) }
  return novas
}

export async function sincronizaCaixas(forca = false) {
  const res: Record<string, any> = {}, lidas = new Set<string>()
  for (const m of MARCAS) {
    if (!senha(m)) { res[m] = 'sem senha'; continue }
    // a caixa do Feed al Día é uma só pros 3 nichos: lê uma vez
    if (lidas.has(cfg.marcas[m].email)) { res[m] = 'mesma caixa de ' + cfg.marcas[m].email; continue }
    lidas.add(cfg.marcas[m].email)
    // login recusado: espera 30 min antes de tentar de novo (tentativa errada em sequência pode bloquear a caixa no Titan)
    const falha = await estado('caixa_falha_' + m)
    if (falha?.em && Date.now() - new Date(falha.em).getTime() < 30 * 60e3 && !forca) { res[m] = 'aguardando (login recusado há pouco)'; continue }
    try { res[m] = await lerCaixa(m) } catch (e: any) {
      res[m] = 'erro: ' + [e?.message, e?.authenticationFailed ? 'login recusado' : '', e?.responseText, e?.serverResponseCode, e?.code].filter(Boolean).join(' · ').slice(0, 220)
      if (e?.authenticationFailed) await estado('caixa_falha_' + m, { em: new Date().toISOString() })
    }
  }
  return res
}
