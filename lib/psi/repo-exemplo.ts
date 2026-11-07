// MODO DE TESTE: o mesmo repositório, mas guardado no próprio aparelho (localStorage), com pacientes
// INVENTADOS. Nenhum nome aqui é de gente de verdade. Imita as regras do banco: evolução não se apaga
// (só é marcada), toda edição guarda a versão anterior, e cada mudança entra na trilha de auditoria.
import type { Repo } from './repo'
import type {
  Anexo, Atendimento, Bloco, Despesa, DocumentoEmitido, Evolucao, EventoAuditoria, Local, Paciente, Perfil, Presenca, VersaoEvolucao,
} from './tipos'
import { BLOCOS_INICIAIS, DESPESAS_INICIAIS, LOCAIS_INICIAIS } from './tipos'
import { diaDaSemana, hojeBR, mesSomar, somarDias } from './datas'
import { valorPadrao } from './financeiro'

// v2 (07/11): locais com o financeiro (salário / por atendimento) e a SESM no lugar da Mauri
const CHAVE = 'psi_exemplo_v2'

interface Banco {
  perfil: Perfil | null
  locais: Local[]
  blocos: Bloco[]
  pacientes: Paciente[]
  atendimentos: Atendimento[]
  evolucoes: Evolucao[]
  versoes: VersaoEvolucao[]
  anexos: (Anexo & { dataUrl?: string })[]
  documentos: DocumentoEmitido[]
  auditoria: EventoAuditoria[]
  despesas: Despesa[]
}

const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : 'x' + Math.random().toString(36).slice(2) + Date.now().toString(36)
const agora = () => new Date().toISOString()

// ------------------------------------------------------------------ os dados inventados
function semear(): Banco {
  const hoje = hojeBR()
  const locais: Local[] = LOCAIS_INICIAIS.map((l, i) => ({ ...l, id: `local-${i + 1}` }))
  // valores INVENTADOS (os modelos, as % e os salários seguem os iniciais)
  locais[1].valor_sessao = 130; locais[1].forma_pagamento = 'Repasse da clínica no dia 10'
  locais[2].valor_sessao = 150; locais[2].forma_pagamento = 'Pix do paciente na sessão'; locais[2].cobra_falta = true
  const porNome = (n: string) => locais.find(l => l.nome === n)!.id
  // os custos fixos (aluguel da SESM, contador) valendo desde 3 meses atrás, e uma despesa avulsa no mês
  const despesas: Despesa[] = DESPESAS_INICIAIS.map((d, i) => ({ id: 'despesa-' + (i + 1), nome: d.nome, valor: d.valor, local_id: d.local ? porNome(d.local) : null,
    recorrente: true, desde: mesSomar(hoje.slice(0, 7), -3), ate: null, mes: null, ativo: true }))
  despesas.push({ id: 'despesa-3', nome: 'Livros de ludoterapia', valor: 180, local_id: null, recorrente: false, mes: hoje.slice(0, 7), ativo: true })
  const blocos: Bloco[] = BLOCOS_INICIAIS.map((b, i) => ({ id: `bloco-${i + 1}`, local_id: porNome(b.local), dia_semana: b.dia_semana, hora_inicio: b.hora_inicio, hora_fim: b.hora_fim, ativo: true }))

  const inicio = somarDias(hoje, -75)
  const p = (nome: string, local: string, dia: number, hora: string, extra: Partial<Paciente> = {}): Paciente => ({
    id: uid(), nome, local_id: porNome(local), status: 'ativo', modalidade: 'presencial', recorrente: true,
    dia_semana: dia, hora_fixa: hora, data_inicio: inicio, telefone: '(51) 99999-0000', ...extra,
  })
  const pacientes: Paciente[] = [
    p('Davi Moreira', 'APAE', 1, '07:30', { data_nascimento: '2016-03-14', responsavel_nome: 'Sandra Moreira', responsavel_parentesco: 'mãe', responsavel_telefone: '(51) 99999-0001',
      demanda: 'Encaminhado pela equipe pedagógica: dificuldade de regular emoções na rotina escolar.', objetivos: 'Ampliar o repertório de comunicação das emoções; orientar a família.', historico: 'Frequenta a APAE desde 2022. Mora com a mãe e a avó.', procedimentos: 'Ludoterapia, orientação à família.' }),
    p('Helena Prates', 'APAE', 1, '08:30', { data_nascimento: '2012-09-02', responsavel_nome: 'Carlos Prates', responsavel_parentesco: 'pai', demanda: 'Ansiedade em situações novas.' }),
    p('Miguel Fontana', 'APAE', 1, '09:30', { data_nascimento: '2010-01-20', responsavel_nome: 'Rita Fontana', responsavel_parentesco: 'mãe' }),
    p('Laura Bettio', 'APAE', 1, '10:30', { data_nascimento: '2014-06-11', responsavel_nome: 'Paula Bettio', responsavel_parentesco: 'mãe' }),
    p('Bernardo Kunz', 'APAE', 5, '07:30', { data_nascimento: '2011-11-30', responsavel_nome: 'Ivo Kunz', responsavel_parentesco: 'avô' }),
    p('Alice Schmitt', 'APAE', 3, '08:30', { data_nascimento: '2015-02-17', responsavel_nome: 'Janete Schmitt', responsavel_parentesco: 'mãe' }),
    p('Theo Lorenzon', 'APAE', 3, '09:30', { data_nascimento: '2013-08-08', responsavel_nome: 'Márcia Lorenzon', responsavel_parentesco: 'mãe' }),
    p('Valentina Rech', 'APAE', 3, '10:30', { data_nascimento: '2017-04-25', responsavel_nome: 'Diego Rech', responsavel_parentesco: 'pai' }),
    p('Roberto Gaspar', 'Mercado Montanha', 2, '08:00', { data_nascimento: '1984-05-09', demanda: 'Estresse no trabalho e sono ruim.' }),
    p('Fernanda Lima', 'Mercado Montanha', 2, '09:00', { data_nascimento: '1991-12-01' }),
    p('Jéssica Toledo', 'Mercado Montanha', 2, '10:00', { data_nascimento: '1996-07-15' }),
    p('Paulo Henz', 'Mercado Montanha', 2, '13:00', { data_nascimento: '1978-10-03' }),
    p('Mariana Costa', 'SESM', 3, '14:00', { data_nascimento: '1988-01-29', valor_sessao: 170, demanda: 'Luto pela perda do pai; dificuldade de retomar a rotina.', objetivos: 'Elaboração do luto.' }),
    p('Eduardo Weber', 'SESM', 3, '15:00', { data_nascimento: '1975-03-22' }),
    p('Camila Duarte', 'Clínica Conecta', 4, '14:00', { data_nascimento: '2000-09-18', demanda: 'Crises de ansiedade antes de provas.' }),
    p('Gustavo Pereira', 'Clínica Conecta', 4, '15:00', { data_nascimento: '1993-04-04', valor_sessao: 110 }),
    p('Sofia Ramos', 'Clínica Conecta', 4, '16:00', { data_nascimento: '2008-12-12', responsavel_nome: 'Lúcia Ramos', responsavel_parentesco: 'mãe' }),
    p('Antônio Becker', 'SESM', 3, '16:00', { status: 'alta', recorrente: false, encerramento_em: somarDias(hoje, -20), encerramento_motivo: 'Alta', encerramento_texto: 'Objetivos alcançados; combinado retorno se precisar.' }),
  ]

  // histórico: toda semana, cada paciente recorrente no seu dia; a maioria realizado
  let semente = 7
  const sorte = () => { semente = (semente * 9301 + 49297) % 233280; return semente / 233280 }
  const textos = [
    'Paciente chegou no horário, participativo. Trabalhamos o reconhecimento de emoções com recursos lúdicos. Combinado retomar o tema na próxima sessão.',
    'Relatou semana mais tranquila. Revisamos as estratégias combinadas; boa adesão. Seguimos com o plano.',
    'Sessão centrada em situação vivida na escola/trabalho. Acolhimento e organização do relato. Orientação breve ao responsável na saída.',
    'Paciente mais quieto no início; aos poucos se engajou na atividade proposta. Observado progresso na comunicação.',
    'Trabalhamos respiração e identificação de gatilhos. Paciente trouxe exemplo concreto da semana.',
  ]
  const atendimentos: Atendimento[] = []
  const evolucoes: Evolucao[] = []
  for (const pac of pacientes) {
    const loc = locais.find(l => l.id === pac.local_id)!
    let d = pac.data_inicio!
    while (diaDaSemana(d) !== pac.dia_semana) d = somarDias(d, 1)
    const ultimo = pac.encerramento_em || somarDias(hoje, -1)
    for (; d <= ultimo; d = somarDias(d, 7)) {
      // a última semana: algumas sessões ficam sem registro (aparecem como "falta registrar")
      if (d > somarDias(hoje, -7) && sorte() < 0.5) continue
      const r = sorte()
      const presenca: Presenca = r < 0.8 ? 'realizado' : r < 0.9 ? 'faltou' : 'desmarcou'
      const a: Atendimento = { id: uid(), paciente_id: pac.id, local_id: pac.local_id, data: d, hora: pac.hora_fixa || null, duracao_min: 50,
        presenca, modalidade: 'presencial', valor: valorPadrao(pac, loc), pago: d < somarDias(hoje, -30) || (!!valorPadrao(pac, loc) && sorte() < 0.4), criado_em: d + 'T15:00:00Z' }
      atendimentos.push(a)
      if (presenca === 'realizado') evolucoes.push({ id: uid(), paciente_id: pac.id, atendimento_id: a.id, local_id: pac.local_id, data: d, tipo: 'sessao',
        texto: textos[Math.floor(sorte() * textos.length)], versao: 1, criado_em: d + 'T15:05:00Z', atualizado_em: d + 'T15:05:00Z' })
    }
  }
  // um paciente avulso (sem horário fixo), com sessão marcada pra semana que vem
  const avulso = p('Rafael Nunes', 'Clínica Conecta', 4, '17:00', { recorrente: false, dia_semana: null, hora_fixa: null, data_inicio: hoje })
  pacientes.push(avulso)
  let prox = somarDias(hoje, 1); while (diaDaSemana(prox) !== 4) prox = somarDias(prox, 1)
  atendimentos.push({ id: uid(), paciente_id: avulso.id, local_id: avulso.local_id, data: prox, hora: '17:00', duracao_min: 50, presenca: 'agendado', modalidade: 'presencial', valor: 130, pago: false, confirmacao: 'confirmado', confirmado_em: agora() })

  return {
    perfil: { nome: 'Morgana Schena Wickert', crp: '07/00000 (exemplo)', telefone: '(51) 99999-0000', email: 'exemplo@exemplo.com', cidade: 'Lajeado/RS' },
    locais, blocos, pacientes, atendimentos, evolucoes, versoes: [], anexos: [], documentos: [], auditoria: [], despesas,
  }
}

// ------------------------------------------------------------------ guardar no aparelho
let cache: Banco | null = null
function ler(): Banco {
  if (cache) return cache
  try {
    const s = localStorage.getItem(CHAVE)
    if (s) { cache = JSON.parse(s) as Banco; cache.despesas = cache.despesas || []; return cache }
  } catch {}
  cache = semear(); gravar(); return cache
}
function gravar() { try { if (cache) localStorage.setItem(CHAVE, JSON.stringify(cache)) } catch {} }
export function zerarExemplo() { try { localStorage.removeItem(CHAVE) } catch {}; cache = null }

function auditar(acao: string, tabela: string | null, registro_id: string | null, paciente_id: string | null, campos?: string[], detalhe?: string) {
  const b = ler()
  b.auditoria.unshift({ id: Date.now() + Math.random(), acao, tabela, registro_id, paciente_id, campos: campos || null, detalhe: detalhe || null, quando: agora() })
  b.auditoria = b.auditoria.slice(0, 500)
}

function mudou<T extends object>(velho: T, novo: Partial<T>) {
  return Object.keys(novo).filter(k => k !== 'atualizado_em' && k !== 'versao' && JSON.stringify((velho as Record<string, unknown>)[k] ?? null) !== JSON.stringify((novo as Record<string, unknown>)[k] ?? null))
}

function upsert<T extends { id: string }>(lista: T[], item: Partial<T>, tabela: string, pac: (x: T) => string | null, base: Partial<T> = {}): T {
  if (item.id) {
    const i = lista.findIndex(x => x.id === item.id)
    if (i >= 0) {
      const campos = mudou(lista[i], item)
      lista[i] = { ...lista[i], ...item }
      if (campos.length) auditar('alterar', tabela, lista[i].id, pac(lista[i]), campos)
      return lista[i]
    }
  }
  const novo = { ...base, ...item, id: item.id || uid(), criado_em: agora() } as unknown as T
  lista.push(novo)
  auditar('criar', tabela, novo.id, pac(novo))
  return novo
}

const espera = () => new Promise(r => setTimeout(r, 30))

export function repoExemplo(): Repo {
  return {
    modo: 'exemplo',
    async usuario() { return { id: 'exemplo', email: 'exemplo@exemplo.com' } },
    async entrar() { return null },
    async sair() {},

    async perfil() { return ler().perfil },
    async salvarPerfil(p) { ler().perfil = p; gravar() },

    async locais() { await espera(); return [...ler().locais].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome)) },
    async salvarLocal(l) {
      const r = upsert(ler().locais, l, 'psi_locais', () => null, { tipo: 'clinica', cor: '#a27b5c', ativo: true, ordem: 99, cobra_falta: false } as Partial<Local>)
      gravar(); return r
    },
    async apagarLocal(id) {
      const b = ler()
      if (b.pacientes.some(p => p.local_id === id) || b.atendimentos.some(a => a.local_id === id))
        throw new Error('Este local tem pacientes ou atendimentos. Em vez de apagar, desative.')
      b.locais = b.locais.filter(l => l.id !== id); b.blocos = b.blocos.filter(x => x.local_id !== id); gravar()
    },

    async blocos() { return [...ler().blocos].sort((a, b) => a.dia_semana - b.dia_semana || (a.hora_inicio || '99').localeCompare(b.hora_inicio || '99')) },
    async salvarBloco(x) { const r = upsert(ler().blocos, x, 'psi_blocos', () => null, { ativo: true, hora_inicio: null, hora_fim: null } as Partial<Bloco>); gravar(); return r },
    async apagarBloco(id) { const b = ler(); b.blocos = b.blocos.filter(x => x.id !== id); gravar() },

    async pacientes() { await espera(); return [...ler().pacientes].sort((a, b) => a.nome.localeCompare(b.nome)) },
    async paciente(id) { return ler().pacientes.find(p => p.id === id) || null },
    async salvarPaciente(p) {
      const r = upsert(ler().pacientes, p, 'psi_pacientes', x => x.id, { status: 'ativo', modalidade: 'presencial', local_id: null } as Partial<Paciente>)
      gravar(); return r
    },

    async atendimentos(f) {
      await espera()
      return ler().atendimentos
        .filter(a => a.data >= f.de && a.data <= f.ate && (!f.pacienteId || a.paciente_id === f.pacienteId) && (!f.localId || a.local_id === f.localId))
        .sort((a, b) => a.data.localeCompare(b.data) || (a.hora || '').localeCompare(b.hora || ''))
    },
    async atendimento(id) { return ler().atendimentos.find(a => a.id === id) || null },
    async atendimentosDoPaciente(pid) {
      return ler().atendimentos.filter(a => a.paciente_id === pid).sort((a, b) => b.data.localeCompare(a.data) || (b.hora || '').localeCompare(a.hora || ''))
    },
    async salvarAtendimento(a) {
      const r = upsert(ler().atendimentos, a, 'psi_atendimentos', x => x.paciente_id, { duracao_min: 50, presenca: 'realizado', modalidade: 'presencial', pago: false, local_id: null } as Partial<Atendimento>)
      gravar(); return r
    },
    async apagarAtendimento(id) {
      const b = ler()
      const a = b.atendimentos.find(x => x.id === id)
      b.evolucoes.forEach(e => { if (e.atendimento_id === id) e.atendimento_id = null })
      b.atendimentos = b.atendimentos.filter(x => x.id !== id)
      if (a) auditar('apagar', 'psi_atendimentos', id, a.paciente_id)
      gravar()
    },

    async evolucoes(pid) {
      return ler().evolucoes.filter(e => e.paciente_id === pid).sort((a, b) => b.data.localeCompare(a.data) || (b.criado_em || '').localeCompare(a.criado_em || ''))
    },
    async evolucaoDoAtendimento(aid) { return ler().evolucoes.find(e => e.atendimento_id === aid && !e.apagada_em) || null },
    async salvarEvolucao(e) {
      const b = ler()
      if (e.id) {
        const velho = b.evolucoes.find(x => x.id === e.id)
        if (velho && (velho.texto !== e.texto || velho.data !== e.data || velho.tipo !== (e.tipo || velho.tipo))) {
          b.versoes.push({ id: uid(), evolucao_id: velho.id, versao: velho.versao, data: velho.data, tipo: velho.tipo, texto: velho.texto, apagada_em: velho.apagada_em, apagada_motivo: velho.apagada_motivo, substituida_em: agora() })
          e = { ...e, versao: velho.versao + 1, atualizado_em: agora() }
        }
      }
      const r = upsert(b.evolucoes, e, 'psi_evolucoes', x => x.paciente_id, { tipo: 'sessao', versao: 1, atualizado_em: agora() } as Partial<Evolucao>)
      gravar(); return r
    },
    async apagarEvolucao(id, motivo) {
      const b = ler()
      const v = b.evolucoes.find(x => x.id === id)
      if (!v) return
      b.versoes.push({ id: uid(), evolucao_id: v.id, versao: v.versao, data: v.data, tipo: v.tipo, texto: v.texto, apagada_em: null, apagada_motivo: null, substituida_em: agora() })
      v.apagada_em = agora(); v.apagada_motivo = motivo; v.versao += 1
      auditar('apagar', 'psi_evolucoes', id, v.paciente_id, ['apagada_em', 'apagada_motivo'])
      gravar()
    },
    async versoes(eid) { return ler().versoes.filter(v => v.evolucao_id === eid).sort((a, b) => b.versao - a.versao) },

    async anexos(pid) { return ler().anexos.filter(a => a.paciente_id === pid && !a.apagado_em) },
    async enviarAnexo(pid, arquivo, descricao) {
      if (arquivo.size > 2_000_000) throw new Error('No modo de teste, só arquivos de até 2 MB.')
      const dataUrl = await new Promise<string>((ok, nao) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = nao; r.readAsDataURL(arquivo) })
      const a = { id: uid(), paciente_id: pid, nome: arquivo.name, caminho: 'exemplo/' + arquivo.name, tipo_mime: arquivo.type, tamanho: arquivo.size, descricao: descricao || null, criado_em: agora(), dataUrl }
      ler().anexos.push(a); auditar('criar', 'psi_anexos', a.id, pid); gravar()
      return a
    },
    async linkAnexo(a) { return (ler().anexos.find(x => x.id === a.id)?.dataUrl) || null },

    async documentos(pid) { return ler().documentos.filter(d => d.paciente_id === pid).sort((a, b) => b.emitido_em.localeCompare(a.emitido_em)) },
    async salvarDocumento(d) {
      const novo = { ...d, id: uid(), criado_em: agora() }
      ler().documentos.push(novo); auditar('criar', 'psi_documentos', novo.id, d.paciente_id); gravar()
      return novo
    },

    async despesas() { await espera(); return [...ler().despesas].sort((a, b) => Number(b.recorrente) - Number(a.recorrente) || a.nome.localeCompare(b.nome)) },
    async salvarDespesa(d) {
      const r = upsert(ler().despesas, d, 'psi_despesas', () => null, { recorrente: true, ativo: true, local_id: null } as Partial<Despesa>)
      gravar(); return r
    },
    async apagarDespesa(id) { const b = ler(); b.despesas = b.despesas.filter(x => x.id !== id); auditar('apagar', 'psi_despesas', id, null); gravar() },

    async registrar(acao, pid, detalhe) { auditar(acao, pid ? 'psi_pacientes' : null, null, pid || null, undefined, detalhe); gravar() },
    async auditoria(limite = 200) { return ler().auditoria.slice(0, limite) },
  }
}
