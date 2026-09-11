'use client'

import { useRef, type PointerEvent } from 'react'

// O LOGO EM 3D — um objeto com espessura, inclinado, mostrando a lateral (pedido do Nando, 11/09).
//
// COMO: várias cópias do logo empilhadas, cada uma 1px atrás da anterior e mais escura, dentro de
// um espaço com perspectiva. De frente é o logo; de ângulo, as cópias de trás viram a lateral.
// Atrás dele, a chapa (o tijolo de vidro grosso), colada nas costas — se ficar funda demais, a
// perspectiva desloca ela pro lado e o retângulo parece torto. Flutua devagar (animação `flutua`,
// globals.css), inclina acompanhando o mouse, e SEGURANDO (clicar e arrastar) gira bem mais;
// solta, volta sozinho.
//
// CUSTO: ~15 elementos parados. Sem desfoque, sem canvas. Não pesa em lugar nenhum.
//
// `src` é a imagem do logo (fundo transparente). Cliente sem imagem passa `texto` — o nome em
// relevo, mesmo efeito. Proporção padrão é a do logo da escola (2000×777).

export default function Logo3D({ src, texto, largura = 180, proporcao = 0.39, camadas = 10, passo = 1.1, inclinacao = [10, -18], chapa = true, flutua = true }: {
  src?: string; texto?: string; largura?: number; proporcao?: number
  camadas?: number; passo?: number; inclinacao?: [number, number]; chapa?: boolean; flutua?: boolean
}) {
  const obj = useRef<HTMLDivElement>(null)
  const arrasto = useRef<{ x: number; y: number; rx: number; ry: number } | null>(null)
  const altura = Math.round(largura * proporcao)
  const [rx, ry] = inclinacao
  const base = `rotateX(${rx}deg) rotateY(${ry}deg)`
  const pad = Math.round(largura * 0.09)
  const fundoLogo = camadas * passo

  function gira(x: number, y: number, suave: boolean) {
    const el = obj.current; if (!el) return
    el.style.transition = suave ? 'transform .35s ease' : 'transform .05s linear'
    el.style.transform = `rotateX(${x}deg) rotateY(${y}deg)`
  }
  function mover(e: PointerEvent<HTMLDivElement>) {
    if (arrasto.current) {
      // segurando: 1px de arrasto = 0,55° — meia volta cabe na largura do logo
      const a = arrasto.current
      gira(a.rx - (e.clientY - a.y) * 0.35, a.ry + (e.clientX - a.x) * 0.55, false)
      return
    }
    const r = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    gira(rx - y * 18, ry + x * 26, true)
  }
  function segurar(e: PointerEvent<HTMLDivElement>) {
    arrasto.current = { x: e.clientX, y: e.clientY, rx, ry }
    e.currentTarget.setPointerCapture(e.pointerId)
    e.currentTarget.style.cursor = 'grabbing'
  }
  function soltar(e: PointerEvent<HTMLDivElement>) {
    arrasto.current = null
    e.currentTarget.style.cursor = 'grab'
    gira(rx, ry, true)
  }
  function sair(e: PointerEvent<HTMLDivElement>) { if (!arrasto.current) soltar(e) }

  const camadaLogo = (i: number) => src
    ? <img key={'l' + i} src={src} alt={i === 0 ? 'Logo' : ''} aria-hidden={i !== 0} draggable={false} style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain',
        transform: `translateZ(${-i * passo}px)`,
        filter: i === 0 ? undefined : `brightness(${Math.max(0.28, 0.5 - i * 0.02)}) saturate(.7)`,
        userSelect: 'none', pointerEvents: 'none',
      }} />
    : <div key={'l' + i} aria-hidden={i !== 0} className="display" style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        fontSize: Math.round(altura * 0.42), fontWeight: 800, lineHeight: 1, textTransform: 'uppercase', letterSpacing: '-0.01em',
        color: i === 0 ? '#fff' : `hsl(268 60% ${Math.max(14, 32 - i * 2)}%)`,
        transform: `translateZ(${-i * passo}px)`, pointerEvents: 'none', userSelect: 'none', padding: '0 6px',
      }}>{texto}</div>

  return (
    <div onPointerMove={mover} onPointerDown={segurar} onPointerUp={soltar} onPointerCancel={soltar} onPointerLeave={sair}
      style={{ perspective: 700, perspectiveOrigin: '50% 50%', padding: pad + 4, display: 'inline-block', cursor: 'grab', touchAction: 'none' }}>
      <div ref={obj} className={flutua ? 'logo3d-obj' : undefined}
        style={{ position: 'relative', width: largura, height: altura, transformStyle: 'preserve-3d', transform: base, transition: 'transform .35s ease' }}>
        {/* a chapa: colada nas costas do logo (1px atrás da última cópia), com 5 camadas de espessura.
            A margem do lado que vem pra frente (direita, com rotateY negativo) é menor: a perspectiva
            aumenta esse lado, e com margens iguais a chapa parecia sobrar pra direita. */}
        {chapa && Array.from({ length: 5 }, (_, i) => (
          <div key={'c' + i} aria-hidden="true" className={i === 0 ? 'chapa' : undefined} style={{
            position: 'absolute', borderRadius: 14,
            top: -pad, bottom: -pad, left: -pad, right: -Math.round(pad * (ry < 0 ? 0.6 : 1)),
            background: i === 0 ? undefined : '#0b0517',
            transform: `translateZ(${-fundoLogo - 1 - i * 1.2}px)`,
            boxShadow: i === 0 ? undefined : 'none',
          }} />
        ))}
        {Array.from({ length: camadas }, (_, i) => camadaLogo(i))}
      </div>
    </div>
  )
}
