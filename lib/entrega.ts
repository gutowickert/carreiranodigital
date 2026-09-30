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

import { hojeBR } from '@/lib/periodos'
export type Natureza = 'encontro' | 'interno' | 'marco'
export type EstadoMarco = 'previsto' | 'combinado' | 'confirmado' | 'concluido' | 'a_remarcar' | 'cancelado'
export type Produto = 'deu_venda' | 'crm' | 'combo' | 'crm_trafego'
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
  lista?: string[]        // o que fazer neste marco — o padrão de implantação, riscável na ficha
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

// ───────────────────────────────────────────────────────────── os roteiros

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

  // O SISTEMA — o roteiro de implantação, do jeito que acontece de verdade (Nando, 27/09/2026).
  //
  // ⚠️ NEM TODO SISTEMA VEM DO DEU VENDA. Quando vem (o comum: o cliente compra o Deu Venda, percebe
  // que precisa do sistema), o contexto do negócio e a logo já existem e vão direto pro núcleo. Quando
  // não vem (Dani Fell), o questionário de implantação entra ANTES da apresentação. A lista do
  // primeiro marco tem os dois caminhos — quem faz risca o que vale.
  //
  // ⚠️ A LISTA DE CADA MARCO É O PADRÃO. É ela que faz a implantação sair igual pra todo cliente sem
  // ninguém lembrar de cabeça. Mudou o jeito de implantar, muda AQUI — os projetos novos já nascem
  // com a lista nova; os antigos recebem pelo botão "aplicar a lista padrão" na ficha.
  crm: {
    nome: 'Sistema',
    cor: '#60a5fa',
    prazoMeses: null,
    fimTipo: 'manutencao',
    avisoFimDias: 30,
    fases: [
      { chave: 'combinar', label: 'Combinar' },
      { chave: 'apresentacao', label: 'Apresentação' },
      { chave: 'modificacoes', label: 'Modificações' },
      { chave: 'implantacao', label: 'Implantação' },
      { chave: 'primeiro_uso', label: 'Primeiro uso' },
      { chave: 'ajustes', label: 'Ajustes' },
      { chave: 'leituras', label: 'Leituras do mês' },
      { chave: 'manutencao', label: 'Manutenção' },
    ],
    marcos: [
      { chave: 'combinar', titulo: 'Combinar a apresentação e preparar o núcleo', natureza: 'interno', dias: 0,
        descricao: 'Marcar a apresentação até o dia 3 e chegar nela com o sistema base já com a cara do cliente.',
        lista: [
          'Combinar a data da apresentação (até o dia 3)',
          'Veio do Deu Venda? Pegar o contexto do negócio e a logo de lá',
          'Não veio do Deu Venda? Mandar o questionário de implantação e cobrar antes da apresentação',
          'Instalar o núcleo (setup-nucleo) e ligar a marca: nome, cor, logo',
          'Cadastrar produtos e preços',
          'Semear o que a IA sabe com o contexto (nunca deixar vazio)',
          'Etapas do funil no vocabulário do cliente',
        ] },
      { chave: 'apresentacao', titulo: 'Apresentação do sistema base e levantamento do que falta', natureza: 'encontro', dias: 3, duracao: 90,
        descricao: 'Mostra o sistema com a cara dele e entende as necessidades extras. Sai com a data da implantação combinada.',
        lista: [
          'Mostrar o Painel, o Funil, o WhatsApp e a Máquina CND com os dados dele',
          'Anotar o que falta: telas, regras, integrações',
          'Decidir o WhatsApp: número, API oficial, quem responde',
          'Definir quem terá login e com que papel',
          'Combinar a implantação (dia 10) e a mensalidade (dia e valor)',
        ] },
      { chave: 'modificacoes', titulo: 'Primeiras modificações', natureza: 'interno', dias: 7,
        descricao: 'O que foi levantado na apresentação, feito e testado antes da implantação.',
        lista: [
          'Fazer o que foi levantado na apresentação',
          'Chaves no nome do cliente: Anthropic, Deepgram, Meta',
          'Domínio com a marca do cliente',
          'Testar com um lead de verdade (ou uma apólice, um orçamento — o que o negócio tem)',
          'Manual do usuário pronto (o que tem, o que fazem, como fazem)',
        ] },
      { chave: 'implantacao', titulo: 'Implantação', natureza: 'encontro', dias: 10, duracao: 120,
        descricao: 'Chave da IA, WhatsApp oficial, contrato assinado pelo sistema e os primeiros passos com o manual.',
        lista: [
          'Login de cada usuário, na frente dele',
          'WhatsApp oficial conectado e testado com uma mensagem real',
          'Contrato assinado pelo sistema',
          'Primeiros passos com o manual: Painel, Funil, IA pediu ajuda, Máquina CND',
          'Notificações ligadas no celular de cada um',
          'Combinar a leitura do mês (dia 30)',
        ] },
      { chave: 'primeiro_uso', titulo: 'Primeiro uso — login e tudo mais', natureza: 'interno', dias: 17,
        descricao: 'A primeira semana de uso de verdade. Onde ele trava, a gente destrava no mesmo dia.',
        lista: [
          'Conferir todo dia: alguém sem conseguir entrar? notificação chegando?',
          'Ler as primeiras conversas da IA e corrigir na fonte (O que a IA sabe / Qualidade IA)',
          'Primeira venda marcada no funil com valor',
        ] },
      { chave: 'ajustes', titulo: 'Ajustes pelo WhatsApp', natureza: 'interno', dias: 30,
        descricao: 'À disposição no WhatsApp implementando mudanças conforme o uso pede.',
        lista: [
          'Registrar cada pedido de mudança na ficha (o que, quando, feito ou não)',
          'Afinar a cadência de follow-up com o que aconteceu',
        ] },
      { chave: 'leitura_1', titulo: 'Leitura do mês 1', natureza: 'encontro', dias: 30, duracao: 45,
        descricao: 'O que a automação fez e o que deu de lucro. Diferente a cada mês: o que realmente importa, não as mesmas telas.',
        lista: [
          'Quantas conversas a IA atendeu e quantas cobranças fez sozinha',
          'Vendas do mês, de onde vieram, e o que se perdeu',
          'Custo da IA no mês',
          'Uma coisa pra mudar no mês que vem',
        ] },
      { chave: 'leitura_2', titulo: 'Leitura do mês 2', natureza: 'encontro', dias: 60, duracao: 45,
        descricao: 'A segunda leitura, comparada com a primeira.',
        lista: [
          'O mesmo placar, agora comparado com o mês 1',
          'O que a mudança combinada no mês 1 deu',
          'Preparar o placar trimestral',
        ] },
      { chave: 'trimestral', titulo: 'Reunião trimestral — vira manutenção', natureza: 'encontro', dias: 90, duracao: 90, ancora: true,
        descricao: 'Os três meses lidos inteiros, com o número na mesa. Daqui pra frente: manutenção com leitura mensal.',
        lista: [
          'Placar dos 90 dias: antes e depois',
          'O que fica, o que sai, o que entra no sistema',
          'Combinar a leitura mensal seguinte',
        ] },
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

  // Cliente que já tem o tráfego rodando e entra pro CRM — sem o Deu Venda (sem a
  // máquina de captação). Um encontro presencial a cada 3 semanas, CRM e tráfego
  // na mesma mesa, e a renegociação antes do fim dos 6 meses.
  crm_trafego: {
    nome: 'CRM + Tráfego',
    cor: '#f59e0b',
    prazoMeses: 6,
    fimTipo: 'renegocia',
    avisoFimDias: 30,
    fases: [
      { chave: 'implantacao', label: 'Implantação' },
      { chave: 'crm_config', label: 'CRM — configuração' },
      { chave: 'crm_no_ar', label: 'CRM — no ar' },
      { chave: 'acompanhamento', label: 'Acompanhamento' },
      { chave: 'renegociacao', label: 'Renegociação' },
    ],
    marcos: [
      { chave: 'implantacao', titulo: 'Reunião de implantação — oferta e entrevista do CRM', natureza: 'encontro', dias: 0, duracao: 180, jaCombinado: true,
        descricao: 'Fecha a oferta nova e faz a entrevista do CRM: etapas, follow-ups, agenda, IA e caixa.' },
      { chave: 'configuracao', titulo: 'CRM configurado e testado', natureza: 'interno', dias: 18,
        descricao: 'Funil, follow-ups, templates aprovados, IA treinada e testada antes do encontro.' },
      { chave: 'crm_no_ar', titulo: 'CRM no ar', natureza: 'marco', dias: 21,
        descricao: 'Recebendo lead de verdade, com a IA e os follow-ups rodando.' },
      { chave: 'encontro_2', titulo: 'Encontro 2 — CRM no ar', natureza: 'encontro', dias: 21, duracao: 120,
        descricao: 'Entrega o CRM rodando, treina quem vai usar e lê o tráfego.' },
      { chave: 'encontro_3', titulo: 'Encontro 3 — o ponto A', natureza: 'encontro', dias: 42, duracao: 90,
        descricao: 'As 3 primeiras semanas de CRM rodando viram a base de comparação, quando o antes não tem número.' },
      { chave: 'encontro_4', titulo: 'Encontro 4 — CRM e tráfego', natureza: 'encontro', dias: 63, duracao: 90, descricao: 'Leitura do CRM e do tráfego; ajuste de oferta e de follow-up.' },
      { chave: 'encontro_5', titulo: 'Encontro 5 — CRM e tráfego', natureza: 'encontro', dias: 84, duracao: 90, descricao: 'Leitura do CRM e do tráfego; ajuste de oferta e de follow-up.' },
      { chave: 'encontro_6', titulo: 'Encontro 6 — CRM e tráfego', natureza: 'encontro', dias: 105, duracao: 90, descricao: 'Leitura do CRM e do tráfego; ajuste de oferta e de follow-up.' },
      { chave: 'encontro_7', titulo: 'Encontro 7 — CRM e tráfego', natureza: 'encontro', dias: 126, duracao: 90, descricao: 'Leitura do CRM e do tráfego; ajuste de oferta e de follow-up.' },
      { chave: 'encontro_8', titulo: 'Encontro 8 — CRM e tráfego', natureza: 'encontro', dias: 147, duracao: 90, descricao: 'Leitura do CRM e do tráfego; ajuste de oferta e de follow-up.' },
      { chave: 'renegociacao', titulo: 'Renegociação — o placar dos 6 meses', natureza: 'encontro', dias: 168, duracao: 90,
        descricao: 'Senta com o número na mesa: do ponto A até a meta, e renegocia antes do contrato acabar.' },
      { chave: 'fim', titulo: 'Fim dos 6 meses', natureza: 'marco', dias: 181, ancora: true,
        descricao: 'Fim do contrato. Daqui pra frente, o que foi renegociado.' },
    ],
  },
}

// O SEGMENTO — a tela de Entregas tem duas abas, Sistema e Deu Venda. O combo aparece nas duas.
export type Segmento = 'sistema' | 'deu_venda'
export function segmentosDoProduto(p: string): Segmento[] {
  if (p === 'deu_venda') return ['deu_venda']
  if (p === 'crm' || p === 'crm_trafego') return ['sistema']
  return ['sistema', 'deu_venda']
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
    // a lista nasce com o projeto, item a item, pra riscar na ficha
    lista: (m.lista || []).map(item => ({ item, feito: false })),
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

// ─────────────────────────────────────────────────── ONDE O ENCONTRO ACONTECE
//
// São quatro lugares, mas o que trava o dia são DUAS regiões: dá pra fazer dois atendimentos no
// mesmo dia na mesma região; em regiões diferentes, não dá tempo do deslocamento.
//
// ⚠️ O LUGAR É DO ENCONTRO, NÃO DO CLIENTE. Varia — às vezes a equipe vai até a empresa do cliente
// pra captar imagens dos produtos pro anúncio.

export type Local = 'sede_lajeado' | 'regiao_lajeado' | 'sede_poa' | 'regiao_poa'
export type Regiao = 'lajeado' | 'poa'

export const LOCAIS: { chave: Local; nome: string; regiao: Regiao }[] = [
  { chave: 'sede_lajeado',   nome: 'Nossa sede, em Lajeado',                  regiao: 'lajeado' },
  { chave: 'regiao_lajeado', nome: 'Na empresa do cliente, região de Lajeado', regiao: 'lajeado' },
  { chave: 'sede_poa',       nome: 'Nossa sede, em Porto Alegre',             regiao: 'poa' },
  { chave: 'regiao_poa',     nome: 'Na empresa do cliente, região de POA',     regiao: 'poa' },
]

export const REGIOES: Record<Regiao, { nome: string; curto: string }> = {
  lajeado: { nome: 'Lajeado', curto: 'LAJ' },
  poa: { nome: 'Porto Alegre', curto: 'POA' },
}

export const regiaoDoLocal = (l?: string | null): Regiao | null =>
  LOCAIS.find(x => x.chave === l)?.regiao ?? null
export const nomeDoLocal = (l?: string | null): string | null =>
  LOCAIS.find(x => x.chave === l)?.nome ?? null

/**
 * O dia já tem compromisso em OUTRA região?
 *
 * ⚠️ AVISA, NÃO PROÍBE — quem chama decide. Exceção legítima sempre aparece (um às 9h em Lajeado e
 * um às 19h em Porto Alegre pode caber num dia específico), e trava que não deixa exceção passar é
 * trava que o time aprende a contornar por fora do sistema. O que não pode é marcar sem saber.
 */
export function conflitoDeRegiao(
  local: string | null | undefined,
  outrosDoDia: { local?: string | null; estado?: string }[],
): { conflito: boolean; regiao: Regiao | null; outra: Regiao | null; quantos: number } {
  const regiao = regiaoDoLocal(local)
  if (!regiao) return { conflito: false, regiao: null, outra: null, quantos: 0 }
  const outras = outrosDoDia
    .filter(m => m.estado !== 'cancelado' && m.estado !== 'concluido')
    .map(m => regiaoDoLocal(m.local))
    .filter((r): r is Regiao => !!r && r !== regiao)
  return { conflito: outras.length > 0, regiao, outra: outras[0] ?? null, quantos: outras.length }
}

/** Quantos dias faltam para a data (negativo = já passou). */
export function diasAte(dataISO: string, hojeISO?: string): number {
  const hoje = new Date((hojeISO || hojeBR()) + 'T12:00:00Z').getTime()  // dia de Brasília, não de Londres
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
  marcos: { id: string; ordem: number; ancora: boolean; estado: string; data_prevista: string | null; natureza?: string }[],
  ordemRemarcado: number,
  diasDeslocados: number,
) {
  const ancora = marcos.find(m => m.ancora)
  const limite = ancora?.data_prevista || null
  const mover: { id: string; data_prevista: string }[] = []
  let esbarrouNaAncora = false

  // Só ATRASO empurra. Trazer um encontro pra mais cedo não puxa o resto junto —
  // foi assim que um erro de digitação (01/09 no lugar de 21/09) arrastou o
  // calendário inteiro do Jhones três semanas pra trás.
  if (diasDeslocados <= 0) return { mover, esbarrouNaAncora }

  for (const m of marcos) {
    if (m.ordem <= ordemRemarcado) continue
    if (m.ancora) continue                       // a âncora nunca anda
    // só encontros formam a corrente: mês de tráfego e fase do CRM seguem o
    // calendário do contrato, não a agenda do cliente
    if (m.natureza && m.natureza !== 'encontro') continue
    if (m.estado === 'concluido' || m.estado === 'cancelado') continue
    if (!m.data_prevista) continue
    const nova = somaDias(m.data_prevista, diasDeslocados)
    if (limite && nova > limite) { esbarrouNaAncora = true; continue }
    mover.push({ id: m.id, data_prevista: nova })
  }
  return { mover, esbarrouNaAncora }
}
