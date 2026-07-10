'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef, createContext, useContext } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import NotifCelular from '@/components/NotifCelular'
import ThemeToggle from '@/components/ThemeToggle'

// Evita o menu ser renderizado 2x (algumas páginas embrulham em <Layout> e o
// dashboard/layout.tsx também). Se já estiver dentro de um Layout, não duplica.
const LayoutMontado = createContext(false)

type Item = { nome: string; href: string }
type Grupo = { titulo: string; itens: Item[] }
type Perfil = { id: string; nome: string; email: string; papel: string; setor: string; crm_interno: boolean; crm_externo: boolean; leads_escopo: string; wa_caixa: boolean }

const grupos: Grupo[] = [
  {
    titulo: '',
    itens: [
      { nome: 'Painel', href: '/dashboard' },
    ],
  },
  {
    titulo: 'Comercial',
    itens: [
      { nome: 'WhatsApp', href: '/dashboard/whatsapp' },
      { nome: 'WhatsApp Disparos', href: '/dashboard/whatsapp-disparos' },
      { nome: 'CRM', href: '/dashboard/crm' },
      { nome: 'Resultados CRM', href: '/dashboard/crm/resultados' },
      { nome: 'Config CRM', href: '/dashboard/crm/config' },
      // ocultos (reativar quando precisar):
      // { nome: 'CRM Externo', href: '/dashboard/crm-externo' },
      // { nome: 'Resultados Externo', href: '/dashboard/crm-externo/resultados' },
      // { nome: 'Vendedores', href: '/dashboard/vendedores' },
      // { nome: 'Comissões', href: '/dashboard/comissoes' },
      { nome: 'Tarefas de Leads', href: '/dashboard/tarefas/leads' },
      { nome: 'Matrículas Órfãs', href: '/dashboard/matriculas-orfas' },
    ],
  },
  {
    titulo: 'Dashboards',
    itens: [
      { nome: 'Captação', href: '/dashboard/captacao' },
      { nome: 'Análise de Conversão', href: '/dashboard/analise-conversao' },
      { nome: 'Tráfego', href: '/dashboard/trafego' },
      { nome: 'Funil do Site', href: '/dashboard/funil-site' },
      { nome: 'Inteligência de Cliente', href: '/dashboard/inteligencia-cliente' },
      { nome: 'Velocidade de Venda', href: '/dashboard/velocidade-venda' },
      { nome: 'NPS', href: '/dashboard/nps' },
    ],
  },
  {
    titulo: 'Operações',
    itens: [
      { nome: 'Turmas', href: '/dashboard/turmas' },
      { nome: 'Chamada', href: '/dashboard/chamada' },
      { nome: 'Salas', href: '/dashboard/salas' },
      { nome: 'Cidades', href: '/dashboard/cidades' },
      { nome: 'Disparos', href: '/dashboard/disparos' },
      { nome: 'Relatório Disparos', href: '/dashboard/disparos/relatorios' },
      { nome: 'Listas', href: '/dashboard/listas' },
      // ocultos (reativar quando precisar):
      // { nome: 'Tarefas', href: '/dashboard/tarefas' },
      // { nome: 'Minha Agenda', href: '/dashboard/agenda' },
      // { nome: 'Agenda de Aulas', href: '/dashboard/agenda/aulas' },
    ],
  },
  {
    titulo: 'Financeiro',
    itens: [
      { nome: 'Lançamentos', href: '/dashboard/financeiro' },
      { nome: 'Fluxo de Caixa', href: '/dashboard/financeiro/fluxo' },
      { nome: 'Caixas', href: '/dashboard/financeiro/caixas' },
      { nome: 'Naturezas', href: '/dashboard/financeiro/naturezas' },
      { nome: 'Recalcular Tráfego', href: '/dashboard/financeiro/recalcular-trafego' },
    ],
  },
  {
    titulo: 'Cadastros',
    itens: [
      { nome: 'Alunos', href: '/dashboard/alunos' },
      { nome: 'Professores', href: '/dashboard/professores' },
      { nome: 'Módulos', href: '/dashboard/modulos' },
      { nome: 'Usuários', href: '/dashboard/usuarios' },
      { nome: 'Configurações', href: '/dashboard/configuracoes' },
      { nome: 'Templates de Tarefas', href: '/dashboard/tarefas/templates' },
      { nome: 'Motivos de Perda', href: '/dashboard/motivos-perda' },
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
  if (p.papel === 'admin') return true
  if (href === '/dashboard/whatsapp' || href === '/dashboard/whatsapp-disparos') return p.wa_caixa === true
  // base do vendedor
  const baseVendedor = ['/dashboard', '/dashboard/turmas', '/dashboard/tarefas/leads', '/dashboard/agenda', '/dashboard/agenda/aulas', '/dashboard/alunos']
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
      // caixa principal = tudo que não é 'oficial'; Disparos = canal 'oficial'
      const totZapi = linhas.filter((c: any) => c.canal !== 'oficial').reduce((s: number, c: any) => s + (c.nao_lidas || 0), 0)
      const totDisp = linhas.filter((c: any) => c.canal === 'oficial').reduce((s: number, c: any) => s + (c.nao_lidas || 0), 0)
      const total = totZapi + totDisp
      setWaUnread(totZapi)
      setDispUnread(totDisp)
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

  // Fecha menu ao trocar de página no mobile
  useEffect(() => { setMenuMobileAberto(false) }, [pathname])

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

  const gruposVisiveis = grupos
    .map(g => ({ ...g, itens: g.itens.filter(i => itemPermitido(i.href, perfil)) }))
    .filter(g => g.itens.length > 0)

  const menuVisivel = !isMobile || menuMobileAberto

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg)' }}>
      {isMobile && (
        <button onClick={() => setMenuMobileAberto(!menuMobileAberto)}
          style={{
            position: 'fixed', top: 12, left: 12, zIndex: 60,
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
            padding: '8px 12px', fontSize: 22, color: 'var(--text)', cursor: 'pointer',
            lineHeight: 1,
          }}>
          {menuMobileAberto ? '×' : '☰'}
        </button>
      )}

      {isMobile && menuMobileAberto && (
        <div onClick={() => setMenuMobileAberto(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 45 }} />
      )}

      {menuVisivel && (
        <div style={{ flexShrink: 0, width: '220px' }}>
          <div data-theme="dark" style={{
            width: '220px',
            backgroundColor: 'var(--surface)',
            borderRight: '1px solid var(--border)',
            height: '100vh',
            position: 'fixed',
            top: 0,
            left: 0,
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            zIndex: 50,
          }}>
            <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <Image src="/logo.png" alt="CarreiraNoDigital" width={160} height={48} style={{ objectFit: 'contain' }} />
            </div>

            <nav style={{ flex: 1, padding: '8px 12px', display: 'flex', flexDirection: 'column' }}>
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
                      fontSize: '10px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      marginTop: idx > 1 ? 4 : 0,
                    }}>
                      <span>{grupo.titulo}</span>
                      <span style={{ fontSize: 9, transform: abertos[grupo.titulo] ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
                    </button>
                  )}
                  {(abertos[grupo.titulo] || !grupo.titulo) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                      {grupo.itens.map(m => {
                        const ativo = pathname === m.href
                        return (
                          <Link key={m.href} href={m.href} className={'navItem' + (ativo ? ' ativo' : '')} style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 6,
                            padding: grupo.titulo ? '7px 10px 7px 18px' : '9px 14px',
                            borderRadius: '6px',
                            fontSize: '13px',
                            fontWeight: ativo ? '600' : '400',
                            textDecoration: 'none',
                            backgroundColor: ativo ? 'var(--accent)' : 'transparent',
                            color: ativo ? 'var(--on-accent)' : 'var(--text-muted)',
                            boxShadow: ativo ? '0 1px 6px rgba(124,58,237,.45)' : 'none',
                            transition: 'background-color .15s ease, color .15s ease',
                          }}>
                            <span>{m.nome}</span>
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
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </nav>

            <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), var(--accent-soft))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                  {(perfil.nome || '?').trim().charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '12.5px', color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{perfil.nome}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-faint)' }}>{perfil.papel === 'admin' ? 'Administrador' : 'Vendedor'}</div>
                </div>
              </div>
              {(perfil.papel === 'admin' || perfil.wa_caixa) && <NotifCelular />}
              <div style={{ marginTop: 8 }}><ThemeToggle /></div>
              <button onClick={sair} style={{ marginTop: 8, width: '100%', background: 'var(--surface-2)', border: 'none', borderRadius: 6, padding: '7px', fontSize: 12, color: 'var(--text-2)', cursor: 'pointer' }}>
                Sair
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0, backgroundColor: 'var(--bg)', paddingTop: isMobile ? 50 : 0 }}>
        {children}
      </div>
    </div>
  )
}