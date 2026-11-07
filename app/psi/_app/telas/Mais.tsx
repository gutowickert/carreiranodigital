'use client'
// MAIS: financeiro, confirmar amanhã, meus dados (nome, CRP — vão nos documentos), locais e valores, rotina da semana, histórico de
// acessos (auditoria), o que vem depois (WhatsApp/Maia, desligado) e sair.
import { useEffect, useState } from 'react'
import { BellOff, CalendarClock, ChevronRight, History, LogOut, MapPin, Phone, Plus, Trash2, UserRound, Wallet } from 'lucide-react'
import { useBase } from '../App'
import { ir, voltar } from '../rotas'
import { useDespesas } from '../usar'
import { Campo, Chips, Topo, useAviso, Vazio } from '../ui'
import type { Bloco, EventoAuditoria, Local, ModeloLocal, Perfil, TipoLocal } from '@/lib/psi/tipos'
import { ROTULO_TIPO_LOCAL } from '@/lib/psi/tipos'
import { DIAS, DIAS_CURTOS, dataBR, dinheiro, mesAtual, mesSomar } from '@/lib/psi/datas'
import { despesaNoMes, ehSalario, lerValor, valorCampo } from '@/lib/psi/financeiro'
import { textoBloco } from '@/lib/psi/agenda'
import { desligarModoExemplo } from '@/lib/psi/repo'

// tons da família nude, bem distinguíveis entre si (um por local)
export const CORES_LOCAIS = ['#b07a5e', '#c08f8b', '#8c9877', '#6f8796', '#a27b5c', '#c9a68a', '#8e6f86', '#7a8a8c']

export function Mais() {
  const { repo } = useBase()
  const itens: [string, React.ReactNode, string, string][] = [
    ['#/financeiro', <Wallet key="f" size={21} />, 'Financeiro', 'Entradas, saídas e o que sobra no mês'],
    ['#/confirmar', <Phone key="c" size={21} />, 'Confirmar amanhã', 'WhatsApp pronto pros pacientes de amanhã'],
    ['#/meus-dados', <UserRound key="1" size={21} />, 'Meus dados', 'Nome e CRP que vão nos documentos'],
    ['#/locais', <MapPin key="2" size={21} />, 'Locais e valores', 'Salário fixo ou por atendimento, repasse, imposto, aluguel'],
    ['#/rotina', <CalendarClock key="3" size={21} />, 'Rotina da semana', 'Os dias e horários fixos de cada local'],
    ['#/acessos', <History key="4" size={21} />, 'Histórico de acessos', 'Quem abriu ou alterou prontuário, e quando'],
    ['#/futuro', <BellOff key="5" size={21} />, 'Lembretes por WhatsApp', 'Desligado (vem depois)'],
  ]
  async function sair() {
    if (repo.modo === 'exemplo') { desligarModoExemplo(); window.location.href = '/psi'; return }
    await repo.sair(); window.location.href = '/psi'
  }
  return (
    <>
      <Topo titulo="Mais" logo />
      <div className="psi-lista">
        {itens.map(([href, ic, t, s]) => (
          <a key={href} className="psi-item" href={href}>
            <span style={{ color: 'var(--cafe)' }}>{ic}</span>
            <span className="psi-item-txt"><strong>{t}</strong><small>{s}</small></span>
            <ChevronRight size={19} color="var(--suave)" />
          </a>
        ))}
      </div>
      <button className="psi-btn psi-btn-contorno psi-btn-bloco" style={{ marginTop: 18 }} onClick={sair}><LogOut size={18} />{repo.modo === 'exemplo' ? 'Sair do modo de teste' : 'Sair'}</button>
    </>
  )
}

export function MeusDados() {
  const { repo, perfil, recarregar } = useBase()
  const aviso = useAviso()
  const [p, setP] = useState<Perfil>(perfil)
  const c = (k: keyof Perfil) => ({ value: (p[k] as string) || '', onChange: (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: e.target.value }) })
  async function salvar() {
    try { await repo.salvarPerfil(p); await recarregar(); aviso('Salvo.'); voltar('#/mais') } catch (e) { aviso((e as Error).message) }
  }
  return (
    <>
      <Topo titulo="Meus dados" voltarPara="#/mais" />
      <p className="psi-muted psi-pequeno" style={{ marginTop: -4 }}>Aparecem no cabeçalho e na assinatura dos documentos e relatórios.</p>
      <Campo rotulo="Nome completo"><input className="psi-input" {...c('nome')} /></Campo>
      <Campo rotulo="CRP" ajuda="Ex.: 07/12345"><input className="psi-input" {...c('crp')} /></Campo>
      <Campo rotulo="Cidade (vai no “local e data”)"><input className="psi-input" {...c('cidade')} placeholder="Lajeado/RS" /></Campo>
      <Campo rotulo="Telefone"><input className="psi-input" type="tel" {...c('telefone')} /></Campo>
      <Campo rotulo="E-mail profissional"><input className="psi-input" type="email" {...c('email')} /></Campo>
      <button className="psi-btn psi-btn-principal psi-btn-bloco" onClick={salvar}>Salvar</button>
    </>
  )
}

export function Locais() {
  const { locais } = useBase()
  const resumo = (l: Local) => ehSalario(l)
    ? ['Salário fixo', l.salario_mensal ? dinheiro(l.salario_mensal) + '/mês' : 'sem valor', l.imposto_pct ? `imposto ${pct(l.imposto_pct)}` : '']
    : [l.valor_sessao ? `${dinheiro(l.valor_sessao)}/sessão` : 'sem valor', l.repasse_pct ? `repasse ${pct(l.repasse_pct)}` : '', l.imposto_pct ? `imposto ${pct(l.imposto_pct)}` : '']
  return (
    <>
      <Topo titulo="Locais e valores" voltarPara="#/mais" direita={<a className="psi-btn psi-btn-principal psi-btn-pequeno" href="#/local/novo"><Plus size={17} />Novo</a>} />
      <div className="psi-lista">
        {locais.map(l => (
          <a key={l.id} className="psi-item" href={`#/local/${l.id}`} style={{ opacity: l.ativo ? 1 : .55 }}>
            <span className="psi-ponto" style={{ background: l.cor, width: 16, height: 16 }} />
            <span className="psi-item-txt">
              <strong>{l.nome}</strong>
              <small>{[...resumo(l), l.cidade, l.ativo ? '' : 'desativado'].filter(Boolean).join(' · ')}</small>
            </span>
            <ChevronRight size={19} color="var(--suave)" />
          </a>
        ))}
      </div>
      <p className="psi-muted psi-pequeno" style={{ marginTop: 12 }}>Os valores entram no <a href="#/financeiro">Financeiro</a>: salário fixo conta o mês inteiro; por atendimento conta cada sessão realizada.</p>
    </>
  )
}

const pct = (v?: number | null) => `${String(v ?? 0).replace('.', ',')}%`
const num = (s: string) => lerValor(s)

export function LocalForm({ id }: { id: string | null }) {
  const { repo, locais, recarregar } = useBase()
  const aviso = useAviso()
  const desp = useDespesas()
  const existente = locais.find(l => l.id === id)
  const [l, setL] = useState<Partial<Local>>(existente || { nome: '', tipo: 'clinica', modelo: 'sessao', cor: CORES_LOCAIS.find(c => !locais.some(x => x.cor === c)) || CORES_LOCAIS[0], ativo: true, cobra_falta: false, ordem: locais.length + 1 })
  // os números ficam como texto enquanto ela digita (vírgula, campo vazio)
  const [t, setT] = useState({ valor: valorCampo(existente?.valor_sessao), salario: valorCampo(existente?.salario_mensal), repasse: valorCampo(existente?.repasse_pct), imposto: valorCampo(existente?.imposto_pct) })
  const mes = mesAtual()
  // o aluguel / custo fixo do local é uma despesa recorrente ligada a ele (psi_despesas)
  const fixa = (id && desp.lista?.find(d => d.local_id === id && d.recorrente && despesaNoMes(d, mes))) || null
  const [aluguel, setAluguel] = useState<string | null>(null)
  if (aluguel === null && desp.lista) setAluguel(valorCampo(fixa?.valor))
  const salario = l.modelo === 'salario'

  async function salvarAluguel(localId: string) {
    if (desp.pendente || aluguel === null) return
    const v = num(aluguel) || 0
    const anterior = mesSomar(mes, -1)
    if (fixa) {
      if (v === fixa.valor) return
      const deste = !fixa.desde || fixa.desde >= mes
      // mudou ou tirou: o que já passou fica com o valor antigo
      if (deste && v) await repo.salvarDespesa({ id: fixa.id, nome: fixa.nome, valor: v })
      else if (deste) await repo.apagarDespesa(fixa.id)
      else await repo.salvarDespesa({ id: fixa.id, nome: fixa.nome, valor: fixa.valor, ate: anterior })
      if (v && !deste) await repo.salvarDespesa({ nome: fixa.nome, valor: v, local_id: localId, recorrente: true, desde: mes, ativo: true })
    } else if (v) {
      await repo.salvarDespesa({ nome: 'Aluguel da sala', valor: v, local_id: localId, recorrente: true, desde: mes, ativo: true })
    }
  }

  async function salvar() {
    if (!l.nome?.trim()) { aviso('Falta o nome.'); return }
    try {
      const r = await repo.salvarLocal({
        ...l, nome: l.nome.trim(), modelo: salario ? 'salario' : 'sessao',
        valor_sessao: salario ? null : num(t.valor), salario_mensal: salario ? num(t.salario) : null,
        repasse_pct: salario ? null : num(t.repasse), imposto_pct: num(t.imposto),
      } as Local)
      await salvarAluguel(r.id)
      await recarregar(); aviso('Salvo.'); voltar('#/locais')
    } catch (e) { aviso((e as Error).message) }
  }
  async function apagar() {
    if (!existente || !confirm(`Apagar o local ${existente.nome}?`)) return
    try { await repo.apagarLocal(existente.id); await recarregar(); aviso('Local apagado.'); ir('#/locais', true) } catch (e) { aviso((e as Error).message) }
  }
  const campoNum = (k: keyof typeof t, ph: string) => (
    <input className="psi-input" inputMode="decimal" value={t[k]} onChange={e => setT({ ...t, [k]: e.target.value })} placeholder={ph} />
  )
  return (
    <>
      <Topo titulo={existente ? existente.nome : 'Novo local'} voltarPara="#/locais"
        direita={existente ? <button className="psi-icone-btn" aria-label="Apagar" onClick={apagar}><Trash2 size={18} /></button> : undefined} />
      <Campo rotulo="Nome"><input className="psi-input" value={l.nome || ''} onChange={e => setL({ ...l, nome: e.target.value })} /></Campo>
      <Campo rotulo="Tipo"><Chips rolar opcoes={(Object.keys(ROTULO_TIPO_LOCAL) as TipoLocal[]).map(t => ({ valor: t, rotulo: ROTULO_TIPO_LOCAL[t] }))} valor={l.tipo} mudar={v => setL({ ...l, tipo: v })} /></Campo>
      <Campo rotulo="Cidade"><input className="psi-input" value={l.cidade || ''} onChange={e => setL({ ...l, cidade: e.target.value })} /></Campo>

      <div className="psi-secao"><h2>Como paga</h2></div>
      <Chips opcoes={[{ valor: 'sessao', rotulo: 'Por atendimento' }, { valor: 'salario', rotulo: 'Salário fixo' }]} valor={salario ? 'salario' : 'sessao'} mudar={v => setL({ ...l, modelo: v as ModeloLocal })} />
      <p className="psi-muted psi-pequeno" style={{ margin: '8px 0 14px' }}>{salario
        ? 'Entra o salário do mês inteiro, não importa quantos atendimentos. Os atendimentos continuam contando na planilha.'
        : 'Entra cada atendimento realizado. O valor do paciente (se tiver) vale mais que o do local.'}</p>
      {salario ? (
        <div className="psi-grade-2">
          <Campo rotulo="Salário por mês (R$)">{campoNum('salario', '0,00')}</Campo>
          <Campo rotulo="Imposto (%)" ajuda="Sobre o salário">{campoNum('imposto', 'opcional')}</Campo>
        </div>
      ) : (
        <>
          <div className="psi-grade-2">
            <Campo rotulo="Valor por sessão (R$)">{campoNum('valor', 'opcional')}</Campo>
            <Campo rotulo="Falta é cobrada?"><Chips opcoes={[{ valor: 'nao', rotulo: 'Não' }, { valor: 'sim', rotulo: 'Sim' }]} valor={l.cobra_falta ? 'sim' : 'nao'} mudar={v => setL({ ...l, cobra_falta: v === 'sim' })} /></Campo>
          </div>
          <div className="psi-grade-2">
            <Campo rotulo="Repasse pro local (%)" ajuda="O que fica pro local de cada atendimento">{campoNum('repasse', 'opcional')}</Campo>
            <Campo rotulo="Imposto (%)" ajuda="Sobre o que entra daqui">{campoNum('imposto', 'opcional')}</Campo>
          </div>
        </>
      )}
      {desp.pendente ? (
        <p className="psi-muted psi-pequeno" style={{ marginTop: 0 }}>Aluguel e custos fixos: o financeiro ainda não foi instalado no banco.</p>
      ) : (
        <Campo rotulo="Aluguel ou custo fixo por mês (R$)" ajuda="Entra nas saídas do Financeiro todo mês. Mudar o valor vale a partir deste mês; o que já passou não muda.">
          <input className="psi-input" inputMode="decimal" value={aluguel ?? ''} disabled={aluguel === null} onChange={e => setAluguel(e.target.value)} placeholder="sem custo fixo" />
        </Campo>
      )}
      <Campo rotulo="Forma de pagamento (opcional)"><input className="psi-input" value={l.forma_pagamento || ''} onChange={e => setL({ ...l, forma_pagamento: e.target.value })} placeholder="Ex.: repasse mensal, pix na sessão" /></Campo>

      <div className="psi-secao"><h2>Na agenda</h2></div>
      <Campo rotulo="Cor na agenda">
        <div className="psi-chips">
          {CORES_LOCAIS.map(c => <button key={c} type="button" aria-label={c} aria-pressed={l.cor === c} onClick={() => setL({ ...l, cor: c })}
            style={{ width: 44, height: 44, borderRadius: '50%', background: c, border: l.cor === c ? '3px solid var(--cacau)' : '3px solid #fff', boxShadow: '0 0 0 1px var(--areia)' }} />)}
        </div>
      </Campo>
      <Campo rotulo="Situação"><Chips opcoes={[{ valor: 'sim', rotulo: 'Ativo' }, { valor: 'nao', rotulo: 'Desativado' }]} valor={l.ativo ? 'sim' : 'nao'} mudar={v => setL({ ...l, ativo: v === 'sim' })} /></Campo>
      <button className="psi-btn psi-btn-principal psi-btn-bloco" onClick={salvar}>Salvar</button>
    </>
  )
}

export function Rotina() {
  const { repo, locais, blocos, recarregar } = useBase()
  const aviso = useAviso()
  const [editar, setEditar] = useState<Partial<Bloco> | null>(null)
  async function salvar() {
    if (!editar?.local_id || editar.dia_semana === undefined || editar.dia_semana === null) { aviso('Escolha o local e o dia.'); return }
    await repo.salvarBloco({ ...editar, local_id: editar.local_id, dia_semana: editar.dia_semana, hora_inicio: editar.hora_inicio || null, hora_fim: editar.hora_fim || null, ativo: true })
    await recarregar(); setEditar(null); aviso('Rotina salva.')
  }
  async function apagar(b: Bloco) {
    if (!confirm('Tirar este horário da rotina?')) return
    await repo.apagarBloco(b.id); await recarregar(); setEditar(null)
  }
  return (
    <>
      <Topo titulo="Rotina da semana" voltarPara="#/mais" direita={<button className="psi-btn psi-btn-principal psi-btn-pequeno" onClick={() => setEditar({ dia_semana: 1 })}><Plus size={17} />Novo</button>} />
      <p className="psi-muted psi-pequeno" style={{ marginTop: -4 }}>Sem horário = o dia é daquele local, e cada paciente tem o seu horário (como SESM e Conecta).</p>
      {editar && (
        <div className="psi-cartao" style={{ marginBottom: 14 }}>
          <Campo rotulo="Local"><Chips rolar opcoes={locais.filter(l => l.ativo).map(l => ({ valor: l.id, rotulo: l.nome, cor: l.cor }))} valor={editar.local_id} mudar={v => setEditar({ ...editar, local_id: v })} /></Campo>
          <Campo rotulo="Dia"><Chips rolar opcoes={[1, 2, 3, 4, 5, 6, 0].map(d => ({ valor: d, rotulo: DIAS_CURTOS[d] }))} valor={editar.dia_semana} mudar={v => setEditar({ ...editar, dia_semana: v })} /></Campo>
          <div className="psi-grade-2">
            <Campo rotulo="Das (opcional)"><input className="psi-input" type="time" value={editar.hora_inicio || ''} onChange={e => setEditar({ ...editar, hora_inicio: e.target.value })} /></Campo>
            <Campo rotulo="Às (opcional)"><input className="psi-input" type="time" value={editar.hora_fim || ''} onChange={e => setEditar({ ...editar, hora_fim: e.target.value })} /></Campo>
          </div>
          <div className="psi-grade-2">
            <button className="psi-btn psi-btn-suave" onClick={() => setEditar(null)}>Cancelar</button>
            <button className="psi-btn psi-btn-principal" onClick={salvar}>Salvar</button>
          </div>
          {editar.id && <button className="psi-btn psi-btn-perigo psi-btn-bloco" style={{ marginTop: 10 }} onClick={() => apagar(editar as Bloco)}>Tirar da rotina</button>}
        </div>
      )}
      {blocos.length === 0 ? <Vazio>Nenhum horário fixo.</Vazio> : (
        <div className="psi-lista">
          {[1, 2, 3, 4, 5, 6, 0].flatMap(d => blocos.filter(b => b.dia_semana === d)).map(b => {
            const l = locais.find(x => x.id === b.local_id)
            return (
              <button key={b.id} className="psi-item" onClick={() => setEditar(b)}>
                <span className="psi-ponto" style={{ background: l?.cor, width: 14, height: 14 }} />
                <span className="psi-item-txt"><strong style={{ textTransform: 'capitalize' }}>{DIAS[b.dia_semana]} · {l?.nome}</strong><small>{textoBloco(b)}</small></span>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

const ROTULO_ACAO: Record<string, string> = { criar: 'Criou', alterar: 'Alterou', apagar: 'Apagou', ver: 'Abriu o prontuário', exportar: 'Exportou relatório', documento: 'Gerou documento', entrar: 'Entrou no sistema', compartilhar: 'Compartilhou documento' }
const ROTULO_TABELA: Record<string, string> = { psi_pacientes: 'paciente', psi_evolucoes: 'evolução', psi_atendimentos: 'atendimento', psi_anexos: 'arquivo', psi_documentos: 'documento', psi_consentimentos: 'consentimento', psi_locais: 'local', psi_blocos: 'rotina', psi_despesas: 'despesa' }

export function Auditoria() {
  const { repo, pacientes } = useBase()
  const [ev, setEv] = useState<EventoAuditoria[] | null>(null)
  useEffect(() => { repo.auditoria(200).then(setEv).catch(() => setEv([])) }, [repo])
  return (
    <>
      <Topo titulo="Histórico de acessos" voltarPara="#/mais" />
      <p className="psi-muted psi-pequeno" style={{ marginTop: -4 }}>Cada vez que um prontuário é aberto, criado ou alterado fica anotado aqui (sem o conteúdo). Não dá pra apagar.</p>
      {!ev ? <Vazio>Carregando…</Vazio> : ev.length === 0 ? <Vazio>Nada ainda.</Vazio> : (
        <div className="psi-lista">
          {ev.map(e => {
            const pac = pacientes.find(p => p.id === e.paciente_id)
            const quando = new Date(e.quando)
            return (
              <div key={String(e.id)} className="psi-item" style={{ cursor: 'default' }}>
                <span className="psi-item-txt">
                  <strong style={{ whiteSpace: 'normal' }}>{ROTULO_ACAO[e.acao] || e.acao}{e.tabela && !['ver', 'documento', 'compartilhar'].includes(e.acao) ? ` ${ROTULO_TABELA[e.tabela] || ''}` : ''}{pac ? ` · ${pac.nome}` : ''}</strong>
                  <small>{dataBR(quando.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }))} às {quando.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}{e.campos?.length ? ` · campos: ${e.campos.join(', ')}` : ''}</small>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

export function Futuro() {
  return (
    <>
      <Topo titulo="Lembretes por WhatsApp" voltarPara="#/mais" />
      <div className="psi-cartao">
        <div className="psi-linha" style={{ marginBottom: 8 }}><BellOff size={20} color="var(--cafe)" /><b>Desligado por enquanto</b></div>
        <p style={{ margin: 0 }}>O sistema já está preparado para, no futuro:</p>
        <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
          <li>mandar lembrete da sessão por WhatsApp na véspera;</li>
          <li>o paciente confirmar ou desmarcar respondendo a mensagem;</li>
          <li>a Maia (atendente virtual) cuidar de marcar e remarcar.</li>
        </ul>
        <p className="psi-muted psi-pequeno" style={{ marginBottom: 0 }}>Só vai mandar mensagem para quem autorizar (o paciente ou o responsável), e nunca com conteúdo do prontuário.</p>
      </div>
    </>
  )
}
