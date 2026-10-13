'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { fetchAuth } from '@/lib/api'
import { hojeBR } from '@/lib/periodos'

// CLIENTES COM RECORRÊNCIA (13/10/2026, pedido do Rick) — os clientes do CRM que pagam por mês,
// 12 meses em fileira. Clicar no mês e dizer "pagou" lança a receita no financeiro (com caixa, pra
// aparecer no Fluxo). Valor, dia e início vêm do cadastro em Sistemas → Clientes do CRM.
// A regra de não duplicar está na rota (app/api/financeiro/recorrentes).

type Mes = { mes: string; vence: string; valor: number; situacao: 'pago' | 'vencido' | 'a_vencer'; pagoEm: string | null; lancamentoId: string | null }
type Cliente = { id: string; nome: string; contrato: string; valor: number | null; dia: number | null; desde: string | null; falta: string | null; meses: Mes[] }
type Caixa = { id: string; nome: string }

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }
const fmt = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const br = (d?: string | null) => d ? d.slice(0, 10).split('-').reverse().join('/') : '—'
const nomeMes = (mes: string) => new Date(mes + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '')

const COR = {
  pago: { cor: 'var(--green)', bg: 'var(--green-bg)', txt: 'Pago' },
  vencido: { cor: 'var(--red)', bg: 'var(--red-bg)', txt: 'Vencido' },
  a_vencer: { cor: 'var(--text-muted)', bg: 'var(--surface-2)', txt: 'A vencer' },
}

export default function ClientesRecorrencia() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [caixas, setCaixas] = useState<Caixa[]>([])
  const [bloco, setBloco] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [pagar, setPagar] = useState<{ c: Cliente; m: Mes } | null>(null)

  async function carregar(b = bloco) {
    setCarregando(true)
    const j = await fetchAuth(`/api/financeiro/recorrentes?bloco=${b}`).then(r => r.json()).catch(() => null)
    setCarregando(false)
    if (!j?.ok) { setErro(j?.error === 'só administradores' ? 'Esta tela é só para administradores.' : (j?.error || 'não consegui carregar')); return }
    setClientes(j.clientes || []); setCaixas(j.caixas || []); setErro('')
  }
  useEffect(() => { carregar(bloco) }, [bloco])

  const ativos = clientes.filter(c => !c.falta)
  const incompletos = clientes.filter(c => c.falta)

  return (
    <div style={{ padding: '28px clamp(12px, 3vw, 32px)', maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Clientes com recorrência</h1>
      <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 16px', lineHeight: 1.5 }}>
        As mensalidades dos clientes do CRM. Quando a empresa pagar, clique no mês e lance o pagamento.
        Valor, dia e início da cobrança se mudam em <Link href="/dashboard/instalacoes" style={{ color: 'var(--accent)' }}>Clientes do CRM</Link>.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <button onClick={() => setBloco(Math.max(0, bloco - 1))} disabled={bloco === 0} style={{ ...btnSec, opacity: bloco === 0 ? .4 : 1 }}>← 12 meses antes</button>
        <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>{bloco === 0 ? 'Primeiros 12 meses' : `${bloco * 12 + 1}º ao ${bloco * 12 + 12}º mês`}</span>
        <button onClick={() => setBloco(bloco + 1)} disabled={bloco >= 10} style={btnSec}>12 meses depois →</button>
      </div>

      {erro && <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 10, padding: '12px 16px', fontSize: 13.5, color: 'var(--red)', marginBottom: 16 }}>{erro}</div>}

      {carregando ? (
        <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Carregando...</p>
      ) : !erro && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {ativos.length === 0 && incompletos.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Nenhum cliente do CRM com contrato ligado. Cadastre em Clientes do CRM.</p>
          )}

          {ativos.map(c => {
            const recebido = c.meses.filter(m => m.situacao === 'pago').reduce((s, m) => s + m.valor, 0)
            const falta = c.meses.filter(m => m.situacao !== 'pago').reduce((s, m) => s + m.valor, 0)
            const vencidos = c.meses.filter(m => m.situacao === 'vencido').length
            return (
              <div key={c.id} style={{ ...card, padding: 18, borderColor: vencidos ? 'var(--red)' : 'var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>{c.nome}</span>
                  {c.contrato !== c.nome && <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>contrato: {c.contrato}</span>}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 14, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <span>{fmt(c.valor || 0)}/mês · vence dia {c.dia}</span>
                  <span style={{ color: 'var(--green)' }}>Recebido: <b>{fmt(recebido)}</b></span>
                  <span>Falta receber: <b>{fmt(falta)}</b></span>
                  {vencidos > 0 && <span style={{ color: 'var(--red)', fontWeight: 700 }}>{vencidos} vencido{vencidos > 1 ? 's' : ''}</span>}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                  {c.meses.map(m => {
                    const s = COR[m.situacao]
                    return (
                      <div key={m.mes} style={{ border: `1px solid ${m.situacao === 'vencido' ? 'var(--red)' : 'var(--border)'}`, borderRadius: 10, padding: '10px 11px', background: m.situacao === 'pago' ? s.bg : 'transparent', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', textTransform: 'capitalize' }}>{nomeMes(m.mes)}</span>
                        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{fmt(m.valor)}</span>
                        <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>vence {br(m.vence)}</span>
                        {m.situacao === 'pago' ? (
                          <span style={{ fontSize: 12, fontWeight: 700, color: s.cor }}>✓ Pago{m.pagoEm ? ` em ${br(m.pagoEm).slice(0, 5)}` : ''}</span>
                        ) : (
                          <>
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: s.cor }}>{s.txt}</span>
                            <button onClick={() => setPagar({ c, m })} style={{ ...btnPri, padding: '5px 8px', fontSize: 12 }}>Lançar pagamento</button>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {incompletos.map(c => (
            <div key={c.id} style={{ ...card, padding: 16, borderColor: 'var(--amber)' }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{c.nome}</span>
              <p style={{ fontSize: 13, color: 'var(--amber)', margin: '6px 0 0' }}>
                Falta o <b>{c.falta}</b>. Preencha em <Link href="/dashboard/instalacoes" style={{ color: 'var(--accent)' }}>Clientes do CRM</Link> (botão editar) e os meses aparecem aqui.
              </p>
            </div>
          ))}
        </div>
      )}

      {pagar && <ModalPagar c={pagar.c} m={pagar.m} caixas={caixas} onFechar={() => setPagar(null)} onSalvo={() => { setPagar(null); carregar() }} />}
    </div>
  )
}

function ModalPagar({ c, m, caixas, onFechar, onSalvo }: { c: Cliente; m: Mes; caixas: Caixa[]; onFechar: () => void; onSalvo: () => void }) {
  const [contaId, setContaId] = useState('')
  const [data, setData] = useState(hojeBR())
  const [valor, setValor] = useState(String(m.valor))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function salvar() {
    if (!contaId) { setErro('Escolha o caixa onde o dinheiro entrou.'); return }
    setSalvando(true); setErro('')
    const j = await fetchAuth('/api/financeiro/recorrentes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projeto_id: c.id, mes: m.mes, conta_id: contaId, data_pagamento: data, valor }),
    }).then(r => r.json()).catch(() => null)
    setSalvando(false)
    if (!j?.ok) { setErro(j?.error || 'não consegui lançar'); return }
    onSalvo()
  }

  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, background: 'rgba(8,4,20,.55)', backdropFilter: 'blur(6px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...card, padding: 22, width: 420, maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Lançar pagamento</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0', textTransform: 'capitalize' }}>{c.nome} · {nomeMes(m.mes)}</p>
          </div>
          <button onClick={onFechar} aria-label="Fechar" style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '50%', width: 30, height: 30, color: 'var(--text-muted)', cursor: 'pointer' }}><X size={15} /></button>
        </div>

        <div><label style={lbl}>Caixa onde o dinheiro entrou *</label>
          <select style={inp} value={contaId} onChange={e => setContaId(e.target.value)} autoFocus>
            <option value="">Escolha o caixa</option>
            {caixas.map(k => <option key={k.id} value={k.id}>{k.nome}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={lbl}>Data do pagamento</label><input type="date" style={inp} value={data} max={hojeBR()} onChange={e => setData(e.target.value)} /></div>
          <div><label style={lbl}>Valor (R$)</label><input style={inp} value={valor} onChange={e => setValor(e.target.value)} inputMode="decimal" /></div>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0, lineHeight: 1.5 }}>
          Entra em Lançamentos como receita realizada, natureza &quot;Mensalidade de cliente&quot;. Errou? Corrija na tela de Lançamentos.
        </p>

        {erro && <p style={{ fontSize: 12.5, color: 'var(--red)', margin: 0 }}>{erro}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onFechar} style={{ ...btnSec, flex: 1 }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando} style={{ ...btnPri, flex: 1 }}>{salvando ? 'Lançando…' : 'Confirmar pagamento'}</button>
        </div>
      </div>
    </div>
  )
}

const btnPri = { padding: '9px 16px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 8, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' } as React.CSSProperties
const btnSec = { padding: '7px 13px', background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties
const inp = { background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontSize: 14, outline: 'none', width: '100%' } as React.CSSProperties
const lbl = { fontSize: 11.5, color: 'var(--text-muted)', display: 'block', marginBottom: 4 } as React.CSSProperties
