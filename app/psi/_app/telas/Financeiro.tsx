'use client'
// FINANCEIRO do mês: o que entrou (salários + atendimentos), o que saiu (repasse, imposto, despesas)
// e o que sobrou, bem grande. Embaixo, o que falta receber dos atendimentos, com um toque pra marcar
// como recebido, e as despesas (fixas e avulsas) pra lançar e corrigir. As contas: lib/psi/financeiro.ts.
import { useMemo, useState } from 'react'
import { AlertCircle, Check, ChevronLeft, ChevronRight, Plus, Undo2 } from 'lucide-react'
import { useBase } from '../App'
import { useAtendimentos, useDespesas } from '../usar'
import { ir, link } from '../rotas'
import { Campo, Chips, Folha, Secao, Topo, useAviso, Vazio } from '../ui'
import type { Atendimento, Despesa } from '@/lib/psi/tipos'
import { diaMes, limitesMes, mesAtual, mesSomar, nomeMes, MESES, dinheiro } from '@/lib/psi/datas'
import { ehSalario, lerValor, montarFinanceiro, valorCampo } from '@/lib/psi/financeiro'

const pct = (v?: number | null) => `${String(v || 0).replace('.', ',')}%`
const mesCurto = (m?: string | null) => m ? `${MESES[Number(m.slice(5, 7)) - 1].slice(0, 3)}/${m.slice(2, 4)}` : ''

export default function Financeiro({ q }: { q: URLSearchParams }) {
  const { repo, locais, pacientes } = useBase()
  const aviso = useAviso()
  const mes = q.get('mes') || mesAtual()
  const [de, ate] = limitesMes(mes)
  const { lista, recarregar } = useAtendimentos(de, ate)
  const desp = useDespesas()
  const [editar, setEditar] = useState<Partial<Despesa> | null>(null)
  const [verRecebidos, setVerRecebidos] = useState(false)
  const [mexendo, setMexendo] = useState('')

  const fin = useMemo(() => lista && desp.lista ? montarFinanceiro(mes, locais, lista, pacientes, desp.lista) : null, [lista, desp.lista, mes, locais, pacientes])
  const nomePac = (id: string) => { const p = pacientes.find(x => x.id === id); return p ? (p.nome_social || p.nome) : '(paciente)' }
  const trocarMes = (n: number) => { const m = mesSomar(mes, n); ir(link('/financeiro', { mes: m === mesAtual() ? null : m }), true) }
  const nomeDoMes = MESES[Number(mes.slice(5, 7)) - 1]

  async function marcar(itens: { atendimento: Atendimento; valor: number }[], pago: boolean) {
    setMexendo(itens.length === 1 ? itens[0].atendimento.id : 'varios')
    try {
      // ao marcar como recebido, o valor fica gravado no atendimento (se depois mudar o preço, este não muda)
      for (const { atendimento: a, valor } of itens)
        await repo.salvarAtendimento({ id: a.id, paciente_id: a.paciente_id, data: a.data, pago, ...(a.valor == null && valor ? { valor } : {}) })
      await recarregar()
      aviso(pago ? (itens.length === 1 ? 'Marcado como recebido.' : `${itens.length} marcados como recebidos.`) : 'Voltou pro a receber.')
    } catch (e) { aviso((e as Error).message) }
    setMexendo('')
  }

  return (
    <>
      <Topo titulo="Financeiro" voltarPara="#/" />
      <div className="psi-mes" style={{ margin: '0 0 14px' }}>
        <button className="psi-icone-btn" aria-label="Mês anterior" onClick={() => trocarMes(-1)}><ChevronLeft size={22} /></button>
        <strong>{nomeMes(mes).charAt(0).toUpperCase() + nomeMes(mes).slice(1)}</strong>
        <button className="psi-icone-btn" aria-label="Próximo mês" onClick={() => trocarMes(1)}><ChevronRight size={22} /></button>
      </div>

      {desp.pendente ? (
        <div className="psi-aviso"><AlertCircle size={20} style={{ flex: 'none' }} />
          <span><b>O financeiro ainda não foi instalado.</b> Falta rodar o arquivo db/psi-financeiro.sql no banco. As outras telas seguem funcionando normalmente.</span>
        </div>
      ) : desp.erro ? <Vazio>{desp.erro}</Vazio> : !fin ? <Vazio>Carregando…</Vazio> : (
        <>
          {/* o resultado, grande */}
          <div className="psi-resultado">
            <small>{fin.resultado >= 0 ? 'Sobrou' : 'Faltou'} em {nomeDoMes}</small>
            <b data-negativo={fin.resultado < 0 ? '1' : undefined}>{dinheiro(Math.abs(fin.resultado))}</b>
            <div className="psi-resultado-linha">
              <span>Entrou <strong>{dinheiro(fin.entradas)}</strong></span>
              <span>Saiu <strong>{dinheiro(fin.saidas)}</strong></span>
            </div>
            {mes === mesAtual() && <p>O mês ainda não acabou: conta os salários e os atendimentos já registrados.</p>}
            {mes > mesAtual() && <p>Mês que ainda não começou: aparecem só os salários e as despesas fixas.</p>}
          </div>

          {fin.semValor > 0 && (
            <div className="psi-aviso" style={{ marginTop: 12 }}><AlertCircle size={20} style={{ flex: 'none' }} />
              <span><b>{fin.semValor} atendimento{fin.semValor === 1 ? '' : 's'} sem valor.</b> Ponha o valor da sessão no local (Mais &gt; Locais e valores) ou no cadastro do paciente.</span>
            </div>
          )}

          {/* ENTRADAS */}
          <Secao titulo="Entradas" extra={<b className="psi-valor">{dinheiro(fin.entradas)}</b>} />
          {fin.locais.length === 0 ? <Vazio>Nenhuma entrada neste mês.</Vazio> : (
            <div className="psi-lista">
              {fin.locais.map(f => (
                <a key={f.local.id} className="psi-item" href={`#/local/${f.local.id}`}>
                  <span className="psi-ponto" style={{ background: f.local.cor, width: 14, height: 14 }} />
                  <span className="psi-item-txt">
                    <strong>{f.local.nome}</strong>
                    <small>{ehSalario(f.local)
                      ? (f.salario ? 'Salário fixo' : 'Salário fixo: falta pôr o valor')
                      : `${f.sessoes} atendimento${f.sessoes === 1 ? '' : 's'}${f.faltasCobradas ? ` · ${f.faltasCobradas} falta${f.faltasCobradas === 1 ? '' : 's'} cobrada${f.faltasCobradas === 1 ? '' : 's'}` : ''}`}</small>
                  </span>
                  <b className="psi-valor">{dinheiro(f.entradas)}</b>
                </a>
              ))}
            </div>
          )}

          {/* SAÍDAS */}
          <Secao titulo="Saídas" extra={<b className="psi-valor">{dinheiro(fin.saidas)}</b>} />
          <div className="psi-lista">
            {fin.locais.filter(f => f.repasse > 0).map(f => (
              <a key={'r' + f.local.id} className="psi-item" href={`#/local/${f.local.id}`}>
                <span className="psi-item-txt"><strong>Repasse {f.local.nome}</strong><small>{pct(f.local.repasse_pct)} de {dinheiro(f.valorSessoes)} dos atendimentos</small></span>
                <b className="psi-valor">{dinheiro(f.repasse)}</b>
              </a>
            ))}
            {fin.locais.filter(f => f.imposto > 0).map(f => (
              <a key={'i' + f.local.id} className="psi-item" href={`#/local/${f.local.id}`}>
                <span className="psi-item-txt"><strong>Imposto {f.local.nome}</strong><small>{pct(f.local.imposto_pct)} de {dinheiro(f.entradas)}</small></span>
                <b className="psi-valor">{dinheiro(f.imposto)}</b>
              </a>
            ))}
            {fin.despesas.map(d => (
              <button key={d.id} className="psi-item" onClick={() => setEditar(d)}>
                <span className="psi-item-txt">
                  <strong>{d.nome}</strong>
                  <small>{[d.recorrente ? 'Todo mês' : 'Só neste mês', locais.find(l => l.id === d.local_id)?.nome].filter(Boolean).join(' · ')}</small>
                </span>
                <b className="psi-valor">{dinheiro(d.valor)}</b>
              </button>
            ))}
            <button className="psi-marcar" onClick={() => setEditar({ nome: '', recorrente: false, mes, desde: mes, ativo: true, local_id: null })}><Plus size={18} />Lançar despesa</button>
          </div>

          {/* A RECEBER x RECEBIDO (só atendimentos dos locais por sessão) */}
          <AReceber fin={fin} nomePac={nomePac} mexendo={mexendo} marcar={marcar} verRecebidos={verRecebidos} setVerRecebidos={setVerRecebidos} />
        </>
      )}

      <EditarDespesa d={editar} mes={mes} fechar={() => setEditar(null)} salvou={async () => { setEditar(null); await desp.recarregar() }} />
    </>
  )
}

function AReceber({ fin, nomePac, mexendo, marcar, verRecebidos, setVerRecebidos }: {
  fin: ReturnType<typeof montarFinanceiro>; nomePac: (id: string) => string; mexendo: string
  marcar: (itens: { atendimento: Atendimento; valor: number }[], pago: boolean) => void
  verRecebidos: boolean; setVerRecebidos: (v: boolean) => void
}) {
  const pendentes = fin.cobraveis.filter(c => !c.atendimento.pago)
  const pagos = fin.cobraveis.filter(c => c.atendimento.pago)
  const locaisPend = [...new Map(pendentes.map(c => [c.local.id, c.local])).values()]
  if (fin.cobraveis.length === 0) return null
  return (
    <>
      <Secao titulo="Dos atendimentos" />
      <div className="psi-numeros psi-numeros-2">
        <div className="psi-numero"><b>{dinheiro(fin.aReceber)}</b><small>a receber</small></div>
        <div className="psi-numero"><b>{dinheiro(fin.recebido)}</b><small>já recebido</small></div>
      </div>
      {locaisPend.map(l => {
        const doLocal = pendentes.filter(c => c.local.id === l.id)
        return (
          <div key={l.id} className="psi-bloco" style={{ ['--cor' as string]: l.cor, marginTop: 12 }}>
            <div className="psi-bloco-topo">
              <strong>{l.nome}</strong><small>{doLocal.length} a receber</small>
              <span className="psi-espaco" />
              {doLocal.length > 1 && (
                <button className="psi-btn psi-btn-suave psi-btn-pequeno" disabled={!!mexendo}
                  onClick={() => { if (confirm(`Marcar os ${doLocal.length} atendimentos de ${l.nome} como recebidos?`)) marcar(doLocal, true) }}>Tudo recebido</button>
              )}
            </div>
            {doLocal.map(c => (
              <div key={c.atendimento.id} className="psi-item" style={{ cursor: 'default' }}>
                <span className="psi-hora">{diaMes(c.atendimento.data)}</span>
                <span className="psi-item-txt"><strong>{nomePac(c.atendimento.paciente_id)}</strong><small>{c.atendimento.presenca === 'faltou' ? 'Falta cobrada · ' : ''}{dinheiro(c.valor)}</small></span>
                <button className="psi-btn psi-btn-suave psi-btn-pequeno" disabled={!!mexendo} onClick={() => marcar([c], true)}>
                  <Check size={16} />{mexendo === c.atendimento.id ? '…' : 'Recebido'}
                </button>
              </div>
            ))}
          </div>
        )
      })}
      {pendentes.length === 0 && <div className="psi-cartao psi-muted" style={{ marginTop: 12 }}>Tudo recebido neste mês.</div>}
      {pagos.length > 0 && (
        <button className="psi-btn psi-btn-contorno psi-btn-bloco" style={{ marginTop: 12 }} onClick={() => setVerRecebidos(!verRecebidos)}>
          {verRecebidos ? 'Esconder os já recebidos' : `Ver os já recebidos (${pagos.length})`}
        </button>
      )}
      {verRecebidos && pagos.length > 0 && (
        <div className="psi-lista" style={{ marginTop: 12 }}>
          {pagos.map(c => (
            <div key={c.atendimento.id} className="psi-item" style={{ cursor: 'default' }}>
              <span className="psi-hora">{diaMes(c.atendimento.data)}</span>
              <span className="psi-item-txt"><strong>{nomePac(c.atendimento.paciente_id)}</strong><small>{c.local.nome} · {dinheiro(c.valor)}</small></span>
              <button className="psi-icone-btn" aria-label="Voltar pro a receber" disabled={!!mexendo} onClick={() => marcar([c], false)}><Undo2 size={17} /></button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/** a folha de lançar / corrigir uma despesa */
function EditarDespesa({ d, mes, fechar, salvou }: { d: Partial<Despesa> | null; mes: string; fechar: () => void; salvou: () => Promise<void> }) {
  const { repo, locais } = useBase()
  const aviso = useAviso()
  const [e, setE] = useState<Partial<Despesa> | null>(null)
  const [valor, setValor] = useState('')
  const [deQual, setDeQual] = useState<Partial<Despesa> | null>(null)
  if (d !== deQual) { setDeQual(d); setE(d); setValor(valorCampo(d?.valor)) }
  if (!d || !e) return null

  async function salvar() {
    const v = lerValor(valor)
    if (!e!.nome?.trim()) { aviso('Falta o nome.'); return }
    if (v === null || v < 0) { aviso('Falta o valor.'); return }
    const rec = !!e!.recorrente
    try {
      await repo.salvarDespesa({
        ...(e!.id ? { id: e!.id } : {}), nome: e!.nome.trim(), valor: v, local_id: e!.local_id || null, recorrente: rec,
        desde: rec ? (e!.desde || mes) : null, ate: rec ? (e!.ate || null) : null, mes: rec ? null : (e!.mes || mes), ativo: true,
      })
      aviso('Despesa salva.'); await salvou()
    } catch (err) { aviso((err as Error).message) }
  }
  async function parar() {
    // fixa: deixa de valer a partir deste mês (o passado continua igual)
    const fim = mesSomar(mes, -1)
    try {
      if (e!.desde && e!.desde > fim) await repo.apagarDespesa(e!.id!)
      else await repo.salvarDespesa({ id: e!.id, nome: e!.nome!, valor: e!.valor!, ate: fim })
      aviso(`Não vale mais a partir de ${MESES[Number(mes.slice(5, 7)) - 1]}.`); await salvou()
    } catch (err) { aviso((err as Error).message) }
  }
  async function apagar() {
    if (!confirm(e!.recorrente ? 'Apagar esta despesa de TODOS os meses?' : 'Apagar esta despesa?')) return
    try { await repo.apagarDespesa(e!.id!); aviso('Despesa apagada.'); await salvou() } catch (err) { aviso((err as Error).message) }
  }

  return (
    <Folha aberta titulo={e.id ? 'Despesa' : 'Lançar despesa'} fechar={fechar}>
      <Campo rotulo="O que é"><input className="psi-input" value={e.nome || ''} onChange={x => setE({ ...e, nome: x.target.value })} placeholder="Ex.: aluguel, contador, material" /></Campo>
      <Campo rotulo="Valor (R$)"><input className="psi-input" inputMode="decimal" value={valor} onChange={x => setValor(x.target.value)} placeholder="0,00" /></Campo>
      <Campo rotulo="Quando vale">
        <Chips opcoes={[{ valor: 'nao', rotulo: `Só em ${MESES[Number(mes.slice(5, 7)) - 1]}` }, { valor: 'sim', rotulo: 'Todo mês' }]} valor={e.recorrente ? 'sim' : 'nao'}
          mudar={v => setE({ ...e, recorrente: v === 'sim', desde: e.desde || mes, mes: e.mes || mes })} />
      </Campo>
      {e.recorrente && (
        <div className="psi-grade-2">
          <Campo rotulo="A partir de"><input className="psi-input" type="month" value={e.desde || mes} onChange={x => setE({ ...e, desde: x.target.value || mes })} /></Campo>
          <Campo rotulo="Até (opcional)"><input className="psi-input" type="month" value={e.ate || ''} onChange={x => setE({ ...e, ate: x.target.value || null })} /></Campo>
        </div>
      )}
      <Campo rotulo="De qual local">
        <Chips rolar opcoes={[{ valor: '', rotulo: 'Geral' }, ...locais.filter(l => l.ativo || l.id === e.local_id).map(l => ({ valor: l.id, rotulo: l.nome, cor: l.cor }))]}
          valor={e.local_id || ''} mudar={v => setE({ ...e, local_id: v || null })} />
      </Campo>
      <div className="psi-grade-2">
        <button className="psi-btn psi-btn-suave" onClick={fechar}>Cancelar</button>
        <button className="psi-btn psi-btn-principal" onClick={salvar}>Salvar</button>
      </div>
      {e.id && e.recorrente && !(e.ate && e.ate < mes) && (
        <button className="psi-btn psi-btn-contorno psi-btn-bloco" style={{ marginTop: 10 }} onClick={parar}>Parar a partir de {mesCurto(mes)}</button>
      )}
      {e.id && <button className="psi-btn psi-btn-perigo psi-btn-bloco" style={{ marginTop: 10 }} onClick={apagar}>Apagar</button>}
    </Folha>
  )
}
