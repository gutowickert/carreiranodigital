// Maia: o que roda sozinho (03/11). O cron chama /api/maia/rotina de hora em hora.
//   - retomadas vencidas: manda pro cliente (quando o canal do negócio existir) ou junta num lembrete pro dono (hoje)
//   - segunda de manhã: o resumo da semana de cada negócio, que vai pra revisão da equipe antes de ir pro dono (13/11: resumo-semana.ts)
//   - números da Meta: sincroniza o gasto e as conversas do dia
//   - 06/11: social media (lib/maia/social.ts), atrás de MAIA_SOCIAL_LIGADO=1
import { maiaDb as db } from './db'
import { conversa, conversaDoDono, mandaTexto, mandaModeloCliente, mandaBotoes, janelaAbertaCv } from './canal'
import { atendimentoLigado } from './wa-negocio'
import { contaChamadas } from './chamadas'
import { followupsVencidos, registraFollowup, encerraSemResposta, FOLLOWUP_DIAS } from './funil'
import { textoRetomada } from './atendente'
import { sincronizaMetricas } from './meta'
import { rotinaSocial, socialLigado } from './social'
import { podeFalar } from './horario'
import { nomeDoModelo } from './modelos'

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
    if ((lead.followups || 0) >= FOLLOWUP_DIAS.length) { await encerraSemResposta(lead); feitos.push({ lead: lead.id, encerrado: true }); continue }
    // fora da janela (de madrugada, domingo cedo): não manda nem conta a tentativa; sai na próxima rodada dentro da janela
    if (!podeFalar(neg, relogio)) { feitos.push({ lead: lead.id, adiada: true }); continue }
    const numero = (lead.followups || 0) + 1
    // 13/11: o evento da retomada diz como ela saiu e se foi a despedida (a 3ª escrita pela Maia), pra medir a resposta depois
    const cv = atendimentoLigado(neg) && lead.telefone ? await conversa(neg.id, 'cliente', lead.telefone, { nome: lead.nome, lead_id: lead.id }) : null
    const como = !cv ? 'lembrete_dono' : janelaAbertaCv(cv) ? 'texto' : 'modelo'
    const tipo = numero >= FOLLOWUP_DIAS.length && como === 'texto' ? 'despedida' : 'retomada'
    // 14/11 (ensaio geral): o texto sai ANTES de contar a tentativa. Com a IA fora do ar, a retomada não conta e sai na próxima
    // rodada (antes contava sem mandar nada e parava as outras da hora; com 3 horas de IA fora o contato era encerrado sem receber nenhuma)
    let texto = ''
    if (cv && como === 'texto') {
      try { texto = await textoRetomada(neg, lead, numero) } catch (e: any) { feitos.push({ lead: lead.id, erro: 'texto da retomada: ' + String(e?.message || e).slice(0, 120) }); continue }
    }
    const { ultimo } = await registraFollowup(lead, { tipo, como })
    if (cv) {
      // 05/11: o canal do negócio. Dentro da janela de 24 h, a retomada escrita pela Maia; fora dela, o modelo aprovado (maia_retomada).
      if (como === 'texto') await mandaTexto(cv, texto)
      else {
        // 08/11 (T2): o modelo no tom do negócio (maia_retomada_voce no "você", o padrão)
        const modelo = nomeDoModelo(neg, 'maia_retomada'), voce = modelo.endsWith('_voce')
        await mandaModeloCliente(cv, modelo, [String(lead.nome || '').split(' ')[0] || 'tudo bem', neg.nome, lead.produto || (voce ? 'o que você tinha perguntado' : 'o que tu tinha perguntado')], `(modelo ${modelo}) retomada ` + numero)
      }
    } else {
      (lembretes[neg.id] ||= []).push(`${lead.nome || lead.telefone || 'contato'}${lead.produto ? ' (' + lead.produto + ')' : ''}${ultimo ? ', última tentativa' : ''}`)
    }
    feitos.push({ lead: lead.id, numero, tipo, como })
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
    const linha = (l: any) => `${l.nome || l.telefone}${l.produto ? ' (' + l.produto + (l.valor ? ', R$ ' + l.valor : '') + ')' : ''}`
    const linhas = leads.slice(0, 6).map(linha)
    // 08/11 (T12): dentro da janela de 24 h, uma pergunta por contato com os botões "Fechou" / "Não fechou" (o clique vira
    // ganho ou perdido na hora: dono.ts, respostaDeVenda). Fora da janela, o texto de sempre (vai pra fila; ele responde escrevendo)
    if (janelaAbertaCv(cv) || /^55000/.test(String(cv.telefone || ''))) {
      for (const l of leads.slice(0, 6)) await mandaBotoes(cv, `Pra eu contar certinho as vendas: ${linha(l)}. Fechou?`, [{ id: `venda:${l.id}:sim`, titulo: 'Fechou' }, { id: `venda:${l.id}:nao`, titulo: 'Não fechou' }])
    } else await mandaTexto(cv, `Pra eu contar certinho as vendas: ${linhas.join('; ')}. ${leads.length === 1 ? 'Fechou?' : 'Quem fechou e quem não fechou?'}`)
    for (const l of leads) await db.insere('lead_eventos', { negocio_id, lead_id: l.id, tipo: 'pergunta_dono', autor: 'maia' })
    feitos.push({ negocio: negocio_id, perguntou: leads.length })
  }
  return feitos
}

// 08/11 (T12): quem recebe o resumo da semana. O negócio em PILOTO fica em "implantação" até a 1ª campanha (meta.ts muda pra
// ativo): ele também recebe quando já atende clientes (atendimento ligado) ou teve contato no funil na semana.
// Demonstração, pausado e cancelado ficam de fora
export async function negociosDoResumo(de: Date) {
  const { ehDemo } = await import('./demo-amostra')
  const leadsSemana = (await db.lista('leads')).filter(l => (l.atualizado_em || l.criado_em) >= de.toISOString())
  return (await db.lista('negocios')).filter(n => !ehDemo(n) && (n.status === 'ativo' || (n.status === 'implantacao' && (n.meta?.wa?.atende === true || leadsSemana.some(l => l.negocio_id === n.id)))))
}

export async function relatoriosDaSemana(forcar = false) {
  if (!forcar && !(diaSemanaBR() === 1 && horaBR() === 7)) return []
  const ate = new Date(), de = new Date(ate.getTime() - 7 * 86400e3)
  const feitos: any[] = []
  for (const neg of await negociosDoResumo(de)) {
    // 13/11 (resumo-semana.ts): o texto sai pronto, sem IA: conversas, vendas, retorno, o melhor anúncio e uma sugestão
    const { geraResumoSemana } = await import('./resumo-semana')
    const { peca } = await geraResumoSemana(neg, de, ate)
    feitos.push({ negocio: neg.id, peca: peca.id })
  }
  return feitos
}

export async function roda(opc: { forcarRelatorio?: boolean; relogio?: Date; forcarGuarda?: boolean } = {}) {
  const r: any = {}
  const relogio = opc.relogio || new Date()
  try { r.retomadas = await retomadas(relogio) } catch (e: any) { r.retomadas_erro = e.message }
  try { r.confirmacoes = await confirmaVendas(opc.forcarRelatorio, relogio) } catch (e: any) { r.confirmacoes_erro = e.message }
  // 07/11 (piloto): conversa com gente volta pra Maia depois de 24 h; pergunta sem resposta do dono: lembra em 1 h, equipe em 3 h
  try { const { devolveSozinha, cobraPerguntas } = await import('./humano'); r.devolvidas = await devolveSozinha(relogio); r.perguntas = await cobraPerguntas(relogio) } catch (e: any) { r.devolvidas_erro = e.message }
  try { r.relatorios = await relatoriosDaSemana(opc.forcarRelatorio) } catch (e: any) { r.relatorios_erro = e.message }
  // 13/11 (relatorios.ts): 8h no fuso do negócio: a análise dos anúncios de 2 em 2 dias, o aviso (dia 1) e o relatório do mês (dia 2)
  try { const { rotinaRelatorios } = await import('./relatorios'); r.analises = await rotinaRelatorios({ agora: relogio }) } catch (e: any) { r.analises_erro = e.message }
  // 08/11 (LGPD): 1x por dia apaga as conversas sem mensagem há mais de 12 meses (meta.atendimento.guarda_meses)
  try { const { apagaVencidos } = await import('./lgpd'); r.guarda = await apagaVencidos(new Date(), !!opc.forcarGuarda) } catch (e: any) { r.guarda_erro = e.message }
  // 07/11 (piloto): as conversas do mês por negócio; avisa a equipe em 80% e 100% da franquia (não bloqueia nada)
  try { const { avisaFranquia } = await import('./uso'); r.franquia = await avisaFranquia() } catch (e: any) { r.franquia_erro = e.message }
  try { if (horaBR() % 6 === 0 || opc.forcarRelatorio) r.metricas = await sincronizaMetricas() } catch (e: any) { r.metricas_erro = e.message }
  // 05/11: as leituras da Marketing API que contam pras 500 chamadas do acesso completo
  try { r.chamadas = await contaChamadas() } catch (e: any) { r.chamadas_erro = e.message }
  // 06/11: social media (desde 08/11 no plano único): publica o que venceu, lê os resultados 1x por dia (7h) e a análise do mês no dia 1. Só com MAIA_SOCIAL_LIGADO=1
  try { if (socialLigado()) r.social = await rotinaSocial({ forcar: opc.forcarRelatorio }) } catch (e: any) { r.social_erro = e.message }
  // 08/11 (T15): a Maia Gestora (lib/maia/gestora-rotina.ts): 7h todas as regras, de 2 em 2 h (9h–19h) as urgentes da Meta. Só lê. Só com MAIA_GESTORA_LIGADA=1
  // 13/11 (cobranca.ts): confere no Asaas o que foi pago (baixa no financeiro da escola) e avisa a equipe do que venceu ontem
  // 13/11 (material.ts): dia 1 e 12 pede ao dono o material do lote; no dia do lote, se não chegou, avisa a equipe
  try { const { rotinaMaterial } = await import('./material'); r.material = await rotinaMaterial(relogio) } catch (e: any) { r.material_erro = e.message }
  try { const { confereCobrancas } = await import('./cobranca'); r.cobranca = await confereCobrancas(relogio) } catch (e: any) { r.cobranca_erro = e.message }
  try { if (process.env.MAIA_GESTORA_LIGADA === '1') { const { rotinaGestora } = await import('./gestora-rotina'); r.gestora = await rotinaGestora({ relogio }) } } catch (e: any) { r.gestora_erro = e.message }
  // 13/11 (acompanhamento.ts): 7h a análise de ontem dos negócios novos, segunda 8h as regras propostas, e as regras aprovadas no contexto
  try { const { rotinaAprendizado } = await import('./acompanhamento'); r.aprendizado = await rotinaAprendizado({ relogio, forcar: opc.forcarRelatorio }) } catch (e: any) { r.aprendizado_erro = e.message }
  // 06/11: a demonstração grátis: a retomada única de 24 h e a fila das amostras (lib/maia/demo-amostra.ts)
  // só com MAIA_DEMO_ROTINA=1: ela manda mensagem pra lead de verdade (retomada e amostra da fila), então liga junto com o teste
  try { if (process.env.MAIA_DEMO_ROTINA === '1') { const { rotinaDemo } = await import('./demo-amostra'); r.demo = await rotinaDemo() } } catch (e: any) { r.demo_erro = e.message }
  return r
}
