const TOKEN = process.env.FB_ADS_TOKEN || ''
const ACCOUNT = process.env.FB_AD_ACCOUNT_ID || ''
const GRAPH = 'https://graph.facebook.com/v25.0'

export type AdRow = {
  campaign: string
  adset: string
  ad: string
  spend: number
  impressions: number
  clicks: number
}

export type SpendResult = {
  ok: boolean
  total: number
  campaigns: { name: string; spend: number }[]
  ads: AdRow[]
  error?: string
}

// Puxa o gasto real do Meta no período, NÍVEL ANÚNCIO (campanha/conjunto/anúncio).
// Deriva também o agregado por campanha (compatível com quem só usa .campaigns).
export async function getSpend(since: string, until: string): Promise<SpendResult> {
  if (!TOKEN || !ACCOUNT) {
    return { ok: false, total: 0, campaigns: [], ads: [], error: 'Faltam FB_ADS_TOKEN/FB_AD_ACCOUNT_ID' }
  }
  const acct = ACCOUNT.startsWith('act_') ? ACCOUNT : 'act_' + ACCOUNT
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }))
  const fields = 'campaign_name,adset_name,ad_name,spend,impressions,clicks'
  const url = `${GRAPH}/${acct}/insights?level=ad&fields=${fields}&time_range=${timeRange}&limit=1000&access_token=${encodeURIComponent(TOKEN)}`

  try {
    const res = await fetch(url)
    const json = await res.json()
    if (!res.ok) {
      return { ok: false, total: 0, campaigns: [], ads: [], error: JSON.stringify((json && json.error) || json) }
    }
    const rows = (json && json.data) || []
    const ads: AdRow[] = rows.map((r: any) => ({
      campaign: r.campaign_name || '(sem campanha)',
      adset: r.adset_name || '(sem conjunto)',
      ad: r.ad_name || '(sem anúncio)',
      spend: parseFloat(r.spend || '0'),
      impressions: parseInt(r.impressions || '0', 10),
      clicks: parseInt(r.clicks || '0', 10),
    }))

    // Agrega por campanha (mantém compatibilidade com a página Desempenho).
    const campMap: Record<string, number> = {}
    ads.forEach(a => { campMap[a.campaign] = (campMap[a.campaign] || 0) + a.spend })
    const campaigns = Object.entries(campMap).map(([name, spend]) => ({ name, spend }))

    const total = ads.reduce((s, a) => s + (a.spend || 0), 0)
    return { ok: true, total, campaigns, ads }
  } catch (e: any) {
    return { ok: false, total: 0, campaigns: [], ads: [], error: (e && e.message) || 'fetch falhou' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Conta de anúncio de CLIENTE (projetos em entrega). Mesmo token da escola: a
// conta precisa estar no BM da escola E atribuída ao usuário do sistema dono do
// token — só estar no BM não basta.
// Traz o que importa pra campanha de WhatsApp: conversas iniciadas e o custo delas.

export type InsightsConta = {
  ok: boolean
  error?: string
  conta?: { nome: string; moeda: string; status: number }
  total: { gasto: number; impressoes: number; cliques: number; conversas: number; leads: number; custoConversa: number | null }
  porDia: { data: string; gasto: number; conversas: number }[]
}

const CONVERSA = ['onsite_conversion.messaging_conversation_started_7d', 'onsite_conversion.total_messaging_connection']

function somaAcao(actions: any[] | undefined, tipos: string[]) {
  if (!Array.isArray(actions)) return 0
  // pega o primeiro tipo presente (os dois de conversa medem a mesma coisa em versões diferentes)
  for (const t of tipos) {
    const a = actions.find((x: any) => x.action_type === t)
    if (a) return parseFloat(a.value || '0')
  }
  return 0
}

export async function getInsightsConta(conta: string, since: string, until: string): Promise<InsightsConta> {
  const vazio = { gasto: 0, impressoes: 0, cliques: 0, conversas: 0, leads: 0, custoConversa: null }
  if (!TOKEN) return { ok: false, error: 'Falta FB_ADS_TOKEN', total: vazio, porDia: [] }
  const acct = 'act_' + String(conta || '').replace(/\D/g, '')
  if (acct === 'act_') return { ok: false, error: 'projeto sem conta de anúncio', total: vazio, porDia: [] }

  const tr = encodeURIComponent(JSON.stringify({ since, until }))
  const tk = encodeURIComponent(TOKEN)
  try {
    const [info, dias] = await Promise.all([
      fetch(`${GRAPH}/${acct}?fields=name,currency,account_status&access_token=${tk}`).then(r => r.json()),
      fetch(`${GRAPH}/${acct}/insights?fields=spend,impressions,clicks,actions&time_range=${tr}&time_increment=1&limit=500&access_token=${tk}`).then(r => r.json()),
    ])
    if (info?.error) return { ok: false, error: traduzErroMeta(info.error), total: vazio, porDia: [] }
    if (dias?.error) return { ok: false, error: traduzErroMeta(dias.error), total: vazio, porDia: [] }

    const porDia = (dias.data || []).map((d: any) => ({
      data: d.date_start,
      gasto: parseFloat(d.spend || '0'),
      conversas: somaAcao(d.actions, CONVERSA),
    }))
    const t = (dias.data || []).reduce((acc: any, d: any) => {
      acc.gasto += parseFloat(d.spend || '0')
      acc.impressoes += parseInt(d.impressions || '0', 10)
      acc.cliques += parseInt(d.clicks || '0', 10)
      acc.conversas += somaAcao(d.actions, CONVERSA)
      acc.leads += somaAcao(d.actions, ['lead', 'onsite_conversion.lead_grouped'])
      return acc
    }, { gasto: 0, impressoes: 0, cliques: 0, conversas: 0, leads: 0 })

    return {
      ok: true,
      conta: { nome: info.name, moeda: info.currency, status: info.account_status },
      total: { ...t, custoConversa: t.conversas ? t.gasto / t.conversas : null },
      porDia,
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'falha ao ler a Meta', total: vazio, porDia: [] }
  }
}

// o erro da Meta em português, dizendo o que fazer
function traduzErroMeta(err: any): string {
  const code = err?.code
  if (code === 100 || code === 200 || code === 10 || /permission|permiss/i.test(err?.message || '')) {
    return 'O token da escola não tem acesso a essa conta. No Business Manager: Configurações do negócio → Usuários do sistema → escolher o usuário do token → Adicionar ativos → Contas de anúncio → marcar a do cliente com "Ver desempenho".'
  }
  if (code === 190) return 'O token da Meta expirou ou foi revogado — precisa gerar outro.'
  return err?.message || 'erro da Meta'
}
