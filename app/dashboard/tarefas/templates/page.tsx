'use client'

import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import { supabase } from '@/lib/supabase'

type Template = {
  id: string
  titulo: string
  setor: string
  referencia: 'inicio' | 'fim'
  quando: 'antes' | 'depois'
  dias: number
  ativo: boolean
  ordem: number
}

const card = { backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '12px' }
const inp = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: '#fff', outline: 'none' } as React.CSSProperties
const sel = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: '#fff', outline: 'none' } as React.CSSProperties
const btnPrimary = { backgroundColor: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: '#3a3a3c', color: '#d1d1d1', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' } as React.CSSProperties

const SETORES = [
  { id: 'admin', label: 'Admin' },
  { id: 'operacoes', label: 'Operações' },
  { id: 'comercial', label: 'Comercial' },
  { id: 'comercial_externo', label: 'Comercial Externo' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'pos_venda', label: 'Pós-venda' },
]

const SETOR_LABEL: Record<string, string> = SETORES.reduce((acc, s) => ({ ...acc, [s.id]: s.label }), {})

function descreverPrazo(t: Template) {
  const refLabel = t.referencia === 'inicio' ? 'do início' : 'do fim'
  const quandoLabel = t.quando === 'antes' ? 'antes' : 'depois'
  return `${t.dias} dia(s) ${quandoLabel} ${refLabel}`
}
export default function TarefasTemplates() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [carregando, setCarregando] = useState(true)
  const [editando, setEditando] = useState<string | null>(null)
  const [novoForm, setNovoForm] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [aplicarTurmasFuturas, setAplicarTurmasFuturas] = useState(false)

  const [form, setForm] = useState({
    titulo: '',
    setor: 'operacoes',
    referencia: 'inicio' as 'inicio' | 'fim',
    quando: 'antes' as 'antes' | 'depois',
    dias: '1',
  })

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setCarregando(true)
    const { data } = await supabase.from('tarefa_templates').select('*').order('ordem').order('titulo')
    if (data) setTemplates(data)
    setCarregando(false)
  }

  function abrirNovo() {
    setForm({ titulo: '', setor: 'operacoes', referencia: 'inicio', quando: 'antes', dias: '1' })
    setEditando(null)
    setAplicarTurmasFuturas(false)
    setNovoForm(true)
  }

  function abrirEdicao(t: Template) {
    setForm({
      titulo: t.titulo,
      setor: t.setor,
      referencia: t.referencia,
      quando: t.quando,
      dias: t.dias.toString(),
    })
    setEditando(t.id)
    setAplicarTurmasFuturas(false)
    setNovoForm(true)
  }
  async function aplicarTemplateEmTurmasFuturas(template: Template) {
    const hoje = new Date().toISOString().split('T')[0]
    const { data: turmas } = await supabase.from('turmas')
      .select('id, data_inicio, data_fim, produto_id, produtos(nome)')
      .gte('data_inicio', hoje)
      .neq('status', 'cancelada')

    if (!turmas || turmas.length === 0) return 0

    const { data: usuariosPerfil } = await supabase.from('usuarios_perfil').select('id, setor').eq('ativo', true)
    const usuariosPorSetor: Record<string, string> = {}
    usuariosPerfil?.forEach((u: any) => { if (u.setor && !usuariosPorSetor[u.setor]) usuariosPorSetor[u.setor] = u.id })

    const tarefasNovas = turmas.map((t: any) => {
      const dataRef = template.referencia === 'inicio' ? t.data_inicio : t.data_fim
      const sinal = template.quando === 'antes' ? -1 : 1
      const dataRefObj = new Date(dataRef + 'T12:00:00')
      dataRefObj.setDate(dataRefObj.getDate() + (sinal * template.dias))
      const dataPrazo = dataRefObj.toISOString().split('T')[0]

      return {
        turma_id: t.id,
        titulo: `${template.titulo} — ${t.produtos?.nome || ''}`,
        setor: template.setor,
        tipo: 'prevista',
        data_prazo: dataPrazo,
        status: 'pendente',
        prioridade: 'normal',
        usuario_id: usuariosPorSetor[template.setor] || null,
      }
    })

    await supabase.from('tarefas').insert(tarefasNovas)
    return tarefasNovas.length
  }

  async function salvar() {
    if (!form.titulo) { setMensagem('Título é obrigatório.'); return }
    if (!form.dias || isNaN(parseInt(form.dias))) { setMensagem('Dias deve ser número.'); return }
    setMensagem('')

    const payload = {
      titulo: form.titulo,
      setor: form.setor,
      referencia: form.referencia,
      quando: form.quando,
      dias: parseInt(form.dias),
    }

    if (editando) {
      const { error } = await supabase.from('tarefa_templates').update(payload).eq('id', editando)
      if (error) { setMensagem('Erro: ' + error.message); return }
      setMensagem('✓ Template atualizado!')
    } else {
      const { data, error } = await supabase.from('tarefa_templates')
        .insert({ ...payload, ordem: 999 })
        .select()
        .single()
      if (error || !data) { setMensagem('Erro: ' + error?.message); return }

      if (aplicarTurmasFuturas) {
        const qtd = await aplicarTemplateEmTurmasFuturas(data)
        setMensagem(`✓ Template criado e aplicado em ${qtd} turma(s) futura(s)!`)
      } else {
        setMensagem('✓ Template criado!')
      }
    }

    setNovoForm(false)
    setEditando(null)
    carregar()
    setTimeout(() => setMensagem(''), 3000)
  }

  async function alternarAtivo(t: Template) {
    await supabase.from('tarefa_templates').update({ ativo: !t.ativo }).eq('id', t.id)
    carregar()
  }

  async function deletar(t: Template) {
    if (!confirm(`Deletar template "${t.titulo}"?\n\nAtenção: tarefas já criadas nas turmas existentes NÃO serão removidas.`)) return
    await supabase.from('tarefa_templates').delete().eq('id', t.id)
    setMensagem('✓ Template removido!')
    carregar()
    setTimeout(() => setMensagem(''), 2000)
  }
  return (
    <Layout>
      <div style={{ padding: '32px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: 0 }}>Templates de Tarefas</h1>
            <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
              Tarefas criadas automaticamente quando uma turma é aberta
            </p>
          </div>
          <button onClick={abrirNovo} style={btnPrimary}>+ Novo template</button>
        </div>

        {mensagem && (
          <div style={{ padding: 12, marginBottom: 16, background: mensagem.includes('Erro') ? '#450a0a' : '#052e16', borderRadius: 8 }}>
            <p style={{ fontSize: 13, color: mensagem.includes('Erro') ? '#f87171' : '#34d399', margin: 0 }}>{mensagem}</p>
          </div>
        )}

        {novoForm && (
          <div style={{ ...card, padding: 20, marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 14, marginTop: 0 }}>
              {editando ? 'Editar template' : 'Novo template'}
            </h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Título da tarefa</label>
              <input style={{ ...inp, width: '100%' }} value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ex: Confirmar professor" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Setor responsável</label>
                <select style={{ ...sel, width: '100%' }} value={form.setor} onChange={e => setForm(f => ({ ...f, setor: e.target.value }))}>
                  {SETORES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Referência</label>
                <select style={{ ...sel, width: '100%' }} value={form.referencia} onChange={e => setForm(f => ({ ...f, referencia: e.target.value as 'inicio' | 'fim' }))}>
                  <option value="inicio">Início da turma</option>
                  <option value="fim">Fim da turma</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Quando</label>
                <select style={{ ...sel, width: '100%' }} value={form.quando} onChange={e => setForm(f => ({ ...f, quando: e.target.value as 'antes' | 'depois' }))}>
                  <option value="antes">Antes</option>
                  <option value="depois">Depois</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Dias</label>
                <input type="number" min="0" style={{ ...inp, width: '100%' }} value={form.dias} onChange={e => setForm(f => ({ ...f, dias: e.target.value }))} />
              </div>
            </div>

            {!editando && (
              <div style={{ background: '#1c1c1e', padding: 12, borderRadius: 6, marginBottom: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={aplicarTurmasFuturas} onChange={e => setAplicarTurmasFuturas(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: '#7c3aed', cursor: 'pointer' }} />
                  <span style={{ fontSize: 13, color: '#d1d1d1' }}>Aplicar este template em todas as turmas futuras já cadastradas</span>
                </label>
                <p style={{ fontSize: 10, color: '#6b7280', marginTop: 6, marginLeft: 24 }}>
                  Se marcado, cria a tarefa imediatamente em todas as turmas com data de início ainda no futuro.
                </p>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => { setNovoForm(false); setEditando(null) }} style={btnSecondary}>Cancelar</button>
              <button onClick={salvar} style={btnPrimary}>{editando ? 'Atualizar' : 'Criar template'}</button>
            </div>
          </div>
        )}

        {carregando ? (
          <p style={{ fontSize: 13, color: '#6b7280' }}>Carregando...</p>
        ) : templates.length === 0 ? (
          <div style={{ ...card, padding: 24 }}>
            <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Nenhum template cadastrado.</p>
          </div>
        ) : (
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #3a3a3c' }}>
                  <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 11, color: '#6b7280', fontWeight: 500 }}>Tarefa</th>
                  <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 11, color: '#6b7280', fontWeight: 500 }}>Setor</th>
                  <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 11, color: '#6b7280', fontWeight: 500 }}>Prazo</th>
                  <th style={{ textAlign: 'center', padding: '12px 20px', fontSize: 11, color: '#6b7280', fontWeight: 500 }}>Status</th>
                  <th style={{ padding: '12px 20px' }}></th>
                </tr>
              </thead>
              <tbody>
                {templates.map(t => (
                  <tr key={t.id} style={{ borderBottom: '1px solid #3a3a3c', opacity: t.ativo ? 1 : 0.5 }}>
                    <td style={{ padding: '12px 20px', fontSize: 13, color: '#fff' }}>{t.titulo}</td>
                    <td style={{ padding: '12px 20px', fontSize: 12, color: '#9ca3af' }}>{SETOR_LABEL[t.setor] || t.setor}</td>
                    <td style={{ padding: '12px 20px', fontSize: 12, color: '#9ca3af' }}>{descreverPrazo(t)}</td>
                    <td style={{ padding: '12px 20px', textAlign: 'center' }}>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4,
                        background: t.ativo ? '#052e16' : '#3a3a3c',
                        color: t.ativo ? '#34d399' : '#9ca3af',
                        textTransform: 'uppercase', fontWeight: 600 }}>
                        {t.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 20px' }}>
                      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                        <button onClick={() => abrirEdicao(t)} style={{ fontSize: 11, color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer' }}>Editar</button>
                        <button onClick={() => alternarAtivo(t)} style={{ fontSize: 11, color: t.ativo ? '#fbbf24' : '#34d399', background: 'none', border: 'none', cursor: 'pointer' }}>
                          {t.ativo ? 'Desativar' : 'Ativar'}
                        </button>
                        <button onClick={() => deletar(t)} style={{ fontSize: 11, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer' }}>Deletar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  )
}