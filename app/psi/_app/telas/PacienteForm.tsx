'use client'
// CADASTRO / EDIÇÃO do paciente e do cabeçalho do prontuário (identificação, demanda, objetivos,
// histórico, procedimentos, encerramento — o conteúdo mínimo da Res. CFP 001/2009).
// Paciente não se apaga: encerra (status "Alta" ou "Encerrado"). O prontuário fica guardado.
import { useEffect, useState } from 'react'
import { useBase } from '../App'
import { ir, voltar } from '../rotas'
import { Campo, Chips, chipsLocais, Topo, useAviso, Vazio } from '../ui'
import type { Paciente, StatusPaciente } from '@/lib/psi/tipos'
import { ROTULO_STATUS } from '@/lib/psi/tipos'
import { DIAS_CURTOS, hojeBR } from '@/lib/psi/datas'

const VAZIO: Partial<Paciente> = { nome: '', status: 'ativo', modalidade: 'presencial', recorrente: false, local_id: null }

export default function PacienteForm({ id }: { id: string | null }) {
  const { repo, locais, recarregar } = useBase()
  const aviso = useAviso()
  const [p, setP] = useState<Partial<Paciente> | null>(id ? null : { ...VAZIO, data_inicio: hojeBR() })
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { if (id) repo.paciente(id).then(x => setP(x || { ...VAZIO })) }, [id, repo])
  if (!p) return <><Topo titulo="Paciente" voltarPara="#/pacientes" /><Vazio>Carregando…</Vazio></>

  const m = <K extends keyof Paciente>(k: K, v: Paciente[K] | null) => setP(x => ({ ...x!, [k]: v === '' ? null : v }))
  const txt = (k: keyof Paciente) => ({ value: (p[k] as string) || '', onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => m(k, e.target.value as never) })

  async function salvar() {
    if (!p?.nome?.trim()) { aviso('Falta o nome.'); return }
    setSalvando(true)
    try {
      const { criado_em: _c, ...dados } = p as Paciente
      if ((dados.status === 'alta' || dados.status === 'encerrado') && !dados.encerramento_em) dados.encerramento_em = hojeBR()
      const r = await repo.salvarPaciente({ ...dados, nome: dados.nome.trim() })
      await recarregar()
      aviso('Salvo.')
      if (id) voltar(`#/paciente/${r.id}`); else ir(`#/paciente/${r.id}`, true)
    } catch (e) { aviso((e as Error).message) }
    setSalvando(false)
  }

  const encerrando = p.status === 'alta' || p.status === 'encerrado'

  return (
    <>
      <Topo titulo={id ? 'Editar paciente' : 'Novo paciente'} voltarPara={id ? `#/paciente/${id}` : '#/pacientes'} />

      <div className="psi-secao" style={{ marginTop: 4 }}><h2>Identificação</h2></div>
      <Campo rotulo="Nome completo"><input className="psi-input" {...txt('nome')} autoFocus={!id} /></Campo>
      <Campo rotulo="Nome social (se houver)"><input className="psi-input" {...txt('nome_social')} /></Campo>
      <div className="psi-grade-2">
        <Campo rotulo="Nascimento"><input className="psi-input" type="date" {...txt('data_nascimento')} /></Campo>
        <Campo rotulo="Início"><input className="psi-input" type="date" {...txt('data_inicio')} /></Campo>
      </div>
      <Campo rotulo="Local"><Chips rolar opcoes={chipsLocais(locais)} valor={p.local_id} mudar={v => m('local_id', v)} /></Campo>
      <div className="psi-grade-2">
        <Campo rotulo="Telefone"><input className="psi-input" type="tel" inputMode="tel" {...txt('telefone')} /></Campo>
        <Campo rotulo="CPF (opcional)"><input className="psi-input" inputMode="numeric" {...txt('cpf')} /></Campo>
      </div>
      <Campo rotulo="E-mail (opcional)"><input className="psi-input" type="email" {...txt('email')} /></Campo>
      <Campo rotulo="Modalidade"><Chips opcoes={[{ valor: 'presencial', rotulo: 'Presencial' }, { valor: 'online', rotulo: 'On-line' }]} valor={p.modalidade} mudar={v => m('modalidade', v as Paciente['modalidade'])} /></Campo>

      <div className="psi-secao"><h2>Responsável</h2><small>menores e APAE</small></div>
      <Campo rotulo="Nome do responsável"><input className="psi-input" {...txt('responsavel_nome')} /></Campo>
      <div className="psi-grade-2">
        <Campo rotulo="Parentesco"><input className="psi-input" {...txt('responsavel_parentesco')} placeholder="mãe, pai, avó…" /></Campo>
        <Campo rotulo="Telefone"><input className="psi-input" type="tel" inputMode="tel" {...txt('responsavel_telefone')} /></Campo>
      </div>

      <div className="psi-secao"><h2>Horário fixo</h2></div>
      <Chips opcoes={[{ valor: 'nao', rotulo: 'Sem horário fixo' }, { valor: 'sim', rotulo: 'Toda semana' }]} valor={p.recorrente ? 'sim' : 'nao'} mudar={v => m('recorrente', v === 'sim')} />
      {p.recorrente && (
        <div style={{ marginTop: 12 }}>
          <Campo rotulo="Dia"><Chips rolar opcoes={[1, 2, 3, 4, 5, 6].map(d => ({ valor: d, rotulo: DIAS_CURTOS[d] }))} valor={p.dia_semana ?? null} mudar={v => m('dia_semana', v)} /></Campo>
          <Campo rotulo="Hora"><input className="psi-input" type="time" {...txt('hora_fixa')} /></Campo>
        </div>
      )}

      <div className="psi-secao"><h2>Prontuário</h2></div>
      <Campo rotulo="Demanda / queixa" ajuda="O que trouxe a pessoa (ou quem encaminhou)."><textarea className="psi-input" {...txt('demanda')} /></Campo>
      <Campo rotulo="Objetivos do trabalho"><textarea className="psi-input" {...txt('objetivos')} /></Campo>
      <Campo rotulo="Histórico"><textarea className="psi-input" {...txt('historico')} /></Campo>
      <Campo rotulo="Procedimentos e técnicas"><textarea className="psi-input" style={{ minHeight: 90 }} {...txt('procedimentos')} /></Campo>
      <Campo rotulo="Observações administrativas" ajuda="Não clínicas: convênio, combinados de pagamento…"><textarea className="psi-input" style={{ minHeight: 80 }} {...txt('observacoes')} /></Campo>

      <div className="psi-secao"><h2>Situação</h2></div>
      <Chips opcoes={(['ativo', 'pausa', 'alta', 'encerrado'] as StatusPaciente[]).map(s => ({ valor: s, rotulo: ROTULO_STATUS[s] }))} valor={p.status} mudar={v => m('status', v)} />
      {encerrando && (
        <div style={{ marginTop: 12 }}>
          <div className="psi-grade-2">
            <Campo rotulo="Data"><input className="psi-input" type="date" {...txt('encerramento_em')} /></Campo>
            <Campo rotulo="Motivo"><input className="psi-input" {...txt('encerramento_motivo')} placeholder="alta, mudança, encaminhamento…" /></Campo>
          </div>
          <Campo rotulo="Registro do encerramento ou encaminhamento"><textarea className="psi-input" {...txt('encerramento_texto')} /></Campo>
        </div>
      )}

      <button className="psi-btn psi-btn-principal psi-btn-bloco" style={{ marginTop: 18 }} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar'}</button>
    </>
  )
}
