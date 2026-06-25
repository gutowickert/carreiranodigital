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
  // Aplica o tema salvo ANTES de pintar (sem flash). Padrão: escuro.
  const aplicaTema = `(function(){try{var t=localStorage.getItem('tema');document.documentElement.setAttribute('data-theme',t==='claro'?'light':'dark')}catch(e){}})()`
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: aplicaTema }} />
      {children}
    </>
  )
}
