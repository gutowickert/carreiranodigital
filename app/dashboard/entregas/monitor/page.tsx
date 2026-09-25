'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchAuth } from '@/lib/api'

// O MONITOR DAS ENTREGAS. Tela interna do Guto e do Mateus pra decidir em grupo: cada
// cliente é um card com a cor calculada (verde em cima, vermelho embaixo), os números da
// semana, o alerta principal e o próximo encontro. Clicar abre tudo do cliente, sem ir ao
// gerenciador. Do lado: quem contatar hoje e os encontros da semana.

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }
const inp: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '6px 9px', fontSize: 13, color: 'var(--text)' }
const btn: React.CSSProperties = { border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }
const tit: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-faint)' }

const br = (d?: string | null) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—')
const brl = (v: any, casas = 0) => (v == null ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }))
const int = (v: any) => (v == null ? '—' : Number(v).toLocaleString('pt-BR'))
const quando = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00-03:00' : iso)
  const s = d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit', ...(iso.length > 10 ? { hour: '2-digit', minute: '2-digit' } : {}) })
  return s.replace('.', '')
}

// a cor é a leitura; o texto diz o que ela significa
const NIVEL: Record<string, { cor: string; bg: string; rotulo: string }> = {
  verde: { cor: 'var(--green)', bg: 'var(--green-bg)', rotulo: 'Indo bem' },
  amarelo: { cor: 'var(--amber)', bg: 'var(--amber-bg)', rotulo: 'Atenção' },
  vermelho: { cor: 'var(--red)', bg: 'var(--red-bg)', rotulo: 'Agir hoje' },
  cinza: { cor: 'var(--text-faint)', bg: 'var(--surface-2)', rotulo: 'Antes da campanha' },
}
const SITUACAO: Record<string, string> = { puxando: 'puxando', queimando: 'queimando', normal: 'no meio', parado: 'parado' }
const SIT_COR: Record<string, string> = { puxando: 'var(--green)', queimando: 'var(--red)', normal: 'var(--text-faint)', parado: 'var(--text-faint)' }

function Delta({ atual, anterior, bom }: { atual: number | null | undefined; anterior: number | null | undefined; bom: 'sobe' | 'desce' | 'neutro' }) {
  if (atual == null || !anterior) return <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>—</span>
  const p = Math.round(((atual - anterior) / anterior) * 100)
  if (p === 0) return <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>= 0%</span>
  const subiu = p > 0
  const cor = bom === 'neutro' ? 'var(--text-faint)' : (subiu === (bom === 'sobe')) ? 'var(--green)' : 'var(--red)'
  return <span style={{ fontSize: 11, fontWeight: 600, color: cor, whiteSpace: 'nowrap' }}>{subiu ? '▲' : '▼'} {subiu ? '+' : ''}{p}%</span>
}

function Sparkline({ dias, cor }: { dias: any[]; cor: string }) {
  const max = Math.max(1, ...dias.map(d => d.resultados))
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 34 }} title="resultados por dia, últimos 14 dias">
      {dias.map(d => (
        <div key={d.data} style={{ flex: 1, height: d.resultados ? Math.max(3, (d.resultados / max) * 34) : 2, background: d.resultados ? cor : 'var(--border-strong)', borderRadius: '3px 3px 0 0', opacity: d.resultados ? .85 : 1 }} />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────── o card
function Card({ c, aoAbrir }: { c: any; aoAbrir: () => void }) {
  const n = NIVEL[c.nivel]
  const t = c.painel?.total, a = c.painel?.anterior
  const principal = c.alertas.find((x: any) => x.nivel === 'vermelho') || c.alertas[0]
  const nome = c.painel?.nome || { varios: 'conversas', um: 'conversa' }
  return (
    <div onClick={aoAbrir} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && aoAbrir()}
      style={{ ...card, borderLeft: `4px solid ${n.cor}`, padding: '14px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 12, outline: 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.cliente}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 2 }}>{c.produtoNome}{c.faseLabel ? ` · ${c.faseLabel}` : ''}{c.responsavel ? ` · ${c.responsavel}` : ''} · dia {c.dia_do_contrato}</div>
        </div>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', padding: '4px 8px', borderRadius: 5, background: n.bg, color: n.cor, whiteSpace: 'nowrap' }}>{n.rotulo}</span>
      </div>

      {t ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 8 }}>
            {[
              { v: int(t.resultados), l: nome.varios, d: <Delta atual={t.resultados} anterior={a?.resultados} bom="sobe" />, g: true },
              { v: t.custo != null ? brl(t.custo, 2) : '—', l: 'por ' + nome.um.split(' ')[0], d: <Delta atual={t.custo} anterior={a?.custo} bom="desce" /> },
              { v: brl(t.gasto), l: 'investido', d: <Delta atual={t.gasto} anterior={a?.gasto} bom="neutro" /> },
            ].map((x, i) => (
              <div key={i} style={{ minWidth: 0 }}>
                <div style={{ fontSize: x.g ? 22 : 15, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{x.v}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.l}</div>
                <div>{x.d}</div>
              </div>
            ))}
          </div>
          <Sparkline dias={c.sparkline} cor={n.cor} />
        </>
      ) : (
        <div style={{ fontSize: 12.5, color: 'var(--text-faint)', padding: '6px 0' }}>Sem conta de anúncio ligada. Só a entrega aparece aqui.</div>
      )}

      {principal && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.4 }}>
          <span style={{ color: principal.nivel === 'vermelho' ? 'var(--red)' : 'var(--amber)', fontSize: 10 }}>●</span>
          <span style={{ flex: 1 }}>{principal.titulo}{c.alertas.length > 1 && <span style={{ color: 'var(--text-faint)' }}> +{c.alertas.length - 1}</span>}</span>
        </div>
      )}
      {c.proximo && (
        <div style={{ fontSize: 12, color: 'var(--text-faint)', borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Próximo: {c.proximo.titulo}</span>
          <span style={{ whiteSpace: 'nowrap', color: c.proximo.situacao === 'atrasado' ? 'var(--red)' : 'var(--text-2)' }}>{c.proximo.data ? quando(c.proximo.data) : 'a marcar'}{c.proximo.estado === 'previsto' && c.proximo.data ? ' ~' : ''}</span>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────── o detalhe
function Detalhe({ c, aoFechar, aoSincronizar }: { c: any; aoFechar: () => void; aoSincronizar: () => Promise<void> }) {
  const n = NIVEL[c.nivel]
  const p = c.painel
  const [sinc, setSinc] = useState('')
  const [copiado, setCopiado] = useState(false)
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [aoFechar])
  const portal = c.portal_chave ? `${window.location.origin}/cliente?k=${c.portal_chave}` : null
  const sec = (t: string) => <div style={{ ...tit, margin: '22px 0 8px' }}>{t}</div>

  return (
    <>
      <div onClick={aoFechar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 60 }} />
      <aside style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(640px, 100vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', zIndex: 61, overflowY: 'auto', padding: '22px 24px 40px', boxShadow: '-12px 0 40px rgba(0,0,0,.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{c.cliente}</h2>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', padding: '4px 8px', borderRadius: 5, background: n.bg, color: n.cor }}>{n.rotulo}</span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 4 }}>{c.produtoNome}{c.faseLabel ? ` · ${c.faseLabel}` : ''} · dia {c.dia_do_contrato} do contrato{c.data_fim ? ` (até ${br(c.data_fim)})` : ''}{c.responsavel ? ` · ${c.responsavel}` : ''}</div>
          </div>
          <button onClick={aoFechar} style={{ ...btn, background: 'var(--surface-2)', color: 'var(--text-2)' }}>fechar</button>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14 }}>
          <Link href={`/dashboard/entregas/${c.id}`} style={{ ...btn, background: 'var(--accent)', color: '#fff', textDecoration: 'none' }}>Abrir ficha</Link>
          {c.tem_conta && <button onClick={async () => { setSinc('lendo a Meta…'); await aoSincronizar(); setSinc('sincronizado') }} style={{ ...btn, background: 'var(--surface-2)', color: 'var(--text-2)' }}>↻ Sincronizar</button>}
          {portal && <a href={portal} target="_blank" rel="noopener" style={{ ...btn, background: 'var(--surface-2)', color: 'var(--text-2)', textDecoration: 'none' }}>Ver como o cliente vê</a>}
          {portal && <button onClick={() => { navigator.clipboard?.writeText(portal); setCopiado(true); setTimeout(() => setCopiado(false), 1500) }} style={{ ...btn, background: 'var(--surface-2)', color: 'var(--text-2)' }}>{copiado ? 'copiado' : 'copiar link do portal'}</button>}
          {c.whatsapp && <a href={`https://wa.me/${c.whatsapp}`} target="_blank" rel="noopener" style={{ ...btn, background: 'var(--surface-2)', color: 'var(--text-2)', textDecoration: 'none' }}>WhatsApp</a>}
          {sinc && <span style={{ fontSize: 12, color: 'var(--text-faint)', alignSelf: 'center' }}>{sinc}</span>}
        </div>

        {/* o que pede ação */}
        {!!c.alertas.length && <>
          {sec('Pontos de atenção')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {c.alertas.map((a: any, i: number) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 12px', borderRadius: 8, background: a.nivel === 'vermelho' ? 'var(--red-bg)' : 'var(--amber-bg)' }}>
                <span style={{ color: a.nivel === 'vermelho' ? 'var(--red)' : 'var(--amber)', fontSize: 10, marginTop: 4 }}>●</span>
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.45 }}>{a.titulo}{a.detalhe && <span style={{ color: 'var(--text-faint)' }}> · {a.detalhe}</span>}</div>
              </div>
            ))}
          </div>
        </>}
        {!!c.recomendacoes.length && <>
          {sec('O que fazer')}
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, color: 'var(--text)', lineHeight: 1.7 }}>
            {c.recomendacoes.map((r: string, i: number) => <li key={i}>{r}</li>)}
          </ol>
        </>}

        {p && <>
          {sec(`A semana em uma frase`)}
          <div style={{ ...card, padding: '12px 14px', borderLeft: '3px solid var(--accent)' }}>
            {p.analise.map((f: string, i: number) => <p key={i} style={{ margin: i ? '6px 0 0' : 0, fontSize: i ? 13 : 14, fontWeight: i ? 400 : 700, color: i ? 'var(--text-2)' : 'var(--text)', lineHeight: 1.5 }}>{f}</p>)}
          </div>

          {sec('Números do período')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {[
              { l: p.nome.varios, v: int(p.total.resultados), d: <Delta atual={p.total.resultados} anterior={p.anterior?.resultados} bom="sobe" /> },
              { l: 'custo', v: p.total.custo != null ? brl(p.total.custo, 2) : '—', d: <Delta atual={p.total.custo} anterior={p.anterior?.custo} bom="desce" /> },
              { l: 'investido', v: brl(p.total.gasto, 2), d: <Delta atual={p.total.gasto} anterior={p.anterior?.gasto} bom="neutro" /> },
              { l: 'cliques', v: int(p.total.cliques), d: <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{p.total.ctr != null ? p.total.ctr.toFixed(1).replace('.', ',') + '% CTR' : ''}</span> },
            ].map((x, i) => (
              <div key={i} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{x.v}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>{x.l}</div>
                <div>{x.d}</div>
              </div>
            ))}
          </div>
          {(c.valor_cliente || c.alvo_custo || c.conta) && (
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 8, lineHeight: 1.6 }}>
              {c.valor_cliente ? `Um cliente vale ${brl(c.valor_cliente)}. ` : ''}{c.alvo_custo ? `Alvo: ${brl(c.alvo_custo, 2)} por ${p.nome.um.split(' ')[0]}. ` : ''}
              {c.conta?.ok ? `Conta ${c.conta.nome}: ${c.conta.ativa ? 'ativa' : 'DESATIVADA'}${c.conta.prepago ? `, pré-paga${c.conta.saldo != null ? `, saldo ${brl(c.conta.saldo, 2)}` : ''}` : ''}.` : c.conta?.error ? `Conta: ${c.conta.error}` : ''}
              {c.anuncios_ativos ? ` ${c.anuncios_ativos} ${c.anuncios_ativos === 1 ? 'anúncio ativo' : 'anúncios ativos'}.` : ''}
            </div>
          )}

          {!!p.anuncios.length && <>
            {sec('Os anúncios')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {p.anuncios.map((a: any) => (
                <div key={a.ad_id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 10, borderRadius: 10, background: 'var(--surface-2)', opacity: /PAUSED|ARCHIVED/i.test(a.status) ? .6 : 1 }}>
                  <div style={{ width: 54, height: 54, borderRadius: 8, background: 'var(--border)', flex: 'none', overflow: 'hidden' }}>{a.imagem_url && <img src={a.imagem_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nome}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: SIT_COR[a.situacao] }}>{SITUACAO[a.situacao]}</span>
                      {/PAUSED|ARCHIVED/i.test(a.status) && <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>pausado</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                      <b>{int(a.resultados)}</b> {a.resultados === 1 ? p.nome.um : p.nome.varios}{a.custo != null ? ` · ${brl(a.custo, 2)} cada` : ''} · {brl(a.gasto, 2)}{a.ctr != null ? ` · ${a.ctr.toFixed(1).replace('.', ',')}% CTR` : ''}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.campanha}</div>
                  </div>
                </div>
              ))}
            </div>
          </>}

          {!!p.eventos.length && <>
            {sec('O que foi feito na campanha')}
            {p.eventos.slice(0, 8).map((e: any, i: number) => (
              <div key={i} style={{ display: 'flex', gap: 10, fontSize: 13, padding: '7px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                <span style={{ color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{br(e.data)}</span>
                <span style={{ color: 'var(--text)' }}>{e.titulo}</span>
              </div>
            ))}
          </>}

          {!!p.conquistas.length && <>
            {sec('Placar do cliente')}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {p.conquistas.map((q: any, i: number) => <span key={i} style={{ fontSize: 12, padding: '5px 10px', borderRadius: 999, background: 'var(--green-bg)', color: 'var(--green)', fontWeight: 600 }}>✔ {q.titulo}</span>)}
            </div>
          </>}
        </>}

        {c.proximo && <>
          {sec('Entrega')}
          <div style={{ fontSize: 13.5, color: 'var(--text)' }}>Próximo: <b>{c.proximo.titulo}</b> · {c.proximo.data ? quando(c.proximo.data) : 'sem data'}{c.proximo.local ? ` · ${c.proximo.local}` : ''} <span style={{ color: 'var(--text-faint)' }}>({c.proximo.estado})</span></div>
          {c.atrasados > 0 && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 4 }}>{c.atrasados} {c.atrasados === 1 ? 'encontro atrasado' : 'encontros atrasados'}</div>}
        </>}
      </aside>
    </>
  )
}

// ─────────────────────────────────────────────────────────────── a tela
export default function Monitor() {
  const [dias, setDias] = useState<number>(() => { try { return Number(localStorage.getItem('cnd_monitor_dias')) || 7 } catch { return 7 } })
  const [d, setD] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)
  const [sel, setSel] = useState<string | null>(null)
  const [sincTodos, setSincTodos] = useState('')

  async function carregar() {
    setCarregando(true)
    const j = await fetchAuth(`/api/projetos/monitor?dias=${dias}`).then(r => r.json()).catch(() => null)
    setD(j); setCarregando(false)
  }
  useEffect(() => { carregar() }, [dias])
  function escolher(n: number) { setDias(n); try { localStorage.setItem('cnd_monitor_dias', String(n)) } catch { /* só não lembra */ } }

  async function sincronizar(id?: string) {
    await fetchAuth('/api/projetos/trafego/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(id ? { id } : {}) }).then(r => r.json()).catch(() => null)
    await carregar()
  }

  const cards: any[] = d?.cards || []
  const selecionado = cards.find(c => c.id === sel)
  const r = d?.resumo

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1440, margin: '0 auto' }}>
      <Link href="/dashboard/entregas" style={{ fontSize: 12.5, color: 'var(--text-faint)', textDecoration: 'none' }}>← Entregas</Link>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Monitor das entregas</h1>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 0' }}>Cada cliente com a cor calculada pelo que aconteceu nos últimos {dias} dias. Verde em cima, vermelho embaixo. Clica no card pra ver tudo.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', border: '1px solid var(--border-strong)', borderRadius: 8, overflow: 'hidden' }}>
            {[7, 14, 30].map(n => (
              <button key={n} onClick={() => escolher(n)} style={{ border: 'none', padding: '6px 12px', fontSize: 12.5, cursor: 'pointer', fontWeight: dias === n ? 700 : 400, background: dias === n ? 'var(--accent)' : 'var(--surface-2)', color: dias === n ? '#fff' : 'var(--text-2)' }}>{n} dias</button>
            ))}
          </div>
          <button onClick={async () => { setSincTodos('lendo a Meta de todos…'); await sincronizar(); setSincTodos('') }} style={{ ...btn, background: 'var(--surface-2)', color: 'var(--text-2)' }}>{sincTodos || '↻ Sincronizar todos'}</button>
        </div>
      </div>

      {carregando && !d ? <div style={{ color: 'var(--text-faint)', padding: 24 }}>Montando o monitor…</div>
        : !d?.ok ? <div style={{ ...card, padding: 16, marginTop: 16, color: 'var(--amber)', fontSize: 13 }}>{d?.error || 'não consegui carregar'}</div>
        : (
          <div style={{ opacity: carregando ? .55 : 1, transition: 'opacity .15s' }}>
            {/* o conjunto */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 8, marginTop: 16 }}>
              {[
                { v: int(r.resultados), l: 'resultados no período', el: <Delta atual={r.resultados} anterior={r.resultadosAnt} bom="sobe" /> },
                { v: r.custo != null ? brl(r.custo, 2) : '—', l: 'custo médio', el: <Delta atual={r.custo} anterior={r.custoAnt} bom="desce" /> },
                { v: brl(r.gasto), l: 'investido pelos clientes', el: <Delta atual={r.gasto} anterior={r.gastoAnt} bom="neutro" /> },
                { v: `${r.com_conta}/${r.clientes}`, l: 'clientes com campanha', el: null },
              ].map((x, i) => (
                <div key={i} style={{ ...card, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{x.v}</span>{x.el}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 3 }}>{x.l}</div>
                </div>
              ))}
              <div style={{ ...card, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {(['verde', 'amarelo', 'vermelho', 'cinza'] as const).map(k => (
                  <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-2)' }}><span style={{ width: 10, height: 10, borderRadius: 3, background: NIVEL[k].cor, display: 'inline-block' }} /><b style={{ color: 'var(--text)' }}>{r.por_nivel[k]}</b> {NIVEL[k].rotulo.toLowerCase()}</span>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 16, marginTop: 16, alignItems: 'start' }}>
              {/* os cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(300px,100%),1fr))', gap: 12 }}>
                {cards.map(c => <Card key={c.id} c={c} aoAbrir={() => setSel(c.id)} />)}
              </div>

              {/* o lado: quem contatar e os encontros */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 16 }}>
                <div style={{ ...card, padding: '14px 16px' }}>
                  <div style={tit}>Contatar hoje</div>
                  {!d.contatar.length ? <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 8 }}>Ninguém pendente.</div>
                    : d.contatar.map((x: any, i: number) => (
                      <div key={i} onClick={() => setSel(x.id)} style={{ display: 'flex', gap: 9, padding: '9px 0', borderTop: i ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}>
                        <span style={{ color: x.nivel === 'vermelho' ? 'var(--red)' : 'var(--amber)', fontSize: 10, marginTop: 4 }}>●</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{x.cliente}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.4 }}>{x.motivo}</div>
                          {x.acao && <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 2 }}>{x.acao}</div>}
                        </div>
                        {x.whatsapp && <a href={`https://wa.me/${x.whatsapp}`} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ fontSize: 11.5, color: 'var(--accent)', textDecoration: 'none', whiteSpace: 'nowrap' }}>WhatsApp</a>}
                      </div>
                    ))}
                </div>
                <div style={{ ...card, padding: '14px 16px' }}>
                  <div style={tit}>Encontros dos próximos 7 dias</div>
                  {!d.encontros.length ? <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 8 }}>Nenhum encontro na semana.</div>
                    : d.encontros.map((e: any, i: number) => (
                      <div key={e.id} onClick={() => setSel(e.projeto_id)} style={{ padding: '9px 0', borderTop: i ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{e.cliente}</span>
                          <span style={{ fontSize: 12, color: e.situacao === 'confirmar' ? 'var(--amber)' : 'var(--text-2)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{quando(e.quando)}{!e.combinado ? ' ~' : ''}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 1 }}>{e.titulo}{e.local ? ` · ${e.local}` : ''}{e.responsavel ? ` · ${e.responsavel}` : ''}</div>
                        <div style={{ fontSize: 11, marginTop: 2, color: e.estado === 'confirmado' ? 'var(--green)' : e.estado === 'combinado' ? (e.reconfirmado ? 'var(--green)' : 'var(--amber)') : 'var(--text-faint)' }}>
                          {e.estado === 'confirmado' ? 'confirmado' : e.estado === 'combinado' ? (e.reconfirmado ? 'reconfirmado' : 'combinado, falta reconfirmar') : 'previsto, sem data combinada'}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}

      {selecionado && <Detalhe c={selecionado} aoFechar={() => setSel(null)} aoSincronizar={() => sincronizar(selecionado.id)} />}
    </div>
  )
}
