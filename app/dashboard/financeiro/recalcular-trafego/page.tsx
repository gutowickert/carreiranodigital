'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

const card = { backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '12px' } as React.CSSProperties
const inp = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', color: '#ffffff', outline: 'none', width: '100%' } as React.CSSProperties
const btnPrimary = { backgroundColor: '#7c3aed', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: '#3a3a3c', color: '#d1d1d1', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer', textDecoration: 'none' } as React.CSSProperties

function addDays(date: string, days: number) {
  const d = new Date(date + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export default function TrafegoRegraFixa() {
  const hoje = new Date().toISOString().split('T')[0]
  const [valor, setValor] = useState('2000')
  const [intervalo, setIntervalo] = useState('3')
  const [inicio, setInicio] = useState(hoje)
  const [fim, setFim] = useState(addDays(hoje, 90))
  const [rodando, setRodando] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [feito, setFeito] = useState(false)

  function add(m: string) { setLog(prev => [...prev, m]) }

  async function gerar() {
    if (!confirm('Isso apaga TODO o tráfego anterior (das turmas e da regra fixa) e gera a nova regra. Continuar?')) return
    setRodando(true); setLog([]); setFeito(false)

    add('Apagando tráfego anterior...')
    await supabase.from('lancamentos_empresa').delete().is('turma_id', null).eq('categoria', 'marketing').ilike('descricao', 'Tráfego turmas —%')
    await supabase.from('lancamentos_empresa').delete().is('turma_id', null).eq('categoria', 'marketing').ilike('descricao', 'Tráfego (regra fixa)%')

    const v = parseFloat(valor) || 0
    const step = Math.max(1, parseInt(intervalo) || 3)
    if (v <= 0) { add('Valor inválido.'); setRodando(false); return }
    if (fim < inicio) { add('Data final antes da inicial.'); setRodando(false); return }

    const rows: any[] = []
    let d = inicio
    while (d <= fim) {
      rows.push({
        tipo: 'custo', categoria: 'marketing',
        descricao: `Tráfego (regra fixa) — ${new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')}`,
        valor: v, unidade: 'geral',
        mes_referencia: d.substring(0, 7) + '-01',
        data_vencimento: d, status: 'previsto', turma_id: null,
      })
      d = addDays(d, step)
    }

    if (rows.length > 0) {
      const { error } = await supabase.from('lancamentos_empresa').insert(rows)
      if (error) { add('Erro ao inserir: ' + error.message); setRodando(false); return }
    }

    add(`Lançamentos criados: ${rows.length} (1 a cada ${step} dia(s))`)
    add(`Total provisionado: ${(rows.length * v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`)
    add('Pronto! Confere no Fluxo de Caixa.')
    setFeito(true); setRodando(false)
  }

  return (
    <div style={{ padding: '24px', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#ffffff', margin: 0 }}>Tráfego — regra fixa</h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>Provisiona um valor fixo a cada X dias, direto no financeiro</p>
        </div>
        <Link href="/dashboard/financeiro/fluxo" style={btnSecondary}>← Fluxo de caixa</Link>
      </div>

      <div style={{ ...card, padding: '24px', maxWidth: '640px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>Valor R$ (por lançamento)</label>
            <input value={valor} onChange={e => setValor(e.target.value)} type="number" style={inp} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>A cada quantos dias</label>
            <input value={intervalo} onChange={e => setIntervalo(e.target.value)} type="number" min="1" style={inp} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>De</label>
            <input value={inicio} onChange={e => setInicio(e.target.value)} type="date" style={inp} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>Até</label>
            <input value={fim} onChange={e => setFim(e.target.value)} type="date" style={inp} />
          </div>
        </div>

        <p style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.6, margin: '0 0 16px' }}>
          Apaga o tráfego anterior (o que vinha das turmas e qualquer regra fixa já gerada) e cria os lançamentos novos.
          Pode rodar de novo quando quiser pra estender ou mudar o valor.
        </p>

        <button onClick={gerar} disabled={rodando} style={{ ...btnPrimary, opacity: rodando ? 0.6 : 1 }}>
          {rodando ? 'Gerando...' : 'Gerar tráfego (regra fixa)'}
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