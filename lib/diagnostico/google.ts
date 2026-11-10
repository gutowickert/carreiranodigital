// Ficha da empresa no Google (Places API New) pro diagnóstico (conector MCP).
// Usa GOOGLE_API_KEY. Devolve até 3 candidatos pra o modelo confirmar qual é a empresa certa,
// com 1 foto de cada (URL pública do Google + versão pelo nosso proxy de imagem).
import { urlProxy } from './proxy'

const CAMPOS = [
  'places.displayName', 'places.formattedAddress', 'places.rating', 'places.userRatingCount', 'places.websiteUri',
  'places.nationalPhoneNumber', 'places.regularOpeningHours.weekdayDescriptions', 'places.googleMapsUri',
  'places.businessStatus', 'places.reviews', 'places.photos',
].join(',')

const STATUS: Record<string, string> = {
  OPERATIONAL: 'funcionando', CLOSED_TEMPORARILY: 'fechada temporariamente', CLOSED_PERMANENTLY: 'fechada de vez',
}

// 1 foto por candidato: pede ao endpoint de mídia só a URL pública (skipHttpRedirect), sem expor a chave
async function primeiraFoto(p: any, chave: string): Promise<string | null> {
  const nome = p?.photos?.[0]?.name
  if (typeof nome !== 'string' || !/^places\/[^/]+\/photos\/[^/]+$/.test(nome)) return null
  try {
    const r = await fetch(`https://places.googleapis.com/v1/${nome}/media?maxWidthPx=800&skipHttpRedirect=true`, {
      headers: { 'X-Goog-Api-Key': chave }, signal: AbortSignal.timeout(8_000), cache: 'no-store',
    })
    const j: any = await r.json().catch(() => null)
    return typeof j?.photoUri === 'string' ? j.photoUri : null
  } catch { return null }
}

export async function empresaGoogle(nome: string, cidade: string) {
  const chave = process.env.GOOGLE_API_KEY
  if (!chave) return { ok: false, erro: 'falta a chave do Google (GOOGLE_API_KEY) no servidor' }
  const textQuery = `${String(nome || '').trim()} ${String(cidade || '').trim()}`.trim()
  if (!String(nome || '').trim()) return { ok: false, erro: 'informe o nome da empresa' }
  let j: any
  try {
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': chave, 'X-Goog-FieldMask': CAMPOS },
      body: JSON.stringify({ textQuery, languageCode: 'pt-BR', regionCode: 'BR', maxResultCount: 3 }),
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    })
    j = await r.json().catch(() => null)
    if (!r.ok || j?.error) return { ok: false, erro: `Google Places respondeu erro: ${String(j?.error?.message || 'HTTP ' + r.status).slice(0, 300)}` }
  } catch (e: any) {
    return { ok: false, erro: 'Google Places não respondeu: ' + String(e?.message || e).slice(0, 150) }
  }
  const lugares: any[] = j?.places || []
  const fotos = await Promise.all(lugares.map(p => primeiraFoto(p, chave)))
  const candidatos = lugares.map((p: any, i: number) => ({
    nome: p.displayName?.text ?? null,
    endereco: p.formattedAddress ?? null,
    situacao: STATUS[p.businessStatus] || p.businessStatus || null,
    nota: p.rating ?? null,
    total_avaliacoes: p.userRatingCount ?? 0,
    site: p.websiteUri ?? null,
    telefone: p.nationalPhoneNumber ?? null,
    horarios: p.regularOpeningHours?.weekdayDescriptions ?? null,
    link_maps: p.googleMapsUri ?? null,
    foto: fotos[i],
    foto_proxy: urlProxy(fotos[i]),
    avaliacoes_recentes: (p.reviews || []).map((a: any) => ({
      autor: String(a.authorAttribution?.displayName || '').trim().split(/\s+/)[0] || null,
      nota: a.rating ?? null,
      quando: a.relativePublishTimeDescription ?? null,
      texto: String(a.text?.text || a.originalText?.text || '').slice(0, 300),
    })),
  }))
  return {
    ok: true,
    busca: textQuery,
    total_candidatos: candidatos.length,
    candidatos,
    observacao: 'Confirme qual candidato é a empresa certa (endereço/cidade). O Google mostra no máximo 5 avaliações por empresa, e a API não diz se a empresa respondeu às avaliações.',
  }
}
