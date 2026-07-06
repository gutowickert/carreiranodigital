import type { Metadata } from 'next'
import Image from 'next/image'
import { Bebas_Neue, Barlow } from 'next/font/google'

const bebas = Bebas_Neue({ weight: '400', subsets: ['latin'], variable: '--f-bebas' })
const barlow = Barlow({ weight: ['400', '500', '600', '700', '800', '900'], subsets: ['latin'], variable: '--f-barlow' })

export const metadata: Metadata = {
  title: 'Agentes de IA — Módulo 1 | Carreira no Digital',
  description: 'Do zero até ter conteúdo, anúncios e estratégia prontos pra rodar.',
}

const AGENTES = [
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

// paleta do site carreiranodigital.com
const BG = '#0b0b12', CARD = '#14121e', BORDER = '#2a2440', ROXO = '#7b2fbe', ROXO_L = '#b87af0', TEXT = '#f0eef7', FAINT = '#9090b8'
const bebasStyle = { fontFamily: 'var(--f-bebas), sans-serif', letterSpacing: '0.5px' } as React.CSSProperties

export default function Agentes() {
  return (
    <div className={`${bebas.variable} ${barlow.variable}`} style={{ minHeight: '100vh', background: BG, color: TEXT, fontFamily: 'var(--f-barlow), system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ position: 'relative', overflow: 'hidden', padding: '52px 20px 40px', textAlign: 'center', background: `radial-gradient(120% 100% at 50% 0%, rgba(61,17,128,0.55) 0%, rgba(11,11,18,0) 60%)` }}>
        <Image src="/logo.png" alt="Carreira no Digital" width={300} height={100} priority style={{ objectFit: 'contain', width: 'min(300px, 78%)', height: 'auto', margin: '0 auto' }} />
        <div style={{ fontSize: 14, fontStyle: 'italic', color: FAINT, marginTop: 8 }}>Crie o futuro, domine o agora.</div>
        <h1 style={{ ...bebasStyle, fontSize: 'clamp(38px, 9vw, 64px)', lineHeight: 0.95, margin: '22px 0 8px', background: `linear-gradient(90deg, #fff, ${ROXO_L})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>MÓDULO 1 · ESTRATÉGIA DIGITAL</h1>
        <p style={{ fontSize: 16, color: FAINT, margin: 0, maxWidth: 520, marginInline: 'auto' }}>Do zero até ter conteúdo, anúncios e estratégia prontos pra rodar.</p>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '8px 18px 70px' }}>
        {/* Antes de começar — como preencher */}
        <div style={{ background: `linear-gradient(135deg, rgba(123,47,190,0.28), ${CARD})`, border: `1px solid ${ROXO}`, borderRadius: 18, padding: 24, marginBottom: 26, boxShadow: '0 0 34px rgba(123,47,190,0.25)' }}>
          <div style={{ ...bebasStyle, fontSize: 26, color: '#fff' }}>ANTES DE COMEÇAR — COMO PREENCHER</div>
          <p style={{ fontSize: 15, color: '#e6e2f2', margin: '8px 0 12px', lineHeight: 1.6 }}>
            A ideia dos agentes é <b style={{ color: ROXO_L }}>encontrar os diferenciais do teu negócio</b> e comunicar a <b style={{ color: ROXO_L }}>essência da tua empresa</b> na internet — pra te destacar e vender no digital.
          </p>
          <p style={{ fontSize: 15, color: '#e6e2f2', margin: '0 0 14px', lineHeight: 1.6 }}>
            O que já te faz vender <b>hoje</b> — no atendimento físico, no boca a boca, na indicação — é o teu ouro. Aqui a gente extrai isso e monta a estrutura pra mostrar online e transformar em venda.
          </p>
          <div style={{ fontSize: 13, fontWeight: 700, color: ROXO_L, letterSpacing: 1, marginBottom: 6 }}>PREENCHE CADA AGENTE COMPLETO E HONESTO:</div>
          <ul style={{ margin: '0 0 12px', paddingLeft: 18 }}>
            <li style={{ fontSize: 14.5, color: '#cfc9e0', marginBottom: 4 }}>O que <b style={{ color: TEXT }}>funciona</b> — por que o cliente te escolhe, o que ele elogia.</li>
            <li style={{ fontSize: 14.5, color: '#cfc9e0', marginBottom: 4 }}>O que <b style={{ color: TEXT }}>não funciona</b> — onde trava, onde tu perde venda.</li>
            <li style={{ fontSize: 14.5, color: '#cfc9e0' }}>Como tu <b style={{ color: TEXT }}>vende de verdade</b> hoje.</li>
          </ul>
          <p style={{ fontSize: 14, color: FAINT, margin: 0, fontStyle: 'italic' }}>Quanto mais real e completo tu for aqui, mais forte fica o resultado. Não é sobre parecer bonito — é sobre traduzir a tua essência em vendas no digital.</p>
        </div>

        {/* Fluxo + como usar */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 18, padding: 22, marginBottom: 26 }}>
          <div style={{ ...bebasStyle, fontSize: 22, color: ROXO_L }}>VISÃO GERAL DO FLUXO</div>
          <p style={{ fontSize: 14.5, color: FAINT, margin: '4px 0 12px' }}>Você não aprende ferramentas primeiro. Você constrói, passo a passo:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {['Clareza do negócio', 'Clareza do público', 'Clareza da oferta', 'Estratégia', 'Planejamento', 'Conteúdo pronto', 'Anúncios prontos'].map(x => (
              <span key={x} style={{ fontSize: 12.5, fontWeight: 600, color: ROXO_L, background: 'rgba(123,47,190,0.15)', border: `1px solid ${BORDER}`, borderRadius: 20, padding: '5px 13px' }}>{x}</span>
            ))}
          </div>
          <div style={{ background: `linear-gradient(135deg, ${ROXO}, #4e1a80)`, borderRadius: 14, padding: '16px 18px', marginTop: 18 }}>
            <div style={{ ...bebasStyle, fontSize: 20, color: '#fff', marginBottom: 8 }}>COMO USAR OS AGENTES</div>
            <div style={{ fontSize: 14, color: '#f0eef7', marginBottom: 8, lineHeight: 1.5 }}><b style={{ color: '#ffe27a' }}>GPT Pago:</b> vai seguindo na mesma janela, de agente em agente.</div>
            <div style={{ fontSize: 14, color: '#f0eef7', lineHeight: 1.5 }}><b style={{ color: '#ffe27a' }}>GPT Gratuito:</b> copia no Word e cola os resultados de <b>TODOS os agentes anteriores</b> no próximo.</div>
          </div>
        </div>

        {/* Agentes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {AGENTES.map(a => (
            <div key={a.n} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 18, padding: 22, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: `linear-gradient(${ROXO}, ${ROXO_L})` }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
                <div style={{ ...bebasStyle, width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, ${ROXO}, ${ROXO_L})`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0, boxShadow: `0 0 22px rgba(123,47,190,0.5)` }}>{a.n}</div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: FAINT, letterSpacing: 2 }}>AGENTE {a.n}</div>
                  <div style={{ ...bebasStyle, fontSize: 27, color: TEXT, lineHeight: 1 }}>{a.titulo}</div>
                </div>
              </div>
              <p style={{ fontSize: 14.5, color: FAINT, margin: '0 0 12px', lineHeight: 1.5 }}><b style={{ color: TEXT }}>Objetivo:</b> {a.objetivo}</p>
              <div style={{ fontSize: 12, fontWeight: 700, color: ROXO_L, letterSpacing: 1, marginBottom: 5 }}>O QUE FAZ</div>
              <ul style={{ margin: '0 0 14px', paddingLeft: 18 }}>
                {a.faz.map((f, i) => <li key={i} style={{ fontSize: 14, color: '#cfc9e0', marginBottom: 3 }}>{f}</li>)}
              </ul>
              <div style={{ fontSize: 14, color: TEXT, background: 'rgba(123,47,190,0.14)', borderLeft: `3px solid ${ROXO_L}`, borderRadius: 8, padding: '9px 13px', marginBottom: 16 }}><b style={{ color: ROXO_L }}>Saída:</b> {a.saida}</div>
              <a href={a.url} target="_blank" rel="noreferrer" style={{ ...bebasStyle, display: 'block', textAlign: 'center', background: `linear-gradient(135deg, ${ROXO}, ${ROXO_L})`, color: '#fff', fontSize: 20, padding: '14px', borderRadius: 12, textDecoration: 'none', boxShadow: '0 6px 22px rgba(123,47,190,0.4)' }}>
                ABRIR AGENTE {a.n} →
              </a>
            </div>
          ))}
        </div>

        {/* Resultado final */}
        <div style={{ background: `linear-gradient(135deg, rgba(123,47,190,0.25), rgba(11,11,18,0.2))`, border: `1px solid ${BORDER}`, borderRadius: 18, padding: 26, marginTop: 26, textAlign: 'center' }}>
          <div style={{ ...bebasStyle, fontSize: 24, color: ROXO_L }}>RESULTADO FINAL DO ALUNO</div>
          <p style={{ fontSize: 15, margin: '6px 0 16px', color: FAINT }}>Ao final do Módulo 1, você sai com:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {['Estratégia definida', 'Público claro', 'Oferta estruturada', 'Conteúdo planejado', 'Roteiros prontos', 'Posts prontos', 'Anúncios prontos'].map(x => (
              <span key={x} style={{ fontSize: 13, fontWeight: 600, color: TEXT, background: 'rgba(123,47,190,0.2)', border: `1px solid ${BORDER}`, borderRadius: 20, padding: '6px 14px' }}>✓ {x}</span>
            ))}
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 30 }}>
          <Image src="/logo.png" alt="Carreira no Digital" width={190} height={64} style={{ objectFit: 'contain', width: 190, height: 'auto', margin: '0 auto', opacity: 0.9 }} />
          <div style={{ fontSize: 13, fontStyle: 'italic', color: FAINT, marginTop: 6 }}>Crie o futuro, domine o agora.</div>
        </div>
      </div>
    </div>
  )
}
