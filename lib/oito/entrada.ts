// Oito Posts: uma mensagem que chegou no WhatsApp (15/10). Usada pelo webhook (de verdade) e pela simulação (validação do agente).
// Grava a mensagem, guarda a imagem (foto ou logo) no armazenamento, descobre a marca pela mensagem pronta do anúncio/site
// e atualiza a conversa (janela de 24 h, não lidas, SAIR). Quem responde é o agente (agente.ts), depois de uns segundos.
import crypto from 'node:crypto'
import { oitoDb as db } from './db'
import { conversaDe, baixaMidia, ehSimulado } from './wa'
import { marcaDoTexto } from './agente'

const SAIR = new Set(['sair', 'parar', 'pare', 'stop', 'cancelar', 'descadastrar', 'salir', 'no mas', 'no más'])

export function textoDe(m: any) {
  if (m.type === 'text') return m.text?.body || ''
  if (m.type === 'button') return m.button?.text || m.button?.payload || ''
  if (m.type === 'interactive') return m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || ''
  if (m.type === 'reaction') return m.reaction?.emoji ? `(reagiu ${m.reaction.emoji})` : ''
  if (m.type === 'image') return '(mandou uma imagem)' + (m.image?.caption ? ' ' + m.image.caption : '')
  if (m.type === 'document') return '(mandou um arquivo' + (/image\//.test(m.document?.mime_type || '') ? ' de imagem' : '') + ')' + (m.document?.caption ? ' ' + m.document.caption : '')
  if (m.type === 'audio' || m.type === 'voice') return '(mandou um áudio: peça pra escrever, por enquanto não ouvimos áudio)'
  if (m.type === 'video') return '(mandou um vídeo)'
  if (m.type === 'sticker') return '(figurinha)'
  return `(${m.type})`
}

// m: a mensagem no formato da Meta; imagem: {id} da Meta ou {buf, mime} já baixada (simulação)
export async function recebe(m: any, nome: string | null, imagem?: { buf: Buffer; mime: string }) {
  if (await db.um('wa_msgs', { wamid: m.id })) return null   // a Meta repete eventos
  const cv = await conversaDe(m.from, { nome })
  if (ehSimulado(cv.telefone) && !cv.simulado) { await db.atualiza('wa_conversas', { id: cv.id }, { simulado: true }); cv.simulado = true }
  let texto = textoDe(m)
  // imagem (foto ou documento de imagem): guarda e numera; o agente decide se é logo ou foto
  const midiaId = m.image?.id || (/image\//.test(m.document?.mime_type || '') ? m.document.id : null)
  if (imagem || midiaId) {
    try {
      const { buf, mime } = imagem || await baixaMidia(midiaId)
      const ext = /png/.test(mime) ? 'png' : /webp/.test(mime) ? 'webp' : 'jpg'
      const path = await db.sobe(`whats/${cv.telefone}/${crypto.randomUUID().slice(0, 8)}.${ext}`, buf, mime)
      const r = cv.rascunho || {}, midias = [...(r.midias || []), { path, mime, em: new Date().toISOString() }]
      await db.atualiza('wa_conversas', { id: cv.id }, { rascunho: { ...r, midias } }); cv.rascunho = { ...r, midias }
      texto = texto.replace('(mandou uma imagem)', `(mandou a imagem #${midias.length})`).replace(/\(mandou um arquivo de imagem\)/, `(mandou a imagem #${midias.length})`)
    } catch (e: any) { texto += ' [a imagem não pôde ser baixada]' }
  }
  await db.insere('wa_msgs', { conversa_id: cv.id, autor: 'cliente', tipo: m.type, texto, wamid: m.id, status: 'recebido' }).catch(() => null)
  const agora = new Date(), sair = SAIR.has(texto.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))
  const marca = !cv.marca ? marcaDoTexto(texto) : null
  await db.atualiza('wa_conversas', { id: cv.id }, {
    ultima_msg: texto.slice(0, 200), ultima_msg_em: agora.toISOString(), atualizado_em: agora.toISOString(), janela_ate: new Date(agora.getTime() + 24 * 3600e3).toISOString(),
    nao_lidas: (cv.nao_lidas || 0) + 1, proximo_followup_em: null, ...(nome && !cv.nome ? { nome } : {}), ...(marca ? { marca } : {}), ...(sair ? { optout: true, modo: 'encerrada' } : {}),
  })
  await db.evento('wa_recebida', { cliente_id: cv.cliente_id || null, marca: cv.marca || marca || null, detalhe: { conversa: cv.id, simulado: !!cv.simulado } })
  return { cv, texto, sair, responder: !sair && cv.modo === 'ia' }
}
