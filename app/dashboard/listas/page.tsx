'use client'

import { useEffect, useState } from 'react'

const card = { backgroundColor: '#2c2c2e', border: '1px solid #3a3a3c', borderRadius: '12px' } as React.CSSProperties
const inp = { backgroundColor: '#3a3a3c', border: '1px solid #48484a', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', color: '#fff', outline: 'none', width: '100%' } as React.CSSProperties
const btn = { backgroundColor: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 18px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' } as React.CSSProperties
const label = { display: 'block', fontSize: 12, color: '#9ca3af', marginBottom: 6 } as React.CSSProperties

type Contato = { id: string; nome: string | null; telefone: string; cidade: string | null; categoria: string; status: string; notas: string | null; criado_em: string }
type Resumo = { total: number; interessados: number; compradores: number; cidades: { cidade: string; interessado: number; comprador: number; total: number }[] }

// Deriva a cidade do nome do arquivo do SleekFlow (ex: ..._NOVO_HAMBURGO.csv)
function cidadeDoArquivo(nome: string): string {
  const base = nome.replace(/\.csv$/i, '').replace(/\s*\(\d+\)\s*$/, '')
  const partes = base.split('_')
  const cidade = partes.slice(2).join(' ').trim()
  return cidade ? cidade.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : ''
}

export default function Listas() {
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [contatos, setContatos] = useState<Contato[]>([])
  const [fCidade, setFCidade] = useState('')
  const [fCategoria, setFCategoria] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(false)

  // importação
  const [categoria, setCategoria] = useState<'interessado' | 'comprador'>('interessado')
  const [dddPadrao, setDddPadrao] = useState('51')
  const [cidadeManual, setCidadeManual] = useState('')
  const [textoColado, setTextoColado] = useState('')
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)

  async function carregar() {
    setCarregando(true)
    try {
      const p = new URLSearchParams()
      if (fCidade) p.set('cidade', fCidade)
      if (fCategoria) p.set('categoria', fCategoria)
      if (fStatus) p.set('status', fStatus)
      if (busca) p.set('q', busca)
      const j = await fetch('/api/wa-oficial/contatos?' + p.toString()).then(r => r.json())
      if (j.ok) { setContatos(j.contatos); setResumo(j.resumo) }
    } finally { setCarregando(false) }
  }
  useEffect(() => { carregar() }, [fCidade, fCategoria, fStatus])

  async function importarTexto(formato: string, texto: string, cidade: string, origem: string) {
    const j = await fetch('/api/wa-oficial/contatos/importar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ formato, categoria, cidade, origem, dddPadrao, texto }),
    }).then(r => r.json())
    return j
  }

  async function onArquivos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setImportando(true); setResultado(null)
    let rec = 0, val = 0, inv = 0, sal = 0
    const detalhes: string[] = []
    for (const f of files) {
      const texto = await f.text()
      const cidade = cidadeManual.trim() || cidadeDoArquivo(f.name)
      const j = await importarTexto('sleekflow', texto, cidade, f.name)
      if (j.ok) { rec += j.recebidos; val += j.validos; inv += j.invalidos; sal += j.salvos; detalhes.push(`${cidade || f.name}: ${j.validos} válidos, ${j.invalidos} inválidos`) }
      else detalhes.push(`${f.name}: ERRO ${j.error}`)
    }
    setResultado(`Importados ${sal} contatos (${val} válidos, ${inv} inválidos de ${rec} linhas).\n` + detalhes.join('\n'))
    setImportando(false)
    e.target.value = ''
    carregar()
  }

  async function onColar() {
    if (!textoColado.trim()) return
    setImportando(true); setResultado(null)
    const j = await importarTexto('colado', textoColado, cidadeManual.trim(), 'colado')
    if (j.ok) {
      setResultado(`Importados ${j.salvos} contatos (${j.validos} válidos, ${j.invalidos} inválidos de ${j.recebidos} linhas).` + (j.exemplosInvalidos?.length ? `\nExemplos inválidos: ${j.exemplosInvalidos.join(', ')}` : ''))
      setTextoColado('')
    } else setResultado('Erro: ' + j.error)
    setImportando(false)
    carregar()
  }

  const corCat = (c: string) => c === 'comprador' ? '#34d399' : '#60a5fa'
  const corStatus: Record<string, string> = { novo: '#9ca3af', enviado: '#fbbf24', respondeu: '#34d399', virou_lead: '#a78bfa', optout: '#f87171' }

  return (
    <div style={{ padding: '32px clamp(12px, 4vw, 40px)', maxWidth: 1100 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>Listas de contatos</h1>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 24px' }}>Interessados e compradores antigos pra disparo. Ficam fora do CRM — só viram lead se responderem.</p>

      {/* resumo */}
      {resumo && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ ...card, padding: 16, minWidth: 140 }}><div style={{ fontSize: 12, color: '#9ca3af' }}>Total</div><div style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>{resumo.total}</div></div>
          <div style={{ ...card, padding: 16, minWidth: 140 }}><div style={{ fontSize: 12, color: '#60a5fa' }}>Interessados</div><div style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>{resumo.interessados}</div></div>
          <div style={{ ...card, padding: 16, minWidth: 140 }}><div style={{ fontSize: 12, color: '#34d399' }}>Compradores</div><div style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>{resumo.compradores}</div></div>
        </div>
      )}

      {/* importar */}
      <div style={{ ...card, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 12 }}>Importar contatos</div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ fontSize: 13, color: '#d1d1d1', cursor: 'pointer' }}><input type="radio" checked={categoria === 'interessado'} onChange={() => setCategoria('interessado')} /> Interessados</label>
          <label style={{ fontSize: 13, color: '#d1d1d1', cursor: 'pointer' }}><input type="radio" checked={categoria === 'comprador'} onChange={() => setCategoria('comprador')} /> Compradores</label>
          <div style={{ width: 120 }}><label style={label}>DDD padrão</label><input style={inp} value={dddPadrao} onChange={e => setDddPadrao(e.target.value)} /></div>
          <div style={{ flex: 1, minWidth: 180 }}><label style={label}>Cidade (vazio = pega do nome do arquivo)</label><input style={inp} value={cidadeManual} onChange={e => setCidadeManual(e.target.value)} placeholder="Ex: Caxias" /></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={label}>Arquivos CSV do SleekFlow (interessados)</label>
            <input type="file" accept=".csv" multiple onChange={onArquivos} disabled={importando}
              style={{ ...inp, padding: 8, cursor: 'pointer' }} />
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>Pode selecionar vários. A cidade vem do nome do arquivo.</div>
          </div>
          <div>
            <label style={label}>Colar lista (Nome [tab] email [tab] telefone [tab] situação)</label>
            <textarea style={{ ...inp, minHeight: 80, fontFamily: 'monospace', fontSize: 12 }} value={textoColado} onChange={e => setTextoColado(e.target.value)} placeholder="Cole aqui (ideal pros compradores)" />
            <button onClick={onColar} disabled={importando || !textoColado.trim()} style={{ ...btn, marginTop: 8, opacity: importando ? 0.6 : 1 }}>{importando ? 'Importando...' : 'Importar colados'}</button>
          </div>
        </div>
        {resultado && <div style={{ marginTop: 12, fontSize: 12, color: '#34d399', whiteSpace: 'pre-wrap', background: '#1c1c1e', borderRadius: 8, padding: 10 }}>{resultado}</div>}
      </div>

      {/* breakdown por cidade */}
      {resumo && resumo.cidades.length > 0 && (
        <div style={{ ...card, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 10 }}>Por cidade</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {resumo.cidades.map(c => (
              <button key={c.cidade} onClick={() => setFCidade(fCidade === c.cidade ? '' : c.cidade)}
                style={{ ...card, padding: '8px 12px', cursor: 'pointer', border: fCidade === c.cidade ? '1px solid #7c3aed' : '1px solid #3a3a3c', background: fCidade === c.cidade ? '#2e1065' : '#1c1c1e' }}>
                <div style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>{c.cidade}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}><span style={{ color: '#60a5fa' }}>{c.interessado} int</span> · <span style={{ color: '#34d399' }}>{c.comprador} comp</span></div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* filtros + tabela */}
      <div style={{ ...card, padding: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          <select style={{ ...inp, width: 'auto' }} value={fCategoria} onChange={e => setFCategoria(e.target.value)}>
            <option value="">Todas categorias</option><option value="interessado">Interessados</option><option value="comprador">Compradores</option>
          </select>
          <select style={{ ...inp, width: 'auto' }} value={fStatus} onChange={e => setFStatus(e.target.value)}>
            <option value="">Todos status</option><option value="novo">Novo</option><option value="enviado">Enviado</option><option value="respondeu">Respondeu</option><option value="virou_lead">Virou lead</option><option value="optout">Opt-out</option>
          </select>
          <input style={{ ...inp, width: 'auto', flex: 1, minWidth: 160 }} placeholder="Buscar nome/telefone..." value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={e => e.key === 'Enter' && carregar()} />
          <button onClick={carregar} style={{ ...btn, background: '#3a3a3c' }}>Buscar</button>
          {fCidade && <button onClick={() => setFCidade('')} style={{ ...btn, background: '#3a3a3c' }}>Limpar cidade: {fCidade}</button>}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr style={{ textAlign: 'left', fontSize: 11, color: '#6b7280', textTransform: 'uppercase' }}>
                <th style={{ padding: '6px 8px' }}>Nome</th><th style={{ padding: '6px 8px' }}>Telefone</th><th style={{ padding: '6px 8px' }}>Cidade</th><th style={{ padding: '6px 8px' }}>Categoria</th><th style={{ padding: '6px 8px' }}>Status</th><th style={{ padding: '6px 8px' }}>Situação</th>
              </tr>
            </thead>
            <tbody>
              {contatos.map(c => (
                <tr key={c.id} style={{ borderTop: '1px solid #3a3a3c', fontSize: 13, color: '#d1d1d1' }}>
                  <td style={{ padding: '8px' }}>{c.nome || '—'}</td>
                  <td style={{ padding: '8px', fontFamily: 'monospace' }}>{c.telefone}</td>
                  <td style={{ padding: '8px' }}>{c.cidade || '—'}</td>
                  <td style={{ padding: '8px', color: corCat(c.categoria), fontWeight: 600 }}>{c.categoria}</td>
                  <td style={{ padding: '8px', color: corStatus[c.status] || '#9ca3af' }}>{c.status}</td>
                  <td style={{ padding: '8px', fontSize: 11, color: '#9ca3af' }}>{c.notas || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 10 }}>{carregando ? 'Carregando...' : `${contatos.length} contato(s) exibido(s) (máx 300 por vez)`}</div>
      </div>
    </div>
  )
}
