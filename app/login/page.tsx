'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Logo3D from '@/components/Logo3D'
import { Botao, Campo } from '@/components/ui'

// O LOGIN — a única tela que todo mundo vê todo dia, e o lugar onde a marca aparece inteira.
// Esquerda: o logo em 3D flutuando sobre o gradiente do logo, com um circuito de pontos vivos
// atrás (eco do cérebro). Direita: o formulário, de vidro. No celular, empilha.

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setErro(''); setCarregando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
    setCarregando(false)
    if (error) { setErro('E-mail ou senha inválidos.'); return }
    router.push('/dashboard')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, position: 'relative' }}>
      <div className="luz-de-fundo" aria-hidden="true" />
      <div style={{
        position: 'relative', zIndex: 1, width: '100%', maxWidth: 940, minHeight: 520,
        display: 'grid', gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, .95fr)',
        borderRadius: 'var(--r-lg)', overflow: 'hidden', border: '1px solid var(--glass-border)', boxShadow: 'var(--glass-shadow)',
      }} className="login-grade">
        {/* A ARTE */}
        <div style={{
          position: 'relative', overflow: 'hidden', color: '#fff', padding: '34px 34px 30px',
          background: 'radial-gradient(120% 90% at 20% 10%, #7c3aed 0%, #4c1d95 45%, #1a0b33 100%)',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 24,
        }}>
          <Circuito />
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', padding: '6px 0' }}>
            <Logo3D src="/logo.png" largura={250} inclinacao={[12, -20]} />
          </div>
          <div style={{ position: 'relative' }}>
            <h1 className="display" style={{ fontSize: 'clamp(28px, 3.6vw, 40px)', fontWeight: 800, lineHeight: 1, margin: 0, maxWidth: '13ch', textShadow: '0 2px 0 rgba(0,0,0,.25), 0 12px 30px rgba(0,0,0,.35)' }}>
              Vender, entregar e ensinar no mesmo lugar.
            </h1>
            <p style={{ color: 'rgba(255,255,255,.75)', fontSize: 13.5, maxWidth: '36ch', margin: '10px 0 0' }}>
              Leads, turmas, entregas e a IA que atende — tudo passa por aqui, todo dia.
            </p>
          </div>
        </div>

        {/* O FORMULÁRIO */}
        <form onSubmit={entrar} className="vidro" style={{ borderRadius: 0, border: 0, boxShadow: 'none', padding: 'clamp(26px, 4vw, 40px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14 }}>
          <div style={{ marginBottom: 6 }}>
            <h2 className="display relevo-titulo" style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>Entrar</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>Use o e-mail que o administrador cadastrou.</p>
          </div>
          <Campo rotulo="E-mail">
            <Campo.Input type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus autoComplete="email" placeholder="voce@empresa.com" style={{ background: 'var(--glass-field)' }} />
          </Campo>
          <Campo rotulo="Senha" erro={erro || undefined}>
            <Campo.Input type="password" value={senha} onChange={e => setSenha(e.target.value)} autoComplete="current-password" placeholder="••••••••••" style={{ background: 'var(--glass-field)' }} />
          </Campo>
          <Botao tom="principal" tamanho="lg" type="submit" disabled={carregando || !email || !senha} style={{ marginTop: 4 }}>
            {carregando ? 'Entrando...' : 'Entrar'}
          </Botao>
          <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>Esqueceu a senha? Peça pro administrador redefinir.</p>
        </form>
      </div>
      <style>{`@media (max-width: 760px) { .login-grade { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}

// O circuito: pontos que andam devagar e se ligam quando estão perto — o cérebro do logo, vivo.
// Canvas único, 34 pontos, ~60 linhas: barato. Com "reduzir movimento" no sistema, fica parado.
function Circuito() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current; if (!cv) return
    const ctx = cv.getContext('2d'); if (!ctx) return
    const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = 0, H = 0, raf = 0
    const pts = Array.from({ length: 34 }, () => ({ x: Math.random(), y: Math.random(), vx: (Math.random() - .5) * .0007, vy: (Math.random() - .5) * .0007 }))
    function tamanho() { const r = cv!.getBoundingClientRect(); W = cv!.width = r.width * dpr; H = cv!.height = r.height * dpr }
    function desenha() {
      ctx!.clearRect(0, 0, W, H)
      const alcance = W * .16
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]
        if (!reduzir) { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > 1) p.vx *= -1; if (p.y < 0 || p.y > 1) p.vy *= -1 }
        for (let j = i + 1; j < pts.length; j++) {
          const q = pts[j], dx = (p.x - q.x) * W, dy = (p.y - q.y) * H, d = Math.hypot(dx, dy)
          if (d < alcance) {
            ctx!.strokeStyle = `rgba(255,255,255,${(0.35 * (1 - d / alcance)).toFixed(3)})`; ctx!.lineWidth = dpr
            ctx!.beginPath(); ctx!.moveTo(p.x * W, p.y * H); ctx!.lineTo(q.x * W, q.y * H); ctx!.stroke()
          }
        }
        ctx!.fillStyle = 'rgba(255,255,255,.8)'; ctx!.beginPath(); ctx!.arc(p.x * W, p.y * H, 2.2 * dpr, 0, 7); ctx!.fill()
      }
      if (!reduzir) raf = requestAnimationFrame(desenha)
    }
    tamanho(); desenha()
    window.addEventListener('resize', tamanho)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', tamanho) }
  }, [])
  return <canvas ref={ref} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: .55 }} />
}
