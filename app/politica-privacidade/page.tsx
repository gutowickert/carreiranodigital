export const metadata = { title: 'Política de Privacidade — Carreira No Digital' }

const wrap = { maxWidth: 820, margin: '0 auto', padding: '48px 24px', color: '#1f2937', fontFamily: 'system-ui, sans-serif', lineHeight: 1.7 } as React.CSSProperties
const h1 = { fontSize: 28, fontWeight: 700, marginBottom: 8 } as React.CSSProperties
const h2 = { fontSize: 18, fontWeight: 700, margin: '28px 0 8px' } as React.CSSProperties
const p = { fontSize: 15, margin: '8px 0' } as React.CSSProperties

export default function PoliticaPrivacidade() {
  return (
    <main style={wrap}>
      <h1 style={h1}>Política de Privacidade</h1>
      <p style={{ ...p, color: '#6b7280' }}>Carreira No Digital — última atualização: junho de 2026.</p>

      <h2 style={h2}>1. Quem somos</h2>
      <p style={p}>Esta Política descreve como a Carreira No Digital ("nós") coleta, usa e protege os dados das pessoas que se relacionam conosco — alunos, leads e interessados em nossos cursos e turmas.</p>

      <h2 style={h2}>2. Dados que coletamos</h2>
      <p style={p}>Podemos coletar: nome, número de telefone/WhatsApp, e-mail, cidade, turma de interesse e informações de contato fornecidas por você ao se cadastrar, preencher formulários, falar conosco ou se matricular.</p>

      <h2 style={h2}>3. Como usamos seus dados</h2>
      <p style={p}>Usamos seus dados para: atendimento e suporte; envio de informações sobre turmas, aulas e cronogramas; comunicações e ofertas por WhatsApp, e-mail ou telefone; e gestão da sua matrícula. As comunicações por WhatsApp são enviadas a quem manteve relação conosco (alunos e leads) e mediante consentimento.</p>

      <h2 style={h2}>4. Comunicações por WhatsApp e descadastro</h2>
      <p style={p}>Enviamos mensagens pelo WhatsApp por meio da Plataforma oficial do WhatsApp Business (Meta). Você pode parar de receber a qualquer momento respondendo <strong>SAIR</strong> em qualquer mensagem, ou solicitando o descadastro pelos nossos canais de contato.</p>

      <h2 style={h2}>5. Compartilhamento</h2>
      <p style={p}>Não vendemos seus dados. Podemos compartilhar dados com prestadores que viabilizam nossa operação (ex: provedores de mensagens, hospedagem e pagamento), apenas na medida necessária e com obrigação de confidencialidade.</p>

      <h2 style={h2}>6. Seus direitos (LGPD)</h2>
      <p style={p}>Conforme a Lei Geral de Proteção de Dados (LGPD), você pode solicitar acesso, correção, exclusão ou portabilidade dos seus dados, além de revogar consentimentos. Para isso, entre em contato conosco.</p>

      <h2 style={h2}>7. Segurança e retenção</h2>
      <p style={p}>Adotamos medidas para proteger seus dados e os mantemos apenas pelo tempo necessário às finalidades descritas ou exigências legais.</p>

      <h2 style={h2}>8. Contato</h2>
      <p style={p}>Dúvidas sobre privacidade ou solicitações relacionadas aos seus dados: <strong>contato@carreiranodigital.com.br</strong>.</p>
    </main>
  )
}
