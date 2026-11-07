'use client'
// REGISTRAR ATENDIMENTO numa tela só: paciente, dia/hora, local, presença e (se realizado) a evolução.
// Também serve pra MARCAR (modo=marcar): escolhe paciente e horário, com "toda semana" opcional.
import { useEffect, useMemo, useState } from 'react'
import { Repeat, Trash2, UserPlus } from 'lucide-react'
import { useBase } from '../App'
import { voltar } from '../rotas'
import { Busca, Campo, Chips, chipsLocais, Topo, useAviso, Vazio, iniciais } from '../ui'
import type { Atendimento, Evolucao, Presenca, TipoEvolucao } from '@/lib/psi/tipos'
import { ROTULO_EVOLUCAO } from '@/lib/psi/tipos'
import { DIAS, agoraHoraBR, dataLonga, diaDaSemana, hojeBR, normalizar } from '@/lib/psi/datas'

const PRESENCAS: [Presenca, string][] = [['realizado', 'Realizado'], ['faltou', 'Faltou'], ['desmarcou', 'Desmarcou'], ['remarcado', 'Remarcado']]

export default function Registrar({ q }: { q: URLSearchParams }) {
  const { repo, pacientes, locais, recarregar } = useBase()
  const aviso = useAviso()
  const atId = q.get('at')
  const marcar = q.get('modo') === 'marcar'

  const [atendimento, setAtendimento] = useState<Atendimento | null>(null)
  const [evolucao, setEvolucao] = useState<Evolucao | null>(null)
  const [carregado, setCarregado] = useState(!atId)
  const [pacId, setPacId] = useState(q.get('pac') || '')
  const [busca, setBusca] = useState('')
  const [data, setData] = useState(q.get('data') || hojeBR())
  const [hora, setHora] = useState(q.get('hora') || (marcar ? '' : agoraHoraBR()))
  const [localId, setLocalId] = useState(q.get('local') || '')
  const [presenca, setPresenca] = useState<Presenca | null>(null)
  const [texto, setTexto] = useState('')
  const [tipoEvo, setTipoEvo] = useState<TipoEvolucao>('sessao')
  const [toda, setToda] = useState(false)
  const [novaData, setNovaData] = useState('')
  const [novaHora, setNovaHora] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [pago, setPago] = useState(false)

  // editando um atendimento que já existe (veio da agenda ou do paciente)
  useEffect(() => {
    if (!atId) return
    ;(async () => {
      const a = await repo.atendimento(atId)
      if (a) {
        setAtendimento(a); setPacId(a.paciente_id); setData(a.data); setHora(a.hora || ''); setLocalId(a.local_id || '')
        setPresenca(a.presenca === 'agendado' ? null : a.presenca); setPago(a.pago)
        const e = await repo.evolucaoDoAtendimento(a.id)
        if (e) { setEvolucao(e); setTexto(e.texto); setTipoEvo(e.tipo) }
      }
      setCarregado(true)
    })()
  }, [atId, repo])

  const paciente = pacientes.find(p => p.id === pacId) || null
  // escolheu o paciente: o local dele vem junto (se ainda não tinha)
  useEffect(() => { if (paciente && !localId && paciente.local_id) setLocalId(paciente.local_id) }, [paciente, localId])

  const sugestoes = useMemo(() => {
    const t = normalizar(busca)
    const ativos = pacientes.filter(p => p.status === 'ativo' || p.status === 'pausa')
    const base = t ? ativos.filter(p => normalizar(p.nome + ' ' + (p.nome_social || '')).includes(t)) : ativos
    // os do local escolhido primeiro
    return [...base].sort((a, b) => Number(b.local_id === localId) - Number(a.local_id === localId) || a.nome.localeCompare(b.nome)).slice(0, t ? 20 : 8)
  }, [busca, pacientes, localId])

  async function cadastrarRapido() {
    const nome = busca.trim()
    if (nome.length < 3) return
    const novo = await repo.salvarPaciente({ nome, local_id: localId || null, status: 'ativo', modalidade: 'presencial', data_inicio: data })
    await recarregar()
    setPacId(novo.id); setBusca('')
    aviso('Paciente cadastrado. Complete os dados depois, no prontuário.')
  }

  const podeSalvar = !!paciente && !!data && (marcar || !!presenca)

  async function salvar() {
    if (!paciente) return
    setSalvando(true)
    try {
      const local = locais.find(l => l.id === localId) || null
      if (marcar && toda) {
        // horário fixo semanal: fica no paciente e aparece sozinho na agenda toda semana
        await repo.salvarPaciente({ id: paciente.id, nome: paciente.nome, recorrente: true, dia_semana: diaDaSemana(data), hora_fixa: hora || null, local_id: localId || paciente.local_id })
        await recarregar()
        aviso(`${paciente.nome.split(' ')[0]} marcado toda ${DIAS[diaDaSemana(data)]}${hora ? ' às ' + hora : ''}.`)
      } else {
        const a = await repo.salvarAtendimento({
          ...(atendimento ? { id: atendimento.id } : {}),
          paciente_id: paciente.id, data, hora: hora || null, local_id: localId || null,
          presenca: marcar ? 'agendado' : presenca!, modalidade: paciente.modalidade || 'presencial', pago,
          ...(atendimento ? {} : { valor: local?.valor_sessao ?? null, duracao_min: 50 }),
        })
        if (!marcar && presenca === 'realizado' && texto.trim()) {
          await repo.salvarEvolucao({ ...(evolucao ? { id: evolucao.id } : {}), paciente_id: paciente.id, atendimento_id: a.id, local_id: localId || null, data, tipo: tipoEvo, texto: texto.trim() })
        }
        if (!marcar && presenca === 'remarcado' && novaData) {
          await repo.salvarAtendimento({ paciente_id: paciente.id, data: novaData, hora: novaHora || hora || null, local_id: localId || null, presenca: 'agendado', modalidade: paciente.modalidade || 'presencial', valor: local?.valor_sessao ?? null, duracao_min: 50, pago: false })
        }
        aviso(marcar ? 'Marcado na agenda.' : presenca === 'realizado' ? (texto.trim() ? 'Atendimento e evolução salvos.' : 'Atendimento salvo. A evolução pode ser escrita depois.') : 'Registrado.')
      }
      voltar('#/')
    } catch (e) { aviso((e as Error).message) }
    setSalvando(false)
  }

  async function apagar() {
    if (!atendimento || !confirm('Apagar este atendimento? (A evolução, se houver, continua no prontuário.)')) return
    await repo.apagarAtendimento(atendimento.id)
    aviso('Atendimento apagado.')
    voltar('#/')
  }

  if (!carregado) return <><Topo titulo="Atendimento" voltarPara="#/" /><Vazio>Carregando…</Vazio></>

  return (
    <>
      <Topo titulo={marcar ? 'Marcar paciente' : atendimento ? 'Atendimento' : 'Registrar atendimento'} voltarPara="#/"
        direita={atendimento ? <button className="psi-icone-btn" aria-label="Apagar atendimento" onClick={apagar}><Trash2 size={19} /></button> : undefined} />

      {/* 1. o paciente */}
      {paciente ? (
        <div className="psi-cartao psi-linha" style={{ marginBottom: 16, padding: 12 }}>
          <span className="psi-avatar" style={{ background: locais.find(l => l.id === paciente.local_id)?.cor || 'var(--cafe)' }}>{iniciais(paciente.nome)}</span>
          <span className="psi-item-txt"><strong>{paciente.nome}</strong><small>{locais.find(l => l.id === paciente.local_id)?.nome || 'sem local'}</small></span>
          {!atendimento && <button className="psi-btn psi-btn-suave psi-btn-pequeno" onClick={() => setPacId('')}>Trocar</button>}
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <Campo rotulo="Paciente">
            <Busca valor={busca} mudar={setBusca} placeholder="Digite o nome" />
          </Campo>
          <div className="psi-lista">
            {sugestoes.map(p => (
              <button key={p.id} className="psi-item" onClick={() => setPacId(p.id)}>
                <span className="psi-avatar" style={{ background: locais.find(l => l.id === p.local_id)?.cor || 'var(--cafe)' }}>{iniciais(p.nome)}</span>
                <span className="psi-item-txt"><strong>{p.nome}</strong><small>{locais.find(l => l.id === p.local_id)?.nome || 'sem local'}</small></span>
              </button>
            ))}
            {busca.trim().length >= 3 && !sugestoes.some(p => normalizar(p.nome) === normalizar(busca)) && (
              <button className="psi-item" onClick={cadastrarRapido}>
                <span className="psi-avatar" style={{ background: 'var(--areia)', color: 'var(--cacau)' }}><UserPlus size={18} /></span>
                <span className="psi-item-txt"><strong>Cadastrar “{busca.trim()}”</strong><small>Paciente novo{localId ? ' em ' + (locais.find(l => l.id === localId)?.nome || '') : ''}</small></span>
              </button>
            )}
            {sugestoes.length === 0 && busca.trim().length < 3 && <Vazio>Nenhum paciente ainda.</Vazio>}
          </div>
        </div>
      )}

      {/* 2. quando e onde */}
      <div className="psi-grade-2">
        <Campo rotulo="Dia"><input className="psi-input" type="date" value={data} onChange={e => setData(e.target.value)} /></Campo>
        <Campo rotulo="Hora"><input className="psi-input" type="time" value={hora} onChange={e => setHora(e.target.value)} /></Campo>
      </div>
      <p className="psi-muted psi-pequeno" style={{ margin: '-6px 0 12px' }}>{data && dataLonga(data)}</p>
      <Campo rotulo="Local"><Chips opcoes={chipsLocais(locais)} valor={localId} mudar={setLocalId} rolar /></Campo>

      {/* 3a. marcar: toda semana? */}
      {marcar && (
        <button type="button" className="psi-cartao psi-linha" style={{ width: '100%', textAlign: 'left', cursor: 'pointer', borderColor: toda ? 'var(--cafe)' : undefined }} onClick={() => setToda(!toda)} aria-pressed={toda}>
          <Repeat size={22} color="var(--cafe)" />
          <span style={{ flex: 1 }}><b>Toda semana neste horário</b><br /><span className="psi-muted psi-pequeno">Aparece sozinho na agenda toda {DIAS[diaDaSemana(data)]}{hora ? ' às ' + hora : ''}.</span></span>
          <span className="psi-chip" aria-pressed={toda} style={{ minHeight: 34 }}>{toda ? 'Sim' : 'Não'}</span>
        </button>
      )}

      {/* 3b. registrar: presença e evolução */}
      {!marcar && (
        <>
          <Campo rotulo="Presença">
            <div className="psi-presencas">
              {PRESENCAS.map(([p, r]) => <button type="button" key={p} className="psi-presenca" data-p={p} aria-pressed={presenca === p} onClick={() => setPresenca(p)}>{r}</button>)}
            </div>
          </Campo>

          {(presenca === 'realizado' || presenca === 'faltou') && locais.find(l => l.id === localId)?.valor_sessao ? (
            <Campo rotulo="Pagamento"><Chips opcoes={[{ valor: 'nao', rotulo: 'A receber' }, { valor: 'sim', rotulo: 'Já recebido' }]} valor={pago ? 'sim' : 'nao'} mudar={v => setPago(v === 'sim')} /></Campo>
          ) : null}

          {presenca === 'remarcado' && (
            <div className="psi-grade-2">
              <Campo rotulo="Nova data"><input className="psi-input" type="date" value={novaData} onChange={e => setNovaData(e.target.value)} /></Campo>
              <Campo rotulo="Nova hora"><input className="psi-input" type="time" value={novaHora} onChange={e => setNovaHora(e.target.value)} /></Campo>
            </div>
          )}

          {presenca === 'realizado' && (
            <>
              <Campo rotulo="Evolução da sessão" ajuda={evolucao ? `Editar guarda a versão anterior (esta é a versão ${evolucao.versao}).` : 'Pode escrever agora ou depois, no prontuário.'}>
                <textarea className="psi-input" style={{ minHeight: 200 }} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Como foi a sessão: o que foi trabalhado, observações, combinados." />
              </Campo>
              <Campo rotulo="Tipo de registro">
                <Chips opcoes={(['sessao', 'avaliacao', 'devolutiva', 'contato'] as TipoEvolucao[]).map(t => ({ valor: t, rotulo: ROTULO_EVOLUCAO[t].split(' (')[0] }))} valor={tipoEvo} mudar={setTipoEvo} rolar />
              </Campo>
            </>
          )}
        </>
      )}

      <button className="psi-btn psi-btn-principal psi-btn-bloco" style={{ marginTop: 18 }} disabled={!podeSalvar || salvando} onClick={salvar}>
        {salvando ? 'Salvando…' : marcar ? (toda ? 'Marcar toda semana' : 'Marcar') : 'Salvar'}
      </button>
    </>
  )
}
