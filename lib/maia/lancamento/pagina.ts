// Maia, lançamento (16/11/2026): a PÁGINA NOVA da amostra, no formato aprovado pelo Guto (a da JamRock). Só com
// MAIA_LANC_ENTREGA_V2=1 (desligada, vale a página de antes, htmlAmostra em amostra.ts). Página de vendas, tudo numa tela,
// clara e colorida (violeta, coral, âmbar, verde-água e a cor da marca), sem emoji, sem prova de cliente, sem preço nos anúncios.
// Ordem: entrada (Maia discreta, o nome ou a logo, o que a pessoa contou em cards, a foto, os 2 botões) → o que a gente viu
// (some se a equipe não preencheu) → os anúncios → o vídeo com a tua voz (estilos, roteiros em storyboard, dicas) → a grade
// do Instagram (opcional) → teste ao vivo → tudo que a Maia faz (11 cards, números marcados "exemplo") → como começa →
// a oferta → dúvidas comuns → a chamada final.
import { maiaDb as db } from '../db'
import { SITE, WHATS_ESCOLA, primeiroNome, midias } from './base'
import { TEXTO_TESTE } from './conversa'
import { PRECO, PRECO_ONLINE, ofertaOnline, conversaSimples } from './amostra'
import { nomeDoNegocio, roteiroSimples, type Ponto, type Roteiro } from './conteudo'

const esc = (s: any) => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))
const br = (s: any) => esc(s).replace(/\n/g, '<br>')
const rs = (n: number) => 'R$ ' + n.toLocaleString('pt-BR')
const curto = (s: any, n = 90) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim().replace(/[.!;,]+$/, ''); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t }
const minuscula = (s: string) => (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s)
const wa = (texto: string) => `https://wa.me/${WHATS_ESCOLA()}?text=${encodeURIComponent(texto)}`
const ehVideo = (p: any) => /^video/.test(p?.mime || '') || /\.(mp4|mov)(\?|$)/i.test(p?.path || '')
const EX = '<span class="ex">exemplo</span>'
const temIG = (k: any) => !!k.instagram && !/^(n[aã]o|sem|nenhum)/i.test(String(k.instagram))

// o número do "o que vimos" em destaque (o elemento visual do card)
function destaca(t: string) {
  const m = String(t).match(/\d+(?:[.,]\d+)?%?/)
  if (!m || m.index == null) return esc(t)
  return esc(t.slice(0, m.index)) + `<b class="num">${esc(m[0])}</b>` + esc(t.slice(m.index + m[0].length))
}
// o nome em letra grande; com 2+ palavras, a última vai na cor da marca
function nomeGrande(neg: string) {
  const ps = neg.trim().split(/\s+/)
  const tam = neg.length <= 10 ? 'g' : neg.length <= 18 ? 'm' : 'p'
  const miolo = ps.length > 1 ? `${esc(ps.slice(0, -1).join(' '))} <span>${esc(ps[ps.length - 1])}</span>` : `<span>${esc(neg)}</span>`
  return `<h1 class="nome ${tam}">${miolo}</h1>`
}
function roteiroHtml(r: Roteiro, i: number) {
  return `<article class="card rot-card r${i + 1}"><header><span class="n">${i + 1}</span><div><h3>${esc(r.titulo)}</h3>${r.quando ? `<p>${esc(r.quando)}</p>` : ''}</div></header>
<ol>${r.cenas.map(x => `<li><div class="quadro"><span class="tq">${esc(x.tempo)}</span><b>${esc(x.parte)}</b><span class="fm">${esc(x.filmar)}</span></div><div class="balao">"${esc(x.fala)}"</div></li>`).join('')}</ol></article>`
}

export async function htmlAmostraNova(c: any, op: { previa?: boolean } = {}) {
  const k = c.coleta || {}, a = c.amostra || {}, p = a.pecas || {}
  const neg = nomeDoNegocio(c)
  const cor = /^#[0-9a-f]{6}$/i.test(String(a.cor || '')) ? a.cor : '#8b5cf6'
  const link = (path?: string | null) => (path ? db.link(path, 60 * 60 * 24 * 7) : Promise.resolve(null))
  const u: Record<string, string | null> = {}
  for (const s of ['anuncio1', 'anuncio2', 'video']) u[s] = await link(p[s]?.path)
  const fotos = (await midias(c.id)).filter((m: any) => m.origem === 'contato' && m.tipo === 'foto')
  const logo = await link(a.logo)
  const capaPath = a.capa || fotos.find((m: any) => m.path !== a.logo)?.path || (p.anuncio1 && !ehVideo(p.anuncio1) ? p.anuncio1.path : null)
  const capa = await link(capaPath)
  const grade: { url: string; titulo: string; tipo: string }[] = []
  for (const g of (Array.isArray(a.grade) ? a.grade : []).slice(0, 9)) { const x = await link(g.path); if (x) grade.push({ url: x, titulo: String(g.titulo || ''), tipo: String(g.tipo || '') }) }
  const pontos: Ponto[] = (Array.isArray(a.vimos) ? a.vimos : []).filter((x: any) => x?.vimos && x?.oportunidade).slice(0, 4)
  const roteiros: Roteiro[] = Array.isArray(a.roteiros) && a.roteiros.length ? a.roteiros.slice(0, 3) : roteiroSimples(c)
  const conv = a.conversa?.length ? a.conversa : conversaSimples(c).conversa
  const retomada = a.retomada || conversaSimples(c).retomada
  const testa = wa(TEXTO_TESTE(neg)), rodando = wa(`Quero colocar a Maia rodando na ${neg}`)
  // 19/11 (Guto): quem veio do tráfego (fora do RS) tem a oferta online: implantação por chamada de vídeo, 1º mês R$ 497, depois R$ 797
  const online = ofertaOnline(c)
  const carro = curto(k.carro_chefe, 60), cidade = curto(k.cidade, 40)
  const info = [
    ['O que vende', k.negocio], ['Onde', k.cidade], ['O que mais sai', k.carro_chefe], ['Como vende', k.como_vende], ['O desafio', k.dificuldade], ['Instagram', temIG(k) ? k.instagram : null],
  ].filter(([, v]) => v && String(v).trim()).slice(0, 6)
  const ideias = [carro ? `"Como é ${minuscula(carro)}?"` : '"O que vocês têm?"', '"Como faço pra pedir?"', '"Qual o horário de vocês?"']
  const ehImg = (s: string) => p[s] && u[s] && !ehVideo(p[s])
  const midiaAd = (s: string, alt: string) => !u[s] ? '' : ehVideo(p[s]) ? `<video src="${esc(u[s])}" controls playsinline preload="metadata"></video>` : `<img src="${esc(u[s])}" alt="${esc(alt)}" loading="lazy">`
  const chat = conv.map((f: any) => `<div class="m ${f.de === 'maia' ? 'a' : 'c'}">${br(f.texto)}</div>`).join('')

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><title>Amostra da Maia pra ${esc(neg)}</title><meta name="theme-color" content="#f6f4fb">
<meta property="og:title" content="A amostra da ${esc(neg)} ficou pronta"><meta property="og:description" content="Anúncios, roteiros do vídeo e teste ao vivo, feitos pela Maia."><meta property="og:image" content="${esc(SITE())}/maia/img/maia-og.jpg">
<link rel="icon" href="/maia/img/maia-avatar.webp">
<style>
@font-face{font-family:'Manrope';font-style:normal;font-weight:400 800;font-display:swap;src:url(/maia/fontes/manrope-latin.woff2) format('woff2')}
@font-face{font-family:'Bricolage Grotesque';font-style:normal;font-weight:300 800;font-stretch:75% 100%;font-display:swap;src:url(/maia/fontes/bricolage-latin.woff2) format('woff2')}
:root{--bg:#f6f4fb;--card:#fff;--line:#e7e1f2;--tx:#17121f;--tx2:#3d3654;--mu:#6b6582;--ac:#8b5cf6;--acs:#efe8ff;--marca:${cor};--ok:#1f7a55;--oks:#e3f5ec;--sh:0 10px 30px rgba(39,22,84,.07);--fd:'Bricolage Grotesque','Manrope',system-ui,sans-serif;--ft:'Manrope',system-ui,-apple-system,'Segoe UI',sans-serif;color-scheme:light}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.55 var(--ft);-webkit-font-smoothing:antialiased;overflow-x:hidden}
img,video{display:block;max-width:100%}
a{color:var(--ac)}:focus-visible{outline:3px solid var(--ac);outline-offset:3px;border-radius:8px}
.w{max-width:1040px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:20px 64px;display:flex;flex-direction:column;gap:44px}
h1,h2,h3{font-family:var(--fd);font-stretch:88%;margin:0;line-height:1.1;text-wrap:balance;letter-spacing:-.01em}h2{font-size:clamp(22px,3.8vw,30px);font-weight:800}h3{font-size:16px;font-weight:700}
.rot{font-weight:800;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--ac);display:inline-flex;align-items:center;gap:8px}.rot::before{content:"";width:18px;height:4px;border-radius:4px;background:linear-gradient(90deg,var(--marca),#8b5cf6)}
.sub{color:var(--mu);margin:0;max-width:66ch}
section{display:flex;flex-direction:column;gap:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:20px;box-shadow:var(--sh)}
.ex{display:inline-block;font:800 10px var(--ft);letter-spacing:.08em;text-transform:uppercase;color:var(--mu);background:var(--bg);border:1px solid var(--line);border-radius:999px;padding:1px 8px;vertical-align:2px}
.previa{background:#fdf3dc;color:#8a5a00;text-align:center;font-weight:800;font-size:13px;padding:8px}
/* entrada */
.hero{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);gap:22px;align-items:stretch}.hero.so{grid-template-columns:1fr}
.lado{display:flex;flex-direction:column;gap:18px;justify-content:center;min-width:0}
.feito{display:inline-flex;align-items:center;gap:10px;align-self:flex-start;background:var(--card);border:1px solid var(--line);border-radius:999px;padding:5px 14px 5px 5px;font-size:13.5px;color:var(--tx2);box-shadow:var(--sh)}
.feito img{width:30px;height:30px;border-radius:50%;object-fit:cover}
.nome{font-weight:800;font-stretch:80%;letter-spacing:-.02em;line-height:.95;overflow-wrap:anywhere}.nome span{color:var(--marca)}
.nome.g{font-size:clamp(46px,9vw,84px)}.nome.m{font-size:clamp(38px,7vw,64px)}.nome.p{font-size:clamp(30px,5.5vw,46px)}
.logo{max-height:130px;max-width:min(320px,100%);width:auto;object-fit:contain;align-self:flex-start}
.lead{font-size:18px;color:var(--tx2);margin:0}
.info{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.info div{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px 14px;min-width:0}
.info b{display:block;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--mu);font-weight:800}.info span{display:block;font-weight:700;font-size:15px;margin-top:2px;overflow-wrap:anywhere}
.foto{border-radius:26px;overflow:hidden;position:relative;min-height:420px;background:#111 center/cover;box-shadow:0 24px 50px rgba(23,18,31,.18)}
.foto .tag{position:absolute;left:16px;bottom:16px;right:16px;max-width:max-content;background:rgba(255,255,255,.94);border-radius:14px;padding:10px 14px;font-size:14px;color:var(--tx)}
.foto .tag b{display:block;font-family:var(--fd);font-weight:800;font-size:18px;color:var(--marca)}
.ctas{display:flex;flex-wrap:wrap;gap:10px}
.cta{display:inline-block;background:#1f7a55;color:#fff;text-decoration:none;font-weight:800;font-size:17px;padding:14px 24px;border-radius:999px;box-shadow:0 8px 20px rgba(31,122,85,.25);text-align:center}
.cta2{display:inline-block;background:#fff;color:var(--tx);text-decoration:none;font-weight:800;font-size:16px;padding:13px 22px;border-radius:999px;border:1px solid var(--line);text-align:center}
@media (max-width:760px){.hero{grid-template-columns:minmax(0,1fr)}.foto{min-height:320px}.info{grid-template-columns:repeat(2,minmax(0,1fr))}}
/* o que vimos */
.vimos{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}@media (max-width:760px){.vimos{grid-template-columns:1fr}}
.v{--c:#8b5cf6;--cs:#efe8ff;background:var(--card);border:1px solid var(--line);border-top:6px solid var(--c);border-radius:20px;padding:18px;display:flex;flex-direction:column;gap:12px;box-shadow:var(--sh);position:relative;min-width:0}
.v.c2{--c:#f2603f;--cs:#feede8}.v.c3{--c:#c98a06;--cs:#fdf3dc}.v.c4{--c:#119b83;--cs:#e0f5f1}
.vn{position:absolute;top:14px;right:16px;width:30px;height:30px;border-radius:50%;background:var(--cs);color:var(--c);display:grid;place-items:center;font:800 14px var(--fd)}
.v .tv{font-size:11.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--c)}
.vis{background:var(--cs);border-radius:14px;padding:14px;font-size:16px;font-weight:600;color:var(--tx);margin-right:0}
.vis .num{display:block;font:800 40px/1 var(--fd);color:var(--c);margin:2px 0 6px}
.vop{border-left:4px solid var(--c);padding:2px 0 2px 12px}.vop b{font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--c)}.vop p{margin:2px 0 0;font-size:15px;color:var(--tx)}
/* anúncios */
.duas{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;align-items:start}
.pc{padding:12px;display:flex;flex-direction:column;gap:8px;min-width:0}.pc img,.pc video{width:100%;border-radius:14px;background:#111}.pc b{font-size:15px}.pc span{font-size:14px;color:var(--mu);overflow-wrap:anywhere}
/* vídeo */
.estilos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}@media (max-width:760px){.estilos{grid-template-columns:1fr}}
.es{border-radius:18px;padding:16px;display:flex;flex-direction:column;gap:6px;color:#fff}.es b{font:800 16px var(--fd)}.es span{font-size:14px;opacity:.95}
.es.e1{background:linear-gradient(140deg,#8b5cf6,#6d3fe0)}.es.e2{background:linear-gradient(140deg,#f2603f,#d63a1f)}.es.e3{background:linear-gradient(140deg,#119b83,#0d7d6a)}
.es-nota{grid-column:1/-1;margin:0;font-size:14.5px;color:var(--tx2);background:var(--card);border:1px dashed var(--line);border-radius:14px;padding:10px 14px}
.rots{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:14px;align-items:start}
.rot-card{--c:#f2603f;--cs:#feede8;padding:16px;display:flex;flex-direction:column;gap:12px;min-width:0;border-top:6px solid var(--c)}.rot-card.r2{--c:#8b5cf6;--cs:#efe8ff}.rot-card.r3{--c:#119b83;--cs:#e0f5f1}
.rot-card header{display:flex;gap:12px;align-items:center}.rot-card .n{flex:none;width:38px;height:38px;border-radius:12px;background:var(--c);color:#fff;display:grid;place-items:center;font:800 16px var(--fd)}.rot-card header p{margin:2px 0 0;font-size:13.5px;color:var(--mu)}
.rot-card ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.rot-card li{display:flex;flex-direction:column;gap:6px}
.quadro{background:var(--cs);border-radius:12px;padding:8px 10px;display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px}
.quadro .tq{font:800 11px var(--ft);background:var(--c);color:#fff;border-radius:999px;padding:1px 8px}
.quadro b{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--c)}
.quadro .fm{flex-basis:100%;font-size:13.5px;color:var(--tx2)}.quadro .fm::before{content:"Filmar: ";font-weight:800}
.balao{position:relative;background:#fff;border:1px solid var(--line);border-radius:14px;padding:9px 12px;font-size:15px;margin-left:10px}
.balao::before{content:"";position:absolute;left:-7px;top:12px;width:12px;height:12px;background:#fff;border-left:1px solid var(--line);border-bottom:1px solid var(--line);transform:rotate(45deg)}
.dicas{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}.dicas div{padding:14px}.dicas b{display:block;font:800 15px var(--fd);margin-bottom:4px}.dicas span{font-size:14px;color:var(--tx2)}
/* grade */
.grade{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3px;max-width:520px;background:#000;border-radius:16px;overflow:hidden;box-shadow:var(--sh)}
.grade figure{margin:0;position:relative;aspect-ratio:4/5}.grade img{width:100%;height:100%;object-fit:cover}
.grade figcaption{position:absolute;left:0;right:0;bottom:0;padding:22px 8px 7px;background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.8));color:#fff;font:800 13px var(--fd);text-transform:uppercase;line-height:1.1;display:flex;flex-direction:column;gap:3px}
.tp{align-self:flex-start;font:800 9.5px var(--ft);letter-spacing:.08em;padding:2px 6px;border-radius:4px;background:#fff;color:#111}.tp.produto{background:var(--marca);color:#fff}
/* conversas */
.chat{background:#efeae2;border-radius:18px;padding:14px;display:flex;flex-direction:column;gap:7px}
.m{max-width:86%;padding:8px 11px;border-radius:12px;font-size:14.5px;line-height:1.4;overflow-wrap:anywhere}.m.c{align-self:flex-end;background:#d9fdd3}.m.a{align-self:flex-start;background:#fff}.m.r{align-self:flex-start;background:#fff;border:1px dashed #b9b3c9}
.dia{align-self:center;font-size:11.5px;color:#6b6475;background:#fff;border-radius:8px;padding:2px 10px}
/* teste ao vivo */
.testa{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr);gap:20px;padding:26px;background:linear-gradient(135deg,#fff 0%,#f3eeff 100%)}
.testa .tx{display:flex;flex-direction:column;gap:12px;align-items:flex-start}
.ideias{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:13.5px;color:var(--mu)}.ideias em{font-style:normal;background:#fff;border:1px solid var(--line);border-radius:999px;padding:3px 10px;color:var(--tx2)}
.cel{background:#17121f;border-radius:28px;padding:10px;box-shadow:0 20px 40px rgba(23,18,31,.2);align-self:center;min-width:0}.cel .chat{min-height:200px}
@media (max-width:760px){.testa{grid-template-columns:1fr}}
/* tudo que a Maia faz */
.bento{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:14px}
.f{padding:18px;display:flex;flex-direction:column;gap:12px;min-width:0;grid-column:span 2}.f.l{grid-column:span 3}.f.xl{grid-column:span 4}
.f .cab{display:flex;align-items:center;gap:10px}.f .cab i{flex:none;width:34px;height:34px;border-radius:10px;background:var(--acs);color:var(--ac);display:grid;place-items:center;font:800 14px var(--fd);font-style:normal}
.f:nth-child(4n+2) .cab i{background:#feede8;color:#d63a1f}.f:nth-child(4n+3) .cab i{background:#fdf3dc;color:#a87100}.f:nth-child(4n+4) .cab i{background:#e0f5f1;color:#0d7d6a}
.f p{margin:0;font-size:14.5px;color:var(--tx2)}
@media (max-width:860px){.bento{grid-template-columns:repeat(2,minmax(0,1fr))}.f,.f.l,.f.xl{grid-column:span 2}}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chips span{font-size:13px;font-weight:700;background:var(--bg);border:1px solid var(--line);border-radius:999px;padding:4px 10px}
.nums{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.nums div{background:var(--bg);border-radius:12px;padding:10px;min-width:0}.nums b{display:block;font:800 22px var(--fd)}.nums span{font-size:12px;color:var(--mu)}
.rel{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.rel figure{margin:0;background:var(--bg);border-radius:12px;padding:8px;display:flex;flex-direction:column;gap:6px}.rel img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:8px}.rel figcaption{font-size:12px;color:var(--mu)}
.barras{display:flex;align-items:flex-end;gap:6px;height:70px}.barras span{flex:1;background:var(--acs);border-radius:6px 6px 2px 2px}.barras span.alto{background:var(--ac)}
.roi{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.roi b{font:800 34px var(--fd);color:var(--ok)}
.funil{display:flex;flex-direction:column;gap:6px}.funil div{display:flex;justify-content:space-between;background:var(--bg);border-radius:10px;padding:7px 12px;font-size:14px}.funil div:nth-child(2){margin:0 14px}.funil div:nth-child(3){margin:0 28px;background:var(--oks)}
.aprova{display:flex;gap:10px;align-items:center}.aprova img{width:70px;border-radius:10px;flex:none}.aprova .bts{display:flex;gap:6px;flex-wrap:wrap}.aprova .bts span{font-size:13px;font-weight:800;padding:6px 12px;border-radius:999px;background:var(--ok);color:#fff}.aprova .bts span+span{background:var(--bg);color:var(--tx2);border:1px solid var(--line)}
/* como começa, oferta, dúvidas, final */
.passos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}@media (max-width:760px){.passos{grid-template-columns:1fr}}
.ps{border-radius:20px;padding:20px;display:flex;flex-direction:column;gap:8px;color:#fff}.ps b{width:40px;height:40px;border-radius:12px;background:rgba(255,255,255,.22);display:grid;place-items:center;font:800 18px var(--fd)}.ps p{margin:0;opacity:.95;font-size:14.5px}
.ps.s1{background:linear-gradient(140deg,#8b5cf6,#6d3fe0)}.ps.s2{background:linear-gradient(140deg,#f2603f,#d63a1f)}.ps.s3{background:linear-gradient(140deg,#119b83,#0d7d6a)}
.oferta{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr);overflow:hidden}
.oferta .inc{padding:24px;display:flex;flex-direction:column;gap:10px}.oferta ul{margin:0;padding-left:20px;color:var(--tx2);display:grid;gap:4px}
.oferta .preco{background:linear-gradient(160deg,#efe8ff,#fdf3dc);padding:24px;display:flex;flex-direction:column;gap:10px;justify-content:center}
.oferta .preco s{color:var(--mu)}.oferta .preco b{font:800 40px var(--fd);font-stretch:80%}.oferta .preco small{color:var(--tx2);font-size:14px}
@media (max-width:760px){.oferta{grid-template-columns:1fr}}
.duvidas{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}@media (max-width:760px){.duvidas{grid-template-columns:1fr}}
.duvidas details{padding:16px 18px}.duvidas summary{cursor:pointer;font-weight:800;font-size:16px}.duvidas p{margin:8px 0 0;color:var(--tx2);font-size:15px}
.final{align-items:center;text-align:center;background:linear-gradient(135deg,#efe8ff 0%,#feede8 55%,#e0f5f1 100%);border-radius:28px;padding:36px 20px}.final img{width:72px;height:72px;border-radius:50%;border:4px solid #fff;box-shadow:var(--sh);object-fit:cover}.final p{margin:0;color:var(--tx2);max-width:46ch}.final .ctas{justify-content:center}
.rodape{font-size:13px;color:var(--mu);text-align:center;margin:0}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
</style></head><body>
${op.previa ? '<div class="previa">Prévia da equipe: esta visita não conta como abertura</div>' : ''}
<div class="w">

<header class="hero${capa ? '' : ' so'}">
  <div class="lado">
    <span class="feito"><img alt="A Maia" src="/maia/img/maia-avatar.webp">Amostra feita pela Maia, a IA da Carreira no Digital</span>
    ${logo ? `<h1 class="nome-logo"><img class="logo" src="${esc(logo)}" alt="${esc(neg)}"></h1>` : nomeGrande(neg)}
    <p class="lead">${primeiroNome(c.nome) ? esc(primeiroNome(c.nome)) + ', m' : 'M'}ontamos esta amostra com as tuas fotos${temIG(k) ? ', o que tu contou e o teu Instagram' : ' e o que tu contou'}. Olha como a ${esc(neg)} ficaria com a Maia.</p>
    ${info.length ? `<div class="info">${info.map(([t, v]) => `<div><b>${esc(t)}</b><span>${esc(curto(v, 70))}</span></div>`).join('')}</div>` : ''}
    <div class="ctas"><a class="cta" href="${esc(testa)}">Testar a Maia agora</a><a class="cta2" href="${esc(rodando)}">Quero colocar rodando</a></div>
  </div>
  ${capa ? `<div class="foto" role="img" aria-label="Foto da ${esc(neg)}" style="background-image:url('${esc(capa)}')">${carro ? `<div class="tag"><b>${esc(carro)}</b>O que mais sai</div>` : ''}</div>` : ''}
</header>

${pontos.length ? `<section aria-labelledby="t-vimos">
<span class="rot">O que a gente viu</span>
<h2 id="t-vimos">Um olhar de fora, antes de conhecer a ${esc(neg)} por dentro</h2>
<p class="sub">Só o que deu pra ver de fora e no que tu contou. Na implantação a gente entende o negócio por dentro e o plano fica sob medida.</p>
<div class="vimos">${pontos.map((x, i) => `<article class="v c${i + 1}"><span class="vn">${i + 1}</span><span class="tv">O que vimos</span>
<div class="vis">${destaca(x.vimos)}</div>
<div class="vop"><b>Oportunidade</b><p>${esc(x.oportunidade)}</p></div></article>`).join('')}</div>
</section>` : ''}

<section aria-labelledby="t-ads">
<span class="rot">Os anúncios</span>
<h2 id="t-ads">Feitos com as tuas fotos, sem preço</h2>
<p class="sub">O preço fica pra conversa no WhatsApp. O anúncio fala com quem já quer comprar e leva direto pra conversa, onde a Maia atende na hora.</p>
<div class="duas">
${['anuncio1', 'anuncio2'].filter(s => u[s]).map((s, i) => `<div class="card pc">${midiaAd(s, `Anúncio ${i + 1} da ${neg}`)}<b>Anúncio ${i + 1}</b>${p[s].legenda ? `<span>${esc(curto(p[s].legenda, 160))}</span>` : ''}</div>`).join('')}
</div>
</section>

<section aria-labelledby="t-video">
<span class="rot">O vídeo, com a tua voz</span>
<h2 id="t-video">Tu grava, a Maia monta</h2>
<p class="sub">Vídeo de anúncio que vende tem de 20 a 35 segundos. A Maia escreve o roteiro e te diz o que filmar; tu grava no celular e ela monta com legenda e trilha.</p>
<div class="estilos">
  <div class="es e1"><b>Voz por cima das cenas</b><span>Tu grava só o áudio e filma o produto e o dia a dia. Ninguém precisa aparecer falando.</span></div>
  <div class="es e2"><b>Falando pra câmera</b><span>Tu ou alguém da equipe fala direto pro celular. Passa confiança e mostra quem está por trás.</span></div>
  <div class="es e3"><b>Misturando os dois</b><span>Abre falando pra câmera e segue com as cenas e a voz por cima.</span></div>
  <p class="es-nota">Na implantação a gente define junto o estilo da ${esc(neg)}, e dá pra variar entre eles nos anúncios do mês. Os roteiros abaixo servem pros três.</p>
</div>
<div class="rots">${roteiros.map(roteiroHtml).join('')}</div>
<h3>Como gravar</h3>
<div class="dicas">
<div class="card"><b>Celular em pé</b><span>Vídeo vertical, como no Reels.</span></div>
<div class="card"><b>Luz do dia</b><span>De frente pra luz, nada contra o sol.</span></div>
<div class="card"><b>Cenas curtas</b><span>De 3 a 5 segundos, várias de cada cena.</span></div>
<div class="card"><b>Só o que é teu</b><span>Nada de produto ou roupa de outra marca na cena.</span></div>
<div class="card"><b>A voz separada</b><span>O áudio do roteiro num lugar quieto, pelo WhatsApp mesmo.</span></div>
</div>
${u.video ? `<div class="card pc" style="max-width:420px">${midiaAd('video', `Vídeo da ${neg}`)}<b>O vídeo que a Maia montou</b><span>Feito com o material que tu mandou.</span></div>` : ''}
</section>

${grade.length >= 3 ? `<section aria-labelledby="t-grade">
<span class="rot">O perfil, organizado</span>
<h2 id="t-grade">Uma ideia de grade do Instagram</h2>
<p class="sub">Produto, bastidor e o dia a dia, alternando. Nos posts de produto, só o que é da ${esc(neg)}.</p>
<div class="grade">${grade.map(g => `<figure><img alt="${esc(g.titulo || 'Post')}" src="${esc(g.url)}" loading="lazy"><figcaption>${g.tipo ? `<span class="tp${g.tipo === 'produto' ? ' produto' : ''}">${esc(g.tipo)}</span>` : ''}${esc(g.titulo)}</figcaption></figure>`).join('')}</div>
</section>` : ''}

<section aria-labelledby="t-teste">
<div class="card testa">
  <div class="tx"><span class="rot">Teste ao vivo</span><h2 id="t-teste">Agora testa tu</h2>
  <p class="sub">Me manda uma pergunta como se fosse um cliente da ${esc(neg)}. Eu respondo no WhatsApp como atendente da ${esc(neg)}, com o que tu me contou. Pra sair do teste, é só escrever "sair".</p>
  <a class="cta" href="${esc(testa)}">Testar a Maia no WhatsApp</a>
  <div class="ideias"><span>Ideias pra perguntar:</span>${ideias.map(x => `<em>${esc(x)}</em>`).join('')}</div></div>
  <div class="cel"><div class="chat"><div class="dia">modo teste ligado</div>${conv.slice(0, 2).map((f: any) => `<div class="m ${f.de === 'maia' ? 'a' : 'c'}">${br(f.texto)}</div>`).join('')}</div></div>
</div>
</section>

<section aria-labelledby="t-faz">
<span class="rot">Tudo que a Maia faz pela ${esc(neg)}</span>
<h2 id="t-faz">Do anúncio à venda, e tu acompanhando pelo celular</h2>
<p class="sub">Os anúncios e os roteiros lá de cima são só a parte da criação. Isto é o resto do mês com a Maia. Os números são exemplos, pra tu ver como chega.</p>
<div class="bento">
  <div class="card f xl"><div class="cab"><i>1</i><h3>Atende teus clientes no WhatsApp, a qualquer hora</h3></div><p>Em nome da ${esc(neg)}, no jeito de vocês. O que precisa confirmar, ela passa pra equipe. Quem some, ela chama de volta.</p>
    <div class="chat">${chat}<div class="dia">no dia seguinte, se a pessoa sumir</div><div class="m r">${br(retomada)}</div></div></div>
  <div class="card f"><div class="cab"><i>2</i><h3>Coloca a campanha no ar</h3></div><p>Na tua conta de anúncio, levando direto pro WhatsApp. Troca o que não traz conversa.</p>
    <div class="chips">${[cidade ? `${cidade} e região` : '', k.publico ? curto(k.publico, 40) : '', carro, 'Quem já segue', 'Conversa no WhatsApp'].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('')}</div></div>
  <div class="card f l"><div class="cab"><i>3</i><h3>Tu aprova pelo celular</h3></div><p>Antes de ir pro ar, a Maia te manda a peça no WhatsApp. Um toque e pronto.</p>
    <div class="aprova">${ehImg('anuncio1') ? `<img alt="Peça pra aprovar" src="${esc(u.anuncio1)}" loading="lazy">` : ''}<div><p style="margin:0 0 8px">"Saiu o anúncio novo. Posso subir?"</p><div class="bts"><span>Aprovar</span><span>Ajustar</span></div></div></div></div>
  <div class="card f l"><div class="cab"><i>4</i><h3>Mede o que virou venda</h3></div><p>Cada conversa é acompanhada até o pedido. ${EX}</p>
    <div class="funil"><div><span>Conversas no WhatsApp</span><b>48</b></div><div><span>Pediram o valor</span><b>21</b></div><div><span>Pedidos</span><b>12</b></div></div></div>
  <div class="card f"><div class="cab"><i>5</i><h3>Análise a cada 2 dias</h3></div><p>Um card no teu WhatsApp: o que está acontecendo e o próximo passo. ${EX}</p>
    <div class="nums"><div><b>R$ 4</b><span>por conversa</span></div><div><b>17</b><span>conversas</span></div><div><b>5</b><span>pedidos</span></div></div></div>
  <div class="card f"><div class="cab"><i>6</i><h3>Te responde na hora</h3></div><p>Tu pergunta pelo WhatsApp, ela responde. ${EX}</p>
    <div class="chat"><div class="m c">Maia, como foi o fim de semana?</div><div class="m a">Bom! 9 pedidos, a maioria do anúncio 1. Foi o que mais trouxe gente.</div></div></div>
  <div class="card f"><div class="cab"><i>7</i><h3>Relatório todo dia 2</h3></div><p>O anúncio e o post campeões do mês e o que fazer no próximo. ${EX}</p>
    ${ehImg('anuncio1') && ehImg('anuncio2') ? `<div class="rel"><figure><img alt="Anúncio campeão" src="${esc(u.anuncio1)}" loading="lazy"><figcaption>Anúncio campeão</figcaption></figure><figure><img alt="Post campeão" src="${esc(u.anuncio2)}" loading="lazy"><figcaption>Post campeão</figcaption></figure></div>` : ''}</div>
  <div class="card f l"><div class="cab"><i>8</i><h3>O retorno no teu painel</h3></div><p>Quanto foi pro anúncio e quanto voltou em venda. ${EX}</p>
    <div class="roi"><span>A cada R$ 1 em anúncio, voltaram</span><b>R$ 6</b></div><div class="barras" aria-hidden="true"><span style="height:30%"></span><span style="height:45%"></span><span style="height:40%"></span><span style="height:62%"></span><span style="height:58%"></span><span class="alto" style="height:88%"></span></div></div>
  <div class="card f l"><div class="cab"><i>9</i><h3>Recado pros clientes de sempre</h3></div><p>Quem já comprou fica sabendo do que é novo, com o teu ok antes de sair. ${EX}</p>
    <div class="chat"><div class="m a">Oi! Chegou novidade aqui na ${esc(neg)}. Quer ver antes de todo mundo?</div></div></div>
  <div class="card f xl"><div class="cab"><i>10</i><h3>Um especialista confere tudo</h3></div><p>Tudo que a Maia cria passa pela equipe da Carreira no Digital antes de chegar em ti: anúncio, post, recado e as primeiras conversas. Ela é rápida; a equipe garante que está no padrão da ${esc(neg)}.</p></div>
  <div class="card f"><div class="cab"><i>11</i><h3>12 posts por mês</h3></div><p>No jeito da ${esc(neg)}, com o que vocês já têm: carrossel, imagem e vídeo.</p></div>
</div>
</section>

<section aria-labelledby="t-comeca">
<span class="rot">Como começa</span>
<h2 id="t-comeca">Três passos até a ${esc(neg)} rodando</h2>
<div class="passos">
  <div class="ps s1"><b>1</b><h3>Implantação</h3><p>${online ? 'Online, por chamada de vídeo, individual, com um especialista. Tu compartilha a tela, a gente' : '3 horas, presencial e individual, com um especialista. A gente'} conhece o negócio por dentro, define o estilo dos vídeos e conecta tuas contas.</p></div>
  <div class="ps s2"><b>2</b><h3>Anúncio no ar</h3><p>${PRECO.dias_no_ar} dias depois da implantação. Tu aprova as peças pelo celular e a Maia já atende quem chamar.</p></div>
  <div class="ps s3"><b>3</b><h3>O primeiro mês</h3><p>Análise a cada 2 dias, troca do que não vende, posts toda semana e o relatório no dia 2.</p></div>
</div>
</section>

<section aria-labelledby="t-oferta">
<span class="rot">Pra colocar isso rodando</span>
<h2 id="t-oferta">A amostra foi feita com pouca informação</h2>
<div class="card oferta">
  <div class="inc"><h3>A implantação de verdade é ${online ? 'individual, online' : 'presencial e individual'}</h3><p class="sub">${online ? 'Por chamada de vídeo, com um especialista' : '3 horas com um especialista'}: a gente aprende teu jeito de vender, teus preços e tuas regras, conecta tuas contas e deixa tudo no padrão da ${esc(neg)}. ${PRECO.dias_no_ar} dias depois o anúncio está no ar.</p>
  <ul><li>Anúncios novos todo mês, testados e trocados</li><li>Atendimento no WhatsApp a qualquer hora, no jeito de vocês</li><li>12 posts por mês</li><li>Análise a cada 2 dias, relatório todo dia 2 e painel com o retorno</li><li>Equipe conferindo tudo. Sem fidelidade.</li></ul></div>
  ${online
    ? `<div class="preco"><span class="rot">Pra começar</span><div>O primeiro mês, já com a implantação</div><b>${rs(PRECO_ONLINE.primeiro_mes)}</b><small>Depois, ${rs(PRECO_ONLINE.mensal)} por mês, sem fidelidade. A verba do anúncio é paga direto pra Meta, na tua conta.</small></div>`
    : `<div class="preco"><span class="rot">Pros primeiros</span><div>Ativação de <s>${rs(PRECO.ativacao_de)}</s> por</div><b>${rs(PRECO.ativacao_por)}</b><small>Depois, ${rs(PRECO.mensal)} por mês, sem fidelidade. A verba do anúncio é paga direto pra Meta, na tua conta.</small></div>`}
</div>
</section>

<section aria-labelledby="t-duv">
<span class="rot">Dúvidas comuns</span>
<h2 id="t-duv" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Dúvidas comuns</h2>
<div class="duvidas">
  <details class="card"><summary>Os clientes vão perceber que é robô?</summary><p>Ela fala em nome da ${esc(neg)}, no jeito de vocês, e responde na hora. Se alguém perguntar, ela diz a verdade. O que ela não sabe, passa pra equipe. Testa ali em cima e vê.</p></details>
  <details class="card"><summary>Não tenho tempo pra cuidar disso</summary><p>É justamente pra isso. Tu aprova pelo celular e grava um áudio quando der. O resto a Maia faz, com a equipe conferindo.</p></details>
  <details class="card"><summary>Já impulsionei post e não deu</summary><p>Impulsionar leva gente pro perfil. Aqui o anúncio leva direto pra conversa no WhatsApp, a Maia atende na hora, chama de volta quem sumiu e mede o que virou venda.</p></details>
  <details class="card"><summary>Tem fidelidade?</summary><p>Não. Tu fica porque está vendendo. A verba do anúncio é paga direto pra Meta, na tua conta.</p></details>
</div>
</section>

<section class="final" aria-labelledby="t-fim">
  <img alt="A Maia" src="/maia/img/maia-avatar.webp">
  <h2 id="t-fim">Bora colocar a ${esc(neg)} pra rodar?</h2>
  <p>${online ? `Me chama no WhatsApp que a gente marca a implantação online. O primeiro mês, já com ela, sai por ${rs(PRECO_ONLINE.primeiro_mes)}.` : `Me chama no WhatsApp que a gente marca a implantação. Pros primeiros, a ativação sai por ${rs(PRECO.ativacao_por)}.`}</p>
  <div class="ctas"><a class="cta" href="${esc(rodando)}">Quero colocar rodando</a><a class="cta2" href="${esc(testa)}">Testar a Maia antes</a></div>
</section>
<p class="rodape">A Maia é uma inteligência artificial da Carreira no Digital (Lajeado e Porto Alegre, RS). A foto da Maia foi feita por IA. As fotos e os vídeos dos anúncios são da ${esc(neg)}.</p>

</div>
</body></html>`
}
