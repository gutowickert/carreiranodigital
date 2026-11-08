// Maia: quando a conversa está com gente (07/11, piloto).
//   - conversa de cliente passada pro dono/equipe (modo 'humano') VOLTA pra Maia sozinha depois de 24 h sem o dono ou a equipe
//     falar nela, ou na hora em que o dono pede no WhatsApp ("devolve pra Maia")
//   - pergunta de cliente que a Maia passou pro dono e ele não respondeu: lembra o dono em 1 h e avisa a equipe em 3 h
// A rotina de hora em hora chama devolveSozinha e cobraPerguntas. Mensagem pro dono só de dia (horario.ts).
import { maiaDb as db } from './db'
import { conversaDoDono, mandaTexto, avisaEquipe } from './canal'
import { podeFalar } from './horario'

export const VOLTA_HORAS = 24
const H = 3600e3
const primeiro = (s: any) => String(s || '').trim().split(' ')[0]
const semAcento = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export async function devolve(cv: any, motivo: string, por: string) {
  await db.atualiza('conversas', { id: cv.id }, { modo: 'ia' })
  await db.evento('conversa_devolvida', cv.negocio_id, { conversa_id: cv.id, motivo, por })
}

// quando foi a última vez que alguém (dono ou equipe) mexeu numa conversa que está com gente
async function ultimaVezHumano(cv: any) {
  const msgs = await db.lista('msgs', { conversa_id: cv.id }, { ordem: 'criado_em', desc: true, limite: 50 })
  const m = msgs.find(x => x.autor === 'dono' || x.autor === 'equipe')
  const ev = (await db.lista('eventos', { negocio_id: cv.negocio_id, tipo: 'modo_humano' }, { ordem: 'criado_em', desc: true, limite: 50 })).find(e => e.detalhe?.conversa_id === cv.id)
  const ts = [m?.criado_em, ev?.criado_em].filter(Boolean).map((x: string) => Date.parse(x))
  return ts.length ? Math.max(...ts) : Date.parse(cv.ultima_msg_em || cv.criado_em)
}

// a rotina: 24 h sem o dono/equipe falar → volta pra Maia (e o dono fica sabendo)
export async function devolveSozinha(relogio = new Date()) {
  const feitos: any[] = []
  for (const cv of await db.lista('conversas', { canal: 'cliente', modo: 'humano' })) {
    const neg = await db.um('negocios', { id: cv.negocio_id })
    if (!neg || neg.status === 'cancelado') continue
    if (Date.now() - (await ultimaVezHumano(cv)) < VOLTA_HORAS * H) continue
    if (!podeFalar(neg, relogio)) continue
    await devolve(cv, '24h_sem_humano', 'rotina')
    const esperando = (await db.lista('msgs', { conversa_id: cv.id }, { ordem: 'criado_em', desc: true, limite: 1 }))[0]?.autor === 'cliente'
    if (neg.dono_whatsapp) await mandaTexto(await conversaDoDono(neg), `A conversa com ${cv.nome || cv.telefone} voltou pra mim: passou 24 h sem ninguém responder por aí. Se quiser seguir tu, é só responder ele pelo celular.`).catch(() => null)
    if (esperando) await avisaEquipe('cliente esperando resposta', `${neg.nome}: ${cv.nome || cv.telefone} ficou 24 h com o dono sem resposta. A conversa voltou pra Maia.`, neg.id)
    feitos.push({ conversa: cv.id })
  }
  return feitos
}

// o dono pediu no WhatsApp pra Maia voltar a atender
export const pedeDevolver = (t: string) => {
  const s = semAcento(t)
  return /\bdevolv\w*\b/.test(s) && /\b(maia|ti|pra voce|conversa|atendimento|atender)\b/.test(s) || /\b(maia|tu)\b[^.?!]*\b(pode|volta|voltar|podes)\b[^.?!]*\batend/.test(s)
}

// devolve as conversas que estão com gente: as do nome citado, ou todas se não citou ninguém
export async function devolvePeloDono(neg: any, texto?: string | null, nome?: string | null) {
  const humanas = await db.lista('conversas', { negocio_id: neg.id, canal: 'cliente', modo: 'humano' })
  if (!humanas.length) return []
  const alvo = semAcento(nome || '') || null
  const t = semAcento(texto || '')
  let escolhidas = humanas.filter(c => { const p = semAcento(primeiro(c.nome)); return p && (alvo ? alvo.includes(p) || p.includes(alvo.split(' ')[0]) : new RegExp('\\b' + p + '\\b').test(t)) })
  if (!escolhidas.length && !alvo) escolhidas = humanas
  for (const c of escolhidas) await devolve(c, 'dono_pediu', 'dono')
  return escolhidas.map(c => c.nome || c.telefone)
}

// pergunta de cliente esperando o dono: lembrete pro dono em 1 h (de dia), aviso pra equipe em 3 h
export async function cobraPerguntas(relogio = new Date()) {
  const agora = Date.now(), feitos: any[] = []
  const perguntas = (await db.lista('lead_eventos', { tipo: 'pergunta_cliente' })).filter(e => agora - Date.parse(e.criado_em) < 3 * 86400e3)
  for (const e of perguntas) {
    const evs = await db.lista('lead_eventos', { lead_id: e.lead_id })
    if (evs.some(x => x.tipo === 'pergunta_respondida' && x.criado_em > e.criado_em)) continue
    const lead = await db.um('leads', { id: e.lead_id })
    if (!lead || lead.etapa === 'ganho' || lead.etapa === 'perdido') continue
    const neg = await db.um('negocios', { id: e.negocio_id })
    if (!neg || neg.status === 'cancelado') continue
    const idade = agora - Date.parse(e.criado_em)
    const ja = (nivel: string) => evs.some(x => x.tipo === 'pergunta_lembrete' && x.detalhe?.pergunta_id === e.id && x.detalhe?.nivel === nivel)
    if (idade >= 1 * H && !ja('dono') && podeFalar(neg, relogio)) {
      await mandaTexto(await conversaDoDono(neg), `Lembrete: ${lead.nome || 'um cliente'} ainda espera tua resposta: ${e.detalhe?.pergunta || ''}. Me responde aqui que eu passo pra ele.`)
      await db.insere('lead_eventos', { negocio_id: neg.id, lead_id: lead.id, tipo: 'pergunta_lembrete', autor: 'maia', detalhe: { pergunta_id: e.id, nivel: 'dono' } })
      feitos.push({ pergunta: e.id, lembrou: 'dono' })
    }
    if (idade >= 3 * H && !ja('equipe')) {
      await avisaEquipe('pergunta sem resposta do dono', `${neg.nome}: ${lead.nome || 'um cliente'} perguntou "${String(e.detalhe?.pergunta || '').slice(0, 120)}" há ${Math.floor(idade / H)} h e o dono não respondeu. Cobra ele ou responde pelo painel.`, neg.id)
      await db.insere('lead_eventos', { negocio_id: neg.id, lead_id: lead.id, tipo: 'pergunta_lembrete', autor: 'maia', detalhe: { pergunta_id: e.id, nivel: 'equipe' } })
      feitos.push({ pergunta: e.id, lembrou: 'equipe' })
    }
  }
  return feitos
}
