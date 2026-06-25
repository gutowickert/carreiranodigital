'use client'

import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' }
const inp = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', color: 'var(--text)', outline: 'none' } as React.CSSProperties
const btnSecondary = { backgroundColor: 'var(--surface-2)', color: 'var(--text-2)', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties

export default function ResultadosExterno() {
  const [prospeccoes, setProspeccoes] = useState<any[]>([])
  const [turmas, setTurmas] = useState<any[]>([])
  const [vendedores, setVendedores] = useState<any[]>([])
  const [motivos, setMotivos] = useState<any[]>([])
  const [filtro, setFiltro] = useState<'todos' | 'ganho' | 'perdido'>('todos')
  const [mesFiltro, setMesFiltro] = useState(new Date().toISOString().slice(0, 7))

  useEffect(() => { carregar() }, [mesFiltro])

  async function carregar() {
    const { data, error } = await supabase.from('prospeccoes_externas')
      .select('*')
      .in('etapa', ['ganho', 'perdido'])
      .order('atualizado_em', { ascending: false })

    if (error) { console.error('Erro:', error); return }

    const { data: turmasData } = await supabase.from('turmas').select('id, codigo, produtos(nome), cidades(nome)')
    const { data: vendedoresData } = await supabase.from('usuarios_perfil').select('id, nome')
    const { data: motivosData } = await supabase.from('motivos_perda').select('id, nome')

    setTurmas(turmasData || [])
    setVendedores(vendedoresData || [])
    setMotivos(motivosData || [])

    if (data) {
      const filtradosMes = data.filter((p: any) => {
        const ref = p.data_ganho || p.data_perda
        if (!ref) return false
        return ref.startsWith(mesFiltro)
      })
      setProspeccoes(filtradosMes)
    }
  }

  function buscarTurma(id: string) { return turmas.find(t => t.id === id) }
  function buscarVendedor(id: string) { return vendedores.find(v => v.id === id) }
  function buscarMotivo(id: string) { return motivos.find(m => m.id === id) }

  const filtrados = prospeccoes.filter(p => filtro === 'todos' || p.etapa === filtro)
  const ganhos = prospeccoes.filter(p => p.etapa === 'ganho')
  const perdidos = prospeccoes.filter(p => p.etapa === 'perdido')
  const totalVendido = ganhos.reduce((s, p) => s + (p.valor_venda || 0), 0)
  const taxaConversao = prospeccoes.length > 0 ? (ganhos.length / prospeccoes.length * 100) : 0

  function fmt(v: number) { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

  return (
    <Layout>
      <div style={{ padding: '32px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Resultados do CRM Externo</h1>
            <p style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 4 }}>Prospecções ganhas e perdidas no período</p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <input type="month" value={mesFiltro} onChange={e => setMesFiltro(e.target.value)} style={inp} />
            <Link href="/dashboard/crm-externo" style={{ ...btnSecondary, textDecoration: 'none', display: 'inline-block' }}>← Voltar</Link>
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

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[
            { id: 'todos', label: 'Todos' },
            { id: 'ganho', label: 'Ganhos' },
            { id: 'perdido', label: 'Perdidos' },
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
                  {['Contato', 'Empresa', 'Cidade', 'Turma', 'Vendedor', 'Resultado', 'Valor / Motivo', 'Data'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map(p => {
                  const turma = buscarTurma(p.turma_id)
                  const vendedor = buscarVendedor(p.vendedor_id)
                  const motivo = buscarMotivo(p.motivo_perda_id)
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{p.nome_contato}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>{p.whatsapp || p.email || '-'}</div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>{p.empresa || '-'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>{p.cidade || '-'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
                        {turma?.produtos?.nome || '-'}
                        {turma?.codigo && <div style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'monospace' }}>{turma.codigo}</div>}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)' }}>{vendedor?.nome || '-'}</td>
                      <td style={{ padding: '12px 16px' }}>
                        {p.etapa === 'ganho' ? (
                          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: 'var(--green-bg)', color: 'var(--green)', fontWeight: 600 }}>✓ Ganho</span>
                        ) : (
                          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: 'var(--red-bg)', color: 'var(--red)', fontWeight: 600 }}>✗ Perdido</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13 }}>
                        {p.etapa === 'ganho' ? (
                          <span style={{ color: 'var(--green)', fontWeight: 600 }}>{fmt(p.valor_venda)}</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>{motivo?.nome || '-'}</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-faint)' }}>
                        {p.etapa === 'ganho' && p.data_ganho ? new Date(p.data_ganho).toLocaleDateString('pt-BR') : ''}
                        {p.etapa === 'perdido' && p.data_perda ? new Date(p.data_perda).toLocaleDateString('pt-BR') : ''}
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