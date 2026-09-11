'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { fetchAuth } from '@/lib/api'
import { MetaBloco, Placar, Registros, Nota } from './Resultados'

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }
const inp: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '7px 9px', fontSize: 13, color: 'var(--text)' }
const btn: React.CSSProperties = { border: 'none', borderRadius: 8, padding: '6px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }

const br = (d?: string | null) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—')
const dataHora = (d?: string | null) => {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return br(d)
  return dt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
// input datetime-local espera hora local
const paraInput = (d?: string | null) => {
  const base = d ? new Date(d) : new Date()
  if (isNaN(base.getTime())) return ''
  const off = base.getTimezoneOffset()
  return new Date(base.getTime() - off * 60000).toISOString().slice(0, 16)
}

export default function FichaEntrega() {
  const { id } = useParams<{ id: string }>()
  const [d, setD] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)
  const [msg, setMsg] = useState('')
  const [agindo, setAgindo] = useState<string | null>(null)   // marcoId em ação
  const [form, setForm] = useState<any>({})
  const [novaPend, setNovaPend] = useState('')

  async function carregar() {
    const j = await fetchAuth(`/api/projetos/ficha?id=${id}`).then(r => r.json()).catch(() => null)
    if (j?.ok) setD(j)
    else setMsg('⚠️ ' + (j?.error || 'não consegui carregar'))
    setCarregando(false)
  }
  useEffect(() => { if (id) carregar() }, [id])

  async function acao(corpo: any) {
    const j = await fetchAuth('/api/projetos/marco', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }).then(r => r.json()).catch(() => null)
    if (j?.ok) {
      setAgindo(null); setForm({})
      if (j.aviso) { setMsg('⚠️ ' + j.aviso); setTimeout(() => setMsg(''), 6000) }
      carregar()
    } else {
      // a regra de ouro: não fecha encontro sem marcar o próximo
      if (j?.precisa_proximo) {
        setForm((f: any) => ({ ...f, exigeProximo: j.precisa_proximo, proxima_data_hora: paraInput(j.precisa_proximo.data_prevista + 'T14:00:00') }))
        setMsg('🔒 ' + j.error)
      } else { setMsg('⚠️ ' + (j?.error || 'falha')); setTimeout(() => setMsg(''), 5000) }
    }
  }

  async function pendencia(corpo: any) {
    await fetchAuth('/api/projetos/ficha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projeto_id: id, ...corpo }) }).then(r => r.json()).catch(() => null)
    setNovaPend(''); carregar()
  }

  if (carregando) return <div style={{ padding: 32, color: 'var(--text-faint)' }}>Carregando…</div>
  if (!d?.projeto) return <div style={{ padding: 32, color: 'var(--text-faint)' }}>{msg || 'Projeto não encontrado.'}</div>

  const p = d.projeto
  const marcos = d.marcos || []

  return (
    <div style={{ padding: '28px 32px', maxWidth: 900, margin: '0 auto' }}>
      <Link href="/dashboard/entregas" style={{ fontSize: 12.5, color: 'var(--text-faint)', textDecoration: 'none' }}>← Entregas</Link>

      {/* ───────── cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.cor }} />
            <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{p.cliente}</h1>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '5px 0 0' }}>
            {p.roteiro} · desde {br(p.data_inicio)}
            {p.data_fim && <> · <b style={{ color: 'var(--text-2)' }}>fim {br(p.data_fim)}</b></>}
            {p.mensalidade_valor ? ` · R$ ${Number(p.mensalidade_valor).toLocaleString('pt-BR')}/mês${p.mensalidade_dia ? ` (dia ${p.mensalidade_dia})` : ''}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 7 }}>
          {p.whatsapp && <a href={`https://wa.me/${p.whatsapp}`} target="_blank" rel="noopener" style={{ ...card, padding: '7px 12px', fontSize: 12.5, color: 'var(--text-2)', textDecoration: 'none' }}>💬 WhatsApp</a>}
          {p.lead_id && <Link href={`/dashboard/crm?lead=${p.lead_id}`} style={{ ...card, padding: '7px 12px', fontSize: 12.5, color: 'var(--text-2)', textDecoration: 'none' }}>👤 Lead de origem</Link>}
        </div>
      </div>

      {msg && <div style={{ ...card, padding: '10px 12px', marginTop: 12, fontSize: 13, color: 'var(--text-2)' }}>{msg}</div>}

      {/* ───────── resultado: o placar do contrato vem antes da operação */}
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '24px 0 10px' }}>O resultado</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <MetaBloco projeto={p} aoMudar={carregar} />
        <Placar projeto={p} linhas={d.placar || []} aoMudar={carregar} />
        <Registros projeto={p} itens={d.registros || []} aoMudar={carregar} />
      </div>

      {/* ───────── linha do tempo */}
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '24px 0 10px' }}>A entrega</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {marcos.map((m: any) => {
          const feito = m.estado === 'concluido'
          const cor = m.situacao === 'atrasado' ? 'var(--red)' : m.situacao === 'a_remarcar' || m.situacao === 'confirmar' ? 'var(--amber)'
            : m.estado === 'confirmado' ? 'var(--green)' : m.estado === 'combinado' ? 'var(--blue)' : 'var(--border-strong)'
          const icone = feito ? '✔' : m.ancora ? '🔒' : m.natureza === 'interno' ? '⚙' : m.natureza === 'marco' ? '◆' : '○'
          return (
            <div key={m.id} style={{ ...card, padding: 14, borderLeft: `3px solid ${cor}`, opacity: feito ? .72 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15, color: cor, lineHeight: 1.3 }}>{icone}</span>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)' }}>{m.titulo}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>
                    {m.estado === 'previsto' && <>previsto para ~{br(m.data_prevista)}{m.natureza === 'encontro' && ' · a data se combina no encontro anterior'}</>}
                    {m.estado === 'combinado' && <>{dataHora(m.data_combinada)} · <b style={{ color: 'var(--amber)' }}>falta reconfirmar</b></>}
                    {m.estado === 'confirmado' && <>{dataHora(m.data_combinada)} · confirmado</>}
                    {m.estado === 'a_remarcar' && <b style={{ color: 'var(--amber)' }}>sem reconfirmação — precisa remarcar</b>}
                    {feito && <>concluído em {br(m.concluido_em)}</>}
                    {m.ancora && !feito && <> · <b style={{ color: 'var(--text-2)' }}>âncora: não empurra</b></>}
                  </div>
                  {m.registro && <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 7, paddingLeft: 10, borderLeft: '2px solid var(--border)' }}>{m.registro}</div>}
                </div>

                {!feito && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(m.estado === 'previsto' || m.estado === 'a_remarcar') && (
                      <button onClick={() => { setAgindo(m.id); setForm({ tipo: 'combinar', data_hora: paraInput((m.data_prevista || '') + 'T14:00:00') }) }} style={{ ...btn, background: 'var(--accent)', color: '#fff' }}>Combinar</button>
                    )}
                    {m.estado === 'combinado' && (
                      <button onClick={() => acao({ acao: 'confirmar', id: m.id })} style={{ ...btn, background: 'var(--green-bg)', color: 'var(--green)' }}>Confirmar</button>
                    )}
                    {(m.estado === 'combinado' || m.estado === 'confirmado') && (
                      <button onClick={() => { setAgindo(m.id); setForm({ tipo: 'remarcar', data_hora: paraInput(m.data_combinada) }) }} style={{ ...btn, background: 'var(--surface-2)', color: 'var(--text-2)' }}>Remarcar</button>
                    )}
                    <button onClick={() => { setAgindo(m.id); setForm({ tipo: 'concluir', registro: '' }) }} style={{ ...btn, background: 'var(--surface-2)', color: 'var(--text-2)' }}>Concluir</button>
                  </div>
                )}
              </div>

              {/* painel de ação */}
              {agindo === m.id && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  {(form.tipo === 'combinar' || form.tipo === 'remarcar') && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{form.tipo === 'combinar' ? 'Combinado com o cliente para' : 'Nova data'}:</span>
                      <input type="datetime-local" style={inp} value={form.data_hora || ''} onChange={e => setForm({ ...form, data_hora: e.target.value })} />
                      <button onClick={() => acao({ acao: form.tipo, id: m.id, data_hora: new Date(form.data_hora).toISOString() })} style={{ ...btn, background: 'var(--accent)', color: '#fff' }}>Salvar</button>
                      <button onClick={() => { setAgindo(null); setForm({}) }} style={{ ...btn, background: 'var(--surface-2)', color: 'var(--text-2)' }}>Cancelar</button>
                    </div>
                  )}
                  {form.tipo === 'concluir' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                      <textarea style={{ ...inp, minHeight: 66, width: '100%' }} placeholder="O que aconteceu? (fica na ficha pra quem pegar esse cliente depois)" value={form.registro || ''} onChange={e => setForm({ ...form, registro: e.target.value })} />
                      {form.exigeProximo && (
                        <div style={{ background: 'var(--amber-bg)', border: '1px solid var(--amber)', borderRadius: 8, padding: 11 }}>
                          <div style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 600 }}>🔒 Marca o próximo antes de fechar</div>
                          <div style={{ fontSize: 12, color: 'var(--text-2)', margin: '3px 0 8px' }}>{form.exigeProximo.titulo} — a data se combina agora, com o cliente na frente.</div>
                          <input type="datetime-local" style={inp} value={form.proxima_data_hora || ''} onChange={e => setForm({ ...form, proxima_data_hora: e.target.value })} />
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => acao({ acao: 'concluir', id: m.id, registro: form.registro, proxima_data_hora: form.proxima_data_hora ? new Date(form.proxima_data_hora).toISOString() : undefined })} style={{ ...btn, background: 'var(--green)', color: '#fff' }}>Concluir</button>
                        <button onClick={() => { setAgindo(null); setForm({}); setMsg('') }} style={{ ...btn, background: 'var(--surface-2)', color: 'var(--text-2)' }}>Cancelar</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ───────── pendências com o cliente */}
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '26px 0 10px' }}>Pendente com o cliente</div>
      <div style={{ ...card, padding: 14 }}>
        <div style={{ display: 'flex', gap: 7, marginBottom: (d.pendencias || []).length ? 12 : 0 }}>
          <input style={{ ...inp, flex: 1 }} placeholder="o que tu pediu e ainda não veio (acesso, foto, preço…)" value={novaPend} onChange={e => setNovaPend(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && novaPend.trim()) pendencia({ acao: 'pendencia_nova', descricao: novaPend }) }} />
          <button onClick={() => novaPend.trim() && pendencia({ acao: 'pendencia_nova', descricao: novaPend })} style={{ ...btn, background: 'var(--accent)', color: '#fff', padding: '7px 13px' }}>Pedir</button>
        </div>
        {(d.pendencias || []).map((x: any) => (
          <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, color: x.entregue_em ? 'var(--green)' : 'var(--amber)' }}>{x.entregue_em ? '✔' : '●'}</span>
            <span style={{ flex: 1, fontSize: 13, color: 'var(--text-2)', textDecoration: x.entregue_em ? 'line-through' : 'none' }}>{x.descricao}</span>
            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>pedido {br(x.pedido_em)}</span>
            {!x.entregue_em && <button onClick={() => pendencia({ acao: 'pendencia_entregue', id: x.id })} style={{ ...btn, background: 'var(--green-bg)', color: 'var(--green)', padding: '4px 9px' }}>Veio</button>}
            <button onClick={() => pendencia({ acao: 'pendencia_remover', id: x.id })} style={{ ...btn, background: 'none', color: 'var(--text-faint)', padding: '4px 6px' }}>✕</button>
          </div>
        ))}
      </div>

      {/* ───────── andamentos */}
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '26px 0 10px' }}>Andamentos</div>
      <Nota projeto={p} aoMudar={carregar} />
      <div style={{ ...card, padding: 4 }}>
        {(d.andamentos || []).map((a: any) => (
          <div key={a.id} style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text-2)' }}>
            <span style={{ fontSize: 11, color: 'var(--text-faint)', marginRight: 8 }}>{dataHora(a.criado_em)}</span>
            {a.observacao}
          </div>
        ))}
        {!(d.andamentos || []).length && <div style={{ padding: 14, fontSize: 13, color: 'var(--text-faint)' }}>Nada registrado ainda.</div>}
      </div>
    </div>
  )
}
