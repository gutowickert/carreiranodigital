'use client'

import { useEffect, useMemo, useState } from 'react'
import Layout from '@/components/Layout'
import { supabase } from '@/lib/supabase'
import { fetchAuth } from '@/lib/api'

// A AGENDA — calendário em cima, próximos dias embaixo.
//
// Três fontes num lugar só: compromissos (agenda_eventos), tarefas (tarefas) e follow-ups de
// cliente (tarefas_lead). Quem enxerga o quê é decidido no servidor (app/api/agenda), porque duas
// dessas três tabelas são antigas e continuam abertas pra empresa inteira no banco.
//
// DUAS DECISÕES DE TELA QUE VALEM PRA QUALQUER NEGÓCIO, NÃO SÓ PRA ESCOLA:
//
// 1. ATRASADO NÃO ENTRA NA LISTA DO DIA. Fica recolhido numa faixa. A escola tem 109 itens
//    vencidos desde junho — soltos na lista, eles enterram o que é de hoje e a agenda vira um
//    cemitério que ninguém abre. Recolhido, o dia fica limpo e o passivo continua visível.
//
// 2. A LINHA NÃO TEM BOTÃO. Uma bolinha pra concluir, e o resto abre ao clicar. Sete botões por
//    linha viram ruído quando a lista tem trinta linhas.
//
// O item sem dono é do GRUPO e aparece pra todos: hoje quase nada tem dono (1196 clientes sem
// responsável), então uma agenda que só mostrasse "o que é meu" abriria vazia pra quase todo mundo.
// Pegar pra mim é o que transforma o mural em trabalho de alguém.

type Item = {
  id: string
  fonte: 'agenda' | 'turma' | 'lead'
  titulo: string
  subtitulo?: string | null
  inicio: string
  fim?: string | null
  diaTodo: boolean
  tipo?: string | null
  donoId: string | null
  publico: boolean
  concluido: boolean
  leadId?: string | null
  setor?: string | null
  ajudaDe?: string | null
  ajudaNota?: string | null
}
type Pessoa = { id: string; nome: string; papel: string; setor: string }
type Eu = { id: string; nome: string; papel: string; setor: string; souDono: boolean }

// Rótulos por NATUREZA, não por ramo: "Turma" só faz sentido em escola. Compromisso, tarefa e
// follow-up existem em qualquer negócio, que é onde este sistema vai parar.
const FONTES: Record<Item['fonte'], { rotulo: string; cor: string }> = {
  agenda: { rotulo: 'Compromisso', cor: 'var(--accent)' },
  turma: { rotulo: 'Tarefa', cor: 'var(--amber)' },
  lead: { rotulo: 'Follow-up', cor: 'var(--blue)' },
}

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

// ⚠️ Prazo vem como "2026-09-09" (sem hora). `new Date("2026-09-09")` é lido como meia-noite UTC,
// que no Brasil é 21h do dia ANTERIOR — a tarefa apareceria um dia adiantada e ninguém entenderia
// por quê. Data sem hora tem que ser montada como data local.
function paraData(s: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [a, m, d] = s.split('-').map(Number)
    return new Date(a, m - 1, d, 9, 0)
  }
  return new Date(s)
}
const chaveDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const horaDe = (i: Item) => i.diaTodo ? '' : paraData(i.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

function rotuloDia(chave: string) {
  const hoje = new Date(), amanha = new Date(); amanha.setDate(hoje.getDate() + 1)
  if (chave === chaveDia(hoje)) return 'Hoje'
  if (chave === chaveDia(amanha)) return 'Amanhã'
  const [a, m, d] = chave.split('-').map(Number)
  const dt = new Date(a, m - 1, d)
  // só a primeira letra: `capitalize` do CSS maiusculiza cada palavra e produz "Seg, 14 De Setembro"
  return `${DIAS[dt.getDay()]}, ${d} de ${MESES[m - 1]}`.replace(/^./, c => c.toUpperCase())
}

export default function Agenda() {
  const [eu, setEu] = useState<Eu | null>(null)
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [tenhoTime, setTenhoTime] = useState(false)
  const [itens, setItens] = useState<Item[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [filtro, setFiltro] = useState<'tudo' | 'meu' | 'grupo' | 'time'>('tudo')
  const [mes, setMes] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [diaAberto, setDiaAberto] = useState<string | null>(null)
  const [verAtrasados, setVerAtrasados] = useState(false)
  const [detalhe, setDetalhe] = useState<Item | null>(null)
  const [novo, setNovo] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)

  async function carregar() {
    setErro('')
    try {
      const ate = new Date(); ate.setMonth(ate.getMonth() + 6)
      const r = await fetchAuth(`/api/agenda?ate=${ate.toISOString()}`)
      if (!r.ok) { setErro(r.status === 401 ? 'Sessão expirada — recarregue a página.' : 'Não deu pra carregar a agenda.'); setCarregando(false); return }
      const d = await r.json()
      setEu(d.eu); setPessoas(d.pessoas || []); setTenhoTime(!!d.tenhoTime); setItens(d.itens || [])
    } catch { setErro('Não deu pra carregar a agenda.') }
    setCarregando(false)
  }
  useEffect(() => { carregar() }, [])

  const nomeDe = (id: string | null) => (id ? pessoas.find(p => p.id === id)?.nome || 'outra pessoa' : null)
  const hj = chaveDia(new Date())

  // ── AÇÕES ───────────────────────────────────────────────────────────────────
  async function acao(id: string, fn: () => Promise<{ error: any }>) {
    setOcupado(id); setErro('')
    const { error } = await fn()
    setOcupado(null)
    if (error) { setErro(error.message); return false }
    await carregar()
    return true
  }
  const pegar = (it: Item, quem: string | null) => acao(it.id, async () => {
    if (it.fonte === 'agenda') return supabase.from('agenda_eventos').update({ usuario_id: quem }).eq('id', it.id)
    if (it.fonte === 'turma') return supabase.from('tarefas').update({ usuario_id: quem }).eq('id', it.id)
    return supabase.from('tarefas_lead').update({ vendedor_id: quem }).eq('id', it.id)
  })
  const concluir = (it: Item) => acao(it.id, async () => {
    const agora = new Date().toISOString()
    if (it.fonte === 'agenda') return supabase.from('agenda_eventos').update({ concluido: true, concluido_em: agora }).eq('id', it.id)
    if (it.fonte === 'turma') return supabase.from('tarefas').update({ status: 'concluida', concluida_em: agora }).eq('id', it.id)
    return supabase.from('tarefas_lead').update({ concluida: true, concluida_em: agora, atualizado_em: agora }).eq('id', it.id)
  })
  const abrirPublico = (it: Item, publico: boolean) =>
    acao(it.id, async () => supabase.from('agenda_eventos').update({ publico }).eq('id', it.id))
  // Pedir ajuda NÃO troca o dono — é o que faz alguém chamar o chefe sem perder a comissão.
  async function pedirAjuda(it: Item, quem: string, nota: string) {
    const agora = new Date().toISOString()
    const ok = await acao(it.id, async () => {
      if (it.fonte === 'agenda') return supabase.from('agenda_eventos').update({ ajuda_de: quem, ajuda_nota: nota, ajuda_em: agora }).eq('id', it.id)
      if (it.leadId) return supabase.from('leads').update({ ajuda_de: quem, ajuda_nota: nota, ajuda_em: agora }).eq('id', it.leadId)
      return { error: { message: 'Esta tarefa ainda não aceita pedido de ajuda.' } } as any
    })
    if (ok) setDetalhe(null)
  }

  // ── SEPARAÇÃO ───────────────────────────────────────────────────────────────
  const visiveis = useMemo(() => {
    const abertos = itens.filter(i => !i.concluido)
    if (filtro === 'meu') return abertos.filter(i => i.donoId === eu?.id || i.ajudaDe === eu?.id)
    if (filtro === 'grupo') return abertos.filter(i => !i.donoId)
    if (filtro === 'time') return abertos.filter(i => i.donoId && i.donoId !== eu?.id)
    return abertos
  }, [itens, filtro, eu])

  const atrasados = useMemo(() => visiveis.filter(i => chaveDia(paraData(i.inicio)) < hj), [visiveis, hj])
  const emDia = useMemo(() => visiveis.filter(i => chaveDia(paraData(i.inicio)) >= hj), [visiveis, hj])

  // O calendário mostra tudo, inclusive atrasado: no mês passado a marca vermelha é a informação.
  const porDiaCalendario = useMemo(() => {
    const m = new Map<string, Item[]>()
    for (const i of visiveis) {
      const k = chaveDia(paraData(i.inicio))
      const l = m.get(k) || []; l.push(i); m.set(k, l)
    }
    for (const l of m.values()) l.sort((a, b) => a.inicio.localeCompare(b.inicio))
    return m
  }, [visiveis])

  const listaDeBaixo = useMemo(() => {
    const base = diaAberto
      ? visiveis.filter(i => chaveDia(paraData(i.inicio)) === diaAberto)
      : (verAtrasados ? [...atrasados, ...emDia] : emDia)
    const m = new Map<string, Item[]>()
    for (const i of base) {
      const k = chaveDia(paraData(i.inicio))
      const l = m.get(k) || []; l.push(i); m.set(k, l)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [visiveis, emDia, atrasados, verAtrasados, diaAberto])

  // Grade do mês: começa no domingo da semana do dia 1 e fecha só as semanas que o mês precisa.
  // Fixar em 6 linhas sempre deixava uma faixa vazia embaixo empurrando a lista pra fora da tela.
  const grade = useMemo(() => {
    const ini = new Date(mes.getFullYear(), mes.getMonth(), 1)
    ini.setDate(1 - ini.getDay())
    const ultimo = new Date(mes.getFullYear(), mes.getMonth() + 1, 0)
    const semanas = Math.ceil((ultimo.getDate() + new Date(mes.getFullYear(), mes.getMonth(), 1).getDay()) / 7)
    return Array.from({ length: semanas * 7 }, (_, n) => {
      const d = new Date(ini); d.setDate(ini.getDate() + n); return d
    })
  }, [mes])

  const contas = useMemo(() => {
    const abertos = itens.filter(i => !i.concluido)
    return {
      hoje: abertos.filter(i => chaveDia(paraData(i.inicio)) === hj).length,
      meus: abertos.filter(i => i.donoId === eu?.id || i.ajudaDe === eu?.id).length,
      semDono: abertos.filter(i => !i.donoId).length,
      atrasados: abertos.filter(i => chaveDia(paraData(i.inicio)) < hj).length,
    }
  }, [itens, eu, hj])

  const filtros = [
    { id: 'tudo' as const, nome: 'Tudo' },
    { id: 'meu' as const, nome: `Meus (${contas.meus})` },
    { id: 'grupo' as const, nome: `Do grupo (${contas.semDono})` },
    ...(tenhoTime ? [{ id: 'time' as const, nome: 'Do time' }] : []),
  ]

  const mesmoMes = (d: Date) => d.getMonth() === mes.getMonth()
  const irPara = (n: number) => { setMes(new Date(mes.getFullYear(), mes.getMonth() + n, 1)); setDiaAberto(null) }

  return (
    <Layout>
      <div style={{ padding: '20px clamp(12px, 3vw, 32px)', maxWidth: 1240, margin: '0 auto' }}>

        {/* CABEÇALHO */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          {/* sem textTransform: capitalize — ele maiusculiza CADA palavra e vira "Setembro De 2026" */}
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', minWidth: 180 }}>
            {MESES[mes.getMonth()].replace(/^./, c => c.toUpperCase())} de {mes.getFullYear()}
          </h1>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => irPara(-1)} style={btnIcone}>‹</button>
            <button onClick={() => { setMes(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); setDiaAberto(null) }} style={{ ...btnIcone, width: 'auto', padding: '0 12px' }}>Hoje</button>
            <button onClick={() => irPara(1)} style={btnIcone}>›</button>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {filtros.map(f => (
              <button key={f.id} onClick={() => { setFiltro(f.id); setDiaAberto(null) }} style={chip(filtro === f.id)}>{f.nome}</button>
            ))}
          </div>
          <button onClick={() => setNovo(true)} style={btnPri}>+ Novo</button>
        </div>

        {erro && <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: 'var(--red)' }}>{erro}</div>}

        {carregando ? <p style={{ fontSize: 14, color: 'var(--text-faint)' }}>Carregando...</p> : <>

          {/* CALENDÁRIO */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface)' }}>
            {/* ⚠️ minmax(0, 1fr), não 1fr. Em CSS grid o mínimo de `1fr` é o tamanho do CONTEÚDO:
                com títulos longos e nowrap, cada coluna cresce até caber o texto e a grade
                inteira estoura pra fora da tela — foi o que aconteceu na primeira versão, só
                quatro dias apareciam. `minmax(0, ...)` deixa a coluna encolher e o texto cortar. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
              {DIAS.map(d => (
                <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>{d}</div>
              ))}
              {grade.map((d, n) => {
                const k = chaveDia(d)
                const doDia = porDiaCalendario.get(k) || []
                const hoje = k === hj
                const sel = k === diaAberto
                return (
                  <div key={n} onClick={() => setDiaAberto(sel ? null : k)}
                    style={{
                      minHeight: 74, padding: '5px 5px 3px', cursor: 'pointer', minWidth: 0, overflow: 'hidden',
                      borderRight: (n % 7 === 6) ? 'none' : '1px solid var(--border)',
                      borderBottom: n < grade.length - 7 ? '1px solid var(--border)' : 'none',
                      background: sel ? 'var(--accent-bg)' : hoje ? 'var(--surface-2)' : 'transparent',
                      opacity: mesmoMes(d) ? 1 : 0.35,
                    }}>
                    <div style={{
                      fontSize: 12, fontWeight: hoje ? 700 : 500, marginBottom: 4,
                      color: hoje ? 'var(--accent-soft)' : 'var(--text-muted)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <span>{d.getDate()}</span>
                      {doDia.length > 3 && <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{doDia.length}</span>}
                    </div>
                    {doDia.slice(0, 3).map(i => (
                      <div key={i.fonte + i.id} onClick={e => { e.stopPropagation(); setDetalhe(i) }}
                        title={i.titulo}
                        style={{
                          fontSize: 10.5, lineHeight: '14px', marginBottom: 2, padding: '1px 4px', borderRadius: 3,
                          background: k < hj ? 'var(--red-bg)' : 'var(--surface-2)',
                          color: k < hj ? 'var(--red)' : FONTES[i.fonte].cor,
                          borderLeft: `2px solid ${k < hj ? 'var(--red)' : FONTES[i.fonte].cor}`,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
                        }}>
                        {horaDe(i) && <span style={{ opacity: 0.75 }}>{horaDe(i)} </span>}{i.titulo}
                      </div>
                    ))}
                    {doDia.length > 3 && (
                      <div style={{ fontSize: 10, color: 'var(--text-faint)', paddingLeft: 5 }}>+{doDia.length - 3} mais</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* FAIXA DE ATRASADOS — recolhida, pra não enterrar o dia de hoje */}
          {atrasados.length > 0 && !diaAberto && (
            <div onClick={() => setVerAtrasados(v => !v)}
              style={{ marginTop: 16, background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <span style={{ fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>{atrasados.length} atrasado{atrasados.length > 1 ? 's' : ''}</span>
              <span style={{ fontSize: 12, color: 'var(--red)', opacity: 0.85 }}>
                {verAtrasados ? 'aparecendo na lista abaixo' : 'fora da lista, pra não atrapalhar o dia'}
              </span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: 'var(--red)' }}>{verAtrasados ? 'esconder' : 'mostrar'}</span>
            </div>
          )}

          {/* LISTA */}
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                {diaAberto ? rotuloDia(diaAberto) : 'Próximos dias'}
              </h2>
              {diaAberto && <button onClick={() => setDiaAberto(null)} style={{ ...chip(false), padding: '3px 10px' }}>ver todos</button>}
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            {listaDeBaixo.length === 0 ? (
              <p style={{ fontSize: 14, color: 'var(--text-faint)', padding: '24px 0' }}>
                {diaAberto ? 'Nada neste dia.' : 'Nada pela frente. Bom sinal — ou hora de pegar algo do grupo.'}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {listaDeBaixo.map(([dia, lista]) => (
                  <div key={dia}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: dia < hj ? 'var(--red)' : dia === hj ? 'var(--accent-soft)' : 'var(--text-muted)' }}>
                      {dia < hj ? 'Atrasado · ' : ''}{rotuloDia(dia)}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {lista.map(i => (
                        <Linha key={i.fonte + i.id} it={i} eu={eu} nomeDe={nomeDe}
                          ocupado={ocupado === i.id} onConcluir={() => concluir(i)} onAbrir={() => setDetalhe(i)} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>}

        {detalhe && eu && (
          <ModalDetalhe it={detalhe} eu={eu} pessoas={pessoas} nomeDe={nomeDe} ocupado={ocupado === detalhe.id}
            onFechar={() => setDetalhe(null)}
            onPegar={q => pegar(detalhe, q)} onConcluir={() => { concluir(detalhe); setDetalhe(null) }}
            onPublico={p => abrirPublico(detalhe, p)} onAjuda={(q, n) => pedirAjuda(detalhe, q, n)} />
        )}
        {novo && eu && <ModalNovo eu={eu} pessoas={pessoas} diaSugerido={diaAberto} onFechar={() => setNovo(false)} onSalvo={() => { setNovo(false); carregar() }} />}
      </div>
    </Layout>
  )
}

// ── PEÇAS ─────────────────────────────────────────────────────────────────────
const btnPri = { padding: '8px 16px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties
const btnSec = { padding: '9px 16px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, cursor: 'pointer' } as React.CSSProperties
const btnIcone = { width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 15, cursor: 'pointer', lineHeight: 1 } as React.CSSProperties
const chip = (ativo: boolean) => ({
  padding: '6px 13px', borderRadius: 20, fontSize: 12.5, cursor: 'pointer',
  border: '1px solid ' + (ativo ? 'var(--accent)' : 'var(--border)'),
  background: ativo ? 'var(--accent-bg)' : 'transparent',
  color: ativo ? 'var(--accent-soft)' : 'var(--text-muted)',
  fontWeight: ativo ? 600 : 400,
}) as React.CSSProperties
const inp = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontSize: 14, outline: 'none', width: '100%' } as React.CSSProperties

// A linha: bolinha pra concluir, e o resto abre ao clicar. Sem fileira de botões.
function Linha({ it, eu, nomeDe, ocupado, onConcluir, onAbrir }: {
  it: Item; eu: Eu | null; nomeDe: (id: string | null) => string | null
  ocupado: boolean; onConcluir: () => void; onAbrir: () => void
}) {
  const f = FONTES[it.fonte]
  const meu = it.donoId === eu?.id
  const chamado = it.ajudaDe === eu?.id
  const hora = horaDe(it)
  return (
    <div onClick={onAbrir} style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', cursor: 'pointer',
      background: 'var(--surface)', borderRadius: 8,
      border: '1px solid ' + (chamado ? 'var(--amber)' : 'var(--border)'),
    }}>
      <button title="Concluir" disabled={ocupado} onClick={e => { e.stopPropagation(); onConcluir() }}
        style={{ width: 17, height: 17, flexShrink: 0, borderRadius: '50%', border: '1.5px solid var(--text-faint)', background: 'transparent', cursor: 'pointer', padding: 0 }} />
      <span style={{ fontSize: 12, color: 'var(--text-faint)', width: 42, flexShrink: 0 }}>{hora || '—'}</span>
      <span style={{ width: 3, height: 16, borderRadius: 2, background: f.cor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.titulo}</div>
        {(it.subtitulo || chamado) && (
          <div style={{ fontSize: 11.5, color: chamado ? 'var(--amber)' : 'var(--text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {chamado ? 'pediram tua ajuda' : it.subtitulo}
          </div>
        )}
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-faint)', flexShrink: 0 }}>
        {!it.donoId ? 'sem dono' : meu ? 'seu' : nomeDe(it.donoId)}
      </span>
    </div>
  )
}

function ModalDetalhe({ it, eu, pessoas, nomeDe, ocupado, onFechar, onPegar, onConcluir, onPublico, onAjuda }: {
  it: Item; eu: Eu; pessoas: Pessoa[]; nomeDe: (id: string | null) => string | null; ocupado: boolean
  onFechar: () => void; onPegar: (quem: string | null) => void; onConcluir: () => void
  onPublico: (p: boolean) => void; onAjuda: (quem: string, nota: string) => void
}) {
  const [pedindo, setPedindo] = useState(false)
  const [quem, setQuem] = useState('')
  const [nota, setNota] = useState('')
  const f = FONTES[it.fonte]
  const meu = it.donoId === eu.id
  const d = paraData(it.inicio)

  return (
    <Modal titulo={it.titulo} onFechar={onFechar}>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ color: f.cor }}>{f.rotulo}</span>
        <span>· {d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</span>
        {!it.diaTodo && <span>· {horaDe(it)}</span>}
        {it.setor && <span>· {it.setor}</span>}
        <span>· {it.donoId ? (meu ? 'seu' : `de ${nomeDe(it.donoId)}`) : 'sem dono'}</span>
        {it.publico && <span>· público</span>}
      </div>
      {it.subtitulo && <p style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.5 }}>{it.subtitulo}</p>}
      {it.ajudaDe && (
        <div style={{ background: 'var(--amber-bg)', border: '1px solid var(--amber)', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: 'var(--amber)' }}>
          {nomeDe(it.ajudaDe)} foi chamado pra ajudar{it.ajudaNota ? `: "${it.ajudaNota}"` : ''}. O item continua de quem sempre foi.
        </div>
      )}

      {pedindo ? (
        <>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55 }}>
            Quem você chamar entra junto — mas o item <strong style={{ color: 'var(--text)' }}>continua sendo seu</strong>, e a venda também.
          </p>
          <select value={quem} onChange={e => setQuem(e.target.value)} style={inp}>
            <option value="">Chamar quem...</option>
            {pessoas.filter(p => p.id !== eu.id).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <input value={nota} onChange={e => setNota(e.target.value)} style={inp} placeholder="O que você precisa (opcional)" />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setPedindo(false)} style={{ ...btnSec, flex: 1 }}>Voltar</button>
            <button disabled={!quem} onClick={() => onAjuda(quem, nota)} style={{ ...btnPri, flex: 1, opacity: quem ? 1 : 0.5 }}>Pedir ajuda</button>
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!it.donoId && <button disabled={ocupado} onClick={() => onPegar(eu.id)} style={btnPri}>Pegar pra mim</button>}
          {meu && <button disabled={ocupado} onClick={() => onPegar(null)} style={btnSec}>Devolver ao grupo</button>}
          {(meu || !it.donoId) && <button onClick={() => setPedindo(true)} style={btnSec}>Pedir ajuda</button>}
          {meu && it.fonte === 'agenda' && <button disabled={ocupado} onClick={() => onPublico(!it.publico)} style={btnSec}>{it.publico ? 'Tornar privado' : 'Tornar público'}</button>}
          {it.leadId && <a href={`/dashboard/crm?lead=${it.leadId}`} style={{ ...btnSec, textDecoration: 'none' }}>Abrir cliente</a>}
          <div style={{ flex: 1 }} />
          <button disabled={ocupado} onClick={onConcluir} style={{ ...btnSec, borderColor: 'var(--green)', color: 'var(--green)' }}>Concluir</button>
        </div>
      )}
    </Modal>
  )
}

function ModalNovo({ eu, pessoas, diaSugerido, onFechar, onSalvo }: {
  eu: Eu; pessoas: Pessoa[]; diaSugerido: string | null; onFechar: () => void; onSalvo: () => void
}) {
  const base = new Date()
  if (diaSugerido) { const [a, m, d] = diaSugerido.split('-').map(Number); base.setFullYear(a, m - 1, d) }
  base.setMinutes(0, 0, 0); base.setHours(base.getHours() + 1)
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:00`
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  // ⚠️ SÓ estes três: a tabela tem uma trava (`agenda_eventos_tipo_check`) herdada da agenda antiga,
  // e qualquer outro valor é recusado na hora de salvar. Achado testando, não lendo o código.
  const [tipo, setTipo] = useState('reuniao')
  const [inicio, setInicio] = useState(fmt(base))
  const [fim, setFim] = useState(fmt(new Date(base.getTime() + 36e5)))
  const [dono, setDono] = useState<string>(eu.id)
  const [publico, setPublico] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function salvar() {
    if (!titulo.trim()) { setErro('Falta o título.'); return }
    // `fim` é obrigatório no banco. Data vazia viraria "Invalid Date" e estouraria antes de salvar.
    const dIni = new Date(inicio), dFim = new Date(fim)
    if (isNaN(+dIni) || isNaN(+dFim)) { setErro('Confira as datas.'); return }
    if (dFim <= dIni) { setErro('O fim precisa ser depois do início.'); return }
    setSalvando(true); setErro('')
    const { error } = await supabase.from('agenda_eventos').insert({
      titulo, descricao: descricao || null, tipo,
      inicio: dIni.toISOString(), fim: dFim.toISOString(),
      usuario_id: dono || null, publico, criado_por: eu.id,
    })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    onSalvo()
  }

  return (
    <Modal titulo="Novo compromisso" onFechar={onFechar}>
      <input value={titulo} onChange={e => setTitulo(e.target.value)} style={inp} placeholder="O que é?" autoFocus />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <input type="datetime-local" value={inicio} onChange={e => setInicio(e.target.value)} style={inp} />
        <input type="datetime-local" value={fim} onChange={e => setFim(e.target.value)} style={inp} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <select value={tipo} onChange={e => setTipo(e.target.value)} style={inp}>
          <option value="reuniao">Reunião</option>
          <option value="ligacao">Ligação</option>
          <option value="tarefa">Tarefa</option>
        </select>
        <select value={dono} onChange={e => setDono(e.target.value)} style={inp}>
          <option value={eu.id}>Meu</option>
          <option value="">Do grupo</option>
          {pessoas.filter(p => p.id !== eu.id).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </div>
      <input value={descricao} onChange={e => setDescricao(e.target.value)} style={inp} placeholder="Detalhe (opcional)" />
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-muted)', cursor: 'pointer' }}>
        <input type="checkbox" checked={publico} onChange={e => setPublico(e.target.checked)} />
        Público — todo mundo vê, inclusive quem está abaixo de você
      </label>
      {erro && <p style={{ fontSize: 12, color: 'var(--red)' }}>{erro}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onFechar} style={{ ...btnSec, flex: 1 }}>Cancelar</button>
        <button onClick={salvar} disabled={salvando} style={{ ...btnPri, flex: 1 }}>{salvando ? 'Salvando...' : 'Salvar'}</button>
      </div>
    </Modal>
  )
}

function Modal({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 22, width: 470, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 13 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <h2 style={{ fontSize: 15.5, fontWeight: 600, color: 'var(--text)', lineHeight: 1.35 }}>{titulo}</h2>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
