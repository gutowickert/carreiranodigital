'use client'

import { useEffect, useState } from 'react'
import { PERIODOS, intervalo } from '@/lib/periodos'

// ÁREA DO CLIENTE — o assinante acompanha o próprio projeto: a meta, o tráfego,
// os fechamentos do mês, o que falta dele e os encontros. Abre com o link que a
// escola manda (/cliente?k=…), sem login. Tudo que é interno da escola fica de fora
// (quem decide isso é a API, não esta tela).

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }
const tit: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '30px 0 10px' }
const btn: React.CSSProperties = { border: 'none', borderRadius: 9, padding: '9px 14px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }
const sel: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '6px 9px', fontSize: 13, color: 'var(--text)' }

const br = (d?: string | null) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—')
const brl = (v: any, casas = 0) => (v == null || v === '' ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas || 2 }))
const int = (v: any) => (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR'))
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const nomeMes = (m?: string | null) => (m ? `${MESES[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}` : '')
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const dataHora = (d?: string | null) => {
  if (!d) return ''
  const dt = new Date(d)
  return dt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })
}

export default function AreaDoCliente() {
  const [k, setK] = useState('')
  const [d, setD] = useState<any>(null)
  const [erro, setErro] = useState('')
  const [confirmando, setConfirmando] = useState(false)

  async function carregar(chave: string) {
    const r = await fetch(`/api/cliente?k=${encodeURIComponent(chave)}`, { cache: 'no-store' }).catch(() => null)
    const j = r ? await r.json().catch(() => null) : null
    if (j?.ok) { setD(j); document.title = `${j.projeto.cliente} · Carreira no Digital` }
    else setErro(j?.error || 'Não consegui abrir. Confere a internet e tenta de novo.')
  }

  useEffect(() => {
    const chave = new URLSearchParams(window.location.search).get('k') || ''
    setK(chave)
    if (!chave) { setErro('Esse link está incompleto. Pede o link da tua área pra escola.'); return }
    carregar(chave)
  }, [])

  async function confirmar(id: string) {
    setConfirmando(true)
    await fetch('/api/cliente', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k, acao: 'confirmar', id }) }).catch(() => null)
    await carregar(k)
    setConfirmando(false)
  }

  if (erro) return <Moldura><div style={{ ...card, marginTop: 40, fontSize: 15, color: 'var(--text-2)' }}>{erro}</div></Moldura>
  if (!d) return <Moldura><div style={{ marginTop: 60, color: 'var(--text-faint)', fontSize: 14 }}>Carregando…</div></Moldura>

  const p = d.projeto
  const marcos: any[] = d.marcos || []
  const fechados = (d.placar || []).filter((l: any) => !l.ponto_a && l.mes).sort((a: any, b: any) => String(b.mes).localeCompare(String(a.mes)))
  const pontoA = (d.placar || []).find((l: any) => l.ponto_a)
  const abertas = (d.pendencias || []).filter((x: any) => !x.entregue_em)
  const proximo = marcos.find(m => m.natureza === 'encontro' && m.estado !== 'concluido' && m.estado !== 'cancelado')

  return (
    <Moldura>
      {/* ───────── topo */}
      <header style={{ marginTop: 28 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--accent)' }}>Carreira no Digital · {p.produto}</div>
        <h1 style={{ fontSize: 'clamp(28px,5vw,40px)', fontWeight: 800, color: 'var(--text)', margin: '6px 0 0', lineHeight: 1.1, textWrap: 'balance' as any }}>{p.cliente}</h1>
        <p style={{ fontSize: 14, color: 'var(--text-faint)', margin: '8px 0 0' }}>
          Contrato de {br(p.data_inicio)} a {br(p.data_fim)}
          {p.fase && <> · agora: <b style={{ color: 'var(--text-2)' }}>{p.fase}</b></>}
        </p>
      </header>

      {/* ───────── meta */}
      <div style={tit}>Onde tu quer chegar</div>
      <Meta projeto={p} ultimo={fechados[0]} />

      {/* ───────── próximo encontro */}
      {proximo && (
        <>
          <div style={tit}>Próximo encontro</div>
          <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{proximo.titulo}</div>
              <div style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 4 }}>
                {proximo.data_combinada && proximo.estado !== 'previsto' && proximo.estado !== 'a_remarcar'
                  ? <span>{maiuscula(dataHora(proximo.data_combinada))}</span>
                  : <>por volta de {br(proximo.data_prevista)} — a data a gente combina no encontro anterior</>}
              </div>
              {proximo.descricao && <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 6 }}>{proximo.descricao}</div>}
            </div>
            {proximo.estado === 'combinado' && (
              <button onClick={() => confirmar(proximo.id)} disabled={confirmando} style={{ ...btn, background: 'var(--green)', color: '#fff' }}>{confirmando ? 'Confirmando…' : 'Confirmo presença'}</button>
            )}
            {proximo.estado === 'confirmado' && <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--green)' }}>✔ Presença confirmada</span>}
          </div>
        </>
      )}

      {/* ───────── o que falta do cliente */}
      {!!abertas.length && (
        <>
          <div style={tit}>O que a gente precisa de ti</div>
          <div style={{ ...card, padding: '6px 18px' }}>
            {abertas.map((x: any, i: number) => (
              <div key={x.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '11px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                <span style={{ color: 'var(--amber)' }}>●</span>
                <span style={{ flex: 1, fontSize: 14.5, color: 'var(--text)' }}>{x.descricao}</span>
                <span style={{ fontSize: 12, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>pedido em {br(x.pedido_em)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ───────── tráfego */}
      {p.tem_conta_anuncio && (
        <>
          <div style={tit}>Tráfego</div>
          <Trafego k={k} inicio={String(p.data_inicio || '').slice(0, 10)} />
        </>
      )}

      {/* ───────── fechamentos */}
      {(!!fechados.length || pontoA) && (
        <>
          <div style={tit}>Mês a mês</div>
          <Fechamentos fechados={fechados} pontoA={pontoA} projeto={p} />
        </>
      )}

      {/* ───────── conquistas */}
      {!!(d.registros || []).length && (
        <>
          <div style={tit}>Conquistas</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 10 }}>
            {d.registros.map((x: any) => (
              <div key={x.id} style={{ ...card, padding: 14 }}>
                {x.arquivo_url && x.arquivo_mime?.startsWith('image/') && (
                  <a href={x.arquivo_url} target="_blank" rel="noopener"><img src={x.arquivo_url} alt={x.titulo} style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 8, marginBottom: 10 }} /></a>
                )}
                <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)' }}>{x.tipo === 'marco' ? '🏆 ' : ''}{x.titulo}</div>
                <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 3 }}>{br(x.data)}</div>
                {x.descricao && <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6 }}>{x.descricao}</div>}
                {x.arquivo_url && !x.arquivo_mime?.startsWith('image/') && <a href={x.arquivo_url} target="_blank" rel="noopener" style={{ fontSize: 13, color: 'var(--accent)' }}>abrir arquivo</a>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ───────── linha do tempo */}
      <div style={tit}>O contrato, do começo ao fim</div>
      <div style={{ ...card, padding: '4px 18px' }}>
        {marcos.map((m, i) => {
          const feito = m.estado === 'concluido'
          const ehProximo = proximo && m.id === proximo.id
          const quando = feito ? `feito em ${br(m.concluido_em)}` : m.data_combinada && (m.estado === 'combinado' || m.estado === 'confirmado') ? br(m.data_combinada) : `~${br(m.data_prevista)}`
          return (
            <div key={m.id} style={{ display: 'flex', gap: 12, padding: '12px 0', borderTop: i ? '1px solid var(--border)' : 'none', opacity: feito ? .6 : 1 }}>
              <span style={{ width: 18, textAlign: 'center', color: feito ? 'var(--green)' : ehProximo ? 'var(--accent)' : 'var(--text-faint)', fontSize: 14 }}>{feito ? '✔' : m.natureza === 'encontro' ? '●' : '◆'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14.5, fontWeight: ehProximo ? 700 : 600, color: 'var(--text)' }}>{m.titulo}</div>
                {m.descricao && !feito && <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 2 }}>{m.descricao}</div>}
              </div>
              <span style={{ fontSize: 12.5, color: 'var(--text-2)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{quando}</span>
            </div>
          )
        })}
      </div>

      {/* ───────── mensalidade */}
      {p.mensalidade_valor && (
        <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '22px 0 0' }}>
          Mensalidade: {brl(p.mensalidade_valor)}{p.mensalidade_dia ? `, todo dia ${p.mensalidade_dia}` : ''}.
        </p>
      )}
    </Moldura>
  )
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '8px 20px 70px' }}>{children}</div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────── meta do contrato

function Meta({ projeto: p, ultimo }: { projeto: any; ultimo: any }) {
  const nums = [
    { alvo: p.meta_leads, agora: ultimo?.leads, l: 'leads', f: int },
    { alvo: p.meta_vendas, agora: ultimo?.vendas, l: 'vendas', f: int },
    { alvo: p.meta_faturamento, agora: ultimo?.comissao, l: 'de faturamento', f: (v: any) => brl(v) },
  ].filter(x => x.alvo != null)
  if (!p.meta_objetivo && !nums.length) return (
    <div style={{ ...card, fontSize: 14, color: 'var(--text-2)' }}>A meta do contrato ainda vai ser definida com a escola.</div>
  )
  return (
    <div style={card}>
      {p.meta_objetivo && <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4 }}>{p.meta_objetivo}</div>}
      <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 4 }}>Meta por mês, até {br(p.data_fim)}{ultimo ? ` · comparada com ${nomeMes(ultimo.mes)}` : ''}</div>
      {!!nums.length && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 16, marginTop: 16 }}>
          {nums.map(x => {
            const pc = x.agora != null && Number(x.alvo) > 0 ? Math.round((Number(x.agora) / Number(x.alvo)) * 100) : null
            return (
              <div key={x.l}>
                <div style={{ fontSize: 14, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
                  <b style={{ fontSize: 22, color: 'var(--text)' }}>{x.agora != null ? x.f(x.agora) : '—'}</b> de {x.f(x.alvo)} {x.l}
                </div>
                <div style={{ height: 8, borderRadius: 5, background: 'var(--surface-2)', marginTop: 8, overflow: 'hidden' }}>
                  <div style={{ width: Math.min(100, pc || 0) + '%', height: '100%', borderRadius: 5, background: pc != null && pc >= 100 ? 'var(--green)' : 'var(--accent)' }} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4 }}>{pc != null ? `${pc}% da meta` : 'nenhum mês fechado ainda'}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────── tráfego

// todos os dias do período — a Meta só devolve os dias com gasto, e o gráfico
// precisa mostrar os vazios como zero pra não esticar 4 dias na largura de 30
function diasDoPeriodo(de: string, ate: string): string[] {
  const out: string[] = []
  const d = new Date(de + 'T12:00:00Z'), fim = new Date(ate + 'T12:00:00Z')
  while (d <= fim && out.length < 400) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1) }
  return out
}
// topo "redondo" do eixo: 7 → 8, 23 → 25, 140 → 150
function topoRedondo(v: number) {
  if (v <= 0) return 1
  const e = Math.pow(10, Math.floor(Math.log10(v)))
  return ([1, 2, 2.5, 5, 10].map(m => m * e).find(n => n >= v)) || v
}
const ddmm = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7)

// seta de comparação com o período anterior. `bom`: pra que lado é notícia boa
function Delta({ atual, anterior, bom }: { atual: number | null | undefined; anterior: number | null | undefined; bom: 'sobe' | 'desce' | 'neutro' }) {
  if (atual == null || !anterior) return <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>sem base pra comparar</span>
  const v = Math.round(((atual - anterior) / anterior) * 100)
  if (v === 0) return <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>= igual ao período anterior</span>
  const subiu = v > 0
  const cor = bom === 'neutro' ? 'var(--text-2)' : (subiu === (bom === 'sobe')) ? 'var(--green)' : 'var(--red)'
  return <span style={{ fontSize: 12, fontWeight: 700, color: cor }}>{subiu ? '▲' : '▼'} {subiu ? '+' : '−'}{Math.abs(v)}% <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>vs anterior</span></span>
}

function Trafego({ k, inicio }: { k: string; inicio: string }) {
  const [periodo, setPeriodo] = useState(() => (inicio && inicio > intervalo('30d')[0] ? 'inicio' : '30d'))
  const [metrica, setMetrica] = useState<'conversas' | 'gasto'>('conversas')
  const [d, setD] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)
  const [foco, setFoco] = useState<number | null>(null)
  const [de, ate] = intervalo(periodo, inicio)

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    fetch(`/api/cliente?k=${encodeURIComponent(k)}&so=meta&de=${de}&ate=${ate}`, { cache: 'no-store' })
      .then(r => r.json()).catch(() => null)
      .then(j => { if (vivo) { setD(j); setCarregando(false); setFoco(null) } })
    return () => { vivo = false }
  }, [k, de, ate])

  const porData: Record<string, any> = Object.fromEntries((d?.porDia || []).map((x: any) => [x.data, x]))
  const dias = d?.ok ? diasDoPeriodo(d.de, d.ate).map(dt => ({ data: dt, conversas: porData[dt]?.conversas || 0, gasto: porData[dt]?.gasto || 0 })) : []
  const valores = dias.map(x => x[metrica])
  const topo = topoRedondo(Math.max(0, ...valores))
  const iPico = valores.length ? valores.indexOf(Math.max(...valores)) : -1
  const fmt = (v: number) => (metrica === 'gasto' ? brl(v, v < 100 ? 2 : 0) : int(v))
  const t = d?.total, a = d?.anterior
  const muitos = dias.length > 45

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>{de === ate ? br(de) : `${br(de)} a ${br(ate)}`}</span>
        <select style={sel} value={periodo} onChange={e => setPeriodo(e.target.value)} aria-label="Período">
          {PERIODOS.filter(([v]) => v !== 'custom').map(([v, l]) => <option key={v} value={v}>{v === 'inicio' ? 'Desde o início do contrato' : l}</option>)}
        </select>
      </div>

      {!d && carregando ? (
        <div style={{ fontSize: 14, color: 'var(--text-faint)', marginTop: 14 }}>Lendo a conta de anúncio…</div>
      ) : !d?.ok ? (
        <div style={{ fontSize: 14, color: 'var(--text-faint)', marginTop: 14 }}>Os números do tráfego não carregaram agora. Tenta de novo mais tarde.</div>
      ) : (
        <div style={{ opacity: carregando ? .55 : 1, transition: 'opacity .15s' }}>
          {/* cartões: o número grande + a comparação com o período anterior */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10, marginTop: 14 }}>
            {[
              { l: 'conversas no WhatsApp', v: int(t.conversas), el: <Delta atual={t.conversas} anterior={a?.conversas} bom="sobe" /> },
              { l: 'custo por conversa', v: t.custoConversa != null ? brl(t.custoConversa, 2) : '—', el: <Delta atual={t.custoConversa} anterior={a?.custoConversa} bom="desce" /> },
              { l: 'investido, com imposto', v: brl(t.gasto, 2), el: <Delta atual={t.gasto} anterior={a?.gasto} bom="neutro" /> },
            ].map(x => (
              <div key={x.l} style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{x.l}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.15, marginTop: 4 }}>{x.v}</div>
                <div style={{ marginTop: 5 }}>{x.el}</div>
              </div>
            ))}
          </div>

          {/* gráfico por dia */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{metrica === 'conversas' ? 'Conversas por dia' : 'Investido por dia'}</span>
            <div role="group" aria-label="O que o gráfico mostra" style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 9, padding: 3 }}>
              {([['conversas', 'Conversas'], ['gasto', 'Investido']] as const).map(([v, l]) => (
                <button key={v} onClick={() => { setMetrica(v); setFoco(null) }} aria-pressed={metrica === v}
                  style={{ border: 'none', borderRadius: 7, padding: '5px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                    background: metrica === v ? 'var(--surface)' : 'transparent', color: metrica === v ? 'var(--text)' : 'var(--text-faint)', boxShadow: metrica === v ? 'var(--shadow-sm)' : 'none' }}>{l}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {/* eixo: 0, meio, topo */}
            <div style={{ position: 'relative', width: 44, height: 170, flex: 'none' }}>
              {[1, .5, 0].map(f => (
                <span key={f} style={{ position: 'absolute', right: 0, top: `${(1 - f) * 100}%`, transform: 'translateY(-50%)', fontSize: 11, color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmt(topo * f)}</span>
              ))}
            </div>
            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              <div style={{ position: 'relative', height: 170 }} onMouseLeave={() => setFoco(null)}>
                {[1, .5, 0].map(f => (
                  <div key={f} style={{ position: 'absolute', left: 0, right: 0, top: `${(1 - f) * 100}%`, borderTop: `1px ${f === 0 ? 'solid' : 'dashed'} var(--border)` }} />
                ))}
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: muitos ? 1 : 2 }}>
                  {dias.map((x, i) => {
                    const v = x[metrica]
                    const h = (v / topo) * 100
                    return (
                      <div key={x.data} onMouseEnter={() => setFoco(i)} onClick={() => setFoco(i)}
                        style={{ flex: 1, minWidth: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', cursor: 'default', position: 'relative' }}>
                        {i === iPico && v > 0 && (
                          <span style={{ position: 'absolute', bottom: `calc(${h}% + 4px)`, fontSize: 11.5, fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap' }}>{fmt(v)}</span>
                        )}
                        <div style={{ width: '100%', maxWidth: 34, height: v > 0 ? `max(3px, ${h}%)` : 2, borderRadius: v > 0 ? '4px 4px 0 0' : 1,
                          background: v > 0 ? 'var(--accent)' : 'var(--border-strong)', opacity: foco == null || foco === i ? 1 : .45, transition: 'opacity .1s' }} />
                      </div>
                    )
                  })}
                </div>

                {/* dica do dia */}
                {foco != null && dias[foco] && (
                  <div style={{ position: 'absolute', top: -6, left: `${((foco + .5) / dias.length) * 100}%`, transform: `translate(${foco / dias.length > .7 ? '-100%' : foco / dias.length < .3 ? '0' : '-50%'}, -100%)`,
                    background: 'var(--text)', color: 'var(--bg)', borderRadius: 8, padding: '7px 10px', fontSize: 12, lineHeight: 1.45, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 2, boxShadow: 'var(--shadow-md)' }}>
                    <b>{br(dias[foco].data)}</b><br />
                    {int(dias[foco].conversas)} {dias[foco].conversas === 1 ? 'conversa' : 'conversas'} · {brl(dias[foco].gasto, 2)}
                  </div>
                )}
              </div>
              {/* datas: começo, meio e fim */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums' }}>
                <span>{dias[0] && ddmm(dias[0].data)}</span>
                {dias.length > 2 && <span>{ddmm(dias[Math.floor(dias.length / 2)].data)}</span>}
                <span>{dias.length > 1 && ddmm(dias[dias.length - 1].data)}</span>
              </div>
            </div>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 12, lineHeight: 1.55 }}>
            Passa o mouse (ou toca) num dia pra ver o número. As setas comparam com {br(d.de_anterior)} a {br(d.ate_anterior)}.
            {t.impostoPct ? ` O investido já inclui os ${String(t.impostoPct).replace('.', ',')}% de imposto que a Meta cobra.` : ''}
          </div>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────── mês a mês

function Fechamentos({ fechados, pontoA, projeto: p }: { fechados: any[]; pontoA: any; projeto: any }) {
  const th: React.CSSProperties = { padding: '8px 10px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)', textAlign: 'right', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '11px 10px', borderBottom: '1px solid var(--border)', textAlign: 'right', color: 'var(--text-2)', whiteSpace: 'nowrap' }
  const metaCol = p.meta_vendas != null ? { col: 'vendas', alvo: Number(p.meta_vendas) } : p.meta_faturamento != null ? { col: 'comissao', alvo: Number(p.meta_faturamento) } : null
  const linha = (l: any, rotulo: React.ReactNode) => {
    const cpc = l.conversas && Number(l.verba) ? Number(l.verba) / Number(l.conversas) : null
    const ret = l.comissao != null && Number(l.verba) ? Number(l.comissao) / Number(l.verba) : null
    const pm = metaCol && !l.ponto_a && l[metaCol.col] != null && metaCol.alvo > 0 ? Math.round((Number(l[metaCol.col]) / metaCol.alvo) * 100) : null
    return (
      <tr key={l.id}>
        <td style={{ ...td, textAlign: 'left', color: 'var(--text)', fontWeight: 600 }}>{rotulo}</td>
        <td style={td}>{brl(l.verba)}</td>
        <td style={td}>{int(l.conversas)}</td>
        <td style={td}>{cpc != null ? brl(cpc, 2) : '—'}</td>
        <td style={td}>{int(l.vendas)}</td>
        <td style={{ ...td, color: 'var(--text)', fontWeight: 700 }}>{brl(l.comissao)}</td>
        <td style={{ ...td, color: ret != null && ret >= 1 ? 'var(--green)' : 'var(--text-2)', fontWeight: 700 }}>{ret != null ? ret.toFixed(1).replace('.', ',') + '×' : '—'}</td>
        <td style={{ ...td, fontWeight: 700, color: pm == null ? 'var(--text-faint)' : pm >= 100 ? 'var(--green)' : 'var(--text-2)' }}>{pm != null ? pm + '%' : '—'}</td>
      </tr>
    )
  }
  return (
    <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640, fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>
        <thead><tr>{['', 'investido', 'conversas', 'custo/conv.', 'vendas', 'faturamento', 'retorno', 'da meta'].map((h, i) => <th key={i} style={{ ...th, textAlign: i ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
        <tbody>
          {fechados.map(l => linha(l, <span style={{ textTransform: 'capitalize' }}>{nomeMes(l.mes)}</span>))}
          {pontoA && linha(pontoA, <span style={{ color: 'var(--text-faint)' }}>Antes (ponto A)</span>)}
        </tbody>
      </table>
      <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '10px 14px' }}>
        Retorno = faturamento ÷ investido. {metaCol ? `"Da meta" compara ${metaCol.col === 'vendas' ? 'as vendas' : 'o faturamento'} do mês com a meta.` : ''}
      </div>
    </div>
  )
}
