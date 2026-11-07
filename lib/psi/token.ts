// Lê o "papel" gravado no login (app_metadata.papel) direto do token, sem ir ao banco.
// Usado pelo proxy.ts em toda chamada de /api: tem que ser rápido e não depender de nada.
// O token NÃO é conferido aqui (assinatura): isto só serve pra BLOQUEAR. Um token falso dizendo "psi"
// só consegue ser barrado; um token falso dizendo outra coisa segue pra rota, que confere o login como sempre.
export function papelDoToken(authorization?: string | null): string | null {
  try {
    if (!authorization || !authorization.startsWith('Bearer ')) return null
    const partes = authorization.slice(7).split('.')
    if (partes.length !== 3) return null
    const b64 = partes[1].replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4))
    const json = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))))
    const papel = json?.app_metadata?.papel
    return typeof papel === 'string' ? papel : null
  } catch { return null }
}
