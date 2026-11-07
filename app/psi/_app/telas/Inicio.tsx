'use client'
// A TELA INICIAL: onde ela está hoje, os próximos pacientes, o que falta registrar, e o atalho
// grande da planilha da APAE (do dia 25 em diante, com lembrete).
import { useMemo } from 'react'
import { AlertCircle, ChevronRight, FileSpreadsheet, MapPin, Plus } from 'lucide-react'
import { useBase } from '../App'
import { useAgora, useAtendimentos } from '../usar'
import { link } from '../rotas'
import { Logo, Pill, Secao, Vazio } from '../ui'
import { montarDia, semRegistro, textoBloco } from '@/lib/psi/agenda'
import type { ItemAgenda } from '@/lib/psi/agenda'
import { dataLonga, diaMes, hojeBR, mesAtual, MESES, somarDias, dinheiro } from '@/lib/psi/datas'
import { resumoMes } from '@/lib/psi/relatorio'

export default function Inicio() {
  const { perfil, locais, blocos, pacientes } = useBase()
  const hoje = hojeBR()
  const agora = useAgora()
  const mes = mesAtual()
  // 14 dias pra trás (o que ficou sem registro) até hoje; e o mês inteiro pro resumo
  const de = [somarDias(hoje, -14), mes + '-01'].sort()[0]
  const { lista } = useAtendimentos(de, hoje)

  const apae = locais.find(l => /apae/i.test(l.nome) && l.ativo)
  const dia = Number(hoje.slice(8, 10))
  const nomeMesAtual = MESES[Number(mes.slice(5, 7)) - 1]

  const d = useMemo(() => lista ? montarDia(hoje, blocos, pacientes, lista, locais) : null, [lista, hoje, blocos, pacientes, locais])
  const pendentes = useMemo(() => {
    if (!lista) return []
    const datas = Array.from({ length: 15 }, (_, i) => somarDias(hoje, -14 + i))
    return semRegistro(datas, hoje, agora, blocos, pacientes, lista, locais).reverse()
  }, [lista, hoje, agora, blocos, pacientes, locais])
  const proximos = d ? d.todos.filter(i => (!i.atendimento || i.atendimento.presenca === 'agendado') && (i.hora || '99') > agora) : []
  const resumo = lista ? resumoMes(mes, locais, lista) : []
  const tot = resumo.reduce((s, r) => ({ r: s.r + r.realizados, f: s.f + r.faltas, v: s.v + r.aReceber }), { r: 0, f: 0, v: 0 })
  const primeiroNome = (perfil.nome || '').split(' ')[0]

  return (
    <>
      <header className="psi-topo" style={{ alignItems: 'center' }}>
        <Logo tamanho={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 22 }}>{primeiroNome ? `Olá, ${primeiroNome}` : 'Olá'}</h1>
          <div className="psi-muted psi-pequeno">{dataLonga(hoje).charAt(0).toUpperCase() + dataLonga(hoje).slice(1)}</div>
        </div>
      </header>

      {dia >= 25 && apae && (
        <div className="psi-aviso" style={{ marginBottom: 12 }}>
          <AlertCircle size={20} style={{ flex: 'none' }} />
          <span><b>Hora de gerar a planilha da APAE.</b> O mês está acabando: confira se todos os atendimentos estão registrados.</span>
        </div>
      )}

      {apae && (
        <a className="psi-atalho" href={link('/relatorios', { local: apae.id, mes })}>
          <span className="psi-atalho-ic"><FileSpreadsheet size={26} /></span>
          <span style={{ flex: 1 }}><strong>Planilha da APAE — {nomeMesAtual}</strong><span>Nomes, datas e quantidade. PDF ou planilha, pronta pra mandar.</span></span>
          <ChevronRight size={22} />
        </a>
      )}

      <a className="psi-atalho psi-atalho-claro" href="#/registrar" style={{ marginTop: 12 }}>
        <span className="psi-atalho-ic"><Plus size={26} /></span>
        <span style={{ flex: 1 }}><strong>Registrar atendimento</strong><span>Paciente, presença e evolução numa tela só.</span></span>
        <ChevronRight size={22} />
      </a>

      <Secao titulo="Onde estou hoje" />
      {d && d.blocos.length === 0 && <div className="psi-cartao psi-muted">Hoje não tem horário fixo na rotina.</div>}
      {d && d.blocos.map(b => (
        <div key={b.bloco.id} className="psi-faixinha" style={{ ['--cor' as string]: b.local.cor, padding: '10px 12px', fontSize: 15 }}>
          <MapPin size={17} color={b.local.cor} />
          <b>{b.local.nome}</b>
          <span className="psi-muted">· {textoBloco(b.bloco, true)}</span>
          <span className="psi-espaco" />
          <span className="psi-muted psi-pequeno">{b.itens.length} paciente{b.itens.length === 1 ? '' : 's'}</span>
        </div>
      ))}

      <Secao titulo="Próximos de hoje" extra={<a className="psi-pequeno" href="#/agenda">Ver agenda</a>} />
      {!d ? <Vazio>Carregando…</Vazio> : proximos.length === 0
        ? <div className="psi-cartao psi-muted">Ninguém mais marcado pra hoje.</div>
        : <div className="psi-lista">{proximos.map(i => <LinhaAgenda key={i.chave} i={i} />)}</div>}

      {pendentes.length > 0 && (
        <>
          <Secao titulo="Falta registrar" extra={<small>{pendentes.length}</small>} />
          <div className="psi-lista">{pendentes.slice(0, 12).map(i => <LinhaAgenda key={i.chave} i={i} mostrarData pendente />)}</div>
        </>
      )}

      <Secao titulo={`Resumo de ${nomeMesAtual}`} extra={<a className="psi-pequeno" href={link('/relatorios', { aba: 'resumo' })}>Detalhes</a>} />
      <div className="psi-numeros">
        <div className="psi-numero"><b>{tot.r}</b><small>realizados</small></div>
        <div className="psi-numero"><b>{tot.f}</b><small>faltas</small></div>
        <div className="psi-numero"><b style={{ fontSize: tot.v >= 10000 ? 18 : 21 }}>{dinheiro(tot.v)}</b><small>a receber</small></div>
      </div>
    </>
  )
}

export function LinhaAgenda({ i, mostrarData, pendente }: { i: ItemAgenda; mostrarData?: boolean; pendente?: boolean }) {
  const href = i.atendimento
    ? link('/registrar', { at: i.atendimento.id })
    : link('/registrar', { pac: i.paciente.id, data: i.data, hora: i.hora, local: i.local?.id })
  const p = pendente ? 'pendente' : i.atendimento ? i.atendimento.presenca : 'previsto'
  return (
    <a className="psi-item" href={href}>
      <span className="psi-hora">{i.hora || '—'}</span>
      <span className="psi-item-txt">
        <strong>{i.paciente.nome}</strong>
        <small>{mostrarData ? `${diaMes(i.data)} · ` : ''}{i.local?.nome || 'sem local'}</small>
      </span>
      <Pill p={p} />
    </a>
  )
}
