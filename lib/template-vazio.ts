// VARIÁVEL DE TEMPLATE QUE IRIA VAZIA PRA META. A Meta recusa parâmetro de texto em branco com o
// erro #131008 ("Parameter of type text is missing text value") e o card mostrava esse JSON cru.
// Achado em 14/09/2026: o card mandava {{vendedor}} em branco em TODO template ("aqui é o {{vendedor}}
// da Carreira no Digital"), então nenhum template saía pelo card — pela tela do WhatsApp saía.
// Aqui a gente pega antes de enviar e diz em português o que faltou.
const NOME_VARIAVEL: Record<string, string> = {
  nome: 'o nome do lead', vendedor: 'o nome de quem atende', curso: 'o curso', cidade: 'a cidade',
  datas: 'as datas', prazo: 'o prazo', preco: 'o preço', preco_pix: 'o preço no Pix',
  preco_cartao: 'o preço no cartão', condicao_bolsa: 'a condição da bolsa', condicao: 'a condição',
}

/** O nome legível da primeira variável que iria VAZIA pra Meta, ou null se está tudo preenchido.
 *  Olha só as variáveis que viram parâmetro (a ordem declarada no template). */
export function variavelVazia(ordem: string[], valores: Record<string, string>): string | null {
  for (const k of ordem) {
    const v = valores[k]
    if (v !== undefined && !String(v).trim()) return NOME_VARIAVEL[k] || k
  }
  return null
}
