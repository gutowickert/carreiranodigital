'use client'
import { useEffect, useState } from 'react'

type Agente = { n: number; titulo: string; objetivo: string; faz: string[]; saida: string; url: string }

const AGENTES: Agente[] = [
  { n: 1, titulo: 'Diagnóstico do Negócio', objetivo: 'Entender o negócio e o momento atual.', faz: ['Identifica o que o aluno vende', 'Como ele vende hoje', 'Quem compra', 'Quanto fatura', 'Onde quer chegar'], saida: 'Resumo claro do negócio + objetivo.', url: 'https://chatgpt.com/g/g-69c2a397d8b081918c3d34ac0660863e-agente-1-diagnostico-do-negocio' },
  { n: 2, titulo: 'Público Ideal', objetivo: 'Definir exatamente pra quem vender.', faz: ['Aprofunda o tipo de cliente', 'Identifica dor real', 'Entende desejo', 'Descobre linguagem'], saida: 'Perfil do cliente + dor + desejo + forma de falar.', url: 'https://chatgpt.com/g/g-69c2a65dc70c8191b11e33bc20669ef4-agente-2-definicao-de-publico' },
  { n: 3, titulo: 'Oferta', objetivo: 'Transformar o que o aluno vende em algo que realmente converte.', faz: ['Clareia o produto/serviço', 'Define promessa', 'Cria transformação', 'Ajusta posicionamento'], saida: 'Oferta clara + argumento de venda + promessa forte.', url: 'https://chatgpt.com/g/g-69c2b6d952dc8191afa75059d7d71707-agente-3-oferta' },
  { n: 4, titulo: 'Estratégia de Conteúdo', objetivo: 'Definir o que postar e com qual intenção.', faz: ['Cria pilares de conteúdo', 'Define tipos de conteúdo (atração, prova, venda)', 'Organiza linha editorial'], saida: 'Estrutura estratégica de conteúdo.', url: 'https://chatgpt.com/g/g-69c2b7e088c081919f5e5a456d2b6038-agente-4-estrategia-de-conteudo' },
  { n: 5, titulo: 'Calendário Editorial', objetivo: 'Transformar estratégia em plano executável.', faz: ['Monta semana pronta', 'Define sequência lógica', 'Organiza frequência'], saida: 'Calendário semanal pronto pra postar.', url: 'https://chatgpt.com/g/g-69c2ef7d446c8191bd5b3e5b888693e6-agente-5-calendario-editorial' },
  { n: 6, titulo: 'Roteiro de Conteúdo Orgânico', objetivo: 'Transformar ideias em vídeos reais.', faz: ['Cria roteiros prontos', 'Define ganchos', 'Estrutura fala', 'Sugere gravação'], saida: 'Roteiros completos de vídeos orgânicos.', url: 'https://chatgpt.com/g/g-69c2f06dbd6c819199137d5c980c9ed2-agente-6-roteiro-de-conteudo-organico' },
  { n: 7, titulo: 'Criativos Orgânicos (Imagem)', objetivo: 'Transformar conteúdo em posts visuais.', faz: ['Cria ideias de carrossel/post', 'Define estrutura visual', 'Escreve textos da imagem', 'Cria legendas'], saida: 'Posts prontos pra publicação.', url: 'https://chatgpt.com/g/g-69c2f176d6308191b12177bc3c3cfe91-agente-7-criativos-organicos' },
  { n: 8, titulo: 'Estratégia de Anúncios', objetivo: 'Definir uma estratégia simples de anúncios pra negócio local: o que anunciar, quando e como investir pra gerar vendas.', faz: ['Define quando anunciar', 'Escolhe o que anunciar primeiro', 'Organiza o objetivo da campanha', 'Mostra como usar o orçamento com lógica'], saida: 'Plano prático pro negócio local anunciar com clareza.', url: 'https://chatgpt.com/g/g-69c3da82ae3081919d107f1c8d27a11b-agente-8-estrategia-de-anuncios' },
  { n: 9, titulo: 'Roteiro de Anúncios', objetivo: 'Transformar a oferta em vídeo que vende.', faz: ['Cria roteiro de anúncio', 'Define gancho forte', 'Estrutura argumento', 'Finaliza com CTA'], saida: 'Roteiros completos de anúncios.', url: 'https://chatgpt.com/g/g-69c2f4244a908191a05df9a78da6c98c-agente-8-roteiro-de-anuncios' },
  { n: 10, titulo: 'Script de Imagens e Carrossel', objetivo: 'Criar material visual para campanhas.', faz: ['Scripts de imagem ou carrossel para anúncios'], saida: 'Scripts de anúncios prontos (imagem + texto).', url: 'https://chatgpt.com/g/g-69c2f51632308191b67726a95b17974b-agente-9-criativos-de-anuncios' },
]

const CSS = `
.ag{--r900:#1a0733;--r700:#4a12a0;--r600:#7b2ae8;--r500:#a12ee0;--rink:#4a1d8a;--rsoft:#f0e9fc;
  --fundo:#e8e6ee;--folha:#fff;--ink:#1a1420;--ink2:#655a75;--line:#e8e3f0;
  --lav:#efe8fd;--lavk:#5b21b6;--mint:#e4f4ea;--mintk:#166b40;--peach:#fdeade;--peachk:#9a4715;--azul:#e2effc;--azulk:#14538d;
  --anton:var(--f-anton),'Arial Narrow',Impact,sans-serif;--pop:var(--f-poppins),system-ui,-apple-system,sans-serif;
  min-height:100vh;background:var(--fundo);font-family:var(--pop);color:var(--ink);line-height:1.6;padding-bottom:96px}
.ag *{box-sizing:border-box}
.ag .sheet{max-width:840px;margin:0 auto;background:var(--folha);box-shadow:0 2px 44px rgba(26,7,51,.15);overflow:hidden}
.ag .pad{padding:0 clamp(18px,4.5vw,44px)}
.ag h1,.ag h2,.ag .anton{font-family:var(--anton);font-weight:400;text-transform:uppercase;letter-spacing:.01em}
.ag .capa{background:linear-gradient(140deg,#1a0733,#2b0a55 42%,#4a12a0 78%,#7b2ae8);color:#fff;padding:clamp(30px,5vw,46px) clamp(18px,4.5vw,44px) clamp(26px,4vw,38px);text-align:center}
.ag .capa img{width:min(230px,64%);height:auto;margin:0 auto 6px;display:block}
.ag .capa .lema{font-size:13px;font-style:italic;color:#c8a4f2;margin-bottom:18px}
.ag .capa h1{font-size:clamp(34px,8vw,60px);line-height:.92;margin:6px 0 8px}
.ag .capa h1 .n{color:#c8a4f2}
.ag .capa .sub{font-size:15.5px;color:#ddcbf5;max-width:44ch;margin:0 auto}
.ag .prog{background:#faf8fd;border-bottom:1px solid var(--line);padding:14px clamp(18px,4.5vw,44px);
  display:flex;align-items:center;gap:14px;position:sticky;top:0;z-index:5}
.ag .prog .lab{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--rink);white-space:nowrap}
.ag .prog .track{flex:1;height:9px;border-radius:6px;background:var(--rsoft);overflow:hidden}
.ag .prog .fill{height:100%;background:linear-gradient(90deg,#7b2ae8,#a12ee0);transition:width .5s ease}
.ag .prog .cnt{font-size:13px;font-weight:800;color:var(--r600);white-space:nowrap;font-variant-numeric:tabular-nums}
.ag .sec{padding-top:26px}
.ag .kk{font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:var(--ink2);margin-bottom:6px}
.ag .card{border:1px solid var(--line);border-radius:14px;padding:20px 22px;margin-bottom:16px}
.ag .card.lav{background:var(--lav);border-color:transparent}
.ag .card h3{font-family:var(--anton);font-weight:400;text-transform:uppercase;font-size:24px;color:var(--rink);margin:0 0 8px}
.ag .card.lav h3{color:var(--lavk)}
.ag .card p{margin:0 0 9px;font-size:15px}.ag .card p:last-child{margin:0}
.ag .card b{font-weight:700}
.ag .chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}
.ag .chip{font-size:12.5px;font-weight:600;color:var(--rink);background:var(--rsoft);border-radius:20px;padding:6px 13px}
.ag .comousar{background:linear-gradient(135deg,var(--r600),#4e1a80);border-radius:14px;padding:16px 18px;margin-top:16px;color:#fff}
.ag .comousar .t{font-family:var(--anton);font-size:19px;margin-bottom:8px}
.ag .comousar div{font-size:14px;line-height:1.5;margin-bottom:7px}.ag .comousar div:last-child{margin:0}
.ag .comousar b{color:#ffe27a}
.ag .faixa{font-family:var(--anton);font-weight:400;text-transform:uppercase;font-size:15px;letter-spacing:.14em;
  color:var(--r600);margin:30px 0 14px;display:flex;align-items:center;gap:12px}
.ag .faixa::after{content:'';flex:1;height:2px;background:var(--line)}
/* agente card */
.ag .ag-card{position:relative;border:1px solid var(--line);border-radius:16px;padding:20px 22px 20px 26px;margin-bottom:14px;background:var(--folha);overflow:hidden;transition:opacity .3s}
.ag .ag-card::before{content:'';position:absolute;left:0;top:0;width:5px;height:100%;background:linear-gradient(var(--r600),var(--r500))}
.ag .ag-head{display:flex;align-items:center;gap:14px}
.ag .badge{font-family:var(--anton);width:46px;height:46px;border-radius:13px;background:linear-gradient(135deg,var(--r600),var(--r500));color:#fff;display:flex;align-items:center;justify-content:center;font-size:25px;flex:none;box-shadow:0 6px 18px rgba(123,42,232,.35)}
.ag .ag-head .en{font-size:11px;font-weight:700;letter-spacing:.16em;color:var(--ink2)}
.ag .ag-head .tt{font-family:var(--anton);font-size:24px;color:var(--ink);line-height:1;margin-top:2px}
.ag .obj{font-size:14.5px;color:var(--ink2);margin:12px 0 10px}.ag .obj b{color:var(--ink)}
.ag .qf{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--r600);margin-bottom:5px}
.ag .qf-list{margin:0 0 12px;padding-left:18px}.ag .qf-list li{font-size:14px;color:#4a4460;margin-bottom:3px}
.ag .saida{font-size:14px;background:var(--mint);color:var(--mintk);border-radius:10px;padding:9px 13px;margin-bottom:16px}
.ag .saida b{font-weight:800}
.ag .abrir{display:block;text-align:center;font-family:var(--anton);font-size:19px;letter-spacing:.02em;
  background:linear-gradient(135deg,var(--r600),var(--r500));color:#fff;padding:13px;border-radius:12px;text-decoration:none;box-shadow:0 6px 20px rgba(123,42,232,.35)}
/* locked */
.ag .ag-card.lock{background:#f6f4fa;border-style:dashed}
.ag .ag-card.lock::before{background:#cdc4de}
.ag .ag-card.lock .badge{background:#d8d1e6;color:#8a80a3;box-shadow:none}
.ag .ag-card.lock .tt{color:#8a80a3}
.ag .lockmsg{display:flex;align-items:center;gap:10px;margin-top:12px;font-size:14px;color:var(--peachk);background:var(--peach);border-radius:10px;padding:11px 14px;font-weight:600}
.ag .lockmsg svg{flex:none}
/* barra professor */
.ag .profbar{position:fixed;left:0;right:0;bottom:0;z-index:20;background:rgba(20,7,45,.97);backdrop-filter:blur(8px);
  border-top:2px solid var(--r600);color:#fff;padding:12px clamp(14px,4vw,28px);display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:center}
.ag .profbar .st{font-size:13px;color:#d3bcf2;font-weight:600}.ag .profbar .st b{color:#fff;font-size:16px}
.ag .profbar button{font-family:var(--pop);font-weight:700;font-size:14px;cursor:pointer;border:none;border-radius:10px;padding:11px 18px}
.ag .profbar .lib{background:linear-gradient(135deg,var(--r600),var(--r500));color:#fff;font-size:15px;padding:12px 22px}
.ag .profbar .sec-b{background:rgba(255,255,255,.12);color:#fff}
.ag .profbar .err{color:#ffb0bf;font-size:13px;width:100%;text-align:center}
.ag .foot{text-align:center;padding:30px 20px 40px}
.ag .foot img{width:170px;height:auto;opacity:.8;margin:0 auto}
.ag .foot .lema{font-size:12.5px;font-style:italic;color:var(--ink2);margin-top:6px}
`

function LockIcon() {
  return (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>)
}

export default function AgentesClient() {
  const [liberados, setLiberados] = useState(1)
  const [total, setTotal] = useState(10)
  const [profKey, setProfKey] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const r = await fetch('/api/agentes', { cache: 'no-store' })
        const j = await r.json()
        if (alive && j && j.ok) { setLiberados(j.liberados); setTotal(j.total) }
      } catch {}
    }
    load()
    const id = setInterval(load, 4000)
    try {
      const stored = localStorage.getItem('ag_prof')
      if (stored) setProfKey(stored)
      else if (new URLSearchParams(window.location.search).has('prof')) {
        const k = window.prompt('Senha do professor:')
        if (k) { localStorage.setItem('ag_prof', k); setProfKey(k) }
      }
    } catch {}
    return () => { alive = false; clearInterval(id) }
  }, [])

  const act = async (acao: string, valor?: number) => {
    try {
      const r = await fetch('/api/agentes', { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ acao, valor, senha: profKey }) })
      const j = await r.json()
      if (j && j.ok) { setLiberados(j.liberados); setErro('') }
      else { setErro('Senha incorreta — recarregue com ?prof e digite de novo.'); try { localStorage.removeItem('ag_prof') } catch {} }
    } catch { setErro('Falha de conexão.') }
  }

  const isProf = !!profKey
  const pct = Math.round((liberados / total) * 100)

  return (
    <div className="ag">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="sheet">

        <div className="capa">
          <img src="/logo.png" alt="Carreira no Digital" />
          <div className="lema">Crie o futuro, domine o agora.</div>
          <h1>Módulo <span className="n">01</span><br />Estratégia Digital</h1>
          <div className="sub">Do zero até ter conteúdo, anúncios e estratégia prontos pra rodar.</div>
        </div>

        <div className="prog">
          <span className="lab">Liberados</span>
          <span className="track"><span className="fill" style={{ width: pct + '%' }} /></span>
          <span className="cnt">{liberados} / {total}</span>
        </div>

        <div className="pad sec">
          <div className="card lav">
            <h3>Antes de começar — como preencher</h3>
            <p>A ideia dos agentes é <b>encontrar os diferenciais do teu negócio</b> e comunicar a <b>essência da tua empresa</b> na internet — pra te destacar e vender no digital.</p>
            <p>O que já te faz vender <b>hoje</b> — no atendimento, no boca a boca, na indicação — é o teu ouro. Aqui a gente extrai isso e monta a estrutura pra mostrar online.</p>
            <p><b>Preenche cada agente completo e honesto:</b> o que funciona (por que o cliente te escolhe), o que não funciona (onde perde venda) e como tu vende de verdade hoje.</p>
          </div>

          <div className="card">
            <div className="kk">Visão geral do fluxo</div>
            <p style={{ color: 'var(--ink2)', marginBottom: 10 }}>Você não aprende ferramentas primeiro. Você constrói, passo a passo:</p>
            <div className="chips">
              {['Clareza do negócio', 'Clareza do público', 'Clareza da oferta', 'Estratégia', 'Planejamento', 'Conteúdo pronto', 'Anúncios prontos'].map(x => <span key={x} className="chip">{x}</span>)}
            </div>
            <div className="comousar">
              <div className="t">COMO USAR OS AGENTES</div>
              <div><b>GPT Pago:</b> vai seguindo na mesma janela, de agente em agente.</div>
              <div><b>GPT Gratuito:</b> copia no Word e cola os resultados de TODOS os agentes anteriores no próximo.</div>
            </div>
          </div>

          <div className="faixa">Os 10 agentes · na ordem</div>

          {AGENTES.map(a => {
            const aberto = a.n <= liberados
            return (
              <div key={a.n} className={'ag-card' + (aberto ? '' : ' lock')}>
                <div className="ag-head">
                  <div className="badge">{a.n}</div>
                  <div>
                    <div className="en">AGENTE {a.n}</div>
                    <div className="tt">{a.titulo}</div>
                  </div>
                </div>
                {aberto ? (
                  <>
                    <p className="obj"><b>Objetivo:</b> {a.objetivo}</p>
                    <div className="qf">O que faz</div>
                    <ul className="qf-list">{a.faz.map((f, i) => <li key={i}>{f}</li>)}</ul>
                    <div className="saida"><b>Saída:</b> {a.saida}</div>
                    <a className="abrir" href={a.url} target="_blank" rel="noreferrer">ABRIR AGENTE {a.n} →</a>
                  </>
                ) : (
                  <div className="lockmsg"><LockIcon /> Disponível quando o professor liberar este passo.</div>
                )}
              </div>
            )
          })}

          <div className="card" style={{ background: 'linear-gradient(135deg,var(--lav),#fff)', marginTop: 22, textAlign: 'center' }}>
            <h3 style={{ color: 'var(--lavk)' }}>Resultado final do aluno</h3>
            <p style={{ color: 'var(--ink2)', marginBottom: 12 }}>Ao final do Módulo 1, você sai com:</p>
            <div className="chips" style={{ justifyContent: 'center' }}>
              {['Estratégia definida', 'Público claro', 'Oferta estruturada', 'Conteúdo planejado', 'Roteiros prontos', 'Posts prontos', 'Anúncios prontos'].map(x => <span key={x} className="chip">✓ {x}</span>)}
            </div>
          </div>
        </div>

        <div className="foot">
          <img src="/logo.png" alt="Carreira no Digital" />
          <div className="lema">Crie o futuro, domine o agora.</div>
        </div>
      </div>

      {isProf && (
        <div className="profbar">
          <span className="st">Liberados <b>{liberados}</b> / {total}{liberados < total ? ' · próximo: agente ' + (liberados + 1) : ' · todos abertos'}</span>
          <button className="sec-b" onClick={() => act('voltar')} disabled={liberados <= 0}>◀ Voltar</button>
          <button className="lib" onClick={() => act('liberar')} disabled={liberados >= total}>Liberar próximo ▶</button>
          <button className="sec-b" onClick={() => act('reset')}>Reset</button>
          {erro && <span className="err">{erro}</span>}
        </div>
      )}
    </div>
  )
}
