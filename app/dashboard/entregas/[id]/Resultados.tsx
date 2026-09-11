'use client'

import { useEffect, useState } from 'react'
import { fetchAuth } from '@/lib/api'
import { PERIODOS, intervalo, hojeBR } from '@/lib/periodos'

// Os blocos que medem se o trabalho está dando resultado:
//   MetaBloco  → o topo do funil, automático, lido da conta de anúncio do cliente
//   Placar     → o fechamento do mês: Meta + o que o cliente passou, contra a meta
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
  const inicio = String(projeto.data_inicio || '').slice(0, 10)
  const chave = `cnd_meta_periodo_${projeto.id}`
  const [periodo, setPeriodo] = useState<string>(() => { try { return localStorage.getItem(chave) || 'inicio' } catch { return 'inicio' } })
  const [custom, setCustom] = useState<[string, string]>(() => [inicio, hojeBR()])
  const [d, setD] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)
  const [conta, setConta] = useState(projeto.ad_account_id || '')
  const [editando, setEditando] = useState(false)

  const [de, ate] = periodo === 'custom' ? custom : intervalo(periodo, inicio)

  async function carregar() {
    if (!projeto.ad_account_id) { setCarregando(false); return }
    setCarregando(true)
    const j = await fetchAuth(`/api/projetos/meta?id=${projeto.id}&de=${de}&ate=${ate}`).then(r => r.json()).catch(() => null)
    setD(j); setCarregando(false)
  }
  useEffect(() => { carregar() }, [projeto.id, projeto.ad_account_id, de, ate])

  function escolher(p: string) {
    setPeriodo(p)
    try { localStorage.setItem(chave, p) } catch { /* sem armazenamento: só não lembra */ }
  }

  async function salvarConta() {
    await fetchAuth('/api/projetos/ficha', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: projeto.id, ad_account_id: conta }) })
    setEditando(false); aoMudar()
  }

  // o período pode começar antes do projeto — avisa, porque aí o número não é só do trabalho
  const antesDoInicio = !!inicio && de < inicio
  const semConta = !projeto.ad_account_id || editando
  const maxDia = Math.max(1, ...((d?.porDia || []).map((x: any) => x.gasto)))

  return (
    <div style={{ ...card, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Conta de anúncio {d?.conta?.nome ? <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>· {d.conta.nome}</span> : null}</div>
        {!semConta && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <select style={{ ...inp, width: 'auto', padding: '5px 8px', fontSize: 12.5 }} value={periodo} onChange={e => escolher(e.target.value)}>
              {PERIODOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            {periodo === 'custom' && (
              <>
                <input type="date" style={{ ...inp, width: 'auto', padding: '4px 7px', fontSize: 12.5 }} value={custom[0]} max={hojeBR()} onChange={e => setCustom([e.target.value, custom[1]])} />
                <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>até</span>
                <input type="date" style={{ ...inp, width: 'auto', padding: '4px 7px', fontSize: 12.5 }} value={custom[1]} max={hojeBR()} onChange={e => setCustom([custom[0], e.target.value])} />
              </>
            )}
            <button onClick={() => setEditando(true)} style={{ ...btn, background: 'none', color: 'var(--text-faint)', padding: '3px 6px', fontWeight: 400 }}>trocar conta</button>
          </div>
        )}
      </div>

      {semConta ? (
        <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
          <input style={inp} placeholder="número da conta de anúncio (ex: 2194662637340244)" value={conta} onChange={e => setConta(e.target.value)} />
          <button onClick={salvarConta} style={{ ...btn, background: 'var(--accent)', color: '#fff' }}>Ligar</button>
        </div>
      ) : carregando && !d ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 10 }}>Lendo a Meta…</div>
      ) : !d?.ok ? (
        <div style={{ fontSize: 12.5, color: 'var(--amber)', marginTop: 10, lineHeight: 1.55 }}>{d?.error || 'não consegui ler a conta'}</div>
      ) : (
        <div style={{ opacity: carregando ? .55 : 1, transition: 'opacity .15s' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 8, marginTop: 12 }}>
            {[
              { l: d.total.impostoPct ? 'investido, com imposto' : 'investido', v: brl(d.total.gasto) },
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

          {/* o dia a dia do período: barra = investido, número = conversas */}
          {(d.porDia || []).length > 1 && (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 54, marginTop: 12, overflowX: 'auto' }}>
              {d.porDia.map((x: any) => (
                <div key={x.data} title={`${br(x.data)} · ${brl(x.gasto)} · ${x.conversas} conversas`} style={{ flex: '1 0 10px', maxWidth: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <span style={{ fontSize: 9, color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums' }}>{x.conversas || ''}</span>
                  <div style={{ width: '100%', height: Math.max(2, (x.gasto / maxDia) * 36), background: projeto.cor || 'var(--accent)', borderRadius: '3px 3px 0 0', opacity: .8 }} />
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8 }}>
            {de === ate ? br(de) : `de ${br(de)} até ${br(ate)}`} · lido direto da Meta{d.total.impostoPct ? ` · investido = ${brl(d.total.gastoSemImposto)} do gerenciador + ${String(d.total.impostoPct).replace('.', ',')}% de imposto` : ''}{(d.porDia || []).length > 1 ? ' · barra = investido no dia, número = conversas' : ''}
          </div>
          {antesDoInicio && (
            <div style={{ fontSize: 11.5, color: 'var(--amber)', marginTop: 5 }}>
              O período começa antes do projeto ({br(inicio)}) — parte desse número não é do trabalho de vocês.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────── Fechamento do mês (placar)

// O placar é mensal: todo mês se fecha com o cliente. O topo do funil (investido
// com imposto, conversas) vem da Meta; vendas e faturamento vêm do cliente — ou
// do CRM, quando ele estiver no ar. O ponto A é a linha de antes do trabalho.
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const nomeMes = (m?: string | null) => (m ? `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}` : '')
const somaMes = (m: string, n: number) => { const d = new Date(m + '-15T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7) }
function limitesMes(m: string): [string, string] {
  const fim = new Date(somaMes(m, 1) + '-01T12:00:00Z'); fim.setUTCDate(0)
  const h = hojeISO()
  const ate = fim.toISOString().slice(0, 10)
  return [m + '-01', ate > h ? h : ate]
}
/** Meses do contrato, do início até o mês atual (o mais novo primeiro). */
function mesesDoProjeto(inicio: string): string[] {
  const out: string[] = []
  const atual = hojeISO().slice(0, 7)
  for (let m = (inicio || atual).slice(0, 7); m <= atual && out.length < 36; m = somaMes(m, 1)) out.push(m)
  return out.reverse()
}

export function Placar({ projeto, linhas, aoMudar }: { projeto: any; linhas: any[]; aoMudar: () => void }) {
  const [aberto, setAberto] = useState<'mes' | 'ponto_a' | null>(null)
  const [msg, setMsg] = useState('')
  const [lendo, setLendo] = useState(false)
  const [f, setF] = useState<any>({})

  const pontoA = linhas.find(l => l.ponto_a)
  const fechados = linhas.filter(l => !l.ponto_a && l.mes).sort((a, b) => String(b.mes).localeCompare(String(a.mes)))
  const antigas = linhas.filter(l => !l.ponto_a && !l.mes)           // de antes do fechamento mensal
  const ultimo = fechados[0] || antigas[antigas.length - 1]
  const meses = mesesDoProjeto(String(projeto.data_inicio || '').slice(0, 10))

  // meta por mês: cada fechamento é lido contra ela
  const metaCol = projeto.meta_vendas != null ? { col: 'vendas', alvo: Number(projeto.meta_vendas) }
    : projeto.meta_faturamento != null ? { col: 'comissao', alvo: Number(projeto.meta_faturamento) } : null

  async function puxarMeta(mes: string, base: any) {
    if (!projeto.ad_account_id) return
    setLendo(true)
    const [de, ate] = limitesMes(mes)
    const j = await fetchAuth(`/api/projetos/meta?id=${projeto.id}&de=${de}&ate=${ate}`).then(r => r.json()).catch(() => null)
    setLendo(false)
    if (!j?.ok) { setMsg('Não consegui ler a Meta: ' + (j?.error || 'falha') + ' — preenche à mão.'); return }
    setF({ ...base, verba: j.total.gasto.toFixed(2), conversas: String(j.total.conversas ?? ''), imposto_pct: j.total.impostoPct ?? null,
      leads: base.leads !== '' && base.leads != null ? base.leads : String(j.total.conversas ?? '') })
  }

  function abrirMes(mes: string) {
    const ja = fechados.find(l => l.mes === mes)
    const v = (x: any) => (x == null ? '' : String(x))
    const base = { mes, verba: v(ja?.verba), conversas: v(ja?.conversas), leads: v(ja?.leads), propostas: v(ja?.propostas), vendas: v(ja?.vendas),
      comissao: v(ja?.comissao), fonte: ja?.fonte || (projeto.fase?.startsWith('crm') || projeto.fase === 'acompanhamento' ? 'crm' : 'cliente'), observacao: v(ja?.observacao) }
    setF(base); setMsg(''); setAberto('mes')
    if (!ja) puxarMeta(mes, base)          // mês novo: a Meta preenche; mês já fechado: mostra o que foi gravado
  }

  function abrirPontoA() {
    const v = (x: any) => (x == null ? '' : String(x))
    setF({ data: String(pontoA?.data || projeto.data_inicio || hojeISO()).slice(0, 10), verba: v(pontoA?.verba), leads: v(pontoA?.leads), propostas: v(pontoA?.propostas),
      vendas: v(pontoA?.vendas), comissao: v(pontoA?.comissao), observacao: v(pontoA?.observacao) })
    setMsg(''); setAberto('ponto_a')
  }

  async function salvar() {
    const corpo = aberto === 'ponto_a'
      ? { acao: 'placar_novo', projeto_id: projeto.id, ponto_a: true, ...f }
      : { acao: 'placar_novo', projeto_id: projeto.id, ponto_a: false, ...f }
    const j = await post(corpo)
    if (j.ok) { setAberto(null); setMsg(''); aoMudar() } else setMsg('' + (j.error || 'falha'))
  }

  // o mês que faz sentido fechar agora: o anterior, se ainda não foi fechado
  const sugerido = meses.find(m => m < hojeISO().slice(0, 7) && !fechados.some(l => l.mes === m)) || meses[0]
  const campo = (k: string, l: string, ph?: string, auto?: boolean) => (
    <div><label style={lbl}>{l}{auto && <span style={{ color: 'var(--accent)' }}> · Meta</span>}</label>
      <input style={inp} value={f[k] ?? ''} onChange={e => setF({ ...f, [k]: e.target.value })} placeholder={ph} /></div>
  )

  const th: React.CSSProperties = { padding: '6px 8px', fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)', textAlign: 'right', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '8px', borderBottom: '1px solid var(--border)', textAlign: 'right', color: 'var(--text-2)', whiteSpace: 'nowrap' }
  const linhaTabela = (l: any, rotulo: React.ReactNode, destaque?: boolean) => {
    const ret = l.comissao != null && Number(l.verba) ? Number(l.comissao) / Number(l.verba) : null
    const cpc = l.conversas && Number(l.verba) ? Number(l.verba) / Number(l.conversas) : null
    const pm = metaCol && !l.ponto_a && l[metaCol.col] != null && metaCol.alvo > 0 ? Math.round((Number(l[metaCol.col]) / metaCol.alvo) * 100) : null
    return (
      <tr key={l.id} style={{ background: destaque ? 'var(--surface-2)' : undefined }}>
        <td style={{ ...td, textAlign: 'left', color: 'var(--text)' }}>{rotulo}</td>
        <td style={td}>{brl(l.verba)}</td>
        <td style={td}>{int(l.conversas)}</td>
        <td style={td}>{cpc != null ? brl(cpc.toFixed(2)) : '—'}</td>
        <td style={td}>{int(l.leads)}</td>
        <td style={td}>{int(l.vendas)}{pct(l.vendas, l.leads) != null && <span style={{ color: 'var(--text-faint)', fontSize: 11 }}> · {pct(l.vendas, l.leads)}%</span>}</td>
        <td style={{ ...td, color: 'var(--text)', fontWeight: 600 }}>{brl(l.comissao)}</td>
        <td style={{ ...td, color: ret != null && ret >= 1 ? 'var(--green)' : 'var(--text-2)', fontWeight: 600 }}>{ret != null ? ret.toFixed(1).replace('.', ',') + '×' : '—'}</td>
        <td style={{ ...td, fontWeight: 600, color: pm == null ? 'var(--text-faint)' : pm >= 100 ? 'var(--green)' : 'var(--text-2)' }}>{pm != null ? pm + '%' : '—'}</td>
        <td style={td}>
          <button onClick={async () => { if (confirm('Apagar essa linha?')) { await post({ acao: 'placar_remover', projeto_id: projeto.id, id: l.id }); aoMudar() } }} style={{ ...btn, background: 'none', color: 'var(--text-faint)', padding: '2px 5px', fontWeight: 400 }} aria-label="apagar linha">✕</button>
        </td>
      </tr>
    )
  }

  return (
    <div style={{ ...card, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Fechamento do mês</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={abrirPontoA} style={{ ...btn, background: 'var(--surface-2)', color: 'var(--text-2)' }}>{pontoA ? 'Ponto A' : '+ Ponto A'}</button>
          <button onClick={() => abrirMes(sugerido)} style={{ ...btn, background: 'var(--accent)', color: '#fff' }}>+ Fechar mês</button>
        </div>
      </div>

      <MetaContrato projeto={projeto} atual={ultimo || pontoA} rotulo={ultimo?.mes ? nomeMes(ultimo.mes) : ultimo ? br(ultimo.data) : ''} aoMudar={aoMudar} />

      {!pontoA && (
        <div style={{ background: 'var(--amber-bg)', borderRadius: 8, padding: '9px 11px', marginTop: 10, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.55 }}>
          <b style={{ color: 'var(--text)' }}>Falta o ponto A</b> — onde o cliente estava antes do trabalho começar. Se ele não tem esse número, o primeiro mês fechado vira a base.
        </div>
      )}

      {aberto && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          {aberto === 'mes' ? (
            <>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>Fechando</span>
                <select style={{ ...inp, width: 'auto' }} value={f.mes} onChange={e => abrirMes(e.target.value)}>
                  {meses.map(m => <option key={m} value={m}>{nomeMes(m)}{fechados.some(l => l.mes === m) ? ' · já fechado' : ''}</option>)}
                </select>
                {projeto.ad_account_id && <button onClick={() => puxarMeta(f.mes, f)} disabled={lendo} style={{ ...btn, background: 'var(--surface-2)', color: 'var(--text-2)' }}>{lendo ? 'Lendo a Meta…' : '↻ Puxar da Meta'}</button>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8 }}>
                {campo('verba', 'Investido, com imposto', 'R$', !!projeto.ad_account_id)}
                {campo('conversas', 'Conversas', '', !!projeto.ad_account_id)}
                {campo('leads', 'Leads')}
                {campo('propostas', 'Propostas')}
                {campo('vendas', 'Vendas')}
                {campo('comissao', 'Faturamento', 'R$')}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <select style={{ ...inp, width: 'auto' }} value={f.fonte || 'cliente'} onChange={e => setF({ ...f, fonte: e.target.value })} aria-label="De onde vêm as vendas">
                  <option value="cliente">vendas passadas pelo cliente</option>
                  <option value="crm">vendas do CRM</option>
                </select>
                <input style={{ ...inp, flex: 1, minWidth: 180 }} placeholder="observação do mês (opcional)" value={f.observacao ?? ''} onChange={e => setF({ ...f, observacao: e.target.value })} />
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 10 }}>O <b>ponto A</b> — como o cliente estava antes de começar, num mês típico.</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 8 }}>
                <div><label style={lbl}>Data</label><input type="date" style={inp} value={f.data} onChange={e => setF({ ...f, data: e.target.value })} /></div>
                {campo('verba', 'Investido', 'R$')}
                {campo('leads', 'Leads')}
                {campo('propostas', 'Propostas')}
                {campo('vendas', 'Vendas')}
                {campo('comissao', 'Faturamento', 'R$')}
              </div>
              <input style={{ ...inp, marginTop: 8 }} placeholder="observação (opcional)" value={f.observacao ?? ''} onChange={e => setF({ ...f, observacao: e.target.value })} />
            </>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={salvar} disabled={lendo} style={{ ...btn, background: 'var(--green)', color: '#fff' }}>Salvar</button>
            <button onClick={() => setAberto(null)} style={{ ...btn, background: 'var(--surface-2)', color: 'var(--text-2)' }}>Cancelar</button>
            <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>Números do mês, não acumulados. Deixa em branco o que não souber.</span>
          </div>
          {msg && <div style={{ fontSize: 12.5, color: 'var(--amber)', marginTop: 8 }}>{msg}</div>}
        </div>
      )}

      {!!linhas.length && (
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5, minWidth: 720, fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr>{['', 'investido', 'conversas', 'custo/conv.', 'leads', 'vendas', 'faturamento', 'retorno', 'da meta', ''].map((h, i) => (
                <th key={i} style={{ ...th, textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {pontoA && linhaTabela(pontoA, <span><span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--amber)', letterSpacing: '.06em' }}>PONTO A</span> <span style={{ color: 'var(--text-faint)' }}>{br(pontoA.data)}</span></span>, true)}
              {fechados.map(l => linhaTabela(l, <span title={l.observacao || undefined}>{nomeMes(l.mes)}{l.fonte === 'cliente' && <span style={{ color: 'var(--text-faint)', fontSize: 11 }}> · cliente</span>}</span>))}
              {antigas.map(l => linhaTabela(l, <span style={{ color: 'var(--text-faint)' }}>{br(l.data)}</span>))}
            </tbody>
          </table>
          <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 8, lineHeight: 1.5 }}>
            Investido e conversas vêm da Meta, com o imposto. "Da meta" compara {metaCol ? (metaCol.col === 'vendas' ? 'as vendas do mês com a meta de vendas' : 'o faturamento do mês com a meta de faturamento') : 'com a meta, quando ela estiver definida'}.
            {fechados.some(l => l.fonte === 'cliente') && ' "cliente" = vendas passadas por ele, sem CRM pra conferir.'}
          </div>
        </div>
      )}
    </div>
  )
}

// A meta do contrato — onde o cliente quer estar, POR MÊS, até o fim do contrato.
// Fica no projeto (não é uma linha do placar) e cada fechamento é lido contra ela.
const METRICAS_META: { k: string; col: string; l: string; fmt: (v: any) => string }[] = [
  { k: 'meta_leads', col: 'leads', l: 'leads', fmt: int },
  { k: 'meta_vendas', col: 'vendas', l: 'vendas', fmt: int },
  { k: 'meta_faturamento', col: 'comissao', l: 'faturamento', fmt: brl },
]

function MetaContrato({ projeto, atual, rotulo, aoMudar }: { projeto: any; atual: any; rotulo: string; aoMudar: () => void }) {
  const [editando, setEditando] = useState(false)
  const [msg, setMsg] = useState('')
  const deProjeto = () => ({
    meta_objetivo: projeto.meta_objetivo || '',
    meta_leads: projeto.meta_leads ?? '', meta_vendas: projeto.meta_vendas ?? '', meta_faturamento: projeto.meta_faturamento ?? '',
  })
  const [f, setF] = useState<any>(deProjeto())
  const temMeta = !!projeto.meta_objetivo || METRICAS_META.some(m => projeto[m.k] != null)

  async function salvar() {
    const j = await fetchAuth('/api/projetos/ficha', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: projeto.id, ...f }) })
      .then(r => r.json()).catch(() => ({ ok: false, error: 'falha de rede' }))
    if (j.ok) { setEditando(false); setMsg(''); aoMudar() } else setMsg('' + (j.error || 'falha'))
  }

  if (editando) return (
    <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--surface-2)' }}>
      <label style={lbl}>Objetivo do cliente pro contrato, nas palavras dele</label>
      <textarea style={{ ...inp, minHeight: 54, resize: 'vertical', fontFamily: 'inherit' }} value={f.meta_objetivo} onChange={e => setF({ ...f, meta_objetivo: e.target.value })}
        placeholder="ex: 8 Restaures por mês e o financeiro organizado" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8, marginTop: 8 }}>
        <div><label style={lbl}>Leads</label><input style={inp} value={f.meta_leads} onChange={e => setF({ ...f, meta_leads: e.target.value })} /></div>
        <div><label style={lbl}>Vendas</label><input style={inp} value={f.meta_vendas} onChange={e => setF({ ...f, meta_vendas: e.target.value })} /></div>
        <div><label style={lbl}>Faturamento</label><input style={inp} value={f.meta_faturamento} onChange={e => setF({ ...f, meta_faturamento: e.target.value })} placeholder="R$" /></div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={salvar} style={{ ...btn, background: 'var(--green)', color: '#fff' }}>Salvar meta</button>
        <button onClick={() => { setEditando(false); setF(deProjeto()) }} style={{ ...btn, background: 'var(--surface)', color: 'var(--text-2)' }}>Cancelar</button>
        <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>Por mês — cada fechamento é comparado com ela. Deixa em branco o número que não fizer sentido.</span>
      </div>
      {msg && <div style={{ fontSize: 12.5, color: 'var(--amber)', marginTop: 8 }}>{msg}</div>}
    </div>
  )

  if (!temMeta) return (
    <div style={{ background: 'var(--amber-bg)', borderRadius: 8, padding: '9px 11px', marginTop: 10, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.55, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
      <span><b style={{ color: 'var(--text)' }}>Falta a meta</b> — onde o cliente quer estar no fim do contrato. É o que diz, na renegociação, se o trabalho entregou.</span>
      <button onClick={() => { setF(deProjeto()); setEditando(true) }} style={{ ...btn, background: 'var(--accent)', color: '#fff' }}>Definir meta</button>
    </div>
  )

  const numeros = METRICAS_META.filter(m => projeto[m.k] != null)
  return (
    <div style={{ marginTop: 12, padding: '11px 12px', borderRadius: 8, background: 'var(--surface-2)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>Meta por mês até {br(projeto.data_fim)}</div>
        <button onClick={() => { setF(deProjeto()); setEditando(true) }} style={{ ...btn, background: 'none', color: 'var(--text-faint)', padding: '2px 5px', fontWeight: 400 }}>editar</button>
      </div>
      {projeto.meta_objetivo && <div style={{ fontSize: 13.5, color: 'var(--text)', marginTop: 4, lineHeight: 1.5 }}>{projeto.meta_objetivo}</div>}
      {!!numeros.length && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginTop: 10 }}>
          {numeros.map(m => {
            const alvo = Number(projeto[m.k])
            const agora = atual?.[m.col] != null ? Number(atual[m.col]) : null
            const p = agora != null && alvo > 0 ? Math.round((agora / alvo) * 100) : null
            return (
              <div key={m.k}>
                <div style={{ fontSize: 12, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
                  <b style={{ color: 'var(--text)' }}>{agora != null ? m.fmt(agora) : '—'}</b> de {m.fmt(alvo)} {m.l}
                </div>
                <div style={{ height: 6, borderRadius: 4, background: 'var(--border)', marginTop: 5, overflow: 'hidden' }}>
                  <div style={{ width: Math.min(100, p || 0) + '%', height: '100%', background: p != null && p >= 100 ? 'var(--green)' : 'var(--accent)' }} />
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 3 }}>{p != null ? `${p}% da meta${rotulo ? ' em ' + rotulo : ''}` : 'nenhum mês fechado ainda'}</div>
              </div>
            )
          })}
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
    if (!f.titulo.trim()) { setMsg('dá um título'); return }
    setEnviando(true); setMsg('')
    let arquivo: any = {}
    if (f.arquivo) {
      if (f.arquivo.type === 'application/pdf' && f.arquivo.size > 3 * 1024 * 1024) { setMsg('PDF acima de 3 MB — manda um print no lugar'); setEnviando(false); return }
      try { const c = await comprimir(f.arquivo); arquivo = { arquivo_base64: c.base64, arquivo_mime: c.mime } }
      catch { setMsg('não consegui ler o arquivo'); setEnviando(false); return }
    }
    const j = await post({ acao: 'registro_novo', projeto_id: projeto.id, tipo: f.arquivo ? 'prova' : f.tipo, frente: f.frente, titulo: f.titulo, descricao: f.descricao, data: f.data, autorizado_uso: f.autorizado_uso, dados_ocultos: f.dados_ocultos, ...arquivo })
    setEnviando(false)
    if (j.ok) { setAberto(false); setF(vazioForm()); aoMudar() } else setMsg('' + (j.error || 'falha'))
  }

  const liberadas = itens.filter(x => x.tipo === 'prova' && x.autorizado_uso === 'sim' && x.dados_ocultos).length
  const provas = itens.filter(x => x.tipo === 'prova').length

  return (
    <div style={{ ...card, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Resultados e provas</div>
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
