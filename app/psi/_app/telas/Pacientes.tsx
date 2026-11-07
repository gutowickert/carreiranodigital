'use client'
// PACIENTES: busca instantânea pelo nome (sem acento, sem maiúscula), filtro por local com um toque.
import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useBase } from '../App'
import { Busca, Chips, Topo, Vazio, iniciais } from '../ui'
import { DIAS_CURTOS, hora5, normalizar } from '@/lib/psi/datas'
import { ROTULO_STATUS } from '@/lib/psi/tipos'

export default function Pacientes() {
  const { pacientes, locais } = useBase()
  const [busca, setBusca] = useState('')
  const [local, setLocal] = useState<string>('todos')
  const [mostrar, setMostrar] = useState<'ativos' | 'todos'>('ativos')

  const lista = useMemo(() => {
    const t = normalizar(busca)
    return pacientes.filter(p =>
      (!t || normalizar(p.nome + ' ' + (p.nome_social || '') + ' ' + (p.responsavel_nome || '')).includes(t)) &&
      (local === 'todos' || p.local_id === local) &&
      (mostrar === 'todos' || t || p.status === 'ativo' || p.status === 'pausa'))
  }, [pacientes, busca, local, mostrar])

  return (
    <>
      <Topo titulo="Pacientes" direita={<a className="psi-btn psi-btn-principal psi-btn-pequeno" href="#/paciente/novo"><Plus size={18} />Novo</a>} />
      <Busca valor={busca} mudar={setBusca} placeholder="Buscar pelo nome" />
      <div style={{ height: 10 }} />
      <Chips rolar valor={local} mudar={setLocal} opcoes={[{ valor: 'todos', rotulo: 'Todos' }, ...locais.filter(l => l.ativo).map(l => ({ valor: l.id, rotulo: l.nome, cor: l.cor }))]} />
      <div className="psi-linha" style={{ margin: '6px 0 10px', justifyContent: 'space-between' }}>
        <small className="psi-muted">{lista.length} paciente{lista.length === 1 ? '' : 's'}</small>
        <button className="psi-btn psi-btn-suave psi-btn-pequeno" style={{ minHeight: 34 }} onClick={() => setMostrar(mostrar === 'ativos' ? 'todos' : 'ativos')}>
          {mostrar === 'ativos' ? 'Mostrar encerrados também' : 'Só em atendimento'}
        </button>
      </div>
      {lista.length === 0 ? <Vazio>Ninguém encontrado.</Vazio> : (
        <div className="psi-lista">
          {lista.map(p => {
            const l = locais.find(x => x.id === p.local_id)
            const fixo = p.recorrente && p.dia_semana !== null && p.dia_semana !== undefined ? `${DIAS_CURTOS[p.dia_semana]}${p.hora_fixa ? ' ' + hora5(p.hora_fixa) : ''}` : ''
            return (
              <a key={p.id} className="psi-item" href={`#/paciente/${p.id}`}>
                <span className="psi-avatar" style={{ background: l?.cor || 'var(--cafe)', opacity: p.status === 'ativo' ? 1 : .55 }}>{iniciais(p.nome)}</span>
                <span className="psi-item-txt">
                  <strong>{p.nome}</strong>
                  <small>{[l?.nome || 'sem local', fixo, p.status !== 'ativo' ? ROTULO_STATUS[p.status] : ''].filter(Boolean).join(' · ')}</small>
                </span>
              </a>
            )
          })}
        </div>
      )}
    </>
  )
}
