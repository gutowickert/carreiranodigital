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

// A Imersão Deu Venda (turma, 08/10/2026) casa com 'deu venda' também: por isso, nas listas abaixo que
// escolhem UM produto (resumo, parcelas, corpo), a chave dela vem ANTES da do Deu Venda individual.
// O SISTEMA CND + MARKETING (26/10/2026) é o primeiro SERVIÇO MENSAL com proposta: a CND cuidando
// junto da estratégia, do tráfego e da operação no Sistema CND. Nasceu da reunião com o Matheus
// Segatto (Press Kit Studios) e segue o modelo da proposta do Espaço Dani Fell, feita à mão em 02/09.
const COM_PROPOSTA = ['deu venda', 'anuncios para negocios locais', 'imersao deu venda', 'sistema cnd']

const semAcento = (s: string) =>
  (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

// SERVIÇO MENSAL: os campos de preço do orçamento mudam de sentido (ver ehServicoMensal).
const MENSAIS = ['sistema cnd']

/**
 * É serviço por mês (e não pagamento único)?
 *
 * ⚠️ OS TRÊS CAMPOS DE PREÇO DO ORÇAMENTO MUDAM DE SENTIDO AQUI, sem coluna nova no banco:
 *   preco_vista     → o valor por mês
 *   parcelas        → o prazo, em meses
 *   preco_parcelado → a implantação (vazio = isenta)
 * e `contexto.condicao` guarda a condição extra (ex.: "+ 10% de cada assinatura nova").
 * Toda tela e todo texto que mostra preço pergunta isto antes — "à vista" e "x no cartão" numa
 * mensalidade seria o documento dizendo outra coisa que o combinado.
 */
export function ehServicoMensal(nomeDoProduto: string | null | undefined): boolean {
  const n = semAcento(nomeDoProduto || '')
  return !!n && MENSAIS.some(p => n.includes(p))
}

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
    chave: 'sistema cnd',
    texto: `É um SERVIÇO MENSAL, não curso nem turma e não implantação de pagamento único. A Carreira no Digital cuida junto com o cliente de três frentes ao mesmo tempo, com um estrategista da escola (o Guto Wickert):
- O NEGÓCIO: a oferta, o empacotamento do que ele vende e o funil, da primeira conversa até a venda.
- A CAPTAÇÃO: estratégia e tráfego pago rodando e sendo ajustados o mês inteiro. O conteúdo (gravar os vídeos) segue com o cliente; a escola ajuda com a edição por IA.
- A OPERAÇÃO: o Sistema CND instalado — atendimento no WhatsApp com IA, funil, cobrança de quem esfriou, base dos contatos e o painel com os números do negócio.
- No começo mede onde o negócio está (o ponto A); ao longo do prazo ajusta e repete o que dá resultado; no fim senta com o número na mesa.
- Reuniões pra decidir e WhatsApp aberto com o time no dia a dia.
- A verba de anúncio é do cliente e vai direto pra Meta; os custos da Meta e da IA no WhatsApp também são dele.
- O valor é por mês, pelo prazo combinado. A condição exata vem do orçamento: não escreva valor, prazo nem porcentagem.
- NÃO prometa volume de vendas nem número de assinaturas.`,
  },
  {
    // ANTES do 'deu venda': o nome dela contém o do individual
    chave: 'imersao deu venda',
    texto: `É uma IMERSÃO PRESENCIAL EM TURMA PEQUENA, não a implantação individual do Deu Venda. São 3 encontros de 3 horas seguidos (terça a quinta) e, uns 20 dias depois, um encontro de resultado. Tirado da página carreiranodigital.com/imersaolajeado e /imersaopoa (08/10/2026).
- Não é aula pra assistir: a pessoa traz o notebook, o celular com o WhatsApp Business e o acesso ao Facebook e ao Instagram do negócio, e a escola faz junto. Cada encontro termina com algo pronto no negócio dela.
- A novidade: ela grava o vídeo do jeito dela no celular e a IA edita (corta as pausas, põe legenda no tempo da fala, as cores e a marca do negócio). É a parte em que quase todo negócio trava.
- Encontro 1 · Estratégia: o contexto do negócio, o mercado, a oferta e pra quem falar. Sai com a estratégia e os roteiros dos vídeos.
- Encontro 2 · Arte, vídeo e campanha: artes, imagens e os vídeos que ela gravou editados pela IA, e a campanha no Facebook e no Instagram montada direto pelo Claude, com ela do lado. Sai com os anúncios no ar.
- Encontro 3 · Ajuste e atendimento: os primeiros contatos chegando, a campanha ajustada com dado de verdade, o atendimento no WhatsApp e o site da empresa feito com a IA. Sai com a campanha ajustada, o atendimento organizado e o site no ar.
- Encontro de resultado (uns 20 dias depois): a turma volta com os números na mão (quantas pessoas chamaram, quanto custou cada conversa, o que vendeu) e decide o próximo passo.
- O que ela leva: a estratégia; o padrão de marca (cores, letras, estilo) guardado na máquina; a máquina de IA configurada dentro do Claude com o negócio dela, que É DELA e continua com ela; a edição dos vídeos instalada e testada no computador dela; artes e posts no padrão dela; o site da empresa no ar; roteiros e legendas; a campanha no Facebook e no Instagram no ar desde o 2º encontro; o atendimento no WhatsApp Business com respostas prontas; o encontro de resultado; 30 dias no grupo da turma no WhatsApp com o time da escola.
- Quem conduz: Guto Wickert, 16 anos de empresa física antes do digital (vendeu uma, quebrou outra; olha o negócio pelo caixa, não pelo like), idealizador da Carreira no Digital. A escola formou mais de 500 alunos no primeiro ano, testou mais de 1.000 anúncios, investiu R$ 1,5 mi em anúncio nos próprios negócios e fez mais de 15 mil vendas com anúncio nos últimos 3 anos. O que se faz na imersão é o que a escola usa todo dia no próprio negócio (atendimento no WhatsApp, edição de vídeo, conteúdo e campanhas com IA).
- Turmas em Lajeado (sede na Rua Alberto Torres, 526, Centro) e Porto Alegre (Av. Carlos Gomes, 1340, Sala 904, Três Figueiras). Turma pequena, vagas limitadas. A data, o turno e o endereço vêm da turma escolhida no orçamento: não escreva data nenhuma.
- A verba dos anúncios é da pessoa e vai direto pra Meta; quanto investir se define junto no 1º encontro.
- O valor é POR INSCRIÇÃO, pagamento único. Ex-aluno da escola tem condição especial.
- NÃO prometa: acompanhamento mensal de 3 meses, encontros individuais, especialista montando sozinho no negócio, nem volume de vendas. Isso é o Deu Venda individual, outro produto.`,
  },
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

// EM QUANTAS VEZES CADA PRODUTO PARCELA.
//
// ⚠️ ERA UM NÚMERO SÓ PRA TUDO (6x, "a escola passou de 10x para 6x em 18/09"). Mas a mudança foi
// do ANL, não da escola: o Deu Venda parcela em 10x. A tela vinha sugerindo 6x pro Deu Venda, e só
// não saiu proposta errada porque o vendedor corrigia na mão toda vez — o que é o mesmo que dizer
// que um dia sairia.
//
// A CONTA DO CARTÃO é a mesma nos dois: à vista + R$ 200, dividido pelas parcelas do produto.
//   Deu Venda  2.797 + 200 = 2.997 → 10x de 299,70
//   ANL          797 + 200 =   997 →  6x de 166,17
// A IMERSÃO DEU VENDA (08/10/2026) NÃO TEM O ACRÉSCIMO: o site anuncia R$ 1.497 ou 6x de R$ 249,50
// (1.497 ÷ 6, sem os R$ 200). A proposta tem que bater com a página que o cliente já viu.
// Vem antes do 'deu venda', porque o nome dela contém o do individual.
const PARCELAS: { chave: string; vezes: number; acrescimo?: number }[] = [
  { chave: 'imersao deu venda', vezes: 6, acrescimo: 0 },
  { chave: 'deu venda', vezes: 10 },
  { chave: 'anuncios para negocios locais', vezes: 6 },
]
const PARCELAS_PADRAO = 6
export const ACRESCIMO_CARTAO = 200

// No serviço mensal o campo de parcelas é o PRAZO: 6 meses é o que a casa propõe (Dani, 02/09).
const PRAZO_PADRAO_MESES = 6

export function parcelasDoProduto(nomeDoProduto: string | null | undefined): number {
  if (ehServicoMensal(nomeDoProduto)) return PRAZO_PADRAO_MESES
  const n = semAcento(nomeDoProduto || '')
  return PARCELAS.find(p => n.includes(p.chave))?.vezes || PARCELAS_PADRAO
}

/** O valor de cada parcela no cartão, pelo número de vezes daquele produto. */
export function parcelaDoProduto(nomeDoProduto: string | null | undefined, precoVista: number | null): number | null {
  if (precoVista == null) return null
  // no serviço mensal este campo é a implantação: não existe conta de cartão pra sugerir
  if (ehServicoMensal(nomeDoProduto)) return null
  const vezes = parcelasDoProduto(nomeDoProduto)
  const n = semAcento(nomeDoProduto || '')
  const acrescimo = PARCELAS.find(p => n.includes(p.chave))?.acrescimo ?? ACRESCIMO_CARTAO
  return Math.round(((Number(precoVista) + acrescimo) / vezes) * 100) / 100
}
