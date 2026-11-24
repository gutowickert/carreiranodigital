// Páginas da Maia por nicho: OFICINA e ÓTICA.
// 24/11/2026 (2ª versão, pedido do Guto): menos texto, mais visual. A Maia aparece como a agência de marketing
// inteira + o atendimento do negócio, em blocos na ordem do funil (estratégia, criação, tráfego, atendimento,
// retomada, recado pra base, medição, relatório). O conhecimento do nicho fica dentro dos visuais.
// Fotos reais (licenças em public/maia/nichos/img/<pasta>/FOTOS-LICENCA.md); IA só no rosto da Maia.
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

// ===== PRA ONDE O BOTÃO PRINCIPAL LEVA (um lugar só) =====
// O quiz de diagnóstico de cada nicho. O rastreio repassa os utm/fbclid da página pro quiz.
// O WhatsApp da escola fica como link secundário ("Prefiro falar no WhatsApp"), com a mensagem pronta (n.msg).
const DESTINO = { url: v => `/maia/quiz/${v.quiz}` }
const WA_LINK = n => `https://wa.me/${WA}?text=${encodeURIComponent(n.msg)}`

// ===== cada nicho: cores, fotos e o conteúdo curto dos visuais =====
const VISUAL = {
  oficinas: {
    quiz: 'oficina', pasta: 'oficina',
    cor: { ac: '#d9480f', ac2: '#e8590c', acBg: '#fff1e7', acLn: '#ffc8a1', claro: '#ff8a3d', rgb: '217,72,15' },
    fotos: {
      hero: ['hero-embaixo-do-carro.jpg', 1800, 1200],
      motor: ['motor-aberto.jpg', 960, 540],
      pneu: ['pneu-revisao.jpg', 960, 640],
      scanner: ['diagnostico-scanner.jpg', 960, 1440],
      oleo: ['troca-de-oleo.jpg', 960, 640],
      chave: ['chave-no-motor.jpg', 960, 640],
      maos: ['maos-no-motor.jpg', 960, 640],
      elev: ['elevador-oficina.jpg', 960, 640],
      ampla: ['oficina-ampla.jpg', 960, 484],
      noite: ['mao-graxa-noite.jpg', 960, 720],
    },
    heroAlt: 'Mecânico deitado embaixo de um carro erguido no cavalete',
    heroPos: '55% 50%',
    h1: 'A agência de marketing da sua oficina, <em>inteira numa IA.</em>',
    lead: 'Ela anuncia, atende o WhatsApp 24 h e traz de volta quem sumiu. Mais carro no elevador, sem você largar a chave.',
    botao: 'Ver quanto a minha oficina pode ganhar (1 min)',
    anuncios: [
      ['motor', 'Câmbio', 'Dando tranco na troca de marcha?'],
      ['pneu', 'Férias', 'Vai pegar a estrada com a família?'],
      ['scanner', 'Painel', 'Acendeu a luz da injeção?'],
      ['oleo', 'Revisão', 'O óleo do seu carro venceu?'],
      ['chave', 'Freio', 'Barulho quando freia?'],
      ['maos', 'Verão', 'Ar do carro só soprando quente?'],
    ],
    raio: '15 km', alcance: '18 mil', conversas: '212',
    chat: [
      ['c', 'Boa noite, quanto fica pra arrumar o câmbio? Tá dando tranco', '22:47'],
      ['e', 'Boa noite! Aqui é da Mecânica Rossi. Qual o modelo e o ano? O tranco é na troca de marcha?', '22:48'],
      ['c', 'Corolla 2016. Da 2ª pra 3ª', '22:49'],
      ['e', 'Pode ser o óleo do câmbio. O diagnóstico com scanner sai R$ 150 e é descontado se fizer o serviço. Amanhã às 8h fica bom?', '22:49'],
    ],
    retomada: [
      ['1 dia depois', 'Conseguiu ver o melhor dia pra olhar o câmbio do Corolla?'],
      ['3 dias depois', 'Quer que eu mande um vídeo do teste que a gente faz no câmbio?'],
      ['6 dias depois', 'Vou parar por aqui pra não incomodar. Quando quiser, é só chamar.'],
    ],
    recadoFoto: 'elev',
    fechar: 'Carlos quer fazer o diagnóstico do câmbio amanhã às 8h. Corolla 2016, 98 mil km.',
    arroba: 'mecanicarossi',
    feed: ['elev', 'motor', 'oleo', 'maos', 'pneu', 'scanner', 'ampla', 'chave', 'noite'],
    reels: [1, 5, 8],
    analise: 'Análise de 2 dias: o anúncio do câmbio trouxe 9 orçamentos, e a conversa saiu a R$ 4,10. Sigo com ele.',
    recado: 'Oi Carlos, aqui é da Mecânica Rossi. A troca de óleo do seu Corolla vence este mês. Vejo um horário pra essa semana?',
    funil: [['Pessoas que viram o anúncio', '18.400'], ['Conversas no WhatsApp', '212'], ['Orçamentos', '64'], ['Serviços fechados', '21']],
    repete: 'Repete: "câmbio dando tranco"', corta: 'Corta: "ar soprando quente"',
    aprovar: '2 anúncios novos prontos: câmbio e revisão de férias. Aprova?',
    relatorio: [['Conversas', '212'], ['Serviços fechados', '21'], ['Custo por conversa', 'R$ 4,10']],
    proximo: 'Próximo mês: mais câmbio, menos ar-condicionado.',
    sem: ['Anúncio só quando a oficina esvazia', 'WhatsApp respondido quando dá tempo', 'Orçamento caro esquecido', 'Sem saber qual anúncio trouxe carro'],
    com: ['Anúncio o ano todo, na época certa', 'Resposta em 1 minuto, até de madrugada', 'Retomada em 1, 3 e 6 dias', 'Cada serviço ligado ao anúncio que trouxe'],
    barra: 'Quanto a sua oficina pode ganhar?',
    final: 'ampla',
  },
  otica: {
    quiz: 'otica', pasta: 'otica',
    cor: { ac: '#0e7490', ac2: '#0891b2', acBg: '#e7f6f9', acLn: '#a5dce7', claro: '#5fd4e8', rgb: '14,116,144' },
    fotos: {
      hero: ['hero-vendedora-balcao.jpg', 1800, 1137],
      sol: ['oculos-de-sol.jpg', 960, 1440],
      rosa: ['menina-oculos-rosa.jpg', 960, 683],
      comparando: ['comparando-armacoes.jpg', 960, 1440],
      parafuso: ['parafuso-oculos.jpg', 960, 1438],
      maeFilha: ['mae-e-filha.jpg', 960, 640],
      clienteParede: ['cliente-na-parede.jpg', 960, 640],
      vitrine: ['vitrine-armacoes.jpg', 960, 540],
      parede: ['parede-armacoes.jpg', 960, 640],
      provando: ['provando-oculos.jpg', 960, 641],
    },
    heroAlt: 'Atendente sorrindo no balcão de uma ótica, com a parede de armações atrás',
    heroPos: '50% 35%',
    h1: 'A agência de marketing da sua ótica, <em>inteira numa IA.</em>',
    lead: 'Ela anuncia, atende o WhatsApp 24 h e traz de volta quem sumiu. Mais gente provando óculos na sua loja.',
    botao: 'Ver quanto a minha ótica pode ganhar (1 min)',
    anuncios: [
      ['sol', 'Verão', 'Óculos de sol com o seu grau?'],
      ['rosa', 'Volta às aulas', 'Lista pronta. E o óculos?'],
      ['comparando', 'Multifocal', 'Cansou de tirar o óculos pra ler?'],
      ['parafuso', 'Conserto', 'Óculos torto ou frouxo?'],
      ['maeFilha', 'Dia das Mães', 'Um presente que ela usa todo dia.'],
      ['clienteParede', '1 ano', 'Faz 1 ano do seu óculos?'],
    ],
    raio: '10 km', alcance: '15 mil', conversas: '184',
    chat: [
      ['c', 'Boa noite! Quanto fica um óculos multifocal?', '22:47'],
      ['e', 'Boa noite! Aqui é da Ótica Visão Clara. A lente depende do grau: me manda uma foto da receita?', '22:48'],
      ['f', 'Foto da receita', '22:49'],
      ['e', 'Receita em dia! Já vem com antirreflexo, montagem e ajuste. No seu grau, a partir de R$ 890. Quer vir provar as armações sábado?', '22:49'],
    ],
    retomada: [
      ['1 dia depois', 'Separei 4 armações leves pra você. Quer que eu mande as fotos?'],
      ['3 dias depois', 'Quer que eu explique a diferença entre as lentes multifocais?'],
      ['6 dias depois', 'Vou parar por aqui pra não incomodar. Quando quiser, é só chamar.'],
    ],
    recadoFoto: 'parede',
    fechar: 'Ana quer provar armações de metal leve no sábado de manhã. Multifocal, receita em dia.',
    arroba: 'oticavisaoclara',
    feed: ['clienteParede', 'sol', 'parede', 'maeFilha', 'comparando', 'vitrine', 'rosa', 'parafuso', 'provando'],
    reels: [1, 4, 8],
    analise: 'Análise de 2 dias: o anúncio de óculos de sol com grau trouxe 11 receitas, e a conversa saiu a R$ 3,80. Sigo com ele.',
    recado: 'Oi Ana, aqui é da Ótica Visão Clara. Faz 1 ano do seu multifocal: bom momento pra revisar o grau com o oftalmologista e passar aqui pra um ajuste.',
    funil: [['Pessoas que viram o anúncio', '15.200'], ['Conversas no WhatsApp', '184'], ['Receitas recebidas', '71'], ['Óculos vendidos', '26']],
    repete: 'Repete: "óculos de sol com o seu grau"', corta: 'Corta: "conserto na hora"',
    aprovar: '2 anúncios novos prontos: óculos de sol com grau e volta às aulas. Aprova?',
    relatorio: [['Conversas', '184'], ['Óculos vendidos', '26'], ['Custo por conversa', 'R$ 3,80']],
    proximo: 'Próximo mês: volta às aulas e óculos infantil.',
    sem: ['Anúncio só na Black Friday', 'Receita respondida no dia seguinte', 'O "vou pensar" esquecido', 'Sem saber qual anúncio trouxe venda'],
    com: ['Anúncio o ano todo, na época certa', 'Resposta em 1 minuto, com o valor certo', 'Retomada em 1, 3 e 6 dias', 'Cada óculos vendido ligado ao anúncio'],
    barra: 'Quanto a sua ótica pode ganhar?',
    final: 'vitrine',
  },
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const ic = {
  zap: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z"/></svg>',
  ok: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  seta: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  foto: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="m21 17-5-5-8 8"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M10 8.5v7l6-3.5z" fill="currentColor"/></svg>',
  tk: '<svg class="tk" viewBox="0 0 18 12" aria-hidden="true"><path d="M1 6.5 4.5 10 11 2M7 10l.5.5L15 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19.5 12.6 12 20l-7.5-7.4A4.9 4.9 0 0 1 12 6.1a4.9 4.9 0 0 1 7.5 6.5z"/></svg>',
  com: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 11.5a8.4 8.4 0 0 1-12.4 7.4L3.5 20.5l1.6-4.6A8.4 8.4 0 1 1 20.5 11.5z"/></svg>',
  env: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>',
  sal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21 12 16l-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
  pts: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>',
}

// ícones de linha da oferta (1 palavra cada)
const io = {
  estrategia: '<path d="M4 5h16v15H4z"/><path d="M4 9h16M9 3v4M15 3v4"/>',
  anuncios: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  trafego: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  whatsapp: '<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z"/>',
  retomada: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
  recado: '<path d="M4 10v4h3l6 4V6L7 10z"/><path d="M17 9a4 4 0 0 1 0 6"/>',
  medicao: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  conteudo: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6" fill="currentColor"/>',
  relatorio: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
}
const icone = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${io[k]}</svg>`

const CSS = `
/* Maia por nicho, 2ª versão (24/11/2026): pouca frase, muito visual. Base clara do padrão da escola
   (Manrope + Bricolage condensada), grafite + a cor do nicho (--ac, --claro, --ac-rgb). Feita primeiro pro celular. */
:root{
  --bg:#f6f5f2;--s1:#ffffff;--s2:#efede8;--ln:#e6e2da;--ln2:#d4cec3;
  --tx:#1d1f23;--tx2:#3b3e44;--mu:#686b72;--fa:#9a9da3;
  --ac:#d9480f;--ac2:#e8590c;--ac-bg:#fff1e7;--ac-ln:#ffc8a1;--claro:#ff8a3d;--ac-rgb:217,72,15;
  --gr:#22252a;--roxo:#7c3aed;--ok:#15803d;--ok-bg:#e3f7ea;--no:#9f1239;--no-bg:#fde8ec;
  --wa:#efe7dd;--wa-in:#ffffff;--wa-out:#d9fdd3;--wa-top:#f0f2f5;--wa-tx:#111b21;--wa-mu:#667781;--wa-tk:#53bdeb;
  --f-dis:'Bricolage Grotesque','Manrope',system-ui,sans-serif;
  --f-tx:'Manrope',system-ui,-apple-system,'Segoe UI',sans-serif;
  --sombra:0 1px 2px rgba(29,31,35,.05),0 14px 34px -14px rgba(29,31,35,.22);
  color-scheme:light}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{background:var(--bg);color:var(--tx);font-family:var(--f-tx);font-size:17px;line-height:1.5;-webkit-font-smoothing:antialiased;overflow-x:hidden}
img{display:block;max-width:100%;height:auto}
a{color:inherit}
h1,h2,h3,.dis{font-family:var(--f-dis);font-weight:800;font-variation-settings:'opsz' 96,'wdth' 85;letter-spacing:-.025em;line-height:1.03;text-wrap:balance}
h2{font-size:clamp(32px,7.6vw,52px)}
h3{font-size:clamp(26px,5.6vw,34px)}
.ct{max-width:1160px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
section{padding-block:64px}
.olho{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--ac)}
.olho::before{content:"";width:18px;height:3px;border-radius:2px;background:var(--ac2)}
.ico{width:22px;height:22px;flex:none}
.ex,.bl .vis .ex{max-width:none;font-size:11.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--fa);text-align:center;margin-top:10px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:58px;padding:0 24px;border-radius:999px;background:var(--ac);color:#fff;font-weight:800;font-size:17px;text-decoration:none;border:0;cursor:pointer;box-shadow:0 14px 30px -12px rgba(var(--ac-rgb),.6);transition:transform .15s,filter .15s;text-align:center;line-height:1.2}
.btn:hover{transform:translateY(-1px);filter:brightness(1.06)}
.btn:focus-visible,a:focus-visible,summary:focus-visible{outline:3px solid var(--ac2);outline-offset:3px}
.wa-link{display:inline-flex;align-items:center;gap:7px;font-size:14.5px;font-weight:700;color:var(--mu);text-decoration:underline;text-underline-offset:3px}
.wa-link .ico{width:17px;height:17px}

/* topo */
body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:41;background:var(--bg)}
.topo{position:sticky;top:env(safe-area-inset-top,0px);z-index:40;background:rgba(246,245,242,.92);backdrop-filter:saturate(1.4) blur(14px);-webkit-backdrop-filter:saturate(1.4) blur(14px);border-bottom:1px solid var(--ln)}
.topo .ct{display:flex;align-items:center;gap:12px;min-height:60px}
.chapa{display:inline-flex;align-items:center;background:#17122a;border-radius:10px;padding:7px 10px;flex:none}
.chapa img{height:22px;width:auto}
.topo .nome{flex:1;min-width:0;font-size:14px;font-weight:600;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.topo .nome b{color:var(--tx);font-weight:800}
.topo .btn{min-height:40px;padding:0 16px;font-size:14.5px;box-shadow:none}

/* abertura */
.hero{background:var(--gr);color:#fff;padding-block:0;overflow:hidden}
.hero .ct{display:grid;gap:26px;padding-block:0 48px}
.hero-foto{position:relative;margin-inline:calc(-1 * max(16px,env(safe-area-inset-left,0px)))}
.hero-foto>img{width:100%;aspect-ratio:4/3;object-fit:cover;object-position:var(--hero-pos)}
.hero-foto::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(34,37,42,0) 50%,var(--gr) 100%)}
.maia-card{position:relative;margin:-30px max(16px,env(safe-area-inset-left,0px)) 0;z-index:1;display:flex;gap:12px;align-items:center;background:rgba(255,255,255,.96);color:var(--tx);border-radius:20px;padding:12px;box-shadow:0 20px 40px -18px rgba(0,0,0,.55)}
.maia-card img{width:56px;height:56px;border-radius:50%;object-fit:cover;flex:none;border:2px solid var(--ac2)}
.maia-card b{display:block;font-size:15px;line-height:1.2}
.chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
.chips span{font-size:12px;font-weight:800;border-radius:999px;padding:4px 9px;background:var(--ac-bg);color:var(--ac);border:1px solid var(--ac-ln);animation:acende 7.2s infinite}
.chips span:nth-child(2){animation-delay:1.2s}.chips span:nth-child(3){animation-delay:2.4s}.chips span:nth-child(4){animation-delay:3.6s}.chips span:nth-child(5){animation-delay:4.8s}.chips span:nth-child(6){animation-delay:6s}
@keyframes acende{0%,16%{background:var(--ac);color:#fff;border-color:var(--ac)}18%,100%{background:var(--ac-bg);color:var(--ac);border-color:var(--ac-ln)}}
.hero h1{font-size:clamp(42px,11vw,72px);margin-top:20px}
.hero h1 em{font-style:normal;color:var(--claro)}
.hero .lead{margin-top:16px;font-size:clamp(17px,2.3vw,20px);color:rgba(255,255,255,.85);max-width:40ch}
.hero .acoes{display:grid;gap:14px;margin-top:26px;justify-items:start}
.hero .btn{width:100%;max-width:460px}
.hero .wa-link{color:rgba(255,255,255,.75)}

/* tudo o que a Maia faz */
.cab{display:grid;gap:10px;margin-bottom:34px}
.cab p{font-size:18px;color:var(--mu)}
.blocos{display:grid;gap:18px}
.bl{display:grid;gap:18px;background:var(--s1);border:1px solid var(--ln);border-radius:28px;padding:22px 18px;box-shadow:var(--sombra);overflow:hidden}
.bl .tx{display:grid;gap:8px;align-content:center}
.bl .k{display:flex;align-items:center;gap:10px}
.bl .k i{font-style:normal;display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:var(--ac);color:#fff;font-family:var(--f-dis);font-variation-settings:'opsz' 96,'wdth' 85;font-weight:800;font-size:16px}
.bl .k span{font-size:12.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--ac)}
.bl p{font-size:16.5px;color:var(--tx2);max-width:42ch}
.vis{min-width:0}

/* 1 calendário */
.calv{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.calv div{background:var(--bg);border:1px solid var(--ln);border-top:4px solid var(--ac2);border-radius:14px;padding:11px 12px}
.calv small{display:block;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--ac)}
.calv b{display:block;font-size:14px;line-height:1.3;margin-top:4px}

/* 2 anúncios */
.ads{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.ad{position:relative;aspect-ratio:4/5;border-radius:12px;overflow:hidden;background:var(--gr)}
.ad img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.ad::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 30%,rgba(0,0,0,.85) 100%)}
.ad div{position:absolute;left:7px;right:7px;bottom:7px;z-index:1;color:#fff}
.ad small{display:inline-block;background:var(--claro);color:#16181c;font-size:9.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;border-radius:4px;padding:2px 5px}
.ad b{display:block;font-family:var(--f-dis);font-variation-settings:'opsz' 96,'wdth' 82;font-weight:800;font-size:14px;line-height:1.02;text-transform:uppercase;margin-top:4px}

/* 3 mapa */
.mapa{position:relative;aspect-ratio:16/11;border-radius:18px;overflow:hidden;background-color:#e8edf1;
  background-image:linear-gradient(90deg,rgba(255,255,255,.9) 3px,transparent 3px),linear-gradient(0deg,rgba(255,255,255,.9) 3px,transparent 3px),linear-gradient(35deg,transparent 48%,rgba(255,255,255,.95) 48%,rgba(255,255,255,.95) 52%,transparent 52%);
  background-size:58px 58px,58px 58px,100% 100%;border:1px solid var(--ln)}
.mapa .raio{position:absolute;left:50%;top:52%;width:62%;aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%;background:rgba(var(--ac-rgb),.13);border:2px dashed var(--ac2)}
.mapa .pino{position:absolute;left:50%;top:52%;width:30px;height:30px;transform:translate(-50%,-100%) rotate(-45deg);transform-origin:center;border-radius:50% 50% 50% 0;background:var(--ac);box-shadow:0 6px 12px -4px rgba(0,0,0,.4)}
.mapa .pino::after{content:"";position:absolute;inset:9px;border-radius:50%;background:#fff}
.mapa .nomep{position:absolute;left:50%;top:52%;transform:translate(-50%,-185%);background:#fff;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:800;white-space:nowrap;box-shadow:0 4px 10px -4px rgba(0,0,0,.3)}
.mapa .rot{position:absolute;right:10px;bottom:10px;background:var(--gr);color:#fff;border-radius:999px;padding:5px 11px;font-size:12px;font-weight:800}
.mapa .rede{position:absolute;left:10px;top:10px;background:#fff;border-radius:999px;padding:5px 11px;font-size:12px;font-weight:800;color:var(--tx2)}
.nums{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
.nums div{background:var(--bg);border-radius:14px;padding:12px}
.nums b{display:block;font-family:var(--f-dis);font-variation-settings:'opsz' 96,'wdth' 85;font-size:34px;line-height:1;color:var(--ac)}
.nums span{display:block;font-size:13px;color:var(--mu);margin-top:4px}

/* 4 celular */
.cel{position:relative;max-width:360px;width:100%;margin:0 auto;background:#141518;border-radius:38px;padding:9px;box-shadow:0 30px 60px -30px rgba(0,0,0,.6)}
.tela{background:var(--wa);border-radius:30px;overflow:hidden}
.wa-top{display:flex;align-items:center;gap:10px;background:var(--wa-top);padding:11px 14px;border-bottom:1px solid #e3e3e3}
.wa-top .av{width:34px;height:34px;border-radius:50%;background:var(--gr);color:var(--claro);display:grid;place-items:center;font-weight:800;font-size:12.5px;flex:none;overflow:hidden}
.wa-top .av img{width:34px;height:34px;object-fit:cover}
.wa-top b{display:block;font-size:14.5px;color:var(--wa-tx);line-height:1.2}
.wa-top small{display:block;font-size:11.5px;color:var(--wa-mu)}
.wa-msgs{padding:12px 10px 14px;display:flex;flex-direction:column;gap:6px;background-image:radial-gradient(rgba(0,0,0,.035) 1px,transparent 1px);background-size:14px 14px}
.bal{max-width:86%;padding:7px 10px 6px;border-radius:10px;font-size:14px;line-height:1.38;color:var(--wa-tx);box-shadow:0 1px 1px rgba(0,0,0,.08)}
.bal .h{display:flex;justify-content:flex-end;align-items:center;gap:3px;font-size:10.5px;color:var(--wa-mu);margin-top:2px}
.bal .tk{width:16px;height:11px;color:var(--wa-tk)}
.bal.c{align-self:flex-start;background:var(--wa-in);border-top-left-radius:3px}
.bal.e{align-self:flex-end;background:var(--wa-out);border-top-right-radius:3px}
.bal.foto .anexo{display:flex;align-items:center;gap:8px;background:rgba(0,0,0,.05);border-radius:8px;padding:9px 12px;font-weight:700}
.bal.foto .anexo .ico{width:19px;height:19px;color:var(--wa-mu)}
.selo1{position:absolute;top:-14px;right:8px;z-index:2;display:inline-flex;align-items:center;gap:6px;background:var(--ok);color:#fff;border-radius:999px;padding:7px 12px;font-size:13px;font-weight:800;box-shadow:0 10px 20px -10px rgba(0,0,0,.5)}
.selo1 .ico{width:16px;height:16px}

/* 5 retomada */
.linha{list-style:none;display:grid;gap:0}
.linha li{display:grid;grid-template-columns:22px 1fr;gap:12px;position:relative;padding-bottom:14px}
.linha li::before{content:"";position:absolute;left:10px;top:22px;bottom:0;width:2px;background:var(--ln2)}
.linha li:last-child::before{display:none}
.linha .pt{width:22px;height:22px;border-radius:50%;background:var(--ac);border:4px solid var(--ac-bg);margin-top:2px}
.linha small{display:block;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--ac)}
.notif{display:flex;gap:10px;align-items:flex-start;background:#fff;border:1px solid var(--ln);border-radius:16px;padding:10px 12px;margin-top:6px;box-shadow:0 8px 18px -12px rgba(0,0,0,.35)}
.notif .app{flex:none;width:30px;height:30px;border-radius:8px;background:#25d366;color:#fff;display:grid;place-items:center}
.notif .app .ico{width:18px;height:18px}
.notif b{display:block;font-size:13px}
.notif span{display:block;font-size:14px;color:var(--tx2);line-height:1.35}

/* 6 recado */
.rec{position:relative;border-radius:20px;overflow:hidden;padding:56px 14px 18px;background:var(--gr)}
.rec>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.55}
.rec .hora{position:relative;text-align:center;color:#fff;font-family:var(--f-dis);font-variation-settings:'opsz' 96,'wdth' 85;font-weight:700;font-size:44px;line-height:1;margin-top:-34px;margin-bottom:14px;text-shadow:0 2px 12px rgba(0,0,0,.4)}
.rec .notif{position:relative;margin:0 auto;max-width:380px}
.rec .bt{position:relative;display:flex;gap:6px;max-width:380px;margin:6px auto 0}
.rec .bt span{flex:1;text-align:center;background:rgba(255,255,255,.95);border-radius:10px;padding:8px 6px;font-size:13.5px;font-weight:800;color:#027eb5}

/* 7 funil */
.funil{display:grid;gap:6px}
.funil div{display:flex;justify-content:space-between;align-items:center;gap:10px;border-radius:12px;padding:11px 14px;background:rgba(var(--ac-rgb),.12);margin-inline:auto;width:100%}
.funil div:nth-child(2){width:88%;background:rgba(var(--ac-rgb),.2)}
.funil div:nth-child(3){width:76%;background:rgba(var(--ac-rgb),.3)}
.funil div:nth-child(4){width:64%;background:var(--ac);color:#fff}
.funil span{font-size:13.5px;font-weight:700}
.funil b{font-family:var(--f-dis);font-variation-settings:'opsz' 96,'wdth' 85;font-size:24px;line-height:1}
.decide{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:12px}
.decide span{font-size:13px;font-weight:800;border-radius:999px;padding:5px 11px}
.decide .sim{background:var(--ok-bg);color:var(--ok)}
.decide .nao{background:var(--no-bg);color:var(--no)}

/* 8 você no comando */
.cmd{display:grid;gap:10px}
.cmd .mini{background:var(--wa);border-radius:18px;overflow:hidden;border:1px solid var(--ln)}
.cmd .bts{display:flex;gap:6px;padding:0 10px 12px}
.cmd .bts span{flex:1;text-align:center;border-radius:10px;padding:9px 6px;font-size:14px;font-weight:800;background:#fff;color:#027eb5}
.cmd .bts span:first-child{background:var(--ok);color:#fff}
.relat{background:var(--s1);border:1px solid var(--ln);border-radius:18px;padding:14px 16px}
.relat small{font-size:11.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--ac)}
.relat dl{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px}
.relat dt{font-size:11.5px;color:var(--mu);line-height:1.2}
.relat dd{font-family:var(--f-dis);font-variation-settings:'opsz' 96,'wdth' 85;font-weight:800;font-size:24px;line-height:1.1}
.relat p{font-size:13.5px;font-weight:700;color:var(--tx2);margin-top:8px;border-top:1px dashed var(--ln2);padding-top:8px}

/* conteúdo: perfil do Instagram */
.ig{background:#fff;border:1px solid var(--ln);border-radius:18px;overflow:hidden;max-width:420px;margin:0 auto}
.ig-top{display:flex;gap:10px;align-items:center;padding:12px}
.ig-top .av{width:44px;height:44px;border-radius:50%;padding:2px;background:linear-gradient(45deg,#f9a03f,#e8590c,#c2255c);display:grid;place-items:center;flex:none;color:#fff;font-weight:800;font-size:13px;box-shadow:inset 0 0 0 3px #fff}
.ig-top b{display:block;font-size:14.5px}
.ig-top span{display:block;font-size:12px;color:var(--mu)}
.ig-grade{display:grid;grid-template-columns:repeat(3,1fr);gap:2px}
.ig-grade div{position:relative;aspect-ratio:1}
.ig-grade img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.ig-grade .rl{position:absolute;top:6px;right:6px;color:#fff;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))}
.ig-grade .rl svg{width:18px;height:18px}
.pra-equipe .pt{background:var(--ok);border-color:var(--ok-bg)}
.pra-equipe small{color:var(--ok)}
.pra-equipe .notif{border-color:#bfe6cb;background:var(--ok-bg)}
.pra-equipe .notif .app{background:var(--ok)}
.cmd1{max-width:420px;margin:0 auto}
.cmd1 .mini{background:var(--wa);border-radius:18px;overflow:hidden;border:1px solid var(--ln)}
.cmd1 .bts{display:flex;gap:6px;padding:0 10px 12px}
.cmd1 .bts span{flex:1;text-align:center;border-radius:10px;padding:9px 6px;font-size:14px;font-weight:800;background:#fff;color:#027eb5}
.cmd1 .bts span:first-child{background:var(--ok);color:#fff}

/* sem x com */
.vs{display:grid;gap:12px}
.vs>div{border-radius:24px;padding:22px 20px}
.vs .sem{background:var(--s2);color:var(--tx2)}
.vs .com{background:var(--gr);color:#fff}
.vs h3{font-size:26px}
.vs .com h3{color:var(--claro)}
.vs ul{list-style:none;display:grid;gap:10px;margin-top:14px}
.vs li{display:flex;gap:10px;align-items:flex-start;font-size:16px;font-weight:600}
.vs li .ico{width:20px;height:20px;margin-top:2px}
.vs .sem .ico{color:var(--fa)}
.vs .com .ico{color:var(--claro)}

/* oferta */
.card-of{max-width:820px;margin:0 auto;background:var(--s1);border:1px solid var(--ln);border-radius:28px;box-shadow:0 40px 80px -40px rgba(29,31,35,.45);padding:26px 18px}
.card-of h2{text-align:center}
.card-of .sub{text-align:center;font-size:16.5px;color:var(--mu);margin-top:8px}
.vem{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:22px}
.vem div{display:grid;justify-items:center;gap:6px;background:var(--bg);border-radius:14px;padding:12px 4px;font-size:12.5px;font-weight:800;color:var(--tx2);text-align:center}
.vem svg{width:26px;height:26px;color:var(--ac)}
.precos{display:grid;gap:10px;margin-top:22px}
.pr{border:1px solid var(--ln);border-radius:18px;padding:16px 18px;background:var(--bg)}
.pr.um{border:2px solid var(--ac2);background:var(--s1)}
.pr small{display:block;font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--ac)}
.pr .v{display:flex;align-items:baseline;gap:6px;margin-top:4px}
.pr .v b{font-family:var(--f-dis);font-variation-settings:'opsz' 96,'wdth' 85;font-size:clamp(44px,11vw,60px);line-height:.95;letter-spacing:-.03em;white-space:nowrap}
.pr .v span{font-size:17px;font-weight:700;color:var(--tx2)}
.pr p{font-size:14.5px;color:var(--mu);margin-top:6px}
.fora{margin-top:12px;font-size:14px;color:var(--tx2);text-align:center}
.card-of .fim{display:grid;justify-items:center;gap:14px;margin-top:20px}
.card-of .btn{width:100%}

/* dúvidas */
.faq{max-width:780px;margin:0 auto;display:grid;gap:10px}
.faq details{background:var(--s1);border:1px solid var(--ln);border-radius:16px;padding:0 18px}
.faq summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;gap:14px;align-items:center;padding:17px 0;font-weight:800;font-size:16.5px;line-height:1.3}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"";flex:none;width:11px;height:11px;border-right:2.5px solid var(--ac);border-bottom:2.5px solid var(--ac);transform:rotate(45deg) translate(-3px,-3px);transition:transform .2s}
.faq details[open] summary::after{transform:rotate(225deg) translate(-3px,-3px)}
.faq details p{padding:0 0 17px;font-size:15.5px;color:var(--tx2)}

/* final */
.final{padding-block:8px 88px}
.final-card{position:relative;display:grid;gap:18px;border-radius:28px;overflow:hidden;color:#fff;background:var(--gr);text-align:center;justify-items:center;padding:40px 20px 34px}
.final-card>img.fundo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.4}
.final-card::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(22,23,26,.4),rgba(22,23,26,.88))}
.final-card>*:not(.fundo){position:relative;z-index:1}
.final-card .maia{width:84px;height:84px;border-radius:50%;object-fit:cover;border:3px solid #fff}
.final-card h2{font-size:clamp(30px,7vw,46px);max-width:18ch}
.final-card .btn{width:100%;max-width:460px}
.final-card .wa-link{color:rgba(255,255,255,.75)}
.rodape{border-top:1px solid var(--ln);padding-block:26px 120px;font-size:13.5px;color:var(--mu);text-align:center}

/* barra de baixo no celular */
.barra{position:fixed;left:0;right:0;bottom:0;z-index:50;background:rgba(255,255,255,.96);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid var(--ln);padding:10px max(16px,env(safe-area-inset-right,0px)) calc(10px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));display:flex;align-items:center;gap:12px;transform:translateY(110%);transition:transform .25s}
.barra.on{transform:none}
.barra b{flex:1;min-width:0;font-size:15px;line-height:1.2}
.barra .btn{min-height:46px;padding:0 18px;font-size:15px;flex:none}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}.btn,.barra{transition:none}.chips span{animation:none}}

@media (min-width:720px){
  section{padding-block:96px}
  .bl{grid-template-columns:1fr 1.15fr;gap:36px;padding:34px}
  .bl:nth-child(even) .tx{order:2}
  .calv{grid-template-columns:repeat(3,1fr)}
  .ad b{font-size:18px}.ad small{font-size:10.5px}
  .vs{grid-template-columns:1fr 1fr}
  .vs>div{padding:30px}
  .vem{grid-template-columns:repeat(9,1fr)}
  .precos{grid-template-columns:1fr 1fr}
  .card-of{padding:40px}
  .final-card{padding:64px 40px 56px}
  .barra{display:none}
  .rodape{padding-bottom:40px}
}
@media (min-width:980px){
  .hero .ct{grid-template-columns:1.05fr .95fr;align-items:center;gap:48px;padding-block:72px 84px}
  .hero .tx{order:-1}
  .hero-foto{margin:0;border-radius:28px;overflow:visible}
  .hero-foto>img{aspect-ratio:4/5;border-radius:28px}
  .hero-foto::after{display:none}
  .maia-card{position:absolute;margin:0;left:-28px;bottom:28px;max-width:380px}
  .hero h1{margin-top:0}
}
@media (max-width:380px){.topo .nome{display:none}}
`

function bal([q, t, h]) {
  if (q === 'f') return `<div class="bal c foto"><span class="anexo">${ic.foto}${esc(t)}</span><div class="h">${h}</div></div>`
  return `<div class="bal ${q}">${esc(t)}<div class="h">${h}${q === 'e' ? ic.tk : ''}</div></div>`
}

const FAQ = n => [
  ['Funciona fora do Rio Grande do Sul?', 'Sim. Tudo é online, inclusive a implantação, e a campanha roda na sua cidade.'],
  ['Tem fidelidade?', 'Não. É mensal e você cancela quando quiser.'],
  ['A verba de anúncio está inclusa?', 'Não. Você paga direto à Meta, no cartão da empresa. Pra começar, uns R$ 20 a R$ 40 por dia.'],
  ['Preciso trocar meu número de WhatsApp?', 'Não. Ela entra no WhatsApp Business que você já usa, e o seu celular continua recebendo tudo.'],
]

function pagina(n, modo) {
  const V = VISUAL[n.slug]
  const F = V.fotos
  const IMG = modo === 'repo' ? `/maia/nichos/img/${V.pasta}/` : `img/${V.pasta}/`
  const LOGO = modo === 'repo' ? '/imersao/midia/logo.webp' : 'img/logo.webp'
  const MAIA = modo === 'repo' ? '/maia/img/maia-avatar.webp' : 'img/maia.webp'
  const im = (k, alt, extra = 'loading="lazy" decoding="async"', cls = '') => { const [f, w, h] = F[k]; return `<img${cls ? ` class="${cls}"` : ''} src="${IMG}${f}" alt="${esc(alt)}" width="${w}" height="${h}" ${extra}>` }
  const cta = (txt, cls = 'btn') => `<a class="${cls}" href="${esc(DESTINO.url(V))}" data-cta>${txt}</a>`
  const wa = (txt = 'Prefiro falar no WhatsApp') => `<a class="wa-link" href="${esc(WA_LINK(n))}" data-cta data-msg="${esc(n.msg)}" target="_blank" rel="noopener">${ic.zap}${txt}</a>`
  const cor = `:root{--ac:${V.cor.ac};--ac2:${V.cor.ac2};--ac-bg:${V.cor.acBg};--ac-ln:${V.cor.acLn};--claro:${V.cor.claro};--ac-rgb:${V.cor.rgb};--hero-pos:${V.heroPos}}`
  const bloco = (i, rotulo, titulo, linha, visual) => `<article class="bl"><div class="tx"><div class="k"><i>${i}</i><span>${rotulo}</span></div><h3>${titulo}</h3><p>${linha}</p></div><div class="vis">${visual}</div></article>`
  const ok = ic.ok
  const menos = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12"/></svg>'

  const blocos = [
    bloco(1, 'Estratégia', 'Sabe o que anunciar em cada época', `Monta o calendário do ano da ${esc(n.sua)} e escolhe por onde começar.`,
      `<div class="calv">${n.calendario.slice(0, 6).map(([e, , g]) => `<div><small>${esc(e)}</small><b>"${esc(g)}"</b></div>`).join('')}</div>`),
    bloco(2, 'Criação', 'Cria os anúncios do mês', 'Uns 6 vídeos e 6 imagens por mês, com as fotos reais do seu trabalho.',
      `<div class="ads">${V.anuncios.map(([k, o, g]) => `<div class="ad">${im(k, '')}<div><small>${esc(o)}</small><b>${esc(g)}</b></div></div>`).join('')}</div><p class="ex">Exemplos com fotos de banco · na sua conta, as fotos são suas</p>`),
    bloco(3, 'Tráfego', 'Coloca no ar pra sua cidade', `Facebook e Instagram, só pra quem está perto da ${esc(n.sua)}.`,
      `<div class="mapa" role="img" aria-label="Mapa com a ${esc(n.empresa)} no centro e um raio de ${V.raio}"><span class="rede">Facebook · Instagram</span><span class="raio"></span><span class="nomep">${esc(n.empresa)}</span><span class="pino"></span><span class="rot">Raio de ${V.raio}</span></div>
       <div class="nums"><div><b>${V.alcance}</b><span>pessoas por mês</span></div><div><b>${V.conversas}</b><span>conversas no WhatsApp</span></div></div><p class="ex">Exemplo</p>`),
    bloco(4, 'Atendimento', 'Atende o WhatsApp 24 h', `Com o nome da ${esc(n.sua)}, até de noite e no domingo.`,
      `<div class="cel" role="img" aria-label="Conversa de exemplo no WhatsApp da ${esc(n.empresa)}"><span class="selo1">${ok}Respondeu em 1 min</span><div class="tela"><div class="wa-top"><span class="av">${esc(n.sigla)}</span><div><b>${esc(n.empresa)}</b><small>online</small></div></div><div class="wa-msgs">${V.chat.map(bal).join('')}</div></div></div><p class="ex">Exemplo · empresa fictícia</p>`),
    bloco(5, 'Retomada', 'Traz de volta quem sumiu', 'Três lembretes educados. Quem quer fechar vai pra sua equipe, com o resumo pronto.',
      `<ol class="linha">${V.retomada.map(([q, t]) => `<li><span class="pt"></span><div><small>${esc(q)}</small><div class="notif"><span class="app">${ic.zap}</span><div><b>${esc(n.empresa)}</b><span>${esc(t)}</span></div></div></div></li>`).join('')}<li class="pra-equipe"><span class="pt"></span><div><small>Quer fechar</small><div class="notif"><span class="app">${ic.ok}</span><div><b>Pra sua equipe</b><span>${esc(V.fechar)}</span></div></div></div></li></ol>`),
    bloco(6, 'Conteúdo', 'Mantém o seu Instagram vivo', 'Uns 8 posts e 4 vídeos por mês, pra quem vê o anúncio achar um perfil confiável.',
      `<div class="ig" role="img" aria-label="Exemplo de perfil no Instagram com 9 posts"><div class="ig-top"><span class="av">${esc(n.sigla)}</span><div><b>${esc(V.arroba)}</b><span>3 posts por semana · Instagram e Facebook</span></div></div><div class="ig-grade">${V.feed.map((k, i) => `<div>${im(k, '')}${V.reels.includes(i) ? `<span class="rl" aria-label="vídeo">${ic.play}</span>` : ''}</div>`).join('')}</div></div><p class="ex">Exemplo com fotos de banco · na sua conta, as fotos e os vídeos são seus</p>`),
    bloco(7, 'Recado pra base', 'Chama o cliente antigo na hora certa', 'Ela avisa quem já comprou, antes de ele lembrar sozinho.',
      `<div class="rec">${im(V.recadoFoto, '')}<div class="hora">09:30</div><div class="notif"><span class="app">${ic.zap}</span><div><b>${esc(n.empresa)}</b><span>${esc(V.recado)}</span></div></div><div class="bt"><span>Quero</span><span>Não quero receber</span></div></div>`),
    bloco(8, 'Medição', 'Sabe o que vende de verdade', 'Liga cada venda ao anúncio, avisa a Meta quem comprou e repete o que vende.',
      `<div class="funil">${V.funil.map(([t, v]) => `<div><span>${esc(t)}</span><b>${v}</b></div>`).join('')}</div><div class="decide"><span class="sim">${esc(V.repete)}</span><span class="nao">${esc(V.corta)}</span></div>
       <div class="relat" style="margin-top:12px"><small>Relatório todo dia 2</small><dl>${V.relatorio.map(([t, v]) => `<div><dt>${esc(t)}</dt><dd>${v}</dd></div>`).join('')}</dl><p>${esc(V.proximo)}</p></div><p class="ex">Exemplo</p>`),
    bloco(9, 'Você no comando', 'Você só aprova, pelo celular', 'Análise a cada 2 dias no seu WhatsApp. Um toque e vai pro ar. Sem reunião.',
      `<div class="cmd1"><div class="mini"><div class="wa-top"><span class="av"><img src="${MAIA}" alt="" width="34" height="34"></span><div><b>Maia</b><small>sua agência</small></div></div><div class="wa-msgs"><div class="bal c">${esc(V.analise)}<div class="h">08:10</div></div><div class="bal c">${esc(V.aprovar)}<div class="h">08:12</div></div></div><div class="bts"><span>Aprovar</span><span>Ajustar</span></div></div></div><p class="ex">Exemplo</p>`),
  ]

  const corpo = `
<header class="topo">
  <div class="ct">
    <a class="chapa" href="https://carreiranodigital.com" aria-label="Carreira no Digital"><img src="${LOGO}" alt="Carreira no Digital" width="256" height="93"></a>
    <div class="nome"><b>Maia</b> · agência de marketing com IA pra ${esc(n.curto)}</div>
    ${cta('Ver quanto ganho')}
  </div>
</header>
<main>

<section class="hero">
  <div class="ct">
    <div class="hero-foto">
      ${im('hero', V.heroAlt, 'fetchpriority="high" decoding="async"')}
      <div class="maia-card"><img src="${MAIA}" alt="Maia" width="56" height="56"><div><b>Maia, a sua agência</b><div class="chips"><span>Estratégia</span><span>Anúncios</span><span>WhatsApp 24 h</span><span>Retomada</span><span>Recado pra base</span><span>Relatório</span></div></div></div>
    </div>
    <div class="tx">
      <h1>${V.h1}</h1>
      <p class="lead">${esc(V.lead)}</p>
      <div class="acoes">${cta(V.botao)}${wa()}</div>
    </div>
  </div>
</section>

<section id="tudo">
  <div class="ct">
    <div class="cab">
      <span class="olho">Do anúncio à venda</span>
      <h2>Tudo o que a Maia faz pela ${esc(n.sua)}</h2>
    </div>
    <div class="blocos">${blocos.join('\n')}</div>
  </div>
</section>

<section style="padding-top:0">
  <div class="ct vs">
    <div class="sem"><h3>Sem a Maia</h3><ul>${V.sem.map(x => `<li>${menos}<span>${esc(x)}</span></li>`).join('')}</ul></div>
    <div class="com"><h3>Com a Maia</h3><ul>${V.com.map(x => `<li>${ok}<span>${esc(x)}</span></li>`).join('')}</ul></div>
  </div>
</section>

<section id="oferta" style="padding-top:0">
  <div class="ct">
    <div class="card-of">
      <h2>Uma agência inteira, todo mês</h2>
      <p class="sub">Com implantação online, por chamada de vídeo.</p>
      <div class="vem">${[['estrategia', 'Estratégia'], ['anuncios', 'Anúncios'], ['trafego', 'Tráfego'], ['whatsapp', 'WhatsApp'], ['retomada', 'Retomada'], ['conteudo', 'Conteúdo'], ['recado', 'Recado'], ['medicao', 'Medição'], ['relatorio', 'Relatório']].map(([k, t]) => `<div>${icone(k)}${t}</div>`).join('')}</div>
      <div class="precos">
        <div class="pr um"><small>1º mês, com a implantação</small><div class="v"><b>R$ 497</b></div></div>
        <div class="pr"><small>Depois</small><div class="v"><b>R$ 797</b><span>/mês</span></div><p>Sem fidelidade.</p></div>
      </div>
      <p class="fora">Verba de anúncio à parte, paga direto à Meta.</p>
      <div class="fim">${cta(V.botao)}${wa()}</div>
    </div>
  </div>
</section>

<section id="duvidas" style="padding-top:0">
  <div class="ct">
    <div class="faq">${FAQ(n).map(([q, r]) => `<details><summary>${esc(q)}</summary><p>${esc(r)}</p></details>`).join('')}</div>
  </div>
</section>

<section class="final">
  <div class="ct">
    <div class="final-card">
      ${im(V.final, '', 'loading="lazy" decoding="async"', 'fundo')}
      <img class="maia" src="${MAIA}" alt="Maia, a IA de marketing da Carreira no Digital" width="84" height="84" loading="lazy">
      <h2>Descubra em 1 minuto quanto a ${esc(n.sua)} pode ganhar.</h2>
      ${cta(V.botao)}
      ${wa()}
    </div>
  </div>
</section>

</main>
<footer class="rodape"><div class="ct">Maia é a IA de marketing da Carreira no Digital, escola de marketing com IA de Lajeado (RS). Atendemos o Brasil todo.<br>WhatsApp da escola: 51 99505-4548</div></footer>

<div class="barra" id="barra"><b>${esc(V.barra)}</b>${cta('Ver (1 min)')}</div>
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
  // o quiz recebe os mesmos utm/fbclid da página
  function comQs(h){var s=location.search.slice(1);return s?h+(h.indexOf('?')<0?'?':'&')+s:h;}
  [].forEach.call(document.querySelectorAll('a[data-cta]'),function(b){
    // com data-msg o botão vai pro WhatsApp pelo /wa do CRM; sem data-msg (o quiz) vai pro endereço dele, com os utm da página
    var t=(b.textContent||'').replace(/\\s+/g,' ').trim(), m=b.getAttribute('data-msg'), l=m?waLink(m):{url:comQs(b.getAttribute('href')),ev:uid()};
    b.setAttribute('href',l.url);
    b.addEventListener('click',function(){
      track(m?'clique_wa':'clique_quiz',{botao:t.slice(0,40),nicho:NICHO,event_id:l.ev});
      try{if(m&&window.fbq)fbq('track','Lead',{content_name:'Maia',content_category:NICHO},{eventID:l.ev});}catch(e){}
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
