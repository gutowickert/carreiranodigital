'use client'

import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'

const SQL = `create table if not exists analise_conversao (
  id uuid primary key default gen_random_uuid(),
  gerado_em timestamptz not null default now(),
  dados jsonb not null
);`

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }
const btn: React.CSSProperties = { background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }

function Exemplo({ lead, trecho }: { lead?: string; trecho?: string }) {
  if (!lead && !trecho) return null
  return (
    <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 8, borderLeft: '3px solid #a78bfa' }}>
      {lead && <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700 }}>{lead}</div>}
      {trecho && <div style={{ fontSize: 12, color: 'var(--text-2)', fontStyle: 'italic', marginTop: 2 }}>“{trecho}”</div>}
    </div>
  )
}

const pct = (n: number, tot: number) => tot ? Math.round((n / tot) * 100) : 0

function Barra({ label, g, p, gtot, ptot }: { label: string; g: number; p: number; gtot: number; ptot: number }) {
  const gp = pct(g, gtot), pp = pct(p, ptot)
  const linha = (nome: string, perc: number, n: number, cor: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <span style={{ width: 56, fontSize: 11, color: cor, fontWeight: 700 }}>{nome}</span>
      <div style={{ flex: 1, height: 20, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${perc}%`, height: '100%', background: cor, transition: 'width .4s' }} />
      </div>
      <span style={{ width: 70, fontSize: 12, fontWeight: 700, color: 'var(--text)', textAlign: 'right' }}>{perc}% <span style={{ color: '#6b7280', fontWeight: 400 }}>({n})</span></span>
    </div>
  )
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{label}</div>
      {linha('Vendas', gp, g, '#4ade80')}
      {linha('Perdas', pp, p, '#f87171')}
    </div>
  )
}

function Placar({ p }: { p: any }) {
  if (!p || !p.ganho) return null
  const g = p.ganho, pe = p.perda
  const mini = (titulo: string, valor: number, cor: string) => (
    <div style={{ flex: 1, background: 'var(--surface-2)', border: `1px solid ${cor}`, borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 11, color: '#6b7280' }}>{titulo}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: cor }}>{valor}</div>
    </div>
  )
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
      <h2 style={{ fontSize: 18, color: 'var(--text)', margin: '0 0 2px' }}>📊 Placar — o que as vendas têm que as perdas não têm</h2>
      <p style={{ fontSize: 12, color: '#6b7280', marginTop: 0, marginBottom: 14 }}>{g.total} vendas × {pe.total} perdas</p>
      <Barra label="📞 Tiveram ligação" g={g.comLigacao} p={pe.comLigacao} gtot={g.total} ptot={pe.total} />
      <Barra label="🎤 Tiveram áudio" g={g.comAudio} p={pe.comAudio} gtot={g.total} ptot={pe.total} />
      <Barra label="💬 Só texto (sem ligação nem áudio)" g={g.soTexto} p={pe.soTexto} gtot={g.total} ptot={pe.total} />
      <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
        {mini('Média de mensagens por VENDA', g.mediaMsgs, '#4ade80')}
        {mini('Média de mensagens por PERDA', pe.mediaMsgs, '#f87171')}
      </div>
    </div>
  )
}

export default function AnaliseConversao() {
  const [analise, setAnalise] = useState<any>(null)
  const [geradoEm, setGeradoEm] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [semTabela, setSemTabela] = useState(false)
  const [erro, setErro] = useState('')

  async function carregar() {
    setCarregando(true)
    try {
      const j = await (await fetch('/api/analise-conversao')).json()
      if (j.semTabela) setSemTabela(true)
      else if (j.ok && j.analise) { setAnalise(j.analise.dados); setGeradoEm(j.analise.gerado_em) }
    } catch { setErro('Falha ao carregar.') }
    setCarregando(false)
  }
  useEffect(() => { carregar() }, [])

  async function atualizar() {
    setAtualizando(true); setErro('')
    try {
      const j = await (await fetch('/api/analise-conversao', { method: 'POST' })).json()
      if (j.semTabela) { setSemTabela(true); return }
      if (!j.ok) { setErro(j.error || 'Não consegui atualizar.'); return }
      setAnalise(j.analise.dados); setGeradoEm(j.analise.gerado_em); setSemTabela(false)
    } catch { setErro('Falha ao atualizar (a análise pode levar até 1 min).') }
    finally { setAtualizando(false) }
  }

  const d = analise
  return (
    <Layout>
      <div style={{ padding: '32px 40px', maxWidth: 1000 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Análise de Conversão</h1>
          <button onClick={atualizar} disabled={atualizando} style={{ ...btn, opacity: atualizando ? 0.6 : 1 }}>
            {atualizando ? 'Analisando… (até 1 min)' : '↻ Atualizar análise'}
          </button>
        </div>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 0 }}>
          O que funciona e o que não funciona nas conversas reais (WhatsApp + áudios + ligações), com exemplos.
          {geradoEm && <span> · Atualizado em {new Date(geradoEm).toLocaleString('pt-BR')}</span>}
          {d?._meta && <span> · {d._meta.ganho} vendas × {d._meta.perda} perdas</span>}
        </p>

        {erro && <div style={{ ...card, borderColor: '#f87171', color: '#f87171', marginBottom: 16 }}>{erro}</div>}

        {semTabela && (
          <div style={{ ...card, marginBottom: 16 }}>
            <p style={{ fontSize: 14, color: 'var(--text)', marginTop: 0 }}>⚙️ Falta criar a tabela. Rode este SQL no Supabase (SQL Editor) uma vez:</p>
            <pre style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 8, fontSize: 12, color: 'var(--text-2)', overflow: 'auto' }}>{SQL}</pre>
            <p style={{ fontSize: 12, color: '#6b7280' }}>Depois clique em “Atualizar análise”.</p>
          </div>
        )}

        {carregando ? <p style={{ color: '#6b7280' }}>Carregando…</p> : !d && !semTabela ? (
          <div style={{ ...card, textAlign: 'center' }}>
            <p style={{ color: 'var(--text-2)' }}>Nenhuma análise ainda. Clique em <b>Atualizar análise</b> pra gerar a primeira (lê as conversas reais).</p>
          </div>
        ) : d ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {d._placar && <Placar p={d._placar} />}
            {d.resumo && <div style={{ ...card, background: 'var(--surface-2)' }}><div style={{ fontSize: 15, color: 'var(--text)', lineHeight: 1.5 }}>{d.resumo}</div></div>}

            <div>
              <h2 style={{ fontSize: 18, color: '#4ade80', margin: '0 0 10px' }}>✅ O que funciona</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(d.o_que_funciona || []).map((x: any, i: number) => (
                  <div key={i} style={card}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{x.titulo}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>{x.descricao}</div>
                    <Exemplo lead={x.exemplo_lead} trecho={x.exemplo_trecho} />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 style={{ fontSize: 18, color: '#f87171', margin: '0 0 10px' }}>🚩 O que não funciona (perdas)</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(d.o_que_nao_funciona || []).map((x: any, i: number) => (
                  <div key={i} style={card}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{x.titulo}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>{x.descricao}</div>
                    <Exemplo lead={x.exemplo_lead} trecho={x.exemplo_trecho} />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 style={{ fontSize: 18, color: '#60a5fa', margin: '0 0 10px' }}>🎯 Melhor fluxo de conversão</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(d.melhor_fluxo || []).map((p: any, i: number) => (
                  <div key={i} style={{ ...card, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 26, height: 26, borderRadius: '50%', background: '#7c3aed', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>{i + 1}</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{p.passo}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>{p.descricao}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {(d.frases || []).length > 0 && (
              <div>
                <h2 style={{ fontSize: 18, color: '#fbbf24', margin: '0 0 10px' }}>💬 Frases que fecham</h2>
                <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(d.frases || []).map((f: string, i: number) => (
                    <div key={i} style={{ fontSize: 13, color: 'var(--text-2)', paddingLeft: 12, borderLeft: '2px solid #fbbf24' }}>“{f}”</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </Layout>
  )
}
