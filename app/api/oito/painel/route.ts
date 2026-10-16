// Oito Posts: o painel do dono (mesma senha do painel do Recado, no cabeçalho x-senha).
//   GET ?dias=1|7|30            → funil por marca, clientes, fila, posts recentes, mensagens, dinheiro e saúde da máquina
//       &regiao=br|latam        → (15/10) só os dados da região: br = Salão/Prato/Pata no Feed (R$), latam = Feed al Día (US$). Sem o parâmetro, tudo.
//   POST {acao, ...}            → regerar · pago_manual · cancelar · suporte_ok · apagar · exemplo
import { NextResponse } from 'next/server'
import { oitoDb as db } from '@/lib/oito/db'
import { senhaOk, oitoConfig as cfg, Marca, MARCAS, PRECO_USD, regiaoDe, lerRegiao } from '@/lib/oito/config'
import { cancelaAssinatura, asaasHoje, asaasMaisUmMes } from '@/lib/oito/asaas'
import { garanteLoteDoCiclo } from '@/lib/oito/servico'

export const maxDuration = 60
const nega = () => NextResponse.json({ erro: 'senha' }, { status: 401 })
// 16/10: o funil novo (BR e LATAM iguais): visita → começou o teste (formulário) → pediu o teste → teste pronto → o WhatsApp chamou
// → respondeu no WhatsApp → aprovou o teste → quis assinar (clicou em assinar na tela ou pediu a fatura/link no WhatsApp) → pagou.
// whats_clique (o link pequeno "Prefere fazer pelo WhatsApp?") vai junto, pra aparecer à parte.
const ETAPAS = ['visita', 'form_inicio', 'lead', 'teste_pronto', 'wa_chamado', 'wa_conversa', 'teste_aprovado', 'quer_assinar', 'pagou', 'whats_clique'] as const
// de que eventos sai cada etapa (o padrão é o evento com o mesmo nome)
const EVENTOS_DA_ETAPA: Record<string, (e: any) => boolean> = {
  wa_chamado: e => e.tipo === 'wa_followup' && +e.detalhe?.etapa === 1,
  wa_conversa: e => e.tipo === 'wa_recebida' && !e.detalhe?.simulado,
  quer_assinar: e => e.tipo === 'assinar_clique' || e.tipo === 'assinatura_aberta',
}
// status com dinheiro em jogo: esses clientes continuam na lista e nos números mesmo depois de zerar o painel
const EM_ABERTO = ['ativo', 'aguardando_pagamento', 'atrasado']

export async function GET(req: Request) {
  if (!senhaOk(req.headers.get('x-senha'))) return nega()
  const u = new URL(req.url), dias = Math.min(90, Math.max(1, +(u.searchParams.get('dias') || 1)))
  // "hoje" começa à meia-noite de Brasília
  const agora = Date.now(), meiaNoite = new Date(new Date(agora - 3 * 3600e3).toISOString().slice(0, 10) + 'T03:00:00Z').getTime()
  let desde = new Date(dias === 1 ? meiaNoite : agora - dias * 86400e3).toISOString(), fim = new Date(agora + 60e3).toISOString()
  // período personalizado (13/10): ?de=AAAA-MM-DD&ate=AAAA-MM-DD, dias inteiros no horário de Brasília
  const de = u.searchParams.get('de'), ateP = u.searchParams.get('ate')
  if (de && ateP && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(de) && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(ateP) && de <= ateP) {
    desde = de + 'T03:00:00.000Z'
    fim = new Date(new Date(ateP + 'T03:00:00.000Z').getTime() + 86400e3).toISOString()
  }

  const [clientesT, lotesT, eventosT, estado, chamadosT] = await Promise.all([
    db.lista('clientes', {}, { ordem: 'criado_em', desc: true }),
    db.lista('lotes', {}, { ordem: 'criado_em', desc: true, limite: 400 }),
    db.lista('eventos', {}, { ordem: 'criado_em', desc: true, limite: 5000 }),
    db.lista('estado', {}),
    db.lista('chamados', {}, { ordem: 'atualizado_em', desc: true, limite: 200 }).catch(() => [] as any[]),
  ])
  // 15/10: o painel zerado (pedido do Guto): conta só o que aconteceu depois de oito_estado.painel_desde; os dados antigos continuam no banco
  const zero = String(estado.find(e => e.chave === 'painel_desde')?.valor || '')
  const depois = (d: any) => !zero || String(d || '') >= zero
  // 15/10: ?regiao=br|latam corta tudo aqui no servidor (não vai dado da outra região); sem o parâmetro, as duas juntas como antes
  const regiao = lerRegiao(u.searchParams.get('regiao'))
  const marcaCli = new Map(clientesT.map(c => [c.id, c.marca]))
  const naReg = (marca: any, clienteId?: any) => !regiao || regiaoDe(marca || (clienteId ? marcaCli.get(clienteId) : null)) === regiao
  const MS = MARCAS.filter(m => !regiao || regiaoDe(m) === regiao)
  const exemplo = new Set(clientesT.filter(c => c.exemplo).map(c => c.id))
  // 16/10: quem tem assinatura ou pagamento em aberto continua visível depois de zerar (senão some quem está no meio da compra)
  const clientes = clientesT.filter(c => (depois(c.criado_em) || EM_ABERTO.includes(c.status)) && naReg(c.marca)), lotes = lotesT.filter(l => depois(l.criado_em) && naReg(null, l.cliente_id))
  const eventos = eventosT.filter(e => depois(e.criado_em) && naReg(e.marca, e.cliente_id)), chamados = chamadosT.filter(ch => depois(ch.atualizado_em) && naReg(ch.marca, ch.cliente_id))
  // 16/10: depois de zerar, o funil é uma turma nova: evento de cliente que entrou antes do zero (ex.: o WhatsApp chamando um teste antigo) não conta
  const daTurma = new Set(clientesT.filter(c => depois(c.criado_em)).map(c => c.id))
  const real = (e: any) => !e.cliente_id || (!exemplo.has(e.cliente_id) && (!zero || daTurma.has(e.cliente_id)))
  const noPeriodoT = eventos.filter(e => e.criado_em >= desde && e.criado_em < fim && real(e))
  // 15/10: clique sem visita é robô (o revisor da Meta abre a página e clica em todos os botões no mesmo segundo): só conta clique de sessão que carregou a página
  const comVisita = new Set(noPeriodoT.filter(e => e.tipo === 'visita' && e.sessao).map(e => e.sessao))
  const noPeriodo = noPeriodoT.filter(e => !['whats_clique', 'form_inicio'].includes(e.tipo) || (e.sessao && comVisita.has(e.sessao)) || e.cliente_id)

  // funil: pessoas distintas por etapa (sessão antes do cadastro, cliente depois)
  const funil: Record<string, Record<string, number>> = {}
  for (const m of regiao ? ['todas', ...MS] : ['todas', 'br', 'es', ...MARCAS]) {
    funil[m] = {}
    for (const et of ETAPAS) {
      // wa_conversa: conversas distintas do WhatsApp que mandaram mensagem no período (fora as simuladas); o resto, pessoas distintas
      const daEtapa = EVENTOS_DA_ETAPA[et] || ((e: any) => e.tipo === et)
      const ev = noPeriodo.filter(e => daEtapa(e) && (m === 'todas' || e.marca === m || (m === 'es' || m === 'br') && !!e.marca && cfg.marcas[e.marca as Marca]?.idioma === (m === 'es' ? 'es' : 'pt')))
      funil[m][et] = new Set(ev.map(e => et === 'wa_conversa' ? e.detalhe?.conversa || e.id : e.cliente_id || e.sessao || e.id)).size
    }
  }

  const porCliente = new Map<string, any[]>()
  for (const l of lotes) { const a = porCliente.get(l.cliente_id) || []; a.push(l); porCliente.set(l.cliente_id, a) }
  const reais = clientes.filter(c => !c.exemplo)
  const ativos = reais.filter(c => c.status === 'ativo')
  const custoPeriodo = lotes.filter(l => l.pronto_em && l.pronto_em >= desde && l.pronto_em < fim && !exemplo.has(l.cliente_id)).reduce((s, l) => s + (+l.custo_usd || 0), 0)
  const custoTestes = lotes.filter(l => l.tipo === 'teste' && l.pronto_em && l.pronto_em >= desde && l.pronto_em < fim && !exemplo.has(l.cliente_id))
  const hb = estado.find(e => e.chave === 'trabalhador')?.valor
  const pag = estado.find(e => e.chave === 'pagamentos')?.valor

  const recentes = (await db.lista('posts', {}, { ordem: 'criado_em', desc: true, limite: regiao ? 160 : 40 })).filter(p => p.status !== 'substituido' && naReg(null, p.cliente_id)).slice(0, 40)
  const links = await db.links(recentes.map(p => p.imagem_path))
  const nomeDe = new Map(clientes.map(c => [c.id, c]))

  return NextResponse.json({
    modo: db.modo(), dias, desde, fim, regiao, moeda: regiao === 'latam' ? 'USD' : 'BRL', pagamento_ligado: !!process.env.ASAAS_API_KEY, hotmart_ligado: !!process.env.OITO_HOTMART_HOTTOK,
    numeros: {
      ativos: ativos.length, mrr: ativos.filter(c => cfg.marcas[c.marca as Marca]?.moeda !== 'USD').length * cfg.preco, mrr_usd: ativos.filter(c => cfg.marcas[c.marca as Marca]?.moeda === 'USD').reduce((s, c) => s + cfg.marcas[c.marca as Marca].preco, 0), atrasados: reais.filter(c => c.status === 'atrasado').length,
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
        whatsapp: c.whatsapp, email: c.email, instagram: c.instagram, pais: c.pais || 'BR', gateway: c.gateway || 'asaas', fotos_modo: c.fotos_modo, pago_ate: c.pago_ate, criado_em: c.criado_em, utm: c.utm, contexto: c.contexto,
        lotes: ls.length, ultimo_lote: ls[0] ? { tipo: ls[0].tipo, status: ls[0].status } : null, custo_usd: +ls.reduce((s, l) => s + (+l.custo_usd || 0), 0).toFixed(2) }
    }),
    fila: lotes.slice(0, 80).map(l => ({ id: l.id, tipo: l.tipo, status: l.status, qtd: l.qtd, tentativas: l.tentativas, erro: l.erro, criado_em: l.criado_em, iniciado_em: l.iniciado_em, pronto_em: l.pronto_em,
      custo_usd: +l.custo_usd || 0, cliente: nomeDe.get(l.cliente_id)?.nome_negocio, codigo: nomeDe.get(l.cliente_id)?.codigo, marca: nomeDe.get(l.cliente_id)?.marca })),
    posts: recentes.map((p, i) => ({ id: p.id, titulo: p.titulo, url: links[i], revisao: p.revisao || null, criado_em: p.criado_em, cliente: nomeDe.get(p.cliente_id)?.nome_negocio, marca: nomeDe.get(p.cliente_id)?.marca || marcaCli.get(p.cliente_id) || null })),
    // suporte: uma linha por chamado, com o problema e a solução que a IA adotou
    chamados: chamados.map(ch => ({ id: ch.id, status: ch.status, origem: ch.origem, marca: ch.marca, nome: ch.nome || nomeDe.get(ch.cliente_id)?.nome_negocio, contato: ch.contato,
      codigo: nomeDe.get(ch.cliente_id)?.codigo || null, assunto: ch.assunto, problema: ch.problema, solucao: ch.solucao, ia_respostas: ch.ia_respostas, resolvido_por: ch.resolvido_por || null, nao_lidas: ch.nao_lidas_dono,
      criado_em: ch.criado_em, atualizado_em: ch.atualizado_em })),
    mensagens: eventos.filter(e => e.tipo === 'ajuste_pedido').slice(0, 60).map(e => ({ id: e.id, tipo: e.tipo, em: e.criado_em, texto: e.detalhe?.texto,
      respondido: !!e.detalhe?.respondido, cliente: nomeDe.get(e.cliente_id)?.nome_negocio, codigo: nomeDe.get(e.cliente_id)?.codigo, whatsapp: nomeDe.get(e.cliente_id)?.whatsapp, marca: e.marca })),
    renovacoes: noPeriodo.filter(e => e.tipo === 'renovou').length,
    // o feed mostra acontecimentos (as visitas e os passos do formulário ficam só nas contagens)
    ultimos: noPeriodo.filter(e => !['visita', 'form_passo', 'form_erro', 'form_inicio', 'area_visita', 'baixou', 'copiou_legenda', 'wa_recebida'].includes(e.tipo)).slice(0, 80).map(e => ({ tipo: e.tipo, marca: e.marca, em: e.criado_em, cliente: nomeDe.get(e.cliente_id)?.nome_negocio || null, detalhe: e.detalhe })),
    marcas: Object.fromEntries(MS.map(m => [m, cfg.marcas[m]])), preco: regiao === 'latam' ? PRECO_USD : cfg.preco,
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
