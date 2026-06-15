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
