import { ImageResponse } from 'next/og'
import { reuniaoPorCodigo } from '@/lib/reunioes'
import { fonteInstrument, imagemPublica, diaDoConvite } from '@/lib/reuniao-imagens'

// A FOTO DO CONVITE — vai pelo WhatsApp como FOTO, com o texto e o link na legenda (lição da chamada da
// escola, 29/09/2026): como "prévia do link", a miniatura é gerada pela Meta, pequena e comprimida, e
// chega pixelada qualquer que seja a nossa imagem. Como foto, chega em alta.
//
// Foto o WhatsApp mostra na LARGURA TODA da tela: por isso é larga (cartão) e grande (1600px, mais que
// a tela do celular). Com 630px ela chegava gigante e pixelada, esticada quase 2× no iPhone.
// O desenho é o aprovado pelo Nando na JamRock (logo, "fulano te convidou", o assunto, o dia e a
// assinatura discreta), com o logo e o roxo da escola.
const L = 1600, A = 840

export async function GET(_req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params
  const [r, fonts, logo, cnd] = await Promise.all([
    reuniaoPorCodigo(codigo).catch(() => null), fonteInstrument(),
    imagemPublica('logo-menu.png'), imagemPublica('reuniao/cnd-marca.png'),
  ])
  const quem = (r?.criado_por_nome || 'A Carreira no Digital').toString().split(' ')[0]
  const titulo = (r?.titulo || 'Reunião por vídeo').toString().slice(0, 80)
  const dia = diaDoConvite(r?.quando)
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '80px 96px', color: '#fff', fontFamily: 'Instrument Sans',
        backgroundColor: '#0f0c17', backgroundImage: 'radial-gradient(circle at 100% 0%, rgba(124,58,237,.55), rgba(15,12,23,0) 58%)' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {/* o logo da escola tem 520×189 */}
          <img src={logo} width={440} height={160} style={{ width: 440, height: 160 }} />
          <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto', fontSize: 34, fontWeight: 600, background: 'rgba(255,255,255,.1)', border: '2px solid rgba(255,255,255,.16)', borderRadius: 999, padding: '16px 34px' }}>
            <div style={{ width: 20, height: 20, borderRadius: 10, background: '#4ade80', marginRight: 16 }} />
            Reunião por vídeo
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 46, fontWeight: 600, color: '#c4b5fd' }}>{`${quem} te convidou pra uma reunião`}</div>
          <div style={{ fontSize: titulo.length > 34 ? 84 : 100, fontWeight: 700, lineHeight: 1.04, letterSpacing: -2, marginTop: 14 }}>{titulo}</div>
          <div style={{ fontSize: 40, fontWeight: 600, color: 'rgba(255,255,255,.74)', marginTop: 28 }}>{dia ? `${dia} · toque no link e entre, sem instalar nada` : 'Toque no link e entre. Sem instalar nada.'}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontSize: 27, fontWeight: 600, color: 'rgba(255,255,255,.45)' }}>
          <img src={cnd} width={36} height={36} style={{ width: 36, height: 36, borderRadius: 9, marginRight: 12 }} />
          <span>desenvolvido por</span><span style={{ fontWeight: 700, color: 'rgba(255,255,255,.62)', marginLeft: 9 }}>CarreiraNoDigital</span>
        </div>
      </div>
    ),
    { width: L, height: A, fonts: fonts.length ? fonts : undefined, headers: { 'Cache-Control': 'public, max-age=300' } },
  )
}
