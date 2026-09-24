'use client'

import { useEffect, useMemo, useState } from 'react'
import Layout from '@/components/Layout'
import { supabase } from '@/lib/supabase'
import { fetchAuth } from '@/lib/api'
import { Vazio } from '@/components/ui'
import { LOCAIS, REGIOES } from '@/lib/entrega'
import { ChevronLeft, ChevronRight, Plus, CalendarDays, Pencil, X } from 'lucide-react'

// A AGENDA — calendário à esquerda, o dia à direita; mês ou semana; abas por área.
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
// ABRE NO "MEUS", NÃO NO "TUDO" (23/09/2026). Em 09/09 quase nada tinha dono e o "tudo" era o
// mural; hoje o "tudo" é 4 compromissos + 22 follow-ups + 57 marcos de entrega, e abrir nisso
// enterrava a reunião do dia. As ABAS POR ÁREA (Comercial, Deu venda, Sistema — vêm do banco,
// db/agenda-abas.sql) fazem o papel do mural: o que é de alguém da área, mais o que é da fonte da
// área e ainda não tem dono. "Time" é o antigo "Tudo". Pegar pra mim continua sendo o que
// transforma mural em trabalho de alguém.
//
// O BALÃO: o que é meu e ainda não vi acende um ponto vermelho no dia e na linha, e soma no balão
// do menu. Clicar no dia marca aquele dia como visto; abrir o item marca o item; "Marcar como não
// lido" acende de novo. A regra de o que acende mora no servidor (lib/agenda-balao.ts) — aqui só se
// mostra e se avisa o que foi visto. Só o que está NA TELA é marcado: com a aba "Comercial" os
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
  local?: string | null
  regiao?: 'lajeado' | 'poa' | null
}
type Pessoa = { id: string; nome: string; papel: string; setor: string; ativo?: boolean; ordem?: number }
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

// A ABA. "meus" e "time" são fixas; as de área vêm do banco (configuracoes 'agenda.abas').
type Aba = { chave: string; nome: string; membros: string[]; fontes: string[] }
const ABA_MEUS: Aba = { chave: 'meus', nome: 'Meus', membros: [], fontes: [] }
const ABA_TIME: Aba = { chave: 'time', nome: 'Time', membros: [], fontes: [] }

// O item está na aba se é de alguém da aba (dono, chamado ou participante), ou se é de uma fonte da
// aba e NÃO tem dono — o mural de onde a área pega trabalho (follow-up sem vendedor → Comercial).
function naAba(i: Item, aba: Aba, euId?: string) {
  if (aba.chave === 'time') return true
  if (aba.chave === 'meus') return ehMeu(i, euId)

  // ⚠️ A ABA É UMA ÁREA DE TRABALHO, NÃO UMA LISTA DE PESSOAS.
  //
  // Antes bastava o item ser de alguém da aba pra aparecer nela — e o Mateus está no Comercial E
  // no Deu venda. Resultado: os follow-ups comerciais dele vazavam pra dentro do Deu venda, que
  // virou uma lista de 48 itens onde só uma parte era entrega. `fontes` passou a valer também pro
  // que TEM dono: a aba mostra o trabalho DAQUELE TIPO feito por aquelas pessoas.
  //
  // `fontes` vazio = a aba não filtra por tipo (é o caso do Sistema, que é de uma pessoa só e
  // mostra tudo dela).
  if (aba.fontes.length && !aba.fontes.includes(i.fonte)) return false

  const m = aba.membros
  if (i.donoId && m.includes(i.donoId)) return true
  if (i.ajudaDe && m.includes(i.ajudaDe)) return true
  if ((i.participantes || []).some(p => m.includes(p))) return true
  // sem dono, do tipo da área: é o mural de onde a área pega trabalho
  return !i.donoId && aba.fontes.includes(i.fonte)
}

// A COR DE CADA PESSOA.
//
// ⚠️ ERA SORTEADA PELO ID, e duas pessoas caíam na mesma cor: o Julio e o Guto ficaram idênticos, e
// o Rick e o Guto em dois azuis que ninguém distinguia. Sorteio não garante cor diferente — com 8
// cores e 7 pessoas, a chance de colisão é alta (é o paradoxo do aniversário).
//
// Agora a cor sai da ORDEM DE ENTRADA na empresa (o `ordem` que o servidor manda): a primeira
// pessoa pega a primeira cor, e assim por diante. Ninguém repete enquanto couber na paleta, e a cor
// de quem já está NUNCA muda quando alguém novo entra — o novo só pode entrar no fim da fila.
//
// ⚠️ A ORDEM DA PALETA IMPORTA TANTO QUANTO AS CORES. A primeira versão listava as cores dando a
// volta no círculo cromático, então posições vizinhas eram tons vizinhos — e as posições da frente
// são justamente do time antigo, que é quem enche a agenda. Deu vermelho e rosa lado a lado.
//
// As quatro primeiras posições são as quatro cores mais distantes que cabem aqui — azul, amarelo,
// verde e rosa, quatro famílias que qualquer um nomeia sem pensar. Elas pegam quem aparece o dia
// inteiro na tela. As outras quatro preenchem os buracos que sobraram do círculo.
//
// ⚠️ O AMARELO NÃO PODE VIRAR LARANJA. Ele está na posição 2 e o rosa na 5 — as duas pessoas que
// mais dividem tela. Um laranja aqui ficaria a um passo do rosa e voltaríamos ao problema de
// origem; o amarelo abre esse espaço. Pelo mesmo motivo não existe laranja na paleta.
const PALETA = [
  '#2563eb', // azul
  '#ca8a04', // amarelo
  '#16a34a', // verde
  '#0d9488', // petróleo
  '#db2777', // rosa
  '#7c3aed', // roxo
  '#4d7c0f', // oliva
  '#dc2626', // vermelho
]

// Iniciais brancas somem em cima do amarelo (contraste 2.9 — a letra some no disco de 18px). A
// letra segue o fundo, em vez de o fundo ter que ser sempre escuro: assim a paleta pode usar um
// tom claro quando ele é a cor certa, em vez de ficar presa a tons fechados só pra caber branco.
//
// O corte é alto de propósito. Só o amarelo passa dele — todo o resto continua com a letra branca
// que sempre teve. Um corte mais baixo deixaria metade dos crachás com letra escura e a outra
// metade com letra branca, e a tela ficaria remendada pra corrigir um problema que era de um só.
function letraSobre(hex: string) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.28 ? '#1a1626' : '#fff'
}

// o mapa é construído uma vez, quando as pessoas chegam do servidor
let CORES: Record<string, string> = {}
function montarCores(pessoas: Pessoa[]) {
  CORES = Object.fromEntries(pessoas.filter(p => p.ordem != null).map(p => [p.id, PALETA[p.ordem! % PALETA.length]]))
}
function corPessoa(id: string | null) {
  if (!id) return '#736c88'
  if (CORES[id]) return CORES[id]
  // quem não está na lista (saiu da empresa, item antigo): cinza, em vez de uma cor que pode
  // colidir com a de quem está
  return '#736c88'
}
function iniciais(nome: string | null | undefined) {
  const p = (nome || '').trim().split(/\s+/).filter(Boolean)
  if (!p.length) return '·'
  return ((p[0][0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase()
}
function Avatar({ id, nome, tam = 18, borda }: { id: string | null; nome: string | null | undefined; tam?: number; borda?: boolean }) {
  return (
    <span title={nome || undefined} style={{
      width: tam, height: tam, borderRadius: '50%', flexShrink: 0, display: 'inline-grid', placeItems: 'center',
      background: id ? corPessoa(id) : 'transparent', color: id ? letraSobre(corPessoa(id)) : '#fff', fontSize: Math.max(7.5, tam * 0.44), fontWeight: 800,
      border: borda ? '2px solid var(--bg)' : id ? 'none' : '1.5px dashed var(--text-faint)', boxSizing: 'border-box',
    }}>{id ? iniciais(nome) : ''}</span>
  )
}

// o que o navegador lembra: a aba e a visão em que a pessoa estava
const lembrar = (k: string, v: string) => { try { localStorage.setItem('agenda.' + k, v) } catch { /* privado/bloqueado: só não lembra */ } }
const lembrado = (k: string) => { try { return localStorage.getItem('agenda.' + k) } catch { return null } }

const segundaDe = (d: Date) => { const s = new Date(d.getFullYear(), d.getMonth(), d.getDate()); s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); return s }
const somaDias = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

export default function Agenda() {
  const [eu, setEu] = useState<Eu | null>(null)
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [tenhoTime, setTenhoTime] = useState(false)
  const [itens, setItens] = useState<Item[]>([])
  const [abasDeArea, setAbasDeArea] = useState<Aba[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  // ABRE NO "MEUS", não no "Tudo": com 57 marcos de entrega e 22 follow-ups abertos, o "tudo" enterrava
  // a reunião de hoje. A aba e a visão em que a pessoa estava ficam lembradas no navegador.
  const [aba, setAba] = useState<string>('meus')
  const [visao, setVisao] = useState<'mes' | 'semana'>('mes')
  // ⚠️ PREVISTO É SOMBRA, NÃO COMPROMISSO. O roteiro da entrega calcula a data do próximo encontro
  // sozinho, mas ninguém combinou com o cliente ainda. Hoje são 27 previstos contra 10
  // compromissos de verdade — misturados, o vendedor olha um dia cheio e não sabe se está livre.
  // Por isso eles não entram na fila do dia, e dá pra desligar de vez.
  const [verPrevistos, setVerPrevistos] = useState(true)
  const [mes, setMes] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [semana, setSemana] = useState(() => segundaDe(new Date()))
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

  useEffect(() => {
    const a = lembrado('aba'); if (a) setAba(a)
    const v = lembrado('visao'); if (v === 'semana' || v === 'mes') setVisao(v)
    if (lembrado('previstos') === 'nao') setVerPrevistos(false)
  }, [])
  const trocarPrevistos = () => setVerPrevistos(v => { lembrar('previstos', v ? 'nao' : 'sim'); return !v })
  const trocarAba = (k: string) => { setAba(k); lembrar('aba', k); setDiaAberto(null) }
  const trocarVisao = (v: 'mes' | 'semana') => { setVisao(v); lembrar('visao', v); setDiaAberto(null) }

  async function carregar() {
    setErro('')
    try {
      // Sem `ate`: o servidor usa o mesmo horizonte do balão, pra os dois nunca discordarem.
      const r = await fetchAuth('/api/agenda')
      if (!r.ok) { setErro(r.status === 401 ? 'Sessão expirada — recarregue a página.' : 'Não deu pra carregar a agenda.'); setCarregando(false); return }
      const d = await r.json()
      setEu(d.eu); setPessoas(d.pessoas || []); montarCores(d.pessoas || []); setTenhoTime(!!d.tenhoTime); setItens(d.itens || [])
      setAbasDeArea(Array.isArray(d.abas) ? d.abas : [])
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

  // ── AS ABAS E A SEPARAÇÃO ───────────────────────────────────────────────────
  const abas = useMemo<Aba[]>(() => [ABA_MEUS, ...abasDeArea, ABA_TIME], [abasDeArea])
  const abaAtual = abas.find(a => a.chave === aba) || ABA_MEUS
  const abertos = useMemo(() => itens.filter(i => !i.concluido), [itens])
  const contagem = useMemo(() => Object.fromEntries(abas.map(a => [a.chave, abertos.filter(i => naAba(i, a, eu?.id)).length])), [abas, abertos, eu])
  const visiveis = useMemo(() => abertos.filter(i => naAba(i, abaAtual, eu?.id)), [abertos, abaAtual, eu])

  const totalPrevistos = useMemo(() => visiveis.filter(ehPrevisto).length, [visiveis])

  // ENCONTROS PRA COMBINAR — os previstos dos próximos 30 dias.
  //
  // Previsto não é informação: é um cliente com quem ninguém marcou o próximo encontro. Em entrega,
  // cliente sem data à frente é cliente que some — é a mesma razão da regra de ouro do módulo
  // ("não se conclui um encontro sem marcar o próximo"). Eram 27 assim, e não apareciam em lista
  // de tarefa nenhuma: só enfeitavam o calendário.
  //
  // O corte de 30 dias é de propósito: o que dá pra resolver esta semana cabe numa faixa; os 27
  // inteiros viram um mural que ninguém abre.
  const [verCombinar, setVerCombinar] = useState(false)
  const aCombinar = useMemo(() => {
    const limite = chaveDia(somaDias(new Date(), 30))
    return visiveis.filter(i => ehPrevisto(i) && chaveDia(paraData(i.inicio)) <= limite)
      .sort((a, b) => a.inicio.localeCompare(b.inicio))
  }, [visiveis])

  // ⚠️ PREVISTO NÃO CONTA COMO ATRASADO. A data foi calculada pelo roteiro, não combinada com
  // ninguém — chamar de atrasado o que nunca foi marcado deixaria a faixa vermelha permanente e
  // ensinaria o time a ignorá-la.
  const atrasados = useMemo(() => visiveis.filter(i => chaveDia(paraData(i.inicio)) < hj && !ehPrevisto(i)), [visiveis, hj])

  // O calendário mostra tudo, inclusive atrasado: no mês passado a marca vermelha é a informação.
  const porDia = useMemo(() => {
    const m = new Map<string, Item[]>()
    for (const i of visiveis) {
      const k = chaveDia(paraData(i.inicio))
      const l = m.get(k) || []; l.push(i); m.set(k, l)
    }
    for (const l of m.values()) l.sort((a, b) => a.inicio.localeCompare(b.inicio))
    return m
  }, [visiveis])

  // O PAINEL DA DIREITA: o dia aberto (ou hoje), e o que vem depois dele nos próximos 7 dias.
  const diaDoPainel = diaAberto || hj
  const doDiaPainel = porDia.get(diaDoPainel) || []
  const proximos = useMemo(() => {
    const [a, m, d] = diaDoPainel.split('-').map(Number)
    const de = new Date(a, m - 1, d)
    const lista: [string, Item[]][] = []
    for (let n = 1; n <= 7; n++) {
      const k = chaveDia(somaDias(de, n))
      // "Depois" é o que já tem hora marcada com alguém. Previsto não entra: a pergunta que esta
      // caixa responde é "o que me espera", não "o que o roteiro calculou".
      const l = (porDia.get(k) || []).filter(i => !ehPrevisto(i)); if (l.length) lista.push([k, l])
    }
    return lista
  }, [porDia, diaDoPainel])

  // Grade do mês: começa no domingo da semana do dia 1 e fecha só as semanas que o mês precisa.
  const grade = useMemo(() => {
    const ini = new Date(mes.getFullYear(), mes.getMonth(), 1)
    ini.setDate(1 - ini.getDay())
    const ultimo = new Date(mes.getFullYear(), mes.getMonth() + 1, 0)
    const semanas = Math.ceil((ultimo.getDate() + new Date(mes.getFullYear(), mes.getMonth(), 1).getDay()) / 7)
    return Array.from({ length: semanas * 7 }, (_, n) => {
      const d = new Date(ini); d.setDate(ini.getDate() + n); return d
    })
  }, [mes])
  const diasDaSemana = useMemo(() => Array.from({ length: 7 }, (_, n) => somaDias(semana, n)), [semana])

  const mesmoMes = (d: Date) => d.getMonth() === mes.getMonth()
  const irPara = (n: number) => {
    if (visao === 'mes') setMes(new Date(mes.getFullYear(), mes.getMonth() + n, 1))
    else setSemana(somaDias(semana, n * 7))
    setDiaAberto(null)
  }
  const irHoje = () => { const d = new Date(); setMes(new Date(d.getFullYear(), d.getMonth(), 1)); setSemana(segundaDe(d)); setDiaAberto(null) }
  const atrasadosAcesos = acesas(atrasados).length
  // quem aparece na bolinha de cada aba: só gente que eu posso enxergar e que está ativa
  const membrosVisiveis = (a: Aba) => a.membros.map(id => pessoas.find(p => p.id === id)).filter((p): p is Pessoa => !!p && p.ativo !== false)

  const tituloPeriodo = visao === 'mes'
    ? <>{MESES[mes.getMonth()].replace(/^./, c => c.toUpperCase())} <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>de {mes.getFullYear()}</span></>
    : (() => {
        const a = diasDaSemana[0], b = diasDaSemana[6]
        const mesmo = a.getMonth() === b.getMonth()
        return <>{a.getDate()} – {b.getDate()} <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>de {MESES[b.getMonth()]}{mesmo ? '' : ` (${MESES[a.getMonth()].slice(0, 3)}–${MESES[b.getMonth()].slice(0, 3)})`}</span></>
      })()

  return (
    <Layout>
      <div style={{ padding: '20px clamp(12px, 3vw, 32px)', maxWidth: 1400, margin: '0 auto' }}>

        {/* CABEÇALHO */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          {/* sem textTransform: capitalize — ele maiusculiza CADA palavra e vira "Setembro De 2026" */}
          <h1 className="display relevo-titulo" style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', minWidth: 200, margin: 0 }}>{tituloPeriodo}</h1>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => irPara(-1)} style={btnIcone} aria-label={visao === 'mes' ? 'Mês anterior' : 'Semana anterior'}><ChevronLeft size={16} /></button>
            <button onClick={irHoje} style={{ ...btnIcone, width: 'auto', padding: '0 12px', fontWeight: 600 }}>Hoje</button>
            <button onClick={() => irPara(1)} style={btnIcone} aria-label={visao === 'mes' ? 'Próximo mês' : 'Próxima semana'}><ChevronRight size={16} /></button>
          </div>
          {balaoPronto && balao.size > 0 && (
            <span style={{ fontSize: 12, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={pontoVermelho} /> {balao.size} {balao.size > 1 ? 'coisas' : 'coisa'} tua{balao.size > 1 ? 's' : ''} pra ver — clica no dia marcado
            </span>
          )}
          <div style={{ flex: 1 }} />
          {/* Mês ou semana */}
          <div style={{ display: 'inline-flex', padding: 3, borderRadius: 'var(--r)', background: 'var(--glass-field)', border: '1px solid var(--glass-border)' }}>
            {(['mes', 'semana'] as const).map(v => (
              <button key={v} onClick={() => trocarVisao(v)} style={{
                height: 30, padding: '0 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13,
                background: visao === v ? 'var(--accent-bg)' : 'transparent', color: visao === v ? 'var(--accent-soft)' : 'var(--text-muted)', fontWeight: visao === v ? 800 : 600,
              }}>{v === 'mes' ? 'Mês' : 'Semana'}</button>
            ))}
          </div>
          <button onClick={() => setNovo(true)} className="btn-afunda" style={btnPri}><Plus size={15} strokeWidth={2.4} /> Novo</button>
        </div>

        {/* AS ABAS — a pessoa, as áreas (do banco), e todo mundo */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, borderBottom: '1px solid var(--glass-border)', marginBottom: 16, flexWrap: 'wrap' }}>
          {abas.map(a => {
            const on = a.chave === aba
            const gente = a.chave === 'meus' && eu ? [{ id: eu.id, nome: eu.nome } as Pessoa] : membrosVisiveis(a)
            return (
              <button key={a.chave} onClick={() => trocarAba(a.chave)} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px 11px', marginBottom: -1, cursor: 'pointer',
                border: 'none', borderBottom: `2px solid ${on ? 'var(--accent-soft)' : 'transparent'}`, background: 'transparent',
                color: on ? 'var(--text)' : 'var(--text-muted)', fontSize: 13.5, fontWeight: on ? 800 : 600,
              }}>
                {gente.length > 0 && (
                  <span style={{ display: 'inline-flex' }}>
                    {gente.slice(0, 4).map((p, n) => <span key={p.id} style={{ marginLeft: n ? -7 : 0 }}><Avatar id={p.id} nome={p.nome} tam={22} borda /></span>)}
                  </span>
                )}
                {a.nome}
                <span style={{
                  fontSize: 11, fontWeight: on ? 800 : 700, borderRadius: 'var(--r-pill)', padding: '2px 8px',
                  background: on ? 'var(--accent-bg)' : 'var(--glass-field)', color: on ? 'var(--accent-soft)' : 'var(--text-muted)',
                }}>{contagem[a.chave] ?? 0}</span>
              </button>
            )
          })}
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 12, paddingBottom: 10, fontSize: 11.5, color: 'var(--text-muted)', alignItems: 'center', flexWrap: 'wrap' }}>
            {(Object.keys(FONTES) as Item['fonte'][]).map(f => (
              <span key={f} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: FONTES[f].cor }} />{FONTES[f].rotulo}</span>
            ))}
            <button onClick={trocarPrevistos} title="Previsto é a data que o roteiro da entrega calculou — ninguém combinou com o cliente ainda. Não ocupa o dia."
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11.5,
                border: `1px ${verPrevistos ? 'dashed' : 'solid'} var(--border-strong)`, borderRadius: 'var(--r-pill)',
                padding: '3px 10px', background: 'transparent', color: verPrevistos ? 'var(--text-muted)' : 'var(--text-faint)',
                textDecoration: verPrevistos ? 'none' : 'line-through', fontWeight: 600,
              }}>
              <span style={{ fontSize: 8 }}>◌</span>previstos ({totalPrevistos})
            </button>
          </div>
        </div>

        {erro && <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 'var(--r)', padding: '10px 14px', marginBottom: 12, fontSize: 13, color: 'var(--red)' }}>{erro}</div>}

        {carregando ? (
          <div style={{ display: 'grid', gap: 14 }}>
            <div className="esqueleto" style={{ height: 520, borderRadius: 'var(--r-lg)' }} />
          </div>
        ) : (
          // CALENDÁRIO À ESQUERDA, O DIA À DIREITA. Em tela estreita o painel desce pra baixo.
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 620px', minWidth: 0 }}>
              {visao === 'mes' ? (
                /* MÊS — de vidro: é um elemento só, parado, com a luz atrás */
                <div className="vidro" style={{ overflow: 'hidden' }}>
                  {/* ⚠️ minmax(0, 1fr), não 1fr: o mínimo de `1fr` é o conteúdo, e com título longo a grade estoura. */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
                    {DIAS.map(d => (
                      <div key={d} style={{ padding: '10px 0', textAlign: 'center', fontSize: 10.5, fontWeight: 800, letterSpacing: '.12em', color: 'var(--text-faint)', textTransform: 'uppercase', borderBottom: '1px solid var(--glass-border)' }}>{d}</div>
                    ))}
                    {grade.map((d, n) => {
                      const k = chaveDia(d)
                      const doDia = porDia.get(k) || []
                      const hoje = k === hj
                      const sel = k === diaAberto
                      const acesos = acesas(doDia)
                      // ⚠️ PREVISTO NÃO ENTRA NA FILA DO DIA. São 27 previstos contra 10
                      // compromissos de verdade: misturados, o vendedor olha a quarta-feira e não
                      // sabe se está livre. Aqui eles viram UMA linha discreta no pé da célula.
                      const firmes = doDia.filter(i => !ehPrevisto(i))
                      const previstos = doDia.filter(ehPrevisto)
                      const MAX = 4
                      return (
                        // Clicar no dia (pra abrir) é ver o dia: marca como visto o que está aceso NELE,
                        // e só o que está na tela com a aba atual.
                        <div key={n} onClick={() => { if (!sel) marcar(acesos, 'lido'); setDiaAberto(sel ? null : k) }}
                          style={{
                            minHeight: 112, padding: '7px 6px 5px', cursor: 'pointer', minWidth: 0, overflow: 'hidden',
                            borderRight: (n % 7 === 6) ? 'none' : '1px solid var(--glass-border)',
                            borderBottom: n < grade.length - 7 ? '1px solid var(--glass-border)' : 'none',
                            background: sel ? 'var(--accent-bg)' : hoje ? 'var(--glass-field)' : 'transparent',
                            opacity: mesmoMes(d) ? 1 : 0.35,
                          }}>
                          {regioesDoDia(doDia).length > 0 && (
                            <div style={{ display: 'flex', gap: 3, marginBottom: 3 }}>
                              {regioesDoDia(doDia).map(r => <span key={r} style={{ ...selo(r), fontSize: 9 }}>{REGIOES[r].nome}</span>)}
                            </div>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                            <span className="tnum" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: hoje ? 800 : 600, color: hoje ? 'var(--accent-soft)' : 'var(--text-muted)' }}>
                              {hoje
                                ? <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--grad)', color: '#fff', display: 'inline-grid', placeItems: 'center', fontSize: 12.5, fontWeight: 800, boxShadow: '0 3px 10px var(--glow)' }}>{d.getDate()}</span>
                                : d.getDate()}
                              {acesos.length > 0 && <span title={`${acesos.length} pra ver`} style={pontoVermelho} />}
                            </span>
                            {firmes.length > MAX && <span style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>{firmes.length}</span>}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {firmes.slice(0, MAX).map(i => <Chip key={i.fonte + i.id} it={i} atras={k < hj} nomeDe={nomeDe} naoLido={balao.has(chaveDe(i))} onAbrir={() => abrir(i)} />)}
                          </div>
                          {firmes.length > MAX && <div style={{ fontSize: 10.5, color: 'var(--text-faint)', paddingLeft: 4, marginTop: 3 }}>+{firmes.length - MAX} mais</div>}
                          {verPrevistos && previstos.length > 0 && (
                            <div title={previstos.map(p => p.titulo).join(' · ')}
                              style={{ marginTop: 4, paddingTop: 3, borderTop: '1px dashed var(--border-strong)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-faint)' }}>
                              <span style={{ fontSize: 8 }}>◌</span>{previstos.length} previst{previstos.length > 1 ? 'os' : 'o'}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <Semana dias={diasDaSemana} porDia={porDia} hj={hj} diaAberto={diaAberto} nomeDe={nomeDe} balao={balao} verPrevistos={verPrevistos}
                  onDia={k => { const sel = k === diaAberto; if (!sel) marcar(acesas(porDia.get(k) || []), 'lido'); setDiaAberto(sel ? null : k) }}
                  onAbrir={abrir} />
              )}
            </div>

            {/* O PAINEL: o dia, os atrasados recolhidos, e o que vem depois */}
            <div style={{ flex: '0 1 340px', minWidth: 280, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="vidro" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                  <h2 className="display" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{rotuloDia(diaDoPainel)}</h2>
                  {diaAberto && diaAberto !== hj && <button onClick={() => setDiaAberto(null)} style={{ ...chip(false), padding: '3px 10px' }}>hoje</button>}
                </div>
                {/* No painel os dois aparecem, mas separados: primeiro o que está combinado, depois,
                    sob um rótulo, o que o roteiro só calculou. */}
                {doDiaPainel.filter(i => !ehPrevisto(i)).length === 0 && !doDiaPainel.some(ehPrevisto)
                  ? <div style={{ fontSize: 13, color: 'var(--text-faint)', padding: '6px 0 4px' }}>{diaDoPainel === hj ? 'Nada pra hoje nesta aba.' : 'Nada neste dia.'}</div>
                  : (() => {
                    // O DIA PARTIDO EM TURNOS. Seis compromissos numa lista é uma lista; os mesmos
                    // seis partidos em manhã/tarde/noite respondem "tenho a tarde livre?" sem
                    // ninguém ler hora por hora. Turno sem nada não aparece.
                    const { turnos, semHora } = porTurno(doDiaPainel.filter(i => !ehPrevisto(i)))
                    return (<>
                      {turnos.map(t => (
                        <div key={t.chave} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>{t.nome}</span>
                            <div style={{ flex: 1, height: 1, background: 'var(--glass-border)' }} />
                          </div>
                          {t.itens.map(i => (
                            <Linha key={i.fonte + i.id} it={i} eu={eu} nomeDe={nomeDe} naoLido={balao.has(chaveDe(i))}
                              ocupado={ocupado === i.id} onConcluir={() => setConfirmarConcluir(i)} onAbrir={() => abrir(i)} />
                          ))}
                        </div>
                      ))}
                      {semHora.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>Sem hora</span>
                            <div style={{ flex: 1, height: 1, background: 'var(--glass-border)' }} />
                          </div>
                          {semHora.map(i => (
                            <Linha key={i.fonte + i.id} it={i} eu={eu} nomeDe={nomeDe} naoLido={balao.has(chaveDe(i))}
                              ocupado={ocupado === i.id} onConcluir={() => setConfirmarConcluir(i)} onAbrir={() => abrir(i)} />
                          ))}
                        </div>
                      )}
                    </>)
                  })()}
                {verPrevistos && doDiaPainel.some(ehPrevisto) && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>◌ Previsto — não combinado</span>
                      <div style={{ flex: 1, height: 1, background: 'var(--glass-border)' }} />
                    </div>
                    {doDiaPainel.filter(ehPrevisto).map(i => (
                      <Linha key={i.fonte + i.id} it={i} eu={eu} nomeDe={nomeDe} naoLido={balao.has(chaveDe(i))}
                        ocupado={ocupado === i.id} onConcluir={() => setConfirmarConcluir(i)} onAbrir={() => abrir(i)} />
                    ))}
                  </>
                )}
              </div>

              {/* FAIXA DO QUE FALTA COMBINAR — a sombra virando trabalho com dono. */}
              {aCombinar.length > 0 && (
                <div>
                  <div onClick={() => setVerCombinar(v => !v)}
                    style={{ background: 'var(--amber-bg)', border: '1px solid var(--amber)', borderRadius: 'var(--r)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <span style={{ fontSize: 13, color: 'var(--amber)', fontWeight: 700 }}>
                      {aCombinar.length} encontro{aCombinar.length > 1 ? 's' : ''} pra combinar
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--amber)', opacity: .85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {verCombinar ? 'abaixo' : 'nos próximos 30 dias'}
                    </span>
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: 12, color: 'var(--amber)' }}>{verCombinar ? 'esconder' : 'mostrar'}</span>
                  </div>
                  {verCombinar && (
                    <>
                      <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: '8px 2px 6px', lineHeight: 1.5 }}>
                        O roteiro calculou a data, mas ninguém acertou o dia com o cliente. Clica pra combinar —
                        cliente sem data à frente é cliente que some.
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {aCombinar.map(i => (
                          <Linha key={i.fonte + i.id} it={i} eu={eu} nomeDe={nomeDe} naoLido={balao.has(chaveDe(i))}
                            ocupado={ocupado === i.id} onConcluir={() => setConfirmarConcluir(i)} onAbrir={() => abrir(i)} />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* FAIXA DE ATRASADOS — recolhida, pra não enterrar o dia.
                  Abrir a faixa (clique de propósito) é ver os atrasados: marca os acesos. Só aparecer
                  não marca — senão bastaria abrir a agenda pra o balão dos atrasados sumir sem ninguém ver. */}
              {atrasados.length > 0 && (
                <div>
                  <div onClick={() => { if (!verAtrasados) marcar(acesas(atrasados), 'lido'); setVerAtrasados(v => !v) }}
                    style={{ background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 'var(--r)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    {atrasadosAcesos > 0 && <span style={pontoVermelho} />}
                    <span style={{ fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>{atrasados.length} atrasado{atrasados.length > 1 ? 's' : ''}</span>
                    <span style={{ fontSize: 12, color: 'var(--red)', opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {verAtrasados ? 'abaixo' : atrasadosAcesos > 0 ? `${atrasadosAcesos} teu${atrasadosAcesos > 1 ? 's' : ''} sem ver` : 'fora da lista'}
                    </span>
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: 12, color: 'var(--red)' }}>{verAtrasados ? 'esconder' : 'mostrar'}</span>
                  </div>
                  {verAtrasados && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                      {atrasados.map(i => (
                        <Linha key={i.fonte + i.id} it={i} eu={eu} nomeDe={nomeDe} naoLido={balao.has(chaveDe(i))} atrasado
                          ocupado={ocupado === i.id} onConcluir={() => setConfirmarConcluir(i)} onAbrir={() => abrir(i)} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {proximos.length > 0 && (
                <div style={{ border: '1px solid var(--glass-border)', borderRadius: 'var(--r-lg)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.12em', color: 'var(--text-faint)', textTransform: 'uppercase', marginBottom: 2 }}>Depois</div>
                  {proximos.flatMap(([dia, lista]) => lista.slice(0, 3).map(i => (
                    <div key={i.fonte + i.id} onClick={() => abrir(i)} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-2)', cursor: 'pointer', minWidth: 0 }}>
                      <span className="tnum" style={{ fontSize: 11, color: 'var(--text-faint)', width: 46, flexShrink: 0 }}>{rotuloDia(dia).slice(0, 6).replace(',', '')}</span>
                      <span style={{ width: 3, height: 12, borderRadius: 2, background: corDe(i), flexShrink: 0, opacity: ehPrevisto(i) ? .5 : 1 }} />
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: balao.has(chaveDe(i)) ? 700 : 500 }}>{horaDe(i) ? horaDe(i) + ' ' : ''}{i.titulo}</span>
                    </div>
                  ))).slice(0, 8)}
                </div>
              )}
            </div>
          </div>
        )}

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
            onPublico={p => abrirPublico(detalhe, p)} onAjuda={(q, n) => pedirAjuda(detalhe, q, n)}
            onCombinado={() => { setDetalhe(null); carregar() }} />
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

// O ITEM NA CÉLULA DO MÊS: a bolinha de quem é o dono, a hora, o título. Previsto tracejado.
function Chip({ it, atras, nomeDe, naoLido, onAbrir }: { it: Item; atras: boolean; nomeDe: (id: string | null) => string | null; naoLido: boolean; onAbrir: () => void }) {
  const prev = ehPrevisto(it), cor = atras ? 'var(--red)' : corDe(it)
  const dono = nomeDe(it.donoId)
  // ⚠️ O QUE SAI DAQUI É TÃO IMPORTANTE QUANTO O QUE FICA. Numa célula de ~140px cabiam avatar,
  // etiqueta de região, hora e título — e o título, que é a única coisa que responde "o que é
  // isso?", virava "LW POA 08:…". Saíram os dois primeiros:
  //   • a REGIÃO já está no topo do dia, uma vez. Repetir em cada linha é dizer o mesmo três vezes.
  //   • o DONO virou um risco de cor na borda. Quem precisa do nome abre o item ou passa o mouse.
  // Sobra hora e nome do cliente, em corpo maior. É o que se lê de relance.
  return (
    <div onClick={e => { e.stopPropagation(); onAbrir() }}
      title={`${it.titulo}${dono ? ' · ' + dono : ''}${prev ? ' (previsto — ainda não combinado)' : ''}`}
      style={{
        display: 'flex', alignItems: 'baseline', gap: 5, padding: '4px 7px', borderRadius: 6, minWidth: 0,
        background: prev ? 'transparent' : atras ? 'var(--red-bg)' : 'var(--surface-2)',
        border: `1px ${prev ? 'dashed' : 'solid'} ${prev ? cor + '88' : 'transparent'}`,
        borderLeft: `3px ${prev ? 'dashed' : 'solid'} ${corPessoa(it.donoId)}`,
        opacity: prev ? 0.8 : 1,
      }}>
      {horaDe(it) && <b className="tnum" style={{ fontSize: 11.5, color: cor, fontWeight: 800, flexShrink: 0 }}>{horaDe(it)}</b>}
      <span style={{ fontSize: 12.5, lineHeight: '17px', color: prev ? 'var(--text-muted)' : 'var(--text)', fontWeight: naoLido ? 800 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
        {it.titulo}
      </span>
    </div>
  )
}

// OS TURNOS — manhã, tarde, noite.
//
// Um dia com seis compromissos é uma lista; o mesmo dia partido em turnos é uma agenda. A divisão
// responde a pergunta que o time faz de verdade ("tenho a tarde livre?") sem ninguém ler hora por
// hora. Item sem hora (previsto, tarefa, follow-up) não pertence a turno nenhum e fica por último.
const TURNOS = [
  { chave: 'manha', nome: 'Manhã', de: 0, ate: 12 },
  { chave: 'tarde', nome: 'Tarde', de: 12, ate: 18 },
  { chave: 'noite', nome: 'Noite', de: 18, ate: 24 },
] as const

function turnoDe(i: Item): 'manha' | 'tarde' | 'noite' | 'sem_hora' {
  if (i.diaTodo || !horaDe(i)) return 'sem_hora'
  const h = paraData(i.inicio).getHours()
  return h < 12 ? 'manha' : h < 18 ? 'tarde' : 'noite'
}

/** Os itens do dia agrupados por turno, só com os turnos que têm algo. */
function porTurno(itens: Item[]) {
  const g = TURNOS.map(t => ({ ...t, itens: itens.filter(i => turnoDe(i) === t.chave) })).filter(t => t.itens.length)
  const semHora = itens.filter(i => turnoDe(i) === 'sem_hora')
  return { turnos: g, semHora }
}

// A SEMANA: faixa do dia inteiro em cima (previsto, follow-up, tarefa) e as horas embaixo. Reunião
// de duas horas ocupa duas horas — é o que responde "como está o meu amanhã?" de relance.
const H_INI = 7, H_FIM = 20, PX_H = 52
function Semana({ dias, porDia, hj, diaAberto, nomeDe, balao, verPrevistos, onDia, onAbrir }: {
  dias: Date[]; porDia: Map<string, Item[]>; hj: string; diaAberto: string | null
  nomeDe: (id: string | null) => string | null; balao: Set<string>; verPrevistos: boolean
  onDia: (k: string) => void; onAbrir: (i: Item) => void
}) {
  const agora = new Date()
  const minAgora = agora.getHours() * 60 + agora.getMinutes()
  const temHoje = dias.some(d => chaveDia(d) === hj)
  const topoDe = (d: Date) => Math.max(0, ((d.getHours() * 60 + d.getMinutes()) - H_INI * 60) / 60 * PX_H)
  const altura = (H_FIM - H_INI) * PX_H
  const cols = 'repeat(7, minmax(0, 1fr))'
  return (
    <div className="vidro" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `52px ${cols}`, borderBottom: '1px solid var(--glass-border)' }}>
        <div />
        {dias.map(d => {
          const k = chaveDia(d), hoje = k === hj, sel = k === diaAberto
          return (
            <div key={k} onClick={() => onDia(k)} style={{ padding: '9px 0 7px', textAlign: 'center', cursor: 'pointer', background: sel ? 'var(--accent-bg)' : 'transparent' }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.12em', color: hoje ? 'var(--accent-soft)' : 'var(--text-faint)', textTransform: 'uppercase' }}>{DIAS[d.getDay()]}</div>
              {hoje
                ? <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--grad)', color: '#fff', display: 'inline-grid', placeItems: 'center', fontSize: 15, fontWeight: 800, boxShadow: '0 3px 10px var(--glow)' }}>{d.getDate()}</span>
                : <div className="tnum" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-2)', lineHeight: '30px' }}>{d.getDate()}</div>}
            </div>
          )
        })}
      </div>

      {/* dia inteiro */}
      <div style={{ display: 'grid', gridTemplateColumns: `52px ${cols}`, borderBottom: '1px solid var(--glass-border)', background: 'rgba(0,0,0,.10)' }}>
        <div style={{ padding: '8px 6px', fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: 'var(--text-faint)', textAlign: 'right' }}>DIA</div>
        {dias.map(d => {
          const k = chaveDia(d)
          // ⚠️ previsto NUNCA entra na grade de horas — ele não tem hora, e desenhar um bloco nela
          // seria dizer que o horário está ocupado quando ninguém combinou nada.
          const lista = (porDia.get(k) || []).filter(i => i.diaTodo && !ehPrevisto(i))
          const previstos = (porDia.get(k) || []).filter(ehPrevisto)
          return (
            <div key={k} style={{ padding: '6px 4px', borderLeft: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, minHeight: 34, background: k === hj ? 'var(--glass-field)' : 'transparent' }}>
              {lista.slice(0, 4).map(i => <Chip key={i.fonte + i.id} it={i} atras={k < hj} nomeDe={nomeDe} naoLido={balao.has(chaveDe(i))} onAbrir={() => onAbrir(i)} />)}
              {lista.length > 4 && <div style={{ fontSize: 10.5, color: 'var(--text-faint)', paddingLeft: 4 }}>+{lista.length - 4} mais</div>}
              {verPrevistos && previstos.map(i => (
                <div key={i.fonte + i.id} onClick={e => { e.stopPropagation(); onAbrir(i) }} title={`${i.titulo} — previsto, ainda não combinado`}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 5px', borderRadius: 5, border: '1px dashed var(--border-strong)', fontSize: 10, color: 'var(--text-faint)', minWidth: 0, cursor: 'pointer' }}>
                  <span style={{ fontSize: 8, flexShrink: 0 }}>◌</span>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.titulo}</span>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* as horas */}
      <div style={{ display: 'grid', gridTemplateColumns: `52px ${cols}`, position: 'relative' }}>
        <div style={{ height: altura }}>
          {Array.from({ length: H_FIM - H_INI }, (_, n) => {
            const h = H_INI + n
            // o nome do turno aparece UMA vez, na hora em que ele começa — é o que dá a divisão
            // sem desenhar uma régua a mais
            const abre = h === H_INI || h === 12 || h === 18
            const nome = h < 12 ? 'Manhã' : h < 18 ? 'Tarde' : 'Noite'
            return (
              <div key={n} style={{ height: PX_H, padding: '0 8px', boxSizing: 'border-box', textAlign: 'right', borderTop: abre && h !== H_INI ? '1px solid var(--border-strong)' : 'none' }}>
                {abre && <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--accent-soft)', lineHeight: '13px' }}>{nome}</div>}
                <div className="tnum" style={{ fontSize: 10.5, color: 'var(--text-faint)', lineHeight: abre ? '14px' : '17px' }}>{String(h).padStart(2, '0')}:00</div>
              </div>
            )
          })}
        </div>
        {dias.map(d => {
          const k = chaveDia(d)
          const lista = (porDia.get(k) || []).filter(i => !i.diaTodo)
          const hoje = k === hj
          return (
            <div key={k} onClick={() => onDia(k)} style={{
              position: 'relative', height: altura, borderLeft: '1px solid var(--glass-border)', cursor: 'pointer',
              // o risco de cada hora, mais um MAIS FORTE onde vira o turno (meio-dia e 18h):
              // é o que deixa "a tarde está livre?" visível sem contar linha
              background: `${hoje ? 'var(--glass-field)' : 'transparent'} repeating-linear-gradient(180deg, transparent 0 ${PX_H - 1}px, var(--glass-border) ${PX_H - 1}px ${PX_H}px)`,
              opacity: d.getDay() === 0 || d.getDay() === 6 ? 0.7 : 1,
            }}>
              {[12, 18].filter(h => h > H_INI && h < H_FIM).map(h => (
                <div key={h} style={{ position: 'absolute', left: 0, right: 0, top: (h - H_INI) * PX_H, height: 1, background: 'var(--border-strong)', pointerEvents: 'none' }} />
              ))}
              {lista.map((i, n) => {
                const ini = paraData(i.inicio), fim = i.fim ? new Date(i.fim) : new Date(ini.getTime() + 36e5)
                const top = topoDe(ini)
                const alt = Math.max(30, Math.min(altura - top, (fim.getTime() - ini.getTime()) / 36e5 * PX_H))
                const cor = k < hj ? 'var(--red)' : corDe(i)
                const aceso = balao.has(chaveDe(i))
                return (
                  <div key={i.fonte + i.id} onClick={e => { e.stopPropagation(); onAbrir(i) }} title={i.titulo} style={{
                    position: 'absolute', left: 3 + (n % 3) * 4, right: 3, top, height: alt, borderRadius: 8, padding: '5px 7px', boxSizing: 'border-box', overflow: 'hidden',
                    background: 'var(--surface)', borderLeft: `3px solid ${cor}`, border: `1px solid ${aceso ? cor : 'var(--border)'}`, borderLeftWidth: 3, borderLeftColor: cor,
                    boxShadow: aceso ? `0 6px 18px ${cor}44` : 'var(--shadow-sm)', zIndex: 1 + n,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 800, color: cor }}>
                      {aceso && <span style={pontoVermelho} />}{horaDe(i)}{alt >= 44 ? ` – ${fim.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: alt >= 60 ? 'normal' : 'nowrap' }}>{i.titulo}</div>
                    {alt >= 72 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 5 }}>
                        <Avatar id={i.donoId} nome={nomeDe(i.donoId)} tam={16} />
                        {(i.participantes || []).slice(0, 3).map(p => <span key={p} style={{ marginLeft: -5 }}><Avatar id={p} nome={nomeDe(p)} tam={16} borda /></span>)}
                      </div>
                    )}
                  </div>
                )
              })}
              {hoje && temHoje && minAgora >= H_INI * 60 && minAgora <= H_FIM * 60 && (
                <div style={{ position: 'absolute', left: 0, right: 0, top: (minAgora - H_INI * 60) / 60 * PX_H, height: 2, background: 'var(--red)', boxShadow: '0 0 8px var(--red)', zIndex: 20, pointerEvents: 'none' }}>
                  <span style={{ position: 'absolute', left: -5, top: -4, width: 10, height: 10, borderRadius: '50%', background: 'var(--red)' }} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── PEÇAS ─────────────────────────────────────────────────────────────────────
// o principal é o único com o gradiente do logo (e afunda no clique via .btn-afunda)
const btnPri = { padding: '9px 16px', background: 'var(--grad)', color: 'var(--on-accent)', border: 'none', borderRadius: 'var(--r)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 } as React.CSSProperties
const btnSec = { padding: '9px 16px', background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--border-strong)', borderRadius: 'var(--r)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 } as React.CSSProperties
const btnIcone = { width: 34, height: 34, borderRadius: 'var(--r)', border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties
// A REGIÃO, em cor. É o que responde "esse dia já está comprometido?" sem abrir nada — dois
// atendimentos no mesmo dia só cabem na MESMA região, o deslocamento come o resto.
const CORES_REGIAO: Record<string, { cor: string; bg: string }> = {
  lajeado: { cor: '#7cc5fb', bg: 'rgba(56,132,255,.18)' },
  poa: { cor: '#f0a6f5', bg: 'rgba(217,70,239,.18)' },
}
const selo = (r: string): React.CSSProperties => ({
  fontSize: 9.5, fontWeight: 800, letterSpacing: '.04em', borderRadius: 4, padding: '1px 5px', flexShrink: 0,
  color: CORES_REGIAO[r]?.cor, background: CORES_REGIAO[r]?.bg,
})
// duas regiões no mesmo dia = o conflito que custa o dia. Aparecem as duas, e o time vê o problema.
const regioesDoDia = (itens: Item[]): ('lajeado' | 'poa')[] =>
  [...new Set(itens.map(i => i.regiao).filter(Boolean))] as ('lajeado' | 'poa')[]

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
function Linha({ it, eu, nomeDe, naoLido, ocupado, onConcluir, onAbrir, atrasado }: {
  it: Item; eu: Eu | null; nomeDe: (id: string | null) => string | null; naoLido: boolean
  ocupado: boolean; onConcluir: () => void; onAbrir: () => void; atrasado?: boolean
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
      {/* na lista de atrasados a hora não diz nada — o dia, sim */}
      <span className="tnum" style={{ fontSize: 12, color: atrasado ? 'var(--red)' : 'var(--text-muted)', width: 42, flexShrink: 0, fontWeight: 600 }}>
        {atrasado ? paraData(it.inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : (hora || '—')}
      </span>
      <span style={{ width: 3, height: 18, borderRadius: 2, background: atrasado ? 'var(--red)' : corDe(it), flexShrink: 0 }} />
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
      <span style={{ fontSize: 11, color: 'var(--text-faint)', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <Avatar id={it.donoId} nome={nomeDe(it.donoId)} tam={18} />
        {!it.donoId ? (entrega ? 'entrega' : 'sem dono') : meu ? 'seu' : ''}{outros > 0 ? ` +${outros}` : ''}
      </span>
    </div>
  )
}

// COMBINAR O ENCONTRO — o que transforma a sombra em compromisso.
//
// Um marco `previsto` é o roteiro dizendo "por volta desta data". O que falta é alguém ligar pro
// cliente e acertar o dia. Enquanto isso não acontece, o cliente fica sem data à frente — e cliente
// sem data à frente some. Eram 27 assim, e não apareciam em lista de tarefa nenhuma.
//
// A data já vem preenchida com o palpite do roteiro: quase sempre a conversa com o cliente confirma
// a semana e muda só a hora.
function Combinar({ it, onPronto }: { it: Item; onPronto: () => void }) {
  const ini = paraData(it.inicio)
  const pad = (n: number) => String(n).padStart(2, '0')
  const [quando, setQuando] = useState(`${ini.getFullYear()}-${pad(ini.getMonth() + 1)}-${pad(ini.getDate())}T09:00`)
  const [local, setLocal] = useState(it.local || '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  // o conflito de região não bloqueia: mostra e pede pra confirmar de propósito
  const [conflito, setConflito] = useState('')

  async function combinar(mesmoAssim = false) {
    const d = new Date(quando)
    if (isNaN(+d)) { setErro('Confere a data e a hora.'); return }
    if (!local) { setErro('Escolhe onde vai ser — é o que diz pro time se o dia já está comprometido.'); return }
    setSalvando(true); setErro('')
    const j = await fetchAuth('/api/projetos/marco', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'combinar', id: it.id, data_hora: d.toISOString(), local, mesmo_assim: mesmoAssim }),
    }).then(r => r.json()).catch(() => null)
    setSalvando(false)
    if (j?.precisa_confirmar_regiao) { setConflito(j.error); return }
    if (!j?.ok) { setErro(j?.error || 'não consegui combinar agora'); return }
    if (j.aviso) { setAviso(j.aviso); setTimeout(onPronto, 2500); return }
    onPronto()
  }

  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 'var(--r)', padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
        <b style={{ color: 'var(--text)' }}>Ainda não foi combinado com o cliente.</b> O roteiro calculou esta data — acertou o dia com ele? Marca aqui que vira compromisso de verdade.
      </div>
      <input type="datetime-local" value={quando} onChange={e => { setQuando(e.target.value); setConflito('') }} style={{ ...inp, width: '100%' }} />
      {/* ⚠️ ONDE É — obrigatório. Dois atendimentos no mesmo dia só cabem na MESMA região; é isto
          que deixa o time ver, de relance, se o dia já está comprometido com a outra. */}
      <select value={local} onChange={e => { setLocal(e.target.value); setConflito('') }} style={{ ...inp, width: '100%', cursor: 'pointer' }}>
        <option value="">Onde vai ser?</option>
        {LOCAIS.map(l => <option key={l.chave} value={l.chave}>{l.nome}</option>)}
      </select>

      {conflito ? (
        <div style={{ background: 'var(--amber-bg)', border: '1px solid var(--amber)', borderRadius: 'var(--r)', padding: '11px 13px' }}>
          <div style={{ fontSize: 12.5, color: 'var(--amber)', fontWeight: 700, lineHeight: 1.5 }}>{conflito}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 9, flexWrap: 'wrap' }}>
            <button onClick={() => setConflito('')} style={{ ...btnSec, flex: 1 }}>Escolher outro dia</button>
            <button onClick={() => combinar(true)} disabled={salvando} style={{ ...btnSec, borderColor: 'var(--amber)', color: 'var(--amber)' }}>Marcar mesmo assim</button>
          </div>
        </div>
      ) : (
        <button onClick={() => combinar(false)} disabled={salvando} style={{ ...btnPri, opacity: salvando ? .6 : 1 }}>
          {salvando ? 'Combinando…' : 'Combinar'}
        </button>
      )}

      {erro && <p style={{ fontSize: 12.5, color: 'var(--red)', margin: 0 }}>{erro}</p>}
      {aviso && <p style={{ fontSize: 12.5, color: 'var(--amber)', margin: 0, lineHeight: 1.5 }}>{aviso}</p>}
      <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: 0, lineHeight: 1.5 }}>
        Combinado, a IA reconfirma com o cliente 2 dias antes — e te avisa se ele não responder.
      </p>
    </div>
  )
}

function ModalDetalhe({ it, eu, ativos, nomeDe, ocupado, podeNaoLido, onNaoLido, podeEditar, onEditar, onFechar, onPegar, onConcluir, onPublico, onAjuda, onCombinado }: {
  it: Item; eu: Eu; ativos: Pessoa[]; nomeDe: (id: string | null) => string | null; ocupado: boolean
  podeNaoLido: boolean; onNaoLido: () => void
  podeEditar: boolean; onEditar: () => void
  onFechar: () => void; onPegar: (quem: string | null) => void; onConcluir: () => void
  onPublico: (p: boolean) => void; onAjuda: (quem: string, nota: string) => void; onCombinado: () => void
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
        {/* ⚠️ COMBINAR SE FAZ AQUI; CONCLUIR, NÃO. A regra de ouro do módulo de entrega é sobre
            FECHAR um encontro (não fecha sem marcar o próximo, com o cliente na frente) — e ela
            continua valendo só na ficha. Combinar é o contrário disso: é o que tira o cliente do
            limbo. Fazer isso na agenda é o ponto, porque é na agenda que a pessoa VÊ que está
            faltando. */}
        {ehPrevisto(it) ? (
          <Combinar it={it} onPronto={onCombinado} />
        ) : (
          <p style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.5 }}>
            Remarcar e concluir se faz na ficha da entrega — lá, antes de fechar um encontro, o sistema pede o próximo.
          </p>
        )}
        {aviso && (
          <div style={{ background: 'var(--amber-bg)', border: '1px solid var(--amber)', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: 'var(--amber)' }}>
            Precisa de ti: {aviso}.
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onFechar} style={{ ...btnSec, flex: 1 }}>Fechar</button>
          <a href={`/dashboard/entregas/${it.projetoId}`} style={{ ...btnSec, flex: 1, textAlign: 'center', textDecoration: 'none' }}>Abrir a entrega</a>
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
