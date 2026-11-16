// Maia, lançamento: a AMOSTRA (2 anúncios + 1 vídeo do negócio da pessoa), a conversa pronta, a entrega e a página pública.
//   - as peças: a equipe sobe à mão (painel /maia/operacao/lancamento.html) ou pede pra oficina gerar e escolhe
//   - "aprovar e entregar": manda o link pela Maia na hora combinada (a rotina de hora em hora entrega) ou na hora do clique
//   - a página: /maia/amostra/<token>, clara, no padrão do site da Maia, sem emoji, conta as aberturas
// Fotos e vídeos são SÓ os do negócio. A única imagem feita por IA é o rosto da Maia.
import { maiaDb as db, maiaLocal } from '../db'
import {
  contato as acha, salva, salvaJson, midias, mandaTexto, mandaMidia, mandaModelo, janelaAberta, janelaAte, garanteToken, avanca, evento,
  primeiroNome, horaBR, SITE, WHATS_ESCOLA, avisaGuto,
} from './base'
import { TEXTO_TESTE, marcaRick, rotulo } from './conversa'

export const SLOTS = ['anuncio1', 'anuncio2', 'video'] as const
export type Slot = typeof SLOTS[number]
export const PRECO = { ativacao_de: 997, ativacao_por: 497, mensal: 997, dias_no_ar: 2 }
export const FRASE_IMPLANTACAO = 'Esta amostra foi feita com pouca informação. A implantação de verdade é presencial e individual, com um especialista: lá a Maia aprende o teu jeito de vender, os teus preços e as tuas regras, conecta as tuas contas e segue o padrão do teu negócio. É isso que garante que ela funcione bem pra ti.'

export const nomeNeg = (c: any) => c.coleta?.nome_negocio || (c.coleta?.negocio ? String(c.coleta.negocio).split(/[,.;]/)[0].slice(0, 60) : '') || 'o teu negócio'
export const linkAmostra = (c: any) => `${SITE()}/maia/amostra/${c.token}`
const waLink = (texto: string) => `https://wa.me/${WHATS_ESCOLA()}?text=${encodeURIComponent(texto)}`

// ---------- as peças ----------
export async function definePeca(c: any, slot: Slot, p: { path: string; mime: string; legenda?: string | null; origem?: string; peca_id?: string | null }) {
  if (!SLOTS.includes(slot)) throw new Error('lugar inválido')
  if (!p.path || p.path.includes('..')) throw new Error('arquivo inválido')
  const atual = (await acha(c.id)) || c
  const pecas = { ...(atual.amostra?.pecas || {}), [slot]: { path: p.path, mime: p.mime, legenda: p.legenda ?? atual.amostra?.pecas?.[slot]?.legenda ?? '', origem: p.origem || 'equipe', peca_id: p.peca_id || null, em: new Date().toISOString() } }
  await salvaJson(c, 'amostra', { pecas })
  if (['material_recebido'].includes(atual.etapa)) await salva(c, { etapa: 'em_producao' })
  return pecas
}
export async function legendaPeca(c: any, slot: Slot, legenda: string) {
  const atual = (await acha(c.id)) || c
  const p = atual.amostra?.pecas?.[slot]
  if (!p) throw new Error('esse lugar ainda não tem arquivo')
  return salvaJson(c, 'amostra', { pecas: { ...atual.amostra.pecas, [slot]: { ...p, legenda: String(legenda || '').slice(0, 1200) } } })
}
// o link de envio direto pro armazenamento (vídeo grande não passa pela Vercel)
export async function linkEnvio(c: any, mime: string) {
  const ext = /png/.test(mime) ? 'png' : /webp/.test(mime) ? 'webp' : /quicktime/.test(mime) ? 'mov' : /^video/.test(mime) ? 'mp4' : 'jpg'
  if (!/^(image\/(jpeg|png|webp)|video\/(mp4|quicktime))$/.test(mime)) throw new Error('arquivo precisa ser foto (jpg, png, webp) ou vídeo (mp4, mov)')
  const caminho = `lanc-${c.id}/pecas/${Date.now().toString(36)}.${ext}`
  return { caminho, url: await db.linkEnvio(caminho), mime }
}

// ---------- a oficina gera (se estiver de pé) ----------
// cria um negócio de apoio (marcado como amostra do lançamento: some do resto do painel e nenhuma rotina de cliente mexe nele)
export async function negocioDeApoio(c: any) {
  if (c.negocio_id) { const n = await db.um('negocios', { id: c.negocio_id }); if (n) return n }
  const k = c.coleta || {}
  const neg = await db.insere('negocios', {
    nome: nomeNeg(c), nicho: k.negocio ? String(k.negocio).slice(0, 80) : null, cidade: k.cidade || null, regiao: null,
    dono_nome: primeiroNome(c.nome) || null, dono_whatsapp: null, status: 'pausado', plano: 'completa',
    contexto: {
      produto: k.negocio || null, preco: k.produtos || null, publico: k.publico || null, como_compra: k.como_vende || null, resumo: [k.carro_chefe && `Mais vende: ${k.carro_chefe}`, k.dificuldade && `Dificuldade: ${k.dificuldade}`].filter(Boolean).join('. ') || null,
      demo: { lancamento: c.id, lead: primeiroNome(c.nome) || 'Contato', status: 'lancamento', semana: '2000-01-03', entrega: c.entrega_em || null, pedido_em: new Date().toISOString(), simulado: maiaLocal(), video: true },
    },
  })
  await salva(c, { negocio_id: neg.id })
  // as mídias do contato entram no negócio de apoio (o mesmo arquivo do bucket, sem copiar)
  for (const m of (await midias(c.id)).filter(m => m.origem === 'contato')) {
    await db.insere('midias', { negocio_id: neg.id, tipo: m.tipo, path: m.path, mime: m.mime, descricao: m.tipo === 'video' ? 'vídeo curto que o dono mandou' : 'foto que o dono mandou' })
  }
  return neg
}
export async function geraComOficina(c: any) {
  const neg = await negocioDeApoio(c)
  const ms = await db.lista('midias', { negocio_id: neg.id }, { ordem: 'criado_em' })
  const fotos = ms.filter(m => m.tipo === 'foto'), video = ms.find(m => m.tipo === 'video')
  if (!fotos.length && !video) throw new Error('a pessoa ainda não mandou fotos nem vídeos')
  const { geraAnuncios } = await import('../pecas')
  const feitos: any[] = []
  for (const m of [fotos[0], fotos[1] || fotos[0], video].filter(Boolean)) {
    const r: any = await geraAnuncios(neg, { quantidade: 1, midia_ids: [m!.id] })
    if (r?.ok === false) throw new Error(r.erro || 'a oficina não aceitou')
    feitos.push(...(r?.pecas || []))
  }
  const { oficinaViva } = await import('../demo-amostra')
  await salva(c, { etapa: avanca(c.etapa, 'em_producao') })
  return { pecas: feitos.length, oficina_viva: await oficinaViva() }
}
export async function pecasDaOficina(c: any) {
  if (!c.negocio_id) return []
  const ps = (await db.lista('pecas', { negocio_id: c.negocio_id }, { ordem: 'criado_em' })).filter(p => p.status !== 'descartada')
  return Promise.all(ps.map(async p => ({ id: p.id, tipo: p.tipo, status: p.status, gancho: p.gancho, texto: p.texto, cta: p.cta, arquivo_path: p.arquivo_path, url: await db.link(p.arquivo_path) })))
}
export async function usaPecaDaOficina(c: any, peca_id: string, slot: Slot) {
  const p = await db.um('pecas', { id: peca_id })
  if (!p || p.negocio_id !== c.negocio_id) throw new Error('peça não é desse contato')
  if (!p.arquivo_path) throw new Error('a oficina ainda não terminou essa peça')
  const video = p.tipo === 'anuncio_video' || /\.(mp4|mov)$/i.test(p.arquivo_path)
  return definePeca(c, slot, { path: p.arquivo_path, mime: video ? 'video/mp4' : 'image/jpeg', legenda: [p.texto, p.cta].filter(Boolean).join('\n\n'), origem: 'oficina', peca_id })
}

// ---------- a conversa pronta (o "print" de um cliente sendo atendido) ----------
type Fala = { de: 'cliente' | 'maia'; texto: string }
export function conversaSimples(c: any): { conversa: Fala[]; retomada: string } {
  const k = c.coleta || {}, neg = nomeNeg(c)
  const prod = String(k.carro_chefe || k.produtos || 'o produto do anúncio').replace(/[.!]+$/, '').slice(0, 120)
  const precos = k.produtos ? String(k.produtos).replace(/[.!]+$/, '').slice(0, 200) : ''
  const como = k.como_vende ? String(k.como_vende).replace(/[.!]+$/, '').slice(0, 200) : ''
  return {
    conversa: [
      { de: 'cliente', texto: `Oi! Vi o anúncio de vocês. Como funciona?` },
      { de: 'maia', texto: `Oi! Aqui é da ${neg}. O que mais sai aqui é ${prod}.${precos ? ` Os valores: ${precos}.` : ''} Quer que eu te ajude a escolher?` },
      { de: 'cliente', texto: 'Quero sim. Como faço pra pedir?' },
      { de: 'maia', texto: `${como ? como + '. ' : ''}Me passa o teu nome e o que tu quer, que eu já anoto e confirmo contigo.` },
      { de: 'cliente', texto: 'Ana. Quero o que mais sai, pra sábado.' },
      { de: 'maia', texto: 'Anotado, Ana! Já passei pra equipe confirmar e te aviso aqui.' },
    ],
    retomada: `Oi, Ana! Ficou alguma dúvida? Ainda dá pra garantir o teu pedido.`,
  }
}
export async function geraConversa(c: any) {
  const usaIA = process.env.MAIA_LANC_IA === '1' || (!maiaLocal() && process.env.MAIA_LANC_IA !== '0' && !!process.env.ANTHROPIC_API_KEY)
  let r = conversaSimples(c)
  if (usaIA) {
    try {
      const { emJson } = await import('../ia')
      const { fichaDoNegocio, legendasDoInstagram, jeitoDeFalar } = await import('./teste')
      if (!Array.isArray(c.coleta?.legendas_ig)) { const ls = await legendasDoInstagram(c); if (ls.length) c = { ...c, coleta: { ...(c.coleta || {}), legendas_ig: ls } } }
      const j = await emJson<{ conversa: Fala[]; retomada: string }>(
        'Tu escreves exemplos curtos de conversa de WhatsApp entre um cliente e a Maia, a atendente virtual (IA) de um pequeno negócio. Português do Brasil. Fala no jeito do negócio quando ele for dado.',
        `O negócio:\n${fichaDoNegocio(c)}${jeitoDeFalar(c)}\n\nEscreve uma conversa de 6 a 8 mensagens: um cliente que viu o anúncio chama no WhatsApp, a atendente responde em nome do negócio (na primeira mensagem: "Aqui é da <negócio>"; nunca usa o nome Maia nem diz que é IA, a não ser que o cliente pergunte), responde o preço mostrando PRIMEIRO o valor (como é o produto ou serviço) e DEPOIS o número, e leva até o pedido ou o agendamento (o que, quanto, nome, dia). A atendente não confirma nada sozinha: diz que confirma com a equipe. Nunca fala em "dono" pro cliente. Usa SÓ o que está acima, nunca inventa preço, prazo nem endereço. Mensagens curtas, de WhatsApp. O cliente se chama Ana.\nE uma mensagem de retomada: a Maia chamando de novo no outro dia um cliente que sumiu no meio, leve, com algo novo (sem cobrar).\nDevolve {"conversa":[{"de":"cliente"|"maia","texto":"..."}],"retomada":"..."}`,
        [], { uso: { tipo: 'lancamento' } })
      if (Array.isArray(j?.conversa) && j.conversa.length >= 4) r = { conversa: j.conversa.filter(f => f && (f.de === 'cliente' || f.de === 'maia') && f.texto).slice(0, 10).map(f => ({ de: f.de, texto: String(f.texto).slice(0, 500) })), retomada: String(j.retomada || r.retomada).slice(0, 400) }
    } catch { /* fica a simples */ }
  }
  await salvaJson(c, 'amostra', { conversa: r.conversa, retomada: r.retomada })
  return r
}
// a equipe edita a conversa no painel: uma fala por linha, "Cliente: ..." ou "Maia: ...", e a retomada em "Retomada: ..."
export function leConversaTexto(t: string) {
  const conversa: Fala[] = []; let retomada = ''
  for (const l of String(t || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean)) {
    const m = l.match(/^(cliente|maia|retomada)\s*:\s*(.+)$/i)
    if (!m) { if (conversa.length) conversa[conversa.length - 1].texto += ' ' + l; continue }
    const k = m[1].toLowerCase()
    if (k === 'retomada') retomada = m[2].slice(0, 400)
    else conversa.push({ de: k as any, texto: m[2].slice(0, 500) })
  }
  return { conversa, retomada }
}

// ---------- aprovar e entregar ----------
export async function aprova(c: any, op: { agora?: boolean; por: string }) {
  const atual = (await acha(c.id)) || c
  const p = atual.amostra?.pecas || {}
  if (!p.anuncio1 || !p.anuncio2) throw new Error('faltam os 2 anúncios')
  if (!p.video) throw new Error('falta o vídeo')
  if (!atual.amostra?.conversa?.length) await geraConversa(atual)
  await garanteToken(atual)
  await salvaJson(atual, 'amostra', { aprovada_em: new Date().toISOString(), aprovada_por: op.por, entregar: op.agora ? 'agora' : 'combinado', falha: null })
  await salva(atual, { etapa: avanca(atual.etapa, 'em_producao') })
  const fresco = (await acha(c.id))!
  if (op.agora || !fresco.entrega_em || Date.parse(fresco.entrega_em) <= Date.now()) return entrega(fresco)
  return { ok: true, agendada: fresco.entrega_em }
}

const saudacao = (d = new Date()) => { const h = horaBR(d); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite' }
export const textoEntrega = (c: any) => `${saudacao()}${primeiroNome(c.nome) ? ', ' + primeiroNome(c.nome) : ''}! A tua amostra ficou pronta: ${linkAmostra(c)}

Lá tem os 2 anúncios e o vídeo que eu fiz com as tuas fotos. E tem um teste: me manda aqui uma pergunta como se fosse um cliente teu, que eu respondo como atendente do teu negócio.`

// manda a amostra agora (dentro das 24 h: texto com o link + o 1º anúncio; fora: o modelo aprovado, se tiver)
export async function entrega(c: any) {
  const atual = (await acha(c.id)) || c
  if (atual.entregue_em) return { ok: true, ja: true }
  await garanteToken(atual)
  if (janelaAberta(atual, 5)) {
    const r = await mandaTexto(atual, textoEntrega(atual))
    if (!r.ok) { await salvaJson(atual, 'amostra', { falha: String(r.error || 'erro').slice(0, 200) }); await avisaGuto('amostra não saiu', `${rotulo(atual)}: o WhatsApp recusou. Vê na tela do lançamento.`, true); return { ok: false, erro: r.error } }
    const a1 = atual.amostra?.pecas?.anuncio1
    if (a1?.path) { const link = await db.link(a1.path); if (link && !maiaLocal()) await mandaMidia(atual, /^video/.test(a1.mime) ? 'video' : 'image', link, 'Um dos anúncios que eu fiz pra ti. Os outros estão no link.', a1.mime) }
    return marcaEntregue(atual, 'texto')
  }
  const modelo = process.env.MAIA_LANC_MODELO_ENTREGA
  if (!modelo) {
    await salvaJson(atual, 'amostra', { falha: 'janela de 24 h fechada e sem modelo de entrega (MAIA_LANC_MODELO_ENTREGA)' })
    await avisaGuto('amostra parada', `${rotulo(atual)}: a janela de 24 h fechou e não tem modelo de entrega aprovado. Manda o link à mão pela caixa de Disparos.`, true)
    return { ok: false, erro: 'janela fechada e sem modelo' }
  }
  const comBotao = process.env.MAIA_LANC_MODELO_ENTREGA_BOTAO === '1'
  const r = await mandaModelo(atual, modelo, [primeiroNome(atual.nome) || 'tudo bem'], `amostra pronta ${linkAmostra(atual)}`, comBotao ? atual.token : null)
  if (!r.ok) { await salvaJson(atual, 'amostra', { falha: String(r.error || 'erro').slice(0, 200) }); await avisaGuto('amostra não saiu', `${rotulo(atual)}: o modelo foi recusado.`, true); return { ok: false, erro: r.error } }
  // sem o botão com o link, o link vai quando a pessoa responder (abre a janela)
  if (!comBotao) await salvaJson(atual, 'amostra', { falta_link: true })
  return marcaEntregue(atual, 'modelo')
}
async function marcaEntregue(c: any, como: string) {
  await salva(c, { entregue_em: new Date().toISOString(), etapa: avanca(c.etapa, 'amostra_entregue') })
  await salvaJson(c, 'amostra', { entregue_como: como, falha: null })
  await evento('lanc_entregue', { contato: c.id, como })
  return { ok: true, entregue: como }
}

// a hora de entregar? (a rotina de hora em hora): na hora combinada; ou antes, se a janela de 24 h vai fechar antes dela
export function horaDeEntregar(c: any, agora = Date.now()) {
  if (!c.amostra?.aprovada_em || c.entregue_em) return false
  if (!c.entrega_em || Date.parse(c.entrega_em) <= agora) return true
  const fecha = janelaAte(c)
  return fecha > agora && fecha < Date.parse(c.entrega_em) && fecha - agora < 75 * 60e3
}

// ---------- a abertura da página (o contador) ----------
const ROBO = /facebookexternalhit|whatsapp|bot\b|crawler|spider|preview|slurp|bingpreview|telegram|discord|skype|curl|wget/i
export async function abriu(c: any, ua: string) {
  if (ROBO.test(ua || '')) return false
  const primeira = !c.aberta_em
  await salva(c, { aberturas: (c.aberturas || 0) + 1, ...(primeira ? { aberta_em: new Date().toISOString() } : {}) })
  if (primeira) { await evento('lanc_abriu', { contato: c.id }); await marcaRick(c, 'abriu a amostra') }
  return true
}

// ---------- a página ----------
const esc = (s: any) => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))
const br = (s: any) => esc(s).replace(/\n/g, '<br>')
const rs = (n: number) => 'R$ ' + n.toLocaleString('pt-BR')

export const FUNCOES = [
  ['Cria os anúncios', 'Com as fotos e os vídeos do teu negócio, no padrão que vende.'],
  ['Edita os vídeos', 'Corta, junta e põe texto nos teus vídeos curtos do celular.'],
  ['Posta no Instagram', 'Posts com legenda pronta, no horário certo.'],
  ['Coloca a campanha no ar', 'Monta e liga o anúncio na Meta, com o especialista conferindo.'],
  ['Atende 24 horas', 'Responde cada cliente no WhatsApp em segundos, de noite e no domingo.'],
  ['Retoma quem sumiu', 'Chama de novo no outro dia, em 3 e em 6 dias, sem ser chata.'],
  ['Mede as vendas', 'Conta de qual anúncio veio cada venda.'],
  ['Te manda o relatório', 'Os números da semana e do mês, em português simples.'],
  ['Te responde na hora', 'Tu pergunta pelo WhatsApp e ela responde, sem demorar e sem reclamar.'],
  ['Tem um painel', 'Tudo num lugar só: anúncios, conversas, vendas e o que falta aprovar.'],
]
const DIA_A_DIA = [
  'O cliente que chama de noite é respondido na hora, e não esfria até de manhã.',
  'Quem some no meio da conversa é chamado de novo, sem tu precisar lembrar.',
  'Tu sabe quanto cada anúncio trouxe de venda, e o que não vende é pausado.',
  'Os anúncios e os posts chegam prontos: tu só aprova pelo celular.',
  'Quando o cliente quer fechar ou tem uma dúvida que ela não sabe, ela te chama com a conversa pronta.',
]
const INCLUSO = [
  'Implantação presencial de 3 horas com um especialista, em Lajeado ou Porto Alegre',
  'Anúncios em imagem e vídeo, feitos com as tuas fotos e vídeos',
  'Posts e vídeos pro Instagram',
  'Atendimento no WhatsApp 24 horas, com retomada de quem sumiu',
  'Campanha na Meta montada e acompanhada, com o especialista conferindo',
  'Vendas medidas por anúncio, relatório da semana e do mês, e o painel',
]

function cartaoAnuncio(neg: string, p: any, url: string | null, titulo: string) {
  if (!p || !url) return ''
  const video = /^video/.test(p.mime || '') || /\.(mp4|mov)(\?|$)/i.test(p.path || '')
  const midia = video ? `<video src="${esc(url)}" controls playsinline preload="metadata"></video>` : `<img src="${esc(url)}" alt="${esc(titulo)} da ${esc(neg)}" loading="lazy">`
  return `<figure class="ad"><figcaption class="ad-top"><span class="av">${esc((neg[0] || 'N').toUpperCase())}</span><span><b>${esc(neg)}</b><small>Patrocinado</small></span></figcaption>
<div class="ad-midia">${midia}</div><div class="ad-cta"><span>Enviar mensagem</span><span class="seta">WhatsApp</span></div>
${p.legenda ? `<p class="ad-leg"><b>${esc(neg)}</b> ${br(p.legenda)}</p>` : ''}<p class="ad-rot">${esc(titulo)}</p></figure>`
}

export async function htmlAmostra(c: any, op: { previa?: boolean } = {}) {
  const neg = nomeNeg(c), nome = primeiroNome(c.nome)
  const p = c.amostra?.pecas || {}
  const urls: Record<string, string | null> = {}
  for (const s of SLOTS) urls[s] = p[s]?.path ? await db.link(p[s].path, 60 * 60 * 24 * 7) : null
  const conv: Fala[] = c.amostra?.conversa?.length ? c.amostra.conversa : conversaSimples(c).conversa
  const retomada: string = c.amostra?.retomada || conversaSimples(c).retomada
  const testa = waLink(TEXTO_TESTE(neg))
  const marca = waLink(`Oi! Vi a amostra da Maia pra ${neg} e quero marcar a implantação.`)
  const chat = conv.map(f => `<div class="b ${f.de === 'maia' ? 'm' : 'c'}">${br(f.texto)}</div>`).join('')
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><title>Amostra da Maia pra ${esc(neg)}</title><meta name="theme-color" content="#f7f5fc">
<meta property="og:title" content="A tua amostra ficou pronta"><meta property="og:description" content="2 anúncios e 1 vídeo da ${esc(neg)}, feitos pela Maia."><meta property="og:image" content="${esc(SITE())}/maia/img/maia-og.jpg">
<link rel="icon" href="/maia/img/maia-avatar.webp">
<style>
@font-face{font-family:'Manrope';font-style:normal;font-weight:400 800;font-display:swap;src:url(/maia/fontes/manrope-latin.woff2) format('woff2')}
@font-face{font-family:'Bricolage Grotesque';font-style:normal;font-weight:300 800;font-stretch:75% 100%;font-display:swap;src:url(/maia/fontes/bricolage-latin.woff2) format('woff2')}
:root{--bg:#f7f5fc;--s1:#fff;--s2:#f3f0fa;--ln:#e6e0f2;--tx:#1b1530;--tx2:#3d3654;--mu:#6b6485;--ac:#7c3aed;--ac2:#6d28d9;--ac-bg:#f1ebfe;--grad:linear-gradient(100deg,#7c3aed,#a855f7);--verde:#15803d;--verde-bg:#dcfce7;--amb:#a85a08;--amb-bg:#fdeecb;--wa:#e7fbe9;--f-dis:'Bricolage Grotesque','Manrope',system-ui,sans-serif;--f-tx:'Manrope',system-ui,-apple-system,'Segoe UI',sans-serif;color-scheme:light}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--tx);font:16px/1.55 var(--f-tx);-webkit-font-smoothing:antialiased;overflow-x:hidden}
img,video{display:block;max-width:100%}
a{color:var(--ac2)}
:focus-visible{outline:3px solid var(--ac);outline-offset:3px;border-radius:8px}
.faixa{padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.miolo{max-width:980px;margin:0 auto}
h1,h2,h3{font-family:var(--f-dis);font-stretch:85%;letter-spacing:-.015em;line-height:1.06;text-wrap:balance}
h2{font-size:clamp(26px,5vw,38px);font-weight:800}
.rot{display:inline-block;font:800 12px var(--f-tx);letter-spacing:.12em;text-transform:uppercase;color:var(--ac2);margin-bottom:8px}
.lead{color:var(--mu);margin-top:10px;max-width:640px}
section{padding-block:44px 0}
.topo{padding-block:28px 30px;background:radial-gradient(520px 300px at 90% 0%,rgba(168,85,247,.18),transparent 70%),radial-gradient(460px 280px at 0% 0%,rgba(124,58,237,.12),transparent 70%);border-bottom:1px solid var(--ln)}
.quem{display:flex;align-items:center;gap:10px;font-weight:700;color:var(--tx2);font-size:14px}
.quem img{width:40px;height:40px;border-radius:50%;object-fit:cover}
.topo h1{font-size:clamp(32px,7vw,54px);font-weight:800;margin:18px 0 10px}
.topo h1 em{font-style:normal;background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.topo p{color:var(--tx2);max-width:620px}
.pouca{margin-top:14px;font-size:14px;color:var(--mu)}
.ads{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:20px}
.ad{background:var(--s1);border:1px solid var(--ln);border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(76,29,149,.08);min-width:0}
.ad-top{display:flex;align-items:center;gap:10px;padding:10px 12px;font-size:14px}
.ad-top small{display:block;color:var(--mu);font-size:12px}
.av{width:32px;height:32px;border-radius:50%;background:var(--ac-bg);color:var(--ac2);display:grid;place-items:center;font-weight:800;flex:none}
.ad-midia{background:#000}
.ad-midia img,.ad-midia video{width:100%;height:auto;max-height:560px;object-fit:contain;margin:0 auto}
.ad-cta{display:flex;justify-content:space-between;padding:10px 12px;background:var(--s2);font-weight:700;font-size:14px}
.ad-cta .seta{color:var(--verde)}
.ad-leg{padding:10px 12px 4px;font-size:14px;color:var(--tx2);overflow-wrap:anywhere}
.ad-rot{padding:0 12px 12px;font:800 11px var(--f-tx);letter-spacing:.1em;text-transform:uppercase;color:var(--mu)}
.fone{max-width:420px;margin-top:20px;background:#efeae2;border-radius:22px;padding:14px 12px 18px;border:1px solid var(--ln);box-shadow:0 14px 34px rgba(27,21,48,.10)}
.fone-top{display:flex;align-items:center;gap:10px;padding:2px 4px 12px;font-weight:700;font-size:14px}
.fone-top small{display:block;font-weight:500;color:var(--mu);font-size:12px}
.b{max-width:84%;padding:8px 11px;border-radius:12px;margin:6px 0;font-size:14.5px;line-height:1.4;overflow-wrap:anywhere;box-shadow:0 1px 1px rgba(0,0,0,.06)}
.b.c{background:#fff;margin-right:auto;border-top-left-radius:4px}
.b.m{background:#d9fdd3;margin-left:auto;border-top-right-radius:4px}
.sep{text-align:center;font-size:12px;color:var(--mu);margin:14px 0 6px}
.sep span{background:#fff;border-radius:8px;padding:3px 10px}
.cta{display:inline-flex;align-items:center;justify-content:center;gap:10px;background:var(--grad);color:#fff;text-decoration:none;font-weight:800;font-size:17px;padding:16px 24px;border-radius:999px;box-shadow:0 14px 30px rgba(124,58,237,.28);text-align:center}
.cta.sec{background:var(--s1);color:var(--ac2);border:2px solid var(--ac);box-shadow:none}
.teste{background:var(--s1);border:1px solid var(--ln);border-radius:20px;padding:24px;margin-top:20px}
.teste h2{margin-bottom:8px}
.teste p{color:var(--tx2);margin-bottom:16px}
.funcs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:20px}
.func{background:var(--s1);border:1px solid var(--ln);border-radius:16px;padding:16px 18px;min-width:0}
.func b{display:block;font-family:var(--f-dis);font-size:19px;font-stretch:88%}
.func span{color:var(--mu);font-size:14.5px}
.func.forte{border-color:var(--ac);background:var(--ac-bg)}
.lista{list-style:none;margin-top:16px;display:grid;gap:10px}
.lista li{background:var(--s1);border:1px solid var(--ln);border-radius:12px;padding:12px 14px 12px 40px;position:relative;color:var(--tx2)}
.lista li::before{content:"";position:absolute;left:15px;top:19px;width:10px;height:6px;border-left:2.5px solid var(--verde);border-bottom:2.5px solid var(--verde);transform:rotate(-45deg)}
.preco{background:var(--s1);border:2px solid var(--ac);border-radius:20px;padding:24px;margin-top:20px}
.preco .linha{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 12px;margin-top:10px}
.preco .de{color:var(--mu);text-decoration:line-through;font-weight:700}
.preco .por{font-family:var(--f-dis);font-weight:800;font-size:clamp(34px,8vw,48px);font-stretch:80%;line-height:1}
.preco small{color:var(--mu);font-size:14px}
.preco .mes{font-family:var(--f-dis);font-weight:800;font-size:28px;font-stretch:80%}
.selo{display:inline-block;font:800 11px var(--f-tx);letter-spacing:.1em;text-transform:uppercase;color:var(--ac2);background:var(--ac-bg);border-radius:999px;padding:5px 12px}
.aviso{background:var(--amb-bg);border-radius:16px;padding:18px 20px;margin-top:18px;color:var(--tx)}
.aviso b{color:var(--amb)}
.fim{padding-block:44px 56px;text-align:center}
.fim .cta{margin-top:16px}
.rodape{font-size:13px;color:var(--mu);margin-top:26px}
.previa{background:var(--amb-bg);color:var(--amb);text-align:center;font-weight:800;font-size:13px;padding:8px}
@media (max-width:820px){.ads{grid-template-columns:1fr;max-width:460px}.funcs{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
</style></head><body>
${op.previa ? '<div class="previa">Prévia da equipe: esta visita não conta como abertura</div>' : ''}
<header class="topo faixa"><div class="miolo">
<div class="quem"><img src="/maia/img/maia-avatar.webp" alt="A Maia"><span>Maia, a IA da Carreira no Digital</span></div>
<h1>${nome ? esc(nome) + ', a' : 'A'} tua amostra ficou <em>pronta</em></h1>
<p>Eu fiz 2 anúncios e 1 vídeo pra ${esc(neg)}, com as fotos e os vídeos que tu me mandou. Olha como eles apareceriam no Instagram.</p>
</div></header>
<main class="faixa"><div class="miolo">

<section aria-labelledby="t-ads" style="padding-top:28px">
<span class="rot">Os teus anúncios</span><h2 id="t-ads">2 anúncios e 1 vídeo da ${esc(neg)}</h2>
<div class="ads">${cartaoAnuncio(neg, p.anuncio1, urls.anuncio1, 'Anúncio 1')}${cartaoAnuncio(neg, p.anuncio2, urls.anuncio2, 'Anúncio 2')}${cartaoAnuncio(neg, p.video, urls.video, 'Vídeo editado')}</div>
<p class="pouca">Feitos com pouca informação: na implantação eles ficam no jeito do teu negócio.</p>
</section>

<section aria-labelledby="t-conv">
<span class="rot">E quando o cliente chama</span><h2 id="t-conv">Eu atendo, levo até o pedido e chamo de novo quem sumiu</h2>
<p class="lead">Um exemplo de como seria: um cliente viu o anúncio da ${esc(neg)} e chamou no WhatsApp.</p>
<div class="fone" role="img" aria-label="Exemplo de conversa no WhatsApp entre um cliente e a Maia">
<div class="fone-top"><span class="av">${esc((neg[0] || 'N').toUpperCase())}</span><span>${esc(neg)}<small>atendimento pela Maia</small></span></div>
${chat}
<div class="sep"><span>No outro dia, o cliente não tinha respondido</span></div>
<div class="b m">${br(retomada)}</div>
</div>
</section>

<section aria-labelledby="t-teste">
<div class="teste">
<span class="rot">Teste ao vivo</span><h2 id="t-teste">Agora testa tu</h2>
<p>Me manda uma pergunta como se fosse um cliente teu. Eu respondo no WhatsApp como atendente da ${esc(neg)}, com o que tu me contou. Pra sair do teste, é só escrever "sair".</p>
<a class="cta" href="${esc(testa)}">Agora testa tu: me manda uma pergunta como se fosse teu cliente</a>
</div>
</section>

<section aria-labelledby="t-func">
<span class="rot">Tudo o que eu faço</span><h2 id="t-func">O teu time de marketing inteiro, numa IA</h2>
<div class="funcs">${FUNCOES.map(([t, d], i) => `<div class="func${i === 1 ? ' forte' : ''}"><b>${esc(t)}</b><span>${esc(d)}</span></div>`).join('')}</div>
</section>

<section aria-labelledby="t-dia">
<span class="rot">No teu dia a dia</span><h2 id="t-dia">O que muda</h2>
<ul class="lista">${DIA_A_DIA.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
</section>

<section aria-labelledby="t-inc">
<span class="rot">O que está incluso</span><h2 id="t-inc">Tudo isso, todo mês</h2>
<ul class="lista">${INCLUSO.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
</section>

<section aria-labelledby="t-preco">
<div class="preco">
<span class="selo">Condição dos primeiros</span>
<h2 id="t-preco" style="margin-top:12px">Quanto custa</h2>
<div class="linha"><span>Ativação:</span><span class="de">de ${rs(PRECO.ativacao_de)}</span><span class="por">por ${rs(PRECO.ativacao_por)}</span></div>
<small>Uma vez só. É a implantação presencial de 3 horas com um especialista.</small>
<div class="linha" style="margin-top:16px"><span>Depois:</span><span class="mes">${rs(PRECO.mensal)} por mês</span></div>
<small>Sem fidelidade. A verba do anúncio e a taxa do WhatsApp tu paga direto na Meta, no teu cartão.</small>
<p style="margin-top:16px;color:var(--tx2)"><b>O teu anúncio vai pro ar ${PRECO.dias_no_ar} dias depois da implantação.</b></p>
</div>
<div class="aviso"><b>Importante:</b> ${esc(FRASE_IMPLANTACAO)}</div>
</section>

<section class="fim">
<h2>Quer a Maia trabalhando pra ${esc(neg)}?</h2>
<a class="cta" href="${esc(marca)}">Quero marcar a implantação</a><br>
<a class="cta sec" style="margin-top:12px" href="${esc(testa)}">Antes, quero testar como cliente</a>
<p class="rodape">A Maia é uma inteligência artificial da Carreira no Digital (Lajeado e Porto Alegre, RS). A foto da Maia foi feita por IA. As fotos e os vídeos dos anúncios são da ${esc(neg)}.</p>
</section>
</div></main>
</body></html>`
}
