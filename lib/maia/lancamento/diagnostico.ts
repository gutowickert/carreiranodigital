// Maia, lançamento: o RAIO-X DO NEGÓCIO que vai junto com a amostra grátis (16/11/2026, pedido do Guto).
// Só as áreas que a Maia faz (Guto, 16/11: "o Google não participa, a Maia não trabalha com Google"):
//   1. ANÚNCIOS no Facebook e no Instagram (a principal, detalhada): quantos no ar, há quanto tempo cada um roda, formato,
//      pra onde leva, a primeira frase, preço e valor, foto real, troca de anúncio, plataformas, e 1 a 3 anúncios de exemplo.
//      De onde vem: a Biblioteca de Anúncios da Meta. Pelo servidor (lib/diagnostico/anuncios.ts) a Meta quase nunca abre
//      anúncio do Brasil, então quem confere de verdade é a equipe, na tela do lançamento (ou uma sessão do Claude com o
//      conector da Meta, pela mesma ação da API). Sem conferir: "não deu pra ver". Conferido e sem anúncio: nota 2 e
//      "A maior oportunidade". Busca vazia da API NUNCA vira "não tem".
//   2. INSTAGRAM (perfil e postagens): Business Discovery, a mesma função do conector da escola (lib/diagnostico/instagram.ts).
//   3. ATENDIMENTO no WhatsApp: sem teste como cliente fica sem nota; só o que a pessoa contou na coleta.
// O site só aparece como "pra onde o anúncio leva". As NOTAS saem da régua (rubrica.md da skill diagnostico-vendedor), em
// código. A IA da Maia só reescreve os textos, e todo número que ela escrever tem que existir nos fatos.
// Logo: a que a pessoa mandou (marcada na conversa ou pela equipe); senão a foto do perfil do Instagram; senão nenhuma.
// Fica no contato: amostra.diagnostico (JSON) e amostra.diag_anuncios (o que a equipe conferiu). Chave: MAIA_LANC_DIAGNOSTICO=1.
import fs from 'node:fs'
import path from 'node:path'
import { maiaDb as db, maiaLocal } from '../db'
import { contato as acha, salvaJson, midias, evento } from './base'
import type { AnuncioLido } from '@/lib/diagnostico/anuncios'

// ---------- a chave ----------
// No teste local, o script liga e desliga criando o arquivo "chave-diagnostico" na pasta do banco local
// (vale pra todas as rotas do servidor de teste ao mesmo tempo)
export const diagLigado = () => process.env.MAIA_LANC_DIAGNOSTICO === '1' ||
  (maiaLocal() && fs.existsSync(path.join(/*turbopackIgnore: true*/ process.cwd(), process.env.MAIA_LOCAL_PASTA || '.maia-local', 'chave-diagnostico')))

export const AREAS = [
  { id: 'anuncios', nome: 'Anúncios no Facebook e no Instagram' },
  { id: 'instagram', nome: 'Instagram' },
  { id: 'atendimento', nome: 'Atendimento no WhatsApp' },
] as const
export type AreaId = typeof AREAS[number]['id']

// as funções da Maia que vão ao lado de uma melhoria (os mesmos títulos da página da amostra)
export const FUNCOES_MAIA = ['Cria os anúncios', 'Edita os vídeos', 'Posta no Instagram', 'Coloca a campanha no ar', 'Atende 24 horas', 'Retoma quem sumiu', 'Mede as vendas', 'Te manda o relatório']
const funcaoOk = (f: any) => (FUNCOES_MAIA.includes(String(f || '')) ? String(f) : null)

export type Dado = { valor: string; rotulo: string; cor?: 'sim' | 'nao' }
export type Area = { id: AreaId; nome: string; nota: number | null; dados: Dado[]; sem_rotulo?: string; sem_motivo?: string; bom?: string; melhorar?: string; maia?: string | null; oportunidade?: string }
export type Melhoria = { texto: string; maia: string | null }
export type Exemplo = AnuncioLido & { dias: number | null }
export type Diagnostico = {
  versao: 2
  gerado_em: string; gerado_por: string; ia: boolean
  empresa: string; cidade: string | null; instagram: string | null
  logo_instagram: string | null   // caminho no armazenamento (a foto do perfil, se veio)
  resumo: string
  areas: Area[]
  exemplos: Exemplo[]             // 1 a 3 anúncios reais da empresa (da Biblioteca)
  bons: string[]
  melhorar: Melhoria[]
  tarefa: { titulo: string; passos: string[] }
  rick: string[]
  fontes: Record<string, { ok: boolean; detalhe?: string }>
  fatos: any
  revisado_em?: string | null; revisado_por?: string | null; editado?: boolean; ocultar?: boolean
}

// ---------- ajudantes ----------
const sem = (s: any) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
const num = (n: number, casas = 0) => n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
const lim = (n: number) => Math.max(0, Math.min(10, Math.round(n)))
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const normUrl = (u: any) => { const s = String(u || '').trim(); if (!s) return null; return /^https?:\/\//i.test(s) ? s : 'https://' + s }
const cidadeCurta = (c: any) => String(c || '').split(/[\/,(-]| - /)[0].trim()
const dias = (n: number) => `${n} dia${n === 1 ? '' : 's'}`
export const LEVA: Record<string, string> = { whatsapp: 'WhatsApp', instagram: 'perfil do Instagram', messenger: 'Messenger', site: 'site' }
export const FORMATO: Record<string, string> = { imagem: 'imagem', video: 'vídeo', carrossel: 'carrossel' }

// o @ do Instagram do que a pessoa escreveu ("@bocadinho", "instagram.com/bocadinho", "bocadinho.doces")
export function arrobaDe(t: any): string | null {
  const s = String(t || '').trim()
  if (!s || /^(nao|não|sem|nenhum)\b|nao tem|não tem|nao tenho|não tenho/i.test(s)) return null
  const m = s.match(/instagram\.com\/([A-Za-z0-9._]{1,30})/i) || s.match(/@([A-Za-z0-9._]{1,30})/)
  const cand = m ? m[1] : (s.split(/\s+/).length === 1 ? s : null)
  if (!cand) return null
  const u = cand.replace(/^@/, '').replace(/[.]+$/, '').toLowerCase()
  return /^[a-z0-9._]{1,30}$/.test(u) && /[a-z]/.test(u) ? u : null
}

export const empresaDe = (c: any) => String(c.coleta?.nome_negocio || '').trim() ||
  (c.coleta?.negocio ? String(c.coleta.negocio).split(/[,.;]/)[0].slice(0, 60).trim() : '') || ''

// ---------- 1. as fontes (de verdade, ou simuladas no teste local) ----------
async function instagramReal(usuario: string | null) {
  if (!usuario) return { ok: false, erro: 'a pessoa não tem Instagram (ou não disse o @)', sem: true }
  try { const { perfilInstagramDiagnostico } = await import('@/lib/diagnostico/instagram'); return await perfilInstagramDiagnostico(usuario) }
  catch (e: any) { return { ok: false, erro: 'Instagram: ' + String(e?.message || e).slice(0, 150) } }
}
async function anunciosReal(nome: string, usuario: string | null) {
  if (!nome && !usuario) return { ok: false, erro: 'sem nome nem @' }
  try { const { anunciosBiblioteca } = await import('@/lib/diagnostico/anuncios'); return await anunciosBiblioteca(nome, usuario) }
  catch (e: any) { return { ok: false, erro: String(e?.message || e).slice(0, 150) } }
}

// teste local: nada sai pra rede. "@naoexiste..." = perfil não achado; "@...comanuncio..." = a API acha 2 anúncios
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
function instagramSimulado(nome: string, cidade: string | null, usuario: string | null, agora = Date.now()) {
  if (!usuario) return { ok: false, erro: 'a pessoa não tem Instagram (ou não disse o @)', sem: true }
  if (/naoexiste/.test(usuario)) return { ok: false, erro: `o perfil @${usuario} não existe ou é conta pessoal` }
  return {
    ok: true, nome, usuario, bio: `Cookies artesanais pra presentear. ${cidadeCurta(cidade) || ''}`.trim(), site: 'https://wa.me/5551999990000',
    foto_perfil_base64: PNG_1PX, foto_perfil_mime: 'image/png', seguidores: 1320, total_posts: 214,
    resumo: { dias_desde_ultima_postagem: 3, postagens_ultimos_30_dias: 6, videos_ou_reels_nas_ultimas_9: 0 },
    postagens: [3, 8, 12, 17, 22, 28].map(d => ({ tipo: 'FOTO', data: new Date(agora - d * 86400e3).toISOString() })),
  }
}
function anunciosSimulados(usuario: string | null, agora = Date.now()) {
  if (!usuario || !/comanuncio/.test(usuario)) return { ok: true, achou: false }
  const d = (n: number) => new Date(agora - n * 86400e3).toISOString().slice(0, 10)
  return {
    ok: true, achou: true, pagina: usuario, total: 2, anuncios: [
      { id: '111', link: 'https://www.facebook.com/ads/library/?id=111', desde: d(95), formato: null, leva: 'instagram', texto: 'Cookies artesanais. Peça já!', plataformas: ['facebook', 'instagram'] },
      { id: '112', link: 'https://www.facebook.com/ads/library/?id=112', desde: d(95), formato: null, leva: 'instagram', texto: 'Caixa com 6 cookies por R$ 45.', plataformas: ['instagram'] },
    ] as AnuncioLido[],
  }
}

// ---------- 2. o que a equipe conferiu na Biblioteca (amostra.diag_anuncios) ----------
export type AnunciosConferidos = { status: 'nao_conferido' | 'tem' | 'nao_tem'; fonte?: 'equipe' | 'api' | 'conector'; por?: string; em?: string; total_ativos?: number | null; lista?: AnuncioLido[] }
const simNao = (v: any) => (v === true || v === 'sim' ? true : v === false || v === 'nao' || v === 'não' ? false : null)
export function limpaAnuncios(e: any, por: string, fonte: 'equipe' | 'conector' = 'equipe'): AnunciosConferidos {
  const status = ['nao_conferido', 'tem', 'nao_tem'].includes(e?.status) ? e.status : null
  if (!status) throw new Error('status de anúncio inválido (nao_conferido, tem ou nao_tem)')
  const lista: AnuncioLido[] = status !== 'tem' ? [] : (Array.isArray(e.lista) ? e.lista : []).slice(0, 3).map((a: any, i: number) => {
    const link = String(a?.link || '').trim()
    if (link && !/^https:\/\/(www\.)?facebook\.com\/ads\/library\//i.test(link)) throw new Error(`anúncio ${i + 1}: o link tem que ser da Biblioteca de Anúncios (facebook.com/ads/library)`)
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(String(a?.desde || '')) ? String(a.desde) : null
    const img = String(a?.imagem_path || '')
    return {
      id: String(a?.id || link.match(/[?&]id=(\d+)/)?.[1] || 'eq' + i), link, desde,
      formato: ['imagem', 'video', 'carrossel'].includes(a?.formato) ? a.formato : null,
      leva: ['whatsapp', 'instagram', 'messenger', 'site'].includes(a?.leva) ? a.leva : null,
      texto: String(a?.texto || '').trim().slice(0, 400),
      plataformas: (Array.isArray(a?.plataformas) ? a.plataformas : String(a?.plataformas || '').split(/[,\s]+/)).map((x: any) => sem(x)).filter((x: string) => ['facebook', 'instagram', 'messenger', 'audience_network'].includes(x)),
      fala_publico: simNao(a?.fala_publico), mostra_preco: simNao(a?.mostra_preco), valor_antes: simNao(a?.valor_antes), foto_real: simNao(a?.foto_real),
      imagem_path: img && !img.includes('..') ? img : null,
    }
  }).filter((a: AnuncioLido) => a.link || a.texto || a.desde)
  const t = e?.total_ativos === '' || e?.total_ativos == null ? null : Math.max(0, Math.round(+e.total_ativos))
  return { status, fonte, por, em: new Date().toISOString(), total_ativos: status === 'nao_tem' ? 0 : Number.isFinite(t as any) ? t : null, lista }
}

// ---------- 3. os fatos (o que vai pra régua, pra IA e fica guardado) ----------
export function fatosDe(ig: any, an: AnunciosConferidos, c: any, agora = Date.now()) {
  const i = ig?.ok ? {
    usuario: ig.usuario, nome: ig.nome, bio: ig.bio || '', link_bio: ig.site || null, seguidores: ig.seguidores ?? null, total_posts: ig.total_posts ?? null,
    dias_desde_ultima: ig.resumo?.dias_desde_ultima_postagem ?? null, posts_30_dias: ig.resumo?.postagens_ultimos_30_dias ?? null,
    videos_nas_ultimas_9: ig.resumo?.videos_ou_reels_nas_ultimas_9 ?? null,
    datas_posts: (ig.postagens || []).slice(0, 6).map((p: any) => p.data ? new Date(p.data).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null).filter(Boolean),
  } : null
  const lista: Exemplo[] = (an.lista || []).map(a => ({ ...a, dias: a.desde ? Math.max(0, Math.floor((agora - Date.parse(a.desde + 'T12:00:00Z')) / 86400e3)) : null }))
  const k = c.coleta || {}
  return {
    empresa: empresaDe(c), cidade: k.cidade || null, publico: k.publico || null, negocio: k.negocio || null,
    instagram: i, instagram_erro: ig?.ok ? null : (ig?.erro || null), instagram_sem: !!ig?.sem,
    anuncios: { status: an.status, fonte: an.fonte || null, total_ativos: an.total_ativos ?? (lista.length || null), lista },
    coleta: { como_vende: k.como_vende || null, dificuldade: k.dificuldade || null, carro_chefe: k.carro_chefe || null, produtos: k.produtos || null },
  }
}
type Fatos = ReturnType<typeof fatosDe>

// ---------- 4. a régua (rubrica.md), em código ----------
type Rascunho = { area: Area; bons: string[]; melhorias: Melhoria[]; fato_bom?: string; fato_melhorar?: string }

function areaAnuncios(f: Fatos, nome: string, publico: string): Rascunho {
  const base = { id: 'anuncios' as const, nome: 'Anúncios no Facebook e no Instagram' }
  const a = f.anuncios, cidade = cidadeCurta(f.cidade)
  if (a.status === 'nao_tem') {
    const melhorar = `Não encontramos nenhum anúncio ativo da ${nome} na Biblioteca de Anúncios da Meta. Sem anúncio, as vendas dependem de indicação e de quem já segue o perfil.`
    return {
      area: {
        ...base, nota: 2, dados: [{ valor: '0', rotulo: 'anúncios no ar', cor: 'nao' }],
        bom: `O caminho está livre: quem começar a anunciar bem no ramo${cidade ? ', em ' + cidade : ''}, aparece primeiro.`, melhorar, maia: 'Cria os anúncios',
        oportunidade: `Anúncio é o que faz o WhatsApp tocar com gente nova${cidade ? ' de ' + cidade : ''}, e não só com quem já é cliente ou veio por indicação. Com as fotos reais do teu produto, um anúncio simples, mostrado pra ${publico} e com botão direto pro WhatsApp, coloca a ${nome} na frente de quem ainda não te conhece.`,
      },
      bons: [`O caminho dos anúncios está livre${cidade ? ' em ' + cidade : ''}: quem começar bem aparece primeiro.`],
      melhorias: [{ texto: `Nenhum anúncio no ar: hoje só chama quem já conhece a ${nome}.`, maia: 'Cria os anúncios' }, { texto: 'Quando o anúncio entrar, quem chamar precisa ser respondido na hora, até de noite.', maia: 'Atende 24 horas' }],
      fato_bom: `o caminho dos anúncios está livre${cidade ? ' em ' + cidade : ''}`, fato_melhorar: `a ${nome} ainda não tem nenhum anúncio no ar`,
    }
  }
  if (a.status !== 'tem') return { area: { ...base, nota: null, dados: [], sem_rotulo: 'não deu pra ver', sem_motivo: 'Não conferimos a Biblioteca de Anúncios da Meta desta vez.' }, bons: [], melhorias: [] }
  const L = a.lista
  if (!L.length) return { area: { ...base, nota: null, dados: [{ valor: a.total_ativos ? String(a.total_ativos) : 'Sim', rotulo: 'anúncios no ar', cor: 'sim' }], sem_rotulo: 'já anuncia', sem_motivo: `A ${nome} já tem anúncio no ar, o que pouca empresa faz. Na implantação, a Maia olha cada anúncio contigo.` }, bons: [`A ${nome} já anuncia, o que pouca empresa faz.`], melhorias: [], fato_bom: `a ${nome} já anuncia` }
  const n = a.total_ativos ?? L.length
  const ds = L.map(x => x.dias).filter((x): x is number => x != null)
  const velho = ds.length ? Math.max(...ds) : null
  const datas = new Set(L.map(x => x.desde).filter(Boolean)).size
  const formatos = new Set(L.map(x => x.formato).filter(Boolean) as string[])
  const levas = L.map(x => x.leva).filter(Boolean) as string[]
  const plats = new Set(L.flatMap(x => x.plataformas || []))
  const temWhats = levas.includes('whatsapp')
  const soPerfil = levas.length > 0 && levas.every(x => x === 'instagram')
  const mesmoPost = n === 1 && velho != null && velho > 60
  let nota = 5
  if (velho != null && velho > 30) nota += 2
  if (n >= 3) nota += 1
  if (formatos.has('video')) nota += 1
  if (temWhats) nota += 1
  if (soPerfil || mesmoPost) nota -= 2
  if (L.some(x => x.fala_publico === false) && !L.some(x => x.fala_publico === true)) nota -= 1
  nota = lim(nota)
  const dados: Dado[] = [{ valor: String(n), rotulo: 'anúncios no ar' }]
  if (velho != null) dados.push({ valor: dias(velho), rotulo: 'o mais antigo no ar' })
  if (formatos.size) dados.push({ valor: [...formatos].map(x => FORMATO[x]).join(', '), rotulo: 'formatos' })
  if (levas.length) dados.push({ valor: [...new Set(levas)].map(x => LEVA[x]).join(', '), rotulo: 'leva pra', ...(temWhats ? { cor: 'sim' as const } : soPerfil ? { cor: 'nao' as const } : {}) })
  if (plats.size) dados.push({ valor: [...plats].filter(x => x === 'facebook' || x === 'instagram').map(cap).join(' e ') || [...plats].join(', '), rotulo: 'onde aparece' })
  const bons: string[] = []
  if (velho != null && velho > 30) bons.push(`O anúncio mais antigo roda há ${dias(velho)}: anúncio que fica tanto tempo no ar costuma ser o que funciona.`)
  if (n >= 3) bons.push(`Tem ${n} anúncios no ar ao mesmo tempo: já testa variações.`)
  if (temWhats) bons.push('O anúncio leva direto pro WhatsApp: quem tem interesse fala contigo num toque.')
  if (formatos.has('video')) bons.push('Já anuncia com vídeo, o formato que mais segura a atenção.')
  if (L.some(x => x.fala_publico === true)) bons.push('A primeira frase chama um público e uma situação: quem passa rápido se vê ali.')
  if (L.some(x => x.valor_antes === true)) bons.push('O anúncio mostra o que a pessoa ganha antes do preço.')
  if (!bons.length) bons.push(`A ${nome} já anuncia, o que pouca empresa da cidade faz.`)
  const melhorias: Melhoria[] = []
  if (soPerfil) melhorias.push({ texto: 'Os anúncios levam pro perfil do Instagram: quem tem interesse precisa de 3 cliques pra falar contigo. Levar direto pro WhatsApp encurta o caminho.', maia: 'Coloca a campanha no ar' })
  else if (levas.length && !temWhats && levas.includes('site')) melhorias.push({ texto: 'O anúncio leva pro site. Se lá o WhatsApp não está à vista, muita gente se perde no caminho.', maia: 'Coloca a campanha no ar' })
  if (n === 1 || (L.length > 1 && datas === 1)) melhorias.push({ texto: n === 1 ? 'É um anúncio só no ar. Sem testar outro, não dá pra saber qual chama mais gente.' : 'Os anúncios entraram todos no mesmo dia. Testar um novo de tempos em tempos mostra qual chama mais gente.', maia: 'Cria os anúncios' })
  if (velho != null && velho > 60 && datas <= 1) melhorias.push({ texto: `O mesmo anúncio roda há ${dias(velho)}. Trocar a imagem ou a primeira frase a cada poucas semanas evita que o público canse.`, maia: 'Cria os anúncios' })
  if (formatos.size && !formatos.has('video')) melhorias.push({ texto: 'Nenhum anúncio em vídeo. Vídeo curto do dia a dia costuma chamar mais atenção.', maia: 'Edita os vídeos' })
  if (L.some(x => x.fala_publico === false)) melhorias.push({ texto: 'A primeira frase não chama um público nem uma situação. Quem passa rápido precisa se ver ali logo de cara.', maia: 'Cria os anúncios' })
  if (L.some(x => x.mostra_preco === true && x.valor_antes === false)) melhorias.push({ texto: 'O preço aparece antes do que a pessoa ganha. Mostrar o valor primeiro faz o preço parecer justo.', maia: 'Cria os anúncios' })
  if (L.some(x => x.foto_real === false)) melhorias.push({ texto: 'O anúncio usa imagem que não é do teu negócio. Foto real do teu produto passa mais confiança.', maia: 'Cria os anúncios' })
  if (!melhorias.length) melhorias.push({ texto: 'Saber de qual anúncio veio cada venda mostra onde vale pôr o dinheiro.', maia: 'Mede as vendas' })
  const area: Area = { ...base, nota, dados, bom: bons[0], melhorar: melhorias[0].texto, maia: melhorias[0].maia }
  if (nota <= 4) area.oportunidade = `A ${nome} já investe em anúncio, e isso é meio caminho andado. Com ${soPerfil ? 'o botão levando direto pro WhatsApp' : 'anúncios novos testados de tempos em tempos'} e quem chama sendo respondido na hora, o mesmo dinheiro passa a trazer mais conversa${cidade ? ' de gente de ' + cidade : ''}.`
  return {
    area, bons, melhorias,
    fato_bom: velho != null && velho > 30 ? `a ${nome} tem anúncio rodando há ${dias(velho)}` : `a ${nome} já anuncia no ${plats.has('instagram') ? 'Instagram' : 'Facebook'}`,
    fato_melhorar: soPerfil ? 'os anúncios levam pro perfil, e não direto pro WhatsApp' : n === 1 ? 'é um anúncio só no ar' : melhorias[0].texto.split('.')[0].toLowerCase(),
  }
}

function areaInstagram(f: Fatos, nome: string): Rascunho {
  const base = { id: 'instagram' as const, nome: 'Instagram' }
  const i = f.instagram
  if (!i) return { area: { ...base, nota: null, dados: [], sem_rotulo: f.instagram_sem ? 'sem Instagram' : 'não deu pra ver', sem_motivo: f.instagram_sem ? 'Tu contou que não tem Instagram, ou não passou o @.' : `Não conseguimos abrir o perfil${f.instagram_erro && /pessoal|profissional/.test(f.instagram_erro) ? ': ele é conta pessoal, e a Meta só mostra contas profissionais' : ''}.` }, bons: [], melhorias: [] }
  let n = 5
  const d = i.dias_desde_ultima, p30 = i.posts_30_dias, vid = i.videos_nas_ultimas_9
  if (d != null) { if (d <= 7) n += 2; else if (d > 30) n -= 3 }
  if (p30 != null && p30 >= 8) n += 1
  if (vid != null && vid >= 1) n += 1
  const cid = sem(cidadeCurta(f.cidade))
  const bioCidade = !!cid && sem(i.bio).includes(cid)
  n += bioCidade ? 1 : -1
  const link = i.link_bio ? normUrl(i.link_bio) : null
  if (!link) n -= 1
  const dados: Dado[] = []
  if (i.seguidores != null) dados.push({ valor: num(i.seguidores), rotulo: 'seguidores' })
  if (p30 != null) dados.push({ valor: String(p30), rotulo: 'postagens em 30 dias' })
  if (d != null) dados.push({ valor: d === 0 ? 'hoje' : dias(d), rotulo: 'desde a última' })
  if (vid != null) dados.push({ valor: String(vid), rotulo: 'vídeos nas últimas 9', ...(vid ? {} : { cor: 'nao' as const }) })
  let bom: string, fato_bom: string
  if (d != null && d <= 7) { bom = `Postou há ${d === 0 ? 'menos de 1 dia' : dias(d)}${i.seguidores != null ? ` e tem ${num(i.seguidores)} seguidores` : ''}: o perfil está vivo.`; fato_bom = `o Instagram da ${nome} está ativo: a última postagem foi ${d === 0 ? 'hoje' : 'há ' + dias(d)}` }
  else if (vid) { bom = 'Tem vídeo nas últimas postagens, o formato que mais alcança gente nova.'; fato_bom = `a ${nome} já posta vídeo no Instagram` }
  else if (bioCidade) { bom = `A bio diz onde a ${nome} atende: quem chega sabe logo se é perto.`; fato_bom = 'a bio do Instagram já diz a cidade' }
  else { bom = `${i.seguidores != null ? num(i.seguidores) + ' pessoas já seguem' : 'Já tem gente seguindo'} a ${nome} no Instagram.`; fato_bom = `a ${nome} tem ${i.seguidores != null ? num(i.seguidores) + ' seguidores' : 'seguidores'} no Instagram` }
  let melhorar: string, maia: string | null, fato_melhorar: string
  if (d != null && d > 30) { melhorar = `A última postagem foi há ${dias(d)}. Quem entra no perfil pode achar que a ${nome} parou.`; maia = 'Posta no Instagram'; fato_melhorar = `o Instagram está parado há ${dias(d)}` }
  else if (p30 != null && p30 < 8) { melhorar = `Foram ${p30} postage${p30 === 1 ? 'm' : 'ns'} nos últimos 30 dias. Duas por semana mantêm a ${nome} na lembrança de quem segue.`; maia = 'Posta no Instagram'; fato_melhorar = `foram ${p30} postage${p30 === 1 ? 'm' : 'ns'} no Instagram nos últimos 30 dias` }
  else if (vid === 0) { melhorar = 'Nenhum vídeo nas últimas 9 postagens. Vídeo curto do dia a dia é o que mais alcança gente nova.'; maia = 'Edita os vídeos'; fato_melhorar = 'não tem vídeo nas últimas postagens do Instagram' }
  else if (!bioCidade) { melhorar = `A bio não diz a cidade. Quem chega precisa saber, logo de cara, onde a ${nome} atende.`; maia = null; fato_melhorar = 'a bio do Instagram não diz a cidade' }
  else if (!link) { melhorar = 'A bio não tem link. Quem quer comprar precisa procurar o teu número.'; maia = null; fato_melhorar = 'a bio do Instagram não tem link pro WhatsApp' }
  else { melhorar = 'Dá pra mostrar mais o dia a dia, com gente de verdade, em vídeos curtos.'; maia = 'Edita os vídeos'; fato_melhorar = 'dá pra usar mais vídeo curto no Instagram' }
  return { area: { ...base, nota: lim(n), dados, bom, melhorar, maia }, bons: [bom], melhorias: [{ texto: melhorar, maia }], fato_bom, fato_melhorar }
}

function areaAtendimento(f: Fatos): Rascunho {
  const como = String(f.coleta.como_vende || '').trim().replace(/[.!]+$/, '').slice(0, 220)
  const melhorias: Melhoria[] = []
  const comoS = sem(como), dif = sem(f.coleta.dificuldade)
  if (/\d{1,2}\s*(h|:|hs|horas)|\bas\s*\d|segunda|terca|sabado|domingo|horario/.test(comoS) && !/24\s*h|24 horas/.test(comoS)) melhorias.push({ texto: 'Fora do horário que tu contou, quem chama no WhatsApp espera até o outro dia, e muita gente compra de quem responde primeiro.', maia: 'Atende 24 horas' })
  if (/sum|some|nao respond|esfria|demor|vacu|nao volta|desist/.test(dif)) melhorias.push({ texto: 'Tu contou que cliente some no meio da conversa. Chamar de novo no outro dia, sem ser chato, recupera parte dessas vendas.', maia: 'Retoma quem sumiu' })
  return {
    area: { id: 'atendimento', nome: 'Atendimento no WhatsApp', nota: null, dados: [], sem_rotulo: 'não testado', sem_motivo: como ? `Tu contou: "${como}". Não mandamos mensagem como cliente desta vez; na implantação a gente testa.` : 'Não mandamos mensagem como cliente desta vez; na implantação a gente testa.', ...(melhorias[0] ? { melhorar: melhorias[0].texto, maia: melhorias[0].maia } : {}) },
    bons: [], melhorias, fato_melhorar: melhorias[0] ? (melhorias[0].maia === 'Atende 24 horas' ? 'fora do teu horário quem chama no WhatsApp fica esperando' : 'tem cliente sumindo no meio da conversa') : undefined,
  }
}

function tarefaDe(f: Fatos, nome: string): Diagnostico['tarefa'] {
  const i = f.instagram, L = f.anuncios.lista
  if (L.length && L.every(x => x.leva === 'instagram')) return { titulo: 'Trocar o botão do anúncio pra WhatsApp', passos: ['No Gerenciador de Anúncios, abre o anúncio que está no ar e toca em "Editar".', 'Em "Destino", escolhe WhatsApp e confere o teu número.', 'Publica de novo. Não muda a verba: só o caminho de quem clica.'] }
  if (i && !i.link_bio) return { titulo: 'Pôr o link do WhatsApp na bio do Instagram', passos: ['No Instagram, toca em "Editar perfil" e depois em "Links".', 'Cola o link wa.me/55 seguido do teu número com DDD (ex.: wa.me/5551999990000).', 'Na bio, escreve numa linha o que tu vende e a cidade. Salva.'] }
  if (i && ((i.dias_desde_ultima ?? 0) > 7 || (i.posts_30_dias ?? 0) < 8 || i.videos_nas_ultimas_9 === 0)) return { titulo: 'Postar 3 vídeos curtos nesta semana', passos: ['Grava 3 vídeos de até 20 segundos: o produto sendo feito, um cliente recebendo e tu contando o que vende.', 'Posta um na segunda, um na quarta e um na sexta, como Reels.', 'Na legenda, diz a cidade e termina com "chama no WhatsApp".'] }
  return { titulo: 'Escrever a primeira frase do teu próximo anúncio', passos: [`Pensa no cliente que mais compra da ${nome} e no momento em que ele precisa de ti.`, 'Escreve uma pergunta curta que ele responderia "sim" (o público e a situação), e só depois o que ele ganha.', 'Posta essa frase num story com uma foto real e vê quem responde.'] }
}

export const notaGeral = (areas: Area[]) => { const ns = areas.map(a => a.nota).filter((n): n is number => typeof n === 'number'); return ns.length ? Math.round(ns.reduce((s, n) => s + n, 0) / ns.length * 10) / 10 : null }

// o rascunho inteiro, só com a régua (é também o que vale sem IA ou se a IA falhar)
export function rascunho(f: Fatos, c: any) {
  const nome = f.empresa || 'a tua empresa'
  const k = c.coleta || {}
  const publico = String(k.publico || '').trim() || (/\b(pra|para) (.+)$/i.exec(String(k.negocio || ''))?.[2] || '').replace(/[.!]+$/, '').slice(0, 60) || `quem mora${f.cidade ? ' em ' + cidadeCurta(f.cidade) : ' perto'}`
  const [ad, ig, at] = [areaAnuncios(f, nome, publico), areaInstagram(f, nome), areaAtendimento(f)]
  const areas = [ad.area, ig.area, at.area]
  const bons = [...ad.bons.slice(0, 2), ...ig.bons].slice(0, 3)
  const melhorar: Melhoria[] = []
  const vistos = new Set<string>()
  for (const m of [ad.melhorias[0], at.melhorias[0], ig.melhorias[0], ad.melhorias[1], at.melhorias[1], ad.melhorias[2]]) if (m && !vistos.has(m.texto)) { vistos.add(m.texto); melhorar.push(m) }
  const forte = (ad.area.nota != null && ad.area.nota >= (ig.area.nota ?? 0) && ad.area.nota > 2 ? ad.fato_bom : ig.fato_bom) || ad.fato_bom
  const fraco = ad.area.oportunidade ? ad.fato_melhorar : ad.fato_melhorar || at.fato_melhorar || ig.fato_melhorar
  const resumo = [forte ? cap(forte) + '.' : '', f.anuncios.status === 'nao_tem' ? 'A maior oportunidade está nos anúncios: hoje não tem nenhum no ar, então só chama quem já conhece.' : fraco ? `O que mais dá pra melhorar: ${fraco}.` : ''].filter(Boolean).join(' ') || `Olhamos o que deu pra ver da ${nome} no Instagram e nos anúncios.`
  const rick = [forte ? `Vi na tua análise que ${forte}.` : '', fraco ? `E que ${fraco}: é por aí que a Maia começa.` : ''].filter(Boolean)
  const exemplos = f.anuncios.lista.slice(0, 3)
  return { areas, exemplos, bons, melhorar: melhorar.slice(0, 3), tarefa: tarefaDe(f, nome), resumo, rick }
}

// ---------- 5. a IA da Maia reescreve os textos (sem mudar nota nem número) ----------
const usaIA = () => process.env.MAIA_LANC_IA === '1' || (!maiaLocal() && process.env.MAIA_LANC_IA !== '0' && !!process.env.ANTHROPIC_API_KEY)
// todo número do texto tem que existir nos fatos (ou no rascunho): senão a IA inventou
const numeros = (t: string) => (String(t).match(/\d+(?:[.,]\d+)?/g) || []).map(x => x.replace(',', '.'))
export function semInvencao(texto: any, base: string) {
  if (typeof texto !== 'string' || !texto.trim()) return false
  const b = base.replace(/(\d),(\d)/g, '$1.$2')
  return numeros(texto).every(n => b.includes(n))
}
const PROIBIDO = /R\$|\breais\b|deu venda|teunegocio|garant|vai vender|\d+\s*%|google/i

async function textosIA(f: Fatos, r: ReturnType<typeof rascunho>) {
  const { emJson } = await import('../ia')
  const base = JSON.stringify({ f, r })
  const j: any = await emJson(
    'Tu és a Maia, a IA de marketing da Carreira no Digital (RS), escrevendo o RAIO-X do negócio de um dono que pediu uma amostra grátis. Português do Brasil simples, com "tu", jeito gaúcho leve. Sem emoji, sem inglês, sem jargão (diz "anúncio", não "criativo"). Tom de quem quer ajudar, nunca de quem humilha. Só devolves JSON.',
    `OS FATOS (vieram da Biblioteca de Anúncios da Meta, do Instagram e do que o dono contou; é tudo o que existe):
${JSON.stringify(f).slice(0, 5000)}

O RASCUNHO (as notas já estão dadas pela régua da escola e NÃO mudam):
${JSON.stringify({ areas: r.areas.map(a => ({ id: a.id, nota: a.nota, bom: a.bom, melhorar: a.melhorar, oportunidade: a.oportunidade })), bons: r.bons, melhorar: r.melhorar, tarefa: r.tarefa, resumo: r.resumo, rick: r.rick })}

Reescreve os textos do rascunho no teu jeito, mais concretos e com o dado, sem inventar NADA:
- Só fatos que estão acima. Nunca inventa número, data, preço nem coisa que não deu pra ver. Não fala de Google nem de site (só como "pra onde o anúncio leva").
- Os anúncios são o centro: o que está bom e o que melhorar neles vem primeiro.
- Não fala o preço da Maia, não promete venda, faturamento nem número de clientes. Não diz "tu precisa de nós".
- "melhorar": 3 itens, cada um com a função da Maia que resolve, só se fizer sentido, desta lista: ${FUNCOES_MAIA.join(', ')}. Sem sentido: null.
- "bons": 3 frases curtas (até 18 palavras) com o dado. "resumo": 2 frases, começa pelo ponto mais forte e termina na maior oportunidade.
- "tarefa": a mesma ideia do rascunho (ou outra melhor, que o dono faz sozinho em 30 minutos, de graça, sem a escola), 2 ou 3 passos.
- "rick": 1 ou 2 frases curtas que o vendedor fala num áudio pro dono, começando com "Vi na tua análise que...".
- "oportunidade": só se o rascunho tem (2 ou 3 frases).
Devolve {"resumo":"...","bons":["..."],"melhorar":[{"texto":"...","maia":"..."|null}],"oportunidade":"..."|null,"tarefa":{"titulo":"...","passos":["..."]},"rick":["..."]}`,
    [], { uso: { tipo: 'lancamento_diagnostico' } })
  const ok = (t: any) => semInvencao(t, base) && !PROIBIDO.test(String(t))
  const out = { ...r, areas: r.areas.map(a => ({ ...a })) }
  if (ok(j?.resumo)) out.resumo = String(j.resumo).slice(0, 400)
  if (Array.isArray(j?.bons) && j.bons.length >= 2 && j.bons.every(ok)) out.bons = j.bons.slice(0, 3).map((x: any) => String(x).slice(0, 200))
  if (Array.isArray(j?.melhorar) && j.melhorar.length >= 2 && j.melhorar.every((m: any) => ok(m?.texto))) out.melhorar = j.melhorar.slice(0, 3).map((m: any) => ({ texto: String(m.texto).slice(0, 300), maia: funcaoOk(m.maia) }))
  const an = out.areas.find(a => a.id === 'anuncios')!
  if (an.oportunidade && ok(j?.oportunidade)) an.oportunidade = String(j.oportunidade).slice(0, 600)
  if (j?.tarefa && ok(j.tarefa.titulo) && Array.isArray(j.tarefa.passos) && j.tarefa.passos.length >= 2 && j.tarefa.passos.every((p: any) => typeof p === 'string' && !PROIBIDO.test(p))) out.tarefa = { titulo: String(j.tarefa.titulo).slice(0, 120), passos: j.tarefa.passos.slice(0, 3).map((p: any) => String(p).slice(0, 300)) }
  if (Array.isArray(j?.rick) && j.rick.length && j.rick.every(ok)) out.rick = j.rick.slice(0, 2).map((x: any) => String(x).slice(0, 240))
  return out
}

// ---------- 6. gerar (automático no "Material recebido", pela rotina, ou pelo botão da equipe) ----------
export async function geraDiagnostico(c0: any, op: { por?: string } = {}): Promise<Diagnostico> {
  const c = (await acha(c0.id)) || c0
  const k = c.coleta || {}
  const nome = empresaDe(c)
  const usuario = arrobaDe(k.instagram)
  await salvaJson(c, 'estado', { diag_tentativas: (c.estado?.diag_tentativas || 0) + 1 })
  const [ig, api] = maiaLocal()
    ? [instagramSimulado(nome, k.cidade || null, usuario), anunciosSimulados(usuario)]
    : await Promise.all([instagramReal(usuario), anunciosReal(nome, usuario)])
  // o que a equipe conferiu vale mais; a API só entra quando ninguém conferiu e ela achou anúncio da página
  let an: AnunciosConferidos = c.amostra?.diag_anuncios?.status && c.amostra.diag_anuncios.status !== 'nao_conferido' ? c.amostra.diag_anuncios : { status: 'nao_conferido' }
  if (an.status === 'nao_conferido' && (api as any)?.ok && (api as any).achou) {
    an = { status: 'tem', fonte: 'api', por: 'biblioteca', em: new Date().toISOString(), total_ativos: (api as any).total ?? null, lista: (api as any).anuncios || [] }
    await salvaJson(c, 'amostra', { diag_anuncios: an })
  }
  const f = fatosDe(ig, an, c)
  let r = rascunho(f, c), ia = false
  if (usaIA()) { try { r = await textosIA(f, r); ia = true } catch (e: any) { await evento('lanc_diag_ia_erro', { contato: c.id, erro: String(e?.message || e).slice(0, 200) }) } }
  // a foto do perfil do Instagram vira a logo reserva (a que a pessoa mandou tem prioridade, na hora de mostrar)
  let logo_instagram: string | null = null
  const b64 = (ig as any)?.ok ? (ig as any).foto_perfil_base64 : null
  if (b64) {
    const png = (ig as any).foto_perfil_mime === 'image/png'
    try { logo_instagram = await db.sobe(`lanc-${c.id}/logo/instagram.${png ? 'png' : 'jpg'}`, Buffer.from(b64, 'base64'), png ? 'image/png' : 'image/jpeg') } catch { logo_instagram = null }
  }
  const apiErro = (api as any)?.ok ? null : (api as any)?.erro
  const d: Diagnostico = {
    versao: 2, gerado_em: new Date().toISOString(), gerado_por: op.por || 'auto', ia,
    empresa: nome, cidade: k.cidade || null, instagram: usuario, logo_instagram,
    resumo: r.resumo, areas: r.areas, exemplos: r.exemplos, bons: r.bons, melhorar: r.melhorar, tarefa: r.tarefa, rick: r.rick,
    fontes: {
      anuncios: { ok: an.status !== 'nao_conferido', detalhe: an.status === 'nao_tem' ? 'conferido na Biblioteca: nenhum anúncio ativo' : an.status === 'tem' ? `conferido (${an.fonte === 'api' ? 'pela API da Biblioteca' : an.fonte === 'conector' ? 'pelo conector da Meta' : 'pela equipe'}): tem anúncio` : `não conferido${apiErro ? ' (API: ' + apiErro + ')' : ' (a API não achou; confere na Biblioteca)'}` },
      instagram: { ok: !!(ig as any)?.ok, detalhe: (ig as any)?.ok ? '@' + (ig as any).usuario : (ig as any)?.erro },
      atendimento: { ok: !!k.como_vende, detalhe: 'o que a pessoa contou na coleta' },
    },
    fatos: f, revisado_em: null, revisado_por: null, editado: false, ocultar: false,
  }
  await salvaJson(c, 'amostra', { diagnostico: d })
  await evento('lanc_diagnostico', { contato: c.id, ia, notas: d.areas.map(a => a.nota) })
  return d
}

// ---------- 7. a equipe corrige ----------
export async function salvaDiagnostico(c: any, e: any, por: string) {
  const atual = (await acha(c.id)) || c
  const d: Diagnostico | undefined = atual.amostra?.diagnostico
  if (!d) throw new Error('ainda não tem raio-x: gera primeiro')
  const linhas = (t: any) => (Array.isArray(t) ? t : String(t || '').split(/\r?\n/)).map((x: any) => String(x).trim()).filter(Boolean)
  const novo: Diagnostico = { ...d, editado: true }
  if (e.resumo != null) novo.resumo = String(e.resumo).slice(0, 600)
  if (e.notas && typeof e.notas === 'object') novo.areas = d.areas.map(a => {
    if (!(a.id in e.notas)) return a
    const v = e.notas[a.id]
    const n = v === '' || v == null ? null : Math.max(0, Math.min(10, Math.round(+v)))
    if (n !== null && !Number.isFinite(n)) return a
    return { ...a, nota: n, ...(n === null && !a.sem_rotulo ? { sem_rotulo: 'não deu pra ver', sem_motivo: a.sem_motivo || 'Não deu pra ver desta vez.' } : {}) }
  })
  if (e.oportunidade != null) novo.areas = novo.areas.map(a => a.id === 'anuncios' ? { ...a, oportunidade: String(e.oportunidade).trim().slice(0, 800) || undefined } : a)
  if (e.bons != null) novo.bons = linhas(e.bons).slice(0, 5).map(x => x.slice(0, 240))
  // "texto | função da Maia" (a função é opcional)
  if (e.melhorar != null) novo.melhorar = linhas(e.melhorar).slice(0, 5).map(l => { const [t, fn] = l.split('|').map(x => x.trim()); return { texto: t.slice(0, 320), maia: funcaoOk(fn) } })
  if (e.tarefa_titulo != null) novo.tarefa = { titulo: String(e.tarefa_titulo).slice(0, 140), passos: e.tarefa_passos != null ? linhas(e.tarefa_passos).slice(0, 4).map(x => x.slice(0, 320)) : d.tarefa.passos }
  if (e.rick != null) novo.rick = linhas(e.rick).slice(0, 2).map(x => x.slice(0, 260))
  if (e.ocultar != null) novo.ocultar = !!e.ocultar
  if (e.revisado) { novo.revisado_em = new Date().toISOString(); novo.revisado_por = por }
  await salvaJson(atual, 'amostra', { diagnostico: novo })
  return novo
}
// entregar sem o raio-x (ex.: não deu pra ver quase nada): conta como revisado, e a página não mostra
export async function semDiagnostico(c: any, por: string) {
  const atual = (await acha(c.id)) || c
  const d = atual.amostra?.diagnostico || { versao: 2, gerado_em: null, empresa: empresaDe(atual), areas: [], exemplos: [], bons: [], melhorar: [], rick: [], fontes: {} }
  await salvaJson(atual, 'amostra', { diagnostico: { ...d, ocultar: true, revisado_em: new Date().toISOString(), revisado_por: por } })
}
// a equipe (ou uma sessão do Claude com o conector da Meta) conferiu a Biblioteca de Anúncios
export async function marcaAnuncios(c: any, e: any, por: string, fonte: 'equipe' | 'conector' = 'equipe') {
  const an = limpaAnuncios(e, por, fonte)
  for (const a of an.lista || []) if (a.imagem_path && !a.imagem_path.startsWith(`lanc-${c.id}/`)) throw new Error('a imagem do anúncio tem que ser desse contato')
  await salvaJson(c, 'amostra', { diag_anuncios: an })
  return an
}
// a logo: a pessoa disse (na conversa) ou a equipe marcou. null tira
export async function marcaLogo(c: any, midia_id: string | null, por: string) {
  if (midia_id) {
    const m = (await midias(c.id)).find(x => x.id === midia_id)
    if (!m || m.tipo !== 'foto') throw new Error('essa foto não é desse contato')
  }
  await salvaJson(c, 'amostra', { logo: midia_id ? { midia_id, por, em: new Date().toISOString() } : null })
}
export const logoMidiaId = (c: any) => c.amostra?.logo?.midia_id || null

// o caminho da logo que vale agora (a que a pessoa mandou; senão a do Instagram)
export async function logoDe(c: any): Promise<{ path: string; origem: 'contato' | 'instagram' } | null> {
  const id = logoMidiaId(c)
  if (id) { const m = (await midias(c.id)).find(x => x.id === id); if (m) return { path: m.path, origem: 'contato' } }
  const p = c.amostra?.diagnostico?.logo_instagram
  return p ? { path: p, origem: 'instagram' } : null
}

// o link da Biblioteca de Anúncios pra equipe conferir (pelo nome da empresa)
export const linkBiblioteca = (c: any) => `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&media_type=all&search_type=keyword_unordered&q=${encodeURIComponent(empresaDe(c) || arrobaDe(c.coleta?.instagram) || '')}`

// o raio-x aparece na página? (a prévia da equipe mostra mesmo sem revisar)
export function diagVisivel(c: any, previa = false) {
  const d = c.amostra?.diagnostico
  return !!(diagLigado() && d && d.areas?.length && !d.ocultar && (d.revisado_em || previa))
}

// a rotina de hora em hora: quem chegou no "Material recebido" e ainda não tem raio-x (até 2 tentativas, 3 por vez)
export async function diagnosticosPendentes() {
  if (!diagLigado()) return []
  const feitos: any[] = []
  const todos = await db.lista('lanc_contatos')
  for (const c of todos.filter(x => ['material_recebido', 'em_producao'].includes(x.etapa) && !x.amostra?.diagnostico && (x.estado?.diag_tentativas || 0) < 2).slice(0, 3)) {
    try { const d = await geraDiagnostico(c, { por: 'rotina' }); feitos.push({ contato: c.id, notas: d.areas.map(a => a.nota) }) }
    catch (e: any) { feitos.push({ contato: c.id, erro: String(e?.message || e).slice(0, 200) }) }
  }
  return feitos
}
