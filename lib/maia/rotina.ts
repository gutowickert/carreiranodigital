// Maia: o que roda sozinho (03/11). O cron chama /api/maia/rotina de hora em hora.
//   - retomadas vencidas: manda pro cliente (quando o canal do negócio existir) ou junta num lembrete pro dono (hoje)
//   - segunda de manhã: o resumo da semana de cada negócio, que vai pra revisão da equipe antes de ir pro dono
//   - números da Meta: sincroniza o gasto e as conversas do dia
//   - 06/11: social media (lib/maia/social.ts), atrás de MAIA_SOCIAL_LIGADO=1
import { maiaDb as db } from './db'
import { conversa, conversaDoDono, mandaTexto, mandaModeloCliente, janelaAbertaCv } from './canal'
import { atendimentoLigado } from './wa-negocio'
import { contaChamadas } from './chamadas'
import { followupsVencidos, registraFollowup, encerraSemResposta, numeros } from './funil'
import { textoRetomada } from './atendente'
import { geraRelatorio } from './pecas'
import { sincronizaMetricas } from './meta'
import { rotinaSocial, socialLigado } from './social'
import { podeFalar } from './horario'

const horaBR = (d = new Date()) => (d.getUTCHours() + 21) % 24
const diaSemanaBR = (d = new Date()) => new Date(d.getTime() - 3 * 3600e3).getUTCDay()

// 07/11 (piloto): `relogio` é a hora usada pra janela de 9h às 20h (horario.ts). Só o teste local passa outra.
export async function retomadas(relogio = new Date()) {
  const vencidos = await followupsVencidos()
  const lembretes: Record<string, string[]> = {}
  const feitos: any[] = []
  for (const lead of vencidos) {
    const neg = await db.um('negocios', { id: lead.negocio_id })
    if (!neg || neg.status === 'cancelado' || neg.status === 'pausado') continue
    if ((lead.followups || 0) >= 3) { await encerraSemResposta(lead); feitos.push({ lead: lead.id, encerrado: true }); continue }
    // fora da janela (de madrugada, domingo cedo): não manda nem conta a tentativa; sai na próxima rodada dentro da janela
    if (!podeFalar(neg, relogio)) { feitos.push({ lead: lead.id, adiada: true }); continue }
    const { ultimo } = await registraFollowup(lead)
    const numero = (lead.followups || 0) + 1
    if (atendimentoLigado(neg) && lead.telefone) {
      // 05/11: o canal do negócio. Dentro da janela de 24 h, a retomada escrita pela Maia; fora dela, o modelo aprovado (maia_retomada).
      const cv = await conversa(neg.id, 'cliente', lead.telefone, { nome: lead.nome, lead_id: lead.id })
      if (janelaAbertaCv(cv)) await mandaTexto(cv, await textoRetomada(neg, lead, numero))
      else await mandaModeloCliente(cv, 'maia_retomada', [String(lead.nome || '').split(' ')[0] || 'tudo bem', neg.nome, lead.produto || 'o que tu tinha perguntado'], '(modelo maia_retomada) retomada ' + numero)
    } else {
      (lembretes[neg.id] ||= []).push(`${lead.nome || lead.telefone || 'contato'}${lead.produto ? ' (' + lead.produto + ')' : ''}${ultimo ? ', última tentativa' : ''}`)
    }
    feitos.push({ lead: lead.id, numero })
  }
  for (const [negocio_id, nomes] of Object.entries(lembretes)) {
    const neg = await db.um('negocios', { id: negocio_id })
    const cv = await conversaDoDono(neg)
    await mandaTexto(cv, `Ó, hoje vale chamar de novo: ${nomes.join('; ')}. Quer que eu escreva a mensagem pra cada um?`)
  }
  return feitos
}

// a venda de loja e de serviço acontece fora do WhatsApp: quem recebeu orçamento ou marcou horário há mais de um dia,
// a Maia pergunta pro dono se fechou (uma vez a cada 2 dias por contato). A resposta dele vira ganho ou perda no funil.
export async function confirmaVendas(forcar = false, relogio = new Date()) {
  if (!forcar && !(horaBR() === 18)) return []
  const agora = Date.now(), feitos: any[] = []
  const porNegocio: Record<string, any[]> = {}
  for (const l of await db.lista('leads', { etapa: 'proposta' })) {
    if (!forcar && agora - Date.parse(l.atualizado_em || l.criado_em) < 20 * 3600e3) continue
    const perguntas = (await db.lista('lead_eventos', { lead_id: l.id, tipo: 'pergunta_dono' })).filter(e => agora - Date.parse(e.criado_em) < 48 * 3600e3)
    if (perguntas.length) continue
    ;(porNegocio[l.negocio_id] ||= []).push(l)
  }
  for (const [negocio_id, leads] of Object.entries(porNegocio)) {
    const neg = await db.um('negocios', { id: negocio_id })
    if (!neg || neg.status === 'cancelado' || neg.status === 'pausado') continue
    if (!podeFalar(neg, relogio)) continue   // 07/11: pergunta pro dono só de dia, mesmo forçada
    const cv = await conversaDoDono(neg)
    const linhas = leads.slice(0, 6).map(l => `${l.nome || l.telefone}${l.produto ? ' (' + l.produto + (l.valor ? ', R$ ' + l.valor : '') + ')' : ''}`)
    await mandaTexto(cv, `Pra eu contar certinho as vendas: ${linhas.join('; ')}. ${leads.length === 1 ? 'Fechou?' : 'Quem fechou e quem não fechou?'}`)
    for (const l of leads) await db.insere('lead_eventos', { negocio_id, lead_id: l.id, tipo: 'pergunta_dono', autor: 'maia' })
    feitos.push({ negocio: negocio_id, perguntou: leads.length })
  }
  return feitos
}

export async function relatoriosDaSemana(forcar = false) {
  if (!forcar && !(diaSemanaBR() === 1 && horaBR() === 7)) return []
  const ate = new Date(), de = new Date(ate.getTime() - 7 * 86400e3)
  const feitos: any[] = []
  for (const neg of await db.lista('negocios', { status: 'ativo' })) {
    const n = await numeros(neg.id, de.toISOString(), ate.toISOString())
    const p = await geraRelatorio(neg, n)
    feitos.push({ negocio: neg.id, peca: p.id })
  }
  return feitos
}

export async function roda(opc: { forcarRelatorio?: boolean; relogio?: Date } = {}) {
  const r: any = {}
  const relogio = opc.relogio || new Date()
  try { r.retomadas = await retomadas(relogio) } catch (e: any) { r.retomadas_erro = e.message }
  try { r.confirmacoes = await confirmaVendas(opc.forcarRelatorio, relogio) } catch (e: any) { r.confirmacoes_erro = e.message }
  try { r.relatorios = await relatoriosDaSemana(opc.forcarRelatorio) } catch (e: any) { r.relatorios_erro = e.message }
  try { if (horaBR() % 6 === 0 || opc.forcarRelatorio) r.metricas = await sincronizaMetricas() } catch (e: any) { r.metricas_erro = e.message }
  // 05/11: as leituras da Marketing API que contam pras 500 chamadas do acesso completo
  try { r.chamadas = await contaChamadas() } catch (e: any) { r.chamadas_erro = e.message }
  // 06/11: social media (plano Completa): publica o que venceu, lê os resultados 1x por dia (7h) e a análise do mês no dia 1. Só com MAIA_SOCIAL_LIGADO=1
  try { if (socialLigado()) r.social = await rotinaSocial({ forcar: opc.forcarRelatorio }) } catch (e: any) { r.social_erro = e.message }
  // 06/11: a demonstração grátis: a retomada única de 24 h e a fila das amostras (lib/maia/demo-amostra.ts)
  // só com MAIA_DEMO_ROTINA=1: ela manda mensagem pra lead de verdade (retomada e amostra da fila), então liga junto com o teste
  try { if (process.env.MAIA_DEMO_ROTINA === '1') { const { rotinaDemo } = await import('./demo-amostra'); r.demo = await rotinaDemo() } } catch (e: any) { r.demo_erro = e.message }
  return r
}
