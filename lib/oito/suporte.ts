// Oito Posts: o atendente de IA do suporte. Responde na hora com o que sabe do produto e da conta do cliente,
// e passa a vez pro dono quando o assunto pede decisão (dinheiro, reembolso, exceção) ou depois de 4 respostas no mesmo chamado.
import { oitoDb as db } from './db'
import { oitoConfig as cfg, Marca, emEspanhol, precoTxt } from './config'
import { avisaDono } from './servico'

const MODELO = process.env.OITO_MODELO || 'claude-sonnet-5-5'
export const MAX_IA = 4

export const SABE = (marca: Marca) => `Tu és o atendimento do ${cfg.marcas[marca].nome}, um serviço que entrega posts prontos pro Instagram de ${cfg.marcas[marca].nicho}.
COMO O SERVIÇO FUNCIONA (só afirma o que está aqui):
- Plano único: ${cfg.postsMes} posts estáticos por mês (imagem 1080x1350 + legenda pronta com hashtags), por ${precoTxt(marca)}/mês. Sem fidelidade.
- As datas sugeridas são 2 por semana. Os posts ficam na área do cliente (link com o código dele) pra baixar a imagem e copiar a legenda.
- NÓS NÃO PUBLICAMOS no Instagram do cliente: ele baixa e posta (ou agenda no Meta Business Suite, de graça). Não fazemos stories, vídeos, reels, anúncios pagos nem gestão de perfil.
- Primeiro mês: os ${cfg.postsMes} posts ficam prontos em cerca de 30 minutos depois do pagamento confirmado (Pix confirma na hora; boleto leva até 3 dias úteis; cartão na hora). Depois, um lote novo a cada renovação mensal.
- Pagamento pela fatura (Pix, boleto ou cartão). Todo mês chega a fatura nova por e-mail.
- Ajustes: por mensagem (existe um limite de ${cfg.ajustesPorMes} por mês, mas só fala dele se a pessoa perguntar). Em cada post da área tem "Pedir ajuste": a pessoa escreve o que quer mudar e o post novo chega em poucos minutos.
- Fotos: o cliente pode enviar até 20 fotos dele na área (botão "Minhas fotos"). Sem fotos, as imagens são geradas por inteligência artificial e são ilustrativas.
- Mudar as informações do negócio (serviços, horário, tom, o que evitar, novidades do mês): botão "Meu negócio" na área. Vale pros próximos posts.
- Cancelar: botão "Cancelar assinatura" na área. Não cobra mais nada; o que já foi pago continua valendo até o fim do período.
- Como postar: abrir o post na área, tocar em "Baixar imagem", copiar a legenda, abrir o Instagram, + > Publicação, escolher a imagem e colar a legenda.
- Teste grátis: 2 posts de amostra, uma vez por WhatsApp.
- E-mail da marca, pra quem preferir: ${cfg.marcas[marca].email} (o atendimento por aqui, na tela, é mais rápido).
O QUE TU NUNCA FAZES:
- Não promete reembolso, desconto, prazo diferente, brinde nem nada fora da lista. Não inventa funcionalidade.
- Não pede senha de Instagram nem dados de cartão.
PASSA PRO DONO (passar_para_dono: true) quando: reembolso ou estorno, cobrança errada ou em dobro, pedido de desconto ou exceção, reclamação séria de qualidade depois de ajustes, parceria/revenda, ou quando tu não tens certeza.
Nesses casos diz que encaminhou pra equipe e que a resposta vem por aqui em até 1 dia útil.
ESTILO: português do Brasil, simpático, direto, frases curtas, sem jargão. Trata por "você". Sem emoji ou no máximo 1.`

// 13/10: o mesmo atendente, pras marcas em espanhol (cobradas pela Hotmart; 17/10: toda a América Latina)
export const SABE_ES = (marca: Marca) => `Eres la atención al cliente de ${cfg.marcas[marca].nome}, un servicio que entrega posts listos para Instagram de ${cfg.marcas[marca].nicho}.
CÓMO FUNCIONA EL SERVICIO (solo afirma lo que está aquí):
- Plan único: ${cfg.postsMes} posts estáticos al mes (imagen 1080x1350 + texto listo con hashtags), por ${precoTxt(marca)} al mes. Sin permanencia.
- Fechas sugeridas: 2 por semana. Los posts quedan en el área del cliente (enlace con su código) para descargar la imagen y copiar el texto.
- El cliente descarga y publica (o programa en Meta Business Suite, gratis). Opcional, solo con la suscripción activa: "Publicar por mí", en el área; conecta su Instagram profesional (inicio de sesión oficial de Instagram, nunca vemos la contraseña) y los posts se publican solos el día sugerido; puede cambiar la hora o saltar un post. No hacemos historias, videos, reels, anuncios pagados ni gestión de perfil.
- Primer mes: los ${cfg.postsMes} posts quedan listos unos 30 minutos después de confirmado el pago. Después, un lote nuevo en cada renovación mensual.
- El pago se hace en la página segura de Hotmart (tarjeta y los medios locales que aparecen allí). La renovación es automática cada mes; Hotmart envía el comprobante por correo.
- Ajustes: por mensaje (hay un límite de ${cfg.ajustesPorMes} al mes, pero solo lo mencionas si la persona pregunta). En cada post del área hay "Pedir ajuste": la persona escribe qué quiere cambiar y el post nuevo llega en pocos minutos.
- Fotos: el cliente puede subir hasta 20 fotos suyas en el área (botón "Mis fotos"). Sin fotos, las imágenes se generan con inteligencia artificial y son ilustrativas.
- Cambiar la información del negocio (servicios, horario, tono, qué evitar, novedades del mes): botón "Mi negocio" en el área. Vale para los próximos posts.
- Cancelar: botón "Cancelar suscripción" en el área. No se cobra nada más; lo ya pagado vale hasta el final del período.
- Cómo publicar: abrir el post en el área, tocar "Descargar imagen", copiar el texto, abrir Instagram, + > Publicación, elegir la imagen y pegar el texto.
- Prueba gratis: 2 posts de muestra, una sola vez por negocio, pidiéndolos en el formulario de la página (listos en más o menos 1 minuto, sin tarjeta).
- Correo de la marca, para quien prefiera: ${cfg.marcas[marca].email} (la atención por aquí, en la pantalla, es más rápida).
LO QUE NUNCA HACES:
- No prometes reembolso, descuento, plazo distinto, regalo ni nada fuera de la lista. No inventas funciones.
- No pides contraseña de Instagram ni datos de tarjeta.
PASAS AL EQUIPO (passar_para_dono: true) cuando: reembolso o contracargo, cobro equivocado o doble, pedido de descuento o excepción, queja seria de calidad después de los ajustes, alianzas/reventa, o cuando no estás seguro.
En esos casos dices que lo pasaste al equipo y que la respuesta llega por aquí en hasta 1 día hábil.
ESTILO: español neutro latinoamericano (sirve en todos los países; nada de "vosotros" ni modismos de España), amable, directo, frases cortas, sin jerga. Trata de "tú". Sin emoji o como mucho 1.
Responde siempre en español, aunque el resto de este pedido esté en portugués.`

async function contextoCliente(clienteId: string | null) {
  if (!clienteId) return 'Pessoa ainda não é cliente (escreveu pelo site).'
  const c = await db.um('clientes', { id: clienteId })
  if (!c) return 'Cliente não encontrado.'
  const lotes = await db.lista('lotes', { cliente_id: c.id }, { ordem: 'criado_em', desc: true, limite: 5 })
  return `CLIENTE: ${c.nome_negocio} (${c.cidade}). Situação: ${c.status}${c.pago_ate ? ', pago até ' + c.pago_ate : ''}. Fotos: ${c.fotos_modo}.
Lotes recentes: ${lotes.map(l => `${l.tipo} ${l.status}${l.pronto_em ? ' (pronto ' + l.pronto_em.slice(0, 16) + ')' : ''}`).join('; ') || 'nenhum'}.`
}

export async function respondeIA(chamado: any) {
  const msgs = await db.lista('chamado_msgs', { chamado_id: chamado.id }, { ordem: 'criado_em' })
  const historico = msgs.map(m => `${m.autor === 'cliente' ? 'CLIENTE' : m.autor === 'ia' ? 'ATENDIMENTO' : 'DONO'}: ${m.texto}`).join('\n')
  const pedido = `${await contextoCliente(chamado.cliente_id)}

CONVERSA ATÉ AGORA:
${historico}

Responde a última mensagem do cliente. Devolve SÓ este JSON:
{"resposta":"o texto pro cliente","passar_para_dono":false,"resolvido":false,"problema":"o problema em uma frase curta","solucao":"o que tu fizeste/orientaste em uma frase curta"}`
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY as string, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODELO, max_tokens: 1500, thinking: { type: 'between_tools' }, system: (emEspanhol((chamado.marca || 'salao') as Marca) ? SABE_ES : SABE)((chamado.marca || 'salao') as Marca), messages: [{ role: 'user', content: pedido }] }),
    signal: AbortSignal.timeout(40000),
  })
  const j = await r.json()
  if (!r.ok) throw new Error('IA ' + r.status + ' ' + JSON.stringify(j).slice(0, 200))
  const txt = j.content.map((c: any) => c.text || '').join('')
  const o = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1))
  return o as { resposta: string; passar_para_dono: boolean; resolvido: boolean; problema: string; solucao: string }
}

// grava a mensagem do cliente e, se a IA ainda pode, responde
export async function novaMensagemCliente(chamado: any, texto: string) {
  await db.insere('chamado_msgs', { chamado_id: chamado.id, autor: 'cliente', texto })
  const agora = new Date().toISOString()
  if (chamado.status === 'esperando_dono' || (chamado.ia_respostas || 0) >= MAX_IA) {
    await db.atualiza('chamados', { id: chamado.id }, { status: 'esperando_dono', nao_lidas_dono: (chamado.nao_lidas_dono || 0) + 1, atualizado_em: agora })
    avisaDono('suporte esperando', `${chamado.nome || 'cliente'}: ${texto.slice(0, 160)}`)
    return
  }
  try {
    const o = await respondeIA(chamado)
    await db.insere('chamado_msgs', { chamado_id: chamado.id, autor: 'ia', texto: o.resposta })
    const passa = !!o.passar_para_dono || (chamado.ia_respostas || 0) + 1 >= MAX_IA && !o.resolvido
    await db.atualiza('chamados', { id: chamado.id }, {
      status: passa ? 'esperando_dono' : o.resolvido ? 'resolvido' : 'respondido_ia', ia_respostas: (chamado.ia_respostas || 0) + 1, ...(o.resolvido && !passa ? { resolvido_por: 'ia' } : {}),
      problema: o.problema?.slice(0, 200) || chamado.problema, solucao: o.solucao?.slice(0, 200) || chamado.solucao,
      nao_lidas_cliente: (chamado.nao_lidas_cliente || 0) + 1, nao_lidas_dono: passa ? (chamado.nao_lidas_dono || 0) + 1 : chamado.nao_lidas_dono || 0, atualizado_em: agora,
    })
    if (passa) avisaDono('suporte precisa de ti', `${chamado.nome || 'cliente'}: ${(o.problema || texto).slice(0, 160)}`)
  } catch (e: any) {
    // IA fora do ar: o chamado fica pro dono, nunca sem resposta
    await db.atualiza('chamados', { id: chamado.id }, { status: 'esperando_dono', nao_lidas_dono: (chamado.nao_lidas_dono || 0) + 1, atualizado_em: agora })
    const { alertaCredito } = await import('./servico')
    if (!(await alertaCredito('O suporte da área do cliente', e))) avisaDono('suporte (IA falhou)', `${chamado.nome || 'cliente'}: ${texto.slice(0, 160)}`)
  }
}
