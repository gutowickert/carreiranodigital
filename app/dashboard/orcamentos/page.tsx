'use client'

import { useEffect, useState } from 'react'
import { fetchAuth } from '@/lib/api'
// o mesmo card do funil, que se carrega sozinho e abre por cima da tela — confere o lead sem sair daqui
import LeadCardModal from '@/components/LeadCard'

// GERAR ORÇAMENTO — passos 1 e 2: escolher o lead e preparar a proposta.
// A geração com IA (passo 3) entra depois; o botão já existe e avisa que está por vir.
//
// A tela está no menu, em Vendas, e liberada pro perfil de vendedor (components/Layout.tsx).
//
// De onde vem cada coisa:
//   /api/orcamentos/candidatos → leads que já falaram (ligação transcrita e/ou WhatsApp)
//   /api/orcamentos/preparar   → o material daquele lead, o produto e o preço DO CADASTRO

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 18 }
const inp: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 'var(--r)', padding: '9px 12px', fontSize: 14, color: 'var(--text)', width: '100%' }
const lbl: React.CSSProperties = { fontSize: 11.5, color: 'var(--text-faint)', display: 'block', marginBottom: 4 }
const btn: React.CSSProperties = { border: 'none', borderRadius: 'var(--r)', padding: '10px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }
const btnPrimario: React.CSSProperties = { ...btn, background: 'var(--grad)', color: '#fff' }
const btnSec: React.CSSProperties = { ...btn, background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border-strong)', fontWeight: 600 }
const rot: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--text-faint)' }

const dinheiro = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dia = (d?: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—')
const fone = (t?: string | null) => {
  const d = (t || '').replace(/\D/g, '').replace(/^55/, '')
  return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : t || '—'
}

/**
 * A TURMA DA PROPOSTA.
 *
 * ⚠️ SÓ APARECE PRA PRODUTO VENDIDO POR TURMA, e aí é OBRIGATÓRIA. Antes a data do curso era
 * digitada na capa: funciona no dia em que a pessoa lembra, e no dia em que não lembrar o cliente
 * recebe a data de uma turma que já passou. Quem decide se é obrigatória é o servidor
 * (lib/proposta-produtos); aqui a tela só mostra o que o servidor mandou.
 *
 * A lista já vem filtrada: só turma em vendas e que ainda não começou.
 */
function SeletorDeTurma({ produto, valor, onMuda }: { produto: any; valor: string; onMuda: (v: string) => void }) {
  if (!produto?.exige_turma) return null
  const turmas = produto.turmas || []
  return (
    <label style={{ display: 'block' }}>
      <span style={lbl}>Turma <b style={{ color: 'var(--red)' }}>*</b> — sai impressa na proposta</span>
      {turmas.length ? (
        <select style={{ ...inp, cursor: 'pointer', borderColor: valor ? 'var(--border-strong)' : 'var(--red)' }}
          value={valor} onChange={e => onMuda(e.target.value)}>
          <option value="">escolhe a turma…</option>
          {turmas.map((t: any) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
        </select>
      ) : (
        <p style={{ fontSize: 12.5, color: 'var(--amber)', margin: '2px 0 0' }}>
          Não há turma aberta deste curso. Cadastra a turma em Turmas antes de montar a proposta —
          sem data, ela não pode ser publicada.
        </p>
      )}
    </label>
  )
}

function Chip({ tom, children }: { tom: 'marca' | 'bom' | 'info' | 'atencao' | 'neutro'; children: React.ReactNode }) {
  const cores: Record<string, React.CSSProperties> = {
    marca: { background: 'var(--accent-bg)', color: 'var(--accent-soft)' },
    bom: { background: 'var(--green-bg)', color: 'var(--green)' },
    info: { background: 'var(--blue-bg)', color: 'var(--blue)' },
    atencao: { background: 'var(--amber-bg)', color: 'var(--amber)' },
    neutro: { background: 'var(--surface-2)', color: 'var(--text-faint)', border: '1px solid var(--border-strong)' },
  }
  return (
    <span style={{ ...cores[tom], display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 999, padding: '4px 10px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase' }}>
      {children}
    </span>
  )
}

export default function GerarOrcamento() {
  const [busca, setBusca] = useState('')
  const [itens, setItens] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)
  const [msg, setMsg] = useState('')

  const [leadId, setLeadId] = useState<string | null>(null)
  const [cardAberto, setCardAberto] = useState<string | null>(null)   // card do lead por cima da tela

  // passo 3: o rascunho gerado
  const [orc, setOrc] = useState<any>(null)
  const [medido, setMedido] = useState<any>(null)
  const [gerando, setGerando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState('')
  const [link, setLink] = useState('')   // endereço da proposta, depois de publicada
  const [dados, setDados] = useState<any>(null)
  // o nome que sai NA PROPOSTA (o cadastro do lead segue como está) e o produto escolhido
  const [clienteNome, setClienteNome] = useState('')
  const [produtoId, setProdutoId] = useState('')
  const [turmaId, setTurmaId] = useState('')
  const [preparando, setPreparando] = useState(false)

  // o que o vendedor escolhe/preenche no passo 2
  const [usar, setUsar] = useState<Record<string, boolean>>({})
  const [contexto, setContexto] = useState({ o_que_vende: '', regiao: '' })
  const [preco, setPreco] = useState({ vista: '', parcelas: '', parcelado: '' })

  async function carregar(q = '') {
    setCarregando(true)
    const j = await fetchAuth('/api/orcamentos/candidatos' + (q ? `?q=${encodeURIComponent(q)}` : '')).then(r => r.json()).catch(() => null)
    if (j?.ok) { setItens(j.itens || []); setMsg('') }
    // erro cru não ajuda ninguém: "sem sessao" quer dizer que o login caiu, e o caminho é entrar de novo
    else if (j?.error === 'sem sessao') { setItens([]); setMsg('Teu login caiu. Entra de novo pra continuar.') }
    else setMsg(j?.error || 'não consegui carregar os leads')
    setCarregando(false)
  }
  useEffect(() => { carregar() }, [])

  // busca com respiro: só consulta 400ms depois da última tecla
  useEffect(() => {
    const t = setTimeout(() => { carregar(busca.trim()) }, 400)
    return () => clearTimeout(t)
  }, [busca])

  async function preparar(id: string) {
    setLeadId(id); setDados(null); setPreparando(true); setMsg('')
    const j = await fetchAuth(`/api/orcamentos/preparar?lead_id=${id}`).then(r => r.json()).catch(() => null)
    setPreparando(false)
    if (!j?.ok) { setMsg(j?.error || 'não consegui preparar'); return }
    setDados(j)
    // por padrão, usa todo o material que existe: é o que descreve melhor a pessoa
    const marcados: Record<string, boolean> = {}
    for (const l of j.fontes.ligacoes) marcados['lig:' + l.id] = true
    for (const c of j.fontes.conversas) marcados['con:' + c.id] = true
    setUsar(marcados)
    setContexto({ o_que_vende: j.contexto.o_que_vende || '', regiao: j.contexto.regiao || '' })
    setClienteNome(j.lead?.nome || '')
    setProdutoId(j.produto_sugerido || '')
    // uma turma só? já deixa escolhida — obrigar a clicar no único item não protege ninguém
    const sug = (j.produtos || []).find((p: any) => p.id === j.produto_sugerido)
    setTurmaId(sug?.exige_turma && sug.turmas?.length === 1 ? sug.turmas[0].id : '')
    // o parcelamento vem sugerido pela convenção da escola (à vista + R$ 200, em 6x); dá pra trocar
    setPreco({
      vista: j.produto?.preco_vista != null ? String(j.produto.preco_vista) : '',
      parcelas: j.produto?.parcelas != null ? String(j.produto.parcelas) : '',
      parcelado: j.produto?.preco_parcelado != null ? String(j.produto.preco_parcelado) : '',
    })
  }

  async function gerar() {
    if (!dados) return
    setGerando(true); setMsg(''); setSalvo('')
    const corpo = {
      lead_id: dados.lead.id,
      ligacoes: dados.fontes.ligacoes.filter((l: any) => usar['lig:' + l.id]).map((l: any) => l.id),
      conversas: dados.fontes.conversas.filter((c: any) => usar['con:' + c.id]).map((c: any) => c.id),
      o_que_vende: contexto.o_que_vende,
      regiao: contexto.regiao,
      preco_vista: preco.vista,
      parcelas: preco.parcelas,
      preco_parcelado: preco.parcelado,
      cliente_nome: clienteNome,
      produto_id: produtoId || null,
      turma_id: turmaId || null,
    }
    const j = await fetchAuth('/api/orcamentos/gerar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
      .then(r => r.json()).catch(() => null)
    setGerando(false)
    if (!j?.ok) { setMsg(j?.error || 'não consegui gerar'); return }
    setOrc(j.orcamento); setMedido(j.medido)
  }

  // REABRIR UM RASCUNHO. O trabalho sempre foi salvo; faltava o caminho de volta — quem saía da tela
  // gerava outro do zero, e o lead ficava com dois orçamentos do mesmo dia.
  async function abrirAnterior(id: string) {
    setMsg(''); setSalvo('')
    const j = await fetchAuth(`/api/orcamentos/abrir?id=${id}`).then(r => r.json()).catch(() => null)
    // o aviso de erro mora no topo da página, longe do botão: sem levar a pessoa até ele, uma
    // falha fica tão silenciosa quanto o sucesso ficava
    if (!j?.ok) {
      setMsg(j?.error || 'não consegui abrir')
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 60)
      return
    }
    const o = j.orcamento
    setOrc(o); setMedido(null)
    setClienteNome(o.cliente_nome || dados?.lead?.nome || '')
    setProdutoId(o.produto_id || '')
    setTurmaId(o.turma_id || '')
    setPreco({
      vista: o.preco_vista != null ? String(o.preco_vista) : '',
      parcelas: o.parcelas != null ? String(o.parcelas) : '',
      parcelado: o.preco_parcelado != null ? String(o.preco_parcelado) : '',
    })
    // ⚠️ LEVA A PESSOA ATÉ O QUE ABRIU. O editor nasce bem abaixo desta lista, fora da tela: quem
    // clicava em "editar" via a página parada e concluía que o botão não funcionava. Funcionava —
    // só tinha aberto onde ninguém estava olhando.
    setTimeout(() => {
      document.getElementById('editor-proposta')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)
    setSalvo(o.aceito_em
      ? 'O cliente já aceitou esta proposta — ela virou o registro do combinado. Pra mudar, gera uma nova.'
      : o.situacao === 'publicado'
        ? 'Esta proposta já está no ar. O que tu salvar aqui muda a página do cliente na hora, no mesmo link — e fica registrado no histórico do lead.'
        : 'Rascunho reaberto.')
  }

  // o produto escolhido agora, com a lista de turmas que o servidor mandou
  const produtoEscolhido = (dados?.produtos || []).find((p: any) => p.id === produtoId) || null

  // o texto que vale: o que o vendedor escreveu, e na falta dele o que a IA escreveu
  const textoDaObjecao = (o: any) => (o.texto_final ?? o.texto_ia ?? '')

  function mexerNaObjecao(ordem: number, mudanca: any) {
    setOrc((o: any) => ({ ...o, objecoes: (o.objecoes || []).map((x: any) => (x.ordem === ordem ? { ...x, ...mudanca } : x)) }))
    setSalvo('')
  }

  async function publicar() {
    if (!orc) return
    setSalvando(true); setMsg('')
    // salva antes de publicar: o que está na tela é o que o cliente vai ler
    const s = await fetchAuth('/api/orcamentos/salvar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: orc.id, capa: orc.capa, objecoes: orc.objecoes, preco_vista: preco.vista, parcelas: preco.parcelas, preco_parcelado: preco.parcelado, cliente_nome: clienteNome, turma_id: turmaId || null }) })
      .then(r => r.json()).catch(() => null)
    if (!s?.ok) { setSalvando(false); setMsg(s?.error || 'não consegui salvar antes de publicar'); return }

    const j = await fetchAuth('/api/orcamentos/publicar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: orc.id }) })
      .then(r => r.json()).catch(() => null)
    setSalvando(false)
    if (!j?.ok) { setMsg(j?.error || 'não consegui publicar'); return }
    setOrc((o: any) => ({ ...o, situacao: 'publicado', slug: j.slug }))
    setLink(j.url)
    try { await navigator.clipboard.writeText(j.url); setSalvo('Link copiado.') } catch { setSalvo('Publicado.') }
  }

  async function salvarRascunho() {
    if (!orc) return
    setSalvando(true)
    const j = await fetchAuth('/api/orcamentos/salvar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: orc.id, capa: orc.capa, objecoes: orc.objecoes, preco_vista: preco.vista, parcelas: preco.parcelas, preco_parcelado: preco.parcelado, cliente_nome: clienteNome, turma_id: turmaId || null }) })
      .then(r => r.json()).catch(() => null)
    setSalvando(false)
    if (!j?.ok) { setMsg(j?.error || 'não consegui salvar'); return }
    setOrc(j.orcamento); setSalvo('Rascunho salvo.')
  }

  const voltar = () => { setLeadId(null); setDados(null); setUsar({}); setOrc(null); setMedido(null); setMsg(''); setSalvo('') }
  const marcadas = Object.values(usar).filter(Boolean).length

  return (
    <div style={{ padding: '28px clamp(16px, 4vw, 32px)', maxWidth: 1080, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="display" style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Gerar orçamento</h1>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 0' }}>
            A proposta sai do que a pessoa já disse — ligação ou WhatsApp — com o preço do cadastro.
          </p>
        </div>
      </div>

      {msg && <div style={{ ...card, marginTop: 14, color: 'var(--amber)', fontSize: 13.5 }}>{msg}</div>}

      {/* o card do lead por cima da tela: confere, fecha, e segue de onde parou */}
      {cardAberto && <LeadCardModal leadId={cardAberto} onClose={() => setCardAberto(null)} />}

      {/* ─────────── passo 1: escolher o lead */}
      {!leadId && (
        <div style={{ ...card, marginTop: 16 }}>
          <div style={rot}>Passo 1 · quem vai receber</div>
          <input
            style={{ ...inp, marginTop: 10 }}
            placeholder="Buscar por nome ou telefone"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            aria-label="Buscar lead"
          />

          {carregando && <p style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 14 }}>Procurando quem tem conversa pra virar proposta…</p>}

          {/* sem aviso de erro em cima: senão a tela diz "ninguém por aqui" quando o problema foi o login */}
          {!carregando && !itens.length && !msg && (
            <p style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 14 }}>
              Ninguém por aqui. Entram os leads com ligação transcrita ou conversa de WhatsApp nos últimos 30 dias.
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
            {itens.map(i => (
              <button key={i.lead_id} onClick={() => preparar(i.lead_id)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', textAlign: 'left', width: '100%', cursor: 'pointer', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '12px 14px' }}>
                <span style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <span style={{ fontWeight: 700, color: 'var(--text)' }}>{i.nome}</span>
                  <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-faint)', marginTop: 3 }}>
                    {[
                      i.fontes.ligacao && `ligação de ${i.fontes.ligacao.minutos} min em ${dia(i.fontes.ligacao.em)}`,
                      i.fontes.conversa && `${i.fontes.conversa.mensagens} mensagens (${i.fontes.conversa.doCliente} do cliente)`,
                    ].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Chip tom="marca">{i.etapa_label}</Chip>
                  {i.intencao === 'upsell' && <Chip tom="bom">Cliente · upsell</Chip>}
                  {i.intencao === 'retomada' && <Chip tom="info">Retomada</Chip>}
                  {i.material === 'curto' && <Chip tom="neutro">Material curto</Chip>}
                </span>
                {/* confere se é a pessoa certa SEM sair daqui: o card abre por cima, fecha e segue */}
                <span role="button" tabIndex={0}
                  onClick={e => { e.stopPropagation(); setCardAberto(i.lead_id) }}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); setCardAberto(i.lead_id) } }}
                  style={{ fontSize: 12.5, color: 'var(--text-muted)', textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer' }}>
                  ver card
                </span>
                <span style={{ ...btnSec, padding: '8px 13px' }}>Preparar</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─────────── passo 2: preparar */}
      {leadId && (
        <>
          {preparando && <div style={{ ...card, marginTop: 16, color: 'var(--text-faint)', fontSize: 13.5 }}>Lendo o que essa pessoa já disse…</div>}

          {dados && (
            <>
              <div style={{ ...card, marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div>
                    <div style={rot}>Passo 2 · preparar</div>
                    <h2 style={{ fontSize: 19, fontWeight: 800, margin: '6px 0 2px' }}>{dados.lead.nome}</h2>
                    <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: 0 }}>
                      {fone(dados.lead.whatsapp)} · {dados.lead.etapa_label} · veio de {dados.lead.origem || '—'}
                      {dados.lead.campanha ? ` · ${dados.lead.campanha}` : ''}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => setCardAberto(dados.lead.id)} style={btnSec}>Abrir card</button>
                    <button onClick={voltar} style={btnSec}>Trocar de lead</button>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 14, marginTop: 14 }}>
                {/* o que a IA vai ler */}
                <div style={card}>
                  <div style={rot}>O que a IA vai ler</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                    {dados.fontes.ligacoes.map((l: any) => {
                      const chave = 'lig:' + l.id
                      return (
                        <button key={chave} onClick={() => setUsar(u => ({ ...u, [chave]: !u[chave] }))}
                          style={{ display: 'flex', gap: 10, textAlign: 'left', cursor: 'pointer', background: usar[chave] ? 'var(--accent-bg)' : 'var(--surface-2)', border: `1px solid ${usar[chave] ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 'var(--r)', padding: 12 }}>
                          <span style={{ flex: 'none', width: 18, height: 18, borderRadius: 5, display: 'grid', placeItems: 'center', fontSize: 11, background: usar[chave] ? 'var(--accent)' : 'var(--surface)', border: '1.5px solid var(--border-strong)', color: '#fff' }}>{usar[chave] ? '✓' : ''}</span>
                          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                            <b style={{ color: 'var(--text)' }}>Ligação de {l.minutos} min · {dia(l.em)}</b>
                            <span style={{ display: 'block', marginTop: 6, paddingLeft: 10, borderLeft: '2px solid var(--border-strong)', color: 'var(--text-faint)', fontStyle: 'italic' }}>
                              {l.trecho.slice(0, 150)}…
                            </span>
                          </span>
                        </button>
                      )
                    })}

                    {dados.fontes.conversas.map((c: any) => {
                      const chave = 'con:' + c.id
                      return (
                        <button key={chave} onClick={() => setUsar(u => ({ ...u, [chave]: !u[chave] }))}
                          style={{ display: 'flex', gap: 10, textAlign: 'left', cursor: 'pointer', background: usar[chave] ? 'var(--accent-bg)' : 'var(--surface-2)', border: `1px solid ${usar[chave] ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 'var(--r)', padding: 12 }}>
                          <span style={{ flex: 'none', width: 18, height: 18, borderRadius: 5, display: 'grid', placeItems: 'center', fontSize: 11, background: usar[chave] ? 'var(--accent)' : 'var(--surface)', border: '1.5px solid var(--border-strong)', color: '#fff' }}>{usar[chave] ? '✓' : ''}</span>
                          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                            <b style={{ color: 'var(--text)' }}>WhatsApp · {c.mensagens} mensagens ({c.do_cliente} do cliente)</b>
                            {c.trechos.slice(0, 2).map((t: string, n: number) => (
                              <span key={n} style={{ display: 'block', marginTop: 6, paddingLeft: 10, borderLeft: '2px solid var(--border-strong)', color: 'var(--text-faint)', fontStyle: 'italic' }}>
                                “{t.slice(0, 120)}”
                              </span>
                            ))}
                          </span>
                        </button>
                      )
                    })}

                    {!dados.fontes.ligacoes.length && !dados.fontes.conversas.length && (
                      <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Nada gravado por aqui. A proposta sai no modelo padrão, sem a página de objeções.</p>
                    )}
                  </div>
                  {dados.fontes.material === 'curto' && (
                    <p style={{ fontSize: 12.5, color: 'var(--amber)', marginTop: 10 }}>
                      Material curto. Dá pra gerar, mas provavelmente sem objeções pra responder.
                    </p>
                  )}
                </div>

                {/* o que a IA não tem como saber */}
                <div style={card}>
                  <div style={rot}>O que a IA não tem como saber</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                    <label style={{ display: 'block' }}>
                      <span style={lbl}>O que o negócio dele vende, em uma linha</span>
                      <input style={inp} value={contexto.o_que_vende} placeholder="ex.: material elétrico: cabos, disjuntores, iluminação"
                        onChange={e => setContexto(c => ({ ...c, o_que_vende: e.target.value }))} />
                    </label>
                    <label style={{ display: 'block' }}>
                      <span style={lbl}>Região que ele atende</span>
                      <input style={inp} value={contexto.regiao} placeholder="ex.: Vale do Taquari"
                        onChange={e => setContexto(c => ({ ...c, regiao: e.target.value }))} />
                    </label>
                    <p style={{ fontSize: 12.5, color: 'var(--text-faint)', margin: 0 }}>
                      Em branco, a IA não inventa: escreve sem exemplo de produto.
                    </p>
                  </div>
                </div>

                {/* produto e preço */}
                <div style={card}>
                  <div style={rot}>Produto e condição</div>
                  {dados.produtos?.length ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                      {/* O NOME QUE SAI NA PROPOSTA. O cadastro costuma ter o apelido do WhatsApp —
                          "Jose Poa 2" saiu na capa e no endereço do link. Mudar aqui não mexe no lead. */}
                      <label style={{ display: 'block' }}>
                        <span style={lbl}>Nome do cliente na proposta (no cadastro: {dados.lead.nome})</span>
                        <input style={inp} value={clienteNome} onChange={e => setClienteNome(e.target.value)}
                          placeholder="como o cliente se chama de verdade" />
                      </label>

                      {/* O PRODUTO. Antes vinha travado na turma do lead — que pode ser o curso que
                          ele JÁ fez, e foi o que aconteceu. Só aparecem produtos com proposta escrita. */}
                      <label style={{ display: 'block' }}>
                        <span style={lbl}>Produto desta proposta</span>
                        <select style={{ ...inp, cursor: 'pointer' }} value={produtoId}
                          onChange={e => {
                            setProdutoId(e.target.value)
                            const p = dados.produtos.find((x: any) => x.id === e.target.value)
                            // turma de um curso não vale pro outro: some junto com o produto antigo
                            setTurmaId(p?.exige_turma && p.turmas?.length === 1 ? p.turmas[0].id : '')
                            if (p?.preco_venda != null) setPreco(v => ({ ...v, vista: String(p.preco_venda) }))
                          }}>
                          <option value="">escolhe o produto…</option>
                          {dados.produtos.map((p: any) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                        </select>
                      </label>
                      {dados.produto_da_turma && produtoId && dados.produto_da_turma.id !== produtoId && (
                        <p style={{ fontSize: 12.5, color: 'var(--amber)', margin: 0 }}>
                          No CRM este lead está ligado a <b>{dados.produto_da_turma.nome}</b>. A proposta vai sair com o produto escolhido acima — confere se é o certo.
                        </p>
                      )}
                      <SeletorDeTurma produto={produtoEscolhido} valor={turmaId} onMuda={setTurmaId} />

                      <label style={{ display: 'block' }}>
                        <span style={lbl}>À vista{dados.produto?.preco_vista != null ? ` (do cadastro: ${dinheiro(dados.produto.preco_vista)} · ${dados.produto.origem_preco})` : ''}</span>
                        <input style={inp} value={preco.vista} onChange={e => setPreco(p => ({ ...p, vista: e.target.value }))} inputMode="decimal" />
                      </label>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <label style={{ flex: '1 1 110px' }}>
                          <span style={lbl}>Parcelas</span>
                          <input style={inp} value={preco.parcelas} placeholder="ex.: 6" inputMode="numeric"
                            onChange={e => setPreco(p => ({ ...p, parcelas: e.target.value }))} />
                        </label>
                        <label style={{ flex: '1 1 140px' }}>
                          <span style={lbl}>Valor da parcela</span>
                          <input style={inp} value={preco.parcelado} placeholder="ex.: 499,50" inputMode="decimal"
                            onChange={e => setPreco(p => ({ ...p, parcelado: e.target.value }))} />
                        </label>
                      </div>
                      <p style={{ fontSize: 12.5, color: 'var(--blue)', margin: 0 }}>
                        O preço nunca sai da conversa: vem do cadastro. Se tu mudar aqui, fica registrado quem mudou.
                      </p>
                    </div>
                  ) : (
                    <p style={{ fontSize: 13, color: 'var(--amber)', marginTop: 10 }}>
                      Nenhum produto tem proposta escrita ainda. Hoje só o Deu Venda tem — pra oferecer outro, o texto dele precisa ser escrito antes.
                    </p>
                  )}
                </div>
              </div>

              {/* JÁ FEITOS PRA ESTE LEAD. Isto aqui era uma frase solta dizendo "1 orçamento(s)
                  anterior(es)", sem nada pra clicar: o rascunho ficava salvo e inalcançável, e quem
                  voltava na tela gerava outro do zero. Agora abre. */}
              {dados.anteriores?.length > 0 && (
                <div style={{ ...card, marginTop: 14 }}>
                  <div style={rot}>Já feitos pra este lead</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                    {dados.anteriores.map((a: any) => (
                      <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                        <Chip tom={a.situacao === 'publicado' ? 'bom' : 'neutro'}>{a.situacao === 'publicado' ? 'publicado' : 'rascunho'}</Chip>
                        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {a.titulo || 'sem título ainda'}
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>
                            {new Date(a.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}
                            {a.produto_nome ? ` · ${a.produto_nome}` : ''}
                            {a.cliente_nome ? ` · como "${a.cliente_nome}"` : ''}
                          </div>
                        </div>
                        {a.situacao === 'publicado' && a.slug && (
                          <a href={`/proposta/${a.slug}?eu=1`} target="_blank" rel="noopener" style={{ ...btnSec, textDecoration: 'none' }} title="Abre sem contar como abertura do cliente">ver</a>
                        )}
                        {/* O botão diz o que ele FAZ. Enquanto publicado não se editava, "abrir"
                            era honesto; agora edita, e ninguém procura edição atrás de "abrir" —
                            o Rick não achou onde mexer na proposta do Pires. */}
                        <button onClick={() => abrirAnterior(a.id)} style={a.situacao === 'publicado' && !a.aceito_em ? btnPrimario : btnSec}>
                          {a.situacao === 'publicado' ? (a.aceito_em ? 'ver (aceita)' : 'editar') : 'continuar este rascunho'}
                        </button>
                      </div>
                    ))}
                  </div>
                  {dados.anteriores.some((a: any) => a.situacao === 'rascunho') && (
                    <p style={{ fontSize: 12.5, color: 'var(--amber)', margin: '10px 0 0' }}>
                      Já existe rascunho deste lead. Continua ele em vez de gerar outro — gerar de novo cria mais um e gasta IA à toa.
                    </p>
                  )}
                </div>
              )}

              {/* barra de ação */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 16 }}>
                <button onClick={gerar} disabled={gerando || !marcadas}
                  style={{ ...btnPrimario, opacity: gerando || !marcadas ? .55 : 1, cursor: gerando || !marcadas ? 'not-allowed' : 'pointer' }}>
                  {gerando ? 'Lendo a conversa e escrevendo…' : orc ? 'Gerar de novo' : 'Gerar rascunho'}
                </button>
                <button onClick={voltar} style={btnSec}>Voltar</button>
                <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>
                  {marcadas} fonte{marcadas === 1 ? '' : 's'} marcada{marcadas === 1 ? '' : 's'} · {dados.fontes.caracteres.toLocaleString('pt-BR')} caracteres de conversa

                </span>
              </div>
              {gerando && <p style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 8 }}>Leva uns 30 segundos numa ligação longa.</p>}

              {/* ─────────── passo 3: revisar, editar e aprovar */}
              {orc && (
                <div id="editor-proposta" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 14, marginTop: 16 }}>
                  {/* capa */}
                  <div style={card}>
                    <div style={rot}>Passo 3 · a capa da proposta</div>
                    <p style={{ fontSize: 12.5, color: 'var(--text-faint)', margin: '6px 0 12px' }}>
                      Escreve por cima à vontade: o que ficar aqui é o que o cliente lê.
                    </p>
                    <label style={{ display: 'block', marginBottom: 10 }}>
                      <span style={lbl}>Título</span>
                      <input style={inp} value={orc.capa?.titulo || ''}
                        onChange={e => { setOrc((o: any) => ({ ...o, capa: { ...o.capa, titulo: e.target.value } })); setSalvo('') }} />
                    </label>
                    <label style={{ display: 'block' }}>
                      <span style={lbl}>Subtítulo</span>
                      <textarea style={{ ...inp, minHeight: 90, resize: 'vertical' }} value={orc.capa?.subtitulo || ''}
                        onChange={e => { setOrc((o: any) => ({ ...o, capa: { ...o.capa, subtitulo: e.target.value } })); setSalvo('') }} />
                    </label>

                    {/* ⚠️ O VALOR SE EDITA AQUI, ONDE SE EDITA O RESTO.
                        Estes campos já existiam — lá em cima, no passo 2, que é a parte de GERAR.
                        Quem abria uma proposta publicada caía direto no passo 3 e via só capa e
                        objeções: concluía, com razão, que preço e parcelamento não davam pra
                        mexer. O que é editável precisa estar no lugar onde se edita.
                        É o MESMO estado dos campos de cima — mudar num muda no outro. */}
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                      <div style={rot}>Turma, valor e parcelamento</div>
                      <div style={{ marginTop: 10 }}>
                        <SeletorDeTurma produto={produtoEscolhido} valor={turmaId} onMuda={v => { setTurmaId(v); setSalvo('') }} />
                      </div>
                      <label style={{ display: 'block', marginTop: 10 }}>
                        <span style={lbl}>Nome do cliente na proposta (o cadastro do lead não muda)</span>
                        <input style={inp} value={clienteNome}
                          onChange={e => { setClienteNome(e.target.value); setSalvo('') }} />
                      </label>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                        <label style={{ flex: '1 1 130px' }}>
                          <span style={lbl}>À vista</span>
                          <input style={inp} value={preco.vista} inputMode="decimal"
                            onChange={e => { setPreco(p => ({ ...p, vista: e.target.value })); setSalvo('') }} />
                        </label>
                        <label style={{ flex: '0 1 90px' }}>
                          <span style={lbl}>Parcelas</span>
                          <input style={inp} value={preco.parcelas} placeholder="ex.: 6" inputMode="numeric"
                            onChange={e => { setPreco(p => ({ ...p, parcelas: e.target.value })); setSalvo('') }} />
                        </label>
                        <label style={{ flex: '1 1 130px' }}>
                          <span style={lbl}>Valor da parcela</span>
                          <input style={inp} value={preco.parcelado} placeholder="ex.: 499,50" inputMode="decimal"
                            onChange={e => { setPreco(p => ({ ...p, parcelado: e.target.value })); setSalvo('') }} />
                        </label>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '9px 0 0' }}>
                        Deixa parcelas e valor da parcela em branco pra proposta sair só com o à vista.
                      </p>
                    </div>

                    {medido && (
                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>
                          {medido.tokens_entrada.toLocaleString('pt-BR')} tokens lidos · {medido.tokens_saida.toLocaleString('pt-BR')} escritos ·{' '}
                          <b style={{ color: 'var(--text-2)' }}>US$ {medido.custo_usd.toFixed(3)}</b>
                        </span>
                        {medido.descartadas > 0 && (
                          <span style={{ fontSize: 12.5, color: 'var(--amber)' }}>
                            {medido.descartadas} resposta(s) descartada(s): a citação não existia na conversa.
                          </span>
                        )}
                        {medido.sem_material && (
                          <span style={{ fontSize: 12.5, color: 'var(--amber)' }}>Material curto demais: saiu sem objeções.</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* objeções */}
                  <div style={card}>
                    <div style={rot}>O que a IA ouviu</div>
                    <p style={{ fontSize: 12.5, color: 'var(--text-faint)', margin: '6px 0 12px' }}>
                      Cada ponto cita uma frase da conversa. Aprova, reescreve, ou tira.
                    </p>

                    {!orc.objecoes?.length && (
                      <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>
                        Nenhuma objeção encontrada nesse material. A proposta sai no modelo padrão.
                      </p>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {(orc.objecoes || []).map((o: any) => (
                        <div key={o.ordem} style={{
                          background: 'var(--surface-2)', borderRadius: 'var(--r)', padding: 13,
                          border: `1px solid ${o.situacao === 'aprovada' ? 'var(--green)' : o.situacao === 'fora' ? 'var(--border)' : 'var(--border-strong)'}`,
                          opacity: o.situacao === 'fora' ? .5 : 1,
                        }}>
                          <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)' }}>{o.titulo}</div>
                          <div style={{ fontSize: 12.5, color: 'var(--text-faint)', fontStyle: 'italic', margin: '7px 0', paddingLeft: 10, borderLeft: '2px solid var(--accent)' }}>
                            “{o.citacao}”
                          </div>
                          <textarea
                            style={{ ...inp, minHeight: 86, resize: 'vertical', fontSize: 13 }}
                            value={textoDaObjecao(o)}
                            onChange={e => mexerNaObjecao(o.ordem, { texto_final: e.target.value })}
                          />
                          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 9, alignItems: 'center' }}>
                            <button onClick={() => mexerNaObjecao(o.ordem, { situacao: o.situacao === 'aprovada' ? 'pendente' : 'aprovada' })}
                              style={{ ...btnSec, padding: '6px 12px', fontSize: 12.5, ...(o.situacao === 'aprovada' ? { background: 'var(--green-bg)', color: 'var(--green)', borderColor: 'var(--green)' } : {}) }}>
                              {o.situacao === 'aprovada' ? '✓ Aprovada' : 'Aprovar'}
                            </button>
                            <button onClick={() => mexerNaObjecao(o.ordem, { situacao: o.situacao === 'fora' ? 'pendente' : 'fora' })}
                              style={{ ...btnSec, padding: '6px 12px', fontSize: 12.5, ...(o.situacao === 'fora' ? { background: 'var(--red-bg)', color: 'var(--red)', borderColor: 'var(--red)' } : {}) }}>
                              {o.situacao === 'fora' ? 'Fora da proposta' : 'Tirar'}
                            </button>
                            {o.texto_final && o.texto_final !== o.texto_ia && (
                              <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>reescrito por ti</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                      {/* O botão diz o que vai acontecer. Em rascunho, guarda; no ar, publica a
                          mudança na hora, no mesmo link — e quem clica precisa saber disso antes. */}
                      <button onClick={salvarRascunho} disabled={salvando || !!orc.aceito_em} style={{ ...btnPrimario, opacity: salvando || orc.aceito_em ? .6 : 1 }}>
                        {salvando ? 'Salvando…' : orc.situacao === 'publicado' ? 'Salvar e atualizar a página do cliente' : 'Salvar rascunho'}
                      </button>
                      {/* VER COMO FICOU, SEM PUBLICAR. Publicar é caminho sem volta — dali em
                          diante existe uma proposta no ar, pronta pra ser mandada. Conferir o
                          resultado não podia custar isso. Salva antes de abrir, senão a prévia
                          mostraria a versão anterior e a pessoa conferiria a proposta errada. */}
                      <button onClick={async () => {
                        // ⚠️ A ABA ABRE ANTES DO SALVAR. `window.open` depois de um `await` perde o
                        // vínculo com o clique e o navegador bloqueia como pop-up — o botão
                        // pareceria quebrado sem nenhum erro na tela.
                        const aba = window.open('', '_blank')
                        if (!orc.aceito_em) await salvarRascunho()
                        if (aba) aba.location.href = `/proposta/${orc.id}`
                      }} disabled={salvando} style={{ ...btnSec, opacity: salvando ? .55 : 1 }}>
                        👁️ Ver como ficou
                      </button>
                      <button onClick={publicar} disabled={salvando || orc.situacao === 'publicado'}
                        style={{ ...btnSec, opacity: salvando || orc.situacao === 'publicado' ? .55 : 1 }}>
                        {orc.situacao === 'publicado' ? 'Publicada' : 'Publicar e copiar link'}
                      </button>
                      {salvo && <span style={{ fontSize: 12.5, color: 'var(--green)' }}>{salvo}</span>}
                    </div>

                    {link && (
                      <div style={{ marginTop: 12, padding: 12, background: 'var(--surface-2)', border: '1px solid var(--green)', borderRadius: 'var(--r)', display: 'flex', flexDirection: 'column', gap: 9 }}>
                        <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>O link da proposta — abre sem login, em qualquer celular:</span>
                        <a href={link} target="_blank" rel="noopener" style={{ fontSize: 13.5, color: 'var(--accent-soft)', wordBreak: 'break-all' }}>{link}</a>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button onClick={() => { navigator.clipboard?.writeText(link); setSalvo('Link copiado.') }} style={{ ...btnSec, padding: '7px 13px', fontSize: 12.5 }}>Copiar de novo</button>
                          {/* a mensagem se apresenta: quem manda, o que é e que abre no navegador.
                              Link solto, sem contexto, é o que faz o cliente pensar em golpe. */}
                          {dados.lead.whatsapp && (
                            <a href={`https://wa.me/${(dados.lead.whatsapp || '').replace(/\D/g, '')}?text=${encodeURIComponent(
                              `Oi ${dados.lead.nome.split(' ')[0]}, aqui é da Carreira no Digital. Segue a proposta${orc.produto_nome ? ` do ${orc.produto_nome}` : ''} que a gente conversou: ${link} — é a nossa página, abre direto no navegador. Qualquer dúvida me chama por aqui.`)}`}
                              target="_blank" rel="noopener" style={{ ...btnSec, padding: '7px 13px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
                              Enviar no WhatsApp
                            </a>
                          )}
                          <a href={link} target="_blank" rel="noopener" style={{ ...btnSec, padding: '7px 13px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Abrir pra conferir</a>
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                          Quem abrir o link fica registrado. Publicada, a proposta não muda mais: pra corrigir, gera outra.
                        </span>
                      </div>
                    )}

                    <p style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 8 }}>
                      Publicar não mexe na etapa do funil nem cria tarefa: só deixa a proposta pronta pra enviar.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
