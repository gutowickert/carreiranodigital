// ENTREGA — o "depois da venda".
//
// O CRM comercial termina no ganho. Para curso existe o depois (aluno, chamada,
// certificado); para Deu Venda e CRM não existia: vendeu, o cliente saía do
// sistema e passava a viver na cabeça de quem entrega. Este módulo fecha isso.
//
// A espinha é o ESTADO do compromisso — ele não nasce marcado:
//   previsto   → o roteiro calculou. Sombra na agenda, SEM hora. Não ocupa o dia.
//   combinado  → data e hora acertadas COM O CLIENTE, na sessão anterior.
//   confirmado → reconfirmado até 2 dias antes.
//   a_remarcar → passou do prazo de reconfirmar sem resposta. Sai da agenda.
//   concluido  → aconteceu, com registro do que foi.
//
// E a regra de ouro: NÃO SE CONCLUI UM ENCONTRO SEM MARCAR O PRÓXIMO. A data do
// próximo se define com o cliente na frente — por isso o cliente em entrega
// nunca fica sem data à frente.

export type Natureza = 'encontro' | 'interno' | 'marco'
export type EstadoMarco = 'previsto' | 'combinado' | 'confirmado' | 'concluido' | 'a_remarcar' | 'cancelado'
export type Produto = 'deu_venda' | 'crm' | 'combo'
export type FimTipo = 'encerra' | 'renegocia' | 'manutencao'

export type MarcoTpl = {
  chave: string
  titulo: string
  natureza: Natureza
  dias: number            // offset em dias a partir da data de início
  duracao?: number        // minutos (só faz sentido em encontro)
  ancora?: boolean        // não empurra quando os do meio remarcam — é a data de fim
  jaCombinado?: boolean   // nasce combinado: foi acertado na venda (a 1ª sessão)
  descricao?: string
}

export type RoteiroProduto = {
  nome: string
  cor: string
  prazoMeses: number | null
  fimTipo: FimTipo
  avisoFimDias: number
  fases: { chave: string; label: string }[]
  marcos: MarcoTpl[]
}

// ───────────────────────────────────────────────────────────── os três roteiros

export const ROTEIROS: Record<Produto, RoteiroProduto> = {
  deu_venda: {
    nome: 'Deu Venda',
    cor: '#b87af0',
    prazoMeses: 3,
    fimTipo: 'encerra',
    avisoFimDias: 15,
    fases: [
      { chave: 'a_marcar', label: 'A marcar' },
      { chave: 'sessao_marcada', label: 'Sessão marcada' },
      { chave: 'primeira_semana', label: 'Primeira semana' },
      { chave: 'encontro_1', label: 'Encontro 1' },
      { chave: 'encontro_2', label: 'Encontro 2' },
      { chave: 'encontro_3', label: 'Encontro 3' },
    ],
    marcos: [
      { chave: 'sessao', titulo: 'Sessão de implantação', natureza: 'encontro', dias: 0, duracao: 180, jaCombinado: true,
        descricao: 'Levanta o negócio, fecha a oferta, monta a máquina e sobe a primeira campanha.' },
      { chave: 'semana_1', titulo: 'Primeira semana no grupo', natureza: 'interno', dias: 7,
        descricao: 'Acompanhar as primeiras conversas que chegarem. É onde a maioria desistiria.' },
      { chave: 'encontro_1', titulo: 'Encontro 1 — a leitura', natureza: 'encontro', dias: 10, duracao: 60,
        descricao: 'Números da campanha e conversas do WhatsApp, lado a lado.' },
      { chave: 'encontro_2', titulo: 'Encontro 2 — o ajuste', natureza: 'encontro', dias: 30, duracao: 60,
        descricao: 'Com dois testes rodados dá pra ver o que o mercado responde.' },
      { chave: 'encontro_3', titulo: 'Encontro 3 — o fechamento', natureza: 'encontro', dias: 90, duracao: 60, ancora: true,
        descricao: 'Os três meses lidos inteiros. Sai com o plano dos próximos meses escrito.' },
    ],
  },

  crm: {
    nome: 'CRM',
    cor: '#60a5fa',
    prazoMeses: null,
    fimTipo: 'manutencao',
    avisoFimDias: 30,
    fases: [
      { chave: 'levantamento', label: 'Levantamento' },
      { chave: 'configuracao', label: 'Configuração' },
      { chave: 'no_ar', label: 'No ar' },
      { chave: 'afinacao', label: 'Afinação' },
      { chave: 'treino', label: 'Treino' },
      { chave: 'manutencao', label: 'Manutenção' },
    ],
    marcos: [
      { chave: 'levantamento', titulo: 'Reunião de levantamento', natureza: 'encontro', dias: 0, duracao: 240, jaCombinado: true,
        descricao: 'Como a empresa vende hoje: etapas, prazos, objeções e o que trava.' },
      { chave: 'configuracao', titulo: 'Configuração — funil, catálogo, API e IA', natureza: 'interno', dias: 25,
        descricao: 'O grosso do trabalho. Sem hora marcada, mas com prazo.' },
      { chave: 'no_ar', titulo: 'No ar recebendo lead de verdade', natureza: 'marco', dias: 30,
        descricao: 'Não é demonstração: a IA atendendo no WhatsApp oficial do cliente.' },
      { chave: 'afinacao', titulo: 'Afinação com conversa real', natureza: 'interno', dias: 55,
        descricao: 'Ler o que a IA respondeu e ajustar. Entram as travas da operação dele.' },
      { chave: 'treino', titulo: 'Treino do time', natureza: 'encontro', dias: 75, duracao: 120,
        descricao: 'O time opera no sistema real, com as oportunidades reais dele.' },
      { chave: 'entrega', titulo: 'Entrega — vira manutenção', natureza: 'marco', dias: 90, ancora: true,
        descricao: 'Fim dos 90 dias. A mensalidade começa e o projeto passa a manutenção.' },
    ],
  },

  combo: {
    nome: 'Deu Venda + CRM + Tráfego',
    cor: '#22d3a0',
    prazoMeses: 6,
    fimTipo: 'renegocia',
    avisoFimDias: 30,
    fases: [
      { chave: 'captacao', label: 'Captação' },
      { chave: 'crm_config', label: 'CRM — configuração' },
      { chave: 'crm_no_ar', label: 'CRM — no ar' },
      { chave: 'acompanhamento', label: 'Acompanhamento' },
      { chave: 'renegociacao', label: 'Renegociação' },
    ],
    marcos: [
      { chave: 'manha_inicial', titulo: 'Manhã de implantação', natureza: 'encontro', dias: 0, duracao: 240, jaCombinado: true,
        descricao: 'Configura a máquina, fecha a oferta e bota campanha no ar no mesmo dia.' },
      { chave: 'encontro_10d', titulo: 'Segundo encontro — leitura da campanha', natureza: 'encontro', dias: 10, duracao: 90,
        descricao: 'Lê o número da primeira campanha e ajusta o que precisa.' },
      { chave: 'trafego_m1', titulo: 'Tráfego — mês 1', natureza: 'interno', dias: 30, descricao: 'Gestão da campanha do mês.' },
      { chave: 'crm_inicio', titulo: 'Entra o CRM', natureza: 'marco', dias: 30,
        descricao: 'Mês 2: começa a frente de conversão.' },
      { chave: 'trafego_m2', titulo: 'Tráfego — mês 2', natureza: 'interno', dias: 60, descricao: 'Gestão da campanha do mês.' },
      { chave: 'crm_no_ar', titulo: 'CRM no ar', natureza: 'marco', dias: 60,
        descricao: 'CRM instalado no WhatsApp, com IA atendendo.' },
      { chave: 'trafego_m3', titulo: 'Tráfego — mês 3', natureza: 'interno', dias: 90, descricao: 'Gestão da campanha do mês.' },
      { chave: 'trafego_m4', titulo: 'Tráfego — mês 4', natureza: 'interno', dias: 120, descricao: 'Gestão da campanha do mês.' },
      { chave: 'crm_entrega', titulo: 'CRM entregue e time treinado', natureza: 'marco', dias: 120 },
      { chave: 'trafego_m5', titulo: 'Tráfego — mês 5', natureza: 'interno', dias: 150, descricao: 'Gestão da campanha do mês.' },
      { chave: 'renegociacao', titulo: 'Renegociação — o placar dos 6 meses', natureza: 'encontro', dias: 180, duracao: 90, ancora: true,
        descricao: 'Senta com o número na mesa: do ponto A ao ponto B, e renegocia o valor.' },
    ],
  },
}

// ─────────────────────────────────────────────────────────────────── utilidades

const DIA = 86400000
export const soData = (d: Date) => d.toISOString().slice(0, 10)

export function somaDias(dataISO: string, dias: number): string {
  const d = new Date(dataISO + 'T12:00:00Z')
  return soData(new Date(d.getTime() + dias * DIA))
}

/** Monta os marcos de um projeto a partir do roteiro do produto e da data de início. */
export function marcosDoRoteiro(produto: Produto, dataInicio: string) {
  const r = ROTEIROS[produto]
  if (!r) return []
  return r.marcos.map((m, i) => ({
    chave: m.chave,
    titulo: m.titulo,
    natureza: m.natureza,
    ordem: i,
    dias_offset: m.dias,
    ancora: !!m.ancora,
    duracao_min: m.duracao ?? null,
    data_prevista: somaDias(dataInicio, m.dias),
    // a 1ª sessão foi combinada na venda; o resto nasce previsto
    data_combinada: m.jaCombinado ? dataInicio + 'T12:00:00Z' : null,
    estado: (m.jaCombinado ? 'combinado' : 'previsto') as EstadoMarco,
    registro: null as string | null,
  }))
}

/** Data de fim do contrato: pela âncora do roteiro, ou pelo prazo em meses. */
export function dataFimContrato(produto: Produto, dataInicio: string, prazoMeses?: number | null): string | null {
  const r = ROTEIROS[produto]
  const ancora = r?.marcos.find(m => m.ancora)
  if (ancora) return somaDias(dataInicio, ancora.dias)
  const meses = prazoMeses ?? r?.prazoMeses
  if (!meses) return null
  const d = new Date(dataInicio + 'T12:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + meses)
  return soData(d)
}

// ──────────────────────────────────────────────────────── as regras de estado

export const DIAS_AVISO_CONFIRMAR = 3   // o aviso de reconfirmar aparece 3 dias antes
export const DIAS_PRAZO_CONFIRMAR = 2   // e o prazo de reconfirmar é até 2 dias antes

/** Quantos dias faltam para a data (negativo = já passou). */
export function diasAte(dataISO: string, hojeISO?: string): number {
  const hoje = new Date((hojeISO || soData(new Date())) + 'T12:00:00Z').getTime()
  const alvo = new Date(String(dataISO).slice(0, 10) + 'T12:00:00Z').getTime()
  return Math.round((alvo - hoje) / DIA)
}

export type SituacaoMarco = 'ok' | 'confirmar' | 'a_remarcar' | 'atrasado' | 'concluido'

/**
 * Situação de um marco hoje. É o que alimenta a faixa "precisa de ti" do painel.
 * - encontro combinado e faltando <= 3 dias, sem confirmar → precisa confirmar
 * - encontro combinado e já passou do prazo (falta < 2 dias) → a remarcar
 * - qualquer marco não concluído com data no passado → atrasado
 */
export function situacaoMarco(m: { estado: string; data_combinada?: string | null; data_prevista?: string | null; natureza?: string }, hojeISO?: string): SituacaoMarco {
  if (m.estado === 'concluido' || m.estado === 'cancelado') return 'concluido'
  if (m.estado === 'a_remarcar') return 'a_remarcar'

  const ref = m.data_combinada || m.data_prevista
  if (!ref) return 'ok'
  const faltam = diasAte(ref, hojeISO)

  if (m.estado === 'combinado') {
    if (faltam < DIAS_PRAZO_CONFIRMAR) return faltam < 0 ? 'atrasado' : 'a_remarcar'
    if (faltam <= DIAS_AVISO_CONFIRMAR) return 'confirmar'
    return 'ok'
  }
  if (faltam < 0) return 'atrasado'
  return 'ok'
}

/**
 * Remarcação: os marcos do MEIO empurram junto; a ÂNCORA não sai do lugar.
 * Sem isso, quem remarca duas vezes vira 5 meses de acompanhamento pelo preço de 3.
 * Devolve os deslocamentos a aplicar e um aviso se algo bater na âncora.
 */
export function empurrarPosteriores(
  marcos: { id: string; ordem: number; ancora: boolean; estado: string; data_prevista: string | null }[],
  ordemRemarcado: number,
  diasDeslocados: number,
) {
  const ancora = marcos.find(m => m.ancora)
  const limite = ancora?.data_prevista || null
  const mover: { id: string; data_prevista: string }[] = []
  let esbarrouNaAncora = false

  for (const m of marcos) {
    if (m.ordem <= ordemRemarcado) continue
    if (m.ancora) continue                       // a âncora nunca anda
    if (m.estado === 'concluido' || m.estado === 'cancelado') continue
    if (!m.data_prevista) continue
    const nova = somaDias(m.data_prevista, diasDeslocados)
    if (limite && nova > limite) { esbarrouNaAncora = true; continue }
    mover.push({ id: m.id, data_prevista: nova })
  }
  return { mover, esbarrouNaAncora }
}
