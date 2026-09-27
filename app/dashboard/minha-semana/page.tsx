'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchAuth } from '@/lib/api'

// MINHA SEMANA — o que a pessoa tem pra entregar: o marketing da semana, os clientes do Deu Venda,
// as aulas e o que pediram pra ela. Aberta a todos (qualquer um vê a semana de qualquer um).

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }
const rot: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-faint)' }
const btn: React.CSSProperties = { border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text-2)', borderRadius: 8, padding: '6px 11px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }
const ENCONTRO = '#f97316', ENTREGA = '#db2777'
// o que é novo pra mim: as mesmas chaves do balão da agenda (lib/agenda-balao.ts)
const Novo = () => <span title="novo pra ti" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--red)', display: 'inline-block', flexShrink: 0, marginRight: 6, verticalAlign: 'middle' }} />

const TZ = 'America/Sao_Paulo'
const dia = (s: string) => {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T12:00:00') : new Date(s)
  return d.toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '')
}
const hora = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) ? '' : new Date(s).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })

export default function MinhaSemana() {
  const [d, setD] = useState<any>(null)
  const [pessoa, setPessoa] = useState('')
  const [aviso, setAviso] = useState('')
  // o que acendeu no balão quando a tela abriu — fica marcado nesta visita, e o menu apaga
  const [novos, setNovos] = useState<Set<string>>(new Set())

  async function carregar(p = pessoa) {
    const j = await fetchAuth(`/api/minha-semana${p ? `?pessoa=${p}` : ''}`).then(r => r.json()).catch(() => null)
    if (j?.ok) { setD(j); if (!p) setPessoa(j.pessoa) }
  }
  useEffect(() => { carregar('') }, [])

  // ABRIR A TELA É VER O QUE ESTÁ NELA. Guarda o que estava aceso (pra marcar aqui) e, se é a
  // minha semana, avisa o balão que eu vi — o número do menu apaga.
  useEffect(() => {
    if (!d || d.pessoa !== d.eu) return
    ;(async () => {
      const b = await fetchAuth('/api/agenda/balao').then(r => r.json()).catch(() => null)
      if (!b?.ok || !b.pronto) return
      const acesas = new Set<string>(b.chaves || [])
      const naTela = [
        ...d.marketing.map((t: any) => `turma:${t.id}`),
        ...d.deuVenda.map((m: any) => `entrega:${m.id}`),
        ...d.pedidos.map((p: any) => `${p.fonte === 'tarefa' ? 'turma' : 'agenda'}:${p.id}`),
        ...d.aulas.map((a: any) => `agenda:${a.id}`),
      ].filter(k => acesas.has(k))
      setNovos(new Set(naTela))
      if (!naTela.length) return
      const j = await fetchAuth('/api/agenda/leituras', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chaves: naTela, como: 'lido' }) }).then(r => r.json()).catch(() => null)
      if (j?.ok) window.dispatchEvent(new CustomEvent('agenda:balao', { detail: { total: j.total } }))
    })()
  }, [d?.pessoa, d?.eu])

  async function agir(corpo: any, msg?: string) {
    const j = await fetchAuth('/api/minha-semana', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }).then(r => r.json()).catch(() => null)
    if (j?.ok) { if (msg) { setAviso(msg); setTimeout(() => setAviso(''), 3500) } carregar() } else setAviso(j?.error || 'não deu')
  }

  if (!d) return <div style={{ padding: 32, color: 'var(--text-faint)' }}>Carregando…</div>
  const minha = d.pessoa === d.eu
  const primeiro = (d.nome || '').split(' ')[0]

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 48px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>{minha ? 'Minha semana' : `A semana do ${primeiro}`}</h1>
          <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: '4px 0 0' }}>Tudo que {minha ? 'tu tem' : 'ele tem'} pra entregar nos próximos 14 dias.</p>
        </div>
        <label style={{ fontSize: 12.5, color: 'var(--text-faint)', display: 'flex', alignItems: 'center', gap: 8 }}>
          ver a semana de
          <select id="pessoa" value={pessoa} onChange={e => { setPessoa(e.target.value); carregar(e.target.value) }}
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '6px 9px', color: 'var(--text)', fontSize: 13 }}>
            {d.pessoas.map((p: any) => <option key={p.id} value={p.id}>{p.nome}{p.id === d.eu ? ' (eu)' : ''}</option>)}
          </select>
        </label>
      </div>
      {aviso && <div style={{ ...card, marginTop: 12, padding: '9px 12px', fontSize: 13 }}>{aviso}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, marginTop: 18 }}>

        {/* MARKETING */}
        <section style={{ ...card, gridColumn: '1 / -1' }}>
          <div style={rot}>Marketing da semana</div>
          {!d.marketing.length ? <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '10px 0 0' }}>Nada de marketing pra estas duas semanas.</p> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginTop: 12 }}>
              {d.marketing.map((t: any) => {
                const feitos = t.passos.filter((p: any) => p.feito).length
                return (
                  <div key={t.id} style={{ border: `1px solid ${t.atrasada ? 'var(--red)' : 'var(--border)'}`, background: t.atrasada ? 'var(--red-bg)' : 'var(--surface-2)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <b style={{ fontSize: 15 }}>{novos.has(`turma:${t.id}`) && <Novo />}{t.titulo.replace(/\s*\(até [^)]+\)$/, '')}</b>
                      <span style={{ fontSize: 12, fontWeight: 700, color: t.atrasada ? 'var(--red)' : 'var(--text-faint)', whiteSpace: 'nowrap' }}>{t.atrasada ? 'atrasada · ' : 'até '}{dia(t.prazo)}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{t.resumo}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {t.passos.map((p: any, i: number) => (
                        <label key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, cursor: 'pointer', color: p.feito ? 'var(--text-faint)' : 'var(--text)', textDecoration: p.feito ? 'line-through' : 'none' }}>
                          <input id={`passo-${t.id}-${i}`} type="checkbox" checked={p.feito} onChange={e => agir({ acao: 'passo', id: t.id, indice: i, feito: e.target.checked })} style={{ marginTop: 3 }} />
                          {p.texto}
                        </label>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 2 }}>
                      <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{feitos}/{t.passos.length}</span>
                      <button onClick={() => agir({ acao: 'gravar', id: t.id }, 'Pedido de gravação na agenda do Nando ✓')} style={btn}>🎬 Chamar o Nando pra gravar</button>
                      <Link href="/dashboard/maquina" style={{ ...btn, textDecoration: 'none' }}>Abrir a Máquina</Link>
                      <button onClick={() => agir({ acao: 'concluir', id: t.id }, 'Concluída ✓')} style={{ ...btn, marginLeft: 'auto', background: 'var(--green)', color: '#fff', border: 'none' }}>Publicado</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* DEU VENDA */}
        <section style={card}>
          <div style={rot}>Deu Venda · clientes</div>
          {!d.deuVenda.length ? <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '10px 0 0' }}>Nenhum encontro ou entrega nos próximos 14 dias.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
              {d.deuVenda.map((m: any) => {
                const cor = m.natureza === 'encontro' ? ENCONTRO : ENTREGA
                return (
                  <Link key={m.id} href={`/dashboard/entregas/${m.projetoId}`} style={{ display: 'grid', gridTemplateColumns: '78px 1fr', gap: 10, alignItems: 'baseline', padding: '8px 10px', borderRadius: 10, textDecoration: 'none', color: 'var(--text)', background: cor + (m.combinado ? '1f' : '0d'), border: `1px ${m.combinado ? 'solid' : 'dashed'} ${cor}55` }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: m.atrasado ? 'var(--red)' : cor }}>{dia(m.quando)}<br /><span style={{ fontWeight: 500 }}>{m.combinado ? hora(m.quando) : 'sem hora'}</span></span>
                    <span style={{ fontSize: 13.5, minWidth: 0 }}>{novos.has(`entrega:${m.id}`) && <Novo />}<b>{m.cliente}</b><br /><span style={{ color: 'var(--text-2)' }}>{m.natureza === 'encontro' ? '● ' : '◆ '}{m.titulo}</span></span>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        {/* AULAS */}
        <section style={card}>
          <div style={rot}>Aulas</div>
          {!d.aulas.length ? <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '10px 0 0' }}>Nenhuma aula nos próximos 14 dias.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
              {d.aulas.map((a: any) => (
                <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '78px 1fr', gap: 10, alignItems: 'baseline', padding: '8px 10px', borderRadius: 10, background: 'var(--surface-2)' }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{dia(a.inicio)}<br /><span style={{ fontWeight: 500, color: 'var(--text-2)' }}>{hora(a.inicio)}{a.fim ? '–' + hora(a.fim) : ''}</span></span>
                  <span style={{ fontSize: 13.5 }}>{novos.has(`agenda:${a.id}`) && <Novo />}{a.titulo}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* PEDIDOS */}
        <section style={card}>
          <div style={rot}>Pediram pra {minha ? 'ti' : 'ele'}{d.pedidos.some((p: any) => novos.has(`${p.fonte === 'tarefa' ? 'turma' : 'agenda'}:${p.id}`)) && <span style={{ color: 'var(--red)', marginLeft: 8 }}>· novo</span>}</div>
          {!d.pedidos.length ? <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '10px 0 0' }}>Ninguém pediu nada. Quando o Rick (ou outro) passar algo pela agenda, aparece aqui.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
              {d.pedidos.map((p: any) => (
                <Link key={p.fonte + p.id} href="/dashboard/agenda" style={{ display: 'grid', gridTemplateColumns: '78px 1fr', gap: 10, alignItems: 'baseline', padding: '8px 10px', borderRadius: 10, background: 'var(--surface-2)', textDecoration: 'none', color: 'var(--text)' }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{dia(p.quando)}</span>
                  <span style={{ fontSize: 13.5 }}>{novos.has(`${p.fonte === 'tarefa' ? 'turma' : 'agenda'}:${p.id}`) && <Novo />}{p.titulo}{p.de ? <span style={{ color: 'var(--text-faint)' }}> · de {p.de}</span> : null}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
