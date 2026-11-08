// 08/11: monta as versões novas (-v2) das páginas da escola em public/imersao, no padrão visual do site da Maia.
// As páginas atuais NÃO são tocadas. Daqui saem: index-v2, porto-alegre-v2, lajeado-v2, deu-venda-v2 e video-com-ia-v2.
// A Imersão (geral, Porto Alegre e Lajeado) sai de um molde só; muda só o que é da cidade (o objeto CIDADES).
// O pixel, os metadados e os scripts de medição (track, UTMs, link do WhatsApp com turma, Lead com eventID) são COPIADOS
// do arquivo original, sem mudar uma letra, e o script confere isso no fim.
// Uso: node scripts/sites-escola-v2.mjs          (PREVIA=true põe noindex; na troca pela página oficial, rodar com PREVIA=0)
import fs from 'node:fs'
import path from 'node:path'

const PASTA = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'public', 'imersao')
const PREVIA = process.env.PREVIA !== '0'

// ---------- ícones (Lucide, traço) ----------
const L = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${d}</svg>`
const I = {
  cal: L('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>'),
  relogio: L('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  grafico: L('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  pessoa: L('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  pino: L('<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/>'),
  foguete: L('<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2M14 4c3-1 6-1 6-1s0 3-1 6l-6 6-5-5 6-6Z"/><circle cx="15" cy="9" r="1.5"/>'),
  alvo: L('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'),
  paleta: L('<path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5 0-1-1-1.5-1-2.5s.8-1.5 1.8-1.5H17a4 4 0 0 0 4-4c0-4.6-4-8.5-9-8.5Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>'),
  robo: L('<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9 17h6"/>'),
  video: L('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/>'),
  imagem: L('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>'),
  site: L('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/>'),
  texto: L('<path d="M5 6h14M5 11h14M5 16h9"/>'),
  balao: L('<path d="M21 12a8 8 0 0 1-11.8 7L4 20l1.2-4.6A8 8 0 1 1 21 12Z"/>'),
  ok: L('<path d="m5 12.5 4.5 4.5L19 7.5"/>', ' stroke-width="2.6"'),
  okc: L('<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>'),
  x: L('<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>'),
  seta: L('<path d="M4 12h15M13 6l6 6-6 6"/>', ' stroke-width="2.4"'),
  sol: L('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  lua: L('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>'),
  loja: L('<path d="M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6"/>'),
  dinheiro: L('<rect x="2" y="6" width="20" height="12" rx="3"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>'),
  carrinho: L('<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2l2.6 11.4a1 1 0 0 0 1 .8h9.7a1 1 0 0 0 1-.8L21 8H6.2"/>'),
  bussola: L('<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>'),
  maleta: L('<rect x="3" y="7" width="18" height="13" rx="3"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>'),
  aperto: L('<path d="M11 17l2 2a1.5 1.5 0 0 0 2-2"/><path d="m14 14 2.5 2.5a1.5 1.5 0 0 0 2-2l-3.9-3.9a2 2 0 0 0-2.8 0l-.9.9a1.5 1.5 0 0 1-2-2l2.8-2.8a3.5 3.5 0 0 1 4.2-.6l.5.3a2 2 0 0 0 1.6.2L21 6"/><path d="m21 15-2 2M3 6l2 0a2 2 0 0 0 1.6-.2l.5-.3M3 15l5 5"/>'),
  camera: L('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>'),
  notebook: L('<rect x="4" y="4" width="16" height="11" rx="2"/><path d="M2 19h20"/>'),
  celular: L('<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>'),
  estrela: L('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'),
  pasta: L('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  aviso: L('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>'),
  escudo: L('<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="m9 12 2 2 4-4"/>'),
  lampada: L('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z"/>'),
}
// o ícone do WhatsApp (o mesmo das páginas atuais)
const WA = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.8 11.8 0 0 0 4.6 4c1.7.7 2.3.8 3.1.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>'

// ---------- pedaços copiados do original ----------
function partes(arquivo) {
  const h = fs.readFileSync(path.join(PASTA, arquivo), 'utf8').replace(/\r\n/g, '\n')
  const iCab = h.indexOf('<link rel="preconnect"')
  const cab = h.slice(0, iCab) // doctype, pixel, noscript, metas, título, og
  const icone = h.match(/<link rel="icon"[^\n]*\n/)[0]
  const robots = (h.match(/<meta name="robots"[^\n]*\n/) || [''])[0]
  const iFim = h.indexOf('<script>\n(function(){\n  // aparece ao rolar')
  if (iCab < 0 || iFim < 0) throw new Error('não achei as partes de ' + arquivo)
  const fim = h.slice(iFim) // os dois scripts (aparecer e medição) até o </html>
  const pixel = h.slice(h.indexOf('<!-- Meta Pixel'), h.indexOf('</noscript>') + 11)
  return { h, cab, icone, robots, fim, pixel }
}
function pagina(arquivoOriginal, corpo, saida) {
  const p = partes(arquivoOriginal)
  const cab = p.cab.replace('<meta name="theme-color" content="#0e0719">', '<meta name="theme-color" content="#f7f5fc">')
  const html = cab +
    '<link rel="preload" href="/maia/fontes/bricolage-latin.woff2" as="font" type="font/woff2" crossorigin>\n' +
    '<link rel="stylesheet" href="/imersao/v2.css">\n' +
    p.icone + (p.robots || (PREVIA ? '<meta name="robots" content="noindex"><!-- prévia: tirar na troca pela página oficial (PREVIA=0) -->\n' : '')) +
    '</head>\n<body>\n' + corpo + '\n' + p.fim
  fs.writeFileSync(path.join(PASTA, saida), html)
  // confere: o rastreio tem que estar idêntico ao original
  const novo = fs.readFileSync(path.join(PASTA, saida), 'utf8').replace(/\r\n/g, '\n')
  for (const [nome, trecho] of [['pixel', p.pixel], ['scripts de medição', p.fim]]) {
    if (!novo.includes(trecho)) throw new Error(`${saida}: o ${nome} não ficou igual ao original`)
  }
  const ctaOrig = [...p.h.matchAll(/data-turma="[^"]*" data-msg="[^"]*"|data-cta data-msg="[^"]*"/g)].map(m => m[0])
  const ctaNovo = [...novo.matchAll(/data-turma="[^"]*" data-msg="[^"]*"|data-cta data-msg="[^"]*"/g)].map(m => m[0])
  console.log(`${saida}: ${Math.round(novo.length / 1024)} KB · pixel e medição idênticos · botões de WhatsApp: original ${ctaOrig.length}, novo ${ctaNovo.length}`)
  const faltam = ctaOrig.filter(c => !ctaNovo.includes(c))
  if (faltam.length) console.log('   botões do original que não estão na v2:\n   ' + faltam.join('\n   '))
}

// ---------- blocos comuns ----------
const topo = (nome, href, botao, logoHref = 'https://carreiranodigital.com') => `<header class="topo">
  <div class="ct">
    <a class="chapa" href="${logoHref}" aria-label="Carreira no Digital"><img src="/imersao/midia/logo.webp" alt="Carreira no Digital" width="256" height="93"></a>
    <div class="nome">${nome}</div>
    <a class="btn" href="${href}">${botao}</a>
  </div>
</header>`
const celVideo = (src, poster, rotulo, lazy = true) => `<div class="cel"><video ${lazy ? 'data-src' : 'src'}="${src}" poster="${poster}" ${lazy ? '' : 'autoplay '}muted loop playsinline preload="${lazy ? 'none' : 'metadata'}" aria-label="${rotulo}"></video></div>`
const faixaNum = itens => `<div class="faixa-num">${itens.map(([b, s], i) => `<div class="rv${i ? ' d' + Math.min(i, 3) : ''}"><b>${b}</b><span>${s}</span></div>`).join('')}</div>`
const card = (ic, b, s, k = '') => `<div class="card rv${k ? ' ' + k : ''}"><span class="ic">${I[ic]}</span><b>${b}</b><span>${s}</span></div>`
const sai = t => `<p class="sai">${I.okc}<span>${t}</span></p>`

const anuncios = `<section class="f-cinza">
  <div class="ct">
    <div class="cab">
      <span class="olho rv">Anúncios reais</span>
      <h2 class="rv d1">Feitos com vídeo de celular. <span class="grad">Rodando de verdade.</span></h2>
      <p class="lead rv d2">Brindes, seguros, embalagens, ótica, escolinha de esporte e cursos: clientes da escola anunciando com os vídeos e as fotos que os próprios donos gravaram no celular.</p>
    </div>
    <div class="feed" data-rola>
      ${[['wood', 'Wood · Segatto', 'Brindes personalizados'], ['gaja', 'Gaja Corretora', 'Seguros'], ['papelao', 'Mundo do Papelão', 'Embalagens'], ['otica', 'Ótica Tempo de Visão', 'Ótica'], ['matilha', 'Basquete Matilha', 'Escolinha de esporte', true], ['tizon', 'Tizon Academy', 'Cursos online']].map(([k, n, s, img], i) => `<article class="ad rv${i % 3 ? ' d' + (i % 3) : ''}">
        <div class="ad-top"><i></i><div><b>${n}</b><small>Patrocinado</small></div></div>
        ${img ? `<img src="/maia/vid/${k}.jpg" alt="Anúncio real: ${n}" loading="lazy">` : `<video data-src="/maia/vid/${k}.mp4" poster="/maia/vid/${k}.jpg" muted loop playsinline preload="none" aria-label="Anúncio em vídeo: ${n}"></video>`}
        <div class="ad-cta">${s}</div>
      </article>`).join('\n      ')}
    </div>
    <p class="nota">Anúncios reais de clientes da Carreira no Digital.</p>
  </div>
</section>`

const numerosGuto = full => faixaNum(full
  ? [['+500', 'alunos no primeiro ano da escola'], ['+1.000', 'anúncios testados'], ['R$ 1,5 mi', 'investidos em anúncio nos próprios negócios'], ['+15 mil', 'vendas com anúncio nos últimos 3 anos']]
  : [['+500', 'alunos no primeiro ano da escola'], ['+1.000', 'anúncios testados']])

const antesDepois = (olho, titulo, lead, rotuloDepois, legendaDepois) => `<section class="f-pessego">
  <div class="ct">
    <div class="cab centro">
      <span class="olho rv">${olho}</span>
      <h2 class="rv d1">${titulo}</h2>
      <p class="lead rv d2">${lead}</p>
    </div>
    <div class="par">
      <figure class="rv d1">${celVideo('/imersao/midia/katebruto.mp4', '/imersao/midia/katebruto.jpg', 'Vídeo gravado no celular, sem edição')}<span class="selo"><i style="background:#9ca3af;box-shadow:0 0 0 4px rgba(156,163,175,.2)"></i>Antes</span><figcaption>Gravado no celular<span>do jeito que saiu</span></figcaption></figure>
      <div class="seta rv d2" aria-hidden="true">${I.seta}</div>
      <figure class="rv d3">${celVideo('/imersao/midia/kateedit.mp4', '/imersao/midia/kateedit.jpg', rotuloDepois)}<span class="selo"><i></i>Depois</span><figcaption>${legendaDepois}<span>cortes, legenda e marca</span></figcaption></figure>
    </div>
    <div class="chips rv d2">
      <span>${I.ok}Corta as pausas</span>
      <span>${I.ok}Legenda no tempo da fala</span>
      <span>${I.ok}As tuas cores e a tua marca</span>
    </div>
  </div>
</section>`

// ================= IMERSÃO (molde comum das três) =================
const CIDADES = {
  index: {
    original: 'index.html', saida: 'index-v2.html',
    onde: 'Lajeado e Porto Alegre',
    olho: 'Imersão presencial em Lajeado e Porto Alegre · turma pequena',
    presencial: 'Presencial em Lajeado e Porto Alegre',
    datas: ['10/11 em POA · 17/11 em Lajeado', '11/11 em POA · 18/11 em Lajeado', '12/11 em POA · 19/11 em Lajeado', '23/11 em POA · 30/11 em Lajeado'],
    dataRes: ['23/11 e 30/11', 'segundas-feiras: 23/11 em Porto Alegre e 30/11 em Lajeado'],
    turmasOlho: 'Turmas em Lajeado e Porto Alegre',
    turmasTitulo: 'Escolhe a cidade e a turma. <span class="grad">As vagas são poucas.</span>',
    blocos: ['poa', 'lajeado'],
    fimMsg: 'Olá! Vim pelo site da escola, na página da Imersão Deu Venda, e quero saber mais.',
    rodape: 'Lajeado e Porto Alegre',
  },
  poa: {
    original: 'porto-alegre.html', saida: 'porto-alegre-v2.html',
    onde: 'Porto Alegre',
    olho: 'Imersão presencial em Porto Alegre · turma pequena',
    presencial: 'Presencial em Porto Alegre',
    datas: ['terça, 10/11', 'quarta, 11/11', 'quinta, 12/11', 'segunda, 23/11'],
    dataRes: ['23/11', 'segunda-feira, umas duas semanas depois'],
    turmasOlho: 'Turmas em Porto Alegre',
    turmasTitulo: 'Escolhe a tua turma. <span class="grad">As vagas são poucas.</span>',
    blocos: ['poa'], semTituloCidade: true,
    fimMsg: 'Olá! Vim pela página da Imersão Deu Venda em Porto Alegre e quero saber mais.',
    rodape: 'Porto Alegre',
  },
  lajeado: {
    original: 'lajeado.html', saida: 'lajeado-v2.html',
    onde: 'Lajeado',
    olho: 'Imersão presencial em Lajeado · turma pequena',
    presencial: 'Presencial em Lajeado',
    // 08/11: a página atual ainda mostra as datas da turma de outubro (27, 28, 29/10 e 09/11), que já passou. Aqui vão as da turma de novembro.
    datas: ['terça, 17/11', 'quarta, 18/11', 'quinta, 19/11', 'segunda, 30/11'],
    dataRes: ['30/11', 'segunda-feira, umas duas semanas depois'],
    turmasOlho: 'Turmas em Lajeado',
    turmasTitulo: 'Escolhe a tua turma. <span class="grad">As vagas são poucas.</span>',
    blocos: ['lajeado'], semTituloCidade: true,
    fimMsg: 'Olá! Vim pela página da Imersão Deu Venda em Lajeado e quero saber mais.',
    rodape: 'Lajeado',
  },
}
// as turmas abertas (data-turma e data-msg exatamente como nas páginas atuais)
// 08/11: a turma de Lajeado de outubro (imersaodvlajeado102601, 27 a 29/10) saiu: já aconteceu.
const TURMAS = {
  poa: {
    nome: 'Porto Alegre',
    turmas: [
      { turno: 'tarde', titulo: 'Turma da tarde', datas: '10, 11 e 12 de novembro', hora: '14h às 17h15', quarto: 'segunda, 23 de novembro', codigo: 'imersaodvportoalegre112601', msg: 'Olá! Vim pela página da Imersão Deu Venda e quero uma vaga na turma da tarde em Porto Alegre (10, 11, 12/11).', botao: 'Quero a turma da tarde' },
      { turno: 'noite', titulo: 'Turma da noite', datas: '10, 11 e 12 de novembro', hora: '19h às 22h15', quarto: 'segunda, 23 de novembro', codigo: 'imersaodvportoalegre112602', msg: 'Olá! Vim pela página da Imersão Deu Venda e quero uma vaga na turma da noite em Porto Alegre (10, 11, 12/11).', botao: 'Quero a turma da noite' },
    ],
    foto: '/imersao/midia/v2/sede-poa.webp', alt: 'Sede da Carreira no Digital em Porto Alegre',
    local: 'Na sede da escola em Porto Alegre', end: 'Av. Carlos Gomes, 1340, Sala 904, Três Figueiras, Porto Alegre/RS',
  },
  lajeado: {
    nome: 'Lajeado',
    turmas: [
      { turno: 'noite', titulo: 'Turma da noite · novembro', datas: '17, 18 e 19 de novembro', hora: '19h às 22h15', quarto: 'segunda, 30 de novembro', codigo: 'imersaodvlajeado112601', msg: 'Olá! Vim pela página da Imersão Deu Venda e quero uma vaga na turma da noite em Lajeado (17, 18, 19/11).', botao: 'Quero a turma da noite' },
    ],
    foto: '/imersao/midia/v2/sede-lajeado.webp', alt: 'Sede da Carreira no Digital em Lajeado',
    local: 'Na sede da escola em Lajeado', end: 'Rua Alberto Torres, 526, Centro, Lajeado/RS',
  },
}
const turmaHtml = (t, i) => `<div class="turma rv${i ? ' d1' : ''}">
        <span class="tag ${t.turno}">${t.turno === 'tarde' ? I.sol : I.lua}${t.turno === 'tarde' ? 'Tarde' : 'Noite'}</span>
        <h3>${t.titulo}</h3>
        <ul>
          <li>${I.cal}<span><b>${t.datas}</b> (terça a quinta)</span></li>
          <li>${I.relogio}<span><b>${t.hora}</b>, 3 horas por encontro</span></li>
          <li>${I.grafico}<span>4º encontro: <b>${t.quarto}</b></span></li>
          <li>${I.pessoa}<span><b>Turma pequena</b>, vagas limitadas</span></li>
        </ul>
        <a class="btn" href="#" data-cta data-turma="${t.codigo}" data-msg="${t.msg}">${WA}${t.botao}</a>
      </div>`
const blocoCidade = (k, comTitulo) => {
  const c = TURMAS[k]
  return `${comTitulo ? `<h3 class="cidade rv">${I.pino}${c.nome}</h3>\n    ` : ''}<div class="turmas">
      ${c.turmas.map(turmaHtml).join('\n      ')}
    </div>
    <div class="local rv">
      <img src="${c.foto}" alt="${c.alt}" width="1000" height="667" loading="lazy">
      <div><b>${I.pino}${c.local}</b>${c.end}</div>
    </div>`
}

function imersao(c) {
  const corpo = `${topo(`<b>Imersão Deu Venda</b> · ${c.onde}`, '#turmas', 'Ver as turmas')}

<main>

<!-- 1 · a promessa -->
<section class="abre">
  <div class="ct">
    <div>
      <span class="presencial rv"><i>${I.pino}</i>${c.presencial}</span>
      <p class="olho rv" style="margin-top:18px">${c.olho}</p>
      <h1 class="rv d1" style="margin-top:10px">Em 4 encontros, teu negócio sai com <span class="grad">anúncio rodando e vídeo editado pela IA.</span></h1>
      <p class="lead rv d2"><b>O marketing do teu negócio feito com inteligência artificial.</b> Tu grava no celular e a IA edita. A gente monta contigo a estratégia, as artes e a campanha, e umas duas semanas depois senta de novo pra olhar os números.</p>
      <p class="pra-quem rv d2">${I.loja}<span><b>Pra dono de negócio local:</b> loja, ótica, clínica, corretora, oficina e prestador de serviço.</span></p>
      <div class="acao rv d3">
        <a class="btn" href="#turmas">${WA}Quero minha vaga</a>
        <a class="btn btn-sec" href="#encontros">Como funciona</a>
      </div>
    </div>
    <div class="vitrine rv d2">
      <figure class="foto-g"><img src="/imersao/midia/v2/implantacao-guto.webp" alt="Guto conduzindo um encontro com uma aluna, com o anúncio dela no telão" width="900" height="1200" fetchpriority="high"><span class="selo tr">${I.pino}${c.presencial}</span></figure>
      ${celVideo('/imersao/midia/kateedit.mp4', '/imersao/midia/kateedit.jpg', 'Vídeo de anúncio editado pela IA', false)}
      <span class="selo selo-cel"><i></i>editado pela IA</span>
    </div>
  </div>
</section>

<!-- 2 · os números -->
<section class="sec-num">
  <div class="ct">
    ${faixaNum([['4', 'encontros presenciais, em turma pequena'], ['3 h', 'cada encontro, fazendo junto'], ['2º', 'encontro: o anúncio já entra no ar'], ['30 dias', 'no grupo da turma com o time da escola']])}
  </div>
</section>

<!-- 3 · a prova -->
${antesDepois('A novidade', 'Tu grava assim. <span class="grad">A IA entrega assim.</span>', 'A parte em que quase todo negócio trava é o vídeo. Agora tu grava do teu jeito no celular, e a máquina deixa pronto pra anunciar.', 'O mesmo vídeo, editado pela IA', 'Pronto pela IA')}

<!-- 4 · os encontros -->
<section id="encontros">
  <div class="ct">
    <div class="cab">
      <span class="olho rv">Como funciona</span>
      <h2 class="rv d1">Cada encontro termina com <span class="grad">algo pronto no teu negócio.</span></h2>
      <p class="lead rv d2">Não é aula pra assistir. Tu traz o teu notebook, o celular com o WhatsApp Business e o acesso ao Facebook e ao Instagram do teu negócio, e a gente faz junto.</p>
    </div>
    <div class="passos">
      <article class="passo p1 rv">
        <div class="txt">
          <span class="num">01</span>
          <span class="n">${I.cal}${c.datas[0]}</span>
          <h3>Estratégia</h3>
          <p>O contexto do teu negócio, o teu mercado, a tua oferta e pra quem falar. É o que faz a IA trabalhar pro teu negócio, e não um texto genérico.</p>
          ${sai('Sai com a estratégia e os roteiros dos vídeos')}
        </div>
        <div class="vis v-est">
          <figure class="foto-p"><img src="/imersao/midia/v2/aula.webp" alt="Aluna montando a estratégia do negócio com ajuda, na sala da escola" width="900" height="1125" loading="lazy"><span class="selo tr"><i></i>Contigo do lado</span></figure>
          <div class="cartao">
            <p class="t">A ESTRATÉGIA DO TEU NEGÓCIO</p>
            <ul class="lista-ok">
              <li>${I.okc}O que tu faz diferente</li>
              <li>${I.okc}O teu mercado</li>
              <li>${I.okc}A tua oferta</li>
              <li>${I.okc}Pra quem falar</li>
              <li>${I.okc}Os roteiros dos vídeos</li>
            </ul>
          </div>
        </div>
      </article>
      <article class="passo p2 rv">
        <div class="txt">
          <span class="num">02</span>
          <span class="n">${I.cal}${c.datas[1]}</span>
          <h3>Arte, vídeo e campanha</h3>
          <p>As artes, as imagens e os vídeos que tu gravou, editados pela IA. E a campanha no Facebook e no Instagram, montada direto pelo Claude, contigo do lado.</p>
          ${sai('Sai com os anúncios no ar')}
        </div>
        <div class="vis">
          <div class="cartao">
            <p class="t">ANÚNCIOS REAIS, FEITOS COM VÍDEO DE CELULAR</p>
            <div class="pecas4"><img src="/maia/vid/wood.jpg" alt="Anúncio real da Wood" loading="lazy"><img src="/maia/vid/otica.jpg" alt="Anúncio real de uma ótica" loading="lazy"><img src="/maia/vid/papelao.jpg" alt="Anúncio real de uma loja de embalagens" loading="lazy"><img src="/maia/vid/gaja.jpg" alt="Anúncio real de uma corretora de seguros" loading="lazy"></div>
          </div>
          <div class="cartao campanha"><span class="ic">${I.foguete}</span><div><b>A tua campanha</b><small>Facebook e Instagram · montada pelo Claude</small></div><span class="st"><i></i>no ar</span></div>
        </div>
      </article>
      <article class="passo p3 rv">
        <div class="txt">
          <span class="num">03</span>
          <span class="n">${I.cal}${c.datas[2]}</span>
          <h3>Ajuste e atendimento</h3>
          <p>Os primeiros contatos chegando, o ajuste da campanha com dado de verdade, o atendimento no WhatsApp e o site da tua empresa feito com a IA.</p>
          ${sai('Sai com a campanha ajustada, o atendimento organizado e o site no ar')}
        </div>
        <div class="vis v-wa">
          <div class="cel"><div class="tela">
            <div class="wtop"><span class="av">TN</span><div><b>O teu negócio</b><span>WhatsApp Business</span></div></div>
            <div class="msgs">
              <span class="dia">HOJE</span>
              <div class="m eu">Oi! Vi o anúncio de vocês. Como funciona?<small>19:02</small></div>
              <div class="m">Oi! Que bom que chamou. Te explico rapidinho como funciona e o que tu ganha com isso, e depois te passo os valores.<small>19:02</small></div>
              <div class="m">Quer que eu já veja um horário pra ti esta semana?<small>19:03</small></div>
              <div class="m eu">Quero sim!<small>19:05</small></div>
              <span class="rotulo">${I.okc}Contato do anúncio virou conversa de venda</span>
            </div>
          </div></div>
          <span class="selo">${I.balao}Respostas prontas</span>
        </div>
      </article>
      <article class="passo p4 rv">
        <div class="txt">
          <span class="num">04</span>
          <span class="n">${I.cal}${c.datas[3]}</span>
          <h3>Os resultados</h3>
          <p>Umas duas semanas depois, numa segunda-feira, a turma volta com os números na mão: quantas pessoas chamaram, quanto custou cada conversa, o que vendeu. E o que fazer daqui pra frente.</p>
        </div>
        <div class="vis v-res">
          <div class="data"><b>${c.dataRes[0]}</b><span>${c.dataRes[1]}</span></div>
          <div class="perg"><span class="ic">${I.balao}</span><b>Quantas pessoas chamaram</b></div>
          <div class="perg"><span class="ic">${I.dinheiro}</span><b>Quanto custou cada conversa</b></div>
          <div class="perg"><span class="ic">${I.carrinho}</span><b>O que vendeu</b></div>
          <div class="perg"><span class="ic">${I.bussola}</span><b>O que fazer daqui pra frente</b></div>
        </div>
      </article>
    </div>
    <p class="nota">Conversa de exemplo.</p>
  </div>
</section>

<!-- 5 · o que tu leva -->
<section class="f-cinza" id="entregas">
  <div class="ct">
    <div class="cab">
      <span class="olho rv">O que tu leva</span>
      <h2 class="rv d1">Tudo que vem na <span class="grad">Imersão Deu Venda.</span></h2>
    </div>
    <p class="grupo-t rv"><em>1</em>A estratégia, decidida contigo</p>
    <div class="cards c2">
      ${card('alvo', 'A tua estratégia', 'O que tu faz diferente, o teu mercado, a tua oferta e pra quem falar.')}
      ${card('paleta', 'O teu padrão de marca', 'Cores, letras e estilo do teu negócio, aprovados por ti e guardados na máquina.', 'k2')}
    </div>
    <p class="grupo-t rv"><em>2</em>A tua máquina de IA, que é tua</p>
    <div class="cards">
      ${card('robo', 'A máquina de IA configurada', 'Dentro do Claude, com o teu negócio guardado. É tua, e tu continua usando depois.', 'forte')}
      ${card('video', 'A edição dos teus vídeos', 'Tu grava no celular, a máquina corta, legenda e põe a tua marca. Instalada e testada no teu computador.', 'k2')}
      ${card('imagem', 'Artes e posts', 'No teu padrão, em cima das fotos do teu negócio.', 'k3')}
      ${card('site', 'O site da tua empresa', 'Tu aprende a fazer as páginas do teu negócio com a IA, e sai com a tua no ar.', 'k4')}
      ${card('texto', 'Roteiros e legendas', 'Pros teus vídeos e posts, escritos pela máquina com a tua estratégia.')}
    </div>
    <p class="grupo-t rv"><em>3</em>No ar, e com a gente junto</p>
    <div class="cards c4">
      ${card('foguete', 'A campanha no Facebook e no Instagram', 'Montada direto pelo Claude, no ar desde o 2º encontro.', 'k2')}
      ${card('balao', 'O atendimento no WhatsApp Business', 'Respostas prontas e o caminho pra cada contato virar conversa de venda.', 'k3')}
      ${card('grafico', 'O 4º encontro, dos resultados', 'Umas duas semanas depois, os números da tua campanha na mesa e o próximo passo.', 'k4')}
      ${card('pessoa', '30 dias no grupo da turma', 'O time da escola no WhatsApp, pra tirar dúvida e ajudar a responder quem chegou.')}
    </div>
  </div>
</section>

<!-- 6 · anúncios reais -->
${anuncios}

<!-- 7 · quem conduz -->
<section>
  <div class="ct quem">
    <figure class="foto-g rv"><img src="/imersao/midia/v2/guto.webp" alt="Guto Wickert na sede da escola" width="780" height="976" loading="lazy"><span class="selo bl"><i></i>Quem conduz a imersão</span></figure>
    <div>
      <span class="olho rv">Quem conduz a imersão</span>
      <h2 class="rv d1">Guto Wickert</h2>
      <p class="rv d1">Dezesseis anos de empresa física antes do digital: vendeu uma, quebrou outra. Por isso olha o negócio <b>pelo caixa, não pelo like.</b></p>
      <p class="rv d2">Idealizador da <b>Carreira no Digital</b>, escola presencial com sedes em Lajeado e Porto Alegre, que <b>formou mais de 500 alunos no primeiro ano.</b></p>
      <p class="rv d2">Hoje a escola roda com <b>inteligência artificial no dia a dia</b>: o atendimento no WhatsApp, a edição dos vídeos, o conteúdo e as campanhas. O que tu vai fazer na imersão é o que a escola usa todo dia no próprio negócio.</p>
      ${numerosGuto(true)}
    </div>
  </div>
</section>

<!-- 8 · turmas e investimento -->
<section class="f-lilas" id="turmas">
  <div class="ct">
    <div class="cab">
      <span class="olho rv">${c.turmasOlho}</span>
      <h2 class="rv d1">${c.turmasTitulo}</h2>
    </div>
    ${c.blocos.map(k => blocoCidade(k, !c.semTituloCidade)).join('\n    ')}
    <div class="preco rv">
      <div>
        <span class="tag">Os 4 encontros · tudo incluso</span>
        <div class="valor">R$ 1.497<small>ou 6x de R$ 249,50 no cartão</small></div>
      </div>
      <div class="info">
        <p>${I.estrela}<span><b>Já foi aluno da escola? Tem condição especial.</b> Chama no WhatsApp que a gente te passa.</span></p>
        <p>${I.dinheiro}<span>A verba dos anúncios é tua e vai direto pra Meta. Quanto investir, a gente define contigo no 1º encontro.</span></p>
        <p>${I.maleta}<span><b>Pra levar:</b> notebook, celular com o WhatsApp Business, e o acesso à página do Facebook e ao Instagram do teu negócio. A gente te manda o passo a passo antes.</span></p>
      </div>
    </div>
  </div>
</section>

<!-- 9 · fim -->
<section class="fim">
  <div class="ct">
    <img class="rosto rv" src="/imersao/midia/v2/guto.webp" alt="Guto Wickert" width="150" height="150" loading="lazy">
    <h2 class="rv">Teu negócio com <span class="grad">anúncio rodando em 4 encontros.</span></h2>
    <p class="lead rv d1">Chama no WhatsApp, tira as tuas dúvidas e garante a tua vaga.</p>
    <div class="acao rv d2">
      <a class="btn" href="#" data-cta data-msg="${c.fimMsg}">${WA}Falar com a escola no WhatsApp</a>
      <span class="calma">${c.presencial} · Turma pequena</span>
    </div>
  </div>
</section>

</main>

<footer>Carreira no Digital · Imersão Deu Venda · ${c.rodape}</footer>
<div class="fixo"><a class="btn" href="#turmas">${WA}Quero minha vaga</a></div>
`
  pagina(c.original, corpo, c.saida)
}

// ================= DEU VENDA (implantação individual) =================
function deuVenda() {
  const corpo = `${topo('<b>Deu Venda</b> · implantação individual', '#investimento', 'Quero o Deu Venda')}

<main>

<!-- 1 · a promessa -->
<section class="abre">
  <div class="ct">
    <div>
      <span class="olho rv">Implantação individual · Lajeado e Porto Alegre</span>
      <h1 class="rv d1">A tua máquina de IA montada dentro do teu negócio, <span class="grad">e a campanha no ar com tu olhando.</span></h1>
      <p class="lead rv d2"><b>Um a um, presencial, com o especialista do teu lado.</b> Em dois encontros a máquina fica montada com o teu negócio dentro e a primeira campanha entra no ar. Depois, três meses de acompanhamento, até a estratégia acertar.</p>
      <div class="acao rv d3">
        <a class="btn" href="#investimento">${WA}Quero o Deu Venda</a>
        <a class="btn btn-sec" href="#encontros">Como funciona</a>
      </div>
    </div>
    <div class="vitrine rv d2">
      <figure class="foto-g"><img src="/imersao/midia/v2/implantacao-guto.webp" alt="Guto na implantação com uma aluna, com o anúncio dela no telão, na sede da escola" width="900" height="1200" fetchpriority="high"><span class="selo tr"><i></i>um a um, na sede da escola</span></figure>
      <div class="cartao campanha camp-flut"><span class="ic">${I.foguete}</span><div><b>A tua campanha</b><small>sobe com tu olhando</small></div><span class="st"><i></i>no ar</span></div>
    </div>
  </div>
</section>

<!-- 2 · os números -->
<section class="sec-num">
  <div class="ct">
    ${faixaNum([['1 a 1', 'presencial, só o teu negócio na mesa'], ['2', 'encontros de implantação'], ['3 meses', 'de acompanhamento'], ['5', 'encontros cara a cara no total']])}
  </div>
</section>

<!-- 3 · pra quem -->
<section>
  <div class="ct">
    <div class="cab">
      <span class="olho rv">Pra quem é</span>
      <h2 class="rv d1">Tu sabe que precisa do digital. <span class="grad">O que falta é o como.</span></h2>
      <p class="lead rv d2">Tu atende bem quem chega. O buraco está antes disso: no dia em que ninguém chega. E quando o assunto é resolver, a gente escuta sempre as mesmas frases.</p>
    </div>
    <div class="frases">
      <div class="frase rv"><span class="aspas">“</span><b>Todo mundo já foi pro digital, menos eu.</b><span>A sensação de estar atrasado, enquanto o concorrente aparece e tu não.</span></div>
      <div class="frase rv d1"><span class="aspas">“</span><b>Já paguei por isso e não deu em nada.</b><span>Esse dinheiro pesa. E a dúvida que sobra é a pior parte: será que o problema fui eu?</span></div>
      <div class="frase rv d2"><span class="aspas">“</span><b>Não entendo disso, qualquer um me enrola.</b><span>Sem entender, tu não consegue cobrar quem trabalha pra ti nem saber pra onde vai o dinheiro.</span></div>
    </div>
    <p class="virada rv">${I.lampada}<span>O Deu Venda existe pra isso: <b>montar contigo, no teu negócio, e te deixar sabendo mexer.</b></span></p>
  </div>
</section>

<!-- 4 · os encontros -->
<section id="encontros" class="f-cinza">
  <div class="ct">
    <div class="cab">
      <span class="olho rv">Como funciona</span>
      <h2 class="rv d1">Cinco encontros cara a cara, <span class="grad">do primeiro anúncio ao plano dos próximos meses.</span></h2>
      <p class="lead rv d2">Não é curso e não é turma: é só o teu negócio na mesa. Entre os encontros, um grupo de WhatsApp com o time da escola.</p>
    </div>
    <div class="passos">
      <article class="passo p1 rv">
        <div class="txt">
          <span class="num">01</span>
          <span class="n">${I.robo}Implanta</span>
          <h3>O teu negócio, a tua oferta e o teu mercado</h3>
          <p>A gente levanta o teu negócio, fecha a oferta, lê o mercado atrás da lacuna que ninguém está dizendo e define o padrão visual da tua marca.</p>
          ${sai('Sai com a estratégia decidida e o padrão da marca')}
        </div>
        <div class="vis v-est">
          <figure class="foto-p"><img src="/imersao/midia/v2/aula.webp" alt="Implantação um a um na sala da escola" width="900" height="1125" loading="lazy"><span class="selo tr"><i></i>Só o teu negócio na mesa</span></figure>
          <div class="cartao">
            <p class="t">MONTADO NO DIA</p>
            <ul class="lista-ok">
              <li>${I.okc}O teu negócio levantado</li>
              <li>${I.okc}A oferta fechada</li>
              <li>${I.okc}A lacuna do mercado</li>
              <li>${I.okc}O padrão visual da marca</li>
            </ul>
          </div>
        </div>
      </article>
      <article class="passo p2 rv">
        <div class="txt">
          <span class="num">02</span>
          <span class="n">${I.robo}Implanta</span>
          <h3>As peças e a campanha no ar</h3>
          <p>As ideias de conteúdo, as primeiras peças feitas com as fotos reais do teu negócio, e a campanha sobe com tu olhando. Antes de sair, tu mesmo clica no teu anúncio e vê a conversa chegar.</p>
          ${sai('Sai com a máquina montada e a campanha no ar')}
        </div>
        <div class="vis">
          <div class="cartao">
            <p class="t">ANÚNCIOS REAIS, FEITOS COM FOTO E VÍDEO DO PRÓPRIO NEGÓCIO</p>
            <div class="pecas4"><img src="/maia/vid/otica.jpg" alt="Anúncio real de uma ótica" loading="lazy"><img src="/maia/vid/wood.jpg" alt="Anúncio real da Wood" loading="lazy"><img src="/maia/vid/matilha.jpg" alt="Anúncio real de uma escolinha de basquete" loading="lazy"><img src="/maia/vid/papelao.jpg" alt="Anúncio real de uma loja de embalagens" loading="lazy"></div>
          </div>
          <div class="cartao campanha"><span class="ic">${I.foguete}</span><div><b>A primeira campanha</b><small>tu clica no anúncio e vê a conversa chegar</small></div><span class="st"><i></i>no ar</span></div>
        </div>
      </article>
    </div>
    <div class="meses">
      <div class="mes rv"><span class="num">03</span><br><span class="n">Mês 1</span><h3>A leitura dos números</h3><p>O que aconteceu com a campanha: quantas pessoas chamaram, quanto custou cada conversa, o que virou venda.</p></div>
      <div class="mes rv d1"><span class="num">04</span><br><span class="n">Mês 2</span><h3>O ajuste</h3><p>Com dado de verdade na mão, o ajuste que faz a estratégia acertar.</p></div>
      <div class="mes rv d2"><span class="num">05</span><br><span class="n">Mês 3</span><h3>O plano dos próximos meses</h3><p>O fechamento, com o plano dos próximos meses escrito, pra tu seguir tocando sozinho.</p></div>
    </div>
    <p class="grupo-wa rv">${WA}<span><b>Entre os encontros:</b> um grupo de WhatsApp com o time da escola.</span></p>
  </div>
</section>

<!-- 5 · a IA na prática -->
${antesDepois('A máquina na prática', 'Tu pede. <span class="grad">Ela faz, no teu padrão.</span>', 'A máquina já conhece a tua estratégia e a tua marca. Um exemplo das nossas salas: o vídeo gravado no celular por uma dona de ótica, e o mesmo vídeo pronto pra anunciar.', 'O mesmo vídeo, pronto pela máquina', 'Pronto pela máquina')}

<!-- 6 · o que fica montado -->
<section id="entregas">
  <div class="ct">
    <div class="cab">
      <span class="olho rv">O que fica montado</span>
      <h2 class="rv d1">Uma máquina de IA <span class="grad">com o teu negócio dentro, e que é tua.</span></h2>
      <p class="lead rv d2">A máquina roda no Claude, pelo navegador, <b>na tua conta</b>. Depois dos três meses, ela continua tua. Durante os três meses, toda melhoria que a escola faz na máquina chega pra ti.</p>
    </div>
    <p class="grupo-t rv"><em>1</em>Montado no dia, dentro da máquina</p>
    <div class="cards c4">
      ${card('alvo', 'O contexto e o mercado', 'O que tu faz diferente, o teu público e a lacuna que os concorrentes não estão pegando.')}
      ${card('paleta', 'A tua marca', 'O padrão visual aprovado por ti, guardado pra toda peça sair igual.', 'k2')}
      ${card('balao', 'O que responder no WhatsApp', 'Preço, prazo, “como funciona”: as respostas certas pro teu negócio.', 'k3')}
      ${card('lampada', 'As ideias e o texto da página', 'As ideias de conteúdo escolhidas e o texto da tua página de oferta.', 'k4')}
    </div>
    <p class="grupo-t rv"><em>2</em>Depois, tu pede sozinho</p>
    <div class="cards c4">
      ${card('imagem', 'Artes e carrosséis', 'Em cima das fotos reais do teu negócio, no teu padrão. Nada de imagem genérica.', 'k2')}
      ${card('texto', 'Roteiros e legendas', 'Pros teus vídeos e posts, escritos com a tua estratégia.', 'k3')}
      ${card('site', 'A página de oferta', 'A página do teu negócio, feita com a máquina.', 'k4')}
      ${card('grafico', 'O painel do mês e a campanha', 'Os números do mês num painel, e a campanha subindo e sendo ajustada.', 'forte')}
    </div>
  </div>
</section>

<!-- 7 · anúncios reais -->
${anuncios}

<!-- 8 · antes de começar -->
<section id="antes">
  <div class="ct">
    <div class="cab">
      <span class="olho rv">Antes de começar</span>
      <h2 class="rv d1">O que tu precisa ter <span class="grad">pra máquina rodar.</span></h2>
    </div>
    <div class="duas">
      <div class="col sim rv"><h3>${I.okc}Precisa ter</h3><ul>
        <li>${I.ok}<span><b>Saber o que vende e por quanto</b></span></li>
        <li>${I.ok}<span><b>Verba pra anúncio:</b> é tua e vai direto pra Meta</span></li>
        <li>${I.ok}<span><b>Um WhatsApp</b> que receba os contatos</span></li>
        <li>${I.ok}<span><b>Conta de anúncio da Meta</b> com forma de pagamento aprovada, e a página do Facebook e o Instagram conectados. A aprovação leva dias: a gente te manda o passo a passo antes.</span></li>
      </ul></div>
      <div class="col nao rv d1"><h3>${I.x}Não entra no Deu Venda</h3><ul>
        <li>${I.x}<span>A verba de anúncio</span></li>
        <li>${I.x}<span>Domínio e hospedagem, se tu for ter site</span></li>
        <li>${I.x}<span>O CRM, que é o teunegócio OS</span></li>
        <li>${I.x}<span>Gestão de tráfego contínua: a escola ensina e acompanha, <b>quem opera é tu</b></span></li>
      </ul></div>
    </div>
    <p class="aviso rv">${I.aviso}<span><b>Não é pra quem</b> quer que façam tudo sem participar, ainda não sabe o que vende nem por quanto, ou procura garantia de número de clientes. A escola ensina o método e acompanha, e não garante volume de venda.</span></p>
  </div>
</section>

<!-- 9 · quem conduz -->
<section class="f-cinza">
  <div class="ct quem">
    <figure class="foto-g rv"><img src="/imersao/midia/v2/guto.webp" alt="Guto Wickert na sede da escola" width="780" height="976" loading="lazy"><span class="selo bl"><i></i>Quem senta contigo</span></figure>
    <div>
      <span class="olho rv">Quem senta contigo</span>
      <h2 class="rv d1">Guto Wickert</h2>
      <p class="rv d1">Dezesseis anos de empresa física antes do digital: vendeu uma, quebrou outra. Por isso olha o negócio <b>pelo caixa, não pelo like.</b></p>
      <p class="rv d2">Idealizador da <b>Carreira no Digital</b>, com sedes em Lajeado e Porto Alegre, que <b>formou mais de 500 alunos no primeiro ano.</b> É quem conduz cada implantação do Deu Venda.</p>
      ${numerosGuto(true)}
    </div>
  </div>
</section>

<!-- 10 · investimento -->
<section class="f-lilas" id="investimento">
  <div class="ct">
    <div class="cab">
      <span class="olho rv">Investimento</span>
      <h2 class="rv d1">Os cinco encontros e os três meses, <span class="grad">num valor só.</span></h2>
    </div>
    <div class="preco rv" style="margin-top:0">
      <div>
        <span class="tag">5 encontros + 3 meses</span>
        <div class="valor">R$ 2.797<small>à vista, ou 10x de R$ 299,70 no cartão</small></div>
      </div>
      <div class="info">
        <p>${I.okc}<span><b>Os três meses de acompanhamento estão inclusos</b> nas duas formas.</span></p>
        <p>${I.dinheiro}<span>Fora do valor: a verba de anúncio (tua, direto na Meta), domínio e hospedagem se tu for ter site, e o CRM.</span></p>
      </div>
    </div>
    <div class="turmas" style="margin-top:20px">
      <div class="turma rv">
        <span class="tag">${I.pino}Porto Alegre</span>
        <h3>Na sede de Porto Alegre</h3>
        <ul><li>${I.cal}<span>Data dos encontros <b>combinada contigo</b></span></li><li>${I.pino}<span>Av. Carlos Gomes, 1340, Sala 904, Três Figueiras</span></li></ul>
        <a class="btn" href="#" data-cta data-turma="deuvendaportoalegre" data-msg="Olá! Vim pela página do Deu Venda e quero a implantação individual em Porto Alegre.">${WA}Quero em Porto Alegre</a>
      </div>
      <div class="turma rv d1">
        <span class="tag">${I.pino}Lajeado</span>
        <h3>Na sede de Lajeado</h3>
        <ul><li>${I.cal}<span>Data dos encontros <b>combinada contigo</b></span></li><li>${I.pino}<span>Rua Alberto Torres, 526, Centro</span></li></ul>
        <a class="btn" href="#" data-cta data-turma="deuvendalajeado" data-msg="Olá! Vim pela página do Deu Venda e quero a implantação individual em Lajeado.">${WA}Quero em Lajeado</a>
      </div>
    </div>
  </div>
</section>

<!-- 11 · fim -->
<section class="fim">
  <div class="ct">
    <img class="rosto rv" src="/imersao/midia/v2/guto.webp" alt="Guto Wickert" width="150" height="150" loading="lazy">
    <h2 class="rv">O marketing montado no teu negócio, <span class="grad">com alguém do lado.</span></h2>
    <p class="lead rv d1">Chama no WhatsApp, tira as tuas dúvidas e a gente vê se faz sentido pro teu negócio.</p>
    <div class="acao rv d2">
      <a class="btn" href="#" data-cta data-msg="Olá! Vim pela página do Deu Venda e quero saber mais.">${WA}Falar com a escola no WhatsApp</a>
      <span class="calma">Um a um · Presencial em Lajeado e Porto Alegre</span>
    </div>
  </div>
</section>

</main>

<footer>Carreira no Digital · Deu Venda · implantação individual em Lajeado e Porto Alegre</footer>
<div class="fixo"><a class="btn" href="#investimento">${WA}Quero o Deu Venda</a></div>
`
  pagina('deu-venda.html', corpo, 'deu-venda-v2.html')
}

// ================= VÍDEO COM IA =================
function videoComIa() {
  const estilos = [
    ['print', 'Gancho grande e print na tela', 'respondendo a pergunta de um cliente'],
    ['oficina', 'Etiqueta em cada etapa', 'a oficina mostrando o serviço de perto'],
    ['ceramica', 'História e oferta no final', 'o ateliê com o cartão do kit de Natal'],
    ['loja', 'Peça, tamanho e preço na tela', 'a loja de roupa mostrando cada modelo'],
    ['apoio', 'Imagem de apoio sobre a fala', 'a cena muda enquanto tu explica'],
    ['marca', 'As cores da marca da loja', 'com o selo da condição especial'],
    ['oficina2', 'O passo a passo do conserto', 'do problema ao teste na bancada'],
    ['bastidor', 'Bastidor com faixa de texto', 'mostrando o dia a dia do negócio'],
    ['selos', 'Selos e números na tela', 'pra anúncio de oferta'],
  ]
  const etapas = [
    ['A IA conhece o teu negócio', 'Uma conversa rápida: o que tu vende, pra quem e o teu jeito de falar. Com isso ela para de escrever coisa genérica e escreve como tu.', 'Sai com o teu negócio guardado na IA'],
    ['Roteiro com IA', 'Como pedir o roteiro certo, pra postar e pra anunciar: o gancho que segura nos primeiros segundos, o que falar no meio e como terminar.', 'Sai com roteiros prontos pra gravar'],
    ['Gravar no celular', 'As regras simples que fazem diferença: luz, som, enquadramento e começar já no gancho. Tu grava ali mesmo, na escola.', 'Sai com o teu primeiro vídeo gravado'],
    ['O teu estilo', 'A IA propõe o visual dos teus vídeos e tu ajusta até gostar: cores, letra, legenda, destaque, selos e marca. É o padrão que vai em todo vídeo daqui pra frente.', 'Sai com o teu estilo criado e aprovado'],
    ['Edição com IA', 'A IA corta as pausas e os erros, põe a legenda, as imagens de apoio e a tua marca. Não gostou de alguma coisa? Tu pede o ajuste em português.', 'Sai com o vídeo editado e sabendo repetir em casa'],
  ]
  const corpo = `${topo('<b>Edição de vídeo com IA</b> · curso presencial', '#turmas', 'Quero a minha vaga', '/')}

<main>

<!-- 1 · a promessa -->
<section class="abre">
  <div class="ct">
    <div>
      <span class="olho rv">Curso presencial · Lajeado e Porto Alegre · um encontro</span>
      <h1 class="rv d1">Tu grava no celular. <span class="grad">A IA escreve o roteiro e edita o vídeo.</span></h1>
      <p class="lead rv d2"><b>Edição de vídeo com IA, do começo ao fim:</b> o roteiro, a gravação, a edição e o teu estilo de vídeo, criado e aprovado por ti. Em um encontro, tu sai fazendo sozinho, pra postar e pra anunciar.</p>
      <div class="acao rv d3">
        <a class="btn" href="#turmas">${WA}Quero a minha vaga</a>
        <a class="btn btn-sec" href="#estilos">Ver vídeos editados</a>
      </div>
    </div>
    <div class="vitrine rv d2">
      <figure class="foto-g"><img src="/imersao/midia/v2/aula.webp" alt="Aluna com o celular na mão, ao lado do professor, na sala da escola" width="900" height="1125" fetchpriority="high"><span class="selo tr">${I.pino}Presencial · um encontro</span></figure>
      ${celVideo('/videocomia/midia/estilo-print.mp4', '/videocomia/midia/estilo-print.jpg', 'Vídeo vertical editado pela IA, com o print de uma conversa na tela e legenda', false)}
      <span class="selo selo-cel"><i></i>gravado no celular, editado pela IA</span>
    </div>
  </div>
</section>

<!-- 2 · o que tem -->
<section class="sec-num">
  <div class="ct">
    <div class="cards c4">
      ${card('texto', 'Roteiro com IA', 'O gancho, o meio e o fim, no teu jeito de falar.')}
      ${card('video', 'Edição com IA', 'Corte, legenda, imagem de apoio e a tua marca.', 'k2')}
      ${card('paleta', 'O teu estilo', 'Criado no encontro e aprovado por ti.', 'k3')}
      ${card('pino', 'Um encontro presencial', 'Em turma pequena, em Lajeado ou Porto Alegre.', 'k4')}
    </div>
  </div>
</section>

<!-- 3 · pra quem -->
<section>
  <div class="ct">
    <div class="cab">
      <span class="olho rv">Pra quem é</span>
      <h2 class="rv d1">Tu sabe que precisa de vídeo. <span class="grad">O que trava é o tempo.</span></h2>
      <p class="lead rv d2">Vídeo é o que mais faz o negócio aparecer. Mas entre pensar no que falar, gravar e editar, ele vira a tarefa que sempre fica pra depois.</p>
    </div>
    <div class="frases">
      <div class="frase rv"><span class="aspas">“</span><b>Não sei o que falar.</b><span>Tu abre a câmera e trava. A IA te entrega o roteiro pronto, com o gancho e o fim, do teu jeito de falar.</span></div>
      <div class="frase rv d1"><span class="aspas">“</span><b>Editar leva uma tarde.</b><span>Cortar pausa, pôr legenda, colocar a marca. A IA faz isso enquanto tu atende o próximo cliente.</span></div>
      <div class="frase rv d2"><span class="aspas">“</span><b>Meu vídeo fica amador.</b><span>Legenda grande, corte no ritmo, imagem de apoio e as cores da tua marca. Todo vídeo no mesmo padrão.</span></div>
    </div>
  </div>
</section>

<!-- 4 · os estilos -->
<section id="estilos" class="f-pessego">
  <div class="ct">
    <div class="cab">
      <span class="olho rv">Vídeos editados pela IA</span>
      <h2 class="rv d1">Cada negócio com o seu estilo. <span class="grad">Tu cria o teu e aprova.</span></h2>
      <p class="lead rv d2">Oficina, loja, ateliê, ótica, escola: todos gravados no celular e editados pela IA. No encontro tu escolhe como o teu vai ser: as cores, a letra e o lugar da legenda, a palavra em destaque, os selos, a imagem de apoio, como entra a marca. <b>Aprovou, todo vídeo sai assim.</b></p>
    </div>
    <div class="estilos" data-rola>
      ${estilos.map(([k, t, s], i) => `<figure class="rv${i % 3 ? ' d' + (i % 3) : ''}">${celVideo(`/videocomia/midia/estilo-${k}.mp4`, `/videocomia/midia/estilo-${k}.jpg`, t)}<figcaption>${t}<span>${s}</span></figcaption></figure>`).join('\n      ')}
    </div>
  </div>
</section>

<!-- 5 · o encontro -->
<section id="encontro">
  <div class="ct">
    <div class="cab">
      <span class="olho rv">Como é o encontro</span>
      <h2 class="rv d1">Do roteiro ao vídeo pronto, <span class="grad">tudo num encontro.</span></h2>
      <p class="lead rv d2">Tu traz o notebook e o celular. A gente faz junto, no teu negócio, e tu sai com o teu estilo aprovado e o primeiro vídeo editado.</p>
    </div>
    <div class="etapas">
      ${etapas.map(([h, p, s], i) => `<div class="etapa rv${i % 3 ? ' d' + (i % 3) : ''}"><span class="num">0${i + 1}</span><h3>${h}</h3><p>${p}</p>${sai(s)}</div>`).join('\n      ')}
      <div class="etapa foto rv d2"><img src="/imersao/midia/v2/implantacao-guto.webp" alt="Guto com uma aluna na sala da escola" width="900" height="1200" loading="lazy"></div>
    </div>
  </div>
</section>

<!-- 6 · o que fica -->
<section id="entregas" class="f-cinza">
  <div class="ct">
    <div class="cab">
      <span class="olho rv">O que fica contigo</span>
      <h2 class="rv d1">Tudo pra editar os teus vídeos, <span class="grad">no teu computador, toda semana.</span></h2>
      <p class="lead rv d2">Tudo roda no Claude, a inteligência artificial que a escola usa no dia a dia, <b>na tua conta</b>. Depois do encontro, continua contigo.</p>
    </div>
    <p class="grupo-t rv"><em>1</em>Montado no encontro</p>
    <div class="cards c2">
      ${card('pasta', 'O resumo do teu negócio', 'O que tu vende, pra quem e como tu fala, guardado pra IA usar em todo roteiro.')}
      ${card('paleta', 'O teu estilo de vídeo', 'Cores, letra, legenda, selos e marca, aprovados por ti: todo vídeo sai igual.', 'k2')}
    </div>
    <p class="grupo-t rv"><em>2</em>Depois, tu pede sozinho</p>
    <div class="cards c2">
      ${card('texto', 'Roteiros', 'Pra postar e pra anunciar, quantos tu precisar, no teu jeito de falar.', 'k3')}
      ${card('video', 'Vídeos editados', 'Tu larga o vídeo do celular numa pasta, pede, e ele volta cortado, com legenda, apoio e marca.', 'forte')}
    </div>
  </div>
</section>

<!-- 7 · o que levar -->
<section id="antes">
  <div class="ct">
    <div class="cab">
      <span class="olho rv">No dia do encontro</span>
      <h2 class="rv d1">Tu só traz <span class="grad">o notebook e o celular.</span></h2>
    </div>
    <div class="cards c4">
      ${card('notebook', 'Notebook', 'Com Windows ou Mac, e o carregador.')}
      ${card('celular', 'Celular', 'Pra gravar.', 'k2')}
      ${card('robo', 'O Claude no plano Pro', 'Na tua conta. A gente te manda o passo a passo antes.', 'k3')}
      ${card('estrela', 'O logo', 'Do teu negócio.', 'k4')}
    </div>
  </div>
</section>

<!-- 8 · quem conduz -->
<section class="f-cinza">
  <div class="ct quem">
    <figure class="foto-g rv"><img src="/imersao/midia/v2/guto.webp" alt="Guto Wickert na sede da escola" width="780" height="976" loading="lazy"><span class="selo bl"><i></i>Quem conduz</span></figure>
    <div>
      <span class="olho rv">Quem conduz</span>
      <h2 class="rv d1">Guto Wickert</h2>
      <p class="rv d1">Idealizador da <b>Carreira no Digital</b>, escola de inteligência artificial para negócios, com sedes em Lajeado e Porto Alegre, que <b>formou mais de 500 alunos no primeiro ano.</b></p>
      <p class="rv d2">Os vídeos desta página foram editados com a mesma IA que ele ensina no curso.</p>
      ${numerosGuto(false)}
    </div>
  </div>
</section>

<!-- 9 · turmas -->
<section class="f-lilas" id="turmas">
  <div class="ct">
    <div class="cab">
      <span class="olho rv">Turmas</span>
      <h2 class="rv d1">Escolhe a cidade. <span class="grad">As turmas são pequenas.</span></h2>
    </div>
    <div class="preco rv" style="margin-top:0">
      <div>
        <span class="tag">Um encontro · completo</span>
        <div class="valor">R$ 497<small>no Pix, ou parcelado no cartão</small></div>
      </div>
      <div class="info">
        <p>${I.okc}<span><b>Edição de vídeo com IA, completa:</b> roteiro, gravação, o teu estilo e a edição, num encontro presencial em turma pequena.</span></p>
        <p>${I.robo}<span>A assinatura do Claude Pro é tua e fica fora do valor.</span></p>
      </div>
    </div>
    <div class="turmas" style="margin-top:20px">
      <div class="turma rv">
        <span class="tag">${I.pino}Porto Alegre</span>
        <h3>Na sede de Porto Alegre</h3>
        <ul><li>${I.cal}<span><b>Próxima turma:</b> chama no WhatsApp que a gente te passa a data</span></li></ul>
        <a class="btn" href="#" data-cta data-msg="Olá! Vim pela página do curso de edição de vídeo com IA e quero uma vaga em Porto Alegre.">${WA}Quero em Porto Alegre</a>
      </div>
      <div class="turma rv d1">
        <span class="tag">${I.pino}Lajeado</span>
        <h3>Na sede de Lajeado</h3>
        <ul><li>${I.cal}<span><b>Próxima turma:</b> chama no WhatsApp que a gente te passa a data</span></li></ul>
        <a class="btn" href="#" data-cta data-msg="Olá! Vim pela página do curso de edição de vídeo com IA e quero uma vaga em Lajeado.">${WA}Quero em Lajeado</a>
      </div>
    </div>
  </div>
</section>

<!-- 10 · fim -->
<section class="fim">
  <div class="ct">
    <img class="rosto rv" src="/imersao/midia/v2/guto.webp" alt="Guto Wickert" width="150" height="150" loading="lazy">
    <h2 class="rv">O vídeo que tu sempre deixa pra depois, <span class="grad">pronto ainda hoje.</span></h2>
    <p class="lead rv d1">Chama no WhatsApp, tira as tuas dúvidas e garante a tua vaga na próxima turma.</p>
    <div class="acao rv d2">
      <a class="btn" href="#" data-cta data-msg="Olá! Vim pela página do curso de edição de vídeo com IA e quero saber mais.">${WA}Falar com a escola no WhatsApp</a>
      <span class="calma">Um encontro presencial · Turma pequena</span>
    </div>
  </div>
</section>

</main>

<footer>Carreira no Digital · Edição de vídeo com IA · curso presencial em Lajeado e Porto Alegre</footer>
<div class="fixo"><a class="btn" href="#turmas">${WA}Quero a minha vaga</a></div>
`
  pagina('video-com-ia.html', corpo, 'video-com-ia-v2.html')
}

for (const c of Object.values(CIDADES)) imersao(c)
deuVenda()
videoComIa()
