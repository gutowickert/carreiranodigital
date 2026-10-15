// Oito Posts: as regras que mais de uma rota usa (a vista do cliente, a ativação pelo pagamento, o aviso ao dono).
import { oitoDb as db } from './db'
import { oitoConfig as cfg, Marca, precoTxt } from './config'
import { situacao, asaasHoje } from './asaas'
import { vistaInstagram, local } from './postar'

export async function avisaDono(titulo: string, texto: string, dinheiro = false) {
  const topico = process.env.RECADO_NTFY_TOPICO
  if (!topico) return
  await fetch('https://ntfy.sh/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic: topico, title: 'Oito · ' + titulo, message: texto, tags: [dinheiro ? 'moneybag' : 'bell'], priority: dinheiro ? 4 : 3 }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null)
}

// o que a página do cliente pode ver (nada de documento, assinatura ou custo)
export async function vistaCliente(c: any) {
  const [lotes, posts, fotos] = await Promise.all([
    db.lista('lotes', { cliente_id: c.id }, { ordem: 'criado_em', desc: true }),
    db.lista('posts', { cliente_id: c.id }, { ordem: 'criado_em' }),
    db.lista('fotos', { cliente_id: c.id }),
  ])
  const vivos = posts.filter(p => p.status !== 'substituido')
  const urls = await db.links(vivos.map(p => p.imagem_path))
  const [logo] = await db.links([c.logo_path])
  const ajustesMes = posts.filter(p => p.ajuste_pedido && p.criado_em >= new Date(Date.now() - 31 * 86400e3).toISOString()).length
  // "Postar por mim" (14/10): a ligação com o Instagram (nunca o token) e, por post, quando sai e se saiu
  const ig = await vistaInstagram(c)
  return {
    codigo: c.codigo, marca: c.marca, status: c.status, exemplo: !!c.exemplo,
    negocio: { nome: c.nome_negocio, responsavel: c.responsavel, cidade: c.cidade, bairro: c.bairro, instagram: c.instagram, whatsapp: c.whatsapp, email: c.email },
    contexto: c.contexto || {}, cores: c.cores, logo, fotos_modo: c.fotos_modo, fotos: fotos.length, pago_ate: c.pago_ate,
    ajustes_restantes: Math.max(0, cfg.ajustesPorMes - ajustesMes), instagram: ig,
    lotes: lotes.map(l => ({ id: l.id, tipo: l.tipo, mes: l.mes, qtd: l.qtd, status: l.status, criado_em: l.criado_em, pronto_em: l.pronto_em })),
    posts: vivos.map((p, i) => ({ id: p.id, lote_id: p.lote_id, ordem: p.ordem, titulo: p.titulo, legenda: p.legenda, pauta: p.pauta, data_sugerida: p.data_sugerida, status: p.status, ajuste_pedido: p.ajuste_pedido, url: urls[i],
      publicar_em: p.publicar_em || null, publicar_local: local(p.publicar_em, ig.fuso), publicado_em: p.publicado_em || null, nao_publicar: !!p.nao_publicar,
      publicacao_erro: (p.publicacao_tentativas || 0) >= 3 && !p.publicado_em ? p.publicacao_erro || 'erro' : null })),
  }
}

// lê o Asaas e põe o cliente em dia: ativa, marca atraso, e cria o lote do mês pago (um por ciclo)
export async function sincronizaPagamento(c: any) {
  if (!c.asaas_assinatura) return c
  const s = await situacao(c.asaas_assinatura, c.pago_ate)
  const campos: any = {}
  if (s.pagoAte && s.pagoAte !== c.pago_ate) campos.pago_ate = s.pagoAte
  const pagoAte = s.pagoAte || c.pago_ate
  const emDia = !!pagoAte && pagoAte >= asaasHoje()
  const status = s.cancelada ? 'cancelado' : emDia ? 'ativo' : c.status === 'ativo' || c.status === 'atrasado' ? 'atrasado' : c.status
  if (status !== c.status) campos.status = status
  if (Object.keys(campos).length) { await db.atualiza('clientes', { id: c.id }, campos); Object.assign(c, campos) }
  if (emDia) await garanteLoteDoCiclo(c, pagoAte!)
  return c
}

// o ciclo é identificado pelo começo do período pago (pago_ate menos um mês)
export async function garanteLoteDoCiclo(c: any, pagoAte: string) {
  const ini = new Date(pagoAte + 'T12:00:00Z'); ini.setUTCMonth(ini.getUTCMonth() - 1)
  const ciclo = ini.toISOString().slice(0, 10)
  if (await db.um('lotes', { cliente_id: c.id, tipo: 'mes', mes: ciclo })) return
  const primeiro = !(await db.um('lotes', { cliente_id: c.id, tipo: 'mes' }))
  try { await db.insere('lotes', { cliente_id: c.id, tipo: 'mes', mes: ciclo, qtd: cfg.postsMes, status: 'fila' }) } catch (e: any) { if (/duplicate|23505/.test(e.message)) return; throw e }
  await db.evento(primeiro ? 'pagou' : 'renovou', { cliente_id: c.id, marca: c.marca, detalhe: { ciclo } })
  if (primeiro && !c.exemplo) { const { emailsOito } = await import('./email'); await emailsOito.pagamentoConfirmado(c).catch(() => null) }
  // 15/10: o agente avisa no WhatsApp que o pagamento entrou e o mês está sendo feito
  if (primeiro) { const { notificaPagamento } = await import('./agente'); await notificaPagamento(c).catch(() => null) }
  if (!c.exemplo) {
    await avisaDono(primeiro ? 'venda nova 💰' : 'renovação', `${cfg.marcas[c.marca as Marca].nome} · ${c.nome_negocio} (${c.cidade}) · ${precoTxt(c.marca as Marca)}`, true)
    // 13/10: aviso de venda no WhatsApp do Guto, do Rick e do Nando (nunca derruba a venda)
    const { avisaVendaWhats } = await import('./whats')
    await avisaVendaWhats(cfg.marcas[c.marca as Marca].nome, `${primeiro ? 'assinatura nova' : 'renovação'} de ${c.nome_negocio} (${c.cidade || 'sem cidade'}), ${precoTxt(c.marca as Marca)} por mês`).catch(() => null)
  }
}
