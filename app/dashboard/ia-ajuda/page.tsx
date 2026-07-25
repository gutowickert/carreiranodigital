'use client'

import { useEffect, useState } from 'react'
import { fetchAuth } from '@/lib/api'

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }

function haQuanto(iso: string) {
  const min = Math.floor((Date.now() - +new Date(iso)) / 60000)
  if (min < 60) return `há ${min}min`
  const h = Math.floor(min / 60); if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}

export default function IAAjuda() {
  const [d, setD] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)
  const [aviso, setAviso] = useState('')

  useEffect(() => { carregar() }, [])
  async function carregar() {
    setCarregando(true)
    const j = await fetchAuth('/api/ia/ajuda').then(r => r.json()).catch(() => null)
    if (j?.ok) setD(j)
    setCarregando(false)
  }
  async function resolver(leadId: string) {
    const j = await fetchAuth('/api/ia/ajuda', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lead_id: leadId, acao: 'resolver' }) }).then(r => r.json())
    setAviso(j.ok ? '✅ Handoff resolvido' : `⚠️ ${j.error}`)
    setTimeout(() => setAviso(''), 2500)
    if (j.ok) carregar()
  }

  return (
    <div style={{ padding: '32px 40px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', margin: 0 }}>🙋 IA pediu ajuda</h1>
        {aviso && <span style={{ fontSize: 13, color: 'var(--green)' }}>{aviso}</span>}
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 20px' }}>
        Atendimentos que a IA <b>escalou pro time</b> — objeção que ela não resolveu, pedido de humano ou dúvida. Assuma pela caixa de entrada e marque como resolvido.
      </p>

      {carregando ? <div style={{ color: 'var(--text-faint)' }}>Carregando...</div> :
        (d?.fila || []).length === 0 ? (
          <div style={{ ...card, padding: 40, textAlign: 'center' }}>
            <p style={{ fontSize: 15, color: 'var(--text-faint)', margin: 0 }}>Nenhum pedido de ajuda pendente. 🎉 A IA está dando conta.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(d.fila || []).map((a: any) => (
              <div key={a.lead_id} style={{ ...card, padding: 16, borderLeft: '4px solid var(--amber)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  <div>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{a.nome}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-faint)', marginLeft: 8 }}>{a.etapa} · {a.turma || 'sem turma'}</span>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{a.desde ? haQuanto(a.desde) : ''}</span>
                </div>

                <div style={{ fontSize: 13, color: 'var(--amber)', background: 'rgba(180,83,9,.1)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
                  <b>Motivo:</b> {a.motivo}
                </div>

                {a.resumo?.ondeParou && (
                  <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 10 }}><b>Onde parou:</b> {a.resumo.ondeParou}{a.resumo.proximoPasso ? <> · <b>Próximo passo:</b> {a.resumo.proximoPasso}</> : null}</div>
                )}

                <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 10, maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                  {(a.mensagens || []).length === 0 ? <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Sem mensagens.</span> :
                    a.mensagens.map((m: any, i: number) => m.quem === 'evento' ? (
                      <div key={i} style={{ alignSelf: 'center', maxWidth: '92%', fontSize: 11.5, padding: '3px 10px', borderRadius: 20, background: 'var(--surface-2)', color: 'var(--text-faint)', border: '1px dashed var(--border)' }}>{m.texto}</div>
                    ) : (
                      <div key={i} style={{ alignSelf: m.quem === 'cliente' ? 'flex-start' : 'flex-end', maxWidth: '85%', fontSize: 13, padding: '6px 10px', borderRadius: 8, background: m.quem === 'cliente' ? 'var(--surface)' : 'var(--accent)', color: m.quem === 'cliente' ? 'var(--text)' : 'var(--on-accent)', border: m.quem === 'cliente' ? '1px solid var(--border)' : 'none' }}>{m.texto}</div>
                    ))}
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <a href={`/dashboard/whatsapp?lead=${a.lead_id}`} style={{ fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', textDecoration: 'none' }}>Atender no WhatsApp →</a>
                  <a href={`/dashboard/crm?lead=${a.lead_id}`} style={{ fontSize: 13, padding: '8px 12px', color: 'var(--accent-soft)', alignSelf: 'center' }}>abrir no CRM</a>
                  <button onClick={() => resolver(a.lead_id)} style={{ fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8, border: '1px solid var(--green)', background: 'transparent', color: 'var(--green)', cursor: 'pointer', marginLeft: 'auto' }}>Time assumiu ✓</button>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}
