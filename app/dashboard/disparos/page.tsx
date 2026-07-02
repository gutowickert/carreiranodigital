'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' } as React.CSSProperties
const inp = { backgroundColor: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', color: 'var(--text)', outline: 'none', width: '100%' } as React.CSSProperties
const btn = { backgroundColor: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: '8px', padding: '10px 18px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' } as React.CSSProperties
const label = { display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 } as React.CSSProperties

type Tpl = { nome: string; idioma: string; categoria: string; variaveis: number; header: string | null; corpo: string }
type Contato = { telefone: string; nome: string; lead_id?: string }

export default function Disparos() {
  const [turmas, setTurmas] = useState<any[]>([])
  const [templates, setTemplates] = useState<Tpl[]>([])
  const [modo, setModo] = useState<'turma' | 'colar' | 'lista' | 'naoentregues'>('turma')
  const [turmaId, setTurmaId] = useState('')
  const [turmaEtapa, setTurmaEtapa] = useState('') // '' = todas; 'perda' = só perdidos; 'ganho' = só ganhos
  const [numerosTexto, setNumerosTexto] = useState('')
  // redisparo: campanhas anteriores p/ pegar os não-entregues
  const [campanhas, setCampanhas] = useState<any[]>([])
  const [campanhaId, setCampanhaId] = useState('')
  // listas frias (wa_contatos)
  const [cidades, setCidades] = useState<{ cidade: string; interessado: number; comprador: number; total: number }[]>([])
  const [listaCategoria, setListaCategoria] = useState<'interessado' | 'comprador'>('interessado')
  const [listaCidade, setListaCidade] = useState('') // '' = todas
  const [descontarCampId, setDescontarCampId] = useState('') // reenvio inteligente: descontar quem já recebeu nessa campanha
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
    // Limites do WhatsApp por tipo de mídia do template (senão dá "Media upload error" e não entrega)
    const limitesMB: Record<string, number> = { image: 5, video: 16, document: 100 }
    const limMB = limitesMB[tpl?.header || ''] || 16
    const tamMB = file.size / 1048576
    if (tamMB > limMB) {
      alert(`Arquivo muito grande: ${tamMB.toFixed(1)} MB.\nO WhatsApp aceita ${tpl?.header || 'mídia'} de até ${limMB} MB no template.\nComprime o arquivo e tente de novo.`)
      return
    }
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
    // campanhas anteriores (pro redisparo dos não-entregues)
    fetch('/api/wa-oficial/relatorio').then(r => r.json()).then(j => { if (j.ok) setCampanhas(j.campanhas || []) })
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
        let q = supabase.from('leads').select('id, nome, whatsapp').eq('turma_id', turmaId).not('whatsapp', 'is', null)
        if (turmaEtapa) q = q.eq('etapa', turmaEtapa)
        const { data } = await q
        setContatos((data || []).filter((l: any) => l.whatsapp).map((l: any) => ({ telefone: l.whatsapp, nome: l.nome || '', lead_id: l.id })))
      } else if (modo === 'lista') {
        const p = new URLSearchParams({ categoria: listaCategoria, limit: '5000' })
        if (listaCidade) p.set('cidade', listaCidade)
        const j = await fetch('/api/wa-oficial/contatos?' + p.toString()).then(r => r.json())
        // exclui quem já é opt-out na própria lista (o disparo ainda checa wa_optout)
        let cs = (j.contatos || []).filter((c: any) => c.status !== 'optout').map((c: any) => ({ telefone: c.telefone, nome: c.nome || '' }))
        // reenvio inteligente: desconta quem JÁ recebeu (entregue/lido) numa campanha anterior
        if (descontarCampId) {
          const jr = await fetch('/api/wa-oficial/relatorio?recebidos=' + encodeURIComponent(descontarCampId)).then(r => r.json())
          const suf = (t: string) => (t || '').replace(/\D/g, '').slice(-8)
          const jaRecebeu = new Set<string>((jr.telefones || []).map((t: string) => suf(t)))
          cs = cs.filter((c: any) => !jaRecebeu.has(suf(c.telefone)))
        }
        setContatos(cs)
      } else if (modo === 'naoentregues') {
        if (!campanhaId) { setCarregandoPublico(false); return }
        const j = await fetch('/api/wa-oficial/relatorio?naoEntregues=' + encodeURIComponent(campanhaId)).then(r => r.json())
        setContatos((j.contatos || []).map((c: any) => ({ telefone: c.telefone, nome: c.nome || '' })))
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
      <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>Disparos</h1>
      <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '0 0 24px' }}>Envio em massa pela API Oficial do WhatsApp (templates aprovados).</p>

      {/* 1. Público */}
      <div style={{ ...card, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>1. Público</div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}><input type="radio" checked={modo === 'turma'} onChange={() => setModo('turma')} /> Leads por turma</label>
          <label style={{ fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}><input type="radio" checked={modo === 'lista'} onChange={() => setModo('lista')} /> Listas (frias)</label>
          <label style={{ fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}><input type="radio" checked={modo === 'naoentregues'} onChange={() => setModo('naoentregues')} /> Não-entregues</label>
          <label style={{ fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}><input type="radio" checked={modo === 'colar'} onChange={() => setModo('colar')} /> Colar números</label>
        </div>
        {modo === 'turma' && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <select style={inp} value={turmaId} onChange={e => setTurmaId(e.target.value)}>
              <option value="">Selecione a turma...</option>
              {turmas.map(t => <option key={t.id} value={t.id}>{t.produtos?.nome} — {t.cidades?.nome} ({t.codigo})</option>)}
            </select>
            <select style={{ ...inp, width: 'auto' }} value={turmaEtapa} onChange={e => setTurmaEtapa(e.target.value)}>
              <option value="">Todas as etapas</option>
              <option value="perda">Só perdidos</option>
              <option value="ganho">Só ganhos</option>
            </select>
          </div>
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
            <div style={{ flexBasis: '100%' }}>
              <label style={label}>Reenvio inteligente — descontar quem já recebeu em (opcional)</label>
              <select style={inp} value={descontarCampId} onChange={e => setDescontarCampId(e.target.value)}>
                <option value="">Não descontar (manda pra lista toda)</option>
                {campanhas.map(c => {
                  const d = c.criado_em ? new Date(c.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
                  return <option key={c.id} value={c.id}>{c.nome} · {d} · {c.entregues} já receberam</option>
                })}
              </select>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 6 }}>Tira da lista quem já recebeu (entregue/lido) nessa campanha — pra completar um disparo que travou no meio, sem mandar 2x pra ninguém.</div>
            </div>
          </div>
        )}
        {modo === 'naoentregues' && (
          <div>
            <label style={label}>Campanha (pega quem ficou em &quot;enviado&quot; e não respondeu)</label>
            <select style={inp} value={campanhaId} onChange={e => setCampanhaId(e.target.value)}>
              <option value="">Selecione a campanha...</option>
              {campanhas.map(c => {
                const d = c.criado_em ? new Date(c.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
                return <option key={c.id} value={c.id}>{c.nome} · {d} · {c.enviados} env / {c.entregues} entr</option>
              })}
            </select>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 6 }}>Carrega os contatos que o WhatsApp aceitou mas não entregou. Quem já recebeu, leu ou respondeu fica de fora.</div>
          </div>
        )}
        {modo === 'colar' && (
          <textarea style={{ ...inp, minHeight: 90 }} placeholder="Um número por linha (com DDD)" value={numerosTexto} onChange={e => setNumerosTexto(e.target.value)} />
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <button onClick={carregarPublico} disabled={carregandoPublico} style={{ ...btn, background: 'var(--surface-2)' }}>{carregandoPublico ? '...' : 'Carregar público'}</button>
          {contatos.length > 0 && <span style={{ fontSize: 13, color: 'var(--green)' }}>{contatos.length} contato(s) carregado(s)</span>}
        </div>
      </div>

      {/* 2. Mensagem */}
      <div style={{ ...card, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>2. Mensagem (template)</div>
        <label style={label}>Template aprovado</label>
        <select style={inp} value={tplNome} onChange={e => setTplNome(e.target.value)}>
          <option value="">Selecione...</option>
          {templates.map(t => <option key={t.nome + t.idioma} value={t.nome}>{t.nome} · {t.categoria} · {t.idioma}{t.header ? ` · ${t.header}` : ''}</option>)}
        </select>

        {tpl && (
          <>
            {tpl.corpo && <div style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg)', borderRadius: 8, padding: 10, marginTop: 10, whiteSpace: 'pre-wrap' }}>{tpl.corpo}</div>}
            {headerMidia && (
              <div style={{ marginTop: 12 }}>
                <label style={label}>Mídia do topo ({tpl.header})</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input ref={headerFileRef} type="file" style={{ display: 'none' }}
                    accept={tpl.header === 'image' ? 'image/*' : tpl.header === 'video' ? 'video/*' : 'application/pdf,.pdf,.doc,.docx,.xls,.xlsx'}
                    onChange={e => { const f = e.target.files?.[0]; if (f) subirHeaderMidia(f); e.target.value = '' }} />
                  <button type="button" onClick={() => headerFileRef.current?.click()} disabled={subindoMidia}
                    style={{ ...btn, background: 'var(--surface-2)', opacity: subindoMidia ? 0.6 : 1 }}>
                    {subindoMidia ? 'Enviando...' : '📎 Escolher arquivo'}
                  </button>
                  {headerArquivo && <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ {headerArquivo}</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', margin: '8px 0 4px' }}>ou cole uma URL pública:</div>
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
            <div style={{ fontSize: 12, color: tpl.categoria === 'marketing' ? 'var(--amber)' : 'var(--green)', marginTop: 12 }}>
              Categoria <b>{tpl.categoria}</b> — custo ~{custoUnit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mensagem
            </div>
          </>
        )}
      </div>

      {/* 3. Disparar */}
      <div style={{ ...card, padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>3. Disparar</div>
        <label style={label}>Nome da campanha (opcional)</label>
        <input style={{ ...inp, marginBottom: 12 }} value={nomeCampanha} onChange={e => setNomeCampanha(e.target.value)} placeholder={tpl ? `Disparo ${tpl.nome}` : 'Ex: Oferta POA junho'} />

        {contatos.length > 0 && tpl && (
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>
            {contatos.length} contatos × {custoUnit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} = <b style={{ color: 'var(--red)' }}>{(contatos.length * custoUnit).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</b> (estimado)
          </div>
        )}

        <button onClick={disparar} disabled={rodando || !tpl || contatos.length === 0} style={{ ...btn, background: '#25D366', opacity: (rodando || !tpl || contatos.length === 0) ? 0.5 : 1 }}>
          {rodando ? `Enviando... ${progresso.feitos}/${progresso.total}` : '🚀 Disparar'}
        </button>

        {rodando && (
          <div style={{ marginTop: 12 }}>
            <div style={{ background: 'var(--bg)', borderRadius: 6, height: 10, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progresso.total ? (progresso.feitos / progresso.total * 100) : 0}%`, background: '#25D366' }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{progresso.enviados} enviados · {progresso.falhas} falhas</div>
          </div>
        )}
        {resultadoFinal && <div style={{ marginTop: 12, fontSize: 13, color: resultadoFinal.startsWith('Erro') ? 'var(--red)' : 'var(--green)' }}>{resultadoFinal}</div>}
      </div>
    </div>
  )
}
