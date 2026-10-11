// Recado Encantado: leitura da Meta (gasto por conjunto e anúncio), usada pela leitura diária (/api/recado/meta-sync)
// e pela aba Campanhas do painel (/api/recado/campanhas, em tempo real).
// A conta de anúncios tem campanhas de outros negócios (11/10: FALOUORÇOU, DEFESAPRONTA): só entra o que é do Recado.
import { getAnunciosDia, type AnuncioDia } from '@/lib/meta-ads'
import { hojeBR, isoBR } from '@/lib/periodos'

const U = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string, K = () => process.env.SUPABASE_SERVICE_ROLE_KEY as string
const H = () => ({ apikey: K(), Authorization: 'Bearer ' + K(), 'Content-Type': 'application/json' })
const norm = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

// produto pela 1ª palavra da campanha (CHUPETA | mães | teste 1)
export function produtoDaCampanha(nome: string): string | null {
  const n = norm(nome), p = n.split(/[^A-Z]+/).filter(Boolean)[0] || ''
  if (p === 'CHUPETA') return 'grandao/chupeta'
  if (p === 'CORAGEM') return 'coragem/coragem'
  if (p === 'DORMIR' || p === 'NOITE') return 'guardiao/dormir'
  if (p === 'FADA') return 'fada/recado'
  if (p === 'NOEL') return /ENCANTO/.test(n) ? 'noel/encanto' : 'noel/magico'
  return null
}
// produto por palavra em qualquer lugar do nome do conjunto ("CONJUNTO FADA DO DENTE MÃES")
export function produtoDoConjunto(nome: string): string | null {
  const n = norm(nome)
  if (/CHUPETA|GRANDAO/.test(n)) return 'grandao/chupeta'
  if (/CORAGEM|CAPITA/.test(n)) return 'coragem/coragem'
  if (/GUARDIAO|DORMIR|NOITE/.test(n)) return 'guardiao/dormir'
  if (/FADA|DENTE/.test(n)) return 'fada/recado'
  if (/NOEL|NATAL/.test(n)) return /ENCANTO/.test(n) ? 'noel/encanto' : 'noel/magico'
  return null
}
export const doRecado = (l: AnuncioDia) => /RECADO/i.test(l.campaign_name) || !!produtoDaCampanha(l.campaign_name)
export const produtoDe = (l: AnuncioDia) => produtoDoConjunto(l.adset_name) || produtoDaCampanha(l.campaign_name)

// linhas por anúncio e por dia, só do Recado
export async function lerMeta(desde: string, ate: string) {
  const conta = process.env.RECADO_META_CONTA
  if (!conta) return { ok: false as const, erro: 'falta a conta de anúncios do Recado (RECADO_META_CONTA)', linhas: [] as AnuncioDia[] }
  const r = await getAnunciosDia(conta, desde, ate)
  if (!r.ok) return { ok: false as const, erro: r.error || 'falha ao ler a Meta', linhas: [] as AnuncioDia[] }
  return { ok: true as const, linhas: r.linhas.filter(doRecado) }
}

// grava o gasto dos últimos N dias em recado_gastos (canal meta_api, refeito a cada leitura; lançamentos à mão não são tocados)
export async function sincronizaGastos(dias: number) {
  const ate = hojeBR(), desde = isoBR(new Date(Date.now() - (dias - 1) * 86400e3))
  const r = await lerMeta(desde, ate)
  if (!r.ok) return { ok: false, erro: r.erro }
  const soma = new Map<string, any>()
  for (const l of r.linhas) {
    const k = l.data + '|' + l.campaign_name + '|' + l.adset_name
    const s = soma.get(k) || { dia: l.data, canal: 'meta_api', campanha: l.campaign_name.slice(0, 120), produto: produtoDe(l), valor: 0, impressoes: 0, cliques: 0, obs: ('Meta · ' + l.adset_name).slice(0, 200) }
    s.valor += l.gasto; s.impressoes += l.impressoes; s.cliques += l.cliques; soma.set(k, s)
  }
  const linhas = [...soma.values()].filter(s => s.valor > 0).map(s => ({ ...s, valor: +s.valor.toFixed(2) }))
  const del = await fetch(`${U()}/rest/v1/recado_gastos?canal=eq.meta_api&dia=gte.${desde}&dia=lte.${ate}`, { method: 'DELETE', headers: H() })
  if (!del.ok) return { ok: false, erro: 'banco ' + del.status }
  if (linhas.length) {
    const ins = await fetch(`${U()}/rest/v1/recado_gastos`, { method: 'POST', headers: H(), body: JSON.stringify(linhas) })
    if (!ins.ok) return { ok: false, erro: 'banco ' + ins.status + ': ' + (await ins.text()).slice(0, 200) }
  }
  return { ok: true, desde, ate, conjuntos: new Set(linhas.map(l => l.obs)).size, campanhas: new Set(linhas.map(l => l.campanha)).size, linhas: linhas.length, total: +linhas.reduce((a, l) => a + l.valor, 0).toFixed(2), sem_produto: [...new Set(linhas.filter(l => !l.produto).map(l => l.obs))] }
}
