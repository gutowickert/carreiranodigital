import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chamadaPorCodigo } from '@/lib/chamadas'

// A imagem da prévia do link da chamada (WhatsApp, Instagram, e-mail): marca da escola, quem convida
// e o que acontece ao clicar. Satori: só flexbox.
export const alt = 'Convite para uma conversa com a Carreira no Digital'
// QUADRADA (29/09/2026): o WhatsApp encaixa a capa num quadradinho. Larga (1200×630), ela saía achatada
// ou cortada; quadrada, ele mostra inteira.
export const size = { width: 630, height: 630 }
export const contentType = 'image/png'

async function manrope() {
  try {
    const css = await fetch('https://fonts.googleapis.com/css2?family=Manrope:wght@600;800', { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1' } }).then(r => r.text())
    const urls = [...css.matchAll(/font-weight:\s*(\d+);[^}]*?src:\s*url\(([^)]+\.ttf)\)/g)]
    return await Promise.all(urls.map(async ([, peso, url]) => ({ name: 'Manrope', data: await fetch(url).then(r => r.arrayBuffer()), weight: Number(peso) as 600 | 800, style: 'normal' as const })))
  } catch { return [] }
}

export default async function Imagem({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params
  const [ch, logo, fonts] = await Promise.all([
    chamadaPorCodigo(codigo).catch(() => null),
    readFile(join(process.cwd(), 'public/logo.png')).then(b => `data:image/png;base64,${b.toString('base64')}`).catch(() => null),
    manrope(),
  ])
  const quem = ch?.criado_por_nome ? ch.criado_por_nome.toString().split(' ')[0] : 'A Carreira no Digital'
  const video = !!ch?.com_video
  // SÓ A MARCA, GRANDE (29/09/2026, terceira tentativa). O WhatsApp mostra a capa como um QUADRADINHO
  // de ~100px ao lado do texto. Com frase dentro da imagem, qualquer desenho vira borrão e parece
  // quebrado — larga (achatava), centralizada (ainda miúda), quadrada com texto (ilegível). O texto
  // ("Ricardo te convidou pra uma conversa") o WhatsApp já escreve ao lado, vindo do og:title.
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff',
        background: 'radial-gradient(circle at 50% 42%, #6a24d6 0%, #3a0f78 50%, #1a0733 100%)' }}>
        {logo ? <img src={logo} width={470} height={171} style={{ width: 470, height: 171 }} /> : <div style={{ fontSize: 64, fontWeight: 800 }}>Carreira no Digital</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 40, fontWeight: 700, background: 'rgba(255,255,255,.16)', borderRadius: 999, padding: '14px 34px', marginTop: 56 }}>
          <div style={{ width: 20, height: 20, borderRadius: 10, background: '#4ade80' }} />
          {video ? 'Chamada de vídeo' : 'Chamada de voz'}
        </div>
      </div>
    ),
    { ...size },
  )


}
