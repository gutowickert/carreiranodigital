// Maia: instruções de EXCLUSÃO DE DADOS (23/11). A Meta exige esse endereço no app Sistema CND (Configurações do app →
// Básico → "Exclusão de dados do usuário") pra liberar as permissões do Instagram e do Facebook na análise do app.
// Fala do que a Maia guarda de verdade (social.ts: página, Instagram e a chave da página cifrada; os posts e os números;
// wa-negocio/atendente: as conversas do WhatsApp do negócio) e de como pedir pra apagar (lgpd.ts apaga o contato).
// Português e inglês (quem revisa na Meta lê em inglês).
export const metadata = { title: 'Exclusão de dados — Maia (Carreira No Digital)', robots: { index: true, follow: true } }

const wrap = { maxWidth: 820, margin: '0 auto', padding: '48px 24px', color: '#1b1530', background: '#fff', fontFamily: 'system-ui, sans-serif', lineHeight: 1.7 } as React.CSSProperties
const h1 = { fontSize: 28, fontWeight: 700, marginBottom: 8 } as React.CSSProperties
const h2 = { fontSize: 18, fontWeight: 700, margin: '28px 0 8px' } as React.CSSProperties
const p = { fontSize: 15, margin: '8px 0' } as React.CSSProperties
const li = { fontSize: 15, margin: '4px 0' } as React.CSSProperties
const EMAIL = 'contato@carreiranodigital.com'

export default function ExclusaoDeDados() {
  return (
    <main style={wrap}>
      <h1 style={h1}>Exclusão de dados</h1>
      <p style={{ ...p, color: '#6b6585' }}>Maia e app Sistema CND · Carreira No Digital Ltda · Lajeado, RS, Brasil</p>

      <h2 style={h2}>O que guardamos quando você conecta o Facebook ou o Instagram</h2>
      <p style={p}>Quando o dono de um negócio conecta a Página do Facebook e a conta profissional do Instagram à Maia (pelo Login do Facebook para Empresas), guardamos só o necessário pra publicar os posts que ele aprovou e mostrar os resultados:</p>
      <ul>
        <li style={li}>o identificador da Página e da conta do Instagram;</li>
        <li style={li}>a chave de acesso da Página, guardada cifrada;</li>
        <li style={li}>os posts publicados pela Maia e os números deles (alcance, curtidas, salvamentos, comentários);</li>
        <li style={li}>as conversas do WhatsApp do negócio, quando o atendimento da Maia está ligado.</li>
      </ul>
      <p style={p}>Não vendemos esses dados e não usamos os dados de um negócio pra outro.</p>

      <h2 style={h2}>Como desconectar</h2>
      <ol>
        <li style={li}>No Facebook, abra <b>Configurações e privacidade</b> → <b>Configurações</b> → <b>Integrações comerciais</b>.</li>
        <li style={li}>Encontre <b>Sistema CND</b> e clique em <b>Remover</b>.</li>
      </ol>
      <p style={p}>A partir daí a Maia não consegue mais publicar nem ler nada da sua Página ou do seu Instagram.</p>

      <h2 style={h2}>Como pedir a exclusão dos dados</h2>
      <p style={p}>Mande um e-mail para <b>{EMAIL}</b> com o assunto <b>"Excluir meus dados"</b>, dizendo o nome do negócio, a Página ou o @ do Instagram, e o telefone do WhatsApp usado com a Maia. Se você é cliente de um negócio atendido pela Maia, informe o seu telefone e o nome do negócio.</p>
      <p style={p}>Apagamos a ligação com a Página e o Instagram, a chave de acesso e os dados do pedido, e respondemos por e-mail confirmando a exclusão. Dados que a lei obriga a manter (por exemplo, fiscais) ficam guardados só pelo prazo legal. Seus direitos seguem a Lei Geral de Proteção de Dados (LGPD); veja também a nossa <a href="/politica-privacidade">Política de Privacidade</a>.</p>

      <hr style={{ margin: '36px 0', border: 0, borderTop: '1px solid #e5e1ef' }} />

      <h2 style={h2}>Data deletion instructions (English)</h2>
      <p style={p}>When a business owner connects their Facebook Page and Instagram professional account to Maia (the "Sistema CND" app, by Carreira No Digital Ltda, Brazil), we store only what is needed to publish the posts the owner approved and to show their results: the Page and Instagram account IDs, the Page access token (encrypted), the posts published by Maia and their metrics, and, when the WhatsApp assistant is on, the business's WhatsApp conversations. We do not sell this data or use one business's data for another.</p>
      <p style={p}><b>To disconnect:</b> on Facebook, go to Settings &amp; privacy → Settings → Business integrations, find "Sistema CND" and click Remove.</p>
      <p style={p}><b>To delete your data:</b> email <b>{EMAIL}</b> with the subject "Delete my data", including the business name, the Page or Instagram handle, and the WhatsApp number used with Maia. We delete the connection, the access token and the related data, and confirm by email. Data we are legally required to keep is retained only for the legal period.</p>
    </main>
  )
}
