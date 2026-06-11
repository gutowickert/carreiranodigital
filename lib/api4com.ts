const TOKEN = process.env.API4COM_TOKEN || ''
const BASE = 'https://api.api4com.com/api/v1'

// Dispara uma ligacao: toca no ramal do vendedor e conecta no telefone do lead
export async function fazerLigacao(extension: string, phone: string, metadata: any) {
  if (!TOKEN) return { ok: false, error: 'Falta API4COM_TOKEN' }
  if (!extension) return { ok: false, error: 'Ramal nao definido (API4COM_RAMAL_PADRAO)' }
  const fone = (phone || '').replace(/\D/g, '')
  if (!fone) return { ok: false, error: 'Telefone do lead invalido' }
  try {
    const res = await fetch(`${BASE}/dialer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': TOKEN },
      body: JSON.stringify({ extension, phone: fone, metadata }),
    })
    const json = await res.json()
    if (!res.ok) return { ok: false, error: JSON.stringify(json) }
    return { ok: true, id: json.id }
  } catch (e: any) {
    return { ok: false, error: (e && e.message) || 'falha na discagem' }
  }
}