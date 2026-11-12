// Proxy de imagem das páginas da análise (/api/diagnostico/img): só CDNs do Instagram/Facebook e do Google.
export const SITE_PUBLICO = 'https://www.carreiranodigital.com'

export function hostDeImagemPermitido(u: URL): boolean {
  if (u.protocol !== 'https:') return false
  const h = u.hostname.toLowerCase()
  return h.endsWith('.cdninstagram.com') || h.endsWith('.fbcdn.net') || h.endsWith('.googleusercontent.com')
}

// URL pública do proxy pra uma imagem (null se não houver imagem ou o host não for permitido)
export function urlProxy(url: string | null | undefined): string | null {
  if (!url) return null
  try { if (!hostDeImagemPermitido(new URL(url))) return null } catch { return null }
  return `${SITE_PUBLICO}/api/diagnostico/img?u=${encodeURIComponent(url)}`
}
