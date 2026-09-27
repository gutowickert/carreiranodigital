'use client'

import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Layout from '@/components/Layout'
import { MANUAIS } from '@/lib/manuais-conteudo'

// O MANUAL — o que o sistema faz, o que cada cliente tem de diferente, como se implanta, e o que o
// cliente aprende. Pros admins da escola, dentro do sistema (decisão do Nando, 27/09/2026).
//
// ⚠️ O TEXTO MORA EM manuais/*.md, NÃO AQUI. Esta tela só desenha. Mudou o jeito de implantar, muda
// o .md e roda `node manuais/gerar.mjs` — a tela acompanha sem mexer em código.

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }

// o id de uma seção, pro índice da esquerda apontar pra ela
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export default function ManualDoSistema() {
  const [chave, setChave] = useState(MANUAIS[0]?.chave || '')
  const [ativa, setAtiva] = useState('')
  useEffect(() => { try { const c = localStorage.getItem('manual.aba'); if (c && MANUAIS.some(m => m.chave === c)) setChave(c) } catch { } }, [])
  const trocar = (c: string) => { setChave(c); setAtiva(''); try { localStorage.setItem('manual.aba', c) } catch { } ; window.scrollTo({ top: 0 }) }

  const manual = MANUAIS.find(m => m.chave === chave) || MANUAIS[0]
  // o índice: as seções (##) do manual aberto
  const secoes = useMemo(() => (manual?.conteudo.match(/^## .+$/gm) || []).map(l => l.replace(/^## /, '')), [manual])

  // o índice acompanha a leitura: a seção mais visível ganha a cor
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const els = Array.from(document.querySelectorAll<HTMLElement>('h2[id]'))
    const vis: Record<string, number> = {}
    const obs = new IntersectionObserver(es => {
      es.forEach(e => { vis[(e.target as HTMLElement).id] = e.isIntersecting ? e.intersectionRatio : 0 })
      let melhor = '', maior = 0
      // a última seção que já passou do topo é a ativa; se nenhuma está visível, fica a anterior
      for (const el of els) { const r = el.getBoundingClientRect(); if (r.top < 140) melhor = el.id }
      for (const [id, v] of Object.entries(vis)) if (v > maior) { maior = v; if (!melhor) melhor = id }
      if (melhor) setAtiva(melhor)
    }, { threshold: [0, .5, 1], rootMargin: '-120px 0px -60% 0px' })
    els.forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [manual])

  return (
    <Layout>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 4px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Manual</h1>
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: '4px 0 16px' }}>O que o sistema faz, o que cada cliente tem de diferente, como se implanta, e o que o cliente aprende. Só pra admin.</p>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
          {MANUAIS.map(m => (
            <button key={m.chave} onClick={() => trocar(m.chave)}
              style={{ background: m.chave === manual.chave ? 'var(--accent)' : 'var(--surface-2)', color: m.chave === manual.chave ? '#fff' : 'var(--text-2)', border: '1px solid var(--border-strong)', borderRadius: 999, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              {m.titulo}
            </button>
          ))}
        </div>

        <div className="manual-grade" style={{ display: 'grid', gridTemplateColumns: '230px minmax(0,1fr)', gap: 24, alignItems: 'start' }}>
          <nav style={{ position: 'sticky', top: 12 }} aria-label="Seções">
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 8 }}>{manual.titulo}</div>
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {secoes.map(s => {
                const id = slug(s); const on = ativa === id
                return (
                  <li key={id}>
                    <a href={`#${id}`} onClick={() => setAtiva(id)}
                      style={{ display: 'block', padding: '6px 10px', borderRadius: 8, fontSize: 12.5, fontWeight: on ? 700 : 600, textDecoration: 'none', color: on ? 'var(--text)' : 'var(--text-faint)', background: on ? 'var(--accent-bg, var(--surface-2))' : 'transparent', borderLeft: `3px solid ${on ? 'var(--accent)' : 'transparent'}` }}>
                      {s}
                    </a>
                  </li>
                )
              })}
            </ol>
          </nav>

          <article style={{ ...card, padding: '22px 26px', minWidth: 0 }} className="manual-texto">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
              h1: ({ children }) => <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 6px' }}>{children}</h2>,
              h2: ({ children }) => <h2 id={slug(String(children))} style={{ fontSize: 17.5, fontWeight: 800, margin: '30px 0 10px', scrollMarginTop: 16 }}>{children}</h2>,
              h3: ({ children }) => <h3 style={{ fontSize: 15, fontWeight: 700, margin: '18px 0 6px' }}>{children}</h3>,
              p: ({ children }) => <p style={{ margin: '0 0 10px', lineHeight: 1.65, fontSize: 14, color: 'var(--text)' }}>{children}</p>,
              ul: ({ children }) => <ul style={{ margin: '0 0 10px', paddingLeft: 20, lineHeight: 1.6, fontSize: 14 }}>{children}</ul>,
              ol: ({ children }) => <ol style={{ margin: '0 0 10px', paddingLeft: 22, lineHeight: 1.6, fontSize: 14 }}>{children}</ol>,
              li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
              a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-soft, var(--accent))' }}>{children}</a>,
              code: ({ children }) => <code style={{ background: 'var(--surface-2)', borderRadius: 4, padding: '1px 5px', fontSize: 12.5 }}>{children}</code>,
              table: ({ children }) => <div style={{ overflowX: 'auto', margin: '6px 0 14px', border: '1px solid var(--border)', borderRadius: 10 }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>{children}</table></div>,
              th: ({ children }) => <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>{children}</th>,
              td: ({ children }) => <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', verticalAlign: 'top', lineHeight: 1.5 }}>{children}</td>,
              blockquote: ({ children }) => <blockquote style={{ margin: '0 0 10px', padding: '8px 12px', borderLeft: '3px solid var(--amber)', background: 'var(--amber-bg)', borderRadius: '0 8px 8px 0' }}>{children}</blockquote>,
            }}>{manual.conteudo}</ReactMarkdown>
          </article>
        </div>
        <style>{`@media (max-width: 800px) { .manual-grade { grid-template-columns: 1fr !important; } .manual-grade nav { position: static !important; } .manual-grade nav ol { flex-direction: row !important; overflow-x: auto; } .manual-grade nav a { white-space: nowrap; } }`}</style>
      </div>
    </Layout>
  )
}
