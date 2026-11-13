// Maia: as CONTAS e os TEXTOS da análise de 2 em 2 dias e do relatório do mês (13/11). SÓ FUNÇÕES PURAS: nada aqui lê
// banco, Meta ou manda mensagem (quem lê e grava é lib/maia/relatorios.ts). Não importa nada, pra o teste rodar direto no
// node (scripts/maia-teste-relatorios.mjs). Todo número que vai pro dono sai daqui, calculado; a IA (só no relatório do mês)
// escreve as conclusões em cima destes números e nunca inventa outro (relatorios.ts confere).
//
// As regras de mexer em anúncio (o método do Guto, 13/11):
//   - até ~10 vendas vindas de anúncio, julga pela MÉTRICA SECUNDÁRIA (a etapa do funil antes da compra, que vem da implantação
//     em contexto.trafego.metricas_secundarias). Sem ela definida, vale "receberam proposta/orçamento" (marcado como padrão)
//   - PAUSAR só se: sem venda E secundária ruim, ou passou do ciclo de venda (contexto.trafego.ciclo_venda_dias) sem converter
//   - ESTIMULAR o que vende (ou, antes de 10 vendas, o que mais chega na secundária) com conversa barata, sempre dentro do
//     teto de verba por dia (limites.ts, R$ 60). Somando as campanhas no ar, nunca passa do teto
//   - a sugestão nunca é feita sozinha: vai pra equipe e depois pergunta pro dono se ele topa testar

export const ETAPAS_ORDEM = ['novo', 'conversando', 'interessado', 'proposta', 'ganho']
export const VENDAS_PRA_JULGAR_POR_VENDA = 10
export const CICLO_PADRAO_DIAS = 7

const r2 = (n: number) => Math.round(n * 100) / 100
export const R$ = (v: number) => 'R$ ' + r2(v).toLocaleString('pt-BR', { minimumFractionDigits: Math.round(v * 100) % 100 ? 2 : 0, maximumFractionDigits: 2 })
export const pct = (v: number) => Math.round(v * 100) + '%'
export const plural = (n: number, s: string, p = s + 's') => `${n} ${n === 1 ? s : p}`
const semAc = (s: any) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
export const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
export const nomeDoMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`
const esc = (s: any) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

// ─────────────────────────── a métrica secundária e o ciclo de venda (da implantação)
export type Secundaria = { nome: string; etapa: string | null; padrao: boolean }

// o nome que a implantação deu ("pediu orçamento", "agendou visita") vira uma etapa do funil da Maia quando dá pra saber
export function etapaDe(s: any): string | null {
  const t = semAc(s).trim()
  if (!t) return null
  if (ETAPAS_ORDEM.includes(t)) return t
  if (/propost|orcament|cotac|valor|preco|pix|pagament|link de pag/.test(t)) return 'proposta'
  if (/interess|escolh|agend|visita|marc|reserv|test/.test(t)) return 'interessado'
  if (/convers|respond/.test(t)) return 'conversando'
  return null
}

// aceita texto, lista de textos ou lista de { nome, etapa }. A primeira que tiver nome vale. Sem nada: o padrão (proposta)
export function secundariaDo(neg: any): Secundaria {
  const v = neg?.contexto?.trafego?.metricas_secundarias
  const lista = Array.isArray(v) ? v : v ? [v] : []
  for (const x of lista) {
    const nome = typeof x === 'string' ? x.trim() : String(x?.nome || x?.metrica || x?.etapa || '').trim()
    const etapa = etapaDe(typeof x === 'object' && x?.etapa ? x.etapa : nome)
    if (nome) return { nome, etapa, padrao: false }
  }
  return { nome: 'receberam proposta ou orçamento', etapa: 'proposta', padrao: true }
}

export function cicloDo(neg: any): { dias: number; padrao: boolean } {
  const n = Number(neg?.contexto?.trafego?.ciclo_venda_dias)
  return n > 0 && n < 400 ? { dias: n, padrao: false } : { dias: CICLO_PADRAO_DIAS, padrao: true }
}

// quando um lead chegou (pela 1ª vez) na etapa da secundária ou depois dela. eventos = lead_eventos do lead (com `para`)
export function chegouEm(lead: any, eventos: any[], etapa: string | null): string | null {
  if (!etapa) return null
  const alvo = ETAPAS_ORDEM.indexOf(etapa)
  if (alvo < 0) return null
  const passou = eventos.filter(e => e.para && ETAPAS_ORDEM.indexOf(e.para) >= alvo).map(e => String(e.criado_em)).sort()
  if (passou.length) return passou[0]
  // sem evento (dado antigo, ou marcado por fora): a etapa de hoje e a última mudança
  if (ETAPAS_ORDEM.indexOf(lead.etapa) >= alvo) return String(lead.ganho_em || lead.atualizado_em || lead.criado_em)
  return null
}

// o dia do relatório do mês: o 1º dia a partir do dia 2 em que o negócio abre (até o dia 8). abre = dias da semana (0=domingo) ou null
export function diaDoRelatorioCom(abre: number[] | null, ano: number, mes: number) {
  for (let dia = 2; dia <= 8; dia++) { const w = new Date(Date.UTC(ano, mes - 1, dia, 12)).getUTCDay(); if (!abre || abre.includes(w)) return dia }
  return 2
}

// ─────────────────────────── os anúncios e a decisão da análise
export type AnuncioNum = {
  id: string; nome: string; campanha_id?: string | null; campanha?: string | null; verba_dia?: number | null; campanha_ativa?: boolean
  inicio?: string | null            // quando começou a rodar (ativação da campanha, 1º gasto ou 1º contato)
  gasto: number | null; conversas: number | null   // da Meta, por anúncio (null quando não dá pra ler por anúncio)
  contatos: number; secundaria: number | null; vendas: number; receita: number
  arquivo?: string | null           // 13/11: o criativo da peça da Maia (imagem ou vídeo no armazenamento), quando o anúncio é dela
}
export type Sugestao = { tipo: 'pausar' | 'estimular'; anuncio: string; nome: string; texto: string; motivo: string; verba_de?: number | null; verba_para?: number | null; campanha_id?: string | null }
export type Decisao = {
  conclusao: 'segue' | 'segura' | 'mudar'
  julga_por: 'vendas' | 'secundaria'
  sugestoes: Sugestao[]
  em_teste: { anuncio: string; nome: string; faltam_dias: number }[]
  texto: string                      // a frase da conclusão, pronta pro WhatsApp
  medias: { custo_conversa: number | null; taxa_secundaria: number | null }
}

const custoConversa = (a: { gasto: number | null; conversas: number | null }) => a.gasto != null && a.conversas ? a.gasto / a.conversas : null
const idadeDias = (inicio: string | null | undefined, agora: number) => inicio ? Math.max(0, (agora - Date.parse(inicio)) / 86400e3) : null

export function decide(o: { anuncios: AnuncioNum[]; vendas_historico: number; ciclo: number; teto: number; agora: number; secundaria: Secundaria }): Decisao {
  const { anuncios, ciclo, teto, agora } = o
  const conta = o.secundaria.etapa != null && anuncios.every(a => a.secundaria != null)
  const julga_por: Decisao['julga_por'] = o.vendas_historico >= VENDAS_PRA_JULGAR_POR_VENDA || !conta ? 'vendas' : 'secundaria'
  // médias da conta: custo por conversa (só onde a Meta deu o gasto por anúncio) e a taxa da secundária (por contato)
  const comCusto = anuncios.filter(a => a.gasto != null && a.conversas)
  const gSoma = comCusto.reduce((s, a) => s + (a.gasto || 0), 0), cSoma = comCusto.reduce((s, a) => s + (a.conversas || 0), 0)
  const mediaCusto = cSoma ? gSoma / cSoma : null
  const contSoma = anuncios.reduce((s, a) => s + a.contatos, 0), secSoma = anuncios.reduce((s, a) => s + (a.secundaria || 0), 0)
  const mediaSec = conta && contSoma ? secSoma / contSoma : null

  const sugestoes: Sugestao[] = [], em_teste: Decisao['em_teste'] = []
  for (const a of anuncios) {
    if (a.vendas > 0) continue
    const idade = idadeDias(a.inicio, agora)
    const taxa = conta && a.contatos ? (a.secundaria || 0) / a.contatos : null
    // secundária ruim: com gente suficiente pra julgar (5+ contatos), ninguém chegou ou chegou menos da metade da média
    // (com 10+ vendas o julgamento é pela venda: aí só o ciclo de venda pausa)
    const secRuim = julga_por === 'secundaria' && taxa != null && a.contatos >= 5 && (taxa === 0 || (mediaSec != null && mediaSec > 0 && taxa < mediaSec * 0.5))
    const passouCiclo = idade != null && idade > ciclo && a.contatos >= 3
    if (secRuim || passouCiclo) {
      const motivo = secRuim
        ? `${plural(a.contatos, 'contato')}, ${a.secundaria ? `só ${a.secundaria} chegou` : 'nenhum chegou'} em "${o.secundaria.nome}"${mediaSec ? ` (a média dos anúncios é ${pct(mediaSec)})` : ''} e nenhuma venda`
        : `já roda há ${Math.floor(idade!)} dias, passou do tempo normal de venda (${ciclo} dias), com ${plural(a.contatos, 'contato')} e nenhuma venda`
      sugestoes.push({ tipo: 'pausar', anuncio: a.id, nome: a.nome, motivo, texto: `pausar "${a.nome}" (${motivo})`, campanha_id: a.campanha_id || null })
    } else if (idade == null || idade <= ciclo) {
      em_teste.push({ anuncio: a.id, nome: a.nome, faltam_dias: idade == null ? ciclo : Math.max(1, Math.ceil(ciclo - idade)) })
    }
  }

  // estimular: o que vende (ou, antes de 10 vendas, o que mais leva gente pra secundária) com conversa barata
  const bom = (a: AnuncioNum) => {
    const c = custoConversa(a)
    const barato = c == null || mediaCusto == null || c <= mediaCusto * 1.1
    if (!barato) return false
    if (julga_por === 'vendas') return a.vendas > 0
    const taxa = a.contatos ? (a.secundaria || 0) / a.contatos : 0
    return a.vendas > 0 || ((a.secundaria || 0) >= 2 && mediaSec != null && taxa >= mediaSec)
  }
  const pausados = new Set(sugestoes.map(s => s.anuncio))
  const candidatos = anuncios.filter(a => !pausados.has(a.id) && bom(a))
    .sort((x, y) => (y.vendas - x.vendas) || ((y.secundaria || 0) - (x.secundaria || 0)) || ((custoConversa(x) ?? 1e9) - (custoConversa(y) ?? 1e9)))
  const melhor = candidatos[0]
  if (melhor) {
    // verba: a soma das campanhas no ar nunca passa do teto (o que sobra no teto é o máximo que dá pra subir)
    const ativas = new Map<string, number>()
    for (const a of anuncios) if (a.campanha_id && a.campanha_ativa !== false && a.verba_dia) ativas.set(a.campanha_id, Number(a.verba_dia))
    const total = [...ativas.values()].reduce((s, v) => s + v, 0)
    const liberado = sugestoes.filter(s => s.tipo === 'pausar' && s.campanha_id && s.campanha_id !== melhor.campanha_id && anuncios.filter(a => a.campanha_id === s.campanha_id).every(a => pausados.has(a.id)))
      .reduce((s, x) => s + (ativas.get(x.campanha_id!) || 0), 0)
    const folga = Math.max(0, teto - total + liberado)
    const de = melhor.verba_dia ? Number(melhor.verba_dia) : null
    const c = custoConversa(melhor)
    const porque = melhor.vendas > 0
      ? `${plural(melhor.vendas, 'venda')}${c != null ? `, conversa a ${R$(c)}` : ''}`
      : `${melhor.secundaria} de ${plural(melhor.contatos, 'contato')} chegaram em "${o.secundaria.nome}"${c != null ? `, conversa a ${R$(c)}` : ''}`
    if (de != null && folga >= 1) {
      const para = Math.min(de + folga, Math.max(de + 1, Math.round(de * 1.2)), teto)
      sugestoes.push({ tipo: 'estimular', anuncio: melhor.id, nome: melhor.nome, motivo: porque, verba_de: de, verba_para: para, campanha_id: melhor.campanha_id || null,
        texto: `subir a verba de "${melhor.nome}" de ${R$(de)} pra ${R$(para)} por dia (${porque})` })
    } else if (de == null) {
      sugestoes.push({ tipo: 'estimular', anuncio: melhor.id, nome: melhor.nome, motivo: porque, campanha_id: melhor.campanha_id || null,
        texto: `dar mais verba pra "${melhor.nome}", dentro do teto de ${R$(teto)} por dia (${porque})` })
    } else if (liberado === 0 && sugestoes.length) {
      // no teto: não sobe, mas o anúncio bom fica dito (o dinheiro do que pausar vai pra ele)
      sugestoes.push({ tipo: 'estimular', anuncio: melhor.id, nome: melhor.nome, motivo: porque, verba_de: de, verba_para: de, campanha_id: melhor.campanha_id || null,
        texto: `manter "${melhor.nome}" como o principal (${porque}); a verba já está no teto de ${R$(teto)} por dia` })
    }
  }

  // (o "manter no teto" só entra junto com uma pausa: aí é mudança)
  const mexe = sugestoes
  let conclusao: Decisao['conclusao'], texto: string
  if (mexe.length) {
    conclusao = 'mudar'
    texto = `Sugiro mudar: ${mexe.map(s => s.texto).join('; e ')}. Topa testar assim? Me responde aqui que eu passo pra equipe ajustar.`
  } else if (em_teste.length) {
    conclusao = 'segura'
    const t = em_teste.sort((a, b) => b.faltam_dias - a.faltam_dias)[0]
    texto = `Segura mais uns dias de teste: ${em_teste.length === 1 ? `o anúncio "${t.nome}" ainda está` : `${em_teste.length} anúncios (como o "${t.nome}") ainda estão`} dentro do tempo normal de venda (${ciclo} dias; falta${t.faltam_dias === 1 ? '' : 'm'} ${plural(t.faltam_dias, 'dia')}). Mexer agora atrapalha o aprendizado do anúncio.`
  } else {
    conclusao = 'segue'
    texto = anuncios.length ? 'Segue como está: os anúncios estão dentro do esperado e não tem nada pra mexer agora.' : 'Segue como está: ainda não tem anúncio com contato suficiente pra mexer.'
  }
  return { conclusao, julga_por, sugestoes: mexe, em_teste, texto, medias: { custo_conversa: mediaCusto != null ? r2(mediaCusto) : null, taxa_secundaria: mediaSec != null ? r2(mediaSec) : null } }
}

// ─────────────────────────── o texto da análise (WhatsApp, curto, sem IA)
export const TITULO_ANALISE = 'Análise dos anúncios'
export type DadosAnalise = {
  negocio: string; dono?: string | null; de: string; ate: string
  gasto: number; conversas: number; contatos: number; secundaria: number | null; sec: Secundaria
  vendas: number; receita: number; decisao: Decisao; ciclo: { dias: number; padrao: boolean }
}
export function custoPorConversa(gasto: number, conversas: number) { return gasto > 0 && conversas > 0 ? r2(gasto / conversas) : null }

export function textoAnalise(d: DadosAnalise, comConclusao = true) {
  const l: string[] = []
  l.push(`${TITULO_ANALISE} do ${d.negocio} (${ddmm(d.de)} a ${ddmm(d.ate)})${d.dono ? `, ${d.dono}` : ''}:`)
  const cpc = custoPorConversa(d.gasto, d.conversas)
  if (d.gasto > 0) l.push(`- Investido: ${R$(d.gasto)} · ${plural(d.conversas, 'conversa')}${cpc != null ? ` · ${R$(cpc)} por conversa` : ''}`)
  else l.push('- Sem gasto de anúncio nesses dias')
  if (d.sec.etapa && d.secundaria != null) l.push(`- Chegaram em "${d.sec.nome}": ${d.secundaria}${d.contatos ? ` de ${plural(d.contatos, 'contato novo', 'contatos novos')}` : ''}${d.sec.padrao ? ' (a etapa padrão, até a implantação definir a tua)' : ''}`)
  else l.push(`- A etapa antes da compra ("${d.sec.nome}") ainda não dá pra medir no funil: por enquanto eu olho conversas e vendas`)
  l.push(`- Vendas: ${d.vendas}${d.vendas ? `, somando ${R$(d.receita)}` : ''}`)
  if (comConclusao) l.push(`Conclusão: ${d.decisao.texto}`)
  return l.join('\n')
}

// ─────────────────────────── 13/11: a IMAGEM da análise (card 1080x1350 que a oficina monta: maia-oficina/analise.js)
const maiusc = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
export const TITULO_CONCLUSAO = { segue: 'Segue como está', segura: 'Segura mais uns dias', mudar: 'Sugiro mudar' } as const
// o anúncio do card: o que a sugestão manda estimular, senão o que manda pausar, senão o que está em teste, senão o melhor
export function anuncioDaVez(anuncios: AnuncioNum[], dec: Decisao): (AnuncioNum & { linha: string }) | null {
  const est = dec.sugestoes.find(s => s.tipo === 'estimular'), pau = dec.sugestoes.find(s => s.tipo === 'pausar')
  const id = est?.anuncio || pau?.anuncio || dec.em_teste[0]?.anuncio || anuncios[0]?.id
  const a = anuncios.find(x => x.id === id)
  if (!a) return null
  const cc = a.gasto != null && a.conversas ? a.gasto / a.conversas : null
  const linha = est?.anuncio === a.id ? 'o que mais vende: vale dar mais verba' : pau?.anuncio === a.id ? 'não está trazendo gente pra compra' : dec.em_teste.some(t => t.anuncio === a.id) ? 'em teste, dentro do tempo de venda' : 'o melhor do período'
  const nums = [plural(a.contatos, 'contato'), a.vendas ? plural(a.vendas, 'venda') : '', cc != null ? `${R$(cc)} por conversa` : ''].filter(Boolean).join(', ')
  return { ...a, linha: `${maiusc(linha)}. ${nums} (30 dias).` }
}
export type CardAnalise = ReturnType<typeof cardAnalise>
export function cardAnalise(d: DadosAnalise, anuncios: AnuncioNum[]) {
  const cpc = custoPorConversa(d.gasto, d.conversas), dec = d.decisao, ad = anuncioDaVez(anuncios, dec)
  const itens = dec.conclusao === 'mudar' ? dec.sugestoes.map(s => s.tipo === 'pausar' ? `Pausar "${s.nome}": ${s.motivo}.` : maiusc(s.texto) + '.')
    : [dec.texto.replace(/^(Segue como está|Segura mais uns dias de teste)[:.]\s*/, '')]
  return {
    negocio: d.negocio, titulo: TITULO_ANALISE, periodo: `${ddmm(d.de)} a ${ddmm(d.ate)}`,
    numeros: [
      { valor: d.gasto > 0 ? R$(d.gasto) : 'R$ 0', rotulo: 'investido' },
      { valor: String(d.conversas), rotulo: d.conversas === 1 ? 'conversa' : 'conversas' },
      { valor: cpc != null ? R$(cpc) : '–', rotulo: 'por conversa' },
      d.sec.etapa && d.secundaria != null ? { valor: d.contatos ? `${d.secundaria} de ${d.contatos}` : String(d.secundaria), rotulo: `chegaram em "${d.sec.nome}"` } : { valor: '–', rotulo: 'etapa antes da compra: ainda sem medida' },
      { valor: String(d.vendas), rotulo: d.vendas ? `${d.vendas === 1 ? 'venda' : 'vendas'}, somando ${R$(d.receita)}` : 'vendas' },
    ],
    anuncio: ad ? { nome: ad.nome, linha: ad.linha } : null,
    anuncio_arquivo: ad?.arquivo && /\.(jpe?g|png|webp)$/i.test(ad.arquivo) ? ad.arquivo : null,
    conclusao: { tipo: dec.conclusao, titulo: TITULO_CONCLUSAO[dec.conclusao], itens },
    pergunta: dec.conclusao === 'mudar' ? 'Topa testar?' : null,
  }
}
// a legenda curta que vai com a imagem no WhatsApp (o texto completo fica na peça e no painel)
export function legendaAnalise(d: DadosAnalise) {
  const cpc = custoPorConversa(d.gasto, d.conversas)
  const nums = [d.gasto > 0 ? `${R$(d.gasto)} investidos` : 'sem gasto de anúncio', plural(d.conversas, 'conversa') + (cpc != null ? ` (${R$(cpc)} cada)` : ''), plural(d.vendas, 'venda')].join(', ')
  const muda = (s: Sugestao) => s.tipo === 'pausar' ? `pausar "${s.nome}"` : s.verba_para && s.verba_de && s.verba_para !== s.verba_de ? `subir "${s.nome}" pra ${R$(s.verba_para)}/dia` : `manter "${s.nome}"`
  const fim = d.decisao.conclusao === 'mudar' ? `${TITULO_CONCLUSAO.mudar}: ${d.decisao.sugestoes.map(muda).join(' e ')}. Topa testar? Me responde aqui.` : `${TITULO_CONCLUSAO[d.decisao.conclusao]}.`
  return `${TITULO_ANALISE} do ${d.negocio} (${ddmm(d.de)} a ${ddmm(d.ate)}): ${nums}. ${fim}`
}

// ─────────────────────────── o relatório do mês
export type Organico = { posts: { dia: string; tipo: string; tema: string | null; legenda: string; alcance: number; interacoes: number; views: number; salvos: number; midia?: any }[]; estimular: string | null; tirar: string | null }
export type DadosMes = {
  negocio: string; dono: string | null; mes: string; de: string; ate: string; teto: number
  sec: Secundaria; ciclo: { dias: number; padrao: boolean }
  whatsapp: {
    conversas: number; contatos_novos: number; ganhos: number; receita: number; perdas: number; motivos: [string, number][]
    passadas: number; passadas_motivos: [string, number][]; reclamacoes: number
    time: { passadas: number; respondidas: number; tempo_medio_min: number | null; sem_resposta: number; paradas: number; vendas_depois: number }
    primeira_resposta_min: number | null; conversas_atendidas: number
  }
  trafego: {
    gasto: number; conversas: number; custo_conversa: number | null; contatos_anuncio: number; secundaria: number | null; vendas: number; receita: number
    dias_com_gasto: number; verba_media_dia: number | null; retorno: number | null
    anuncios: (AnuncioNum & { qualificado: boolean; custo_conversa: number | null })[]
    mexidas: { dia: string; texto: string }[]
  }
  organico: Organico & { total: number; alcance: number; contatos: number; social_ligado: boolean }
  criacao: { criadas: number; aprovadas: number; no_ar: number; por_tipo: Record<string, number> }
  anterior: { vendas: number; receita: number; gasto: number; conversas: number } | null
  // 13/11 (mais visual): a marca do negócio, as semanas do mês (gráficos) e os campeões (anúncio e post)
  marca?: { primaria: string | null; secundaria: string | null; logo: string | null }
  semanas?: { rotulo: string; conversas: number; vendas: number; investido: number }[]
  campeao_anuncio?: { id: string; nome: string; motivo: string; arquivo: string | null; thumb: string | null } | null
  campeao_post?: { dia: string; tipo: string; tema: string | null; legenda: string; alcance: number; views: number; interacoes: number; midia: { caminho?: string | null; url?: string | null; tipo?: string | null } | null } | null
}

// as semanas do mês (1–7, 8–14, 15–21, 22–28, 29–fim), pra os gráficos de barras
export function semanasDoMes(mes: string) {
  const [a, m] = mes.split('-').map(Number), fim = new Date(Date.UTC(a, m, 0)).getUTCDate()
  const s: { rotulo: string; de: number; ate: number }[] = []
  for (let d = 1; d <= fim; d += 7) s.push({ rotulo: `${String(d).padStart(2, '0')}–${String(Math.min(d + 6, fim)).padStart(2, '0')}`, de: d, ate: Math.min(d + 6, fim) })
  if (s.length > 4 && s[s.length - 1].ate - s[s.length - 1].de < 2) { const u = s.pop()!; s[s.length - 1].ate = u.ate; s[s.length - 1].rotulo = s[s.length - 1].rotulo.slice(0, 3) + String(u.ate).padStart(2, '0') }
  return s
}
// o dia (1–31) no Brasil de um ISO
export const diaBRdoMes = (iso: string) => Number(new Date(Date.parse(iso) - 3 * 3600e3).toISOString().slice(8, 10))

// a cor da marca que dá pra usar em cima do branco (clara demais vira um grafite); sem marca, o roxo da Maia
export function corDaMarca(c: string | null | undefined, reserva = '#6d28d9') {
  const ok = typeof c === 'string' && /^#?[0-9a-f]{6}$/i.test(c.trim())
  if (!ok) return reserva
  const h = '#' + c!.trim().replace('#', '').toLowerCase()
  const n = parseInt(h.slice(1), 16), f = (x: number) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) }
  const L = 0.2126 * f(n >> 16) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255)
  return (1.05 / (L + 0.05)) >= 3 ? h : '#3a3835'
}

// o tom do mês: boas notícias quando vendeu e (sem anúncio, ou o anúncio se pagou, ou vendeu mais que o mês anterior)
export function tomDoMes(d: DadosMes): 'boas' | 'olhar' {
  const v = d.whatsapp.ganhos, r = d.whatsapp.receita, g = d.trafego.gasto
  if (v === 0) return 'olhar'
  if (g === 0 || r >= g) return 'boas'
  if (d.anterior && v > d.anterior.vendas) return 'boas'
  return 'olhar'
}

export function textoAviso(d: { negocio: string; dono: string | null; mes: string }, tom: 'boas' | 'olhar') {
  const nome = d.dono ? `${d.dono}, ` : ''
  return tom === 'boas'
    ? `${nome}amanhã separa uma horinha que eu te mando o relatório completo de ${nomeDoMes(d.mes)} do ${d.negocio}. Spoiler: tem boas notícias.`
    : `${nome}amanhã separa uma horinha que eu te mando o relatório completo de ${nomeDoMes(d.mes)} do ${d.negocio}. Tem umas coisas que a gente precisa olhar juntos.`
}

// a projeção: conta simples a partir do mês (sem prometer). Cada cenário diz a conta que fez
export type Cenario = { titulo: string; conta: string; conversas: number; vendas: number | null; receita: number | null }
export function projecao(d: DadosMes): { cenarios: Cenario[]; aviso: string } {
  const t = d.trafego
  const aviso = 'Conta simples com os números deste mês: não é promessa. Quando a verba sobe, a conversa costuma ficar um pouco mais cara, e eu já contei isso.'
  if (!t.verba_media_dia || !t.custo_conversa) return { cenarios: [], aviso: 'Ainda não dá pra projetar: falta um mês com anúncio rodando e conversa chegando.' }
  const taxa = t.contatos_anuncio ? t.vendas / t.contatos_anuncio : null
  const ticket = t.vendas ? t.receita / t.vendas : (d.whatsapp.ganhos ? d.whatsapp.receita / d.whatsapp.ganhos : null)
  const cena = (titulo: string, verba: number, custo: number, extra: string): Cenario => {
    const conversas = Math.round(verba * 30 / custo)
    const vendas = taxa != null && t.vendas > 0 ? Math.round(conversas * taxa * 10) / 10 : null
    const receita = vendas != null && ticket ? Math.round(vendas * ticket) : null
    return { titulo, conversas, vendas, receita,
      conta: `${R$(verba)} por dia x 30 dias ÷ ${R$(custo)} por conversa${extra} = ${conversas} conversas${vendas != null ? `; ${pct(taxa!)} viram venda = ~${String(vendas).replace('.', ',')} vendas` : ''}${receita != null ? `; x ticket de ${R$(ticket!)} = ~${R$(receita)}` : ''}` }
  }
  const cenarios = [cena(`Se mantivermos ${R$(t.verba_media_dia)} por dia`, t.verba_media_dia, t.custo_conversa, '')]
  const sobe = Math.min(d.teto, Math.round(t.verba_media_dia * 1.3))
  if (sobe > t.verba_media_dia + 1) cenarios.push(cena(`Se subirmos pra ${R$(sobe)} por dia (dentro do teto)`, sobe, r2(t.custo_conversa * 1.15), ' (15% mais cara)'))
  // atendimento: se as conversas que pararam com o time tivessem resposta, na mesma taxa de venda do mês
  const w = d.whatsapp
  if (w.time.paradas > 0 && w.conversas > 0 && w.ganhos > 0) {
    const taxaW = w.ganhos / w.conversas, vendas = Math.round(w.time.paradas * taxaW * 10) / 10
    cenarios.push({ titulo: 'Se as conversas que pararam com o time tivessem resposta', conversas: w.time.paradas, vendas, receita: ticket ? Math.round(vendas * ticket) : null,
      conta: `${plural(w.time.paradas, 'conversa')} x ${pct(taxaW)} (a taxa de venda das conversas do mês) = ~${String(vendas).replace('.', ',')} vendas a mais${ticket ? ` (~${R$(Math.round(vendas * ticket))})` : ''}` })
  }
  return { cenarios, aviso }
}

// as conclusões SEM IA (o padrão; a IA, quando roda, reescreve em cima destes mesmos números)
export type Conclusoes = { resumo: string; atendimento: string; time: string; trafego: string; organico: string; proximo_mes: string[]; por_ia: boolean }
export function conclusoesSemIA(d: DadosMes): Conclusoes {
  const w = d.whatsapp, t = d.trafego, o = d.organico
  const resumo = `Em ${nomeDoMes(d.mes)} foram ${plural(w.conversas, 'conversa')} no WhatsApp e ${plural(w.ganhos, 'venda')}${w.ganhos ? ` (${R$(w.receita)})` : ''}` +
    (t.gasto > 0 ? `, com ${R$(t.gasto)} em anúncio${t.retorno != null ? `: cada R$ 1 investido voltou ${R$(t.retorno)} em vendas` : ''}.` : '.') +
    (d.anterior ? ` No mês anterior: ${plural(d.anterior.vendas, 'venda')}${d.anterior.receita ? ` (${R$(d.anterior.receita)})` : ''}.` : '')
  const atendimento = w.passadas
    ? `A Maia passou ${plural(w.passadas, 'conversa')} pro time${w.reclamacoes ? `, ${w.reclamacoes} por reclamação` : ''}. ${w.passadas_motivos.length ? `Motivos: ${w.passadas_motivos.slice(0, 3).map(([m, n]) => `${m} (${n})`).join(', ')}.` : ''}`.trim()
    : 'A Maia atendeu todas as conversas sem precisar passar pro time.'
  const time = w.time.passadas
    ? `${w.time.respondidas} de ${w.time.passadas} conversas passadas tiveram resposta do time${w.time.tempo_medio_min != null ? `, em ${tempoTxt(w.time.tempo_medio_min)} em média` : ''}.${w.time.paradas ? ` ${plural(w.time.paradas, 'conversa parou', 'conversas pararam')} com o time sem resposta: é ali que dá pra ganhar venda.` : ''}`
    : 'Nenhuma conversa ficou esperando o time este mês.'
  const qual = t.anuncios.filter(a => a.qualificado), nao = t.anuncios.filter(a => !a.qualificado && a.contatos >= 3)
  const trafego = t.gasto > 0
    ? `${t.custo_conversa != null ? `A conversa saiu a ${R$(t.custo_conversa)}. ` : ''}${qual.length ? `Trouxeram gente qualificada: ${qual.slice(0, 3).map(a => `"${a.nome}"`).join(', ')}.` : 'Nenhum anúncio levou gente até a venda ainda.'}${nao.length ? ` Não trouxeram: ${nao.slice(0, 3).map(a => `"${a.nome}"`).join(', ')}.` : ''}`
    : 'Sem anúncio rodando no mês.'
  const organico = !o.social_ligado && !o.total ? 'O Instagram ainda não está com a Maia: quando ligar, os posts entram aqui.'
    : o.total ? `${plural(o.total, 'post')} no mês, ${o.alcance.toLocaleString('pt-BR')} pessoas alcançadas.${o.estimular ? ` Vale repetir: ${o.estimular}.` : ''}${o.tirar ? ` Tirar do padrão: ${o.tirar}.` : ''}` : 'Nenhum post publicado no mês.'
  const proximo: string[] = []
  if (w.time.paradas) proximo.push(`Responder em até 1 hora as conversas que a Maia passa pro time (este mês ${plural(w.time.paradas, 'parou', 'pararam')} sem resposta).`)
  if (qual[0]) proximo.push(`Fazer mais anúncios no estilo de "${qual[0].nome}", com fotos novas.`)
  if (nao[0]) proximo.push(`Trocar "${nao[0].nome}" por um anúncio novo.`)
  if (o.estimular) proximo.push(`No Instagram, repetir ${o.estimular}.`)
  if (!proximo.length) proximo.push('Me mandar 3 fotos novas do que mais sai: é o que mais renova os anúncios.')
  return { resumo, atendimento, time, trafego, organico, proximo_mes: proximo.slice(0, 4), por_ia: false }
}
export const tempoTxt = (min: number) => min < 60 ? Math.round(min) + ' min' : min < 48 * 60 ? String(Math.round(min / 6) / 10).replace('.', ',') + ' h' : Math.round(min / 1440) + ' dias'

// a trava da IA: todo número que ela escreveu tem que existir nos números calculados (senão vale o texto sem IA)
export function numerosDoTexto(s: string) { return (String(s).match(/\d+(?:[.,]\d+)*/g) || []).map(x => x.replace(/\./g, '').replace(',', '.')).filter(x => Number(x) >= 10) }
export function iaSoComNumerosDados(texto: string, dados: any) {
  const base = new Set<string>()
  const anda = (v: any) => { if (typeof v === 'number') { base.add(String(r2(v))); base.add(String(Math.round(v))); base.add(String(Math.round(v * 100))) } else if (typeof v === 'string') numerosDoTexto(v).forEach(n => base.add(n)); else if (v && typeof v === 'object') Object.values(v).forEach(anda) }
  anda(dados)
  return numerosDoTexto(texto).every(n => base.has(n) || base.has(String(Math.round(Number(n)))))
}

export const TITULO_MES = 'Relatório do mês'
// o resumo curto do WhatsApp (o link vai no fim, posto na hora do envio)
export function textoRelatorioWhats(d: DadosMes, c: Conclusoes) {
  const w = d.whatsapp, t = d.trafego
  const l = [`${TITULO_MES}: ${nomeDoMes(d.mes)} do ${d.negocio}${d.dono ? `, ${d.dono}` : ''}.`, c.resumo]
  l.push(`- WhatsApp: ${plural(w.conversas, 'conversa')}, ${plural(w.ganhos, 'venda')}, ${plural(w.perdas, 'perda')}`)
  if (t.gasto > 0) l.push(`- Anúncios: ${R$(t.gasto)}, ${plural(t.conversas, 'conversa')}${t.custo_conversa != null ? ` (${R$(t.custo_conversa)} cada)` : ''}`)
  if (d.organico.total) l.push(`- Instagram: ${plural(d.organico.total, 'post')}, ${d.organico.alcance.toLocaleString('pt-BR')} pessoas alcançadas`)
  if (c.proximo_mes[0]) l.push(`Pro mês que vem: ${c.proximo_mes[0]}`)
  l.push('O relatório completo, com tudo em cards, está no link.')
  return l.join('\n')
}

// ─────────────────────────── a página do relatório (cards, clara, no padrão do painel do dono)
export type ImagemRel = { src: string; video?: boolean } | null
export function htmlRelatorio(d: DadosMes, c: Conclusoes, op: { gerado_em?: string; painel?: string | null; imagens?: { logo?: string | null; anuncio?: ImagemRel; post?: ImagemRel } } = {}) {
  // 13/11 (mais visual): a cor da marca do negócio nos cards, a logo no topo, os campeões do mês e as barras por semana
  const marca = corDaMarca(d.marca?.primaria), marca2 = corDaMarca(d.marca?.secundaria, marca)
  const im = op.imagens || {}
  const midia = (x: ImagemRel, alt: string) => !x ? '' : x.video ? `<video src="${esc(x.src)}" controls playsinline muted preload="metadata"></video>` : `<img src="${esc(x.src)}" alt="${esc(alt)}" loading="lazy">`
  const barras = (titulo: string, campo: 'conversas' | 'vendas' | 'investido', fmt: (n: number) => string) => {
    const ss = d.semanas || [], mx = Math.max(1, ...ss.map(x => x[campo]))
    return `<div class="graf"><h3>${esc(titulo)}</h3><div class="barras" role="img" aria-label="${esc(titulo)}: ${ss.map(x => x.rotulo + ' ' + fmt(x[campo])).join(', ')}">${ss.map(x => `<div class="b"><span class="v">${esc(fmt(x[campo]))}</span><i style="height:${x[campo] ? Math.max(4, Math.round(x[campo] / mx * 100)) : 0}%"></i><span class="r">${esc(x.rotulo)}</span></div>`).join('')}</div></div>`
  }
  const ca = d.campeao_anuncio, cp = d.campeao_post
  const w = d.whatsapp, t = d.trafego, o = d.organico, p = projecao(d), tom = tomDoMes(d)
  const kpi = (n: string, rot: string, sub = '') => `<div class="kpi"><b>${esc(n)}</b><span>${esc(rot)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`
  const lista = (xs: string[]) => xs.length ? `<ul>${xs.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''
  const card = (titulo: string, corpo: string, cls = '') => `<section class="card ${cls}"><h2>${esc(titulo)}</h2>${corpo}</section>`
  const nota = (s: string) => `<p class="nota">${esc(s)}</p>`
  const linhaAd = (a: DadosMes['trafego']['anuncios'][number]) => `<tr><td>${esc(a.nome)}${a.campanha ? `<small>${esc(a.campanha)}</small>` : ''}</td><td>${a.gasto != null ? esc(R$(a.gasto)) : '–'}</td><td>${a.contatos}</td><td>${a.custo_conversa != null ? esc(R$(a.custo_conversa)) : '–'}</td><td>${a.secundaria ?? '–'}</td><td>${a.vendas}${a.receita ? `<small>${esc(R$(a.receita))}</small>` : ''}</td><td><span class="selo ${a.qualificado ? 'bom' : a.contatos >= 3 ? 'ruim' : ''}">${a.qualificado ? 'qualificado' : a.contatos >= 3 ? 'não qualificou' : 'pouco dado'}</span></td></tr>`
  const melhorPost = [...o.posts].sort((a, b) => (b.alcance + b.interacoes * 5) - (a.alcance + a.interacoes * 5))[0]
  const funcoes = [
    ['Atendimento', `${plural(w.conversas_atendidas, 'conversa atendida', 'conversas atendidas')}${w.primeira_resposta_min != null ? `, 1ª resposta em ${tempoTxt(w.primeira_resposta_min)}` : ''}; ${plural(w.ganhos, 'venda fechada', 'vendas fechadas')}`],
    ['Criação', `${plural(d.criacao.criadas, 'peça criada', 'peças criadas')}, ${d.criacao.aprovadas} aprovadas por ti, ${d.criacao.no_ar} no ar`],
    ['Tráfego', t.gasto > 0 ? `${R$(t.gasto)} investidos, ${plural(t.conversas, 'conversa')}, ${plural(t.vendas, 'venda')} de anúncio${t.retorno != null ? `, retorno de ${R$(t.retorno)} pra cada R$ 1` : ''}` : 'sem anúncio no mês'],
    ['Orgânico', o.total ? `${plural(o.total, 'post')}, ${o.alcance.toLocaleString('pt-BR')} alcançados${o.contatos ? `, ${plural(o.contatos, 'contato')} vindos do Instagram/Facebook` : ''}` : o.social_ligado ? 'nenhum post no mês' : 'ainda não ligado'],
  ]
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">
<title>Relatório do mês · Maia</title>
<style>
@font-face{font-family:'Manrope';font-weight:400 800;font-display:swap;src:url(/maia/fontes/manrope-latin.woff2) format('woff2')}
@font-face{font-family:'Bricolage Grotesque';font-weight:300 800;font-display:swap;src:url(/maia/fontes/bricolage-latin.woff2) format('woff2')}
:root{--marca:${marca};--marca2:${marca2};--bg:color-mix(in srgb,var(--marca) 4%,#fbfaf8);--surface:#fff;--surface-2:color-mix(in srgb,var(--marca) 7%,#fff);--border:color-mix(in srgb,var(--marca) 14%,#eeeae4);--text:#1d1b19;--text-2:#45413c;--muted:#6b665f;--accent:var(--marca);--accent-bg:color-mix(in srgb,var(--marca) 10%,#fff);--green:#15803d;--green-bg:#dcfce7;--amber:#b45309;--amber-bg:#fef3c7;--red:#b91c1c;--red-bg:#fee2e2;color-scheme:light}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 'Manrope',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:980px;margin:0 auto;padding:0 16px 48px}
h1,h2,.kpi b{font-family:'Bricolage Grotesque','Manrope',sans-serif}
.hero{background:var(--marca);color:#fff;padding:26px 0 30px;margin-bottom:6px}.hero .wrap{padding-bottom:0;display:flex;gap:18px;align-items:center}.hero .logo{flex:none;width:76px;height:76px;border-radius:18px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden}.hero .logo img{max-width:66px;max-height:66px;object-fit:contain}.hero small{display:block;opacity:.85;font-weight:700;letter-spacing:.04em;text-transform:uppercase;font-size:12px}.hero h1{color:#fff}
header.ab{padding:18px 0 8px}
h1{font-size:clamp(26px,5vw,36px);line-height:1.15;margin:6px 0 10px}
.tom{display:inline-block;padding:6px 12px;border-radius:999px;font-weight:700;font-size:13.5px}.tom.boas{background:var(--green-bg);color:var(--green)}.tom.olhar{background:var(--amber-bg);color:var(--amber)}
.resumo{font-size:16.5px;color:var(--text-2);max-width:760px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:18px 0}
.kpi{background:var(--surface);border:1px solid var(--border);border-top:4px solid var(--marca);border-radius:16px;padding:14px 16px}.kpi b{display:block;color:var(--marca);font-size:26px;line-height:1.1;font-variant-numeric:tabular-nums}.kpi span{display:block;color:var(--muted);font-size:13px;font-weight:600}.kpi small{display:block;color:var(--muted);font-size:12px}
.grade{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:18px 18px 14px;box-shadow:0 1px 2px rgba(27,21,48,.04),0 4px 16px rgba(27,21,48,.05);margin-bottom:14px;min-width:0}
.card h2{font-size:19px;margin:0 0 10px;padding-left:12px;border-left:4px solid var(--marca)}
.graficos{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.graf{background:var(--surface-2);border-radius:14px;padding:12px 12px 8px}.graf h3{font-size:14px;margin:0 0 8px;color:var(--text-2)}.barras{display:flex;align-items:flex-end;gap:8px;height:150px}.barras .b{flex:1;min-width:0;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center}.barras i{display:block;width:100%;max-width:44px;border-radius:8px 8px 3px 3px;background:var(--marca)}.graf:nth-child(2) .barras i{background:var(--marca2)}.barras .v{font-size:12px;font-weight:700;margin-bottom:3px;white-space:nowrap;font-variant-numeric:tabular-nums}.barras .r{font-size:11px;color:var(--muted);margin-top:4px;white-space:nowrap}
.campeoes{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}.campeao{background:var(--surface-2);border-radius:16px;overflow:hidden}.campeao img,.campeao video{display:block;width:100%;aspect-ratio:4/5;object-fit:cover;background:var(--accent-bg)}.campeao .tx{padding:12px 14px}.campeao small{display:block;color:var(--marca);font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:.05em}.campeao b{display:block;font-size:17px;margin:2px 0 4px}.campeao p{margin:0;color:var(--text-2);font-size:14px}.card p{margin:0 0 10px}.card ul{margin:0 0 10px;padding-left:20px}.card li{margin:3px 0}
.largo{grid-column:1/-1}.nota{color:var(--muted);font-size:13px}
.mini{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin:0 0 12px}.mini div{background:var(--surface-2);border-radius:12px;padding:9px 11px}.mini b{display:block;font-size:19px;font-variant-numeric:tabular-nums}.mini span{font-size:12.5px;color:var(--muted)}
.tabela{overflow-x:auto;margin:0 -4px 10px}table{border-collapse:collapse;width:100%;font-size:14px;min-width:560px}th,td{text-align:left;padding:8px 6px;border-bottom:1px solid var(--border);vertical-align:top}th{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}td small{display:block;color:var(--muted);font-size:12px}
.selo{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:700;background:var(--surface-2);color:var(--muted)}.selo.bom{background:var(--green-bg);color:var(--green)}.selo.ruim{background:var(--red-bg);color:var(--red)}
.fun{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}.fun div{background:var(--accent-bg);border-radius:14px;padding:12px 14px}.fun b{display:block;color:var(--accent);font-size:13px;text-transform:uppercase;letter-spacing:.04em}
.cena{border-left:3px solid var(--accent);padding:4px 0 4px 12px;margin:0 0 12px}.cena b{display:block}.cena span{color:var(--text-2);font-size:14px}
.voltar{display:inline-block;margin-top:8px;color:var(--accent);font-weight:700}
footer{color:var(--muted);font-size:12.5px;margin-top:10px}
</style></head><body><div class="hero"><div class="wrap">${im.logo ? `<div class="logo"><img src="${esc(im.logo)}" alt="Logo do ${esc(d.negocio)}"></div>` : ''}<div><small>Relatório do mês · ${esc(d.negocio)}</small><h1>${esc(nomeDoMes(d.mes).replace(/^./, x => x.toUpperCase()))}</h1></div></div></div><div class="wrap">
<header class="ab"><span class="tom ${tom}">${tom === 'boas' ? 'Boas notícias' : 'Precisamos olhar juntos'}</span>
<p class="resumo">${esc(c.resumo)}</p></header>
<div class="kpis">${kpi(String(w.conversas), 'conversas no WhatsApp')}${kpi(String(w.ganhos), 'vendas', w.receita ? R$(w.receita) : '')}${kpi(t.gasto > 0 ? R$(t.gasto) : '–', 'investido em anúncio')}${kpi(t.custo_conversa != null ? R$(t.custo_conversa) : '–', 'por conversa')}${kpi(t.retorno != null ? R$(t.retorno) : '–', 'de volta pra cada R$ 1')}</div>
<div class="grade">
${(d.semanas || []).length ? card('Semana a semana', `<div class="graficos">${barras('Conversas', 'conversas', n => String(n))}${barras('Vendas', 'vendas', n => String(n))}${barras('Investido', 'investido', n => n ? R$(n) : '0')}</div>`, 'largo') : ''}
${ca || cp ? card('Os campeões do mês', `<div class="campeoes">${ca ? `<div class="campeao">${midia(im.anuncio || null, 'O anúncio campeão')}<div class="tx"><small>Anúncio campeão</small><b>${esc(ca.nome)}</b><p>${esc(ca.motivo)}</p></div></div>` : ''}${cp ? `<div class="campeao">${midia(im.post || null, 'A postagem campeã')}<div class="tx"><small>Postagem campeã</small><b>${esc(ddmm(cp.dia))} · ${esc(cp.tipo)}${cp.tema ? ' sobre ' + esc(cp.tema) : ''}</b><p>${cp.alcance.toLocaleString('pt-BR')} pessoas alcançadas${cp.views ? `, ${cp.views.toLocaleString('pt-BR')} visualizações` : ''}, ${cp.interacoes} interações. "${esc(cp.legenda.slice(0, 80))}${cp.legenda.length > 80 ? '…' : ''}"</p></div></div>` : ''}</div>`, 'largo') : ''}
${card('Conversas do WhatsApp', `<div class="mini"><div><b>${w.conversas}</b><span>conversas</span></div><div><b>${w.ganhos}</b><span>ganhos</span></div><div><b>${w.perdas}</b><span>perdas</span></div><div><b>${w.contatos_novos}</b><span>contatos novos</span></div></div>
${w.motivos.length ? `<p><b>Por que perdemos:</b></p>${lista(w.motivos.map(([m, n]) => `${m}: ${n}`))}` : '<p>Nenhuma perda marcada no mês.</p>'}`)}
${card('Onde a IA precisou de ajuda', `<div class="mini"><div><b>${w.passadas}</b><span>passadas pro time</span></div><div><b>${w.reclamacoes}</b><span>reclamações</span></div></div>
${w.passadas_motivos.length ? lista(w.passadas_motivos.map(([m, n]) => `${m}: ${n}`)) : ''}<p>${esc(c.atendimento)}</p>`)}
${card('Onde o time pode melhorar', `<div class="mini"><div><b>${w.time.tempo_medio_min != null ? esc(tempoTxt(w.time.tempo_medio_min)) : '–'}</b><span>pra responder</span></div><div><b>${w.time.paradas}</b><span>pararam com o time</span></div><div><b>${w.time.vendas_depois}</b><span>vendas depois</span></div></div><p>${esc(c.time)}</p>`)}
${card('Campanhas e anúncios', `<div class="mini"><div><b>${t.gasto > 0 ? esc(R$(t.gasto)) : '–'}</b><span>gasto</span></div><div><b>${t.conversas}</b><span>conversas</span></div><div><b>${t.custo_conversa != null ? esc(R$(t.custo_conversa)) : '–'}</b><span>por conversa</span></div><div><b>${t.secundaria ?? '–'}</b><span>${esc(d.sec.nome)}</span></div><div><b>${t.vendas}</b><span>vendas de anúncio</span></div></div>
${t.anuncios.length ? `<div class="tabela"><table><thead><tr><th>Anúncio</th><th>Gasto</th><th>Contatos</th><th>Por conversa</th><th>${esc(d.sec.nome)}</th><th>Vendas</th><th></th></tr></thead><tbody>${t.anuncios.map(linhaAd).join('')}</tbody></table></div>` : ''}
<p>${esc(c.trafego)}</p>${t.mexidas.length ? `<p><b>O que mudou no mês:</b></p>${lista(t.mexidas.map(m => `${ddmm(m.dia)}: ${m.texto}`))}` : ''}
${d.sec.padrao ? nota(`"Qualificado" = chegou em "${d.sec.nome}" ou comprou. Essa é a etapa padrão até a implantação definir a do teu negócio.`) : nota(`"Qualificado" = chegou em "${d.sec.nome}" ou comprou.`)}${t.anuncios.some(a => a.gasto == null) ? nota('Gasto e custo por anúncio aparecem quando a Meta manda os números por anúncio; o total do mês é sempre o da conta.') : ''}`, 'largo')}
${card('Orgânico (Instagram e Facebook)', o.total ? `<div class="mini"><div><b>${o.total}</b><span>posts</span></div><div><b>${o.alcance.toLocaleString('pt-BR')}</b><span>alcance</span></div><div><b>${o.contatos}</b><span>contatos vindos dele</span></div></div>
${melhorPost ? `<p><b>Melhor conteúdo:</b> ${esc(ddmm(melhorPost.dia))}, ${esc(melhorPost.tipo)}${melhorPost.tema ? ` sobre ${esc(melhorPost.tema)}` : ''}: ${melhorPost.alcance.toLocaleString('pt-BR')} alcançados, ${melhorPost.interacoes} interações. <span class="nota">"${esc(melhorPost.legenda.slice(0, 90))}${melhorPost.legenda.length > 90 ? '…' : ''}"</span></p>` : ''}
${lista(o.posts.map(x => `${ddmm(x.dia)} · ${x.tipo}${x.tema ? ' · ' + x.tema : ''}: ${x.alcance.toLocaleString('pt-BR')} alcance, ${x.interacoes} interações`))}<p>${esc(c.organico)}</p>` : `<p>${esc(c.organico)}</p>`, 'largo')}
${card('Cada função da Maia', `<div class="fun">${funcoes.map(([f, x]) => `<div><b>${esc(f)}</b>${esc(x)}</div>`).join('')}</div>`, 'largo')}
${card('Projeção', p.cenarios.length ? p.cenarios.map(x => `<div class="cena"><b>${esc(x.titulo)}: ~${x.conversas} conversas${x.vendas != null ? `, ~${String(x.vendas).replace('.', ',')} vendas` : ''}${x.receita != null ? ` (~${esc(R$(x.receita))})` : ''}</b><span>${esc(x.conta)}</span></div>`).join('') + nota(p.aviso) : `<p>${esc(p.aviso)}</p>`)}
${card('Pro mês que vem', lista(c.proximo_mes) + (c.por_ia ? nota('Conclusões escritas pela Maia em cima dos números do sistema, conferidas pela equipe.') : nota('Os números são do sistema; a equipe conferiu antes de chegar pra ti.')))}
</div>
<footer>${op.painel ? `<a class="voltar" href="${esc(op.painel)}">Abrir o painel</a> · ` : ''}Período: ${esc(ddmm(new Date(Date.parse(d.de) - 3 * 3600e3).toISOString()))} a ${esc(ddmm(new Date(Date.parse(d.ate) - 3 * 3600e3).toISOString()))}. Gerado em ${esc((op.gerado_em || '').slice(0, 10).split('-').reverse().join('/'))}. Dúvida? Me chama no WhatsApp.</footer>
</div></body></html>`
}
