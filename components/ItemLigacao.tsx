'use client'

import { useEffect, useState } from 'react'
import { fetchAuth } from '@/lib/api'

// UMA LIGAÇÃO no card do lead: da API4COM (discador) ou chamada pelo sistema (voz/vídeo no navegador).
// Toca a gravação (a do sistema fica num bucket privado: pede a URL assinada na hora), mostra a
// transcrição e tem o botão TRANSCREVER, que refaz quando alguém quiser. O texto vai pra
// ligacoes.metadata.transcricao, que é o que o resumo do lead, o dossiê e a IA leem.
export default function ItemLigacao({ l, onMudou }: { l: any; onMudou?: () => void }) {
  const meta: any = l.metadata || {}
  const sistema = meta.origem === 'chamada_sistema'
  const s = l.duracao || 0
  const dur = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  const transcricao: string = (meta.transcricao || '').toString().trim()
  const [url, setUrl] = useState<string | null>(sistema ? null : l.gravacao_url || null)
  const [aberta, setAberta] = useState(false)
  const [transcrevendo, setTranscrevendo] = useState(false)
  const [msg, setMsg] = useState('')

  // a URL assinada dura 1h: busca quando o item aparece
  useEffect(() => {
    if (!sistema || !l.gravacao_url) return
    let vivo = true
    fetchAuth(`/api/ligacoes/gravacao?id=${l.id}`).then(r => r.json()).then(j => { if (vivo && j?.ok) setUrl(j.url) }).catch(() => null)
    return () => { vivo = false }
  }, [l.id, sistema, l.gravacao_url])

  async function transcrever() {
    setTranscrevendo(true); setMsg('')
    try {
      const j = await fetchAuth('/api/ligacoes/transcrever', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: l.id }) }).then(r => r.json())
      if (!j.ok) setMsg(j.error || 'não consegui transcrever')
      else { setMsg(j.vazia ? 'Sem fala detectada na gravação.' : 'Transcrita. O resumo do lead já considera.'); setAberta(!j.vazia); onMudou?.() }
    } catch { setMsg('falha de rede') } finally { setTranscrevendo(false) }
  }

  return (
    <div style={{ padding: 10, background: 'var(--bg)', borderRadius: 'var(--r-sm)', fontSize: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ color: 'var(--text-2)', minWidth: 0 }}>
          {new Date(l.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
          {sistema && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: 'var(--accent-soft)', background: 'var(--accent-bg)', borderRadius: 999, padding: '1px 7px' }}>{l.direcao === 'video' ? 'chamada com vídeo' : 'chamada pelo sistema'}</span>}
        </span>
        <span style={{ color: l.status === 'encerrada' ? 'var(--green)' : 'var(--amber)', flexShrink: 0 }}>{l.status === 'encerrada' ? dur : (l.status || 'iniciada')}</span>
      </div>
      {l.gravacao_url ? (
        url ? <audio controls preload="none" src={url} style={{ width: '100%', marginTop: 6, height: 34 }} />
          : <div style={{ color: 'var(--text-faint)', fontSize: 10, marginTop: 4 }}>carregando gravação…</div>
      ) : (
        <div style={{ color: 'var(--text-faint)', fontSize: 10, marginTop: 4 }}>{l.status === 'encerrada' ? 'Sem gravação' : 'Aguardando resultado (clica ↻ após desligar)'}</div>
      )}
      {(l.gravacao_url || transcricao) && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
          {transcricao && <button onClick={() => setAberta(v => !v)} style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)', color: 'var(--text-2)', borderRadius: 6, padding: '4px 9px', fontSize: 11, cursor: 'pointer', font: 'inherit' }}>{aberta ? 'fechar transcrição' : 'ver transcrição'}</button>}
          {l.gravacao_url && <button onClick={transcrever} disabled={transcrevendo} title={transcricao ? 'Refaz a transcrição desta gravação' : 'Transcreve esta gravação e joga no histórico e no resumo do lead'}
            style={{ background: transcricao ? 'transparent' : 'var(--accent-bg)', border: '1px solid ' + (transcricao ? 'var(--border-strong)' : 'var(--accent-soft)'), color: transcricao ? 'var(--text-muted)' : 'var(--accent-soft)', borderRadius: 6, padding: '4px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer', font: 'inherit', opacity: transcrevendo ? .6 : 1 }}>
            {transcrevendo ? 'Transcrevendo…' : transcricao ? 'Transcrever de novo' : 'Transcrever'}
          </button>}
          {msg && <span style={{ fontSize: 11, color: msg.startsWith('Transcrita') ? 'var(--green)' : 'var(--text-faint)' }}>{msg}</span>}
        </div>
      )}
      {aberta && transcricao && <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55, background: 'var(--surface-2)', borderRadius: 8, padding: 10, marginTop: 8, maxHeight: 260, overflowY: 'auto' }}>{transcricao}</pre>}
    </div>
  )
}
