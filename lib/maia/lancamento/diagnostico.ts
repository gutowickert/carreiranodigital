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
// O site só aparece como "pra onde o anúncio leva". Cada ponto é um par problema → solução amarrado à amostra e ao plano. As NOTAS saem da régua (rubrica.md da skill diagnostico-vendedor), em
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

// 16/11 (Guto: "o diagnóstico tem que estar atrelado ao resultado que vamos entregar"): cada ponto do raio-x é um PAR
//   o que vimos (fato com dado) → o que já fizemos pra ti (a peça da amostra que resolve) → o que a Maia faz todo mês.
// Só entra o que a gente resolve. As peças da amostra e as entregas do plano (site /maia: 6 vídeos e 6 imagens de anúncio
// por mês, 12 posts, atendimento 24 h no WhatsApp, retomada 20 h/3 d/6 d, venda medida e relatório, resposta na hora):
export const PECAS: Record<string, { nome: string; em: string }> = {
  anuncio1: { nome: 'Anúncio 1', em: 'no anúncio 1' },
  anuncio2: { nome: 'Anúncio 2', em: 'no anúncio 2' },
  video: { nome: 'Vídeo editado', em: 'no vídeo' },
  conversa: { nome: 'Conversa pronta', em: 'na conversa pronta' },
  teste: { nome: 'Teste ao vivo', em: 'no teste ao vivo' },
}
export const ENTREGAS: Record<string, string> = {
  anuncios_novos: 'Todo mês, 6 vídeos e 6 imagens de anúncio novos, com as tuas fotos reais, testados um contra o outro.',
  troca: 'O anúncio que não chama gente é trocado, e o que funciona ganha versões novas antes de cansar o público.',
  campanha_whats: 'A campanha no ar levando direto pro teu WhatsApp, montada e acompanhada com o especialista conferindo.',
  posts: '12 posts por mês no teu Instagram (carrossel, imagem e vídeo), com legenda pronta: tu só dá o joinha.',
  videos: 'Os teus vídeos curtos do celular viram anúncio e post: cortados, com texto e locução.',
  atende24: 'Atendimento no teu WhatsApp 24 horas: responde em segundos, de noite e no domingo, mostrando o valor antes do preço.',
  retomada: 'Quem some é chamado de novo no outro dia, em 3 dias e em 6 dias, sem ser chata.',
  medir: 'Cada venda contada pelo anúncio de onde veio, com o relatório da semana e do mês em português simples.',
  dono: 'Tu pergunta pelo WhatsApp e ela responde na hora; quando o cliente quer fechar, ela te passa a conversa pronta.',
}
const pecaOk = (p: any) => (p && PECAS[p] ? String(p) : null)
const entregaOk = (e: any) => (e && ENTREGAS[e] ? String(e) : null)

export type Dado = { valor: string; rotulo: string; cor?: 'sim' | 'nao' }
export type Area = { id: AreaId; nome: string; nota: number | null; dados: Dado[]; sem_rotulo?: string; sem_motivo?: string; bom?: string; oportunidade?: string }
// um ponto: o que vimos → resolve com (a peça da amostra + a entrega do mês). problema/solucao são as versões curtas (pro Rick)
export type Ponto = { area: string; vimos: string; problema: string; peca: string | null; fizemos: string; solucao: string; mensal: string | null }
export type Exemplo = AnuncioLido & { dias: number | null }
export type Diagnostico = {
  versao: 3
  gerado_em: string; gerado_por: string; ia: boolean
  empresa: string; cidade: string | null; instagram: string | null
  logo_instagram: string | null   // caminho no armazenamento (a foto do perfil, se veio)
  resumo: string
  areas: Area[]
  exemplos: Exemplo[]             // 1 a 3 anúncios reais da empresa (da Biblioteca)
  bons: string[]
  pontos: Ponto[]                 // 2 a 3 pares problema → solução
  tarefa: { titulo: string; passos: string[]; mensal: string | null }
  rick: string[]
  fontes: Record<string, { ok: boolean; detalhe?: string }>
  fatos: any
  revisado_em?: string | null; revisado_por?: string | null; editado?: boolean; ocultar?: boolean
}
// todo ponto tem que dizer com o que se resolve (a peça e a entrega do mês) pra poder marcar revisado
export const pontoCompleto = (p: Ponto) => !!(p.vimos && pecaOk(p.peca) && p.fizemos && entregaOk(p.mensal))
export const fraseRick = (p: Ponto) => `Vi que ${p.problema}; ${PECAS[p.peca || '']?.em || 'na amostra'} que a Maia fez pra ti a gente já ${p.solucao}.`

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
export type AnunciosConferidos = { status: 'nao_conferido' | 'tem' | 'nao_tem'; fonte?: 'equipe' | 'api' | 'conector' | 'conta'; por?: string; em?: string; total_ativos?: number | null; lista?: AnuncioLido[] }
const simNao = (v: any) => (v === true || v === 'sim' ? true : v === false || v === 'nao' || v === 'não' ? false : null)
export function limpaAnuncios(e: any, por: string, fonte: 'equipe' | 'conector' | 'conta' = 'equipe'): AnunciosConferidos {
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

// ---------- 4. a régua (rubrica.md), em código: a nota e os pontos (problema → solução) ----------
type Rascunho = { area: Area; bons: string[]; pontos: Ponto[]; fato_bom?: string }
const P = (area: string, vimos: string, problema: string, peca: string, fizemos: string, solucao: string, mensal: string): Ponto => ({ area, vimos, problema, peca, fizemos, solucao, mensal })

function areaAnuncios(f: Fatos, nome: string, publico: string): Rascunho {
  const base = { id: 'anuncios' as const, nome: 'Anúncios no Facebook e no Instagram' }
  const a = f.anuncios, cidade = cidadeCurta(f.cidade)
  if (a.status === 'nao_tem') {
    return {
      area: {
        ...base, nota: 2, dados: [{ valor: '0', rotulo: 'anúncios no ar', cor: 'nao' }],
        bom: `O caminho está livre: quem começar a anunciar bem no ramo${cidade ? ', em ' + cidade : ''}, aparece primeiro.`,
        oportunidade: `Anúncio é o que faz o WhatsApp tocar com gente nova${cidade ? ' de ' + cidade : ''}, e não só com quem já é cliente ou veio por indicação. Com as fotos reais do teu produto, um anúncio simples, mostrado pra ${publico} e com botão direto pro WhatsApp, coloca a ${nome} na frente de quem ainda não te conhece.`,
      },
      bons: [`O caminho dos anúncios está livre${cidade ? ' em ' + cidade : ''}: quem começar bem aparece primeiro.`],
      pontos: [P('anuncios', `Não encontramos nenhum anúncio ativo da ${nome} na Biblioteca de Anúncios da Meta. Hoje só chama quem já conhece.`, `a ${nome} ainda não tem nenhum anúncio no ar`,
        'anuncio1', 'Os 2 anúncios e o vídeo da amostra já foram feitos com as tuas fotos reais, com botão direto pro WhatsApp.', 'fez anúncios com as tuas fotos reais, com botão direto pro WhatsApp', 'anuncios_novos')],
      fato_bom: `o caminho dos anúncios está livre${cidade ? ' em ' + cidade : ''}`,
    }
  }
  if (a.status !== 'tem') return { area: { ...base, nota: null, dados: [], sem_rotulo: 'não deu pra ver', sem_motivo: 'Não conferimos a Biblioteca de Anúncios da Meta desta vez.' }, bons: [], pontos: [] }
  const L = a.lista
  if (!L.length) return { area: { ...base, nota: null, dados: [{ valor: a.total_ativos ? String(a.total_ativos) : 'Sim', rotulo: 'anúncios no ar', cor: 'sim' }], sem_rotulo: 'já anuncia', sem_motivo: `A ${nome} já tem anúncio no ar, o que pouca empresa faz. Na implantação, a Maia olha cada anúncio contigo.` }, bons: [`A ${nome} já anuncia, o que pouca empresa faz.`], pontos: [], fato_bom: `a ${nome} já anuncia` }
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
  const pontos: Ponto[] = []
  if (soPerfil) pontos.push(P('anuncios', 'Os teus anúncios levam pro perfil do Instagram: quem tem interesse precisa de 3 cliques pra falar contigo.', 'os teus anúncios levam pro perfil, e não direto pro WhatsApp',
    'anuncio1', 'Os anúncios da amostra terminam em "Enviar mensagem": levam direto pro teu WhatsApp.', 'colocou o botão direto pro WhatsApp', 'campanha_whats'))
  else if (levas.length && !temWhats && levas.includes('site')) pontos.push(P('anuncios', 'O teu anúncio leva pro site: se lá o WhatsApp não está à vista, muita gente se perde no caminho.', 'o teu anúncio leva pro site, e não direto pro WhatsApp',
    'anuncio1', 'Os anúncios da amostra terminam em "Enviar mensagem": levam direto pro teu WhatsApp.', 'colocou o botão direto pro WhatsApp', 'campanha_whats'))
  if (velho != null && velho > 60 && datas <= 1) pontos.push(P('anuncios', `O mesmo anúncio roda há ${dias(velho)}: o público cansa de ver sempre a mesma coisa.`, `o mesmo anúncio roda há ${dias(velho)}`,
    'anuncio2', 'Os anúncios da amostra são novos, feitos com as tuas fotos de agora.', 'fez anúncios novos com as tuas fotos de agora', 'troca'))
  else if (n === 1 || (L.length > 1 && datas === 1)) pontos.push(P('anuncios', n === 1 ? 'É um anúncio só no ar: sem testar outro, não dá pra saber qual chama mais gente.' : 'Os teus anúncios entraram todos no mesmo dia: sem testar um novo de tempos em tempos, não dá pra saber qual chama mais gente.', n === 1 ? 'tem um anúncio só no ar' : 'os teus anúncios entraram todos no mesmo dia',
    'anuncio2', 'Fizemos 2 anúncios diferentes pra ti, pra testar um contra o outro.', 'fez 2 anúncios diferentes, pra testar um contra o outro', 'anuncios_novos'))
  if (formatos.size && !formatos.has('video')) pontos.push(P('anuncios', 'Nenhum anúncio teu é em vídeo, e vídeo curto do dia a dia costuma chamar mais atenção.', 'nenhum anúncio teu é em vídeo',
    'video', 'O vídeo da amostra foi editado com o material que tu mandou.', 'editou um vídeo com o material que tu mandou', 'videos'))
  if (L.some(x => x.fala_publico === false)) pontos.push(P('anuncios', 'A primeira frase do anúncio não chama um público nem uma situação: quem passa rápido não se vê ali.', 'a primeira frase do anúncio não chama o teu público',
    'anuncio1', 'Os anúncios da amostra começam falando com quem compra de ti.', 'começou o anúncio falando com quem compra de ti', 'anuncios_novos'))
  if (L.some(x => x.mostra_preco === true && x.valor_antes === false)) pontos.push(P('anuncios', 'No anúncio, o preço aparece antes do que a pessoa ganha.', 'o preço aparece antes do valor no anúncio',
    'conversa', 'Na conversa pronta, a Maia mostra o que o cliente ganha antes de dizer o preço.', 'mostrou o valor antes do preço, na conversa pronta', 'atende24'))
  if (L.some(x => x.foto_real === false)) pontos.push(P('anuncios', 'O anúncio usa imagem que não é do teu negócio, e foto real passa mais confiança.', 'o anúncio usa imagem que não é do teu negócio',
    'anuncio1', 'Os anúncios da amostra usam só as fotos que tu mandou.', 'usou só as tuas fotos reais', 'anuncios_novos'))
  const area: Area = { ...base, nota, dados, bom: bons[0] }
  if (nota <= 4) area.oportunidade = `A ${nome} já investe em anúncio, e isso é meio caminho andado. Com ${soPerfil ? 'o botão levando direto pro WhatsApp' : 'anúncios novos testados de tempos em tempos'} e quem chama sendo respondido na hora, o mesmo dinheiro passa a trazer mais conversa${cidade ? ' de gente de ' + cidade : ''}.`
  return { area, bons, pontos, fato_bom: velho != null && velho > 30 ? `a ${nome} tem anúncio rodando há ${dias(velho)}` : `a ${nome} já anuncia no ${plats.has('instagram') ? 'Instagram' : 'Facebook'}` }
}

function areaInstagram(f: Fatos, nome: string): Rascunho {
  const base = { id: 'instagram' as const, nome: 'Instagram' }
  const i = f.instagram
  if (!i) return { area: { ...base, nota: null, dados: [], sem_rotulo: f.instagram_sem ? 'sem Instagram' : 'não deu pra ver', sem_motivo: f.instagram_sem ? 'Tu contou que não tem Instagram, ou não passou o @.' : `Não conseguimos abrir o perfil${f.instagram_erro && /pessoal|profissional/.test(f.instagram_erro) ? ': ele é conta pessoal, e a Meta só mostra contas profissionais' : ''}.` }, bons: [], pontos: [] }
  let n = 5
  const d = i.dias_desde_ultima, p30 = i.posts_30_dias, vid = i.videos_nas_ultimas_9
  if (d != null) { if (d <= 7) n += 2; else if (d > 30) n -= 3 }
  if (p30 != null && p30 >= 8) n += 1
  if (vid != null && vid >= 1) n += 1
  const cid = sem(cidadeCurta(f.cidade))
  const bioCidade = !!cid && sem(i.bio).includes(cid)
  n += bioCidade ? 1 : -1
  if (!(i.link_bio && normUrl(i.link_bio))) n -= 1
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
  // só o que a Maia resolve (posts e vídeos); bio e link ficam de fora
  const pontos: Ponto[] = []
  const postVideo = ['video', 'O vídeo editado da amostra já serve de post no teu Instagram.', 'editou um vídeo que já serve de post', 'posts'] as const
  if (d != null && d > 30) pontos.push(P('instagram', `A última postagem foi há ${dias(d)}: quem entra no perfil pode achar que a ${nome} parou.`, `o teu Instagram está parado há ${dias(d)}`, ...postVideo))
  else if (p30 != null && p30 < 8) pontos.push(P('instagram', `Foram ${p30} postage${p30 === 1 ? 'm' : 'ns'} nos últimos 30 dias: duas ou três por semana mantêm a ${nome} na lembrança de quem segue.`, `foram ${p30} postage${p30 === 1 ? 'm' : 'ns'} no teu Instagram em 30 dias`, ...postVideo))
  if (vid === 0) pontos.push(P('instagram', 'Nenhum vídeo nas últimas 9 postagens: vídeo curto do dia a dia é o que mais alcança gente nova.', 'não tem vídeo nas tuas últimas postagens',
    'video', 'O vídeo da amostra foi editado com o material que tu mandou.', 'editou um vídeo com o teu material', 'videos'))
  return { area: { ...base, nota: lim(n), dados, bom }, bons: [bom], pontos, fato_bom }
}

function areaAtendimento(f: Fatos): Rascunho {
  const como = String(f.coleta.como_vende || '').trim().replace(/[.!]+$/, '').slice(0, 220)
  const pontos: Ponto[] = []
  const comoS = sem(como), dif = sem(f.coleta.dificuldade)
  if (/sum|some|nao respond|esfria|demor|vacu|nao volta|desist/.test(dif)) pontos.push(P('atendimento', 'Tu contou que cliente some no meio da conversa: muita venda se perde ali, sem ninguém chamar de novo.', 'tem cliente sumindo no meio da conversa',
    'conversa', 'A conversa pronta mostra a Maia chamando de novo, no outro dia, o cliente que sumiu.', 'mostrou como ela chama de novo, no outro dia, quem sumiu', 'retomada'))
  if (/\d{1,2}\s*(h|:|hs|horas)|\bas\s*\d|segunda|terca|sabado|domingo|horario/.test(comoS) && !/24\s*h|24 horas/.test(comoS)) pontos.push(P('atendimento', 'Fora do horário que tu contou, quem chama no WhatsApp espera até o outro dia, e muita gente compra de quem responde primeiro.', 'fora do teu horário quem chama no WhatsApp fica esperando',
    'teste', 'O teste ao vivo já está pronto: manda uma pergunta como cliente e a Maia responde na hora, como atendente do teu negócio.', 'deixou o teste ao vivo pronto, respondendo na hora', 'atende24'))
  return {
    area: { id: 'atendimento', nome: 'Atendimento no WhatsApp', nota: null, dados: [], sem_rotulo: 'não testado', sem_motivo: como ? `Tu contou: "${como}". Não mandamos mensagem como cliente desta vez; na implantação a gente testa.` : 'Não mandamos mensagem como cliente desta vez; na implantação a gente testa.' },
    bons: [], pontos,
  }
}

// a tarefa grátis: o que a pessoa faz já, sozinha e de graça, e que a Maia passaria a fazer por ela
function tarefaDe(f: Fatos, pontos: Ponto[]): Diagnostico['tarefa'] {
  const L = f.anuncios.lista
  if (L.length && L.every(x => x.leva === 'instagram')) return { titulo: 'Trocar o botão do anúncio pra WhatsApp', passos: ['No Gerenciador de Anúncios, abre o anúncio que está no ar e toca em "Editar".', 'Em "Destino", escolhe WhatsApp e confere o teu número.', 'Publica de novo. Não muda a verba: só o caminho de quem clica.'], mensal: 'campanha_whats' }
  const retomar = { titulo: 'Chamar de novo 5 clientes que sumiram', passos: ['No WhatsApp, procura 5 pessoas que perguntaram nos últimos dias e não compraram.', 'Manda pra cada uma uma mensagem curta, sem cobrar: "Oi! Ficou alguma dúvida? Se quiser, separo pra ti."', 'Anota quem respondeu: é gente que estava quase comprando.'], mensal: 'retomada' }
  if (pontos.some(p => p.mensal === 'retomada')) return retomar
  if (pontos.some(p => p.area === 'instagram')) return { titulo: 'Postar 3 vídeos curtos nesta semana', passos: ['Grava 3 vídeos de até 20 segundos: o produto sendo feito, um cliente recebendo e tu contando o que vende.', 'Posta um na segunda, um na quarta e um na sexta, como Reels.', 'Na legenda, diz a cidade e termina com "chama no WhatsApp".'], mensal: 'posts' }
  return retomar
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
  // os 2 ou 3 pontos principais: o 1º dos anúncios, o 1º do atendimento, o 1º do Instagram, e depois o resto
  const pontos: Ponto[] = []
  const vistos = new Set<string>()
  for (const p of [ad.pontos[0], at.pontos[0], ig.pontos[0], ad.pontos[1], at.pontos[1], ig.pontos[1], ad.pontos[2]]) if (p && !vistos.has(p.vimos) && pontos.length < 3) { vistos.add(p.vimos); pontos.push(p) }
  // sem nenhum fato pra mostrar: o que a pessoa contou como a maior dificuldade (sem inventar)
  const dif = String(k.dificuldade || '').trim().replace(/[.!]+$/, '').slice(0, 160)
  if (pontos.length < 2 && dif) pontos.push(P('geral', `Tu contou que a maior dificuldade hoje é: "${dif}".`, `a tua maior dificuldade hoje é ${dif.charAt(0).toLowerCase() + dif.slice(1)}`,
    'anuncio1', 'Fizemos 2 anúncios e 1 vídeo com as tuas fotos, pra levar gente nova pro teu WhatsApp.', 'fez 2 anúncios e 1 vídeo com as tuas fotos', 'anuncios_novos'))
  const forte = (ad.area.nota != null && ad.area.nota >= (ig.area.nota ?? 0) && ad.area.nota > 2 ? ad.fato_bom : ig.fato_bom) || ad.fato_bom
  const resumo = [forte ? cap(forte) + '.' : '', f.anuncios.status === 'nao_tem' ? 'A maior oportunidade está nos anúncios: hoje não tem nenhum no ar, e a amostra já mostra como seriam os teus.' : pontos[0] ? `O ponto principal: ${pontos[0].problema}, e a amostra já mostra como resolver.` : ''].filter(Boolean).join(' ') || `Olhamos o que deu pra ver da ${nome} no Instagram e nos anúncios.`
  const rick = pontos.slice(0, 2).map(fraseRick)
  return { areas, exemplos: f.anuncios.lista.slice(0, 3), bons, pontos, tarefa: tarefaDe(f, pontos), resumo, rick }
}

// ---------- 5. a IA da Maia reescreve os textos (sem mudar nota, número, peça nem entrega) ----------
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

O RASCUNHO (notas, peças e entregas já estão decididas e NÃO mudam):
${JSON.stringify({ resumo: r.resumo, bons: r.bons, pontos: r.pontos.map(p => ({ vimos: p.vimos })), oportunidade: r.areas[0].oportunidade || null })}

Reescreve só estes textos, mais concretos e com o dado, sem inventar NADA:
- Só fatos que estão acima. Nunca inventa número, data, preço nem coisa que não deu pra ver. Não fala de Google nem de site (só como "pra onde o anúncio leva").
- Não fala o preço da Maia, não promete venda, faturamento nem número de clientes.
- "resumo": 2 frases, começa pelo ponto mais forte e termina no ponto principal.
- "bons": as mesmas ideias, frases curtas (até 18 palavras) com o dado.
- "vimos": um texto por ponto, na mesma ordem, 1 ou 2 frases: o fato e por que ele pesa pro dono.
- "oportunidade": só se o rascunho tem (2 ou 3 frases).
Devolve {"resumo":"...","bons":["..."],"vimos":["..."],"oportunidade":"..."|null}`,
    [], { uso: { tipo: 'lancamento_diagnostico' } })
  const ok = (t: any) => semInvencao(t, base) && !PROIBIDO.test(String(t))
  const out = { ...r, areas: r.areas.map(a => ({ ...a })), pontos: r.pontos.map(p => ({ ...p })) }
  if (ok(j?.resumo)) out.resumo = String(j.resumo).slice(0, 400)
  if (Array.isArray(j?.bons) && j.bons.length >= Math.min(2, r.bons.length) && j.bons.every(ok)) out.bons = j.bons.slice(0, 3).map((x: any) => String(x).slice(0, 200))
  if (Array.isArray(j?.vimos) && j.vimos.length === r.pontos.length && j.vimos.every(ok)) out.pontos.forEach((p, i) => { p.vimos = String(j.vimos[i]).slice(0, 320) })
  const an = out.areas.find(a => a.id === 'anuncios')!
  if (an.oportunidade && ok(j?.oportunidade)) an.oportunidade = String(j.oportunidade).slice(0, 600)
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
    versao: 3, gerado_em: new Date().toISOString(), gerado_por: op.por || 'auto', ia,
    empresa: nome, cidade: k.cidade || null, instagram: usuario, logo_instagram,
    resumo: r.resumo, areas: r.areas, exemplos: r.exemplos, bons: r.bons, pontos: r.pontos, tarefa: r.tarefa, rick: r.rick,
    fontes: {
      anuncios: { ok: an.status !== 'nao_conferido', detalhe: an.status === 'nao_tem' ? 'conferido na Biblioteca: nenhum anúncio ativo' : an.status === 'tem' ? `conferido (${an.fonte === 'api' ? 'pela API da Biblioteca' : an.fonte === 'conector' ? 'pelo conector da Meta' : an.fonte === 'conta' ? 'pela conta de anúncios que a escola gerencia' : 'pela equipe'}): tem anúncio` : `não conferido${apiErro ? ' (API: ' + apiErro + ')' : ' (a API não achou; confere na Biblioteca)'}` },
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
  // os pontos: o que vimos → resolve com (a peça da amostra + a entrega do mês). Ponto sem "o que vimos" sai
  if (Array.isArray(e.pontos)) novo.pontos = e.pontos.slice(0, 4).map((p: any, i: number): Ponto => {
    const antigo = d.pontos?.[i]
    const vimos = String(p?.vimos || '').trim().slice(0, 400)
    return {
      area: String(p?.area || antigo?.area || 'geral').slice(0, 20), vimos,
      problema: String(p?.problema || (antigo && antigo.vimos === vimos ? antigo.problema : vimos.split(/[.:]/)[0].replace(/^./, (x: string) => x.toLowerCase()))).slice(0, 200),
      peca: pecaOk(p?.peca), fizemos: String(p?.fizemos || '').trim().slice(0, 300),
      solucao: String(p?.solucao || (antigo && antigo.fizemos === String(p?.fizemos || '').trim() ? antigo.solucao : String(p?.fizemos || '').trim().replace(/[.]+$/, '').replace(/^./, (x: string) => x.toLowerCase()))).slice(0, 200),
      mensal: entregaOk(p?.mensal),
    }
  }).filter((p: Ponto) => p.vimos)
  if (e.tarefa_titulo != null) novo.tarefa = { titulo: String(e.tarefa_titulo).slice(0, 140), passos: e.tarefa_passos != null ? linhas(e.tarefa_passos).slice(0, 4).map(x => x.slice(0, 320)) : d.tarefa.passos, mensal: e.tarefa_mensal !== undefined ? entregaOk(e.tarefa_mensal) : d.tarefa?.mensal || null }
  if (e.rick != null && String(e.rick).trim()) novo.rick = linhas(e.rick).slice(0, 2).map(x => x.slice(0, 260))
  else if (Array.isArray(e.pontos)) novo.rick = novo.pontos.filter(pontoCompleto).slice(0, 2).map(fraseRick)   // sem frase escrita: sai dos pontos
  if (e.ocultar != null) novo.ocultar = !!e.ocultar
  if (e.revisado) {
    // revisado só com todo ponto amarrado a uma peça da amostra e a uma entrega do mês
    const falta = (novo.pontos || []).map((p, i) => pontoCompleto(p) ? 0 : i + 1).filter(Boolean)
    if (!novo.pontos?.length) throw new Error('o raio-x precisa de pelo menos 1 ponto (o que vimos → resolve com)')
    if (falta.length) throw new Error(`falta o "resolve com" (a peça da amostra, o que já fizemos e a entrega do mês) no ponto ${falta.join(', ')}`)
    if (!entregaOk(novo.tarefa?.mensal)) throw new Error('a tarefa grátis precisa dizer qual entrega da Maia faz isso depois')
    novo.revisado_em = new Date().toISOString(); novo.revisado_por = por
  }
  await salvaJson(atual, 'amostra', { diagnostico: novo })
  return novo
}
// entregar sem o raio-x (ex.: não deu pra ver quase nada): conta como revisado, e a página não mostra
export async function semDiagnostico(c: any, por: string) {
  const atual = (await acha(c.id)) || c
  const d = atual.amostra?.diagnostico || { versao: 3, gerado_em: null, empresa: empresaDe(atual), areas: [], exemplos: [], bons: [], pontos: [], rick: [], fontes: {} }
  await salvaJson(atual, 'amostra', { diagnostico: { ...d, ocultar: true, revisado_em: new Date().toISOString(), revisado_por: por } })
}
// a equipe (ou uma sessão do Claude com o conector da Meta) conferiu a Biblioteca de Anúncios
export async function marcaAnuncios(c: any, e: any, por: string, fonte: 'equipe' | 'conector' | 'conta' = 'equipe') {
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
