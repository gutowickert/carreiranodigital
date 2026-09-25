'use client'

import { useEffect, useState } from 'react'
import { PERIODOS, intervalo } from '@/lib/periodos'

// O PAINEL DE TRÁFEGO que o cliente vê. Lê /api/cliente?so=painel (do banco, não da
// Meta) e responde as três perguntas do dono, nesta ordem: tá funcionando (o veredito e
// os números), quanto custa (por resultado e em clientes), e o que a gente fez. Embaixo,
// o placar: conquistas que destravam com dado real.

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }
const sel: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '6px 9px', fontSize: 13, color: 'var(--text)' }
const sub: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: 'var(--text)' }

const br = (d?: string | null) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—')
const brl = (v: any, casas = 0) => (v == null || v === '' ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas || 2 }))
const int = (v: any) => (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR'))
const ddmm = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7)

// todos os dias do período: a Meta só devolve os dias com gasto, e o gráfico precisa
// mostrar os vazios como zero pra não esticar 4 dias na largura de 30
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

// seta de comparação com o período anterior. `bom`: pra que lado é notícia boa
function Delta({ atual, anterior, bom }: { atual: number | null | undefined; anterior: number | null | undefined; bom: 'sobe' | 'desce' | 'neutro' }) {
  if (atual == null || !anterior) return <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>sem base pra comparar</span>
  const v = Math.round(((atual - anterior) / anterior) * 100)
  if (v === 0) return <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>= igual ao período anterior</span>
  const subiu = v > 0
  const cor = bom === 'neutro' ? 'var(--text-2)' : (subiu === (bom === 'sobe')) ? 'var(--green)' : 'var(--red)'
  return <span style={{ fontSize: 12, fontWeight: 700, color: cor }}>{subiu ? '▲' : '▼'} {subiu ? '+' : '−'}{Math.abs(v)}% <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>vs anterior</span></span>
}

export default function Painel({ k, inicio }: { k: string; inicio: string }) {
  const [periodo, setPeriodo] = useState(() => (inicio && inicio > intervalo('30d')[0] ? 'inicio' : '30d'))
  const [metrica, setMetrica] = useState<'resultados' | 'gasto'>('resultados')
  const [d, setD] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)
  const [foco, setFoco] = useState<number | null>(null)
  const [de, ate] = intervalo(periodo, inicio)

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    fetch(`/api/cliente?k=${encodeURIComponent(k)}&so=painel&de=${de}&ate=${ate}`, { cache: 'no-store' })
      .then(r => r.json()).catch(() => null)
      .then(j => { if (vivo) { setD(j); setCarregando(false); setFoco(null) } })
    return () => { vivo = false }
  }, [k, de, ate])

  const nome = d?.nome || { um: 'conversa', varios: 'conversas', frase: 'pessoas que te chamaram' }
  const porData: Record<string, any> = Object.fromEntries((d?.porDia || []).map((x: any) => [x.data, x]))
  const dias = d?.ok ? diasDoPeriodo(d.de, d.ate).map(dt => ({ data: dt, resultados: porData[dt]?.resultados || 0, gasto: porData[dt]?.gasto || 0 })) : []
  const valores = dias.map(x => x[metrica])
  const topo = topoRedondo(Math.max(0, ...valores))
  const iPico = valores.length ? valores.indexOf(Math.max(...valores)) : -1
  const fmt = (v: number) => (metrica === 'gasto' ? brl(v, v < 100 ? 2 : 0) : int(v))
  const t = d?.total, a = d?.anterior
  const muitos = dias.length > 45

  const seletor = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>{de === ate ? br(de) : `${br(de)} a ${br(ate)}`}</span>
      <select style={sel} value={periodo} onChange={e => setPeriodo(e.target.value)} aria-label="Período">
        {PERIODOS.filter(([v]) => v !== 'custom').map(([v, l]) => <option key={v} value={v}>{v === 'inicio' ? 'Desde o início do contrato' : l}</option>)}
      </select>
    </div>
  )

  if (!d && carregando) return <div style={card}>{seletor}<div style={{ fontSize: 14, color: 'var(--text-faint)', marginTop: 14 }}>Lendo a campanha… na primeira vez demora um pouco mais.</div></div>
  if (!d?.ok) return <div style={card}>{seletor}<div style={{ fontSize: 14, color: 'var(--text-faint)', marginTop: 14 }}>Os números do tráfego não carregaram agora. Tenta de novo mais tarde.</div></div>

  const puxando = d.anuncios.filter((x: any) => x.situacao === 'puxando')
  const queimando = d.anuncios.filter((x: any) => x.situacao === 'queimando')
  const outros = d.anuncios.filter((x: any) => x.situacao === 'normal' || x.situacao === 'parado')

  return (
    <div style={{ opacity: carregando ? .55 : 1, transition: 'opacity .15s' }}>
      {/* ───────── o veredito */}
      <div style={{ ...card, borderLeft: '4px solid var(--accent)' }}>
        {seletor}
        {(d.analise || []).map((frase: string, i: number) => (
          <p key={i} style={{ fontSize: i === 0 ? 17 : 14.5, fontWeight: i === 0 ? 700 : 400, color: i === 0 ? 'var(--text)' : 'var(--text-2)', lineHeight: 1.5, margin: i === 0 ? '14px 0 0' : '8px 0 0' }}>{frase}</p>
        ))}
      </div>

      {/* ───────── os números */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10, marginTop: 10 }}>
        {[
          { l: nome.varios, v: int(t.resultados), el: <Delta atual={t.resultados} anterior={a?.resultados} bom="sobe" /> },
          { l: `custo por ${nome.um.split(' ')[0]}`, v: t.custo != null ? brl(t.custo, 2) : '—', el: <Delta atual={t.custo} anterior={a?.custo} bom="desce" /> },
          { l: 'investido, com imposto', v: brl(t.gasto, 2), el: <Delta atual={t.gasto} anterior={a?.gasto} bom="neutro" /> },
        ].map(x => (
          <div key={x.l} style={{ ...card, padding: '14px 16px' }}>
            <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{x.l}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.15, marginTop: 4 }}>{x.v}</div>
            <div style={{ marginTop: 5 }}>{x.el}</div>
          </div>
        ))}
      </div>

      {/* ───────── o funil */}
      <div style={{ ...card, marginTop: 10 }}>
        <div style={sub}>Do anúncio até o cliente</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8, marginTop: 12 }}>
          {[
            { l: 'vezes que o anúncio apareceu', v: d.funil.impressoes },
            { l: 'cliques', v: d.funil.cliques },
            { l: nome.frase, v: d.funil.resultados },
            ...(d.funil.vendas != null ? [{ l: 'vendas informadas no mês', v: d.funil.vendas }] : []),
          ].map((x, i, arr) => {
            const larg = arr[0].v ? Math.max(6, Math.round((x.v / arr[0].v) * 100)) : 0
            return (
              <div key={x.l}>
                <div style={{ height: 8, borderRadius: 5, background: 'var(--surface-2)', overflow: 'hidden' }}><div style={{ width: larg + '%', height: '100%', background: i === arr.length - 1 ? 'var(--green)' : 'var(--accent)', opacity: .55 + i * .15 }} /></div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', marginTop: 8 }}>{int(x.v)}</div>
                <div style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.35 }}>{x.l}</div>
              </div>
            )
          })}
        </div>
        {t.ctr != null && <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 12 }}>De cada 100 pessoas que viram, {t.ctr.toFixed(1).replace('.', ',')} clicaram.{d.valor_cliente ? ` Um cliente novo vale ${brl(d.valor_cliente)} pra ti.` : ''}</div>}
      </div>

      {/* ───────── por dia */}
      <div style={{ ...card, marginTop: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={sub}>{metrica === 'resultados' ? `${nome.varios[0].toUpperCase() + nome.varios.slice(1)} por dia` : 'Investido por dia'}</span>
          <div role="group" aria-label="O que o gráfico mostra" style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 9, padding: 3 }}>
            {([['resultados', 'Resultados'], ['gasto', 'Investido']] as const).map(([v, l]) => (
              <button key={v} onClick={() => { setMetrica(v); setFoco(null) }} aria-pressed={metrica === v}
                style={{ border: 'none', borderRadius: 7, padding: '5px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  background: metrica === v ? 'var(--surface)' : 'transparent', color: metrica === v ? 'var(--text)' : 'var(--text-faint)', boxShadow: metrica === v ? 'var(--shadow-sm)' : 'none' }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <div style={{ position: 'relative', width: 44, height: 150, flex: 'none' }}>
            {[1, .5, 0].map(f => <span key={f} style={{ position: 'absolute', right: 0, top: `${(1 - f) * 100}%`, transform: 'translateY(-50%)', fontSize: 11, color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmt(topo * f)}</span>)}
          </div>
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <div style={{ position: 'relative', height: 150 }} onMouseLeave={() => setFoco(null)}>
              {[1, .5, 0].map(f => <div key={f} style={{ position: 'absolute', left: 0, right: 0, top: `${(1 - f) * 100}%`, borderTop: `1px ${f === 0 ? 'solid' : 'dashed'} var(--border)` }} />)}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: muitos ? 1 : 2 }}>
                {dias.map((x, i) => {
                  const v = x[metrica], h = (v / topo) * 100
                  return (
                    <div key={x.data} onMouseEnter={() => setFoco(i)} onClick={() => setFoco(i)}
                      style={{ flex: 1, minWidth: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', cursor: 'default', position: 'relative' }}>
                      {i === iPico && v > 0 && <span style={{ position: 'absolute', bottom: `calc(${h}% + 4px)`, fontSize: 11.5, fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap' }}>{fmt(v)}</span>}
                      <div style={{ width: '100%', maxWidth: 34, height: v > 0 ? `max(3px, ${h}%)` : 2, borderRadius: v > 0 ? '4px 4px 0 0' : 1,
                        background: v > 0 ? 'var(--accent)' : 'var(--border-strong)', opacity: foco == null || foco === i ? 1 : .45, transition: 'opacity .1s' }} />
                    </div>
                  )
                })}
              </div>
              {foco != null && dias[foco] && (
                <div style={{ position: 'absolute', top: -6, left: `${((foco + .5) / dias.length) * 100}%`, transform: `translate(${foco / dias.length > .7 ? '-100%' : foco / dias.length < .3 ? '0' : '-50%'}, -100%)`,
                  background: 'var(--text)', color: 'var(--bg)', borderRadius: 8, padding: '7px 10px', fontSize: 12, lineHeight: 1.45, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 2, boxShadow: 'var(--shadow-md)' }}>
                  <b>{br(dias[foco].data)}</b><br />{int(dias[foco].resultados)} {dias[foco].resultados === 1 ? nome.um : nome.varios} · {brl(dias[foco].gasto, 2)}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums' }}>
              <span>{dias[0] && ddmm(dias[0].data)}</span>
              {dias.length > 2 && <span>{ddmm(dias[Math.floor(dias.length / 2)].data)}</span>}
              <span>{dias.length > 1 && ddmm(dias[dias.length - 1].data)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ───────── os anúncios */}
      {!!d.anuncios.length && (
        <div style={{ ...card, marginTop: 10 }}>
          <div style={sub}>Os anúncios</div>
          {!!puxando.length && <Grupo titulo="Puxando resultado" cor="var(--green)" lista={puxando} nome={nome} />}
          {!!queimando.length && <Grupo titulo="Gastando sem trazer" cor="var(--red)" lista={queimando} nome={nome} />}
          {!!outros.length && <Grupo titulo={puxando.length || queimando.length ? 'Os demais' : 'No período'} cor="var(--text-faint)" lista={outros} nome={nome} />}
        </div>
      )}

      {/* ───────── o que a gente fez */}
      {!!d.eventos.length && (
        <div style={{ ...card, marginTop: 10, padding: '14px 18px 6px' }}>
          <div style={sub}>O que a gente fez na campanha</div>
          {d.eventos.slice(0, 8).map((e: any, i: number) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '10px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
              <span style={{ color: e.tipo === 'anuncio_pausado' ? 'var(--amber)' : 'var(--accent)', fontSize: 12 }}>●</span>
              <span style={{ flex: 1, fontSize: 14, color: 'var(--text)' }}>{e.titulo}{e.descricao && <span style={{ color: 'var(--text-faint)' }}> · {e.descricao}</span>}</span>
              <span style={{ fontSize: 12, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{br(e.data)}</span>
            </div>
          ))}
        </div>
      )}

      {/* ───────── o placar */}
      {!!(d.conquistas.length || d.proximas.length) && (
        <div style={{ ...card, marginTop: 10 }}>
          <div style={sub}>O placar</div>
          {!!d.conquistas.length && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 8, marginTop: 12 }}>
              {d.conquistas.map((c: any, i: number) => (
                <div key={i} style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>✔ {c.titulo}</div>
                  {c.descricao && <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.4 }}>{c.descricao}</div>}
                  <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 5 }}>{br(c.destravada_em)}</div>
                </div>
              ))}
            </div>
          )}
          {!!d.proximas.length && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 8 }}>A caminho</div>
              {d.proximas.map((x: any, i: number) => (
                <div key={i} style={{ marginTop: i ? 10 : 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, color: 'var(--text)' }}><b>{x.titulo}</b><span style={{ color: 'var(--text-faint)' }}>faltam {int(x.falta)}</span></div>
                  <div style={{ height: 8, borderRadius: 5, background: 'var(--surface-2)', marginTop: 6, overflow: 'hidden' }}><div style={{ width: Math.min(100, x.progresso) + '%', height: '100%', background: 'var(--accent)' }} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 12, lineHeight: 1.55 }}>
        As setas comparam com {br(d.de_anterior)} a {br(d.ate_anterior)}.
        {t.impostoPct ? ` O investido já inclui os ${String(t.impostoPct).replace('.', ',')}% de imposto que a Meta cobra.` : ''}
        {d.sincronizado_em ? ` Números lidos da Meta em ${new Date(d.sincronizado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.` : ''}
      </div>
    </div>
  )
}

function Grupo({ titulo, cor, lista, nome }: { titulo: string; cor: string; lista: any[]; nome: any }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: cor, marginBottom: 8 }}>{titulo}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 8 }}>
        {lista.map((x: any) => (
          <div key={x.ad_id} style={{ display: 'flex', gap: 12, background: 'var(--surface-2)', borderRadius: 10, padding: 10, opacity: x.situacao === 'parado' ? .6 : 1 }}>
            <div style={{ width: 64, height: 64, borderRadius: 8, background: 'var(--border)', flex: 'none', overflow: 'hidden' }}>
              {x.imagem_url && <img src={x.imagem_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={x.nome}>{x.nome}</div>
              <div style={{ fontSize: 15, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', marginTop: 3 }}>
                <b>{int(x.resultados)}</b> <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{x.resultados === 1 ? nome.um : nome.varios}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>
                {x.custo != null ? `${brl(x.custo, 2)} cada · ` : ''}{brl(x.gasto, 2)} investidos{/PAUSED|ARCHIVED/i.test(x.status) ? ' · pausado' : ''}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
