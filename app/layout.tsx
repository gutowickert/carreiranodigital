export const metadata = {
  title: 'Carreira No Digital',
  manifest: '/manifest.json',
}

export const viewport = {
  themeColor: '#1c1c1e',
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // TEMP: força o tema ESCURO pra todos enquanto o tema claro é ajustado.
  // (limpa a escolha salva e ignora o claro). Reverter quando o claro ficar pronto.
  const aplicaTema = `(function(){try{localStorage.removeItem('tema')}catch(e){};document.documentElement.setAttribute('data-theme','dark')})()`
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: aplicaTema }} />
      {children}
    </>
  )
}
