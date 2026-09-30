'use client'

import { useEffect, useState } from 'react'
import Painel from './Painel'

// ÁREA DO CLIENTE = O PLACAR DO TRÁFEGO (29/09/2026, decisão do Guto: "apenas um placar do tráfego, bem
// completo"). Abre com o link que a escola manda (/cliente?k=…), sem login, em HOJE, e o cliente escolhe o
// período. Tudo que é entrega (meta, encontros, pendências, linha do tempo) saiu daqui: vive no sistema
// interno e no grupo do WhatsApp. O cliente também registra as vendas dele aqui, e elas entram no placar.

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: 18 }
const br = (d?: string | null) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '')

export default function AreaDoCliente() {
  const [k, setK] = useState('')
  const [d, setD] = useState<any>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    const chave = new URLSearchParams(window.location.search).get('k') || ''
    setK(chave)
    if (!chave) { setErro('Esse link está incompleto. Pede o link da tua área pra escola.'); return }
    fetch(`/api/cliente?k=${encodeURIComponent(chave)}`, { cache: 'no-store' }).then(r => r.json()).catch(() => null)
      .then(j => { if (j?.ok) { setD(j); document.title = `${j.projeto.cliente} · Placar do tráfego` } else setErro(j?.error || 'Não consegui abrir. Confere a internet e tenta de novo.') })
  }, [])

  if (erro) return <Moldura><div style={{ ...card, marginTop: 40, fontSize: 15, color: 'var(--text-2)' }}>{erro}</div></Moldura>
  if (!d) return <Moldura><div style={{ marginTop: 60, color: 'var(--text-faint)', fontSize: 14 }}>Abrindo o teu placar…</div></Moldura>

  const p = d.projeto
  return (
    <Moldura>
      <header style={{ marginTop: 22, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--accent-soft)' }}>Placar do tráfego</div>
          <h1 className="display" style={{ fontSize: 'clamp(28px,7vw,42px)', fontWeight: 800, color: 'var(--text)', margin: '4px 0 0', lineHeight: 1.05, textWrap: 'balance' as any }}>{p.cliente}</h1>
          <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 6 }}>{p.produto}{p.data_inicio ? ` · com a Carreira no Digital desde ${br(p.data_inicio)}` : ''}</div>
        </div>
        <img src="/logo.png" alt="Carreira no Digital" style={{ height: 26, marginTop: 6, flexShrink: 0, filter: 'drop-shadow(0 1px 0 rgba(0,0,0,.4))' }} />
      </header>

      {p.tem_conta_anuncio
        ? <div style={{ marginTop: 18 }}><Painel k={k} inicio={String(p.data_inicio || '').slice(0, 10)} nomeCliente={p.cliente} /></div>
        : <div style={{ ...card, marginTop: 18, fontSize: 14.5, color: 'var(--text-2)', lineHeight: 1.5 }}>A tua campanha ainda não está ligada ao placar. Assim que ela entrar no ar, os números aparecem aqui, ao vivo.</div>}

      <footer style={{ fontSize: 12, color: 'var(--text-faint)', margin: '34px 0 0', lineHeight: 1.6 }}>
        Carreira no Digital · Lajeado e Porto Alegre, RS. Dúvida sobre os números? Fala com a gente no grupo.
      </footer>
    </Moldura>
  )
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '8px 16px 70px' }}>{children}</div>
    </div>
  )
}
