'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, CircleCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { hojeBR, diasEntre } from '@/lib/periodos'
import { Card, Botao, Campo, CabecalhoPagina, CardNumero, Vazio } from '@/components/ui'

// CONTAS A PAGAR (02/10/2026, pedido do Rick).
// Conta a pagar = custo lançado como "previsto" em lancamentos_empresa. Não tem cadastro próprio:
// lançar e corrigir continuam na tela Lançamentos.
// Etapa 2: "Marcar como paga" — a ÚNICA gravação desta tela. Faz o mesmo que o confirmar pagamento
// de Lançamentos (status realizado + data_pagamento), com caixa de confirmação e data à escolha
// (nunca futura). Conta sem caixa não paga por aqui: o saldo é por caixa, e ela não sairia de lugar nenhum.
//
// Três grupos: Atrasadas e Vence hoje aparecem sempre (de qualquer mês — conta atrasada não pode
// sumir porque alguém trocou o mês); "Vencem em <mês>" segue o seletor.

type Conta = { id: string; descricao: string; categoria: string; valor: number; data_vencimento: string; conta_id: string | null }

const CAT_PADRAO: Record<string, string> = { pessoal: 'Pessoal', estrutura: 'Estrutura', sistemas: 'Sistemas', marketing: 'Marketing', turma: 'Turma', imposto: 'Imposto', salarios: 'Salários', aluguel: 'Aluguel', taxa_financeira: 'Taxa financeira', deslocamentos: 'Deslocamentos', telefone_internet: 'Telefone/Internet', outro: 'Outro' }

const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const numero = (v: number) => (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dataBR = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
const nomeMes = (mes: string) => new Date(mes + '-01T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
const soMes = (mes: string) => new Date(mes + '-01T12:00:00').toLocaleDateString('pt-BR', { month: 'long' })
const andarMes = (mes: string, n: number) => {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1, 12)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const fimDoMes = (mes: string) => {
  const [y, m] = mes.split('-').map(Number)
  return `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}
const soma = (l: Conta[]) => l.reduce((s, c) => s + c.valor, 0)
const qtd = (n: number) => `${n} ${n === 1 ? 'conta' : 'contas'}`

export default function ContasPagar() {
  const hoje = hojeBR()
  const [mes, setMes] = useState(hoje.slice(0, 7))
  const [contas, setContas] = useState<Conta[]>([])
  const [caixas, setCaixas] = useState<{ id: string; nome: string }[]>([])
  const [natMap, setNatMap] = useState<Record<string, string>>(CAT_PADRAO)
  const [fCaixa, setFCaixa] = useState('')
  const [fNat, setFNat] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  // a conta que está na caixa de confirmação do pagamento
  const [pagando, setPagando] = useState<Conta | null>(null)
  const [dataPag, setDataPag] = useState(hoje)
  const [salvando, setSalvando] = useState(false)
  const [erroPag, setErroPag] = useState('')

  function abrirPagamento(c: Conta) { setPagando(c); setDataPag(hoje); setErroPag('') }

  async function confirmarPagamento() {
    if (!pagando) return
    if (!dataPag) { setErroPag('Informe a data do pagamento.'); return }
    if (dataPag > hoje) { setErroPag('A data do pagamento não pode ser no futuro.'); return }
    setSalvando(true); setErroPag('')
    // só mexe se a conta AINDA está prevista (outra pessoa pode ter pago na tela Lançamentos)
    const { data, error } = await supabase.from('lancamentos_empresa')
      .update({ status: 'realizado', data_pagamento: dataPag })
      .eq('id', pagando.id).eq('status', 'previsto').select('id')
    setSalvando(false)
    if (error) { setErroPag('Não foi possível marcar como paga. Nada foi alterado. Avise o Guto.'); return }
    if (!data || data.length === 0) setErro('Essa conta já não estava mais em aberto. Atualize a página para ver a lista de agora.')
    setContas(l => l.filter(c => c.id !== pagando.id))
    setPagando(null)
  }

  useEffect(() => {
    supabase.from('contas_financeiras').select('id, nome').order('nome').then(({ data }) => setCaixas(data || []))
    supabase.from('naturezas_financeiras').select('chave, nome').then(({ data }) =>
      setNatMap({ ...CAT_PADRAO, ...Object.fromEntries((data || []).map((n: any) => [n.chave, n.nome])) }))
  }, [])

  useEffect(() => {
    let ativo = true
    async function carregar() {
      setCarregando(true); setErro('')
      // tudo que está em aberto até o fim do mês escolhido (ou até hoje, se o mês já passou)
      const ate = fimDoMes(mes) > hoje ? fimDoMes(mes) : hoje
      const todas: Conta[] = []
      // o banco devolve no máximo 1000 linhas por vez, sem avisar: vem em páginas
      for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase.from('lancamentos_empresa')
          .select('id, descricao, categoria, valor, data_vencimento, conta_id')
          .eq('tipo', 'custo').eq('status', 'previsto').lte('data_vencimento', ate)
          .order('data_vencimento').order('id').range(de, de + 999)
        if (!ativo) return
        if (error) { setErro('Não foi possível carregar as contas. Avise o Guto.'); setCarregando(false); return }
        todas.push(...(data || []).map((l: any) => ({ ...l, valor: Number(l.valor) || 0 })))
        if (!data || data.length < 1000) break
      }
      setContas(todas); setCarregando(false)
    }
    carregar()
    return () => { ativo = false }
  }, [mes, hoje])

  const filtradas = contas.filter(c => (!fCaixa || c.conta_id === fCaixa) && (!fNat || (c.categoria || 'outro') === fNat))
  const atrasadas = filtradas.filter(c => c.data_vencimento < hoje)
  const deHoje = filtradas.filter(c => c.data_vencimento === hoje)
  const doMes = filtradas.filter(c => c.data_vencimento > hoje && c.data_vencimento.startsWith(mes))
  const visiveis = [...atrasadas, ...deHoje, ...doMes]

  const caixaNome = Object.fromEntries(caixas.map(c => [c.id, c.nome]))
  // as naturezas do filtro são as que aparecem nas contas em aberto
  const natsNoFiltro = Array.from(new Set(contas.map(c => c.categoria || 'outro')))
    .map(chave => ({ chave, nome: natMap[chave] || chave })).sort((a, b) => a.nome.localeCompare(b.nome))

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1000, margin: '0 auto' }}>
      <CabecalhoPagina titulo="Contas a Pagar" sub="Custos lançados como previstos e ainda não pagos. Para lançar ou corrigir uma conta, use a tela Lançamentos." />

      <Card style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
        <Campo rotulo="Mês">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Botao icone={ChevronLeft} onClick={() => setMes(m => andarMes(m, -1))} aria-label="Mês anterior" />
            <span style={{ minWidth: 150, textAlign: 'center', fontSize: 14, fontWeight: 600, color: 'var(--text)', textTransform: 'capitalize' }}>{nomeMes(mes)}</span>
            <Botao icone={ChevronRight} onClick={() => setMes(m => andarMes(m, 1))} aria-label="Próximo mês" />
          </div>
        </Campo>
        <Campo rotulo="Caixa" style={{ minWidth: 180 }}>
          <Campo.Select value={fCaixa} onChange={e => setFCaixa(e.target.value)}>
            <option value="">Todos</option>
            {caixas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Campo.Select>
        </Campo>
        <Campo rotulo="Natureza" style={{ minWidth: 180 }}>
          <Campo.Select value={fNat} onChange={e => setFNat(e.target.value)}>
            <option value="">Todas</option>
            {natsNoFiltro.map(n => <option key={n.chave} value={n.chave}>{n.nome}</option>)}
          </Campo.Select>
        </Campo>
      </Card>

      {erro ? <Card><Vazio titulo={erro} /></Card>
        : carregando ? <div style={{ color: 'var(--text-faint)', padding: 30 }}>Carregando…</div>
          : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
                <CardNumero rotulo="Atrasadas" prefixo="R$" valor={numero(soma(atrasadas))} rodape={qtd(atrasadas.length)} alerta={atrasadas.length > 0} />
                <CardNumero rotulo="Vence hoje" prefixo="R$" valor={numero(soma(deHoje))} rodape={qtd(deHoje.length)} />
                <CardNumero rotulo={`Vencem em ${soMes(mes)}`} prefixo="R$" valor={numero(soma(doMes))} rodape={qtd(doMes.length)} />
                <CardNumero rotulo="Total" prefixo="R$" valor={numero(soma(visiveis))} rodape={qtd(visiveis.length)} destaque />
              </div>

              {visiveis.length === 0
                ? <Card><Vazio icone={CircleCheck} titulo="Nenhuma conta em aberto" texto="Não há custo previsto atrasado, vencendo hoje ou neste mês com esses filtros." /></Card>
                : (
                  <div style={{ display: 'grid', gap: 16 }}>
                    <Grupo titulo="Atrasadas" contas={atrasadas} hoje={hoje} natMap={natMap} caixaNome={caixaNome} aoPagar={abrirPagamento} atrasada />
                    <Grupo titulo="Vence hoje" contas={deHoje} hoje={hoje} natMap={natMap} caixaNome={caixaNome} aoPagar={abrirPagamento} />
                    <Grupo titulo={`Vencem em ${soMes(mes)}`} contas={doMes} hoje={hoje} natMap={natMap} caixaNome={caixaNome} aoPagar={abrirPagamento} />
                  </div>
                )}
            </>
          )}

      {pagando && (
        <div onClick={() => !salvando && setPagando(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 50 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420 }}>
            <Card style={{ display: 'grid', gap: 14 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>Marcar como paga?</div>
              <div style={{ display: 'grid', gap: 4, fontSize: 14, color: 'var(--text-2)' }}>
                <div style={{ fontWeight: 600, color: 'var(--text)' }}>{pagando.descricao || 'Sem descrição'}</div>
                <div>Valor: <strong>{brl(pagando.valor)}</strong></div>
                <div>Vencimento: {new Date(pagando.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}</div>
                <div>Caixa: {pagando.conta_id ? caixaNome[pagando.conta_id] || '—' : 'sem caixa definido'}</div>
              </div>
              {pagando.conta_id ? (
                <>
                  <Campo rotulo="Data do pagamento" erro={erroPag} dica="Hoje ou um dia que já passou.">
                    <Campo.Input type="date" value={dataPag} max={hoje} onChange={e => setDataPag(e.target.value)} />
                  </Campo>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <Botao onClick={() => setPagando(null)} disabled={salvando}>Cancelar</Botao>
                    <Botao tom="principal" onClick={confirmarPagamento} disabled={salvando}>{salvando ? 'Salvando…' : 'Confirmar pagamento'}</Botao>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 13.5, color: 'var(--red)' }}>Defina o caixa na tela Lançamentos antes de pagar. Sem caixa, o pagamento não sairia do saldo de nenhuma conta.</div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Botao onClick={() => setPagando(null)}>Fechar</Botao>
                  </div>
                </>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

function Grupo({ titulo, contas, hoje, natMap, caixaNome, aoPagar, atrasada }: {
  titulo: string; contas: Conta[]; hoje: string; natMap: Record<string, string>; caixaNome: Record<string, string>
  aoPagar: (c: Conta) => void; atrasada?: boolean
}) {
  if (contas.length === 0) return null
  return (
    <Card pad={8}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: atrasada ? 'var(--red)' : 'var(--text-muted)' }}>
        <span>{titulo} ({contas.length})</span>
        <span>{brl(soma(contas))}</span>
      </div>
      {contas.map(c => {
        // diasEntre conta as duas pontas; atraso é a diferença (venceu ontem = 1 dia)
        const dias = atrasada ? diasEntre(c.data_vencimento, hoje) - 1 : 0
        return (
          <div key={c.id} style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '9px 12px', borderTop: '1px solid var(--border)', fontSize: 13.5 }}>
            <span style={{ width: 48, flexShrink: 0, fontWeight: 600, color: atrasada ? 'var(--red)' : 'var(--text-2)' }}>{dataBR(c.data_vencimento)}</span>
            <span style={{ flex: 1, minWidth: 0, color: 'var(--text)' }}>{c.descricao || 'Sem descrição'}</span>
            <span style={{ width: 130, flexShrink: 0, color: 'var(--text-muted)' }}>{natMap[c.categoria || 'outro'] || c.categoria}</span>
            <span style={{ width: 130, flexShrink: 0, color: 'var(--text-muted)' }}>{c.conta_id ? caixaNome[c.conta_id] || '—' : '—'}</span>
            <span style={{ width: 80, flexShrink: 0, fontSize: 12, color: 'var(--red)' }}>{atrasada ? `há ${dias} ${dias === 1 ? 'dia' : 'dias'}` : ''}</span>
            <span style={{ width: 110, flexShrink: 0, textAlign: 'right', fontWeight: 700, color: 'var(--text)' }}>{brl(c.valor)}</span>
            <Botao tamanho="sm" onClick={() => aoPagar(c)} style={{ flexShrink: 0, alignSelf: 'center' }}>Marcar como paga</Botao>
          </div>
        )
      })}
    </Card>
  )
}
