// Maia: o teste da GRADE DA SEMANA do Instagram/Facebook (lib/maia/grade-social.ts, 23/11).
// Roda os módulos direto (sem servidor), em MODO LOCAL (.maia-teste/grade-social) e com a IA SIMULADA: nada sai pra internet.
// Uso: node scripts/maia-teste-grade-social.mjs
import fs from 'node:fs'
import path from 'node:path'
import { createJiti } from 'jiti'

const RAIZ = path.resolve(import.meta.dirname, '..')
const PASTA = '.maia-teste/grade-social'
fs.rmSync(path.join(RAIZ, PASTA), { recursive: true, force: true })
Object.assign(process.env, { MAIA_LOCAL: '1', MAIA_LOCAL_PASTA: PASTA, MAIA_SEM_AVISO: '1', MAIA_SOCIAL_LIGADO: '1', ANTHROPIC_API_KEY: 'teste' })
for (const k of ['MAIA_META_REAL', 'MAIA_SOCIAL_TOKEN', 'MAIA_ADS_TOKEN', 'FB_ADS_TOKEN']) delete process.env[k]
process.chdir(RAIZ)

// ---------- a IA simulada: responde a grade usando os ids da lista (ou ids ruins, quando o teste pede) ----------
let iaRuim = false, iaSemLegenda = false
const pedidos = []
const resp = (j, status = 200) => new Response(JSON.stringify(j), { status, headers: { 'content-type': 'application/json' } })
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url))
  if (u.host !== 'api.anthropic.com') throw new Error('fetch fora do roteiro: ' + url)
  const corpo = JSON.parse(opts.body)
  const sis = JSON.stringify(corpo.system), msg = JSON.stringify(corpo.messages)
  if (!/posts ORGÂNICOS da semana/.test(sis)) throw new Error('IA chamada fora do roteiro: ' + sis.slice(0, 120))
  const txt = JSON.parse(msg)[0].content.map(c => c.text || '').join('\n')
  pedidos.push(txt)
  const linhas = txt.split('\n')
  const fotos = linhas.filter(l => / · foto/.test(l) && !/já saiu há pouco/.test(l)).map(l => l.slice(2).split(' · ')[0])
  const fotosVelhas = linhas.filter(l => / · foto/.test(l) && /já saiu há pouco/.test(l)).map(l => l.slice(2).split(' · ')[0])
  const videos = linhas.filter(l => / · video/.test(l)).map(l => l.slice(2).split(' · ')[0])
  const todasFotos = [...fotos, ...fotosVelhas]
  let fi = 0
  const posts = linhas.filter(l => /^- slot \d+:/.test(l)).map(l => {
    const slot = Number(l.match(/slot (\d+)/)[1])
    const ids = iaRuim ? ['nao-existe'] : /REELS/.test(l) ? videos.slice(0, 1) : /CARROSSEL/.test(l) ? todasFotos.slice(fi, (fi += 4)) : todasFotos.slice(fi, (fi += 1))
    return { slot, midia_ids: ids, tema: 'Tema ' + slot, legenda: iaSemLegenda && slot === 1 ? '' : `Legenda do slot ${slot}, com conteúdo útil pro cliente. #lajeado` }
  })
  return resp({ content: [{ type: 'text', text: JSON.stringify({ posts }) }], usage: { input_tokens: 10, output_tokens: 10 }, stop_reason: 'end_turn' })
}

const placar = []
const confere = (ok, o, extra) => { placar.push(!!ok); console.log((ok ? '  ✔ ' : '  ✘ ') + o + (ok || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 400))) }

const jiti = createJiti(import.meta.url, { alias: { '@': RAIZ }, interopDefault: true, moduleCache: true })
const { maiaDb: db } = await jiti.import(path.join(RAIZ, 'lib/maia/db.ts'))
const S = await jiti.import(path.join(RAIZ, 'lib/maia/social.ts'))
const G = await jiti.import(path.join(RAIZ, 'lib/maia/grade-social.ts'))

let tel = 9000
const novoNeg = async (nome, extra = {}) => db.insere('negocios', { nome, nicho: 'brindes', cidade: 'Lajeado', plano: 'completa', status: 'ativo', dono_nome: 'Rafa', dono_whatsapp: '550007777' + (++tel), meta: { page_id: 'P1', ig_id: 'IG1' }, ...extra })
const midia = (neg, nome, tipo, descricao = 'foto do produto') => db.insere('midias', { negocio_id: neg.id, tipo, path: `${neg.id}/${nome}`, mime: tipo === 'video' ? 'video/mp4' : /png$/.test(nome) ? 'image/png' : 'image/jpeg', descricao, usos: 0 })
const brt = (s) => new Date(s + '-03:00')
const postsDe = async (neg) => (await S.posts(neg.id)).sort((a, b) => Date.parse(a.detalhe.quando) - Date.parse(b.detalhe.quando))
const diaHora = (iso) => { const d = new Date(Date.parse(iso) - 3 * 3600e3); return d.toISOString().slice(0, 16).replace('T', ' ') }

console.log('Maia · teste da grade da semana (modo local, IA simulada)')

// ===== 1. a semana seguinte, numa quinta às 10h
console.log('\n=== Semana seguinte (quinta 26/11 às 10h → semana de 30/11)')
const n1 = await novoNeg('Wood Brindes (grade)')
for (const f of ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg', 'f.jpeg']) await midia(n1, f, 'foto')
await midia(n1, 'logo.png', 'foto')                                     // PNG: o Instagram não aceita
await midia(n1, 'orcamento.jpg', 'foto', '[NÃO USAR] print de orçamento')  // a equipe marcou "não usar"
await midia(n1, 'bastidor.mp4', 'video', 'vídeo da produção')
const q1 = brt('2026-11-26T10:00')
const r1 = await G.montaGrade(n1.id, { semana: 'proxima', agora: q1 })
const p1 = await postsDe(n1)
confere(r1.ok && r1.semana === '2026-11-30' && r1.criados.length === 3 && p1.length === 3, 'monta 3 posts na semana de 30/11', r1)
confere(p1.map(p => diaHora(p.detalhe.quando).slice(0, 10)).join(',') === '2026-12-01,2026-12-03,2026-12-05', 'terça, quinta e sábado', p1.map(p => p.detalhe.quando))
const hs = p1.map(p => diaHora(p.detalhe.quando).slice(11))
confere(hs[0] === '11:00' && hs[1] === '18:00' && hs[2] === '11:00', 'o horário alterna (11h, 18h, 11h)', hs)
const tipos = p1.map(p => p.detalhe.tipo)
confere(tipos.filter(t => t === 'reels').length === 1 && tipos.filter(t => t === 'carrossel').length === 1 && tipos.filter(t => t === 'foto').length === 1 && tipos[1] === 'reels', '1 reels (no meio), 1 carrossel e 1 foto', tipos)
const caminhos = p1.flatMap(p => p.detalhe.midias.map(m => m.caminho))
confere(!caminhos.some(c => /logo\.png|orcamento/.test(c)) && caminhos.every(c => c.startsWith(n1.id + '/')), 'nunca usa PNG nem o que a equipe marcou "não usar"; só mídia do próprio negócio', caminhos)
confere(new Set(caminhos).size === caminhos.length, 'não repete a mesma mídia na semana', caminhos)
const pecas1 = await Promise.all(p1.map(p => db.um('pecas', { id: p.detalhe.peca_id })))
confere(pecas1.every(x => x.status === 'revisao_equipe') && p1.every(p => p.detalhe.status === 'rascunho'), 'todos vão pra revisão da equipe (nada publica sem as aprovações)', pecas1.map(x => x.status))
confere(p1.every(p => /^Legenda do slot/.test(pecas1.find(x => x.id === p.detalhe.peca_id).texto)), 'a legenda da IA vai na peça')
confere(/TEMAS RECENTES/.test(pedidos[0]) === false && /O QUE A MAIA SABE/.test(pedidos[0]), 'o pedido leva o que a Maia sabe do negócio')

// ===== 2. de novo na mesma semana: não duplica
const r2 = await G.montaGrade(n1.id, { semana: 'proxima', agora: q1 })
confere(r2.ja_feita && (await postsDe(n1)).length === 3, 'rodar de novo na mesma semana não duplica', r2)

// ===== 3. a semana depois: evita as fotos que acabaram de sair e não repete os temas
const r3 = await G.montaGrade(n1.id, { semana: 'proxima', agora: brt('2026-12-03T10:00') })
const p3 = (await postsDe(n1)).filter(p => p.detalhe.quando >= '2026-12-07')
const usadasAntes = new Set(caminhos)
const fotos3 = p3.filter(p => p.detalhe.tipo !== 'reels').flatMap(p => p.detalhe.midias.map(m => m.caminho))
confere(r3.criados.length === 3 && p3.length === 3, 'a semana de 07/12 também sai com 3', r3)
confere(fotos3[0] && !usadasAntes.has(fotos3[0]), 'a 1ª foto da semana nova é uma que ainda não tinha saído', fotos3)
confere(/TEMAS RECENTES \(não repetir\): .*Tema 1/.test(pedidos[pedidos.length - 1]), 'os temas da semana anterior vão como "não repetir"')

// ===== 4. com post feito à mão na semana: só completa
console.log('\n=== Post à mão na semana')
const n2 = await novoNeg('Doceria (grade)')
for (const f of ['1.jpg', '2.jpg', '3.jpg']) await midia(n2, f, 'foto')
await S.criaPost(n2.id, { quando: '2026-12-01T18:00', tipo: 'foto', midias: [{ caminho: `${n2.id}/1.jpg`, tipo: 'foto' }], legenda: 'Post da equipe', por: 'equipe' })
const r4 = await G.montaGrade(n2.id, { semana: 'proxima', agora: q1 })
const p4 = await postsDe(n2)
confere(r4.criados.length === 2 && p4.length === 3, 'já tinha 1 da equipe: a Maia monta só mais 2', r4)
confere(!r4.criados.some(c => diaHora(c.quando).startsWith('2026-12-01')), 'não põe outro post no dia que a equipe já usou', r4.criados.map(c => c.quando))
confere(p4.filter(p => p.detalhe.tipo === 'reels').length === 0 && p4.filter(p => p.detalhe.tipo === 'carrossel').length === 0, 'sem vídeo não tem reels; com só 2 fotos novas não tem carrossel', p4.map(p => p.detalhe.tipo))

// ===== 5. "esta semana" no sábado: não sobra dia com tempo pra aprovar
const n3 = await novoNeg('Loja sábado (grade)')
await midia(n3, 'x.jpg', 'foto')
const r5 = await G.montaGrade(n3.id, { semana: 'esta', agora: brt('2026-11-28T09:00') })
confere(r5.criados.length === 0 && /não sobrou dia/.test(r5.motivo || ''), 'sábado de manhã, "esta semana": nada (sem 20 h pra aprovar)', r5)
// implantação na segunda 14h, "esta semana": terça 11h ainda dá (21 h de folga); com 1 foto só, sai 1 post e o motivo
const r5b = await G.montaGrade(n3.id, { semana: 'esta', agora: brt('2026-11-23T14:00'), forcar: true })
confere(r5b.criados.length === 1 && diaHora(r5b.criados[0].quando) === '2026-11-24 11:00' && r5b.pulados.length === 2 && r5b.pulados.every(p => /faltam fotos: o dono mandou só 1/.test(p.motivo)), 'só 1 foto: 1 post (terça 11h) e os outros 2 dizem "faltam fotos" (nunca a mesma foto 2x)', r5b)
const iaAntes = pedidos.length
const n3b = await novoNeg('Implantação noite (grade)')
for (const f of ['i1.jpg', 'i2.jpg', 'i3.jpg']) await midia(n3b, f, 'foto')
const r5c = await G.montaGrade(n3b.id, { semana: 'esta', agora: brt('2026-11-23T20:00') })
confere(r5c.criados.length === 2 && r5c.criados.every(c => !diaHora(c.quando).startsWith('2026-11-24')), 'implantação segunda 20h: terça 11h não dá tempo, monta quinta e sábado', r5c)
confere(/slot 1:/.test(pedidos[iaAntes]) && !/slot 3:/.test(pedidos[iaAntes]), 'a IA só recebe os dias que dá pra fazer', pedidos[iaAntes]?.slice(-200))

// ===== 6. o que não monta
console.log('\n=== O que não monta')
const n4 = await novoNeg('Sem fotos (grade)')
const r6 = await G.montaGrade(n4.id, { semana: 'proxima', agora: q1 })
confere(!r6.ok && /não mandou fotos/.test(r6.motivo), 'sem fotos nem vídeos: avisa e não chama a IA', r6)
const n5 = await novoNeg('Gestora (grade)', { plano: 'gestao' })
await midia(n5, 'g.jpg', 'foto')
const r7 = await G.montaGrade(n5.id, { semana: 'proxima', agora: q1 })
confere(!r7.ok && /Gestora/.test(r7.motivo), 'Maia Gestora não tem social media', r7)

// ===== 7. a IA errou os ids ou não escreveu: a Maia escolhe a mídia / pula o post sem legenda
const n6 = await novoNeg('IA ruim (grade)')
for (const f of ['m1.jpg', 'm2.jpg', 'm3.jpg']) await midia(n6, f, 'foto')
iaRuim = true
const r8 = await G.montaGrade(n6.id, { semana: 'proxima', agora: q1 })
iaRuim = false
const p8 = await postsDe(n6)
confere(r8.criados.length === 3 && p8.every(p => p.detalhe.midias.length === 1 && p.detalhe.midias[0].caminho.startsWith(n6.id + '/')), 'id que não existe: a Maia escolhe as fotos dela mesma', r8)
const n7 = await novoNeg('Sem legenda (grade)')
for (const f of ['s1.jpg', 's2.jpg', 's3.jpg']) await midia(n7, f, 'foto')
iaSemLegenda = true
const r9 = await G.montaGrade(n7.id, { semana: 'proxima', agora: q1 })
iaSemLegenda = false
confere(r9.criados.length === 2 && r9.pulados.length === 1 && /legenda/.test(r9.pulados[0].motivo), 'post sem legenda fica de fora (e aparece em "pulados")', r9)

// ===== 8. a rotina: só quem tem página + Instagram
console.log('\n=== Rotina')
const n8 = await novoNeg('Sem Instagram (grade)', { meta: { page_id: 'P9' } })
await midia(n8, 'z.jpg', 'foto')
const rg = await G.gradesDaSemana(brt('2026-12-10T10:00'))
confere(!rg.some(x => x.negocio === n8.id) && !rg.some(x => x.negocio === n5.id) && rg.some(x => x.negocio === n1.id), 'a rotina monta pra quem tem página + Instagram (fora a Gestora e quem não ligou o Instagram)', rg.map(x => x.negocio))
const ev = (await db.lista('eventos', { negocio_id: n1.id, tipo: 'social_grade' })).map(e => e.detalhe.semana).sort()
confere(ev.includes('2026-11-30') && ev.includes('2026-12-07') && ev.includes('2026-12-14'), 'cada semana montada fica anotada (social_grade)', ev)

const ok = placar.filter(Boolean).length
console.log(`\n${ok}/${placar.length} ok`)
process.exit(ok === placar.length ? 0 : 1)
