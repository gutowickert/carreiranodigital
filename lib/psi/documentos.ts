// Os modelos de documento, na estrutura da Resolução CFP 06/2019 (ver docs/psi/PESQUISA.md):
//  · Declaração (art. 9º): só informação objetiva (comparecimento, acompanhamento, dias e horários).
//    PROIBIDO escrever sintoma ou estado psicológico — o formulário nem tem campo pra isso.
//  · Atestado psicológico (art. 10): baseado em avaliação; texto corrido, espaço restante com traços.
//  · Relatório psicológico (art. 11): identificação, demanda, procedimento, análise, conclusão.
// Todos fecham com local, data, nome e CRP; validade no último parágrafo (art. 17).
import type { Paciente, Perfil, TipoDocumento } from './tipos'
import type { ConteudoDocumento } from './exportar'
import { dataBR } from './datas'

export interface CampoModelo {
  chave: string
  rotulo: string
  ajuda?: string
  tipo?: 'texto' | 'area' | 'data' | 'hora' | 'escolha'
  opcoes?: [string, string][]
  obrigatorio?: boolean
}

export interface Modelo {
  tipo: TipoDocumento
  titulo: string
  explicacao: string
  campos: CampoModelo[]
  montar(v: Record<string, string>, p: Paciente, perfil: Perfil): ConteudoDocumento
}

const SIGILO = 'Este documento não poderá ser utilizado para fins diferentes do apontado na finalidade, possui caráter sigiloso e trata-se de documento extrajudicial.'
const nomeDe = (p: Paciente) => p.nome_social || p.nome

export const MODELOS: Record<'declaracao' | 'atestado' | 'relatorio', Modelo> = {
  declaracao: {
    tipo: 'declaracao',
    titulo: 'Declaração',
    explicacao: 'Comprova comparecimento ou acompanhamento (dias e horários). Não pode citar sintoma nem estado psicológico.',
    campos: [
      { chave: 'modo', rotulo: 'O que declarar', tipo: 'escolha', opcoes: [['comparecimento', 'Comparecimento num dia'], ['acompanhamento', 'Que está em acompanhamento']] },
      { chave: 'finalidade', rotulo: 'Finalidade', ajuda: 'Ex.: apresentação ao trabalho, à escola', obrigatorio: true },
      { chave: 'data', rotulo: 'Dia do atendimento', tipo: 'data' },
      { chave: 'hora_inicio', rotulo: 'Das', tipo: 'hora' },
      { chave: 'hora_fim', rotulo: 'Às', tipo: 'hora' },
      { chave: 'frequencia', rotulo: 'Frequência (acompanhamento)', ajuda: 'Ex.: semanal, às quartas-feiras, das 14h às 14h50' },
      { chave: 'acompanhante', rotulo: 'Acompanhante (se houver)', ajuda: 'Nome de quem acompanhou' },
    ],
    montar(v, p, perfil) {
      const nome = nomeDe(p)
      const acomp = v.acompanhante ? `, acompanhado(a) por ${v.acompanhante},` : ''
      const corpo = v.modo === 'acompanhamento'
        ? `Declaro, para fins de ${v.finalidade || '...'}, que ${nome}${acomp} encontra-se em acompanhamento psicológico${p.data_inicio ? ` desde ${dataBR(p.data_inicio)}` : ''}${v.frequencia ? `, com frequência ${v.frequencia}` : ''}.`
        : `Declaro, para fins de ${v.finalidade || '...'}, que ${nome}${acomp} compareceu a atendimento psicológico no dia ${dataBR(v.data)}${v.hora_inicio ? `, das ${v.hora_inicio}` : ''}${v.hora_fim ? ` às ${v.hora_fim}` : ''}.`
      return { titulo: 'Declaração', blocos: [{ texto: corpo }, { texto: SIGILO }], cidade: perfil.cidade || '', data: v.emitido_em }
    },
  },

  atestado: {
    tipo: 'atestado',
    titulo: 'Atestado psicológico',
    explicacao: 'Só com base em avaliação psicológica registrada no prontuário. Serve pra justificar falta, aptidão ou afastamento. Texto corrido.',
    campos: [
      { chave: 'solicitante', rotulo: 'Quem pediu', ajuda: 'Ex.: o próprio paciente, a empresa X, a escola Y', obrigatorio: true },
      { chave: 'finalidade', rotulo: 'Finalidade', ajuda: 'Ex.: justificar afastamento do trabalho', obrigatorio: true },
      { chave: 'condicoes', rotulo: 'Condições psicológicas observadas', tipo: 'area', ajuda: 'O que a avaliação permite afirmar, em terceira pessoa', obrigatorio: true },
      { chave: 'periodo', rotulo: 'Período (se for afastamento)', ajuda: 'Ex.: 7 dias, a contar de 06/11/2026' },
      { chave: 'cid', rotulo: 'CID (opcional)', ajuda: 'Só com autorização do paciente' },
      { chave: 'validade', rotulo: 'Validade do documento', ajuda: 'Ex.: 30 dias' },
    ],
    montar(v, p, perfil) {
      const partes = [
        `Atesto, a pedido de ${v.solicitante || '...'}, para fins de ${v.finalidade || '...'}, que ${nomeDe(p)}${p.data_nascimento ? `, nascido(a) em ${dataBR(p.data_nascimento)},` : ''} foi avaliado(a) por esta psicóloga.`,
        (v.condicoes || '').replace(/\s*\n+\s*/g, ' ').trim(),
        v.periodo ? `Necessita de afastamento de suas atividades pelo período de ${v.periodo}.` : '',
        v.cid ? `CID: ${v.cid}.` : '',
        v.validade ? `Este atestado tem validade de ${v.validade}.` : '',
        SIGILO,
      ].filter(Boolean).join(' ')
      return { titulo: 'Atestado psicológico', blocos: [{ texto: partes }], cidade: perfil.cidade || '', data: v.emitido_em, preencherComTracos: true }
    },
  },

  relatorio: {
    tipo: 'relatorio',
    titulo: 'Relatório psicológico',
    explicacao: 'Comunica a atuação no caso. Não é diagnóstico. Cinco partes: identificação, demanda, procedimento, análise e conclusão. Entregue em conversa de devolução.',
    campos: [
      { chave: 'solicitante', rotulo: 'Quem pediu', ajuda: 'Ex.: APAE, escola, o responsável', obrigatorio: true },
      { chave: 'finalidade', rotulo: 'Finalidade', ajuda: 'Ex.: acompanhamento escolar', obrigatorio: true },
      { chave: 'demanda', rotulo: 'Descrição da demanda', tipo: 'area', ajuda: 'O motivo do atendimento (vem do prontuário; ajuste)' },
      { chave: 'procedimento', rotulo: 'Procedimento', tipo: 'area', ajuda: 'Método, quem foi ouvido, número de encontros e período' },
      { chave: 'analise', rotulo: 'Análise', tipo: 'area', ajuda: 'Só o necessário pra responder ao pedido; sem transcrever sessões' },
      { chave: 'conclusao', rotulo: 'Conclusão', tipo: 'area', ajuda: 'Encaminhamentos, orientações, continuidade' },
      { chave: 'validade', rotulo: 'Validade do documento', ajuda: 'Ex.: 6 meses' },
    ],
    montar(v, p, perfil) {
      const ident = [
        `Autora: ${perfil.nome || ''}${perfil.crp ? ` — CRP ${perfil.crp}` : ''}`,
        `Interessado(a): ${nomeDe(p)}${p.responsavel_nome ? ` (responsável: ${p.responsavel_nome})` : ''}`,
        `Solicitante: ${v.solicitante || ''}`,
        `Finalidade: ${v.finalidade || ''}`,
      ].join('\n')
      const fim = [v.conclusao || '', v.validade ? `Este relatório tem validade de ${v.validade}.` : '', SIGILO].filter(Boolean).join('\n')
      return {
        titulo: 'Relatório psicológico',
        blocos: [
          { subtitulo: '1. Identificação', texto: ident },
          { subtitulo: '2. Descrição da demanda', texto: v.demanda || '' },
          { subtitulo: '3. Procedimento', texto: v.procedimento || '' },
          { subtitulo: '4. Análise', texto: v.analise || '' },
          { subtitulo: '5. Conclusão', texto: fim },
        ],
        cidade: perfil.cidade || '', data: v.emitido_em,
      }
    },
  },
}

/** o texto final, pra guardar a cópia no prontuário (psi_documentos.texto) */
export const textoDoConteudo = (c: ConteudoDocumento) =>
  [c.titulo.toUpperCase(), ...c.blocos.map(b => (b.subtitulo ? b.subtitulo + '\n' : '') + b.texto), `${c.cidade}, ${dataBR(c.data)}`].join('\n\n')
