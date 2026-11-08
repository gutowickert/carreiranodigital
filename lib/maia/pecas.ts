// Maia: o que ela cria (03/11). Anúncio em imagem (a foto do dono + o gancho, no padrão da marca), anúncio em vídeo
// (o vídeo curto do dono editado), post e relatório. A IA escreve; a arte e o vídeo saem da "oficina" (maia-oficina/, um
// trabalhador com Chrome e ffmpeg, fora da Vercel), que pega as tarefas na fila. Pronto → vai pra revisão da equipe.
import { maiaDb as db } from './db'
import { emJson, JEITO } from './ia'
import { avisaEquipe } from './canal'
import { tomDoNegocio, acertaTom, ctaNoTom } from './tom'

export type NovaPeca = { tipo: 'anuncio_imagem' | 'anuncio_video' | 'post'; midia_id: string; titulo: string; gancho: string; texto: string; cta: string }

// 08/11 (teste completo): o anúncio fala com o CLIENTE do negócio, então vale o tom do negócio (tom.ts), não o jeito da Maia
// com o dono. No teste, as 6 peças de uma doceria em "você" saíram em "tu" ("Pede o teu orçamento", "Ó o teu lembrete").
const ESCRITORA = 'Tu és a redatora de anúncios da Maia (Carreira no Digital). Escreves anúncios de WhatsApp pra pequenos negócios, em português do Brasil, falando com o CLIENTE do negócio. (Estas instruções falam contigo usando "tu"; no anúncio vale só o JEITO DE FALAR das regras.)'
function regraGancho(neg: any) {
  const t = tomDoNegocio(neg), voce = t.pessoa === 'voce'
  const pessoa = voce
    ? 'trata o leitor por "você" (seu, sua, pra você). NUNCA "tu", "teu", "tua", "pra ti". Imperativo do "você": "Peça", "Chame", "Encomende", "Garanta"'
    : 'trata o leitor por "tu" (teu, tua, pra ti), do jeito do Sul. Imperativo: "Pede", "Chama", "Encomenda"'
  const regiao = t.gaucho ? 'pode ter um toque gaúcho leve, sem forçar' : 'português neutro, sem regionalismo (nada de "ó", "bah", "tri", "guri")'
  return `REGRAS DO ANÚNCIO (da escola, valem sempre):
- JEITO DE FALAR: ${pessoa}; ${regiao}; ${t.estilo === 'formal' ? 'educado e profissional, sem gíria' : 'leve e direto'}.
- O gancho começa pelo PÚBLICO e pela SITUAÇÃO dele (pra quem é e o momento ou a dor: "Vai casar e quer...", "Mãe de primeira viagem que...").
- A região entra com leveza e só quando ajuda (entrega, atendimento perto, quem é da cidade). NUNCA abre todo anúncio com "<cidade> e região" (decisão de 06/11).
- Deixa claro O QUE É e PRA QUEM É. Uma promessa concreta, sem exagero e sem promessa de resultado que o negócio não garante.
- Usa SÓ o que o dono contou (preço, condição, prazo). Não inventa preço, desconto nem brinde.
- Gancho curto (até 9 palavras), pra ir em cima da foto. Texto do anúncio com até 3 frases curtas, sem hashtag, no máximo 1 emoji.
- CTA de WhatsApp curto e do tipo certo: produto pronto ou encomenda → ${voce ? '"Peça pelo WhatsApp", "Chame no WhatsApp", "Encomende pelo WhatsApp"' : '"Pede pelo WhatsApp", "Chama no WhatsApp", "Encomenda pelo WhatsApp"'}; serviço com hora marcada → ${voce ? '"Agende pelo WhatsApp"' : '"Agenda pelo WhatsApp"'}; "orçamento" SÓ quando o preço não é fixo.`
}

// o texto da peça no tom do negócio (rede de segurança sem IA: "teu" → "seu", "Pede" → "Peça" etc.)
const noTom = (neg: any, p: { gancho?: string; texto?: string; cta?: string }) => ({ gancho: acertaTom(neg, p.gancho || ''), texto: acertaTom(neg, p.texto || ''), cta: ctaNoTom(neg, p.cta || '') })

const contextoTxt = (n: any) => `NEGÓCIO: ${n.nome} (${n.nicho || 'nicho não informado'}), ${n.cidade || ''}. Região (só se ajudar, com leveza): ${n.regiao || (n.cidade ? n.cidade + ' e região' : '?')}.
O QUE A MAIA SABE: ${JSON.stringify(n.contexto || {})}`

// gera os textos dos anúncios a partir das fotos e vídeos que o dono mandou, e põe na fila da oficina
export async function geraAnuncios(neg: any, opc: { quantidade?: number; tema?: string; midia_ids?: string[] } = {}) {
  const todas = await db.lista('midias', { negocio_id: neg.id }, { ordem: 'criado_em', desc: true })
  const midias = (opc.midia_ids?.length ? todas.filter(m => opc.midia_ids!.includes(m.id)) : todas.filter(m => m.tipo === 'foto' || m.tipo === 'video')).slice(0, 12)
  if (!midias.length) return { ok: false, erro: 'o dono ainda não mandou fotos nem vídeos' }
  const lista = midias.map(m => `- ${m.id} · ${m.tipo}${m.duracao ? ' ' + Math.round(m.duracao) + 's' : ''} · ${m.descricao || m.legenda || 'sem descrição'}`).join('\n')
  const qtd = Math.min(opc.quantidade || 3, 6)
  const r = await emJson<{ pecas: NovaPeca[] }>(`${ESCRITORA}\nTu também és a estrategista: escolhes o ângulo de cada anúncio.\n${regraGancho(neg)}`,
    `${contextoTxt(neg)}\n\nFOTOS E VÍDEOS QUE O DONO MANDOU:\n${lista}\n\n${opc.tema ? 'TEMA PEDIDO: ' + opc.tema + '\n' : ''}NUNCA usa uma mídia que não é do próprio negócio ou que a descrição diz que não serve pra anúncio (documento, print, orçamento de outra empresa, foto tremida ou escura). Se nenhuma servir, devolve {"pecas":[]}.
Cria ${qtd} anúncios diferentes entre si (ângulos diferentes: o produto, a dor do cliente, a ocasião). Usa uma mídia por anúncio, a melhor pra cada ângulo; vídeo vira anuncio_video.
Devolve: {"pecas":[{"tipo":"anuncio_imagem|anuncio_video","midia_id":"...","titulo":"nome curto interno","gancho":"...","texto":"...","cta":"..."}]}`)
  const criadas: any[] = []
  for (const p of (r.pecas || []).slice(0, qtd)) {
    const m = midias.find(x => x.id === p.midia_id) || midias[0]
    const tipo = m.tipo === 'video' ? 'anuncio_video' : 'anuncio_imagem'
    const tx = noTom(neg, p)
    const peca = await db.insere('pecas', { negocio_id: neg.id, tipo, status: 'gerando', titulo: p.titulo, gancho: tx.gancho, texto: tx.texto, cta: tx.cta, midia_ids: [m.id] })
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
  // 06/11: post do Instagram/Facebook (lib/maia/social.ts) refaz só a legenda, sem regra de anúncio e sem a oficina
  if (peca.tipo === 'post' || peca.tipo === 'video') { const { refazPost } = await import('./social'); const p = await refazPost(peca, nota, quem); if (p) return p }
  const r = await emJson<{ gancho: string; texto: string; cta: string; trocar_midia: boolean }>(`${ESCRITORA}\n${regraGancho(neg)}`,
    `${contextoTxt(neg)}\n\nANÚNCIO ATUAL:\nGancho: ${peca.gancho}\nTexto: ${peca.texto}\nCTA: ${peca.cta}\nMídia: ${m?.descricao || m?.legenda || '-'}\n\nAJUSTE PEDIDO PELA ${quem === 'equipe' ? 'EQUIPE' : 'DONA/DONO'}: ${nota}\n\nRefaz respeitando o pedido. Se o pedido for só da imagem (cor, foto, corte), mantém o texto. Devolve: {"gancho":"...","texto":"...","cta":"...","trocar_midia":false}`)
  const tx = noTom(neg, r)
  const [nova] = await db.atualiza('pecas', { id: peca.id }, { gancho: tx.gancho, texto: tx.texto, cta: tx.cta, status: 'gerando', versao: (peca.versao || 1) + 1, ...(quem === 'equipe' ? { nota_equipe: nota } : { nota_dono: nota }) })
  if (peca.tipo === 'anuncio_imagem' || peca.tipo === 'anuncio_video' || peca.tipo === 'post') {
    await db.insere('tarefas', { negocio_id: peca.negocio_id, tipo: peca.tipo === 'anuncio_video' ? 'video' : 'arte', peca_id: peca.id, dados: { midia_id: peca.midia_ids?.[0], ajuste: nota } })
  } else await db.atualiza('pecas', { id: peca.id }, { status: 'revisao_equipe' })
  return nova
}

// a oficina terminou uma tarefa: guarda o arquivo e a peça vai pra revisão da equipe
export async function oficinaEntregou(tarefa: any, arquivo: { buf?: Buffer; caminho?: string; mime: string } | null, erro?: string) {
  if (erro || !arquivo) {
    const tent = (tarefa.tentativas || 0) + 1
    await db.atualiza('tarefas', { id: tarefa.id }, { status: tent >= 3 ? 'erro' : 'fila', tentativas: tent, resultado: { erro } })
    if (tent >= 3) { await db.atualiza('pecas', { id: tarefa.peca_id }, { status: 'erro' }); await avisaEquipe('a oficina falhou', `peça ${tarefa.peca_id}: ${erro}`, tarefa.negocio_id) }
    return
  }
  const ext = /mp4/.test(arquivo.mime) ? 'mp4' : /png/.test(arquivo.mime) ? 'png' : 'jpg'
  const caminho = arquivo.caminho || await db.sobe(`${tarefa.negocio_id}/pecas/${tarefa.peca_id}-${Date.now()}.${ext}`, arquivo.buf!, arquivo.mime)
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
