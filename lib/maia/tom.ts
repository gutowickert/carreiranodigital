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
