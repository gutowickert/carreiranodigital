// Oito Posts: o atendente de IA do suporte. Responde na hora com o que sabe do produto e da conta do cliente,
// e passa a vez pro dono quando o assunto pede decisão (dinheiro, reembolso, exceção) ou depois de 4 respostas no mesmo chamado.
import { oitoDb as db } from './db'
import { oitoConfig as cfg, Marca } from './config'
import { avisaDono } from './servico'

const MODELO = process.env.OITO_MODELO || 'claude-sonnet-5-5'
export const MAX_IA = 4

const SABE = (marca: Marca) => `Tu és o atendimento do ${cfg.marcas[marca].nome}, um serviço que entrega posts prontos pro Instagram de ${cfg.marcas[marca].nicho}.
COMO O SERVIÇO FUNCIONA (só afirma o que está aqui):
- Plano único: ${cfg.postsMes} posts estáticos por mês (imagem 1080x1350 + legenda pronta com hashtags), por R$ ${cfg.preco}/mês. Sem fidelidade.
- As datas sugeridas são 2 por semana. Os posts ficam na área do cliente (link com o código dele) pra baixar a imagem e copiar a legenda.
- NÓS NÃO PUBLICAMOS no Instagram do cliente: ele baixa e posta (ou agenda no Meta Business Suite, de graça). Não fazemos stories, vídeos, reels, anúncios pagos nem gestão de perfil.
- Primeiro mês: os ${cfg.postsMes} posts ficam prontos em cerca de 30 minutos depois do pagamento confirmado (Pix confirma na hora; boleto leva até 3 dias úteis; cartão na hora). Depois, um lote novo a cada renovação mensal.
- Pagamento pela fatura (Pix, boleto ou cartão). Todo mês chega a fatura nova por e-mail.
- Ajustes: até ${cfg.ajustesPorMes} por mês. Em cada post da área tem "Pedir ajuste": a pessoa escreve o que quer mudar e o post novo chega em poucos minutos.
- Fotos: o cliente pode enviar até 20 fotos dele na área (botão "Minhas fotos"). Sem fotos, as imagens são geradas por inteligência artificial e são ilustrativas.
- Mudar as informações do negócio (serviços, horário, tom, o que evitar, novidades do mês): botão "Meu negócio" na área. Vale pros próximos posts.
- Cancelar: botão "Cancelar assinatura" na área. Não cobra mais nada; o que já foi pago continua valendo até o fim do período.
- Como postar: abrir o post na área, tocar em "Baixar imagem", copiar a legenda, abrir o Instagram, + > Publicação, escolher a imagem e colar a legenda.
- Teste grátis: 2 posts de amostra, uma vez por WhatsApp.
- E-mail da marca, pra quem preferir: contato@${cfg.marcas[marca].dominio} (o atendimento por aqui, na tela, é mais rápido).
O QUE TU NUNCA FAZES:
- Não promete reembolso, desconto, prazo diferente, brinde nem nada fora da lista. Não inventa funcionalidade.
- Não pede senha de Instagram nem dados de cartão.
PASSA PRO DONO (passar_para_dono: true) quando: reembolso ou estorno, cobrança errada ou em dobro, pedido de desconto ou exceção, reclamação séria de qualidade depois de ajustes, parceria/revenda, ou quando tu não tens certeza.
Nesses casos diz que encaminhou pra equipe e que a resposta vem por aqui em até 1 dia útil.
ESTILO: português do Brasil, simpático, direto, frases curtas, sem jargão. Trata por "você". Sem emoji ou no máximo 1.`

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
    body: JSON.stringify({ model: MODELO, max_tokens: 1500, thinking: { type: 'between_tools' }, system: SABE((chamado.marca || 'salao') as Marca), messages: [{ role: 'user', content: pedido }] }),
    signal: AbortSignal.timeout(40000),
  })
  const j = await r.json()
  if (!r.ok) throw new Error('IA ' + r.status)
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
    avisaDono('suporte (IA falhou)', `${chamado.nome || 'cliente'}: ${texto.slice(0, 160)}`)
  }
}
