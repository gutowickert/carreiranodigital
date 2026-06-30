'use client'

import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts'

const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' }
const inp = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', color: 'var(--text)', outline: 'none' } as React.CSSProperties
const btnSecondary = { backgroundColor: 'var(--surface-2)', color: 'var(--text-2)', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties

export default function Resultados() {
  const [leads, setLeads] = useState<any[]>([])
  const [turmas, setTurmas] = useState<any[]>([])
  const [vendedores, setVendedores] = useState<any[]>([])
  const [motivos, setMotivos] = useState<any[]>([])
  const [filtro, setFiltro] = useState<'todos' | 'ganho' | 'perda'>('todos')
  const [mesFiltro, setMesFiltro] = useState(new Date().toISOString().slice(0, 7))

  useEffect(() => { carregar() }, [mesFiltro])

  async function carregar() {
    const { data: leadsData, error } = await supabase.from('leads')
      .select('*')
      .in('etapa', ['ganho', 'perda'])
      .order('atualizado_em', { ascending: false })

    if (error) { console.error('Erro:', error); return }

    const { data: turmasData } = await supabase.from('turmas').select('id, codigo, produtos(nome), cidades(nome)')
    const { data: vendedoresData } = await supabase.from('usuarios_perfil').select('id, nome')
    const { data: motivosData } = await supabase.from('motivos_perda').select('id, nome')

    setTurmas(turmasData || [])
    setVendedores(vendedoresData || [])
    setMotivos(motivosData || [])

    if (leadsData) {
      const filtradosMes = leadsData.filter((l: any) => {
        const ref = l.data_ganho || l.data_perda
        if (!ref) return false
        return ref.startsWith(mesFiltro)
      })
      setLeads(filtradosMes)
    }
  }

  function buscarTurma(id: string) { return turmas.find(t => t.id === id) }
  function buscarVendedor(id: string) { return vendedores.find(v => v.id === id) }
  function buscarMotivo(id: string) { return motivos.find(m => m.id === id) }

  const filtrados = leads.filter(l => filtro === 'todos' || l.etapa === filtro)
  const ganhos = leads.filter(l => l.etapa === 'ganho')
  const perdidos = leads.filter(l => l.etapa === 'perda')
  const totalVendido = ganhos.reduce((s, l) => s + (l.valor_venda || 0), 0)
  const taxaConversao = leads.length > 0 ? (ganhos.length / leads.length * 100) : 0

  // datasets dos gráficos
  const donutData = [{ name: 'Ganhos', value: ganhos.length, cor: '#34d399' }, { name: 'Perdidos', value: perdidos.length, cor: '#f87171' }]
  const motivosMap: Record<string, number> = {}
  perdidos.forEach(l => { const m = buscarMotivo(l.motivo_perda_id)?.nome || 'Sem motivo'; motivosMap[m] = (motivosMap[m] || 0) + 1 })
  const motivosData = Object.entries(motivosMap).map(([nome, qtd]) => ({ nome, qtd })).sort((a, b) => b.qtd - a.qtd).slice(0, 8)
  const turmaMap: Record<string, number> = {}
  ganhos.forEach(l => { const t = buscarTurma(l.turma_id); const nome = t?.codigo || t?.produtos?.nome || 'Sem turma'; turmaMap[nome] = (turmaMap[nome] || 0) + (l.valor_venda || 0) })
  const turmaData = Object.entries(turmaMap).map(([nome, val]) => ({ nome, val })).sort((a, b) => b.val - a.val).slice(0, 8)
  const tipProps = { contentStyle: { background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 12 }, itemStyle: { color: 'var(--text)' }, labelStyle: { color: 'var(--text-faint)' } }

  function fmt(v: number) { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

  return (
    <Layout>
      <div style={{ padding: '32px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Resultados do CRM</h1>
            <p style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 4 }}>Leads ganhos e perdidos no período</p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <input type="month" value={mesFiltro} onChange={e => setMesFiltro(e.target.value)} style={inp} />
            <Link href="/dashboard/crm" style={{ ...btnSecondary, textDecoration: 'none', display: 'inline-block' }}>← Voltar ao CRM</Link>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Ganhos</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--green)' }}>{ganhos.length}</div>
          </div>
          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Perdidos</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--red)' }}>{perdidos.length}</div>
          </div>
          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Total vendido</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--green)' }}>{fmt(totalVendido)}</div>
          </div>
          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Conversão</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--accent-soft)' }}>{taxaConversao.toFixed(1)}%</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>Conversão</div>
            {leads.length === 0 ? <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Sem dados no mês.</p> : (
              <>
                <ResponsiveContainer width="100%" height={190}>
                  <PieChart>
                    <Pie data={donutData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={78} paddingAngle={2} stroke="none">
                      {donutData.map((d, i) => <Cell key={i} fill={d.cor} />)}
                    </Pie>
                    <Tooltip {...tipProps} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 16, fontSize: 12, marginTop: 4 }}>
                  <span style={{ color: 'var(--green)' }}>● {ganhos.length} ganhos</span>
                  <span style={{ color: 'var(--red)' }}>● {perdidos.length} perdas</span>
                  <span style={{ color: 'var(--accent-soft)', fontWeight: 700 }}>{taxaConversao.toFixed(0)}%</span>
                </div>
              </>
            )}
          </div>

          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', marginBottom: 12 }}>Motivos de perda</div>
            {motivosData.length === 0 ? <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Nenhuma perda no mês.</p> : (
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={motivosData} layout="vertical" margin={{ left: 8, right: 28, top: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="nome" width={110} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'var(--surface-2)' }} {...tipProps} />
                  <Bar dataKey="qtd" fill="#f87171" radius={[0, 4, 4, 0]} barSize={15} label={{ position: 'right', fill: 'var(--text-2)', fontSize: 11, fontWeight: 600 }} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', marginBottom: 12 }}>Vendas por turma (R$)</div>
            {turmaData.length === 0 ? <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Nenhuma venda no mês.</p> : (
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={turmaData} layout="vertical" margin={{ left: 8, right: 8, top: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="nome" width={130} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'var(--surface-2)' }} {...tipProps} formatter={(v: any) => fmt(v)} />
                  <Bar dataKey="val" fill="#7c3aed" radius={[0, 4, 4, 0]} barSize={15} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[
            { id: 'todos', label: 'Todos' },
            { id: 'ganho', label: 'Ganhos' },
            { id: 'perda', label: 'Perdidos' },
          ].map(f => (
            <button key={f.id} onClick={() => setFiltro(f.id as any)}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: filtro === f.id ? 'var(--accent)' : 'transparent', color: filtro === f.id ? 'var(--on-accent)' : 'var(--text-muted)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              {f.label}
            </button>
          ))}
        </div>

        <div style={{ ...card, overflow: 'hidden' }}>
          {filtrados.length === 0 ? (
            <p style={{ padding: 24, fontSize: 14, color: 'var(--text-faint)' }}>Nenhum resultado no período selecionado.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                  {['Lead', 'Turma', 'Vendedor', 'Resultado', 'Valor / Motivo', 'Data'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map(l => {
                  const turma = buscarTurma(l.turma_id)
                  const vendedor = buscarVendedor(l.vendedor_id)
                  const motivo = buscarMotivo(l.motivo_perda_id)
                  return (
                    <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{l.nome}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>{l.whatsapp || l.email || '-'}</div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
                        {turma?.produtos?.nome || '-'}
                        {turma?.codigo && <div style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'monospace' }}>{turma.codigo}</div>}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)' }}>{vendedor?.nome || '-'}</td>
                      <td style={{ padding: '12px 16px' }}>
                        {l.etapa === 'ganho' ? (
                          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: 'var(--green-bg)', color: 'var(--green)', fontWeight: 600 }}>✓ Ganho</span>
                        ) : (
                          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: 'var(--red-bg)', color: 'var(--red)', fontWeight: 600 }}>✗ Perdido</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13 }}>
                        {l.etapa === 'ganho' ? (
                          <span style={{ color: 'var(--green)', fontWeight: 600 }}>{fmt(l.valor_venda)}</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>{motivo?.nome || '-'}</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-faint)' }}>
                        {l.etapa === 'ganho' && l.data_ganho ? new Date(l.data_ganho).toLocaleDateString('pt-BR') : ''}
                        {l.etapa === 'perda' && l.data_perda ? new Date(l.data_perda).toLocaleDateString('pt-BR') : ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Layout>
  )
}