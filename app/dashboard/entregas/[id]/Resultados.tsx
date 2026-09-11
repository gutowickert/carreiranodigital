'use client'

import { useEffect, useState } from 'react'
import { fetchAuth } from '@/lib/api'

// Os blocos que medem se o trabalho está dando resultado:
//   MetaBloco  → o topo do funil, automático, lido da conta de anúncio do cliente
//   Placar     → os números do contrato numa data (o ponto A é a base de antes)
//   Registros  → o que ACONTECEU (primeira venda…) e as PROVAS (prints)
//   Nota       → anotação livre na ficha

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }
const inp: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '7px 9px', fontSize: 13, color: 'var(--text)', width: '100%' }
const btn: React.CSSProperties = { border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }
const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--text-faint)', display: 'block', marginBottom: 3 }
const tit: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '26px 0 10px' }

const br = (d?: string | null) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—')
const brl = (v: any) => (v == null || v === '' ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }))
const int = (v: any) => (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR'))
const pct = (a: any, b: any) => (a == null || !b ? null : Math.round((Number(a) / Number(b)) * 100))
const hojeISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

const FRENTES: [string, string][] = [['', 'geral'], ['trafego', 'Tráfego'], ['estrategia', 'Estratégia'], ['crm', 'CRM'], ['deu_venda', 'Deu Venda']]
const nomeFrente = (f?: string | null) => FRENTES.find(([v]) => v === (f || ''))?.[1] || 'geral'

async function post(corpo: any) {
  return fetchAuth('/api/projetos/ficha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
    .then(r => r.json()).catch(() => ({ ok: false, error: 'falha de rede' }))
}

// ─────────────────────────────────────────────────────────── Meta (automático)

export function MetaBloco({ projeto, aoMudar }: { projeto: any; aoMudar: () => void }) {
  const [d, setD] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)
  const [conta, setConta] = useState(projeto.ad_account_id || '')
  const [editando, setEditando] = useState(false)

  async function carregar() {
    setCarregando(true)
    const j = await fetchAuth(`/api/projetos/meta?id=${projeto.id}`).then(r => r.json()).catch(() => null)
    setD(j); setCarregando(false)
  }
  useEffect(() => { carregar() }, [projeto.id, projeto.ad_account_id])

  async function salvarConta() {
    await fetchAuth('/api/projetos/ficha', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: projeto.id, ad_account_id: conta }) })
    setEditando(false); aoMudar()
  }

  const semConta = !projeto.ad_account_id || editando
  return (
    <div style={{ ...card, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>📣 Conta de anúncio {d?.conta?.nome ? <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>· {d.conta.nome}</span> : null}</div>
        {!semConta && <button onClick={() => setEditando(true)} style={{ ...btn, background: 'none', color: 'var(--text-faint)', padding: '3px 6px', fontWeight: 400 }}>trocar conta</button>}
      </div>

      {semConta ? (
        <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
          <input style={inp} placeholder="número da conta de anúncio (ex: 2194662637340244)" value={conta} onChange={e => setConta(e.target.value)} />
          <button onClick={salvarConta} style={{ ...btn, background: 'var(--accent)', color: '#fff' }}>Ligar</button>
        </div>
      ) : carregando ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 10 }}>Lendo a Meta…</div>
      ) : !d?.ok ? (
        <div style={{ fontSize: 12.5, color: 'var(--amber)', marginTop: 10, lineHeight: 1.55 }}>⚠️ {d?.error || 'não consegui ler a conta'}</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 8, marginTop: 12 }}>
            {[
              { l: 'investido', v: brl(d.total.gasto) },
              { l: 'conversas iniciadas', v: int(d.total.conversas) },
              { l: 'custo por conversa', v: d.total.custoConversa != null ? brl(d.total.custoConversa.toFixed(2)) : '—' },
              { l: 'cliques', v: int(d.total.cliques) },
              { l: 'impressões', v: int(d.total.impressoes) },
            ].map((x, i) => (
              <div key={i} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '9px 10px' }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{x.v}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 2 }}>{x.l}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8 }}>de {br(d.desde)} até hoje · lido direto da Meta</div>
        </>
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────── Placar

export function Placar({ projeto, linhas, aoMudar }: { projeto: any; linhas: any[]; aoMudar: () => void }) {
  const [aberto, setAberto] = useState(false)
  const [msg, setMsg] = useState('')
  const vazioForm = () => ({ data: hojeISO(), ponto_a: false, verba: '', leads: '', propostas: '', vendas: '', comissao: '', observacao: '' })
  const [f, setF] = useState<any>(vazioForm())

  const pontoA = linhas.find(l => l.ponto_a)
  const temPontoA = !!pontoA
  const atual = [...linhas].filter(l => !l.ponto_a).sort((a, b) => String(b.data).localeCompare(String(a.data)))[0]

  async function salvar() {
    const j = await post({ acao: 'placar_novo', projeto_id: projeto.id, ...f })
    if (j.ok) { setAberto(false); setF(vazioForm()); setMsg(''); aoMudar() } else setMsg('⚠️ ' + (j.error || 'falha'))
  }

  return (
    <div style={{ ...card, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>📊 Placar do contrato</div>
        <button onClick={() => { setAberto(v => !v); setF({ ...vazioForm(), ponto_a: !temPontoA }) }} style={{ ...btn, background: 'var(--accent)', color: '#fff' }}>+ Atualizar números</button>
      </div>

      {!temPontoA && (
        <div style={{ background: 'var(--amber-bg)', borderRadius: 8, padding: '9px 11px', marginTop: 10, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.55 }}>
          <b style={{ color: 'var(--text)' }}>Falta o ponto A</b> — onde o cliente estava antes do trabalho começar. Sem ele, nenhum número depois tem com o que comparar, e a renegociação vira opinião contra opinião.
        </div>
      )}

      {aberto && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 12.5, color: 'var(--text-2)', marginBottom: 10 }}>
            <input type="checkbox" checked={f.ponto_a} onChange={e => setF({ ...f, ponto_a: e.target.checked })} />
            É o <b>ponto A</b> — como estava antes de começar{temPontoA ? ' (substitui o atual)' : ''}
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 8 }}>
            <div><label style={lbl}>Data</label><input type="date" style={inp} value={f.data} onChange={e => setF({ ...f, data: e.target.value })} /></div>
            <div><label style={lbl}>Verba investida</label><input style={inp} value={f.verba} onChange={e => setF({ ...f, verba: e.target.value })} placeholder="R$" /></div>
            <div><label style={lbl}>Leads</label><input style={inp} value={f.leads} onChange={e => setF({ ...f, leads: e.target.value })} /></div>
            <div><label style={lbl}>Propostas</label><input style={inp} value={f.propostas} onChange={e => setF({ ...f, propostas: e.target.value })} /></div>
            <div><label style={lbl}>Vendas</label><input style={inp} value={f.vendas} onChange={e => setF({ ...f, vendas: e.target.value })} /></div>
            <div><label style={lbl}>Comissão (o que ele ganhou)</label><input style={inp} value={f.comissao} onChange={e => setF({ ...f, comissao: e.target.value })} placeholder="R$" /></div>
          </div>
          <input style={{ ...inp, marginTop: 8 }} placeholder="observação (opcional)" value={f.observacao} onChange={e => setF({ ...f, observacao: e.target.value })} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
            <button onClick={salvar} style={{ ...btn, background: 'var(--green)', color: '#fff' }}>Salvar</button>
            <button onClick={() => setAberto(false)} style={{ ...btn, background: 'var(--surface-2)', color: 'var(--text-2)' }}>Cancelar</button>
            <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>Números acumulados desde o início. Deixa em branco o que não souber.</span>
          </div>
          {msg && <div style={{ fontSize: 12.5, color: 'var(--amber)', marginTop: 8 }}>{msg}</div>}
        </div>
      )}

      {!!linhas.length && (
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5, minWidth: 560, fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr>{['', 'data', 'verba', 'leads', 'propostas', 'vendas', 'comissão', 'retorno', ''].map((h, i) => (
                <th key={i} style={{ textAlign: i > 1 && i < 8 ? 'right' : 'left', padding: '6px 8px', fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {linhas.map(l => {
                const ret = l.comissao != null && l.verba ? (Number(l.comissao) / Number(l.verba)) : null
                const td: React.CSSProperties = { padding: '8px', borderBottom: '1px solid var(--border)', textAlign: 'right', color: 'var(--text-2)' }
                return (
                  <tr key={l.id} style={{ background: l.ponto_a ? 'var(--surface-2)' : undefined }}>
                    <td style={{ ...td, textAlign: 'left' }}>{l.ponto_a ? <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--amber)', letterSpacing: '.06em' }}>PONTO A</span> : ''}</td>
                    <td style={{ ...td, textAlign: 'left' }}>{br(l.data)}</td>
                    <td style={td}>{brl(l.verba)}</td>
                    <td style={td}>{int(l.leads)}</td>
                    <td style={td}>{int(l.propostas)}{pct(l.propostas, l.leads) != null && <span style={{ color: 'var(--text-faint)', fontSize: 11 }}> · {pct(l.propostas, l.leads)}%</span>}</td>
                    <td style={td}>{int(l.vendas)}{pct(l.vendas, l.propostas) != null && <span style={{ color: 'var(--text-faint)', fontSize: 11 }}> · {pct(l.vendas, l.propostas)}%</span>}</td>
                    <td style={{ ...td, color: 'var(--text)', fontWeight: 600 }}>{brl(l.comissao)}</td>
                    <td style={{ ...td, color: ret != null && ret >= 1 ? 'var(--green)' : 'var(--text-2)', fontWeight: 600 }}>{ret != null ? ret.toFixed(1).replace('.', ',') + '×' : '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <button onClick={async () => { if (confirm('Apagar essa linha do placar?')) { await post({ acao: 'placar_remover', projeto_id: projeto.id, id: l.id }); aoMudar() } }} style={{ ...btn, background: 'none', color: 'var(--text-faint)', padding: '2px 5px', fontWeight: 400 }}>✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {atual && pontoA && (
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 9 }}>
              Do ponto A até {br(atual.data)}: <b>{int(Number(atual.leads || 0) - Number(pontoA.leads || 0))} leads</b> e <b>{int(Number(atual.vendas || 0) - Number(pontoA.vendas || 0))} vendas</b> a mais.
              <span style={{ color: 'var(--text-faint)' }}> Proporção de propostas por lead e de vendas por proposta ao lado de cada número.</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────── Resultados e provas

// print de celular é grande — reduz antes de mandar (e cabe no limite da função)
async function comprimir(file: File): Promise<{ base64: string; mime: string }> {
  if (file.type === 'application/pdf') {
    const b = await new Promise<string>((ok, er) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = er; r.readAsDataURL(file) })
    return { base64: b, mime: 'application/pdf' }
  }
  const url = URL.createObjectURL(file)
  const img = await new Promise<HTMLImageElement>((ok, er) => { const i = new Image(); i.onload = () => ok(i); i.onerror = er; i.src = url })
  const max = 1600
  const escala = Math.min(1, max / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  URL.revokeObjectURL(url)
  return { base64: c.toDataURL('image/jpeg', 0.85), mime: 'image/jpeg' }
}

export function Registros({ projeto, itens, aoMudar }: { projeto: any; itens: any[]; aoMudar: () => void }) {
  const [aberto, setAberto] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState('')
  const vazioForm = () => ({ tipo: 'marco', frente: '', titulo: '', descricao: '', data: hojeISO(), autorizado_uso: 'pendente', dados_ocultos: false, arquivo: null as File | null })
  const [f, setF] = useState<any>(vazioForm())

  async function salvar() {
    if (!f.titulo.trim()) { setMsg('⚠️ dá um título'); return }
    setEnviando(true); setMsg('')
    let arquivo: any = {}
    if (f.arquivo) {
      if (f.arquivo.type === 'application/pdf' && f.arquivo.size > 3 * 1024 * 1024) { setMsg('⚠️ PDF acima de 3 MB — manda um print no lugar'); setEnviando(false); return }
      try { const c = await comprimir(f.arquivo); arquivo = { arquivo_base64: c.base64, arquivo_mime: c.mime } }
      catch { setMsg('⚠️ não consegui ler o arquivo'); setEnviando(false); return }
    }
    const j = await post({ acao: 'registro_novo', projeto_id: projeto.id, tipo: f.arquivo ? 'prova' : f.tipo, frente: f.frente, titulo: f.titulo, descricao: f.descricao, data: f.data, autorizado_uso: f.autorizado_uso, dados_ocultos: f.dados_ocultos, ...arquivo })
    setEnviando(false)
    if (j.ok) { setAberto(false); setF(vazioForm()); aoMudar() } else setMsg('⚠️ ' + (j.error || 'falha'))
  }

  const liberadas = itens.filter(x => x.tipo === 'prova' && x.autorizado_uso === 'sim' && x.dados_ocultos).length
  const provas = itens.filter(x => x.tipo === 'prova').length

  return (
    <div style={{ ...card, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>🏆 Resultados e provas</div>
          {provas > 0 && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>{liberadas} de {provas} {provas === 1 ? 'prova liberada' : 'provas liberadas'} pra uso público</div>}
        </div>
        <button onClick={() => setAberto(v => !v)} style={{ ...btn, background: 'var(--accent)', color: '#fff' }}>+ Registrar</button>
      </div>

      {aberto && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8 }}>
            <div><label style={lbl}>O que é</label><select style={inp} value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}><option value="marco">Resultado — algo que aconteceu</option><option value="prova">Prova — um print</option></select></div>
            <div><label style={lbl}>Frente</label><select style={inp} value={f.frente} onChange={e => setF({ ...f, frente: e.target.value })}>{FRENTES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div><label style={lbl}>Data</label><input type="date" style={inp} value={f.data} onChange={e => setF({ ...f, data: e.target.value })} /></div>
          </div>
          <input style={inp} placeholder="título — ex: primeira venda pelo anúncio" value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} />
          <textarea style={{ ...inp, minHeight: 58 }} placeholder="o que aconteceu, com o número se tiver (opcional)" value={f.descricao} onChange={e => setF({ ...f, descricao: e.target.value })} />
          <div>
            <label style={lbl}>Print ou PDF (opcional)</label>
            <input type="file" accept="image/*,application/pdf" onChange={e => setF({ ...f, arquivo: e.target.files?.[0] || null, tipo: e.target.files?.[0] ? 'prova' : f.tipo })} style={{ fontSize: 12.5, color: 'var(--text-2)' }} />
          </div>
          {(f.tipo === 'prova' || f.arquivo) && (
            <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.5 }}>Print de venda costuma ter nome e valor do cliente <b>do cliente</b>. Só vira material público com as duas coisas marcadas.</div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <label style={{ fontSize: 12.5, color: 'var(--text-2)' }}>Ele autorizou uso público?{' '}
                  <select style={{ ...inp, width: 'auto', display: 'inline-block', padding: '4px 6px' }} value={f.autorizado_uso} onChange={e => setF({ ...f, autorizado_uso: e.target.value })}><option value="pendente">ainda não perguntei</option><option value="sim">sim</option><option value="nao">não</option></select>
                </label>
                <label style={{ fontSize: 12.5, color: 'var(--text-2)', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={f.dados_ocultos} onChange={e => setF({ ...f, dados_ocultos: e.target.checked })} /> dados pessoais escondidos no print
                </label>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button disabled={enviando} onClick={salvar} style={{ ...btn, background: 'var(--green)', color: '#fff', opacity: enviando ? .6 : 1 }}>{enviando ? 'Enviando…' : 'Salvar'}</button>
            <button onClick={() => { setAberto(false); setMsg('') }} style={{ ...btn, background: 'var(--surface-2)', color: 'var(--text-2)' }}>Cancelar</button>
          </div>
          {msg && <div style={{ fontSize: 12.5, color: 'var(--amber)' }}>{msg}</div>}
        </div>
      )}

      {!itens.length && !aberto && <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 10 }}>Nada registrado ainda. A primeira venda é o primeiro que vale registrar.</div>}

      {!!itens.length && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {itens.map(x => {
            const liberada = x.autorizado_uso === 'sim' && x.dados_ocultos
            const ehImagem = String(x.arquivo_mime || '').startsWith('image/')
            return (
              <div key={x.id} style={{ display: 'flex', gap: 11, padding: 10, background: 'var(--surface-2)', borderRadius: 9, alignItems: 'flex-start' }}>
                {x.arquivo_url && ehImagem ? (
                  <a href={x.arquivo_url} target="_blank" rel="noopener" style={{ flexShrink: 0 }}>
                    <img src={x.arquivo_url} alt={x.titulo} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 7, border: '1px solid var(--border)', display: 'block' }} />
                  </a>
                ) : (
                  <div style={{ width: 72, height: 72, borderRadius: 7, background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>{x.arquivo_url ? '📄' : '🏆'}</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{x.titulo}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>{br(x.data)} · {nomeFrente(x.frente)} · {x.tipo === 'prova' ? 'prova' : 'resultado'}{x.arquivo_url && !ehImagem && <> · <a href={x.arquivo_url} target="_blank" rel="noopener" style={{ color: 'var(--accent)' }}>abrir PDF</a></>}</div>
                  {x.descricao && <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 5, lineHeight: 1.5 }}>{x.descricao}</div>}
                  {x.tipo === 'prova' && (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 7, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.07em', padding: '3px 7px', borderRadius: 4, background: liberada ? 'var(--green-bg)' : 'var(--amber-bg)', color: liberada ? 'var(--green)' : 'var(--amber)' }}>{liberada ? 'LIBERADA PRA USO' : 'SÓ USO INTERNO'}</span>
                      <select style={{ ...inp, width: 'auto', padding: '3px 6px', fontSize: 11.5 }} value={x.autorizado_uso} onChange={async e => { await post({ acao: 'registro_atualizar', projeto_id: projeto.id, id: x.id, autorizado_uso: e.target.value }); aoMudar() }}>
                        <option value="pendente">autorização: não perguntei</option><option value="sim">autorização: sim</option><option value="nao">autorização: não</option>
                      </select>
                      <label style={{ fontSize: 11.5, color: 'var(--text-2)', display: 'flex', gap: 5, alignItems: 'center' }}>
                        <input type="checkbox" checked={!!x.dados_ocultos} onChange={async e => { await post({ acao: 'registro_atualizar', projeto_id: projeto.id, id: x.id, dados_ocultos: e.target.checked }); aoMudar() }} /> dados escondidos
                      </label>
                    </div>
                  )}
                </div>
                <button onClick={async () => { if (confirm('Apagar esse registro' + (x.arquivo_path ? ' e o arquivo' : '') + '?')) { await post({ acao: 'registro_remover', projeto_id: projeto.id, id: x.id }); aoMudar() } }} style={{ ...btn, background: 'none', color: 'var(--text-faint)', padding: '2px 5px', fontWeight: 400 }}>✕</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────── anotação livre

export function Nota({ projeto, aoMudar }: { projeto: any; aoMudar: () => void }) {
  const [t, setT] = useState('')
  async function salvar() {
    if (!t.trim()) return
    const j = await post({ acao: 'nota', projeto_id: projeto.id, texto: t })
    if (j.ok) { setT(''); aoMudar() }
  }
  return (
    <div style={{ display: 'flex', gap: 7, marginBottom: 8 }}>
      <input style={inp} placeholder="anotar algo na ficha (fica nos andamentos)" value={t} onChange={e => setT(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') salvar() }} />
      <button onClick={salvar} style={{ ...btn, background: 'var(--accent)', color: '#fff' }}>Anotar</button>
    </div>
  )
}

export { tit as tituloSecao }
