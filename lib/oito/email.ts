// Oito Posts: e-mails das marcas (13/10), pelo Resend. Cada marca sai do seu domínio (contato@/contacto@<dominio> responde).
// Salão e Prato usam a conta do Recado (RESEND_API_KEY); as outras têm conta própria grátis (OITO_RESEND_<MARCA>), por causa do limite de domínios.
// As marcas em espanhol recebem os mesmos e-mails, em espanhol. 15/10: elas viraram o No Feed: um remetente só
// (OITO_RESEND_NOFEED, com o NOFEED.email do config.ts), a cor e a marca do No Feed, e os links das páginas novas (cfg.url).
// Nunca derruba nada: se falhar, só registra no log.
import { oitoConfig as cfg, Marca, emEspanhol, noFeed } from './config'

const CORES: Record<Marca, { escuro: string; destaque: string; sobre: string; claro: string }> = {
  salao: { escuro: '#2b1420', destaque: '#d4577f', sobre: '#ffffff', claro: '#fbf4f2' },
  prato: { escuro: '#1d120c', destaque: '#ff5a1f', sobre: '#ffffff', claro: '#fff7ee' },
  pata: { escuro: '#102a4c', destaque: '#ffb703', sobre: '#102a4c', claro: '#f3f7ff' },
  // o No Feed (os 3 nichos em espanhol): o roxo da marca
  divino: { escuro: '#1e0b3a', destaque: '#7c3aed', sobre: '#ffffff', claro: '#f6f2ff' },
  sabroso: { escuro: '#1e0b3a', destaque: '#7c3aed', sobre: '#ffffff', claro: '#f6f2ff' },
  peludo: { escuro: '#1e0b3a', destaque: '#7c3aed', sobre: '#ffffff', claro: '#f6f2ff' },
}
export const chaveResend = (m: Marca) => (noFeed(m) && process.env.OITO_RESEND_NOFEED) || process.env['OITO_RESEND_' + m.toUpperCase()] || (m === 'salao' || m === 'prato' ? process.env.RESEND_API_KEY : undefined)
const site = (m: Marca) => `https://www.${cfg.marcas[m].dominio}`
// o link de uma página do cliente: o No Feed usa as páginas novas (/oito/nofeed/<nicho>/ ou o domínio, quando ligado)
const link = (m: Marca, p: string) => noFeed(m) ? cfg.url(m, p) : `${site(m)}/${p}`
// o domínio que aparece no rodapé (o do No Feed só depois de ligado)
const dominioVisivel = (m: Marca) => noFeed(m) ? (process.env.OITO_DOMINIO_NOFEED || '') : cfg.marcas[m].dominio
// o No Feed: [no] numa caixinha roxa + feed
const logoNoFeed = '<span style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#c026d3);color:#fff;border-radius:7px;padding:1px 7px 3px;box-shadow:0 2px 0 #4c1d95;margin-right:3px">no</span>feed'
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

// a moldura de todos os e-mails: nome da marca, título, texto, botão e rodapé
export function molduraOito(m: Marca, titulo: string, corpo: string, botao?: { texto: string; url: string }) {
  const C = CORES[m], nome = cfg.marcas[m].nome
  return `<!doctype html><html><body style="margin:0;background:${C.claro};font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
  <div style="max-width:560px;margin:0 auto;padding:28px 18px">
    <div style="font:700 20px Arial;color:${C.escuro};margin-bottom:18px">${noFeed(m) ? logoNoFeed : `<span style="display:inline-block;width:30px;height:30px;line-height:30px;text-align:center;border-radius:9px;background:${C.destaque};color:${C.sobre};margin-right:8px">${nome[0]}</span>${esc(nome)}`}</div>
    <div style="background:#fff;border-radius:18px;padding:28px 24px">
      <h1 style="font:700 24px/1.25 Arial;margin:0 0 14px;color:${C.escuro}">${esc(titulo)}</h1>
      <div style="font-size:16px;line-height:1.6;color:#333">${corpo}</div>
      ${botao ? `<p style="margin:26px 0 6px"><a href="${botao.url}" style="display:inline-block;background:${C.destaque};color:${C.sobre};text-decoration:none;font:700 16px Arial;padding:15px 24px;border-radius:999px">${esc(botao.texto)}</a></p>` : ''}
    </div>
    <p style="font-size:12px;color:#777;margin-top:18px;line-height:1.5">${esc(nome)}${dominioVisivel(m) ? ' · ' + dominioVisivel(m) : ''}<br>${emEspanhol(m) ? '¿Dudas? Solo responde este correo.' : 'Dúvidas? É só responder este e-mail.'}</p>
  </div></body></html>`
}

export async function enviaEmailOito(m: Marca, para: string | null | undefined, assunto: string, html: string) {
  const k = chaveResend(m)
  if (!k || !para || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(para)) return { ok: false, motivo: !k ? 'sem chave' : 'sem e-mail' }
  const de = cfg.marcas[m].email
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${cfg.marcas[m].nome} <${de}>`, to: [para], reply_to: de, subject: assunto, html }),
      signal: AbortSignal.timeout(15000),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) console.error('oito email', m, r.status, JSON.stringify(j).slice(0, 200))
    return { ok: r.ok }
  } catch (e: any) { console.error('oito email', e?.message); return { ok: false } }
}

const primeiroNome = (c: any) => (c.responsavel ? esc(String(c.responsavel).split(' ')[0]) : '')

// os 4 e-mails do produto, em português e em espanhol
const pt = {
  testePronto: (c: any) => enviaEmailOito(c.marca, c.email, 'Seus 2 posts grátis estão prontos',
    molduraOito(c.marca, `${c.responsavel ? primeiroNome(c) + ', seus' : 'Seus'} 2 posts estão prontos`,
      `<p>Os 2 posts grátis do <b>${esc(c.nome_negocio)}</b> já estão prontos, com arte e legenda. É só baixar e postar.</p><p>Guarde este e-mail: o botão abaixo leva sempre pros seus posts.</p>`,
      { texto: 'Ver meus posts', url: link(c.marca, `teste.html?c=${c.codigo}`) })),
  pagamentoConfirmado: (c: any) => enviaEmailOito(c.marca, c.email, 'Pagamento confirmado: seus 8 posts estão sendo feitos',
    molduraOito(c.marca, 'Pagamento confirmado',
      `<p>Bem-vindo ao ${esc(cfg.marcas[c.marca as Marca].nome)}! Os 8 posts do mês do <b>${esc(c.nome_negocio)}</b> estão sendo feitos agora e ficam prontos em poucos minutos.</p><p>Na sua área você baixa as imagens, copia as legendas, pede ajustes e conta as novidades do mês.</p>`,
      { texto: 'Abrir minha área', url: link(c.marca, `conta.html?c=${c.codigo}`) })),
  mesEntregue: (c: any) => enviaEmailOito(c.marca, c.email, 'Os 8 posts do mês chegaram',
    molduraOito(c.marca, 'Seus 8 posts do mês chegaram',
      `<p>Estão na sua área, cada um com o dia sugerido pra postar (2 por semana).</p><p>Dica: agende os 8 de uma vez no Meta Business Suite e esqueça. O passo a passo está no guia da sua área.</p>`,
      { texto: 'Ver os posts do mês', url: link(c.marca, `conta.html?c=${c.codigo}`) })),
  avisoRenovacao: (c: any, data: string) => enviaEmailOito(c.marca, c.email, 'Seu próximo mês de posts começa em breve',
    molduraOito(c.marca, 'Tem novidade pro próximo mês?',
      `<p>No dia <b>${esc(data.split('-').reverse().join('/'))}</b> sua assinatura renova e os próximos 8 posts do <b>${esc(c.nome_negocio)}</b> começam a ser feitos.</p><p>Tem serviço novo, promoção, data especial ou horário diferente? Conte em "Meu negócio", na sua área, e os posts já saem com isso.</p><p style="font-size:13px;color:#777">Não quer continuar? Dá pra cancelar num botão na área, sem multa.</p>`,
      { texto: 'Contar as novidades', url: link(c.marca, `conta.html?c=${c.codigo}`) })),
}
const es = {
  testePronto: (c: any) => enviaEmailOito(c.marca, c.email, 'Tus 2 posts gratis están listos',
    molduraOito(c.marca, `${c.responsavel ? primeiroNome(c) + ', tus' : 'Tus'} 2 posts están listos`,
      `<p>Los 2 posts gratis de <b>${esc(c.nome_negocio)}</b> ya están listos, con diseño y texto. Solo descárgalos y publícalos.</p><p>Guarda este correo: el botón de abajo siempre te lleva a tus posts.</p>`,
      { texto: 'Ver mis posts', url: link(c.marca, `teste.html?c=${c.codigo}`) })),
  pagamentoConfirmado: (c: any) => enviaEmailOito(c.marca, c.email, 'Pago confirmado: tus 8 posts ya se están haciendo',
    molduraOito(c.marca, 'Pago confirmado',
      `<p>¡Bienvenido a ${esc(cfg.marcas[c.marca as Marca].nome)}! Los 8 posts del mes de <b>${esc(c.nome_negocio)}</b> se están haciendo ahora y estarán listos en pocos minutos.</p><p>En tu área descargas las imágenes, copias los textos, pides ajustes y nos cuentas las novedades del mes.</p>`,
      { texto: 'Abrir mi área', url: link(c.marca, `conta.html?c=${c.codigo}`) })),
  mesEntregue: (c: any) => enviaEmailOito(c.marca, c.email, 'Llegaron los 8 posts del mes',
    molduraOito(c.marca, 'Llegaron tus 8 posts del mes',
      `<p>Están en tu área, cada uno con el día sugerido para publicar (2 por semana).</p><p>Consejo: programa los 8 de una vez en Meta Business Suite y olvídate. El paso a paso está en la guía de tu área.</p>`,
      { texto: 'Ver los posts del mes', url: link(c.marca, `conta.html?c=${c.codigo}`) })),
  avisoRenovacao: (c: any, data: string) => enviaEmailOito(c.marca, c.email, 'Tu próximo mes de posts empieza pronto',
    molduraOito(c.marca, '¿Hay novedades para el próximo mes?',
      `<p>El <b>${esc(data.split('-').reverse().join('/'))}</b> se renueva tu suscripción y empiezan a hacerse los próximos 8 posts de <b>${esc(c.nome_negocio)}</b>.</p><p>¿Tienes un servicio nuevo, una promoción, una fecha especial o un horario distinto? Cuéntalo en "Mi negocio", en tu área, y los posts saldrán con eso.</p><p style="font-size:13px;color:#777">¿No quieres seguir? Puedes cancelar con un botón en tu área, sin multa.</p>`,
      { texto: 'Contar las novedades', url: link(c.marca, `conta.html?c=${c.codigo}`) })),
}
export const emailsOito = {
  testePronto: (c: any) => (emEspanhol(c.marca) ? es : pt).testePronto(c),
  pagamentoConfirmado: (c: any) => (emEspanhol(c.marca) ? es : pt).pagamentoConfirmado(c),
  mesEntregue: (c: any) => (emEspanhol(c.marca) ? es : pt).mesEntregue(c),
  avisoRenovacao: (c: any, data: string) => (emEspanhol(c.marca) ? es : pt).avisoRenovacao(c, data),
}
