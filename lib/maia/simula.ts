// Maia: a simulação (03/11). O painel e os testes mandam mensagem "como se fosse" o dono ou um cliente do negócio,
// pelo mesmo caminho do WhatsApp de verdade. Nada sai pra Meta: dono e cliente simulados têm telefone 55000...
import { maiaDb as db } from './db'
import { recebeDoDono, respondeDono } from './dono'
import { recebeDoCliente, respondeCliente } from './atendente'
import type { MidiaSimulada } from './midia-cliente'

let seq = 0
const wamid = () => 'simin-' + Date.now() + '-' + (++seq)

export async function comoDono(negocio_id: string, d: { texto?: string; arquivo?: { buf: Buffer; mime: string; legenda?: string }; reacao?: { emoji: string; wamid: string } }) {
  const neg = await db.um('negocios', { id: negocio_id })
  if (!neg) throw new Error('negócio não existe')
  let m: any
  if (d.reacao) m = { id: wamid(), type: 'reaction', reaction: { emoji: d.reacao.emoji, message_id: d.reacao.wamid } }
  else if (d.arquivo) m = /video/.test(d.arquivo.mime) ? { id: wamid(), type: 'video', video: { caption: d.arquivo.legenda } } : /audio/.test(d.arquivo.mime) ? { id: wamid(), type: 'audio', audio: {} } : { id: wamid(), type: 'image', image: { caption: d.arquivo.legenda } }
  else m = { id: wamid(), type: 'text', text: { body: d.texto || '' } }
  const r = await recebeDoDono(neg, m, neg.dono_nome, d.arquivo ? { buf: d.arquivo.buf, mime: d.arquivo.mime } : undefined)
  if (!r) return null
  // a mídia sozinha não pede resposta na hora (o dono costuma mandar várias): o teste chama responder quando quiser
  if (d.arquivo && !/audio/.test(d.arquivo.mime)) return { recebido: r.texto, respondeu: null }
  const resp = r.responder ? await respondeDono(r.cv.id) : null
  return { recebido: r.texto, respondeu: resp }
}

export async function responderDono(negocio_id: string) {
  const cv = await db.um('conversas', { negocio_id, canal: 'dono' })
  return cv ? respondeDono(cv.id) : null
}

// 07/11 (piloto): o cliente simulado também manda áudio e foto. No modo de teste, `simulado` diz o que "seria" a transcrição
// ou a descrição (sem chamar o Deepgram), ou falhar: true pra testar a resposta honesta de quando não deu pra ouvir/ver
// 08/11 (teste completo, #11): esperar_ms = a mesma espera do webhook de verdade (12 s): a mensagem fica guardada e só a
// ÚLTIMA de uma rajada responde, pra todas juntas. As outras voltam { juntou: true }. Só simulação.
export const ESPERA_WEBHOOK_MS = 12000
export async function comoCliente(negocio_id: string, d: { telefone: string; nome?: string; texto: string; anuncio?: string | null; esperar_ms?: number | null; arquivo?: { buf: Buffer; mime: string; legenda?: string; simulado?: MidiaSimulada | null } }) {
  const neg = await db.um('negocios', { id: negocio_id })
  if (!neg) throw new Error('negócio não existe')
  const tipo = d.arquivo ? (/audio/.test(d.arquivo.mime) ? 'audio' : 'image') : null
  const id = wamid()
  const r = await recebeDoCliente(neg, { telefone: d.telefone, nome: d.nome, texto: d.texto || '', wamid: id, referral: d.anuncio ? { source_id: d.anuncio } : null,
    ...(d.arquivo ? { tipo, midia: { buf: d.arquivo.buf, mime: d.arquivo.mime, simulado: d.arquivo.simulado || null }, legenda: d.arquivo.legenda || null } : {}) })
  if (!r) return null
  if (d.esperar_ms && d.esperar_ms > 0) {
    await new Promise(ok => setTimeout(ok, Math.min(d.esperar_ms!, 30000)))
    const ult = (await db.lista('msgs', { conversa_id: (r.cv as any).id }, { ordem: 'criado_em', desc: true, limite: 20 })).find(x => x.autor === 'cliente')
    if (ult && ult.wamid !== id) return { lead: r.lead.id, respondeu: null, juntou: true }
    // o dono falou nessa conversa nas últimas 2 h (eco do celular): a Maia fica quieta, igual ao webhook
    const atual = await db.um('conversas', { id: (r.cv as any).id })
    if (!atual || atual.modo !== 'ia') return { lead: r.lead.id, respondeu: null }
  }
  const resp = r.responder ? await respondeCliente((r.cv as any).id) : null
  return { lead: r.lead.id, respondeu: resp }
}
