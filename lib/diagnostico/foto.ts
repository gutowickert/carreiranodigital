// Logo embutido pras páginas da análise: os artefatos do claude.ai não carregam imagem de outro site,
// então a foto do perfil vai em base64 puro (sem o prefixo "data:"), 128x128, JPEG, alvo de até ~6 KB.
import { hostDeImagemPermitido } from './proxy'

const LADO = 128
const ALVO_BASE64 = 6_144 // caracteres do base64 (~4,5 KB de imagem)
const MAX_DOWNLOAD = 5_000_000
const MAX_SEM_SHARP = 12_000

// corte quadrado central, 128x128, JPEG qualidade ~70 (baixa um pouco a qualidade se passar do alvo).
// Sem o sharp disponível: devolve a imagem original só se tiver até 12 KB; senão null.
export async function miniaturaBase64(original: Buffer): Promise<string | null> {
  let sharp: any
  try { sharp = (await import('sharp')).default } catch { sharp = null }
  if (!sharp) return original.byteLength <= MAX_SEM_SHARP ? original.toString('base64') : null
  try {
    let saida: Buffer | null = null
    for (const quality of [70, 60, 50, 40]) {
      saida = await sharp(original, { failOn: 'none' })
        .rotate() // respeita a orientação da foto
        .resize(LADO, LADO, { fit: 'cover', position: 'centre' })
        .flatten({ background: '#ffffff' }) // logo com fundo transparente vira fundo branco
        .jpeg({ quality, mozjpeg: true })
        .toBuffer()
      if (Math.ceil(saida!.byteLength / 3) * 4 <= ALVO_BASE64) break
    }
    return saida ? saida.toString('base64') : null
  } catch { return null }
}

// baixa a foto (só das CDNs do Instagram/Facebook/Google) e devolve a miniatura; qualquer falha vira null
export async function fotoPerfilBase64(url: string | null | undefined): Promise<string | null> {
  if (!url) return null
  try {
    const u = new URL(url)
    if (!hostDeImagemPermitido(u)) return null
    const r = await fetch(u, { signal: AbortSignal.timeout(6_000), cache: 'no-store', redirect: 'error' })
    if (!r.ok) return null
    const dados = Buffer.from(await r.arrayBuffer())
    if (!dados.byteLength || dados.byteLength > MAX_DOWNLOAD) return null
    return await miniaturaBase64(dados)
  } catch { return null }
}
