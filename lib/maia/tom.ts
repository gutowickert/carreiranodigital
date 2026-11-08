// Maia: o jeito de falar com os CLIENTES de cada negócio (07/11, piloto; decisão 2 do plano de lançamento).
// Fica em negocios.meta.atendimento.tom (sem coluna nova): { pessoa: 'voce' | 'tu', gaucho: boolean, estilo: 'leve' | 'formal' }.
// Padrão: "você", neutro (sem jeito gaúcho) e leve. Com o DONO, a Maia continua com o jeito dela (ia.ts, JEITO).
export type Tom = { pessoa: 'voce' | 'tu'; gaucho: boolean; estilo: 'leve' | 'formal' }
export const TOM_PADRAO: Tom = { pessoa: 'voce', gaucho: false, estilo: 'leve' }

export function tomDoNegocio(neg: any): Tom {
  const t = neg?.meta?.atendimento?.tom || {}
  return { pessoa: t.pessoa === 'tu' ? 'tu' : 'voce', gaucho: t.gaucho === true, estilo: t.estilo === 'formal' ? 'formal' : 'leve' }
}

// limpa o que veio do painel
export function tomValido(t: any): Tom {
  return { pessoa: t?.pessoa === 'tu' ? 'tu' : 'voce', gaucho: t?.gaucho === true || t?.gaucho === 'sim' || t?.gaucho === 'true', estilo: t?.estilo === 'formal' ? 'formal' : 'leve' }
}

export const descreveTom = (t: Tom) => `${t.pessoa === 'tu' ? '"tu"' : '"você"'}, ${t.gaucho ? 'com jeito gaúcho' : 'neutro'}, ${t.estilo}`

// o "jeito" que abre as regras do atendimento do cliente (no lugar do JEITO da Maia)
export function jeitoAtendimento(neg: any): string {
  const t = tomDoNegocio(neg)
  const pessoa = t.pessoa === 'voce'
    ? 'Trata o cliente SEMPRE por "você" (seu, sua, com você). NUNCA usa "tu", "teu", "tua" nem "contigo" com o cliente, mesmo que estas instruções estejam escritas com "tu" e mesmo que o cliente use "tu".'
    : 'Trata o cliente por "tu" (teu, tua, contigo), do jeito do Sul.'
  const regiao = t.gaucho
    ? 'Pode ter um jeito gaúcho leve ("bah", "tri", "ó", "viu?"), sem exagero e sem forçar.'
    : 'Português neutro do Brasil, sem regionalismo: nada de "bah", "tri", "ó" nem "guri".'
  const estilo = t.estilo === 'formal'
    ? 'Educada e profissional, sem gíria e sem emoji.'
    : 'Simpática, leve e direta, no máximo 1 emoji por mensagem.'
  return `Tu escreves as mensagens que vão pro WhatsApp dos CLIENTES do negócio, em nome do negócio, como a assistente virtual dele (uma IA).
(Estas instruções falam contigo usando "tu". Com o cliente, vale só o JEITO DE FALAR abaixo.)
JEITO DE FALAR COM O CLIENTE:
- ${pessoa}
- ${regiao}
- ${estilo}
- Mensagens de WhatsApp curtas, uma ideia por mensagem. Sem negrito, sem travessão, sem lista longa. Nunca bajula.
- Sempre diz que é uma IA se perguntarem. Nunca promete o que o negócio não disse que faz. Nunca inventa o que não sabe do negócio: diz que confirma.`
}

// ---- 08/11 (teste completo): conferir e acertar o tom do que vai pro CLIENTE ----
// No teste, o repasse da resposta do dono (responder_cliente, escrito com o jeito da Maia com o dono) saiu em "tu" num negócio
// em "você": "Qual tu prefere?", "não é seguro pra ti", "teu pedido". E as peças forçavam "tu" ("Pede o teu orçamento").
const TU_PALAVRAS = /\b(tu|teu|tua|teus|tuas|contigo|ti)\b/i
const VOCE_PALAVRAS = /(?<![\p{L}])(você|vocês|voce|vc)(?![\p{L}])/iu
const GAUCHO_PALAVRAS = /(^|[\s,.!?])(bah|tri|guri|guria|ó|tchê|barbaridade)(?=[\s,.!?]|$)/i
// o que está fora do tom do negócio (lista vazia = está certo)
export function foraDoTom(neg: any, texto: string): string[] {
  const t = tomDoNegocio(neg), s = String(texto || ''), erros: string[] = []
  if (t.pessoa === 'voce' && TU_PALAVRAS.test(s.replace(/\bpra ti\b|\bpara ti\b/gi, ' tu '))) erros.push('usa "tu/teu/tua" num negócio que fala "você"')
  if (t.pessoa === 'tu' && VOCE_PALAVRAS.test(s)) erros.push('usa "você" num negócio que fala "tu"')
  if (!t.gaucho && GAUCHO_PALAVRAS.test(s)) erros.push('tem jeito gaúcho ("ó", "bah", "tri") num negócio neutro')
  return erros
}

// o acerto sem IA (rede de segurança), só pro "você": troca as formas de "tu" mais comuns e tira o "Ó," do começo
const comCaixa = (orig: string, novo: string) => orig[0] === orig[0].toUpperCase() && orig[0] !== orig[0].toLowerCase() ? novo[0].toUpperCase() + novo.slice(1) : novo
export function acertaTom(neg: any, texto: string): string {
  const t = tomDoNegocio(neg)
  let s = String(texto || '')
  if (t.pessoa === 'voce') {
    s = s.replace(/\b(pra|para) ti\b/gi, (m, p) => `${p} você`)
      .replace(/\bcontigo\b/gi, m => comCaixa(m, 'com você'))
      .replace(/\b(teu|tua|teus|tuas)\b/gi, m => comCaixa(m, ({ teu: 'seu', tua: 'sua', teus: 'seus', tuas: 'suas' } as any)[m.toLowerCase()]))
      .replace(/\btu\b/gi, m => comCaixa(m, 'você'))
  }
  if (!t.gaucho) s = s.replace(/(^|[.!?]\s+)(Ó|Bah|Tchê)[,!]?\s+(\S)/g, (m, a, _b, c) => a + c.toUpperCase()).replace(/,\s*viu\?/g, '?')
  return s
}

// o imperativo do CTA no "você" ("Pede o teu orçamento" → "Peça seu orçamento"; "Chama no WhatsApp" → "Chame no WhatsApp")
const IMPERATIVO: Record<string, string> = { pede: 'peça', chama: 'chame', agenda: 'agende', garante: 'garanta', encomenda: 'encomende', vem: 'venha', manda: 'mande', aproveita: 'aproveite', escolhe: 'escolha', reserva: 'reserve', fala: 'fale', experimenta: 'experimente', prova: 'prove', corre: 'corra', compra: 'compre', marca: 'marque', conhece: 'conheça', faz: 'faça', liga: 'ligue', clica: 'clique', toca: 'toque', descobre: 'descubra', pega: 'pegue', presenteia: 'presenteie', retira: 'retire' }
// 08/11 (pendência, legenda de post): num texto livre, só os imperativos que não confundem com outra palavra
// ("Faz tempo", "Vem aí", "Prova disso" ficam como estão), no começo de cada frase
const IMPERATIVO_SEGURO = ['pede', 'chama', 'garante', 'encomenda', 'aproveita', 'escolhe', 'reserva', 'experimenta', 'manda', 'clica', 'descobre', 'presenteia']
export function textoNoTom(neg: any, texto: string): string {
  let s = acertaTom(neg, texto)
  if (tomDoNegocio(neg).pessoa === 'voce') s = s.replace(/(^|[.!?]\s+|\n\s*)(\p{L}+)/gu, (m, pre, w) => IMPERATIVO_SEGURO.includes(w.toLowerCase()) ? pre + comCaixa(w, IMPERATIVO[w.toLowerCase()]) : m).replace(/\b(Peça|Garanta|Reserve|Escolha|Encomende) o seu\b/g, '$1 seu').replace(/\b(Peça|Garanta|Reserve|Escolha|Encomende) a sua\b/g, '$1 sua')
  return s
}
export function ctaNoTom(neg: any, cta: string): string {
  let s = acertaTom(neg, cta)
  if (tomDoNegocio(neg).pessoa === 'voce') s = s.replace(/^(\s*)(\p{L}+)/u, (m, esp, w) => IMPERATIVO[w.toLowerCase()] ? esp + comCaixa(w, IMPERATIVO[w.toLowerCase()]) : m).replace(/\b(Peça|Garanta|Reserve|Escolha|Pegue|Retire) o seu\b/g, '$1 seu').replace(/\b(Peça|Garanta|Reserve|Escolha|Pegue|Retire) a sua\b/g, '$1 sua')
  return s
}

// o texto no tom do negócio: se algo está fora do tom, a IA reescreve (sem mudar nenhuma informação) e o acerto sem IA confere
export async function noTomDoNegocio(neg: any, texto: string, uso?: { negocio_id?: string | null; conversa_id?: string | null }): Promise<string> {
  if (!foraDoTom(neg, texto).length) return texto
  try {
    const { emJson } = await import('./ia')
    const r = await emJson<{ texto: string }>(`${jeitoAtendimento(neg)}\nTua tarefa agora: reescrever UMA mensagem pro cliente nesse jeito de falar. Muda SÓ o jeito (pessoa, regionalismo); não tira nem acrescenta nenhuma informação, valor, dia ou horário.`,
      `MENSAGEM: ${texto}\nDevolve {"texto":"..."}`, [], { modelo: process.env.MAIA_MODELO_CLIENTE || 'claude-haiku-5-5', uso: { tipo: 'cliente', ...(uso || {}) } })
    const novo = String(r?.texto || '').trim()
    if (novo) return acertaTom(neg, novo)
  } catch { /* sem IA: o acerto sem IA resolve o principal */ }
  return acertaTom(neg, texto)
}
