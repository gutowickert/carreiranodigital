// Oito Posts: e-mails das marcas (13/10), pelo Resend. Cada marca sai do seu domínio (contato@<dominio> responde).
// Salão e Prato usam a conta do Recado (RESEND_API_KEY); o Pata tem conta própria grátis (OITO_RESEND_PATA), por causa do limite de domínios.
// Nunca derruba nada: se falhar, só registra no log.
import { oitoConfig as cfg, Marca } from './config'

const CORES: Record<Marca, { escuro: string; destaque: string; sobre: string; claro: string }> = {
  salao: { escuro: '#2b1420', destaque: '#d4577f', sobre: '#ffffff', claro: '#fbf4f2' },
  prato: { escuro: '#1d120c', destaque: '#ff5a1f', sobre: '#ffffff', claro: '#fff7ee' },
  pata: { escuro: '#102a4c', destaque: '#ffb703', sobre: '#102a4c', claro: '#f3f7ff' },
}
const chave = (m: Marca) => (m === 'pata' ? process.env.OITO_RESEND_PATA : process.env.RESEND_API_KEY)
const site = (m: Marca) => `https://www.${cfg.marcas[m].dominio}`
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

// a moldura de todos os e-mails: nome da marca, título, texto, botão e rodapé
export function molduraOito(m: Marca, titulo: string, corpo: string, botao?: { texto: string; url: string }) {
  const C = CORES[m], nome = cfg.marcas[m].nome
  return `<!doctype html><html><body style="margin:0;background:${C.claro};font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
  <div style="max-width:560px;margin:0 auto;padding:28px 18px">
    <div style="font:700 20px Arial;color:${C.escuro};margin-bottom:18px"><span style="display:inline-block;width:30px;height:30px;line-height:30px;text-align:center;border-radius:9px;background:${C.destaque};color:${C.sobre};margin-right:8px">${nome[0]}</span>${esc(nome)}</div>
    <div style="background:#fff;border-radius:18px;padding:28px 24px">
      <h1 style="font:700 24px/1.25 Arial;margin:0 0 14px;color:${C.escuro}">${esc(titulo)}</h1>
      <div style="font-size:16px;line-height:1.6;color:#333">${corpo}</div>
      ${botao ? `<p style="margin:26px 0 6px"><a href="${botao.url}" style="display:inline-block;background:${C.destaque};color:${C.sobre};text-decoration:none;font:700 16px Arial;padding:15px 24px;border-radius:999px">${esc(botao.texto)}</a></p>` : ''}
    </div>
    <p style="font-size:12px;color:#777;margin-top:18px;line-height:1.5">${esc(nome)} · ${cfg.marcas[m].dominio}<br>Dúvidas? É só responder este e-mail.</p>
  </div></body></html>`
}

export async function enviaEmailOito(m: Marca, para: string | null | undefined, assunto: string, html: string) {
  const k = chave(m)
  if (!k || !para || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(para)) return { ok: false, motivo: !k ? 'sem chave' : 'sem e-mail' }
  const dom = cfg.marcas[m].dominio
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${cfg.marcas[m].nome} <contato@${dom}>`, to: [para], reply_to: `contato@${dom}`, subject: assunto, html }),
      signal: AbortSignal.timeout(15000),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) console.error('oito email', m, r.status, JSON.stringify(j).slice(0, 200))
    return { ok: r.ok }
  } catch (e: any) { console.error('oito email', e?.message); return { ok: false } }
}

// os 4 e-mails do produto
export const emailsOito = {
  testePronto: (c: any) => enviaEmailOito(c.marca, c.email, 'Seus 2 posts grátis estão prontos',
    molduraOito(c.marca, `${c.responsavel ? esc(c.responsavel.split(' ')[0]) + ', seus' : 'Seus'} 2 posts estão prontos`,
      `<p>Os 2 posts grátis do <b>${esc(c.nome_negocio)}</b> já estão prontos, com arte e legenda. É só baixar e postar.</p><p>Guarde este e-mail: o botão abaixo leva sempre pros seus posts.</p>`,
      { texto: 'Ver meus posts', url: `${site(c.marca)}/teste.html?c=${c.codigo}` })),
  pagamentoConfirmado: (c: any) => enviaEmailOito(c.marca, c.email, 'Pagamento confirmado: seus 8 posts estão sendo feitos',
    molduraOito(c.marca, 'Pagamento confirmado',
      `<p>Bem-vindo ao ${esc(cfg.marcas[c.marca as Marca].nome)}! Os 8 posts do mês do <b>${esc(c.nome_negocio)}</b> estão sendo feitos agora e ficam prontos em poucos minutos.</p><p>Na sua área você baixa as imagens, copia as legendas, pede ajustes e conta as novidades do mês.</p>`,
      { texto: 'Abrir minha área', url: `${site(c.marca)}/conta.html?c=${c.codigo}` })),
  mesEntregue: (c: any) => enviaEmailOito(c.marca, c.email, 'Os 8 posts do mês chegaram',
    molduraOito(c.marca, 'Seus 8 posts do mês chegaram',
      `<p>Estão na sua área, cada um com o dia sugerido pra postar (2 por semana).</p><p>Dica: agende os 8 de uma vez no Meta Business Suite e esqueça. O passo a passo está no guia da sua área.</p>`,
      { texto: 'Ver os posts do mês', url: `${site(c.marca)}/conta.html?c=${c.codigo}` })),
  avisoRenovacao: (c: any, data: string) => enviaEmailOito(c.marca, c.email, 'Seu próximo mês de posts começa em breve',
    molduraOito(c.marca, 'Tem novidade pro próximo mês?',
      `<p>No dia <b>${esc(data.split('-').reverse().join('/'))}</b> sua assinatura renova e os próximos 8 posts do <b>${esc(c.nome_negocio)}</b> começam a ser feitos.</p><p>Tem serviço novo, promoção, data especial ou horário diferente? Conte em "Meu negócio", na sua área, e os posts já saem com isso.</p><p style="font-size:13px;color:#777">Não quer continuar? Dá pra cancelar num botão na área, sem multa.</p>`,
      { texto: 'Contar as novidades', url: `${site(c.marca)}/conta.html?c=${c.codigo}` })),
}
