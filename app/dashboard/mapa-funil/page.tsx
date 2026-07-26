'use client'

import { useEffect, useState } from 'react'
import { fetchAuth } from '@/lib/api'

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }
const LABEL: Record<string, { nome: string; emoji: string }> = {
  aguardando_atendimento: { nome: 'Ligação (chegada)', emoji: '📞' },
  atendimento_inicial: { nome: 'Atendimento inicial', emoji: '💬' },
  lote_preco_ok: { nome: 'Lote e preço ok', emoji: '🏷️' },
  oferecer_bolsa: { nome: 'Oferecer bolsa', emoji: '🎓' },
  proxima_turma: { nome: 'Próxima turma', emoji: '⏭️' },
  agendado: { nome: 'Agendado', emoji: '📅' },
  aguardando_pagamento: { nome: 'Aguardando pagamento', emoji: '💰' },
}

export default function MapaFunil() {
  const [d, setD] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)
  useEffect(() => { (async () => { const j = await fetchAuth('/api/mapa-funil').then(r => r.json()).catch(() => null); if (j?.ok) setD(j); setCarregando(false) })() }, [])

  if (carregando) return <div style={{ padding: 40, color: 'var(--text-faint)' }}>Carregando o mapa...</div>
  if (!d) return <div style={{ padding: 40, color: 'var(--text-faint)' }}>Não consegui carregar.</div>

  const maxTot = Math.max(1, ...d.etapas.map((e: any) => e.tot))
  const KPI = ({ label, valor, cor }: any) => (
    <div style={{ ...card, padding: 14, flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: cor || 'var(--text)' }}>{valor}</div>
      <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{label}</div>
    </div>
  )
  const Seg = ({ n, tot, cor, titulo }: any) => n > 0 ? <div title={titulo} style={{ width: `${(n / tot) * 100}%`, background: cor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>{n}</div> : null

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1040, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', margin: 0 }}>🗺️ Mapa do funil</h1>
      <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 20px' }}>Onde estão os {d.total} leads ativos, quem cuida e os buracos — pra entender o fluxo.</p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <KPI label="Leads ativos" valor={d.total} />
        <KPI label="🤖 IA cuida (cadência)" valor={d.totalIA} cor="var(--accent-soft)" />
        <KPI label="👥 Time cuida" valor={d.totalTime} cor="#2b8a3e" />
        <KPI label="Sem tarefa (parados)" valor={d.semTarefa} cor="#e0533d" />
        <KPI label="@lid (nº inválido)" valor={d.lid} cor="var(--amber)" />
      </div>

      <h2 style={{ fontSize: 13, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '0 0 12px' }}>Por etapa</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {d.etapas.map((e: any) => {
          const lab = LABEL[e.etapa] || { nome: e.etapa, emoji: '•' }
          return (
            <div key={e.etapa} style={{ ...card, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{lab.emoji} {lab.nome}</div>
                <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>
                  <b style={{ color: 'var(--text)' }}>{e.tot}</b> · 🤖 {e.iaCuida} / 👥 {e.timeCuida}
                  {e.semtarefa > 0 && <span style={{ color: '#e0533d' }}> · {e.semtarefa} sem tarefa</span>}
                  {e.lid > 0 && <span style={{ color: 'var(--amber)' }}> · {e.lid} @lid</span>}
                </div>
              </div>
              {/* barra: engajado vs frio */}
              <div style={{ display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden', width: `${Math.max(12, (e.tot / maxTot) * 100)}%`, minWidth: 60 }}>
                <Seg n={e.frio} tot={e.tot} cor="var(--accent)" titulo={`${e.frio} frios (nunca responderam)`} />
                <Seg n={e.engaj} tot={e.tot} cor="#2b8a3e" titulo={`${e.engaj} engajados (responderam/atenderam ligação)`} />
              </div>
              <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 11, color: 'var(--text-faint)' }}>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--accent)', borderRadius: 2, marginRight: 4 }} />{e.frio} frio</span>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#2b8a3e', borderRadius: 2, marginRight: 4 }} />{e.engaj} engajado</span>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ ...card, padding: 16, marginTop: 20, fontSize: 13, color: 'var(--text-2)' }}>
        <b>Legenda:</b> <b style={{ color: 'var(--accent-soft)' }}>🤖 IA cuida</b> = frios do atendimento + tudo de lote/bolsa (cadência automática). <b style={{ color: '#2b8a3e' }}>👥 Time</b> = chegada, engajados do atendimento, próxima turma, agendado e pagamento. <b style={{ color: '#e0533d' }}>Sem tarefa</b> = lead parado, sem próximo passo definido.
      </div>
    </div>
  )
}
