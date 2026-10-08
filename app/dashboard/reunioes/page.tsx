'use client'

import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import { fetchAuth } from '@/lib/api'

// REUNIÕES POR VÍDEO (vieram da JamRock pra escola em 08/10/2026). Marcar a reunião com a pauta (é dela que a IA
// tira as sugestões ao vivo), mandar o convite, entrar como anfitrião e, depois, ler o resumo:
// as objeções, o que cada pessoa falou e os próximos passos.

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }
const inp: React.CSSProperties = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '10px 12px', fontSize: 14, color: 'var(--text)', fontFamily: 'inherit' }
const btn: React.CSSProperties = { background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 13px', fontSize: 13, cursor: 'pointer', textDecoration: 'none', fontFamily: 'inherit', whiteSpace: 'nowrap' }
// o botão forte no degradê da escola (o mesmo dos botões principais do sistema)
const btnForte: React.CSSProperties = { ...btn, background: 'var(--grad)', color: '#fff', border: '1px solid transparent', fontWeight: 700 }

const STATUS: Record<string, { txt: string; cor: string }> = {
  marcada: { txt: 'marcada', cor: 'var(--text-muted)' },
  em_andamento: { txt: 'acontecendo', cor: 'var(--green)' },
  encerrada: { txt: 'montando o resumo…', cor: 'var(--amber)' },
  resumida: { txt: 'resumo pronto', cor: 'var(--blue)' },
  erro: { txt: 'erro no resumo', cor: 'var(--red)' },
}

function diaBR(iso?: string | null) {
  if (!iso) return ''
  const s = new Date(iso).toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).replace(',', ' ·')
  return s[0].toUpperCase() + s.slice(1)
}
// "2026-09-30T13:00:00Z" → "2026-09-30T10:00" (o campo de data e hora do navegador, no horário de Brasília)
function paraCampo(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const z = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`
}
const textoConvite = (r: any) => `Oi! Segue o link da nossa reunião${r.quando ? ` de ${diaCurto(r.quando)}` : ''} sobre ${r.titulo}. Pode encaminhar pra quem mais for participar. É só tocar no link e entrar, sem instalar nada.\n\n${r.link}`
// "quarta, 30/09 às 14h"
function diaCurto(iso: string) {
  const s = new Date(iso).toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
  const m = s.match(/^([^,-]+)[^,]*,\s*(\d{2}\/\d{2}),?\s*(\d{2}):(\d{2})/)
  return m ? `${m[1]}, ${m[2]} às ${m[3]}h${m[4] !== '00' ? m[4] : ''}` : s
}

export default function Reunioes() {
  const [lista, setLista] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [novaAberta, setNovaAberta] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [quando, setQuando] = useState('')
  const [contexto, setContexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [copiado, setCopiado] = useState('')
  const [aberta, setAberta] = useState<string | null>(null)
  const [editando, setEditando] = useState<string | null>(null)
  const [pautaEd, setPautaEd] = useState('')
  const [quandoEd, setQuandoEd] = useState('')
  const [apresEd, setApresEd] = useState('')
  const [transcricao, setTranscricao] = useState<Record<string, string>>({})
  const [excluindo, setExcluindo] = useState<string | null>(null)

  async function carregar() {
    const j = await fetchAuth('/api/reunioes').then(r => r.json()).catch(() => null)
    if (j?.ok) { setLista(j.reunioes); setErro('') } else setErro(j?.error || 'Não consegui carregar as reuniões.')
    setCarregando(false)
  }
  useEffect(() => { carregar(); const t = setInterval(carregar, 20000); return () => clearInterval(t) }, [])

  async function marcar() {
    if (!titulo.trim()) { setErro('Dê um assunto pra reunião.'); return }
    setSalvando(true)
    const j = await fetchAuth('/api/reunioes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ titulo, contexto, quando: quando ? new Date(quando).toISOString() : null }) }).then(r => r.json()).catch(() => null)
    setSalvando(false)
    if (!j?.ok) { setErro(j?.error || 'Não consegui marcar.'); return }
    setTitulo(''); setQuando(''); setContexto(''); setNovaAberta(false); setErro('')
    await carregar(); setAberta(j.codigo)
  }
  async function salvarPauta(codigo: string) {
    await fetchAuth('/api/reunioes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo, contexto: pautaEd, quando: quandoEd ? new Date(quandoEd).toISOString() : null, apresentacao: apresEd }) })
    setEditando(null); carregar()
  }
  async function refazerResumo(r: any) {
    const h = new URL(r.link_host).searchParams.get('h')
    setLista(l => l.map(x => x.codigo === r.codigo ? { ...x, status: 'encerrada' } : x))
    await fetch(`/api/reunioes/${r.codigo}/sugestoes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ h, acao: 'resumir' }) }).catch(() => null)
    carregar()
  }
  // REABRIR uma encerrada (30/09): mesmo link, quem já estava entra sem esperar; o resumo é refeito no fim
  async function reabrir(r: any) {
    const h = new URL(r.link_host).searchParams.get('h')
    const aba = window.open('', '_blank')
    const j = await fetch(`/api/reunioes/${r.codigo}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'reabrir', h }) }).then(x => x.json()).catch(() => null)
    if (!j?.ok) { aba?.close(); setErro(j?.error || 'Não consegui reabrir.'); return }
    if (aba) aba.location.href = r.link_host; else window.location.href = r.link_host
    carregar()
  }
  async function excluir(codigo: string) {
    const j = await fetchAuth(`/api/reunioes?codigo=${codigo}`, { method: 'DELETE' }).then(r => r.json()).catch(() => null)
    setExcluindo(null)
    if (!j?.ok) { setErro(j?.error || 'Não consegui excluir.'); return }
    setLista(l => l.filter(x => x.codigo !== codigo))
  }
  async function verTranscricao(codigo: string) {
    if (transcricao[codigo] !== undefined) { setTranscricao(t => { const n = { ...t }; delete n[codigo]; return n }); return }
    const j = await fetchAuth(`/api/reunioes?transcricao=${codigo}`).then(r => r.json()).catch(() => null)
    setTranscricao(t => ({ ...t, [codigo]: j?.ok ? (j.texto || 'Nenhuma fala transcrita.') : (j?.error || 'Não consegui carregar.') }))
  }
  // O CONVITE VAI COMO FOTO COM LEGENDA (lição da escola, 29/09): como "prévia do link" a Meta gera uma
  // miniatura pequena e pixelada. No celular, o botão abre o compartilhar com a foto em alta e o texto;
  // no computador, baixa a foto e copia o texto (no WhatsApp: mande a foto e cole o texto na legenda).
  async function mandarFoto(r: any) {
    const txt = textoConvite(r)
    try { await navigator.clipboard.writeText(txt) } catch { /* segue */ }
    try {
      const blob = await fetch(`/r/${r.codigo}/convite-foto?v=${encodeURIComponent(r.quando || '')}${encodeURIComponent(r.titulo)}`).then(x => x.blob())
      const arq = new File([blob], `convite-carreiranodigital-${r.codigo}.png`, { type: 'image/png' })
      const nav: any = navigator
      if (nav.canShare && nav.canShare({ files: [arq] })) { await nav.share({ files: [arq], text: txt }); return }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = arq.name; a.click()
      setCopiado(r.codigo + 'f'); setTimeout(() => setCopiado(''), 6000)
    } catch { /* cancelou o compartilhar */ }
  }
  async function copiar(txt: string, chave: string) {
    try { await navigator.clipboard.writeText(txt); setCopiado(chave); setTimeout(() => setCopiado(''), 2000) } catch { window.prompt('Copie o convite:', txt) }
  }

  return (
    <Layout>
      <div style={{ padding: '28px 32px', maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 }}>🎥 Reuniões</h1>
            <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 0' }}>Reunião por vídeo com várias pessoas. Quem abre o link espera você liberar. Só você vê as sugestões ao vivo.</p>
          </div>
          <button style={btnForte} onClick={() => setNovaAberta(v => !v)}>{novaAberta ? 'Fechar' : '+ Nova reunião'}</button>
        </div>

        {erro && <div style={{ ...card, padding: 12, color: 'var(--red)', fontSize: 13 }}>{erro}</div>}

        {novaAberta && (
          <div style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Assunto
              <input style={{ ...inp, marginTop: 5 }} value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex.: Deu Venda · apresentação da proposta" maxLength={140} />
            </label>
            <label style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Quando (opcional, aparece no convite)
              <input type="datetime-local" style={{ ...inp, marginTop: 5 }} value={quando} onChange={e => setQuando(e.target.value)} />
            </label>
            <label style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Pauta, proposta ou carta
              <textarea style={{ ...inp, marginTop: 5, minHeight: 150, resize: 'vertical' }} value={contexto} onChange={e => setContexto(e.target.value)} placeholder="Cole aqui o texto da proposta, os números e o que você quer falar. A IA usa isso pra montar a pauta e sugerir respostas às objeções durante a reunião." />
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button style={btnForte} disabled={salvando} onClick={marcar}>{salvando ? 'Marcando…' : 'Marcar reunião'}</button></div>
          </div>
        )}

        {carregando ? <div style={{ color: 'var(--text-faint)', padding: 30 }}>Carregando…</div> : lista.length === 0 ? (
          <div style={{ ...card, padding: 24, color: 'var(--text-faint)', fontSize: 14 }}>Nenhuma reunião ainda. Toque em Nova reunião.</div>
        ) : lista.map(r => {
          const st = STATUS[r.status] || STATUS.marcada
          const ab = aberta === r.codigo
          const res = r.resumo || null
          return (
            <div key={r.codigo} style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', cursor: 'pointer' }} onClick={() => setAberta(ab ? null : r.codigo)}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{r.titulo}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 2 }}>
                    {r.quando ? diaBR(r.quando) : `Marcada em ${diaBR(r.criado_em)}`}
                    {r.pessoas?.length ? ` · ${r.pessoas.map((p: any) => p.nome.split(' ')[0]).join(', ')}` : ''}
                  </div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: st.cor }}>{st.txt}</span>
                {excluindo === r.codigo ? (
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: 'var(--text-2)' }} onClick={e => e.stopPropagation()}>
                    Excluir com gravação e resumo?
                    <button style={btn} onClick={() => setExcluindo(null)}>Não</button>
                    <button style={{ ...btn, background: 'var(--red)', color: '#fff', border: '1px solid var(--red)', fontWeight: 700 }} onClick={() => excluir(r.codigo)}>Excluir</button>
                  </span>
                ) : <button style={{ ...btn, color: 'var(--text-faint)' }} title="Excluir esta reunião" onClick={e => { e.stopPropagation(); setExcluindo(r.codigo) }}>Excluir</button>}
                <button style={btn} onClick={e => { e.stopPropagation(); setAberta(r.codigo) }}>Convidar</button>
                {['encerrada', 'resumida', 'erro'].includes(r.status)
                  ? <button style={btnForte} onClick={e => { e.stopPropagation(); reabrir(r) }}>Reabrir</button>
                  : <a href={r.link_host} target="_blank" rel="noopener" style={btnForte} onClick={e => e.stopPropagation()}>{r.status === 'marcada' ? 'Abrir a reunião' : 'Entrar'}</a>}
              </div>

              {ab && (
                <div style={{ borderTop: '1px solid var(--border)', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>CONVITE</div>
                    <div style={{ fontSize: 13.5, color: 'var(--text-2)', whiteSpace: 'pre-wrap', background: 'var(--surface-2)', borderRadius: 8, padding: 12, border: '1px solid var(--border)' }}>{textoConvite(r)}</div>
                    <img src={`/r/${r.codigo}/convite-foto?v=${encodeURIComponent(r.quando || '')}${encodeURIComponent(r.titulo)}`} alt="A foto do convite" style={{ width: '100%', maxWidth: 520, aspectRatio: '1600 / 840', borderRadius: 10, border: '1px solid var(--border)', display: 'block', marginTop: 10, background: '#0f0c17' }} />
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                      <button style={btnForte} onClick={() => mandarFoto(r)}>Mandar foto + convite</button>
                      <button style={btn} onClick={() => copiar(textoConvite(r), r.codigo)}>{copiado === r.codigo ? 'Texto copiado' : 'Copiar texto'}</button>
                      <button style={btn} onClick={() => copiar(r.link, r.codigo + 'l')}>{copiado === r.codigo + 'l' ? 'Link copiado' : 'Copiar só o link'}</button>
                    </div>
                    {copiado === r.codigo + 'f' && <p style={{ fontSize: 12.5, color: 'var(--green)', margin: '8px 0 0' }}>Foto baixada e texto copiado. No WhatsApp, mande a foto e cole o texto na legenda.</p>}
                    <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '8px 0 0' }}>O convite vai como foto em alta, com o texto e o link na legenda. No celular o botão abre o WhatsApp direto. Quem receber pode encaminhar: todo mundo cai na sala de espera e você libera.</p>
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>PAUTA E CONTEXTO (a IA usa pras sugestões)</div>
                      {editando !== r.codigo && <button style={{ ...btn, padding: '3px 9px', fontSize: 12 }} onClick={() => { setEditando(r.codigo); setPautaEd(r.contexto || ''); setQuandoEd(paraCampo(r.quando)); setApresEd(r.apresentacao || '') }}>Editar</button>}
                    </div>
                    {editando === r.codigo ? (
                      <>
                        <label style={{ fontSize: 12.5, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>Quando
                          <input type="datetime-local" style={{ ...inp, marginTop: 5, maxWidth: 260 }} value={quandoEd} onChange={e => setQuandoEd(e.target.value)} />
                        </label>
                        <label style={{ fontSize: 12.5, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>Como aparece pro convidado (opcional)
                          <input style={{ ...inp, marginTop: 5 }} value={apresEd} onChange={e => setApresEd(e.target.value)} placeholder="Vazio: “Reunião com a Carreira no Digital”" maxLength={200} />
                        </label>
                        <textarea style={{ ...inp, minHeight: 160, resize: 'vertical' }} value={pautaEd} onChange={e => setPautaEd(e.target.value)} />
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><button style={btnForte} onClick={() => salvarPauta(r.codigo)}>Salvar</button><button style={btn} onClick={() => setEditando(null)}>Cancelar</button></div>
                      </>
                    ) : <div style={{ fontSize: 13, color: r.contexto ? 'var(--text-2)' : 'var(--text-faint)', whiteSpace: 'pre-wrap', maxHeight: 140, overflow: 'auto' }}>{r.contexto || 'Sem pauta. As sugestões vão se basear só na conversa.'}</div>}
                  </div>

                  {(r.status === 'resumida' || r.status === 'erro' || r.status === 'encerrada') && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>RESUMO</div>
                        {r.status !== 'encerrada' && <button style={{ ...btn, padding: '3px 9px', fontSize: 12 }} onClick={() => refazerResumo(r)}>Refazer</button>}
                        <button style={{ ...btn, padding: '3px 9px', fontSize: 12 }} onClick={() => verTranscricao(r.codigo)}>{transcricao[r.codigo] !== undefined ? 'Fechar transcrição' : 'Ver transcrição'}</button>
                      </div>
                      {transcricao[r.codigo] !== undefined && <div style={{ fontSize: 13, color: 'var(--text-2)', whiteSpace: 'pre-wrap', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, maxHeight: 360, overflow: 'auto', fontFamily: 'ui-monospace, Menlo, monospace' }}>{transcricao[r.codigo]}</div>}
                      {r.status === 'encerrada' && <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>Montando o resumo. Fica pronto em um ou dois minutos.</div>}
                      {r.status === 'erro' && <div style={{ fontSize: 13, color: 'var(--red)' }}>{r.erro || 'Falhou.'} Toque em Refazer.</div>}
                      {res && (
                        <>
                          {res.resumo ? <p style={{ fontSize: 14, color: 'var(--text-2)', margin: 0, lineHeight: 1.55 }}>{res.resumo}</p>
                            : <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: 0 }}>{res.falas ? 'A IA não conseguiu resumir. Toque em Refazer.' : 'Nenhuma fala foi transcrita nesta reunião.'}</p>}
                          <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>
                            {res.duracao_seg ? `${Math.round(res.duracao_seg / 60)} min · ` : ''}{(res.participantes || []).length} pessoas{res.clima ? ` · clima ${res.clima}` : ''}
                          </div>

                          {Array.isArray(res.objecoes) && res.objecoes.length > 0 && (
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Objeções</div>
                              {res.objecoes.map((o: any, i: number) => (
                                <div key={i} style={{ padding: '10px 0', borderTop: i ? '1px solid var(--border)' : 'none', fontSize: 13.5 }}>
                                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <b style={{ color: 'var(--text)' }}>{o.tema}</b>
                                    <span style={{ fontSize: 11.5, fontWeight: 700, color: o.status === 'em aberto' ? 'var(--amber)' : 'var(--green)' }}>{o.status}</span>
                                    {o.em && <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{o.em}</span>}
                                  </div>
                                  {o.trecho && <div style={{ fontStyle: 'italic', color: 'var(--text-2)', marginTop: 3 }}>“{o.trecho}” <span style={{ fontStyle: 'normal', color: 'var(--text-faint)' }}>· {o.quem}</span></div>}
                                  {o.resposta && <div style={{ marginTop: 4, color: 'var(--text-2)', borderLeft: `2px solid ${o.status === 'em aberto' ? 'var(--amber)' : 'var(--green)'}`, paddingLeft: 8 }}>{o.resposta}</div>}
                                </div>
                              ))}
                            </div>
                          )}

                          {Array.isArray(res.pessoas) && res.pessoas.length > 0 && (
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>O que cada pessoa falou</div>
                              <div style={{ display: 'grid', gap: 10 }} className="rs-pessoas">
                                {res.pessoas.map((p: any, i: number) => (
                                  <div key={i} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b style={{ color: 'var(--text)', fontSize: 14 }}>{p.nome}</b><span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{p.posicao}{res.fala?.[p.nome] != null ? ` · ${res.fala[p.nome]}% da fala` : ''}</span></div>
                                    <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--text-2)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                                      {(p.pontos || []).map((pt: any, k: number) => <li key={k}>{typeof pt === 'string' ? pt : pt.texto}{pt?.em ? <span style={{ color: 'var(--text-faint)', fontSize: 11.5 }}> · {pt.em}</span> : null}</li>)}
                                    </ul>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {Array.isArray(res.proximos) && res.proximos.length > 0 && (
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Próximos passos</div>
                              {res.proximos.map((p: any, i: number) => (
                                <div key={i} style={{ display: 'flex', gap: 10, fontSize: 13.5, padding: '6px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                                  <span style={{ flex: 1, color: 'var(--text-2)' }}>{p.acao}</span>
                                  <span style={{ color: 'var(--text-faint)', fontSize: 12.5, whiteSpace: 'nowrap' }}>{[p.quem, p.prazo].filter(Boolean).join(' · ')}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <style>{`.rs-pessoas{grid-template-columns:1fr 1fr}@media (max-width:700px){.rs-pessoas{grid-template-columns:1fr}}`}</style>
    </Layout>
  )
}
