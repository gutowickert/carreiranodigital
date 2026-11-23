// Maia: a GRADE DA SEMANA do Instagram e do Facebook (23/11, Nando: "deixar o Instagram automatizado").
// Até aqui a Maia publicava sozinha, lia os resultados e fazia a análise do mês, mas CADA POST era criado à mão na aba Social.
// Agora ela monta a semana sozinha, no ritmo da oferta (8 posts e 4 vídeos por mês = 3 por semana, "3 vezes por semana" no site):
//   - terça, quinta e sábado; o horário alterna 11h/18h (horaDeTeste), pra achar o melhor;
//   - 1 reels (se o dono mandou vídeo), 1 carrossel de fotos (se tem 4 fotos ou mais) e o resto foto única;
//   - fotos e vídeos REAIS do dono (maia_midias, só JPEG pro Instagram), sem o que a equipe marcou "não usar", e sem repetir
//     o que saiu nos últimos 30 dias (se faltar, repete a que saiu há mais tempo);
//   - a IA escolhe as mídias e escreve tema + legenda no tom do negócio (jeitoDaLegenda), sem inventar preço nem promoção;
//   - o que a equipe já agendou à mão naquela semana conta: a Maia só completa o que falta.
// Cada post entra pelo criaPost (mesmas travas) e vai pra REVISÃO DA EQUIPE; depois o 👍 do dono; só então publica.
// Quando: toda quinta às 10h a rotina monta a semana SEGUINTE (dá tempo da equipe e do dono aprovarem), pra todo negócio com
// página + Instagram ligados. No painel, "Montar a semana" faz na hora (na implantação: esta semana, só os dias que faltam).
// Uma vez por negócio e semana (evento social_grade); "forcar" refaz o que faltar.
import { maiaDb as db } from './db'
import { emJson } from './ia'
import { serve } from './material'
import { oferta } from './oferta'
import { criaPost, jeitoDaLegenda, horaDeTeste, posts as postsDe, quandoIso } from './social'

type Slot = { n: number; quando: string; tipo: 'foto' | 'carrossel' | 'reels' }
const DIA = 24 * 3600e3
// a data de Brasília (YYYY-MM-DD) e o dia da semana (0 = domingo)
const diaBR = (d: Date) => new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10)
const semanaBR = (d: Date) => new Date(d.getTime() - 3 * 3600e3).getUTCDay()
const somaDias = (dia: string, n: number) => new Date(Date.parse(dia + 'T12:00:00Z') + n * DIA).toISOString().slice(0, 10)
// a segunda-feira da semana (esta ou a próxima)
export function segundaDa(semana: 'esta' | 'proxima', agora = new Date()) {
  const hoje = diaBR(agora), dow = semanaBR(agora)
  const seg = somaDias(hoje, -((dow + 6) % 7))
  return semana === 'esta' ? seg : somaDias(seg, 7)
}
const ehFotoBoa = (m: any) => m.tipo === 'foto' && /\.jpe?g$/i.test(String(m.path || '')) && serve(m)
const ehVideoBom = (m: any) => m.tipo === 'video' && /\.(mp4|mov)$/i.test(String(m.path || '')) && serve(m)
const caminhosDe = (p: any) => (p.detalhe?.midias || []).map((m: any) => m.caminho).filter(Boolean)

export async function montaGrade(negocio_id: string, opc: { semana?: 'esta' | 'proxima'; forcar?: boolean; agora?: Date; por?: string } = {}) {
  const agora = opc.agora || new Date()
  const neg = await db.um('negocios', { id: negocio_id })
  if (!neg) throw new Error('negócio não existe')
  if (neg.plano === 'gestao') return { ok: false, motivo: 'a Maia Gestora não tem social media' }
  const semana = opc.semana || 'proxima'
  const seg = segundaDa(semana, agora)
  const ja = (await db.lista('eventos', { negocio_id, tipo: 'social_grade' })).find((e: any) => e.detalhe?.semana === seg)
  if (ja && !opc.forcar) return { ok: true, ja_feita: true, semana: seg, criados: ja.detalhe?.criados || [] }

  // o que já está agendado nessa semana (à mão ou numa grade anterior) conta
  const ini = Date.parse(quandoIso(seg + 'T00:00')!), fim = ini + 7 * DIA
  const todos = await postsDe(negocio_id)
  const naSemana = todos.filter((p: any) => { const t = Date.parse(p.detalhe?.quando || ''); return t >= ini && t < fim && !['descartado', 'erro'].includes(p.detalhe?.status) })
  const o = oferta()
  const porSemana = Math.max(1, Math.round(((o.posts_mes || 8) + (o.videos_mes || 4)) / 4))   // 12 por mês → 3 por semana
  const reelsSemana = Math.max(0, Math.round((o.videos_mes || 4) / 4))
  const faltam = porSemana - naSemana.length
  if (faltam <= 0) return { ok: true, semana: seg, criados: [], motivo: 'a semana já está cheia' }

  // as mídias: as que não saíram nos últimos 30 dias primeiro; se faltar, as que saíram há mais tempo
  const midias = (await db.lista('midias', { negocio_id }, { ordem: 'criado_em', desc: true })).filter((m: any) => String(m.path || '').startsWith(neg.id + '/'))
  const ultimoUso = new Map<string, number>()
  for (const p of todos) { const t = Date.parse(p.detalhe?.quando || p.criado_em || ''); for (const c of caminhosDe(p)) ultimoUso.set(c, Math.max(ultimoUso.get(c) || 0, t || 0)) }
  const ordena = (l: any[]) => [...l].sort((a, b) => (ultimoUso.get(a.path) || 0) - (ultimoUso.get(b.path) || 0))
  const recente = (m: any) => (ultimoUso.get(m.path) || 0) > agora.getTime() - 30 * DIA
  const fotos = ordena(midias.filter(ehFotoBoa)), videos = ordena(midias.filter(ehVideoBom))
  if (!fotos.length && !videos.length) return { ok: false, semana: seg, motivo: 'o dono ainda não mandou fotos (JPEG) nem vídeos que sirvam' }
  const fotosNovas = fotos.filter(m => !recente(m))

  // os dias: terça, quinta e sábado; o horário alterna (11h/18h) a partir do último post; só dia com 20 h de folga pra aprovar
  const h0 = await horaDeTeste(negocio_id), h1 = h0 === '11:00' ? '18:00' : '11:00'
  const ocupados = new Set(naSemana.map((p: any) => diaBR(new Date(p.detalhe.quando))))
  const livres = [{ d: 1, h: h0 }, { d: 3, h: h1 }, { d: 5, h: h0 }]
    .map(x => ({ dia: somaDias(seg, x.d), quando: quandoIso(somaDias(seg, x.d) + 'T' + x.h)! }))
    .filter(x => !ocupados.has(x.dia) && Date.parse(x.quando) > agora.getTime() + 20 * 3600e3)
    .slice(0, faltam)
  if (!livres.length) return { ok: true, semana: seg, criados: [], motivo: 'não sobrou dia com tempo pra aprovar nessa semana' }

  // o tipo de cada dia: 1 reels (no meio) se tem vídeo e a semana ainda não tem; 1 carrossel se tem 4 fotos novas; o resto foto
  const temReels = naSemana.filter((p: any) => p.detalhe?.tipo === 'reels').length
  const temCarrossel = naSemana.some((p: any) => p.detalhe?.tipo === 'carrossel')
  const slots: Slot[] = livres.map((l, i) => ({ n: i + 1, quando: l.quando, tipo: 'foto' as Slot['tipo'] }))
  if (videos.length && temReels < reelsSemana) slots[Math.min(1, slots.length - 1)].tipo = 'reels'
  const semFoto = slots.find(s => s.tipo === 'foto')
  if (semFoto && !temCarrossel && fotosNovas.length >= 4) semFoto.tipo = 'carrossel'
  // sem foto nenhuma, só reels (e só o que tiver de vídeo)
  for (const s of slots) if (s.tipo !== 'reels' && !fotos.length) s.tipo = 'reels'
  // 23/11: só o que dá pra alimentar com mídia diferente (nunca a mesma foto 2x na semana); o resto sai com o motivo
  const naoCabe: any[] = []
  let fotosLivres = fotos.length, videosLivres = videos.length
  const usaveis = slots.filter(s => {
    const precisa = s.tipo === 'carrossel' ? 4 : 1
    if (s.tipo === 'reels' ? videosLivres >= 1 : fotosLivres >= precisa) { if (s.tipo === 'reels') videosLivres--; else fotosLivres -= precisa; return true }
    if (s.tipo === 'carrossel' && fotosLivres >= 1) { s.tipo = 'foto'; fotosLivres--; return true }
    naoCabe.push({ slot: s.n, motivo: `faltam fotos: o dono mandou só ${fotos.length} que servem (JPEG)` }); return false
  })
  if (!usaveis.length) return { ok: false, semana: seg, criados: [], pulados: naoCabe, motivo: 'faltam fotos que sirvam (JPEG)' }

  // a IA escolhe as mídias e escreve tema e legenda
  const lista = [...fotos, ...videos].slice(0, 30).map(m => `- ${m.id} · ${m.tipo}${recente(m) ? ' (já saiu há pouco)' : ''} · ${m.descricao || m.legenda || 'sem descrição'}`).join('\n')
  const temas = todos.slice(0, 8).map((p: any) => p.detalhe?.tema).filter(Boolean)
  const pede = usaveis.map(s => `- slot ${s.n}: ${s.tipo === 'foto' ? 'FOTO (1 foto)' : s.tipo === 'carrossel' ? 'CARROSSEL de fotos (de 3 a 5 fotos, na ordem)' : 'REELS (1 vídeo)'}`).join('\n')
  const r = await emJson<{ posts: { slot: number; midia_ids: string[]; tema: string; legenda: string }[] }>(`${jeitoDaLegenda(neg)}
Agora tu planejas os posts ORGÂNICOS da semana do negócio (Instagram e Facebook).
REGRAS:
- Cada post usa SÓ mídias da lista (pelo id) e do tipo pedido: foto e carrossel usam fotos; reels usa 1 vídeo. Varia as mídias entre os posts; evita as marcadas "já saiu há pouco".
- Varia o assunto da semana: o produto ou serviço (pra quem é, o que tem de bom), uma dica útil pro cliente, os bastidores ou o dia a dia do negócio. Não repete os temas recentes.
- Legenda: começa com uma frase que prende, tamanho MÉDIO (de 300 a 900 caracteres), no máximo 5 hashtags no fim. Post orgânico é posicionamento: não chama pro WhatsApp em todo post (no máximo um da semana pode dizer que o link do WhatsApp está no perfil).
- Usa SÓ o que está em O QUE A MAIA SABE. Não inventa preço, promoção, desconto, prazo, sorteio nem número.
- "tema" é um nome curto interno (até 6 palavras).`,
    `NEGÓCIO: ${neg.nome} (${neg.nicho || 'nicho não informado'}), ${neg.cidade || ''}.
O QUE A MAIA SABE: ${JSON.stringify(neg.contexto || {}).slice(0, 3000)}
FOTOS E VÍDEOS DO DONO:
${lista}
${temas.length ? 'TEMAS RECENTES (não repetir): ' + temas.join('; ') + '\n' : ''}OS POSTS DESTA SEMANA:
${pede}
Devolve {"posts":[{"slot":1,"midia_ids":["..."],"tema":"...","legenda":"..."}]}, um por slot.`, [], { uso: { tipo: 'social_grade', negocio_id } })

  const porId = new Map(midias.map((m: any) => [m.id, m]))
  const usadas = new Set<string>()
  const criados: any[] = [], pulados: any[] = [...naoCabe]
  for (const s of usaveis) {
    const p = (r?.posts || []).find(x => Number(x.slot) === s.n)
    const legenda = String(p?.legenda || '').trim()
    if (!legenda) { pulados.push({ slot: s.n, motivo: 'a IA não escreveu a legenda' }); continue }
    // as mídias da IA, conferidas; se não servirem, a Maia escolhe (as que saíram há mais tempo e ainda não foram nesta semana)
    const pool = s.tipo === 'reels' ? videos : fotos
    let ms = (p?.midia_ids || []).map(id => porId.get(id)).filter((m: any) => m && pool.includes(m) && !usadas.has(m.id))
    const quer = s.tipo === 'carrossel' ? [3, 5] : [1, 1]
    if (ms.length < quer[0]) ms = pool.filter(m => !usadas.has(m.id)).slice(0, s.tipo === 'carrossel' ? 4 : 1)
    ms = ms.slice(0, quer[1])
    if (ms.length < quer[0]) { pulados.push({ slot: s.n, motivo: 'faltou mídia pra esse tipo' }); continue }
    for (const m of ms) usadas.add(m.id)
    try {
      const ev = await criaPost(negocio_id, {
        quando: s.quando, tipo: s.tipo, legenda, tema: String(p?.tema || '').slice(0, 60) || undefined, formato: s.tipo, objetivo: 'organico',
        midias: ms.map((m: any) => ({ caminho: m.path, tipo: s.tipo === 'reels' ? 'video' : 'foto' })), por: opc.por || 'maia (grade da semana)',
      })
      criados.push({ post_id: ev.id, tipo: s.tipo, quando: s.quando, tema: p?.tema || null })
    } catch (e: any) { pulados.push({ slot: s.n, motivo: e.message }) }
  }
  await db.evento('social_grade', negocio_id, { semana: seg, criados, pulados, por: opc.por || 'rotina' })
  return { ok: true, semana: seg, criados, pulados }
}

// a rotina (quinta 10h): a semana seguinte de todo negócio com página + Instagram ligados
export async function gradesDaSemana(agora = new Date()) {
  const negs = (await db.lista('negocios')).filter((n: any) => n.plano !== 'gestao' && !['cancelado', 'pausado'].includes(n.status) && n.meta?.page_id && n.meta?.ig_id)
  const r: any[] = []
  for (const n of negs) { try { r.push({ negocio: n.id, ...(await montaGrade(n.id, { semana: 'proxima', agora })) }) } catch (e: any) { r.push({ negocio: n.id, erro: e.message }) } }
  return r
}
