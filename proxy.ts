import { NextResponse, type NextRequest } from 'next/server'
import { papelDoToken } from '@/lib/psi/token'

// PORTEIRO DAS APIs (07/11/2026): quem entra com login do consultório (papel "psi", a Morgana) não
// chama nenhuma API da escola. Só lê o token (sem banco), então não pesa nas chamadas da equipe:
// pra quem não é "psi", segue igual a antes. O consultório não usa API nenhuma (fala direto com o
// banco, com a trava por dona), então bloquear tudo de /api pra ela não quebra o /psi.
export function proxy(req: NextRequest) {
  if (papelDoToken(req.headers.get('authorization')) === 'psi') {
    return NextResponse.json({ erro: 'Este login é só do consultório (/psi).' }, { status: 403 })
  }
  return NextResponse.next()
}

export const config = { matcher: ['/api/:path*'] }
