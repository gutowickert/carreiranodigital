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
  // reset-once ('tema_reset'): zera a escolha antiga uma vez (tira quem ficou preso no claro v1).
  const aplicaTema = `(function(){try{if(localStorage.getItem('tema_reset')!=='2'){localStorage.removeItem('tema');localStorage.setItem('tema_reset','2')}var t=localStorage.getItem('tema');document.documentElement.setAttribute('data-theme',t==='claro'?'light':'dark')}catch(e){document.documentElement.setAttribute('data-theme','dark')}})()`
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: aplicaTema }} />
      {children}
    </>
  )
}
