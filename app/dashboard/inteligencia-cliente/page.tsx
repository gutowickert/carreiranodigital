'use client'

import { useEffect, useState } from 'react'

const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' } as React.CSSProperties

type Seg = { produto: string; cidade: string; ganho: number; perda: number; cache: { gerado_em: string; n_ganhos: number; n_perdas: number } | null }

export default function InteligenciaCliente() {
  const [segs, setSegs] = useState<Seg[]>([])
  const [sel, setSel] = useState<Seg | null>(null)
  const [dossie, setDossie] = useState<any>(null)
  const [geradoEm, setGeradoEm] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState('')
  const [copiado, setCopiado] = useState(false)

  useEffect(() => { fetch('/api/inteligencia-cliente').then(r => r.json()).then(j => { if (j.ok) setSegs(j.segmentos || []) }).finally(() => setCarregando(false)) }, [])

  async function abrir(s: Seg) {
    setSel(s); setDossie(null); setErro(''); setGeradoEm(null)
    const j = await fetch(`/api/inteligencia-cliente?produto=${encodeURIComponent(s.produto)}&cidade=${encodeURIComponent(s.cidade)}`).then(r => r.json())
    if (j.ok) { setDossie(j.dossie); setGeradoEm(j.gerado_em || null) }
  }
  async function gerar(s: Seg) {
    setGerando(true); setErro('')
    try {
      const j = await fetch('/api/inteligencia-cliente', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ produto: s.produto, cidade: s.cidade }) }).then(r => r.json())
      if (j.ok) { setDossie(j.dossie); setGeradoEm(j.gerado_em || null); fetch('/api/inteligencia-cliente').then(r => r.json()).then(x => { if (x.ok) setSegs(x.segmentos || []) }) }
      else setErro(j.error || 'falha ao gerar')
    } catch { setErro('falha ao gerar') } finally { setGerando(false) }
  }
  function copiar() {
    navigator.clipboard.writeText(JSON.stringify(dossie, null, 2)); setCopiado(true); setTimeout(() => setCopiado(false), 1500)
  }
  const emFmt = (s: string | null) => s ? new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''

  return (
    <div style={{ padding: '32px 40px', display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: 20, alignItems: 'start' }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>Inteligência de Cliente</h1>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '0 0 16px' }}>Voz do cliente por produto/cidade, das conversas reais (ganho/perda). Alimenta o sistema de conteúdo via <code>/api/inteligencia-cliente</code>.</p>
        {carregando ? <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>Carregando...</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {segs.map((s, i) => {
              const ativo = sel && sel.produto === s.produto && sel.cidade === s.cidade
              return (
                <button key={i} onClick={() => abrir(s)} style={{ ...card, textAlign: 'left', padding: '10px 12px', cursor: 'pointer', borderColor: ativo ? 'var(--accent)' : 'var(--border)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{s.produto}{s.cidade && <span style={{ color: 'var(--accent-soft)' }}> · {s.cidade}</span>}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
                    <span style={{ color: 'var(--green)' }}>{s.ganho} ganhos</span> · <span style={{ color: 'var(--red)' }}>{s.perda} perdas</span>
                    {s.cache ? <span style={{ color: 'var(--text-muted)' }}> · dossiê {emFmt(s.cache.gerado_em)}</span> : <span style={{ color: 'var(--amber)' }}> · sem dossiê</span>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div>
        {!sel ? <div style={{ ...card, padding: 24, color: 'var(--text-faint)', fontSize: 13 }}>Escolhe um segmento à esquerda pra ver o dossiê.</div> : (
          <div style={{ ...card, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{sel.produto}{sel.cidade && ` · ${sel.cidade}`}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{sel.ganho} ganhos · {sel.perda} perdas{geradoEm ? ` · gerado ${emFmt(geradoEm)}` : ''}</div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                {dossie && <button onClick={copiar} style={btn}>{copiado ? '✓ copiado' : 'copiar JSON'}</button>}
                <button onClick={() => gerar(sel)} disabled={gerando} style={{ ...btn, background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--on-accent)' }}>{gerando ? 'destilando...' : dossie ? '🔄 Regenerar' : '✨ Gerar dossiê'}</button>
              </div>
            </div>
            {erro && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>{erro}</div>}
            {gerando && <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>Lendo as conversas reais e destilando a voz do cliente... (pode levar até 1 min)</div>}
            {!gerando && !dossie && <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>Sem dossiê ainda. Clica em “Gerar dossiê”.</div>}
            {!gerando && dossie && <Dossie d={dossie} />}
          </div>
        )}
      </div>
    </div>
  )
}

const btn = { background: 'none', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-2)', fontSize: 12, padding: '6px 12px', cursor: 'pointer' } as React.CSSProperties

function Sec({ titulo, cor, children }: any) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: cor || 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>{titulo}</div>
      {children}
    </div>
  )
}
const Fala = ({ txt }: { txt?: string }) => txt ? <div style={{ fontSize: 11, color: 'var(--text-faint)', fontStyle: 'italic', marginTop: 2 }}>“{txt}”</div> : null

function Dossie({ d }: { d: any }) {
  const li = { fontSize: 13, color: 'var(--text)', marginBottom: 6 } as React.CSSProperties
  return (
    <div>
      {d.perfil && <Sec titulo="Perfil do cliente"><div style={{ fontSize: 13, color: 'var(--text)' }}>{d.perfil}</div></Sec>}
      {arr(d.dores).length > 0 && <Sec titulo="Dores" cor="var(--red)">{arr(d.dores).map((x: any, i: number) => <div key={i} style={li}>• <b>{x.dor}</b> <span style={{ color: 'var(--text-faint)' }}>{x.lead ? `(${x.lead})` : ''}</span><Fala txt={x.fala} /></div>)}</Sec>}
      {arr(d.desejos).length > 0 && <Sec titulo="Desejos" cor="#a78bfa">{arr(d.desejos).map((x: any, i: number) => <div key={i} style={li}>• <b>{x.desejo}</b><Fala txt={x.fala} /></div>)}</Sec>}
      {arr(d.gatilhos_compra).length > 0 && <Sec titulo="Gatilhos de compra" cor="var(--green)">{arr(d.gatilhos_compra).map((x: any, i: number) => <div key={i} style={li}>• <b>{x.gatilho}</b><Fala txt={x.evidencia} /></div>)}</Sec>}
      {arr(d.objecoes).length > 0 && <Sec titulo="Objeções → como preemptar" cor="var(--amber)">{arr(d.objecoes).map((x: any, i: number) => <div key={i} style={li}>• <b>{x.objecao}</b> <span style={{ fontSize: 10, color: x.mata_venda ? 'var(--red)' : 'var(--text-faint)' }}>[{x.frequencia}{x.mata_venda ? ' · mata venda' : ''}]</span><div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>↳ {x.contorno}</div></div>)}</Sec>}
      {arr(d.motivos_perda).length > 0 && <Sec titulo="Motivos de perda" cor="var(--red)">{arr(d.motivos_perda).map((x: any, i: number) => <div key={i} style={li}>• <b>{x.motivo}</b><Fala txt={x.fala} /></div>)}</Sec>}
      {d.angulos_conteudo && (
        <Sec titulo="Ângulos de conteúdo" cor="var(--accent-soft)">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><div style={{ fontSize: 11, fontWeight: 600, color: 'var(--green)', marginBottom: 4 }}>Orgânico</div>{arr(d.angulos_conteudo.organico).map((x: string, i: number) => <div key={i} style={{ ...li, fontSize: 12 }}>• {x}</div>)}</div>
            <div><div style={{ fontSize: 11, fontWeight: 600, color: '#f59e0b', marginBottom: 4 }}>Anúncio</div>{arr(d.angulos_conteudo.anuncio).map((x: string, i: number) => <div key={i} style={{ ...li, fontSize: 12 }}>• {x}</div>)}</div>
          </div>
        </Sec>
      )}
      {arr(d.frases_reais).length > 0 && <Sec titulo="Banco de frases reais">{arr(d.frases_reais).map((x: any, i: number) => <div key={i} style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 5 }}><span style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase' }}>{x.categoria}</span> “{x.texto}” <span style={{ color: 'var(--text-faint)' }}>{x.lead ? `— ${x.lead}` : ''}</span></div>)}</Sec>}
      {arr(d.provas_sociais).length > 0 && <Sec titulo="Provas sociais" cor="var(--green)">{arr(d.provas_sociais).map((x: any, i: number) => <div key={i} style={{ fontSize: 12, color: 'var(--text)', marginBottom: 5 }}>“{x.texto}” <span style={{ color: 'var(--text-faint)' }}>{x.lead ? `— ${x.lead}` : ''}</span></div>)}</Sec>}
      {d.particularidades_cidade && <Sec titulo="Particularidades da cidade"><div style={{ fontSize: 13, color: 'var(--text-2)' }}>{d.particularidades_cidade}</div></Sec>}
    </div>
  )
}
const arr = (x: any) => Array.isArray(x) ? x : []
