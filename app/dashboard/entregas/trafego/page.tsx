'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchAuth } from '@/lib/api'
import { PERIODOS, intervalo, hojeBR } from '@/lib/periodos'

// Tráfego de todos os clientes numa tela. Cada linha é um cliente com a própria
// barrinha de conversas por dia (mesma medida em todas, então sem legenda); a
// variação é contra o período anterior de mesmo tamanho.

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }
const inp: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '6px 9px', fontSize: 13, color: 'var(--text)' }
const th: React.CSSProperties = { textAlign: 'right', padding: '9px 12px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { textAlign: 'right', padding: '11px 12px', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums', verticalAlign: 'middle' }

const br = (d?: string | null) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—')
const brl = (v: any, casas = 0) => (v == null ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }))
const int = (v: any) => (v == null ? '—' : Number(v).toLocaleString('pt-BR'))

// "desde o início" é por projeto — aqui cada cliente começou num dia diferente
const OPCOES = PERIODOS.filter(([v]) => v !== 'inicio')
const CHAVE = 'cnd_trafego_clientes_periodo'

// seta + sinal carregam a leitura; a cor só entra onde a direção tem sentido
function Delta({ atual, anterior, bom }: { atual: number | null | undefined; anterior: number | null | undefined; bom: 'sobe' | 'desce' | 'neutro' }) {
  if (atual == null || anterior == null) return <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>—</span>
  if (!anterior) return <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{atual ? 'novo' : '—'}</span>
  const p = Math.round(((atual - anterior) / anterior) * 100)
  if (p === 0) return <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>= 0%</span>
  const subiu = p > 0
  const cor = bom === 'neutro' ? 'var(--text-faint)' : (subiu === (bom === 'sobe')) ? 'var(--green)' : 'var(--red)'
  return <span style={{ fontSize: 11, fontWeight: 600, color: cor, whiteSpace: 'nowrap' }}>{subiu ? '▲' : '▼'} {subiu ? '+' : ''}{p}%</span>
}

type Dica = { x: number; y: number; linhas: string[] } | null

// conversas por dia — barra fina, topo arredondado, 2px entre barras, base comum
function Barrinhas({ dias, maximo, aoDica }: { dias: any[]; maximo: number; aoDica: (d: Dica) => void }) {
  if (!dias?.length) return <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>—</span>
  const H = 34
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: H, minWidth: 120, maxWidth: 220, marginLeft: 'auto' }} onMouseLeave={() => aoDica(null)}>
      {dias.map((d: any) => {
        const h = d.conversas ? Math.max(3, (d.conversas / maximo) * H) : 0
        return (
          // o alvo do mouse é a coluna inteira, não só a barra (dia com zero também responde)
          <div key={d.data}
            onMouseEnter={e => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); aoDica({ x: r.left + r.width / 2, y: r.top, linhas: [br(d.data), `${int(d.conversas)} conversas`, `${brl(d.gasto, 2)} investido`] }) }}
            style={{ flex: '1 1 0', height: H, display: 'flex', alignItems: 'flex-end', cursor: 'default' }}>
            <div style={{ width: '100%', height: h, background: 'var(--accent)', borderRadius: '4px 4px 0 0', opacity: .85 }} />
            {!h && <div style={{ width: '100%', height: 1, background: 'var(--border-strong)' }} />}
          </div>
        )
      })}
    </div>
  )
}

export default function TrafegoClientes() {
  const [periodo, setPeriodo] = useState<string>(() => { try { return localStorage.getItem(CHAVE) || '7d' } catch { return '7d' } })
  const [custom, setCustom] = useState<[string, string]>(() => intervalo('7d'))
  const [d, setD] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)
  const [dica, setDica] = useState<Dica>(null)

  const [de, ate] = periodo === 'custom' ? custom : intervalo(periodo)

  async function carregar() {
    setCarregando(true)
    const j = await fetchAuth(`/api/projetos/trafego?de=${de}&ate=${ate}`).then(r => r.json()).catch(() => null)
    setD(j); setCarregando(false)
  }
  useEffect(() => { carregar() }, [de, ate])

  function escolher(p: string) { setPeriodo(p); try { localStorage.setItem(CHAVE, p) } catch { /* só não lembra */ } }

  const linhas = d?.linhas || []
  // escala comum: uma barra de 10 conversas tem a mesma altura em qualquer linha
  const maximo = Math.max(1, ...linhas.flatMap((l: any) => (l.porDia || []).map((x: any) => x.conversas || 0)))
  const t = d?.total

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1180, margin: '0 auto' }}>
      <Link href="/dashboard/entregas" style={{ fontSize: 12.5, color: 'var(--text-faint)', textDecoration: 'none' }}>← Entregas</Link>

      {/* filtros numa linha só, acima de tudo */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 }}>📈 Tráfego dos clientes</h1>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 0' }}>Todos os clientes com conta de anúncio ligada, lidos direto da Meta.</p>
        </div>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
          <select style={inp} value={periodo} onChange={e => escolher(e.target.value)}>
            {OPCOES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {periodo === 'custom' && (
            <>
              <input type="date" style={inp} value={custom[0]} max={hojeBR()} onChange={e => setCustom([e.target.value, custom[1]])} />
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>até</span>
              <input type="date" style={inp} value={custom[1]} max={hojeBR()} onChange={e => setCustom([custom[0], e.target.value])} />
            </>
          )}
        </div>
      </div>

      {d?.ok && (
        <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '10px 0 0' }}>
          {d.de === d.ate ? br(d.de) : `${br(d.de)} a ${br(d.ate)}`} · comparado com {d.de_anterior === d.ate_anterior ? br(d.de_anterior) : `${br(d.de_anterior)} a ${br(d.ate_anterior)}`}
        </p>
      )}

      {carregando && !d ? <div style={{ color: 'var(--text-faint)', padding: 24 }}>Lendo a Meta de cada cliente…</div>
        : !d?.ok ? <div style={{ ...card, padding: 16, marginTop: 16, fontSize: 13, color: 'var(--amber)' }}>⚠️ {d?.error || 'não consegui carregar'}</div>
        : !linhas.length ? (
          <div style={{ ...card, padding: 18, marginTop: 16, fontSize: 13, color: 'var(--text-faint)' }}>
            Nenhum cliente com conta de anúncio ligada. Liga na ficha do cliente, no bloco <b>📣 Conta de anúncio</b>.
          </div>
        ) : (
          <div style={{ opacity: carregando ? .55 : 1, transition: 'opacity .15s' }}>
            {/* o resumo antes do detalhe */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 8, marginTop: 14 }}>
              {[
                { l: 'investido', v: brl(t.gasto), el: <Delta atual={t.gasto} anterior={t.gastoAnt} bom="neutro" /> },
                { l: 'conversas iniciadas', v: int(t.conversas), el: <Delta atual={t.conversas} anterior={t.conversasAnt} bom="sobe" /> },
                { l: 'custo por conversa', v: t.custoConversa != null ? brl(t.custoConversa, 2) : '—', el: <Delta atual={t.custoConversa} anterior={t.custoConversaAnt} bom="desce" /> },
                { l: 'clientes', v: int(linhas.length), el: null },
              ].map((x, i) => (
                <div key={i} style={{ ...card, padding: '13px 15px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{x.v}</span>
                    {x.el}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 3 }}>{x.l}</div>
                </div>
              ))}
            </div>

            <div style={{ ...card, marginTop: 12, overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, minWidth: 760 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: 'left' }}>cliente</th>
                    <th style={th}>investido</th>
                    <th style={th}>conversas</th>
                    <th style={th}>custo / conversa</th>
                    <th style={th}>conversas por dia</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l: any) => (
                    <tr key={l.id}>
                      <td style={{ ...td, textAlign: 'left' }}>
                        <Link href={`/dashboard/entregas/${l.id}`} style={{ color: 'var(--text)', fontWeight: 700, textDecoration: 'none' }}>{l.cliente}</Link>
                        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
                          {l.produto}{l.conta ? ` · ${l.conta}` : ''}
                          {l.conta_ativa === false && <span style={{ color: 'var(--red)', fontWeight: 600 }}> · ⛔ conta desativada</span>}
                        </div>
                      </td>
                      {!l.ok ? (
                        <td colSpan={4} style={{ ...td, textAlign: 'left', fontSize: 12, color: 'var(--amber)' }}>⚠️ {l.erro}</td>
                      ) : (
                        <>
                          <td style={td}>
                            <div style={{ color: 'var(--text)' }}>{brl(l.atual.gasto, 2)}</div>
                            <Delta atual={l.atual.gasto} anterior={l.anterior?.gasto} bom="neutro" />
                          </td>
                          <td style={td}>
                            <div style={{ color: 'var(--text)', fontWeight: 700 }}>{int(l.atual.conversas)}</div>
                            <Delta atual={l.atual.conversas} anterior={l.anterior?.conversas} bom="sobe" />
                          </td>
                          <td style={td}>
                            <div style={{ color: 'var(--text)' }}>{l.atual.custoConversa != null ? brl(l.atual.custoConversa, 2) : '—'}</div>
                            <Delta atual={l.atual.custoConversa} anterior={l.anterior?.custoConversa} bom="desce" />
                          </td>
                          <td style={td}>
                            <Barrinhas dias={l.porDia} maximo={maximo} aoDica={setDica} />
                            {l.anterior_antes_do_inicio && <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 4 }}>período anterior é antes do projeto</div>}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 8 }}>
              As barras usam a mesma escala em todas as linhas — dá pra comparar cliente com cliente. Passa o mouse num dia pra ver o investido.
            </p>
          </div>
        )}

      {dica && (
        <div style={{ position: 'fixed', left: dica.x, top: dica.y - 8, transform: 'translate(-50%,-100%)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '6px 9px', fontSize: 11.5, color: 'var(--text-2)', pointerEvents: 'none', zIndex: 50, boxShadow: '0 6px 18px rgba(0,0,0,.18)', whiteSpace: 'nowrap' }}>
          {dica.linhas.map((x, i) => <div key={i} style={i === 0 ? { fontWeight: 700, color: 'var(--text)' } : undefined}>{x}</div>)}
        </div>
      )}
    </div>
  )
}
