// Motor de cálculo do Check-up de IA. Os NÚMEROS saem daqui (fórmula com premissas à mostra), nunca da IA.
// calcula(respostas, nicho) -> base, horas, faturamento a mais, notas por etapa, comparativos, tarefas por prioridade.
// respostas: valores já convertidos (lib/checkup/perguntas.ts: converte()).
// Tetos de sanidade: atendimento <= 80% das horas de WhatsApp declaradas; horas <= 35% do tempo da equipe;
// faturamento a mais <= 15% (conservador) e 30% (provável) do faturamento estimado hoje.

const med = (a: number[]) => (a[0] + a[1]) / 2
const SEM_MES = 4.33

export type Conta = ReturnType<typeof calcula>

export function calcula(r: Record<string, any>, nicho: any) {
  const premissas: string[] = []
  const C: number = r.contatos_semana || 20                 // contatos novos por semana
  const F = Math.max(0.05, Math.min(1, (r.fechamento ?? 3) / 10))
  const T: number = r.ticket || 100
  const V = C * F                                           // vendas novas por semana
  const temAgenda = r.agenda === 1
  const A: number = temAgenda ? (r.atendimentos_semana || V) : 0
  const freqAno: number = r.recompra ?? 1.5
  const ativos: number = r.clientes_ativos || Math.round(V * 52 * 0.6)
  const custoHora: number = r.custo_hora || 22
  const equipe: number = r.equipe || 2.5

  // faturamento atual estimado (pra teto de sanidade): o maior entre vendas novas e a base que volta
  const R0 = Math.max(V * SEM_MES * T, ativos * freqAno / 12 * T)
  premissas.push(`Faturamento estimado hoje: cerca de R$ ${Math.round(R0).toLocaleString('pt-BR')} por mês (pelas tuas respostas).`)

  const porSemana: Record<string, number> = {
    por_contato: C, por_agendamento: temAgenda ? A : 0, por_venda: V, por_cliente_ativo: ativos * freqAno / 52,
    por_dia: 6, por_semana: 1, por_mes: 1 / SEM_MES,
  }
  const doiMais = new Set<string>(r.tempo_gasto || [])
  const DOR: Record<string, string[]> = { atender: ['whatsapp'], vender: ['orcamento'], entregar: ['agenda'], fazer_voltar: ['posvenda'], administrar: ['planilha', 'cobranca', 'financeiro', 'estoque', 'equipe'], atrair: ['conteudo'] }
  const PALAVRA: Record<string, RegExp> = { whatsapp: /whatsapp|responder|atend|mensag|d[uú]vid/i, agenda: /agend|confirm|hor[aá]rio|remarc|falta/i, orcamento: /or[cç]amento|proposta|cota[cç]|aprova/i, cobranca: /cobr|pagamento|boleto|pix|inadimpl|sinal/i, posvenda: /p[oó]s|retorno|recompra|reposi|avalia|renova|revis/i, planilha: /planilha|cadastro|document|papel|ficha|contrato/i, conteudo: /conte[uú]do|post|instagram|campanha/i, estoque: /estoque|fornecedor|compra de|reposi[cç][aã]o de estoque/i, equipe: /equipe|produ[cç][aã]o|fila|ordem de servi|tarefa/i, financeiro: /financ|caixa|fechamento|comiss|nota fiscal/i }
  const dif: Record<string, number> = { baixa: 1, media: 1.5, alta: 2.5 }

  // ---- horas por tarefa ----
  const tarefas: any[] = (nicho.tarefas || []).map((t: any) => {
    const ehAgenda = t.gatilho === 'por_agendamento' || /agend|falta|confirm|no-show|remarc/i.test(t.tarefa)
    if (ehAgenda && !temAgenda) return null
    const f = porSemana[t.gatilho] ?? 1
    const m = t.minutos_por_vez || [2, 5], p = t.parte_que_a_ia_assume || [0.3, 0.6]
    const hCons = f * m[0] * p[0] / 60, hProv = f * med(m) * med(p) / 60
    const doi = [...doiMais].some(x => PALAVRA[x] && PALAVRA[x].test(t.tarefa + ' ' + (t.como_e_hoje || ''))) || (DOR[t.etapa] || []).some(x => doiMais.has(x))
    return { ...t, freq_semana: +f.toFixed(1), horas: [hCons, hProv], doi }
  }).filter(Boolean)

  // teto 1: o que é atendimento não passa do tempo que a pessoa disse que gasta no WhatsApp
  const hWpp = (r.horas_whatsapp || 1.5) * 6
  const atend = tarefas.filter(t => t.etapa === 'atender')
  const somaAt = atend.reduce((a, t) => a + t.horas[1], 0)
  if (somaAt > hWpp * 0.8) { const k = hWpp * 0.8 / somaAt; atend.forEach(t => { t.horas = t.horas.map((h: number) => h * k) }); premissas.push(`Atendimento limitado às ${String(hWpp).replace('.', ',')} h por semana que tu disse gastar no WhatsApp.`) }
  // teto 2: o total não passa de 35% das horas da equipe
  const tetoH = equipe * 44 * 0.35
  const somaH = tarefas.reduce((a, t) => a + t.horas[1], 0)
  if (somaH > tetoH) { const k = tetoH / somaH; tarefas.forEach(t => { t.horas = t.horas.map((h: number) => h * k) }); premissas.push(`Horas limitadas a 35% do tempo da equipe (${Math.round(tetoH)} h por semana).`) }

  // ---- faturamento a mais: um efeito por métrica (a tarefa mais forte), sem somar duas vezes ----
  const modResp = ((r.tempo_resposta ?? 1) + (r.fora_horario ?? 0.7)) / 2      // quem já responde rápido ganha menos
  const baseMetrica: Record<string, (e: number) => number> = {
    conversao: (e) => V * SEM_MES * T * e * modResp,
    falta: (e) => temAgenda ? A * SEM_MES * ((r.faltas ?? 1.5) / 10) * e * T : 0,
    recuperacao_perdidos: (e) => C * SEM_MES * (1 - F) * e * T * (r.followup ?? 0.6),
    recompra: (e) => ativos * freqAno / 12 * e * T,
    ticket: (e) => V * SEM_MES * T * e,
    indicacao: (e) => V * SEM_MES * T * e * (r.avaliacao_google ?? 0.6),
  }
  const melhor: Record<string, any> = {}
  for (const t of tarefas) {
    const ef = t.efeito; if (!ef || !baseMetrica[ef.metrica] || !ef.faixa) continue
    const al = t.alcance || [0.3, 0.6]
    const v = [baseMetrica[ef.metrica](ef.faixa[0] * al[0]), baseMetrica[ef.metrica](med(ef.faixa) * med(al))]
    t.receita = v
    if (!melhor[ef.metrica] || melhor[ef.metrica].receita[1] < v[1]) melhor[ef.metrica] = t
  }
  let rec = [0, 0]; Object.values(melhor).forEach((t: any) => { rec[0] += t.receita[0]; rec[1] += t.receita[1]; t.conta_no_total = true })
  const teto = [R0 * 0.15, R0 * 0.3]
  if (rec[1] > teto[1] || rec[0] > teto[0]) premissas.push('Ganho de faturamento limitado a 15% (conservador) e 30% (provável) do faturamento atual, pra não prometer o que não se sustenta.')
  rec = [Math.min(rec[0], teto[0]), Math.min(rec[1], teto[1])]

  // ---- prioridade: (horas em R$ + receita) × dor declarada ÷ dificuldade ----
  tarefas.forEach(t => {
    const valor = t.horas[1] * custoHora * SEM_MES + (t.conta_no_total ? t.receita[1] : (t.receita ? t.receita[1] * 0.3 : 0))
    t.prioridade = valor * (t.doi ? 1.8 : 1) / (dif[t.dificuldade] || 1.5)
  })
  tarefas.sort((a, b) => b.prioridade - a.prioridade)

  const horas = [tarefas.reduce((a, t) => a + t.horas[0], 0), tarefas.reduce((a, t) => a + t.horas[1], 0)]
  premissas.push(`Hora de trabalho valendo R$ ${custoHora} (custo de quem atende).`)

  // ---- nota de maturidade por etapa (0 a 100) ----
  const nota = (x: number) => Math.round(Math.max(0, Math.min(100, x)))
  const notas: Record<string, number | null> = {
    atrair: null,
    atender: nota(100 - 45 * (r.tempo_resposta ?? 1) - 25 * (r.fora_horario ?? 0.7)),
    vender: nota(100 - 50 * (r.followup ?? 0.6) - 30 * (1 - F)),
    entregar: temAgenda ? nota(100 - 300 * ((r.faltas ?? 1.5) / 10)) : null,
    fazer_voltar: nota(100 - 40 * (r.avaliacao_google ?? 0.6) - (freqAno < 1 ? 40 : 20)),
    administrar: nota(30 + 23 * (r.onde_guarda ?? 1) - 8 * ['planilha', 'cobranca', 'financeiro', 'estoque', 'equipe'].filter(x => doiMais.has(x)).length),
  }
  const mt = nicho.metricas_tipicas || {}
  const comparativos: { nome: string; teu: string; setor: string; posicao: string }[] = []
  const cmp = (nome: string, valor: number, faixa: any, fmt: (x: number) => string, inverso?: boolean) => {
    if (!Array.isArray(faixa) || faixa.length < 2 || faixa[0] == null) return
    const pos = valor < faixa[0] ? (inverso ? 'melhor' : 'abaixo') : valor > faixa[1] ? (inverso ? 'acima' : 'melhor') : 'na média'
    comparativos.push({ nome, teu: fmt(valor), setor: fmt(faixa[0]) + ' a ' + fmt(faixa[1]), posicao: pos })
  }
  const umaCasa = (x: number) => (+x).toFixed(1).replace('.0', '').replace('.', ',')
  cmp('Contatos novos por semana', C, mt.contatos_por_semana, x => String(Math.round(x)))
  cmp('De cada 10 que procuram, compram', F * 10, Array.isArray(mt.taxa_fechamento) ? mt.taxa_fechamento.map((x: number) => x * 10) : null, umaCasa)
  if (temAgenda) cmp('Faltas em cada 10 horários', (r.faltas ?? 1.5), Array.isArray(mt.falta_no_agendamento) ? mt.falta_no_agendamento.map((x: number) => x * 10) : null, umaCasa, true)
  const cc = comparativos.find(x => x.nome.startsWith('Contatos'))
  notas.atrair = cc ? (cc.posicao === 'abaixo' ? 30 : cc.posicao === 'na média' ? 60 : 85) : null

  return {
    comparativos,
    base: { contatos_semana: C, fechamento: F, ticket: T, vendas_semana: +V.toFixed(1), atendimentos_semana: A, clientes_ativos: ativos, faturamento_mes: Math.round(R0), custo_hora: custoHora },
    horas_semana: horas.map(h => +h.toFixed(1)),
    horas_mes_em_reais: horas.map(h => Math.round(h * custoHora * SEM_MES)),
    receita_mes: rec.map(Math.round), notas, premissas,
    tarefas: tarefas.map(t => ({
      etapa: t.etapa as string, tarefa: t.tarefa as string, como_automatizar: t.como_automatizar as string, dificuldade: t.dificuldade as string, freq_semana: t.freq_semana as number,
      horas_semana: t.horas.map((h: number) => +h.toFixed(1)) as number[], receita_mes: t.receita ? t.receita.map(Math.round) as number[] : null,
      metrica: t.efeito?.metrica as string | undefined, conta_no_total: !!t.conta_no_total, doi: !!t.doi, prioridade: Math.round(t.prioridade), fonte: t.efeito?.fonte as string | undefined,
    })),
  }
}
