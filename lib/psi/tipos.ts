// PSI — os tipos do consultório. Espelham as tabelas psi_* de db/psi.sql (mesmos nomes de coluna).

export type TipoLocal = 'instituicao' | 'clinica' | 'empresa' | 'particular' | 'online'
export type StatusPaciente = 'ativo' | 'pausa' | 'alta' | 'encerrado'
export type Presenca = 'agendado' | 'realizado' | 'faltou' | 'desmarcou' | 'remarcado'
export type Modalidade = 'presencial' | 'online'
export type TipoEvolucao = 'sessao' | 'avaliacao' | 'devolutiva' | 'contato' | 'encerramento' | 'anotacao'
export type TipoDocumento = 'declaracao' | 'atestado' | 'relatorio' | 'outro'

export interface Perfil {
  owner_id?: string
  nome: string
  crp: string
  telefone?: string | null
  email?: string | null
  cidade?: string | null
  endereco?: string | null
}

export interface Local {
  id: string
  nome: string
  tipo: TipoLocal
  cidade?: string | null
  valor_sessao?: number | null
  forma_pagamento?: string | null
  cobra_falta: boolean
  cor: string
  ativo: boolean
  ordem: number
  observacoes?: string | null
}

export interface Paciente {
  id: string
  local_id: string | null
  nome: string
  nome_social?: string | null
  data_nascimento?: string | null
  cpf?: string | null
  telefone?: string | null
  email?: string | null
  endereco?: string | null
  responsavel_nome?: string | null
  responsavel_parentesco?: string | null
  responsavel_telefone?: string | null
  data_inicio?: string | null
  status: StatusPaciente
  recorrente?: boolean
  dia_semana?: number | null
  hora_fixa?: string | null
  modalidade: Modalidade
  observacoes?: string | null
  demanda?: string | null
  objetivos?: string | null
  historico?: string | null
  procedimentos?: string | null
  encerramento_em?: string | null
  encerramento_motivo?: string | null
  encerramento_texto?: string | null
  criado_em?: string
}

export interface Atendimento {
  id: string
  paciente_id: string
  local_id: string | null
  data: string            // YYYY-MM-DD (dia de Brasília)
  hora?: string | null    // HH:MM
  duracao_min: number
  presenca: Presenca
  modalidade: Modalidade
  valor?: number | null
  pago: boolean
  observacao?: string | null
  criado_em?: string
}

export interface Evolucao {
  id: string
  paciente_id: string
  atendimento_id?: string | null
  local_id?: string | null
  data: string
  tipo: TipoEvolucao
  texto: string
  versao: number
  apagada_em?: string | null
  apagada_motivo?: string | null
  criado_em?: string
  atualizado_em?: string
}

export interface VersaoEvolucao {
  id: string
  evolucao_id: string
  versao: number
  data: string
  tipo: TipoEvolucao
  texto: string
  apagada_em?: string | null
  apagada_motivo?: string | null
  substituida_em: string
}

export interface Anexo {
  id: string
  paciente_id: string
  nome: string
  caminho: string
  tipo_mime?: string | null
  tamanho?: number | null
  descricao?: string | null
  apagado_em?: string | null
  criado_em: string
}

export interface DocumentoEmitido {
  id: string
  paciente_id: string
  tipo: TipoDocumento
  titulo: string
  campos: Record<string, string>
  texto: string
  emitido_em: string
  criado_em?: string
}

export interface EventoAuditoria {
  id: number | string
  acao: string
  tabela?: string | null
  registro_id?: string | null
  paciente_id?: string | null
  campos?: string[] | null
  detalhe?: string | null
  quando: string
}

export const ROTULO_PRESENCA: Record<Presenca, string> = {
  agendado: 'Agendado',
  realizado: 'Realizado',
  faltou: 'Faltou',
  desmarcou: 'Desmarcou',
  remarcado: 'Remarcado',
}

export const ROTULO_STATUS: Record<StatusPaciente, string> = {
  ativo: 'Em atendimento',
  pausa: 'Em pausa',
  alta: 'Alta',
  encerrado: 'Encerrado',
}

export const ROTULO_TIPO_LOCAL: Record<TipoLocal, string> = {
  instituicao: 'Instituição',
  clinica: 'Clínica',
  empresa: 'Empresa',
  particular: 'Particular',
  online: 'On-line',
}

export const ROTULO_EVOLUCAO: Record<TipoEvolucao, string> = {
  sessao: 'Sessão',
  avaliacao: 'Avaliação',
  devolutiva: 'Devolutiva',
  contato: 'Contato (família/escola/rede)',
  encerramento: 'Encerramento',
  anotacao: 'Anotação',
}

export const ROTULO_DOCUMENTO: Record<TipoDocumento, string> = {
  declaracao: 'Declaração',
  atestado: 'Atestado psicológico',
  relatorio: 'Relatório psicológico',
  outro: 'Documento',
}

// Os 4 locais com que o sistema nasce (ela pode editar tudo depois)
export const LOCAIS_INICIAIS: Omit<Local, 'id'>[] = [
  { nome: 'APAE', tipo: 'instituicao', cidade: null, valor_sessao: null, forma_pagamento: null, cobra_falta: false, cor: '#b07a5e', ativo: true, ordem: 1 },
  { nome: 'Clínica Conecta', tipo: 'clinica', cidade: 'Estrela', valor_sessao: null, forma_pagamento: null, cobra_falta: false, cor: '#c08f8b', ativo: true, ordem: 2 },
  { nome: 'Clínica Mauri', tipo: 'clinica', cidade: 'Lajeado', valor_sessao: null, forma_pagamento: null, cobra_falta: false, cor: '#8c9877', ativo: true, ordem: 3 },
  { nome: 'Mercado Montanha', tipo: 'empresa', cidade: null, valor_sessao: null, forma_pagamento: null, cobra_falta: false, cor: '#6f8796', ativo: true, ordem: 4 },
]

// A rotina fixa: um bloco por local e dia da semana. Sem hora = só o dia (horário de cada paciente).
export interface Bloco {
  id: string
  local_id: string
  dia_semana: number      // 0 = domingo, 1 = segunda...
  hora_inicio: string | null
  hora_fim: string | null
  ativo: boolean
}

// A rotina que ela passou (06/11). Mauri (qua) e Conecta (qui) NÃO têm horário fixo ("depende dos
// pacientes"): o bloco só marca o DIA do local; a agenda mostra o horário de cada paciente marcado.
export const BLOCOS_INICIAIS: { local: string; dia_semana: number; hora_inicio: string | null; hora_fim: string | null }[] = [
  { local: 'APAE', dia_semana: 1, hora_inicio: '07:30', hora_fim: '11:30' },
  { local: 'APAE', dia_semana: 5, hora_inicio: '07:30', hora_fim: '11:30' },
  { local: 'Mercado Montanha', dia_semana: 2, hora_inicio: '08:00', hora_fim: '15:00' },
  { local: 'Clínica Mauri', dia_semana: 3, hora_inicio: null, hora_fim: null },
  { local: 'Clínica Conecta', dia_semana: 4, hora_inicio: null, hora_fim: null },
]

// A dona do consultório (Guto, 06/11). O CRP ela completa em "Meus dados".
export const NOME_PADRAO = 'Morgana Schena Wickert'
