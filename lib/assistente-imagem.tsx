import { ImageResponse } from 'next/og'

// OS CARDS DE IMAGEM DO ASSISTENTE. O WhatsApp aceita imagem, e imagem se lê de um golpe
// no celular, ao contrário de dez linhas de texto. O Next desenha no servidor (Satori):
// só flexbox, sem grid, cada texto dentro do próprio elemento.
//
//   imagemAgenda  → o bom dia: a agenda do dia e o que pede atenção
//   imagemTrafego → o monitor das entregas em um quadro: cada cliente com a cor e os números

const COR = { fundo: '#0B0A10', painel: '#15121F', borda: '#2A2540', texto: '#FFFFFF', texto2: '#C9C3D9', apagado: '#7E7793', roxo: '#6522D6', roxoClaro: '#C9AAFF', verde: '#22C55E', amarelo: '#F5B82E', vermelho: '#F0475F', cinza: '#6B6680' }
const NIVEL_COR: Record<string, string> = { verde: COR.verde, amarelo: COR.amarelo, vermelho: COR.vermelho, cinza: COR.cinza }

// Satori não lê woff2; o CSS do Google Fonts devolve TTF pra navegador antigo
let fontesCache: any[] | null = null
async function fontes(): Promise<any[]> {
  if (fontesCache) return fontesCache
  try {
    const css = await fetch('https://fonts.googleapis.com/css2?family=Manrope:wght@500;800', { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; rv:40.0) Gecko/20100101 Firefox/40.0' } }).then(r => r.text())
    const urls = [...css.matchAll(/font-weight:\s*(\d+);[^}]*?src:\s*url\(([^)]+\.ttf)\)/g)]
    const out: any[] = []
    for (const [, peso, url] of urls) out.push({ name: 'Manrope', data: await fetch(url).then(r => r.arrayBuffer()), weight: Number(peso), style: 'normal' })
    fontesCache = out
  } catch { fontesCache = [] }
  return fontesCache
}

async function png(el: any, width: number, height: number): Promise<Buffer> {
  const f = await fontes()
  const r = new ImageResponse(el, { width, height, fonts: f.length ? f : undefined })
  return Buffer.from(await r.arrayBuffer())
}

const base: any = { display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: COR.fundo, color: COR.texto, fontFamily: 'Manrope, sans-serif', padding: 64 }
const chapeu: any = { display: 'flex', fontSize: 24, fontWeight: 800, letterSpacing: 5, textTransform: 'uppercase', color: COR.roxoClaro }
const rodape = (t: string) => <div style={{ display: 'flex', marginTop: 'auto', paddingTop: 24, fontSize: 22, color: COR.apagado }}>{t}</div>

// ═══════════════════════════════════════════════════════════ a agenda
export async function imagemAgenda(x: { nome: string; data: string; itens: { hora: string; titulo: string; detalhe?: string }[]; atencao: string[] }): Promise<Buffer> {
  const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
  const d = new Date(x.data + 'T12:00:00-03:00')
  const itens = x.itens.slice(0, 7)
  return png(
    <div style={base}>
      <div style={chapeu}>Bom dia, {x.nome}</div>
      <div style={{ display: 'flex', fontSize: 64, fontWeight: 800, marginTop: 10, letterSpacing: -2 }}>{DIAS[d.getDay()]}, {x.data.slice(8, 10)}/{x.data.slice(5, 7)}</div>

      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 44, gap: 14 }}>
        {itens.length === 0 && <div style={{ display: 'flex', fontSize: 34, color: COR.texto2 }}>Agenda livre hoje.</div>}
        {itens.map((i, k) => (
          <div key={k} style={{ display: 'flex', alignItems: 'flex-start', gap: 26, background: COR.painel, border: `1px solid ${COR.borda}`, borderRadius: 18, padding: '22px 26px' }}>
            <div style={{ display: 'flex', fontSize: 34, fontWeight: 800, color: COR.roxoClaro, width: 150, flexShrink: 0 }}>{i.hora}</div>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <div style={{ display: 'flex', fontSize: 32, fontWeight: 800, lineHeight: 1.2 }}>{i.titulo.slice(0, 60)}</div>
              {i.detalhe && <div style={{ display: 'flex', fontSize: 24, color: COR.apagado, marginTop: 6 }}>{i.detalhe.slice(0, 70)}</div>}
            </div>
          </div>
        ))}
        {x.itens.length > 7 && <div style={{ display: 'flex', fontSize: 24, color: COR.apagado }}>e mais {x.itens.length - 7}</div>}
      </div>

      {x.atencao.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 40, gap: 10 }}>
          <div style={{ ...chapeu, color: COR.amarelo, fontSize: 20 }}>Atenção</div>
          {x.atencao.slice(0, 4).map((a, k) => (
            <div key={k} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ display: 'flex', width: 12, height: 12, borderRadius: 6, background: COR.amarelo, marginTop: 12, flexShrink: 0 }} />
              <div style={{ display: 'flex', fontSize: 26, color: COR.texto2, lineHeight: 1.35 }}>{a.slice(0, 90)}</div>
            </div>
          ))}
        </div>
      )}
      {rodape('Carreira no Digital · me manda o que precisar por aqui, texto ou áudio')}
    </div>, 1080, 1080)
}

// ═══════════════════════════════════════════════════════════ o tráfego
type Linha = { cliente: string; nivel: string; fase: string | null; resultados: number; custo: number | null; gasto: number; delta: number | null; tipo: string; puxando: string | null; parado: boolean }
export async function imagemTrafego(x: { dias: number; de: string; ate: string; resumo: { resultados: number; custo: number | null; gasto: number; resultadosAnt: number }; linhas: Linha[]; atencao: { nivel: string; texto: string }[]; contatar: string[] }): Promise<Buffer> {
  const brl = (v: number, c = 2) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })
  const max = Math.max(1, ...x.linhas.map(l => l.resultados))
  const linhas = x.linhas.slice(0, 8)
  const delta = x.resumo.resultadosAnt ? Math.round(((x.resumo.resultados - x.resumo.resultadosAnt) / x.resumo.resultadosAnt) * 100) : null
  return png(
    <div style={base}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={chapeu}>Tráfego dos clientes</div>
          <div style={{ display: 'flex', fontSize: 56, fontWeight: 800, marginTop: 8, letterSpacing: -2 }}>Últimos {x.dias} dias</div>
        </div>
        <div style={{ display: 'flex', fontSize: 22, color: COR.apagado }}>{x.de.slice(8, 10)}/{x.de.slice(5, 7)} a {x.ate.slice(8, 10)}/{x.ate.slice(5, 7)}</div>
      </div>

      <div style={{ display: 'flex', gap: 14, marginTop: 34 }}>
        {[
          { v: String(x.resumo.resultados), l: 'conversas' + (delta != null ? ` (${delta >= 0 ? '+' : ''}${delta}%)` : ''), cor: delta == null ? COR.texto : delta >= 0 ? COR.verde : COR.vermelho },
          { v: x.resumo.custo != null ? brl(x.resumo.custo) : '—', l: 'custo médio', cor: COR.texto },
          { v: brl(x.resumo.gasto, 0), l: 'investido', cor: COR.texto },
        ].map((b, k) => (
          <div key={k} style={{ display: 'flex', flexDirection: 'column', flex: 1, background: COR.painel, border: `1px solid ${COR.borda}`, borderRadius: 18, padding: '20px 24px' }}>
            <div style={{ display: 'flex', fontSize: 44, fontWeight: 800, color: b.cor }}>{b.v}</div>
            <div style={{ display: 'flex', fontSize: 22, color: COR.apagado, marginTop: 4 }}>{b.l}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 30, gap: 10 }}>
        {linhas.map((l, k) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 18, background: COR.painel, borderRadius: 14, padding: '14px 18px 14px 0', borderLeft: `8px solid ${NIVEL_COR[l.nivel] || COR.cinza}` }}>
            <div style={{ display: 'flex', flexDirection: 'column', width: 330, paddingLeft: 18 }}>
              <div style={{ display: 'flex', fontSize: 27, fontWeight: 800 }}>{l.cliente.slice(0, 22)}</div>
              <div style={{ display: 'flex', fontSize: 19, color: COR.apagado, marginTop: 2 }}>{l.parado ? 'tudo pausado' : l.puxando ? `puxa: ${l.puxando.slice(0, 22)}` : (l.fase || '')}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 8 }}>
              <div style={{ display: 'flex', height: 14, width: '100%', background: '#221D33', borderRadius: 7 }}>
                <div style={{ display: 'flex', height: 14, width: `${Math.max(2, Math.round((l.resultados / max) * 100))}%`, background: NIVEL_COR[l.nivel] || COR.cinza, borderRadius: 7 }} />
              </div>
              <div style={{ display: 'flex', fontSize: 20, color: COR.texto2 }}>{brl(l.gasto, 0)} investidos{l.delta != null ? ` · ${l.delta >= 0 ? '+' : ''}${l.delta}% vs anterior` : ''}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', width: 190 }}>
              <div style={{ display: 'flex', fontSize: 36, fontWeight: 800 }}>{l.resultados}</div>
              <div style={{ display: 'flex', fontSize: 20, color: COR.apagado }}>{l.custo != null ? brl(l.custo) + ' cada' : l.tipo}</div>
            </div>
          </div>
        ))}
      </div>

      {x.atencao.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 28, gap: 8 }}>
          <div style={{ ...chapeu, fontSize: 20, color: COR.amarelo }}>Atenção</div>
          {x.atencao.slice(0, 5).map((a, k) => (
            <div key={k} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ display: 'flex', width: 12, height: 12, borderRadius: 6, background: a.nivel === 'vermelho' ? COR.vermelho : COR.amarelo, marginTop: 10, flexShrink: 0 }} />
              <div style={{ display: 'flex', fontSize: 24, color: COR.texto2, lineHeight: 1.3 }}>{a.texto.slice(0, 95)}</div>
            </div>
          ))}
        </div>
      )}
      {rodape(x.contatar.length ? `Contatar hoje: ${x.contatar.join(', ')}` : 'Ninguém pra contatar hoje')}
    </div>, 1080, 1350)
}
