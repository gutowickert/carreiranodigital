'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const PERMITIDOS = ['guto.wickert@gmail.com', 'debairros@hotmail.com', 'ricardovognach@hotmail.com', 'tizonmidia@gmail.com']
const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }
const STATUS: Record<string, { label: string; cor: string }> = {
  ok: { label: '✅ OK', cor: 'var(--green)' },
  corrigir: { label: '⚠️ Corrigir', cor: 'var(--amber)' },
  assumir: { label: '✋ Assumir (humano)', cor: 'var(--red)' },
}

export default function QualidadeIA() {
  const [email, setEmail] = useState('')
  const [bloqueado, setBloqueado] = useState<boolean | null>(null)
  const [d, setD] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)
  const [rasc, setRasc] = useState<Record<string, { nota?: number; status?: string; comentario?: string }>>({})
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const e = (session?.user?.email || '').toLowerCase()
      setEmail(e); setBloqueado(!PERMITIDOS.includes(e))
      if (PERMITIDOS.includes(e)) carregar(e)
    })()
  }, [])

  async function carregar(e = email) {
    setCarregando(true)
    const j = await fetch(`/api/qualidade-ia?email=${encodeURIComponent(e)}`).then(r => r.json()).catch(() => null)
    if (j?.ok) setD(j)
    setCarregando(false)
  }

  async function revisar(leadId: string) {
    const r = rasc[leadId] || {}
    if (!r.status) { setAviso('Escolha OK / Corrigir / Assumir'); return }
    const j = await fetch('/api/qualidade-ia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, lead_id: leadId, nota: r.nota, status: r.status, comentario: r.comentario }) }).then(r => r.json())
    setAviso(j.ok ? '💾 Revisão salva!' : `⚠️ ${j.error}`)
    setTimeout(() => setAviso(''), 3000)
    if (j.ok) { setRasc(x => ({ ...x, [leadId]: {} })); carregar() }
  }
  const setR = (id: string, patch: any) => setRasc(x => ({ ...x, [id]: { ...x[id], ...patch } }))

  if (bloqueado === null) return <div style={{ padding: 40, color: 'var(--text-faint)' }}>Carregando...</div>
  if (bloqueado) return <div style={{ padding: 40 }}><h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>Qualidade IA</h1><p style={{ fontSize: 14, color: 'var(--text-faint)', marginTop: 8 }}>Área restrita.</p></div>

  const m = d?.metrics
  const KPI = ({ label, valor, cor }: any) => (
    <div style={{ ...card, padding: 14 }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: cor || 'var(--text)' }}>{valor}</div>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>{label}</div>
    </div>
  )

  return (
    <div style={{ padding: '32px 40px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', margin: 0 }}>🔎 Qualidade IA</h1>
        {aviso && <span style={{ fontSize: 13, color: 'var(--green)' }}>{aviso}</span>}
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 20px' }}>Revisão dos atendimentos conduzidos pela IA. Dê nota, marque OK/Corrigir/Assumir e comente. (Nando + Guto + Rick)</p>

      {m && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 24 }}>
          <KPI label="Na fila (IA)" valor={m.na_fila} cor="var(--accent-soft)" />
          <KPI label="Revisados" valor={m.revisados} />
          <KPI label="Nota média" valor={m.nota_media || '—'} cor="var(--accent-soft)" />
          <KPI label="OK" valor={m.ok} cor="var(--green)" />
          <KPI label="Corrigir" valor={m.corrigir} cor="var(--amber)" />
          <KPI label="Assumir" valor={m.assumir} cor="var(--red)" />
        </div>
      )}

      {carregando ? <div style={{ color: 'var(--text-faint)' }}>Carregando...</div> : (d?.atendimentos || []).length === 0 ? (
        <div style={{ ...card, padding: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: 'var(--text-2)', fontWeight: 500 }}>Nenhum atendimento da IA na fila.</div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 6 }}>Quando a IA assumir um lead (marcado como <b>atendido por IA</b>), ele aparece aqui pra revisão. Pra testar agora, peça ao Agente Interno: "marca o lead Fulano como atendido pela IA".</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {(d.atendimentos || []).map((a: any) => {
            const r = rasc[a.lead_id] || {}
            return (
              <div key={a.lead_id} style={{ ...card, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  <div>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{a.nome}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-faint)', marginLeft: 8 }}>{a.etapa} · {a.turma || 'sem turma'}</span>
                  </div>
                  <a href={`/dashboard/crm?lead=${a.lead_id}`} style={{ fontSize: 12, color: 'var(--accent-soft)' }}>abrir no CRM ↗</a>
                </div>

                {/* conversa */}
                <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 10, maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                  {a.mensagens.length === 0 ? <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Sem mensagens.</span> :
                    a.mensagens.map((msg: any, i: number) => (
                      <div key={i} style={{ alignSelf: msg.quem === 'cliente' ? 'flex-start' : 'flex-end', maxWidth: '85%', fontSize: 13, padding: '6px 10px', borderRadius: 8, background: msg.quem === 'cliente' ? 'var(--surface)' : 'var(--accent)', color: msg.quem === 'cliente' ? 'var(--text)' : 'var(--on-accent)', border: msg.quem === 'cliente' ? '1px solid var(--border)' : 'none' }}>{msg.texto}</div>
                    ))}
                </div>

                {a.revisao && (
                  <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 8 }}>Última revisão: <b style={{ color: STATUS[a.revisao.status]?.cor }}>{STATUS[a.revisao.status]?.label}</b>{a.revisao.nota ? ` · nota ${a.revisao.nota}` : ''}{a.revisao.comentario ? ` · "${a.revisao.comentario}"` : ''}</div>
                )}

                {/* form */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nota:</span>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => setR(a.lead_id, { nota: n })} style={{ width: 28, height: 28, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--border-strong)', background: r.nota === n ? 'var(--accent)' : 'var(--surface-2)', color: r.nota === n ? 'var(--on-accent)' : 'var(--text-2)', fontWeight: 700 }}>{n}</button>
                  ))}
                  <span style={{ width: 12 }} />
                  {['ok', 'corrigir', 'assumir'].map(s => (
                    <button key={s} onClick={() => setR(a.lead_id, { status: s })} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 6, cursor: 'pointer', border: `1px solid ${r.status === s ? STATUS[s].cor : 'var(--border-strong)'}`, background: r.status === s ? STATUS[s].cor : 'transparent', color: r.status === s ? '#fff' : 'var(--text-2)', fontWeight: 600 }}>{STATUS[s].label}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input value={r.comentario || ''} onChange={e => setR(a.lead_id, { comentario: e.target.value })} placeholder="Comentário (opcional)"
                    style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text)', outline: 'none' }} />
                  <button onClick={() => revisar(a.lead_id)} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 8, padding: '0 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Salvar</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
