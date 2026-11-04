// Maia: por onde ela fala (03/11).
//   canal 'dono'    → o número da Maia (hoje o do Oito): todos os donos falam com ela ali, e ela reconhece cada um pelo telefone
//   canal 'cliente' → o WhatsApp do próprio negócio, quando o Tech Provider liberar (wa_phone_id do negócio). Até lá, só simulado.
// Telefones de simulação (começam com 55000) nunca saem pra Meta (mesma regra do Oito).
import { maiaDb as db, maiaLocal } from './db'
import { enviaTexto, enviaImagem, enviaVideo, fone, ehSimulado } from '@/lib/oito/wa'

type Envio = { ok: boolean; wamid?: string; erro?: string }
const simulado = (): Envio => ({ ok: true, wamid: 'sim-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) })

function podeSair(cv: any) {
  if (ehSimulado(cv.telefone) || cv.simulada) return false
  if (cv.canal === 'cliente') return false   // o canal do negócio só abre com o Tech Provider (aqui ainda não existe envio)
  return true
}

async function registra(cv: any, autor: 'maia' | 'equipe' | 'sistema', texto: string, r: Envio, tipo = 'texto', midia_id: string | null = null) {
  await db.insere('msgs', { conversa_id: cv.id, negocio_id: cv.negocio_id, autor, tipo, texto, midia_id, wamid: r.wamid || null, status: r.ok ? 'enviado' : 'falhou' })
  await db.atualiza('conversas', { id: cv.id }, { ultima_msg: texto.slice(0, 200), ultima_msg_em: new Date().toISOString() })
  return r
}

export async function mandaTexto(cv: any, texto: string, autor: 'maia' | 'equipe' | 'sistema' = 'maia') {
  const r = podeSair(cv) ? await enviaTexto(cv.telefone, texto) : simulado()
  return registra(cv, autor, texto, r)
}
export async function mandaImagem(cv: any, link: string, legenda: string, autor: 'maia' | 'equipe' = 'maia') {
  const r = podeSair(cv) ? await enviaImagem(cv.telefone, link, legenda) : simulado()
  return registra(cv, autor, '(imagem) ' + legenda, r, 'imagem')
}
export async function mandaVideo(cv: any, link: string, legenda: string, autor: 'maia' | 'equipe' = 'maia') {
  const r = podeSair(cv) ? await enviaVideo(cv.telefone, link, legenda) : simulado()
  return registra(cv, autor, '(vídeo) ' + legenda, r, 'video')
}

// acha ou cria a conversa (por negócio, canal e telefone)
export async function conversa(negocio_id: string, canal: 'dono' | 'cliente', telefone: string, extra: { nome?: string | null; lead_id?: string | null } = {}) {
  const tel = fone(telefone)
  let cv = await db.um('conversas', { negocio_id, canal, telefone: tel })
  if (cv) return cv
  try {
    cv = await db.insere('conversas', { negocio_id, canal, telefone: tel, nome: extra.nome || null, lead_id: extra.lead_id || null, simulada: ehSimulado(tel) })
  } catch (e: any) { if (/duplicate|23505/.test(e.message)) cv = await db.um('conversas', { negocio_id, canal, telefone: tel }); else throw e }
  return cv!
}

// a conversa da Maia com o dono de um negócio
export async function conversaDoDono(neg: any) { return conversa(neg.id, 'dono', neg.dono_whatsapp, { nome: neg.dono_nome }) }

// o negócio de quem escreveu pro número da Maia (o dono ou alguém da equipe dele), ou null
export async function negocioDoTelefone(telefone: string) {
  const tel = fone(telefone)
  const alt = /^55\d{10}$/.test(tel) ? tel.slice(0, 4) + '9' + tel.slice(4) : /^55\d{2}9\d{8}$/.test(tel) ? tel.slice(0, 4) + tel.slice(5) : ''
  for (const t of [tel, alt].filter(Boolean)) {
    const n = await db.um('negocios', { dono_whatsapp: t })
    if (n && n.status !== 'cancelado') return n
  }
  const todos = await db.lista('negocios')
  return todos.find(n => n.status !== 'cancelado' && (n.equipe_whatsapp || []).some((x: string) => x === tel || x === alt)) || null
}

// avisa a equipe da escola (o Guto, no celular). No modo local só anota.
export async function avisaEquipe(titulo: string, texto: string, negocio_id: string | null = null, urgente = false) {
  await db.evento('aviso_equipe', negocio_id, { titulo, texto })
  if (maiaLocal() || process.env.MAIA_SEM_AVISO === '1') { console.log(`[aviso equipe] ${titulo}: ${texto}`); return }
  const { avisaDono } = await import('@/lib/oito/servico')
  avisaDono('Maia · ' + titulo, texto.slice(0, 200), urgente)
}
