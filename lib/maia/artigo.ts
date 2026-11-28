// 28/11: o artigo certo antes do nome do negócio. Saiu "do Lotérica do Zart" pro dono: o "do" era fixo no texto.
// meta.artigo ('a' ou 'o') manda; sem ele, a 1ª palavra do nome decide (Lotérica, Ótica, Doceria → a; Bocadinho, Studio → o)
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const MASCULINAS_EM_A = new Set(['dia', 'clima', 'sistema', 'programa', 'mapa', 'planeta', 'cinema', 'tema', 'problema'])
export function artigoDo(neg: any): 'a' | 'o' {
  const m = neg?.meta?.artigo
  if (m === 'a' || m === 'o') return m
  const p = semAcento(String(neg?.nome || '').trim().split(/\s+/)[0] || '')
  if (!p) return 'o'
  if (MASCULINAS_EM_A.has(p)) return 'o'
  return /(a|as|cao|dade|gem)$/.test(p) ? 'a' : 'o'
}
const fem = (neg: any) => artigoDo(neg) === 'a'
export const doNeg = (neg: any) => `${fem(neg) ? 'da' : 'do'} ${neg?.nome || ''}`
export const noNeg = (neg: any) => `${fem(neg) ? 'na' : 'no'} ${neg?.nome || ''}`
export const proNeg = (neg: any) => `${fem(neg) ? 'pra' : 'pro'} ${neg?.nome || ''}`
export const NoNeg = (neg: any) => `${fem(neg) ? 'Na' : 'No'} ${neg?.nome || ''}`
