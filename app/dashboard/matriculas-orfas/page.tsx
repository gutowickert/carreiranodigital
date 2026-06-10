'use client'

import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import { supabase } from '@/lib/supabase'

type MatriculaOrfa = {
  id: string
  aluno_id: string
  turma_id: string
  vendedor_id: string | null
  lead_id: string | null
  valor_pago: number
  data_compra: string
  forma_pagamento: string
  alunos?: { nome: string; cpf: string; email: string; whatsapp: string }
  turmas?: { codigo: string; produtos: { nome: string }; cidades: { nome: string } }
}

type Vendedor = { id: string; nome: string; setor: string }

const card = { backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '12px' }
const inp = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: '#ffffff', outline: 'none', width: '100%' } as React.CSSProperties
const btnPrimary = { backgroundColor: '#7c3aed', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: '#3a3a3c', color: '#d1d1d1', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties

function fmt(v: number) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function MatriculasOrfas() {
  const [matriculas, setMatriculas] = useState<MatriculaOrfa[]>([])
  const [vendedores, setVendedores] = useState<Vendedor[]>([])
  const [carregando, setCarregando] = useState(true)
  const [vinculandoId, setVinculandoId] = useState<string | null>(null)
  const [vendedorSelecionado, setVendedorSelecionado] = useState<string>('')
  const [mensagem, setMensagem] = useState('')

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setCarregando(true)
    const [matRes, vendRes] = await Promise.all([
      supabase.from('matriculas')
        .select('id, aluno_id, turma_id, vendedor_id, lead_id, valor_pago, data_compra, forma_pagamento, alunos(nome, cpf, email, whatsapp), turmas(codigo, produtos(nome), cidades(nome))')
        .is('vendedor_id', null)
        .neq('status', 'cancelada')
        .order('data_compra', { ascending: false }),
      supabase.from('usuarios_perfil')
        .select('id, nome, setor')
        .in('setor', ['comercial', 'comercial_externo'])
        .eq('ativo', true)
        .order('nome'),
    ])
    if (matRes.data) setMatriculas(matRes.data as any)
    if (vendRes.data) setVendedores(vendRes.data)
    setCarregando(false)
  }

  async function vincularVendedor(matriculaId: string) {
    if (!vendedorSelecionado) {
      setMensagem('Selecione um vendedor.')
      return
    }
    setMensagem('')

    const mat = matriculas.find(m => m.id === matriculaId)
    if (!mat) return

    // Atualiza matrícula com vendedor (vai gerar comissão automaticamente na próxima leitura)
    const { error: errMat } = await supabase.from('matriculas')
      .update({ vendedor_id: vendedorSelecionado })
      .eq('id', matriculaId)

    if (errMat) {
      setMensagem('Erro ao vincular vendedor: ' + errMat.message)
      return
    }

    // Cria um lead "virtual" já em Ganho pra manter rastreabilidade
    if (mat.alunos && mat.turma_id) {
      const { data: leadCriado } = await supabase.from('leads').insert({
        nome: mat.alunos.nome || 'Aluno HeroSpark',
        whatsapp: mat.alunos.whatsapp || null,
        email: mat.alunos.email || null,
        turma_id: mat.turma_id,
        vendedor_id: vendedorSelecionado,
        etapa: 'ganho',
        origem: 'herospark',
        valor_venda: mat.valor_pago,
        matricula_id: matriculaId,
        motivo_ganho: 'Matrícula vinculada manualmente após webhook',
        data_ganho: mat.data_compra,
      }).select().single()

      if (leadCriado) {
        await supabase.from('matriculas')
          .update({ lead_id: leadCriado.id })
          .eq('id', matriculaId)

        await supabase.from('lead_andamentos').insert({
          lead_id: leadCriado.id,
          vendedor_id: vendedorSelecionado,
          tipo: 'webhook_convertido',
          etapa_anterior: null,
          etapa_nova: 'ganho',
          observacao: 'Lead virtual criado a partir de matrícula órfã. Vendedor vinculado manualmente.',
        })
      }
    }

    setMensagem('Vendedor vinculado. Comissão será calculada na próxima visualização da tela de Comissões.')
    setVinculandoId(null)
    setVendedorSelecionado('')
    carregar()
    setTimeout(() => setMensagem(''), 5000)
  }

  async function marcarVendaDireta(matriculaId: string) {
    if (!confirm('Marcar como venda direta? Isso significa que não houve vendedor envolvido e nenhuma comissão será paga.')) return

    const mat = matriculas.find(m => m.id === matriculaId)
    if (!mat) return

    // Cria lead virtual em Ganho sem vendedor (pra manter rastreabilidade)
    if (mat.alunos && mat.turma_id) {
      const { data: leadCriado } = await supabase.from('leads').insert({
        nome: mat.alunos.nome || 'Aluno HeroSpark',
        whatsapp: mat.alunos.whatsapp || null,
        email: mat.alunos.email || null,
        turma_id: mat.turma_id,
        vendedor_id: null,
        etapa: 'ganho',
        origem: 'herospark',
        valor_venda: mat.valor_pago,
        matricula_id: matriculaId,
        motivo_ganho: 'Venda direta (sem vendedor)',
        data_ganho: mat.data_compra,
      }).select().single()

      if (leadCriado) {
        await supabase.from('matriculas')
          .update({ lead_id: leadCriado.id })
          .eq('id', matriculaId)
      }
    }

    setMensagem('Matrícula marcada como venda direta (sem comissão).')
    carregar()
    setTimeout(() => setMensagem(''), 4000)
  }

  return (
    <Layout>
      <div style={{ padding: '32px 40px' }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: 0 }}>Matrículas Órfãs</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
            Matrículas que chegaram via HeroSpark mas o sistema não conseguiu identificar o lead/vendedor automaticamente.
          </p>
        </div>

        {mensagem && (
          <div style={{ padding: 12, marginBottom: 16, background: mensagem.includes('Erro') ? '#450a0a' : '#052e16', borderRadius: 8 }}>
            <p style={{ fontSize: 13, color: mensagem.includes('Erro') ? '#f87171' : '#34d399', margin: 0 }}>{mensagem}</p>
          </div>
        )}

        <div style={{ ...card, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: matriculas.length > 0 ? '#fbbf24' : '#4ade80' }}>
            {matriculas.length}
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
            {matriculas.length === 0 ? 'Nenhuma matrícula órfã' : 'matrícula(s) aguardando vinculação'}
          </div>
        </div>

        {carregando ? (
          <p style={{ fontSize: 13, color: '#6b7280' }}>Carregando...</p>
        ) : matriculas.length === 0 ? (
          <div style={{ ...card, padding: 32, textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: '#4ade80', margin: 0, fontWeight: 500 }}>✓ Tudo em ordem</p>
            <p style={{ fontSize: 12, color: '#6b7280', marginTop: 6, margin: 0 }}>
              Todas as matrículas estão com vendedor vinculado.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {matriculas.map(mat => {
              const aluno = mat.alunos
              const turma = mat.turmas
              const expandido = vinculandoId === mat.id
              return (
                <div key={mat.id} style={{ ...card, padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
                        {aluno?.nome || '—'}
                      </div>
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>
                        {aluno?.cpf && <span>CPF: {aluno.cpf} · </span>}
                        {aluno?.whatsapp && <span>{aluno.whatsapp} · </span>}
                        {aluno?.email && <span>{aluno.email}</span>}
                      </div>
                      <div style={{ fontSize: 11, color: '#a78bfa', marginTop: 6 }}>
                        {turma?.produtos?.nome} — {turma?.cidades?.nome} {turma?.codigo ? '(' + turma.codigo + ')' : ''}
                      </div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                        Compra: {new Date(mat.data_compra).toLocaleDateString('pt-BR')} · {mat.forma_pagamento}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#34d399' }}>{fmt(mat.valor_pago)}</div>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      {!expandido && (
                        <>
                          <button onClick={() => setVinculandoId(mat.id)} style={btnPrimary}>
                            Vincular vendedor
                          </button>
                          <button onClick={() => marcarVendaDireta(mat.id)} style={btnSecondary}>
                            Venda direta
                          </button>
                        </>
                      )}
                      {expandido && (
                        <button onClick={() => { setVinculandoId(null); setVendedorSelecionado('') }} style={btnSecondary}>
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>

                  {expandido && (
                    <div style={{ padding: 16, borderTop: '1px solid #3a3a3c', background: '#1c1c1e' }}>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>
                        Selecione o vendedor responsável (vai gerar comissão retroativa):
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <select style={{ ...inp, cursor: 'pointer' }} value={vendedorSelecionado} onChange={e => setVendedorSelecionado(e.target.value)}>
                          <option value="">Selecione um vendedor</option>
                          {vendedores.map(v => (
                            <option key={v.id} value={v.id}>
                              {v.nome} ({v.setor === 'comercial_externo' ? 'Externo' : 'Interno'})
                            </option>
                          ))}
                        </select>
                        <button onClick={() => vincularVendedor(mat.id)} disabled={!vendedorSelecionado}
                          style={{ ...btnPrimary, opacity: vendedorSelecionado ? 1 : 0.5 }}>
                          Confirmar vínculo
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}
