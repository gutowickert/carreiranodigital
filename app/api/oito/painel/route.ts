// Oito Posts: o painel do dono (mesma senha do painel do Recado, no cabeçalho x-senha).
//   GET ?dias=1|7|30            → funil por marca, clientes, fila, posts recentes, mensagens, dinheiro e saúde da máquina
//   POST {acao, ...}            → regerar · pago_manual · cancelar · suporte_ok · apagar · exemplo
import { NextResponse } from 'next/server'
import { oitoDb as db } from '@/lib/oito/db'
import { senhaOk, oitoConfig as cfg, Marca } from '@/lib/oito/config'
import { cancelaAssinatura, asaasHoje, asaasMaisUmMes } from '@/lib/oito/asaas'
import { garanteLoteDoCiclo } from '@/lib/oito/servico'

export const maxDuration = 60
const nega = () => NextResponse.json({ erro: 'senha' }, { status: 401 })
const ETAPAS = ['visita', 'form_inicio', 'lead', 'teste_pronto', 'teste_visto', 'assinar_clique', 'assinatura_aberta', 'pagou'] as const

export async function GET(req: Request) {
  if (!senhaOk(req.headers.get('x-senha'))) return nega()
  const u = new URL(req.url), dias = Math.min(90, Math.max(1, +(u.searchParams.get('dias') || 1)))
  // "hoje" começa à meia-noite de Brasília
  const agora = Date.now(), meiaNoite = new Date(new Date(agora - 3 * 3600e3).toISOString().slice(0, 10) + 'T03:00:00Z').getTime()
  const desde = new Date(dias === 1 ? meiaNoite : agora - dias * 86400e3).toISOString()

  const [clientes, lotes, eventos, estado, chamados] = await Promise.all([
    db.lista('clientes', {}, { ordem: 'criado_em', desc: true }),
    db.lista('lotes', {}, { ordem: 'criado_em', desc: true, limite: 400 }),
    db.lista('eventos', {}, { ordem: 'criado_em', desc: true, limite: 5000 }),
    db.lista('estado', {}),
    db.lista('chamados', {}, { ordem: 'atualizado_em', desc: true, limite: 200 }).catch(() => [] as any[]),
  ])
  const exemplo = new Set(clientes.filter(c => c.exemplo).map(c => c.id))
  const real = (e: any) => !e.cliente_id || !exemplo.has(e.cliente_id)
  const noPeriodo = eventos.filter(e => e.criado_em >= desde && real(e))

  // funil: pessoas distintas por etapa (sessão antes do cadastro, cliente depois)
  const funil: Record<string, Record<string, number>> = {}
  for (const m of ['todas', 'salao', 'prato', 'pata']) {
    funil[m] = {}
    for (const et of ETAPAS) {
      const ev = noPeriodo.filter(e => e.tipo === et && (m === 'todas' || e.marca === m))
      funil[m][et] = new Set(ev.map(e => e.cliente_id || e.sessao || e.id)).size
    }
  }

  const porCliente = new Map<string, any[]>()
  for (const l of lotes) { const a = porCliente.get(l.cliente_id) || []; a.push(l); porCliente.set(l.cliente_id, a) }
  const reais = clientes.filter(c => !c.exemplo)
  const ativos = reais.filter(c => c.status === 'ativo')
  const custoPeriodo = lotes.filter(l => l.pronto_em && l.pronto_em >= desde && !exemplo.has(l.cliente_id)).reduce((s, l) => s + (+l.custo_usd || 0), 0)
  const custoTestes = lotes.filter(l => l.tipo === 'teste' && l.pronto_em && l.pronto_em >= desde && !exemplo.has(l.cliente_id))
  const hb = estado.find(e => e.chave === 'trabalhador')?.valor
  const pag = estado.find(e => e.chave === 'pagamentos')?.valor

  const recentes = (await db.lista('posts', {}, { ordem: 'criado_em', desc: true, limite: 24 })).filter(p => p.status !== 'substituido')
  const links = await db.links(recentes.map(p => p.imagem_path))
  const nomeDe = new Map(clientes.map(c => [c.id, c]))

  return NextResponse.json({
    modo: db.modo(), dias, desde, pagamento_ligado: !!process.env.ASAAS_API_KEY,
    numeros: {
      ativos: ativos.length, mrr: ativos.length * cfg.preco, atrasados: reais.filter(c => c.status === 'atrasado').length,
      aguardando: reais.filter(c => c.status === 'aguardando_pagamento').length, testes: reais.filter(c => c.status === 'teste').length,
      cancelados: reais.filter(c => c.status === 'cancelado').length,
      custo_ia_usd: +custoPeriodo.toFixed(2), custo_teste_medio_usd: custoTestes.length ? +(custoTestes.reduce((s, l) => s + (+l.custo_usd || 0), 0) / custoTestes.length).toFixed(3) : null,
    },
    funil,
    maquina: { trabalhador: hb || null, ligado: !!hb && agora - new Date(hb.em).getTime() < 3 * 60e3, pagamentos: pag || null,
      fila: lotes.filter(l => ['fila', 'gerando', 'espera'].includes(l.status)).length, erros: lotes.filter(l => l.status === 'erro').length },
    clientes: clientes.slice(0, 300).map(c => {
      const ls = porCliente.get(c.id) || []
      return { id: c.id, codigo: c.codigo, marca: c.marca, status: c.status, exemplo: !!c.exemplo, nome: c.nome_negocio, responsavel: c.responsavel, cidade: c.cidade, bairro: c.bairro,
        whatsapp: c.whatsapp, email: c.email, instagram: c.instagram, fotos_modo: c.fotos_modo, pago_ate: c.pago_ate, criado_em: c.criado_em, utm: c.utm, contexto: c.contexto,
        lotes: ls.length, ultimo_lote: ls[0] ? { tipo: ls[0].tipo, status: ls[0].status } : null, custo_usd: +ls.reduce((s, l) => s + (+l.custo_usd || 0), 0).toFixed(2) }
    }),
    fila: lotes.slice(0, 80).map(l => ({ id: l.id, tipo: l.tipo, status: l.status, qtd: l.qtd, tentativas: l.tentativas, erro: l.erro, criado_em: l.criado_em, iniciado_em: l.iniciado_em, pronto_em: l.pronto_em,
      custo_usd: +l.custo_usd || 0, cliente: nomeDe.get(l.cliente_id)?.nome_negocio, codigo: nomeDe.get(l.cliente_id)?.codigo, marca: nomeDe.get(l.cliente_id)?.marca })),
    posts: recentes.map((p, i) => ({ id: p.id, titulo: p.titulo, url: links[i], criado_em: p.criado_em, cliente: nomeDe.get(p.cliente_id)?.nome_negocio, marca: nomeDe.get(p.cliente_id)?.marca })),
    // suporte: uma linha por chamado, com o problema e a solução que a IA adotou
    chamados: chamados.map(ch => ({ id: ch.id, status: ch.status, origem: ch.origem, marca: ch.marca, nome: ch.nome || nomeDe.get(ch.cliente_id)?.nome_negocio, contato: ch.contato,
      codigo: nomeDe.get(ch.cliente_id)?.codigo || null, assunto: ch.assunto, problema: ch.problema, solucao: ch.solucao, ia_respostas: ch.ia_respostas, resolvido_por: ch.resolvido_por || null, nao_lidas: ch.nao_lidas_dono,
      criado_em: ch.criado_em, atualizado_em: ch.atualizado_em })),
    mensagens: eventos.filter(e => e.tipo === 'ajuste_pedido').slice(0, 60).map(e => ({ id: e.id, tipo: e.tipo, em: e.criado_em, texto: e.detalhe?.texto,
      respondido: !!e.detalhe?.respondido, cliente: nomeDe.get(e.cliente_id)?.nome_negocio, codigo: nomeDe.get(e.cliente_id)?.codigo, whatsapp: nomeDe.get(e.cliente_id)?.whatsapp, marca: e.marca })),
    renovacoes: noPeriodo.filter(e => e.tipo === 'renovou').length,
    // o feed mostra acontecimentos (as visitas e os passos do formulário ficam só nas contagens)
    ultimos: noPeriodo.filter(e => !['visita', 'form_passo', 'form_erro', 'form_inicio', 'area_visita', 'baixou', 'copiou_legenda'].includes(e.tipo)).slice(0, 80).map(e => ({ tipo: e.tipo, marca: e.marca, em: e.criado_em, cliente: nomeDe.get(e.cliente_id)?.nome_negocio || null, detalhe: e.detalhe })),
    marcas: cfg.marcas, preco: cfg.preco,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: Request) {
  if (!senhaOk(req.headers.get('x-senha'))) return nega()
  const b = await req.json()
  const c = b.cliente ? await db.um('clientes', { id: b.cliente }) : null
  switch (b.acao) {
    case 'regerar': await db.atualiza('lotes', { id: b.lote }, { status: 'fila', tentativas: 0, erro: null }); break
    case 'pago_manual': {
      if (!c) break
      const pagoAte = asaasMaisUmMes(asaasHoje())
      await db.atualiza('clientes', { id: c.id }, { status: 'ativo', pago_ate: pagoAte })
      await garanteLoteDoCiclo({ ...c, status: 'ativo' }, pagoAte)
      break
    }
    case 'cancelar':
      if (!c) break
      if (c.asaas_assinatura) await cancelaAssinatura(c.asaas_assinatura).catch(() => null)
      await db.atualiza('clientes', { id: c.id }, { status: 'cancelado' })
      await db.evento('cancelou', { cliente_id: c.id, marca: c.marca, detalhe: { por: 'painel' } })
      break
    case 'suporte_ok': {
      const [e] = (await db.lista('eventos', { id: b.evento })) as any[]
      if (e) await db.atualiza('eventos', { id: e.id }, { detalhe: { ...(e.detalhe || {}), respondido: true } })
      break
    }
    case 'apagar': if (c && (c.status === 'teste' || c.exemplo)) await db.apaga('clientes', { id: c.id }); break
    case 'exemplo': if (c) await db.atualiza('clientes', { id: c.id }, { exemplo: !!b.valor }); break
    default: return NextResponse.json({ erro: 'ação' }, { status: 400 })
  }
  return NextResponse.json({ ok: true, marca: c ? cfg.marcas[c.marca as Marca]?.nome : null })
}
