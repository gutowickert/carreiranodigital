// Maia: as 500 chamadas da Marketing API (05/11, do doc do Nando). Pra liberar o acesso completo a anúncios de OUTRAS empresas,
// a Meta exige pelo menos 500 chamadas bem-sucedidas em 15 dias, com menos de 15% de erro, feitas pelo app "Sistema CND".
// A rotina de hora em hora lê os números das contas de anúncio da própria CND e da escola (leitura só: nada é criado nem mudado).
//   MAIA_APP_ADS_TOKEN     chave de usuário do sistema do portfólio da CND, GERADA NO APP Sistema CND, com ads_read
//   MAIA_CHAMADAS_CONTAS   contas, separadas por vírgula (ex.: act_123,act_456)
// Cada rodada faz 5 leituras por conta e guarda o placar em maia_eventos ('chamadas_marketing'). Placar: acao=chamadas no painel.
import { maiaDb as db } from './db'

const GRAPH = 'https://graph.facebook.com/v25.0'
const contas = () => String(process.env.MAIA_CHAMADAS_CONTAS || '').split(',').map(s => s.trim()).filter(Boolean).map(c => c.startsWith('act_') ? c : 'act_' + c)

async function le(caminho: string, token: string) {
  try {
    const r = await fetch(`${GRAPH}/${caminho}${caminho.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(20000) })
    const j: any = await r.json().catch(() => ({}))
    return r.ok && !j.error ? { ok: true } : { ok: false, erro: String(j?.error?.message || r.status).slice(0, 120) }
  } catch (e: any) { return { ok: false, erro: String(e?.message || e).slice(0, 120) } }
}

export async function contaChamadas() {
  const token = process.env.MAIA_APP_ADS_TOKEN || ''
  const lista = contas()
  if (!token || !lista.length) return { pulou: 'faltam MAIA_APP_ADS_TOKEN e MAIA_CHAMADAS_CONTAS' }
  let ok = 0, erro = 0
  const erros: string[] = []
  for (const c of lista) {
    for (const caminho of [
      `${c}?fields=name,account_status,currency`,
      `${c}/campaigns?fields=name,status,objective&limit=50`,
      `${c}/adsets?fields=name,status,daily_budget&limit=50`,
      `${c}/ads?fields=name,status&limit=50`,
      `${c}/insights?date_preset=last_7d&level=campaign&fields=campaign_name,spend,impressions,clicks&limit=50`,
    ]) {
      const r = await le(caminho, token)
      if (r.ok) ok++; else { erro++; if (erros.length < 3) erros.push(`${c}: ${r.erro}`) }
    }
  }
  await db.evento('chamadas_marketing', null, { ok, erro, contas: lista.length, erros })
  return { ok, erro, erros }
}

// o placar dos últimos 15 dias (o que a Meta olha)
export async function placarChamadas() {
  const desde = Date.now() - 15 * 86400e3
  const evs = (await db.lista('eventos', { tipo: 'chamadas_marketing' })).filter(e => Date.parse(e.criado_em) >= desde)
  const ok = evs.reduce((s, e) => s + (e.detalhe?.ok || 0), 0), erro = evs.reduce((s, e) => s + (e.detalhe?.erro || 0), 0)
  const total = ok + erro
  return { ok, erro, taxa_erro: total ? Math.round(erro / total * 1000) / 10 : null, faltam: Math.max(0, 500 - ok), rodadas: evs.length, ultimo: evs.at(-1)?.criado_em || null, ultimos_erros: evs.at(-1)?.detalhe?.erros || [] }
}
