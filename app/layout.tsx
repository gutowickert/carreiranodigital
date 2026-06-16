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
  return <>{children}</>
}
