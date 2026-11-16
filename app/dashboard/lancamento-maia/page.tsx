'use client'
// Lançamento Maia (15/11/2026): o funil do lançamento dentro do CRM, em colunas por etapa.
// Os detalhes de cada pessoa (respostas, fotos, amostra, aprovar e entregar) ficam na tela da equipe.
import { useEffect, useState } from 'react'
import { fetchAuth } from '@/lib/api'

type Cartao = {
  id: string; nome: string | null; final: string; versao: string; remessa: number; negocio: string | null; cidade: string | null
  etapa: string; entrega_em: string | null; entregue_em: string | null; aberturas: number; testou: boolean
  rick_pendente: boolean; duvida: boolean; em_teste: boolean; atualizado_em: string | null
}
type Etapa = { chave: string; nome: string }

const coluna: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 10, minWidth: 230, width: 230, flex: 'none', display: 'flex', flexDirection: 'column', gap: 8 }
const card: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 11px', display: 'flex', flexDirection: 'column', gap: 6 }
const selo = (cor: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 600, borderRadius: 999, padding: '2px 8px', background: cor, color: '#fff' })
const quando = (s: string | null) => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''

export default function LancamentoMaia() {
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [lista, setLista] = useState<Cartao[]>([])
  const [conta, setConta] = useState<Record<string, number>>({})
  const [ligado, setLigado] = useState(true)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [movendo, setMovendo] = useState('')

  async function carregar() {
    const j = await fetchAuth('/api/maia/lancamento/crm').then(r => r.json()).catch(() => null)
    if (j?.ok) { setEtapas(j.etapas); setLista(j.lista); setConta(j.conta); setLigado(j.ligado); setErro('') }
    else setErro(j?.erro || 'Não consegui ler a lista do lançamento.')
    setCarregando(false)
  }
  useEffect(() => { carregar(); const t = setInterval(carregar, 30000); return () => clearInterval(t) }, [])

  async function mover(id: string, etapa: string) {
    setMovendo(id)
    const j = await fetchAuth('/api/maia/lancamento/crm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, etapa }) }).then(r => r.json()).catch(() => null)
    if (!j?.ok) alert(j?.erro || 'Não consegui mudar a etapa.')
    await carregar(); setMovendo('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Lançamento Maia</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-2)' }}>
            Quem recebeu o disparo "A Maia invadiu a escola", por etapa. Atualiza sozinho a cada 30 segundos.
          </p>
        </div>
        <a href="/maia/operacao/lancamento.html" target="_blank" rel="noopener" style={{ fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8, background: '#8b5cf6', color: '#fff', textDecoration: 'none' }}>
          Abrir a tela da equipe (respostas, fotos e amostra)
        </a>
      </div>

      {!ligado && <div style={{ fontSize: 13, color: '#b4471f' }}>A Maia do lançamento está desligada (MAIA_LANCAMENTO_LIGADO). As respostas caem na IA normal do CRM.</div>}
      {erro && <div style={{ fontSize: 13, color: '#b4471f' }}>{erro}</div>}
      {carregando && <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Carregando...</div>}

      {!carregando && !erro && (
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start' }}>
          {etapas.map(e => {
            const doEtapa = lista.filter(c => c.etapa === e.chave)
            return (
              <div key={e.chave} style={coluna}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <b style={{ fontSize: 13, color: 'var(--text)' }}>{e.nome}</b>
                  <span style={{ fontSize: 12, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>{conta[e.chave] || 0}</span>
                </div>
                {doEtapa.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Ninguém aqui</div>}
                {doEtapa.map(c => (
                  <div key={c.id} style={card}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{c.nome || 'Sem nome'} <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-2)' }}>· final {c.final}</span></div>
                    {(c.negocio || c.cidade) && <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{[c.negocio, c.cidade].filter(Boolean).join(' · ')}</div>}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {c.remessa === 0 && <span style={selo('#6b7280')}>teste do time</span>}
                      {c.rick_pendente && <span style={selo('#b4471f')}>Rick: mandar áudio</span>}
                      {c.duvida && <span style={selo('#d97706')}>dúvida</span>}
                      {c.em_teste && <span style={selo('#8b5cf6')}>testando agora</span>}
                      {c.aberturas > 0 && <span style={selo('#1f7a55')}>abriu {c.aberturas}x</span>}
                      {c.testou && <span style={selo('#1f7a55')}>testou</span>}
                    </div>
                    {c.entrega_em && !c.entregue_em && <div style={{ fontSize: 11, color: 'var(--text-2)' }}>Entrega: {quando(c.entrega_em)}</div>}
                    <select value={c.etapa} disabled={movendo === c.id} onChange={ev => mover(c.id, ev.target.value)}
                      style={{ fontSize: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 6px', color: 'var(--text)' }}>
                      {etapas.map(x => <option key={x.chave} value={x.chave}>{x.nome}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
