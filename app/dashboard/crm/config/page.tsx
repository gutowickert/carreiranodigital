'use client'

import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type Turma = { id: string; codigo: string; produtos: { nome: string }; cidades: { nome: string } }
type Vendedor = { id: string; nome: string; email: string }
type ConfigVendedor = { id?: string; turma_id: string; vendedor_id: string; leads_por_ciclo: number; ordem: number; ativo: boolean; vendedor_nome?: string }

const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' }
const inp = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: 'var(--text)', outline: 'none', width: '100%' } as React.CSSProperties
const sel = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: 'var(--text)', outline: 'none' } as React.CSSProperties
const btnPrimary = { backgroundColor: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: 'var(--surface-2)', color: 'var(--text-2)', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' } as React.CSSProperties

export default function ConfigCRM() {
  const [turmas, setTurmas] = useState<Turma[]>([])
  const [vendedores, setVendedores] = useState<Vendedor[]>([])
  const [turmaSelecionada, setTurmaSelecionada] = useState<string>('')
  const [configs, setConfigs] = useState<ConfigVendedor[]>([])
  const [mensagem, setMensagem] = useState('')
  const [carregandoConfig, setCarregandoConfig] = useState(false)

  useEffect(() => { carregarTudo() }, [])
  useEffect(() => { if (turmaSelecionada) carregarConfigsTurma(turmaSelecionada) }, [turmaSelecionada])

  async function carregarTudo() {
    await Promise.all([carregarTurmas(), carregarVendedores()])
  }

  async function carregarTurmas() {
    const { data } = await supabase.from('turmas')
      .select('id, codigo, produtos(nome), cidades(nome)')
      .in('status', ['planejada', 'em_vendas', 'confirmada'])
      .order('data_inicio', { ascending: false })
    if (data) setTurmas(data as any)
  }

  async function carregarVendedores() {
    const { data } = await supabase.from('usuarios_perfil')
      .select('id, nome, email').eq('setor', 'comercial').eq('ativo', true).order('nome')
    if (data) setVendedores(data)
  }

  async function carregarConfigsTurma(turmaId: string) {
    setCarregandoConfig(true)
    const { data } = await supabase.from('vendedor_config_turma')
      .select('*, usuarios_perfil!vendedor_config_turma_vendedor_id_fkey(nome)')
      .eq('turma_id', turmaId)
      .order('ordem')
    
    if (data) {
      setConfigs(data.map((c: any) => ({
        id: c.id, turma_id: c.turma_id, vendedor_id: c.vendedor_id,
        leads_por_ciclo: c.leads_por_ciclo, ordem: c.ordem, ativo: c.ativo,
        vendedor_nome: c.usuarios_perfil?.nome,
      })))
    }
    setCarregandoConfig(false)
  }

  function adicionarVendedor() {
    if (!turmaSelecionada) return
    const novaOrdem = configs.length + 1
    setConfigs([...configs, {
      turma_id: turmaSelecionada, vendedor_id: '',
      leads_por_ciclo: 3, ordem: novaOrdem, ativo: true,
    }])
  }

  function removerLinha(index: number) {
    setConfigs(configs.filter((_, i) => i !== index))
  }

  function atualizarConfig(index: number, campo: keyof ConfigVendedor, valor: any) {
    const novas = [...configs]
    novas[index] = { ...novas[index], [campo]: valor }
    setConfigs(novas)
  }

  function moverOrdem(index: number, direcao: 'cima' | 'baixo') {
    const novas = [...configs]
    const alvo = direcao === 'cima' ? index - 1 : index + 1
    if (alvo < 0 || alvo >= novas.length) return
    
    const temp = novas[index]
    novas[index] = novas[alvo]
    novas[alvo] = temp
    
    // Atualiza ordens
    novas.forEach((c, i) => { c.ordem = i + 1 })
    setConfigs(novas)
  }

  async function salvarConfig() {
    if (!turmaSelecionada) return
    setMensagem('')

    // Valida
    const vendedoresUnicos = new Set(configs.map(c => c.vendedor_id).filter(Boolean))
    if (vendedoresUnicos.size !== configs.filter(c => c.vendedor_id).length) {
      setMensagem('Erro: Vendedor duplicado na lista.')
      return
    }

    // Apaga config antiga
    await supabase.from('vendedor_config_turma').delete().eq('turma_id', turmaSelecionada)

    // Insere nova
    const paraInserir = configs
      .filter(c => c.vendedor_id)
      .map((c, i) => ({
        turma_id: turmaSelecionada,
        vendedor_id: c.vendedor_id,
        leads_por_ciclo: c.leads_por_ciclo,
        ordem: i + 1,
        ativo: c.ativo,
      }))

    if (paraInserir.length > 0) {
      const { error } = await supabase.from('vendedor_config_turma').insert(paraInserir)
      if (error) { setMensagem('Erro: ' + error.message); return }
    }

    // Reseta o contador de rateio para começar do zero
    await supabase.from('rateio_estado').delete().eq('turma_id', turmaSelecionada)

    setMensagem('Configuração salva com sucesso!')
    carregarConfigsTurma(turmaSelecionada)
  }

  return (
    <Layout>
      <div style={{ padding: '32px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Configuração do CRM</h1>
            <p style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 4 }}>Defina quais vendedores recebem leads de cada turma e o rateio (round-robin)</p>
          </div>
          <Link href="/dashboard/crm" style={{ ...btnSecondary, textDecoration: 'none', display: 'inline-block' }}>← Voltar</Link>
        </div>

        <div style={{ ...card, padding: 24, marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Selecione a turma para configurar
          </label>
          <select style={{ ...sel, width: '100%' }} value={turmaSelecionada} onChange={e => setTurmaSelecionada(e.target.value)}>
            <option value="">— Selecione uma turma</option>
            {turmas.map(t => (
              <option key={t.id} value={t.id}>
                {t.produtos?.nome} — {t.cidades?.nome} {t.codigo ? '(' + t.codigo + ')' : ''}
              </option>
            ))}
          </select>
        </div>

        {turmaSelecionada && (
          <div style={{ ...card, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Rateio de leads</h2>
                <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4 }}>
                  Vendedores ativos recebem leads na ordem definida. Cada um pega "X leads" antes de passar para o próximo.
                </p>
              </div>
              <button onClick={adicionarVendedor} style={btnPrimary}>+ Adicionar vendedor</button>
            </div>

            {carregandoConfig ? (
              <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Carregando...</p>
            ) : configs.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 8 }}>
                <p style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 12 }}>Nenhum vendedor configurado para esta turma.</p>
                <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Sem configuração, os leads serão criados sem vendedor atribuído.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {configs.map((c, i) => (
                  <div key={i} style={{ background: 'var(--bg)', borderRadius: 8, padding: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <button onClick={() => moverOrdem(i, 'cima')} disabled={i === 0}
                        style={{ background: 'none', border: 'none', color: i === 0 ? 'var(--border)' : 'var(--accent-soft)', cursor: i === 0 ? 'default' : 'pointer', fontSize: 12, padding: 2 }}>▲</button>
                      <button onClick={() => moverOrdem(i, 'baixo')} disabled={i === configs.length - 1}
                        style={{ background: 'none', border: 'none', color: i === configs.length - 1 ? 'var(--border)' : 'var(--accent-soft)', cursor: i === configs.length - 1 ? 'default' : 'pointer', fontSize: 12, padding: 2 }}>▼</button>
                    </div>

                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-soft)', width: 32, textAlign: 'center' }}>
                      {i + 1}º
                    </div>

                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Vendedor</label>
                      <select style={{ ...sel, width: '100%' }} value={c.vendedor_id} onChange={e => atualizarConfig(i, 'vendedor_id', e.target.value)}>
                        <option value="">Selecione</option>
                        {vendedores.map(v => (
                          <option key={v.id} value={v.id}>{v.nome}</option>
                        ))}
                      </select>
                    </div>

                    <div style={{ width: 140 }}>
                      <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Leads por ciclo</label>
                      <input type="number" min="1" max="100" style={inp}
                        value={c.leads_por_ciclo}
                        onChange={e => atualizarConfig(i, 'leads_por_ciclo', parseInt(e.target.value) || 1)} />
                    </div>

                    <div style={{ width: 100 }}>
                      <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Ativo</label>
                      <button onClick={() => atualizarConfig(i, 'ativo', !c.ativo)}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: 'none',
                          background: c.ativo ? 'var(--green-bg)' : 'var(--surface-2)',
                          color: c.ativo ? 'var(--green-strong)' : 'var(--text-muted)',
                          fontSize: 12, cursor: 'pointer' }}>
                        {c.ativo ? 'Sim' : 'Não'}
                      </button>
                    </div>

                    <button onClick={() => removerLinha(i)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 18, padding: '8px 12px', alignSelf: 'flex-end' }}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {configs.length > 0 && (
              <div style={{ marginTop: 16, padding: 12, background: 'var(--blue-bg)', border: '1px solid var(--blue)', borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600, marginBottom: 6 }}>
                  📋 Como funciona o rateio
                </div>
                <div style={{ fontSize: 11, color: 'var(--blue)', lineHeight: 1.5 }}>
                  Exemplo com a config atual: {configs.filter(c => c.vendedor_id && c.ativo).map((c, i) => 
                    `${c.vendedor_nome || vendedores.find(v => v.id === c.vendedor_id)?.nome} (${c.leads_por_ciclo} leads)`
                  ).join(' → ')}
                  {configs.filter(c => c.vendedor_id && c.ativo).length > 0 && ' → reinicia'}
                </div>
              </div>
            )}

            {mensagem && (
              <p style={{ marginTop: 16, fontSize: 13, color: mensagem.includes('Erro') ? 'var(--red)' : 'var(--green-strong)' }}>
                {mensagem}
              </p>
            )}

            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={salvarConfig} style={btnPrimary}>Salvar configuração</button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}