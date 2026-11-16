// Biblioteca de Anúncios da Meta pelo servidor (Graph API, ads_archive), pro raio-x do lançamento da Maia.
// ATENÇÃO: pela API, a Meta só abre anúncio comum (não político) entregue na União Europeia/Reino Unido. Pra anúncio do
// Brasil a busca costuma voltar VAZIA mesmo quando a empresa anuncia. Por isso:
//   - achou anúncio da página da empresa: vale (fonte "api")
//   - não achou: NUNCA quer dizer "não tem anúncio" (quem confirma é a equipe, na Biblioteca, pela tela do lançamento)
// Token: META_ADLIB_TOKEN (de quem tem o acesso à API da Biblioteca liberado na Meta) ou, na falta, FB_ADS_TOKEN.
// O ad_snapshot_url traz o token no link: nunca é guardado nem mostrado. O link guardado é o público (?id=).
const GRAPH = 'https://graph.facebook.com/v21.0'
const sem = (s: any) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '')

export type AnuncioLido = {
  id: string; link: string; desde: string | null; formato: 'imagem' | 'video' | 'carrossel' | null
  leva: 'whatsapp' | 'instagram' | 'messenger' | 'site' | null; texto: string; plataformas: string[]
  fala_publico?: boolean | null; mostra_preco?: boolean | null; valor_antes?: boolean | null; foto_real?: boolean | null; imagem_path?: string | null
}

export function levaPra(caption: any, titulo?: any): AnuncioLido['leva'] {
  const s = String(caption || '') + ' ' + String(titulo || '')
  if (/wa\.me|whatsapp/i.test(s)) return 'whatsapp'
  if (/m\.me|messenger/i.test(s)) return 'messenger'
  if (/instagram\.com/i.test(s)) return 'instagram'
  if (/[a-z0-9-]+\.[a-z]{2,}/i.test(String(caption || ''))) return 'site'
  return null
}
export const linkPublico = (id: string) => `https://www.facebook.com/ads/library/?id=${encodeURIComponent(id)}`

// a página do anúncio é a da empresa? (nome ou @ dentro do nome da página, sem acento e sem espaço)
export function paginaBate(pagina: any, nome: string, usuario: string | null) {
  const p = sem(pagina)
  if (!p) return false
  const n = sem(nome), u = sem(usuario)
  return (n.length >= 4 && (p.includes(n) || n.includes(p))) || (u.length >= 4 && (p.includes(u) || u.includes(p)))
}

export async function anunciosBiblioteca(nome: string, usuario: string | null): Promise<{ ok: boolean; erro?: string; achou?: boolean; pagina?: string; total?: number; anuncios?: AnuncioLido[] }> {
  const token = process.env.META_ADLIB_TOKEN || process.env.FB_ADS_TOKEN
  if (!token) return { ok: false, erro: 'sem token da Biblioteca de Anúncios (META_ADLIB_TOKEN)' }
  const campos = 'id,page_id,page_name,ad_creative_bodies,ad_creative_link_captions,ad_creative_link_titles,ad_delivery_start_time,publisher_platforms'
  for (const termo of [nome, usuario].filter(Boolean) as string[]) {
    const q = new URLSearchParams({ search_terms: termo, ad_reached_countries: '["BR"]', ad_type: 'ALL', ad_active_status: 'ACTIVE', limit: '50', fields: campos, access_token: token })
    let j: any
    try {
      const r = await fetch(`${GRAPH}/ads_archive?${q}`, { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
      j = await r.json().catch(() => null)
    } catch (e: any) { return { ok: false, erro: 'a Biblioteca não respondeu: ' + String(e?.message || e).slice(0, 120) } }
    if (!j || j.error) return { ok: false, erro: String(j?.error?.message || 'erro da Biblioteca').replace(/access_token=[^&\s]+/g, '').slice(0, 200) }
    const meus = (j.data || []).filter((a: any) => paginaBate(a.page_name, nome, usuario))
    if (meus.length) {
      return {
        ok: true, achou: true, pagina: meus[0].page_name, total: meus.length,
        anuncios: meus.slice(0, 3).map((a: any): AnuncioLido => ({
          id: String(a.id), link: linkPublico(String(a.id)), desde: a.ad_delivery_start_time ? String(a.ad_delivery_start_time).slice(0, 10) : null,
          formato: null, leva: levaPra(a.ad_creative_link_captions?.[0], a.ad_creative_link_titles?.[0]),
          texto: String(a.ad_creative_bodies?.[0] || '').slice(0, 400), plataformas: (a.publisher_platforms || []).map((x: string) => String(x).toLowerCase()),
        })),
      }
    }
  }
  return { ok: true, achou: false }
}
