// Oito Posts: o follow-up por e-mail (15/10), enquanto o WhatsApp de venda não está ligado (e depois, como reforço).
//   1. no dia seguinte ao teste pronto (~20 h depois): "o que achou dos posts?"
//   2. 3 dias depois do teste (e pelo menos 2 depois do 1º): "o que falta pra assinar?"
//   3. quem abriu a fatura e não pagou (2 h depois): "falta só o pagamento"
// Só entre 8 h e 21 h de Brasília. Para quando o cliente assina, cancela ou responde SAIR (evento email_sair, gravado pela caixa de e-mail).
import { oitoDb as db } from './db'
import { oitoConfig as cfg, Marca, emEspanhol, precoTxt } from './config'
import { enviaEmailOito, molduraOito } from './email'

const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
const H = 3600e3
const primeiro = (c: any) => esc(String(c.responsavel || '').trim().split(/\s+/)[0] || '')

function textos(c: any, etapa: 'f1' | 'f2' | 'pag') {
  const m = c.marca as Marca, es = emEspanhol(m), nome = primeiro(c), neg = esc(c.nome_negocio), marca = cfg.marcas[m].nome, preco = precoTxt(m)
  const sair = es ? '<p style="font-size:13px;color:#777">¿No quieres recibir más correos? Responde SALIR.</p>' : '<p style="font-size:13px;color:#777">Não quer mais receber? É só responder SAIR.</p>'
  if (es) return {
    f1: { assunto: `¿Qué te parecieron los posts de ${c.nome_negocio}?`, titulo: `${nome ? nome + ', ¿qué' : '¿Qué'} te parecieron?`, corpo: `<p>Ayer recibiste los 2 posts gratis de <b>${neg}</b>. ¿Alcanzaste a usarlos?</p><p>Con la suscripción llegan <b>8 posts al mes</b>, listos, con tu marca, el texto y el día sugerido para publicar. Por ${preco} al mes, sin permanencia.</p><p>Si algo no te gustó, responde este correo y lo ajustamos.</p>${sair}`, botao: 'Ver mis posts y suscribirme' },
    f2: { assunto: `Tus próximos 8 posts de ${c.nome_negocio}`, titulo: '¿Qué te falta para empezar?', corpo: `<p>Los 2 posts gratis de <b>${neg}</b> eran solo una muestra. Con la suscripción, el mes completo queda listo en 30 minutos y no te preocupas más por qué publicar.</p><p>¿Qué te frena? ¿Precio, dudas, tiempo? Responde este correo con una palabra y te ayudamos.</p>${sair}`, botao: 'Quiero los 8 posts' },
    pag: { assunto: 'Falta solo el pago', titulo: 'Falta solo el pago', corpo: `<p>Empezaste la suscripción de ${esc(marca)} para <b>${neg}</b>, pero el pago no se completó.</p><p>Si hubo algún problema, toca el botón y vuelve a intentarlo. Los 8 posts quedan listos unos 30 minutos después del pago.</p>${sair}`, botao: 'Completar el pago' },
  }[etapa]
  return {
    f1: { assunto: `O que achou dos posts do ${c.nome_negocio}?`, titulo: `${nome ? nome + ', o que' : 'O que'} achou?`, corpo: `<p>Ontem você recebeu os 2 posts grátis do <b>${neg}</b>. Deu pra usar?</p><p>Com a assinatura, chegam <b>8 posts por mês</b>, prontos, com a sua marca, a legenda e o dia sugerido pra postar. Por ${preco} por mês, sem fidelidade: cancela num botão.</p><p>Se alguma coisa não ficou do seu jeito, é só responder este e-mail que a gente ajusta.</p>${sair}`, botao: 'Ver meus posts e assinar' },
    f2: { assunto: `Os próximos 8 posts do ${c.nome_negocio}`, titulo: 'O que falta pra começar?', corpo: `<p>Os 2 posts grátis do <b>${neg}</b> eram só uma amostra. Com a assinatura, o mês inteiro fica pronto em 30 minutos e você não precisa mais pensar no que postar.</p><p>O que está te segurando? Preço, dúvida, tempo? Responde este e-mail com uma palavra que a gente te ajuda.</p>${sair}`, botao: 'Quero os 8 posts' },
    pag: { assunto: 'Falta só o pagamento', titulo: 'Falta só o pagamento', corpo: `<p>Você começou a assinatura do ${esc(marca)} pro <b>${neg}</b>, mas o pagamento não foi concluído.</p><p>Se deu algum problema, é só tocar no botão e tentar de novo. Os 8 posts ficam prontos uns 30 minutos depois do pagamento.</p>${sair}`, botao: 'Concluir o pagamento' },
  }[etapa]
}

export async function rodaFollowupEmail() {
  const agoraBR = new Date(Date.now() - 3 * H), hora = agoraBR.getUTCHours()
  if (hora < 8 || hora >= 21) return { fora_do_horario: true }
  const desde = new Date(Date.now() - 10 * 24 * H).toISOString()
  const clientes = (await db.lista('clientes', {}, { ordem: 'criado_em', desc: true, limite: 300 })).filter(c => !c.exemplo && c.email && c.criado_em > desde && ['teste', 'aguardando_pagamento'].includes(c.status))
  const enviados: string[] = []
  for (const c of clientes) {
    const ev = await db.lista('eventos', { cliente_id: c.id }, { ordem: 'criado_em' })
    if (ev.some(e => e.tipo === 'email_sair')) continue
    // quem recebeu e-mail nosso feito à mão nas últimas 24 h não recebe o automático em cima
    if (ev.some(e => e.tipo === 'email_manual' && Date.now() - new Date(e.criado_em).getTime() < 24 * H)) continue
    const ja = (et: string) => ev.find(e => e.tipo === 'email_followup' && e.detalhe?.etapa === et)
    const pronto = ev.find(e => e.tipo === 'teste_pronto'), aberta = [...ev].reverse().find(e => e.tipo === 'assinatura_aberta')
    let etapa: 'f1' | 'f2' | 'pag' | null = null
    if (c.status === 'aguardando_pagamento' && aberta && Date.now() - new Date(aberta.criado_em).getTime() > 2 * H && !ja('pag')) etapa = 'pag'
    else if (c.status === 'teste' && pronto) {
      const t = Date.now() - new Date(pronto.criado_em).getTime(), f1 = ja('f1')
      if (!f1 && t > 20 * H) etapa = 'f1'
      else if (f1 && !ja('f2') && t > 72 * H && Date.now() - new Date(f1.criado_em).getTime() > 48 * H) etapa = 'f2'
    }
    if (!etapa) continue
    const x = textos(c, etapa), m = c.marca as Marca
    const url = cfg.url(m, 'teste.html?c=' + c.codigo)
    const r = await enviaEmailOito(m, c.email, x.assunto, molduraOito(m, x.titulo, x.corpo, { texto: x.botao, url }))
    await db.evento('email_followup', { cliente_id: c.id, marca: m, detalhe: { etapa, enviado: !!r.ok } })
    enviados.push(`${c.codigo}:${etapa}${r.ok ? '' : ' (falhou)'}`)
    if (enviados.length >= 15) break
  }
  return { enviados }
}
