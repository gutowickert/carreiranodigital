// Maia: o caminho de tudo que ela gera (03/11). Regra do Guto: primeiro a EQUIPE aprova, depois vai pro DONO.
//   gerando → revisao_equipe → (equipe aprova) → com_dono → (👍 do dono) → aprovada → (equipe liga a campanha) → no_ar
//   a equipe pode pedir ajuste (ajuste_equipe → refaz → revisao_equipe) ou descartar; o dono pode pedir ajuste (ajuste_dono → refaz → revisão da equipe de novo)
// As respostas da Maia na conversa com o dono não passam por aqui: isso é conversa, na hora. Passa por aqui o que é ENTREGA.
import { maiaDb as db } from './db'
import { conversaDoDono, mandaImagem, mandaVideo, mandaTexto, avisaEquipe } from './canal'
import { refaz } from './pecas'

export async function equipeAprova(peca_id: string, por: string) {
  const peca = await db.um('pecas', { id: peca_id })
  if (!peca) throw new Error('peça não existe')
  if (peca.status !== 'revisao_equipe') throw new Error('a peça não está esperando a equipe (' + peca.status + ')')
  const neg = await db.um('negocios', { id: peca.negocio_id })
  // 06/11: amostra da demonstração grátis: aprovada pela equipe, vai direto pro lead pelo número do Oito (sem joinha)
  if (neg?.contexto?.demo) { const { entregaAmostra } = await import('./demo-amostra'); return entregaAmostra(peca, neg, por) }
  const cv = await conversaDoDono(neg)
  let r: any
  if (peca.tipo === 'relatorio' || peca.tipo === 'texto') {
    // 07/11: o resumo da semana leva o link do painel do dono (gerado na hora do envio, vale 30 dias)
    let texto = peca.texto
    if (peca.tipo === 'relatorio') {
      try {
        // 13/11 (relatorios.ts): o relatório do mês leva o link da PÁGINA dele (cards); o resto, o link do painel
        const rel = await import('./relatorios')
        if (rel.ehRelatorioMes(peca)) texto += `\n\nO relatório completo: ${rel.linkRelatorio(neg, peca.id)}`
        else { const { linkPainel } = await import('./painel-dono'); texto += `\n\nTudo em detalhe no teu painel: ${linkPainel(neg)}` }
      } catch { /* sem segredo no servidor: vai sem o link */ }
    }
    r = await mandaTexto(cv, texto)
    await db.atualiza('pecas', { id: peca.id }, { status: 'aprovada', aprovado_equipe_por: por, aprovado_equipe_em: new Date().toISOString(), enviado_dono_em: new Date().toISOString(), wamid_envio: r.wamid || null })
    return { ok: r.ok, status: 'aprovada' }
  }
  const link = await db.link(peca.arquivo_path)
  const legenda = `${peca.gancho}\n\n${peca.texto}\n\n${peca.cta}`
  r = peca.tipo === 'anuncio_video' || peca.tipo === 'video' ? await mandaVideo(cv, link!, legenda, 'maia', peca.id) : await mandaImagem(cv, link!, legenda, 'maia', peca.id)
  await db.atualiza('pecas', { id: peca.id }, { status: 'com_dono', aprovado_equipe_por: por, aprovado_equipe_em: new Date().toISOString(), enviado_dono_em: new Date().toISOString(), wamid_envio: r.wamid || null })
  return { ok: r.ok, status: 'com_dono' }
}

// depois de mandar um lote pro dono, uma mensagem só pedindo o 👍 (e não uma por peça)
export async function pedeJoinha(negocio_id: string) {
  const neg = await db.um('negocios', { id: negocio_id })
  const pend = await db.lista('pecas', { negocio_id, status: 'com_dono' })
  if (!pend.length || !neg) return
  const cv = await conversaDoDono(neg)
  const nome = (neg.dono_nome || '').split(' ')[0]
  await mandaTexto(cv, pend.length === 1
    ? `${nome ? nome + ', ' : ''}esse anúncio tá pronto. Me dá um 👍 que eu deixo engatilhado, ou me diz o que mudar.`
    : `${nome ? nome + ', ' : ''}esses ${pend.length} anúncios tão prontos. Um 👍 aprova todos, ou me diz qual mudar e o quê.`)
}

export async function equipeAjuste(peca_id: string, nota: string, por: string) {
  const peca = await db.um('pecas', { id: peca_id })
  if (!peca) throw new Error('peça não existe')
  await db.atualiza('pecas', { id: peca_id }, { status: 'ajuste_equipe', nota_equipe: nota })
  await db.evento('ajuste_equipe', peca.negocio_id, { peca: peca_id, nota, por })
  return refaz(peca, nota, 'equipe')
}

export async function descarta(peca_id: string, por: string) {
  const [p] = await db.atualiza('pecas', { id: peca_id }, { status: 'descartada' })
  await db.evento('descartada', p?.negocio_id || null, { peca: peca_id, por })
  return p
}

// o 👍 do dono (numa peça, ou em todas as que estão com ele)
export async function donoAprova(negocio_id: string, peca_id?: string | null) {
  const pend = peca_id ? [await db.um('pecas', { id: peca_id, negocio_id })].filter(Boolean) : await db.lista('pecas', { negocio_id, status: 'com_dono' })
  const ok = pend.filter((p: any) => p && p.status === 'com_dono') as any[]
  for (const p of ok) await db.atualiza('pecas', { id: p.id }, { status: 'aprovada', aprovado_dono_em: new Date().toISOString() })
  if (ok.length) {
    const neg = await db.um('negocios', { id: negocio_id })
    await avisaEquipe('dono aprovou 👍', `${neg?.nome}: ${ok.length} peça(s) aprovada(s). A campanha liga quando a equipe ativar.`, negocio_id, true)
    if (neg?.ativa_sozinha) { const { ativaAprovadas } = await import('./meta'); await ativaAprovadas(negocio_id, 'dono') }
  }
  return ok.map((p: any) => ({ id: p.id, gancho: p.gancho }))
}

export async function donoAjuste(negocio_id: string, peca_id: string | null, nota: string) {
  const pend = peca_id ? [await db.um('pecas', { id: peca_id, negocio_id })].filter(Boolean) : await db.lista('pecas', { negocio_id, status: 'com_dono' })
  const alvo: any = pend.find((p: any) => p.status === 'com_dono')
  if (!alvo) return { ok: false, erro: 'nenhuma peça esperando o dono' }
  await db.atualiza('pecas', { id: alvo.id }, { status: 'ajuste_dono', nota_dono: nota })
  await avisaEquipe('dono pediu ajuste', `${nota}`.slice(0, 160), negocio_id)
  await refaz(alvo, nota, 'dono')
  return { ok: true, peca: alvo.id }
}

// a peça que o dono marcou com 👍 (reação do WhatsApp em cima da mensagem da peça)
export async function pecaDaMensagem(negocio_id: string, wamid: string) { return db.um('pecas', { negocio_id, wamid_envio: wamid }) }
