const TOKEN = process.env.FB_ADS_TOKEN || ''
const ACCOUNT = process.env.FB_AD_ACCOUNT_ID || ''
const GRAPH = 'https://graph.facebook.com/v25.0'

export type SpendResult = {
  ok: boolean
  total: number
  campaigns: { name: string; spend: number }[]
  error?: string
}

// Puxa o gasto real do Meta no período (por campanha + total)
export async function getSpend(since: string, until: string): Promise<SpendResult> {
  if (!TOKEN || !ACCOUNT) {
    return { ok: false, total: 0, campaigns: [], error: 'Faltam FB_ADS_TOKEN/FB_AD_ACCOUNT_ID' }
  }
  const acct = ACCOUNT.startsWith('act_') ? ACCOUNT : 'act_' + ACCOUNT
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }))
  const url = `${GRAPH}/${acct}/insights?level=campaign&fields=campaign_name,spend&time_range=${timeRange}&limit=500&access_token=${encodeURIComponent(TOKEN)}`

  try {
    const res = await fetch(url)
    const json = await res.json()
    if (!res.ok) {
      return { ok: false, total: 0, campaigns: [], error: JSON.stringify((json && json.error) || json) }
    }
    const rows = (json && json.data) || []
    const campaigns = rows.map((r: any) => ({ name: r.campaign_name || '(sem nome)', spend: parseFloat(r.spend || '0') }))
    const total = campaigns.reduce((s: number, c: any) => s + (c.spend || 0), 0)
    return { ok: true, total, campaigns }
  } catch (e: any) {
    return { ok: false, total: 0, campaigns: [], error: (e && e.message) || 'fetch falhou' }
  }
}