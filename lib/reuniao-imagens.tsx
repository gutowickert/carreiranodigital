import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// A MARCA NAS IMAGENS DO CONVITE (capa do link e foto do convite). Satori: só flexbox, imagem só como
// data URL, e nada de texto vazio nem estilo `undefined` (quebra a renderização — visto em 29/09).

export async function fonteInstrument() {
  try {
    const css = await fetch('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@600;700', { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1' } }).then(r => r.text())
    const urls = [...css.matchAll(/font-weight:\s*(\d+);[^}]*?src:\s*url\(([^)]+\.ttf)\)/g)]
    return await Promise.all(urls.map(async ([, peso, url]) => ({ name: 'Instrument Sans', data: await fetch(url).then(r => r.arrayBuffer()), weight: Number(peso) as 600 | 700, style: 'normal' as const })))
  } catch { return [] }
}

// `arq` relativo a public/ (ex.: 'logo-menu.png', 'reuniao/cnd-marca.png')
export const imagemPublica = async (arq: string) => `data:image/png;base64,${(await readFile(join(process.cwd(), 'public', arq))).toString('base64')}`

export function diaDoConvite(iso?: string | null) {
  if (!iso) return ''
  const s = new Date(iso).toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
  // "quarta-feira, 30/09, 14:00" → "Quarta-feira, 30/09 às 14h"
  const m = s.match(/^([^,]+),\s*(\d{2}\/\d{2}),?\s*(\d{2}):(\d{2})/)
  if (!m) return s
  const txt = `${m[1]}, ${m[2]} às ${m[3]}h${m[4] !== '00' ? m[4] : ''}`
  return txt[0].toUpperCase() + txt.slice(1)
}
