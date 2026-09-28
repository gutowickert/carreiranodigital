'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchAuth } from '@/lib/api'

// A IA DO FIM DE SEMANA — a revisão. Em modo SOMBRA ela não envia nada: esta tela mostra, conversa
// por conversa, o que o lead escreveu, o que ela teria respondido e a ligação que teria marcado.
// É daqui que sai a decisão de ligar de verdade (lib/ia-fds.ts).

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }
const TZ = 'America/Sao_Paulo'
const quando = (s: string) => new Date(s).toLocaleString('pt-BR', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace('.', '')
const dataBR = (iso: string) => iso ? iso.split('-').reverse().slice(0, 2).join('/') : ''

const ACAO: Record<string, [string, string]> = {
  marcar: ['Marcaria a ligação', 'var(--green)'],
  oferecer: ['Ofereceria os horários', 'var(--accent)'],
  whatsapp: ['Deixaria pro time no WhatsApp', 'var(--amber)'],
  ajuda: ['Pediria ajuda ao time', 'var(--red)'],
  lembrar: ['Lembraria a ligação marcada', 'var(--accent)'],
  nada: ['Não responderia', 'var(--text-faint)'],
  fora: ['Fora: é cliente/aluno', 'var(--text-faint)'],
  erro: ['Erro', 'var(--red)'],
}

export default function IaFimDeSemana() {
  const [d, setD] = useState<any>(null)
  const [aviso, setAviso] = useState('')

  async function carregar() {
    const j = await fetchAuth('/api/ia-fds').then(r => r.json()).catch(() => null)
    if (j?.ok) setD(j); else setAviso(j?.error || 'não carregou')
  }
  useEffect(() => { carregar() }, [])

  async function modo(m: string) {
    const j = await fetchAuth('/api/ia-fds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modo: m }) }).then(r => r.json()).catch(() => null)
    setAviso(j?.ok ? (m === 'sombra' ? 'IA do fim de semana em modo sombra ✓' : 'IA do fim de semana desligada ✓') : j?.error || 'não deu'); carregar()
  }

  if (!d) return <div style={{ padding: 32, color: 'var(--text-faint)' }}>{aviso || 'Carregando…'}</div>

  // agrupa por fim de semana (a segunda que fecha a janela)
  const grupos = new Map<string, any[]>()
  for (const r of d.registros) { const k = r.segunda || r.em.slice(0, 10); grupos.set(k, [...(grupos.get(k) || []), r]) }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 20px 48px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>IA do fim de semana</h1>
      <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: '6px 0 0', maxWidth: 720 }}>
        De <b>sexta 17h</b> até <b>segunda 5h</b>, ela responde quem escreve com um único objetivo: <b>marcar a ligação de segunda</b>. Não fala preço, não manda link, não negocia.
      </p>

      <div style={{ ...card, marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 800, padding: '4px 10px', borderRadius: 99, background: d.config.modo === 'sombra' ? 'var(--amber-bg)' : 'var(--surface-2)', color: d.config.modo === 'sombra' ? 'var(--amber)' : 'var(--text-muted)' }}>
          {d.config.modo === 'sombra' ? '◐ MODO SOMBRA' : d.config.modo === 'desligado' ? '○ DESLIGADA' : '● LIGADA'}
        </span>
        <span style={{ fontSize: 13, color: 'var(--text-2)', flex: 1, minWidth: 240 }}>
          {d.config.modo === 'sombra' ? 'Ela escreve o que responderia, mas não envia nada e não cria tarefa. Tu revisa aqui.' : 'Ela não faz nada.'}
          {' '}Horários de segunda: {d.config.horarios.join(', ')} · até {d.config.limite} por horário.
          {d.agoraNaJanela && <b style={{ color: 'var(--green)' }}> · na janela agora</b>}
        </span>
        {d.config.modo === 'sombra'
          ? <button onClick={() => modo('desligado')} style={{ background: 'none', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '6px 12px', color: 'var(--text-2)', cursor: 'pointer', fontSize: 12.5 }}>Desligar</button>
          : <button onClick={() => modo('sombra')} style={{ background: 'none', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '6px 12px', color: 'var(--text-2)', cursor: 'pointer', fontSize: 12.5 }}>Ligar em sombra</button>}
      </div>
      {aviso && <div style={{ ...card, marginTop: 10, padding: '9px 12px', fontSize: 13 }}>{aviso}</div>}

      {!d.registros.length && <div style={{ ...card, marginTop: 16, fontSize: 13.5, color: 'var(--text-muted)' }}>Nada ainda. O primeiro fim de semana começa sexta às 17h.</div>}

      {[...grupos.entries()].map(([seg, rs]) => {
        const conta = (a: string) => rs.filter(r => r.acao === a).length
        const leads = new Set(rs.map(r => r.lead_id)).size
        return (
          <section key={seg} style={{ marginTop: 22 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Fim de semana até segunda {dataBR(seg)}</h2>
              <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{leads} leads · {conta('marcar')} ligações marcadas · {conta('whatsapp')} pro WhatsApp · {conta('ajuda')} pedidos de ajuda · {conta('fora')} clientes/alunos</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              {rs.map((r: any) => {
                const [rot, cor] = ACAO[r.acao] || [r.acao, 'var(--text-muted)']
                return (
                  <div key={r.id} style={{ ...card, padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 14 }}>
                        <b>{r.lead_nome || r.telefone}</b> <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>· {quando(r.em)}</span>
                        {r.lead_id && <Link href={`/dashboard/crm?lead=${r.lead_id}`} style={{ fontSize: 12, marginLeft: 8, color: 'var(--accent)', textDecoration: 'none' }}>abrir o lead</Link>}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 800, color: cor }}>{rot}{r.acao === 'marcar' && r.horario ? ` · seg ${r.horario} com ${r.consultor}` : ''}</span>
                    </div>
                    {r.entrada?.length > 0 && (
                      <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-2)' }}>
                        {r.entrada.map((t: string, i: number) => <div key={i} style={{ padding: '4px 0' }}>💬 {t}</div>)}
                      </div>
                    )}
                    {r.resposta && (
                      <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 10, background: 'var(--accent-bg)', fontSize: 13.5, whiteSpace: 'pre-wrap' }}>
                        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', color: 'var(--accent)', display: 'block', marginBottom: 3 }}>{d.config.modo === 'sombra' || r.modo === 'sombra' ? 'TERIA RESPONDIDO' : 'RESPONDEU'}</span>
                        {r.resposta}
                      </div>
                    )}
                    {r.motivo && <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-faint)' }}>por quê: {r.motivo}</div>}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
