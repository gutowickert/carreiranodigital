import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chamadaPorCodigo } from '@/lib/chamadas'

// A FOTO DO CONVITE DA CHAMADA — vai pelo WhatsApp como FOTO, com o texto e o link na legenda.
// Não é a capa do link (opengraph-image, quadrada e simples, pra miniatura): foto o WhatsApp mostra na
// LARGURA TODA da tela. Por isso é larga (cartão, meia altura) e grande (1600px, maior que a tela do
// celular): com 630px ela chegava gigante e pixelada, esticada quase 2× no iPhone (29/09/2026).
const L = 1600, A = 840

async function manrope() {
  try {
    const css = await fetch('https://fonts.googleapis.com/css2?family=Manrope:wght@600;800', { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1' } }).then(r => r.text())
    const urls = [...css.matchAll(/font-weight:\s*(\d+);[^}]*?src:\s*url\(([^)]+\.ttf)\)/g)]
    return await Promise.all(urls.map(async ([, peso, url]) => ({ name: 'Manrope', data: await fetch(url).then(r => r.arrayBuffer()), weight: Number(peso) as 600 | 800, style: 'normal' as const })))
  } catch { return [] }
}

export async function GET(_req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params
  const [ch, logo, fonts] = await Promise.all([
    chamadaPorCodigo(codigo).catch(() => null),
    readFile(join(process.cwd(), 'public/logo.png')).then(b => `data:image/png;base64,${b.toString('base64')}`).catch(() => null),
    manrope(),
  ])
  const quem = ch?.criado_por_nome ? ch.criado_por_nome.toString().split(' ')[0] : 'A Carreira no Digital'
  const video = !!ch?.com_video
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '88px 104px', color: '#fff', fontFamily: 'Manrope',
        background: 'linear-gradient(135deg, #1a0733 0%, #2b0a55 40%, #4a12a0 78%, #7b2ae8 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {logo ? <img src={logo} width={330} height={120} style={{ width: 330, height: 120 }} /> : <div style={{ fontSize: 52, fontWeight: 800 }}>Carreira no Digital</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 36, fontWeight: 600, background: 'rgba(255,255,255,.14)', borderRadius: 999, padding: '16px 34px' }}>
            <div style={{ width: 18, height: 18, borderRadius: 9, background: '#4ade80' }} />
            {video ? 'Chamada de vídeo' : 'Chamada de voz'}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 104, fontWeight: 800, lineHeight: 1.04, letterSpacing: -3 }}>{`${quem} te convidou`}</div>
          <div style={{ fontSize: 104, fontWeight: 800, lineHeight: 1.04, letterSpacing: -3, color: '#e9d5ff' }}>pra uma conversa</div>
          <div style={{ fontSize: 40, fontWeight: 600, color: 'rgba(255,255,255,.82)', marginTop: 34 }}>Toque no link abaixo e depois em Entrar. Sem instalar nada.</div>
        </div>
      </div>
    ),
    { width: L, height: A, fonts: fonts.length ? fonts : undefined, headers: { 'Cache-Control': 'public, max-age=300' } },
  )
}
