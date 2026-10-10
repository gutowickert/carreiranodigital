// Recado Encantado: puxa o gasto da Meta (por campanha e por dia) pros lançamentos do painel.
//   GET  → cron da Vercel, todo dia de manhã: os últimos 3 dias (a Meta ainda ajusta o gasto de ontem).
//   POST → botão "Puxar da Meta" no painel (senha do painel), { dias } até 90.
// A conta vem de RECADO_META_CONTA e a chave é a mesma da escola (FB_ADS_TOKEN): a conta do Recado fica no
// mesmo Gerenciador de Negócios, com acesso dado ao usuário do sistema.
// Linhas automáticas ficam com canal 'meta_api' e são refeitas a cada leitura; as lançadas à mão não são tocadas.
// Produto pela 1ª palavra do nome da campanha (CHUPETA | mães | teste 1). campanha = nome da campanha, que é o
// mesmo utm_campaign quando o anúncio usa {{campaign.name}} no link, e assim o funil casa venda com gasto.
import { NextRequest, NextResponse } from 'next/server'
import { getAnunciosDia } from '@/lib/meta-ads'
import { hojeBR, isoBR } from '@/lib/periodos'

export const maxDuration = 60
const U = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string, K = () => process.env.SUPABASE_SERVICE_ROLE_KEY as string
const H = () => ({ apikey: K(), Authorization: 'Bearer ' + K(), 'Content-Type': 'application/json' })

function produtoDaCampanha(nome: string): string | null {
  const n = String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  const p = n.split(/[^A-Z]+/).filter(Boolean)[0] || ''
  if (p === 'CHUPETA') return 'grandao/chupeta'
  if (p === 'CORAGEM') return 'coragem/coragem'
  if (p === 'DORMIR' || p === 'NOITE') return 'guardiao/dormir'
  if (p === 'FADA') return 'fada/recado'
  if (p === 'NOEL') return /ENCANTO/.test(n) ? 'noel/encanto' : 'noel/magico'
  return null
}

async function sincroniza(dias: number) {
  const conta = process.env.RECADO_META_CONTA
  if (!conta) return { ok: false, erro: 'falta a conta de anúncios do Recado (RECADO_META_CONTA)' }
  const ate = hojeBR(), desde = isoBR(new Date(Date.now() - (dias - 1) * 86400e3))
  const r = await getAnunciosDia(conta, desde, ate)
  if (!r.ok) return { ok: false, erro: r.error }
  const soma = new Map<string, any>()
  for (const l of r.linhas) {
    const k = l.data + '|' + l.campaign_name
    const s = soma.get(k) || { dia: l.data, canal: 'meta_api', campanha: l.campaign_name.slice(0, 120), produto: produtoDaCampanha(l.campaign_name), valor: 0, impressoes: 0, cliques: 0, obs: 'automático da Meta' }
    s.valor += l.gasto; s.impressoes += l.impressoes; s.cliques += l.cliques; soma.set(k, s)
  }
  const linhas = [...soma.values()].filter(s => s.valor > 0).map(s => ({ ...s, valor: +s.valor.toFixed(2) }))
  // refaz o período: apaga só as linhas automáticas e grava as novas
  const del = await fetch(`${U()}/rest/v1/recado_gastos?canal=eq.meta_api&dia=gte.${desde}&dia=lte.${ate}`, { method: 'DELETE', headers: H() })
  if (!del.ok) return { ok: false, erro: 'banco ' + del.status }
  if (linhas.length) {
    const ins = await fetch(`${U()}/rest/v1/recado_gastos`, { method: 'POST', headers: H(), body: JSON.stringify(linhas) })
    if (!ins.ok) return { ok: false, erro: 'banco ' + ins.status + ': ' + (await ins.text()).slice(0, 200) }
  }
  return { ok: true, desde, ate, campanhas: new Set(linhas.map(l => l.campanha)).size, linhas: linhas.length, total: +linhas.reduce((a, l) => a + l.valor, 0).toFixed(2), sem_produto: [...new Set(linhas.filter(l => !l.produto).map(l => l.campanha))] }
}

export async function GET(req: NextRequest) {
  const ua = req.headers.get('user-agent') || '', secret = process.env.CRON_SECRET
  if (!ua.includes('vercel-cron') && !(secret && req.headers.get('authorization') === `Bearer ${secret}`)) return NextResponse.json({ ok: false, erro: 'não autorizado' }, { status: 401 })
  return NextResponse.json(await sincroniza(3))
}

export async function POST(req: NextRequest) {
  if (!process.env.RECADO_PAINEL_SENHA || req.headers.get('x-senha') !== process.env.RECADO_PAINEL_SENHA) return NextResponse.json({ erro: 'senha' }, { status: 401 })
  const b: any = await req.json().catch(() => ({}))
  return NextResponse.json(await sincroniza(Math.max(1, Math.min(90, +b.dias || 7))))
}
