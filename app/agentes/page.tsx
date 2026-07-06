import type { Metadata } from 'next'

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

const roxo = '#7c3aed', roxoClaro = '#a78bfa', tinta = '#1f2937', cinza = '#6b7280'

export default function Agentes() {
  return (
    <div style={{ minHeight: '100vh', background: '#faf9ff', color: tinta, fontFamily: 'system-ui, -apple-system, Segoe UI, Arial, sans-serif' }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${roxo}, #5b21b6)`, color: '#fff', padding: '36px 20px 30px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, letterSpacing: 3, opacity: 0.85, fontWeight: 700 }}>🧠 CARREIRA NO DIGITAL</div>
        <div style={{ fontSize: 15, fontStyle: 'italic', opacity: 0.9, marginTop: 4 }}>Crie o futuro, domine o agora.</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: '18px 0 6px' }}>Módulo 1 — Estratégia Digital</h1>
        <p style={{ fontSize: 15, opacity: 0.92, margin: 0 }}>Do zero até ter conteúdo, anúncios e estratégia prontos pra rodar.</p>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 18px 60px' }}>
        {/* Fluxo + como usar */}
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 16, padding: 20, marginBottom: 24, boxShadow: '0 2px 12px rgba(124,58,237,0.06)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: roxo, textTransform: 'uppercase', letterSpacing: 1 }}>Visão geral do fluxo</div>
          <p style={{ fontSize: 14, color: cinza, margin: '6px 0 10px' }}>Você não aprende ferramentas primeiro. Você constrói, passo a passo:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {['Clareza do negócio', 'Clareza do público', 'Clareza da oferta', 'Estratégia', 'Planejamento', 'Conteúdo pronto', 'Anúncios prontos'].map(x => (
              <span key={x} style={{ fontSize: 12, fontWeight: 600, color: roxo, background: '#f3edff', border: '1px solid #e5d9ff', borderRadius: 20, padding: '4px 12px' }}>{x}</span>
            ))}
          </div>
          <div style={{ background: `linear-gradient(135deg, ${roxo}, #6d28d9)`, color: '#fff', borderRadius: 12, padding: '14px 16px', marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#ffe27a', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Como usar os agentes</div>
            <div style={{ fontSize: 13.5, marginBottom: 6 }}><b style={{ color: '#ffe27a' }}>GPT Pago:</b> vai seguindo na mesma janela, de agente em agente.</div>
            <div style={{ fontSize: 13.5 }}><b style={{ color: '#ffe27a' }}>GPT Gratuito:</b> copia as informações no Word e cola no próximo agente.</div>
          </div>
        </div>

        {/* Agentes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {AGENTES.map(a => (
            <div key={a.n} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(124,58,237,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: `linear-gradient(135deg, ${roxo}, ${roxoClaro})`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 17, flexShrink: 0 }}>{a.n}</div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: roxoClaro, letterSpacing: 1 }}>AGENTE {a.n}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: tinta, lineHeight: 1.2 }}>{a.titulo}</div>
                </div>
              </div>
              <p style={{ fontSize: 14, color: cinza, margin: '0 0 12px' }}><b style={{ color: tinta }}>Objetivo:</b> {a.objetivo}</p>
              <div style={{ fontSize: 13, fontWeight: 700, color: tinta, marginBottom: 4 }}>O que faz:</div>
              <ul style={{ margin: '0 0 12px', paddingLeft: 18 }}>
                {a.faz.map((f, i) => <li key={i} style={{ fontSize: 13.5, color: '#374151', marginBottom: 3 }}>{f}</li>)}
              </ul>
              <div style={{ fontSize: 13.5, color: tinta, background: '#f7f3ff', borderLeft: `3px solid ${roxo}`, borderRadius: 8, padding: '8px 12px', marginBottom: 14 }}><b>Saída:</b> {a.saida}</div>
              <a href={a.url} target="_blank" rel="noreferrer" style={{ display: 'block', textAlign: 'center', background: `linear-gradient(135deg, ${roxo}, ${roxoClaro})`, color: '#fff', fontWeight: 800, fontSize: 15, padding: '13px', borderRadius: 12, textDecoration: 'none', boxShadow: '0 4px 14px rgba(124,58,237,0.35)' }}>
                ABRIR AGENTE {a.n} →
              </a>
            </div>
          ))}
        </div>

        {/* Resultado final */}
        <div style={{ background: `linear-gradient(135deg, ${roxo}, #5b21b6)`, color: '#fff', borderRadius: 16, padding: 24, marginTop: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#ffe27a', textTransform: 'uppercase', letterSpacing: 1 }}>Resultado final do aluno</div>
          <p style={{ fontSize: 15, margin: '8px 0 14px', opacity: 0.95 }}>Ao final do Módulo 1, você sai com:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {['Estratégia definida', 'Público claro', 'Oferta estruturada', 'Conteúdo planejado', 'Roteiros prontos', 'Posts prontos', 'Anúncios prontos'].map(x => (
              <span key={x} style={{ fontSize: 12.5, fontWeight: 600, background: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '5px 13px' }}>✓ {x}</span>
            ))}
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 28, color: cinza }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2, color: roxo }}>🧠 CARREIRA NO DIGITAL</div>
          <div style={{ fontSize: 13, fontStyle: 'italic', marginTop: 2 }}>Crie o futuro, domine o agora.</div>
        </div>
      </div>
    </div>
  )
}
