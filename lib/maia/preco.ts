// Maia: regra fixa da casa, VALOR ANTES DO PREÇO (08/11). O cliente perguntou o preço: primeiro uma ou duas frases do que ele
// ganha (o que vem, o que inclui, o resultado) e logo depois o preço, na mesma resposta.
// O texto da IA já pede isso, mas no teste o modelo barato ainda abria com o número ("A caixa com 6 cookies sai R$ 45. Temos os
// sabores..."). Esta é a conferência DEPOIS da resposta: se a frase com o R$ veio primeiro, a mensagem é reescrita mudando só a
// ordem (primeiro o modelo barato, depois o forte). O preço nunca some nem vai pra outra mensagem: se a reescrita perder um
// valor, trocar de mensagem ou não acertar a ordem, fica a mensagem original.

const semAc = (s: any) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const TEM_PRECO = /R\$\s?\d/
const precos = (t: string) => [...String(t).matchAll(/R\$\s?(\d[\d.,]*)/g)].map(m => m[1].replace(/[.,]$/, '')).sort().join('|')

// frases: corta depois de . ! ? … e depois de emoji (a apresentação costuma terminar em "😊")
export const frases = (t: string) => String(t || '').split(/(?<=[.!?…]|\p{Extended_Pictographic}️?)\s+(?=\S)/u).map(s => s.trim()).filter(Boolean)
// cumprimento ("Oi!", "Olá, tudo bem?") e apresentação ("Eu sou a assistente virtual do ...") não contam como valor
const abertura = (f: string) => {
  const s = semAc(f).replace(/\p{Extended_Pictographic}|️/gu, '').trim()
  return !s || /^(oi|ola|opa|oie|bom dia|boa tarde|boa noite|tudo bem|tudo bom|que bom|obrigad)\b[^.?!]{0,30}[.!?]?$/.test(s) || /assistente virtual|sou a maia\b|aqui e a\b/.test(s)
}
// uma frase de valor: afirmação (não pergunta), sem o R$, com pelo menos 4 palavras ("Temos sim!" não é valor)
const fraseDeValor = (f: string) => !TEM_PRECO.test(f) && !/\?\s*$/.test(f) && f.split(/\s+/).filter(w => /\p{L}/u.test(w)).length >= 4

// true = o preço veio antes do valor (a ordem errada). Olha só a mensagem onde aparece o 1º R$
export function precoAntesDoValor(msgs: string[] | string): boolean {
  const lista = Array.isArray(msgs) ? msgs : [msgs]
  const i = lista.findIndex(m => TEM_PRECO.test(m))
  if (i < 0) return false
  const fs = frases(lista[i]).filter(f => !abertura(f))
  const p = fs.findIndex(f => TEM_PRECO.test(f))
  return p >= 0 && !fs.slice(0, p).some(fraseDeValor) && !valorNaFrase(fs[p])
}
// o valor também pode vir na MESMA frase, antes do número, separado por vírgula, ponto e vírgula ou dois pontos:
// "O bolo de pote vem nos sabores ninho com morango ou chocolate, e cada um sai R$ 15." (certo)
// "A caixa com 6 cookies artesanais sai R$ 45, e você escolhe os sabores." (errado: o número vem antes)
const valorNaFrase = (f: string) => {
  const antes = f.slice(0, f.search(TEM_PRECO)).split(/[,;:]\s+|\s+[—–-]\s+/)
  return antes.slice(0, -1).some(c => c.split(/\s+/).filter(w => /\p{L}/u.test(w)).length >= 4)
}

// a mensagem tem alguma coisa além do preço pra pôr antes? (se só tem o preço, a regra deixa dizer direto)
const temValorDepois = (m: string) => {
  const fs = frases(m).filter(f => !abertura(f))
  const p = fs.findIndex(f => TEM_PRECO.test(f))
  if (p < 0) return false
  // o resto da frase do preço depois do número ("sai R$ 45, e você escolhe entre os sabores...") ou uma frase de valor depois dela
  const resto = fs[p].replace(/^[\s\S]*?R\$\s?\d[\d.,]*/, '')
  return resto.split(/\s+/).filter(w => /\p{L}/u.test(w)).length >= 4 || fs.slice(p + 1).some(fraseDeValor)
}

export async function valorAntesDoPreco(sistema: string, msgs: string[], op: { modelos: string[]; uso?: any }): Promise<{ msgs: string[]; reescreveu: boolean }> {
  if (!precoAntesDoValor(msgs)) return { msgs, reescreveu: false }
  const i = msgs.findIndex(m => TEM_PRECO.test(m))
  if (!temValorDepois(msgs[i])) return { msgs, reescreveu: false }
  const { emJson } = await import('./ia')
  for (const modelo of op.modelos) {
    try {
      const r = await emJson<{ texto: string }>(`${sistema}\n\nTua tarefa agora: reescrever UMA mensagem pro cliente que perguntou o preço. Regra fixa da casa: primeiro o valor, depois o número.`,
        `MENSAGEM: ${msgs[i]}\n\nReescreve mudando SÓ a ordem:\n1) se a mensagem começa com cumprimento ou apresentação ("Oi! Eu sou a assistente virtual..."), ela continua no começo;\n2) depois, uma ou duas frases curtas do que o cliente ganha (o que vem, o que inclui, os sabores, o resultado), usando SÓ o que já está na mensagem;\n3) logo em seguida, a frase com o preço (todos os R$ da mensagem, iguais);\n4) o resto (perguntas, entrega, prazo) no fim, como estava.\nNão acrescenta nenhuma informação, não tira nenhum valor e mantém o mesmo jeito de falar (você/tu). A frase com "R$" NUNCA vem antes da frase do que o cliente ganha.\nExemplo. Antes: "A pizza grande sai R$ 59. Ela tem 8 fatias e vem com a borda recheada." Depois: "A pizza grande tem 8 fatias e vem com a borda recheada. Ela sai R$ 59."\nDevolve {"texto":"..."}`,
        [], { modelo, uso: op.uso })
      const novo = String(r?.texto || '').trim()
      if (novo && precos(novo) === precos(msgs[i]) && !precoAntesDoValor(novo) && novo.length <= msgs[i].length * 1.4 + 40 && !/<\/?msg>/.test(novo)) {
        const saida = msgs.slice(); saida[i] = novo
        return { msgs: saida, reescreveu: true }
      }
    } catch { /* sem IA: fica a original (o preço nunca some) */ }
  }
  return { msgs, reescreveu: false }
}
