'use client'

import { useEffect, useState } from 'react'
import { fetchAuth } from '@/lib/api'

type TurmaOpt = { id: string; codigo: string; nome: string; inicio: string }
type Lead = {
  nome: string; fone: string; etapa: string; dono: string; carry: boolean; parado: number
  temp: string; ondeParou: string; passo: string; objec: string; tipoTarefa: string | null; vence: string | null
}
type Dados = { turma: { nome: string; codigo: string; inicio: string; preco: string; bolsa: string }; leads: Lead[] }

const ETAPA: Record<string, { lbl: string; cor: string }> = {
  aguardando_pagamento: { lbl: '💰 Aguardando pagamento', cor: '#16a34a' },
  ligacao_boa: { lbl: '🔥 Ligação boa', cor: '#dc2626' },
  oferecer_bolsa: { lbl: '🎓 Oferecer bolsa', cor: '#d97706' },
  agendado: { lbl: '📅 Agendado', cor: '#2563eb' },
  proxima_turma: { lbl: '⏭️ Próxima turma', cor: '#7c3aed' },
  lote_preco_ok: { lbl: '🏷️ Lote e preço', cor: '#0891b2' },
  atendimento_inicial: { lbl: '💬 Atendimento inicial', cor: '#64748b' },
}
// tiers de prioridade (mais perto de fechar primeiro)
const TIERS = [
  { key: 'fechar', titulo: '🎯 FECHAR — quase lá', etapas: ['aguardando_pagamento', 'ligacao_boa'], cor: '#16a34a' },
  { key: 'converter', titulo: '🔥 CONVERTER — quente', etapas: ['oferecer_bolsa', 'agendado', 'proxima_turma'], cor: '#d97706' },
  { key: 'aquecer', titulo: '🌱 AQUECER — construir', etapas: ['lote_preco_ok', 'atendimento_inicial'], cor: '#64748b' },
]
const TEMP: Record<string, { bg: string; cor: string }> = {
  quente: { bg: 'rgba(220,38,38,.15)', cor: '#dc2626' },
  morno: { bg: 'rgba(217,119,6,.15)', cor: '#d97706' },
  frio: { bg: 'rgba(100,116,139,.15)', cor: '#64748b' },
}
const ordemTemp = (t: string) => (t === 'quente' ? 0 : t === 'morno' ? 1 : t === 'frio' ? 3 : 2)

function jogada(etapa: string, d: Dados['turma']): string {
  const ini = fmtData(d.inicio)
  switch (etapa) {
    case 'aguardando_pagamento': return `Confirmar se o pagamento caiu. Se não, reenviar o link e criar urgência — a turma começa ${ini}.`
    case 'ligacao_boa': return `Já está quente: LIGAR e fechar agora, garantir a matrícula antes de ${ini}.`
    case 'oferecer_bolsa': return `Oferecer a BOLSA (${d.bolsa}) como última condição — a turma começa ${ini}.`
    case 'agendado': return `Retomar no combinado e puxar a decisão: a turma começa ${ini}, dá pra garantir a vaga?`
    case 'proxima_turma': return `🎯 A turma que ele esperava está COMEÇANDO (${ini})! Avisar na hora e converter.`
    case 'lote_preco_ok': return `Já tem o preço. Reforçar o valor e pedir o fechamento — turma começa ${ini}.`
    case 'atendimento_inicial': return `Apresentar rápido o curso + preço (${d.preco}) + urgência: turma começa ${ini}.`
    default: return `Turma começa ${ini}.`
  }
}
function fmtData(iso: string): string {
  if (!iso) return '?'
  const d = new Date(iso + 'T12:00:00')
  const dia = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][d.getDay()]
  return `${dia} ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`
}
function foneBonito(f: string) { const n = f.replace(/\D/g, '').replace(/^55/, ''); return n.length >= 10 ? `(${n.slice(0, 2)}) ${n.slice(2, -4)}-${n.slice(-4)}` : f }

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }
const pill = (bg: string, cor: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 700, color: cor, background: bg, borderRadius: 6, padding: '2px 8px', whiteSpace: 'nowrap', display: 'inline-block' })

export default function Fechamento() {
  const [turmas, setTurmas] = useState<TurmaOpt[]>([])
  const [sel, setSel] = useState('')
  const [dados, setDados] = useState<Dados | null>(null)
  const [carregando, setCarregando] = useState(false)

  useEffect(() => { fetchAuth('/api/fechamento').then(r => r.json()).then(j => { if (j.ok) setTurmas(j.turmas) }).catch(() => { }) }, [])
  useEffect(() => {
    if (!sel) { setDados(null); return }
    setCarregando(true); setDados(null)
    fetchAuth('/api/fechamento?turmaId=' + sel).then(r => r.json()).then(j => { if (j.ok) setDados({ turma: j.turma, leads: j.leads }) }).finally(() => setCarregando(false))
  }, [sel])

  const leads = dados?.leads || []

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '18px 14px 60px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>🎯 Fechamento de Turma</h1>
      <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '0 0 16px' }}>Escolha a turma e ataque as oportunidades por prioridade. Inclui leads presos em turmas antigas do mesmo produto/cidade.</p>

      <select value={sel} onChange={e => setSel(e.target.value)}
        style={{ width: '100%', padding: '11px 12px', fontSize: 15, borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text)', marginBottom: 16 }}>
        <option value="">— Selecione a turma —</option>
        {turmas.map(t => <option key={t.id} value={t.id}>{t.nome} · começa {fmtData(t.inicio)}</option>)}
      </select>

      {carregando && <p style={{ color: 'var(--text-faint)', fontSize: 14 }}>Carregando oportunidades…</p>}

      {dados && (
        <>
          <div style={{ ...card, padding: '14px 16px', marginBottom: 16, borderLeft: '4px solid var(--accent)' }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{dados.turma.nome}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>Começa <b>{fmtData(dados.turma.inicio)}</b> · {dados.turma.preco}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <span style={pill('rgba(124,58,237,.14)', 'var(--accent)')}>{leads.length} oportunidades</span>
              {TIERS.map(t => { const n = leads.filter(l => t.etapas.includes(l.etapa)).length; return n ? <span key={t.key} style={pill('var(--surface-2)', t.cor)}>{t.titulo.split(' ')[1]}: {n}</span> : null })}
              {leads.some(l => l.carry) && <span style={pill('rgba(37,99,235,.14)', '#2563eb')}>⤴ {leads.filter(l => l.carry).length} de turma antiga</span>}
            </div>
          </div>

          {leads.length === 0 && <p style={{ color: 'var(--text-faint)' }}>Nenhuma oportunidade ativa nessa turma.</p>}

          {TIERS.map(tier => {
            const grupo = leads.filter(l => tier.etapas.includes(l.etapa)).sort((a, b) => ordemTemp(a.temp) - ordemTemp(b.temp) || a.parado - b.parado)
            if (!grupo.length) return null
            return (
              <div key={tier.key} style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: tier.cor, margin: '0 0 10px', borderBottom: `2px solid ${tier.cor}33`, paddingBottom: 5 }}>{tier.titulo} · {grupo.length}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {grupo.map((l, i) => <Card key={i} l={l} turma={dados.turma} />)}
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

function Card({ l, turma }: { l: Lead; turma: Dados['turma'] }) {
  const [aberto, setAberto] = useState(false)
  const et = ETAPA[l.etapa] || { lbl: l.etapa, cor: 'var(--text-faint)' }
  const tp = TEMP[l.temp]
  const waMsg = encodeURIComponent(`Oi ${(l.nome || '').split(' ')[0]}, `)
  return (
    <div style={{ ...card, padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{l.nome} {l.carry && <span title="Preso em turma antiga — migrar" style={{ color: '#2563eb', fontSize: 12 }}>⤴</span>}</div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{foneBonito(l.fone)}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span style={pill('transparent', et.cor)}>{et.lbl}</span>
          {tp && <span style={pill(tp.bg, tp.cor)}>{l.temp}</span>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-2)', margin: '8px 0' }}>
        <span>⏳ parado {l.parado}d</span>
        {l.vence && <span>📌 tarefa vence {new Date(l.vence + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>}
        <span style={{ color: 'var(--text-faint)' }}>{l.dono === 'ia' ? '🤖 IA' : '👤 time'}</span>
      </div>

      <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '9px 11px', fontSize: 13.5, color: 'var(--text)', lineHeight: 1.45 }}>
        <b style={{ fontSize: 11, letterSpacing: '.03em', color: 'var(--accent)' }}>O QUE TENTAR</b><br />
        {jogada(l.etapa, turma)}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <a href={`https://wa.me/${l.fone}?text=${waMsg}`} target="_blank" rel="noreferrer"
          style={{ flex: 1, textAlign: 'center', background: '#25D366', color: '#053d1c', fontWeight: 700, fontSize: 13, padding: '8px', borderRadius: 8, textDecoration: 'none' }}>💬 WhatsApp</a>
        <a href={`tel:+${l.fone}`}
          style={{ flex: 1, textAlign: 'center', background: 'var(--surface-2)', color: 'var(--text)', fontWeight: 700, fontSize: 13, padding: '8px', borderRadius: 8, textDecoration: 'none', border: '1px solid var(--border)' }}>📞 Ligar</a>
        {(l.ondeParou || l.passo || l.objec) && (
          <button onClick={() => setAberto(a => !a)} style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, padding: '8px 12px', cursor: 'pointer' }}>{aberto ? '▲' : '📋'}</button>
        )}
      </div>

      {aberto && (
        <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {l.ondeParou && <div><b style={{ color: 'var(--text)' }}>Onde parou:</b> {l.ondeParou}</div>}
          {l.objec && l.objec !== 'nenhuma' && <div><b style={{ color: 'var(--text)' }}>Objeções:</b> {l.objec}</div>}
          {l.passo && <div><b style={{ color: 'var(--text)' }}>Leitura da IA:</b> {l.passo}</div>}
        </div>
      )}
    </div>
  )
}
