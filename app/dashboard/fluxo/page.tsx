'use client'

import { useEffect, useState } from 'react'
import { fetchAuth } from '@/lib/api'

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }
const inp: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: 'var(--text)', outline: 'none', width: '100%', fontFamily: 'inherit' }

// ordem de exibição das etapas com cadência
const ORDEM = ['aguardando_atendimento', 'atendimento_inicial', 'lote_preco_ok', 'oferecer_bolsa']
const ACOES = ['mensagem', 'ligacao', 'audio', 'decisao']

type Tarefa = { chave: string; titulo: string; dias: number; acao: string; descricao: string }

export default function FluxoComercial() {
  const [cad, setCad] = useState<Record<string, Tarefa[]>>({})
  const [titulos, setTitulos] = useState<Record<string, string>>({})
  const [regras, setRegras] = useState('')
  const [prioridade, setPrioridade] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { (async () => {
    const j = await fetchAuth('/api/fluxo').then(r => r.json()).catch(() => null)
    if (j?.ok) { setCad(j.fluxo.cadencia || {}); setTitulos(j.titulos || {}); setRegras(j.fluxo.regrasGerais || ''); setPrioridade(j.fluxo.prioridade || null) }
    setCarregando(false)
  })() }, [])

  function editarTarefa(etapa: string, i: number, campo: keyof Tarefa, valor: any) {
    setCad(c => { const n = { ...c }; const arr = [...(n[etapa] || [])]; arr[i] = { ...arr[i], [campo]: campo === 'dias' ? Number(valor) : valor }; n[etapa] = arr; return n })
  }
  async function salvar() {
    setSalvando(true); setMsg('')
    const fluxo = { cadencia: cad, regrasGerais: regras, prioridade }
    const j = await fetchAuth('/api/fluxo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fluxo }) }).then(r => r.json()).catch(() => ({ ok: false }))
    setSalvando(false)
    setMsg(j.ok ? '✅ Fluxo salvo! A IA e as tarefas já usam as novas regras.' : ('⚠️ ' + (j.error || 'falha ao salvar')))
    setTimeout(() => setMsg(''), 4000)
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 880, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 }}>🗺️ Fluxo Comercial</h1>
      <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 18px' }}>Como o lead caminha no funil, etapa por etapa. A equipe pode <b>ajustar as mensagens, os dias e as regras</b> aqui — a IA e as tarefas passam a seguir na hora.</p>

      {carregando ? <div style={{ color: 'var(--text-faint)', padding: 30 }}>Carregando…</div> : (
        <>
          {/* Como o fluxo se move (documentação das transições) */}
          <div style={{ ...card, padding: 16, marginBottom: 20, background: 'var(--surface-2)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>Como o lead se move</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.7 }}>
              <b>Trilha silenciosa</b> (não respondeu): segue a cadência de cada etapa, dia após dia. As tarefas abaixo são os follow-ups.<br />
              <b>Trilha ativa</b> (respondeu): a IA interrompe as automações e assume — lê o histórico e sugere a próxima etapa pelo contexto:<br />
              <span style={{ color: 'var(--text-faint)' }}>• recebeu preço/lote → <b>Lote e Preço OK</b> &nbsp;•&nbsp; quer conversar por texto depois → <b>Agendado</b> &nbsp;•&nbsp; quer ligação depois → <b>Ligação</b> (tarefa datada) &nbsp;•&nbsp; só na próxima turma → <b>Próxima Turma</b> &nbsp;•&nbsp; vai pagar → <b>Aguardando Pagamento</b> → <b>Ganho</b> &nbsp;•&nbsp; sem interesse/sem resposta no fim → <b>Perdido</b></span>
            </div>
          </div>

          {/* Etapas com cadência (editável) */}
          {ORDEM.filter(et => cad[et]).map(et => (
            <div key={et} style={{ ...card, padding: 16, marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent-soft)', marginBottom: 10 }}>{titulos[et] || et}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {(cad[et] || []).map((t, i) => (
                  <div key={t.chave} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                      <input style={{ ...inp, flex: 1, fontWeight: 700, minWidth: 180 }} value={t.titulo} onChange={e => editarTarefa(et, i, 'titulo', e.target.value)} />
                      <label style={{ fontSize: 11, color: 'var(--text-faint)' }}>gap dias</label>
                      <input type="number" min={0} style={{ ...inp, width: 60 }} value={t.dias} onChange={e => editarTarefa(et, i, 'dias', e.target.value)} />
                      <select style={{ ...inp, width: 120 }} value={t.acao} onChange={e => editarTarefa(et, i, 'acao', e.target.value)}>
                        {ACOES.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </div>
                    <textarea style={{ ...inp, minHeight: 56, resize: 'vertical' }} value={t.descricao} onChange={e => editarTarefa(et, i, 'descricao', e.target.value)} placeholder="O que essa mensagem/ação deve fazer…" />
                  </div>
                ))}
                {(cad[et] || []).length === 0 && <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Sem tarefas de cadência (etapa de espera).</div>}
              </div>
            </div>
          ))}

          {/* Regras gerais (editável) */}
          <div style={{ ...card, padding: 16, marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>Regras gerais</div>
            <textarea style={{ ...inp, minHeight: 120, resize: 'vertical' }} value={regras} onChange={e => setRegras(e.target.value)} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'sticky', bottom: 12 }}>
            <button onClick={salvar} disabled={salvando} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 10, padding: '11px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: salvando ? .6 : 1, boxShadow: 'var(--shadow-md)' }}>{salvando ? 'Salvando…' : '💾 Salvar fluxo'}</button>
            {msg && <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{msg}</span>}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 10 }}>Dica: "gap dias" = quantos dias após entrar na etapa (1ª tarefa) ou após concluir a anterior. 0 = mesmo dia, 1 = dia seguinte.</p>
        </>
      )}
    </div>
  )
}
