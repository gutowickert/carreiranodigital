'use client'

import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type LeadResultado = {
  id: string
  nome: string
  whatsapp: string
  email: string
  turma_id: string
  vendedor_id: string
  etapa: string
  valor_venda: number
  data_ganho: string
  data_perda: string
  motivo_perda_id: string
  observacoes: string
  criado_em: string
  turmas?: { id: string; codigo: string; produtos: { nome: string }; cidades: { nome: string } }
  usuarios_perfil?: { id: string; nome: string }
  motivos_perda?: { id: string; nome: string }
}

const card = { backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '12px' }
const inp = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', color: '#ffffff', outline: 'none' } as React.CSSProperties
const btnSecondary = { backgroundColor: '#3a3a3c', color: '#d1d1d1', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties

export default function Resultados() {
  const [leads, setLeads] = useState<LeadResultado[]>([])
  const [filtro, setFiltro] = useState<'todos' | 'ganho' | 'perdido'>('todos')
  const [mesFiltro, setMesFiltro] = useState(new Date().toISOString().slice(0, 7))

  useEffect(() => { carregar() }, [mesFiltro])

  async function carregar() {
    const [y, m] = mesFiltro.split('-').map(Number)
    const ultimoDia = new Date(y, m, 0).getDate()
    const dataInicio = mesFiltro + '-01'
    const dataFim = `${mesFiltro}-${String(ultimoDia).padStart(2, '0')}`

    const { data } = await supabase.from('leads')
      .select(`
        *,
        turmas(id, codigo, produtos(nome), cidades(nome)),
        usuarios_perfil!leads_vendedor_id_fkey(id, nome),
        motivos_perda(id, nome)
      `)
      .in('etapa', ['ganho', 'perdido'])
      .or(`and(data_ganho.gte.${dataInicio},data_ganho.lte.${dataFim}T23:59:59),and(data_perda.gte.${dataInicio},data_perda.lte.${dataFim}T23:59:59)`)
      .order('atualizado_em', { ascending: false })

    if (data) setLeads(data as any)
  }

  const filtrados = leads.filter(l => filtro === 'todos' || l.etapa === filtro)
  const ganhos = leads.filter(l => l.etapa === 'ganho')
  const perdidos = leads.filter(l => l.etapa === 'perdido')
  const totalVendido = ganhos.reduce((s, l) => s + (l.valor_venda || 0), 0)
  const taxaConversao = leads.length > 0 ? (ganhos.length / leads.length * 100) : 0

  function fmt(v: number) { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

  return (
    <Layout>
      <div style={{ padding: '32px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: 0 }}>Resultados do CRM</h1>
            <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Leads ganhos e perdidos no período</p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <input type="month" value={mesFiltro} onChange={e => setMesFiltro(e.target.value)} style={inp} />
            <Link href="/dashboard/crm" style={{ ...btnSecondary, textDecoration: 'none', display: 'inline-block' }}>← Voltar ao CRM</Link>
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
                  {['Lead', 'Turma', 'Vendedor', 'Resultado', 'Valor / Motivo', 'Data'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map(l => (
                  <tr key={l.id} style={{ borderBottom: '1px solid #3a3a3c' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{l.nome}</div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{l.whatsapp || l.email || '-'}</div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#9ca3af' }}>
                      {l.turmas?.produtos?.nome || '-'}
                      {l.turmas?.codigo && <div style={{ fontSize: 10, color: '#6b7280', fontFamily: 'monospace' }}>{l.turmas.codigo}</div>}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#9ca3af' }}>{l.usuarios_perfil?.nome || '-'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      {l.etapa === 'ganho' ? (
                        <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#052e16', color: '#34d399', fontWeight: 600 }}>✓ Ganho</span>
                      ) : (
                        <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#450a0a', color: '#f87171', fontWeight: 600 }}>✗ Perdido</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13 }}>
                      {l.etapa === 'ganho' ? (
                        <span style={{ color: '#34d399', fontWeight: 600 }}>{fmt(l.valor_venda)}</span>
                      ) : (
                        <span style={{ color: '#9ca3af' }}>{l.motivos_perda?.nome || '-'}</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#6b7280' }}>
                      {l.etapa === 'ganho' && l.data_ganho ? new Date(l.data_ganho).toLocaleDateString('pt-BR') : ''}
                      {l.etapa === 'perdido' && l.data_perda ? new Date(l.data_perda).toLocaleDateString('pt-BR') : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Layout>
  )
}