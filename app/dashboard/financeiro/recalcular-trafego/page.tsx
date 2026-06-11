'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getConfigNumero } from '@/lib/configuracoes'

const card = { backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '12px' } as React.CSSProperties
const btnPrimary = { backgroundColor: '#7c3aed', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: '#3a3a3c', color: '#d1d1d1', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer', textDecoration: 'none' } as React.CSSProperties

function addDays(date: string, days: number) {
  const d = new Date(date + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export default function RecalcularTrafego() {
  const [rodando, setRodando] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [feito, setFeito] = useState(false)

  function add(msg: string) { setLog(prev => [...prev, msg]) }

  async function recalcular() {
    if (!confirm('Isso apaga o tráfego combinado atual e recalcula a partir das turmas. Continuar?')) return
    setRodando(true); setLog([]); setFeito(false)

    add('Apagando tráfego combinado antigo...')
    const { error: errDel } = await supabase.from('lancamentos_empresa')
      .delete().is('turma_id', null).eq('categoria', 'marketing').ilike('descricao', 'Tráfego turmas —%')
    if (errDel) { add('Erro ao apagar: ' + errDel.message); setRodando(false); return }

    const BLOCO = Math.max(1, await getConfigNumero('financeiro.dias_agrupamento_trafego', 4))
    const REF = '2026-01-01'
    const hoje = new Date().toISOString().split('T')[0]
    const diffDias = (a: string, b: string) =>
      Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000)
    const inicioJanela = (d: string) => {
      const idx = Math.floor(diffDias(REF, d) / BLOCO)
      return addDays(REF, idx * BLOCO)
    }

    const { data: turmas } = await supabase.from('turmas').select('id, data_inicio, status')
    const { data: fins } = await supabase.from('financeiro_turma').select('turma_id, custo_trafego_previsto')
    const totalPorTurma: Record<string, number> = {}
    ;(fins || []).forEach((f: any) => { totalPorTurma[f.turma_id] = f.custo_trafego_previsto || 0 })

    const janelas: Record<string, { valor: number; winFim: string }> = {}
    let comTrafego = 0, semRunway = 0

    for (const t of (turmas || []) as any[]) {
      if (t.status === 'cancelada') continue
      const total = totalPorTurma[t.id] || 0
      if (total <= 0 || !t.data_inicio) continue
      const trafInicio = hoje
      const trafFim = addDays(t.data_inicio, -1)
      if (diffDias(trafInicio, trafFim) < 0) { semRunway++; continue }
      comTrafego++
      const diasTraf = diffDias(trafInicio, trafFim) + 1
      const vDia = total / diasTraf
      let cursor = inicioJanela(trafInicio)
      while (diffDias(cursor, trafFim) >= 0) {
        const winInicio = cursor
        const winFim = addDays(cursor, BLOCO - 1)
        const ovStart = diffDias(winInicio, trafInicio) > 0 ? trafInicio : winInicio
        const ovEnd = diffDias(winFim, trafFim) < 0 ? winFim : trafFim
        const dias = diffDias(ovStart, ovEnd) + 1
        if (dias > 0) {
          if (!janelas[winInicio]) janelas[winInicio] = { valor: 0, winFim }
          janelas[winInicio].valor += vDia * dias
        }
        cursor = addDays(cursor, BLOCO)
      }
    }

    const rows = Object.keys(janelas).sort().map(winInicio => {
      const { valor, winFim } = janelas[winInicio]
      return {
        tipo: 'custo', categoria: 'marketing',
        descricao: `Tráfego turmas — ${new Date(winInicio + 'T12:00:00').toLocaleDateString('pt-BR')} a ${new Date(winFim + 'T12:00:00').toLocaleDateString('pt-BR')}`,
        valor, unidade: 'geral',
        mes_referencia: winInicio.substring(0, 7) + '-01',
        data_vencimento: winInicio, status: 'previsto', turma_id: null,
      }
    })

    if (rows.length > 0) {
      const { error: errIns } = await supabase.from('lancamentos_empresa').insert(rows)
      if (errIns) { add('Erro ao inserir: ' + errIns.message); setRodando(false); return }
    }

    const totalGeral = rows.reduce((s, r) => s + r.valor, 0)
    add(`Turmas com tráfego provisionado: ${comTrafego}`)
    add(`Turmas já iniciadas (sem provisão): ${semRunway}`)
    add(`Janelas de 4 dias criadas: ${rows.length}`)
    add(`Total provisionado: ${totalGeral.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`)
    add('Pronto! Confere no Fluxo de Caixa.')
    setFeito(true); setRodando(false)
  }

  return (
    <div style={{ padding: '24px', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#ffffff', margin: 0 }}>Recalcular tráfego</h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>Refaz o tráfego combinado de todas as turmas, sem reabri-las</p>
        </div>
        <Link href="/dashboard/financeiro/fluxo" style={btnSecondary}>← Fluxo de caixa</Link>
      </div>

      <div style={{ ...card, padding: '24px', maxWidth: '640px' }}>
        <p style={{ fontSize: '14px', color: '#d1d1d1', lineHeight: 1.6, marginTop: 0 }}>
          Espalha o tráfego de cada turma de hoje até a véspera do início, em janelas fixas de 4 dias.
          Turmas já iniciadas não recebem provisão (o tráfego delas é passado). O previsto por turma na margem não muda.
        </p>
        <button onClick={recalcular} disabled={rodando} style={{ ...btnPrimary, opacity: rodando ? 0.6 : 1 }}>
          {rodando ? 'Recalculando...' : 'Recalcular tráfego agora'}
        </button>

        {log.length > 0 && (
          <div style={{ marginTop: '20px', backgroundColor: '#1c1c1e', border: '1px solid #3a3a3c', borderRadius: '8px', padding: '16px' }}>
            {log.map((l, i) => (
              <div key={i} style={{ fontSize: '13px', color: l.includes('Erro') ? '#f87171' : '#d1d1d1', fontFamily: 'monospace', marginBottom: '4px' }}>{l}</div>
            ))}
          </div>
        )}

        {feito && (
          <Link href="/dashboard/financeiro/fluxo" style={{ ...btnPrimary, display: 'inline-block', textDecoration: 'none', marginTop: '16px' }}>
            Ver no Fluxo de Caixa →
          </Link>
        )}
      </div>
    </div>
  )
}