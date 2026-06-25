export const metadata = { title: 'Termos de Uso — Carreira No Digital' }

const wrap = { maxWidth: 820, margin: '0 auto', padding: '48px 24px', color: 'var(--text)', fontFamily: 'system-ui, sans-serif', lineHeight: 1.7 } as React.CSSProperties
const h1 = { fontSize: 28, fontWeight: 700, marginBottom: 8 } as React.CSSProperties
const h2 = { fontSize: 18, fontWeight: 700, margin: '28px 0 8px' } as React.CSSProperties
const p = { fontSize: 15, margin: '8px 0' } as React.CSSProperties

export default function Termos() {
  return (
    <main style={wrap}>
      <h1 style={h1}>Termos de Uso</h1>
      <p style={{ ...p, color: 'var(--text-faint)' }}>Carreira No Digital — última atualização: junho de 2026.</p>

      <h2 style={h2}>1. Aceitação</h2>
      <p style={p}>Ao se cadastrar, se comunicar conosco ou utilizar nossos serviços e canais (incluindo WhatsApp), você concorda com estes Termos de Uso e com a nossa Política de Privacidade.</p>

      <h2 style={h2}>2. Nossos serviços</h2>
      <p style={p}>A Carreira No Digital oferece cursos, turmas e conteúdos educacionais, além de atendimento e comunicações relacionadas a esses serviços.</p>

      <h2 style={h2}>3. Comunicações</h2>
      <p style={p}>Podemos enviar comunicações por WhatsApp, e-mail e telefone sobre turmas, aulas, cronogramas, suporte e ofertas. Você pode interromper as mensagens de WhatsApp a qualquer momento respondendo <strong>SAIR</strong>.</p>

      <h2 style={h2}>4. Responsabilidades do usuário</h2>
      <p style={p}>Você se compromete a fornecer informações verdadeiras e a usar nossos canais de forma legítima, respeitando a legislação aplicável.</p>

      <h2 style={h2}>5. Propriedade intelectual</h2>
      <p style={p}>Os conteúdos, materiais e marcas da Carreira No Digital são protegidos e não podem ser reproduzidos sem autorização.</p>

      <h2 style={h2}>6. Alterações</h2>
      <p style={p}>Podemos atualizar estes Termos periodicamente. A versão vigente estará sempre disponível nesta página.</p>

      <h2 style={h2}>7. Contato</h2>
      <p style={p}>Dúvidas sobre estes Termos: <strong>contato@carreiranodigital.com.br</strong>.</p>
    </main>
  )
}
