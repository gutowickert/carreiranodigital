import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chamadaPorCodigo } from '@/lib/chamadas'

// A imagem da prévia do link da chamada (WhatsApp, Instagram, e-mail): marca da escola, quem convida
// e o que acontece ao clicar. Satori: só flexbox.
export const alt = 'Convite para uma conversa com a Carreira no Digital'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

async function manrope() {
  try {
    const css = await fetch('https://fonts.googleapis.com/css2?family=Manrope:wght@600;800', { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; rv:40.0) Gecko/20100101 Firefox/40.0' } }).then(r => r.text())
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
  const quem = (ch?.criado_por_nome || 'A escola').toString().split(' ')[0]
  const video = !!ch?.com_video
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '64px 72px', color: '#fff', fontFamily: 'Manrope',
        background: 'linear-gradient(140deg, #1a0733 0%, #2b0a55 42%, #4a12a0 78%, #7b2ae8 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {logo ? <img src={logo} height={78} style={{ height: 78 }} /> : <div style={{ fontSize: 34, fontWeight: 800 }}>Carreira no Digital</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 26, fontWeight: 600, background: 'rgba(255,255,255,.14)', borderRadius: 999, padding: '12px 26px' }}>
            <div style={{ width: 14, height: 14, borderRadius: 7, background: '#4ade80' }} />
            {video ? 'Chamada de vídeo' : 'Chamada de voz'}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>{quem} te convidou</div>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, color: '#e9d5ff' }}>pra uma conversa</div>
          <div style={{ fontSize: 32, fontWeight: 600, color: 'rgba(255,255,255,.8)', marginTop: 26 }}>Toque no link e clique em Entrar. Abre no navegador, sem instalar nada.</div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  )
}
