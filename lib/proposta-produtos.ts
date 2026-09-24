// QUAIS PRODUTOS PODEM VIRAR PROPOSTA.
//
// A proposta tem duas partes: o que a IA escreve pra cada cliente (a capa e as objeções) e o CORPO
// FIXO — as páginas que explicam o que é, como funciona, o que está incluído e o que fica de fora.
// Esse corpo está escrito em `app/proposta/[slug]/page.tsx` e descreve o Deu Venda: implantação
// presencial em 2 encontros de um turno (dias diferentes), IA configurada com o negócio da pessoa,
// 3 meses de acompanhamento com 1 encontro por mês (5 no total), verba de anúncio por fora.
//
// ⚠️ POR QUE ISTO EXISTE. O produto da proposta vinha da turma do lead, sem escolha. No orçamento do
// José a turma dele ainda era a Formação Completa — o curso que ele JÁ TINHA FEITO — então a
// proposta saiu com o nome "Formação Completa em Marketing Digital" enquanto o texto inteiro
// descrevia o Deu Venda. O cliente leu um documento que se contradizia.
//
// Agora o produto é escolhido na tela. Mas escolher livremente criaria o mesmo problema ao contrário:
// selecionar "Anúncios para Negócios Locais" trocaria o nome e o preço, e o corpo continuaria
// descrevendo a implantação do Deu Venda. Por isso a lista de opções é esta — os produtos que têm
// corpo escrito de verdade.
//
// PRA INCLUIR UM PRODUTO AQUI: primeiro escreva o corpo dele na página da proposta. A lista não é o
// que faz a proposta existir; é só o que impede de oferecer uma que não existe.

const COM_PROPOSTA = ['deu venda']

const semAcento = (s: string) =>
  (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

/** Este produto tem uma proposta escrita? */
export function temProposta(nomeDoProduto: string | null | undefined): boolean {
  const n = semAcento(nomeDoProduto || '')
  return !!n && COM_PROPOSTA.some(p => n.includes(p))
}
