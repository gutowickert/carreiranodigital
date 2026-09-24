// QUAIS PRODUTOS PODEM VIRAR PROPOSTA.
//
// A proposta tem duas partes: o que a IA escreve pra cada cliente (a capa e as objeções) e o CORPO
// FIXO — as páginas que explicam o que é, como funciona, o que está incluído e o que fica de fora.
// Esses corpos estão em `app/proposta/[slug]/Corpos.tsx`, um por produto.
//
// ⚠️ POR QUE ISTO EXISTE. O produto da proposta vinha da turma do lead, sem escolha. No orçamento do
// José a turma dele ainda era a Formação Completa — o curso que ele JÁ TINHA FEITO — então a
// proposta saiu com o nome "Formação Completa em Marketing Digital" enquanto o texto inteiro
// descrevia o Deu Venda. O cliente leu um documento que se contradizia.
//
// Agora o produto é escolhido na tela. Mas escolher livremente criaria o mesmo problema ao contrário:
// selecionar um produto sem corpo escrito trocaria o nome e o preço, e o texto continuaria
// descrevendo outra coisa. Por isso a lista de opções é esta — os produtos que têm corpo de verdade.
//
// ⚠️ A TRAVA DO PRODUTO NÃO SEGURA O PREÇO, e o preço sozinho já estraga a proposta. Em 24/09/2026
// o Anúncios para Negócios Locais ainda não tinha corpo: o vendedor não conseguiu trocar o produto,
// então montou uma proposta de DEU VENDA e digitou R$ 797, que é o valor da turma de anúncios. O
// documento prometia a implantação individual pelo preço do curso. Foi o que fez este segundo corpo
// ser escrito.
//
// PRA INCLUIR UM PRODUTO AQUI: primeiro escreve o corpo dele em app/proposta/[slug]/Corpos.tsx. A
// lista não é o que faz a proposta existir; é só o que impede de oferecer uma que não existe.

const COM_PROPOSTA = ['deu venda', 'anuncios para negocios locais']

const semAcento = (s: string) =>
  (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

/** Este produto tem uma proposta escrita? */
export function temProposta(nomeDoProduto: string | null | undefined): boolean {
  const n = semAcento(nomeDoProduto || '')
  return !!n && COM_PROPOSTA.some(p => n.includes(p))
}

// O BRIEFING QUE A IA RECEBE — o que ela precisa saber pra escrever a capa e as objeções.
//
// ⚠️ ANTES ELA SÓ RECEBIA O NOME DO PRODUTO, e o pedido dizia que a escola "vende implantação com
// acompanhamento". Com dois produtos isso quebra: pra turma de anúncios a IA escreveria uma capa
// prometendo implantação, que é outro produto e outro preço. Nome não descreve nada — quem escreve
// a proposta precisa saber o que está sendo vendido.
//
// As RESPOSTAS ÀS OBJEÇÕES vêm junto de propósito. São as que a escola já usa na página de vendas:
// sem elas a IA inventa uma resposta plausível e o cliente ouve uma coisa do vendedor, outra da
// proposta e uma terceira do site. Com elas, é tudo a mesma escola falando.
const RESUMOS: { chave: string; texto: string }[] = [
  {
    chave: 'anuncios para negocios locais',
    texto: `É um TREINAMENTO PRESENCIAL de 3 dias seguidos, em turma, sobre anúncios no Meta Ads. Não é implantação e não é acompanhamento mensal.
- A pessoa aprende a criar e rodar campanhas fazendo isso COM O NEGÓCIO DELA, ao vivo, não com exemplo de aula.
- Dia 1: como o Meta Ads funciona, estrutura de campanha, oferta, público e criativo. Dia 2: gerenciador na prática, primeira campanha publicada ao vivo apontando pro WhatsApp. Dia 3: leitura de métricas, otimização ao vivo e como escalar.
- Ela sai com campanha no ar, contatos chegando no WhatsApp e autonomia pra mexer sozinha. Em alguns casos, as primeiras vendas ainda durante o curso.
- Quem ensina é o Douglas Conceição, 10 anos de tráfego pago e dono de agência.
- Turma pequena e presencial: o professor corrige na hora, e é isso que separa de curso gravado.
- A verba de anúncio é por fora, e é da pessoa. Alunos fizeram resultado com R$ 8, R$ 10, R$ 20.
- O valor é POR INSCRIÇÃO.

AS OBJEÇÕES QUE A ESCOLA JÁ RESPONDE ASSIM (usa a mesma linha de raciocínio quando o material trouxer algo parecido):
- "nunca mexi com anúncios" → parte do zero, com o professor acompanhando cada passo; ninguém fica travado.
- "não tenho tempo para 3 dias" → é menos tempo do que já se perdeu tentando anunciar sozinho sem resultado, e se sai com campanha rodando em vez de conteúdo pra estudar depois.
- "já tentei e não funcionou" → aqui não se tenta sozinho; anúncio ruim quase sempre é oferta, público ou criativo, e isso se resolve no dia 1.
- "não quero virar gestor de tráfego" → o objetivo não é virar especialista, é ter controle do próprio negócio e parar de depender de terceiros.
- "preciso de um orçamento grande?" → não; o que importa é a qualidade da campanha, não o tamanho da verba.
- "agência já faz isso pra mim" → agência básica cobra a partir de R$ 1.000 por mês e a pessoa segue sem saber o que está sendo feito nem como medir.`,
  },
  {
    chave: 'deu venda',
    texto: `É uma IMPLANTAÇÃO INDIVIDUAL com 3 meses de acompanhamento. Não é curso e não é turma.
- Um especialista da escola senta com a pessoa em 2 encontros presenciais de um turno, em dias diferentes, e monta com ela a máquina de IA que escreve os anúncios, as respostas e as páginas do negócio dela.
- Depois são mais 3 encontros, um por mês (5 no total), lendo os números e decidindo o próximo teste. Se não funcionou, troca o caminho e roda de novo dentro dos 3 meses, sem custo a mais.
- Tem grupo de WhatsApp com o time da escola entre os encontros.
- A conta e a máquina são da pessoa e continuam com ela no final.
- A máquina NÃO atende sozinha e NÃO vende sozinha: prepara o anúncio, a resposta e a página; quem fala com o cliente continua sendo a pessoa.
- A verba de anúncio é por fora, e é da pessoa.
- Pagamento único, sem mensalidade.`,
  },
]

/** O que a IA precisa saber sobre o produto pra escrever a capa e as objeções. */
export function resumoDoProduto(nomeDoProduto: string | null | undefined): string {
  const n = semAcento(nomeDoProduto || '')
  return RESUMOS.find(r => n.includes(r.chave))?.texto || ''
}

// QUEM É VENDIDO POR TURMA.
//
// ⚠️ NÃO DÁ PRA DEDUZIR ISSO DA TABELA `turmas`. O Deu Venda TEM uma linha lá, mas ela não é uma
// turma — é o "container" dos leads de uma cidade, com oferta contínua, e a própria observação da
// linha diz isso. Deduzir pela existência de turma faria a proposta de implantação individual
// exigir data de turma pra ser publicada.
//
// Produto de turma não pode ser proposto sem data: o cliente precisa saber QUANDO é, e essa data
// muda todo mês. Por isso o campo é obrigatório — é a diferença entre esquecer e não poder esquecer.
const POR_TURMA = ['anuncios para negocios locais', 'formacao completa', 'reels para negocios', 'imersao']

export function exigeTurma(nomeDoProduto: string | null | undefined): boolean {
  const n = semAcento(nomeDoProduto || '')
  return !!n && POR_TURMA.some(p => n.includes(p))
}
