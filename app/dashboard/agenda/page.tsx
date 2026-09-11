'use client'

import { useEffect, useMemo, useState } from 'react'
import Layout from '@/components/Layout'
import { supabase } from '@/lib/supabase'
import { fetchAuth } from '@/lib/api'
import { Vazio } from '@/components/ui'
import { ChevronLeft, ChevronRight, Plus, CalendarDays, Pencil, X } from 'lucide-react'

// A AGENDA — calendário em cima, próximos dias embaixo.
//
// Quatro fontes num lugar só: compromissos (agenda_eventos), tarefas (tarefas), follow-ups de
// cliente (tarefas_lead) e marcos de entrega (projeto_marcos). Quem enxerga o quê é decidido no
// servidor (app/api/agenda), porque várias dessas tabelas continuam abertas pra empresa inteira.
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
//
// O BALÃO: o que é meu e ainda não vi acende um ponto vermelho no dia e na linha, e soma no balão
// do menu. Clicar no dia marca aquele dia como visto; abrir o item marca o item; "Marcar como não
// lido" acende de novo. A regra de o que acende mora no servidor (lib/agenda-balao.ts) — aqui só se
// mostra e se avisa o que foi visto. Só o que está NA TELA é marcado: com o filtro "Do grupo" os
// meus itens nem aparecem, e clicar no dia não pode apagá-los.
//
// ENTREGA É SÓ LEITURA AQUI. O marco de entrega se conclui, combina e remarca na ficha da entrega,
// onde vale a regra de ouro: encontro não fecha sem marcar o próximo com o cliente. Por isso a linha
// dele não tem bolinha de concluir, e o detalhe só leva pra ficha. Marco PREVISTO (o roteiro
// calculou, ninguém combinou) aparece tracejado e sem hora — é sombra, não reunião marcada.

type Item = {
  id: string
  fonte: 'agenda' | 'turma' | 'lead' | 'entrega'
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
  participantes?: string[]
  projetoId?: string | null
  estado?: string | null
  situacao?: string | null
  cor?: string | null
}
type Pessoa = { id: string; nome: string; papel: string; setor: string; ativo?: boolean }
type Eu = { id: string; nome: string; papel: string; setor: string; souDono: boolean }

// Rótulos por NATUREZA, não por ramo: "Turma" só faz sentido em escola. Compromisso, tarefa,
// follow-up e entrega existem em qualquer negócio, que é onde este sistema vai parar.
const FONTES: Record<Item['fonte'], { rotulo: string; cor: string }> = {
  agenda: { rotulo: 'Compromisso', cor: 'var(--accent)' },
  turma: { rotulo: 'Tarefa', cor: 'var(--amber)' },
  lead: { rotulo: 'Follow-up', cor: 'var(--blue)' },
  entrega: { rotulo: 'Entrega', cor: 'var(--green)' },
}
// Cor da linha: entrega usa a do roteiro (a mesma da agenda de entregas); o resto, a da fonte.
const corDe = (i: Item) => (i.fonte === 'entrega' && i.cor) || FONTES[i.fonte].cor
const ehPrevisto = (i: Item) => i.fonte === 'entrega' && i.estado === 'previsto'
// O que a entrega precisa de ti agora (situacaoMarco, em lib/entrega.ts)
const AVISO_ENTREGA: Record<string, string> = { confirmar: 'reconfirmar com o cliente', a_remarcar: 'remarcar', atrasado: 'atrasado' }

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
// A mesma chave que o servidor usa pro balão (lib/agenda-balao.ts): `fonte:id`
const chaveDe = (i: Item) => `${i.fonte}:${i.id}`

function rotuloDia(chave: string) {
  const hoje = new Date(), amanha = new Date(); amanha.setDate(hoje.getDate() + 1)
  if (chave === chaveDia(hoje)) return 'Hoje'
  if (chave === chaveDia(amanha)) return 'Amanhã'
  const [a, m, d] = chave.split('-').map(Number)
  const dt = new Date(a, m - 1, d)
  // só a primeira letra: `capitalize` do CSS maiusculiza cada palavra e produz "Seg, 14 De Setembro"
  return `${DIAS[dt.getDay()]}, ${d} de ${MESES[m - 1]}`.replace(/^./, c => c.toUpperCase())
}

// É "meu" o que eu tenho de fazer: o que é meu, aquilo em que me pediram ajuda, e a reunião pra
// qual me chamaram. Sem o último, quem é convidado teria que caçar a reunião no "Tudo".
const ehMeu = (i: Item, euId?: string) =>
  !!euId && (i.donoId === euId || i.ajudaDe === euId || !!i.participantes?.includes(euId))

// Avisa o menu (components/Layout.tsx) do número novo do balão, sem esperar o próximo minuto.
const avisarMenu = (total: number) => window.dispatchEvent(new CustomEvent('agenda:balao', { detail: { total } }))

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
  // O compromisso sendo editado — abre o mesmo formulário do "+ Novo", já preenchido.
  const [editar, setEditar] = useState<Item | null>(null)
  // A bolinha da lista não conclui direto: pergunta antes. Um clique sem querer sumia com o
  // compromisso da agenda, sem jeito de desfazer pela tela.
  const [confirmarConcluir, setConfirmarConcluir] = useState<Item | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  // O que está aceso no balão pra mim. `balaoPronto` falso = a instalação ainda não tem a tabela
  // de leituras: aí não aparece ponto nem "Marcar como não lido".
  const [balao, setBalao] = useState<Set<string>>(new Set())
  const [balaoPronto, setBalaoPronto] = useState(false)

  async function carregar() {
    setErro('')
    try {
      // Sem `ate`: o servidor usa o mesmo horizonte do balão, pra os dois nunca discordarem.
      const r = await fetchAuth('/api/agenda')
      if (!r.ok) { setErro(r.status === 401 ? 'Sessão expirada — recarregue a página.' : 'Não deu pra carregar a agenda.'); setCarregando(false); return }
      const d = await r.json()
      setEu(d.eu); setPessoas(d.pessoas || []); setTenhoTime(!!d.tenhoTime); setItens(d.itens || [])
      const b = new Set<string>(d.balao || [])
      setBalao(b); setBalaoPronto(!!d.balaoPronto)
      // concluir, pegar ou devolver também mexem no balão — o menu acompanha a cada recarga
      avisarMenu(d.balaoPronto ? b.size : 0)
    } catch { setErro('Não deu pra carregar a agenda.') }
    setCarregando(false)
  }
  useEffect(() => { carregar() }, [])

  // Marca como visto (ou não lido) — só pra mim. Some da tela na hora; depois vale o que o servidor
  // devolver. Se falhar, a próxima recarga acerta: não vale travar a tela por uma leitura.
  async function marcar(chaves: string[], como: 'lido' | 'nao_lido') {
    if (!balaoPronto || !chaves.length) return
    const local = new Set(balao)
    for (const k of chaves) { if (como === 'lido') local.delete(k); else local.add(k) }
    setBalao(local); avisarMenu(local.size)
    const r = await fetchAuth('/api/agenda/leituras', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ como, chaves }),
    }).catch(() => null)
    const j = r ? await r.json().catch(() => null) : null
    if (j?.ok) { const s = new Set<string>(j.chaves || []); setBalao(s); avisarMenu(s.size) }
  }
  const acesas = (lista: Item[]) => lista.map(chaveDe).filter(k => balao.has(k))

  // Abrir um item é ver o item.
  function abrir(i: Item) {
    setDetalhe(i)
    if (balao.has(chaveDe(i))) marcar([chaveDe(i)], 'lido')
  }

  // `nomeDe` olha TODO mundo, inclusive quem saiu — item antigo ainda precisa do nome de quem era.
  // `ativos` é só quem pode ser escolhido agora: gente desativada não entra em lista de escolha.
  const nomeDe = (id: string | null) => (id ? pessoas.find(p => p.id === id)?.nome || 'outra pessoa' : null)
  const ativos = useMemo(() => pessoas.filter(p => p.ativo !== false), [pessoas])
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
    if (it.fonte === 'lead') return supabase.from('tarefas_lead').update({ vendedor_id: quem }).eq('id', it.id)
    return { error: { message: 'Entrega se resolve na ficha da entrega.' } } as any
  })
  const concluir = (it: Item) => acao(it.id, async () => {
    const agora = new Date().toISOString()
    if (it.fonte === 'agenda') return supabase.from('agenda_eventos').update({ concluido: true, concluido_em: agora }).eq('id', it.id)
    if (it.fonte === 'turma') return supabase.from('tarefas').update({ status: 'concluida', concluida_em: agora }).eq('id', it.id)
    if (it.fonte === 'lead') return supabase.from('tarefas_lead').update({ concluida: true, concluida_em: agora, atualizado_em: agora }).eq('id', it.id)
    // Nunca chega aqui pela tela (a linha de entrega não tem bolinha), mas se chegar, não conclui:
    // a ficha é que sabe pedir o próximo encontro antes de fechar este.
    return { error: { message: 'Encontro de entrega se conclui na ficha da entrega.' } } as any
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

  // Editar compromisso: quem organiza (dono), compromisso do grupo, o dono da empresa, ou quem tem
  // gente abaixo (o banco confere se aquele dono responde a mim). Quem só foi CHAMADO pra reunião
  // não edita — o banco recusaria, e o botão nem aparece pra não prometer o que não entrega.
  const podeEditar = (i: Item) => !!eu && i.fonte === 'agenda'
    && (i.donoId === eu.id || !i.donoId || eu.souDono || (tenhoTime && i.donoId !== eu.id && !i.participantes?.includes(eu.id)))

  // ── SEPARAÇÃO ───────────────────────────────────────────────────────────────
  const visiveis = useMemo(() => {
    const abertos = itens.filter(i => !i.concluido)
    if (filtro === 'meu') return abertos.filter(i => ehMeu(i, eu?.id))
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
      meus: abertos.filter(i => ehMeu(i, eu?.id)).length,
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
  const atrasadosAcesos = acesas(atrasados).length

  return (
    <Layout>
      <div style={{ padding: '20px clamp(12px, 3vw, 32px)', maxWidth: 1240, margin: '0 auto' }}>

        {/* CABEÇALHO */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          {/* sem textTransform: capitalize — ele maiusculiza CADA palavra e vira "Setembro De 2026" */}
          <h1 className="display relevo-titulo" style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', minWidth: 200, margin: 0 }}>
            {MESES[mes.getMonth()].replace(/^./, c => c.toUpperCase())} <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>de {mes.getFullYear()}</span>
          </h1>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => irPara(-1)} style={btnIcone} aria-label="Mês anterior"><ChevronLeft size={16} /></button>
            <button onClick={() => { setMes(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); setDiaAberto(null) }} style={{ ...btnIcone, width: 'auto', padding: '0 12px', fontWeight: 600 }}>Hoje</button>
            <button onClick={() => irPara(1)} style={btnIcone} aria-label="Próximo mês"><ChevronRight size={16} /></button>
          </div>
          {balaoPronto && balao.size > 0 && (
            <span style={{ fontSize: 12, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={pontoVermelho} /> {balao.size} {balao.size > 1 ? 'coisas' : 'coisa'} tua{balao.size > 1 ? 's' : ''} pra ver — clica no dia marcado
            </span>
          )}
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {filtros.map(f => (
              <button key={f.id} onClick={() => { setFiltro(f.id); setDiaAberto(null) }} style={chip(filtro === f.id)}>{f.nome}</button>
            ))}
          </div>
          <button onClick={() => setNovo(true)} className="btn-afunda" style={btnPri}><Plus size={15} strokeWidth={2.4} /> Novo</button>
        </div>

        {erro && <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 'var(--r)', padding: '10px 14px', marginBottom: 12, fontSize: 13, color: 'var(--red)' }}>{erro}</div>}

        {carregando ? (
          <div style={{ display: 'grid', gap: 14 }}>
            <div className="esqueleto" style={{ height: 380, borderRadius: 'var(--r-lg)' }} />
            <div className="esqueleto" style={{ height: 46, borderRadius: 'var(--r)' }} />
            <div className="esqueleto" style={{ height: 46, borderRadius: 'var(--r)' }} />
          </div>
        ) : <>

          {/* CALENDÁRIO — de vidro: é um elemento só, parado, com a luz atrás */}
          <div className="vidro" style={{ overflow: 'hidden' }}>
            {/* ⚠️ minmax(0, 1fr), não 1fr. Em CSS grid o mínimo de `1fr` é o tamanho do CONTEÚDO:
                com títulos longos e nowrap, cada coluna cresce até caber o texto e a grade
                inteira estoura pra fora da tela — foi o que aconteceu na primeira versão, só
                quatro dias apareciam. `minmax(0, ...)` deixa a coluna encolher e o texto cortar. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
              {DIAS.map(d => (
                <div key={d} style={{ padding: '9px 0', textAlign: 'center', fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', color: 'var(--text-faint)', textTransform: 'uppercase', borderBottom: '1px solid var(--glass-border)' }}>{d}</div>
              ))}
              {grade.map((d, n) => {
                const k = chaveDia(d)
                const doDia = porDiaCalendario.get(k) || []
                const hoje = k === hj
                const sel = k === diaAberto
                const acesos = acesas(doDia)
                return (
                  // Clicar no dia (pra abrir) é ver o dia: marca como visto o que está aceso NELE,
                  // e só o que está na tela com o filtro atual.
                  <div key={n} onClick={() => { if (!sel) marcar(acesos, 'lido'); setDiaAberto(sel ? null : k) }}
                    style={{
                      minHeight: 78, padding: '5px 5px 3px', cursor: 'pointer', minWidth: 0, overflow: 'hidden',
                      borderRight: (n % 7 === 6) ? 'none' : '1px solid var(--glass-border)',
                      borderBottom: n < grade.length - 7 ? '1px solid var(--glass-border)' : 'none',
                      background: sel ? 'var(--accent-bg)' : hoje ? 'var(--glass-field)' : 'transparent',
                      opacity: mesmoMes(d) ? 1 : 0.35,
                    }}>
                    <div style={{
                      fontSize: 12.5, fontWeight: hoje ? 800 : 500, marginBottom: 4,
                      color: hoje ? 'var(--accent-soft)' : 'var(--text-muted)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <span className="tnum" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {hoje
                          ? <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--grad)', color: '#fff', display: 'inline-grid', placeItems: 'center', fontSize: 11.5, fontWeight: 800, boxShadow: '0 3px 8px var(--glow)' }}>{d.getDate()}</span>
                          : d.getDate()}
                        {acesos.length > 0 && <span title={`${acesos.length} pra ver`} style={pontoVermelho} />}
                      </span>
                      {doDia.length > 3 && <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{doDia.length}</span>}
                    </div>
                    {doDia.slice(0, 3).map(i => {
                      const atras = k < hj, prev = ehPrevisto(i), cor = atras ? 'var(--red)' : corDe(i)
                      return (
                        <div key={i.fonte + i.id} onClick={e => { e.stopPropagation(); abrir(i) }}
                          title={prev ? `${i.titulo} (previsto — ainda não combinado)` : i.titulo}
                          style={{
                            fontSize: 10.5, lineHeight: '14px', marginBottom: 2, padding: '1px 4px', borderRadius: 3,
                            // previsto = sombra tracejada, sem fundo: está no calendário do contrato,
                            // mas ninguém combinou com o cliente ainda
                            background: prev ? 'transparent' : atras ? 'var(--red-bg)' : 'var(--surface-2)',
                            color: cor,
                            borderLeft: `2px ${prev ? 'dashed' : 'solid'} ${cor}`,
                            opacity: prev ? 0.75 : 1,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
                            fontWeight: balao.has(chaveDe(i)) ? 700 : 400,
                          }}>
                          {horaDe(i) && <span style={{ opacity: 0.75 }}>{horaDe(i)} </span>}{i.titulo}
                        </div>
                      )
                    })}
                    {doDia.length > 3 && (
                      <div style={{ fontSize: 10, color: 'var(--text-faint)', paddingLeft: 5 }}>+{doDia.length - 3} mais</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* FAIXA DE ATRASADOS — recolhida, pra não enterrar o dia de hoje.
              Abrir a faixa (clique de propósito) é ver os atrasados: marca os acesos. Só aparecer
              não marca — senão bastaria abrir a agenda pra o balão dos atrasados sumir sem ninguém ver. */}
          {atrasados.length > 0 && !diaAberto && (
            <div onClick={() => { if (!verAtrasados) marcar(acesas(atrasados), 'lido'); setVerAtrasados(v => !v) }}
              style={{ marginTop: 16, background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 'var(--r)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              {atrasadosAcesos > 0 && <span style={pontoVermelho} />}
              <span style={{ fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>{atrasados.length} atrasado{atrasados.length > 1 ? 's' : ''}</span>
              <span style={{ fontSize: 12, color: 'var(--red)', opacity: 0.85 }}>
                {verAtrasados ? 'aparecendo na lista abaixo' : atrasadosAcesos > 0 ? `${atrasadosAcesos} teu${atrasadosAcesos > 1 ? 's' : ''} ainda não vist${atrasadosAcesos > 1 ? 'os' : 'o'}` : 'fora da lista, pra não atrapalhar o dia'}
              </span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: 'var(--red)' }}>{verAtrasados ? 'esconder' : 'mostrar'}</span>
            </div>
          )}

          {/* LISTA */}
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <h2 className="display" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                {diaAberto ? rotuloDia(diaAberto) : 'Próximos dias'}
              </h2>
              {diaAberto && <button onClick={() => setDiaAberto(null)} style={{ ...chip(false), padding: '3px 10px' }}>ver todos</button>}
              <div style={{ flex: 1, height: 1, background: 'var(--glass-border)' }} />
            </div>

            {listaDeBaixo.length === 0 ? (
              <Vazio icone={CalendarDays} titulo={diaAberto ? 'Nada neste dia' : 'Nada pela frente'} texto={diaAberto ? undefined : 'Bom sinal — ou hora de pegar algo do grupo.'} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {listaDeBaixo.map(([dia, lista]) => (
                  <div key={dia}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6, color: dia < hj ? 'var(--red)' : dia === hj ? 'var(--accent-soft)' : 'var(--text-faint)' }}>
                      {dia < hj ? 'Atrasado · ' : ''}{rotuloDia(dia)}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {lista.map(i => (
                        <Linha key={i.fonte + i.id} it={i} eu={eu} nomeDe={nomeDe} naoLido={balao.has(chaveDe(i))}
                          ocupado={ocupado === i.id} onConcluir={() => setConfirmarConcluir(i)} onAbrir={() => abrir(i)} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>}

        {detalhe && eu && (
          <ModalDetalhe it={detalhe} eu={eu} ativos={ativos} nomeDe={nomeDe} ocupado={ocupado === detalhe.id}
            // Só pro que é meu e já está apagado: acender de novo um item que nem é meu não faria sentido.
            podeNaoLido={balaoPronto && detalhe.fonte !== 'entrega' && ehMeu(detalhe, eu.id) && !balao.has(chaveDe(detalhe))}
            onNaoLido={() => { marcar([chaveDe(detalhe)], 'nao_lido'); setDetalhe(null) }}
            podeEditar={podeEditar(detalhe)}
            onEditar={() => { setEditar(detalhe); setDetalhe(null) }}
            onFechar={() => setDetalhe(null)}
            // Pegar um item do grupo que outra pessoa criou faria ele acender como "novidade" pra mim
            // — mas fui eu que peguei, não é novidade. Marca como visto na hora.
            onPegar={async q => { const ok = await pegar(detalhe, q); if (ok && q) marcar([chaveDe(detalhe)], 'lido') }}
            onConcluir={() => { concluir(detalhe); setDetalhe(null) }}
            onPublico={p => abrirPublico(detalhe, p)} onAjuda={(q, n) => pedirAjuda(detalhe, q, n)} />
        )}
        {(novo || editar) && eu && (
          <ModalCompromisso eu={eu} ativos={ativos} diaSugerido={diaAberto} inicial={editar}
            onFechar={() => { setNovo(false); setEditar(null) }}
            onSalvo={() => { setNovo(false); setEditar(null); carregar() }} />
        )}
        {confirmarConcluir && (
          <Modal titulo="Concluir este item?" onFechar={() => setConfirmarConcluir(null)}>
            <p style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.5 }}>
              <b>{confirmarConcluir.titulo}</b>
              {' · '}{rotuloDia(chaveDia(paraData(confirmarConcluir.inicio)))}{horaDe(confirmarConcluir) ? `, ${horaDe(confirmarConcluir)}` : ''}
            </p>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>Concluído, ele sai da agenda.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmarConcluir(null)} style={{ ...btnSec, flex: 1 }}>Cancelar</button>
              <button autoFocus onClick={() => { concluir(confirmarConcluir); setConfirmarConcluir(null) }}
                style={{ ...btnPri, flex: 1, background: 'var(--green)' }}>Sim, concluir</button>
            </div>
          </Modal>
        )}
      </div>
    </Layout>
  )
}

// ── PEÇAS ─────────────────────────────────────────────────────────────────────
// o principal é o único com o gradiente do logo (e afunda no clique via .btn-afunda)
const btnPri = { padding: '9px 16px', background: 'var(--grad)', color: 'var(--on-accent)', border: 'none', borderRadius: 'var(--r)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 } as React.CSSProperties
const btnSec = { padding: '9px 16px', background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--border-strong)', borderRadius: 'var(--r)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 } as React.CSSProperties
const btnIcone = { width: 34, height: 34, borderRadius: 'var(--r)', border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties
const pontoVermelho = { width: 7, height: 7, borderRadius: '50%', background: 'var(--red)', flexShrink: 0, display: 'inline-block' } as React.CSSProperties
const chip = (ativo: boolean) => ({
  padding: '6px 13px', borderRadius: 'var(--r-pill)', fontSize: 12.5, cursor: 'pointer',
  border: '1px solid ' + (ativo ? 'var(--accent)' : 'var(--border-strong)'),
  background: ativo ? 'var(--accent-bg)' : 'transparent',
  color: ativo ? 'var(--accent-soft)' : 'var(--text-muted)',
  fontWeight: ativo ? 700 : 500,
}) as React.CSSProperties
const inp = { background: 'var(--glass-field)', border: '1px solid var(--border-strong)', borderRadius: 'var(--r)', padding: '10px 12px', color: 'var(--text)', fontSize: 14, outline: 'none', width: '100%' } as React.CSSProperties

// A linha: bolinha pra concluir, e o resto abre ao clicar. Sem fileira de botões.
function Linha({ it, eu, nomeDe, naoLido, ocupado, onConcluir, onAbrir }: {
  it: Item; eu: Eu | null; nomeDe: (id: string | null) => string | null; naoLido: boolean
  ocupado: boolean; onConcluir: () => void; onAbrir: () => void
}) {
  const f = FONTES[it.fonte]
  const meu = it.donoId === eu?.id
  const chamado = it.ajudaDe === eu?.id
  // convidado = me chamaram pra reunião de outra pessoa (a minha própria não é "convite")
  const convidado = !!eu && !meu && !!it.participantes?.includes(eu.id)
  const outros = (it.participantes || []).length
  const hora = horaDe(it)
  const entrega = it.fonte === 'entrega'
  const prev = ehPrevisto(it)
  const aviso = entrega && it.situacao ? AVISO_ENTREGA[it.situacao] : null
  const sub = chamado ? 'pediram tua ajuda'
    : convidado ? `você foi chamado · ${nomeDe(it.donoId) || 'grupo'} organiza`
    : entrega ? `${it.subtitulo || 'Entrega'}${prev ? ' · previsto, ainda não combinado' : ''}${aviso ? ' · ' + aviso : ''}`
    : it.subtitulo
  return (
    // Linha SÓLIDA, de propósito: a lista rola, e vidro em lista que rola trava.
    <div onClick={onAbrir} className="card-hover" style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer',
      background: prev ? 'transparent' : 'var(--surface)', borderRadius: 'var(--r)',
      border: `1px ${prev ? 'dashed' : 'solid'} ` + (chamado ? 'var(--amber)' : convidado ? 'var(--accent)' : 'var(--border)'),
      opacity: prev ? 0.8 : 1,
    }}>
      {/* Entrega não tem bolinha de concluir: fecha na ficha, que pede o próximo encontro. */}
      {entrega
        ? <span title="Conclui na ficha da entrega" style={{ width: 17, height: 17, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: corDe(it) }}>◆</span>
        : <button title="Concluir" disabled={ocupado} onClick={e => { e.stopPropagation(); onConcluir() }}
            style={{ width: 17, height: 17, flexShrink: 0, borderRadius: '50%', border: '1.5px solid var(--text-faint)', background: 'transparent', cursor: 'pointer', padding: 0 }} />}
      <span className="tnum" style={{ fontSize: 12, color: 'var(--text-muted)', width: 42, flexShrink: 0, fontWeight: 600 }}>{hora || '—'}</span>
      <span style={{ width: 3, height: 18, borderRadius: 2, background: corDe(it), flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 6, fontWeight: naoLido ? 700 : 500 }}>
          {naoLido && <span title="Ainda não visto" style={pontoVermelho} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.titulo}</span>
        </div>
        {sub && (
          <div style={{ fontSize: 11.5, color: chamado || aviso ? 'var(--amber)' : convidado ? 'var(--accent-soft)' : 'var(--text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {sub}
          </div>
        )}
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-faint)', flexShrink: 0 }}>
        {!it.donoId ? (entrega ? 'entrega' : 'sem dono') : meu ? 'seu' : nomeDe(it.donoId)}{outros > 0 ? ` +${outros}` : ''}
      </span>
    </div>
  )
}

function ModalDetalhe({ it, eu, ativos, nomeDe, ocupado, podeNaoLido, onNaoLido, podeEditar, onEditar, onFechar, onPegar, onConcluir, onPublico, onAjuda }: {
  it: Item; eu: Eu; ativos: Pessoa[]; nomeDe: (id: string | null) => string | null; ocupado: boolean
  podeNaoLido: boolean; onNaoLido: () => void
  podeEditar: boolean; onEditar: () => void
  onFechar: () => void; onPegar: (quem: string | null) => void; onConcluir: () => void
  onPublico: (p: boolean) => void; onAjuda: (quem: string, nota: string) => void
}) {
  const [pedindo, setPedindo] = useState(false)
  const [quem, setQuem] = useState('')
  const [nota, setNota] = useState('')
  const f = FONTES[it.fonte]
  const meu = it.donoId === eu.id
  const d = paraData(it.inicio)
  const participantes = it.participantes || []

  // ENTREGA: só mostra e leva pra ficha. Concluir, combinar e remarcar são da ficha, onde a regra
  // de não fechar encontro sem marcar o próximo está implementada.
  if (it.fonte === 'entrega') {
    const aviso = it.situacao ? AVISO_ENTREGA[it.situacao] : null
    return (
      <Modal titulo={it.titulo} onFechar={onFechar}>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ color: corDe(it) }}>Entrega · {it.subtitulo}</span>
          <span>· {d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</span>
          {!it.diaTodo && <span>· {horaDe(it)}</span>}
          <span>· {it.donoId ? (meu ? 'seu' : `de ${nomeDe(it.donoId)}`) : 'sem responsável'}</span>
        </div>
        {ehPrevisto(it) && (
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            <b style={{ color: 'var(--text-2)' }}>Previsto:</b> o roteiro calculou esta data, mas ainda não foi combinada com o cliente.
          </p>
        )}
        {aviso && (
          <div style={{ background: 'var(--amber-bg)', border: '1px solid var(--amber)', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: 'var(--amber)' }}>
            Precisa de ti: {aviso}.
          </div>
        )}
        <p style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.5 }}>
          Combinar, remarcar e concluir se faz na ficha da entrega — lá, antes de fechar um encontro, o sistema pede o próximo.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onFechar} style={{ ...btnSec, flex: 1 }}>Fechar</button>
          <a href={`/dashboard/entregas/${it.projetoId}`} style={{ ...btnPri, flex: 1, textAlign: 'center', textDecoration: 'none' }}>Abrir a entrega</a>
        </div>
      </Modal>
    )
  }

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
      {participantes.length > 0 && (
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          <b style={{ color: 'var(--text-2)' }}>Participam:</b> {participantes.map(id => id === eu.id ? 'você' : nomeDe(id)).join(', ')}
        </div>
      )}
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
            {ativos.filter(p => p.id !== eu.id).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <input value={nota} onChange={e => setNota(e.target.value)} style={inp} placeholder="O que você precisa (opcional)" />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setPedindo(false)} style={{ ...btnSec, flex: 1 }}>Voltar</button>
            <button disabled={!quem} onClick={() => onAjuda(quem, nota)} style={{ ...btnPri, flex: 1, opacity: quem ? 1 : 0.5 }}>Pedir ajuda</button>
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {podeEditar && <button onClick={onEditar} style={{ ...btnSec, borderColor: 'var(--accent)', color: 'var(--accent-soft)' }}><Pencil size={13} /> Editar</button>}
          {!it.donoId && <button disabled={ocupado} onClick={() => onPegar(eu.id)} style={btnPri}>Pegar pra mim</button>}
          {meu && <button disabled={ocupado} onClick={() => onPegar(null)} style={btnSec}>Devolver ao grupo</button>}
          {(meu || !it.donoId) && <button onClick={() => setPedindo(true)} style={btnSec}>Pedir ajuda</button>}
          {meu && it.fonte === 'agenda' && <button disabled={ocupado} onClick={() => onPublico(!it.publico)} style={btnSec}>{it.publico ? 'Tornar privado' : 'Tornar público'}</button>}
          {it.leadId && <a href={`/dashboard/crm?lead=${it.leadId}`} style={{ ...btnSec, textDecoration: 'none' }}>Abrir cliente</a>}
          {podeNaoLido && <button onClick={onNaoLido} style={{ ...btnSec, color: 'var(--red)', borderColor: 'var(--red)' }}>Marcar como não lido</button>}
          <div style={{ flex: 1 }} />
          <button disabled={ocupado} onClick={onConcluir} style={{ ...btnSec, borderColor: 'var(--green)', color: 'var(--green)' }}>Concluir</button>
        </div>
      )}
    </Modal>
  )
}

// Criar E editar compromisso — o mesmo formulário. Com `inicial`, abre preenchido e salva por cima.
function ModalCompromisso({ eu, ativos, diaSugerido, inicial, onFechar, onSalvo }: {
  eu: Eu; ativos: Pessoa[]; diaSugerido: string | null; inicial?: Item | null; onFechar: () => void; onSalvo: () => void
}) {
  const base = new Date()
  if (diaSugerido) { const [a, m, d] = diaSugerido.split('-').map(Number); base.setFullYear(a, m - 1, d) }
  base.setMinutes(0, 0, 0); base.setHours(base.getHours() + 1)
  // Com os minutos: editar um compromisso das 8h30 não pode devolver 8h00.
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const iniDe = inicial ? new Date(inicial.inicio) : base
  const fimDe = inicial?.fim ? new Date(inicial.fim) : new Date(iniDe.getTime() + 36e5)
  // ⚠️ SÓ estes três: a tabela tem uma trava (`agenda_eventos_tipo_check`) herdada da agenda antiga,
  // e qualquer outro valor é recusado na hora de salvar. Achado testando, não lendo o código.
  const TIPOS = ['reuniao', 'ligacao', 'tarefa']
  const [titulo, setTitulo] = useState(inicial?.titulo || '')
  const [descricao, setDescricao] = useState(inicial?.subtitulo || '')
  const [tipo, setTipo] = useState(inicial?.tipo && TIPOS.includes(inicial.tipo) ? inicial.tipo : 'reuniao')
  const [inicio, setInicio] = useState(fmt(iniDe))
  const [fim, setFim] = useState(fmt(fimDe))
  const [dono, setDono] = useState<string>(inicial ? (inicial.donoId || '') : eu.id)
  // Quem foi chamado. Não vira dono — quem manda no compromisso é `dono`. Participante enxerga,
  // inclusive se o compromisso for privado de alguém acima dele (21-participantes-na-agenda.sql).
  const [participantes, setParticipantes] = useState<string[]>(inicial?.participantes || [])
  const [publico, setPublico] = useState(!!inicial?.publico)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  // O dono não aparece como participante de si mesmo: se trocar o dono pra alguém que estava
  // marcado, tira a marcação.
  function trocarDono(novo: string) {
    setDono(novo)
    setParticipantes(c => c.filter(x => x !== novo))
  }
  const alternar = (id: string) => setParticipantes(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id])

  async function salvar() {
    if (!titulo.trim()) { setErro('Falta o título.'); return }
    // `fim` é obrigatório no banco. Data vazia viraria "Invalid Date" e estouraria antes de salvar.
    const dIni = new Date(inicio), dFim = new Date(fim)
    if (isNaN(+dIni) || isNaN(+dFim)) { setErro('Confira as datas.'); return }
    if (dFim <= dIni) { setErro('O fim precisa ser depois do início.'); return }
    setSalvando(true); setErro('')
    const dados = {
      titulo, descricao: descricao || null, tipo,
      inicio: dIni.toISOString(), fim: dFim.toISOString(),
      usuario_id: dono || null, publico,
    }

    if (inicial) {
      // ⚠️ Edição recusada pela regra do banco NÃO dá erro: volta "ok" com zero linhas alteradas, e a
      // tela acharia que salvou. Por isso o `.select` — sem linha de volta, não salvou.
      // Aqui a lista de participantes vai sempre, mesmo vazia: tirar todo mundo também é editar.
      const { data, error } = await supabase.from('agenda_eventos')
        .update({ ...dados, participantes, atualizado_em: new Date().toISOString() })
        .eq('id', inicial.id).select('id')
      setSalvando(false)
      if (error) { setErro(error.message); return }
      if (!data?.length) { setErro('Não deu pra salvar: só quem organiza este compromisso, ou quem está acima dele, pode editar.'); return }
      onSalvo(); return
    }

    const { error } = await supabase.from('agenda_eventos').insert({
      ...dados, criado_por: eu.id,
      // Só manda a lista quando há alguém marcado: compromisso sem convidado continua salvando
      // mesmo numa instalação que ainda não rodou o 21 e não tem a coluna.
      ...(participantes.length ? { participantes } : {}),
    })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    onSalvo()
  }

  const escolhiveis = ativos.filter(p => p.id !== dono)

  return (
    <Modal titulo={inicial ? 'Editar compromisso' : 'Novo compromisso'} onFechar={onFechar}>
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
        <select value={dono} onChange={e => trocarDono(e.target.value)} style={inp} title="Quem organiza — é o dono do compromisso">
          <option value={eu.id}>Organizo eu</option>
          <option value="">Do grupo</option>
          {ativos.filter(p => p.id !== eu.id).map(p => <option key={p.id} value={p.id}>Organiza: {p.nome}</option>)}
        </select>
      </div>

      <div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 7 }}>
          Quem participa{participantes.length > 0 ? ` · ${participantes.length} marcado${participantes.length > 1 ? 's' : ''}` : ' — clique pra marcar'}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {escolhiveis.map(p => {
            const on = participantes.includes(p.id)
            return (
              <button key={p.id} type="button" onClick={() => alternar(p.id)} style={{ ...chip(on), padding: '5px 11px', fontSize: 12 }}>
                {on ? '✓ ' : ''}{p.id === eu.id ? 'Eu' : p.nome}
              </button>
            )
          })}
        </div>
      </div>

      <input value={descricao} onChange={e => setDescricao(e.target.value)} style={inp} placeholder="Detalhe (opcional)" />
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-muted)', cursor: 'pointer' }}>
        <input type="checkbox" checked={publico} onChange={e => setPublico(e.target.checked)} />
        Público — todo mundo vê, inclusive quem está abaixo de você
      </label>
      {erro && <p style={{ fontSize: 12, color: 'var(--red)' }}>{erro}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onFechar} style={{ ...btnSec, flex: 1 }}>Cancelar</button>
        <button onClick={salvar} disabled={salvando} style={{ ...btnPri, flex: 1 }}>{salvando ? 'Salvando...' : inicial ? 'Salvar alterações' : 'Salvar'}</button>
      </div>
    </Modal>
  )
}

function Modal({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: React.ReactNode }) {
  return (
    // Modal de vidro: fica parado, e o fundo escurecido + desfocado atrás é o que dá a profundidade.
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, background: 'rgba(8,4,20,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="vidro" style={{ padding: 22, width: 470, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 13, background: 'var(--surface)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <h2 className="display" style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', lineHeight: 1.25, margin: 0 }}>{titulo}</h2>
          <button onClick={onFechar} aria-label="Fechar" style={{ background: 'var(--glass-field)', border: '1px solid var(--glass-border)', borderRadius: '50%', width: 30, height: 30, color: 'var(--text-muted)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><X size={15} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
