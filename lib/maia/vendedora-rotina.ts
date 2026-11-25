// Maia: a rotina da VENDA da Maia no número da Maia (24/11, doc do Guto "Maia vende a Maia" + o pedido dele no WhatsApp:
// "a pessoa que preencher o funil e não chamar pra conversar, a Maia deve chamar no WhatsApp automaticamente").
// Roda de hora em hora (rotina.ts), só com MAIA_VENDEDORA_LIGADA=1 e só das 9h às 20h (domingo a partir das 10h).
//   1) chamaQuemNaoChamou: lead do quiz (turma maiaquiz) feito há 5 min ou mais (até 48 h; era 1 h até 24/11), que não escreveu no número da Maia
//      → modelo maia_diagnostico (nome, negócio, o ponto principal com o número dele). Uma vez só por lead. RS fica pro time.
//   2) retomaVenda: conversa de venda (fase 'maia', modo 'ia', com lead) em que a Maia falou por último e ele não respondeu:
//      20 h depois → texto livre (ainda dentro das 24 h); 3 dias → modelo maia_venda_retomada; 6 dias → maia_venda_despedida e o
//      lead vai pra Perda ("não respondeu"; o gatilho do funil move o cartão). Respondeu, o contador zera (a vendedora segue).
// Modelo que a Meta recusou ou ainda não aprovou: não marca nada, avisa o time 1x por dia e tenta na próxima rodada.
import { oitoDb as db } from '@/lib/oito/db'
import { enviaTexto, enviaModelo, registraSaida, fone, ehSimulado } from '@/lib/oito/wa'
import { escola, avisaTime, ehRS, ETAPA_FUNIL, vendedoraLigada } from './vendedora'
import { reaisQuiz as reais } from './quiz/quiz'
import { podeFalar, horaLocal, JANELA } from './horario'

const H = 3600e3, DIA = 24 * H
const primeiro = (n: any) => String(n || '').trim().split(/\s+/)[0] || 'tudo bem'
const negocioDe = (lead: any) => String(lead?.qualificacao?.negocio || '').trim() || 'o seu negócio'
const ganhoDe = (lead: any) => {
  const q = lead?.qualificacao || {}
  const v = q.ganho_anuncio_mes || q.oportunidade_mes
  const p = String(q.principal || 'mais cliente chegando pelo anúncio').replace(/\.$/, '').toLowerCase()
  return v ? `${p}, uns ${reais(v)} por mês` : p
}
const tel55 = (w: string) => { const d = String(w || '').replace(/\D/g, ''); return d.length <= 11 ? '55' + d : d }
async function conversaDoTel(tel: string) {
  const t = fone(tel)
  const alt = /^55\d{10}$/.test(t) ? t.slice(0, 4) + '9' + t.slice(4) : /^55\d{2}9\d{8}$/.test(t) ? t.slice(0, 4) + t.slice(5) : ''
  return (await db.um('wa_conversas', { telefone: t })) || (alt ? await db.um('wa_conversas', { telefone: alt }) : null)
}
let avisouModelo = ''
async function falhaModelo(nome: string, erro: string, agora: Date) {
  const dia = agora.toISOString().slice(0, 10)
  if (avisouModelo === dia + nome) return
  avisouModelo = dia + nome
  await avisaTime('modelo da venda não saiu', `O modelo ${nome} não saiu: ${erro.slice(0, 140)}. Confere se ele foi criado e aprovado (painel da Maia → Rotina → modelos).`, false)
}

// 24/11 (pedido do Guto: "a IA deveria chamar automático quem finaliza o quiz"): a Telma (ótica de Natal) fez o quiz às
// 19h52; com a espera de 1 h e a janela até 20h, ficou pra 9h do outro dia. Agora: espera ESPERA_QUIZ (5 min), e pra quem fez
// o quiz a janela vai até FIM_QUIZ (21h), porque foi a própria pessoa que deixou o contato. A rota do quiz chama esta função
// sozinha uns 5 min depois de gravar o lead (só ele, `soLead`), a qualquer hora; a rotina de hora em hora segue como rede de
// segurança e só chama das 9h às 21h.
export const ESPERA_QUIZ = 5 * 60e3
export const FIM_QUIZ = 21
export function podeChamarQuiz(agora = new Date()) {
  if (podeFalar(null, agora)) return true
  const h = horaLocal(agora)
  const x = h.hora + h.minuto / 60
  return x >= (h.diaSemana === 0 ? JANELA.inicioDomingo : JANELA.inicio) && x < FIM_QUIZ
}

export async function chamaQuemNaoChamou(agora = new Date(), opc: { soLead?: string } = {}) {
  if (!vendedoraLigada()) return { pulou: 'vendedora desligada' }
  const E = await escola()
  // 24/11 (Guto: "a Maia pode atender 24 h"): a chamada logo depois do quiz (`soLead`, ~5 min) sai a QUALQUER hora — a pessoa
  // acabou de deixar o contato, está com o celular na mão. Só a varredura de hora em hora (leads mais antigos) respeita a janela.
  if (!opc.soLead && !podeChamarQuiz(agora)) return { pulou: 'fora do horário' }
  const leads = (await E.leadsQuiz(new Date(agora.getTime() - 48 * H).toISOString(), new Date(agora.getTime() - ESPERA_QUIZ + 30e3).toISOString()))
    .filter((l: any) => !opc.soLead || l.id === opc.soLead)
  const feitos: any[] = []
  for (const lead of leads) {
    const q = lead.qualificacao || {}
    if (q.maia_chamado_em || !lead.whatsapp || ['ganho', 'perdido', 'proposta', 'reuniao'].includes(q.maia_etapa)) continue
    if (ehRS(lead)) continue
    const tel = tel55(lead.whatsapp)
    let cv: any = await conversaDoTel(tel)
    if (cv) {
      const dele = (await db.lista('wa_msgs', { conversa_id: cv.id })).some((m: any) => m.autor === 'cliente')
      if (dele || cv.optout) { await E.atualizaLead(lead.id, { qualificacao: { ...q, maia_chamado_em: 'já tinha conversa' } }).catch(() => null); continue }
    }
    const corpo = [primeiro(lead.nome), negocioDe(lead), ganhoDe(lead)]
    const r: any = await enviaModelo(tel, 'maia_diagnostico', 'pt_BR', corpo)
    if (!r.ok) { await falhaModelo('maia_diagnostico', String(r.erro || ''), agora); feitos.push({ lead: lead.id, erro: r.erro }); continue }
    if (!cv) cv = await db.insere('wa_conversas', { telefone: fone(tel), nome: lead.nome || null, fase: 'maia', modo: 'ia', ia_respostas: 0, rascunho: { maia: { lead_id: lead.id, venda: true, chamada_quiz: agora.toISOString() } }, ...(ehSimulado(tel) ? { simulado: true } : {}) })
    else await db.atualiza('wa_conversas', { id: cv.id }, { fase: 'maia', modo: 'ia', rascunho: { ...(cv.rascunho || {}), maia: { ...(cv.rascunho?.maia || {}), lead_id: lead.id, venda: true, chamada_quiz: agora.toISOString() } } })
    await registraSaida(cv, 'sistema', `[modelo maia_diagnostico] Oi, ${corpo[0]}! Aqui é a Maia... diagnóstico pra ${corpo[1]}: ${corpo[2]}.`, r, 'modelo')
    await E.atualizaLead(lead.id, { qualificacao: { ...q, maia_chamado_em: agora.toISOString() } }).catch(() => null)
    await E.andamento(lead.id, 'Fez o quiz e não chamou: a Maia chamou no WhatsApp (modelo do diagnóstico).', ETAPA_FUNIL.novo).catch(() => null)
    feitos.push({ lead: lead.id, chamado: true })
  }
  return feitos
}

const RETOMA_20H = 'Oi! Ficou alguma dúvida sobre o que eu te mostrei? Se quiser, eu te explico em poucas mensagens ou marco 20 minutos com o Rick, da nossa equipe, pra te mostrar o sistema por vídeo.'
export async function retomaVenda(agora = new Date()) {
  if (!vendedoraLigada()) return { pulou: 'vendedora desligada' }
  if (!podeFalar(null, agora)) return { pulou: 'fora do horário' }
  const E = await escola()
  const cvs = (await db.lista('wa_conversas', { fase: 'maia' })).filter((c: any) => c.modo === 'ia' && !c.optout && c.rascunho?.maia?.lead_id)
  const feitos: any[] = []
  for (const cv of cvs) {
    const msgs = await db.lista('wa_msgs', { conversa_id: cv.id }, { ordem: 'criado_em' })
    const ult = msgs[msgs.length - 1]
    if (!ult || ult.autor === 'cliente' || ult.autor === 'dono') continue      // ele falou por último, ou o time está na conversa
    const ultDele = [...msgs].reverse().find((m: any) => m.autor === 'cliente')
    const mx = cv.rascunho?.maia || {}
    // as marcas valem desde a última mensagem DELE (respondeu = recomeça); sem mensagem dele, desde a chamada do quiz
    const desde = ultDele?.criado_em || mx.chamada_quiz || msgs[0]?.criado_em
    const st = mx.retoma_desde === desde ? (mx.retoma_feitas || {}) : {}
    const desdeMs = agora.getTime() - Date.parse(desde), ultMs = agora.getTime() - Date.parse(ult.criado_em)
    const janela = !!ultDele && agora.getTime() - Date.parse(ultDele.criado_em) < 23.5 * H
    const qual = !st.d6 && st.d3 && desdeMs >= 6 * DIA ? '6d' : !st.d3 && desdeMs >= 3 * DIA ? '3d' : !st.h20 && !st.d3 && ultMs >= 20 * H && janela ? '20h' : ''
    if (!qual) continue
    const lead = await E.achaLead(String(cv.telefone).replace(/\D/g, '').slice(-8)).catch(() => null)
    const q = lead?.qualificacao || {}
    if (['ganho', 'perdido'].includes(q.maia_etapa)) continue
    const nomes = [primeiro(cv.nome || lead?.nome), negocioDe(lead)]
    const modelo = qual === '3d' ? 'maia_venda_retomada' : qual === '6d' ? 'maia_venda_despedida' : ''
    const r: any = qual === '20h' ? await enviaTexto(cv.telefone, RETOMA_20H) : await enviaModelo(cv.telefone, modelo, 'pt_BR', nomes)
    const texto = qual === '20h' ? RETOMA_20H : `[modelo ${modelo}] ${nomes.join(', ')}`
    if (!r?.ok) { if (modelo) await falhaModelo(modelo, String(r?.erro || ''), agora); feitos.push({ conversa: cv.id, qual, erro: r?.erro }); continue }
    await registraSaida(cv, 'sistema', texto, r, qual === '20h' ? 'texto' : 'modelo')
    await db.atualiza('wa_conversas', { id: cv.id }, { rascunho: { ...(cv.rascunho || {}), maia: { ...mx, retoma_desde: desde, retoma_feitas: { ...st, [qual === '20h' ? 'h20' : qual === '3d' ? 'd3' : 'd6']: agora.toISOString() } } } })
    if (lead?.id) {
      if (qual === '6d') {
        await E.atualizaLead(lead.id, { qualificacao: { ...q, maia_etapa: 'perdido', maia_motivo_perda: 'não respondeu a retomada' } }).catch(() => null)
        await E.andamento(lead.id, 'Não respondeu a retomada (20 h, 3 dias e 6 dias): a Maia mandou a despedida. Perdido: não respondeu.', ETAPA_FUNIL.perdido).catch(() => null)
      } else await E.andamento(lead.id, `Retomada da Maia (${qual === '20h' ? '20 horas' : '3 dias'}): ele não tinha respondido.`, null).catch(() => null)
    }
    feitos.push({ conversa: cv.id, qual })
  }
  return feitos
}
