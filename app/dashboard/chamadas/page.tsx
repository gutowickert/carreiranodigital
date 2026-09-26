'use client'

import { useEffect, useState } from 'react'
import { fetchAuth } from '@/lib/api'
import { BuscarLead, type LeadAchado } from '@/components/BuscarLead'

// CHAMADAS: criar o link, mandar pro lead, entrar, e depois ouvir e ler a transcrição.
// A conversa cai sozinha no histórico do lead (ligacoes), que a IA e o dossiê já leem.

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }
const btn: React.CSSProperties = { border: 'none', borderRadius: 8, padding: '8px 13px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const inp: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '7px 9px', fontSize: 13, color: 'var(--text)', width: '100%' }
const br = (d?: string | null) => d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
const dur = (s?: number | null) => s == null ? '—' : s >= 60 ? `${Math.floor(s / 60)}min${s % 60 ? ` ${s % 60}s` : ''}` : `${s}s`
const STATUS: Record<string, [string, string]> = { aguardando: ['Aguardando', 'var(--text-faint)'], em_andamento: ['Em andamento', 'var(--green)'], encerrada: ['Fechando e transcrevendo…', 'var(--amber)'], transcrita: ['Concluída', 'var(--text-2)'], erro: ['Erro', 'var(--red)'] }

export default function Chamadas() {
  const [lista, setLista] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)
  const [nova, setNova] = useState(false)
  const [lead, setLead] = useState<LeadAchado | null>(null)
  const [semLead, setSemLead] = useState({ nome: '', telefone: '' })
  const [comVideo, setComVideo] = useState(false)
  const [criada, setCriada] = useState<any>(null)
  const [aberta, setAberta] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  async function carregar() {
    setCarregando(true)
    const j = await fetchAuth('/api/chamadas').then(r => r.json()).catch(() => null)
    if (j?.ok) setLista(j.chamadas || [])
    setCarregando(false)
  }
  useEffect(() => { carregar() }, [])
  // enquanto tem chamada em andamento ou transcrevendo, atualiza sozinho
  useEffect(() => { if (!lista.some(c => ['em_andamento', 'encerrada'].includes(c.status))) return; const t = setInterval(carregar, 15000); return () => clearInterval(t) }, [lista])

  async function criar() {
    const corpo: any = { com_video: comVideo }
    if (lead) corpo.lead_id = lead.id
    else { if (!semLead.nome) { setMsg('Diz com quem é a chamada (escolhe um lead ou escreve o nome).'); return } corpo.lead_nome = semLead.nome; corpo.telefone = semLead.telefone }
    const j = await fetchAuth('/api/chamadas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }).then(r => r.json()).catch(() => null)
    if (!j?.ok) { setMsg(j?.error || 'não consegui criar'); return }
    setCriada({ ...j, nome: lead?.nome || semLead.nome, telefone: (lead as any)?.whatsapp || semLead.telefone }); setMsg('')
    carregar()
  }
  const copiar = (t: string) => { navigator.clipboard?.writeText(t); setMsg('Link copiado.'); setTimeout(() => setMsg(''), 1500) }
  const zap = (tel: string | null, link: string, nome: string) => `https://wa.me/${(tel || '').replace(/\D/g, '')}?text=${encodeURIComponent(`Oi${nome ? ', ' + nome.split(' ')[0] : ''}! Vamos conversar por aqui, é só abrir o link e clicar em Entrar na chamada: ${link}`)}`

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Chamadas</h1>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 0' }}>Voz ou vídeo pelo navegador, sem app. Tu manda o link, o lead clica, e a conversa gravada e transcrita cai no histórico dele.</p>
        </div>
        <button onClick={() => { setNova(true); setCriada(null); setLead(null) }} style={{ ...btn, background: 'var(--accent)', color: '#fff' }}>+ Nova chamada</button>
      </div>

      {nova && (
        <div style={{ ...card, padding: 18, marginTop: 16 }}>
          {!criada ? (
            <>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>Com quem?</div>
              <div style={{ marginTop: 8 }}>
                {lead ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--text)' }}><b>{lead.nome}</b>{(lead as any).whatsapp && <span style={{ color: 'var(--text-faint)' }}>{(lead as any).whatsapp}</span>}<button onClick={() => setLead(null)} style={{ ...btn, background: 'none', color: 'var(--text-faint)', padding: '2px 6px', fontWeight: 400 }}>trocar</button></div>
                ) : <BuscarLead onEscolher={setLead} autoFoco />}
              </div>
              {!lead && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                  <input style={inp} placeholder="ou o nome de quem não é lead" value={semLead.nome} onChange={e => setSemLead({ ...semLead, nome: e.target.value })} />
                  <input style={inp} placeholder="WhatsApp (pra mandar o link)" value={semLead.telefone} onChange={e => setSemLead({ ...semLead, telefone: e.target.value })} />
                </div>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13.5, color: 'var(--text-2)', cursor: 'pointer' }}><input type="checkbox" checked={comVideo} onChange={e => setComVideo(e.target.checked)} /> Sugerir vídeo (os dois podem ligar a câmera ao entrar)</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }}>
                <button onClick={criar} style={{ ...btn, background: 'var(--green)', color: '#fff' }}>Criar o link</button>
                <button onClick={() => setNova(false)} style={{ ...btn, background: 'var(--surface-2)', color: 'var(--text-2)' }}>Cancelar</button>
                {msg && <span style={{ fontSize: 12.5, color: 'var(--amber)' }}>{msg}</span>}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Chamada com {criada.nome} criada.</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6, lineHeight: 1.6 }}>1. Manda o link pro lead. 2. Entra na tua ponta. Quando os dois estiverem dentro, conecta sozinho.</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <a href={zap(criada.telefone, criada.link_lead, criada.nome)} target="_blank" rel="noopener" style={{ ...btn, background: 'var(--green)', color: '#fff', textDecoration: 'none' }}>Mandar no WhatsApp</a>
                <button onClick={() => copiar(criada.link_lead)} style={{ ...btn, background: 'var(--surface-2)', color: 'var(--text-2)' }}>Copiar link do lead</button>
                <a href={criada.link_host} target="_blank" rel="noopener" style={{ ...btn, background: 'var(--accent)', color: '#fff', textDecoration: 'none' }}>Entrar na chamada</a>
                {msg && <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{msg}</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 10, wordBreak: 'break-all' }}>{criada.link_lead}</div>
            </>
          )}
        </div>
      )}

      <div style={{ ...card, marginTop: 16, overflow: 'hidden' }}>
        {carregando && !lista.length ? <div style={{ padding: 18, color: 'var(--text-faint)', fontSize: 13 }}>Carregando…</div>
          : !lista.length ? <div style={{ padding: 18, color: 'var(--text-faint)', fontSize: 13 }}>Nenhuma chamada ainda. Cria a primeira ali em cima.</div>
          : lista.map((c, i) => {
            const [rot, cor] = STATUS[c.status] || [c.status, 'var(--text-faint)']
            const abertaEssa = aberta === c.id
            return (
              <div key={c.id} style={{ borderTop: i ? '1px solid var(--border)' : 'none', padding: '12px 16px' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)' }}>{c.lead_nome || 'sem nome'} <span style={{ fontSize: 12, fontWeight: 600, color: cor, marginLeft: 6 }}>{rot}</span></div>
                    <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{br(c.iniciada_em || c.criado_em)} · {c.criado_por_nome}{c.duracao_seg != null ? ` · ${dur(c.duracao_seg)}` : ''}{c.com_video ? ' · vídeo' : ''}{c.erro ? ` · ${c.erro}` : ''}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {['aguardando', 'em_andamento'].includes(c.status) && <>
                      <a href={zap(c.telefone, c.link_lead, c.lead_nome || '')} target="_blank" rel="noopener" style={{ ...btn, background: 'var(--surface-2)', color: 'var(--text-2)', textDecoration: 'none' }}>WhatsApp</a>
                      <button onClick={() => copiar(c.link_lead)} style={{ ...btn, background: 'var(--surface-2)', color: 'var(--text-2)' }}>copiar link</button>
                      <a href={c.link_host} target="_blank" rel="noopener" style={{ ...btn, background: 'var(--accent)', color: '#fff', textDecoration: 'none' }}>Entrar</a>
                    </>}
                    {c.gravacao_url && <a href={c.gravacao_url} target="_blank" rel="noopener" style={{ ...btn, background: 'var(--surface-2)', color: 'var(--text-2)', textDecoration: 'none' }}>ouvir</a>}
                    {c.status === 'transcrita' && !c.transcricao && c.pedacos > 0 && <span style={{ fontSize: 12, color: 'var(--text-faint)', alignSelf: 'center' }}>sem fala detectada</span>}
                    {c.transcricao && <button onClick={() => setAberta(abertaEssa ? null : c.id)} style={{ ...btn, background: 'var(--surface-2)', color: 'var(--text-2)' }}>{abertaEssa ? 'fechar' : 'transcrição'}</button>}
                    {c.lead_id && <a href={`/dashboard/leads?lead=${c.lead_id}`} style={{ ...btn, background: 'none', color: 'var(--text-faint)', textDecoration: 'none', fontWeight: 400 }}>lead</a>}
                  </div>
                </div>
                {abertaEssa && c.transcricao && <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, background: 'var(--surface-2)', borderRadius: 8, padding: 12, marginTop: 10, maxHeight: 420, overflowY: 'auto' }}>{c.transcricao}</pre>}
              </div>
            )
          })}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 10, lineHeight: 1.6 }}>A gravação é feita no navegador de quem convida, os dois lados juntos, e sobe a cada 30 segundos: se a aba cair, o que já passou está salvo. Só voz é gravada, mesmo com vídeo. Avise a pessoa que a conversa é gravada.</p>
    </div>
  )
}
