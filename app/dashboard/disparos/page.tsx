'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

const card = { backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '12px' } as React.CSSProperties
const inp = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', color: '#fff', outline: 'none', width: '100%' } as React.CSSProperties
const btn = { backgroundColor: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 18px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' } as React.CSSProperties
const label = { display: 'block', fontSize: 12, color: '#9ca3af', marginBottom: 6 } as React.CSSProperties

type Tpl = { nome: string; idioma: string; categoria: string; variaveis: number; header: string | null; corpo: string }
type Contato = { telefone: string; nome: string; lead_id?: string }

export default function Disparos() {
  const [turmas, setTurmas] = useState<any[]>([])
  const [templates, setTemplates] = useState<Tpl[]>([])
  const [modo, setModo] = useState<'turma' | 'colar' | 'lista'>('turma')
  const [turmaId, setTurmaId] = useState('')
  const [numerosTexto, setNumerosTexto] = useState('')
  // listas frias (wa_contatos)
  const [cidades, setCidades] = useState<{ cidade: string; interessado: number; comprador: number; total: number }[]>([])
  const [listaCategoria, setListaCategoria] = useState<'interessado' | 'comprador'>('interessado')
  const [listaCidade, setListaCidade] = useState('') // '' = todas
  const [contatos, setContatos] = useState<Contato[]>([])
  const [carregandoPublico, setCarregandoPublico] = useState(false)

  const [tplNome, setTplNome] = useState('')
  const [headerLink, setHeaderLink] = useState('')
  const [headerMediaId, setHeaderMediaId] = useState('')
  const [headerArquivo, setHeaderArquivo] = useState('')
  const [subindoMidia, setSubindoMidia] = useState(false)
  const headerFileRef = useRef<HTMLInputElement | null>(null)
  const [bodyParams, setBodyParams] = useState<string[]>([])
  const [nomeCampanha, setNomeCampanha] = useState('')

  async function subirHeaderMidia(file: File) {
    setSubindoMidia(true)
    try {
      // Sobe direto pro Supabase Storage (navegador -> Supabase), sem passar pela
      // Vercel — assim aguenta vídeo grande. Usa a URL pública no template.
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
      const caminho = `header/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('disparos').upload(caminho, file, { contentType: file.type || undefined, upsert: false })
      if (error) { alert('Falha no upload: ' + error.message); return }
      const { data } = supabase.storage.from('disparos').getPublicUrl(caminho)
      setHeaderLink(data.publicUrl); setHeaderArquivo(file.name); setHeaderMediaId('')
    } catch (e: any) { alert('Erro no upload: ' + (e?.message || '')) } finally { setSubindoMidia(false) }
  }

  const [rodando, setRodando] = useState(false)
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0, enviados: 0, falhas: 0 })
  const [resultadoFinal, setResultadoFinal] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('turmas').select('id, codigo, produtos(nome), cidades(nome)').then(({ data }) => setTurmas(data || []))
    fetch('/api/wa-oficial/templates').then(r => r.json()).then(j => setTemplates(j.templates || []))
    // resumo das listas frias (só pra popular o seletor de cidade)
    fetch('/api/wa-oficial/contatos?limit=1').then(r => r.json()).then(j => { if (j.ok) setCidades(j.resumo?.cidades || []) })
  }, [])

  const tpl = templates.find(t => t.nome === tplNome)
  const headerMidia = tpl && ['image', 'video', 'document'].includes(tpl.header || '')
  const custoUnit = tpl?.categoria === 'marketing' ? 0.35 : 0.03

  // ajusta os campos de variáveis quando troca o template
  useEffect(() => {
    if (tpl) setBodyParams(Array.from({ length: tpl.variaveis }, () => '')); else setBodyParams([])
    setHeaderLink(''); setHeaderMediaId(''); setHeaderArquivo('')
  }, [tplNome])

  async function carregarPublico() {
    setCarregandoPublico(true); setContatos([])
    try {
      if (modo === 'turma') {
        if (!turmaId) { setCarregandoPublico(false); return }
        const { data } = await supabase.from('leads').select('id, nome, whatsapp').eq('turma_id', turmaId).not('whatsapp', 'is', null)
        setContatos((data || []).filter((l: any) => l.whatsapp).map((l: any) => ({ telefone: l.whatsapp, nome: l.nome || '', lead_id: l.id })))
      } else if (modo === 'lista') {
        const p = new URLSearchParams({ categoria: listaCategoria, limit: '5000' })
        if (listaCidade) p.set('cidade', listaCidade)
        const j = await fetch('/api/wa-oficial/contatos?' + p.toString()).then(r => r.json())
        // exclui quem já é opt-out na própria lista (o disparo ainda checa wa_optout)
        const cs = (j.contatos || []).filter((c: any) => c.status !== 'optout').map((c: any) => ({ telefone: c.telefone, nome: c.nome || '' }))
        setContatos(cs)
      } else {
        const linhas = numerosTexto.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)
        setContatos(linhas.map(t => ({ telefone: t, nome: '' })))
      }
    } finally { setCarregandoPublico(false) }
  }

  async function disparar() {
    if (!tpl || contatos.length === 0) return
    if (headerMidia && !headerMediaId && !headerLink.trim()) { alert('Esse template tem mídia no topo — faça upload de um arquivo ou informe a URL.'); return }
    if (subindoMidia) { alert('Aguarde o upload da mídia terminar.'); return }
    if (!confirm(`Disparar "${tpl.nome}" para ${contatos.length} contato(s)? Custo estimado: ${(contatos.length * custoUnit).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`)) return

    setRodando(true); setResultadoFinal(null)
    setProgresso({ feitos: 0, total: contatos.length, enviados: 0, falhas: 0 })
    try {
      // 1) cria a campanha
      const cr = await fetch('/api/wa-oficial/disparar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'criar', nome: nomeCampanha || `Disparo ${tpl.nome}`, template: tpl.nome, idioma: tpl.idioma, categoria: tpl.categoria, total: contatos.length }),
      }).then(r => r.json())
      if (!cr.ok) { alert('Erro ao criar campanha: ' + cr.error); setRodando(false); return }
      const disparoId = cr.disparoId

      // 2) envia em lotes de 25
      const lote = 25
      let enviados = 0, falhas = 0
      const headerObj = headerMidia ? { tipo: tpl!.header, ...(headerMediaId ? { id: headerMediaId } : { link: headerLink.trim() }) } : null
      for (let i = 0; i < contatos.length; i += lote) {
        const chunk = contatos.slice(i, i + lote)
        const res = await fetch('/api/wa-oficial/disparar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'enviar', disparoId, template: tpl.nome, idioma: tpl.idioma, categoria: tpl.categoria, headerMidia: headerObj, bodyParams, contatos: chunk }),
        }).then(r => r.json())
        if (res.ok) { enviados += res.enviados; falhas += res.falhas }
        else falhas += chunk.length
        setProgresso({ feitos: Math.min(i + lote, contatos.length), total: contatos.length, enviados, falhas })
      }

      await fetch('/api/wa-oficial/disparar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'concluir', disparoId }) })
      setResultadoFinal(`Concluído! ${enviados} enviados, ${falhas} falhas. Custo estimado: ${(enviados * custoUnit).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`)
    } catch (e: any) {
      setResultadoFinal('Erro: ' + ((e && e.message) || 'falha'))
    } finally { setRodando(false) }
  }

  return (
    <div style={{ padding: '32px 40px', maxWidth: 760 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>Disparos</h1>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 24px' }}>Envio em massa pela API Oficial do WhatsApp (templates aprovados).</p>

      {/* 1. Público */}
      <div style={{ ...card, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 12 }}>1. Público</div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, color: '#d1d1d1', cursor: 'pointer' }}><input type="radio" checked={modo === 'turma'} onChange={() => setModo('turma')} /> Leads por turma</label>
          <label style={{ fontSize: 13, color: '#d1d1d1', cursor: 'pointer' }}><input type="radio" checked={modo === 'lista'} onChange={() => setModo('lista')} /> Listas (frias)</label>
          <label style={{ fontSize: 13, color: '#d1d1d1', cursor: 'pointer' }}><input type="radio" checked={modo === 'colar'} onChange={() => setModo('colar')} /> Colar números</label>
        </div>
        {modo === 'turma' && (
          <select style={inp} value={turmaId} onChange={e => setTurmaId(e.target.value)}>
            <option value="">Selecione a turma...</option>
            {turmas.map(t => <option key={t.id} value={t.id}>{t.produtos?.nome} — {t.cidades?.nome} ({t.codigo})</option>)}
          </select>
        )}
        {modo === 'lista' && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <label style={label}>Categoria</label>
              <select style={{ ...inp, width: 'auto' }} value={listaCategoria} onChange={e => setListaCategoria(e.target.value as any)}>
                <option value="interessado">Interessados</option>
                <option value="comprador">Compradores</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label style={label}>Cidade</label>
              <select style={inp} value={listaCidade} onChange={e => setListaCidade(e.target.value)}>
                <option value="">Todas as cidades</option>
                {cidades.map(c => {
                  const n = listaCategoria === 'comprador' ? c.comprador : c.interessado
                  return <option key={c.cidade} value={c.cidade}>{c.cidade} ({n})</option>
                })}
              </select>
            </div>
          </div>
        )}
        {modo === 'colar' && (
          <textarea style={{ ...inp, minHeight: 90 }} placeholder="Um número por linha (com DDD)" value={numerosTexto} onChange={e => setNumerosTexto(e.target.value)} />
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <button onClick={carregarPublico} disabled={carregandoPublico} style={{ ...btn, background: '#3a3a3c' }}>{carregandoPublico ? '...' : 'Carregar público'}</button>
          {contatos.length > 0 && <span style={{ fontSize: 13, color: '#34d399' }}>{contatos.length} contato(s) carregado(s)</span>}
        </div>
      </div>

      {/* 2. Mensagem */}
      <div style={{ ...card, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 12 }}>2. Mensagem (template)</div>
        <label style={label}>Template aprovado</label>
        <select style={inp} value={tplNome} onChange={e => setTplNome(e.target.value)}>
          <option value="">Selecione...</option>
          {templates.map(t => <option key={t.nome + t.idioma} value={t.nome}>{t.nome} · {t.categoria} · {t.idioma}{t.header ? ` · ${t.header}` : ''}</option>)}
        </select>

        {tpl && (
          <>
            {tpl.corpo && <div style={{ fontSize: 12, color: '#9ca3af', background: '#1c1c1e', borderRadius: 8, padding: 10, marginTop: 10, whiteSpace: 'pre-wrap' }}>{tpl.corpo}</div>}
            {headerMidia && (
              <div style={{ marginTop: 12 }}>
                <label style={label}>Mídia do topo ({tpl.header})</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input ref={headerFileRef} type="file" style={{ display: 'none' }}
                    accept={tpl.header === 'image' ? 'image/*' : tpl.header === 'video' ? 'video/*' : 'application/pdf,.pdf,.doc,.docx,.xls,.xlsx'}
                    onChange={e => { const f = e.target.files?.[0]; if (f) subirHeaderMidia(f); e.target.value = '' }} />
                  <button type="button" onClick={() => headerFileRef.current?.click()} disabled={subindoMidia}
                    style={{ ...btn, background: '#3a3a3c', opacity: subindoMidia ? 0.6 : 1 }}>
                    {subindoMidia ? 'Enviando...' : '📎 Escolher arquivo'}
                  </button>
                  {headerArquivo && <span style={{ fontSize: 12, color: '#34d399' }}>✓ {headerArquivo}</span>}
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', margin: '8px 0 4px' }}>ou cole uma URL pública:</div>
                <input style={inp} placeholder="https://..." value={headerLink}
                  onChange={e => { setHeaderLink(e.target.value); if (e.target.value) { setHeaderMediaId(''); setHeaderArquivo('') } }} />
              </div>
            )}
            {bodyParams.map((v, i) => (
              <div key={i} style={{ marginTop: 12 }}>
                <label style={label}>Variável {`{{${i + 1}}}`} (use {'{nome}'} pra personalizar)</label>
                <input style={inp} value={v} onChange={e => setBodyParams(p => p.map((x, j) => j === i ? e.target.value : x))} />
              </div>
            ))}
            <div style={{ fontSize: 12, color: tpl.categoria === 'marketing' ? '#fbbf24' : '#34d399', marginTop: 12 }}>
              Categoria <b>{tpl.categoria}</b> — custo ~{custoUnit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mensagem
            </div>
          </>
        )}
      </div>

      {/* 3. Disparar */}
      <div style={{ ...card, padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 12 }}>3. Disparar</div>
        <label style={label}>Nome da campanha (opcional)</label>
        <input style={{ ...inp, marginBottom: 12 }} value={nomeCampanha} onChange={e => setNomeCampanha(e.target.value)} placeholder={tpl ? `Disparo ${tpl.nome}` : 'Ex: Oferta POA junho'} />

        {contatos.length > 0 && tpl && (
          <div style={{ fontSize: 13, color: '#d1d1d1', marginBottom: 12 }}>
            {contatos.length} contatos × {custoUnit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} = <b style={{ color: '#f87171' }}>{(contatos.length * custoUnit).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</b> (estimado)
          </div>
        )}

        <button onClick={disparar} disabled={rodando || !tpl || contatos.length === 0} style={{ ...btn, background: '#25D366', opacity: (rodando || !tpl || contatos.length === 0) ? 0.5 : 1 }}>
          {rodando ? `Enviando... ${progresso.feitos}/${progresso.total}` : '🚀 Disparar'}
        </button>

        {rodando && (
          <div style={{ marginTop: 12 }}>
            <div style={{ background: '#1c1c1e', borderRadius: 6, height: 10, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progresso.total ? (progresso.feitos / progresso.total * 100) : 0}%`, background: '#25D366' }} />
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>{progresso.enviados} enviados · {progresso.falhas} falhas</div>
          </div>
        )}
        {resultadoFinal && <div style={{ marginTop: 12, fontSize: 13, color: resultadoFinal.startsWith('Erro') ? '#f87171' : '#34d399' }}>{resultadoFinal}</div>}
      </div>
    </div>
  )
}
