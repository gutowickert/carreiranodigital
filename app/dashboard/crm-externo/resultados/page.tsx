'use client'

import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

const card = { backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '12px' }
const inp = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', color: '#ffffff', outline: 'none' } as React.CSSProperties
const btnSecondary = { backgroundColor: '#3a3a3c', color: '#d1d1d1', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties

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
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: 0 }}>Resultados do CRM Externo</h1>
            <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Prospecções ganhas e perdidas no período</p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <input type="month" value={mesFiltro} onChange={e => setMesFiltro(e.target.value)} style={inp} />
            <Link href="/dashboard/crm-externo" style={{ ...btnSecondary, textDecoration: 'none', display: 'inline-block' }}>← Voltar</Link>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Ganhos</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#34d399' }}>{ganhos.length}</div>
          </div>
          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Perdidos</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#f87171' }}>{perdidos.length}</div>
          </div>
          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Total vendido</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#34d399' }}>{fmt(totalVendido)}</div>
          </div>
          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Conversão</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#a78bfa' }}>{taxaConversao.toFixed(1)}%</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[
            { id: 'todos', label: 'Todos' },
            { id: 'ganho', label: 'Ganhos' },
            { id: 'perdido', label: 'Perdidos' },
          ].map(f => (
            <button key={f.id} onClick={() => setFiltro(f.id as any)}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #3a3a3c', background: filtro === f.id ? '#7c3aed' : 'transparent', color: filtro === f.id ? '#fff' : '#9ca3af', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              {f.label}
            </button>
          ))}
        </div>

        <div style={{ ...card, overflow: 'hidden' }}>
          {filtrados.length === 0 ? (
            <p style={{ padding: 24, fontSize: 14, color: '#6b7280' }}>Nenhum resultado no período selecionado.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #3a3a3c', background: '#1c1c1e' }}>
                  {['Contato', 'Empresa', 'Cidade', 'Turma', 'Vendedor', 'Resultado', 'Valor / Motivo', 'Data'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map(p => {
                  const turma = buscarTurma(p.turma_id)
                  const vendedor = buscarVendedor(p.vendedor_id)
                  const motivo = buscarMotivo(p.motivo_perda_id)
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid #3a3a3c' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{p.nome_contato}</div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{p.whatsapp || p.email || '-'}</div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: '#9ca3af' }}>{p.empresa || '-'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: '#9ca3af' }}>{p.cidade || '-'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: '#9ca3af' }}>
                        {turma?.produtos?.nome || '-'}
                        {turma?.codigo && <div style={{ fontSize: 10, color: '#6b7280', fontFamily: 'monospace' }}>{turma.codigo}</div>}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#9ca3af' }}>{vendedor?.nome || '-'}</td>
                      <td style={{ padding: '12px 16px' }}>
                        {p.etapa === 'ganho' ? (
                          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#052e16', color: '#34d399', fontWeight: 600 }}>✓ Ganho</span>
                        ) : (
                          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#450a0a', color: '#f87171', fontWeight: 600 }}>✗ Perdido</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13 }}>
                        {p.etapa === 'ganho' ? (
                          <span style={{ color: '#34d399', fontWeight: 600 }}>{fmt(p.valor_venda)}</span>
                        ) : (
                          <span style={{ color: '#9ca3af' }}>{motivo?.nome || '-'}</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: '#6b7280' }}>
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