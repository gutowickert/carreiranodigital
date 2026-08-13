'use client'

import { useEffect, useState } from 'react'
import { fetchAuth } from '@/lib/api'

type LoteAberto = {
  turma_id: string; codigo: string; produto: string; cidade: string; inicio: string
  fase: string; fase_label: string; lote_nome: string; preco_pix: number; parcela_cartao: number
  vale_ate: string; dias_ate_virada: number | null; proximo_nome: string | null; proximo_pix: number | null; lote_unico: boolean
}

const money = (n: number) => 'R$' + Number(n).toFixed(2).replace('.', ',').replace(/,00$/, '')
const brData = (iso: string) => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—'
const FASE_COR: Record<string, { c: string; bg: string }> = {
  vendas_abertas: { c: 'var(--blue)', bg: 'var(--blue-bg)' },
  lote_avancado: { c: 'var(--accent-soft)', bg: 'var(--accent-bg)' },
  ultimo_lote: { c: 'var(--amber)', bg: 'var(--amber-bg)' },
  vespera: { c: 'var(--red)', bg: 'var(--red-bg)' },
}

export default function LotesAbertos() {
  const [lotes, setLotes] = useState<LoteAberto[]>([])
  const [hoje, setHoje] = useState('')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    fetchAuth('/api/turmas/lotes-abertos').then(r => r.json()).then(j => {
      if (j?.ok) { setLotes(j.lotes || []); setHoje(j.hoje || '') }
    }).catch(() => { }).finally(() => setCarregando(false))
  }, [])

  const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 } as React.CSSProperties
  const badge = (fase: string, label: string) => {
    const c = FASE_COR[fase] || { c: 'var(--text-muted)', bg: 'var(--surface-2)' }
    return <span style={{ fontSize: 11, fontWeight: 700, color: c.c, background: c.bg, padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>{label}</span>
  }
  // urgência da virada: <=3 dias vermelho, <=7 âmbar
  const corVirada = (dv: number | null) => dv == null ? 'var(--text-muted)' : dv <= 3 ? 'var(--red)' : dv <= 7 ? 'var(--amber)' : 'var(--text-2)'

  return (
    <div style={{ padding: '24px clamp(12px, 4vw, 40px)' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Lotes Abertos</h1>
        <p style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 4 }}>
          O que dizer pro cliente: preço e prazo de cada turma, sempre atual. Ordenado pela virada mais próxima. {hoje && `· hoje ${brData(hoje)}`}
        </p>
      </div>

      {carregando ? (
        <p style={{ color: 'var(--text-muted)' }}>Carregando…</p>
      ) : lotes.length === 0 ? (
        <div style={{ ...card, padding: 24, color: 'var(--text-muted)', fontSize: 14 }}>
          Nenhuma turma com lote cadastrado e em aberto. (Cadastre os lotes em <b>Turmas</b> pra aparecer aqui.)
        </div>
      ) : (
        <div style={{ ...card, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-faint)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={{ padding: '12px 14px' }}>Turma</th>
                <th style={{ padding: '12px 14px' }}>Fase</th>
                <th style={{ padding: '12px 14px' }}>Lote vigente</th>
                <th style={{ padding: '12px 14px' }}>Preço (Pix / 10x)</th>
                <th style={{ padding: '12px 14px' }}>Vira em</th>
                <th style={{ padding: '12px 14px' }}>Depois</th>
                <th style={{ padding: '12px 14px' }}>Turma começa</th>
              </tr>
            </thead>
            <tbody>
              {lotes.map(l => (
                <tr key={l.turma_id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>{l.produto} — {l.cidade}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{l.codigo}</div>
                  </td>
                  <td style={{ padding: '12px 14px' }}>{badge(l.fase, l.fase_label)}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-2)' }}>{l.lote_nome}{l.lote_unico && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}> (único)</span>}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {money(l.preco_pix)} <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>/ 10x {money(l.parcela_cartao)}</span>
                  </td>
                  <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{brData(l.vale_ate)}</span>
                    {l.dias_ate_virada != null && (
                      <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 700, color: corVirada(l.dias_ate_virada) }}>
                        {l.dias_ate_virada <= 0 ? 'hoje!' : `em ${l.dias_ate_virada}d`}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {l.proximo_pix != null ? <>sobe p/ {money(l.proximo_pix)}</> : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{brData(l.inicio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 14, lineHeight: 1.6 }}>
        <b style={{ color: 'var(--amber)' }}>■</b> vira em ≤7 dias &nbsp;·&nbsp; <b style={{ color: 'var(--red)' }}>■</b> vira em ≤3 dias (urgência).
        A tela atualiza sozinha conforme os lotes viram. Preço aqui = o que a IA usa nas mensagens.
      </p>
    </div>
  )
}
