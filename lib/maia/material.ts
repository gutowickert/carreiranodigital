// Maia: o MATERIAL DO CLIENTE (13/11, Guto: "a gente precisa que ela seja ativa e peça o conteúdo que ela precise").
// Tudo em tabelas que já existem (maia_midias, maia_eventos): nenhuma mudança no banco.
//
// 1) O BANCO DE MÍDIAS do negócio (maia_midias): entra pelo WhatsApp do dono (dono.ts), pelo painel da equipe ("Arquivos do
//    cliente"), pelo painel do dono ("mandar fotos e vídeos") e pela implantação (importar.mjs → ação subir_material).
//    Toda foto/vídeo ganha a descrição da Maia (descreveFoto / falaDoVideo; os quadros do vídeo a oficina descreve depois).
//    "Não usar": a equipe marca e a descrição ganha o prefixo [não usar]; a criação (pecas.ts, carrossel.ts) deixa de fora.
//    "Serve": o que a descrição diz (escura, tremida, print, documento, não serve → não serve).
// 2) A PAUTA DE CAPTAÇÃO (a Maia pede o que precisa): os lotes de anúncio são no início do mês (dia 4: 4 vídeos + 4 imagens)
//    e no dia 15 (2 + 2). 3 dias antes (dia 1 e dia 12) a Maia compara o banco com o lote e com o produto da vez e, se faltar,
//    manda pro dono UMA mensagem curta e concreta do que captar e como (junto com as pendências; fora da janela de 24 h vai
//    pela fila + modelo maia_novidades, canal.ts). Uma pauta por lote, sem repetir. Na implantação, a equipe pede no painel.
//    O dono mandou o que faltava: a pauta fecha sozinha. Chegou o dia do lote e não mandou: a Maia usa o melhor que tem e
//    avisa a equipe (avisaTime), uma vez. IA de imagem continua só em último caso (regra da criação).
import crypto from 'node:crypto'
import { maiaDb as db, maiaLocal } from './db'
import { horaLocal, fusoDo } from './horario'

export const NAO_USAR = '[não usar] '
const RUIM = /n[aã]o serve|escur|tremid|desfocad|borrad|fora de foco|\bprint\b|captura de tela|documento|or[cç]amento de outr/i
const semAc = (s: any) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export const naoUsar = (m: any) => String(m?.descricao || '').startsWith(NAO_USAR)
export const serve = (m: any) => !naoUsar(m) && !RUIM.test(String(m?.descricao || ''))
// já cansada: usada em 3 peças ou mais
export const CANSADA = 3
export const fresca = (m: any) => serve(m) && (m.usos || 0) < CANSADA

// ─────────────── 1) o banco de mídias
async function descreve(neg: any, buf: Buffer, mime: string, tipo: 'foto' | 'video', nome?: string | null) {
  // teste: sem IA (a descrição vem do nome do arquivo ou da legenda)
  if (maiaLocal() && process.env.MAIA_SEM_IA_MIDIA === '1') return nome ? `${tipo === 'video' ? 'vídeo' : 'foto'}: ${nome}` : (tipo === 'video' ? 'vídeo' : 'foto')
  const { descreveFoto, falaDoVideo } = await import('./dono')
  return tipo === 'foto' ? await descreveFoto(buf, mime, neg) : await falaDoVideo(buf, mime)
}

const MIMES = /^(image\/(jpeg|png|webp)|video\/(mp4|quicktime|3gpp))$/
const tipoDo = (mime: string): 'foto' | 'video' => /^video\//.test(mime) ? 'video' : 'foto'
const extDo = (mime: string) => tipoDo(mime) === 'video' ? (/quicktime/.test(mime) ? 'mov' : 'mp4') : /png/.test(mime) ? 'png' : /webp/.test(mime) ? 'webp' : 'jpg'
const checaMime = (m: any) => { const mime = String(m || '').toLowerCase().replace('image/jpg', 'image/jpeg'); if (!MIMES.test(mime)) throw new Error('manda foto (JPG, PNG, WEBP) ou vídeo (MP4, MOV)'); return mime }

// 1º passo do envio grande (vídeo, ou a implantação subindo a pasta): o caminho e o link pra mandar o arquivo DIRETO pro
// armazenamento (a Vercel aceita só uns 4,5 MB por chamada). Depois: registraMidia com o mesmo caminho
export async function linkDeEnvio(neg: any, mimeIn: string) {
  const mime = checaMime(mimeIn)
  const caminho = `${neg.id}/midias/${crypto.randomUUID().slice(0, 8)}.${extDo(mime)}`
  return { caminho, url: await db.linkEnvio(caminho), mime }
}
// 2º passo: o arquivo já está no armazenamento; a Maia descreve e guarda no banco do negócio
export async function registraMidia(neg: any, d: { caminho: string; mime: string; nome?: string | null; legenda?: string | null; por: string }) {
  const mime = checaMime(d.mime)
  if (!String(d.caminho || '').startsWith(neg.id + '/midias/') || d.caminho.includes('..')) throw new Error('caminho inválido')
  if (!(await db.existe(d.caminho))) throw new Error('o arquivo não chegou no armazenamento')
  if (await db.um('midias', { negocio_id: neg.id, path: d.caminho })) throw new Error('esse arquivo já está no banco')
  const buf = await db.baixa(d.caminho)
  return guarda(neg, { buf, mime, caminho: d.caminho, nome: d.nome, legenda: d.legenda, por: d.por })
}
// guarda uma foto ou vídeo pequeno (painel, até uns 4 MB) no banco do negócio, do mesmo jeito do WhatsApp do dono
export async function sobeMidia(neg: any, d: { buf: Buffer; mime: string; nome?: string | null; legenda?: string | null; por: string }) {
  const mime = checaMime(d.mime)
  const caminho = await db.sobe(`${neg.id}/midias/${crypto.randomUUID().slice(0, 8)}.${extDo(mime)}`, d.buf, mime)
  return guarda(neg, { ...d, mime, caminho })
}
async function guarda(neg: any, d: { buf: Buffer; mime: string; caminho: string; nome?: string | null; legenda?: string | null; por: string }) {
  const mime = d.mime, tipo = tipoDo(mime), caminho = d.caminho
  if (d.buf.length > (tipo === 'video' ? 60 : 12) * 1024 * 1024) throw new Error(tipo === 'video' ? 'vídeo grande demais (máx. 60 MB)' : 'foto grande demais (máx. 12 MB)')
  const descricao = await descreve(neg, d.buf, mime, tipo, d.nome || d.legenda).catch(() => null)
  const m = await db.insere('midias', { negocio_id: neg.id, tipo, path: caminho, mime, legenda: d.legenda || null, descricao })
  await db.evento('material_chegou', neg.id, { midia_id: m.id, tipo, por: d.por, nome: d.nome || null })
  await confereChegada(neg).catch(() => null)
  return m
}

export async function marcaNaoUsar(midia_id: string, nao: boolean, por: string) {
  const m = await db.um('midias', { id: midia_id })
  if (!m) throw new Error('mídia não existe')
  const base = String(m.descricao || '').replace(NAO_USAR, '')
  const [x] = await db.atualiza('midias', { id: m.id }, { descricao: nao ? NAO_USAR + base : base })
  await db.evento('material_nao_usar', m.negocio_id, { midia_id: m.id, nao, por })
  return x
}

// o banco pro painel (equipe e dono): o mais novo primeiro, com o link da miniatura
export async function bancoDoNegocio(neg: any, limite = 60) {
  const ms = (await db.lista('midias', { negocio_id: neg.id }, { ordem: 'criado_em', desc: true, limite })).filter(m => m.tipo === 'foto' || m.tipo === 'video')
  const out = []
  for (const m of ms) out.push({ id: m.id, tipo: m.tipo, descricao: String(m.descricao || '').replace(NAO_USAR, ''), legenda: m.legenda || null, usos: m.usos || 0,
    nao_usar: naoUsar(m), serve: serve(m), cansada: (m.usos || 0) >= CANSADA, criado_em: m.criado_em, link: await db.link(m.path).catch(() => null) })
  return out
}

// ─────────────── 2) a pauta de captação
export type Lote = 'inicio' | 'meio' | 'implantacao'
export const LOTES = { inicio: { dia_pedido: 1, dia_lote: 4, fotos: 4, videos: 4 }, meio: { dia_pedido: 12, dia_lote: 15, fotos: 2, videos: 2 }, implantacao: { dia_pedido: 0, dia_lote: 0, fotos: 4, videos: 4 } } as const
export type Falta = { fotos: number; videos: number; produto: string | null; pessoa: boolean }

// o produto da vez: o que a estratégia diz que entra primeiro, senão o mais vendido, senão o produto da ficha
export function produtoDaVez(neg: any): string | null {
  const c = neg?.contexto || {}
  const v = c.estrategia?.produto_entrada || c.produto_entrada || c.mais_vendido || c.ficha?.mais_vendido || c.produto || c.ficha?.produto
  const t = Array.isArray(v) ? v[0] : v
  const s = String(typeof t === 'object' && t ? (t.nome || t.produto || '') : t || '').trim()
  return s ? s.split(/[.;\n]/)[0].slice(0, 60) : null
}
const palavras = (s: string) => semAc(s).split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !['para', 'com', 'pelo', 'pela', 'personalizado', 'personalizada'].includes(w))

// o que falta no banco pro lote: fotos e vídeos frescos (servem e ainda não cansaram), o produto da vez e gente usando
export function avaliaBanco(midias: any[], lote: Lote, produto: string | null): Falta {
  const L = LOTES[lote]
  const fr = midias.filter(fresca)
  const fotos = fr.filter(m => m.tipo === 'foto'), videos = fr.filter(m => m.tipo === 'video')
  const ps = produto ? palavras(produto) : []
  const temProduto = !ps.length || fr.some(m => ps.some(w => semAc(m.descricao).includes(w) || semAc(m.legenda).includes(w)))
  const temPessoa = fr.some(m => /pessoa|cliente|m[aã]o|segurand|usand|mulher|homem|crian|sorri|rosto/i.test(String(m.descricao || '')))
  return { fotos: Math.max(0, L.fotos - fotos.length), videos: Math.max(0, L.videos - videos.length), produto: temProduto ? null : produto, pessoa: !temPessoa }
}
export const faltaAlgo = (f: Falta) => f.fotos > 0 || f.videos > 0 || !!f.produto || f.pessoa

// a mensagem pro dono: curta, concreta, com o como
export function textoPauta(neg: any, f: Falta, lote: Lote, dataLote: string | null) {
  const nome = String(neg?.dono_nome || '').split(' ')[0]
  const prod = f.produto || produtoDaVez(neg) || 'o teu produto'
  const itens: string[] = []
  if (f.videos > 0) itens.push(`${f.videos} ${f.videos === 1 ? 'vídeo curto' : 'vídeos curtos'} (uns 10 segundos) do dia a dia, mostrando ${prod} sendo feito ou usado, com o celular em pé`)
  let fotos = f.fotos
  if (f.produto) { itens.push(`1 foto de ${f.produto} de perto, com luz do dia`); fotos = Math.max(0, fotos - 1) }
  if (f.pessoa) { itens.push(`1 foto de alguém segurando ou usando ${prod}`); fotos = Math.max(0, fotos - 1) }
  if (fotos > 0) itens.push(`${fotos} ${fotos === 1 ? 'foto' : 'fotos'} de ${prod}, de ângulos diferentes`)
  const quando = lote === 'implantacao' ? 'pros primeiros anúncios' : `pros anúncios ${dataLote ? 'do dia ' + Number(dataLote.slice(8, 10)) : 'novos'}`
  const prazo = lote === 'implantacao' || !dataLote ? '' : `, até o dia ${Number(dataLote.slice(8, 10)) - 1}`
  return `${nome ? nome + ', ' : ''}${quando} eu preciso de:\n${itens.map(i => '• ' + i).join('\n')}\nNão precisa editar nada. Manda aqui mesmo${prazo}.`
}

const dataDoLote = (agoraData: string, lote: Lote) => lote === 'implantacao' ? null : `${agoraData.slice(0, 7)}-${String(LOTES[lote].dia_lote).padStart(2, '0')}`
const chaveDoLote = (agoraData: string, lote: Lote) => lote === 'implantacao' ? `implantacao-${agoraData}` : `${agoraData.slice(0, 7)}-${lote}`

export async function pautas(negocio_id: string) {
  return db.lista('eventos', { negocio_id, tipo: 'pauta_captacao' }, { ordem: 'criado_em', desc: true, limite: 20 })
}
export async function pautaAberta(negocio_id: string) {
  return (await pautas(negocio_id)).find(e => e.detalhe?.status === 'aberta') || null
}

// pede o material do lote (uma vez por lote). forcar: a equipe pediu no painel (implantação ou fora de época)
export async function pedePauta(neg: any, d: { lote: Lote; agora?: Date; por: string }) {
  const agora = d.agora || new Date()
  const hoje = horaLocal(agora, fusoDo(neg)).data
  const chave = chaveDoLote(hoje, d.lote)
  const ja = (await pautas(neg.id)).find(e => e.detalhe?.chave === chave)
  if (ja) return { ok: true, ja: true, pauta: ja }
  const midias = await db.lista('midias', { negocio_id: neg.id })
  const falta = avaliaBanco(midias, d.lote, produtoDaVez(neg))
  const data_lote = dataDoLote(hoje, d.lote)
  if (!faltaAlgo(falta)) {
    const ev = await db.evento('pauta_captacao', neg.id, { chave, lote: d.lote, data_lote, status: 'sem_falta', falta, por: d.por })
    return { ok: true, sem_falta: true, pauta: ev }
  }
  const texto = textoPauta(neg, falta, d.lote, data_lote)
  // a mensagem sai antes do evento, pra a própria pauta não entrar como "ainda esperando" no mesmo aviso
  const { conversaDoDono, mandaTexto } = await import('./canal')
  const { comPendencias } = await import('./pendencias')
  let envio: any = null
  if (neg.dono_whatsapp) envio = await mandaTexto(await conversaDoDono(neg), await comPendencias(neg, texto)).catch((e: any) => ({ ok: false, erro: String(e?.message || e) }))
  const ev = await db.evento('pauta_captacao', neg.id, { chave, lote: d.lote, data_lote, status: 'aberta', falta, texto, pedida_em: agora.toISOString(), por: d.por, enviado: !!envio?.ok, na_fila: !!envio?.na_fila, recebidas: [] })
  return { ok: true, pauta: ev, texto }
}

// chegou mídia: a pauta aberta anota o que chegou e fecha quando não falta mais nada
export async function confereChegada(neg: any) {
  const p = await pautaAberta(neg.id)
  if (!p) return null
  // o que chegou DEPOIS do pedido (a hora de gravação do evento da pauta, que é sempre a hora real)
  const desde = p.criado_em
  const midias = await db.lista('midias', { negocio_id: neg.id })
  const recebidas = midias.filter(m => (m.criado_em || '') > desde).map(m => m.id)
  const lote: Lote = p.detalhe?.lote || 'inicio'
  const pediu: Falta = p.detalhe?.falta || { fotos: 0, videos: 0, produto: null, pessoa: false }
  const falta = avaliaBanco(midias, lote, pediu.produto || produtoDaVez(neg))
  // fecha quando chegou tudo o que foi pedido: as fotos, os vídeos, a do produto e a de alguém usando (pela descrição da Maia)
  const fechou = falta.fotos === 0 && falta.videos === 0 && (!pediu.produto || !falta.produto) && (!pediu.pessoa || !falta.pessoa)
  const detalhe = { ...p.detalhe, recebidas, falta_agora: falta, ...(fechou ? { status: 'atendida', atendida_em: new Date().toISOString() } : {}) }
  await db.atualiza('eventos', { id: p.id }, { detalhe })
  return { fechou, recebidas: recebidas.length, falta }
}

// ─────────────── a rotina (de hora em hora, rotina.ts)
// dia 1 e dia 12, das 9h às 19h no fuso do negócio: pede o material do lote. Dia 4 e dia 15 (o dia do lote), das 9h:
// pauta ainda aberta → avisa a equipe uma vez e marca vencida (a Maia segue com o melhor que tem)
export async function rotinaMaterial(relogio = new Date()) {
  const { ehDemo } = await import('./demo-amostra')
  const negs = (await db.lista('negocios')).filter(n => !ehDemo(n) && (n.status === 'ativo' || n.status === 'implantacao') && n.plano !== 'gestao')
  const feitos: any[] = []
  for (const neg of negs) {
    const h = horaLocal(relogio, fusoDo(neg))
    if (h.hora < 9 || h.hora >= 19) continue
    const dia = Number(h.data.slice(8, 10))
    try {
      const lote: Lote | null = dia === LOTES.inicio.dia_pedido ? 'inicio' : dia === LOTES.meio.dia_pedido ? 'meio' : null
      if (lote && neg.status === 'ativo') { const r = await pedePauta(neg, { lote, agora: relogio, por: 'rotina' }); if (!r.ja) feitos.push({ negocio: neg.id, pediu: lote, sem_falta: !!r.sem_falta }) }
      if (dia === LOTES.inicio.dia_lote || dia === LOTES.meio.dia_lote) {
        const p = await pautaAberta(neg.id)
        if (p && p.detalhe?.data_lote && p.detalhe.data_lote <= h.data && !p.detalhe.avisou_equipe) {
          const f = p.detalhe.falta_agora || p.detalhe.falta || {}
          const falta = [f.videos ? `${f.videos} vídeo(s)` : '', f.fotos ? `${f.fotos} foto(s)` : '', f.produto ? `foto de ${f.produto}` : '', f.pessoa ? 'foto de alguém usando' : ''].filter(Boolean).join(', ')
          const { avisaTime } = await import('./acompanhamento')
          await avisaTime(`${neg.nome}: o material do lote não chegou`, `Hoje é o dia do lote de anúncios e o dono não mandou o que a Maia pediu (${falta || 'material novo'}). Chegaram ${(p.detalhe.recebidas || []).length} arquivo(s). A Maia segue com o melhor que tem no banco. Vale cobrar o dono ou pedir na próxima conversa.`, neg.id, true)
          await db.atualiza('eventos', { id: p.id }, { detalhe: { ...p.detalhe, status: 'vencida', avisou_equipe: new Date().toISOString() } })
          feitos.push({ negocio: neg.id, avisou: true })
        }
      }
    } catch (e: any) { feitos.push({ negocio: neg.id, erro: String(e?.message || e).slice(0, 200) }) }
  }
  return feitos
}
