// O PEDIDO E AS TRAVAS DA PROPOSTA ESCRITA PELA IA — num lugar só (27/10/2026).
//
// Moravam dentro de app/api/orcamentos/gerar/route.ts. Saíram pra cá quando o Plantão da IA
// (lib/ia-plantao.ts) passou a montar proposta sozinho: as duas portas precisam das MESMAS travas
// (preço nunca da IA, citação tem que existir na conversa, capa sem a mecânica do outro produto),
// e trava copiada é trava que um dia diverge.

// Modelo: Sonnet 5, escolhido pelo custo (é o mais barato que dá conta deste texto).

export const MODELO = 'claude-sonnet-5'
export const MAX_OBJECOES = 4
export const MAX_CARACTERES_MATERIAL = 60_000   // teto de material lido: ligação de 40 min dá ~35 mil

// ⚠️ NÃO DIZ MAIS "vende implantação com acompanhamento". Dizia, e isso era o Deu Venda descrito
// como se fosse a escola inteira: com o segundo produto no ar, a IA escrevia capa de implantação
// pra uma turma de 3 dias. O que a escola vende NAQUELA proposta vai no pedido, por produto.
export const SYSTEM = `Tu escreves parte de uma proposta comercial brasileira, para uma escola de marketing digital presencial.

O QUE TU ESCREVE: só a capa e as respostas às objeções que a pessoa levantou. O resto da proposta já existe pronto.

REGRAS DURAS:
- Cada objeção precisa vir de uma FRASE EXATA que a pessoa disse no material. Copia a frase no campo "citacao", igual, sem corrigir português.
- Se não houver objeção clara no material, devolve a lista vazia. Não inventa objeção.
- NUNCA escreve preço, valor, parcela, desconto ou prazo de pagamento. Isso entra depois, do cadastro.
- NUNCA promete resultado, número de vendas ou garantia.
- Não inventa detalhe do negócio do cliente que não esteja no material ou no contexto informado.
- Escreve em português do Brasil, falando com a pessoa por "tu", tom direto e sem jargão. Frases curtas.
- Reconhece a objeção antes de responder; nada de resposta de manual.

⚠️ NÃO DESCREVA A MECÂNICA DO PRODUTO. Nada de quantos encontros, quantos dias, quantos meses,
quantas aulas, o que está incluído ou como é a entrega. Isso JÁ está escrito nas páginas seguintes
da proposta, que não passam por ti e não mudam. Se tu reescrever a estrutura com tuas palavras,
ela vai sair diferente a cada geração — e um dia vai sair errada, com o número de um produto
dentro da proposta do outro. Tu escreve sobre O NEGÓCIO DA PESSOA e sobre o que ela ganha; a
estrutura do que a escola entrega não é tua.

COMO SE ESCREVEM OS NOMES (a transcrição erra estes, e o erro chega até aqui):
- A ferramenta de IA chama-se **Claude**. No material ela aparece como "cloud", "clod", "cláudio",
  "claudia" ou "claude" minúsculo — é tudo a mesma coisa, e no TÍTULO e no TEXTO escreve-se Claude.
- Chama-se **Hotmart**, **Kiwify**, **Meta**, **Instagram**, **WhatsApp**.
- ⚠️ NA CITAÇÃO NÃO SE CORRIGE NADA. Ela é a frase que a pessoa falou, e é o que prova que a
  objeção veio da conversa. Fica exatamente como está no material, com erro e tudo.

FORMATO DA RESPOSTA: só um JSON, sem texto em volta:
{"capa":{"titulo":"...","subtitulo":"..."},"objecoes":[{"titulo":"...","citacao":"...","texto":"..."}]}
- titulo da capa: até 90 caracteres, dizendo o que a pessoa ganha, no vocabulário do negócio dela.
- subtitulo: 2 ou 3 frases sobre o que MUDA NO NEGÓCIO DELA — a situação dela hoje e onde ela chega.
- objecoes: no máximo ${MAX_OBJECOES}, da mais importante para a menos.
- titulo da objeção: como o vendedor descreveria o ponto, em até 60 caracteres.
- texto: 2 a 5 frases respondendo aquela objeção.`

// A MECÂNICA DE CADA PRODUTO, e o que ela NÃO pode encostar.
//
// ⚠️ POR QUE ISTO EXISTE. A proposta tem duas partes: o corpo fixo, que descreve o produto e nunca
// muda, e a capa, que a IA escreve pra cada cliente. O pedido mandava a capa "explicar o que
// acontece na prática" — ou seja, reescrever a mecânica do produto com palavras novas a cada
// geração. Duas gerações seguidas pro mesmo lead saíram "durante 3 meses" e "em mais três
// encontros mensais": as duas certas, por sorte. A terceira podia sair com o número do outro
// produto, e aí o documento se contradiz na página seguinte — com o cliente lendo.
//
// Isto não é análise de texto: é uma lista curta do que é INCONFUNDIVELMENTE do outro lado. O
// Deu Venda não tem dias de curso nem turma; o ANL não tem implantação nem acompanhamento mensal.
const MECANICA_ALHEIA: { chave: string; proibido: [RegExp, string][] }[] = [
  {
    chave: 'anuncios para negocios locais',   // é turma; não tem implantação nem mês de acompanhamento
    proibido: [
      [/implanta[çc][ãa]o/i, 'implantação'],
      [/acompanhamento\s+mensal/i, 'acompanhamento mensal'],
      [/encontros?\s+mensa/i, 'encontros mensais'],
      [/(\d+|tr[êe]s)\s*meses/i, 'meses de acompanhamento'],
    ],
  },
  {
    chave: 'trafego e software',               // por mês; não instala o Sistema CND
    proibido: [
      [/\bturmas?\b/i, 'turma'],
      [/\baulas?\b/i, 'aulas'],
      [/pagamento\s+[úu]nico/i, 'pagamento único'],
      [/sistema\s+cnd/i, 'Sistema CND'],
    ],
  },
  {
    chave: 'sistema cnd',                      // é serviço por mês; não tem turma, aula nem pagamento único
    proibido: [
      [/\bturmas?\b/i, 'turma'],
      [/\baulas?\b/i, 'aulas'],
      [/pagamento\s+[úu]nico/i, 'pagamento único'],
    ],
  },
  {
    chave: 'deu venda',                        // é 1 a 1; não tem turma nem dias de aula
    proibido: [
      [/\bturmas?\b/i, 'turma'],
      [/(\d+|tr[êe]s)\s*dias?\s+(presenciais|de\s+(curso|treinamento|imers[ãa]o|aula))/i, 'dias de curso'],
      [/\baulas?\b/i, 'aulas'],
    ],
  },
]

/** Devolve o termo proibido encontrado, ou null. */
export function mecanicaDoOutroProduto(produtoNome: string | null, texto: string): string | null {
  const n = (produtoNome || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const regra = MECANICA_ALHEIA.find(r => n.includes(r.chave))
  if (!regra) return null
  for (const [re, nome] of regra.proibido) if (re.test(texto)) return nome
  return null
}

// normaliza pra comparar citação com o material: sem acento, sem pontuação, espaços colapsados
export const normal = (s: string) =>
  (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()

// a IA às vezes corta a frase no meio; aceita se um pedaço grande da citação existir no material
export function citacaoConfere(citacao: string, materialNormal: string): boolean {
  const c = normal(citacao)
  if (c.length < 12) return false
  if (materialNormal.includes(c)) return true
  const palavras = c.split(' ')
  for (let tam = Math.min(palavras.length, 12); tam >= 6; tam--) {
    for (let i = 0; i + tam <= palavras.length; i++) {
      if (materialNormal.includes(palavras.slice(i, i + tam).join(' '))) return true
    }
  }
  return false
}

export function jsonDaResposta(raw: string): any {
  try { return JSON.parse(raw) } catch { /* segue */ }
  const a = raw.indexOf('{'), z = raw.lastIndexOf('}')
  if (a >= 0 && z > a) { try { return JSON.parse(raw.slice(a, z + 1)) } catch { /* segue */ } }
  return null
}

// O ENDEREÇO DO LINK DA PROPOSTA (veio de app/api/orcamentos/publicar, que segue usando daqui)
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789'
const sorteio = (n = 5) => Array.from({ length: n }, () => ALFABETO[Math.floor(Math.random() * ALFABETO.length)]).join('')

// O endereço leva o nome da pessoa: "/proposta/vinicius-meirer-4f7k2" em vez de "/proposta/gzhgb8nvgw".
// Código puro tem cara de link encurtado, e é isso que o cliente associa a golpe — o nome dele no
// endereço diz, antes de abrir, que aquilo foi feito pra ele.
//
// ⚠️ O SORTEIO NO FIM NÃO SAI. Sem ele o endereço vira adivinhável: o link é aberto, sem senha, e
// quem abrir lê o preço e as frases que a pessoa disse na conversa. Com 5 caracteres sorteados são
// mais de 28 milhões de combinações por nome — tentar na mão não chega a lugar nenhum.
export function enderecoDe(nome: string) {
  const partes = (nome || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').trim()
    .split(/\s+/).filter(Boolean)
  // primeiro nome + último sobrenome: nome do meio só alonga o endereço
  const nomes = partes.length > 1 ? [partes[0], partes[partes.length - 1]] : partes
  const limpo = nomes.join('-').slice(0, 34)
  return `${limpo || 'proposta'}-${sorteio()}`
}

