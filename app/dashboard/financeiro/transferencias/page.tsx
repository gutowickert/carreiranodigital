'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// RELATÓRIO DE TRANSFERÊNCIAS (02/10/2026, pedido do Rick). Só consulta.
// Lê `transferencias_caixa` — as transferências feitas pelo botão "⇄ Transferência" de Ajustes →
// Caixas, que são as que o Fluxo de Caixa e a tela de Caixas somam no saldo.
//
// ⚠️ NÃO é a tabela `transferencias`: essa era da tela antiga "Transferências entre Contas"
// (/dashboard/transferencias), que saiu do menu porque só ela mesma lia o que gravava — o saldo das
// outras telas não mudava. A tela antiga e os registros dela continuam existindo, fora do menu.

const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const hojeSP = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const primeiroDiaMes = () => hojeSP().slice(0, 8) + '01'
const nomeMes = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
const dataBR = (d: string) => d ? new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—'

type Transf = { id: string; conta_origem_id: string; conta_destino_id: string; valor: number; data_transferencia: string; descricao: string | null }

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }
const inp: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 12px', fontSize: 14, color: 'var(--text)', outline: 'none' }

export default function RelatorioTransferencias() {
  const [desde, setDesde] = useState(primeiroDiaMes())
  const [ate, setAte] = useState(hojeSP())
  const [caixa, setCaixa] = useState('')
  const [caixas, setCaixas] = useState<{ id: string; nome: string }[]>([])
  const [transfs, setTransfs] = useState<Transf[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  async function carregar() {
    setCarregando(true); setErro('')
    const { data: contas } = await supabase.from('contas_financeiras').select('id, nome').order('nome')
    setCaixas(contas || [])
    const todas: Transf[] = []
    // o banco devolve no máximo 1000 linhas por vez, sem avisar: vem em páginas
    for (let de = 0; ; de += 1000) {
      const { data, error } = await supabase.from('transferencias_caixa')
        .select('id, conta_origem_id, conta_destino_id, valor, data_transferencia, descricao')
        .gte('data_transferencia', desde).lte('data_transferencia', ate)
        .order('data_transferencia', { ascending: false }).order('id').range(de, de + 999)
      if (error) { setErro('Não foi possível carregar as transferências. Avise o Guto.'); setTransfs([]); setCarregando(false); return }
      todas.push(...(data || []).map((t: any) => ({ ...t, valor: Number(t.valor) || 0 })))
      if (!data || data.length < 1000) break
    }
    setTransfs(todas); setCarregando(false)
  }
  useEffect(() => { carregar() }, []) // eslint-disable-line

  const nomeCaixa = Object.fromEntries(caixas.map(c => [c.id, c.nome]))
  // o filtro de caixa pega a transferência em que ele é origem OU destino
  const visiveis = transfs.filter(t => !caixa || t.conta_origem_id === caixa || t.conta_destino_id === caixa)
  const total = visiveis.reduce((s, t) => s + t.valor, 0)
  const mesmoMes = desde === primeiroDiaMes()

  return (
    <div style={{ padding: '28px 32px', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 }}>🔄 Relatório de Transferências</h1>
      <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 20px' }}>Transferências entre caixas no período{mesmoMes ? ` — ${nomeMes(desde)}` : ''}. Para fazer uma transferência, use Ajustes → Caixas.</p>

      {/* filtros */}
      <div style={{ ...card, padding: 16, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 18 }}>
        <label style={{ fontSize: 12, color: 'var(--text-2)' }}>De<br /><input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={{ ...inp, marginTop: 4 }} /></label>
        <label style={{ fontSize: 12, color: 'var(--text-2)' }}>Até<br /><input type="date" value={ate} onChange={e => setAte(e.target.value)} style={{ ...inp, marginTop: 4 }} /></label>
        <label style={{ fontSize: 12, color: 'var(--text-2)' }}>Caixa<br />
          <select value={caixa} onChange={e => setCaixa(e.target.value)} style={{ ...inp, marginTop: 4 }}>
            <option value="">Todos</option>
            {caixas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
        <button onClick={carregar} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Aplicar</button>
        <button onClick={() => { setDesde(primeiroDiaMes()); setAte(hojeSP()); }} style={{ ...inp, cursor: 'pointer', color: 'var(--text-2)' }}>Mês atual</button>
      </div>

      {/* total */}
      <div style={{ ...card, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Total transferido no período</div>
        <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>{brl(total)}</div>
        <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{visiveis.length} {visiveis.length === 1 ? 'transferência' : 'transferências'}</div>
      </div>

      {/* lista */}
      {carregando ? <div style={{ color: 'var(--text-faint)', padding: 30 }}>Carregando…</div>
        : erro ? <div style={{ ...card, padding: 30, textAlign: 'center', color: 'var(--red)' }}>{erro}</div>
        : visiveis.length === 0 ? <div style={{ ...card, padding: 30, textAlign: 'center', color: 'var(--text-faint)' }}>Nenhuma transferência no período.</div>
          : (
            <div style={{ ...card, padding: 8 }}>
              {visiveis.map((t, i) => (
                <div key={t.id} style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '10px 12px', borderTop: i ? '1px solid var(--border)' : 'none', fontSize: 13.5 }}>
                  <span style={{ color: 'var(--text-faint)', width: 82, flexShrink: 0 }}>{dataBR(t.data_transferencia)}</span>
                  <span style={{ flex: 1, minWidth: 0, color: 'var(--text)' }}>
                    <b>{nomeCaixa[t.conta_origem_id] || '?'}</b> <span style={{ color: 'var(--text-faint)' }}>→</span> <b>{nomeCaixa[t.conta_destino_id] || '?'}</b>
                    {t.descricao && <span style={{ color: 'var(--text-faint)' }}> · {t.descricao}</span>}
                  </span>
                  <span style={{ color: 'var(--text)', fontWeight: 700, width: 110, textAlign: 'right', flexShrink: 0 }}>{brl(t.valor)}</span>
                </div>
              ))}
            </div>
          )}
    </div>
  )
}
