'use client'

import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import { fetchAuth } from '@/lib/api'
import GravarEncontro from '@/components/GravarEncontro'

// GRAVAÇÕES E COMPROMISSOS (29/10/2026). A chave liga/desliga, o "aplicar sozinho", a lista do que NÓS
// prometemos (compromissos) e cada gravação com o que a IA entendeu e o que ela fez no sistema.
// O botão "Gravar" aparece também na ficha da entrega, no detalhe da agenda e na turma.

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }
const btn: React.CSSProperties = { background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '7px 12px', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }
const STATUS: Record<string, { txt: string; cor: string }> = {
  gravando: { txt: 'gravando (ou ficou aberta)', cor: 'var(--red)' }, processando: { txt: 'a IA está ouvindo…', cor: 'var(--amber)' },
  pronta: { txt: 'pronta pra revisar', cor: 'var(--blue)' }, aplicada: { txt: 'aplicada', cor: 'var(--green)' }, erro: { txt: 'erro', cor: 'var(--red)' },
}
const CTX: Record<string, string> = { encontro: 'Encontro', agenda: 'Agenda', turma: 'Aula', livre: 'Solta' }
const br = (d?: string | null) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '')
const quando = (d: string) => new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function Gravacoes() {
  const [d, setD] = useState<any>(null)
  const [aberta, setAberta] = useState<string | null>(null)
  const [det, setDet] = useState<any>(null)
  const [tituloLivre, setTituloLivre] = useState('')
  const [copiado, setCopiado] = useState('')

  async function carregar() { const j = await fetchAuth('/api/gravacoes').then(r => r.json()).catch(() => null); if (j?.ok) setD(j) }
  useEffect(() => {
    carregar()
    const g = new URLSearchParams(window.location.search).get('g'); if (g) abrir(g)
    const t = setInterval(carregar, 15000); return () => clearInterval(t)
  }, [])
  async function abrir(id: string) {
    if (aberta === id) { setAberta(null); return }
    setAberta(id); setDet(null)
    const j = await fetchAuth(`/api/gravacoes?id=${id}`).then(r => r.json()).catch(() => null)
    if (j?.ok) setDet(j)
  }
  async function detalheDe(id: string) { const j = await fetchAuth(`/api/gravacoes?id=${id}`).then(r => r.json()).catch(() => null); if (j?.ok) setDet(j) }
  async function post(corpo: any) {
    const j = await fetchAuth('/api/gravacoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }).then(r => r.json()).catch(() => null)
    await carregar(); return j
  }
  const nome = (id?: string | null) => { const p = (d?.pessoas || []).find((x: any) => x.id === id); return p ? (p.apelido || p.nome) : '—' }
  function copiar(t: string, k: string) { navigator.clipboard?.writeText(t).then(() => { setCopiado(k); setTimeout(() => setCopiado(''), 1500) }).catch(() => {}) }

  const cfg = d?.config
  const meus = (d?.compromissos || []).filter((c: any) => c.responsavel_id === d?.eu)
  const outros = (d?.compromissos || []).filter((c: any) => c.responsavel_id !== d?.eu)
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

  return (
    <Layout>
      <div style={{ padding: '28px 32px', maxWidth: 980, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Gravações e compromissos</h1>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13.5, maxWidth: 620 }}>Grava o encontro, a aula ou a reunião e a IA preenche o sistema: o que foi feito, o próximo encontro, o que nós prometemos e o que o cliente ficou de fazer.</p>
          </div>
          {cfg && (
            <div style={{ ...card, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 260 }}>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 13, fontWeight: 700 }}>
                Gravação {cfg.ligado ? 'ligada' : 'desligada'}
                <button onClick={() => post({ acao: 'config', ligado: !cfg.ligado })} style={{ ...btn, background: cfg.ligado ? 'var(--green-bg)' : 'var(--surface-2)', color: cfg.ligado ? 'var(--green)' : 'var(--text-faint)' }}>{cfg.ligado ? 'Desligar' : 'Ligar'}</button>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 12.5, color: 'var(--text-2)' }}>
                IA aplica sozinha
                <input type="checkbox" checked={cfg.aplicar_sozinho} onChange={e => post({ acao: 'config', aplicar_sozinho: e.target.checked })} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 12.5, color: 'var(--text-2)' }}>
                Apagar o áudio depois de
                <select value={cfg.apagar_audio_dias} onChange={e => post({ acao: 'config', apagar_audio_dias: Number(e.target.value) })} style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border-strong)', borderRadius: 6, padding: '3px 6px' }}>
                  {[7, 30, 60, 90, 180].map(n => <option key={n} value={n}>{n} dias</option>)}
                </select>
              </label>
            </div>
          )}
        </div>

        {cfg?.ligado && (
          <div style={{ ...card, padding: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ fontSize: 14 }}>Gravar agora</b>
            <input value={tituloLivre} onChange={e => setTituloLivre(e.target.value)} placeholder="Sobre o quê? (opcional: reunião, ideia, recado pra mim...)" style={{ flex: '1 1 260px', background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: 'var(--text)' }} />
            <GravarEncontro contextoTipo="livre" titulo={tituloLivre} onPronto={carregar} />
          </div>
        )}

        <div style={{ ...card, padding: 16 }}>
          <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>O que nós prometemos <span style={{ color: 'var(--text-faint)', fontWeight: 600 }}>· {(d?.compromissos || []).length} em aberto</span></h2>
          {[['Meus', meus], ['Do time', outros]].map(([rot, lista]: any) => lista.length > 0 && (
            <div key={rot} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-faint)', margin: '6px 0' }}>{rot}</div>
              {lista.map((c: any) => (
                <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                  <input type="checkbox" onChange={() => post({ acao: 'compromisso', id: c.id, status: 'feito' })} style={{ marginTop: 3 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5 }}>{c.descricao} {c.pessoal && <span style={{ fontSize: 11, color: 'var(--blue)' }}>· pessoal</span>}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                      {c.prazo ? <span style={{ color: c.prazo < hoje ? 'var(--red)' : c.prazo === hoje ? 'var(--amber)' : 'var(--text-faint)' }}>até {br(c.prazo)}</span> : 'sem prazo'}
                      {rot === 'Do time' && ` · ${nome(c.responsavel_id)}`}{c.trecho && ` · "${c.trecho}"`}
                    </div>
                  </div>
                  <button onClick={() => post({ acao: 'compromisso', id: c.id, status: 'cancelado' })} style={{ ...btn, padding: '3px 8px', fontSize: 11.5 }}>não vale</button>
                </div>
              ))}
            </div>
          ))}
          {!(d?.compromissos || []).length && <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: 0 }}>Nada em aberto. Os compromissos aparecem aqui sozinhos depois de cada gravação.</p>}
        </div>

        <div style={{ ...card, padding: 16 }}>
          <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>Gravações</h2>
          {(d?.gravacoes || []).map((g: any) => {
            const st = STATUS[g.status] || { txt: g.status, cor: 'var(--text-faint)' }
            return (
              <div key={g.id} style={{ borderTop: '1px solid var(--border)', padding: '10px 0' }}>
                <div onClick={() => abrir(g.id)} style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11.5, color: 'var(--text-faint)', minWidth: 92 }}>{quando(g.criado_em)}</span>
                  <span style={{ fontSize: 11, background: 'var(--surface-2)', borderRadius: 6, padding: '1px 7px', color: 'var(--text-2)' }}>{CTX[g.contexto_tipo]}</span>
                  <b style={{ fontSize: 13.5, flex: 1, minWidth: 160 }}>{g.analise?.titulo || g.titulo || 'Sem título'}</b>
                  {g.duracao_s ? <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{Math.round(g.duracao_s / 60)} min</span> : null}
                  <span style={{ fontSize: 12, color: st.cor, fontWeight: 700 }}>{st.txt}</span>
                </div>
                {aberta === g.id && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, lineHeight: 1.55 }}>
                    {!det ? <span style={{ color: 'var(--text-faint)' }}>carregando…</span> : <Detalhe g={det.gravacao} post={post} copiar={copiar} copiado={copiado} recarregar={() => detalheDe(g.id)} />}
                  </div>
                )}
              </div>
            )
          })}
          {!(d?.gravacoes || []).length && <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: 0 }}>Nenhuma gravação ainda.</p>}
        </div>
      </div>
    </Layout>
  )
}

function Detalhe({ g, post, copiar, copiado, recarregar }: { g: any; post: (c: any) => Promise<any>; copiar: (t: string, k: string) => void; copiado: string; recarregar: () => void }) {
  const a = g.analise || {}, ap = g.aplicado || {}, s = a.sinais || {}
  const bloco = (t: string, filhos: any) => <div><div style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-faint)', marginBottom: 4 }}>{t}</div>{filhos}</div>
  return (
    <>
      {g.status === 'erro' && <div style={{ color: 'var(--red)' }}>Erro: {g.erro} <button onClick={() => post({ acao: 'reprocessar', id: g.id })} style={{ ...btn, marginLeft: 8 }}>Tentar de novo</button></div>}
      {g.status === 'gravando' && <div style={{ color: 'var(--amber)' }}>Essa gravação ficou aberta (a aba fechou?). <button onClick={() => post({ acao: 'reprocessar', id: g.id })} style={{ ...btn, marginLeft: 8 }}>Finalizar com o que foi gravado</button></div>}
      {a.resumo && bloco('Resumo', <p style={{ margin: 0, color: 'var(--text-2)' }}>{a.resumo}</p>)}
      {(ap.itens || []).length > 0 && bloco('O que a IA fez no sistema', <div style={{ color: 'var(--green)' }}>{ap.itens.map((t: string, i: number) => <div key={i}>✓ {t}</div>)}{(ap.avisos || []).map((t: string, i: number) => <div key={'a' + i} style={{ color: 'var(--amber)' }}>! {t}</div>)}</div>)}
      {g.status === 'pronta' && <div><button onClick={async () => { await post({ acao: 'aplicar', id: g.id }); recarregar() }} style={{ ...btn, background: 'var(--grad)', color: '#fff', border: 'none', fontWeight: 700 }}>Aplicar tudo no sistema</button></div>}
      {a.mensagem_cliente && bloco('Mensagem pro cliente (copia e manda no WhatsApp)', <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '8px 10px', whiteSpace: 'pre-wrap' }}>{a.mensagem_cliente}<div><button onClick={() => copiar(a.mensagem_cliente, 'msg')} style={{ ...btn, marginTop: 6 }}>{copiado === 'msg' ? 'Copiado' : 'Copiar'}</button></div></div>)}
      {(a.pendencias_cliente || []).length > 0 && bloco('O cliente ficou de', <ul style={{ margin: 0, paddingLeft: 18 }}>{a.pendencias_cliente.map((p: any, i: number) => <li key={i}>{p.descricao}{p.prazo ? ` (até ${br(p.prazo)})` : ''}</li>)}</ul>)}
      {(a.conteudo || []).length > 0 && bloco('Ideias de conteúdo', <ul style={{ margin: 0, paddingLeft: 18 }}>{a.conteudo.map((c: any, i: number) => <li key={i}><b>{c.formato}:</b> "{c.gancho}" — {c.ideia}</li>)}</ul>)}
      {((s.venda || []).length + (s.risco || []).length + (s.indicacao || []).length + (s.duvidas || []).length) > 0 && bloco('Sinais', <div>
        {(s.venda || []).map((t: string, i: number) => <div key={'v' + i} style={{ color: 'var(--green)' }}>💰 {t}</div>)}
        {(s.risco || []).map((t: string, i: number) => <div key={'r' + i} style={{ color: 'var(--red)' }}>⚠️ {t}</div>)}
        {(s.indicacao || []).map((t: string, i: number) => <div key={'i' + i} style={{ color: 'var(--blue)' }}>🤝 {t}</div>)}
        {(s.duvidas || []).map((t: string, i: number) => <div key={'d' + i} style={{ color: 'var(--text-2)' }}>❓ {t}</div>)}
      </div>)}
      {g.transcricao && <details><summary style={{ cursor: 'pointer', color: 'var(--accent-soft)' }}>Transcrição completa</summary><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 12.5, color: 'var(--text-2)', maxHeight: 420, overflow: 'auto' }}>{g.transcricao}</pre></details>}
      <div><button onClick={() => post({ acao: 'descartar', id: g.id })} style={{ ...btn, color: 'var(--red)' }}>Apagar esta gravação (áudio e transcrição)</button></div>
    </>
  )
}
