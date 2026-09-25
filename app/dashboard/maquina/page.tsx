'use client'

import { useEffect, useRef, useState } from 'react'
import Layout from '@/components/Layout'
import { fetchAuth } from '@/lib/api'
import { supabase } from '@/lib/supabase'

// A MÁQUINA CND — a máquina do cliente dentro do sistema dele.
//
// ⚠️ A DIFERENÇA ENTRE ISTO E O CLAUDE.AI NÃO É INTELIGÊNCIA, É VER. Lá a página de oferta aparece
// montada do lado da conversa, com cor e botão, e a pessoa diz "muda esse título" olhando pra ela.
// Se aqui saísse o código, ela leria em vez de ver — e voltaria pro site. Por isso peça em HTML é
// mostrada RENDERIZADA, num quadro isolado, tanto na lista quanto na hora em que nasce.
//
// ⚠️ E NÃO É UM FORMULÁRIO DE PEDIDO. Quem chega sem saber o que quer — que é o caso mais comum —
// não pode ficar travado na porta. Os atalhos ficam como sugestão; a conversa é livre.
//
// ⚠️ UMA TELA, DOIS NOMES. O nome ("Máquina CND", "Studio Mkt") e o modo (geral / marketing)
// vêm de organizacoes.config.maquina, pela rota de peças. O modo só troca os atalhos e o texto de
// abertura — o motor é o mesmo.

type Anexo = { nome: string; tipo: 'image' | 'document'; media_type: string; data: string; url?: string }
type Pendencia = { id: string; tipo: string; acao?: string; [k: string]: any; _feita?: string }
type Msg = { role: 'user' | 'assistant'; content: string; anexos?: Anexo[]; fontes?: string[]; salvas?: PecaMini[]; pendencias?: Pendencia[] }
type PecaMini = { id: string; titulo: string; tipo: string; formato: string; conteudo?: string }
type Peca = PecaMini & { conteudo: string; situacao: string; criado_em: string; autor: string | null }
type Atalho = { nome: string; icone: string; faz: string; abre: string }

// ⚠️ CADA ATALHO DIZ O QUE VAI ACONTECER. A primeira versão era só nome + emoji ("Um lead", "A IA
// de vendas") e o dono não soube dizer o que cada um fazia. Verbo no nome, uma linha embaixo, e a
// frase que ele coloca no campo já meio pronta — a pessoa só completa.
const ATALHOS: Record<'geral' | 'marketing', Atalho[]> = {
  geral: [
    { nome: 'Resumo da semana', icone: '📊', faz: 'vendas, leads novos, perdas', abre: 'Me conta como foi a semana: vendas, leads novos, o que se perdeu e por quê.' },
    { nome: 'Por que estamos perdendo', icone: '🕳️', faz: 'motivos de perda e o que fazer', abre: 'Quais os principais motivos de perda dos últimos 30 dias, e o que tu faria a respeito?' },
    { nome: 'Ver um lead', icone: '👤', faz: 'histórico e situação de alguém', abre: 'Me mostra tudo sobre o lead ' },
    { nome: 'Testar a IA de vendas', icone: '🤖', faz: 'simula o que ela responderia', abre: 'Simula o que a IA de vendas responderia se um lead dissesse: ' },
    { nome: 'Escrever um anúncio', icone: '📣', faz: 'texto pronto pra subir', abre: 'Quero um anúncio para ' },
    { nome: 'Montar uma página', icone: '📄', faz: 'página de oferta que dá pra ver', abre: 'Monta uma página de oferta para ' },
    { nome: 'Pesquisar na internet', icone: '🔎', faz: 'concorrente, mercado, um dado', abre: 'Pesquisa na internet ' },
    { nome: 'Pensar junto', icone: '💭', faz: 'trocar ideia antes de decidir', abre: 'Estou pensando em ' },
  ],
  marketing: [
    { nome: 'Escrever um anúncio', icone: '📣', faz: 'texto pronto pra subir', abre: 'Quero um anúncio para ' },
    { nome: 'Fazer um carrossel', icone: '🎠', faz: 'cada tela já escrita', abre: 'Quero um carrossel sobre ' },
    { nome: 'Roteiro de vídeo', icone: '🎬', faz: 'o que falar em cada parte', abre: 'Quero um roteiro de vídeo sobre ' },
    { nome: 'Legenda de post', icone: '✍️', faz: 'pronta pra colar', abre: 'Quero uma legenda para um post sobre ' },
    { nome: 'Montar uma página', icone: '📄', faz: 'página de oferta que dá pra ver', abre: 'Monta uma página de oferta para ' },
    { nome: 'Responder no WhatsApp', icone: '💬', faz: 'resposta pra um cliente', abre: 'O cliente perguntou: ' },
    { nome: 'Pesquisar na internet', icone: '🔎', faz: 'concorrente, mercado, um dado', abre: 'Pesquisa na internet ' },
    { nome: 'Pensar junto', icone: '💭', faz: 'trocar ideia antes de decidir', abre: 'Estou pensando em ' },
  ],
}
const NOME_TIPO: Record<string, string> = {
  anuncio: 'Anúncio', carrossel: 'Carrossel', roteiro: 'Roteiro', legenda: 'Legenda',
  pagina: 'Página', resposta_whatsapp: 'Resposta WhatsApp', painel: 'Painel', outro: 'Outro',
}

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 16 }
const btn: React.CSSProperties = { border: 'none', borderRadius: 'var(--r)', padding: '10px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }
const btnPri: React.CSSProperties = { ...btn, background: 'var(--grad)', color: '#fff' }
const btnSec: React.CSSProperties = { ...btn, background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border-strong)', fontWeight: 600 }
const rot: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--text-faint)' }

const dia = (d: string) => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })

/** A PEÇA QUE SE OLHA. Quadro isolado (sandbox sem permissão nenhuma): mostra cor, fonte e botão,
 *  mas não roda script nem sai pra lugar nenhum — é uma prévia, não um site no ar. */
function Quadro({ html, alto = 560 }: { html: string; alto?: number }) {
  return (
    <iframe title="prévia" sandbox="" srcDoc={html}
      style={{ width: '100%', height: alto, border: '1px solid var(--border-strong)', borderRadius: 'var(--r)', background: '#fff', resize: 'vertical' }} />
  )
}

/** A proposta em português, não em JSON — é o que a pessoa lê antes de confirmar. */
function descreve(p: Pendencia): string {
  if (p.tipo === 'despesas') return `Lançar ${(p.itens || []).length} despesa(s):\n` + (p.itens || []).map((d: any) => `  ${d.data} · ${d.descricao} · R$ ${d.valor} · ${d.natureza || d.categoria}${d.status === 'previsto' ? ' (previsto)' : ''}`).join('\n')
  if (p.tipo === 'lead') return `${p.acao === 'criar' ? 'Criar lead' : `Atualizar lead "${p.busca}"`}:\n` + Object.entries(p.dados || {}).map(([k, v]) => `  ${k}: ${v}`).join('\n')
  if (p.tipo === 'regra_ia') return p.acao === 'remover' ? `Remover a regra ${p.id}` : `Nova regra pra IA de vendas:\n  "${p.texto}"`
  if (p.tipo === 'fluxo') return `Mudar o fluxo comercial: ${p.acao}${p.etapa ? ` · etapa ${p.etapa}` : ''}${p.tarefa ? ` · tarefa ${p.tarefa}` : ''}\n` + (p.campos ? Object.entries(p.campos).map(([k, v]) => `  ${k}: ${v}`).join('\n') : (p.texto || ''))
  return JSON.stringify(p, null, 1)
}

function abrirEmAba(html: string) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export default function Maquina() {
  const [cfg, setCfg] = useState<{ nome: string; modo: 'geral' | 'marketing' }>({ nome: 'Máquina CND', modo: 'geral' })
  const [aba, setAba] = useState<'trabalhar' | 'pecas'>('trabalhar')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [anexos, setAnexos] = useState<Anexo[]>([])
  const [pensando, setPensando] = useState(false)
  const [erro, setErro] = useState('')
  const [status, setStatus] = useState('')
  const [pecas, setPecas] = useState<Peca[]>([])
  const [aberta, setAberta] = useState<string | null>(null)
  const fim = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLTextAreaElement>(null)
  const arquivo = useRef<HTMLInputElement>(null)

  useEffect(() => { carregarPecas() }, [])
  useEffect(() => { fim.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, pensando])

  async function carregarPecas() {
    const j = await fetchAuth('/api/maquina/pecas').then(r => r.json()).catch(() => null)
    if (j?.ok) { setPecas(j.pecas || []); if (j.maquina) setCfg(j.maquina) }
    else if (j?.error) setErro(j.error)
  }
  const pecaPorId = (id: string) => pecas.find(p => p.id === id)
  const atalhos = ATALHOS[cfg.modo]

  function atalho(a: Atalho) {
    setInput(a.abre)
    setTimeout(() => { const el = campo.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length) } }, 40)
  }

  async function anexar(files: FileList | null) {
    if (!files?.length) return
    const novos: Anexo[] = []
    for (const f of Array.from(files).slice(0, 4)) {
      if (f.size > 8 * 1024 * 1024) { setErro(`${f.name} passa de 8 MB`); continue }
      const data: string = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result || '').split(',')[1] || ''); fr.readAsDataURL(f) })
      const ehPdf = f.type === 'application/pdf'
      const ehImg = /^image\/(png|jpeg|webp|gif)$/.test(f.type)
      if (!ehPdf && !ehImg) { setErro(`${f.name}: manda imagem ou PDF`); continue }
      const anexo: Anexo = { nome: f.name, tipo: ehPdf ? 'document' : 'image', media_type: f.type, data }
      // ⚠️ A FOTO PRECISA DE ENDEREÇO. A máquina vê a imagem pelo base64, mas a peça montada é uma
      // página HTML com <img src=…> — e isso exige um lugar de onde a foto abra, hoje e daqui a um
      // mês. Vai pro balde público 'estudio'; se o upload falhar, a foto ainda serve pra ela olhar.
      if (ehImg) {
        try {
          const caminho = `fotos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${(f.name.split('.').pop() || 'jpg').toLowerCase()}`
          const { error } = await supabase.storage.from('estudio').upload(caminho, f, { contentType: f.type, upsert: false })
          if (!error) anexo.url = supabase.storage.from('estudio').getPublicUrl(caminho).data.publicUrl
        } catch { /* sem endereço: segue só com a imagem pra ver */ }
      }
      novos.push(anexo)
    }
    setAnexos(a => [...a, ...novos])
    if (arquivo.current) arquivo.current.value = ''
  }

  async function enviar() {
    const t = input.trim()
    if ((!t && !anexos.length) || pensando) return
    setErro('')
    const enderecos = anexos.filter(a => a.url).map(a => `(foto disponível em ${a.url} — usa este endereço no <img> se for montar peça em cima dela)`).join('\n')
    const minha: Msg = { role: 'user', content: [t || 'Olha o anexo.', enderecos].filter(Boolean).join('\n'), anexos: anexos.length ? anexos : undefined }
    const novo = [...msgs, minha]
    setMsgs(novo); setInput(''); setAnexos([]); setPensando(true)
    // ⚠️ A RESPOSTA CHEGA AOS PEDAÇOS, e cada pedaço vai pra tela na hora. Manda pro servidor só o
    // que ele precisa — papel, texto e anexo — sem fontes e peças das voltas anteriores.
    let r: Response | null = null
    try {
      r = await fetchAuth('/api/maquina', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagens: novo.map(m => ({ role: m.role, content: m.content, anexos: m.anexos })) }),
      })
    } catch { r = null }
    if (!r) { setPensando(false); setErro('não consegui falar com o servidor'); return }

    // os portões (recurso desligado, sem chave, sem acesso) respondem JSON comum, antes de transmitir
    if (!(r.headers.get('content-type') || '').includes('text/event-stream')) {
      const j = await r.json().catch(() => null)
      setPensando(false); setErro(j?.error || 'não consegui responder'); return
    }

    setMsgs(m => [...m, { role: 'assistant', content: '' }])
    const leitor = r.body!.getReader()
    const dec = new TextDecoder()
    let resto = ''
    const atualiza = (fn: (ultima: Msg) => Msg) => setMsgs(m => { const c = [...m]; c[c.length - 1] = fn(c[c.length - 1]); return c })
    let houvePeca = false
    for (; ;) {
      const { value, done } = await leitor.read()
      if (done) break
      resto += dec.decode(value, { stream: true })
      const linhas = resto.split('\n\n'); resto = linhas.pop() || ''
      for (const l of linhas) {
        if (!l.startsWith('data: ')) continue
        let ev: any; try { ev = JSON.parse(l.slice(6)) } catch { continue }
        if (ev.t === 'texto') atualiza(u => ({ ...u, content: u.content + ev.d }))
        else if (ev.t === 'pesquisando') setStatus(`🔎 pesquisando: ${ev.q}`)
        else if (ev.t === 'ferramenta') setStatus(`⚙️ consultando o sistema: ${ev.nome}`)
        else if (ev.t === 'pendencia') atualiza(u => ({ ...u, pendencias: [...(u.pendencias || []), ev] }))
        else if (ev.t === 'peca') { houvePeca = true; atualiza(u => ({ ...u, salvas: [...(u.salvas || []), { id: ev.id, titulo: ev.titulo, tipo: ev.tipo, formato: ev.formato, conteudo: ev.conteudo }] })) }
        else if (ev.t === 'fim') atualiza(u => ({ ...u, fontes: ev.fontes?.length ? ev.fontes : undefined }))
        else if (ev.t === 'erro') setErro(ev.msg)
      }
    }
    setPensando(false); setStatus('')
    if (houvePeca) await carregarPecas()
  }

  // ⚠️ A MÁQUINA PROPÕE, A PESSOA CONFIRMA. Mudar um lead, o funil, uma despesa ou uma regra da IA
  // de vendas nunca acontece só porque a IA achou que devia — passa por este clique, com o nome.
  async function confirmar(iMsg: number, pend: Pendencia) {
    const j = await fetchAuth('/api/maquina/executar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pendencia: pend }) })
      .then(r => r.json()).catch(() => null)
    const feita = j?.ok ? '✓ feito' : `✗ ${j?.error || 'não deu'}`
    setMsgs(m => { const c = [...m]; const msg = { ...c[iMsg] }; msg.pendencias = (msg.pendencias || []).map(p => p.id === pend.id ? { ...p, _feita: feita } : p); c[iMsg] = msg; return c })
  }

  async function mudarSituacao(p: Peca, situacao: string) {
    await fetchAuth('/api/maquina/pecas', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, situacao }) })
      .then(r => r.json()).catch(() => null)
    setAberta(null); carregarPecas()
  }

  function Peca({ p }: { p: Peca }) {
    const abertaAqui = aberta === p.id
    return (
      <div style={{ ...card, marginBottom: 9, padding: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>{p.formato === 'html' ? '🖼️ ' : ''}{p.titulo}</div>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 3 }}>
              {NOME_TIPO[p.tipo] || p.tipo} · {dia(p.criado_em)}{p.autor ? ` · ${p.autor}` : ''}{p.situacao !== 'rascunho' ? ` · ${p.situacao}` : ''}
            </div>
          </div>
          <button onClick={() => setAberta(abertaAqui ? null : p.id)} style={btnSec}>{abertaAqui ? 'fechar' : 'abrir'}</button>
        </div>
        {abertaAqui && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            {p.formato === 'html'
              ? <Quadro html={p.conteudo} />
              : <div className="bolha" style={{ fontSize: 14 }}>{p.conteudo}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              {p.formato === 'html' && <button onClick={() => abrirEmAba(p.conteudo)} style={btnSec}>Abrir em nova aba</button>}
              <button onClick={() => navigator.clipboard?.writeText(p.conteudo)} style={btnSec}>{p.formato === 'html' ? 'Copiar o código' : 'Copiar'}</button>
              {p.situacao !== 'publicada' && <button onClick={() => mudarSituacao(p, 'publicada')} style={btnSec}>Marcar como publicada</button>}
              <button onClick={() => mudarSituacao(p, 'descartada')} style={{ ...btnSec, color: 'var(--red)', marginLeft: 'auto' }}>Descartar</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <Layout>
      <style>{`
        .grade-atalhos { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
        @media (max-width: 760px) { .grade-atalhos { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        .bolha { white-space: pre-wrap; line-height: 1.6; font-size: 14.5px; }
      `}</style>

      <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 4px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{cfg.nome}</h1>
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: '5px 0 18px', lineHeight: 1.55 }}>
          {cfg.modo === 'marketing'
            ? <>A máquina de marketing da empresa. Conversa, pesquisa na internet, produz — e o que ela produz <b>fica guardado aqui</b>, com data, pra tu achar de novo depois.</>
            : <>Conhece o sistema inteiro e a internet. Pergunta, pede análise, manda produzir — e o que ela produz <b>fica guardado aqui</b>. O que muda no sistema, ela propõe e tu confirma.</>}
        </p>

        <div style={{ display: 'inline-flex', gap: 3, padding: 3, background: 'var(--surface-2)', borderRadius: 10, marginBottom: 16 }}>
          {([['trabalhar', 'Trabalhar'], ['pecas', `Peças (${pecas.length})`]] as const).map(([k, t]) => (
            <button key={k} onClick={() => setAba(k)} style={{ background: aba === k ? 'var(--surface)' : 'transparent', border: 'none', borderRadius: 8, color: aba === k ? 'var(--text)' : 'var(--text-faint)', fontSize: 13.5, fontWeight: 700, padding: '7px 16px', cursor: 'pointer' }}>{t}</button>
          ))}
        </div>

        {aba === 'trabalhar' && (
          <>
            {!msgs.length && (
              <div style={{ ...card, marginBottom: 14 }}>
                <div style={rot}>Clica num pra começar a frase — ou escreve direto embaixo</div>
                <div className="grade-atalhos" style={{ marginTop: 11 }}>
                  {atalhos.map(a => (
                    <button key={a.nome} onClick={() => atalho(a)} style={{ textAlign: 'left', cursor: 'pointer', padding: '12px 13px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', color: 'var(--text)' }}>
                      <div style={{ fontSize: 17, marginBottom: 4 }}>{a.icone}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>{a.nome}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 3, lineHeight: 1.35 }}>{a.faz}</div>
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--text-faint)', margin: '12px 0 0' }}>
                  Ela conhece o negócio — não precisa explicar de novo. Dá pra mandar foto e PDF, e ela pesquisa na internet quando precisa.
                </p>
              </div>
            )}

            {msgs.map((m, i) => (
              <div key={i} style={{ ...card, marginBottom: 10, background: m.role === 'user' ? 'var(--surface-2)' : 'var(--surface)', borderLeft: m.role === 'assistant' ? '3px solid var(--accent)' : '1px solid var(--border)' }}>
                <div style={{ ...rot, marginBottom: 6 }}>{m.role === 'user' ? 'Tu' : cfg.nome}</div>
                {m.anexos?.length ? <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 6 }}>📎 {m.anexos.map(a => a.nome).join(', ')}</div> : null}
                <div className="bolha">{m.content}</div>
                {m.salvas?.map(s => {
                  const p = s.conteudo ? { ...s, conteudo: s.conteudo } : pecaPorId(s.id)
                  return (
                    <div key={s.id} style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                      <div style={{ ...rot, marginBottom: 8 }}>💾 salva: {s.titulo}</div>
                      {p?.formato === 'html' && <Quadro html={p.conteudo} />}
                      {p?.formato === 'html' && <button onClick={() => abrirEmAba(p.conteudo)} style={{ ...btnSec, marginTop: 8 }}>Abrir em nova aba</button>}
                    </div>
                  )
                })}
                {m.pendencias?.map(p => (
                  <div key={p.id} style={{ marginTop: 12, padding: 12, border: '1px solid var(--amber)', borderRadius: 'var(--r)', background: 'var(--amber-bg, rgba(245,158,11,.08))' }}>
                    <div style={{ ...rot, color: 'var(--amber)', marginBottom: 6 }}>proposta · {p.tipo}{p.acao ? ` · ${p.acao}` : ''}</div>
                    <pre style={{ fontSize: 12.5, whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', color: 'var(--text-2)' }}>{descreve(p)}</pre>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
                      {p._feita ? <span style={{ fontSize: 13, fontWeight: 700 }}>{p._feita}</span> : <>
                        <button onClick={() => confirmar(i, p)} style={btnPri}>Confirmar</button>
                        <button onClick={() => setMsgs(m => { const c = [...m]; c[i] = { ...c[i], pendencias: (c[i].pendencias || []).filter(x => x.id !== p.id) }; return c })} style={btnSec}>Ignorar</button>
                      </>}
                    </div>
                  </div>
                ))}
                {m.fontes?.length ? (
                  <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 10, lineHeight: 1.6 }}>
                    🔎 pesquisou em: {m.fontes.slice(0, 6).map((f, k) => <a key={k} href={f} target="_blank" rel="noreferrer" style={{ color: 'var(--text-2)', marginRight: 8 }}>{new URL(f).hostname.replace(/^www\./, '')}</a>)}
                  </div>
                ) : null}
              </div>
            ))}
            {pensando && <div style={{ ...card, marginBottom: 10, color: 'var(--text-faint)', fontSize: 13.5 }}>{status || 'pensando…'}</div>}
            {erro && <div style={{ ...card, marginBottom: 10, color: 'var(--amber)', fontSize: 13.5 }}>{erro}</div>}
            <div ref={fim} />

            <div style={{ ...card, position: 'sticky', bottom: 12, padding: 12 }}>
              {anexos.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {anexos.map((a, i) => (
                    <span key={i} style={{ fontSize: 12, background: 'var(--surface-2)', borderRadius: 6, padding: '3px 8px' }}>
                      📎 {a.nome} <button onClick={() => setAnexos(x => x.filter((_, k) => k !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)' }}>×</button>
                    </span>
                  ))}
                </div>
              )}
              <textarea ref={campo} value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) enviar() }}
                placeholder="Fala com ela — pergunta, manda produzir, troca ideia…"
                style={{ width: '100%', minHeight: 74, resize: 'vertical', background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 'var(--r)', padding: '10px 12px', fontSize: 14.5, color: 'var(--text)', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5 }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 9, alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={enviar} disabled={pensando || (!input.trim() && !anexos.length)} style={{ ...btnPri, opacity: pensando || (!input.trim() && !anexos.length) ? .5 : 1 }}>
                  {pensando ? 'Pensando…' : 'Enviar'}
                </button>
                <input ref={arquivo} type="file" accept="image/*,application/pdf" multiple style={{ display: 'none' }} onChange={e => anexar(e.target.files)} />
                <button onClick={() => arquivo.current?.click()} style={btnSec}>📎 Anexar</button>
                {msgs.length > 0 && <button onClick={() => { setMsgs([]); setErro('') }} style={btnSec}>Nova conversa</button>}
                <span style={{ fontSize: 11.5, color: 'var(--text-faint)', marginLeft: 'auto' }}>⌘/Ctrl + Enter envia</span>
              </div>
            </div>
          </>
        )}

        {aba === 'pecas' && (
          <>
            {!pecas.length && <div style={{ ...card, textAlign: 'center', color: 'var(--text-2)', fontSize: 13.5, padding: 30 }}>Nada guardado ainda. O que ela produzir no Trabalhar aparece aqui sozinho.</div>}
            {pecas.map(p => <Peca key={p.id} p={p} />)}
          </>
        )}
      </div>
    </Layout>
  )
}
