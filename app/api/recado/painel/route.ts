// Recado Encantado: dados e ações do painel do negócio. Protegido pela senha RECADO_PAINEL_SENHA (cabeçalho x-senha).
// GET ?o=tudo&dias=N  -> pedidos, funil do site (somado no banco), gastos de anúncio, custos fixos, metas, preços e custo padrão
// GET ?o=pedido&id=   -> um pedido com eventos e links
// GET ?o=organico_seco -> o agendador do orgânico em modo seco (o que publicaria agora, sem publicar)
// POST {acao, ...}    -> ações nos pedidos e lançamentos (gasto, custo fixo, meta)
// 25/10 (painel novo): também o ACORDO DE NATAL (pedidos, etapas, prazos), os próximos vídeos, os últimos acontecimentos,
// o custo real por item (recado_custos, sql/08), as sessões da máquina, o estado das automações e as sugestões de fixos e metas.
// O gasto da Meta se atualiza sozinho: cron das 6h30 + toda vez que o painel abre e a última leitura tem mais de 2 h.
import { NextRequest, NextResponse, after } from 'next/server'
import { recadoDb as db } from '@/lib/recado/db'
import { recadoConfig as cfg } from '@/lib/recado/config'
import { economia, custoPadrao, sugestao } from '@/lib/recado/economia'
import { VENDA_ATE, DESAFIOS } from '@/lib/recado/acordo'
import { sincronizaGastos } from '@/lib/recado/meta-gasto'
import { estadoOrganico, acaoOrganico, rodaAgendador } from '@/lib/recado/organico'

export const maxDuration = 60   // o atendente automático chama o Claude (11/10)
const autorizado = (req: NextRequest) => !!process.env.RECADO_PAINEL_SENHA && req.headers.get('x-senha') === process.env.RECADO_PAINEL_SENHA
const sem = { headers: { 'Cache-Control': 'no-store' } }
const U = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string, K = () => process.env.SUPABASE_SERVICE_ROLE_KEY as string
const rpc = async (fn: string, args: any) => {
  const r = await fetch(`${U()}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: K(), Authorization: 'Bearer ' + K(), 'Content-Type': 'application/json' }, body: JSON.stringify(args) })
  if (!r.ok) throw new Error('banco ' + r.status + ': ' + (await r.text()).slice(0, 200)); return r.json()
}
const CAMPOS_PEDIDO = 'id,codigo,criado_em,personagem,pacote,preco,status,nome:crianca->>nome,responsavel:contato->>responsavel,pago_em,produzindo_em,entregue_em,forma_pagamento,taxa_gateway,custo,erro,tentativas,origem,visitante,missao'
const ACORDO_DESDE = '2026-10-24T03:00:00.000Z'   // o acordo entrou no ar em 24/10
const opcional = (p: Promise<any>) => p.catch(() => null)   // tabela que só existe depois do sql/08: null = ainda não rodou

// o que o painel novo precisa além do básico (25/10)
async function extrasDoPainel(desde: string, pedidos: any[]) {
  const [acordoPeds, etapas, eventos, eventosCusto, custos, sessoes, ultMeta] = await Promise.all([
    db.busca('pedidos', `pacote=like.acordo*&criado_em=gte.${ACORDO_DESDE}&order=criado_em.desc&limit=2000&select=${CAMPOS_PEDIDO}`).catch(() => []),
    // todas as etapas de missão e acordo desde o lançamento (as do acordo que esperam o "eu aceito" ficam em 2099)
    db.busca('etapas', `quando=gte.${ACORDO_DESDE}&order=quando.asc&limit=5000&select=pedido_id,ordem,tipo,quando,status,resposta,respondida_em,entregue_em,erro,tentativas,produzir_a_partir,extras`).catch(() => []),
    db.busca('eventos', 'order=quando.desc&limit=80&select=quando,tipo,detalhe,pedido_id').catch(() => []),
    // e-mails e mensagens de cada pedido do período: entram no custo real (preço unitário em economia.unit)
    db.busca('eventos', `quando=gte.${desde}&or=(tipo.like.email*,tipo.eq.lembrete,tipo.eq.entrega,tipo.eq.etapa_entregue)&limit=10000&select=pedido_id,tipo,enviado:detalhe->>enviado`).catch(() => []),
    opcional(db.busca('custos', `quando=gte.${desde}&limit=20000&select=pedido_id,etapa_ordem,item,quantidade,unidade,valor,usd,quando`)),
    opcional(db.busca('maquina_sessoes', `ligou_em=gte.${desde}&order=ligou_em.desc&limit=500`)),
    db.busca('gastos', 'canal=eq.meta_api&order=criado_em.desc&limit=1&select=criado_em').catch(() => []),
  ])
  // nome e código de quem aparece nas etapas e nos acontecimentos (pedidos fora do período vêm numa leitura curta)
  const conhecidos = new Map<string, any>()
  for (const p of [...pedidos, ...acordoPeds]) conhecidos.set(p.id, p)
  const faltam = [...new Set([...etapas.map((e: any) => e.pedido_id), ...eventos.map((e: any) => e.pedido_id)])].filter(id => id && !conhecidos.has(id)).slice(0, 150)
  if (faltam.length) for (const p of await db.busca('pedidos', `id=in.(${faltam.join(',')})&select=id,codigo,personagem,pacote,status,nome:crianca->>nome`).catch(() => [])) conhecidos.set(p.id, p)
  const quem = (id: string) => { const p = conhecidos.get(id); return p ? { codigo: p.codigo, nome: p.nome, pacote: p.pacote, personagem: p.personagem } : {} }
  // e-mails e WhatsApp por pedido
  const envios: Record<string, { email: number; whats: number }> = {}
  for (const e of eventosCusto as any[]) {
    const o = envios[e.pedido_id] = envios[e.pedido_id] || { email: 0, whats: 0 }
    if (/^email|^lembrete$/.test(e.tipo)) o.email++
    else if (e.enviado === 'true') o.whats++
  }
  // o gasto da Meta se atualiza sozinho: se a última leitura passou de 2 h, lê de novo depois de responder (sem atrasar a tela)
  const ultimo = ultMeta[0]?.criado_em || null, velho = !ultimo || Date.now() - Date.parse(ultimo) > 2 * 3600e3
  const ligadoMeta = !!process.env.RECADO_META_CONTA
  if (velho && ligadoMeta) after(() => sincronizaGastos(3).catch(e => console.error('recado/painel meta', e)))
  return {
    acordo: { vendaAte: VENDA_ATE, desafios: DESAFIOS, pedidos: acordoPeds },
    etapas: (etapas as any[]).map(e => ({ ...e, ...quem(e.pedido_id) })),
    eventos: (eventos as any[]).map(e => ({ ...e, ...quem(e.pedido_id) })),
    envios, custos, sessoes,
    automacoes: {
      metaConta: ligadoMeta, metaUltima: ultimo, metaLendo: velho && ligadoMeta,
      vigia: !!process.env.RECADO_VIGIA_CHAVE, avisoCelular: !!(process.env.RECADO_NTFY_TOPICO || process.env.RECADO_AVISO_EMAIL),
      caixa: !!process.env.RECADO_SUPORTE_SENHA, custosReais: custos !== null, sessoesMaquina: sessoes !== null,
    },
  }
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ erro: 'senha' }, { status: 401 })
  try {
    const q = req.nextUrl.searchParams
    if (q.get('o') === 'pedido') {
      const id = String(q.get('id') || '').replace(/[^a-f0-9-]/g, '')
      const [p] = await db.busca('pedidos', `id=eq.${id}&select=*`)
      if (!p) return NextResponse.json({ erro: 'não achei' }, { status: 404 })
      const eventos = await db.busca('eventos', `pedido_id=eq.${id}&order=quando.asc`)
      const etapas = await db.busca('etapas', `pedido_id=eq.${id}&order=ordem.asc&select=ordem,tipo,quando,status,resposta`).catch(() => [])
      const caminho = p.visitante ? await db.busca('site_eventos', `visitante=eq.${encodeURIComponent(p.visitante)}&order=quando.asc&limit=60&select=quando,evento,pagina,utm_campaign`) : []
      const links: any = {}
      for (const k of ['foto_path', 'video_path', 'carta_path', 'certificado_path']) if (p[k]) links[k] = await db.linkAssinado(p[k], 3600).catch(() => null)
      if (p.missao?.aceite?.caminho) links.aceite = await db.linkAssinado(p.missao.aceite.caminho, 3600).catch(() => null)   // acordo de Natal: o "eu aceito"
      return NextResponse.json({ pedido: p, eventos, etapas, caminho, links }, sem)
    }
    if (q.get('o') === 'organico_seco') return NextResponse.json(await rodaAgendador({ seco: true }), sem)   // 27/10
    if (q.get('o') === 'conversa') {   // suporte: as mensagens de uma conversa (11/10)
      const id = String(q.get('id') || '').replace(/[^a-f0-9-]/g, '')
      const [s] = await db.busca('suporte', `id=eq.${id}&select=*`)
      const msgs = await db.busca('suporte_msgs', `suporte_id=eq.${id}&order=quando.asc&select=quando,direcao,de,texto`)
      return NextResponse.json({ conversa: s || null, msgs }, sem)
    }
    const dias = Math.max(1, Math.min(400, +(q.get('dias') || 90)))
    // painel zerado em 11/10 00h (Guto: começou o orgânico de verdade). Testes de antes ficam no banco, só não entram nas contas.
    // Trocar a data (ou desligar) pela variável RECADO_PAINEL_INICIO na Vercel.
    const INICIO = process.env.RECADO_PAINEL_INICIO || '2026-10-11T03:00:00.000Z'
    const desde = [new Date(Date.now() - dias * 86400e3).toISOString(), INICIO].sort().pop() as string
    // o funil (visitantes por etapa) vem somado do banco: precisa do início do período escolhido no painel, senão "Hoje" mostra 31 dias
    const fd = q.get('funil_desde'), funilDesde = fd && !isNaN(Date.parse(fd)) ? [new Date(fd).toISOString(), INICIO].sort().pop() as string : desde
    const [pedidos, maquina, funil, funilDia, gastos, fixos, metas, cupons] = await Promise.all([
      db.busca('pedidos', `criado_em=gte.${desde}&order=criado_em.desc&limit=1000&select=${CAMPOS_PEDIDO}`),
      db.busca('maquina', 'id=eq.1'),
      rpc('recado_funil', { desde: funilDesde }),
      rpc('recado_funil_dia', { desde }),
      db.busca('gastos', `dia=gte.${desde.slice(0, 10)}&order=dia.desc&limit=1000`),
      db.busca('custos_fixos', 'order=inicio.desc&limit=200'),
      db.busca('metas', 'order=mes.desc&limit=24'),
      db.busca('cupons', 'order=criado_em.desc&limit=200').catch(() => []),
    ])
    const suporte = await db.busca('suporte', 'order=atualizado_em.desc&limit=200').catch(() => [])   // pedidos de ajuda (11/10)
    // 11/10: os passos crus do período (o funil somado do banco conta duas vezes quem abre duas páginas). O painel conta pessoas
    // diferentes com eles e mostra até onde cada um chegou no formulário (form_campo / form_erro).
    const ev: any[] = []
    try {
      for (let o = 0; o < 50000; o += 1000) {
        const l = await db.busca('site_eventos', `quando=gte.${funilDesde}&select=quando,visitante,evento,produto,fonte:utm_source,medio:utm_medium,campanha:utm_campaign,anuncio:utm_content,campo:dados->>campo,pct:dados->>pct&order=quando.asc&offset=${o}&limit=1000`)
        ev.push(...l); if (l.length < 1000) break
      }
    } catch (e) { console.error('recado/painel eventos', e) }
    // preço e custo padrão de cada produto, pra o painel calcular margem mesmo antes do vídeo existir
    const produtos: any = {}
    for (const [per, pacs] of Object.entries(cfg.pacotes)) for (const [pac, v] of Object.entries(pacs as any)) produtos[`${per}/${pac}`] = { nome: (per === 'noel' ? 'Papai Noel · ' : '') + (v as any).nome, preco: (v as any).preco, custoPadrao: custoPadrao(`${per}/${pac}`), videos: (economia.videos[`${per}/${pac}`] || [30]).length }
    const [extra, organico] = await Promise.all([extrasDoPainel(desde, pedidos), estadoOrganico().catch(() => null)])   // orgânico: agendador do Instagram (27/10)
    return NextResponse.json({ pedidos, maquina: maquina[0] || null, funil, funilDia, ev: ev.length ? ev : null, suporte, gastos, fixos, metas, cupons, produtos, ...extra, organico,
      regras: { custoMax: economia.custoMax, trafegoMin: economia.trafegoMin, trafegoMax: economia.trafegoMax, dolar: economia.dolar, gpuUsdHora: economia.gpuUsdHora, unit: economia.unit },
      sugestao, dias, agora: new Date().toISOString() }, sem)
  } catch (e: any) {
    console.error('recado/painel', e)
    return NextResponse.json({ erro: String(e.message || e).slice(0, 200) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ erro: 'senha' }, { status: 401 })
  const b: any = await req.json()
  const num = (v: any) => { const n = +String(v ?? '').replace(',', '.'); return Number.isFinite(n) ? n : null }
  const dia = (v: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null
  const txt = (v: any, n = 120) => String(v || '').replace(/[<>]/g, '').trim().slice(0, n)
  try {
    // o trabalhador (no computador) avisa o dono no celular quando um pedido falha (12/10)
    if (b.acao === 'avisa_dono') {
      const { avisaDono } = await import('@/lib/recado/avisa-dono')
      await avisaDono(txt(b.titulo, 80) || 'Recado Encantado', String(b.texto || '').replace(/[<>]/g, '').slice(0, 600), 'warning')
      return NextResponse.json({ ok: true })
    }
    // caixa do contato@ dentro do painel (11/10): lê o Titan, responde pelo mesmo fio, marca como lida
    if (b.acao === 'suporte_sync') {
      const { sincroniza, caixaLigada } = await import('@/lib/recado/suporte-email')
      if (!caixaLigada()) return NextResponse.json({ ok: false, semCaixa: true })
      try { return NextResponse.json({ ok: true, ...(await sincroniza()) }) } catch (e: any) { return NextResponse.json({ ok: false, erro: 'Não consegui ler a caixa: ' + String(e.message || e).slice(0, 160) }) }
    }
    // o vigia (no computador, a cada 2 min) e o painel aberto chamam isto: lê a caixa e o atendente automático responde
    if (b.acao === 'suporte_auto') {
      const { sincroniza, caixaLigada } = await import('@/lib/recado/suporte-email'), { atendeSozinho } = await import('@/lib/recado/suporte-ia')
      const lida = caixaLigada() ? await sincroniza().catch((e: any) => ({ novas: 0, erro: String(e.message || e).slice(0, 160) })) : { novas: 0, erro: 'sem caixa' }
      const ia = await atendeSozinho(3).catch((e: any) => ({ feitas: [], erro: String(e.message || e).slice(0, 160) }))
      return NextResponse.json({ ok: true, ...lida, respondidas: ia.feitas.length, erroIa: (ia as any).erro || null })
    }
    if (b.acao === 'suporte_responde') {
      const texto = String(b.texto || '').trim().slice(0, 8000), id = String(b.id || '').replace(/[^a-f0-9-]/g, '')
      if (texto.length < 2) return NextResponse.json({ erro: 'Escreve a resposta.' }, { status: 400 })
      const { responde } = await import('@/lib/recado/suporte-email')
      try { return NextResponse.json(await responde(id, texto)) } catch (e: any) { return NextResponse.json({ erro: String(e.message || e).slice(0, 200) }, { status: 500 }) }
    }
    if (b.acao === 'suporte_lido') { await db.atualiza('suporte', `id=eq.${String(b.id || '').replace(/[^a-f0-9-]/g, '')}`, { nao_lidas: 0 }); return NextResponse.json({ ok: true }) }
    if (b.acao === 'suporte_status') {
      const st = b.status === 'resolvido' ? 'resolvido' : 'aberto', id = String(b.id || '').replace(/[^a-f0-9-]/g, '')
      await db.atualiza('suporte', `id=eq.${id}`, { status: st, resolvido_em: st === 'resolvido' ? new Date().toISOString() : null })
      return NextResponse.json({ ok: true })
    }
    if (b.acao === 'gasto_add') {
      const valor = num(b.valor); if (!dia(b.dia) || valor == null) return NextResponse.json({ erro: 'dia e valor' }, { status: 400 })
      await db.insere('gastos', { dia: b.dia, canal: txt(b.canal, 30) || 'meta', campanha: txt(b.campanha), produto: txt(b.produto, 40) || null, valor, impressoes: num(b.impressoes), cliques: num(b.cliques), obs: txt(b.obs, 200) || null })
      return NextResponse.json({ ok: true })
    }
    if (b.acao === 'gasto_del') { await fetch(`${U()}/rest/v1/recado_gastos?id=eq.${+b.id}`, { method: 'DELETE', headers: { apikey: K(), Authorization: 'Bearer ' + K() } }); return NextResponse.json({ ok: true }) }
    if (b.acao === 'fixo_add') {
      const valor = num(b.valor); if (!txt(b.nome) || valor == null) return NextResponse.json({ erro: 'nome e valor' }, { status: 400 })
      await db.insere('custos_fixos', { nome: txt(b.nome), valor_mensal: valor, inicio: dia(b.inicio) || new Date().toISOString().slice(0, 10), obs: txt(b.obs, 200) || null })
      return NextResponse.json({ ok: true })
    }
    // cupons (Guto 10/10): grátis vira cortesia e entra direto na produção; pct dá desconto
    if (b.acao === 'cupom_add') {
      const codigo = txt(b.codigo, 30).toUpperCase().replace(/[^A-Z0-9-]/g, ''); if (codigo.length < 3) return NextResponse.json({ erro: 'código com pelo menos 3 letras' }, { status: 400 })
      const tipo = b.tipo === 'pct' ? 'pct' : 'gratis', valor = tipo === 'pct' ? num(b.valor) : null
      if (tipo === 'pct' && !(valor! > 0 && valor! < 100)) return NextResponse.json({ erro: 'desconto entre 1 e 99%' }, { status: 400 })
      await db.insere('cupons', { codigo, tipo, valor, usos_max: Math.max(1, Math.min(1000, num(b.usos_max) || 1)), validade: dia(b.validade), produto: txt(b.produto, 40) || null, obs: txt(b.obs, 200) || null })
      return NextResponse.json({ ok: true })
    }
    if (b.acao === 'cupom_fim') { await db.atualiza('cupons', `codigo=eq.${encodeURIComponent(txt(b.codigo, 30))}`, { ativo: false }); return NextResponse.json({ ok: true }) }
    if (b.acao === 'fixo_fim') { await db.atualiza('custos_fixos', `id=eq.${+b.id}`, { fim: new Date().toISOString().slice(0, 10) }); return NextResponse.json({ ok: true }) }
    if (b.acao === 'meta_set') {
      const mes = dia(b.mes); if (!mes) return NextResponse.json({ erro: 'mês' }, { status: 400 })
      const linha = { mes: mes.slice(0, 8) + '01', faturamento: num(b.faturamento), pedidos: num(b.pedidos), margem_pct: num(b.margem_pct), trafego_pct: num(b.trafego_pct), obs: txt(b.obs, 200) || null }
      await fetch(`${U()}/rest/v1/recado_metas`, { method: 'POST', headers: { apikey: K(), Authorization: 'Bearer ' + K(), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(linha) })
      return NextResponse.json({ ok: true })
    }
    // orgânico (27/10): já postei na mão / voltar a agendar / tentar de novo
    if (/^organico_/.test(b.acao)) { await acaoOrganico(b.acao, String(b.id || '').replace(/[^A-Z0-9]/g, '')); return NextResponse.json({ ok: true }) }
    // acordo de Natal (24/10): o "eu aceito" chegou por WhatsApp ou e-mail; marca aqui e o vídeo do acordo é gravado agora
    if (b.acao === 'acordo_aceite') {
      const { aceiteChegou } = await import('@/lib/recado/acordo')
      return NextResponse.json({ ok: true, ...(await aceiteChegou(String(b.id || '').replace(/[^a-f0-9-]/g, ''), { tipo: b.tipo === 'voz' ? 'voz' : 'contado', por: 'painel' })) })
    }
    const id = String(b.id || '').replace(/[^a-f0-9-]/g, '')
    const muda: any = ({ refazer: { status: 'pago', erro: null }, liberar: { status: 'entregue', entregue_em: new Date().toISOString(), erro: null }, reenviar: { status: 'revisao' }, cancelar: { status: 'cancelado' }, marcar_reembolsado: { status: 'reembolsado' } } as any)[b.acao]
    if (!muda || !id) return NextResponse.json({ erro: 'ação inválida' }, { status: 400 })
    await db.atualiza('pedidos', `id=eq.${id}`, muda)
    await db.evento(id, 'painel_' + b.acao, {})
    return NextResponse.json({ ok: true })
  } catch (e: any) { return NextResponse.json({ erro: String(e.message || e).slice(0, 200) }, { status: 500 }) }
}
