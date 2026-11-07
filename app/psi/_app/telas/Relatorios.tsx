'use client'
// RELATÓRIOS: a "planilha" do mês por local (o pedido da APAE: nome, datas, quantidade e total),
// pronta em PDF ou planilha com o Compartilhar do celular; e o resumo do mês (atendimentos, faltas,
// valor a receber por local). Entradas, saídas e o que sobra ficam na tela Financeiro (mesmas contas).
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, FileDown, FileSpreadsheet, Share2, Wallet } from 'lucide-react'
import { useBase } from '../App'
import { useAtendimentos } from '../usar'
import { ir, link } from '../rotas'
import { Chips, Topo, useAviso, Vazio } from '../ui'
import { datasCurtas, montarRelatorio, resumoMes } from '@/lib/psi/relatorio'
import { limitesMes, mesAtual, mesSomar, nomeMes, dinheiro } from '@/lib/psi/datas'
import { ehSalario } from '@/lib/psi/financeiro'
import { baixar, compartilhar, csvRelatorio, nomeArquivo, pdfRelatorio, xlsxRelatorio } from '@/lib/psi/exportar'

export default function Relatorios({ q }: { q: URLSearchParams }) {
  const { repo, locais, pacientes, perfil } = useBase()
  const aviso = useAviso()
  const aba = q.get('aba') === 'resumo' ? 'resumo' : 'planilha'
  const mes = q.get('mes') || mesAtual()
  const apae = locais.find(l => /apae/i.test(l.nome))
  const localId = q.get('local') || apae?.id || locais[0]?.id || ''
  const [de, ate] = limitesMes(mes)
  const { lista } = useAtendimentos(de, ate)
  const [fazendo, setFazendo] = useState('')

  const trocar = (m: Record<string, string | null>) => ir(link('/relatorios', { aba: aba === 'resumo' ? 'resumo' : null, mes: mes === mesAtual() ? null : mes, local: localId, ...m }), true)
  const local = locais.find(l => l.id === localId) || null
  const rel = useMemo(() => lista ? montarRelatorio(mes, local, lista, pacientes) : null, [lista, mes, local, pacientes])
  const resumo = useMemo(() => lista ? resumoMes(mes, locais.filter(l => l.ativo), lista, pacientes) : null, [lista, mes, locais, pacientes])
  useEffect(() => { /* o mês trocou: rola pro topo */ window.scrollTo(0, 0) }, [mes])

  const base = `${nomeArquivo(`atendimentos ${local?.nome || ''} ${mes}`)}`
  async function sair(tipo: 'pdf' | 'xlsx' | 'csv') {
    if (!rel) return
    setFazendo(tipo)
    try {
      await repo.registrar('exportar', null, `relatorio ${tipo} ${mes}`)
      if (tipo === 'csv') { baixar(csvRelatorio(rel, perfil), base + '.csv'); setFazendo(''); return }
      const blob = tipo === 'pdf' ? await pdfRelatorio(rel, perfil) : await xlsxRelatorio(rel, perfil)
      const r = await compartilhar(blob, `${base}.${tipo}`, `Atendimentos ${local?.nome || ''} — ${nomeMes(mes)}`)
      if (r === 'baixado') aviso('Arquivo baixado.')
    } catch (e) { aviso((e as Error).message) }
    setFazendo('')
  }

  return (
    <>
      <Topo titulo="Relatórios" />
      <Chips opcoes={[{ valor: 'planilha', rotulo: 'Planilha por local' }, { valor: 'resumo', rotulo: 'Resumo do mês' }]} valor={aba}
        mudar={v => ir(link('/relatorios', { aba: v === 'resumo' ? 'resumo' : null, mes: mes === mesAtual() ? null : mes, local: localId }), true)} />

      <div className="psi-mes" style={{ margin: '14px 0 12px' }}>
        <button className="psi-icone-btn" aria-label="Mês anterior" onClick={() => trocar({ mes: mesSomar(mes, -1) })}><ChevronLeft size={22} /></button>
        <strong>{nomeMes(mes).charAt(0).toUpperCase() + nomeMes(mes).slice(1)}</strong>
        <button className="psi-icone-btn" aria-label="Próximo mês" onClick={() => trocar({ mes: mesSomar(mes, 1) })}><ChevronRight size={22} /></button>
      </div>

      {aba === 'planilha' && (
        <>
          <Chips rolar opcoes={locais.map(l => ({ valor: l.id, rotulo: l.nome, cor: l.cor }))} valor={localId} mudar={v => trocar({ local: v })} />
          <div className="psi-grade-2" style={{ margin: '12px 0' }}>
            <button className="psi-btn psi-btn-principal" disabled={!rel || !!fazendo} onClick={() => sair('pdf')}><Share2 size={18} />{fazendo === 'pdf' ? 'Gerando…' : 'PDF'}</button>
            <button className="psi-btn psi-btn-principal" disabled={!rel || !!fazendo} onClick={() => sair('xlsx')}><FileSpreadsheet size={18} />{fazendo === 'xlsx' ? 'Gerando…' : 'Planilha'}</button>
          </div>
          <p className="psi-muted psi-pequeno" style={{ margin: '-4px 0 12px' }}>Os dois botões abrem o Compartilhar do celular (WhatsApp, e-mail…). Só entram atendimentos <b>realizados</b>.</p>

          {!rel ? <Vazio>Carregando…</Vazio> : (
            <div className="psi-cartao" style={{ padding: '12px 12px 6px' }}>
              <div style={{ fontWeight: 800, color: 'var(--cacau)', marginBottom: 4 }}>{local?.nome} — {nomeMes(mes)}</div>
              {rel.linhas.length === 0 ? <Vazio>Nenhum atendimento realizado neste mês.</Vazio> : (
                <table className="psi-tabela">
                  <thead><tr><th>Paciente</th><th>Datas</th><th className="psi-num">Qtd.</th></tr></thead>
                  <tbody>{rel.linhas.map(l => <tr key={l.paciente}><td style={{ fontWeight: 600 }}>{l.paciente}</td><td className="psi-muted">{datasCurtas(l.datas)}</td><td className="psi-num">{l.quantidade}</td></tr>)}</tbody>
                  <tfoot><tr><td>Total</td><td>{rel.pacientes} paciente{rel.pacientes === 1 ? '' : 's'}</td><td className="psi-num">{rel.total}</td></tr></tfoot>
                </table>
              )}
            </div>
          )}
          <button className="psi-btn psi-btn-suave psi-btn-bloco" style={{ marginTop: 12 }} disabled={!rel} onClick={() => sair('csv')}><FileDown size={18} />Baixar em CSV</button>
        </>
      )}

      {aba === 'resumo' && (
        !resumo ? <Vazio>Carregando…</Vazio> : (
          <>
            {resumo.map(r => (
              <div key={r.local.id} className="psi-cartao" style={{ borderLeft: `6px solid ${r.local.cor}` }}>
                <div className="psi-linha" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
                  <b style={{ color: 'var(--cacau)', fontSize: 16 }}>{r.local.nome}</b>
                  {ehSalario(r.local)
                    ? <span className="psi-muted psi-pequeno">Salário fixo{r.local.salario_mensal ? ` · ${dinheiro(r.local.salario_mensal)}` : ''}</span>
                    : r.local.valor_sessao ? <span className="psi-muted psi-pequeno">{dinheiro(r.local.valor_sessao)}/sessão</span> : <a className="psi-pequeno" href={`#/local/${r.local.id}`}>pôr valor</a>}
                </div>
                <div className="psi-numeros">
                  <div className="psi-numero"><b>{r.realizados}</b><small>realizados</small></div>
                  <div className="psi-numero"><b>{r.faltas}</b><small>faltas</small></div>
                  <div className="psi-numero"><b>{r.desmarcados + r.remarcados}</b><small>desmarc./remarc.</small></div>
                </div>
                {(r.aReceber > 0 || r.recebido > 0) && (
                  <div className="psi-linha psi-pequeno" style={{ marginTop: 10, justifyContent: 'space-between' }}>
                    <span>A receber: <b>{dinheiro(r.aReceber)}</b></span><span className="psi-muted">Recebido: {dinheiro(r.recebido)}</span>
                  </div>
                )}
                {r.local.forma_pagamento && <div className="psi-muted" style={{ fontSize: 12.5, marginTop: 4 }}>{r.local.forma_pagamento}</div>}
              </div>
            ))}
            <div className="psi-cartao" style={{ background: 'var(--areia-2)' }}>
              <div className="psi-linha" style={{ justifyContent: 'space-between' }}>
                <b>Total do mês</b>
                <span><b>{resumo.reduce((s, r) => s + r.realizados, 0)}</b> realizados · <b>{dinheiro(resumo.reduce((s, r) => s + r.aReceber, 0))}</b> a receber</span>
              </div>
              <div className="psi-muted" style={{ fontSize: 12.5, marginTop: 4 }}>O "a receber" é só dos atendimentos dos locais por sessão. Os salários ficam no Financeiro.</div>
            </div>
            <a className="psi-btn psi-btn-contorno psi-btn-bloco" style={{ marginTop: 12 }} href={link('/financeiro', { mes: mes === mesAtual() ? null : mes })}><Wallet size={18} />Ver o financeiro do mês</a>
          </>
        )
      )}
    </>
  )
}
