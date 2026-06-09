'use client'

import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import { supabase } from '@/lib/supabase'

type Log = {
  id: string
  origem: string
  evento: string | null
  payload: any
  status: 'recebido' | 'processado' | 'erro' | 'ignorado'
  erro: string | null
  matricula_id: string | null
  recebido_em: string
  processado_em: string | null
}

const card = { backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '12px' } as React.CSSProperties
const btnPrimary = { backgroundColor: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' } as React.CSSProperties
const btnSecondary = { backgroundColor: '#3a3a3c', color: '#d1d1d1', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontWeight: 500, cursor: 'pointer' } as React.CSSProperties

const statusInfo: Record<string, { bg: string; color: string; label: string }> = {
  recebido: { bg: '#1c1917', color: '#9ca3af', label: 'Recebido' },
  processado: { bg: '#052e16', color: '#4ade80', label: 'Processado' },
  erro: { bg: '#450a0a', color: '#f87171', label: 'Erro' },
  ignorado: { bg: '#451a03', color: '#fb923c', label: 'Ignorado' },
}

function tempoRelativo(dataIso: string) {
  const agora = new Date()
  const data = new Date(dataIso)
  const diffMs = agora.getTime() - data.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'agora há pouco'
  if (diffMin < 60) return `${diffMin}min atrás`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h atrás`
  const diffD = Math.floor(diffH / 24)
  return `${diffD}d atrás`
}

export default function WebhookLogs() {
  const [logs, setLogs] = useState<Log[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState<string>('todos')
  const [filtroOrigem, setFiltroOrigem] = useState<string>('todos')
  const [expandido, setExpandido] = useState<string | null>(null)
  const [reprocessando, setReprocessando] = useState<string | null>(null)
  const [mensagem, setMensagem] = useState('')

  useEffect(() => { carregar() }, [filtroStatus, filtroOrigem])

  async function carregar() {
    setCarregando(true)
    let q = supabase.from('webhook_logs').select('*').order('recebido_em', { ascending: false }).limit(100)
    if (filtroStatus !== 'todos') q = q.eq('status', filtroStatus)
    if (filtroOrigem !== 'todos') q = q.eq('origem', filtroOrigem)
    const { data } = await q
    if (data) setLogs(data as Log[])
    setCarregando(false)
  }

  async function reprocessar(log: Log) {
    if (!confirm(`Reenviar este webhook ${log.origem} pro endpoint?`)) return
    setReprocessando(log.id)
    setMensagem('')

    try {
      const res = await fetch(`/api/webhook/${log.origem}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(log.payload),
      })
      const json = await res.json()
      if (res.ok) {
        setMensagem('✓ Reprocessado com sucesso!')
      } else {
        setMensagem('Falha: ' + (json.error || 'erro desconhecido'))
      }
    } catch (err: any) {
      setMensagem('Erro: ' + err.message)
    }

    setReprocessando(null)
    carregar()
    setTimeout(() => setMensagem(''), 4000)
  }

  async function limparAntigos() {
    if (!confirm('Deletar logs com mais de 30 dias?')) return
    const dataLimite = new Date()
    dataLimite.setDate(dataLimite.getDate() - 30)
    const { error } = await supabase.from('webhook_logs').delete().lt('recebido_em', dataLimite.toISOString())
    if (error) { setMensagem('Erro: ' + error.message); return }
    setMensagem('✓ Logs antigos removidos')
    carregar()
    setTimeout(() => setMensagem(''), 3000)
  }

  const origensUnicas = Array.from(new Set(logs.map(l => l.origem)))
  const stats = {
    total: logs.length,
    processado: logs.filter(l => l.status === 'processado').length,
    erro: logs.filter(l => l.status === 'erro').length,
    ignorado: logs.filter(l => l.status === 'ignorado').length,
  }

  return (
    <Layout>
      <div style={{ padding: '32px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: 0 }}>Webhook Logs</h1>
            <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
              Histórico de eventos recebidos de integrações externas
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => carregar()} style={btnSecondary}>Atualizar</button>
            <button onClick={limparAntigos} style={btnSecondary}>Limpar &gt; 30 dias</button>
          </div>
        </div>

        {mensagem && (
          <div style={{ padding: 12, marginBottom: 16, background: mensagem.includes('Erro') || mensagem.includes('Falha') ? '#450a0a' : '#052e16', borderRadius: 8 }}>
            <p style={{ fontSize: 13, color: mensagem.includes('Erro') || mensagem.includes('Falha') ? '#f87171' : '#34d399', margin: 0 }}>{mensagem}</p>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          <div style={{ ...card, padding: 14 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{stats.total}</div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Total exibido</div>
          </div>
          <div style={{ ...card, padding: 14 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#4ade80' }}>{stats.processado}</div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Processados</div>
          </div>
          <div style={{ ...card, padding: 14 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#f87171' }}>{stats.erro}</div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Com erro</div>
          </div>
          <div style={{ ...card, padding: 14 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#fb923c' }}>{stats.ignorado}</div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Ignorados</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
            style={{ ...card, padding: '8px 12px', fontSize: 13, color: '#fff', cursor: 'pointer' }}>
            <option value="todos">Todos os status</option>
            <option value="recebido">Recebidos</option>
            <option value="processado">Processados</option>
            <option value="erro">Com erro</option>
            <option value="ignorado">Ignorados</option>
          </select>
          <select value={filtroOrigem} onChange={e => setFiltroOrigem(e.target.value)}
            style={{ ...card, padding: '8px 12px', fontSize: 13, color: '#fff', cursor: 'pointer' }}>
            <option value="todos">Todas as origens</option>
            {origensUnicas.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        {carregando ? (
          <p style={{ fontSize: 13, color: '#6b7280' }}>Carregando...</p>
        ) : logs.length === 0 ? (
          <div style={{ ...card, padding: 24 }}>
            <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Nenhum log encontrado com esses filtros.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {logs.map(log => {
              const s = statusInfo[log.status] || statusInfo.recebido
              const aberto = expandido === log.id
              return (
                <div key={log.id} style={{ ...card, padding: 0, overflow: 'hidden' }}>
                  <div onClick={() => setExpandido(aberto ? null : log.id)}
                    style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1 }}>
                      <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, background: s.bg, color: s.color, textTransform: 'uppercase', fontWeight: 600 }}>
                        {s.label}
                      </span>
                      <span style={{ fontSize: 13, color: '#a78bfa', fontWeight: 500, textTransform: 'uppercase' }}>{log.origem}</span>
                      <span style={{ fontSize: 12, color: '#9ca3af' }}>{log.evento || '—'}</span>
                      {log.erro && <span style={{ fontSize: 11, color: '#f87171', fontStyle: 'italic' }}>· {log.erro}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>{tempoRelativo(log.recebido_em)}</span>
                      <span style={{ fontSize: 16, color: '#6b7280' }}>{aberto ? '▾' : '▸'}</span>
                    </div>
                  </div>

                  {aberto && (
                    <div style={{ padding: '16px 18px', borderTop: '1px solid #3a3a3c', background: '#1c1c1e' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
                        <div>
                          <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', marginBottom: 4 }}>Recebido</div>
                          <div style={{ fontSize: 12, color: '#d1d1d1', fontFamily: 'monospace' }}>{new Date(log.recebido_em).toLocaleString('pt-BR')}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', marginBottom: 4 }}>Processado</div>
                          <div style={{ fontSize: 12, color: '#d1d1d1', fontFamily: 'monospace' }}>{log.processado_em ? new Date(log.processado_em).toLocaleString('pt-BR') : '—'}</div>
                        </div>
                      </div>

                      {log.matricula_id && (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', marginBottom: 4 }}>Matrícula criada</div>
                          <div style={{ fontSize: 12, color: '#34d399', fontFamily: 'monospace' }}>{log.matricula_id}</div>
                        </div>
                      )}

                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', marginBottom: 4 }}>Payload</div>
                        <pre style={{ fontSize: 11, color: '#d1d1d1', background: '#0a0a0a', padding: 12, borderRadius: 6, overflow: 'auto', maxHeight: 300, margin: 0 }}>
                          {JSON.stringify(log.payload, null, 2)}
                        </pre>
                      </div>

                      {(log.status === 'erro' || log.status === 'ignorado') && (
                        <button onClick={(e) => { e.stopPropagation(); reprocessar(log) }}
                          disabled={reprocessando === log.id} style={btnPrimary}>
                          {reprocessando === log.id ? 'Reprocessando...' : '↻ Reprocessar'}
                        </button>
                      )}
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
