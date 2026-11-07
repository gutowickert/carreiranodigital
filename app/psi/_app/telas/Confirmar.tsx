'use client'
// CONFIRMAR AMANHÃ: os pacientes do próximo dia (numa sexta, até segunda) dos locais POR ATENDIMENTO,
// incluindo os de horário fixo que aparecem sozinhos na agenda. Cada linha tem o WhatsApp (abre o
// WhatsApp DELA com a mensagem pronta; o sistema não manda nada sozinho), o ligar e os botões
// Confirmado / Desmarcou. As regras e o texto da mensagem: lib/psi/confirmar.ts.
import { useMemo, useState } from 'react'
import { Check, MessageCircle, Phone, Undo2, X } from 'lucide-react'
import { useBase } from '../App'
import { useAtendimentos } from '../usar'
import { Secao, Topo, useAviso, Vazio } from '../ui'
import type { ItemAgenda } from '@/lib/psi/agenda'
import type { Confirmacao } from '@/lib/psi/tipos'
import { DIAS, diaMes, hojeBR, somarDias } from '@/lib/psi/datas'
import { diasAConfirmar, falaComResponsavel, linkWhats, ROTULO_CONFIRMACAO, situacao, telefoneDe } from '@/lib/psi/confirmar'
import { valorPadrao } from '@/lib/psi/financeiro'

export const tituloDia = (data: string, hoje: string) => {
  const d = `${DIAS[new Date(data + 'T12:00:00Z').getUTCDay()]}, ${diaMes(data)}`
  return data === somarDias(hoje, 1) ? `Amanhã, ${d}` : d.charAt(0).toUpperCase() + d.slice(1)
}

export default function Confirmar() {
  const { repo, blocos, pacientes, locais } = useBase()
  const aviso = useAviso()
  const hoje = hojeBR()
  const { lista, recarregar } = useAtendimentos(somarDias(hoje, 1), somarDias(hoje, 7))
  const [mexendo, setMexendo] = useState('')
  const dias = useMemo(() => lista ? diasAConfirmar(hoje, blocos, pacientes, lista, locais) : null, [lista, hoje, blocos, pacientes, locais])
  const temSessao = locais.some(l => l.ativo && l.modelo === 'sessao')

  async function marcar(i: ItemAgenda, c: Confirmacao) {
    setMexendo(i.chave)
    try {
      const presenca = c === 'desmarcou' ? 'desmarcou' as const : 'agendado' as const
      const conf = { confirmacao: c, confirmado_em: c === 'a_confirmar' ? null : new Date().toISOString() }
      // horário fixo ainda sem atendimento gravado: grava agora (igual a registrar pela agenda)
      const salvo = i.atendimento
        ? await repo.salvarAtendimento({ id: i.atendimento.id, paciente_id: i.paciente.id, data: i.data, presenca, ...conf })
        : await repo.salvarAtendimento({ paciente_id: i.paciente.id, data: i.data, hora: i.hora || null, local_id: i.local?.id || null, presenca,
            modalidade: i.paciente.modalidade || 'presencial', valor: valorPadrao(i.paciente, i.local), duracao_min: 50, pago: false, ...conf })
      await recarregar()
      if (!('confirmacao' in salvo) && c === 'confirmado') aviso('A confirmação ainda não foi instalada no banco (falta o db/psi-financeiro.sql).')
      else aviso(c === 'confirmado' ? `${i.paciente.nome.split(' ')[0]} confirmado.` : c === 'desmarcou' ? 'Marcado como desmarcou. O horário fica livre.' : 'Voltou pro a confirmar.')
    } catch (e) { aviso((e as Error).message) }
    setMexendo('')
  }

  return (
    <>
      <Topo titulo="Confirmar amanhã" voltarPara="#/" />
      <p className="psi-muted psi-pequeno" style={{ marginTop: -4 }}>Só os locais por atendimento. O sistema não manda nada sozinho: o botão abre o seu WhatsApp com a mensagem pronta.</p>
      {!temSessao ? <Vazio>Nenhum local por atendimento. Escolha o modelo em Mais &gt; Locais e valores.</Vazio>
        : !dias ? <Vazio>Carregando…</Vazio>
        : dias.length === 0 ? <Vazio>Ninguém pra confirmar nos próximos dias.</Vazio>
        : dias.map(d => {
          const conf = d.itens.filter(i => situacao(i) === 'confirmado').length
          return (
            <div key={d.data}>
              <Secao titulo={tituloDia(d.data, hoje)} extra={<small>{conf} de {d.itens.length} confirmado{d.itens.length === 1 ? '' : 's'}</small>} />
              <div className="psi-lista">
                {d.itens.map(i => <Linha key={i.chave} i={i} hoje={hoje} ocupado={mexendo === i.chave} marcar={marcar} />)}
              </div>
            </div>
          )
        })}
    </>
  )
}

function Linha({ i, hoje, ocupado, marcar }: { i: ItemAgenda; hoje: string; ocupado: boolean; marcar: (i: ItemAgenda, c: Confirmacao) => void }) {
  const s = situacao(i)
  const tel = telefoneDe(i.paciente)
  const whats = linkWhats(i, hoje)
  const resp = falaComResponsavel(i.paciente)
  return (
    <div className="psi-conf" style={{ opacity: s === 'desmarcou' ? .65 : 1 }}>
      <div className="psi-conf-topo">
        <span className="psi-hora">{i.hora || '—'}</span>
        <span className="psi-item-txt">
          <strong>{i.paciente.nome}</strong>
          <small><span className="psi-ponto" style={{ background: i.local?.cor, marginRight: 5 }} />{i.local?.nome}
            {tel ? ` · ${tel}` : ' · sem telefone'}{resp ? ` (${i.paciente.responsavel_nome ? i.paciente.responsavel_nome.split(' ')[0] : 'responsável'})` : ''}</small>
        </span>
        <span className="psi-pill" data-p={s}>{ROTULO_CONFIRMACAO[s]}</span>
      </div>
      <div className="psi-conf-acoes">
        {whats ? <a className="psi-btn psi-btn-contorno" href={whats} target="_blank" rel="noopener noreferrer"><MessageCircle size={17} />WhatsApp</a>
          : <a className="psi-btn psi-btn-contorno" href={`#/paciente/${i.paciente.id}/editar`}>Pôr telefone</a>}
        {tel ? <a className="psi-btn psi-btn-contorno" href={`tel:${tel.replace(/[^\d+]/g, '')}`}><Phone size={17} />Ligar</a> : <span />}
        {s === 'a_confirmar' ? (
          <>
            <button className="psi-btn psi-btn-suave" disabled={ocupado} onClick={() => marcar(i, 'confirmado')}><Check size={17} />Confirmado</button>
            <button className="psi-btn psi-btn-perigo" disabled={ocupado} onClick={() => marcar(i, 'desmarcou')}><X size={17} />Desmarcou</button>
          </>
        ) : (
          <button className="psi-btn psi-btn-suave" style={{ gridColumn: '1 / -1' }} disabled={ocupado} onClick={() => marcar(i, 'a_confirmar')}><Undo2 size={17} />Desfazer</button>
        )}
      </div>
    </div>
  )
}
