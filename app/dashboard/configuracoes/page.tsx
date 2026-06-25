'use client'

import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import { supabase } from '@/lib/supabase'
import { invalidarCache } from '@/lib/configuracoes'

type Config = {
  chave: string
  valor: string
  tipo: 'numero' | 'percentual' | 'dinheiro' | 'dias' | 'dia_mes' | 'texto'
  categoria: string
  descricao: string
  ordem: number
  sistema: boolean
}

const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' }
const inp = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: 'var(--text)', outline: 'none' } as React.CSSProperties
const sel = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: 'var(--text)', outline: 'none' } as React.CSSProperties
const btnPrimary = { backgroundColor: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: 'var(--surface-2)', color: 'var(--text-2)', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' } as React.CSSProperties

const CATEGORIAS_LABEL: Record<string, string> = {
  financeiro: 'Financeiro',
  comissao: 'Comissão',
  categorias: 'Categorias de Lançamento',
  custom: 'Personalizadas',
}

const TIPO_LABEL: Record<string, string> = {
  numero: 'Número',
  percentual: 'Percentual',
  dinheiro: 'Dinheiro (R$)',
  dias: 'Dias',
  dia_mes: 'Dia do mês',
  texto: 'Texto',
}

function formatarValor(c: Config) {
  if (!c.valor) return '-'
  switch (c.tipo) {
    case 'percentual': return `${c.valor}%`
    case 'dinheiro': return `R$ ${parseFloat(c.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    case 'dias': return `${c.valor} dia(s)`
    case 'dia_mes': return `dia ${c.valor}`
    default: return c.valor
  }
}

export default function ConfiguracoesPage() {
  const [configs, setConfigs] = useState<Config[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aba, setAba] = useState<'financeiro' | 'comissao' | 'categorias' | 'custom'>('financeiro')
  const [editando, setEditando] = useState<string | null>(null)
  const [valorEdit, setValorEdit] = useState('')
  const [novaConfig, setNovaConfig] = useState(false)
  const [mensagem, setMensagem] = useState('')

  const [novaChave, setNovaChave] = useState('')
  const [novoValor, setNovoValor] = useState('')
  const [novoTipo, setNovoTipo] = useState<Config['tipo']>('texto')
  const [novaCategoria, setNovaCategoria] = useState('custom')
  const [novaDescricao, setNovaDescricao] = useState('')

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setCarregando(true)
    const { data } = await supabase.from('configuracoes').select('*').order('categoria').order('ordem').order('chave')
    if (data) setConfigs(data)
    setCarregando(false)
  }

  function iniciarEdicao(c: Config) {
    setEditando(c.chave)
    setValorEdit(c.valor)
    setMensagem('')
  }

async function salvarEdicao(chave: string) {
    if (!valorEdit) { setMensagem('Valor não pode ser vazio.'); return }
    setMensagem('')
    const { error } = await supabase.from('configuracoes')
      .update({ valor: valorEdit, atualizado_em: new Date().toISOString() })
      .eq('chave', chave)
    if (error) { setMensagem('Erro: ' + error.message); return }
    invalidarCache()
    setEditando(null)
    setMensagem('✓ Atualizado!')
    carregar()
    setTimeout(() => setMensagem(''), 2000)
  }

  async function salvarNovaConfig() {
    if (!novaChave || !novoValor || !novaDescricao) {
      setMensagem('Chave, valor e descrição são obrigatórios.')
      return
    }
    const chaveValida = /^[a-z0-9._]+$/.test(novaChave)
    if (!chaveValida) {
      setMensagem('Chave deve ter só letras minúsculas, números, ponto e underline (ex: custom.meu_parametro)')
      return
    }
    setMensagem('')
    const { error } = await supabase.from('configuracoes').insert({
      chave: novaChave,
      valor: novoValor,
      tipo: novoTipo,
      categoria: novaCategoria,
      descricao: novaDescricao,
      ordem: 999,
      sistema: false,
    })
    if (error) { setMensagem('Erro: ' + error.message); return }
    setNovaChave(''); setNovoValor(''); setNovoTipo('texto')
    setNovaCategoria('custom'); setNovaDescricao('')
    setNovaConfig(false)
    setMensagem('✓ Parâmetro criado!')
    carregar()
    setTimeout(() => setMensagem(''), 2000)
  }

  async function deletar(c: Config) {
    if (c.sistema) { alert('Este parâmetro é do sistema e não pode ser deletado.'); return }
    if (!confirm(`Deletar "${c.descricao}"? Essa ação não pode ser desfeita.`)) return
    await supabase.from('configuracoes').delete().eq('chave', c.chave)
    setMensagem('✓ Deletado!')
    carregar()
    setTimeout(() => setMensagem(''), 2000)
  }

  const configsFiltradas = configs.filter(c => c.categoria === aba)

  return (
    <Layout>
      <div style={{ padding: '32px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Configurações</h1>
            <p style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 4 }}>Parâmetros do sistema, editáveis sem precisar mexer no código</p>
          </div>
          <button onClick={() => setNovaConfig(!novaConfig)} style={btnPrimary}>
            {novaConfig ? 'Cancelar' : '+ Novo parâmetro'}
          </button>
        </div>

        {mensagem && (
          <div style={{ padding: 12, marginBottom: 16, background: mensagem.includes('Erro') ? 'var(--red-bg)' : 'var(--green-bg)', borderRadius: 8 }}>
            <p style={{ fontSize: 13, color: mensagem.includes('Erro') ? 'var(--red)' : 'var(--green)', margin: 0 }}>{mensagem}</p>
          </div>
        )}

        {novaConfig && (
          <div style={{ ...card, padding: 20, marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 14, marginTop: 0 }}>Novo parâmetro personalizado</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Chave (sem espaços, prefixo "custom.")
                </label>
                <input style={{ ...inp, width: '100%' }} placeholder="custom.meu_parametro" value={novaChave} onChange={e => setNovaChave(e.target.value.toLowerCase())} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Categoria</label>
                <select style={{ ...sel, width: '100%' }} value={novaCategoria} onChange={e => setNovaCategoria(e.target.value)}>
                  <option value="custom">Personalizadas</option>
                  <option value="financeiro">Financeiro</option>
                  <option value="comissao">Comissão</option>
                  <option value="categorias">Categorias de Lançamento</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Tipo</label>
                <select style={{ ...sel, width: '100%' }} value={novoTipo} onChange={e => setNovoTipo(e.target.value as Config['tipo'])}>
                  <option value="texto">Texto</option>
                  <option value="numero">Número</option>
                  <option value="percentual">Percentual</option>
                  <option value="dinheiro">Dinheiro (R$)</option>
                  <option value="dias">Dias</option>
                  <option value="dia_mes">Dia do mês</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Valor inicial</label>
                <input style={{ ...inp, width: '100%' }} value={novoValor} onChange={e => setNovoValor(e.target.value)} />
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Descrição (o que faz)</label>
              <input style={{ ...inp, width: '100%' }} value={novaDescricao} onChange={e => setNovaDescricao(e.target.value)} placeholder="Ex: % de desconto pra alunos antigos" />
            </div>
            <div style={{ background: 'var(--bg)', padding: 10, borderRadius: 6, marginBottom: 12 }}>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                ⚠️ Parâmetros criados aqui ficam armazenados, mas só vão "agir" no sistema se o desenvolvedor integrar a lógica.
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setNovaConfig(false)} style={btnSecondary}>Cancelar</button>
              <button onClick={salvarNovaConfig} style={btnPrimary}>Salvar parâmetro</button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
          {(['financeiro', 'comissao', 'categorias', 'custom'] as const).map(a => (
            <button key={a} onClick={() => setAba(a)} style={{
              padding: '10px 18px', fontSize: 14, fontWeight: 500, cursor: 'pointer',
              border: 'none', borderBottom: aba === a ? '2px solid var(--accent)' : '2px solid transparent',
              backgroundColor: 'transparent', color: aba === a ? 'var(--accent-soft)' : 'var(--text-muted)',
              marginBottom: '-1px',
            }}>
              {CATEGORIAS_LABEL[a]}
            </button>
          ))}
        </div>

        {carregando ? (
          <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Carregando...</p>
        ) : configsFiltradas.length === 0 ? (
          <div style={{ ...card, padding: 24 }}>
            <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: 0 }}>Nenhum parâmetro nesta categoria.</p>
          </div>
        ) : (
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 11, color: 'var(--text-faint)', fontWeight: 500 }}>Parâmetro</th>
                  <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 11, color: 'var(--text-faint)', fontWeight: 500 }}>Chave</th>
                  <th style={{ textAlign: 'left', padding: '12px 20px', fontSize: 11, color: 'var(--text-faint)', fontWeight: 500 }}>Tipo</th>
                  <th style={{ textAlign: 'right', padding: '12px 20px', fontSize: 11, color: 'var(--text-faint)', fontWeight: 500 }}>Valor</th>
                  <th style={{ padding: '12px 20px' }}></th>
                </tr>
              </thead>
              <tbody>
                {configsFiltradas.map(c => (
                  <tr key={c.chave} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 20px', fontSize: 13, color: 'var(--text)', verticalAlign: 'top' }}>
                      {c.descricao}
                      {c.sistema && (
                        <span style={{ fontSize: 9, marginLeft: 8, padding: '2px 6px', borderRadius: 4, background: 'var(--accent-bg)', color: 'var(--accent-soft)', textTransform: 'uppercase', fontWeight: 600 }}>
                          sistema
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: 11, color: 'var(--text-faint)', fontFamily: 'monospace', verticalAlign: 'top' }}>
                      {c.chave}
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: 12, color: 'var(--text-muted)', verticalAlign: 'top' }}>
                      {TIPO_LABEL[c.tipo]}
                    </td>
                    <td style={{ padding: '12px 20px', textAlign: 'right', verticalAlign: 'top' }}>
                      {editando === c.chave ? (
                        <input
                          autoFocus
                          style={{ ...inp, textAlign: 'right', width: 140 }}
                          value={valorEdit}
                          onChange={e => setValorEdit(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') salvarEdicao(c.chave)
                            if (e.key === 'Escape') { setEditando(null); setMensagem('') }
                          }}
                        />
                      ) : (
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--green)' }}>{formatarValor(c)}</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 20px', verticalAlign: 'top' }}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        {editando === c.chave ? (
                          <>
                            <button onClick={() => salvarEdicao(c.chave)} style={{ fontSize: 11, color: 'var(--green)', background: 'none', border: 'none', cursor: 'pointer' }}>Salvar</button>
                            <button onClick={() => { setEditando(null); setMensagem('') }} style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Cancelar</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => iniciarEdicao(c)} style={{ fontSize: 11, color: 'var(--accent-soft)', background: 'none', border: 'none', cursor: 'pointer' }}>Editar</button>
                            {!c.sistema && (
                              <button onClick={() => deletar(c)} style={{ fontSize: 11, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer' }}>Deletar</button>
                            )}
                          </>
                        )}
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