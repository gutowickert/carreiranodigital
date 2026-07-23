'use client'

import { useEffect, useState } from 'react'
import { fetchAuth } from '@/lib/api'

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }
const ETAPA_LABEL: Record<string, string> = {
  aguardando_atendimento: '📞 Ligação / Chegada (D1)',
  atendimento_inicial: '💬 Atendimento inicial (D2–D3)',
  lote_preco_ok: '🔥 Lote e preço ok (virada do lote)',
  oferecer_bolsa: '🎁 Oferecer bolsa (D11–D13)',
}
const ETAPA_ORDEM = ['aguardando_atendimento', 'atendimento_inicial', 'lote_preco_ok', 'oferecer_bolsa']
const PROD: Record<string, { label: string; cor: string }> = {
  anl: { label: 'ANL', cor: 'var(--blue)' }, fc: { label: 'FC', cor: 'var(--accent-soft)' }, ambos: { label: 'ambos', cor: 'var(--text-muted)' },
}
const STATUS: Record<string, { label: string; cor: string; bg: string }> = {
  rascunho: { label: 'Rascunho', cor: 'var(--amber)', bg: 'var(--amber-bg)' },
  submetido: { label: 'Enviado ao Meta', cor: 'var(--blue)', bg: 'var(--blue-bg)' },
  aprovado: { label: 'Aprovado ✓', cor: 'var(--green)', bg: 'var(--green-bg)' },
}

function TemplateCard({ t, onSalvo }: { t: any; onSalvo: () => void }) {
  const [corpo, setCorpo] = useState(t.corpo || '')
  const [nome, setNome] = useState(t.nome_meta || '')
  const [status, setStatus] = useState(t.status || 'rascunho')
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')
  const mudou = corpo !== t.corpo || nome !== t.nome_meta || status !== t.status
  const prod = PROD[t.produto] || PROD.ambos
  const vars = (t.variaveis || '').split(',').filter(Boolean)

  async function salvar() {
    setSalvando(true); setMsg('')
    const r = await fetchAuth('/api/followup-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id, corpo, nome_meta: nome, status }) }).then(r => r.json()).catch(() => null)
    setSalvando(false)
    if (r?.ok) { setMsg('salvo ✓'); onSalvo() } else setMsg('falha')
  }

  return (
    <div style={{ ...card, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <input value={nome} onChange={e => setNome(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: 'var(--text)', background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 6, padding: '4px 8px', minWidth: 200 }} />
        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, color: prod.cor, background: 'var(--surface-2)', border: `1px solid ${prod.cor}` }}>{prod.label}</span>
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t.categoria === 'marketing' ? '📣 marketing' : '🔧 utilidade'}</span>
        {t.tipo_janela === 'template' ? null : <span style={{ fontSize: 11, color: 'var(--green)' }}>⏱ livre (24h)</span>}
        <select value={status} onChange={e => setStatus(e.target.value)} style={{ marginLeft: 'auto', fontSize: 11, background: (STATUS[status] || STATUS.rascunho).bg, color: (STATUS[status] || STATUS.rascunho).cor, border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}>
          <option value="rascunho">Rascunho</option>
          <option value="submetido">Enviado ao Meta</option>
          <option value="aprovado">Aprovado</option>
        </select>
      </div>
      <textarea value={corpo} onChange={e => setCorpo(e.target.value)} style={{ width: '100%', minHeight: 92, background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: 10, fontSize: 13, color: 'var(--text)', outline: 'none', resize: 'vertical', lineHeight: 1.5 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        {vars.length > 0 && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>variáveis: {vars.map((v: string) => <code key={v} style={{ background: 'var(--surface-2)', padding: '1px 5px', borderRadius: 4, marginRight: 4 }}>{`{{${v}}}`}</code>)}</span>}
        {msg && <span style={{ fontSize: 12, color: msg.includes('✓') ? 'var(--green)' : 'var(--red)' }}>{msg}</span>}
        <button onClick={salvar} disabled={!mudou || salvando} style={{ marginLeft: 'auto', background: mudou ? 'var(--accent)' : 'var(--surface-2)', color: mudou ? 'var(--on-accent)' : 'var(--text-faint)', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 700, cursor: mudou ? 'pointer' : 'default' }}>{salvando ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </div>
  )
}

export default function FollowupTemplates() {
  const [templates, setTemplates] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)
  const [submetendo, setSubmetendo] = useState(false)
  const [resultado, setResultado] = useState<any>(null)

  async function carregar() {
    setCarregando(true)
    const j = await fetchAuth('/api/followup-templates').then(r => r.json()).catch(() => null)
    if (j?.ok) setTemplates(j.templates || [])
    setCarregando(false)
  }
  useEffect(() => { carregar() }, [])

  async function submeterMeta() {
    if (!confirm('Submeter todos os templates pendentes ao Meta agora? Eles vão pra aprovação.')) return
    setSubmetendo(true); setResultado(null)
    const j = await fetchAuth('/api/wa-oficial/criar-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.json()).catch(() => null)
    setSubmetendo(false); setResultado(j)
    carregar()
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 }}>📝 Templates de Follow-up</h1>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 0' }}>As mensagens de reabertura da cadência do CRM, na WhatsApp API oficial. Edite aqui e submeta ao Meta com 1 clique.</p>
        </div>
        <button onClick={submeterMeta} disabled={submetendo} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: submetendo ? 0.6 : 1 }}>{submetendo ? 'Submetendo…' : '🚀 Criar todos no Meta'}</button>
      </div>
      {resultado && (
        <div style={{ ...card, padding: 12, marginTop: 12 }}>
          {resultado.ok
            ? <div style={{ fontSize: 13, color: 'var(--text-2)' }}>✅ {resultado.criados}/{resultado.total} enviados ao Meta.{(resultado.resultados || []).filter((r: any) => !r.ok).length > 0 && <span style={{ color: 'var(--red)' }}> Falhas: {(resultado.resultados || []).filter((r: any) => !r.ok).map((r: any) => `${r.nome} (${r.erro})`).join('; ')}</span>}</div>
            : <div style={{ fontSize: 13, color: 'var(--red)' }}>Falha: {resultado.error || '?'}</div>}
        </div>
      )}

      <div style={{ ...card, padding: 14, marginTop: 16, background: 'var(--blue-bg)', border: '1px solid var(--blue)' }}>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
          <b>Como funciona:</b> template só é preciso pra <b>reabrir</b> conversa fria (silêncio de +24h). <b>Dentro de 24h</b> da última mensagem do lead, a IA responde livre (texto e áudio, personalizado). O <b>áudio do D1</b> (lead do botão) vai livre — só vira template pra lista fria. Ligações continuam no celular.
        </div>
      </div>

      {carregando ? <div style={{ color: 'var(--text-faint)', padding: 40 }}>Carregando…</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, marginTop: 20 }}>
          {ETAPA_ORDEM.filter(et => templates.some(t => t.etapa === et)).map(et => (
            <div key={et}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', marginBottom: 10 }}>{ETAPA_LABEL[et] || et}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {templates.filter(t => t.etapa === et).map(t => <TemplateCard key={t.id} t={t} onSalvo={carregar} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
