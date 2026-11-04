// Maia: o que ela cria (03/11). Anúncio em imagem (a foto do dono + o gancho, no padrão da marca), anúncio em vídeo
// (o vídeo curto do dono editado), post e relatório. A IA escreve; a arte e o vídeo saem da "oficina" (maia-oficina/, um
// trabalhador com Chrome e ffmpeg, fora da Vercel), que pega as tarefas na fila. Pronto → vai pra revisão da equipe.
import { maiaDb as db } from './db'
import { emJson, JEITO } from './ia'
import { avisaEquipe } from './canal'

export type NovaPeca = { tipo: 'anuncio_imagem' | 'anuncio_video' | 'post'; midia_id: string; titulo: string; gancho: string; texto: string; cta: string }

const REGRA_GANCHO = `REGRAS DO ANÚNCIO (da escola, valem sempre):
- Todo gancho de anúncio local leva a REGIÃO ("<cidade> e região", ex.: "Lajeado e região") E o PÚBLICO (pra quem é). Só muda a ordem.
- Deixa claro O QUE É e PRA QUEM É. Uma promessa concreta, sem exagero e sem promessa de resultado que o negócio não garante.
- Usa SÓ o que o dono contou (preço, condição, prazo). Não inventa preço, desconto nem brinde.
- Gancho curto (até 9 palavras), pra ir em cima da foto. Texto do anúncio com até 3 frases curtas, "tu", sem hashtag, no máximo 1 emoji.
- CTA de WhatsApp curto ("Chama no WhatsApp", "Agenda pelo WhatsApp", "Pede o teu orçamento").`

const contextoTxt = (n: any) => `NEGÓCIO: ${n.nome} (${n.nicho || 'nicho não informado'}), ${n.cidade || ''}. Região do gancho: ${n.regiao || (n.cidade ? n.cidade + ' e região' : '?')}.
O QUE A MAIA SABE: ${JSON.stringify(n.contexto || {})}`

// gera os textos dos anúncios a partir das fotos e vídeos que o dono mandou, e põe na fila da oficina
export async function geraAnuncios(neg: any, opc: { quantidade?: number; tema?: string; midia_ids?: string[] } = {}) {
  const todas = await db.lista('midias', { negocio_id: neg.id }, { ordem: 'criado_em', desc: true })
  const midias = (opc.midia_ids?.length ? todas.filter(m => opc.midia_ids!.includes(m.id)) : todas.filter(m => m.tipo === 'foto' || m.tipo === 'video')).slice(0, 12)
  if (!midias.length) return { ok: false, erro: 'o dono ainda não mandou fotos nem vídeos' }
  const lista = midias.map(m => `- ${m.id} · ${m.tipo}${m.duracao ? ' ' + Math.round(m.duracao) + 's' : ''} · ${m.descricao || m.legenda || 'sem descrição'}`).join('\n')
  const qtd = Math.min(opc.quantidade || 3, 6)
  const r = await emJson<{ pecas: NovaPeca[] }>(`${JEITO}\n\nAgora tu estás no papel de estrategista e redatora de anúncios.\n${REGRA_GANCHO}`,
    `${contextoTxt(neg)}\n\nFOTOS E VÍDEOS QUE O DONO MANDOU:\n${lista}\n\n${opc.tema ? 'TEMA PEDIDO: ' + opc.tema + '\n' : ''}NUNCA usa uma mídia que não é do próprio negócio ou que a descrição diz que não serve pra anúncio (documento, print, orçamento de outra empresa, foto tremida ou escura). Se nenhuma servir, devolve {"pecas":[]}.
Cria ${qtd} anúncios diferentes entre si (ângulos diferentes: o produto, a dor do cliente, a ocasião). Usa uma mídia por anúncio, a melhor pra cada ângulo; vídeo vira anuncio_video.
Devolve: {"pecas":[{"tipo":"anuncio_imagem|anuncio_video","midia_id":"...","titulo":"nome curto interno","gancho":"...","texto":"...","cta":"..."}]}`)
  const criadas: any[] = []
  for (const p of (r.pecas || []).slice(0, qtd)) {
    const m = midias.find(x => x.id === p.midia_id) || midias[0]
    const tipo = m.tipo === 'video' ? 'anuncio_video' : 'anuncio_imagem'
    const peca = await db.insere('pecas', { negocio_id: neg.id, tipo, status: 'gerando', titulo: p.titulo, gancho: p.gancho, texto: p.texto, cta: p.cta, midia_ids: [m.id] })
    await db.insere('tarefas', { negocio_id: neg.id, tipo: tipo === 'anuncio_video' ? 'video' : 'arte', peca_id: peca.id, dados: { midia_id: m.id } })
    await db.atualiza('midias', { id: m.id }, { usos: (m.usos || 0) + 1 })
    criadas.push(peca)
  }
  await db.evento('pecas_geradas', neg.id, { quantas: criadas.length, tema: opc.tema || null })
  return { ok: true, pecas: criadas.map(c => ({ id: c.id, tipo: c.tipo, gancho: c.gancho })) }
}

// refaz uma peça com o ajuste pedido (pela equipe ou pelo dono): novo texto e nova arte, versão + 1
export async function refaz(peca: any, nota: string, quem: 'equipe' | 'dono') {
  const neg = await db.um('negocios', { id: peca.negocio_id })
  const m = peca.midia_ids?.[0] ? await db.um('midias', { id: peca.midia_ids[0] }) : null
  const r = await emJson<{ gancho: string; texto: string; cta: string; trocar_midia: boolean }>(`${JEITO}\n${REGRA_GANCHO}`,
    `${contextoTxt(neg)}\n\nANÚNCIO ATUAL:\nGancho: ${peca.gancho}\nTexto: ${peca.texto}\nCTA: ${peca.cta}\nMídia: ${m?.descricao || m?.legenda || '-'}\n\nAJUSTE PEDIDO PELA ${quem === 'equipe' ? 'EQUIPE' : 'DONA/DONO'}: ${nota}\n\nRefaz respeitando o pedido. Se o pedido for só da imagem (cor, foto, corte), mantém o texto. Devolve: {"gancho":"...","texto":"...","cta":"...","trocar_midia":false}`)
  const [nova] = await db.atualiza('pecas', { id: peca.id }, { gancho: r.gancho, texto: r.texto, cta: r.cta, status: 'gerando', versao: (peca.versao || 1) + 1, ...(quem === 'equipe' ? { nota_equipe: nota } : { nota_dono: nota }) })
  if (peca.tipo === 'anuncio_imagem' || peca.tipo === 'anuncio_video' || peca.tipo === 'post') {
    await db.insere('tarefas', { negocio_id: peca.negocio_id, tipo: peca.tipo === 'anuncio_video' ? 'video' : 'arte', peca_id: peca.id, dados: { midia_id: peca.midia_ids?.[0], ajuste: nota } })
  } else await db.atualiza('pecas', { id: peca.id }, { status: 'revisao_equipe' })
  return nova
}

// a oficina terminou uma tarefa: guarda o arquivo e a peça vai pra revisão da equipe
export async function oficinaEntregou(tarefa: any, arquivo: { buf: Buffer; mime: string } | null, erro?: string) {
  if (erro || !arquivo) {
    const tent = (tarefa.tentativas || 0) + 1
    await db.atualiza('tarefas', { id: tarefa.id }, { status: tent >= 3 ? 'erro' : 'fila', tentativas: tent, resultado: { erro } })
    if (tent >= 3) { await db.atualiza('pecas', { id: tarefa.peca_id }, { status: 'erro' }); await avisaEquipe('a oficina falhou', `peça ${tarefa.peca_id}: ${erro}`, tarefa.negocio_id) }
    return
  }
  const ext = /mp4/.test(arquivo.mime) ? 'mp4' : /png/.test(arquivo.mime) ? 'png' : 'jpg'
  const caminho = await db.sobe(`${tarefa.negocio_id}/pecas/${tarefa.peca_id}-${Date.now()}.${ext}`, arquivo.buf, arquivo.mime)
  await db.atualiza('tarefas', { id: tarefa.id }, { status: 'feito', resultado: { arquivo: caminho } })
  const peca = await db.um('pecas', { id: tarefa.peca_id })
  const neg = await db.um('negocios', { id: tarefa.negocio_id })
  await db.atualiza('pecas', { id: tarefa.peca_id }, { arquivo_path: caminho, status: 'revisao_equipe' })
  await avisaEquipe('peça pra aprovar', `${neg?.nome}: ${peca?.gancho || peca?.titulo}`, tarefa.negocio_id)
  // sem a aprovação da equipe (só quando o Guto desligar), já vai pro dono
  if (neg?.aprovacao_equipe === false) { const { equipeAprova } = await import('./aprovacao'); await equipeAprova(tarefa.peca_id, 'automatico') }
}

// o relatório da semana: a IA escreve com os números do sistema; vai pra revisão da equipe como uma peça
export async function geraRelatorio(neg: any, n: any) {
  const r = await emJson<{ texto: string }>(`${JEITO}\nAgora tu és a analista de resultados. Escreve o resumo da semana pro dono, no WhatsApp.`,
    `${contextoTxt(neg)}\n\nNÚMEROS DA SEMANA (do sistema; não inventa nenhum outro):\n${JSON.stringify(n)}\n\nEscreve 3 a 5 linhas curtas: quanto investiu, quantas conversas, quantas vendas e quanto vendeu, quanto custou cada venda, e UMA recomendação pra próxima semana. Se algum número não existe (null), não fala dele. Devolve: {"texto":"..."}`)
  const peca = await db.insere('pecas', { negocio_id: neg.id, tipo: 'relatorio', status: 'revisao_equipe', titulo: `Resumo ${n.periodo.de} a ${n.periodo.ate}`, texto: r.texto })
  await avisaEquipe('relatório pra aprovar', `${neg.nome}: resumo da semana`, neg.id)
  return peca
}
