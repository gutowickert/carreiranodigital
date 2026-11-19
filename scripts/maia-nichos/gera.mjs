// Gera as 4 páginas da Maia por nicho.
// node gera.mjs  ->  repo: C:/maia-nichos/public/maia/nichos/<slug>/index.html (com rastreio)
//                    prévia: ./previa/<slug>.html (sem rastreio, imagens relativas, fontes do Google)
import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { NICHOS } from './nichos.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const REPO = join(AQUI, '../../public/maia/nichos')
const WA = '5551995054548'

const ic = {
  zap: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z"/></svg>',
  ok: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  seta: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  foto: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="m21 17-5-5-8 8"/></svg>',
  check2: '<svg class="tk" viewBox="0 0 18 12" aria-hidden="true"><path d="M1 6.5 4.5 10 11 2M7 10l.5.5L15 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
}
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const CSS = `
/* Maia por nicho (18/11/2026). Página clara no padrão da escola: lavanda, branco, roxo da marca,
   Manrope no texto e Bricolage condensada nos títulos e números. Feita primeiro pro celular. Sem tema escuro (pedido do Guto). */
:root{
  --bg:#f7f5fc;--s1:#ffffff;--s2:#f3f0fa;--ln:#e9e4f4;--ln2:#d9d1ee;
  --tx:#17122a;--tx2:#3d3654;--mu:#6e6885;--fa:#9891ad;
  --ac:#6d28d9;--ac2:#7c3aed;--ac-bg:#f1ebfe;--ac-ln:#c4b5fd;
  --ok:#15803d;--ok-bg:#e3f7ea;--at:#b45309;--at-bg:#fdf0d5;
  --wa:#efe7dd;--wa-in:#ffffff;--wa-out:#d9fdd3;--wa-top:#f0f2f5;--wa-tx:#111b21;--wa-mu:#667781;--wa-tk:#53bdeb;
  --f-dis:'Bricolage Grotesque','Manrope',system-ui,sans-serif;
  --f-tx:'Manrope',system-ui,-apple-system,'Segoe UI',sans-serif;
  --sombra:0 1px 2px rgba(23,18,42,.04),0 12px 32px -12px rgba(76,29,149,.16);
  color-scheme:light}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{background:var(--bg);color:var(--tx);font-family:var(--f-tx);font-size:17px;line-height:1.55;-webkit-font-smoothing:antialiased;overflow-x:hidden}
img{display:block;max-width:100%;height:auto}
a{color:inherit}
h1,h2,h3,.dis{font-family:var(--f-dis);font-weight:800;font-variation-settings:'opsz' 96,'wdth' 85;letter-spacing:-.03em;line-height:1.04;text-wrap:balance}
h2{font-size:clamp(30px,7.4vw,48px)}
h3{font-size:21px;letter-spacing:-.02em;line-height:1.15}
.ct{max-width:1120px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
section{padding-block:64px}
.olho{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--ac)}
.lead{font-size:clamp(17px,2.2vw,19px);color:var(--mu);max-width:62ch}
.lead b{color:var(--tx)}
.cab{display:flex;flex-direction:column;gap:12px;margin-bottom:32px}
.ico{width:22px;height:22px;flex:none}
.nota{font-size:13.5px;color:var(--mu);margin-top:14px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:56px;padding:0 24px;border-radius:999px;background:var(--ac2);color:#fff;font-weight:800;font-size:17px;text-decoration:none;border:0;cursor:pointer;box-shadow:0 14px 30px -10px rgba(124,58,237,.55);transition:transform .15s,filter .15s;text-align:center;line-height:1.2}
.btn:hover{transform:translateY(-1px);filter:brightness(1.06)}
.btn:focus-visible,a:focus-visible{outline:3px solid var(--ac);outline-offset:3px}
.btn-sec{background:var(--s1);color:var(--tx);border:1px solid var(--ln2);box-shadow:none}
.btn-sec:hover{filter:none;border-color:var(--ac-ln)}

/* topo */
.topo{position:sticky;top:env(safe-area-inset-top,0px);z-index:40;background:rgba(247,245,252,.9);backdrop-filter:saturate(1.4) blur(14px);-webkit-backdrop-filter:saturate(1.4) blur(14px);border-bottom:1px solid var(--ln)}
body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:41;background:var(--bg)}
.topo .ct{display:flex;align-items:center;gap:12px;min-height:60px}
.chapa{display:inline-flex;align-items:center;background:#17122a;border-radius:10px;padding:7px 10px;flex:none}
.chapa img{height:22px;width:auto}
.topo .nome{flex:1;min-width:0;font-size:14px;font-weight:600;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.topo .nome b{color:var(--tx);font-weight:800}
.topo .btn{min-height:40px;padding:0 16px;font-size:14.5px;box-shadow:none}

/* abertura */
.abre{padding-block:28px 56px;position:relative;overflow:hidden}
.abre::before{content:"";position:absolute;width:620px;height:620px;border-radius:50%;background:radial-gradient(circle,rgba(167,139,250,.34),transparent 65%);top:-280px;right:-260px;pointer-events:none}
.abre .ct{display:grid;gap:36px;position:relative;z-index:1}
.selo{display:inline-flex;align-items:center;gap:10px;background:var(--s1);border:1px solid var(--ac-ln);border-radius:999px;padding:6px 14px 6px 6px;font-size:14px;font-weight:700;color:var(--tx2);box-shadow:var(--sombra);max-width:100%}
.selo i{font-style:normal;background:var(--ac2);color:#fff;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;flex:none}
.selo span{min-width:0}
.abre h1{font-size:clamp(38px,9.6vw,64px);margin-top:18px}
.abre h1 em{font-style:normal;color:var(--ac)}
.abre .lead{margin-top:18px}
.acoes{display:flex;flex-wrap:wrap;gap:12px;margin-top:26px}
.acoes .btn{flex:1 1 230px}
.fatos{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:22px}
.fatos div{background:var(--s1);border:1px solid var(--ln);border-radius:14px;padding:12px 10px;text-align:center}
.fatos b{display:block;font-family:var(--f-dis);font-variation-settings:'opsz' 96,'wdth' 85;font-size:26px;line-height:1;color:var(--ac)}
.fatos span{display:block;font-size:12.5px;line-height:1.3;color:var(--mu);font-weight:600;margin-top:6px}

/* celular com WhatsApp */
.cel{max-width:380px;width:100%;margin:0 auto;background:#17122a;border-radius:38px;padding:10px;box-shadow:0 40px 70px -30px rgba(76,29,149,.55)}
.tela{background:var(--wa);border-radius:30px;overflow:hidden;display:flex;flex-direction:column}
.wa-top{display:flex;align-items:center;gap:10px;background:var(--wa-top);padding:12px 14px;border-bottom:1px solid #e3e3e3}
.wa-top .av{width:36px;height:36px;border-radius:50%;background:var(--ac2);color:#fff;display:grid;place-items:center;font-weight:800;font-size:14px;flex:none}
.wa-top b{display:block;font-size:15px;color:var(--wa-tx);line-height:1.2}
.wa-top small{display:block;font-size:12px;color:var(--wa-mu)}
.wa-msgs{padding:14px 10px 16px;display:flex;flex-direction:column;gap:6px;background-color:var(--wa);background-image:radial-gradient(rgba(0,0,0,.035) 1px,transparent 1px);background-size:14px 14px}
.bal{max-width:84%;padding:7px 10px 6px;border-radius:10px;font-size:14.5px;line-height:1.4;color:var(--wa-tx);box-shadow:0 1px 1px rgba(0,0,0,.08);position:relative}
.bal .h{display:flex;justify-content:flex-end;align-items:center;gap:3px;font-size:11px;color:var(--wa-mu);margin-top:2px}
.bal .tk{width:16px;height:11px;color:var(--wa-tk)}
.bal.c{align-self:flex-start;background:var(--wa-in);border-top-left-radius:3px}
.bal.e{align-self:flex-end;background:var(--wa-out);border-top-right-radius:3px}
.bal.f{align-self:flex-start;background:var(--wa-in);padding:4px;border-top-left-radius:3px}
.bal.f.e{align-self:flex-end;background:var(--wa-out)}
.bal .ph{display:flex;align-items:center;justify-content:center;gap:8px;width:210px;max-width:100%;aspect-ratio:4/3;border-radius:8px;background:repeating-linear-gradient(135deg,#e7e2f3 0 10px,#efebf8 10px 20px);color:var(--mu);font-size:12.5px;font-weight:700;text-align:center;padding:10px}
.bal .ph .ico{width:18px;height:18px}
.bal.f .h{padding:0 6px 2px}
.ex{font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--fa);text-align:center;margin-top:12px}

/* dores */
.dores{background:var(--s1);border-block:1px solid var(--ln)}
.dor-lista{display:grid;gap:14px}
.dor{border:1px solid var(--ln);border-radius:20px;overflow:hidden;background:var(--bg);display:flex;flex-direction:column}
.dor p.q{padding:18px 20px 14px;font-family:var(--f-dis);font-variation-settings:'opsz' 96,'wdth' 88;font-weight:700;font-size:20px;line-height:1.22;letter-spacing:-.015em;color:var(--tx)}
.dor p.q::before{content:"\\201C";color:var(--ac-ln);margin-right:2px}
.dor p.q::after{content:"\\201D";color:var(--ac-ln)}
.dor .r{flex:1;display:flex;gap:12px;align-items:flex-start;padding:14px 20px 18px;background:var(--s1);border-top:1px dashed var(--ln2);font-size:15.5px;color:var(--tx2)}
.dor .r .ico{color:var(--ac);margin-top:2px}

/* como atende */
.jeito{display:grid;gap:12px;counter-reset:j}
.j{background:var(--s1);border:1px solid var(--ln);border-radius:20px;padding:20px;box-shadow:var(--sombra)}
.j .n{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:10px;background:var(--ac-bg);color:var(--ac);font-family:var(--f-dis);font-variation-settings:'opsz' 96,'wdth' 85;font-weight:800;font-size:17px}
.j h3{margin-top:12px}
.j p{font-size:15.5px;color:var(--tx2);margin-top:8px}
.conv{display:grid;gap:22px;margin-top:40px;align-items:start}
.conv .cel{max-width:400px}
.lado{display:grid;gap:14px;min-width:0}
.resumo{background:var(--s1);border:1px solid var(--ac-ln);border-radius:20px;padding:20px;box-shadow:var(--sombra)}
.resumo .olho{font-size:11.5px}
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

/* anúncios */
.anuncios{background:var(--s1);border-block:1px solid var(--ln)}
.ads{display:grid;gap:16px}
.ad{background:var(--s1);border:1px solid var(--ln);border-radius:16px;overflow:hidden;box-shadow:var(--sombra);display:flex;flex-direction:column;min-width:0}
.ad-top{display:flex;align-items:center;gap:8px;padding:10px 12px}
.ad-top i{width:28px;height:28px;border-radius:50%;background:var(--ac-bg);border:1px solid var(--ac-ln);flex:none}
.ad-top b{display:block;font-size:13px;line-height:1.2}
.ad-top small{display:block;font-size:11.5px;color:var(--fa)}
.ad>img{width:100%;aspect-ratio:4/5;object-fit:cover;background:var(--s2)}
.ad-cta{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;font-size:13px;font-weight:700;color:var(--tx2);border-top:1px solid var(--ln);background:var(--s2)}
.ad-cta span:last-child{display:inline-flex;align-items:center;gap:6px;background:var(--s1);border:1px solid var(--ln2);border-radius:8px;padding:5px 9px;white-space:nowrap}
.ad-cta .ico{width:15px;height:15px}
.ad .leg{padding:10px 12px 12px;font-size:13.5px;color:var(--mu);line-height:1.4;border-top:1px solid var(--ln)}
.ad .leg b{color:var(--tx)}
.tag-real{display:inline-block;background:var(--ok-bg);color:var(--ok);border-radius:999px;padding:2px 9px;font-size:11.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px}
.tag-ex{display:inline-block;background:var(--ac-bg);color:var(--ac);border-radius:999px;padding:2px 9px;font-size:11.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px}
/* mockups de texto (sem foto de IA): cada tema é um modelo diferente */
.mk{aspect-ratio:4/5;display:flex;flex-direction:column;justify-content:space-between;gap:14px;padding:22px 20px;position:relative;overflow:hidden}
.mk .mo{font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;display:inline-block;padding:5px 10px;border-radius:6px;align-self:flex-start}
.mk .mg{font-family:var(--f-dis);font-variation-settings:'opsz' 96,'wdth' 85;font-weight:800;font-size:clamp(28px,7.6vw,36px);line-height:1;letter-spacing:0;text-transform:uppercase}
.mk .ms{font-size:15px;line-height:1.4;font-weight:600}
.mk .mc{display:flex;flex-wrap:wrap;gap:6px}
.mk .mc span{font-size:12.5px;font-weight:800;border-radius:999px;padding:4px 10px}
.mk .mb{display:flex;justify-content:space-between;align-items:center;gap:10px}
.mk .mb b{font-size:13px;font-weight:800;letter-spacing:.04em}
.mk .mb span{font-size:13.5px;font-weight:800;border-radius:10px;padding:8px 12px}
.mk .vaga{display:flex;align-items:center;justify-content:center;gap:8px;border:2px dashed currentColor;border-radius:12px;font-size:12.5px;font-weight:800;text-align:center;opacity:.75;padding:10px;flex:1;min-height:90px}
.mk .vaga .ico{width:18px;height:18px}
.mk .duas{display:grid;grid-template-columns:1fr 1fr;gap:8px;flex:1}
.mk .duas .vaga{flex-direction:column}
.mk.escuro{background:#141826;color:#fff}
.mk.escuro .mo{background:#ffd23f;color:#141826}.mk.escuro .mg em{color:#ffd23f;font-style:normal}
.mk.escuro .mc span{border:1.5px solid rgba(255,255,255,.4);color:#fff}.mk.escuro .mb span{background:#ffd23f;color:#141826}
.mk.amarelo{background:#ffd23f;color:#141826}
.mk.amarelo .mo{background:#141826;color:#ffd23f}.mk.amarelo .mc span{background:#fff;color:#141826}.mk.amarelo .mb span{background:#141826;color:#fff}
.mk.madeira{background:#f3e7d6;color:#3b2616}
.mk.madeira .mo{background:#3b2616;color:#f3e7d6}.mk.madeira .mc span{background:#fff;color:#3b2616;border:1px solid #d9c2a4}.mk.madeira .mb span{background:#8a5a2b;color:#fff}
.mk.claro{background:#fff;color:#1d2433;border-bottom:1px solid var(--ln)}
.mk.claro .mo{background:#e8eef7;color:#1d4f91}.mk.claro .mg{color:#1d4f91}.mk.claro .mc span{background:#e8eef7;color:#1d4f91}.mk.claro .mb span{background:#1d4f91;color:#fff}
.mk.antes{background:#101418;color:#fff}
.mk.antes .mo{background:#fff;color:#101418}.mk.antes .mb span{background:#fff;color:#101418}
.mk.antes .vaga{color:#cfd6df}
.mk.aco{background:linear-gradient(160deg,#dfe4ea,#b9c2cc);color:#15202b}
.mk.aco .mo{background:#15202b;color:#fff}.mk.aco .mc span{background:#fff;color:#15202b}.mk.aco .mb span{background:#e3572b;color:#fff}
.mk.agua{background:#e6f6f4;color:#0f3d3a}
.mk.agua .mo{background:#0f766e;color:#fff}.mk.agua .mg{color:#0f766e}.mk.agua .mc span{background:#fff;color:#0f3d3a;border:1px solid #a7ddd7}.mk.agua .mb span{background:#0f766e;color:#fff}

/* o mês */
.mes{display:grid;gap:12px}
.it{display:flex;gap:14px;align-items:flex-start;background:var(--s1);border:1px solid var(--ln);border-radius:18px;padding:18px}
.it .n{flex:none;width:40px;height:40px;border-radius:12px;background:var(--ac-bg);color:var(--ac);display:grid;place-items:center;font-family:var(--f-dis);font-variation-settings:'opsz' 96,'wdth' 85;font-weight:800;font-size:16px}
.it h3{font-size:18.5px}
.it p{font-size:15px;color:var(--mu);margin-top:4px}
.dono{display:grid;gap:18px;margin-top:28px;background:var(--s1);border:1px solid var(--ac-ln);border-radius:24px;padding:20px;box-shadow:var(--sombra)}
.dono .tx p{font-size:16px;color:var(--tx2);margin-top:10px}
.dono .tx h3{font-size:26px}
.mini{background:var(--wa);border-radius:18px;overflow:hidden}
.mini .wa-top .av{background:none;padding:0;overflow:hidden}
.mini .wa-top .av img{width:36px;height:36px;object-fit:cover}

/* calendário */
.cal{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.cal div{background:var(--s1);border:1px solid var(--ln);border-radius:16px;padding:14px 16px;min-width:0}
.cal b{display:block;font-family:var(--f-dis);font-variation-settings:'opsz' 96,'wdth' 85;font-size:19px;line-height:1.1;color:var(--ac)}
.cal span{display:block;font-size:14.5px;color:var(--tx2);margin-top:6px;line-height:1.35}

/* prova */
.prova{display:grid;gap:18px;background:var(--s1);border:1px solid var(--ln);border-radius:24px;padding:22px 20px;box-shadow:var(--sombra)}
.prova h3{font-size:26px}
.prova p{font-size:16px;color:var(--tx2);margin-top:8px}
.nums{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.nums div{background:var(--bg);border-radius:14px;padding:14px 12px}
.nums b{display:block;font-family:var(--f-dis);font-variation-settings:'opsz' 96,'wdth' 85;font-size:32px;line-height:1;color:var(--ac);font-variant-numeric:tabular-nums}
.nums span{display:block;font-size:13px;color:var(--mu);margin-top:6px;line-height:1.3}

/* amostra */
.amostra{background:linear-gradient(180deg,var(--ac-bg),var(--bg))}
.recebe{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.recebe div{background:var(--s1);border:1px solid var(--ac-ln);border-radius:18px;padding:16px;min-width:0}
.recebe b{display:block;font-family:var(--f-dis);font-variation-settings:'opsz' 96,'wdth' 85;font-size:40px;line-height:1;color:var(--ac)}
.recebe strong{display:block;font-size:16px;margin-top:6px}
.recebe span{display:block;font-size:14px;color:var(--mu);margin-top:4px;line-height:1.35}
.recebe .larga{grid-column:1/-1}
.pedir{display:grid;gap:10px;margin-top:22px}
.pedir div{display:flex;gap:12px;align-items:flex-start;background:var(--s1);border:1px solid var(--ln);border-radius:16px;padding:14px 16px;font-size:15.5px;color:var(--tx2)}
.pedir div b{color:var(--tx)}
.pedir .k{flex:none;width:30px;height:30px;border-radius:50%;background:var(--ac2);color:#fff;display:grid;place-items:center;font-weight:800;font-size:14px}

/* como começa */
.linha{list-style:none;display:grid;gap:0}
.passo{display:grid;grid-template-columns:44px 1fr;gap:16px;position:relative;padding-bottom:24px}
.passo::before{content:"";position:absolute;left:21px;top:44px;bottom:0;width:2px;background:var(--ln2)}
.passo:last-child::before{display:none}
.passo .bola{width:44px;height:44px;border-radius:50%;background:var(--ac2);color:#fff;display:grid;place-items:center;font-family:var(--f-dis);font-variation-settings:'opsz' 96,'wdth' 85;font-weight:800;font-size:18px;position:relative;z-index:1}
.passo .tag{display:inline-block;font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--ac);margin-bottom:4px}
.passo p{font-size:15.5px;color:var(--mu);margin-top:6px}
.passo ul{list-style:none;display:grid;gap:6px;margin-top:10px}
.passo li{display:flex;gap:8px;font-size:15px;color:var(--tx2)}
.passo li .ico{width:18px;height:18px;color:var(--ok);margin-top:3px}
.passo .sai{display:inline-flex;gap:8px;align-items:center;margin-top:10px;background:var(--ok-bg);color:var(--ok);border-radius:999px;padding:5px 12px;font-size:13.5px;font-weight:700}
.passo .sai .ico{width:16px;height:16px}

/* oferta */
.card-of{max-width:760px;margin:0 auto;background:var(--s1);border:1px solid var(--ln);border-radius:28px;box-shadow:0 40px 80px -40px rgba(76,29,149,.45);overflow:hidden}
.of-cab{background:var(--ac-bg);padding:20px;border-bottom:1px solid var(--ac-ln)}
.of-cab h3{font-size:26px;margin-top:6px}
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
.final-card{display:grid;gap:20px;background:var(--s1);border:1px solid var(--ac-ln);border-radius:28px;padding:24px 20px;box-shadow:var(--sombra);text-align:center;justify-items:center}
.final-card img{width:88px;height:88px;border-radius:50%;object-fit:cover;border:3px solid var(--ac-bg)}
.final-card h2{font-size:clamp(30px,7vw,44px)}
.final-card .lead{margin-inline:auto}
.final-card .btn{width:100%;max-width:420px}
.rodape{border-top:1px solid var(--ln);padding-block:26px 120px;font-size:13.5px;color:var(--mu);text-align:center}

/* barra de baixo no celular */
.barra{position:fixed;left:0;right:0;bottom:0;z-index:50;background:rgba(255,255,255,.95);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid var(--ln);padding:10px max(16px,env(safe-area-inset-right,0px)) calc(10px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));display:flex;align-items:center;gap:12px;transform:translateY(110%);transition:transform .25s}
.barra.on{transform:none}
.barra .q{flex:1;min-width:0;line-height:1.2}
.barra .q b{display:block;font-size:15px;font-weight:800}
.barra .q span{display:block;font-size:12.5px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.barra .btn{min-height:46px;padding:0 18px;font-size:15px;flex:none}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}.btn,.barra{transition:none}}

@media (min-width:720px){
  section{padding-block:96px}
  .dor-lista,.jeito,.mes{grid-template-columns:repeat(2,1fr)}
  .ads{grid-template-columns:repeat(3,1fr)}
  .cal{grid-template-columns:repeat(4,1fr)}
  .recebe{grid-template-columns:repeat(4,1fr)}
  .prova{grid-template-columns:1fr 1fr;align-items:center;padding:30px}
  .dono{grid-template-columns:1fr 1fr;align-items:center;padding:28px}
  .precos{grid-template-columns:1fr 1fr}
  .of-cab{padding:24px 32px}.of-corpo{padding:30px 32px 32px}
  .final-card{padding:44px 40px}
  .barra{display:none}
  .rodape{padding-bottom:40px}
}
@media (min-width:980px){
  .abre{padding-block:56px 88px}
  .abre .ct{grid-template-columns:1.1fr .9fr;gap:56px;align-items:center}
  .dor-lista{grid-template-columns:repeat(4,1fr)}
  .jeito{grid-template-columns:repeat(4,1fr)}
  .conv{grid-template-columns:400px 1fr;gap:40px}
  .lado{grid-template-columns:1fr 1fr}
  .mes{grid-template-columns:repeat(4,1fr)}
}
@media (max-width:380px){.topo .nome{display:none}.fatos b{font-size:22px}}
`

function bal([q, t, h], i) {
  if (q === 'f') return `<div class="bal f"><div class="ph">${ic.foto}<span>${esc(t)}</span></div><div class="h">${h}</div></div>`
  return `<div class="bal ${q}">${esc(t)}<div class="h">${h}${q === 'e' ? ic.check2 : ''}</div></div>`
}
function celular(n, msgs, rotulo) {
  return `<div class="cel" role="img" aria-label="${esc(rotulo)}"><div class="tela">
    <div class="wa-top"><span class="av">${esc(n.empresa.split(' ').map(p => p[0]).join('').slice(0, 2))}</span><div><b>${esc(n.empresa)}</b><small>online</small></div></div>
    <div class="wa-msgs">${msgs.map(bal).join('')}</div>
  </div></div>`
}
function anuncio(a) {
  const top = `<div class="ad-top"><i></i><div><b>${esc(a.marca || 'Sua empresa')}</b><small>Patrocinado</small></div></div>`
  if (a.img) return `<article class="ad">${top}<img src="{{IMG}}${a.img}" alt="${esc(a.alt)}" width="720" height="900" loading="lazy"><div class="ad-cta"><span>Fale no WhatsApp</span><span>${ic.zap}Enviar mensagem</span></div><p class="leg"><span class="tag-real">Real</span><br>${esc(a.real)}</p></article>`
  let meio
  if (a.tema === 'antes') {
    meio = `<div class="duas"><div class="vaga">${ic.foto}<span>ANTES<br>foto real sua</span></div><div class="vaga">${ic.foto}<span>DEPOIS<br>foto real sua</span></div></div>`
  } else {
    meio = `<p class="ms">${esc(a.sub)}</p>${a.chips ? `<div class="mc">${a.chips.map(c => `<span>${esc(c)}</span>`).join('')}</div>` : ''}`
  }
  return `<article class="ad">${top}<div class="mk ${a.tema}">
    <span class="mo">${esc(a.olho)}</span>
    <p class="mg">${esc(a.gancho)}</p>
    ${meio}
    ${a.tema === 'antes' ? `<p class="ms">${esc(a.sub)}</p>` : ''}
    <div class="mb"><b>${esc(a.marca)}</b><span>${esc(a.cta)}</span></div>
  </div><div class="ad-cta"><span>Fale no WhatsApp</span><span>${ic.zap}Enviar mensagem</span></div><p class="leg"><span class="tag-ex">Exemplo</span><br>Modelo de anúncio pro seu ramo. Na amostra, ele sai com as fotos reais do seu trabalho, a sua logo e as suas cores.</p></article>`
}

const MES = [
  ['Atende no WhatsApp, todo dia', 'Com o nome da sua empresa e no seu jeito de falar, a qualquer hora, inclusive à noite e no fim de semana.'],
  ['Retoma quem pediu orçamento e sumiu', 'No dia seguinte, em 3 dias e em 6 dias, com despedida educada no fim. Ninguém fica esquecido.'],
  ['Cria e roda a campanha', 'Até 6 vídeos e 6 imagens de anúncio por mês, no Facebook e no Instagram, com as fotos reais do seu trabalho.'],
  ['Faz os posts do mês', '12 posts pro Instagram: carrossel, imagem e vídeo, com conteúdo que dá confiança pra quem chega pelo anúncio.'],
  ['Analisa os números a cada 2 dias', 'Vê o que traz conversa e orçamento, pausa o que não funciona e reforça o que vende.'],
  ['Relatório todo dia 2', 'O mês inteiro numa página: conversas, orçamentos, vendas e o que muda no mês seguinte.'],
  ['Você aprova tudo pelo WhatsApp', 'Anúncio, post e mudança de rumo chegam no seu WhatsApp. Um "aprovado" e vai pro ar. Tem também um painel com os resultados.'],
  ['Um especialista confere', 'Gente da escola revisa o que a Maia cria antes de ir pro ar, e acompanha a sua conta.'],
]

const FAQ = n => [
  ['É um robô? Meu cliente vai perceber?', `A Maia é uma inteligência artificial, mas atende com o nome da ${n.sua} e no seu jeito de falar, que ela aprende com o seu Instagram e na implantação. Se o cliente perguntar se é robô, ela fala a verdade: é a assistente virtual da empresa. Quando o cliente quer fechar ou tem uma dúvida que ela não sabe, ela passa a conversa pra você ou pro seu time, com o resumo pronto.`],
  ['Preciso entender de tecnologia?', 'Não. Você fala com a Maia pelo WhatsApp, como fala com um funcionário. Na implantação, a nossa equipe conecta as contas junto com você, numa chamada de vídeo com a tela compartilhada. Depois disso, você só aprova e responde quando ela te chama.'],
  ['Quanto preciso investir em anúncio?', 'A verba é sua e você paga direto à Meta (Facebook e Instagram), no seu cartão ou no Pix, sem passar pela gente. Pra começar, o comum é entre R$ 20 e R$ 40 por dia. A Maia te mostra a cada 2 dias quanto custou cada conversa e cada orçamento, e diz se vale subir ou baixar. Responder quem chamou no WhatsApp não custa nada; só a retomada depois de 24 horas tem uma taxa da Meta, de uns R$ 0,40 por mensagem.'],
  ['Tem fidelidade?', 'Não. É mensal e você cancela quando quiser. Quem segura o cliente aqui é o resultado que aparece no relatório.'],
  ['Funciona fora do Rio Grande do Sul?', 'Funciona no Brasil todo. A escola fica em Lajeado (RS), mas tudo é online: a amostra chega pelo WhatsApp, a implantação é em 2 chamadas de vídeo e a campanha roda na sua cidade e na sua região.'],
  ['Eu já atendo no WhatsApp. Perco o meu número?', 'Não. O número continua o seu e o celular continua recebendo as mensagens. A Maia atende junto, e você entra na conversa quando quiser.'],
]

function pagina(n, modo) {
  const IMG = modo === 'repo' ? '/maia/nichos/img/' : 'img/'
  const LOGO = modo === 'repo' ? '/imersao/midia/logo.webp' : 'img/logo.webp'
  const MAIA = modo === 'repo' ? '/maia/img/maia-avatar.webp' : 'img/maia.webp'
  const wa = `https://wa.me/${WA}?text=${encodeURIComponent(n.msg)}`
  const cta = (txt, cls = 'btn') => `<a class="${cls}" href="${wa}" data-cta data-msg="${esc(n.msg)}" target="_blank" rel="noopener">${ic.zap}${txt}</a>`

  const corpo = `
<header class="topo">
  <div class="ct">
    <a class="chapa" href="https://carreiranodigital.com" aria-label="Carreira no Digital"><img src="${LOGO}" alt="Carreira no Digital" width="256" height="93"></a>
    <div class="nome"><b>Maia</b> · a IA de marketing pra ${esc(n.curto)}</div>
    ${cta('Amostra grátis')}
  </div>
</header>
<main>

<section class="abre">
  <div class="ct">
    <div>
      <span class="selo"><i>Maia</i><span>${esc(n.selo)}</span></span>
      <h1>${n.h1}</h1>
      <p class="lead">${n.lead}</p>
      <div class="acoes">
        ${cta('Quero a amostra grátis')}
        <a class="btn btn-sec" href="#conversa">Ver como ela atende</a>
      </div>
      <div class="fatos">
        <div><b>1 dia</b><span>pra amostra grátis chegar</span></div>
        <div><b>24 h</b><span>atendendo no seu WhatsApp</span></div>
        <div><b>48 h</b><span>pra campanha ir pro ar</span></div>
      </div>
    </div>
    <div>
      ${celular(n, n.heroChat, `Exemplo de conversa no WhatsApp da ${n.empresa}`)}
      <p class="ex">Exemplo de conversa · empresa fictícia</p>
    </div>
  </div>
</section>

<section class="dores">
  <div class="ct">
    <div class="cab">
      <span class="olho">Você conhece isso</span>
      <h2>O que faz ${esc(n.sua)} perder serviço todo mês</h2>
    </div>
    <div class="dor-lista">
      ${n.dores.map(([q, r]) => `<div class="dor"><p class="q">${esc(q)}</p><p class="r">${ic.seta}<span>${esc(r)}</span></p></div>`).join('')}
    </div>
  </div>
</section>

<section id="conversa">
  <div class="ct">
    <div class="cab">
      <span class="olho">No jeito ${esc(n.daSua)}</span>
      <h2>Como a Maia atende o seu cliente</h2>
      <p class="lead">Ela não é um robô de menu. Ela conversa, pergunta o que o seu time precisa saber e só passa a conversa adiante quando está pronta.</p>
    </div>
    <div class="jeito">
      ${n.jeito.map(([t, p], i) => `<div class="j"><span class="n">${i + 1}</span><h3>${esc(t)}</h3><p>${esc(p)}</p></div>`).join('')}
    </div>
    <div class="conv">
      <div>
        ${celular(n, n.conversa, `Conversa completa de exemplo no WhatsApp da ${n.empresa}`)}
        <p class="ex">Exemplo · os preços e prazos são os seus, ensinados na implantação</p>
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

<section class="anuncios">
  <div class="ct">
    <div class="cab">
      <span class="olho">Facebook e Instagram</span>
      <h2>Os anúncios que ela faz pra ${esc(n.curto)}</h2>
      <p class="lead">O gancho fala com quem já está com o problema e quer resolver. A foto é sempre do seu trabalho de verdade. Nada de imagem de banco ou feita por IA.</p>
    </div>
    <div class="ads">${n.anuncios.map(anuncio).join('').replaceAll('{{IMG}}', IMG)}</div>
    <p class="nota">Os anúncios só aparecem no Facebook e no Instagram, pra quem está na sua cidade e na sua região. Preço não vai no anúncio: ele aparece na conversa, depois do valor.</p>
  </div>
</section>

<section>
  <div class="ct">
    <div class="cab">
      <span class="olho">Todo mês</span>
      <h2>Uma agência de marketing inteira, dentro do seu WhatsApp</h2>
      <p class="lead">Estrategista, designer, social media, gestora de tráfego, atendente e analista. Tudo isso é a Maia.</p>
    </div>
    <div class="mes">
      ${MES.map(([t, p], i) => `<div class="it"><span class="n">${i + 1}</span><div><h3>${esc(t)}</h3><p>${esc(p)}</p></div></div>`).join('')}
    </div>
    <div class="dono">
      <div class="tx">
        <span class="olho">Você e a Maia</span>
        <h3>Com você, ela é a Maia. Com o seu cliente, ela é a ${esc(n.sua)}.</h3>
        <p>Você conversa com ela pelo WhatsApp: aprova o que ela criou, pergunta como estão os números e manda foto do trabalho novo pra virar anúncio. Ela responde na hora.</p>
      </div>
      <div>
        <div class="mini" role="img" aria-label="Exemplo de conversa entre a Maia e o dono do negócio">
          <div class="wa-top"><span class="av"><img src="${MAIA}" alt="" width="36" height="36"></span><div><b>Maia</b><small>sua agência</small></div></div>
          <div class="wa-msgs">${n.dono.map(([q, t]) => `<div class="bal ${q === 'm' ? 'c' : 'e'}">${esc(t)}<div class="h">08:1${q === 'm' ? '2' : '4'}${q === 'd' ? ic.check2 : ''}</div></div>`).join('')}</div>
        </div>
        <p class="ex">Exemplo</p>
      </div>
    </div>
  </div>
</section>

<section style="padding-top:0">
  <div class="ct">
    <div class="cab">
      <span class="olho">O calendário ${esc(n.daSua)}</span>
      <h2>Ela muda o foco conforme a época</h2>
    </div>
    <div class="cal">${n.calendario.map(([b, s]) => `<div><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join('')}</div>
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

<section class="amostra" id="amostra">
  <div class="ct">
    <div class="cab">
      <span class="olho">Amostra grátis</span>
      <h2>Veja a Maia trabalhando pra ${esc(n.sua)} antes de decidir</h2>
      <p class="lead">Você manda o material hoje. No dia seguinte, chega no seu WhatsApp:</p>
    </div>
    <div class="recebe">
      <div><b>2</b><strong>anúncios</strong><span>com as fotos do seu trabalho, a sua logo e as suas cores</span></div>
      <div><b>1</b><strong>vídeo</strong><span>com locução e legenda, pronto pra anunciar</span></div>
      <div><b>9</b><strong>posts</strong><span>pro seu Instagram, cada um num modelo</span></div>
      <div><b>1</b><strong>olhar de fora</strong><span>o que vimos no seu Instagram e onde está a oportunidade</span></div>
      <div class="larga"><strong>E o teste ao vivo</strong><span>Você manda mensagem como se fosse um cliente, e a Maia te atende como se fosse a ${esc(n.sua)}. Pergunta preço, some, volta. Veja como ela se sai.</span></div>
    </div>
    <div class="pedir">
      <div><span class="k">1</span><span><b>Chama no WhatsApp</b> pelo botão abaixo. A mensagem já vai pronta.</span></div>
      <div><span class="k">2</span><span><b>Manda fotos e vídeos do seu trabalho</b> (${esc(n.amostraEx)}). Não tem? <b>Manda só o @ do Instagram</b>.</span></div>
      <div><span class="k">3</span><span><b>No dia seguinte</b>, a amostra chega no seu WhatsApp. Sem compromisso.</span></div>
    </div>
    <div class="acoes">${cta('Quero a amostra grátis')}</div>
  </div>
</section>

<section>
  <div class="ct">
    <div class="cab">
      <span class="olho">Como começa</span>
      <h2>Três passos, tudo online</h2>
    </div>
    <ol class="linha">
      <li class="passo"><span class="bola">1</span><div><span class="tag">Hoje</span><h3>Amostra grátis</h3><p>Você manda fotos, vídeos ou só o @ do Instagram. No dia seguinte recebe 2 anúncios, 1 vídeo e 9 posts feitos pra ${esc(n.sua)}.</p></div></li>
      <li class="passo"><span class="bola">2</span><div><span class="tag">No mesmo dia</span><h3>Teste a Maia atendendo</h3><p>Você conversa com ela como se fosse um cliente e vê como ela atende com o nome da ${esc(n.sua)}.</p></div></li>
      <li class="passo"><span class="bola">3</span><div><span class="tag">Gostou</span><h3>Implantação online, em 2 chamadas</h3>
        <ul>
          <li>${ic.ok}<span><b>Chamada 1, técnica (uns 60 min):</b> a nossa equipe conecta com você o Instagram, a página do Facebook, a conta de anúncio e o WhatsApp, com a tela compartilhada.</span></li>
          <li>${ic.ok}<span><b>Chamada 2, treino (uns 60 min):</b> você ensina a Maia: serviços, preços, prazos, até onde dá desconto e quando ela passa a conversa pra você. Aprova o primeiro lote de anúncios.</span></li>
        </ul>
        <span class="sai">${ic.ok}Campanha no ar em até 48 h depois da 2ª chamada</span></div></li>
    </ol>
  </div>
</section>

<section class="oferta" id="oferta" style="padding-top:0">
  <div class="ct">
    <div class="card-of">
      <div class="of-cab">
        <span class="olho">A oferta</span>
        <h3>A Maia trabalhando pra ${esc(n.sua)}, todo mês</h3>
      </div>
      <div class="of-corpo">
        <ul class="inclui">
          <li>${ic.ok}<span><b>Atendimento no WhatsApp todo dia</b>, com o nome da sua empresa, e retomada de quem sumiu</span></li>
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
        <p class="fora"><b>A verba de anúncio é à parte</b> e você paga direto à Meta, no seu cartão ou no Pix. A conta de anúncio e o número ficam no nome da sua empresa.</p>
        ${cta('Começar pela amostra grátis')}
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
      <img src="${MAIA}" alt="Maia, a IA de marketing da Carreira no Digital" width="88" height="88">
      <h2>Amanhã você já pode ver a Maia trabalhando pra ${esc(n.sua)}.</h2>
      <p class="lead">Chama no WhatsApp, manda as fotos ou só o @ do Instagram, e a amostra chega no dia seguinte. De graça.</p>
      ${cta('Quero a amostra grátis')}
    </div>
  </div>
</section>

</main>
<footer class="rodape"><div class="ct">Maia é a IA de marketing da Carreira no Digital, escola de marketing com IA de Lajeado (RS). Atendemos o Brasil todo.<br>WhatsApp da escola: 51 99505-4548</div></footer>

<div class="barra" id="barra">
  <div class="q"><b>Amostra grátis em 1 dia</b><span>2 anúncios, 1 vídeo e 9 posts pra ${esc(n.sua)}</span></div>
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

  // Mesmo rastreio do /black e do /deuvenda (site_eventos + /wa + Lead no pixel com o mesmo event_id do clique).
  // Sem turma: a Maia não é turma do sistema. O /wa aceita o texto pronto (?msg=) e acrescenta só o #código do clique.
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
  // cada botão vai pelo /wa do CRM: grava o clique (UTM, fbclid, fbp/fbc, event_id) e abre o WhatsApp da escola com a mensagem do nicho
  [].forEach.call(document.querySelectorAll('a[data-cta]'),function(b){
    var t=(b.textContent||'').replace(/\\s+/g,' ').trim(), l=waLink(b.getAttribute('data-msg'));
    b.setAttribute('href',l.url);
    b.addEventListener('click',function(){
      track('clique_wa',{botao:t.slice(0,40),nicho:NICHO,event_id:l.ev});
      try{if(window.fbq)fbq('track','Lead',{content_name:'Maia',content_category:NICHO},{eventID:l.ev});}catch(e){}
    });
  });
})();
</script>
<!-- RASTREIO:FIM -->`

  const titulo = `${n.titulo} · Carreira no Digital`
  if (modo === 'repo') {
    return `<!doctype html>
<html lang="pt-BR">
<head>
${pixel}
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(n.desc)}">
<meta property="og:title" content="${esc(n.selo)}">
<meta property="og:description" content="${esc(n.desc)}">
<meta property="og:type" content="website">
<meta property="og:image" content="/maia/img/maia-og.jpg">
<meta name="theme-color" content="#f7f5fc">
<link rel="preload" href="/maia/fontes/bricolage-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="icon" href="/marca/favicon.ico" sizes="48x48"><link rel="icon" type="image/png" sizes="32x32" href="/marca/favicon-32.png"><link rel="apple-touch-icon" href="/marca/apple-touch-icon.png">
<style>
@font-face{font-family:'Manrope';font-style:normal;font-weight:400 800;font-display:swap;src:url(/maia/fontes/manrope-latin.woff2) format('woff2')}
@font-face{font-family:'Bricolage Grotesque';font-style:normal;font-weight:300 800;font-stretch:75% 100%;font-display:swap;src:url(/maia/fontes/bricolage-latin.woff2) format('woff2')}
${CSS}
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
<style>${CSS}</style>
${corpo}
`
}

for (const n of NICHOS.filter(x => !['marcenaria', 'oficinas'].includes(x.slug))) { // 18/11: marcenaria saiu; oficinas tem gerador próprio (gera-oficina.mjs)
  const r = join(REPO, n.slug, 'index.html')
  mkdirSync(dirname(r), { recursive: true })
  writeFileSync(r, pagina(n, 'repo'))
  try { writeFileSync(join(AQUI, 'previa', `${n.slug}.html`), pagina(n, 'previa')) } catch { /* a prévia só existe no scratchpad */ }
  console.log('ok', n.slug)
}
