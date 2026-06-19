import { redirect } from 'next/navigation'

// Desempenho foi consolidado na página Captação (turmas + funil + vendedores).
// Mantemos a rota só pra não quebrar links/bookmarks antigos.
export default function DesempenhoRedirect() {
  redirect('/dashboard/captacao')
}
