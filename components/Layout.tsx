'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef, createContext, useContext } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { fetchAuth } from '@/lib/api'
import NotifCelular from '@/components/NotifCelular'
import ThemeToggle from '@/components/ThemeToggle'
import {
  LayoutDashboard, CalendarDays, Bot, Sparkles, Map, BadgeCheck, Workflow, Coins, Phone, MessageCircle, Columns3,
  Layers, Package, Trophy, CalendarClock, ListChecks, ClipboardCheck, PackageCheck, Megaphone, TrendingUp, Activity,
  Globe, Gauge, Smile, GraduationCap, UserCheck, Send, CalendarRange, MessageSquareText, FileText, List, Wallet,
  ArrowLeftRight, Receipt, Tags, Settings2, UserX, ThumbsDown, ListTodo, DoorOpen, MapPin, Blocks, PiggyBank,
  RefreshCw, Users, UserCog, Settings, Building2, Webhook, LogOut, Menu, X, ChevronDown, Circle, Percent, Handshake,
  type LucideIcon,
} from 'lucide-react'

const CND_ID = '00000000-0000-0000-0000-0000000000cd'

// Um ícone por tela (Lucide). Tela sem ícone aqui recebe um ponto — e é sinal pra cadastrar.
const ICONES: Record<string, LucideIcon> = {
  '/dashboard': LayoutDashboard, '/dashboard/agenda': CalendarDays,
  '/dashboard/agente-interno': Bot, '/dashboard/followup-ia': Sparkles, '/dashboard/mapa-funil': Map,
  '/dashboard/qualidade-ia': BadgeCheck, '/dashboard/automacao-ia': Workflow, '/dashboard/ia-uso': Coins,
  '/dashboard/ligacoes': Phone, '/dashboard/whatsapp': MessageCircle, '/dashboard/crm': Columns3, '/dashboard/lotes': Layers,
  '/dashboard/produtos': Package, '/dashboard/crm/resultados': Trophy, '/dashboard/turmas-mensagens': CalendarClock,
  '/dashboard/tarefas/leads': ListChecks, '/dashboard/fechamento': ClipboardCheck, '/dashboard/entregas': PackageCheck,
  '/dashboard/captacao': Megaphone, '/dashboard/analise-conversao': TrendingUp, '/dashboard/trafego': Activity,
  '/dashboard/entregas/trafego': Activity, '/dashboard/funil-site': Globe, '/dashboard/velocidade-venda': Gauge, '/dashboard/nps': Smile,
  '/dashboard/turmas': GraduationCap, '/dashboard/chamada': UserCheck, '/dashboard/disparos': Send,
  '/dashboard/agenda-disparos': CalendarRange, '/dashboard/followup-templates': MessageSquareText,
  '/dashboard/disparos/relatorios': FileText, '/dashboard/listas': List,
  '/dashboard/financeiro': Wallet, '/dashboard/financeiro/fluxo': TrendingUp, '/dashboard/transferencias': ArrowLeftRight,
  '/dashboard/financeiro/custos': Receipt, '/dashboard/financeiro/naturezas': Tags, '/dashboard/comissoes': Percent,
  '/dashboard/vendedores': Handshake,
  '/dashboard/crm/config': Settings2, '/dashboard/matriculas-orfas': UserX, '/dashboard/motivos-perda': ThumbsDown,
  '/dashboard/tarefas/templates': ListTodo, '/dashboard/salas': DoorOpen, '/dashboard/cidades': MapPin, '/dashboard/modulos': Blocks,
  '/dashboard/financeiro/caixas': PiggyBank, '/dashboard/financeiro/recalcular-trafego': RefreshCw,
  '/dashboard/alunos': Users, '/dashboard/professores': UserCog, '/dashboard/usuarios': Users,
  '/dashboard/configuracoes': Settings, '/dashboard/admin/orgs': Building2, '/dashboard/webhook-logs': Webhook,
}

// Evita o menu ser renderizado 2x (algumas páginas embrulham em <Layout> e o
// dashboard/layout.tsx também). Se já estiver dentro de um Layout, não duplica.
const LayoutMontado = createContext(false)

type Item = { nome: string; href: string; feat?: string }
type Grupo = { titulo: string; itens: Item[] }
type Perfil = { id: string; nome: string; email: string; papel: string; setor: string; crm_interno: boolean; crm_externo: boolean; leads_escopo: string; wa_caixa: boolean }

// Agente Interno: só estes 3 (Guto, Nando, Rick), mesmo os outros sendo admin.
const AGENTE_PERMITIDOS = ['guto.wickert@gmail.com', 'debairros@hotmail.com', 'ricardovognach@hotmail.com', 'tizonmidia@gmail.com']

const grupos: Grupo[] = [
  {
    titulo: '',
    itens: [
      { nome: 'Painel', href: '/dashboard' },
      // Fica no topo, fora de qualquer grupo, porque é a tela pra abrir todo dia. A rota existia
      // desde agosto e nunca esteve no menu — dava pra chegar nela só digitando o endereço.
      { nome: 'Agenda', href: '/dashboard/agenda' },
    ],
  },
  {
    titulo: 'Inteligência Artificial',
    itens: [
      { nome: 'Agente Interno', href: '/dashboard/agente-interno' },
      { nome: 'Follow-up automático', href: '/dashboard/followup-ia' },
      { nome: 'Mapa do funil', href: '/dashboard/mapa-funil' },
      { nome: 'Qualidade IA', href: '/dashboard/qualidade-ia' },
      { nome: 'Automação IA', href: '/dashboard/automacao-ia' },
      { nome: 'Custo da IA', href: '/dashboard/ia-uso' },
    ],
  },
  {
    titulo: 'CRM',
    itens: [
      { nome: 'Fila de Ligações', href: '/dashboard/ligacoes' },
      { nome: 'WhatsApp', href: '/dashboard/whatsapp' },
      { nome: 'CRM', href: '/dashboard/crm' },
      { nome: 'Lotes Abertos', href: '/dashboard/lotes' },
      { nome: 'Produtos', href: '/dashboard/produtos' },
      { nome: 'Resultados CRM', href: '/dashboard/crm/resultados' },
      { nome: 'Datas das Turmas', href: '/dashboard/turmas-mensagens', feat: 'escola' },
      { nome: 'Tarefas de Leads', href: '/dashboard/tarefas/leads' },
      { nome: 'Fechamento de Turma', href: '/dashboard/fechamento' },
      { nome: 'Entregas', href: '/dashboard/entregas' },
    ],
  },
  {
    titulo: 'Dashboards',
    itens: [
      { nome: 'Captação', href: '/dashboard/captacao' },
      { nome: 'Análise de Conversão', href: '/dashboard/analise-conversao' },
      { nome: 'Tráfego', href: '/dashboard/trafego' },
      { nome: 'Tráfego dos Clientes', href: '/dashboard/entregas/trafego' },
      { nome: 'Funil do Site', href: '/dashboard/funil-site' },
      { nome: 'Velocidade de Venda', href: '/dashboard/velocidade-venda' },
      { nome: 'NPS', href: '/dashboard/nps', feat: 'escola' },
    ],
  },
  {
    titulo: 'Operações',
    itens: [
      { nome: 'Turmas', href: '/dashboard/turmas', feat: 'escola' },
      { nome: 'Chamada', href: '/dashboard/chamada', feat: 'escola' },
      { nome: 'Disparos', href: '/dashboard/disparos' },
      { nome: 'Agenda de Disparos', href: '/dashboard/agenda-disparos' },
      { nome: 'Templates de Follow-up', href: '/dashboard/followup-templates' },
      { nome: 'Relatório Disparos', href: '/dashboard/disparos/relatorios' },
      { nome: 'Listas', href: '/dashboard/listas' },
    ],
  },
  {
    titulo: 'Financeiro',
    itens: [
      { nome: 'Lançamentos', href: '/dashboard/financeiro' },
      { nome: 'Fluxo de Caixa', href: '/dashboard/financeiro/fluxo' },
      { nome: 'Transferências entre Contas', href: '/dashboard/transferencias' },
      { nome: 'Relatório de Custos', href: '/dashboard/financeiro/custos' },
      { nome: 'Naturezas', href: '/dashboard/financeiro/naturezas' },
    ],
  },
  {
    titulo: 'Cadastros',
    itens: [
      { nome: 'Comercial', href: '' },
      { nome: 'Config CRM', href: '/dashboard/crm/config' },
      { nome: 'Matrículas Órfãs', href: '/dashboard/matriculas-orfas' },
      { nome: 'Motivos de Perda', href: '/dashboard/motivos-perda' },
      { nome: 'Templates de Tarefas', href: '/dashboard/tarefas/templates' },
      { nome: 'Operações', href: '' },
      { nome: 'Salas', href: '/dashboard/salas', feat: 'escola' },
      { nome: 'Cidades', href: '/dashboard/cidades' },
      { nome: 'Módulos', href: '/dashboard/modulos', feat: 'escola' },
      { nome: 'Financeiro', href: '' },
      { nome: 'Caixas', href: '/dashboard/financeiro/caixas' },
      { nome: 'Recalcular Tráfego', href: '/dashboard/financeiro/recalcular-trafego' },
      { nome: 'Pessoas', href: '' },
      { nome: 'Alunos', href: '/dashboard/alunos', feat: 'escola' },
      { nome: 'Professores', href: '/dashboard/professores', feat: 'escola' },
      { nome: 'Usuários', href: '/dashboard/usuarios' },
      { nome: 'Sistema', href: '' },
      { nome: 'Configurações', href: '/dashboard/configuracoes' },
      { nome: 'Organizações (SaaS)', href: '/dashboard/admin/orgs', feat: 'superadmin' },
      { nome: 'Webhook Logs', href: '/dashboard/webhook-logs' },
    ],
  },
]

// Bipe curto pra avisar nova mensagem (sem precisar de arquivo de áudio)
function bipe() {
  try {
    const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext
    const ctx = new AC()
    const o = ctx.createOscillator(); const g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination)
    o.type = 'sine'; o.frequency.value = 880
    g.gain.setValueAtTime(0.12, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25)
    o.start(); o.stop(ctx.currentTime + 0.25)
    o.onended = () => ctx.close()
  } catch { /* ignore */ }
}

// Itens que o VENDEDOR pode ver (admin ve tudo). Por href.
function itemPermitido(href: string, p: Perfil): boolean {
  if (!href) return true // sub-título (rótulo) — visível; labels órfãos são limpos depois
  if (href === '/dashboard/agente-interno' || href === '/dashboard/qualidade-ia' || href === '/dashboard/automacao-ia' || href === '/dashboard/ia-uso') return AGENTE_PERMITIDOS.includes((p.email || '').toLowerCase())
  if (p.papel === 'admin') return true

  // GESTOR — o degrau que faltava entre "vê tudo" e "vê quase nada".
  //
  // Antes só existia admin e vendedor: quem precisava trabalhar de verdade virava admin, e admin
  // enxerga financeiro, cadastros e a agenda de todo mundo. Esta lista NÃO é um chute — é o que o
  // Mateus respondeu que usa no dia a dia, tela por tela. Fora daqui: financeiro, cadastros,
  // comissões, usuários e as telas de IA.
  if (p.papel === 'gestor') {
    const doGestor = [
      '/dashboard', '/dashboard/agenda', '/dashboard/agenda/aulas',
      '/dashboard/crm', '/dashboard/crm/resultados',
      '/dashboard/ligacoes', '/dashboard/whatsapp',
      '/dashboard/lotes', '/dashboard/produtos',
      '/dashboard/turmas-mensagens', '/dashboard/tarefas/leads', '/dashboard/fechamento',
      '/dashboard/analise-conversao',
      '/dashboard/turmas', '/dashboard/chamada', '/dashboard/alunos',
    ]
    if (href === '/dashboard/whatsapp') return p.wa_caixa === true
    return doGestor.includes(href)
  }

  if (href === '/dashboard/whatsapp' || href === '/dashboard/whatsapp-disparos') return p.wa_caixa === true
  // base do vendedor
  const baseVendedor = ['/dashboard', '/dashboard/turmas', '/dashboard/lotes', '/dashboard/tarefas/leads', '/dashboard/agenda', '/dashboard/agenda/aulas', '/dashboard/alunos']
  if (baseVendedor.includes(href)) return true
  // CRM interno
  if (p.crm_interno && (href === '/dashboard/crm' || href === '/dashboard/crm/resultados')) return true
  // CRM externo
  if (p.crm_externo && (href === '/dashboard/crm-externo' || href === '/dashboard/crm-externo/resultados')) return true
  return false
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const jaMontado = useContext(LayoutMontado)
  if (jaMontado) return <>{children}</>
  return (
    <LayoutMontado.Provider value={true}>
      <LayoutInterno>{children}</LayoutInterno>
    </LayoutMontado.Provider>
  )
}

function LayoutInterno({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [abertos, setAbertos] = useState<Record<string, boolean>>(
    grupos.reduce((acc, g) => ({ ...acc, [g.titulo]: false }), {})
  )
  const [menuMobileAberto, setMenuMobileAberto] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [checando, setChecando] = useState(true)
  const [waUnread, setWaUnread] = useState(0)
  const [dispUnread, setDispUnread] = useState(0)
  // Balão vermelho da Agenda: o que é MEU e ainda não vi (regra em lib/agenda-balao.ts)
  const [agendaBalao, setAgendaBalao] = useState(0)
  const waPrevRef = useRef(-1)

  useEffect(() => {
    function checkMobile() { setIsMobile(window.innerWidth < 768) }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Guard: exige sessao + carrega o perfil (papel/flags)
  useEffect(() => {
    let ativo = true
    async function checar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/login'); return }
      const { data: p } = await supabase.from('usuarios_perfil')
        .select('id, nome, email, papel, setor, crm_interno, crm_externo, leads_escopo, wa_caixa')
        .eq('id', session.user.id).single()
      if (!ativo) return
      if (!p) { await supabase.auth.signOut(); router.replace('/login'); return }
      // professor não usa o painel admin — vai pro portal dele
      if ((p as any).setor === 'professor' || (p as any).papel === 'professor') { router.replace('/professor'); return }
      setPerfil(p as Perfil)
      setChecando(false)
    }
    checar()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) router.replace('/login')
    })
    return () => { ativo = false; sub.subscription.unsubscribe() }
  }, [router])

  // Notificação de novas mensagens do WhatsApp (badge no menu + som + aviso do navegador)
  useEffect(() => {
    if (!perfil) return
    const temWa = perfil.papel === 'admin' || perfil.wa_caixa === true
    if (!temWa) return
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
    let ativo = true
    async function checar() {
      const { data } = await supabase.from('wa_conversas').select('nao_lidas, canal').gt('nao_lidas', 0)
      if (!ativo) return
      const linhas = data || []
      // O número OFICIAL virou o atendimento principal → o inbox WhatsApp agora mostra
      // TODOS os canais, então o badge principal conta tudo. Disparos segue com o subconjunto oficial.
      const totOficial = linhas.filter((c: any) => c.canal === 'oficial').reduce((s: number, c: any) => s + (c.nao_lidas || 0), 0)
      const total = linhas.reduce((s: number, c: any) => s + (c.nao_lidas || 0), 0)
      setWaUnread(total)
      setDispUnread(totOficial)
      // só avisa quando AUMENTA (não na 1ª carga nem quando você lê)
      if (waPrevRef.current >= 0 && total > waPrevRef.current) {
        bipe()
        if ('Notification' in window && Notification.permission === 'granted') {
          try { new Notification('Carreira No Digital', { body: 'Nova mensagem no WhatsApp 💬' }) } catch { /* ignore */ }
        }
      }
      waPrevRef.current = total
    }
    checar()
    const t = setInterval(checar, 12000)
    return () => { ativo = false; clearInterval(t) }
  }, [perfil])

  // Balão da Agenda. Pergunta ao servidor a cada minuto (agenda muda devagar — o WhatsApp é que
  // precisa de 12s), ao voltar pra aba, e na hora em que a própria agenda avisa que algo foi lido,
  // concluído ou pego (evento `agenda:balao`). Com a aba escondida não pergunta.
  // `seq` descarta resposta velha: um poll lento não pode sobrescrever o número que a agenda acabou
  // de mandar.
  useEffect(() => {
    if (!perfil) return
    let ativo = true
    let seq = 0
    async function checar() {
      if (document.hidden) return
      const meu = ++seq
      const j = await fetchAuth('/api/agenda/balao').then(r => r.json()).catch(() => null)
      if (!ativo || meu !== seq) return
      // sem a tabela de leituras (instalação que não rodou o 22), o balão fica escondido
      setAgendaBalao(j?.ok && j.pronto ? j.total || 0 : 0)
    }
    function daAgenda(e: Event) {
      const total = (e as CustomEvent).detail?.total
      if (typeof total === 'number') { seq++; setAgendaBalao(total) } else checar()
    }
    const aoVoltar = () => { if (!document.hidden) checar() }
    checar()
    const t = setInterval(checar, 60000)
    window.addEventListener('agenda:balao', daAgenda)
    window.addEventListener('focus', aoVoltar)
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      ativo = false; clearInterval(t)
      window.removeEventListener('agenda:balao', daAgenda)
      window.removeEventListener('focus', aoVoltar)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [perfil])

  // Fecha menu ao trocar de página no mobile
  useEffect(() => { setMenuMobileAberto(false) }, [pathname])

  // MARCA da org (logo/nome/cor) — veste a cara do cliente
  const [marca, setMarca] = useState<any>(null)
  useEffect(() => { fetchAuth('/api/org/me').then(r => r.json()).then(j => { if (j?.ok) setMarca(j.org) }).catch(() => { }) }, [])

  function toggle(titulo: string) {
    setAbertos(prev => ({ ...prev, [titulo]: !prev[titulo] }))
  }

  async function sair() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (checando || !perfil) {
    return <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontSize: 14 }}>Carregando...</div>
  }

  // remove sub-títulos (href vazio) que ficaram sem nenhum item real logo abaixo
  const limpaLabels = (itens: Item[]): Item[] => itens.filter((it, i) => it.href || (itens[i + 1] && !!itens[i + 1].href))
  const feats = (marca?.config?.features) || {}
  const featOk = (i: Item) => {
    if (i.feat === 'superadmin') return marca?.id === CND_ID // só a CnD vê o painel do SaaS
    return !i.feat || feats[i.feat] !== false // opt-out: só some se explicitamente false
  }
  const gruposVisiveis = grupos
    .map(g => ({ ...g, itens: limpaLabels(g.itens.filter(i => itemPermitido(i.href, perfil!) && featOk(i))) }))
    .filter(g => g.itens.some(i => i.href))

  const menuVisivel = !isMobile || menuMobileAberto

  return (
    <div style={{ display: 'flex', minHeight: '100vh', position: 'relative', ...(marca?.cor ? { ['--accent' as any]: marca.cor, ['--accent-soft' as any]: marca.cor } : {}) }}>
      {/* A luz atrás de tudo — é o que o vidro do menu e dos painéis desfoca. Fixa, desenhada uma vez. */}
      <div className="luz-de-fundo" aria-hidden="true" />
      {isMobile && (
        <button onClick={() => setMenuMobileAberto(!menuMobileAberto)} aria-label={menuMobileAberto ? 'Fechar menu' : 'Abrir menu'}
          className="vidro"
          style={{
            position: 'fixed', top: 12, left: 12, zIndex: 60, borderRadius: 'var(--r)',
            padding: 9, color: 'var(--text)', cursor: 'pointer', lineHeight: 0,
          }}>
          {menuMobileAberto ? <X size={20} /> : <Menu size={20} />}
          {/* no celular o menu fica escondido — sem este ponto, o balão da agenda nunca apareceria */}
          {!menuMobileAberto && agendaBalao > 0 && (
            <span style={{ position: 'absolute', top: 4, right: 4, width: 9, height: 9, borderRadius: '50%', background: 'var(--red)' }} />
          )}
        </button>
      )}

      {isMobile && menuMobileAberto && (
        <div onClick={() => setMenuMobileAberto(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 45 }} />
      )}

      {menuVisivel && (
        <div style={{ flexShrink: 0, width: 236 }}>
          {/* Menu de vidro: fica parado, o que está atrás dele (a luz) também — o navegador desfoca uma
              vez e guarda. Segue o tema (antes era ilha escura); a marca ganha um prato escuro pra o
              logo de letras brancas ler nos dois. */}
          <div className="vidro-menu" style={{
            width: 236,
            borderRight: '1px solid var(--glass-border)',
            boxShadow: 'inset -1px 0 0 var(--glass-hi)',
            height: '100vh',
            position: 'fixed',
            top: 0,
            left: 0,
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            zIndex: 50,
          }}>
            <div style={{ padding: '14px 12px 10px', flexShrink: 0 }}>
              <div style={{ background: '#150a2b', borderRadius: 'var(--r)', padding: '12px 14px', boxShadow: '0 8px 22px var(--glow), inset 0 1px 0 rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', minHeight: 60 }}>
                {marca?.logo_url
                  ? <img src={marca.logo_url} alt={marca.nome || ''} style={{ maxHeight: 40, maxWidth: 180, objectFit: 'contain' }} />
                  : (marca && marca.id !== CND_ID)
                    ? <div className="display" style={{ fontSize: 17, fontWeight: 800, color: '#fff', textTransform: 'uppercase', lineHeight: 1.1 }}>{marca.nome}</div>
                    : <Image src="/logo.png" alt="CarreiraNoDigital" width={180} height={54} style={{ objectFit: 'contain' }} />}
              </div>
            </div>

            <nav style={{ flex: 1, padding: '12px 12px', display: 'flex', flexDirection: 'column' }}>
              {gruposVisiveis.map((grupo, idx) => (
                <div key={idx} style={{ marginBottom: grupo.titulo ? 8 : 4 }}>
                  {grupo.titulo && (
                    <button onClick={() => toggle(grupo.titulo)} style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-faint)',
                      fontSize: '10.5px',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      marginTop: idx > 1 ? 4 : 0,
                    }}>
                      <span>{grupo.titulo}</span>
                      <ChevronDown size={12} style={{ transform: abertos[grupo.titulo] ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .15s ease' }} />
                    </button>
                  )}
                  {(abertos[grupo.titulo] || !grupo.titulo) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {grupo.itens.map((m, mi) => {
                        if (!m.href) return (
                          <div key={'lbl-' + mi} style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.08em', padding: '10px 10px 2px 12px', opacity: .7 }}>{m.nome}</div>
                        )
                        const ativo = pathname === m.href
                        const Icone = ICONES[m.href] || Circle
                        return (
                          <Link key={m.href} href={m.href} className={'navItem' + (ativo ? ' ativo' : '')} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '8px 10px',
                            borderRadius: 'var(--r)',
                            fontSize: '13.5px',
                            fontWeight: ativo ? 700 : 500,
                            textDecoration: 'none',
                            backgroundColor: ativo ? 'var(--nav-active-bg)' : 'transparent',
                            color: ativo ? 'var(--nav-active-text)' : 'var(--text-2)',
                            // a barrinha na cor da marca é o que diz "você está aqui"
                            boxShadow: ativo ? 'inset 2px 0 0 var(--accent)' : 'none',
                            transition: 'background-color .15s ease, color .15s ease',
                          }}>
                            <Icone size={17} strokeWidth={1.75} style={{ flexShrink: 0, opacity: ativo ? 1 : .8 }} />
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nome}</span>
                            {m.href === '/dashboard/whatsapp' && waUnread > 0 && (
                              <span style={{ background: '#25D366', color: '#063', borderRadius: 10, padding: '0 7px', fontSize: 11, fontWeight: 700, minWidth: 18, textAlign: 'center' }}>
                                {waUnread > 99 ? '99+' : waUnread}
                              </span>
                            )}
                            {m.href === '/dashboard/whatsapp-disparos' && dispUnread > 0 && (
                              <span style={{ background: '#25D366', color: '#063', borderRadius: 10, padding: '0 7px', fontSize: 11, fontWeight: 700, minWidth: 18, textAlign: 'center' }}>
                                {dispUnread > 99 ? '99+' : dispUnread}
                              </span>
                            )}
                            {/* vermelho, não verde: não é mensagem chegando, é coisa minha pra fazer */}
                            {m.href === '/dashboard/agenda' && agendaBalao > 0 && (
                              <span title="Coisas tuas na agenda que você ainda não viu" style={{ background: 'var(--red)', color: '#fff', borderRadius: 10, padding: '0 7px', fontSize: 11, fontWeight: 700, minWidth: 18, textAlign: 'center' }}>
                                {agendaBalao > 99 ? '99+' : agendaBalao}
                              </span>
                            )}
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </nav>

            <div style={{ padding: '12px 12px 14px', borderTop: '1px solid var(--glass-border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 4px 10px' }}>
                {/* o avatar é um dos poucos lugares do gradiente do logo */}
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--grad)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, flexShrink: 0, boxShadow: '0 4px 12px var(--glow)' }}>
                  {(perfil.nome || '?').trim().charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{perfil.nome}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-faint)' }}>{perfil.papel === 'admin' ? 'Administrador' : perfil.papel === 'gestor' ? 'Gestor' : 'Vendedor'}</div>
                </div>
                <ThemeToggle compacto />
              </div>
              {(perfil.papel === 'admin' || perfil.wa_caixa) && <NotifCelular />}
              <button onClick={sair} style={{ marginTop: 6, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: 'transparent', border: '1px solid var(--glass-border)', borderRadius: 'var(--r)', padding: '8px', fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer' }}>
                <LogOut size={14} /> Sair
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1, paddingTop: isMobile ? 50 : 0 }}>
        {children}
      </div>
    </div>
  )
}