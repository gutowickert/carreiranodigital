'use client'

import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import { supabase } from '@/lib/supabase'

type VendedorComissao = {
  id: string
  nome: string
  setor: string
  matriculas_count: number
  total_vendido: number
  percentual: number
  comissao: number
  ja_aprovado: boolean
  lancamento_id?: string
  detalhes: Array<{
    matricula_id: string
    aluno_nome: string
    turma: string
    valor_parcela: number
    parcela_num: number
    parcelas_total: number
  }>
}

const card = { backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '12px' }
const inp = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', color: '#ffffff', outline: 'none' } as React.CSSProperties
const btnPrimary = { backgroundColor: '#7c3aed', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties

function calcularComissaoInterno(total: number): { pct: number; valor: number } {
  let pct = 0
  if (total <= 40000) pct = 8
  else if (total <= 60000) pct = 9
  else pct = 10
  return { pct, valor: (total * pct) / 100 }
}

export default function Comissoes() {
  const [mesFiltro, setMesFiltro] = useState(new Date().toISOString().slice(0, 7))
  const [vendedores, setVendedores] = useState<VendedorComissao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [mensagem, setMensagem] = useState('')

  useEffect(() => { carregar() }, [mesFiltro])

  async function carregar() {
    setCarregando(true)
    
    const { data: usuarios } = await supabase.from('usuarios_perfil')
      .select('id, nome, setor')
      .in('setor', ['comercial', 'comercial_externo'])
      .eq('ativo', true)

    if (!usuarios || usuarios.length === 0) {
      setVendedores([])
      setCarregando(false)
      return
    }

    const { data: matriculasData } = await supabase.from('matriculas')
      .select('id, vendedor_id, valor_pago, parcelas, data_compra, aluno_id, turma_id')
      .not('vendedor_id', 'is', null)
      .neq('status', 'cancelada')

    if (!matriculasData) {
      setVendedores([])
      setCarregando(false)
      return
    }

    const alunoIds = [...new Set(matriculasData.map(m => m.aluno_id))]
    const turmaIds = [...new Set(matriculasData.map(m => m.turma_id))]
    
    const { data: alunosData } = await supabase.from('alunos').select('id, nome').in('id', alunoIds)
    const { data: turmasData } = await supabase.from('turmas').select('id, codigo, produtos(nome), cidades(nome)').in('id', turmaIds)

    const alunosMap = new Map(alunosData?.map(a => [a.id, a.nome]) || [])
    const turmasMap = new Map(turmasData?.map((t: any) => [t.id, `${t.produtos?.nome} ${t.codigo ? '— ' + t.codigo : ''}`]) || [])

    const [ano, mes] = mesFiltro.split('-').map(Number)
    const mesAlvo = mes - 1

    const vendasPorVendedor: Record<string, any> = {}

    for (const m of matriculasData) {
      const dataCompra = new Date(m.data_compra)
      const valorParcela = m.valor_pago / (m.parcelas || 1)

      for (let i = 0; i < (m.parcelas || 1); i++) {
        const dataParcela = new Date(dataCompra)
        dataParcela.setMonth(dataParcela.getMonth() + i)
        
        if (dataParcela.getFullYear() === ano && dataParcela.getMonth() === mesAlvo) {
          if (!vendasPorVendedor[m.vendedor_id]) {
            vendasPorVendedor[m.vendedor_id] = { total: 0, count: 0, detalhes: [] }
          }
          vendasPorVendedor[m.vendedor_id].total += valorParcela
          vendasPorVendedor[m.vendedor_id].count += 1
          vendasPorVendedor[m.vendedor_id].detalhes.push({
            matricula_id: m.id,
            aluno_nome: alunosMap.get(m.aluno_id) || '-',
            turma: turmasMap.get(m.turma_id) || '-',
            valor_parcela: valorParcela,
            parcela_num: i + 1,
            parcelas_total: m.parcelas || 1,
          })
        }
      }
    }

    const dataInicio = `${mesFiltro}-01`
    const ultimoDia = new Date(ano, mes, 0).getDate()
    const dataFim = `${mesFiltro}-${String(ultimoDia).padStart(2, '0')}`

    const { data: comissoesLancadas } = await supabase.from('lancamentos_empresa')
      .select('id, descricao, valor')
      .eq('categoria', 'pessoal')
      .ilike('descricao', 'Comissão%')
      .gte('mes_referencia', dataInicio)
      .lte('mes_referencia', dataFim)

    const resultado: VendedorComissao[] = usuarios.map(u => {
      const vendas = vendasPorVendedor[u.id]
      const total = vendas?.total || 0
      let pct = 0; let comissao = 0
      
      if (u.setor === 'comercial_externo') {
        pct = 10
        comissao = (total * 10) / 100
      } else {
        const calc = calcularComissaoInterno(total)
        pct = calc.pct
        comissao = calc.valor
      }

      const lancamento = comissoesLancadas?.find(l => l.descricao?.includes(u.nome))

      return {
        id: u.id, nome: u.nome, setor: u.setor,
        matriculas_count: vendas?.count || 0,
        total_vendido: total,
        percentual: pct,
        comissao,
        ja_aprovado: !!lancamento,
        lancamento_id: lancamento?.id,
        detalhes: vendas?.detalhes || [],
      }
    }).sort((a, b) => b.total_vendido - a.total_vendido)

    setVendedores(resultado)
    setCarregando(false)
  }

  async function aprovar(v: VendedorComissao) {
    if (v.comissao <= 0) return
    setMensagem('')

    const [ano, mes] = mesFiltro.split('-').map(Number)
    const dataVencimento = new Date(ano, mes, 5)
    const dataVencStr = dataVencimento.toISOString().split('T')[0]

    const { error } = await supabase.from('lancamentos_empresa').insert({
      tipo: 'custo', categoria: 'pessoal',
      descricao: `Comissão ${v.nome} — ${mesFiltro}`,
      valor: v.comissao, unidade: 'geral',
      mes_referencia: `${mesFiltro}-01`,
      data_vencimento: dataVencStr,
      status: 'previsto',
    })

    if (error) { setMensagem('Erro: ' + error.message); return }
    
    setMensagem(`Comissão de ${v.nome} aprovada e lançada no financeiro.`)
    carregar()
  }

  async function cancelarAprovacao(v: VendedorComissao) {
    if (!v.lancamento_id) return
    if (!confirm(`Cancelar a aprovação da comissão de ${v.nome}? O lançamento será removido do financeiro.`)) return
    
    await supabase.from('lancamentos_empresa').delete().eq('id', v.lancamento_id)
    setMensagem(`Aprovação cancelada para ${v.nome}.`)
    carregar()
  }

  function fmt(v: number) { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

  const totalGeral = vendedores.reduce((s, v) => s + v.comissao, 0)
  const totalVendido = vendedores.reduce((s, v) => s + v.total_vendido, 0)
  const aprovados = vendedores.filter(v => v.ja_aprovado).length
  const pendentes = vendedores.filter(v => !v.ja_aprovado && v.comissao > 0).length

  return (
    <Layout>
      <div style={{ padding: '32px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: 0 }}>Comissões</h1>
            <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
              Interno: 8% até 40k · 9% até 60k · 10% acima · Externo: 10% fixo
            </p>
          </div>
          <input type="month" value={mesFiltro} onChange={e => setMesFiltro(e.target.value)} style={inp} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Total vendido no mês</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#34d399' }}>{fmt(totalVendido)}</div>
          </div>
          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Total comissão</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#a78bfa' }}>{fmt(totalGeral)}</div>
          </div>
          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Aprovados</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#34d399' }}>{aprovados}</div>
          </div>
          <div style={{ ...card, padding: 20 }}>
            <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Pendentes aprovação</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#fbbf24' }}>{pendentes}</div>
          </div>
        </div>

        {mensagem && (
          <div style={{ padding: 12, marginBottom: 16, background: mensagem.includes('Erro') ? '#450a0a' : '#052e16', borderRadius: 8, border: '1px solid', borderColor: mensagem.includes('Erro') ? '#f87171' : '#4ade80' }}>
            <p style={{ fontSize: 13, color: mensagem.includes('Erro') ? '#f87171' : '#34d399', margin: 0 }}>{mensagem}</p>
          </div>
        )}

        {carregando ? (
          <div style={{ ...card, padding: 24 }}>
            <p style={{ fontSize: 13, color: '#6b7280' }}>Calculando comissões...</p>
          </div>
        ) : vendedores.length === 0 ? (
          <div style={{ ...card, padding: 24 }}>
            <p style={{ fontSize: 14, color: '#6b7280' }}>Nenhum vendedor cadastrado.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {vendedores.map(v => (
              <div key={v.id} style={card}>
                <div style={{ padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{v.nome}</span>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, 
                        background: v.setor === 'comercial_externo' ? '#431407' : '#172554',
                        color: v.setor === 'comercial_externo' ? '#fb923c' : '#60a5fa',
                        textTransform: 'uppercase', fontWeight: 600 }}>
                        {v.setor === 'comercial_externo' ? 'Externo' : 'Interno'}
                      </span>
                      {v.ja_aprovado && (
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: '#052e16', color: '#34d399', textTransform: 'uppercase', fontWeight: 600 }}>
                          ✓ Aprovado
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                      {v.matriculas_count} matrícula(s) no mês
                      {v.detalhes.length > 0 && (
                        <button onClick={() => setExpandido(expandido === v.id ? null : v.id)}
                          style={{ background: 'none', border: 'none', color: '#a78bfa', fontSize: 11, cursor: 'pointer', marginLeft: 8 }}>
                          {expandido === v.id ? 'Ocultar' : 'Ver detalhes'}
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: 24, alignItems: 'center' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>Total vendido</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#34d399' }}>{fmt(v.total_vendido)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>Comissão {v.percentual}%</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#a78bfa' }}>{fmt(v.comissao)}</div>
                    </div>
                    <div>
                      {v.comissao > 0 && !v.ja_aprovado && (
                        <button onClick={() => aprovar(v)} style={{ ...btnPrimary, background: '#16a34a' }}>
                          Aprovar e lançar
                        </button>
                      )}
                      {v.ja_aprovado && (
                        <button onClick={() => cancelarAprovacao(v)}
                          style={{ background: '#3a3a3c', color: '#d1d1d1', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12, cursor: 'pointer' }}>
                          Cancelar aprovação
                        </button>
                      )}
                      {v.comissao === 0 && (
                        <span style={{ fontSize: 12, color: '#6b7280' }}>Sem vendas</span>
                      )}
                    </div>
                  </div>
                </div>

                {expandido === v.id && v.detalhes.length > 0 && (
                  <div style={{ borderTop: '1px solid #3a3a3c', padding: '16px 20px', background: '#1c1c1e' }}>
                    <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                      Composição da venda do mês
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {['Aluno', 'Turma', 'Parcela', 'Valor'].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '6px 8px', fontSize: 10, color: '#6b7280', fontWeight: 500, textTransform: 'uppercase' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {v.detalhes.map((d, i) => (
                          <tr key={i} style={{ borderTop: '1px solid #3a3a3c' }}>
                            <td style={{ padding: '8px', fontSize: 12, color: '#d1d1d1' }}>{d.aluno_nome}</td>
                            <td style={{ padding: '8px', fontSize: 11, color: '#9ca3af' }}>{d.turma}</td>
                            <td style={{ padding: '8px', fontSize: 11, color: '#9ca3af' }}>
                              {d.parcelas_total > 1 ? `${d.parcela_num}/${d.parcelas_total}` : 'À vista'}
                            </td>
                            <td style={{ padding: '8px', fontSize: 12, color: '#34d399', fontWeight: 600 }}>{fmt(d.valor_parcela)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}