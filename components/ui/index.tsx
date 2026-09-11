'use client'

import type { CSSProperties, ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import type { LucideIcon } from 'lucide-react'

// AS PEÇAS — a fundação visual (direção de 11/09/2026).
//
// Seis peças que toda tela usa: Card, Botao, Chip, Campo, CabecalhoPagina, CardNumero. Tela nova
// monta com elas; tela antiga migra aos poucos. O objetivo é parar de escrever card, botão e chip à
// mão (3.500 estilos inline hoje) — quando uma peça muda aqui, muda em todo lugar.
//
// Regras que estão embutidas e não precisam ser lembradas:
//   • cor só por token (var(--...)); nunca hex
//   • raios só da escala: --r-sm 6, --r 10, --r-lg 16, --r-pill
//   • ícone é Lucide, passado como componente (`icone={Flame}`), nunca emoji
//   • `vidro` só em peça PARADA na tela (menu, painéis, números, modais) — nunca em lista que rola

// ─── Card ──────────────────────────────────────────────────────────────────────
export function Card({ children, vidro, hover, pad = 20, style, className, ...rest }: {
  children: ReactNode; vidro?: boolean; hover?: boolean; pad?: number | string
  style?: CSSProperties; className?: string; onClick?: () => void
}) {
  return (
    <div {...rest} className={[vidro ? 'vidro' : 'card', hover ? 'card-hover' : '', className || ''].join(' ').trim()}
      style={{ padding: pad, ...style }}>
      {children}
    </div>
  )
}

// ─── Botão ─────────────────────────────────────────────────────────────────────
// `principal` é o único lugar com o gradiente do logo. `perigo` pra apagar/cancelar coisa séria.
type Tom = 'principal' | 'secundario' | 'fantasma' | 'perigo'
export function Botao({ tom = 'secundario', tamanho = 'md', icone: Icone, children, style, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & {
  tom?: Tom; tamanho?: 'sm' | 'md' | 'lg'; icone?: LucideIcon
}) {
  const pad = tamanho === 'sm' ? '6px 11px' : tamanho === 'lg' ? '12px 20px' : '9px 15px'
  const fs = tamanho === 'sm' ? 12.5 : tamanho === 'lg' ? 15 : 13.5
  const tons: Record<Tom, CSSProperties> = {
    principal: { background: 'var(--grad)', color: 'var(--on-accent)', border: '1px solid transparent' },
    secundario: { background: 'var(--surface)', color: 'var(--text-2)', border: '1px solid var(--border-strong)' },
    fantasma: { background: 'transparent', color: 'var(--text-muted)', border: '1px solid transparent' },
    perigo: { background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red)' },
  }
  return (
    // o principal afunda no clique (.btn-afunda, globals.css) — o único botão em relevo
    <button {...rest} className={[tom === 'principal' ? 'btn-afunda' : '', rest.className || ''].join(' ').trim() || undefined} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
      padding: pad, fontSize: fs, fontWeight: 700, borderRadius: 'var(--r)', lineHeight: 1.2, whiteSpace: 'nowrap',
      ...tons[tom], ...style,
    }}>
      {Icone && <Icone size={tamanho === 'sm' ? 14 : 16} strokeWidth={2.2} />}
      {children}
    </button>
  )
}

// ─── Chip ──────────────────────────────────────────────────────────────────────
// Cor pelo SIGNIFICADO: bom / atenção / ruim / info / marca. É o que substitui o emoji no card.
type TomChip = 'neutro' | 'marca' | 'bom' | 'atencao' | 'ruim' | 'info'
export function Chip({ tom = 'neutro', icone: Icone, children, pequeno, style, title }: {
  tom?: TomChip; icone?: LucideIcon; children: ReactNode; pequeno?: boolean; style?: CSSProperties; title?: string
}) {
  const tons: Record<TomChip, CSSProperties> = {
    neutro: { color: 'var(--text-muted)', background: 'var(--surface-2)' },
    marca: { color: 'var(--accent-soft)', background: 'var(--accent-bg)' },
    bom: { color: 'var(--green)', background: 'var(--green-bg)' },
    atencao: { color: 'var(--amber)', background: 'var(--amber-bg)' },
    ruim: { color: 'var(--red)', background: 'var(--red-bg)' },
    info: { color: 'var(--blue)', background: 'var(--blue-bg)' },
  }
  return (
    <span title={title} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 'var(--r-pill)', whiteSpace: 'nowrap',
      padding: pequeno ? '1px 7px 1px 6px' : '3px 9px 3px 8px', fontSize: pequeno ? 11 : 12, fontWeight: 700, lineHeight: 1.4,
      ...tons[tom], ...style,
    }}>
      {Icone && <Icone size={pequeno ? 11 : 13} strokeWidth={2.2} />}
      {children}
    </span>
  )
}

// ─── Campo ─────────────────────────────────────────────────────────────────────
// Rótulo + entrada. `Campo.Input`, `Campo.Select`, `Campo.Area` compartilham o mesmo visual.
const campoBase: CSSProperties = {
  width: '100%', background: 'var(--bg)', border: '1px solid var(--border-strong)', borderRadius: 'var(--r)',
  padding: '10px 12px', fontSize: 14, color: 'var(--text)', outline: 'none',
}
export function Campo({ rotulo, dica, erro, children, style }: { rotulo?: string; dica?: string; erro?: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <label style={{ display: 'grid', gap: 5, ...style }}>
      {rotulo && <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>{rotulo}</span>}
      {children}
      {erro ? <span style={{ fontSize: 12, color: 'var(--red)' }}>{erro}</span>
        : dica ? <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{dica}</span> : null}
    </label>
  )
}
Campo.Input = function Input({ style, ...rest }: InputHTMLAttributes<HTMLInputElement>) { return <input {...rest} style={{ ...campoBase, ...style }} /> }
Campo.Select = function Select({ style, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) { return <select {...rest} style={{ ...campoBase, ...style }} /> }
Campo.Area = function Area({ style, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...rest} style={{ ...campoBase, resize: 'vertical', minHeight: 80, ...style }} /> }

// ─── Cabeçalho de página ───────────────────────────────────────────────────────
// Título na fonte de gritar, linha de contexto embaixo, ações à direita. Um por tela, no topo.
export function CabecalhoPagina({ titulo, sub, acoes, filhos }: { titulo: ReactNode; sub?: ReactNode; acoes?: ReactNode; filhos?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
      <div style={{ minWidth: 0 }}>
        <h1 className="display relevo-titulo" style={{ fontSize: 28, fontWeight: 700, margin: 0, lineHeight: 1.05 }}>{titulo}</h1>
        {sub && <p style={{ margin: '5px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>{sub}</p>}
        {filhos}
      </div>
      {acoes && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{acoes}</div>}
    </div>
  )
}

// ─── Card de número ────────────────────────────────────────────────────────────
// Número grande e condensado, variação, linha dos últimos dias e uma linha de rodapé. Responde
// "estamos bem?" antes de a pessoa ler. `alerta` pinta a borda de vermelho: é o que precisa de ti.
// `destaque` = o número mais importante da tela: só ele recebe o relevo. Um por tela.
export function CardNumero({ rotulo, valor, prefixo, sufixo, delta, deltaBom, serie, rodape, alerta, vidro, cor, destaque }: {
  rotulo: ReactNode; valor: ReactNode; prefixo?: string; sufixo?: string
  delta?: ReactNode; deltaBom?: boolean | null
  serie?: number[]; rodape?: ReactNode; alerta?: boolean; vidro?: boolean; cor?: string; destaque?: boolean
}) {
  const linha = serie && serie.length > 1 ? caminho(serie, 200, 34) : null
  const corLinha = cor || 'var(--accent)'
  return (
    <Card vidro={vidro} pad="18px 18px 14px" style={{ display: 'grid', gap: 6, alignContent: 'start', overflow: 'hidden', ...(alerta ? { borderColor: 'var(--red)' } : {}) }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: alerta ? 'var(--red)' : 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span>{rotulo}</span>
        {delta != null && (
          <span style={{
            fontSize: 12, fontWeight: 700, padding: '2px 7px', borderRadius: 'var(--r-pill)',
            color: deltaBom == null ? 'var(--text-muted)' : deltaBom ? 'var(--green)' : 'var(--red)',
            background: deltaBom == null ? 'var(--surface-2)' : deltaBom ? 'var(--green-bg)' : 'var(--red-bg)',
          }}>{delta}</span>
        )}
      </div>
      <div className={'display tnum' + (destaque && !alerta ? ' relevo-numero' : '')} style={{ fontSize: destaque ? 38 : 34, fontWeight: destaque ? 800 : 700, lineHeight: 1, color: alerta ? 'var(--red)' : cor || 'var(--text)' }}>
        {prefixo && <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'Manrope', letterSpacing: 0, marginRight: 4 }}>{prefixo}</span>}
        {valor}
        {sufixo && <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'Manrope', letterSpacing: 0, marginLeft: 2 }}>{sufixo}</span>}
      </div>
      {linha ? (
        <svg viewBox="0 0 200 34" preserveAspectRatio="none" style={{ width: '100%', height: 34, display: 'block' }} aria-hidden="true">
          <path d={`${linha.d} L200,34 L0,34 Z`} fill={corLinha} opacity=".14" />
          <path d={linha.d} fill="none" stroke={corLinha} strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <circle cx={linha.fx} cy={linha.fy} r="3" fill={corLinha} />
        </svg>
      ) : <div style={{ height: serie === undefined ? 0 : 34 }} />}
      {rodape && <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>{rodape}</div>}
    </Card>
  )
}
// série → caminho SVG (com 3px de folga em cima e embaixo pra bolinha não cortar)
function caminho(s: number[], w: number, h: number) {
  const min = Math.min(...s), max = Math.max(...s), span = max - min || 1
  const pts = s.map((v, i) => [i * (w / (s.length - 1)), 3 + (1 - (v - min) / span) * (h - 6)] as const)
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const [fx, fy] = pts[pts.length - 1]
  return { d, fx, fy }
}

// ─── Estado vazio ──────────────────────────────────────────────────────────────
// Ícone, uma frase, e (se houver) o que fazer. No lugar de "Nenhum registro."
export function Vazio({ icone: Icone, titulo, texto, acao }: { icone?: LucideIcon; titulo: string; texto?: string; acao?: ReactNode }) {
  return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 8, padding: '36px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
      {Icone && <span style={{ width: 44, height: 44, borderRadius: 'var(--r)', background: 'var(--surface-2)', display: 'grid', placeItems: 'center', color: 'var(--text-faint)' }}><Icone size={22} strokeWidth={1.75} /></span>}
      <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-2)' }}>{titulo}</div>
      {texto && <div style={{ fontSize: 13, maxWidth: 40 + 'ch' }}>{texto}</div>}
      {acao && <div style={{ marginTop: 6 }}>{acao}</div>}
    </div>
  )
}
