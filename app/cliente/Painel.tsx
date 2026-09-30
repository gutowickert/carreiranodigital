'use client'

import { useEffect, useState } from 'react'
import { PERIODOS, intervalo } from '@/lib/periodos'
import { Flame, Trophy, Rocket, Users, Target, Star, Crown, Medal, Zap, TrendingUp, Eye, MousePointerClick, MessageCircle, ShoppingBag, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'

// O PLACAR DO CLIENTE (27/09/2026, redesenho pedido pelo Guto: "os números de tráfego bem na frente,
// a tela mais linda, resolutiva pro celular, com gamificação").
// Ordem: 1) o número grande do período, 2) o jogo (nível, sequência, medalhas), 3) a leitura em
// frases, 4) os anúncios com a foto, 5) por dia e o funil, 6) o que a gente fez.
// Lê /api/cliente?so=painel, que relê a Meta ao abrir (dados ao vivo), num único desenho pra celular:
// uma coluna, cartões de vidro sobre o fundo escuro da escola, número grande na fonte de gritar (.display).

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: 18 }
const rotulo: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-faint)' }
const grad = 'linear-gradient(135deg, #7c3aed, #c026d3)'

const br = (d?: string | null) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—')
const brl = (v: any, casas = 0) => (v == null || v === '' ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas || 2 }))
const int = (v: any) => (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR'))
const ddmm = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function diasDoPeriodo(de: string, ate: string): string[] {
  const out: string[] = []
  const d = new Date(de + 'T12:00:00Z'), fim = new Date(ate + 'T12:00:00Z')
  while (d <= fim && out.length < 400) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1) }
  return out
}
function topoRedondo(v: number) {
  if (v <= 0) return 1
  const e = Math.pow(10, Math.floor(Math.log10(v)))
  return ([1, 2, 2.5, 5, 10].map(m => m * e).find(n => n >= v)) || v
}

// a pílula de comparação com o período anterior. `bom`: pra que lado é notícia boa
function Delta({ atual, anterior, bom, escuro }: { atual: number | null | undefined; anterior: number | null | undefined; bom: 'sobe' | 'desce' | 'neutro'; escuro?: boolean }) {
  const base: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 800, padding: '4px 9px', borderRadius: 999, whiteSpace: 'nowrap' }
  // anterior zerado: diz 'antes: 0' (é comparação, não falta de dado); só sem número nenhum é 'sem período anterior'
  if (atual == null || anterior == null) return <span style={{ ...base, fontWeight: 600, whiteSpace: 'normal', lineHeight: 1.2, background: escuro ? 'rgba(255,255,255,.12)' : 'var(--surface-2)', color: escuro ? 'rgba(255,255,255,.75)' : 'var(--text-faint)' }}>sem período anterior</span>
  if (!anterior) return <span style={{ ...base, fontWeight: 600, background: escuro ? 'rgba(255,255,255,.12)' : 'var(--surface-2)', color: escuro ? 'rgba(255,255,255,.75)' : 'var(--text-faint)' }}>antes: 0</span>
  const v = Math.round(((atual - anterior) / anterior) * 100)
  if (v === 0) return <span style={{ ...base, background: escuro ? 'rgba(255,255,255,.12)' : 'var(--surface-2)', color: escuro ? '#fff' : 'var(--text-2)' }}><Minus size={12} /> igual ao anterior</span>
  const subiu = v > 0
  const boa = bom === 'neutro' ? null : subiu === (bom === 'sobe')
  const cor = boa == null ? (escuro ? '#fff' : 'var(--text-2)') : boa ? '#86efac' : '#fca5a5'
  const fundo = boa == null ? 'rgba(255,255,255,.12)' : boa ? 'rgba(34,197,94,.22)' : 'rgba(240,71,95,.22)'
  return <span style={{ ...base, background: fundo, color: cor }}>{subiu ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{Math.abs(v)}% <span style={{ fontWeight: 500, opacity: .8 }}>vs anterior</span></span>
}

// ícone de cada medalha pela chave da conquista
function iconeDe(chave: string) {
  if (chave.startsWith('primeira_campanha')) return Rocket
  if (chave.startsWith('alcance_')) return Users
  if (chave.startsWith('resultados_')) return MessageCircle
  if (chave.startsWith('melhor_mes')) return Trophy
  if (chave.startsWith('custo_no_alvo')) return Target
  if (chave.startsWith('primeira_venda')) return ShoppingBag
  return Star
}

// a ordem dos chips: do agora pro sempre
const ORDEM = ['hoje', 'ontem', '7d', '30d', 'mes', 'mes_passado', 'inicio']

export default function Painel({ k, inicio, nomeCliente }: { k: string; inicio: string; nomeCliente?: string }) {
  const [periodo, setPeriodo] = useState('hoje')   // abre em hoje (decisão do Guto, 29/09/2026)
  const [recarga, setRecarga] = useState(0)          // muda quando o cliente registra uma venda
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
  }, [k, de, ate, recarga])

  const nome = d?.nome || { um: 'conversa', varios: 'conversas', frase: 'pessoas que te chamaram' }
  const porData: Record<string, any> = Object.fromEntries((d?.porDia || []).map((x: any) => [x.data, x]))
  const dias = d?.ok ? diasDoPeriodo(d.de, d.ate).map(dt => ({ data: dt, resultados: porData[dt]?.resultados || 0, gasto: porData[dt]?.gasto || 0 })) : []
  const valores = dias.map(x => x[metrica])
  const topo = topoRedondo(Math.max(0, ...valores))
  const iPico = valores.length ? valores.indexOf(Math.max(...valores)) : -1
  const fmt = (v: number) => (metrica === 'gasto' ? brl(v, v < 100 ? 2 : 0) : int(v))
  const t = d?.total, a = d?.anterior
  const muitos = dias.length > 45

  // os períodos como CHIPS que rolam de lado (no celular o <select> escondia a escolha)
  const chips = (
    <div className="rolavel-celular" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
      {PERIODOS.filter(([v]) => v !== 'custom').sort((a, b) => ORDEM.indexOf(a[0]) - ORDEM.indexOf(b[0])).map(([v, l]) => {
        const ativo = periodo === v
        return <button key={v} onClick={() => setPeriodo(v)} aria-pressed={ativo} style={{ flexShrink: 0, border: '1px solid ' + (ativo ? 'transparent' : 'var(--border-strong)'), background: ativo ? grad : 'var(--surface)', color: ativo ? '#fff' : 'var(--text-2)', borderRadius: 999, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', font: 'inherit', boxShadow: ativo ? '0 6px 18px rgba(124,58,237,.35)' : 'none' }}>{v === 'inicio' ? 'Desde o início' : l}</button>
      })}
    </div>
  )

  if (!d && carregando) return <div>{chips}<div style={{ ...card, marginTop: 12, minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontSize: 14 }}>Lendo a campanha na Meta agora…</div></div>
  if (!d?.ok) return <div>{chips}<div style={{ ...card, marginTop: 12, fontSize: 14, color: 'var(--text-faint)' }}>Os números do tráfego não carregaram agora. Tenta de novo mais tarde.</div></div>

  const puxando = d.anuncios.filter((x: any) => x.situacao === 'puxando')
  const queimando = d.anuncios.filter((x: any) => x.situacao === 'queimando')
  const outros = d.anuncios.filter((x: any) => x.situacao === 'normal' || x.situacao === 'parado')
  const jogo = d.jogo
  const lidoAs = d.sincronizado_em ? new Date(d.sincronizado_em).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }) : null
  const periodoTxt = de === ate ? br(de) : `${br(de)} a ${br(ate)}`
  const medalhas = [...d.conquistas].sort((x: any, y: any) => String(y.destravada_em).localeCompare(String(x.destravada_em)))

  return (
    <div style={{ opacity: carregando ? .6 : 1, transition: 'opacity .15s' }}>
      {chips}

      {/* ═════════ 1. O NÚMERO GRANDE */}
      <div style={{ marginTop: 12, borderRadius: 24, padding: 22, position: 'relative', overflow: 'hidden', color: '#fff', background: 'linear-gradient(140deg, #1a0733 0%, #2b0a55 42%, #4a12a0 78%, #7b2ae8 100%)', boxShadow: '0 24px 60px rgba(74,18,160,.45)' }}>
        <div style={{ position: 'absolute', right: -40, top: -40, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,.18), transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ ...rotulo, color: 'rgba(255,255,255,.7)' }}>{periodoTxt}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: 'rgba(255,255,255,.85)', background: 'rgba(255,255,255,.14)', borderRadius: 999, padding: '4px 10px' }}>
            <span style={{ width: 7, height: 7, borderRadius: 4, background: '#4ade80', boxShadow: '0 0 0 3px rgba(74,222,128,.3)' }} /> ao vivo{lidoAs ? ` · ${lidoAs}` : ''}
          </span>
        </div>
        <div className="display" style={{ fontSize: 'clamp(64px, 20vw, 96px)', fontWeight: 800, lineHeight: .95, marginTop: 14, fontVariantNumeric: 'tabular-nums', textShadow: '0 10px 30px rgba(0,0,0,.35)' }}>{int(t.resultados)}</div>
        <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4, textWrap: 'balance' as any }}>{t.resultados === 1 ? nome.um : nome.varios} <span style={{ fontWeight: 500, opacity: .8 }}>· {nome.frase}</span></div>
        <div style={{ marginTop: 12 }}><Delta atual={t.resultados} anterior={a?.resultados} bom="sobe" escuro /></div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 18 }}>
          {[
            { l: `custo por ${nome.um.split(' ')[0]}`, v: t.custo != null ? brl(t.custo, 2) : '—', el: <Delta atual={t.custo} anterior={a?.custo} bom="desce" escuro />, extra: d.alvo_custo && t.custo != null ? (t.custo <= d.alvo_custo ? `abaixo do alvo de ${brl(d.alvo_custo, 2)}` : `alvo: ${brl(d.alvo_custo, 2)}`) : null },
            d.modelo === 'infoproduto'
              ? { l: 'faturamento', v: brl(t.faturamento, 2), el: <Delta atual={t.faturamento} anterior={a?.faturamento} bom="sobe" escuro />, extra: t.roas != null ? `cada R$ 1 no anúncio voltou R$ ${t.roas.toFixed(2).replace('.', ',')} · ${brl(t.gasto, 2)} investido` : `${brl(t.gasto, 2)} investido` }
              : { l: 'investido', v: brl(t.gasto, 2), el: <Delta atual={t.gasto} anterior={a?.gasto} bom="neutro" escuro />, extra: t.impostoPct ? 'com imposto' : null },
          ].map(x => (
            <div key={x.l} style={{ background: 'rgba(255,255,255,.10)', border: '1px solid rgba(255,255,255,.16)', borderRadius: 16, padding: '12px 14px', backdropFilter: 'blur(8px)' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'rgba(255,255,255,.7)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{x.l}</div>
              <div className="display" style={{ fontSize: 'clamp(22px, 7vw, 30px)', fontWeight: 800, marginTop: 4, fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>{x.v}</div>
              <div style={{ marginTop: 7, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>{x.el}{x.extra && <span style={{ fontSize: 11, color: 'rgba(255,255,255,.7)' }}>{x.extra}</span>}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ═════════ 1b. AS VENDAS: o cliente informa, o placar mostra faturamento e retorno */}
      <Vendas k={k} d={d} de={de} ate={ate} aoMudar={() => setRecarga(x => x + 1)} />

      {/* ═════════ 2. O JOGO: nível, sequência, medalhas */}
      {jogo && (
        <div style={{ ...card, marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <Anel progresso={jogo.nivel.progresso} numero={jogo.nivel.numero} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={rotulo}>Nível {jogo.nivel.numero}</div>
              <div className="display" style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', lineHeight: 1.05, marginTop: 2 }}>{jogo.nivel.nome}</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6, lineHeight: 1.4 }}>
                <b style={{ color: 'var(--text)' }}>{int(jogo.acumulado)}</b> {jogo.acumulado === 1 ? nome.um : nome.varios} desde o início
                {jogo.nivel.ate ? <>. Faltam <b style={{ color: 'var(--accent-soft)' }}>{int(jogo.nivel.ate - jogo.acumulado)}</b> pro nível {jogo.nivel.numero + 1}.</> : '. Último nível: nada mais a destravar aqui.'}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 16 }}>
            {[
              { i: Flame, v: jogo.sequencia, l: jogo.sequencia === 1 ? 'dia seguido com resultado' : 'dias seguidos com resultado', cor: jogo.sequencia >= 3 ? '#fb923c' : 'var(--text-faint)' },
              { i: Zap, v: jogo.dias_com_resultado, l: 'dias com resultado', cor: 'var(--accent-soft)' },
              { i: TrendingUp, v: jogo.melhor_dia?.resultados ?? 0, l: jogo.melhor_dia ? `melhor dia, ${ddmm(jogo.melhor_dia.data)}` : 'melhor dia', cor: 'var(--green)' },
            ].map((x, n) => (
              <div key={n} style={{ background: 'var(--surface-2)', borderRadius: 14, padding: '12px 10px', textAlign: 'center' }}>
                <x.i size={18} style={{ color: x.cor }} />
                <div className="display" style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', lineHeight: 1, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{int(x.v)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4, lineHeight: 1.25 }}>{x.l}</div>
              </div>
            ))}
          </div>

          {/* as medalhas: as ganhas e as que estão a caminho */}
          <div style={{ ...rotulo, marginTop: 18 }}>Medalhas</div>
          <div className="rolavel-celular" style={{ display: 'flex', gap: 10, overflowX: 'auto', marginTop: 10, paddingBottom: 6, scrollbarWidth: 'none' }}>
            {medalhas.map((c: any, i: number) => { const I = iconeDe(c.chave); return (
              <div key={i} title={c.descricao || c.titulo} style={{ flex: '0 0 auto', width: 118, background: 'var(--surface-2)', borderRadius: 16, padding: '12px 10px', textAlign: 'center', border: '1px solid var(--border)' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: grad, margin: '0 auto', display: 'grid', placeItems: 'center', color: '#fff', boxShadow: '0 8px 20px rgba(124,58,237,.4)' }}><I size={24} /></div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginTop: 8, lineHeight: 1.25 }}>{c.titulo}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 3 }}>{br(c.destravada_em)}</div>
              </div>
            ) })}
            {d.proximas.map((x: any, i: number) => (
              <div key={'p' + i} title={`faltam ${int(x.falta)}`} style={{ flex: '0 0 auto', width: 118, background: 'transparent', borderRadius: 16, padding: '12px 10px', textAlign: 'center', border: '1px dashed var(--border-strong)' }}>
                <div style={{ position: 'relative', width: 52, height: 52, margin: '0 auto' }}>
                  <svg width="52" height="52" viewBox="0 0 52 52" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
                    <circle cx="26" cy="26" r="23" fill="none" stroke="var(--border)" strokeWidth="4" />
                    <circle cx="26" cy="26" r="23" fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 23}`} strokeDashoffset={`${2 * Math.PI * 23 * (1 - Math.min(100, x.progresso) / 100)}`} />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--text-faint)' }}><Medal size={22} /></div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginTop: 8, lineHeight: 1.25 }}>{x.titulo}</div>
                <div style={{ fontSize: 10.5, color: 'var(--accent-soft)', marginTop: 3, fontWeight: 700 }}>faltam {int(x.falta)}</div>
              </div>
            ))}
            {!medalhas.length && !d.proximas.length && <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>As medalhas aparecem conforme a campanha roda.</div>}
          </div>
        </div>
      )}

      {/* ═════════ 3. A LEITURA */}
      <div style={{ ...card, marginTop: 12, borderLeft: '4px solid var(--accent)' }}>
        <div style={rotulo}>A leitura</div>
        {(d.analise || []).map((frase: string, i: number) => (
          <p key={i} style={{ fontSize: i === 0 ? 17 : 14.5, fontWeight: i === 0 ? 700 : 400, color: i === 0 ? 'var(--text)' : 'var(--text-2)', lineHeight: 1.5, margin: i === 0 ? '10px 0 0' : '8px 0 0', textWrap: 'pretty' as any }}>{frase}</p>
        ))}
      </div>

      {/* ═════════ 4. OS ANÚNCIOS */}
      {!!d.anuncios.length && (
        <div style={{ marginTop: 22 }}>
          <div style={{ ...rotulo, marginBottom: 10 }}>Os anúncios</div>
          {!!puxando.length && <Grupo titulo="Puxando resultado" cor="var(--green)" lista={puxando} nome={nome} destaque />}
          {!!queimando.length && <Grupo titulo="Gastando sem trazer" cor="var(--red)" lista={queimando} nome={nome} />}
          {!!outros.length && <Grupo titulo={puxando.length || queimando.length ? 'Os demais' : 'No período'} cor="var(--text-faint)" lista={outros} nome={nome} compacto={!!(puxando.length || queimando.length)} />}
        </div>
      )}

      {/* ═════════ 5. POR DIA */}
      <div style={{ ...card, marginTop: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={rotulo}>{metrica === 'resultados' ? `${cap(nome.varios)} por dia` : 'Investido por dia'}</span>
          <div role="group" aria-label="O que o gráfico mostra" style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 999, padding: 3 }}>
            {([['resultados', 'Resultados'], ['gasto', 'Investido']] as const).map(([v, l]) => (
              <button key={v} onClick={() => { setMetrica(v); setFoco(null) }} aria-pressed={metrica === v}
                style={{ border: 'none', borderRadius: 999, padding: '6px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', font: 'inherit',
                  background: metrica === v ? 'var(--surface)' : 'transparent', color: metrica === v ? 'var(--text)' : 'var(--text-faint)', boxShadow: metrica === v ? 'var(--shadow-sm)' : 'none' }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <div style={{ position: 'relative', width: 40, height: 140, flex: 'none' }}>
            {[1, .5, 0].map(f => <span key={f} style={{ position: 'absolute', right: 0, top: `${(1 - f) * 100}%`, transform: 'translateY(-50%)', fontSize: 10.5, color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmt(topo * f)}</span>)}
          </div>
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <div style={{ position: 'relative', height: 140 }} onMouseLeave={() => setFoco(null)}>
              {[1, .5, 0].map(f => <div key={f} style={{ position: 'absolute', left: 0, right: 0, top: `${(1 - f) * 100}%`, borderTop: `1px ${f === 0 ? 'solid' : 'dashed'} var(--border)` }} />)}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: muitos ? 1 : 3 }}>
                {dias.map((x, i) => {
                  const v = x[metrica], h = (v / topo) * 100
                  return (
                    <div key={x.data} onMouseEnter={() => setFoco(i)} onClick={() => setFoco(i)}
                      style={{ flex: 1, minWidth: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', cursor: 'default', position: 'relative' }}>
                      {i === iPico && v > 0 && <span style={{ position: 'absolute', bottom: `calc(${h}% + 4px)`, fontSize: 11.5, fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap' }}>{fmt(v)}</span>}
                      <div style={{ width: '100%', maxWidth: 34, height: v > 0 ? `max(3px, ${h}%)` : 2, borderRadius: v > 0 ? '6px 6px 0 0' : 1,
                        background: v > 0 ? (i === iPico ? grad : 'var(--accent)') : 'var(--border-strong)', opacity: foco == null || foco === i ? 1 : .45, transition: 'opacity .1s' }} />
                    </div>
                  )
                })}
              </div>
              {foco != null && dias[foco] && (
                <div style={{ position: 'absolute', top: -6, left: `${((foco + .5) / dias.length) * 100}%`, transform: `translate(${foco / dias.length > .7 ? '-100%' : foco / dias.length < .3 ? '0' : '-50%'}, -100%)`,
                  background: 'var(--text)', color: 'var(--bg)', borderRadius: 10, padding: '7px 10px', fontSize: 12, lineHeight: 1.45, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 2, boxShadow: 'var(--shadow-md)' }}>
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
        {dias.length > 1 && (
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--accent-soft)', listStyle: 'none' }}>Ver dia a dia</summary>
            <div style={{ overflowX: 'auto', marginTop: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                <thead><tr>{['dia', nome.varios, 'investido', 'custo'].map((h, i) => <th key={h} style={{ textAlign: i ? 'right' : 'left', padding: '6px 8px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {[...dias].reverse().map(x => (
                    <tr key={x.data}>
                      <td style={{ padding: '7px 8px', color: 'var(--text-2)', borderBottom: '1px solid var(--border)' }}>{br(x.data)}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700, color: x.resultados ? 'var(--text)' : 'var(--text-faint)', borderBottom: '1px solid var(--border)' }}>{int(x.resultados)}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text-2)', borderBottom: '1px solid var(--border)' }}>{brl(x.gasto, 2)}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text-2)', borderBottom: '1px solid var(--border)' }}>{x.resultados ? brl(x.gasto / x.resultados, 2) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}

        {/* o funil, dentro do mesmo cartão: do anúncio até o cliente */}
        <div style={{ ...rotulo, marginTop: 20 }}>Do anúncio até o cliente</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          {[
            { i: Eye, l: 'vezes que o anúncio apareceu', v: d.funil.impressoes },
            { i: MousePointerClick, l: 'cliques', v: d.funil.cliques },
            ...(d.modelo === 'infoproduto' ? [{ i: Eye, l: 'chegaram na página', v: d.funil.visitas || 0 }, { i: ShoppingBag, l: 'abriram o checkout', v: d.funil.checkouts || 0 }] : []),
            { i: d.modelo === 'infoproduto' ? ShoppingBag : MessageCircle, l: nome.frase, v: d.funil.resultados },
            ...(d.funil.vendas != null ? [{ i: ShoppingBag, l: 'vendas informadas no mês', v: d.funil.vendas }] : []),
          ].map((x, i, arr) => {
            const larg = arr[0].v ? Math.max(4, Math.round((x.v / arr[0].v) * 100)) : 0
            const ultimo = i === arr.length - 1
            return (
              <div key={x.l} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr) auto', gap: 10, alignItems: 'center' }}>
                <x.i size={18} style={{ color: ultimo ? 'var(--green)' : 'var(--accent-soft)' }} />
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.3 }}>{x.l}</div>
                  <div style={{ height: 8, borderRadius: 5, background: 'var(--surface-2)', overflow: 'hidden', marginTop: 4 }}><div style={{ width: larg + '%', height: '100%', background: ultimo ? 'var(--green)' : grad, opacity: .55 + i * .15, borderRadius: 5 }} /></div>
                </div>
                <div className="display" style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{int(x.v)}</div>
              </div>
            )
          })}
        </div>
        {t.ctr != null && <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 12, lineHeight: 1.45 }}>De cada 100 pessoas que viram, {t.ctr.toFixed(1).replace('.', ',')} clicaram.{d.valor_cliente ? ` Um cliente novo vale ${brl(d.valor_cliente)} pra ti.` : ''}</div>}
      </div>

      {/* ═════════ 6. O QUE A GENTE FEZ */}
      {!!d.eventos.length && (
        <div style={{ ...card, marginTop: 12, padding: '16px 18px 8px' }}>
          <div style={rotulo}>O que a gente fez na campanha</div>
          <div style={{ marginTop: 6 }}>
            {d.eventos.slice(0, 8).map((e: any, i: number) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, flexShrink: 0, background: e.tipo === 'anuncio_pausado' ? 'var(--amber)' : 'var(--accent)' }} />
                <span style={{ flex: 1, fontSize: 14, color: 'var(--text)', lineHeight: 1.4 }}>{e.titulo}{e.descricao && <span style={{ color: 'var(--text-faint)' }}> · {e.descricao}</span>}</span>
                <span style={{ fontSize: 12, color: 'var(--text-faint)', whiteSpace: 'nowrap', marginTop: 2 }}>{br(e.data)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 12, lineHeight: 1.55 }}>
        As comparações são com {br(d.de_anterior)} a {br(d.ate_anterior)}.
        {t.impostoPct ? ` O investido já inclui os ${String(t.impostoPct).replace('.', ',')}% de imposto que a Meta cobra.` : ''}
        {d.sincronizado_em ? ` Números lidos da Meta em ${new Date(d.sincronizado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.` : ''}
      </div>
    </div>
  )
}

// AS VENDAS INFORMADAS: o cliente registra aqui (data, valor, quantas, o que) e o placar passa a mostrar
// faturamento e retorno sobre o investido. Apagar só o que ele mesmo registrou.
function Vendas({ k, d, de, ate, aoMudar }: { k: string; d: any; de: string; ate: string; aoMudar: () => void }) {
  const v = d.vendas || { qtd: 0, valor: 0, qtdAnt: 0, valorAnt: 0, custo_venda: null, retorno: null, lista: [] }
  const t = d.total
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const [aberto, setAberto] = useState(false)
  const [f, setF] = useState({ data: hoje, valor: '', quantidade: '1', descricao: '' })
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')

  async function salvar() {
    if (!f.valor && !f.quantidade) { setMsg('Diz quantas vendas ou o valor.'); return }
    setSalvando(true); setMsg('')
    const j = await fetch('/api/cliente', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k, acao: 'venda', ...f }) }).then(r => r.json()).catch(() => null)
    setSalvando(false)
    if (!j?.ok) { setMsg(j?.error || 'não consegui registrar'); return }
    setF({ data: hoje, valor: '', quantidade: '1', descricao: '' }); setAberto(false); setMsg('Venda registrada. O placar já considera.'); aoMudar()
  }
  async function apagar(id: string) {
    if (!confirm('Apagar essa venda do placar?')) return
    await fetch('/api/cliente', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k, acao: 'venda_apagar', id }) }).catch(() => null)
    aoMudar()
  }
  const campo: React.CSSProperties = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 12, padding: '11px 12px', fontSize: 16, color: 'var(--text)', fontFamily: 'inherit', boxSizing: 'border-box' }
  const periodoCurto = de === ate

  return (
    <div style={{ ...card, marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={rotulo}>Vendas {periodoCurto ? 'de ' + br(de) : 'no período'}</div>
        <button onClick={() => { setAberto(x => !x); setMsg('') }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: aberto ? 'var(--surface-2)' : grad, color: aberto ? 'var(--text-2)' : '#fff', borderRadius: 999, padding: '9px 16px', fontSize: 13.5, fontWeight: 800, cursor: 'pointer', font: 'inherit', boxShadow: aberto ? 'none' : '0 8px 20px rgba(124,58,237,.35)' }}>
          <ShoppingBag size={15} /> {aberto ? 'Fechar' : 'Registrar venda'}
        </button>
      </div>

      {aberto && (
        <div style={{ marginTop: 14, padding: 14, borderRadius: 16, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            <label style={{ fontSize: 12, color: 'var(--text-faint)' }}>Quando<input type="date" max={hoje} value={f.data} onChange={e => setF({ ...f, data: e.target.value })} style={{ ...campo, marginTop: 4 }} /></label>
            <label style={{ fontSize: 12, color: 'var(--text-faint)' }}>Quantas vendas<input type="number" min={1} value={f.quantidade} onChange={e => setF({ ...f, quantidade: e.target.value })} style={{ ...campo, marginTop: 4 }} /></label>
          </div>
          <label style={{ fontSize: 12, color: 'var(--text-faint)' }}>Valor total (R$)<input inputMode="decimal" placeholder="ex.: 1.200,00" value={f.valor} onChange={e => setF({ ...f, valor: e.target.value })} style={{ ...campo, marginTop: 4 }} /></label>
          <label style={{ fontSize: 12, color: 'var(--text-faint)' }}>O que foi vendido (opcional)<input placeholder="ex.: 2 kits, cliente do anúncio do vídeo" value={f.descricao} onChange={e => setF({ ...f, descricao: e.target.value })} style={{ ...campo, marginTop: 4 }} /></label>
          <button onClick={salvar} disabled={salvando} style={{ border: 'none', background: '#22C55E', color: '#06220f', borderRadius: 12, padding: '13px', fontSize: 15, fontWeight: 800, cursor: 'pointer', font: 'inherit', opacity: salvando ? .6 : 1 }}>{salvando ? 'Registrando…' : 'Salvar no placar'}</button>
        </div>
      )}
      {msg && <div style={{ fontSize: 12.5, color: msg.startsWith('Venda') ? 'var(--green)' : 'var(--amber)', marginTop: 8 }}>{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 14 }}>
        {[
          { l: v.qtd === 1 ? 'venda' : 'vendas', v: int(v.qtd), sub: v.qtdAnt ? `antes: ${int(v.qtdAnt)}` : null, cor: v.qtd ? 'var(--green)' : 'var(--text)' },
          { l: 'faturamento', v: v.valor ? brl(v.valor, 0) : '—', sub: v.valorAnt ? `antes: ${brl(v.valorAnt, 0)}` : null, cor: 'var(--text)' },
          v.retorno != null
            ? { l: 'voltou por R$ 1', v: 'R$ ' + v.retorno.toFixed(2).replace('.', ','), sub: `${brl(t.gasto, 0)} investido`, cor: v.retorno >= 1 ? 'var(--green)' : 'var(--amber)' }
            : { l: 'custo por venda', v: v.custo_venda != null ? brl(v.custo_venda, 2) : '—', sub: `${brl(t.gasto, 0)} investido`, cor: 'var(--text)' },
        ].map((x, i) => (
          <div key={i} style={{ background: 'var(--surface-2)', borderRadius: 14, padding: '12px 10px', textAlign: 'center' }}>
            <div className="display" style={{ fontSize: 'clamp(20px, 6vw, 26px)', fontWeight: 800, color: x.cor, lineHeight: 1, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{x.v}</div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 5, lineHeight: 1.25 }}>{x.l}</div>
            {x.sub && <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 2 }}>{x.sub}</div>}
          </div>
        ))}
      </div>

      {v.lista.length ? (
        <div style={{ marginTop: 12 }}>
          {v.lista.slice(0, 12).map((x: any) => (
            <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
              <span style={{ color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{br(x.data)}</span>
              <span style={{ flex: 1, minWidth: 0, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.quantidade > 1 ? `${x.quantidade} vendas` : '1 venda'}{x.descricao ? ` · ${x.descricao}` : ''}</span>
              <b style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{x.valor ? brl(x.valor, 2) : ''}</b>
              {x.origem === 'cliente' && <button onClick={() => apagar(x.id)} aria-label="Apagar" style={{ border: 'none', background: 'transparent', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>×</button>}
            </div>
          ))}
          {v.lista.length > 12 && <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 6 }}>e mais {v.lista.length - 12} no período</div>}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 12, lineHeight: 1.5 }}>Nenhuma venda registrada {periodoCurto ? 'neste dia' : 'neste período'}. Cada venda que vier do anúncio, registra aqui: é o que mostra o retorno do investimento.</div>
      )}
    </div>
  )
}

// o anel do nível: progresso até o próximo degrau, com o número do nível no meio
function Anel({ progresso, numero }: { progresso: number; numero: number }) {
  const r = 34, c = 2 * Math.PI * r
  return (
    <div style={{ position: 'relative', width: 84, height: 84, flexShrink: 0 }}>
      <svg width="84" height="84" viewBox="0 0 84 84" style={{ transform: 'rotate(-90deg)' }}>
        <defs><linearGradient id="anel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7c3aed" /><stop offset="1" stopColor="#c026d3" /></linearGradient></defs>
        <circle cx="42" cy="42" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="8" />
        <circle cx="42" cy="42" r={r} fill="none" stroke="url(#anel)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${c}`} strokeDashoffset={`${c * (1 - Math.min(100, Math.max(0, progresso)) / 100)}`} style={{ transition: 'stroke-dashoffset .6s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <Crown size={14} style={{ color: 'var(--accent-soft)' }} />
        <div className="display" style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{numero}</div>
      </div>
    </div>
  )
}

// um grupo de anúncios: no celular a foto ocupa a largura, os números vêm grandes embaixo
function Grupo({ titulo, cor, lista, nome, destaque, compacto }: { titulo: string; cor: string; lista: any[]; nome: any; destaque?: boolean; compacto?: boolean }) {
  if (compacto) return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: cor }} />
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: cor }}>{titulo}</span>
      </div>
      <div style={{ ...card, padding: '4px 14px' }}>
        {lista.map((x: any, i: number) => (
          <div key={x.ad_id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderTop: i ? '1px solid var(--border)' : 'none', opacity: x.situacao === 'parado' ? .65 : 1 }}>
            <div style={{ width: 56, height: 56, borderRadius: 10, background: 'var(--surface-2)', flex: 'none', overflow: 'hidden' }}>{x.imagem_url && <img src={x.imagem_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={x.nome}>{x.nome}{/PAUSED|ARCHIVED/i.test(x.status) && <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-faint)', marginLeft: 6, letterSpacing: '.06em' }}>PAUSADO</span>}</div>
              <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 3 }}>{x.custo != null ? `${brl(x.custo, 2)} cada · ` : ''}{brl(x.gasto, 2)} investidos</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div className="display" style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{int(x.resultados)}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>{x.resultados === 1 ? nome.um.split(' ')[0] : nome.varios.split(' ')[0]}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: cor }} />
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: cor }}>{titulo}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 10 }}>
        {lista.map((x: any) => {
          const pausado = /PAUSED|ARCHIVED/i.test(x.status)
          return (
            <div key={x.ad_id} style={{ ...card, padding: 0, overflow: 'hidden', opacity: x.situacao === 'parado' ? .65 : 1, border: destaque ? '1px solid rgba(34,197,94,.45)' : card.border, boxShadow: destaque ? '0 12px 30px rgba(34,197,94,.12)' : 'none' }}>
              <div style={{ position: 'relative', aspectRatio: '16 / 9', background: 'var(--surface-2)' }}>
                {x.imagem_url && <img src={x.imagem_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                <div style={{ position: 'absolute', left: 10, top: 10, display: 'flex', gap: 6 }}>
                  {x.situacao === 'puxando' && <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: '#06220f', background: '#22C55E', borderRadius: 999, padding: '3px 8px' }}>puxando</span>}
                  {x.situacao === 'queimando' && <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: '#fff', background: '#F0475F', borderRadius: 999, padding: '3px 8px' }}>queimando</span>}
                  {pausado && <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: '#fff', background: 'rgba(0,0,0,.55)', borderRadius: 999, padding: '3px 8px', backdropFilter: 'blur(6px)' }}>pausado</span>}
                </div>
              </div>
              <div style={{ padding: '12px 14px 14px' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={x.nome}>{x.nome}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
                  <span className="display" style={{ fontSize: 30, fontWeight: 800, color: 'var(--text)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{int(x.resultados)}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{x.resultados === 1 ? nome.um : nome.varios}</span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 4 }}>
                  {x.custo != null ? <><b style={{ color: 'var(--text-2)' }}>{brl(x.custo, 2)}</b> cada · </> : ''}{brl(x.gasto, 2)} investidos
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
