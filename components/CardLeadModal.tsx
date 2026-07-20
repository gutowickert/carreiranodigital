'use client'

import { useEffect, useState } from 'react'
import { fetchAuth } from '@/lib/api'

const inp: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: 'var(--text)', outline: 'none', width: '100%' }
const btn: React.CSSProperties = { background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }

// Card do lead como MODAL (abre por cima, não sai da tela). Andamentos + registro de ligação.
export default function CardLeadModal({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const [d, setD] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)
  const [nota, setNota] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [mostrarLig, setMostrarLig] = useState(false)
  const [lig, setLig] = useState<any>({ entendeu: false, explicou: false, passouPreco: false, preco: '', loteprazo: '', situacao: '', proximo: '' })

  async function carregar() {
    const j = await fetchAuth('/api/lead/andamentos?leadId=' + leadId).then(r => r.json()).catch(() => null)
    if (j?.ok) setD(j)
    setCarregando(false)
  }
  useEffect(() => { carregar() }, [leadId])

  async function addNota(observacao: string, tipo = 'observacao') {
    if (!observacao.trim()) return
    setSalvando(true)
    await fetchAuth('/api/lead/andamentos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId, observacao, tipo }) }).then(r => r.json()).catch(() => ({}))
    setSalvando(false)
    setNota(''); carregar()
  }
  async function registrarLigacao() {
    const p: string[] = []
    if (lig.entendeu) p.push('entendi o negócio dela')
    if (lig.explicou) p.push('expliquei o curso')
    if (lig.passouPreco) p.push('passei o preço' + (lig.preco ? ` (R$${lig.preco})` : ''))
    if (lig.loteprazo.trim()) p.push('lote acaba em ' + lig.loteprazo.trim())
    if (lig.situacao.trim()) p.push('situação: ' + lig.situacao.trim())
    if (lig.proximo.trim()) p.push('próximo passo: ' + lig.proximo.trim())
    if (!p.length) return
    await addNota('📞 ' + p.join(' · '), 'ligacao')
    setLig({ entendeu: false, explicou: false, passouPreco: false, preco: '', loteprazo: '', situacao: '', proximo: '' })
    setMostrarLig(false)
  }

  const lead = d?.lead
  const chegou = lead?.criado_em ? Math.floor((Date.now() - +new Date(lead.criado_em)) / 864e5) : null

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 200, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '5vh 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 560, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{lead?.nome || (carregando ? 'Carregando…' : '(sem nome)')}</div>
            {lead && <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{lead.etapa} · {lead.whatsapp || '—'}{chegou != null ? ` · chegou há ${chegou}d` : ''}{lead.codigo_turma ? ` · ${lead.codigo_turma}` : ''}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href={`/dashboard/crm?lead=${leadId}`} style={{ fontSize: 12, color: 'var(--text-faint)', textDecoration: 'none', alignSelf: 'center' }}>abrir no CRM ↗</a>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text-faint)', cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* Registro estruturado de ligação */}
        <div style={{ marginTop: 16 }}>
          {!mostrarLig
            ? <button onClick={() => setMostrarLig(true)} style={{ ...btn, background: 'var(--accent-bg)', color: 'var(--accent-soft)' }}>📞 Registrar ligação/atendimento</button>
            : (
              <div style={{ background: 'var(--bg)', border: '1px solid var(--accent-soft)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>O que rolou na ligação?</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: 'var(--text-2)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}><input type="checkbox" checked={lig.entendeu} onChange={e => setLig({ ...lig, entendeu: e.target.checked })} /> Entendi o negócio dela</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}><input type="checkbox" checked={lig.explicou} onChange={e => setLig({ ...lig, explicou: e.target.checked })} /> Expliquei o curso</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={lig.passouPreco} onChange={e => setLig({ ...lig, passouPreco: e.target.checked })} /> Passei o preço
                    {lig.passouPreco && <input style={{ ...inp, width: 100, marginLeft: 4 }} placeholder="R$ valor" value={lig.preco} onChange={e => setLig({ ...lig, preco: e.target.value })} />}
                  </label>
                  <input style={inp} placeholder="Prazo do lote (ex: 3 dias)" value={lig.loteprazo} onChange={e => setLig({ ...lig, loteprazo: e.target.value })} />
                  <input style={inp} placeholder="Situação / objeção (ex: vai pensar)" value={lig.situacao} onChange={e => setLig({ ...lig, situacao: e.target.value })} />
                  <input style={inp} placeholder="Próximo passo (ex: retornar quinta 14h)" value={lig.proximo} onChange={e => setLig({ ...lig, proximo: e.target.value })} />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button onClick={registrarLigacao} disabled={salvando} style={btn}>Registrar</button>
                  <button onClick={() => setMostrarLig(false)} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 12, cursor: 'pointer' }}>cancelar</button>
                </div>
              </div>
            )}
        </div>

        {/* Nota rápida */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input style={inp} placeholder="Anotação rápida…" value={nota} onChange={e => setNota(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addNota(nota) }} />
          <button onClick={() => addNota(nota)} disabled={salvando || !nota.trim()} style={btn}>+</button>
        </div>

        {/* Histórico */}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '16px 0 8px' }}>Andamentos</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
          {carregando ? <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Carregando…</div>
            : (d?.andamentos || []).length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Nenhum andamento ainda.</div>
              : d.andamentos.map((a: any, i: number) => (
                <div key={i} style={{ padding: 10, background: 'var(--bg)', borderRadius: 6, fontSize: 12 }}>
                  <div style={{ color: 'var(--text-2)' }}>{a.etapa_nova ? `${a.etapa_anterior || '?'} → ${a.etapa_nova}. ` : ''}{a.observacao}</div>
                  <div style={{ color: 'var(--text-faint)', fontSize: 10, marginTop: 4 }}>{a.tipo && a.tipo !== 'observacao' && <span style={{ color: 'var(--accent-soft)', marginRight: 6 }}>[{a.tipo}]</span>}{new Date(a.criado_em).toLocaleString('pt-BR')}</div>
                </div>
              ))}
        </div>
      </div>
    </div>
  )
}
