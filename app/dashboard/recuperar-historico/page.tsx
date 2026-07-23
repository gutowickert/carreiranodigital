'use client'

import { useState } from 'react'
import { fetchAuth } from '@/lib/api'

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }

export default function RecuperarHistorico() {
  const [dias, setDias] = useState(5)
  const [rodando, setRodando] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [tot, setTot] = useState({ conv: 0, msgs: 0, leads: 0, vinc: 0 })

  async function rodar() {
    if (!confirm(`Recuperar o histórico dos últimos ${dias} dias do WhatsApp reconectado? Vai puxar as conversas do aparelho, gravar no sistema (sem duplicar) e criar leads pros contatos novos.`)) return
    setRodando(true); setLog([]); setTot({ conv: 0, msgs: 0, leads: 0, vinc: 0 })
    let page = 1, seguir = true
    const acc = { conv: 0, msgs: 0, leads: 0, vinc: 0 }
    while (seguir && page <= 40) {
      const j = await fetchAuth('/api/wa/sincronizar-historico', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dias, page, pageSize: 20 }) }).then(r => r.json()).catch(() => null)
      if (!j?.ok) { setLog(l => [...l, `❌ Página ${page}: ${j?.error || 'falha'}`]); break }
      acc.conv += j.convProcessadas; acc.msgs += j.msgsNovas; acc.leads += j.leadsCriados; acc.vinc += j.leadsVinculados
      setTot({ ...acc })
      setLog(l => [...l, `Página ${page}: ${j.convProcessadas} conversas · ${j.msgsNovas} mensagens novas · ${j.leadsCriados} leads criados`])
      seguir = !!j.temMais
      page++
    }
    setLog(l => [...l, '✅ Recuperação concluída.'])
    setRodando(false)
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 }}>🔄 Recuperar histórico do WhatsApp</h1>
      <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 0' }}>Puxa do aparelho as conversas que chegaram enquanto o WhatsApp esteve desconectado (ban) e traz pro sistema — grava mensagens (sem duplicar) e cria leads pros contatos novos.</p>

      <div style={{ ...card, padding: 16, marginTop: 18, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, color: 'var(--text-2)' }}>Últimos
          <input type="number" min={1} max={30} value={dias} onChange={e => setDias(Math.min(30, Math.max(1, Number(e.target.value) || 5)))} style={{ width: 60, margin: '0 8px', background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '6px 8px', fontSize: 14, color: 'var(--text)', textAlign: 'center' }} />
          dias
        </label>
        <button onClick={rodar} disabled={rodando} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: rodando ? 0.6 : 1 }}>{rodando ? 'Recuperando…' : '🔄 Recuperar agora'}</button>
      </div>

      {(tot.conv > 0 || tot.msgs > 0 || rodando) && (
        <div style={{ ...card, padding: 16, marginTop: 16 }}>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{tot.conv}</div><div style={{ fontSize: 12, color: 'var(--text-faint)' }}>conversas</div></div>
            <div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-soft)' }}>{tot.msgs}</div><div style={{ fontSize: 12, color: 'var(--text-faint)' }}>mensagens novas</div></div>
            <div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>{tot.leads}</div><div style={{ fontSize: 12, color: 'var(--text-faint)' }}>leads criados</div></div>
            <div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--blue)' }}>{tot.vinc}</div><div style={{ fontSize: 12, color: 'var(--text-faint)' }}>conversas vinculadas</div></div>
          </div>
          <div style={{ marginTop: 12, maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {log.map((l, i) => <div key={i} style={{ fontSize: 12, color: 'var(--text-2)' }}>{l}</div>)}
          </div>
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 14, lineHeight: 1.6 }}>
        Obs.: a Z-API traz o histórico recente que o aparelho ainda guarda (não é ilimitado). As respostas que o time deu direto no celular também entram como mensagens “nossas”. Roda de novo se precisar — não duplica.
      </div>
    </div>
  )
}
