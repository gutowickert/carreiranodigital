'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { fetchAuth } from '@/lib/api'
import BotaoChamada from '@/components/BotaoChamada'
import { MetaBloco, Placar, Registros, Nota } from './Resultados'
import { BuscarLead, type LeadAchado } from '@/components/BuscarLead'
import { LOCAIS } from '@/lib/entrega'

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
// HORA DE BRASÍLIA, SEMPRE (23/10/2026). Antes o campo de data e hora usava o fuso do aparelho de
// quem abria a ficha: num computador ou celular com o fuso errado (ou com o horário de verão antigo
// ainda ligado), a hora digitada era gravada com 1h de diferença — "eu boto 8h e fica 7h". Agora o
// que se digita é lido como hora de Brasília (o Brasil não tem horário de verão desde 2019: -03:00).
const TZ = 'America/Sao_Paulo'
/** instante (ISO) → "AAAA-MM-DDTHH:MM" em hora de Brasília, pro campo datetime-local */
const paraInput = (d?: string | null) => {
  const base = d ? new Date(d) : new Date()
  if (isNaN(base.getTime())) return ''
  return base.toLocaleString('sv-SE', { timeZone: TZ }).replace(' ', 'T').slice(0, 16)
}
/** "AAAA-MM-DDTHH:MM" (hora de Brasília) → instante ISO; null se o campo está incompleto */
const doInput = (v?: string | null): string | null => {
  if (!v || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null
  const d = new Date(v + ':00-03:00')
  return isNaN(d.getTime()) ? null : d.toISOString()
}
const hojeSP = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ })
// o palpite pro campo: o dia previsto do roteiro, às 14h
const palpite = (dataPrevista?: string | null) => `${String(dataPrevista || hojeSP()).slice(0, 10)}T14:00`

const caixaAviso: React.CSSProperties = { background: 'var(--amber-bg)', border: '1px solid var(--amber)', borderRadius: 8, padding: 11, fontSize: 12.5, color: 'var(--amber)', lineHeight: 1.5 }
const falha: React.CSSProperties = { fontSize: 12.5, color: 'var(--red)', margin: 0 }

// Os campos de um encontro novo: título, data, hora (opcional) e onde. Usado no "+ Novo encontro"
// e no concluir ("já cria um novo encontro").
type DadosEncontro = { titulo?: string; data?: string; hora?: string; local?: string }
function CamposEncontro({ v, aoMudar }: { v: DadosEncontro; aoMudar: (v: DadosEncontro) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input style={{ ...inp, minWidth: 160, flex: 1 }} placeholder="Título (ex.: Encontro 2)" value={v.titulo || ''} onChange={e => aoMudar({ ...v, titulo: e.target.value })} aria-label="Título do encontro" />
      <input type="date" style={inp} value={v.data || ''} onChange={e => aoMudar({ ...v, data: e.target.value })} aria-label="Data do encontro" />
      <input type="time" style={inp} value={v.hora || ''} onChange={e => aoMudar({ ...v, hora: e.target.value })} aria-label="Hora (opcional)" />
      <select style={inp} value={v.local || ''} onChange={e => aoMudar({ ...v, local: e.target.value })} aria-label="Onde vai ser">
        <option value="">Onde vai ser?</option>
        {LOCAIS.map(l => <option key={l.chave} value={l.chave}>{l.nome}</option>)}
      </select>
      <span style={{ fontSize: 11.5, color: 'var(--text-faint)', width: '100%' }}>Sem hora, o encontro fica só previsto (sombra na agenda). Com hora, já nasce combinado — e aí o lugar é obrigatório.</span>
    </div>
  )
}
/** confere os campos do encontro novo antes de mandar; devolve o erro ou null */
const conferirEncontro = (v: DadosEncontro): string | null => {
  if (!v.data) return 'Escolhe a data do novo encontro.'
  if (v.hora && !v.local) return 'Com hora marcada, escolhe onde vai ser o encontro.'
  return null
}

// o link da área do cliente: ele vê o próprio projeto, sem login
function LinkCliente({ projeto, aoMudar }: { projeto: any; aoMudar: () => void }) {
  const [aviso, setAviso] = useState('')
  const url = projeto.portal_chave && typeof window !== 'undefined' ? `${window.location.origin}/placar/${projeto.portal_chave}` : ''

  async function gerar(acao: 'portal_link' | 'portal_trocar') {
    if (acao === 'portal_trocar' && !confirm('O link atual para de funcionar. O cliente vai precisar do novo. Trocar?')) return
    const j = await fetchAuth('/api/projetos/ficha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao, projeto_id: projeto.id }) })
      .then(r => r.json()).catch(() => null)
    if (j?.ok) aoMudar(); else setAviso('' + (j?.error || 'falha'))
  }
  async function copiar() {
    try { await navigator.clipboard.writeText(url); setAviso('Link copiado ✓') } catch { setAviso('Não deu pra copiar — seleciona o link e copia.') }
    setTimeout(() => setAviso(''), 3000)
  }

  return (
    <div style={{ ...card, padding: '10px 12px', marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>Área do cliente</span>
      {url ? (
        <>
          <input readOnly value={url} onFocus={e => e.currentTarget.select()} style={{ ...inp, flex: 1, minWidth: 200, fontSize: 12 }} aria-label="Link da área do cliente" />
          <button onClick={copiar} style={{ ...btn, background: 'var(--accent)', color: '#fff' }}>Copiar</button>
          <a href={url} target="_blank" rel="noopener" style={{ ...btn, background: 'var(--surface-2)', color: 'var(--text-2)', textDecoration: 'none' }}>Abrir</a>
          <button onClick={() => gerar('portal_trocar')} style={{ ...btn, background: 'none', color: 'var(--text-faint)', fontWeight: 400 }}>trocar link</button>
        </>
      ) : (
        <>
          <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-faint)' }}>O cliente acompanha a meta, o tráfego, os fechamentos e os encontros. Sem login, só com o link.</span>
          <button onClick={() => gerar('portal_link')} style={{ ...btn, background: 'var(--accent)', color: '#fff' }}>Criar link</button>
        </>
      )}
      {aviso && <span style={{ fontSize: 12, color: 'var(--text-2)', width: '100%' }}>{aviso}</span>}
    </div>
  )
}

export default function FichaEntrega() {
  const { id } = useParams<{ id: string }>()
  const [d, setD] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)
  const [msg, setMsg] = useState('')
  const [vincular, setVincular] = useState(false)   // painel de ligar esta entrega a um lead
  const [agindo, setAgindo] = useState<string | null>(null)   // marcoId em ação
  const [form, setForm] = useState<any>({})
  const [novaPend, setNovaPend] = useState('')
  // "+ Novo encontro": null = fechado
  const [novoEnc, setNovoEnc] = useState<(DadosEncontro & { erro?: string; conflito?: string; salvando?: boolean }) | null>(null)

  async function carregar() {
    const j = await fetchAuth(`/api/projetos/ficha?id=${id}`).then(r => r.json()).catch(() => null)
    if (j?.ok) setD(j)
    else setMsg('' + (j?.error || 'não consegui carregar'))
    setCarregando(false)
  }
  useEffect(() => { if (id) carregar() }, [id])

  async function acao(corpo: any) {
    const j = await fetchAuth('/api/projetos/marco', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }).then(r => r.json()).catch(() => null)
    if (j?.ok) {
      setAgindo(null); setForm({})
      if (j.aviso) { setMsg('' + j.aviso); setTimeout(() => setMsg(''), 8000) }
      carregar()
      return
    }
    const doPainel = agindo && corpo.id === agindo
    // o dia já tem a outra região: mostra o aviso e deixa marcar de propósito — avisa, não proíbe.
    // Guarda o pedido pra o "mesmo assim" mandar igual, só com a confirmação.
    if (j?.precisa_confirmar_regiao && doPainel) { setForm((f: any) => ({ ...f, conflito: j.error, erro: '', ultimo: corpo })); return }
    // O ERRO APARECE DENTRO DO PAINEL ABERTO. Antes ia pra faixa do topo da página e sumia em 5s:
    // quem estava lá embaixo, no encontro, clicava em Salvar e achava que nada acontecia (era o
    // caso do "não consigo mudar o horário" — p.ex. encontro sem lugar, que o servidor recusa).
    if (doPainel) { setForm((f: any) => ({ ...f, erro: '' + (j?.error || 'não deu certo — tenta de novo'), conflito: '' })); return }
    setMsg('' + (j?.error || 'falha')); setTimeout(() => setMsg(''), 5000)
  }

  // combinar / remarcar: confere no navegador o que dá pra conferir, e manda
  function salvarHora(m: any) {
    const iso = doInput(form.data_hora)
    if (!iso) { setForm({ ...form, erro: 'Confere a data e a hora (as duas precisam estar preenchidas).' }); return }
    const local = form.local || m.local
    if (!local) { setForm({ ...form, erro: 'Escolhe onde vai ser o encontro — é o que diz pro time se o dia já está comprometido.' }); return }
    acao({ acao: form.tipo, id: m.id, data_hora: iso, local })
  }

  // concluir: os dois extras (marcar o próximo e criar um novo) são opcionais
  function concluir(m: any, proximo: any) {
    const corpo: any = { acao: 'concluir', id: m.id, registro: form.registro }
    if (form.marcarProx && proximo) {
      const iso = doInput(form.proxima_data_hora)
      if (!iso) { setForm({ ...form, erro: 'Confere a data e a hora do próximo encontro — ou desmarca a opção.' }); return }
      const local = form.proxima_local || proximo.local
      if (!local) { setForm({ ...form, erro: 'Escolhe onde vai ser o próximo encontro.' }); return }
      corpo.proxima_data_hora = iso; corpo.proxima_local = local
    }
    if (form.criarNovo) {
      const nv: DadosEncontro = form.novo || {}
      const e = conferirEncontro(nv)
      if (e) { setForm({ ...form, erro: e }); return }
      corpo.novo_encontro = { titulo: nv.titulo || '', data: nv.data, hora: nv.hora || '', local: nv.local || '' }
    }
    acao(corpo)
  }

  // + NOVO ENCONTRO: entra na ordem pela data; com hora, já nasce combinado
  async function criarEncontro(mesmoAssim = false) {
    if (!novoEnc) return
    const e = conferirEncontro(novoEnc)
    if (e) { setNovoEnc({ ...novoEnc, erro: e }); return }
    setNovoEnc({ ...novoEnc, salvando: true, erro: '' })
    const j = await fetchAuth('/api/projetos/ficha', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'novo_encontro', projeto_id: id, titulo: novoEnc.titulo || '', data: novoEnc.data, hora: novoEnc.hora || '', local: novoEnc.local || '', mesmo_assim: mesmoAssim }),
    }).then(r => r.json()).catch(() => null)
    if (j?.ok) {
      setNovoEnc(null)
      setMsg(`${j.titulo} criado${j.combinado ? ' e combinado' : ' (previsto)'}.${j.aviso ? ' ' + j.aviso : ''}`); setTimeout(() => setMsg(''), 6000)
      carregar()
      return
    }
    if (j?.precisa_confirmar_regiao) { setNovoEnc(v => v && ({ ...v, salvando: false, conflito: j.error })); return }
    setNovoEnc(v => v && ({ ...v, salvando: false, erro: '' + (j?.error || 'não consegui criar o encontro') }))
  }

  async function pendencia(corpo: any) {
    await fetchAuth('/api/projetos/ficha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projeto_id: id, ...corpo }) }).then(r => r.json()).catch(() => null)
    setNovaPend(''); carregar()
  }

  if (carregando) return <div style={{ padding: 32, color: 'var(--text-faint)' }}>Carregando…</div>
  if (!d?.projeto) return <div style={{ padding: 32, color: 'var(--text-faint)' }}>{msg || 'Projeto não encontrado.'}</div>

  const p = d.projeto
  const marcos = d.marcos || []
  const pessoas: { id: string; nome: string }[] = d.pessoas || []
  const donoProjeto = pessoas.find(x => x.id === p.responsavel_id)
  const semDono = marcos.filter((m: any) => m.estado !== 'concluido' && !m.responsavel_id && !p.responsavel_id).length
  // sugestão de título pro encontro novo: "Encontro N", contando os encontros que já existem, fora o 1º
  const encontrosVivos = marcos.filter((m: any) => m.natureza === 'encontro' && m.estado !== 'cancelado')
  const sugestaoTitulo = `Encontro ${Math.max(1, encontrosVivos.length - 1)}`

  const juntos: string[] = (p.participantes || []).filter((x: string) => x !== p.responsavel_id)
  async function trocarJuntos(lista: string[]) {
    await fetchAuth('/api/projetos/ficha', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, participantes: lista }) })
    carregar()
  }

  // Ligar um projeto que já existe ao card do lead. Os projetos criados antes desta busca existir
  // ficaram todos sem lead — este é o caminho pra recuperar o vínculo, um a um, com alguém olhando.
  async function vincularLead(l: LeadAchado) {
    if (l.ja_em_projeto && !confirm(`Este lead já está na entrega de ${l.ja_em_projeto}. Vincular mesmo assim?`)) return
    const j = await fetchAuth('/api/projetos/ficha', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, lead_id: l.id }) }).then(r => r.json()).catch(() => null)
    if (j?.ok === false) { setMsg('' + (j.error || 'não deu pra vincular')); setTimeout(() => setMsg(''), 4000); return }
    setVincular(false)
    carregar()
  }

  async function trocarResponsavel(v: string) {
    await fetchAuth('/api/projetos/ficha', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, responsavel_id: v || null }) })
    carregar()
  }

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
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ ...card, padding: '4px 6px 4px 11px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-2)' }}>
            👤 Responsável
            <select value={p.responsavel_id || ''} onChange={e => trocarResponsavel(e.target.value)} style={{ ...inp, padding: '4px 6px', fontSize: 12.5 }}>
              <option value="">ninguém</option>
              {pessoas.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
          </label>
          {juntos.map(id => (
            <span key={id} style={{ ...card, padding: '5px 6px 5px 10px', fontSize: 12.5, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
              + {pessoas.find(x => x.id === id)?.nome || 'alguém'}
              <button onClick={() => trocarJuntos(juntos.filter(x => x !== id))} aria-label="tirar" style={{ ...btn, background: 'none', color: 'var(--text-faint)', padding: '0 4px', fontWeight: 400 }}>✕</button>
            </span>
          ))}
          {p.responsavel_id && (
            <select value="" onChange={e => e.target.value && trocarJuntos([...juntos, e.target.value])} aria-label="Também responsável" style={{ ...inp, padding: '5px 6px', fontSize: 12.5 }}>
              <option value="">+ também responsável</option>
              {pessoas.filter(x => x.id !== p.responsavel_id && !juntos.includes(x.id)).map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
          )}
          {p.whatsapp && <a href={`https://wa.me/${p.whatsapp}`} target="_blank" rel="noopener" style={{ ...card, padding: '7px 12px', fontSize: 12.5, color: 'var(--text-2)', textDecoration: 'none' }}>WhatsApp</a>}
          <BotaoChamada leadId={p.lead_id} nome={p.cliente} telefone={p.whatsapp} compacto />
          {p.lead_id && <Link href={`/dashboard/crm?lead=${p.lead_id}`} style={{ ...card, padding: '7px 12px', fontSize: 12.5, color: 'var(--text-2)', textDecoration: 'none' }}>Lead de origem</Link>}
          {!p.lead_id && (
            <button onClick={() => setVincular(v => !v)} style={{ ...card, padding: '7px 12px', fontSize: 12.5, color: 'var(--text-2)', background: 'var(--surface)', cursor: 'pointer' }}>
              {vincular ? 'cancelar' : '+ vincular lead'}
            </button>
          )}
        </div>
      </div>

      {/* Vincular o lead depois: para os projetos que nasceram antes de existir a busca. */}
      {vincular && !p.lead_id && (
        <div style={{ ...card, padding: 14, marginTop: 12 }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 6 }}>
            Qual card do CRM deu origem a esta entrega? O nome do cliente aqui pode estar diferente do nome no lead — confere a etapa e a data antes de escolher.
          </div>
          <BuscarLead autoFoco onEscolher={vincularLead} />
        </div>
      )}

      <LinkCliente projeto={p} aoMudar={carregar} />

      {msg && <div style={{ ...card, padding: '10px 12px', marginTop: 12, fontSize: 13, color: 'var(--text-2)' }}>{msg}</div>}

      {/* ───────── resultado: o placar do contrato vem antes da operação */}
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '24px 0 10px' }}>O resultado</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <MetaBloco projeto={p} aoMudar={carregar} />
        <Placar projeto={p} linhas={d.placar || []} aoMudar={carregar} />
        <Registros projeto={p} itens={d.registros || []} aoMudar={carregar} />
      </div>

      {/* ───────── linha do tempo */}
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '24px 0 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
        A entrega
        {/* projeto criado antes de existir a lista padrão: um clique preenche o que o roteiro tem */}
        {marcos.some((m: any) => m.estado !== 'concluido' && (!Array.isArray(m.lista) || !m.lista.length)) && (
          <button onClick={async () => {
            const j = await fetchAuth('/api/projetos/ficha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'aplicar_padrao', projeto_id: p.id }) }).then(r => r.json()).catch(() => null)
            setMsg(j?.ok ? `Lista padrão aplicada em ${j.marcos} ${j.marcos === 1 ? 'marco' : 'marcos'}.` : ('' + (j?.error || 'falha')))
            carregar()
          }} style={{ ...btn, background: 'var(--surface-2)', color: 'var(--text-2)', letterSpacing: 0, textTransform: 'none', fontWeight: 600 }}>aplicar a lista padrão do roteiro</button>
        )}
        {/* a entrega nasce só com o primeiro e o último encontro: os do meio se criam aqui */}
        {!novoEnc && p.status !== 'cancelado' && (
          <button onClick={() => setNovoEnc({ titulo: sugestaoTitulo, data: '', hora: '', local: '' })}
            style={{ ...btn, background: 'var(--accent)', color: '#fff', letterSpacing: 0, textTransform: 'none', marginLeft: 'auto' }}>+ Novo encontro</button>
        )}
      </div>
      {novoEnc && (
        <div style={{ ...card, padding: 14, marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>Novo encontro</div>
          <CamposEncontro v={novoEnc} aoMudar={v => setNovoEnc({ ...novoEnc, ...v, erro: '', conflito: '' })} />
          {novoEnc.conflito && (
            <div style={caixaAviso}>
              {novoEnc.conflito}
              <div style={{ marginTop: 8 }}>
                <button onClick={() => criarEncontro(true)} disabled={novoEnc.salvando} style={{ ...btn, background: 'transparent', color: 'var(--amber)', border: '1px solid var(--amber)' }}>Criar mesmo assim</button>
              </div>
            </div>
          )}
          {novoEnc.erro && <p style={falha}>{novoEnc.erro}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => criarEncontro(false)} disabled={novoEnc.salvando} style={{ ...btn, background: 'var(--accent)', color: '#fff', opacity: novoEnc.salvando ? .6 : 1 }}>{novoEnc.salvando ? 'Criando…' : 'Criar encontro'}</button>
            <button onClick={() => setNovoEnc(null)} style={{ ...btn, background: 'var(--surface-2)', color: 'var(--text-2)' }}>Cancelar</button>
          </div>
        </div>
      )}
      {semDono > 0 && (
        <div style={{ background: 'var(--amber-bg)', borderRadius: 8, padding: '9px 11px', marginBottom: 10, fontSize: 12.5, color: 'var(--text-2)' }}>
          <b style={{ color: 'var(--text)' }}>{semDono} {semDono === 1 ? 'tarefa sem dono' : 'tarefas sem dono'}</b> — na agenda aparecem pro grupo todo e ninguém responde por elas. Escolhe o responsável do projeto lá em cima, ou o dono de cada uma.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {marcos.map((m: any) => {
          const feito = m.estado === 'concluido'
          const cor = m.situacao === 'atrasado' ? 'var(--red)' : m.situacao === 'a_remarcar' || m.situacao === 'confirmar' ? 'var(--amber)'
            : m.estado === 'confirmado' ? 'var(--green)' : m.estado === 'combinado' ? 'var(--blue)' : 'var(--border-strong)'
          const icone = feito ? '✔' : m.ancora ? '🔒' : m.natureza === 'interno' ? '⚙' : m.natureza === 'marco' ? '◆' : '○'
          // o próximo encontro que já existe (pra oferecer marcar a data dele ao concluir este)
          const proximo = m.natureza === 'encontro'
            ? marcos.find((x: any) => x.ordem > m.ordem && x.natureza === 'encontro' && x.estado !== 'concluido' && x.estado !== 'cancelado') || null
            : null
          return (
            <div key={m.id} style={{ ...card, padding: 14, borderLeft: `3px solid ${cor}`, opacity: feito ? .72 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15, color: cor, lineHeight: 1.3 }}>{icone}</span>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)' }}>{m.titulo}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>
                    {m.estado === 'previsto' && <>previsto para ~{br(m.data_prevista)}{m.natureza === 'encontro' && ' · sem hora ainda: combina com o cliente'}</>}
                    {m.estado === 'combinado' && <>{dataHora(m.data_combinada)} · <b style={{ color: 'var(--amber)' }}>falta reconfirmar</b></>}
                    {m.estado === 'confirmado' && <>{dataHora(m.data_combinada)} · confirmado</>}
                    {m.estado === 'a_remarcar' && <b style={{ color: 'var(--amber)' }}>sem reconfirmação — precisa remarcar</b>}
                    {feito && <>concluído em {br(m.concluido_em)}</>}
                    {m.ancora && !feito && <> · <b style={{ color: 'var(--text-2)' }}>âncora: não empurra</b></>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7 }}>
                    <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>na agenda de</span>
                    <select value={m.responsavel_id || ''} onChange={e => acao({ acao: 'responsavel', id: m.id, responsavel_id: e.target.value })} aria-label={'Dono de ' + m.titulo}
                      style={{ ...inp, padding: '3px 6px', fontSize: 12, color: !m.responsavel_id && !donoProjeto ? 'var(--amber)' : 'var(--text)' }}>
                      <option value="">{donoProjeto ? [donoProjeto.nome, ...juntos.map(id => pessoas.find(x => x.id === id)?.nome).filter(Boolean)].join(' e ') + ' (do projeto)' : 'ninguém — o grupo todo vê'}</option>
                      {pessoas.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
                    </select>
                  </div>
                  {/* A LISTA DO QUE FAZER — o padrão de implantação, riscável. É o que faz a implantação
                      sair igual pra todo cliente sem ninguém lembrar de cabeça. Riscar não conclui o
                      marco: o marco se conclui com o registro do que aconteceu, como sempre. */}
                  {Array.isArray(m.lista) && m.lista.length > 0 && (
                    <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {m.lista.map((it: any, i: number) => (
                        <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 12.5, color: it.feito ? 'var(--text-faint)' : 'var(--text-2)', cursor: feito ? 'default' : 'pointer', textDecoration: it.feito ? 'line-through' : 'none' }}>
                          <input type="checkbox" checked={!!it.feito} disabled={feito} onChange={e => acao({ acao: 'lista_item', id: m.id, indice: i, feito: e.target.checked })} style={{ marginTop: 2 }} />
                          <span>{it.item}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {m.registro && <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 7, paddingLeft: 10, borderLeft: '2px solid var(--border)' }}>{m.registro}</div>}
                </div>

                {!feito && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* combinar / confirmar / remarcar só em REUNIÃO com o cliente; tarefa interna e marco só concluem */}
                    {m.natureza !== 'encontro' && (
                      <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{m.natureza === 'marco' ? 'marco' : 'tarefa interna'} · sem hora, conclui quando fizer</span>
                    )}
                    {m.natureza === 'encontro' && (m.estado === 'previsto' || m.estado === 'a_remarcar') && (
                      <button onClick={() => { setAgindo(m.id); setForm({ tipo: 'combinar', data_hora: m.data_combinada ? paraInput(m.data_combinada) : palpite(m.data_prevista), local: m.local || '' }) }} style={{ ...btn, background: 'var(--accent)', color: '#fff' }}>Combinar</button>
                    )}
                    {m.natureza === 'encontro' && m.estado === 'combinado' && (
                      <button onClick={() => acao({ acao: 'confirmar', id: m.id })} style={{ ...btn, background: 'var(--green-bg)', color: 'var(--green)' }}>Confirmar</button>
                    )}
                    {m.natureza === 'encontro' && (m.estado === 'combinado' || m.estado === 'confirmado') && (
                      <button onClick={() => { setAgindo(m.id); setForm({ tipo: 'remarcar', data_hora: paraInput(m.data_combinada), local: m.local || '' }) }} style={{ ...btn, background: 'var(--surface-2)', color: 'var(--text-2)' }}>Remarcar</button>
                    )}
                    <button onClick={() => {
                      setAgindo(m.id)
                      setForm({
                        tipo: 'concluir', registro: '',
                        marcarProx: false, proxima_data_hora: proximo ? (proximo.data_combinada ? paraInput(proximo.data_combinada) : palpite(proximo.data_prevista)) : '', proxima_local: proximo?.local || m.local || '',
                        criarNovo: false, novo: { titulo: sugestaoTitulo, data: '', hora: '', local: m.local || '' },
                      })
                    }} style={{ ...btn, background: 'var(--surface-2)', color: 'var(--text-2)' }}>Concluir</button>
                  </div>
                )}
              </div>

              {/* painel de ação */}
              {agindo === m.id && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  {(form.tipo === 'combinar' || form.tipo === 'remarcar') && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{form.tipo === 'combinar' ? 'Combinado com o cliente para' : 'Nova data'} (hora de Brasília):</span>
                        <input type="datetime-local" style={inp} value={form.data_hora || ''} onChange={e => setForm({ ...form, data_hora: e.target.value, conflito: '', erro: '' })} />
                        {/* ⚠️ ONDE É — obrigatório. Dois atendimentos no mesmo dia só cabem na MESMA
                            região; é isto que deixa o time ver se o dia já está comprometido. */}
                        <select style={inp} value={form.local || ''} onChange={e => setForm({ ...form, local: e.target.value, conflito: '', erro: '' })}>
                          <option value="">Onde vai ser?</option>
                          {LOCAIS.map(l => <option key={l.chave} value={l.chave}>{l.nome}</option>)}
                        </select>
                      </div>
                      {form.conflito && (
                        <div style={caixaAviso}>
                          {form.conflito}
                          <div style={{ marginTop: 8 }}>
                            <button onClick={() => acao({ ...form.ultimo, mesmo_assim: true })} style={{ ...btn, background: 'transparent', color: 'var(--amber)', border: '1px solid var(--amber)' }}>Marcar mesmo assim</button>
                          </div>
                        </div>
                      )}
                      {form.erro && <p style={falha}>{form.erro}</p>}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => salvarHora(m)} style={{ ...btn, background: 'var(--accent)', color: '#fff' }}>Salvar</button>
                        <button onClick={() => { setAgindo(null); setForm({}) }} style={{ ...btn, background: 'var(--surface-2)', color: 'var(--text-2)' }}>Cancelar</button>
                      </div>
                    </div>
                  )}
                  {form.tipo === 'concluir' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                      <textarea style={{ ...inp, minHeight: 66, width: '100%' }} placeholder="O que aconteceu? (fica na ficha pra quem pegar esse cliente depois)" value={form.registro || ''} onChange={e => setForm({ ...form, registro: e.target.value })} />
                      {/* A ANTIGA REGRA DE OURO VIROU CONVITE (23/10/2026): os encontros do meio não
                          nascem mais com o projeto, então nada aqui é obrigatório. Dá pra concluir sem
                          marcar nada, marcar a data do próximo que já existe, criar um novo — ou os dois. */}
                      {m.natureza === 'encontro' && proximo && (
                        <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 11 }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--text)', fontWeight: 600, cursor: 'pointer' }}>
                            <input type="checkbox" checked={!!form.marcarProx} onChange={e => setForm({ ...form, marcarProx: e.target.checked, erro: '', conflito: '' })} />
                            Já marcar a data de “{proximo.titulo}” (opcional)
                          </label>
                          {form.marcarProx && (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                              <input type="datetime-local" style={inp} value={form.proxima_data_hora || ''} onChange={e => setForm({ ...form, proxima_data_hora: e.target.value, erro: '', conflito: '' })} aria-label="Data e hora do próximo encontro" />
                              <select style={inp} value={form.proxima_local || ''} onChange={e => setForm({ ...form, proxima_local: e.target.value, erro: '', conflito: '' })} aria-label="Onde vai ser o próximo">
                                <option value="">Onde vai ser o próximo?</option>
                                {LOCAIS.map(l => <option key={l.chave} value={l.chave}>{l.nome}</option>)}
                              </select>
                            </div>
                          )}
                        </div>
                      )}
                      {m.natureza === 'encontro' && (
                        <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 11 }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--text)', fontWeight: 600, cursor: 'pointer' }}>
                            <input type="checkbox" checked={!!form.criarNovo} onChange={e => setForm({ ...form, criarNovo: e.target.checked, erro: '', conflito: '' })} />
                            Criar um novo encontro (opcional)
                          </label>
                          {form.criarNovo && (
                            <div style={{ marginTop: 8 }}>
                              <CamposEncontro v={form.novo || {}} aoMudar={v => setForm({ ...form, novo: v, erro: '', conflito: '' })} />
                            </div>
                          )}
                        </div>
                      )}
                      {form.conflito && (
                        <div style={caixaAviso}>
                          {form.conflito}
                          <div style={{ marginTop: 8 }}>
                            <button onClick={() => acao({ ...form.ultimo, mesmo_assim: true })} style={{ ...btn, background: 'transparent', color: 'var(--amber)', border: '1px solid var(--amber)' }}>Concluir e marcar mesmo assim</button>
                          </div>
                        </div>
                      )}
                      {form.erro && <p style={falha}>{form.erro}</p>}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => concluir(m, proximo)} style={{ ...btn, background: 'var(--green)', color: '#fff' }}>Concluir</button>
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
