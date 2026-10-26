// Recado Encantado: o VIGIA (25/10). Olha o negócio sozinho e avisa o Guto no celular (avisaDono: ntfy + WhatsApp + e-mail)
// quando algo precisa dele. Os mesmos alertas aparecem no topo do painel (aba Hoje).
//   · máquina parada: tem vídeo pra gravar (pedido pago há mais de 45 min ou etapa que já devia estar gravando) e nada anda
//   · trabalhador sem sinal (só depois do sql/08: coluna recado_maquina.batida_em, que o trabalhador atualiza a cada volta)
//   · vídeo atrasado: etapa que passou da hora de entrega e não foi entregue; pedido com erro ou em revisão
//   · custo acima de 15% do preço num pedido pago dos últimos 3 dias
//   · CPA acima do teto (20% do preço) no Acordo de Natal, nos últimos 3 dias
// Cada aviso tem janela de 3 h (não repete), guardada em recado_suporte_estado (chave "vigia:<tipo>").
// Quem chama: o cron da Vercel de manhã (com o resumo do dia anterior) e o pg_cron do Supabase a cada 10 min (sql/08).
//   GET ?chave=RECADO_VIGIA_CHAVE[&resumo=1]   ou   cabeçalho do cron da Vercel
import { NextRequest, NextResponse } from 'next/server'
import { recadoDb as db } from '@/lib/recado/db'
import { avisaDono, nomeProduto, reais } from '@/lib/recado/avisa-dono'
import { economia, custoPadrao } from '@/lib/recado/economia'
import { recadoConfig as cfg } from '@/lib/recado/config'
import { hojeBR, isoBR } from '@/lib/periodos'

export const maxDuration = 60
const min = (iso: any) => (iso ? (Date.now() - Date.parse(iso)) / 60e3 : 0)
const U = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string, K = () => process.env.SUPABASE_SERVICE_ROLE_KEY as string
const PARADO = '2099'   // o V2 do acordo espera o "eu aceito" nesta data

function autorizado(req: NextRequest) {
  const chave = req.nextUrl.searchParams.get('chave'), ua = req.headers.get('user-agent') || '', secret = process.env.CRON_SECRET
  if (process.env.RECADO_VIGIA_CHAVE && chave === process.env.RECADO_VIGIA_CHAVE.trim()) return true
  return ua.includes('vercel-cron') || !!(secret && req.headers.get('authorization') === `Bearer ${secret}`)
}

// janela de 3 h por tipo de aviso (o estado mora na tabela de chave/valor do suporte, que já existe)
async function jaAvisou(tipo: string, horas = 3) {
  const [l] = await db.busca('suporte_estado', `chave=eq.vigia:${tipo}&select=valor`).catch(() => [])
  return !!l && min(l.valor) < horas * 60
}
async function marca(tipo: string) {
  await fetch(`${U()}/rest/v1/recado_suporte_estado`, { method: 'POST', headers: { apikey: K(), Authorization: 'Bearer ' + K(), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ chave: 'vigia:' + tipo, valor: new Date().toISOString(), atualizado_em: new Date().toISOString() }) }).catch(() => null)
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ ok: false, erro: 'não autorizado' }, { status: 401 })
  const resumo = req.nextUrl.searchParams.get('resumo') === '1' || (req.headers.get('user-agent') || '').includes('vercel-cron')
  const desde3 = new Date(Date.now() - 3 * 86400e3).toISOString()
  const [maq] = await db.busca('maquina', 'id=eq.1').catch(() => [])
  const pagos = await db.busca('pedidos', `status=in.(pago,produzindo,falhou,revisao)&select=id,codigo,status,pago_em,produzindo_em,erro`).catch(() => [])
  const etapas = await db.busca('etapas', `status=in.(agendada,produzindo,pronta,falhou)&quando=lt.${PARADO}-01-01&order=quando.asc&limit=500&select=pedido_id,ordem,tipo,quando,status,produzir_a_partir,erro`).catch(() => [])
  const avisos: { tipo: string; titulo: string; texto: string }[] = []

  // 1. máquina parada: tem trabalho esperando e a máquina não muda de estado há mais de 30 min
  const esperando = pagos.filter((p: any) => p.status === 'pago' && min(p.pago_em) > 45).length
    + etapas.filter((e: any) => e.status === 'agendada' && (e.produzir_a_partir ? min(e.produzir_a_partir) > 30 : min(e.quando) > -60)).length
  if (esperando && maq && min(maq.atualizado_em) > 30 && maq.estado !== 'produzindo')
    avisos.push({ tipo: 'maquina', titulo: 'Recado: a máquina parou', texto: `${esperando} vídeo(s) esperando pra gravar e a máquina está "${maq.estado}" há ${Math.round(min(maq.atualizado_em))} min. Confere se o trabalhador está rodando e se a RunPod tem saldo.` })
  // 2. trabalhador sem sinal (coluna do sql/08)
  if (maq && maq.batida_em && min(maq.batida_em) > 10)
    avisos.push({ tipo: 'batida', titulo: 'Recado: o trabalhador sumiu', texto: `O trabalhador não dá sinal há ${Math.round(min(maq.batida_em))} min. Os vídeos ficam na fila até ele voltar.` })
  // 3. atrasos e erros
  const atrasadas = etapas.filter((e: any) => min(e.quando) > 15 && e.status !== 'entregue')
  const comErro = pagos.filter((p: any) => p.status === 'falhou' || p.status === 'revisao').length + etapas.filter((e: any) => e.status === 'falhou').length
  if (atrasadas.length || comErro)
    avisos.push({ tipo: 'atraso', titulo: 'Recado: vídeo atrasado', texto: [atrasadas.length ? `${atrasadas.length} vídeo(s) passaram da hora de entrega` : '', comErro ? `${comErro} pedido(s) ou vídeo(s) com erro` : ''].filter(Boolean).join(' e ') + '. Abre o painel, aba Pedidos.' })
  // 4. custo acima de 15% do preço (pedidos pagos de verdade, últimos 3 dias)
  const recentes = await db.busca('pedidos', `pago_em=gte.${desde3}&preco=gt.0&select=codigo,personagem,pacote,preco,custo,origem`).catch(() => [])
  const caros = recentes.filter((p: any) => !p.origem?.teste && !p.origem?.cortesia && +p.custo?.producao > +p.preco * economia.custoMax)
  if (caros.length)
    avisos.push({ tipo: 'custo', titulo: 'Recado: custo acima de 15%', texto: caros.slice(0, 4).map((p: any) => `${p.codigo}: produção ${reais(p.custo.producao)} pra ${reais(p.preco)} (${Math.round(p.custo.producao / p.preco * 100)}%)`).join('\n') })
  // 5. CPA do acordo acima do teto (gasto dos últimos 3 dias ÷ vendas do acordo no mesmo período)
  const dia3 = isoBR(new Date(Date.now() - 2 * 86400e3))
  const gastos = await db.busca('gastos', `dia=gte.${dia3}&produto=like.noel/acordo*&select=valor`).catch(() => [])
  const gasto = gastos.reduce((s: number, g: any) => s + +g.valor, 0)
  const vendas = recentes.filter((p: any) => /^acordo/.test(p.pacote) && !p.origem?.teste && !p.origem?.cortesia && !p.origem?.irmao_de)
  const ticket = vendas.length ? vendas.reduce((s: number, p: any) => s + +p.preco, 0) / vendas.length : cfg.pacotes.noel.acordo.preco
  const teto = ticket * economia.trafegoMax
  if (gasto > teto && (!vendas.length || gasto / vendas.length > teto))
    avisos.push({ tipo: 'cpa', titulo: 'Recado: CPA acima do teto', texto: `Acordo de Natal nos últimos 3 dias: ${reais(gasto)} de anúncio pra ${vendas.length} venda(s)${vendas.length ? ` (CPA ${reais(gasto / vendas.length)})` : ''}. O teto é ${reais(teto)} (20% do ticket).` })

  const enviados: string[] = []
  for (const a of avisos) { if (await jaAvisou(a.tipo)) continue; await avisaDono(a.titulo, a.texto, 'warning'); await marca(a.tipo); enviados.push(a.tipo) }

  // resumo da manhã (cron da Vercel): o dia de ontem em 3 linhas
  let resumoTxt: string | null = null
  if (resumo && !(await jaAvisou('resumo', 20))) {
    const ontem = isoBR(new Date(Date.now() - 86400e3)), ini = `${ontem}T03:00:00.000Z`, fim = `${hojeBR()}T03:00:00.000Z`
    const ps = await db.busca('pedidos', `pago_em=gte.${ini}&pago_em=lt.${fim}&select=personagem,pacote,preco,origem,custo,taxa_gateway`).catch(() => [])
    const vs = ps.filter((p: any) => !p.origem?.teste && !p.origem?.cortesia && !p.origem?.irmao_de)
    const rec = vs.reduce((s: number, p: any) => s + +p.preco, 0)
    const g = (await db.busca('gastos', `dia=eq.${ontem}&select=valor`).catch(() => [])).reduce((s: number, x: any) => s + +x.valor, 0)
    const prod = ps.reduce((s: number, p: any) => s + (+p.custo?.producao || custoPadrao(`${p.personagem}/${p.pacote}`)), 0)
    const porPac: Record<string, number> = {}; for (const p of vs) porPac[nomeProduto(p.personagem, p.pacote)] = (porPac[nomeProduto(p.personagem, p.pacote)] || 0) + 1
    resumoTxt = `Ontem: ${vs.length} venda(s), ${reais(rec)}${Object.keys(porPac).length ? ' (' + Object.entries(porPac).map(([k, n]) => `${n} ${k.replace('Papai Noel · ', '')}`).join(', ') + ')' : ''}.\n`
      + `Anúncio ${reais(g)}${vs.length && g ? ` · CPA ${reais(g / vs.length)}` : ''} · produção ${reais(prod)}.\n`
      + `Sobra antes dos fixos: ${reais(rec - g - prod - ps.reduce((s: number, p: any) => s + (+p.taxa_gateway || 0), 0))}.`
    await avisaDono('Recado: bom dia', resumoTxt, 'sunny'); await marca('resumo')
  }
  return NextResponse.json({ ok: true, avisos: avisos.map(a => a.tipo), enviados, resumo: resumoTxt })
}
