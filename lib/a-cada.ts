// Atualização automática das telas que só roda com a aba À VISTA.
// 23/10/2026: o banco da escola ficou sem memória (consulta de 1 linha levando 15–60 s) e boa parte
// da carga vinha de abas esquecidas abertas em segundo plano, recarregando a cada 5–8 s o dia inteiro.
// Com a aba escondida o relógio segue, mas não busca nada; quando a aba volta, atualiza na hora.
export const abaEscondida = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'

export function aCada(fn: () => void, ms: number) {
  const t = setInterval(() => { if (!abaEscondida()) fn() }, ms)
  const volta = () => { if (!abaEscondida()) fn() }
  document.addEventListener('visibilitychange', volta)
  return () => { clearInterval(t); document.removeEventListener('visibilitychange', volta) }
}
