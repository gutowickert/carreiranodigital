'use client'
// UMA EVOLUÇÃO: ler, corrigir (a versão anterior fica guardada) ou apagar (com motivo; a linha fica
// no banco, escondida). Também cria anotação avulsa no prontuário (id = "novo").
import { useEffect, useState } from 'react'
import { History } from 'lucide-react'
import { useBase } from '../App'
import { voltar } from '../rotas'
import { Campo, Chips, chipsLocais, Folha, Topo, useAviso, Vazio } from '../ui'
import type { Evolucao, TipoEvolucao, VersaoEvolucao } from '@/lib/psi/tipos'
import { ROTULO_EVOLUCAO } from '@/lib/psi/tipos'
import { dataBR, hojeBR } from '@/lib/psi/datas'

export default function EvolucaoTela({ id, q }: { id: string; q: URLSearchParams }) {
  const { repo, locais, pacientes } = useBase()
  const aviso = useAviso()
  const pacId = q.get('pac') || ''
  const nova = id === 'novo'
  const paciente = pacientes.find(p => p.id === pacId)
  const [e, setE] = useState<Evolucao | null>(null)
  const [versoes, setVersoes] = useState<VersaoEvolucao[]>([])
  const [texto, setTexto] = useState('')
  const [data, setData] = useState(hojeBR())
  const [tipo, setTipo] = useState<TipoEvolucao>(nova ? 'anotacao' : 'sessao')
  const [localId, setLocalId] = useState(paciente?.local_id || '')
  const [editando, setEditando] = useState(nova)
  const [apagar, setApagar] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [carregado, setCarregado] = useState(nova)

  useEffect(() => {
    if (nova) return
    ;(async () => {
      const todas = await repo.evolucoes(pacId)
      const x = todas.find(v => v.id === id) || null
      setE(x)
      if (x) { setTexto(x.texto); setData(x.data); setTipo(x.tipo); setLocalId(x.local_id || ''); setVersoes(await repo.versoes(x.id)) }
      setCarregado(true)
    })()
  }, [id, nova, pacId, repo])

  async function salvar() {
    if (!texto.trim()) { aviso('Escreva o registro.'); return }
    try {
      await repo.salvarEvolucao({ ...(e ? { id: e.id, atendimento_id: e.atendimento_id } : {}), paciente_id: pacId, data, tipo, texto: texto.trim(), local_id: localId || null })
      aviso(e ? 'Correção salva. A versão anterior ficou guardada.' : 'Anotação salva.')
      voltar(`#/paciente/${pacId}`)
    } catch (err) { aviso((err as Error).message) }
  }
  async function confirmarApagar() {
    if (!e || motivo.trim().length < 3) return
    await repo.apagarEvolucao(e.id, motivo.trim())
    aviso('Evolução apagada (fica no histórico).')
    voltar(`#/paciente/${pacId}`)
  }

  if (!carregado) return <><Topo titulo="Evolução" voltarPara={`#/paciente/${pacId}`} /><Vazio>Carregando…</Vazio></>
  if (!nova && !e) return <><Topo titulo="Evolução" voltarPara={`#/paciente/${pacId}`} /><Vazio>Não encontrada.</Vazio></>

  return (
    <>
      <Topo titulo={nova ? 'Nova anotação' : `Evolução de ${dataBR(e!.data)}`} voltarPara={`#/paciente/${pacId}`} />
      {paciente && <p className="psi-muted" style={{ marginTop: -4 }}>{paciente.nome}</p>}

      {e?.apagada_em && <div className="psi-aviso" style={{ marginBottom: 12 }}>Apagada em {dataBR(e.apagada_em.slice(0, 10))}. Motivo: {e.apagada_motivo}</div>}

      {editando ? (
        <>
          <div className="psi-grade-2">
            <Campo rotulo="Data"><input className="psi-input" type="date" value={data} onChange={x => setData(x.target.value)} /></Campo>
            <Campo rotulo="Tipo">
              <select className="psi-input" value={tipo} onChange={x => setTipo(x.target.value as TipoEvolucao)}>
                {(Object.keys(ROTULO_EVOLUCAO) as TipoEvolucao[]).map(t => <option key={t} value={t}>{ROTULO_EVOLUCAO[t]}</option>)}
              </select>
            </Campo>
          </div>
          <Campo rotulo="Local"><Chips rolar opcoes={chipsLocais(locais)} valor={localId} mudar={setLocalId} /></Campo>
          <Campo rotulo="Registro" ajuda={e ? 'Ao salvar, o texto anterior fica guardado como versão.' : undefined}>
            <textarea className="psi-input" style={{ minHeight: 260 }} value={texto} onChange={x => setTexto(x.target.value)} autoFocus />
          </Campo>
          <button className="psi-btn psi-btn-principal psi-btn-bloco" onClick={salvar}>Salvar</button>
          {e && <button className="psi-btn psi-btn-suave psi-btn-bloco" style={{ marginTop: 10 }} onClick={() => { setEditando(false); setTexto(e.texto) }}>Cancelar</button>}
        </>
      ) : (
        <>
          <div className="psi-cartao">
            <div className="psi-muted psi-pequeno">{ROTULO_EVOLUCAO[e!.tipo]}{locais.find(l => l.id === e!.local_id) ? ` · ${locais.find(l => l.id === e!.local_id)!.nome}` : ''}{e!.versao > 1 ? ` · versão ${e!.versao}` : ''}</div>
            <div className="psi-tl-texto">{e!.texto}</div>
          </div>
          {!e!.apagada_em && (
            <div className="psi-grade-2" style={{ marginTop: 14 }}>
              <button className="psi-btn psi-btn-principal" onClick={() => setEditando(true)}>Corrigir</button>
              <button className="psi-btn psi-btn-perigo" onClick={() => setApagar(true)}>Apagar</button>
            </div>
          )}
        </>
      )}

      {versoes.length > 0 && (
        <>
          <div className="psi-secao"><h2><History size={17} style={{ verticalAlign: -2 }} /> Versões anteriores</h2><small>{versoes.length}</small></div>
          {versoes.map(v => (
            <div key={v.id} className="psi-cartao" style={{ opacity: .85 }}>
              <div className="psi-muted psi-pequeno">Versão {v.versao} · {dataBR(v.data)} · trocada em {dataBR(v.substituida_em.slice(0, 10))}</div>
              <div className="psi-tl-texto">{v.texto}</div>
            </div>
          ))}
        </>
      )}

      <Folha aberta={apagar} fechar={() => setApagar(false)} titulo="Apagar esta evolução?">
        <p className="psi-muted psi-pequeno" style={{ marginTop: 0 }}>Ela some da linha do tempo, mas fica guardada no histórico com o motivo (o prontuário não pode perder registro).</p>
        <Campo rotulo="Motivo"><input className="psi-input" value={motivo} onChange={x => setMotivo(x.target.value)} placeholder="Ex.: registrada no paciente errado" autoFocus /></Campo>
        <button className="psi-btn psi-btn-perigo psi-btn-bloco" disabled={motivo.trim().length < 3} onClick={confirmarApagar}>Apagar com este motivo</button>
      </Folha>
    </>
  )
}
