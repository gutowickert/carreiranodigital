'use client'
// A AGENDA: abre no DIA (padrão) e troca pra SEMANA com um toque. Cada local é um bloco com a cor dele,
// e dentro do bloco os pacientes marcados. Tocar no paciente leva pro "registrar"; "Marcar paciente"
// abre a marcação já com o local, o dia e o horário do bloco.
import { useMemo } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useBase } from '../App'
import { useAtendimentos } from '../usar'
import { ir, link } from '../rotas'
import { Chips, Topo, Vazio } from '../ui'
import { LinhaAgenda } from './Inicio'
import { montarDia, textoBloco } from '@/lib/psi/agenda'
import { DIAS_CURTOS, dataLonga, hojeBR, inicioSemana, somarDias, diaMes } from '@/lib/psi/datas'

export default function Agenda({ q }: { q: URLSearchParams }) {
  const { locais, blocos, pacientes } = useBase()
  const hoje = hojeBR()
  const data = q.get('d') || hoje
  const visao = q.get('v') === 'semana' ? 'semana' : 'dia'
  const seg = inicioSemana(data)
  const { lista } = useAtendimentos(visao === 'dia' ? data : seg, visao === 'dia' ? data : somarDias(seg, 6))

  const mudar = (d: string, v = visao) => ir(link('/agenda', { d: d === hoje ? null : d, v: v === 'dia' ? null : v }), true)
  const dia = useMemo(() => lista && visao === 'dia' ? montarDia(data, blocos, pacientes, lista, locais) : null, [lista, visao, data, blocos, pacientes, locais])
  const semana = useMemo(() => lista && visao === 'semana' ? Array.from({ length: 7 }, (_, i) => montarDia(somarDias(seg, i), blocos, pacientes, lista, locais)) : null, [lista, visao, seg, blocos, pacientes, locais])

  const passo = visao === 'dia' ? 1 : 7
  const titulo = visao === 'dia' ? (data === hoje ? 'Hoje' : dataLonga(data)) : `Semana de ${diaMes(seg)} a ${diaMes(somarDias(seg, 6))}`

  return (
    <>
      <Topo titulo="Agenda" direita={data !== hoje ? <button className="psi-btn psi-btn-suave psi-btn-pequeno" onClick={() => mudar(hoje)}>Hoje</button> : undefined} />
      <Chips opcoes={[{ valor: 'dia', rotulo: 'Dia' }, { valor: 'semana', rotulo: 'Semana' }]} valor={visao} mudar={v => mudar(data, v)} />
      <div className="psi-mes" style={{ margin: '14px 0 12px' }}>
        <button className="psi-icone-btn" aria-label="Anterior" onClick={() => mudar(somarDias(data, -passo))}><ChevronLeft size={22} /></button>
        <strong style={{ textTransform: 'none', textAlign: 'center', fontSize: 17 }}>{titulo.charAt(0).toUpperCase() + titulo.slice(1)}</strong>
        <button className="psi-icone-btn" aria-label="Próximo" onClick={() => mudar(somarDias(data, passo))}><ChevronRight size={22} /></button>
      </div>

      {!lista && <Vazio>Carregando…</Vazio>}

      {dia && (
        <>
          {dia.blocos.length === 0 && dia.avulsos.length === 0 && <div className="psi-cartao psi-muted">Nada marcado neste dia.</div>}
          {dia.blocos.map(b => (
            <section key={b.bloco.id} className="psi-bloco" style={{ ['--cor' as string]: b.local.cor }}>
              <div className="psi-bloco-topo">
                <span className="psi-ponto" style={{ background: b.local.cor, width: 12, height: 12 }} />
                <strong>{b.local.nome}</strong>
                <small>{textoBloco(b.bloco)}</small>
              </div>
              {b.itens.length === 0 && <div className="psi-muted psi-pequeno" style={{ padding: '10px 16px' }}>Nenhum paciente marcado.</div>}
              {b.itens.map(i => <LinhaAgenda key={i.chave} i={i} />)}
              <button className="psi-marcar" onClick={() => ir(link('/registrar', { modo: 'marcar', data, local: b.local.id, hora: proximaHora(b.bloco.hora_inicio, b.itens.map(i => i.hora)) }))}>
                <Plus size={18} /> Marcar paciente
              </button>
            </section>
          ))}
          {dia.avulsos.length > 0 && (
            <>
              <div className="psi-secao"><h2>Fora da rotina</h2></div>
              <div className="psi-lista">{dia.avulsos.map(i => <LinhaAgenda key={i.chave} i={i} />)}</div>
            </>
          )}
          <button className="psi-btn psi-btn-contorno psi-btn-bloco" style={{ marginTop: 16 }} onClick={() => ir(link('/registrar', { modo: 'marcar', data }))}>
            <Plus size={18} /> Marcar em outro horário
          </button>
        </>
      )}

      {semana && (
        <div className="psi-lista">
          {semana.map(d => {
            const n = Number(d.data.slice(8, 10))
            const pacientesDia = d.todos.length
            return (
              <button key={d.data} className="psi-semana-dia" data-hoje={d.data === hoje ? '1' : '0'} onClick={() => mudar(d.data, 'dia')}>
                <span className="psi-semana-data"><small>{DIAS_CURTOS[new Date(d.data + 'T12:00:00Z').getUTCDay()]}</small><b>{n}</b></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  {d.blocos.length === 0 && pacientesDia === 0 && <span className="psi-muted psi-pequeno">Livre</span>}
                  {d.blocos.map(b => (
                    <span key={b.bloco.id} className="psi-faixinha" style={{ ['--cor' as string]: b.local.cor }}>
                      <b>{b.local.nome}</b><span className="psi-muted">{textoBloco(b.bloco, true)}</span>
                      <span className="psi-espaco" /><span>{b.itens.length}</span>
                    </span>
                  ))}
                  {d.avulsos.length > 0 && <span className="psi-muted psi-pequeno">+ {d.avulsos.length} fora da rotina</span>}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

/** sugere o primeiro horário livre do bloco (de hora em hora a partir do início) */
function proximaHora(inicio: string | null, ocupadas: (string | null)[]) {
  if (!inicio) return null
  let [h, m] = inicio.split(':').map(Number)
  for (let i = 0; i < 12; i++) {
    const s = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    if (!ocupadas.includes(s)) return s
    h += 1
  }
  return inicio
}
