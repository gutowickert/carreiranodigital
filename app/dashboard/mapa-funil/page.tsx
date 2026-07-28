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
  ligacao_boa: { nome: 'Ligação Boa', emoji: '🔥' },
}
const IA = 'var(--accent-soft)', TIME = '#2b8a3e', FRIO = '#8b5cf6', ENG = '#2b8a3e', RED = '#e0533d'

export default function MapaFunil() {
  const [d, setD] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)
  useEffect(() => { (async () => { const j = await fetchAuth('/api/mapa-funil').then(r => r.json()).catch(() => null); if (j?.ok) setD(j); setCarregando(false) })() }, [])

  if (carregando) return <div style={{ padding: 40, color: 'var(--text-faint)' }}>Carregando o mapa...</div>
  if (!d) return <div style={{ padding: 40, color: 'var(--text-faint)' }}>Não consegui carregar.</div>

  const maxTot = Math.max(1, ...d.etapas.map((e: any) => e.tot))

  const KPI = ({ label, valor, cor, sub }: any) => (
    <div style={{ ...card, padding: 16, flex: 1, minWidth: 150 }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: cor || 'var(--text)', lineHeight: 1 }}>{valor}</div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginTop: 6 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 3, lineHeight: 1.3 }}>{sub}</div>}
    </div>
  )
  // barra empilhada genérica: [{n, cor, titulo}]
  const Barra = ({ partes, tot, largura }: any) => (
    <div style={{ display: 'flex', height: 20, borderRadius: 5, overflow: 'hidden', width: largura, minWidth: 70, background: 'var(--surface-2)' }}>
      {partes.filter((p: any) => p.n > 0).map((p: any, i: number) => (
        <div key={i} title={p.titulo} style={{ width: `${(p.n / tot) * 100}%`, background: p.cor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 700, color: '#fff' }}>{p.n}</div>
      ))}
    </div>
  )
  const Chip = ({ cor, txt }: any) => <span style={{ fontSize: 11, color: 'var(--text-faint)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 9, height: 9, background: cor, borderRadius: 2, display: 'inline-block' }} />{txt}</span>

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1060, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', margin: 0 }}>🗺️ Mapa do funil</h1>
      <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 20px' }}>Onde estão os {d.total} leads ativos, quem cuida, e o que realmente precisa de mão do time.</p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <KPI label="Leads ativos" valor={d.total} sub="em etapa ativa (fora de ganho/perda)" />
        <KPI label="🤖 IA cuida" valor={d.totalIA} cor={IA} sub="follow-up automático pela cadência — não precisa de tarefa" />
        <KPI label="👥 Time cuida" valor={d.totalTime} cor={TIME} sub="respondeu recente, agendado, pagamento, chegada, Ligação Boa" />
        <KPI label="⚠️ Time sem tarefa" valor={d.paradosTime} cor={RED} sub="do time E sem próximo passo — os PARADOS de verdade" />
        <KPI label="@lid inválido" valor={d.lid} cor="var(--amber)" sub="sem número real — inalcançável" />
      </div>
      <div style={{ ...card, padding: '10px 14px', marginBottom: 24, fontSize: 12, color: 'var(--text-2)', background: 'var(--surface-2)' }}>
        💡 Lead da <b style={{ color: IA }}>IA</b> sem tarefa <b>não é "parado"</b> — a cadência cuida sozinha. Por isso o "parado" que importa é só o <b style={{ color: RED }}>⚠️ Time sem tarefa ({d.paradosTime})</b>.
      </div>

      <h2 style={{ fontSize: 13, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '0 0 12px' }}>Por etapa</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {d.etapas.map((e: any) => {
          const lab = LABEL[e.etapa] || { nome: e.etapa, emoji: '•' }
          const larg = `${Math.max(20, (e.tot / maxTot) * 100)}%`
          return (
            <div key={e.etapa} style={{ ...card, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{lab.emoji} {lab.nome} <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>· {e.tot}</span></div>
                <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>
                  🤖 {e.ia} <span style={{ opacity: .5 }}>/</span> 👥 {e.humano}
                  {e.paradoTime > 0 && <span style={{ color: RED }}> · ⚠️ {e.paradoTime} parado(s)</span>}
                  {e.lid > 0 && <span style={{ color: 'var(--amber)' }}> · {e.lid} @lid</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>Dono</div>
                  <Barra tot={e.tot} largura={larg} partes={[{ n: e.ia, cor: IA, titulo: `${e.ia} na IA (cadência)` }, { n: e.humano, cor: TIME, titulo: `${e.humano} com o time` }]} />
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>Engajamento</div>
                  <Barra tot={e.tot} largura={larg} partes={[{ n: e.frio, cor: FRIO, titulo: `${e.frio} frios (nunca responderam)` }, { n: e.engaj, cor: ENG, titulo: `${e.engaj} engajados` }]} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ ...card, padding: 16, marginTop: 20, fontSize: 12.5, color: 'var(--text-2)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontWeight: 700, color: 'var(--text)' }}>Como ler</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Chip cor={IA} txt="🤖 IA — cadência automática" />
          <Chip cor={TIME} txt="👥 Time — atende quem responde" />
          <Chip cor={FRIO} txt="frio — nunca respondeu" />
          <Chip cor={ENG} txt="engajado — respondeu / atendeu ligação" />
          <Chip cor={RED} txt="⚠️ parado — time, sem tarefa" />
        </div>
        <div style={{ color: 'var(--text-faint)', lineHeight: 1.5 }}>Cada etapa tem 2 barras: <b>Dono</b> (quem cuida) e <b>Engajamento</b> (respondeu ou não). Passe o mouse pra ver os números. A <b style={{ color: '#f59e0b' }}>🔥 Ligação Boa</b> é onde o time guarda quem vai fechar — a IA não toca.</div>
      </div>
    </div>
  )
}
