// Quiz "Qual é a nota de IA do teu negócio?" (19/11/2026)
// As perguntas e TODA a conta ficam aqui, num lugar só: a página (/nota-ia) usa pra mostrar o resultado
// e a rota /api/nota-ia usa a mesma conta pra gravar no CRM (o servidor não confia na nota que vem da página).
// Sem dependência nenhuma: roda no navegador e no servidor. Testes em lib/nota-ia/calculo.test.mjs.

export const PERGUNTAS = [
  { id: 'ramo', titulo: 'Qual é o ramo do teu negócio?', opcoes: [
    { v: 'comercio', t: 'Loja ou comércio' },
    { v: 'saude', t: 'Saúde, beleza ou estética' },
    { v: 'alimentacao', t: 'Alimentação' },
    { v: 'servicos', t: 'Serviços', d: 'oficina, obra, limpeza, eventos' },
    { v: 'liberal', t: 'Profissional liberal', d: 'advocacia, contabilidade, corretagem' },
    { v: 'industria', t: 'Indústria ou atacado' },
    { v: 'outro', t: 'Outro ramo' },
  ] },
  { id: 'tamanho', titulo: 'Quantas pessoas trabalham no negócio, contando tu?', opcoes: [
    { v: 'so_eu', t: 'Só eu' },
    { v: '2a5', t: 'De 2 a 5 pessoas' },
    { v: '6mais', t: '6 pessoas ou mais' },
  ] },
  { id: 'origem', multi: true, titulo: 'De onde vem cliente novo hoje?', dica: 'Pode marcar mais de uma.', opcoes: [
    { v: 'indicacao', t: 'Indicação e boca a boca' },
    { v: 'instagram', t: 'Instagram' },
    { v: 'anuncio', t: 'Anúncio pago', d: 'Facebook, Instagram ou Google' },
    { v: 'google', t: 'Busca no Google ou no Maps' },
    { v: 'passa', t: 'Passa na frente e entra' },
  ] },
  { id: 'verba', se: r => Array.isArray(r.origem) && r.origem.includes('anuncio'), titulo: 'Quanto tu investe em anúncio por mês?', opcoes: [
    { v: 'ate500', t: 'Até R$ 500' },
    { v: '500a2000', t: 'De R$ 500 a R$ 2.000' },
    { v: 'mais2000', t: 'Mais de R$ 2.000' },
  ] },
  { id: 'whats', titulo: 'Quando um cliente chama no WhatsApp, quem responde e em quanto tempo?', opcoes: [
    { v: 'eu_quando_da', t: 'Eu mesmo, quando consigo parar' },
    { v: 'rapido', t: 'Eu ou o time, em poucos minutos' },
    { v: 'horas', t: 'O time, mas às vezes leva horas' },
    { v: 'sem_resposta', t: 'Às vezes a mensagem fica sem resposta' },
  ] },
  { id: 'some', titulo: 'Acontece de alguém pedir preço e sumir?', opcoes: [
    { v: 'quase_sempre', t: 'Quase sempre' },
    { v: 'as_vezes', t: 'Às vezes' },
    { v: 'raro', t: 'É raro' },
  ] },
  { id: 'organiza', titulo: 'Onde ficam anotados os teus clientes e orçamentos?', opcoes: [
    { v: 'cabeca', t: 'Na cabeça e no próprio WhatsApp' },
    { v: 'caderno', t: 'Num caderno ou agenda' },
    { v: 'planilha', t: 'Numa planilha' },
    { v: 'sistema', t: 'Num sistema ou CRM' },
  ] },
  { id: 'conteudo', titulo: 'Quem faz os posts e vídeos do negócio?', opcoes: [
    { v: 'ninguem', t: 'Quase ninguém, posto pouco' },
    { v: 'eu_sobra', t: 'Eu, quando sobra tempo' },
    { v: 'semana', t: 'Alguém do time ou uma agência, toda semana' },
  ] },
  { id: 'ticket', titulo: 'Quanto vale, em média, uma venda pra ti?', dica: 'Um valor aproximado já serve.', opcoes: [
    { v: 'ate100', t: 'Até R$ 100' },
    { v: '100a500', t: 'De R$ 100 a R$ 500' },
    { v: '500a2000', t: 'De R$ 500 a R$ 2.000' },
    { v: 'mais2000', t: 'Mais de R$ 2.000' },
  ] },
  { id: 'ia', titulo: 'Tu já usa inteligência artificial no negócio?', opcoes: [
    { v: 'nao', t: 'Ainda não' },
    { v: 'as_vezes', t: 'Uso o ChatGPT de vez em quando' },
    { v: 'dia_a_dia', t: 'Uso no dia a dia do negócio' },
  ] },
  { id: 'objetivo', titulo: 'O que tu mais quer agora?', opcoes: [
    { v: 'clientes', t: 'Mais clientes' },
    { v: 'tempo', t: 'Mais tempo livre' },
    { v: 'organizar', t: 'Organizar a casa' },
    { v: 'aprender', t: 'Aprender a fazer o marketing' },
  ] },
  { id: 'jeito', titulo: 'Tu prefere aprender a fazer ou que façam por ti?', opcoes: [
    { v: 'aprender', t: 'Quero aprender e ficar com a máquina na mão' },
    { v: 'fazer', t: 'Quero que façam por mim' },
    { v: 'misto', t: 'Um pouco de cada' },
  ] },
  { id: 'regiao', titulo: 'Onde fica o teu negócio?', opcoes: [
    { v: 'lajeado', t: 'Lajeado e Vale do Taquari' },
    { v: 'poa', t: 'Porto Alegre e região' },
    { v: 'rs', t: 'Outra cidade do RS' },
    { v: 'fora', t: 'Fora do RS' },
  ] },
]

/** As perguntas que valem pra estas respostas (a da verba só aparece pra quem anuncia). */
export function perguntasVisiveis(r) {
  return PERGUNTAS.filter(p => !p.se || p.se(r || {}))
}

/** Texto da opção escolhida (ou das opções, na de marcar várias). */
export function textoResposta(id, valor) {
  const p = PERGUNTAS.find(x => x.id === id)
  if (!p) return ''
  const um = v => (p.opcoes.find(o => o.v === v) || {}).t || ''
  return Array.isArray(valor) ? valor.map(um).filter(Boolean).join(', ') : um(valor)
}

/** Confere se todas as perguntas visíveis têm resposta válida. Devolve a lista do que falta. */
export function faltando(r) {
  r = r || {}
  return perguntasVisiveis(r).filter(p => {
    const v = r[p.id]
    const ok = o => p.opcoes.some(x => x.v === o)
    return p.multi ? !(Array.isArray(v) && v.length && v.every(ok)) : !ok(v)
  }).map(p => p.id)
}

// ---------------------------------------------------------------------------------------------
// A NOTA: 5 partes de 0 a 20 (soma 0 a 100)
// ---------------------------------------------------------------------------------------------
const PT = {
  whats: { rapido: 14, eu_quando_da: 7, horas: 5, sem_resposta: 0 },
  some: { raro: 6, as_vezes: 3, quase_sempre: 0 },
  organiza: { cabeca: 0, caderno: 5, planilha: 11, sistema: 20 },
  conteudo: { ninguem: 0, eu_sobra: 8, semana: 16 },
  origem: { indicacao: 2, passa: 1, instagram: 5, google: 4 },
  verba: { ate500: 5, '500a2000': 7, mais2000: 8 },
  ia: { nao: 0, as_vezes: 9, dia_a_dia: 20 },
}

export const PARTES = [
  { id: 'atendimento', nome: 'Atendimento' },
  { id: 'organizacao', nome: 'Organização' },
  { id: 'conteudo', nome: 'Conteúdo' },
  { id: 'captacao', nome: 'Cliente novo' },
  { id: 'ia', nome: 'Uso de IA' },
]

export function partes(r) {
  const origem = Array.isArray(r.origem) ? r.origem : []
  const captacao = origem.reduce((s, o) => s + (o === 'anuncio' ? (PT.verba[r.verba] || 0) : (PT.origem[o] || 0)), 0)
  return {
    atendimento: (PT.whats[r.whats] || 0) + (PT.some[r.some] || 0),
    organizacao: PT.organiza[r.organiza] || 0,
    conteudo: Math.min(20, (PT.conteudo[r.conteudo] || 0) + (r.ia === 'dia_a_dia' && r.conteudo && r.conteudo !== 'ninguem' ? 4 : 0)),
    captacao: Math.min(20, captacao),
    ia: PT.ia[r.ia] || 0,
  }
}

export function faixa(nota) {
  if (nota >= 70) return { id: 'na_frente', nome: 'Na frente', texto: 'A IA já trabalha no teu negócio. Agora é ajustar onde ainda escapa tempo e venda.' }
  if (nota >= 40) return { id: 'no_caminho', nome: 'No caminho', texto: 'Tu já começou. Algumas partes rodam bem e outras ainda dependem de ti o tempo todo.' }
  return { id: 'comecando', nome: 'Começando', texto: 'Quase tudo ainda passa pela tua mão. É aqui que a IA devolve mais tempo e dinheiro.' }
}

// A referência: o retrato mais comum do pequeno negócio, passado pela mesma conta. Cliente vem por indicação e Instagram,
// o dono responde quando consegue, às vezes o orçamento some, anota no caderno, posta quando sobra tempo e usa o
// ChatGPT de vez em quando (52% dos donos usaram IA no negócio nas 2 semanas antes da pesquisa: Sebrae e Meta, 2026).
export const PERFIL_REFERENCIA = { origem: ['indicacao', 'instagram'], whats: 'eu_quando_da', some: 'as_vezes', organiza: 'caderno', conteudo: 'eu_sobra', ia: 'as_vezes' }
export const REFERENCIA = Object.values(partes(PERFIL_REFERENCIA)).reduce((a, b) => a + b, 0)

export const FONTES = [
  'Sebrae e Meta Instituto de Pesquisa, Transformação Digital nos Pequenos Negócios 2026 (7.182 entrevistados): 52% dos donos usaram IA no negócio nas duas semanas antes da entrevista; 60% pretendem começar ou ampliar o uso no próximo semestre.',
  'Sebrae e FGV IBRE, 2026: 96% das micro e pequenas empresas conhecem ferramentas de IA, só 46% usam de verdade.',
]

/** Onde a pessoa fica em relação à pesquisa, só na parte que a pesquisa mediu (uso de IA). */
export function comparacaoIA(ia) {
  if (ia === 'dia_a_dia') return 'Tu usa IA todo dia. Na pesquisa do Sebrae com a Meta, 52% dos donos usaram IA no negócio nas duas últimas semanas, e a maioria ainda de vez em quando: tu está à frente.'
  if (ia === 'as_vezes') return 'Tu está junto com a maioria: 52% dos donos usaram IA no negócio nas duas últimas semanas (Sebrae e Meta, 2026). O passo seguinte é tirar a IA do "de vez em quando" e pôr na rotina.'
  return 'Metade dos donos de pequeno negócio já usou IA no negócio nas duas últimas semanas (52%, Sebrae e Meta, 2026). Quem começa agora ainda chega antes da outra metade.'
}

// ---------------------------------------------------------------------------------------------
// QUANTO ESTÁ ESCAPANDO POR MÊS (estimativa, com as contas à mostra)
// ---------------------------------------------------------------------------------------------
export const PREMISSAS = {
  contatosMes: { so_eu: 40, '2a5': 80, '6mais': 160 },          // pessoas novas que chamam por mês
  horasWhats: { so_eu: 5, '2a5': 8, '6mais': 14 },              // horas/semana respondendo o que se repete
  parteWhatsIA: 0.5,                                             // metade disso a IA assume
  horasConteudo: { ninguem: 0, eu_sobra: 3, semana: 4 },        // horas/semana em posts e vídeos
  parteConteudoIA: 0.6,
  horasOrganiza: { cabeca: 2, caderno: 2, planilha: 1.5, sistema: 0.3 }, // horas/semana procurando e passando a limpo (por pessoa-base)
  multOrganiza: { so_eu: 1, '2a5': 1.5, '6mais': 2.5 },
  parteOrganizaIA: 0.7,
  somem: { quase_sempre: 0.5, as_vezes: 0.3, raro: 0.1 },       // dos contatos, quantos pedem preço e somem
  voltamComRetomada: 0.1,                                        // 1 em cada 10 volta quando alguém chama no dia certo
  perdaDemora: { rapido: 0, eu_quando_da: 0.02, horas: 0.03, sem_resposta: 0.05 }, // contatos que viram venda se a resposta for na hora
  ticket: { ate100: 70, '100a500': 250, '500a2000': 1000, mais2000: 3000 },
  semanasMes: 4.3,
}

const meio = n => Math.round(n * 2) / 2
const arredReais = n => (n >= 1000 ? Math.round(n / 100) * 100 : Math.round(n / 10) * 10)
const num = n => String(n).replace('.', ',')
export const reais = n => 'R$ ' + Math.round(n).toLocaleString('pt-BR')

export function perda(r) {
  const P = PREMISSAS
  const t = r.tamanho in P.contatosMes ? r.tamanho : 'so_eu'
  const hWhats = P.horasWhats[t] * P.parteWhatsIA
  const hConteudo = (P.horasConteudo[r.conteudo] || 0) * P.parteConteudoIA
  const hOrganiza = (P.horasOrganiza[r.organiza] ?? 1) * P.multOrganiza[t] * P.parteOrganizaIA
  const horasSemana = meio(hWhats + hConteudo + hOrganiza)
  const horasMes = Math.round(horasSemana * P.semanasMes)

  const contatos = P.contatosMes[t]
  const somem = Math.round(contatos * (P.somem[r.some] ?? 0.3))
  const voltam = somem * P.voltamComRetomada
  const pelaDemora = contatos * (P.perdaDemora[r.whats] ?? 0.04)
  const vendasMes = meio(voltam + pelaDemora)
  const ticket = P.ticket[r.ticket] || P.ticket['100a500']
  const valorMes = arredReais(vendasMes * ticket)

  const contas = [
    `WhatsApp: cerca de ${num(P.horasWhats[t])} h por semana respondendo o que se repete. A IA assume metade: ${num(meio(hWhats))} h.`,
    hConteudo ? `Posts e vídeos: cerca de ${num(P.horasConteudo[r.conteudo])} h por semana. Com IA fazendo em lote, sobram ${num(meio(hConteudo))} h.` : 'Posts e vídeos: hoje quase não sai post, então aqui não tem hora pra devolver, tem cliente que não está te vendo.',
    `Organização: procurar conversa, passar orçamento a limpo e lembrar quem retomar, uns ${num(meio(P.horasOrganiza[r.organiza] ?? 1) * P.multOrganiza[t])} h por semana. Com tudo num funil, ${num(meio(hOrganiza))} h voltam.`,
    `Vendas: um negócio do teu tamanho recebe uns ${contatos} contatos novos por mês. Pelo que tu respondeu, uns ${somem} pedem preço e somem. Chamando de volta no dia certo, 1 em cada 10 volta.${pelaDemora ? ` E com resposta na hora, mais uns ${num(meio(pelaDemora))} contatos fecham em vez de desistir.` : ''}`,
    `Cada venda vale uns ${reais(ticket)} pra ti: ${num(vendasMes)} venda${vendasMes === 1 ? '' : 's'} × ${reais(ticket)} ≈ ${reais(valorMes)} por mês.`,
  ]
  return { horasSemana, horasMes, vendasMes, valorMes, contatos, somem, ticket, contas }
}

// ---------------------------------------------------------------------------------------------
// AS OPORTUNIDADES (as 3 maiores, em ordem)
// ---------------------------------------------------------------------------------------------
export function oportunidades(r) {
  const origem = Array.isArray(r.origem) ? r.origem : []
  const time = r.tamanho !== 'so_eu'
  const so_indicacao = origem.length > 0 && origem.every(o => o === 'indicacao' || o === 'passa')
  const lista = [
    {
      id: 'atendimento', dor: 'o WhatsApp que demora pra ser respondido',
      titulo: 'A IA responde o WhatsApp na hora',
      porque: { sem_resposta: 'Tem mensagem ficando sem resposta. Quem não é respondido chama o concorrente.', horas: 'A resposta às vezes leva horas. Nesse tempo o cliente já perguntou pra outro.', eu_quando_da: 'Tu responde quando consegue parar, no meio do serviço. Cada parada custa tempo e atenção.', rapido: 'Tu já responde rápido. A IA tira de ti o que se repete: preço, horário, endereço, como funciona.' }[r.whats] || '',
      ganho: 'Resposta em segundos, de dia e de noite, com o jeito do teu negócio. Quando ela não sabe, chama alguém do time.',
      pontos: ({ sem_resposta: 10, horas: 8, eu_quando_da: 7, rapido: 3 }[r.whats] || 5) + (r.objetivo === 'tempo' ? 2 : 0) + (r.tamanho === '6mais' ? 1 : 0),
    },
    {
      id: 'retomada', dor: 'o orçamento que some sem resposta',
      titulo: 'Retomada do orçamento no dia certo',
      porque: { quase_sempre: 'Quase sempre alguém pede preço e some. Esse cliente já estava interessado e ficou pelo caminho.', as_vezes: 'Às vezes o cliente pede preço e some. Quase ninguém chama de volta, e é aí que a venda escapa.', raro: 'É raro o cliente sumir, mas os que somem raramente são chamados de volta.' }[r.some] || '',
      ganho: 'A IA chama de volta quem sumiu, no dia e na hora certos, sem parecer cobrança. Tu só fica sabendo de quem respondeu.',
      pontos: { quase_sempre: 10, as_vezes: 7, raro: 2 }[r.some] || 5,
    },
    {
      id: 'organizacao', dor: { cabeca: 'cliente guardado só na cabeça e no WhatsApp', caderno: 'cliente anotado no caderno', planilha: 'cliente que se perde na planilha', sistema: 'o sistema que não conversa com o WhatsApp' }[r.organiza] || 'cliente fora de um sistema',
      titulo: 'Cada cliente num funil, nada se perde',
      porque: { cabeca: 'Os clientes estão na cabeça e no WhatsApp. Basta uma semana corrida pra alguém ficar esquecido.', caderno: 'Os clientes estão no caderno. Ninguém mais do time enxerga, e retomar depende da tua memória.', planilha: 'A planilha ajuda, mas alguém precisa lembrar de atualizar, e ela não te avisa de nada.', sistema: 'Tu já tem sistema. Dá pra ligar a IA nele pra ela anotar sozinha.' }[r.organiza] || '',
      ganho: time ? 'Cada conversa vira um card com a etapa e o próximo passo. O time no mesmo lugar e tu vendo tudo num painel.' : 'Cada conversa vira um card com o próximo passo, e a IA te lembra quem chamar.',
      pontos: ({ cabeca: 9, caderno: 8, planilha: 6, sistema: 1 }[r.organiza] ?? 5) + (time ? 2 : 0) + (r.objetivo === 'organizar' ? 3 : 0),
    },
    {
      id: 'conteudo', dor: 'falta de tempo pra postar',
      titulo: 'Posts e vídeos de um mês, feitos em lote',
      porque: { ninguem: 'Quase não sai post. Quem procura o teu negócio no Instagram não vê movimento.', eu_sobra: 'Tu posta quando sobra tempo, e quase nunca sobra.', semana: 'Já tem alguém postando toda semana. A IA faz render mais: mais peças com o mesmo tempo.' }[r.conteudo] || '',
      ganho: 'Com as fotos reais do teu negócio, a IA monta posts, artes e vídeos com legenda pro mês inteiro. Tu só aprova.',
      pontos: ({ ninguem: 8, eu_sobra: 7, semana: 3 }[r.conteudo] ?? 5) + (r.objetivo === 'tempo' ? 1 : 0),
    },
    {
      id: 'anuncio', dor: 'pouco cliente novo chegando',
      titulo: 'Campanha com IA trazendo cliente novo',
      porque: !origem.includes('anuncio') ? (so_indicacao ? 'Hoje o cliente novo vem quase só de indicação. É bom, mas tu não controla quando ele vem.' : 'Tu ainda não anuncia. Dá pra ligar uma campanha pequena, só pra tua região, com o cliente chegando no WhatsApp.') : r.verba === 'ate500' ? 'Tu já anuncia com pouca verba. Com IA criando e testando os anúncios, cada real rende mais.' : 'Tu já investe em anúncio. A IA testa mais anúncios e corta o que não vende, toda semana.',
      ganho: 'A IA cria os anúncios com as tuas fotos, sobe a campanha pra tua região e mostra quanto custou cada conversa.',
      pontos: (!origem.includes('anuncio') ? 7 : r.verba === 'ate500' ? 5 : 3) + (r.objetivo === 'clientes' ? 3 : 0) + (so_indicacao ? 2 : 0),
    },
    {
      id: 'ia_dia', dor: 'ainda não usar IA na rotina',
      titulo: 'A IA na tua rotina de dono',
      porque: { nao: 'Tu ainda não usa IA. Muita tarefa de escritório já dá pra passar pra ela hoje.', as_vezes: 'Tu usa o ChatGPT de vez em quando, solto. Ele rende muito mais quando conhece o teu negócio.', dia_a_dia: 'Tu já usa IA todo dia. O próximo passo é ligar ela no WhatsApp e nos anúncios.' }[r.ia] || '',
      ganho: 'Uma IA que já conhece a tua oferta, os teus preços e o teu jeito de falar: responde, escreve e analisa contigo.',
      pontos: ({ nao: 6, as_vezes: 4, dia_a_dia: 0 }[r.ia] ?? 3) + (r.objetivo === 'aprender' ? 3 : 0) + (r.objetivo === 'tempo' ? 2 : 0),
    },
  ]
  // empate: fica na ordem da lista acima (a mais ligada a venda primeiro)
  return lista.map((o, i) => ({ ...o, i })).sort((a, b) => b.pontos - a.pontos || a.i - b.i).slice(0, 3).map(({ i, ...o }) => o)
}

// ---------------------------------------------------------------------------------------------
// O CAMINHO entre os 3 produtos da escola (sem preço: os valores vão no WhatsApp)
// ---------------------------------------------------------------------------------------------
export const PRODUTOS = {
  deu_venda: {
    nome: 'Deu Venda', tipo: 'Implantação de marketing com IA, presencial',
    resumo: 'Tu senta 1 a 1 com o Guto e sai com a IA de marketing rodando no teu negócio, sabendo usar.',
    entrega: ['A tua oferta, o teu mercado e a tua marca guardados na IA', 'Campanha da Meta no ar ainda na implantação, ajustada conversando com a IA', 'Vídeo editado pela IA e um mês de conteúdo em lote com as tuas fotos', '3 meses de acompanhamento, um encontro por mês'],
  },
  maia: {
    nome: 'Maia', tipo: 'A agência de marketing numa IA, online',
    resumo: 'A Maia faz o marketing por ti. Tu manda as fotos e aprova pelo WhatsApp.',
    entrega: ['Atende os teus clientes no WhatsApp como a tua equipe, a qualquer hora', 'Retoma o orçamento parado no dia certo', 'Cria e roda as campanhas e os posts do Instagram', 'Te manda o relatório com o que vendeu e o que ajustar'],
  },
  os: {
    nome: 'teunegócio OS', tipo: 'O sistema da tua empresa',
    resumo: 'CRM, WhatsApp com IA e painel do dono num sistema só, com o nome da tua empresa.',
    entrega: ['A IA responde no WhatsApp o que se repete e chama o time quando não sabe', 'Cada cliente vira um card no funil, com a etapa e o próximo passo', 'O painel do dono: quanto vendeu, quanto converteu e onde trava', 'Em uso em até 17 dias, e 90 dias ajustando junto'],
  },
}

export function caminho(r) {
  const noRS = ['lajeado', 'poa', 'rs'].includes(r.regiao)
  const desorganizado = ['cabeca', 'caderno', 'planilha'].includes(r.organiza)
  const onde = { lajeado: 'em Lajeado', poa: 'em Porto Alegre', rs: 'em Lajeado ou em Porto Alegre' }[r.regiao] || ''
  let principal, motivo
  if (r.jeito === 'fazer') {
    principal = 'maia'; motivo = 'Tu quer que façam por ti. A Maia assume o marketing e o atendimento, e tu só aprova.'
  } else if (noRS) {
    principal = 'deu_venda'
    motivo = r.jeito === 'aprender'
      ? `Tu quer aprender e ficar com a máquina na mão. O Deu Venda é 1 a 1, presencial ${onde}, montado no teu negócio.`
      : `Tu quer um pouco de cada: no Deu Venda tu monta junto, 1 a 1 ${onde}, e sai com a IA rodando e sabendo mexer.`
  } else {
    principal = 'maia'
    motivo = 'O Deu Venda é presencial, só no RS. Como o teu negócio fica fora, o caminho é a Maia, que é toda online e faz o marketing contigo aprovando.'
  }
  let complemento = null, motivoComplemento = null
  if (desorganizado && (r.tamanho === '6mais' || (r.objetivo === 'organizar' && r.tamanho === '2a5'))) {
    complemento = principal; motivoComplemento = PRODUTOS[principal].nome + ' entra junto pra trazer e atender cliente novo.'
    principal = 'os'
    motivo = r.tamanho === '6mais'
      ? 'Com 6 pessoas ou mais e os clientes fora de um sistema, o primeiro ganho é pôr a casa em ordem: todo cliente num funil e a IA no WhatsApp.'
      : 'Tu quer organizar a casa e já tem time. O teunegócio OS põe cada cliente num funil, com a IA no WhatsApp e o painel do dono.'
  } else if (desorganizado && r.tamanho === '2a5') {
    complemento = 'os'; motivoComplemento = 'Com time e clientes fora de um sistema, o teunegócio OS pode entrar depois, pra ninguém ser esquecido.'
  }
  return { principal, motivo, complemento, motivoComplemento }
}

/** Código da turma no CRM (o produto do lead). A Maia ainda não tem turma: o lead entra sem turma, com o caminho na qualificação. */
export function turmaDoCaminho(produto, regiao) {
  if (produto === 'deu_venda') return regiao === 'lajeado' ? 'deuvendalajeado' : 'deuvendaportoalegre'
  if (produto === 'os') return 'teunegociooscheckup'
  return null
}

// ---------------------------------------------------------------------------------------------
// TUDO JUNTO
// ---------------------------------------------------------------------------------------------
export function calcular(r) {
  r = r || {}
  const p = partes(r)
  const nota = Math.max(0, Math.min(100, Math.round(Object.values(p).reduce((a, b) => a + b, 0))))
  const ops = oportunidades(r)
  const cam = caminho(r)
  return {
    nota, faixa: faixa(nota), partes: p, referencia: REFERENCIA, comparacao: comparacaoIA(r.ia),
    perda: perda(r), oportunidades: ops, maiorDor: ops[0] ? ops[0].dor : '', caminho: cam,
    turma: turmaDoCaminho(cam.principal, r.regiao),
  }
}

/** A mensagem que vai pronta no WhatsApp: a conversa começa no problema da pessoa, não no preço. */
export function mensagemWhats(r, res) {
  const cam = res.caminho
  const prod = PRODUTOS[cam.principal].nome + (cam.complemento ? ' com ' + PRODUTOS[cam.complemento].nome : '')
  const ramo = textoResposta('ramo', r.ramo)
  return `Oi! Fiz o quiz da nota de IA e deu ${res.nota} (${res.faixa.nome.toLowerCase()}). O que mais pesa aqui é ${res.maiorDor}. O caminho indicado foi ${prod}. Quero entender como fica no meu negócio${ramo && r.ramo !== 'outro' ? ' (' + ramo.toLowerCase() + ')' : ''}.`
}

/** O que vai pro CRM: os campos do lead, o texto pro time e a qualificação completa. */
export function registroCRM(r, res, extra) {
  extra = extra || {}
  const cam = res.caminho
  const linhas = perguntasVisiveis(r).map(p => `${p.titulo} ${textoResposta(p.id, r[p.id])}`)
  const caminhoTxt = PRODUTOS[cam.principal].nome + (cam.complemento ? ' + ' + PRODUTOS[cam.complemento].nome : '')
  const resumo = `Quiz Nota de IA: nota ${res.nota}/100 (${res.faixa.nome}). Caminho: ${caminhoTxt}. Maior dor: ${res.maiorDor}. Quer: ${textoResposta('objetivo', r.objetivo)}; ${textoResposta('jeito', r.jeito).toLowerCase()}.`
  const texto = [
    resumo,
    `Escapando por mês (estimativa): ~${res.perda.horasMes} h e ~${reais(res.perda.valorMes)} em vendas.`,
    `Oportunidades:\n${res.oportunidades.map((o, i) => `${i + 1}. ${o.titulo}`).join('\n')}`,
    `Por que esse caminho: ${cam.motivo}${cam.motivoComplemento ? ' ' + cam.motivoComplemento : ''}`,
    `Respostas:\n${linhas.map(l => '• ' + l).join('\n')}`,
  ].join('\n\n')
  const origem = Array.isArray(r.origem) ? r.origem : []
  return {
    resumo,
    texto,
    campos: {
      negocio: textoResposta('ramo', r.ramo) || null,
      tamanho_equipe: textoResposta('tamanho', r.tamanho) || null,
      investimento_marketing: origem.includes('anuncio') ? textoResposta('verba', r.verba) : 'Não anuncia',
      gera_leads_digital: textoResposta('origem', origem) || null,
      maior_problema: res.maiorDor ? res.maiorDor.charAt(0).toUpperCase() + res.maiorDor.slice(1) : null,
      resposta_formulario: linhas.join('\n'),
      observacoes: resumo,
    },
    qualificacao: {
      quiz: 'nota-ia', variante: extra.variante || null, nota: res.nota, faixa: res.faixa.id, partes: res.partes,
      perda: { horas_mes: res.perda.horasMes, vendas_mes: res.perda.vendasMes, valor_mes: res.perda.valorMes },
      oportunidades: res.oportunidades.map(o => o.id), caminho: cam.principal, complemento: cam.complemento,
      regiao: r.regiao || null, jeito: r.jeito || null, objetivo: r.objetivo || null, respostas: r,
    },
  }
}

/** WhatsApp brasileiro em dígitos com 55; null se não parecer número de verdade. */
export function telefoneBR(v) {
  let d = String(v || '').replace(/\D/g, '')
  if (d.length === 10 || d.length === 11) d = '55' + d
  return d.length >= 12 && d.length <= 13 && d.startsWith('55') ? d : null
}
