// Páginas visuais da Maia por nicho: OFICINA e ÓTICA (24/11/2026, venda online fora do RS, sem amostra grátis).
// Começou como gera-oficina.mjs (18/11, página aprovada pelo Guto) e virou um gerador só pros dois nichos.
// Fotos reais (licenças em public/maia/nichos/img/<pasta>/FOTOS-LICENCA.md), nada gerado por IA.
// O texto de cada nicho vem de nichos.mjs; aqui ficam as fotos, as cores e os anúncios de exemplo.
// node scripts/maia-nichos/gera-visual.mjs            -> gera as duas
// node scripts/maia-nichos/gera-visual.mjs otica      -> só uma
// saída: public/maia/nichos/<slug>/index.html (+ prévia sem rastreio, se MAIA_PREVIA apontar pra uma pasta)
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { NICHOS } from './nichos.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const PREVIA = process.env.MAIA_PREVIA || ''   // pasta da prévia (scratchpad), opcional
const WA = '5551995054548'                    // WhatsApp da escola

// ===== PRA ONDE O BOTÃO LEVA (um lugar só) =====
// Hoje: WhatsApp da escola com a mensagem pronta do nicho (n.msg). O rastreio troca o link pelo /wa do CRM,
// que registra o clique e abre o mesmo WhatsApp.
// Quando o quiz de diagnóstico existir: tipo 'link' e url com o endereço do quiz de cada nicho, por exemplo
//   const DESTINO = { tipo: 'link', url: n => `/maia/quiz/${n.slug}/` }
// (com tipo 'link' o rastreio deixa o endereço como está e só conta o clique).
const DESTINO = { tipo: 'whatsapp', url: n => `https://wa.me/${WA}?text=${encodeURIComponent(n.msg)}` }

// ===== o visual de cada nicho =====
const VISUAL = {
  oficinas: {
    pasta: 'oficina',
    cor: { ac: '#d9480f', ac2: '#e8590c', acBg: '#fff1e7', acLn: '#ffc8a1', claro: '#ff8a3d', rgb: '217,72,15' },
    fotos: {
      hero: ['hero-embaixo-do-carro.jpg', 1800, 1200],
      noite: ['mao-graxa-noite.jpg', 960, 720],
      retifica: ['motor-retifica.jpg', 960, 540],
      ampla: ['oficina-ampla.jpg', 960, 484],
      escap: ['mecanico-escapamento.jpg', 960, 540],
      scanner: ['diagnostico-scanner.jpg', 960, 1440],
      oleo: ['troca-de-oleo.jpg', 960, 640],
      pneu: ['pneu-revisao.jpg', 960, 640],
      chave: ['chave-no-motor.jpg', 960, 640],
      motor: ['motor-aberto.jpg', 960, 540],
      maos: ['maos-no-motor.jpg', 960, 640],
      elev: ['elevador-oficina.jpg', 960, 640],
    },
    heroAlt: 'Mecânico deitado embaixo de um carro erguido no cavalete, com o amortecedor no chão',
    heroPos: ['55% 50%', '50% 50%'],
    dores: [['noite', 'Mão com graxa segurando a chave no motor, à noite'], ['retifica', 'Motor com correias e polias à mostra'], ['ampla', 'Oficina ampla com elevadores e carros'], ['escap', 'Mecânico agachado trabalhando no escapamento de um carro']],
    jeito: [['scanner', 'Notebook ligado ao carro fazendo o diagnóstico'], ['oleo', 'Troca de óleo com o capô aberto'], ['elev', 'Carro no elevador da oficina'], ['pneu', 'Mecânico de luva segurando o pneu']],
    conta: 'suaoficina', marca: 'Sua oficina',
    posts: [
      { f: 'motor', olho: 'Câmbio automático', gancho: 'Dando tranco na troca de marcha?', sub: 'Diagnóstico com scanner e teste de rodagem.', legenda: 'Tranco da 2ª pra 3ª, demora pra engatar, luz acesa? Antes de trocar peça, a gente descobre o que é. Chama no WhatsApp e manda o modelo e o ano.', cta: 'Enviar mensagem' },
      { f: 'pneu', olho: 'Férias chegando', gancho: 'Vai pegar a estrada com a família?', sub: 'Revisão antes da viagem: freio, suspensão, óleo e arrefecimento.', legenda: 'Viagem tranquila começa na oficina. Revisão com checklist no seu WhatsApp, antes de você sair. Chama pra marcar.', cta: 'Marcar revisão' },
      { f: 'scanner', olho: 'Luz no painel', gancho: 'Acendeu a luz da injeção?', sub: 'Leitura com scanner e explicação clara do que é.', legenda: 'Luz acesa não é pra ficar rodando. Manda uma foto do painel no WhatsApp e a gente te diz o próximo passo.', cta: 'Enviar mensagem' },
    ],
    // anúncio real feito pela Maia (com a foto do próprio cliente), no fim do feed
    real: { img: 'guincho-anuncio-1.jpg', sigla: 'RP', conta: 'rodapresaguinchos', alt: 'Anúncio da Roda Presa Guinchos: caminhão parado na estrada?', leg: 'Anúncio que a Maia fez pra um guincho de caminhão, com a foto do próprio cliente.' },
    notaAnuncios: 'Os 3 primeiros são exemplos com fotos de banco. Na sua conta, eles saem com as fotos da sua oficina, a sua logo e as suas cores. Os anúncios só aparecem no Facebook e no Instagram, pra quem está na sua cidade e na sua região. Preço não vai no anúncio: aparece na conversa, depois do valor.',
    servicos: [
      ['maos', 'Câmbio automático', 'Tranco, demora pra engatar, troca de óleo do câmbio'],
      ['retifica', 'Retífica de motor', 'Motor fumaçando, perdendo água ou batendo'],
      ['scanner', 'Diagnóstico com scanner', 'Luz no painel e falha que ninguém achou'],
      ['oleo', 'Revisão e troca de óleo', 'Com recado pra base na hora certa'],
      ['chave', 'Freio e suspensão', 'Barulho ao frear, carro puxando, batida seca'],
      ['pneu', 'Pneus e alinhamento', 'Antes da viagem e no dia a dia'],
    ],
    faixa: ['chave', 'Mão com chave de catraca apertando um parafuso no motor'],
    sabeFoto: ['motor', 'Mecânico debruçado sobre o motor, com o capô aberto'],
    como: ['scanner', 'Mecânico com o notebook ligado ao carro fazendo diagnóstico'],
    oferta: 'ampla', final: 'elev',
  },
  otica: {
    pasta: 'otica',
    cor: { ac: '#0e7490', ac2: '#0891b2', acBg: '#e7f6f9', acLn: '#a5dce7', claro: '#5fd4e8', rgb: '14,116,144' },
    fotos: {
      hero: ['hero-vendedora-balcao.jpg', 1800, 1137],
      escolhendo: ['cliente-escolhendo.jpg', 960, 640],
      vitrine: ['vitrine-armacoes.jpg', 960, 540],
      haste: ['conserto-haste.jpg', 960, 641],
      menina: ['menina-na-otica.jpg', 960, 640],
      medindo: ['medindo-lente.jpg', 960, 1438],
      provando: ['provando-oculos.jpg', 960, 641],
      parede: ['parede-armacoes.jpg', 960, 640],
      maeFilha: ['mae-e-filha.jpg', 960, 640],
      sol: ['oculos-de-sol.jpg', 960, 1440],
      rosa: ['menina-oculos-rosa.jpg', 960, 683],
      comparando: ['comparando-armacoes.jpg', 960, 1440],
      barraca: ['barraca-oculos-de-sol.jpg', 960, 640],
      parafuso: ['parafuso-oculos.jpg', 960, 1438],
      clienteParede: ['cliente-na-parede.jpg', 960, 640],
      limpeza: ['limpeza-ultrassom.jpg', 960, 1440],
    },
    heroAlt: 'Atendente sorrindo no balcão de uma ótica, com a parede de armações atrás',
    heroPos: ['50% 40%', '62% 40%'],
    dores: [['escolhendo', 'Cliente escolhendo armação na parede da ótica'], ['vitrine', 'Prateleiras iluminadas cheias de armações'], ['haste', 'Mãos apertando o parafuso da haste de um óculos'], ['menina', 'Menina segurando um óculos na frente da parede de armações']],
    jeito: [['medindo', 'Óculos sobre a régua de medir lente'], ['provando', 'Cliente provando um óculos de grau na loja'], ['parede', 'Parede com armações coloridas'], ['maeFilha', 'Mãe e filha escolhendo armação juntas']],
    conta: 'suaotica', marca: 'Sua ótica',
    posts: [
      { f: 'sol', olho: 'Verão', gancho: 'Óculos de sol com o seu grau?', sub: 'Dá pra fazer: lente no grau da sua receita e proteção UV.', legenda: 'Quem usa óculos de grau não precisa escolher entre enxergar bem e proteger os olhos do sol. Manda a foto da sua receita no WhatsApp e a gente te mostra as opções.', cta: 'Enviar mensagem' },
      { f: 'rosa', olho: 'Volta às aulas', gancho: 'Lista de material pronta. E o óculos?', sub: 'Armações resistentes pra criança, com a lente no grau da receita.', legenda: 'Óculos de criança tem que aguentar o recreio. Traz a receita do oftalmologista e escolham juntos a armação. Chama no WhatsApp pra ver os modelos.', cta: 'Ver modelos' },
      { f: 'comparando', olho: 'Multifocal', gancho: 'Cansou de tirar o óculos pra ler?', sub: 'Longe e perto na mesma lente, com as medidas tiradas no seu rosto.', legenda: 'Multifocal bem feito começa na medida certa. Manda a foto da receita e a gente te explica as opções de lente antes de falar de preço.', cta: 'Enviar mensagem' },
      { f: 'parafuso', olho: 'Conserto e ajuste', gancho: 'Óculos torto ou com a haste solta?', sub: 'Ajuste, plaqueta e parafuso, com a sua armação de volta no rosto.', legenda: 'Óculos frouxo cansa e escorrega. Manda uma foto dele no WhatsApp e a gente te diz se resolve na hora.', cta: 'Enviar mensagem' },
    ],
    real: null,
    notaAnuncios: 'São exemplos com fotos de banco. Na sua conta, eles saem com as fotos da sua loja, a sua logo e as suas cores. Os anúncios só aparecem no Facebook e no Instagram, pra quem está na sua cidade e na sua região. Preço não vai no anúncio: aparece na conversa, depois do valor.',
    servicos: [
      ['clienteParede', 'Óculos de grau', 'Armação e lente no grau da receita'],
      ['provando', 'Multifocal', 'Longe e perto na mesma lente'],
      ['barraca', 'Óculos de sol', 'Com e sem grau, pro verão e pro dia a dia'],
      ['rosa', 'Infantil', 'Armação resistente pra volta às aulas'],
      ['parafuso', 'Conserto e ajuste', 'Haste, plaqueta, parafuso, óculos torto'],
      ['limpeza', 'Limpeza e revisão', 'O motivo pro cliente voltar à loja'],
    ],
    faixa: ['clienteParede', 'Cliente escolhendo armação na parede da ótica'],
    sabeFoto: ['comparando', 'Cliente comparando duas armações na ótica'],
    como: ['limpeza', 'Óculos sendo limpo na bancada da ótica'],
    oferta: 'parede', final: 'vitrine',
  },
}
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const ic = {
  zap: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z"/></svg>',
  ok: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  seta: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  foto: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="m21 17-5-5-8 8"/></svg>',
  tk: '<svg class="tk" viewBox="0 0 18 12" aria-hidden="true"><path d="M1 6.5 4.5 10 11 2M7 10l.5.5L15 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19.5 12.6 12 20l-7.5-7.4A4.9 4.9 0 0 1 12 6.1a4.9 4.9 0 0 1 7.5 6.5z"/></svg>',
  com: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 11.5a8.4 8.4 0 0 1-12.4 7.4L3.5 20.5l1.6-4.6A8.4 8.4 0 1 1 20.5 11.5z"/></svg>',
  env: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>',
  sal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21 12 16l-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
  pts: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>',
}

const CSS = `
/* Maia por nicho (oficina 18/11, ótica 24/11/2026). Base clara do padrão da escola (Manrope + Bricolage condensada),
   grafite + a cor de destaque do nicho (--ac, --claro, --ac-rgb, trocadas por nicho). Fotos reais. Feita primeiro pro celular. */
:root{
  --bg:#f6f5f2;--s1:#ffffff;--s2:#efede8;--ln:#e6e2da;--ln2:#d4cec3;
  --tx:#1d1f23;--tx2:#3b3e44;--mu:#686b72;--fa:#9a9da3;
  --ac:#d9480f;--claro:#ff8a3d;--ac-rgb:217,72,15;--ac2:#e8590c;--ac-bg:#fff1e7;--ac-ln:#ffc8a1;
  --gr:#22252a;--gr2:#2f3339;
  --roxo:#7c3aed;--ok:#15803d;--ok-bg:#e3f7ea;--at:#b45309;--at-bg:#fdf0d5;
  --wa:#efe7dd;--wa-in:#ffffff;--wa-out:#d9fdd3;--wa-top:#f0f2f5;--wa-tx:#111b21;--wa-mu:#667781;--wa-tk:#53bdeb;
  --f-dis:'Bricolage Grotesque','Manrope',system-ui,sans-serif;
  --f-tx:'Manrope',system-ui,-apple-system,'Segoe UI',sans-serif;
  --sombra:0 1px 2px rgba(29,31,35,.05),0 14px 34px -14px rgba(29,31,35,.22);
  color-scheme:light}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{background:var(--bg);color:var(--tx);font-family:var(--f-tx);font-size:17px;line-height:1.55;-webkit-font-smoothing:antialiased;overflow-x:hidden}
img{display:block;max-width:100%;height:auto}
a{color:inherit}
h1,h2,h3,.dis{font-family:var(--f-dis);font-weight:800;font-variation-settings:'opsz' 96,'wdth' 85;letter-spacing:-.025em;line-height:1.04;text-wrap:balance}
h2{font-size:clamp(30px,7.2vw,48px)}
h3{font-size:21px;letter-spacing:-.015em;line-height:1.15}
.ct{max-width:1160px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
section{padding-block:64px}
.olho{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--ac)}
.olho::before{content:"";width:18px;height:3px;border-radius:2px;background:var(--ac2)}
.lead{font-size:clamp(17px,2.2vw,19px);color:var(--mu);max-width:62ch}
.lead b{color:var(--tx)}
.cab{display:flex;flex-direction:column;gap:12px;margin-bottom:30px}
.ico{width:22px;height:22px;flex:none}
.nota{font-size:13.5px;color:var(--mu);margin-top:16px}
.ex{font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--fa);text-align:center;margin-top:12px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:56px;padding:0 24px;border-radius:999px;background:var(--ac);color:#fff;font-weight:800;font-size:17px;text-decoration:none;border:0;cursor:pointer;box-shadow:0 14px 30px -12px rgba(var(--ac-rgb),.6);transition:transform .15s,filter .15s;text-align:center;line-height:1.2}
.btn:hover{transform:translateY(-1px);filter:brightness(1.06)}
.btn:focus-visible,a:focus-visible,summary:focus-visible{outline:3px solid var(--ac2);outline-offset:3px}
.btn-sec{background:rgba(255,255,255,.14);color:#fff;border:1.5px solid rgba(255,255,255,.55);box-shadow:none;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.btn-sec:hover{filter:none;background:rgba(255,255,255,.22)}

/* topo */
body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:41;background:var(--bg)}
.topo{position:sticky;top:env(safe-area-inset-top,0px);z-index:40;background:rgba(246,245,242,.92);backdrop-filter:saturate(1.4) blur(14px);-webkit-backdrop-filter:saturate(1.4) blur(14px);border-bottom:1px solid var(--ln)}
.topo .ct{display:flex;align-items:center;gap:12px;min-height:60px}
.chapa{display:inline-flex;align-items:center;background:#17122a;border-radius:10px;padding:7px 10px;flex:none}
.chapa img{height:22px;width:auto}
.topo .nome{flex:1;min-width:0;font-size:14px;font-weight:600;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.topo .nome b{color:var(--tx);font-weight:800}
.topo .btn{min-height:40px;padding:0 16px;font-size:14.5px;box-shadow:none}

/* abertura: foto em tela cheia */
.hero{position:relative;overflow:hidden;color:#fff;background:var(--gr);padding-block:0}
.hero>img{display:block;width:100%;aspect-ratio:1/1;object-fit:cover;object-position:var(--hero-pos,55% 50%)}
.hero::after{content:"";position:absolute;left:0;right:0;top:0;aspect-ratio:1/1;background:linear-gradient(180deg,rgba(34,37,42,0) 55%,rgba(34,37,42,.7) 82%,var(--gr) 100%)}
.hero .ct{position:relative;z-index:1;display:grid;gap:32px;margin-top:-72px;padding-block:0 44px}
.selo{display:inline-flex;align-items:center;gap:10px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.3);border-radius:999px;padding:6px 14px 6px 6px;font-size:14px;font-weight:700;color:#fff;max-width:100%;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.selo i{font-style:normal;background:var(--roxo);color:#fff;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;flex:none}
.selo span{min-width:0}
.hero h1{font-size:clamp(40px,10.2vw,70px);margin-top:18px;text-shadow:0 2px 24px rgba(0,0,0,.35)}
.hero h1 em{font-style:normal;color:var(--claro)}
.hero .lead{margin-top:18px;color:rgba(255,255,255,.86)}
.hero .lead b{color:#fff}
.acoes{display:flex;flex-wrap:wrap;gap:12px;margin-top:26px}
.acoes .btn{flex:1 1 230px}
.fatos{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:24px}
.fatos div{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.22);border-radius:14px;padding:12px 10px;text-align:center;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.fatos b{display:block;font-family:var(--f-dis);font-variation-settings:'opsz' 96,'wdth' 85;font-size:28px;line-height:1;color:var(--claro)}
.fatos span{display:block;font-size:12.5px;line-height:1.3;color:rgba(255,255,255,.82);font-weight:600;margin-top:6px}
.hero .cel-hero{display:none}
.credito{position:absolute;right:max(16px,env(safe-area-inset-right,0px));bottom:10px;z-index:1;font-size:11px;color:rgba(255,255,255,.55)}

/* celular com WhatsApp */
.cel{max-width:390px;width:100%;margin:0 auto;background:#141518;border-radius:40px;padding:10px;box-shadow:0 40px 70px -30px rgba(0,0,0,.6)}
.tela{background:var(--wa);border-radius:31px;overflow:hidden;display:flex;flex-direction:column}
.wa-top{display:flex;align-items:center;gap:10px;background:var(--wa-top);padding:12px 14px;border-bottom:1px solid #e3e3e3}
.wa-top .av{width:36px;height:36px;border-radius:50%;background:var(--gr);color:var(--claro);display:grid;place-items:center;font-weight:800;font-size:13px;flex:none;overflow:hidden}
.wa-top .av img{width:36px;height:36px;object-fit:cover}
.wa-top b{display:block;font-size:15px;color:var(--wa-tx);line-height:1.2}
.wa-top small{display:block;font-size:12px;color:var(--wa-mu)}
.wa-msgs{padding:14px 10px 16px;display:flex;flex-direction:column;gap:6px;background-color:var(--wa);background-image:radial-gradient(rgba(0,0,0,.035) 1px,transparent 1px);background-size:14px 14px}
.bal{max-width:84%;padding:7px 10px 6px;border-radius:10px;font-size:14.5px;line-height:1.4;color:var(--wa-tx);box-shadow:0 1px 1px rgba(0,0,0,.08)}
.bal .h{display:flex;justify-content:flex-end;align-items:center;gap:3px;font-size:11px;color:var(--wa-mu);margin-top:2px}
.bal .tk{width:16px;height:11px;color:var(--wa-tk)}
.bal.c{align-self:flex-start;background:var(--wa-in);border-top-left-radius:3px}
.bal.e{align-self:flex-end;background:var(--wa-out);border-top-right-radius:3px}

/* dores */
.dores{background:var(--s1);border-bottom:1px solid var(--ln)}
.dor-lista{display:grid;gap:14px}
.dor{border:1px solid var(--ln);border-radius:20px;overflow:hidden;background:var(--bg);display:flex;flex-direction:column;box-shadow:var(--sombra)}
.dor>img{width:100%;aspect-ratio:16/10;object-fit:cover}
.dor p.q{padding:16px 18px 12px;font-family:var(--f-dis);font-variation-settings:'opsz' 96,'wdth' 88;font-weight:700;font-size:19.5px;line-height:1.22;letter-spacing:-.01em;color:var(--tx)}
.dor p.q::before{content:"\\201C";color:var(--ac2);margin-right:2px}
.dor p.q::after{content:"\\201D";color:var(--ac2)}
.dor .r{flex:1;display:flex;gap:12px;align-items:flex-start;padding:12px 18px 18px;background:var(--s1);border-top:1px dashed var(--ln2);font-size:15.5px;color:var(--tx2)}
.dor .r .ico{color:var(--ac);margin-top:2px}

/* como atende */
.jeito{display:grid;gap:12px}
.j{background:var(--s1);border:1px solid var(--ln);border-radius:20px;overflow:hidden;box-shadow:var(--sombra);display:flex;flex-direction:column}
.j>img{width:100%;aspect-ratio:16/9;object-fit:cover}
.j .tx{padding:16px 18px 20px;position:relative}
.j .n{position:absolute;top:-22px;left:18px;display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:var(--ac);color:#fff;font-family:var(--f-dis);font-variation-settings:'opsz' 96,'wdth' 85;font-weight:800;font-size:18px;box-shadow:0 8px 18px -8px rgba(var(--ac-rgb),.7)}
.j h3{margin-top:14px}
.j p{font-size:15.5px;color:var(--tx2);margin-top:8px}
.conv{display:grid;gap:22px;margin-top:44px;align-items:start}
.lado{display:grid;gap:14px;min-width:0}
.resumo{background:var(--s1);border:1px solid var(--ac-ln);border-radius:20px;padding:20px;box-shadow:var(--sombra)}
.resumo h3{margin-top:6px}
.resumo dl{display:grid;gap:8px;margin-top:14px}
.resumo dl div{display:flex;gap:10px;align-items:flex-start;font-size:15px;color:var(--tx2)}
.resumo dl .ico{width:18px;height:18px;color:var(--ok);margin-top:3px}
.resumo p{font-size:14px;color:var(--mu);margin-top:12px}
.ret{background:var(--s1);border:1px solid var(--ln);border-radius:20px;padding:20px}
.ret h3{margin-top:6px}
.ret ol{list-style:none;display:grid;gap:12px;margin-top:14px}
.ret li{display:grid;gap:4px}
.ret li b{font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--ac)}
.ret li span{background:var(--wa-out);border-radius:12px 12px 4px 12px;padding:10px 12px;font-size:14.5px;color:var(--wa-tx)}

/* anúncios: posts do feed do Instagram */
.anuncios{background:var(--gr);color:#fff}
.anuncios .olho{color:var(--claro)}.anuncios .olho::before{background:var(--claro)}
.anuncios .lead{color:rgba(255,255,255,.75)}
.anuncios .nota{color:rgba(255,255,255,.6)}
.feed{display:grid;grid-auto-flow:column;grid-auto-columns:min(84%,340px);gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:10px;margin-inline:calc(-1 * max(16px,env(safe-area-inset-left,0px)));padding-inline:max(16px,env(safe-area-inset-left,0px));scrollbar-width:thin}
.post{scroll-snap-align:start;background:#fff;color:#111;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;min-width:0}
.post-top{display:flex;align-items:center;gap:9px;padding:10px 12px}
.post-top .av{width:32px;height:32px;border-radius:50%;padding:2px;background:linear-gradient(45deg,#f9a03f,#e8590c,#c2255c);flex:none}
.post-top .av span{display:grid;place-items:center;width:100%;height:100%;border-radius:50%;background:var(--gr);border:2px solid #fff;color:var(--claro);font-size:10.5px;font-weight:800}
.post-top div{flex:1;min-width:0}
.post-top b{display:block;font-size:13.5px;line-height:1.2}
.post-top small{display:block;font-size:11.5px;color:#737373}
.post-top svg{width:18px;height:18px;color:#262626;flex:none}
.arte{position:relative;aspect-ratio:4/5;overflow:hidden;background:#222}
.arte img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.arte::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.05) 25%,rgba(0,0,0,.82) 78%)}
.arte .tx{position:absolute;left:16px;right:16px;bottom:16px;z-index:1;color:#fff;display:flex;flex-direction:column;gap:8px}
.arte .mo{align-self:flex-start;background:var(--claro);color:#1d1f23;font-size:11.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;padding:4px 9px;border-radius:5px}
.arte .mg{font-family:var(--f-dis);font-variation-settings:'opsz' 96,'wdth' 82;font-weight:800;font-size:29px;line-height:1;text-transform:uppercase;letter-spacing:0}
.arte .ms{font-size:14px;font-weight:600;line-height:1.35;color:rgba(255,255,255,.9)}
.arte .marca{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.75)}
.arte .tag{position:absolute;top:12px;right:12px;z-index:2;background:rgba(255,255,255,.92);color:var(--ac);font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:3px 8px;border-radius:999px}
.arte .tag.real{color:var(--ok)}
.post-cta{display:flex;justify-content:space-between;align-items:center;padding:11px 12px;font-size:13.5px;font-weight:700;border-bottom:1px solid #efefef;color:#0f4c81}
.post-cta svg{width:16px;height:16px}
.post-acoes{display:flex;gap:14px;padding:10px 12px 4px;color:#262626}
.post-acoes svg{width:24px;height:24px}
.post-acoes .fim{margin-left:auto}
.post-leg{padding:4px 12px 14px;font-size:13.5px;line-height:1.4;color:#262626}
.post-leg b{font-weight:700;margin-right:4px}

/* serviços que a Maia divulga */
.galeria{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.srv{position:relative;border-radius:18px;overflow:hidden;aspect-ratio:4/5;background:var(--gr)}
.srv img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.srv::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 35%,rgba(20,21,24,.88) 100%)}
.srv div{position:absolute;left:12px;right:12px;bottom:12px;z-index:1;color:#fff}
.srv b{display:block;font-family:var(--f-dis);font-variation-settings:'opsz' 96,'wdth' 85;font-weight:800;font-size:20px;line-height:1.05}
.srv span{display:block;font-size:12.5px;line-height:1.3;color:rgba(255,255,255,.82);margin-top:4px}

/* faixa com foto */
.faixa-foto{position:relative;overflow:hidden;color:#fff;background:var(--gr);padding-block:0}
.faixa-foto img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 40%}
.faixa-foto::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(22,23,26,.92) 0%,rgba(22,23,26,.72) 55%,rgba(22,23,26,.35) 100%)}
.faixa-foto .ct{position:relative;z-index:1;padding-block:72px}
.faixa-foto h2{max-width:16ch}
.faixa-foto p{margin-top:14px;font-size:18px;color:rgba(255,255,255,.85);max-width:46ch}
.faixa-foto .olho{color:var(--claro)}.faixa-foto .olho::before{background:var(--claro)}

/* o mês */
.mes{display:grid;gap:12px}
.it{display:flex;gap:14px;align-items:flex-start;background:var(--s1);border:1px solid var(--ln);border-radius:18px;padding:18px}
.it .n{flex:none;width:40px;height:40px;border-radius:12px;background:var(--ac-bg);color:var(--ac);display:grid;place-items:center;font-family:var(--f-dis);font-variation-settings:'opsz' 96,'wdth' 85;font-weight:800;font-size:16px}
.it h3{font-size:18.5px}
.it p{font-size:15px;color:var(--mu);margin-top:4px}
.dono{display:grid;gap:18px;margin-top:28px;background:var(--s1);border:1px solid var(--ln);border-radius:24px;padding:20px;box-shadow:var(--sombra)}
.dono .tx p{font-size:16px;color:var(--tx2);margin-top:10px}
.dono .tx h3{font-size:26px;margin-top:8px}
.mini{background:var(--wa);border-radius:18px;overflow:hidden;border:1px solid var(--ln)}

/* prova */
.prova{display:grid;gap:18px;background:var(--s1);border:1px solid var(--ln);border-radius:24px;padding:22px 20px;box-shadow:var(--sombra)}
.prova h3{font-size:26px;margin-top:8px}
.prova p{font-size:16px;color:var(--tx2);margin-top:8px}
.nums{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.nums div{background:var(--bg);border-radius:14px;padding:14px 12px}
.nums b{display:block;font-family:var(--f-dis);font-variation-settings:'opsz' 96,'wdth' 85;font-size:32px;line-height:1;color:var(--ac);font-variant-numeric:tabular-nums}
.nums span{display:block;font-size:13px;color:var(--mu);margin-top:6px;line-height:1.3}

/* o que a Maia já sabe sobre o nicho */
.sabe{background:linear-gradient(180deg,var(--ac-bg),var(--bg) 340px)}
.sabe-topo{display:grid;gap:22px;align-items:end}
.sabe-foto{border-radius:22px;overflow:hidden;box-shadow:var(--sombra)}
.sabe-foto img{width:100%;aspect-ratio:16/10;object-fit:cover}
.subs{display:grid;gap:10px;margin-top:30px}
.sub{background:var(--s1);border:1px solid var(--ln);border-left:4px solid var(--ac2);border-radius:16px;padding:16px 18px;min-width:0}
.sub b{display:block;font-family:var(--f-dis);font-variation-settings:'opsz' 96,'wdth' 85;font-weight:800;font-size:20px;line-height:1.1}
.sub .s{display:block;font-size:14px;color:var(--mu);margin-top:4px}
.sub p{font-size:15px;color:var(--tx2);margin-top:10px}
.sub p i{font-style:normal;font-weight:800;color:var(--ac)}
.bloco{margin-top:44px}
.bloco>h3{font-size:clamp(23px,4.6vw,28px)}
.bloco>p.lead{margin-top:8px;font-size:16.5px}
.duas{display:grid;gap:14px;margin-top:18px}
.cx{background:var(--s1);border:1px solid var(--ln);border-radius:20px;padding:20px;box-shadow:var(--sombra);min-width:0}
.cx h4{font-size:12.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--ac);margin-bottom:12px}
.pergs{list-style:none;display:grid;gap:8px;counter-reset:p}
.pergs li{counter-increment:p;display:flex;gap:10px;align-items:flex-start;background:var(--wa-out);border-radius:12px 12px 4px 12px;padding:9px 12px;font-size:15px;color:var(--wa-tx)}
.pergs li::before{content:counter(p);flex:none;width:22px;height:22px;border-radius:50%;background:#fff;color:var(--ok);font-size:12px;font-weight:800;display:grid;place-items:center;margin-top:1px}
.lst{list-style:none;display:grid;gap:8px}
.lst li{display:flex;gap:10px;align-items:flex-start;font-size:15px;color:var(--tx2)}
.lst li .ico{width:18px;height:18px;margin-top:3px}
.lst.ok li .ico{color:var(--ok)}
.lst.av li .ico{color:var(--at)}
.cx .sep{border-top:1px dashed var(--ln2);margin:16px 0}
.cx .tag-ok,.cx .tag-av{display:inline-block;font-size:12.5px;font-weight:800;border-radius:999px;padding:4px 10px;margin-bottom:10px}
.cx .tag-ok{background:var(--ok-bg);color:var(--ok)}
.cx .tag-av{background:var(--at-bg);color:var(--at)}
.objs{display:grid;gap:10px;margin-top:18px}
.obj{background:var(--s1);border:1px solid var(--ln);border-radius:18px;padding:16px 18px;display:grid;gap:10px;min-width:0}
.obj .q{justify-self:start;background:#fff;border:1px solid var(--ln);border-radius:4px 12px 12px 12px;padding:8px 12px;font-size:15px;font-weight:700;color:var(--wa-tx);box-shadow:0 1px 1px rgba(0,0,0,.06)}
.obj .r{display:flex;gap:10px;align-items:flex-start;font-size:15px;color:var(--tx2)}
.obj .r .ico{width:18px;height:18px;color:var(--ac);margin-top:3px}
.recado{display:grid;gap:18px;margin-top:18px;background:var(--s1);border:1px solid var(--ac-ln);border-radius:24px;padding:20px;box-shadow:var(--sombra)}
.recado h3{font-size:24px;margin-top:6px}
.recado .tx p{font-size:15.5px;color:var(--tx2);margin-top:8px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px}
.chips span{background:var(--ac-bg);color:var(--ac);border:1px solid var(--ac-ln);border-radius:999px;padding:5px 11px;font-size:13px;font-weight:700}
.recado .regra{font-size:13.5px;color:var(--mu);margin-top:14px}
.recado .mini .bal{max-width:92%}
.botoes{display:flex;gap:6px;margin-top:6px;align-self:flex-end;max-width:92%;width:100%}
.botoes span{flex:1;text-align:center;background:#fff;border-radius:8px;padding:7px 6px;font-size:13px;font-weight:700;color:#027eb5;box-shadow:0 1px 1px rgba(0,0,0,.08)}
.cal{display:grid;grid-template-columns:1fr;gap:10px;margin-top:18px}
.cal div{background:var(--s1);border:1px solid var(--ln);border-top:4px solid var(--ac2);border-radius:16px;padding:14px 16px;min-width:0}
.cal small{display:block;font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--ac)}
.cal b{display:block;font-family:var(--f-dis);font-variation-settings:'opsz' 96,'wdth' 85;font-size:19px;line-height:1.1;color:var(--tx);margin-top:4px}
.cal span{display:block;font-size:14.5px;color:var(--tx2);margin-top:8px;line-height:1.35;font-weight:700}
.cal span::before{content:"Gancho: ";font-weight:600;color:var(--mu)}
.bal.foto{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.bal.foto .anexo{display:flex;align-items:center;gap:8px;background:rgba(0,0,0,.05);border-radius:8px;padding:10px 12px;font-weight:700;color:var(--wa-tx)}
.bal.foto .anexo .ico{width:20px;height:20px;color:var(--wa-mu)}
.bal.foto .h{width:100%}

/* como começa */
.linha{list-style:none;display:grid;gap:0}
.passo{display:grid;grid-template-columns:44px 1fr;gap:16px;position:relative;padding-bottom:24px}
.passo::before{content:"";position:absolute;left:21px;top:44px;bottom:0;width:2px;background:var(--ln2)}
.passo:last-child::before{display:none}
.passo .bola{width:44px;height:44px;border-radius:50%;background:var(--ac);color:#fff;display:grid;place-items:center;font-family:var(--f-dis);font-variation-settings:'opsz' 96,'wdth' 85;font-weight:800;font-size:18px;position:relative;z-index:1}
.passo .tag{display:inline-block;font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--ac);margin-bottom:4px}
.passo p{font-size:15.5px;color:var(--mu);margin-top:6px}
.passo ul{list-style:none;display:grid;gap:6px;margin-top:10px}
.passo li{display:flex;gap:8px;font-size:15px;color:var(--tx2)}
.passo li .ico{width:18px;height:18px;color:var(--ok);margin-top:3px}
.passo .sai{display:inline-flex;gap:8px;align-items:center;margin-top:10px;background:var(--ok-bg);color:var(--ok);border-radius:999px;padding:5px 12px;font-size:13.5px;font-weight:700}
.passo .sai .ico{width:16px;height:16px}
.como-g{display:grid;gap:28px;align-items:start}
.como-foto{border-radius:22px;overflow:hidden;box-shadow:var(--sombra)}
.como-foto img{width:100%;aspect-ratio:4/5;object-fit:cover}

/* oferta */
.card-of{max-width:780px;margin:0 auto;background:var(--s1);border:1px solid var(--ln);border-radius:28px;box-shadow:0 40px 80px -40px rgba(29,31,35,.45);overflow:hidden}
.of-cab{position:relative;color:#fff;padding:26px 20px;background:var(--gr);overflow:hidden}
.of-cab img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.32}
.of-cab>*:not(img){position:relative}
.of-cab .olho{color:var(--claro)}.of-cab .olho::before{background:var(--claro)}
.of-cab h3{font-size:28px;margin-top:8px}
.of-corpo{padding:22px 20px 24px}
.inclui{list-style:none;display:grid;gap:10px}
.inclui li{display:flex;gap:10px;align-items:flex-start;font-size:15.5px;color:var(--tx2)}
.inclui li .ico{width:20px;height:20px;color:var(--ok);margin-top:2px}
.inclui li b{color:var(--tx)}
.precos{display:grid;gap:10px;margin-top:24px;border-top:1px dashed var(--ln2);padding-top:22px}
.pr{border:1px solid var(--ln);border-radius:18px;padding:16px 18px;background:var(--bg)}
.pr.um{border:2px solid var(--ac2);background:var(--s1)}
.pr small{display:block;font-size:12.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--ac)}
.pr .v{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;margin-top:4px}
.pr .v b{font-family:var(--f-dis);font-variation-settings:'opsz' 96,'wdth' 85;font-size:clamp(42px,11vw,60px);line-height:.95;letter-spacing:-.03em;white-space:nowrap}
.pr .v span{font-size:17px;font-weight:700;color:var(--tx2)}
.pr p{font-size:14.5px;color:var(--mu);margin-top:6px}
.fora{margin-top:16px;font-size:14px;color:var(--tx2);background:var(--at-bg);border-radius:14px;padding:12px 14px}
.fora b{color:var(--at)}
.of-corpo .btn{width:100%;margin-top:20px}

/* dúvidas */
.faq{max-width:780px;margin:0 auto;display:grid;gap:10px}
.faq details{background:var(--s1);border:1px solid var(--ln);border-radius:16px;padding:0 18px}
.faq summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;gap:14px;align-items:center;padding:18px 0;font-weight:800;font-size:16.5px;line-height:1.3}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"";flex:none;width:12px;height:12px;border-right:2.5px solid var(--ac);border-bottom:2.5px solid var(--ac);transform:rotate(45deg) translate(-3px,-3px);transition:transform .2s}
.faq details[open] summary::after{transform:rotate(225deg) translate(-3px,-3px)}
.faq details p{padding:0 0 18px;font-size:15.5px;color:var(--tx2)}

/* final */
.final{padding-block:16px 88px}
.final-card{position:relative;display:grid;gap:18px;border-radius:28px;overflow:hidden;color:#fff;background:var(--gr);text-align:center;justify-items:center;padding:40px 20px 34px}
.final-card>img.fundo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.4}
.final-card::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(22,23,26,.4),rgba(22,23,26,.85))}
.final-card>*:not(.fundo){position:relative;z-index:1}
.final-card .maia{width:84px;height:84px;border-radius:50%;object-fit:cover;border:3px solid #fff}
.final-card h2{font-size:clamp(30px,7vw,44px)}
.final-card .lead{margin-inline:auto;color:rgba(255,255,255,.85)}
.final-card .btn{width:100%;max-width:420px}
.rodape{border-top:1px solid var(--ln);padding-block:26px 120px;font-size:13.5px;color:var(--mu);text-align:center}

/* barra de baixo no celular */
.barra{position:fixed;left:0;right:0;bottom:0;z-index:50;background:rgba(255,255,255,.96);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid var(--ln);padding:10px max(16px,env(safe-area-inset-right,0px)) calc(10px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));display:flex;align-items:center;gap:12px;transform:translateY(110%);transition:transform .25s}
.barra.on{transform:none}
.barra .q{flex:1;min-width:0;line-height:1.2}
.barra .q b{display:block;font-size:15px;font-weight:800}
.barra .q span{display:block;font-size:12.5px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.barra .btn{min-height:46px;padding:0 18px;font-size:15px;flex:none}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}.btn,.barra{transition:none}}

@media (min-width:720px){
  section{padding-block:96px}
  .hero>img,.hero::after{aspect-ratio:16/10}
  .dor-lista,.jeito,.mes{grid-template-columns:repeat(2,1fr)}
  .galeria{grid-template-columns:repeat(3,1fr)}
  .srv{aspect-ratio:4/3}
  .cal{grid-template-columns:repeat(2,1fr)}
  .subs,.objs{grid-template-columns:repeat(2,1fr)}
  .duas{grid-template-columns:1fr 1fr}
  .recado{grid-template-columns:1.1fr .9fr;align-items:center;padding:28px}
  .sabe-topo{grid-template-columns:1.2fr .8fr;gap:40px}
  .prova{grid-template-columns:1fr 1fr;align-items:center;padding:30px}
  .dono{grid-template-columns:1fr 1fr;align-items:center;padding:28px}
  .precos{grid-template-columns:1fr 1fr}
  .of-cab{padding:30px 32px}.of-corpo{padding:30px 32px 32px}
  .final-card{padding:64px 40px 56px}
  .faixa-foto .ct{padding-block:110px}
  .barra{display:none}
  .rodape{padding-bottom:40px}
}
@media (min-width:980px){
  .hero>img{position:absolute;inset:0;height:100%;aspect-ratio:auto}
  .hero::after{aspect-ratio:auto;bottom:0;background:linear-gradient(90deg,rgba(22,23,26,.94) 0%,rgba(22,23,26,.78) 42%,rgba(22,23,26,.25) 75%,rgba(22,23,26,.15) 100%)}
  .hero>img{object-position:var(--hero-pos-g,50% 50%)}
  .hero .ct{grid-template-columns:1.15fr .85fr;gap:48px;align-items:center;margin-top:0;padding-block:96px 104px}
  .hero .cel-hero{display:block}
  .hero .cel{max-width:350px}
  .dor-lista{grid-template-columns:repeat(4,1fr)}
  .jeito{grid-template-columns:repeat(4,1fr)}
  .conv{grid-template-columns:400px 1fr;gap:40px}
  .lado{grid-template-columns:1fr 1fr;position:sticky;top:24px}
  .mes{grid-template-columns:repeat(4,1fr)}
  .feed{grid-auto-flow:row;grid-template-columns:repeat(4,1fr);grid-auto-columns:auto;overflow:visible;margin-inline:0;padding-inline:0}
  .como-g{grid-template-columns:1.2fr .8fr;gap:56px}
  .cal{grid-template-columns:repeat(4,1fr)}
  .subs{grid-template-columns:repeat(5,1fr)}
  .objs{grid-template-columns:repeat(3,1fr)}
}
@media (max-width:380px){.topo .nome{display:none}.fatos b{font-size:22px}}
`

function bal([q, t, h]) {
  if (q === 'f') return `<div class="bal c foto"><span class="anexo">${ic.foto}${esc(t)}</span><div class="h">${h}</div></div>`
  return `<div class="bal ${q}">${esc(t)}<div class="h">${h}${q === 'e' ? ic.tk : ''}</div></div>`
}
function celular(n, msgs, rotulo) {
  return `<div class="cel" role="img" aria-label="${esc(rotulo)}"><div class="tela">
    <div class="wa-top"><span class="av">${esc(n.sigla)}</span><div><b>${esc(n.empresa)}</b><small>online</small></div></div>
    <div class="wa-msgs">${msgs.map(bal).join('')}</div>
  </div></div>`
}

const MES = n => [
  ['Atende no WhatsApp, todo dia', `Com o nome da ${n.sua} e no seu jeito de falar, a qualquer hora, inclusive à noite e no fim de semana.`],
  ['Retoma quem pediu orçamento e sumiu', 'No dia seguinte, em 3 dias e em 6 dias, com despedida educada no fim. Ninguém fica esquecido.'],
  ['Cria e roda a campanha', 'Até 6 vídeos e 6 imagens de anúncio por mês, no Facebook e no Instagram, com as fotos reais do seu trabalho.'],
  ['Faz os posts do mês', '12 posts pro Instagram: carrossel, imagem e vídeo, com conteúdo que dá confiança pra quem chega pelo anúncio.'],
  ['Analisa os números a cada 2 dias', 'Vê o que traz conversa e cliente de verdade, pausa o que não funciona e reforça o que vende.'],
  ['Relatório todo dia 2', 'O mês inteiro numa página: conversas, orçamentos, vendas e o que muda no mês seguinte.'],
  ['Você aprova tudo pelo WhatsApp', 'Anúncio, post e mudança de rumo chegam no seu WhatsApp. Um "aprovado" e vai pro ar. Tem também um painel com os resultados.'],
  ['Um especialista confere', 'Gente da escola revisa o que a Maia cria antes de ir pro ar, e acompanha a sua conta.'],
]

const FAQ = n => [
  ['É um robô? Meu cliente vai perceber?', `A Maia é uma inteligência artificial, mas atende com o nome da ${n.sua} e no seu jeito de falar, que ela aprende com o seu Instagram e na implantação. Se o cliente perguntar se é robô, ela fala a verdade: é a assistente virtual da empresa. Quando o cliente quer fechar ou tem uma dúvida que ela não sabe, ela passa a conversa pra você ou pro seu time, com o resumo pronto.`],
  ...n.faqExtra,
  ['Funciona fora do Rio Grande do Sul?', 'Funciona no Brasil todo. A escola fica em Lajeado (RS), mas tudo é online: a implantação é por chamada de vídeo, com a tela compartilhada, e a campanha roda na sua cidade e na sua região.'],
  ['Preciso trocar meu número de WhatsApp?', 'Não. A Maia é conectada ao WhatsApp Business que você já usa, pela conexão oficial da Meta. O número continua o seu e o aplicativo continua funcionando no seu celular: você vê as conversas e entra quando quiser. Quando você responde um cliente pelo celular, ela fica quieta naquela conversa. Se hoje você usa o WhatsApp comum, dá pra passar o mesmo número pro WhatsApp Business antes da implantação.'],
  ['Preciso entender de tecnologia?', 'Não. Você fala com a Maia pelo WhatsApp, como fala com um funcionário. Na implantação, a nossa equipe conecta as contas junto com você, numa chamada de vídeo com a tela compartilhada. Depois disso, você só aprova e responde quando ela te chama.'],
  ['A verba de anúncio está inclusa?', 'Não. A verba é do seu negócio e vai direto pra Meta (Facebook e Instagram), no cartão da sua empresa, sem passar pela gente. Pra começar, o comum é entre R$ 20 e R$ 40 por dia. A Maia te mostra a cada 2 dias quanto custou cada conversa e diz se vale subir ou baixar. Responder quem chamou no WhatsApp não custa nada; a retomada depois de 24 horas e o recado pra base têm uma taxa da Meta, de uns R$ 0,40 por mensagem.'],
  ['Tem fidelidade?', 'Não. É mensal e você cancela quando quiser. Quem segura o cliente aqui é o resultado que aparece no relatório.'],
]

function pagina(n, modo) {
  const V = VISUAL[n.slug]
  const F = V.fotos
  const IMG = modo === 'repo' ? `/maia/nichos/img/${V.pasta}/` : `img/${V.pasta}/`
  const IMG0 = modo === 'repo' ? '/maia/nichos/img/' : 'img/'
  const LOGO = modo === 'repo' ? '/imersao/midia/logo.webp' : 'img/logo.webp'
  const MAIA = modo === 'repo' ? '/maia/img/maia-avatar.webp' : 'img/maia.webp'
  const im = (k, alt, extra = 'loading="lazy" decoding="async"', cls = '') => { const [f, w, h] = F[k]; return `<img${cls ? ` class="${cls}"` : ''} src="${IMG}${f}" alt="${esc(alt)}" width="${w}" height="${h}" ${extra}>` }
  const destino = DESTINO.url(n)
  const viaWa = DESTINO.tipo === 'whatsapp'
  const cta = (txt, cls = 'btn') => `<a class="${cls}" href="${esc(destino)}" data-cta${viaWa ? ` data-msg="${esc(n.msg)}"` : ''}${viaWa ? ' target="_blank" rel="noopener"' : ''}>${viaWa ? ic.zap : ''}${txt}</a>`
  const quero = `Quero a Maia na ${n.meu}`
  const cor = `:root{--ac:${V.cor.ac};--ac2:${V.cor.ac2};--ac-bg:${V.cor.acBg};--ac-ln:${V.cor.acLn};--claro:${V.cor.claro};--ac-rgb:${V.cor.rgb};--hero-pos:${V.heroPos[0]};--hero-pos-g:${V.heroPos[1]}}`
  const post = (p) => `<article class="post">
      <div class="post-top"><span class="av"><span>SUA</span></span><div><b>${V.conta}</b><small>Patrocinado</small></div>${ic.pts}</div>
      <div class="arte">${im(p.f, '')}<span class="tag">Exemplo</span><div class="tx"><span class="mo">${esc(p.olho)}</span><p class="mg">${esc(p.gancho)}</p><p class="ms">${esc(p.sub)}</p><span class="marca">${esc(V.marca)}</span></div></div>
      <div class="post-cta"><span>${esc(p.cta)}</span>${ic.seta.replace('class="ico"', '')}</div>
      <div class="post-acoes">${ic.cor}${ic.com}${ic.env}<span class="fim">${ic.sal}</span></div>
      <p class="post-leg"><b>${V.conta}</b>${esc(p.legenda)}</p>
    </article>`
  const real = V.real ? `<article class="post">
        <div class="post-top"><span class="av"><span>${V.real.sigla}</span></span><div><b>${V.real.conta}</b><small>Patrocinado</small></div>${ic.pts}</div>
        <div class="arte"><img src="${IMG0}${V.real.img}" alt="${esc(V.real.alt)}" width="720" height="900" loading="lazy" decoding="async" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"><span class="tag real">Real</span></div>
        <div class="post-cta"><span>Enviar mensagem</span>${ic.seta.replace('class="ico"', '')}</div>
        <div class="post-acoes">${ic.cor}${ic.com}${ic.env}<span class="fim">${ic.sal}</span></div>
        <p class="post-leg"><b>Anúncio real</b>${esc(V.real.leg)}</p>
      </article>` : ''

  const corpo = `
<header class="topo">
  <div class="ct">
    <a class="chapa" href="https://carreiranodigital.com" aria-label="Carreira no Digital"><img src="${LOGO}" alt="Carreira no Digital" width="256" height="93"></a>
    <div class="nome"><b>Maia</b> · a IA de marketing pra ${esc(n.curto)}</div>
    ${cta('Quero a Maia')}
  </div>
</header>
<main>

<section class="hero">
  ${im('hero', V.heroAlt, 'fetchpriority="high" decoding="async"')}
  <div class="ct">
    <div>
      <span class="selo"><i>Maia</i><span>${esc(n.selo)}</span></span>
      <h1>${n.h1}</h1>
      <p class="lead">${n.lead}</p>
      <div class="acoes">
        ${cta(quero)}
        <a class="btn btn-sec" href="#conversa">Ver como ela atende</a>
      </div>
      <div class="fatos">
        <div><b>24 h</b><span>atendendo no seu WhatsApp</span></div>
        <div><b>3</b><span>retomadas pra quem sumiu</span></div>
        <div><b>48 h</b><span>pra campanha ir pro ar</span></div>
      </div>
    </div>
    <div class="cel-hero">${celular(n, n.heroChat, `Exemplo de conversa no WhatsApp da ${n.empresa}`)}</div>
  </div>
</section>

<section class="dores">
  <div class="ct">
    <div class="cab">
      <span class="olho">Você conhece isso</span>
      <h2>O que faz a ${esc(n.sua)} perder venda todo mês</h2>
    </div>
    <div class="dor-lista">
      ${n.dores.map(([q, r], i) => `<div class="dor">${im(V.dores[i][0], V.dores[i][1])}<p class="q">${esc(q)}</p><p class="r">${ic.seta}<span>${esc(r)}</span></p></div>`).join('')}
    </div>
  </div>
</section>

<section id="conversa">
  <div class="ct">
    <div class="cab">
      <span class="olho">No jeito da ${esc(n.sua)}</span>
      <h2>Como a Maia atende o seu cliente</h2>
      <p class="lead">${esc(n.jeitoLead)}</p>
    </div>
    <div class="jeito">
      ${n.jeito.map(([t, p], i) => `<div class="j">${im(V.jeito[i][0], V.jeito[i][1])}<div class="tx"><span class="n">${i + 1}</span><h3>${esc(t)}</h3><p>${esc(p)}</p></div></div>`).join('')}
    </div>
    <div class="conv">
      <div>
        ${celular(n, n.conversa, `Conversa completa de exemplo no WhatsApp da ${n.empresa}`)}
        <p class="ex">Exemplo · empresa fictícia · os preços e prazos são os seus</p>
      </div>
      <div class="lado">
        <div class="resumo">
          <span class="olho">O que chega pro seu time</span>
          <h3>Um resumo, não 40 mensagens</h3>
          <dl>${n.equipe.map(x => `<div>${ic.ok}<span>${esc(x)}</span></div>`).join('')}</dl>
          <p>Você ou o seu time confirma, responde por ali mesmo e marca como resolvido. A Maia volta a atender.</p>
        </div>
        <div class="ret">
          <span class="olho">E se o cliente sumir</span>
          <h3>A retomada</h3>
          <ol>${n.retomada.map(([q, t]) => `<li><b>${esc(q)}</b><span>${esc(t)}</span></li>`).join('')}</ol>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="sabe" id="especialista">
  <div class="ct">
    <div class="sabe-topo">
      <div class="cab" style="margin-bottom:0">
        <span class="olho">Especialista em ${esc(n.curto)}</span>
        <h2>${esc(n.sabeTitulo)}</h2>
        <p class="lead">${esc(n.sabeLead)}</p>
      </div>
      <div class="sabe-foto">${im(V.sabeFoto[0], V.sabeFoto[1])}</div>
    </div>

    <div class="subs">
      ${n.subnichos.map(([t, s, p]) => `<div class="sub"><b>${esc(t)}</b><span class="s">${esc(s)}</span><p><i>Ela pergunta:</i> ${esc(p)}</p></div>`).join('')}
    </div>

    <div class="bloco">
      <h3>As perguntas certas e o preço na hora certa</h3>
      <div class="duas">
        <div class="cx">
          <h4>O que ela pergunta antes de passar adiante</h4>
          <ol class="pergs">${n.perguntas.map(q => `<li>${esc(q)}</li>`).join('')}</ol>
        </div>
        <div class="cx">
          <h4>Como ela lida com o preço</h4>
          <span class="tag-ok">Tem preço fixo: ela passa, com o que está incluso antes</span>
          <ul class="lst ok">${n.precoFixo.map(x => `<li>${ic.ok}<span>${esc(x)}</span></li>`).join('')}</ul>
          <div class="sep"></div>
          <span class="tag-av">Depende de ${n.avaliacaoNome === 'loja' ? 'ver na loja' : 'avaliação'}: ela explica por quê e leva pro ${esc(n.avaliacaoNome === 'loja' ? 'atendimento na loja' : 'diagnóstico')}</span>
          <ul class="lst av">${n.precoAvaliacao.map(x => `<li>${ic.seta}<span>${esc(x)}</span></li>`).join('')}</ul>
        </div>
      </div>
    </div>

    <div class="bloco">
      <h3>O que o cliente fala, e como ela responde</h3>
      <div class="objs">
        ${n.objecoes.map(([q, r]) => `<div class="obj"><span class="q">"${esc(q)}"</span><p class="r">${ic.seta}<span>${esc(r)}</span></p></div>`).join('')}
      </div>
    </div>

    <div class="bloco">
      <div class="recado">
        <div class="tx">
          <span class="olho">Recado pra base</span>
          <h3>${esc(n.recado.titulo)}</h3>
          <p>${esc(n.recado.texto)}</p>
          <div class="chips">${n.recado.momentos.map(m => `<span>${esc(m)}</span>`).join('')}</div>
          <p class="regra">Só pra quem já é cliente, com botão pra sair da lista, e no máximo 2 recados por semana pra cada pessoa. Você aprova cada recado antes de sair.</p>
        </div>
        <div>
          <div class="mini" role="img" aria-label="Exemplo de recado pra base no WhatsApp da ${esc(n.empresa)}">
            <div class="wa-top"><span class="av">${esc(n.sigla)}</span><div><b>${esc(n.empresa)}</b><small>recado pra base</small></div></div>
            <div class="wa-msgs">
              <div class="bal e" style="max-width:92%">${esc(n.recado.msg)}<div class="h">09:30${ic.tk}</div></div>
              <div class="botoes"><span>Quero</span><span>Não quero receber</span></div>
            </div>
          </div>
          <p class="ex">Exemplo</p>
        </div>
      </div>
    </div>

    <div class="bloco">
      <h3>O calendário do ano, com o gancho de cada época</h3>
      <p class="lead">A cada 15 dias ela revisa a estratégia olhando a época do ano e muda o foco dos anúncios.</p>
      <div class="cal">${n.calendario.map(([e, f, g]) => `<div><small>${esc(e)}</small><b>${esc(f)}</b><span>${esc(g)}</span></div>`).join('')}</div>
    </div>
  </div>
</section>

<section class="anuncios">
  <div class="ct">
    <div class="cab">
      <span class="olho">Facebook e Instagram</span>
      <h2>${esc(n.anunciosTitulo)}</h2>
      <p class="lead">${esc(n.anunciosLead)}</p>
    </div>
    <div class="feed">
      ${V.posts.map(post).join('')}
      ${real}
    </div>
    <p class="nota">${esc(V.notaAnuncios)}</p>
  </div>
</section>

<section>
  <div class="ct">
    <div class="cab">
      <span class="olho">Um anúncio pra cada serviço</span>
      <h2>O que a Maia divulga</h2>
      <p class="lead">${esc(n.servicosLead)}</p>
    </div>
    <div class="galeria">
      ${V.servicos.map(([k, t, s]) => `<div class="srv">${im(k, t)}<div><b>${esc(t)}</b><span>${esc(s)}</span></div></div>`).join('')}
    </div>
  </div>
</section>

<section class="faixa-foto">
  ${im(V.faixa[0], V.faixa[1])}
  <div class="ct">
    <span class="olho">Todo mês</span>
    <h2>${esc(n.faixa[0])}</h2>
    <p>${esc(n.faixa[1])}</p>
  </div>
</section>

<section>
  <div class="ct">
    <div class="mes">
      ${MES(n).map(([t, p], i) => `<div class="it"><span class="n">${i + 1}</span><div><h3>${esc(t)}</h3><p>${esc(p)}</p></div></div>`).join('')}
    </div>
    <div class="dono">
      <div class="tx">
        <span class="olho">Você e a Maia</span>
        <h3>Com você, ela é a Maia. Com o seu cliente, ela é a ${esc(n.sua)}.</h3>
        <p>Você conversa com ela pelo WhatsApp: aprova o que ela criou, pergunta como estão os números e manda foto do trabalho novo pra virar anúncio. Ela responde na hora.</p>
      </div>
      <div>
        <div class="mini" role="img" aria-label="Exemplo de conversa entre a Maia e o dono">
          <div class="wa-top"><span class="av"><img src="${MAIA}" alt="" width="36" height="36"></span><div><b>Maia</b><small>sua agência</small></div></div>
          <div class="wa-msgs">${n.dono.map(([q, t]) => `<div class="bal ${q === 'm' ? 'c' : 'e'}">${esc(t)}<div class="h">08:1${q === 'm' ? '2' : '4'}${q === 'd' ? ic.tk : ''}</div></div>`).join('')}</div>
        </div>
        <p class="ex">Exemplo</p>
      </div>
    </div>
  </div>
</section>

<section style="padding-top:0">
  <div class="ct">
    <div class="prova">
      <div>
        <span class="olho">Resultado real</span>
        <h3>O mesmo jeito de anunciar e atender, num cliente da escola</h3>
        <p>A Wood, de gravação a laser no RS, anuncia e atende do jeito que a Maia segue: gancho pra quem já quer comprar, foto real do produto e resposta rápida no WhatsApp.</p>
      </div>
      <div class="nums">
        <div><b>R$ 250</b><span>de anúncio em 1 semana</span></div>
        <div><b>199</b><span>contatos no WhatsApp</span></div>
        <div><b>19</b><span>vendas na mesma semana</span></div>
        <div><b>~150</b><span>copos no Dia dos Pais, com R$ 207 de anúncio</span></div>
      </div>
    </div>
  </div>
</section>

<section style="padding-top:0">
  <div class="ct como-g">
    <div>
      <div class="cab">
        <span class="olho">Como começa</span>
        <h2>Três passos, tudo online</h2>
      </div>
      <ol class="linha">
        <li class="passo"><span class="bola">1</span><div><span class="tag">Hoje</span><h3>Chama a nossa equipe no WhatsApp</h3><p>Você conta como a ${esc(n.sua)} funciona e tira as dúvidas. Se fizer sentido, já marca a implantação.</p></div></li>
        <li class="passo"><span class="bola">2</span><div><span class="tag">Com hora marcada</span><h3>Implantação online, em 2 chamadas</h3>
          <ul>
            <li>${ic.ok}<span><b>Chamada 1, técnica (uns 60 min):</b> a nossa equipe conecta com você o Instagram, a página do Facebook, a conta de anúncio e o WhatsApp, com a tela compartilhada.</span></li>
            <li>${ic.ok}<span><b>Chamada 2, treino (uns 60 min):</b> você ensina a Maia: serviços, preços, prazos, até onde dá desconto e quando ela passa a conversa pra você. Aprova o primeiro lote de anúncios.</span></li>
          </ul></div></li>
        <li class="passo"><span class="bola">3</span><div><span class="tag">Em até 48 h</span><h3>Campanha no ar e a Maia atendendo</h3><p>Depois da 2ª chamada, os anúncios aprovados vão pro ar e a Maia começa a atender, retomar e mandar os recados no seu WhatsApp.</p>
          <span class="sai">${ic.ok}Campanha no ar em até 48 h depois da 2ª chamada</span></div></li>
      </ol>
    </div>
    <div class="como-foto">${im(V.como[0], V.como[1])}</div>
  </div>
</section>

<section class="oferta" id="oferta" style="padding-top:0">
  <div class="ct">
    <div class="card-of">
      <div class="of-cab">
        ${im(V.oferta, '')}
        <span class="olho">A oferta</span>
        <h3>A Maia trabalhando pra ${esc(n.sua)}, todo mês</h3>
      </div>
      <div class="of-corpo">
        <ul class="inclui">
          <li>${ic.ok}<span><b>Atendimento no WhatsApp todo dia</b>, com o nome da ${esc(n.sua)}, e retomada de quem sumiu</span></li>
          <li>${ic.ok}<span><b>Recado pra sua base</b> na época certa do ano</span></li>
          <li>${ic.ok}<span><b>Campanha no Facebook e no Instagram</b> criada, rodando e ajustada a cada 2 dias</span></li>
          <li>${ic.ok}<span><b>Até 6 vídeos e 6 imagens de anúncio</b> e <b>12 posts</b> por mês</span></li>
          <li>${ic.ok}<span><b>Relatório completo todo dia 2</b> e painel com os resultados</span></li>
          <li>${ic.ok}<span><b>Tudo aprovado por você pelo WhatsApp</b>, com um especialista da escola conferindo</span></li>
          <li>${ic.ok}<span><b>Implantação online em 2 chamadas</b>, já inclusa no primeiro mês</span></li>
        </ul>
        <div class="precos">
          <div class="pr um"><small>Primeiro mês, com a implantação</small><div class="v"><b>R$ 497</b></div><p>As 2 chamadas de implantação e o primeiro mês da Maia trabalhando.</p></div>
          <div class="pr"><small>Do segundo mês em diante</small><div class="v"><b>R$ 797</b><span>/mês</span></div><p>Sem fidelidade. Cancela quando quiser.</p></div>
        </div>
        <p class="fora"><b>A verba de anúncio é à parte</b> e você paga direto à Meta, no cartão da sua empresa. A conta de anúncio e o número ficam no nome da sua empresa.</p>
        ${cta(quero)}
      </div>
    </div>
  </div>
</section>

<section id="duvidas" style="padding-top:0">
  <div class="ct">
    <div class="cab" style="text-align:center;align-items:center">
      <span class="olho">Dúvidas</span>
      <h2>Perguntas que todo mundo faz</h2>
    </div>
    <div class="faq">
      ${FAQ(n).map(([q, r]) => `<details><summary>${esc(q)}</summary><p>${esc(r)}</p></details>`).join('')}
    </div>
  </div>
</section>

<section class="final">
  <div class="ct">
    <div class="final-card">
      ${im(V.final, '', 'loading="lazy" decoding="async"', 'fundo')}
      <img class="maia" src="${MAIA}" alt="Maia, a IA de marketing da Carreira no Digital" width="84" height="84" loading="lazy">
      <h2>A próxima mensagem da ${esc(n.sua)} pode ser respondida na hora.</h2>
      <p class="lead">Chama a nossa equipe no WhatsApp. A gente entende como a ${esc(n.sua)} funciona e, se fizer sentido, marca a implantação online. Primeiro mês R$ 497, já com a implantação.</p>
      ${cta(quero)}
    </div>
  </div>
</section>

</main>
<footer class="rodape"><div class="ct">Maia é a IA de marketing da Carreira no Digital, escola de marketing com IA de Lajeado (RS). Atendemos o Brasil todo.<br>WhatsApp da escola: 51 99505-4548</div></footer>

<div class="barra" id="barra">
  <div class="q"><b>A Maia na ${esc(n.sua)}</b><span>Atende, retoma e anuncia · 1º mês R$ 497</span></div>
  ${cta('Quero')}
</div>
<script>
(function(){var b=document.getElementById('barra');if(!b)return;function f(){b.classList.toggle('on',(window.scrollY||0)>520)}window.addEventListener('scroll',f,{passive:true});f();})();
</script>`

  const pixel = `<!-- RASTREIO:INICIO · Meta Pixel (conta da escola), o mesmo das outras páginas -->
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','3968641693466078');fbq('track','PageView');
fbq('track','ViewContent',{content_type:'product',content_name:'Maia',content_category:'${n.cat}'});
</script>
<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=3968641693466078&ev=PageView&noscript=1"/></noscript>
<!-- RASTREIO:FIM -->`

  const rastreio = `<!-- RASTREIO:INICIO · o mesmo rastreio das páginas /black e /deuvenda (site_eventos + /wa com a mensagem pronta, Lead no pixel com o mesmo event_id) -->
<script>
(function(){
  var CRM='https://carreiranodigital.vercel.app';
  var TRACK=CRM+'/api/track', WA=CRM+'/wa', CAMP='${n.camp}', NICHO='${n.cat}';
  function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,10);}
  var vid,sid;
  try{vid=localStorage.getItem('cnd_vid');if(!vid){vid=uid();localStorage.setItem('cnd_vid',vid);}}catch(e){vid=uid();}
  try{sid=sessionStorage.getItem('cnd_sid');if(!sid){sid=uid();sessionStorage.setItem('cnd_sid',sid);}}catch(e){sid=uid();}
  var qs=new URLSearchParams(location.search);
  var fbclid=qs.get('fbclid');
  try{if(fbclid){localStorage.setItem('cnd_fbclid',fbclid);}else{fbclid=localStorage.getItem('cnd_fbclid');}}catch(e){}
  var utm={source:qs.get('utm_source')||'',medium:qs.get('utm_medium')||'',campaign:qs.get('utm_campaign')||CAMP,content:qs.get('utm_content')||''};
  function track(evento,meta){
    try{
      var payload=JSON.stringify({visitor_id:vid,sessao_id:sid,evento:evento,url:location.href,referrer:document.referrer,
        utm_source:utm.source,utm_medium:utm.medium,utm_campaign:utm.campaign,utm_content:utm.content,fbclid:fbclid,meta:meta||null});
      if(navigator.sendBeacon){navigator.sendBeacon(TRACK,new Blob([payload],{type:'text/plain'}));}
      else{fetch(TRACK,{method:'POST',headers:{'Content-Type':'text/plain'},body:payload,keepalive:true});}
    }catch(e){}
  }
  window.__cndTrack=track;
  track('page_view');
  var hit={};
  window.addEventListener('scroll',function(){
    var h=document.documentElement,max=(h.scrollHeight-h.clientHeight)||1,pct=(h.scrollTop||document.body.scrollTop)/max*100;
    if(pct>=50&&!hit[50]){hit[50]=1;track('scroll_50');}
    if(pct>=90&&!hit[90]){hit[90]=1;track('scroll_90');}
  },{passive:true});
  function cookie(n){try{var m=document.cookie.match('(^|;)\\\\s*'+n+'=([^;]*)');return m?decodeURIComponent(m[2]):null}catch(e){return null}}
  function waLink(msg){
    var ev=uid(), p=new URLSearchParams();
    p.set('msg',msg);p.set('src',location.href);p.set('vid',vid);p.set('sid',sid);
    p.set('event_id',ev);
    var _fbp=cookie('_fbp'); if(_fbp)p.set('fbp',_fbp);
    var _fbc=cookie('_fbc'); if(_fbc)p.set('fbc',_fbc);
    if(fbclid)p.set('fbclid',fbclid);
    if(utm.source)p.set('utm_source',utm.source);
    if(utm.medium)p.set('utm_medium',utm.medium);
    p.set('utm_campaign',utm.campaign||CAMP);
    if(utm.content)p.set('utm_content',utm.content);
    return {url:WA+'?'+p.toString(), ev:ev};
  }
  [].forEach.call(document.querySelectorAll('a[data-cta]'),function(b){
    // com data-msg o botão vai pro WhatsApp pelo /wa do CRM; sem data-msg (o quiz, no futuro) o endereço fica como está
    var t=(b.textContent||'').replace(/\\s+/g,' ').trim(), m=b.getAttribute('data-msg'), l=m?waLink(m):{url:b.getAttribute('href'),ev:uid()};
    if(m)b.setAttribute('href',l.url);
    b.addEventListener('click',function(){
      track('clique_wa',{botao:t.slice(0,40),nicho:NICHO,event_id:l.ev});
      try{if(window.fbq)fbq('track','Lead',{content_name:'Maia',content_category:NICHO},{eventID:l.ev});}catch(e){}
    });
  });
})();
</script>
<!-- RASTREIO:FIM -->`

  if (modo === 'repo') {
    return `<!doctype html>
<html lang="pt-BR">
<head>
${pixel}
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(n.titulo)} · Carreira no Digital</title>
<meta name="description" content="${esc(n.desc)}">
<meta property="og:title" content="${esc(n.selo)}">
<meta property="og:description" content="${esc(n.desc)}">
<meta property="og:type" content="website">
<meta property="og:image" content="${IMG}${F.hero[0]}">
<meta name="theme-color" content="#f6f5f2">
<link rel="preload" href="${IMG}${F.hero[0]}" as="image" fetchpriority="high">
<link rel="preload" href="/maia/fontes/bricolage-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="icon" href="/marca/favicon.ico" sizes="48x48"><link rel="icon" type="image/png" sizes="32x32" href="/marca/favicon-32.png"><link rel="apple-touch-icon" href="/marca/apple-touch-icon.png">
<style>
@font-face{font-family:'Manrope';font-style:normal;font-weight:400 800;font-display:swap;src:url(/maia/fontes/manrope-latin.woff2) format('woff2')}
@font-face{font-family:'Bricolage Grotesque';font-style:normal;font-weight:300 800;font-stretch:75% 100%;font-display:swap;src:url(/maia/fontes/bricolage-latin.woff2) format('woff2')}
${CSS}
${cor}
</style>
</head>
<body>
${corpo}
${rastreio}
</body>
</html>
`
  }
  return `<title>${esc(n.titulo)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..800&family=Manrope:wght@400..800&display=swap">
<style>${CSS}
${cor}</style>
${corpo}
`
}

const pedidos = process.argv.slice(2)
for (const slug of Object.keys(VISUAL)) {
  if (pedidos.length && !pedidos.includes(slug)) continue
  const n = NICHOS.find(x => x.slug === slug)
  const saida = join(AQUI, `../../public/maia/nichos/${slug}/index.html`)
  mkdirSync(dirname(saida), { recursive: true })
  writeFileSync(saida, pagina(n, 'repo'))
  console.log('ok', slug, saida)
  if (PREVIA && existsSync(PREVIA)) { writeFileSync(join(PREVIA, `${slug}.html`), pagina(n, 'previa')); console.log('ok prévia', slug) }
}
