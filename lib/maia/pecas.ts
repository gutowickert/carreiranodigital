// Maia: o que ela cria (03/11). Anúncio em imagem (a foto do dono + o gancho, no padrão da marca), anúncio em vídeo
// (o vídeo curto do dono editado), post e relatório. A IA escreve; a arte e o vídeo saem da "oficina" (maia-oficina/, um
// trabalhador com Chrome e ffmpeg, fora da Vercel), que pega as tarefas na fila. Pronto → vai pra revisão da equipe.
import { maiaDb as db } from './db'
import { emJson, JEITO } from './ia'
import { avisaEquipe } from './canal'
import { tomDoNegocio, acertaTom, ctaNoTom } from './tom'
import { textoRegrasAprendidas } from './aprendizado'   // 13/11 (aprendizado): as regras que a equipe aprovou

export type NovaPeca = { tipo: 'anuncio_imagem' | 'anuncio_video' | 'post'; midia_id: string; titulo: string; gancho: string; texto: string; cta: string; angulo?: string; preco_na_arte?: string | null }

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
- O nome do negócio é o que está em NEGÓCIO. Nome ou marca que aparece na foto (embalagem, logo, placa) não entra no texto.
- A descrição da foto/vídeo serve SÓ pra escolher a mídia. Detalhe do produto (o que vem junto, sabor, recheio, acompanhamento, embalagem, quantidade) só se estiver em O QUE A MAIA SABE. A foto pode mostrar coisas que NÃO vêm no produto (potinhos, molhos, decoração, cenário): não cita nada disso.
- Anúncio de PREÇO: o preço da base vai NO GANCHO (o gancho é o texto que aparece grande na arte), ex.: "Caixa com 4 cookies por R$ 28".
- Nada de "hoje", "amanhã", "essa semana" nem dia da semana no anúncio: ele roda por dias e semanas (no domingo, "amanhã" vira uma segunda em que o negócio pode estar fechado). Prazo vai como regra: "com 1 dia de antecedência".
- Gancho curto (até 9 palavras), pra ir em cima da foto. Texto do anúncio com até 3 frases curtas, sem hashtag, no máximo 1 emoji.
- CTA de WhatsApp curto e do tipo certo: produto pronto ou encomenda → ${voce ? '"Peça pelo WhatsApp", "Chame no WhatsApp", "Encomende pelo WhatsApp"' : '"Pede pelo WhatsApp", "Chama no WhatsApp", "Encomenda pelo WhatsApp"'}; serviço com hora marcada → ${voce ? '"Agende pelo WhatsApp"' : '"Agenda pelo WhatsApp"'}; "orçamento" SÓ quando o preço não é fixo.${textoRegrasAprendidas(neg, 'criacao')}`
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
  // 08/11 (teste completo, 8e): o que já saiu com cada mídia (pra não repetir a mesma foto com o mesmo layout)
  const usados = await layoutsUsados(neg.id)
  const recentes = (await db.lista('pecas', { negocio_id: neg.id }, { ordem: 'criado_em', desc: true, limite: 12 })).filter(p => !['descartada', 'erro'].includes(p.status) && p.tipo !== 'relatorio' && p.gancho)
  const recentesTxt = recentes.length ? `\nANÚNCIOS QUE JÁ EXISTEM (não repete o mesmo gancho nem o mesmo ângulo com a mesma mídia): ${recentes.map(p => `"${p.gancho}" (mídia ${p.midia_ids?.[0] || '-'})`).join('; ')}` : ''
  const r = await emJson<{ pecas: NovaPeca[] }>(`${ESCRITORA}\nTu também és a estrategista: escolhes o ângulo de cada anúncio.\n${regraGancho(neg)}`,
    `${contextoTxt(neg)}\n\nFOTOS E VÍDEOS QUE O DONO MANDOU:\n${lista}\n\n${opc.tema ? 'TEMA PEDIDO: ' + opc.tema + '\n' : ''}NUNCA usa uma mídia que não é do próprio negócio ou que a descrição diz que não serve pra anúncio (documento, print, orçamento de outra empresa, foto tremida ou escura). Se nenhuma servir, devolve {"pecas":[]}.
Cria ${qtd} anúncios diferentes entre si (ângulos diferentes: o produto, a dor do cliente, a ocasião). Usa uma mídia por anúncio, a melhor pra cada ângulo; vídeo vira anuncio_video. Varia as mídias: só repete uma se não tiver outra que sirva pro ângulo.${recentesTxt}
"angulo": produto, preco, presente, ocasiao, dor, encomenda, lembrete ou prova. "preco_na_arte": o preço da base que vai em destaque na arte (ex.: "R$ 28") quando o ângulo é preço; senão null.
Devolve: {"pecas":[{"tipo":"anuncio_imagem|anuncio_video","midia_id":"...","titulo":"nome curto interno","angulo":"...","gancho":"...","texto":"...","cta":"...","preco_na_arte":null}]}`)
  const criadas: any[] = []
  const lote = await semDiaRelativo(neg, (r.pecas || []).slice(0, qtd), nomesDaFoto(neg, midias))
  const videosNoLote = new Set<string>(), fotosNoLote = new Map<string, number>()
  for (const p of lote) {
    let m = midias.find(x => x.id === p.midia_id) || midias[0]
    // 08/11 (reteste): o mesmo vídeo não sai em 2 anúncios quando ainda tem foto boa sobrando: vai a foto menos usada
    if (m.tipo === 'video' && (videosNoLote.has(m.id) || recentes.some(r => r.midia_ids?.[0] === m.id))) { const f = midias.filter(x => x.tipo === 'foto').sort((a, b) => (fotosNoLote.get(a.id) || 0) - (fotosNoLote.get(b.id) || 0))[0]; if (f) m = f }
    if (m.tipo === 'video') videosNoLote.add(m.id); else fotosNoLote.set(m.id, (fotosNoLote.get(m.id) || 0) + 1)
    const tipo = m.tipo === 'video' ? 'anuncio_video' : 'anuncio_imagem'
    const tx = noTom(neg, p)
    // 08/11 (teste completo, 8d): anúncio de preço sem o preço na arte → o preço da base vai em destaque (etiqueta da arte)
    const preco = precoNaArte(neg, p, tx.gancho)
    // 8e: o layout da arte é escolhido aqui (não mais pelo sorteio do id): a mesma mídia nunca repete o layout
    const layout = tipo === 'anuncio_imagem' ? escolheLayout(usados, m.id) : null
    const peca = await db.insere('pecas', { negocio_id: neg.id, tipo, status: 'gerando', titulo: p.titulo, gancho: tx.gancho, texto: tx.texto, cta: tx.cta, midia_ids: [m.id] })
    await db.insere('tarefas', { negocio_id: neg.id, tipo: tipo === 'anuncio_video' ? 'video' : 'arte', peca_id: peca.id, dados: { midia_id: m.id, ...(layout ? { layout } : {}), ...(preco ? { preco } : {}), ...(p.angulo ? { angulo: p.angulo } : {}) } })
    await db.atualiza('midias', { id: m.id }, { usos: (m.usos || 0) + 1 })
    criadas.push(peca)
  }
  await db.evento('pecas_geradas', neg.id, { quantas: criadas.length, tema: opc.tema || null })
  return { ok: true, pecas: criadas.map(c => ({ id: c.id, tipo: c.tipo, gancho: c.gancho })) }
}

// ---- 08/11 (teste completo, 8d e 8e) ----
export const LAYOUTS = ['cabecalho', 'base', 'faixa']
// mídia → layouts que já saíram com ela (peças dos últimos 30 dias que não foram descartadas)
async function layoutsUsados(negocio_id: string, menos: string | null = null) {
  const usados = new Map<string, string[]>()
  const vivas = new Set((await db.lista('pecas', { negocio_id })).filter(p => !['descartada', 'erro'].includes(p.status) && Date.now() - Date.parse(p.criado_em || 0) < 30 * 86400e3).map(p => p.id))
  for (const t of await db.lista('tarefas', { negocio_id }, { ordem: 'criado_em' })) {
    if (t.tipo !== 'arte' || !vivas.has(t.peca_id) || t.peca_id === menos || !t.dados?.layout || !t.dados?.midia_id) continue
    usados.set(t.dados.midia_id, [...(usados.get(t.dados.midia_id) || []), t.dados.layout])
  }
  return usados
}
function escolheLayout(usados: Map<string, string[]>, midia_id: string) {
  const ja = usados.get(midia_id) || []
  const total = (l: string) => [...usados.values()].flat().filter(x => x === l).length
  const livre = LAYOUTS.filter(l => !ja.includes(l))
  const l = (livre.length ? livre : LAYOUTS).slice().sort((a, b) => total(a) - total(b) || ja.filter(x => x === a).length - ja.filter(x => x === b).length)[0]
  usados.set(midia_id, [...ja, l])
  return l
}
// o preço que vai em destaque na arte: só quando o ângulo é preço, o gancho não tem o preço e o valor existe na base
function precoNaArte(neg: any, p: NovaPeca, gancho: string) {
  const ehPreco = /^pre[cç]o/i.test(p.angulo || '') || /\bpre[cç]o\b/i.test(p.titulo || '')
  if (!ehPreco || /R\$\s?\d/.test(gancho)) return null
  const cand = String(p.preco_na_arte || '').match(/R\$\s?\d+(?:[.,]\d{2})?/)?.[0] || String(p.texto || '').match(/R\$\s?\d+(?:[.,]\d{2})?/)?.[0]
  if (!cand) return null
  // o valor (parte inteira) tem que estar na base: nunca um preço inventado
  const inteiro = (cand.match(/\d+/) || [''])[0]
  return inteiro && JSON.stringify(neg.contexto || {}).split(/\D+/).includes(inteiro) ? cand.replace(/R\$\s?/, 'R$ ') : null
}

// 08/11 (teste completo): "Quer cookies amanhã? Encomenda hoje." num anúncio que roda no domingo e na segunda (fechado).
// E (reteste): "Viu a Bocadinho no Instagram?" num negócio que se chama Doceria Simulada: o nome veio da embalagem na foto.
// Peça com dia relativo ou com nome que só aparece na foto é reescrita uma vez; se ainda vier, sai a frase (ou a palavra).
const DIA_RELATIVO = /\b(hoje|amanh[ãa]|depois de amanh[ãa]|essa semana|esta semana|neste (fim de semana|sábado|domingo)|nesse (fim de semana|sábado|domingo))(?![\p{L}])/iu
const semAc = (x: any) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
// nomes próprios que só aparecem na descrição das fotos (marca na embalagem, logo, placa) e não no cadastro nem na base
export function nomesDaFoto(neg: any, midias: any[]): string[] {
  const conhecido = semAc(`${neg.nome} ${neg.cidade || ''} ${neg.regiao || ''} ${JSON.stringify(neg.contexto || {})}`)
  const achados = new Set<string>()
  for (const m of midias) for (const x of String(m.descricao || '').matchAll(/(?<=[\p{L},;]\s)(\p{Lu}\p{Ll}{3,})/gu)) if (!conhecido.includes(semAc(x[1]))) achados.add(x[1])
  return [...achados]
}
const temNome = (t: string, nomes: string[]) => nomes.some(n => new RegExp('(?<![\\p{L}])' + n + '(?![\\p{L}])', 'iu').test(t))
async function semDiaRelativo<T extends { gancho?: string; texto?: string; cta?: string }>(neg: any, pecas: T[], nomes: string[] = []): Promise<T[]> {
  const ruim = (p: T) => DIA_RELATIVO.test(`${p.gancho} ${p.texto} ${p.cta}`) || temNome(`${p.gancho} ${p.texto} ${p.cta}`, nomes)
  const ruins = pecas.map((p, i) => [p, i] as const).filter(([p]) => ruim(p))
  if (!ruins.length) return pecas
  try {
    const r = await emJson<{ pecas: { i: number; gancho: string; texto: string; cta: string }[] }>(`${ESCRITORA}\n${regraGancho(neg)}`,
      `${contextoTxt(neg)}\n\nReescreve estes anúncios mantendo o ângulo e as informações, SEM nenhum dia relativo ("hoje", "amanhã", dia da semana: o anúncio roda por dias)${nomes.length ? ` e SEM os nomes ${nomes.map(n => `"${n}"`).join(', ')} (só aparecem na foto; o negócio se chama "${neg.nome}")` : ''}.\n${JSON.stringify(ruins.map(([p, i]) => ({ i, gancho: p.gancho, texto: p.texto, cta: p.cta })))}\nDevolve {"pecas":[{"i":0,"gancho":"...","texto":"...","cta":"..."}]}`)
    for (const x of r.pecas || []) if (pecas[x.i]) pecas[x.i] = { ...pecas[x.i], gancho: x.gancho || pecas[x.i].gancho, texto: x.texto || pecas[x.i].texto, cta: x.cta || pecas[x.i].cta }
  } catch { /* segue pro corte abaixo */ }
  // último recurso: tira a frase do texto; o nome da foto vira o nicho ("a doceria"). A equipe vê na revisão
  const tira = (t: string) => String(t || '').split(/(?<=[.!?])\s+/).filter(f => !DIA_RELATIVO.test(f) && !temNome(f, nomes)).join(' ') || t
  const troca = (t: string) => nomes.reduce((a, n) => a.replace(new RegExp('(?<![\\p{L}])' + n + '(?![\\p{L}])', 'giu'), neg.nicho || 'a loja'), String(t || ''))
  return pecas.map(p => ruim(p) ? { ...p, gancho: troca(p.gancho || ''), texto: tira(p.texto || '') } : p)
}

// refaz uma peça com o ajuste pedido (pela equipe ou pelo dono): novo texto e nova arte, versão + 1
export async function refaz(peca: any, nota: string, quem: 'equipe' | 'dono') {
  const neg = await db.um('negocios', { id: peca.negocio_id })
  const m = peca.midia_ids?.[0] ? await db.um('midias', { id: peca.midia_ids[0] }) : null
  // 06/11: post do Instagram/Facebook (lib/maia/social.ts) refaz só a legenda, sem regra de anúncio e sem a oficina
  if (peca.tipo === 'post' || peca.tipo === 'video') { const { refazPost } = await import('./social'); const p = await refazPost(peca, nota, quem); if (p) return p }
  const r = await emJson<{ gancho: string; texto: string; cta: string; trocar_midia: boolean }>(`${ESCRITORA}\n${regraGancho(neg)}`,
    `${contextoTxt(neg)}\n\nANÚNCIO ATUAL:\nGancho: ${peca.gancho}\nTexto: ${peca.texto}\nCTA: ${peca.cta}\nMídia (só pra tu saber o que aparece; não vira detalhe do produto): ${m?.descricao || m?.legenda || '-'}\n\nAJUSTE PEDIDO PELA ${quem === 'equipe' ? 'EQUIPE' : 'DONA/DONO'}: ${nota}\n\nRefaz respeitando o pedido. Se o pedido for só da imagem (cor, foto, corte), mantém o texto. Devolve: {"gancho":"...","texto":"...","cta":"...","trocar_midia":false}`)
  const tx = noTom(neg, r)
  const [nova] = await db.atualiza('pecas', { id: peca.id }, { gancho: tx.gancho, texto: tx.texto, cta: tx.cta, status: 'gerando', versao: (peca.versao || 1) + 1, ...(quem === 'equipe' ? { nota_equipe: nota } : { nota_dono: nota }) })
  if (peca.tipo === 'anuncio_imagem' || peca.tipo === 'anuncio_video' || peca.tipo === 'post') {
    const antes = (await db.lista('tarefas', { peca_id: peca.id }, { ordem: 'criado_em', desc: true, limite: 1 }))[0]?.dados || {}
    const preco = /R\$\s?\d/.test(tx.gancho) ? null : antes.preco || null
    // 08/11 (reteste): a versão nova troca o layout, mas nunca pra um que outra peça já usa com a mesma foto
    let layout: string | null = null
    if (peca.tipo !== 'anuncio_video' && peca.midia_ids?.[0]) {
      const ja = (await layoutsUsados(peca.negocio_id, peca.id)).get(peca.midia_ids[0]) || []
      layout = LAYOUTS.find(l => l !== antes.layout && !ja.includes(l)) || LAYOUTS.find(l => l !== antes.layout) || null
    }
    await db.insere('tarefas', { negocio_id: peca.negocio_id, tipo: peca.tipo === 'anuncio_video' ? 'video' : 'arte', peca_id: peca.id, dados: { midia_id: peca.midia_ids?.[0], ajuste: nota, ...(layout ? { layout } : {}), ...(preco ? { preco } : {}) } })
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
