'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { fetchAuth } from '@/lib/api'
import { Copy, ChevronDown, ChevronRight } from 'lucide-react'

// O QUE A EMPRESA RESPONDEU — a tela de quem vai configurar o CRM dela.
//
// ⚠️ AGRUPADA POR DESTINO, não pela ordem das perguntas. Quem configura não lê 96 respostas em
// ordem: abre "etapas" e configura as etapas, abre "cadência" e configura a cadência. É a ideia do
// questionário do Guto que mais rendeu, e é o que transforma a entrevista em configuração.
//
// O áudio aparece com o player E com a transcrição: a transcrição serve pra ler rápido, o áudio
// serve pra conferir o que a transcrição comeu — e pra ouvir o JEITO de falar, que é metade do que
// a IA precisa aprender.

const CORES: Record<string, { cor: string; bg: string }> = {
  'Aprovado': { cor: 'var(--green)', bg: 'var(--green-bg)' },
  'Ajustar': { cor: 'var(--amber)', bg: 'var(--amber-bg)' },
  'Tirar': { cor: 'var(--red)', bg: 'var(--red-bg)' },
  'Feito': { cor: 'var(--green)', bg: 'var(--green-bg)' },
}

export default function Respostas() {
  const { slug } = useParams<{ slug: string }>()
  const [d, setD] = useState<any>(null)
  const [erro, setErro] = useState('')
  const [fechados, setFechados] = useState<Set<string>>(new Set())
  const [copiado, setCopiado] = useState('')

  useEffect(() => {
    fetchAuth(`/api/instalacoes/respostas?slug=${encodeURIComponent(String(slug))}`)
      .then(r => r.json()).then(j => { if (j?.ok) setD(j); else setErro(j?.error || 'não consegui abrir') })
      .catch(() => setErro('não consegui abrir'))
  }, [slug])

  function copiar(destino: string, itens: any[]) {
    const txt = itens.map(i => {
      const t = [`— ${i.pergunta}`]
      if (i.status) t.push(`  [${i.status}]`)
      if (i.valor) t.push(`  ${i.valor}`)
      for (const a of i.anexos) if (a.transcricao) t.push(`  (falado) ${a.transcricao}`)
      return t.join('\n')
    }).join('\n\n')
    navigator.clipboard?.writeText(`## ${destino}\n\n${txt}`)
    setCopiado(destino); setTimeout(() => setCopiado(''), 2500)
  }

  if (erro) return <Layout><div style={{ padding: 32, color: 'var(--text-2)' }}>{erro}</div></Layout>
  if (!d) return <Layout><div style={{ padding: 32, color: 'var(--text-faint)' }}>Carregando…</div></Layout>

  return (
    <Layout>
      <div style={{ padding: '20px clamp(12px, 3vw, 32px)', maxWidth: 900, margin: '0 auto' }}>
        <Link href="/dashboard/instalacoes" style={{ fontSize: 12.5, color: 'var(--text-faint)', textDecoration: 'none' }}>← Clientes do CRM</Link>

        <h1 className="display relevo-titulo" style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: '10px 0 4px' }}>{d.nome}</h1>
        <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: '0 0 6px' }}>
          {d.total} respostas{d.audios > 0 ? ` · ${d.audios} em áudio, já transcritos` : ''} · {d.grupos.length} áreas do sistema
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '0 0 20px', maxWidth: '64ch', lineHeight: 1.55 }}>
          Agrupado por <b style={{ color: 'var(--text-2)' }}>onde a resposta entra no sistema</b>, não pela ordem
          em que foi perguntado. Configure uma área por vez.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {d.grupos.map((g: any) => {
            const aberto = !fechados.has(g.destino)
            return (
              <div key={g.destino} className="vidro" style={{ overflow: 'hidden' }}>
                <div onClick={() => setFechados(s => { const n = new Set(s); n.has(g.destino) ? n.delete(g.destino) : n.add(g.destino); return n })}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', cursor: 'pointer', borderBottom: aberto ? '1px solid var(--glass-border)' : 'none' }}>
                  {aberto ? <ChevronDown size={15} color="var(--text-muted)" /> : <ChevronRight size={15} color="var(--text-muted)" />}
                  <span style={{ fontSize: 14.5, fontWeight: 800, color: g.destino === 'sem destino' ? 'var(--text-muted)' : 'var(--accent-soft)', textTransform: 'capitalize' }}>{g.destino}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{g.itens.length}</span>
                  <div style={{ flex: 1 }} />
                  <button onClick={e => { e.stopPropagation(); copiar(g.destino, g.itens) }}
                    style={{ background: 'transparent', border: '1px solid var(--border-strong)', borderRadius: 'var(--r)', color: 'var(--text-2)', fontSize: 11.5, padding: '4px 10px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Copy size={11} /> {copiado === g.destino ? 'copiado!' : 'copiar'}
                  </button>
                </div>

                {aberto && (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {g.itens.map((i: any, n: number) => (
                      <div key={i.campo} style={{ padding: '13px 16px', borderTop: n ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45 }}>{i.pergunta}</div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 5, flexWrap: 'wrap' }}>
                          {i.status && (
                            <span style={{ fontSize: 11.5, fontWeight: 800, padding: '2px 9px', borderRadius: 'var(--r-pill)', flexShrink: 0, ...(CORES[i.status] ? { background: CORES[i.status].bg, color: CORES[i.status].cor } : { background: 'var(--surface-2)', color: 'var(--text-2)' }) }}>
                              {i.status}
                            </span>
                          )}
                          {i.valor && <div style={{ fontSize: 14.5, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.55, flex: '1 1 260px', minWidth: 0 }}>{i.valor}</div>}
                        </div>

                        {i.anexos.map((a: any) => (
                          <div key={a.path} style={{ marginTop: 9, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '10px 12px' }}>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                              {a.tipo === 'audio' ? '🎤 respondeu falando' : a.tipo === 'imagem' ? '🖼️ ' + a.nome : '📄 ' + a.nome}
                            </div>
                            {a.tipo === 'audio' && a.url && <audio controls src={a.url} style={{ width: '100%', height: 34, marginTop: 7 }} />}
                            {a.tipo === 'imagem' && a.url && <img src={a.url} alt={a.nome} style={{ maxWidth: '100%', borderRadius: 8, marginTop: 7 }} />}
                            {a.tipo === 'arquivo' && a.url && <a href={a.url} target="_blank" rel="noopener" style={{ fontSize: 12.5, color: 'var(--accent-soft)', display: 'inline-block', marginTop: 6 }}>baixar ↗</a>}
                            {a.transcricao && (
                              <p style={{ fontSize: 14, color: 'var(--text)', margin: '9px 0 0', lineHeight: 1.6, fontStyle: 'italic' }}>&ldquo;{a.transcricao}&rdquo;</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {d.grupos.length === 0 && (
          <div className="vidro" style={{ padding: 24, fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
            Nada respondido ainda. Assim que a empresa começar a preencher, as respostas aparecem aqui —
            não precisa esperar ela terminar.
          </div>
        )}
      </div>
    </Layout>
  )
}
