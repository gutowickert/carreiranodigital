// Maia: respostas FIXAS, sem IA (12/11, custo + nada de erro). Quando o cliente só pergunta a chave Pix, o endereço, o horário
// ou o frete, e a ficha do negócio (neg.contexto) tem isso escrito, a resposta sai da ficha: de graça, na hora e sem inventar.
// Qualquer outra coisa na mesma mensagem (preço, produto, reclamação, mais de um assunto) segue pra IA, como sempre.
// Campos aceitos na ficha (contexto): pix | chave_pix, endereco | localizacao, horario | horarios | funcionamento, frete | entrega.

const semAc = (s: any) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

type Assunto = 'pix' | 'endereco' | 'horario' | 'frete'

const PERGUNTA: Record<Assunto, RegExp> = {
  pix: /\b(chave( do)? pix|qual (e |eh )?(o |a )?pix|manda (o |a )?pix|passa (o |a )?pix|pix de voces|pix pra (eu )?pagar|me (manda|passa) (a )?chave)\b/,
  endereco: /\b(endereco|onde (fica|ficam|voces ficam|e a loja|e o local)|localizacao|como (chego|chegar)|qual (e |eh )?o local)\b/,
  horario: /\b(horario|horarios|que horas (abre|abrem|fecha|fecham|voces abrem|voces fecham)|(abre|abrem|fecha|fecham|funciona|funcionam|atende|atendem) (que horas|ate que horas|de que horas)|ate que horas)\b/,
  frete: /\b(frete|taxa de entrega|valor da entrega|quanto (e |fica |sai )?(a |o )?(entrega|frete)|entregam em|faz(em)? entrega)\b/,
}
const CAMPOS: Record<Assunto, string[]> = {
  pix: ['pix', 'chave_pix'],
  endereco: ['endereco', 'localizacao'],
  horario: ['horario', 'horarios', 'funcionamento'],
  frete: ['frete', 'entrega'],
}
// outro assunto junto: vai pra IA (ela responde tudo junto, sem perder nada)
const OUTRO_ASSUNTO = /\b(preco|valor|quanto custa|quanto (e|sai|fica) (o|a|um|uma)|tem (o|a|algum|alguma)|quero|queria|gostaria|reclam|errad|devol|cancel|desconto|parcel|cartao|boleto)\b/

function campo(neg: any, a: Assunto): string | null {
  const c = neg?.contexto || {}
  for (const k of CAMPOS[a]) { const v = c[k]; if (typeof v === 'string' && v.trim()) return v.trim(); if (typeof v === 'number') return String(v) }
  return null
}

const RESPOSTA: Record<Assunto, (v: string) => string> = {
  pix: v => `A chave Pix é: ${v}\nAssim que pagar, é só mandar o comprovante aqui.`,
  endereco: v => `O endereço é: ${v}`,
  horario: v => `O horário de atendimento é: ${v}`,
  frete: v => `Sobre a entrega: ${v}`,
}

// devolve a resposta pronta, ou null (aí a IA responde)
export function respostaFixa(neg: any, textoCliente: string): { assunto: Assunto; texto: string } | null {
  const s = semAc(textoCliente).trim()
  if (!s || s.length > 90) return null
  const assuntos = (Object.keys(PERGUNTA) as Assunto[]).filter(a => PERGUNTA[a].test(s))
  if (assuntos.length !== 1) return null
  // "quero pagar, qual o pix?" é o sim do cliente: aí o pix vai, mas "quero 2 caixas, qual o pix?" tem pedido junto: vai pra IA
  let resto = s.replace(PERGUNTA[assuntos[0]], ' ')
  if (assuntos[0] === 'pix') resto = resto.replace(/\b(quero|vou|posso|queria) (te )?(pagar|fazer o pix)\b/g, ' ')
  if (OUTRO_ASSUNTO.test(resto)) return null
  const v = campo(neg, assuntos[0])
  if (!v) return null
  return { assunto: assuntos[0], texto: RESPOSTA[assuntos[0]](v) }
}
