// Rastro (16/10): o rastreador próprio do Guto, no lugar da Utmify. Venda da Kiwify (webhook) + gasto da Meta por anúncio.
// Tabelas rastro_projetos e rastro_vendas no Supabase da escola (RLS ligado: só a chave de serviço, aqui no servidor).
// O padrão de link da Utmify já está nos anúncios: utm_campaign = "nome|id", utm_medium = "conjunto|id", utm_content = "anúncio|id".
import crypto from 'node:crypto'

const U = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string
const K = () => process.env.SUPABASE_SERVICE_ROLE_KEY as string
async function req(caminho: string, opts: any = {}): Promise<any> {
  const r = await fetch(U() + caminho, { ...opts, headers: { apikey: K(), Authorization: 'Bearer ' + K(), 'Content-Type': 'application/json', ...(opts.headers || {}) }, cache: 'no-store' })
  const t = await r.text()
  if (!r.ok) throw new Error(`banco ${r.status}: ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}
export const rastroDb = {
  projetos: (): Promise<any[]> => req('/rest/v1/rastro_projetos?ativo=eq.true&order=nome.asc'),
  projetoPorToken: async (token: string) => ((await req(`/rest/v1/rastro_projetos?token=eq.${encodeURIComponent(token)}&ativo=eq.true&limit=1`)) || [])[0] || null,
  projetoPorSlug: async (slug: string) => ((await req(`/rest/v1/rastro_projetos?slug=eq.${encodeURIComponent(slug)}&limit=1`)) || [])[0] || null,
  vendaAtual: async (projeto: string, plataforma: string, pedido: string) => ((await req(`/rest/v1/rastro_vendas?projeto_id=eq.${projeto}&plataforma=eq.${plataforma}&pedido=eq.${encodeURIComponent(pedido)}&limit=1`)) || [])[0] || null,
  // grava ou atualiza a venda (o mesmo pedido volta como reembolso ou chargeback)
  salvaVenda: (v: any) => req('/rest/v1/rastro_vendas?on_conflict=projeto_id,plataforma,pedido', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(v) }),
  vendas: (projeto: string, de: string, ate: string): Promise<any[]> =>
    req(`/rest/v1/rastro_vendas?projeto_id=eq.${projeto}&aprovado_em=gte.${encodeURIComponent(de)}&aprovado_em=lt.${encodeURIComponent(ate)}&select=id,pedido,status,evento,produto,valor_bruto,valor_liquido,metodo,utm_source,utm_campaign,utm_medium,utm_content,utm_term,src,campanha_id,conjunto_id,anuncio_id,aprovado_em,atualizado_em&order=aprovado_em.desc&limit=5000`),
  ultima: async (projeto: string) => ((await req(`/rest/v1/rastro_vendas?projeto_id=eq.${projeto}&select=atualizado_em,evento,status&order=atualizado_em.desc&limit=1`)) || [])[0] || null,
}

// "Nome do anúncio|120211..." → { nome, id }
export function separa(v: any) {
  const s = String(v || '').trim()
  const m = s.match(/^(.*)\|(\d{6,})\s*$/)
  return m ? { nome: m[1].trim(), id: m[2] } : { nome: s, id: /^\d{10,}$/.test(s) ? s : '' }
}

// valor da Kiwify: número inteiro = centavos (o padrão dos webhooks); texto com vírgula ou ponto = reais
function valor(v: any): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isInteger(v) ? v / 100 : v
  const s = String(v).trim()
  if (/^\d+$/.test(s)) return +s / 100
  const n = parseFloat(s.replace(/\./g, '').replace(',', '.'))
  return isFinite(n) ? n : null
}

const STATUS: Record<string, string> = {
  paid: 'aprovada', approved: 'aprovada', order_approved: 'aprovada', compra_aprovada: 'aprovada', subscription_renewed: 'aprovada',
  refunded: 'reembolsada', order_refunded: 'reembolsada', compra_reembolsada: 'reembolsada',
  chargedback: 'chargeback', chargeback: 'chargeback',
  waiting_payment: 'pendente', pix_created: 'pendente', pix_gerado: 'pendente', billet_created: 'pendente', boleto_gerado: 'pendente',
  refused: 'recusada', order_rejected: 'recusada', compra_recusada: 'recusada', carrinho_abandonado: 'abandonado', abandoned_cart: 'abandonado',
  subscription_canceled: 'assinatura_cancelada', subscription_late: 'assinatura_atrasada',
}

// lê o que a Kiwify manda (o formato do webhook clássico e o da API nova) e devolve a linha de rastro_vendas
export function lerKiwify(b: any, projetoId: string) {
  const ev = String(b.webhook_event_type || b.event || b.trigger || b.type || '').toLowerCase()
  const st = String(b.order_status || b.status || '').toLowerCase()
  const status = STATUS[ev] || STATUS[st] || (st || ev || 'outro')
  const t = b.TrackingParameters || b.tracking || b.tracking_parameters || {}
  const prod = b.Product || b.product || {}
  const cli = b.Customer || b.customer || {}
  const com = b.Commissions || b.commissions || {}
  const pag = b.payment || {}
  const camp = separa(t.utm_campaign), conj = separa(t.utm_medium), an = separa(t.utm_content)
  const termo = separa(t.utm_term)
  const email = String(cli.email || '').trim().toLowerCase()
  return {
    projeto_id: projetoId, plataforma: 'kiwify',
    pedido: String(b.order_id || b.id || b.order_ref || b.sale_id || ''),
    status, evento: ev || st || null,
    produto: prod.product_name || prod.name || null, produto_id: String(prod.product_id || prod.id || '') || null,
    valor_bruto: valor(com.charge_amount ?? com.product_base_price ?? b.charge_amount ?? pag.charge_amount ?? b.amount),
    valor_liquido: valor(com.my_commission ?? b.net_amount ?? pag.net_amount),
    metodo: b.payment_method || pag.method || null,
    cliente_hash: email ? crypto.createHash('sha256').update(email).digest('hex') : null,
    utm_source: t.utm_source || null, utm_medium: t.utm_medium || null, utm_campaign: t.utm_campaign || null, utm_content: t.utm_content || null, utm_term: t.utm_term || null,
    src: t.src || null, sck: t.sck || null,
    campanha_id: camp.id || null, conjunto_id: conj.id || null, anuncio_id: an.id || termo.id || null,
    aprovado_em: b.approved_date || b.created_at || new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
    bruto: b,
  }
}

// aviso no celular (o mesmo canal ntfy do Recado e do Oito), com o prefixo "Rastro ·"
export async function avisa(titulo: string, texto: string) {
  const topico = process.env.RECADO_NTFY_TOPICO
  if (!topico) return
  await fetch('https://ntfy.sh/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: topico, title: 'Rastro · ' + titulo, message: texto, tags: ['moneybag'], priority: 4 }) }).catch(() => null)
}

export const senhaRastro = (s: string | null) => !!s && !!process.env.RASTRO_SENHA && s.trim() === process.env.RASTRO_SENHA.trim().replace(/^"|"$/g, '')
