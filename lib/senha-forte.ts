// SENHA FORTE (08/10/2026, pedido do Nando: "senha difícil, com número, caractere especial e etc.").
// Toda senha criada ou trocada no sistema precisa ter pelo menos 10 caracteres, com letra maiúscula,
// letra minúscula, número e símbolo. Vale na tela (aviso na hora) e no servidor (a regra de verdade,
// porque a tela qualquer um pula). Os símbolos são os mesmos que o Supabase conta na regra de senha
// dele (Authentication → Email → Password requirements), pra a tela nunca aceitar o que o login recusa.
export const SENHA_MINIMO = 10
export const REGRA_SENHA = 'Mínimo de 10 caracteres, com letra maiúscula, letra minúscula, número e símbolo (ex.: ! @ # $ % &).'
const SIMBOLO = /[!@#$%^&*()_+\-=\[\]{};'\\:"|<>?,.\/`~]/

// Os itens da regra, um por um (a tela mostra ✓ ou ✗ em cada).
export function itensDaSenha(senha: string): { texto: string; ok: boolean }[] {
  const s = senha || ''
  return [
    { texto: `${SENHA_MINIMO} caracteres ou mais`, ok: s.length >= SENHA_MINIMO },
    { texto: 'letra maiúscula', ok: /[A-Z]/.test(s) },
    { texto: 'letra minúscula', ok: /[a-z]/.test(s) },
    { texto: 'número', ok: /[0-9]/.test(s) },
    { texto: 'símbolo (! @ # $ % &…)', ok: SIMBOLO.test(s) },
  ]
}

// null = senha boa; senão, o que falta, em português, pronto pra mostrar.
export function problemaNaSenha(senha: string): string | null {
  const falta = itensDaSenha(senha).filter(i => !i.ok).map(i => i.texto)
  return falta.length ? `A senha precisa de: ${falta.join(', ')}.` : null
}
