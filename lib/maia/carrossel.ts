// Maia: CARROSSEL com texto nos slides (13/11, aprovado pelo Guto). Até aqui o carrossel do social.ts era só de fotos.
// Agora a Maia monta: 5 a 8 slides 1080x1350, a maioria com a FOTO INTEIRA do dono e o texto por cima, e 1 ou 2 "quebras"
// (fundo na cor da marca com uma frase grande, ou a foto numa moldura). Estilo solto e moderno: nunca 5 caixas iguais.
// O 1º slide é o gancho; o último chama pro perfil ou pro WhatsApp. Fotos sempre reais do dono (nada de imagem gerada).
//   1. a IA escreve o texto de cada slide e a legenda a partir do tema e do tipo de conteúdo do orgânico (notícia do setor,
//      dica ou produto) e escolhe a foto de cada slide (escreveSlides);
//   2. criaCarrossel grava a peça ('post', status gerando), o post da agenda (social_post, tipo carrossel, ainda sem mídia)
//      e a tarefa da oficina ('arte' com dados.variante = 'carrossel' e os slides): sem mudar o banco;
//   3. a oficina devolve um JPG por slide (maia-oficina/carrossel.js); o pecas.oficinaEntregou põe os slides no post e a peça
//      vai pra revisão da equipe, igual a qualquer post. Publicar é o mesmo carrossel de fotos do social.ts.
// Custo: a escrita anota 'uso_ia' com tipo 'carrossel' (custo.ts).
import { maiaDb as db } from './db'
import { naoUsar } from './material'   // 13/11 (material): o que a equipe marcou "não usar" fica de fora
import { emJson } from './ia'
import { avisaEquipe } from './canal'
import { jeitoDaLegenda, quandoIso } from './social'
import { metaReal } from './meta'
import { textoNoTom, ctaNoTom, tomDoNegocio } from './tom'

export type TipoConteudo = 'noticia' | 'dica' | 'produto'
export type Slide = { midia_id: string | null; texto: string; apoio?: string; estilo: 'capa' | 'foto' | 'quebra' | 'final' }

const SOBRE: Record<TipoConteudo, string> = {
  noticia: 'NOTÍCIA RELEVANTE DO SETOR: explica a novidade (só o que está em FONTE) e o que muda pro cliente do negócio. Nunca inventa dado, número, data nem fonte.',
  dica: 'DICA: um conteúdo útil de verdade pro cliente (como escolher, como cuidar, erro comum), em passos curtos. Não vende em todo slide.',
  produto: 'PRODUTO: mostra o produto ou serviço do negócio (pra quem é, o que tem de bom, como pedir), só com o que a base diz.',
}

// 1. os textos dos slides e a legenda (a IA). Devolve os slides já na ordem, com a foto de cada um
export async function escreveSlides(neg: any, d: { tema: string; tipo: TipoConteudo; fonte?: string; midias: { id: string; descricao?: string; legenda?: string }[]; quantos?: number }) {
  const n = Math.max(5, Math.min(8, d.quantos || 6))
  const lista = d.midias.map(m => `- ${m.id} · ${m.descricao || m.legenda || 'sem descrição'}`).join('\n')
  const voce = tomDoNegocio(neg).pessoa === 'voce'
  const r = await emJson<{ slides: Slide[]; legenda: string }>(`${jeitoDaLegenda(neg)}
Agora tu escreves um CARROSSEL de Instagram (${n} slides). Cada slide tem um texto curto que vai GRANDE em cima da foto.
REGRAS:
- Slide 1 (estilo "capa") é o GANCHO: até 9 palavras, faz a pessoa querer arrastar. Sem nome do negócio.
- Slides do meio: um ponto por slide. "texto" até 12 palavras; "apoio" opcional, até 20 palavras (complementa, não repete).
- 1 ou 2 slides do meio com estilo "quebra" (a frase mais forte vai sozinha num fundo de cor, sem foto atrás ou com a foto pequena). Nunca 2 quebras seguidas. Os outros do meio: estilo "foto".
- Último slide (estilo "final"): uma frase de fechamento que leva pro perfil (${voce ? '"Salve pra lembrar na hora de escolher", "Siga o perfil pra mais dicas"' : '"Salva pra lembrar na hora de escolher", "Segue o perfil pra mais dicas"'}), até 10 palavras. NÃO escreve "WhatsApp" nele: post orgânico é posicionamento, não chama pro WhatsApp.
- Se o gancho promete um número ("5 passos", "3 erros"), o número tem que bater com os slides de foto e quebra do meio.
- Cada slide usa uma foto da lista (pelo id). Varia as fotos; só repete se faltar. A quebra pode ir sem foto (midia_id null).
- Usa SÓ o que está em O QUE A MAIA SABE${d.tipo === 'noticia' ? ' e em FONTE' : ''}. Não inventa preço, promoção, prazo nem número. Sem hashtag e sem emoji nos slides.
- A legenda: começa com uma frase que prende, conteúdo útil, tamanho MÉDIO (de 400 a 900 caracteres), no máximo 5 hashtags. Post orgânico é posicionamento: NÃO chama pro WhatsApp.${d.tipo === 'produto' ? ' Como é de produto, pode terminar dizendo que o link está na bio.' : ' Termina levando pro perfil (salvar, seguir, comentar).'}`,
    `NEGÓCIO: ${neg.nome} (${neg.nicho || 'nicho não informado'}), ${neg.cidade || ''}.
O QUE A MAIA SABE: ${JSON.stringify(neg.contexto || {}).slice(0, 3000)}
TIPO DE CONTEÚDO: ${SOBRE[d.tipo] || SOBRE.dica}
TEMA: ${d.tema}${d.fonte ? `\nFONTE (a notícia, use só isso): ${String(d.fonte).slice(0, 3000)}` : ''}
FOTOS DO DONO:\n${lista}
Devolve {"slides":[{"estilo":"capa|foto|quebra|final","midia_id":"...","texto":"...","apoio":""}],"legenda":"..."}`,
    [], { uso: { tipo: 'carrossel', negocio_id: neg.id || null } })
  const ids = new Set(d.midias.map(m => m.id))
  let slides = (r.slides || []).filter(s => s && s.texto).slice(0, 8).map((s, i, a) => ({
    midia_id: s.midia_id && ids.has(s.midia_id) ? s.midia_id : null,
    texto: textoNoTom(neg, String(s.texto).trim()), apoio: s.apoio ? textoNoTom(neg, String(s.apoio).trim()) : '',
    estilo: (i === 0 ? 'capa' : i === a.length - 1 ? 'final' : s.estilo === 'quebra' ? 'quebra' : 'foto') as Slide['estilo'],
  }))
  // rede de segurança: nunca 2 quebras seguidas, no máximo 2; a capa e os slides de foto sempre com foto
  let quebras = 0
  slides = slides.map((s, i) => {
    if (s.estilo === 'quebra' && (quebras >= 2 || slides[i - 1]?.estilo === 'quebra')) s = { ...s, estilo: 'foto' }
    if (s.estilo === 'quebra') quebras++
    return s
  })
  const fotos = d.midias.map(m => m.id)
  slides.forEach((s, i) => { if (!s.midia_id && s.estilo !== 'quebra' && fotos.length) s.midia_id = fotos[i % fotos.length] })
  if (slides.length < 5) throw new Error('a IA devolveu menos de 5 slides')
  return { slides, legenda: textoNoTom(neg, String(r.legenda || '').trim()).slice(0, 2200) }
}

// 2. o carrossel na agenda: peça + post (sem mídia ainda) + tarefa da oficina
export async function criaCarrossel(negocio_id: string, d: { quando: string; tema: string; tipo?: TipoConteudo; fonte?: string; midia_ids?: string[]; quantos?: number; redes?: ('instagram' | 'facebook')[]; por?: string }) {
  const neg = await db.um('negocios', { id: negocio_id })
  if (!neg) throw new Error('negócio não existe')
  if (neg.plano === 'gestao') throw new Error('social media não faz parte da Maia Gestora (plano gestao)')
  const quando = quandoIso(d.quando)
  if (!quando) throw new Error('data/hora inválida (ex.: 2026-11-20T18:00)')
  const todas = (await db.lista('midias', { negocio_id }, { ordem: 'criado_em', desc: true })).filter(m => m.tipo === 'foto' && !naoUsar(m))
  const midias = (d.midia_ids?.length ? todas.filter(m => d.midia_ids!.includes(m.id)) : todas).slice(0, 12)
  if (midias.length < 2) throw new Error('o carrossel precisa de pelo menos 2 fotos do dono')
  const tipo: TipoConteudo = ['noticia', 'dica', 'produto'].includes(d.tipo as any) ? d.tipo as TipoConteudo : 'dica'
  if (tipo === 'noticia' && !d.fonte) throw new Error('carrossel de notícia precisa da notícia (fonte), pra não inventar')
  const { slides, legenda } = await escreveSlides(neg, { tema: d.tema, tipo, fonte: d.fonte, midias: midias as { id: string; descricao?: string; legenda?: string }[], quantos: d.quantos })
  const redes = (d.redes?.length ? d.redes : ['instagram', 'facebook']).filter(r => r === 'instagram' || r === 'facebook')
  const usadas = [...new Set(slides.map(s => s.midia_id).filter(Boolean))] as string[]
  // sem gancho na peça: a legenda do post é gancho+texto+cta (social.legendaDe) e o gancho já está no 1º slide
  const peca = await db.insere('pecas', { negocio_id, tipo: 'post', status: 'gerando', titulo: `Carrossel · ${d.tema}`.slice(0, 120), texto: legenda, midia_ids: usadas })
  const ev = await db.insere('eventos', { negocio_id, tipo: 'social_post', detalhe: {
    peca_id: peca.id, quando, tipo: 'carrossel', midias: [], montagem: 'oficina', tema: d.tema, formato: `carrossel ${tipo}`, objetivo: null, redes,
    status: 'rascunho', ig: {}, fb: {}, tentativas: 0, por: d.por || null, simulado: !metaReal(),
  } })
  await db.insere('tarefas', { negocio_id, tipo: 'arte', peca_id: peca.id, dados: { variante: 'carrossel', slides, post_id: ev.id, tipo_conteudo: tipo, // 13/11 (Guto): orgânico é posicionamento, sem botão nem número do WhatsApp; post de produto leva pro link da bio
    cta: tipo === 'produto' ? 'Link na bio' : '', sem_whatsapp: true } })
  for (const id of usadas) { const m = midias.find(x => x.id === id); if (m) await db.atualiza('midias', { id }, { usos: (m.usos || 0) + 1 }) }
  await db.evento('carrossel_criado', negocio_id, { peca_id: peca.id, slides: slides.length, tipo })
  return { peca_id: peca.id, post_id: ev.id, slides }
}

// 3. a oficina entregou os slides: entram no post da agenda (o 1º vira o arquivo da peça)
export async function carrosselEntregue(tarefa: any, caminhos: string[]) {
  const post = tarefa?.dados?.post_id ? await db.um('eventos', { id: tarefa.dados.post_id, tipo: 'social_post' }) : null
  if (post) await db.atualiza('eventos', { id: post.id }, { detalhe: { ...post.detalhe, midias: caminhos.map(caminho => ({ caminho, tipo: 'foto' })), atualizado_em: new Date().toISOString() } })
  else await avisaEquipe('carrossel sem post', `tarefa ${tarefa?.id}: os slides ficaram prontos mas o post da agenda não existe`, tarefa?.negocio_id || null)
}
