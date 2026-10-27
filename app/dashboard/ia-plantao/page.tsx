'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchAuth } from '@/lib/api'

// O PLANTÃO DA IA — a tela (lib/ia-plantao.ts). Em cima o interruptor; depois os avisos que esperam
// alguém do time (o mesmo número do balão vermelho do menu), os leads em que a IA está parada e, por
// último, o registro de tudo que ela fez (ou, em sombra, teria feito).

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }
const botao: React.CSSProperties = { background: 'none', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '6px 12px', color: 'var(--text-2)', cursor: 'pointer', fontSize: 12.5 }
const TZ = 'America/Sao_Paulo'
const quando = (s: string) => new Date(s).toLocaleString('pt-BR', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace('.', '')
const diaDe = (s: string) => new Date(s).toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'long', day: '2-digit', month: '2-digit' })
// o campo de data e hora do navegador não tem fuso: o que se digita é hora de Brasília
const paraCampo = (iso?: string | null) => iso ? new Date(new Date(iso).getTime() - 3 * 36e5).toISOString().slice(0, 16) : ''
const doCampo = (v: string) => v ? new Date(v + ':00-03:00').toISOString() : null

const MODO: Record<string, [string, string, string]> = {
  desligado: ['○ DESLIGADO', 'var(--surface-2)', 'var(--text-muted)'],
  sombra: ['◐ SOMBRA', 'var(--amber-bg)', 'var(--amber)'],
  ligado: ['● LIGADO', 'var(--green-bg, var(--accent-bg))', 'var(--green)'],
}

const AVISO: Record<string, [string, string]> = {
  plantao_diretor: ['Pediu algo pro "diretor"', 'var(--red)'],
  plantao_ligacao: ['Quer ligação', 'var(--accent)'],
  plantao_proposta: ['Proposta enviada', 'var(--accent)'],
  plantao_aceite: ['Aceitou a proposta', 'var(--green)'],
  plantao_outro_produto: ['Outro assunto', 'var(--amber)'],
  plantao_ajuda: ['Precisa do time', 'var(--red)'],
  plantao_falha: ['A IA não conseguiu responder', 'var(--red)'],
}

const ACAO: Record<string, [string, string]> = {
  conversar: ['Conversou', 'var(--text-2)'],
  proposta: ['Mandou proposta', 'var(--accent)'],
  link: ['Mandou o link de pagamento', 'var(--green)'],
  link_especial: ['Mandou a condição especial', 'var(--green)'],
  ligacao: ['Marcou ligação pra volta', 'var(--accent)'],
  diretor: ['Levou pro "diretor"', 'var(--red)'],
  chamar_time: ['Chamou o time e parou', 'var(--red)'],
  outro_produto: ['Outro assunto: parou', 'var(--amber)'],
  cutucada: ['Retomada (sem resposta há 20h)', 'var(--text-2)'],
}
const EVENTO: Record<string, [string, string]> = {
  robo: ['Resposta automática de outra empresa: ignorou', 'var(--text-faint)'],
  nao_responder: ['Não tinha o que responder', 'var(--text-faint)'],
  pausado: ['Lead pausado: não respondeu', 'var(--text-faint)'],
  aluno: ['Aluno: não respondeu (time avisado)', 'var(--amber)'],
  limite: ['Passou do limite do dia', 'var(--red)'],
  bloqueado: ['Bloqueado pelas travas', 'var(--red)'],
  erro: ['Erro', 'var(--red)'],
  envio: ['O WhatsApp recusou', 'var(--red)'],
  aceite: ['Cliente aceitou a proposta', 'var(--green)'],
  resumo: ['Resumo pro time', 'var(--text-muted)'],
  interruptor: ['Interruptor', 'var(--text-muted)'],
}

export default function PlantaoDaIA() {
  const [d, setD] = useState<any>(null)
  const [aviso, setAviso] = useState('')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [filtro, setFiltro] = useState<'tudo' | 'respostas'>('respostas')

  async function carregar() {
    const j = await fetchAuth('/api/ia-plantao').then(r => r.json()).catch(() => null)
    if (j?.ok) { setD(j); setDe(paraCampo(j.config.de)); setAte(paraCampo(j.config.ate)) } else setAviso(j?.error || 'não carregou')
  }
  useEffect(() => { carregar(); const t = setInterval(carregar, 60_000); return () => clearInterval(t) }, [])

  async function post(corpo: any, ok: string) {
    const j = await fetchAuth('/api/ia-plantao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }).then(r => r.json()).catch(() => null)
    setAviso(j?.ok ? ok : j?.error || 'não deu'); carregar()
  }
  const mudarModo = (modo: string) => {
    if (modo === 'ligado' && !confirm('Ligar o plantão? A IA passa a RESPONDER os leads de verdade, mandar proposta e link de pagamento.')) return
    post({ modo, de: doCampo(de), ate: doCampo(ate) }, modo === 'ligado' ? 'Plantão LIGADO ✓' : modo === 'sombra' ? 'Plantão em sombra ✓ (escreve e não manda)' : 'Plantão desligado ✓')
  }

  if (!d) return <div style={{ padding: 32, color: 'var(--text-faint)' }}>{aviso || 'Carregando…'}</div>

  const [rot, fundo, cor] = MODO[d.modoAgora] || MODO.desligado
  const foraDaJanela = d.config.modo !== 'desligado' && d.modoAgora === 'desligado'
  const regs = d.registros.filter((r: any) => filtro === 'tudo' || !['robo', 'nao_responder', 'pausado', 'interruptor', 'resumo'].includes(r.evento))
  const grupos = new Map<string, any[]>()
  for (const r of regs) { const k = diaDe(r.em); grupos.set(k, [...(grupos.get(k) || []), r]) }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 20px 48px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Plantão da IA</h1>
      <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: '6px 0 0', maxWidth: 760 }}>
        Com o time fora, ela atende o WhatsApp do <b>Deu Venda</b> e da <b>Imersão Deu Venda</b> no jeito das ligações: entende o negócio, explica, passa o preço do link, manda proposta e link de pagamento.
        Desconto e qualquer coisa fora do link vão pro <b>"diretor"</b> (vocês). Quem pede ligação fica na fila pra <b>{diaDe(d.volta)}, 9h</b>. Quando alguém do time manda mensagem pra um lead, ela para naquele lead.
      </p>

      <div style={{ ...card, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 800, padding: '4px 10px', borderRadius: 99, background: fundo, color: cor }}>{rot}</span>
          <span style={{ fontSize: 13, color: 'var(--text-2)', flex: 1, minWidth: 240 }}>
            {d.modoAgora === 'sombra' && 'Ela lê cada mensagem e escreve o que responderia, mas não manda nada, não mexe no lead e não grava proposta. Tu revisa aqui embaixo.'}
            {d.modoAgora === 'ligado' && 'Ela está respondendo os leads de verdade.'}
            {d.modoAgora === 'desligado' && (foraDaJanela ? `Está em ${d.config.modo}, mas fora da janela de datas: não faz nada agora.` : 'Ela não faz nada.')}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Começa (opcional)<br />
            <input type="datetime-local" value={de} onChange={e => setDe(e.target.value)} disabled={!d.souAdmin} style={{ marginTop: 4, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text)' }} />
          </label>
          <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Termina (opcional)<br />
            <input type="datetime-local" value={ate} onChange={e => setAte(e.target.value)} disabled={!d.souAdmin} style={{ marginTop: 4, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text)' }} />
          </label>
          {d.souAdmin ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => mudarModo('desligado')} style={botao}>Desligar</button>
              <button onClick={() => mudarModo('sombra')} style={botao}>Sombra</button>
              <button onClick={() => mudarModo('ligado')} style={{ ...botao, borderColor: 'var(--green)', color: 'var(--green)', fontWeight: 700 }}>Ligar de verdade</button>
            </div>
          ) : <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Só admin liga e desliga.</span>}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 8 }}>
          Fora da janela de datas ela se desliga sozinha. {d.config.mudou_por ? `Última mudança: ${d.config.mudou_por}, ${quando(d.config.mudou_em)}.` : ''} Modelo: {d.modelo}.
        </div>
      </div>
      {aviso && <div style={{ ...card, marginTop: 10, padding: '9px 12px', fontSize: 13 }}>{aviso}</div>}

      <h2 style={{ fontSize: 16, fontWeight: 800, margin: '24px 0 0' }}>Esperando alguém do time {d.avisos.length > 0 && <span style={{ color: 'var(--red)' }}>({d.avisos.length})</span>}</h2>
      {!d.avisos.length && <div style={{ ...card, marginTop: 10, fontSize: 13.5, color: 'var(--text-muted)' }}>Nenhum aviso aberto.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
        {d.avisos.map((a: any) => {
          const [r, c] = AVISO[a.tipo] || [a.tipo, 'var(--text-muted)']
          const pausado = d.pausados.some((p: any) => p.lead_id === a.lead_id)
          return (
            <div key={a.id} style={{ ...card, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 14 }}>
                  <b>{a.leads?.nome || 'Lead'}</b> <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>· {quando(a.criado_em)}</span>
                  <Link href={`/dashboard/crm?lead=${a.lead_id}`} style={{ fontSize: 12, marginLeft: 8, color: 'var(--accent)', textDecoration: 'none' }}>abrir o lead</Link>
                </div>
                <span style={{ fontSize: 12, fontWeight: 800, color: c }}>{r}</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>{a.descricao}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button onClick={() => post({ resolver: a.id }, 'Aviso resolvido ✓')} style={botao}>Resolvido</button>
                {pausado && <button onClick={() => post({ devolver: a.lead_id }, 'A IA volta a atender esse lead ✓')} style={botao}>Devolver pra IA</button>}
              </div>
            </div>
          )
        })}
      </div>

      {d.pausados.length > 0 && <>
        <h2 style={{ fontSize: 16, fontWeight: 800, margin: '24px 0 0' }}>A IA está parada nestes leads</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          {d.pausados.map((p: any) => (
            <div key={p.lead_id} style={{ ...card, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <b style={{ fontSize: 13.5 }}>{p.nome || 'Lead'}</b>
              <span style={{ fontSize: 12.5, color: 'var(--text-muted)', flex: 1, minWidth: 200 }}>{String(p.motivo || '').replace(/^⏸️ IA do plantão parou neste lead: /, '')} · {quando(p.desde)}</span>
              <Link href={`/dashboard/crm?lead=${p.lead_id}`} style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>abrir</Link>
              <button onClick={() => post({ devolver: p.lead_id }, 'A IA volta a atender esse lead ✓')} style={botao}>Devolver pra IA</button>
            </div>
          ))}
        </div>
      </>}

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, margin: '28px 0 0', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>O que ela fez (últimos 7 dias)</h2>
        <button onClick={() => setFiltro(filtro === 'tudo' ? 'respostas' : 'tudo')} style={{ ...botao, padding: '3px 10px', fontSize: 12 }}>{filtro === 'tudo' ? 'Só as respostas' : 'Mostrar tudo'}</button>
      </div>
      {!regs.length && <div style={{ ...card, marginTop: 10, fontSize: 13.5, color: 'var(--text-muted)' }}>Nada ainda. Assim que um lead escrever com o plantão em sombra ou ligado, aparece aqui.</div>}
      {[...grupos.entries()].map(([dia, rs]) => (
        <section key={dia} style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{dia}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {rs.map((r: any) => {
              const [rot2, cor2] = (r.evento === 'respondeu' || r.evento === 'cutucada' ? ACAO[r.acao] : EVENTO[r.evento]) || [r.evento, 'var(--text-muted)']
              return (
                <div key={r.id} style={{ ...card, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 14 }}>
                      <b>{r.nome || r.titulo || (r.evento === 'interruptor' ? `→ ${r.modo}` : 'Lead')}</b> <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>· {quando(r.em)}</span>
                      {r.sombra && <span style={{ fontSize: 10.5, fontWeight: 800, marginLeft: 8, color: 'var(--amber)' }}>SOMBRA</span>}
                      {r.lead_id && <Link href={`/dashboard/crm?lead=${r.lead_id}`} style={{ fontSize: 12, marginLeft: 8, color: 'var(--accent)', textDecoration: 'none' }}>abrir o lead</Link>}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 800, color: cor2 }}>{rot2}{r.turma ? ` · ${r.turma}` : ''}{r.temperatura ? ` · ${r.temperatura}` : ''}</span>
                  </div>
                  {r.ultima && <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-2)' }}>💬 {r.ultima}</div>}
                  {r.mensagens?.length > 0 && (
                    <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 10, background: 'var(--accent-bg)', fontSize: 13.5, whiteSpace: 'pre-wrap' }}>
                      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', color: 'var(--accent)', display: 'block', marginBottom: 3 }}>{r.sombra ? 'TERIA RESPONDIDO' : 'RESPONDEU'}</span>
                      {r.mensagens.map((m: string, i: number) => <div key={i} style={{ padding: '2px 0' }}>{m}</div>)}
                    </div>
                  )}
                  {r.proposta && (
                    <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 10, border: '1px dashed var(--border-strong)', fontSize: 13 }}>
                      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>{r.sombra ? 'PROPOSTA QUE TERIA MANDADO' : 'PROPOSTA'}</span>
                      <b>{r.proposta.capa?.titulo}</b>
                      {r.proposta.capa?.subtitulo && <div style={{ color: 'var(--text-2)', marginTop: 2 }}>{r.proposta.capa.subtitulo}</div>}
                      {Array.isArray(r.proposta.objecoes) && r.proposta.objecoes.length > 0 && <div style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 12 }}>Objeções: {r.proposta.objecoes.join(' · ')}</div>}
                      {r.proposta.url && <a href={r.proposta.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent)' }}>abrir a proposta</a>}
                    </div>
                  )}
                  {r.pedido_ao_diretor && <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--red)' }}>Pedido pro diretor: {r.pedido_ao_diretor}</div>}
                  {r.ligacao_preferencia && <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--text-2)' }}>Preferência pra ligação: {r.ligacao_preferencia}</div>}
                  {(r.problema || r.erro) && <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--red)' }}>⛔ {r.problema || r.erro}</div>}
                  {(r.resumo || r.detalhe || r.motivo) && <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-faint)' }}>{r.resumo || r.detalhe || r.motivo}</div>}
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
