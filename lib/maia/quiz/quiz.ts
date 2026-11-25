// Quiz de diagnóstico da Maia (24/11/2026): /maia/quiz/oficina e /maia/quiz/otica.
// O dono responde 8 perguntas de tocar, deixa o contato e vê, com os números dele, onde perde cliente e o
// que a Maia faz em cada ponto. Substitui o "me manda um teste": não existe amostra grátis.
//
// ESTE ARQUIVO É PURO (sem import, sem banco, sem tela): a página roda a mesma conta no navegador (pra mostrar
// o resultado mesmo se a API cair) e a API roda de novo no servidor (o que vai pro CRM é a conta do servidor).
// Também roda direto no Node (scripts/teste-maia-quiz.mjs), por isso não usa enum nem import.
//
// A CONTA É CONSERVADORA DE PROPÓSITO, e cada premissa aparece escrita na tela. Nenhum número aqui é
// estatística de mercado: são suposições baixas, ditas como suposição ("considerando que...").

// ---------------- a oferta (online, pra fora do RS) ----------------
export const OFERTA_QUIZ = {
  primeiro_mes: 497,      // R$, já com a implantação online
  mensal: 797,            // R$ por mês, do 2º mês em diante
  fidelidade: false,
}
// WhatsApp da escola (o /wa redireciona pro número central, que é este)
export const WA_ESCOLA = '5551995054548'
// Destino de cada botão do resultado. Hoje os dois vão pro WhatsApp passando pelo /wa (rastreio + ref).
// Pra trocar "Quero começar" por um link de pagamento, troque { tipo: 'wa' } por { tipo: 'link', url: 'https://...' }.
// 24/11 (doc do Guto "Maia vende a Maia"): 'wa_maia' abre o WhatsApp DA MAIA (51 99376-7137) com a mensagem pronta; quem atende é
// a vendedora da Maia (lib/maia/vendedora.ts), que acha o lead deste quiz pelo telefone e já sabe o diagnóstico
export const WA_MAIA = '5551993767137'
export type Destino = { tipo: 'wa' } | { tipo: 'wa_maia' } | { tipo: 'link'; url: string }
export const DESTINO_COMECAR: Destino = { tipo: 'wa_maia' }
export const DESTINO_DUVIDA: Destino = { tipo: 'wa_maia' }
// turma-recipiente dos leads do quiz no CRM da escola (uma só pros dois nichos; o nicho vai na qualificação)
export const TURMA_QUIZ = 'maiaquiz'
export const PIXEL_ESCOLA = '3968641693466078'

// ---------------- as perguntas ----------------
export type Nicho = 'oficina' | 'otica'
export type Opcao = { v: string; t: string; n?: number; img?: string }   // n = número que entra na conta (quando a opção é faixa)
export type Pergunta = { id: string; titulo: string; ajuda?: string; opcoes: Opcao[] }
export type Quiz = {
  nicho: Nicho
  nome: string                 // "oficina", "ótica"
  artigo: 'a'
  unidade: [string, string]    // singular, plural ("carro", "carros")
  servico: string              // "serviço", "venda"
  eyebrow: string
  titulo: string
  sub: string
  titulo_curto?: string        // 25/11: abertura compacta (botão no topo do celular); quando tem, a abertura usa esta versão
  sub_curto?: string
  destaque: string            // pedaço do título que vem na cor clara (como nas páginas de nicho)
  hero: string                 // foto real da abertura
  ad_img: string               // foto real do exemplo de anúncio
  fala: string                 // a primeira fala da Maia na abertura
  perguntas: Pergunta[]
}

const RESPOSTA = (quem: string, onde: string): Opcao[] => [
  { v: 'rapido', t: `${quem} responde em poucos minutos` },
  { v: 'eu1h', t: `Eu mesmo, entre ${onde} e outro (até 1 hora)` },
  { v: 'horas', t: 'Às vezes demora algumas horas' },
  { v: 'fimdia', t: 'Muitas vezes só consigo no fim do dia' },
]
const ANUNCIO: Opcao[] = [
  { v: 'nao', t: 'Não anuncio' },
  { v: 'parei', t: 'Já anunciei e parei' },
  { v: 'ate500', t: 'Sim, até R$ 500 por mês', n: 400 },
  { v: '500a1500', t: 'Sim, de R$ 500 a R$ 1.500 por mês', n: 900 },
  { v: 'mais1500', t: 'Sim, mais de R$ 1.500 por mês', n: 2000 },
]

export const QUIZZES: Record<Nicho, Quiz> = {
  oficina: {
    nicho: 'oficina', nome: 'oficina', artigo: 'a', unidade: ['carro', 'carros'], servico: 'serviço',
    eyebrow: 'Diagnóstico para oficinas',
    titulo: 'Quantos carros a mais a sua oficina pode atender por mês?',
    sub: 'Responda 8 perguntas de tocar. No fim você vê, com os seus números, quanto dá pra ganhar com anúncio, atendimento, retomada, conteúdo e a sua base de clientes, e o que a Maia faz em cada parte.',
    titulo_curto: 'Quantos carros a mais sua oficina pode atender?',
    sub_curto: 'No fim você vê, com os seus números, quanto dá pra ganhar a mais com anúncio, atendimento e retomada, e o que a Maia faz em cada parte.',
    destaque: 'a mais', hero: '/maia/img/quiz/oficina/oficina-hero.jpg', ad_img: '/maia/img/quiz/oficina/anuncio-motor.jpg',
    fala: 'Oi, eu sou a Maia. Em 1 minuto eu te mostro quanto a sua oficina pode ganhar a mais.',
    perguntas: [
      { id: 'tipo', titulo: 'Qual é o forte da sua oficina?', opcoes: [
        { v: 'mecanica', t: 'Mecânica geral', img: '/maia/img/quiz/oficina/mecanica-geral.jpg' },
        { v: 'cambio', t: 'Câmbio automático', img: '/maia/img/quiz/oficina/cambio-elevador.jpg' },
        { v: 'retifica', t: 'Retífica de motor', img: '/maia/img/quiz/oficina/retifica-cabecote.jpg' },
        { v: 'injecao', t: 'Injeção e elétrica', img: '/maia/img/quiz/oficina/injecao-scanner.jpg' },
        { v: 'funilaria', t: 'Funilaria e pintura', img: '/maia/img/quiz/oficina/funilaria-pintura.jpg' },
      ] },
      { id: 'volume', titulo: 'Quantos carros você atende por mês, mais ou menos?', opcoes: [
        { v: 'ate30', t: 'Até 30', n: 20 },
        { v: '31a60', t: '31 a 60', n: 42 },
        { v: '61a100', t: '61 a 100', n: 75 },
        { v: '101a150', t: '101 a 150', n: 120 },
        { v: 'mais150', t: 'Mais de 150', n: 160 },
      ] },
      { id: 'ticket', titulo: 'Quanto fica, em média, um serviço na sua oficina?', opcoes: [
        { v: 'ate300', t: 'Até R$ 300', n: 220 },
        { v: '300a600', t: 'R$ 300 a R$ 600', n: 400 },
        { v: '600a1200', t: 'R$ 600 a R$ 1.200', n: 800 },
        { v: '1200a2500', t: 'R$ 1.200 a R$ 2.500', n: 1600 },
        { v: 'mais2500', t: 'Mais de R$ 2.500', n: 2800 },
      ] },
      { id: 'origem', titulo: 'De onde vem a maioria dos seus clientes novos?', opcoes: [
        { v: 'indicacao', t: 'Indicação de outro cliente' },
        { v: 'google', t: 'Google (Maps ou busca)' },
        { v: 'instagram', t: 'Instagram, sem anúncio pago' },
        { v: 'anuncio', t: 'Anúncio pago no Facebook ou Instagram' },
        { v: 'passam', t: 'Passam na frente da oficina' },
      ] },
      { id: 'resposta', titulo: 'Quando chega mensagem no WhatsApp, quem responde e em quanto tempo?', opcoes: RESPOSTA('Alguém do balcão', 'um serviço') },
      { id: 'retomada', titulo: 'E o orçamento que você mandou e o cliente não respondeu?', opcoes: [
        { v: 'nada', t: 'Fica por isso mesmo' },
        { v: 'asvezes', t: 'Chamo de novo às vezes, quando lembro' },
        { v: 'rotina', t: 'Tenho rotina: chamo de novo em dias certos' },
      ] },
      { id: 'base', titulo: 'Você chama de volta quem já foi cliente?', ajuda: 'Revisão, troca de óleo, manutenção, antes de viagem.', opcoes: [
        { v: 'nada', t: 'Não, espero ele voltar' },
        { v: 'asvezes', t: 'Às vezes mando mensagem' },
        { v: 'rotina', t: 'Sim, tenho a lista e aviso na época certa' },
      ] },
      { id: 'anuncio', titulo: 'Você anuncia no Facebook ou no Instagram hoje?', opcoes: ANUNCIO },
    ],
  },
  otica: {
    nicho: 'otica', nome: 'ótica', artigo: 'a', unidade: ['óculos', 'óculos'], servico: 'venda',
    eyebrow: 'Diagnóstico para óticas',
    titulo: 'Quantos óculos a mais a sua ótica pode vender por mês?',
    sub: 'Responda 8 perguntas de tocar. No fim você vê, com os seus números, quanto dá pra ganhar com anúncio, atendimento, retomada, conteúdo e a sua base de clientes, e o que a Maia faz em cada parte.',
    destaque: 'a mais', hero: '/maia/img/quiz/otica/hero-vendedora-balcao.jpg', ad_img: '/maia/img/quiz/otica/provando-oculos.jpg',
    fala: 'Oi, eu sou a Maia. Em 1 minuto eu te mostro quanto a sua ótica pode ganhar a mais.',
    perguntas: [
      { id: 'tipo', titulo: 'Como é a sua ótica?', opcoes: [
        { v: 'rua', t: 'Loja de rua', img: '/maia/img/quiz/otica/cliente-na-parede.jpg' },
        { v: 'shopping', t: 'Loja de shopping', img: '/maia/img/quiz/otica/vitrine-armacoes.jpg' },
        { v: 'varias', t: 'Mais de uma loja', img: '/maia/img/quiz/otica/parede-armacoes.jpg' },
      ] },
      { id: 'volume', titulo: 'Quantos óculos completos vocês vendem por mês?', ajuda: 'Armação com lente de grau, mais ou menos.', opcoes: [
        { v: 'ate20', t: 'Até 20', n: 14 },
        { v: '21a50', t: '21 a 50', n: 32 },
        { v: '51a100', t: '51 a 100', n: 68 },
        { v: '101a200', t: '101 a 200', n: 130 },
        { v: 'mais200', t: 'Mais de 200', n: 210 },
      ] },
      { id: 'ticket', titulo: 'Quanto fica, em média, um óculos completo?', ajuda: 'Armação mais lente.', opcoes: [
        { v: 'ate400', t: 'Até R$ 400', n: 320 },
        { v: '400a800', t: 'R$ 400 a R$ 800', n: 550 },
        { v: '800a1500', t: 'R$ 800 a R$ 1.500', n: 1000 },
        { v: '1500a3000', t: 'R$ 1.500 a R$ 3.000', n: 1900 },
        { v: 'mais3000', t: 'Mais de R$ 3.000', n: 3200 },
      ] },
      { id: 'origem', titulo: 'De onde vem a maioria dos seus clientes novos?', opcoes: [
        { v: 'indicacao', t: 'Indicação de outro cliente' },
        { v: 'google', t: 'Google (Maps ou busca)' },
        { v: 'instagram', t: 'Instagram, sem anúncio pago' },
        { v: 'anuncio', t: 'Anúncio pago no Facebook ou Instagram' },
        { v: 'passam', t: 'Passam na frente da loja' },
      ] },
      { id: 'resposta', titulo: 'Quando chega mensagem no WhatsApp, quem responde e em quanto tempo?', opcoes: RESPOSTA('Alguém da loja', 'um atendimento') },
      { id: 'retomada', titulo: 'E quem pediu orçamento de lente e não voltou?', opcoes: [
        { v: 'nada', t: 'Fica por isso mesmo' },
        { v: 'asvezes', t: 'Chamo de novo às vezes, quando lembro' },
        { v: 'rotina', t: 'Tenho rotina: chamo de novo em dias certos' },
      ] },
      { id: 'base', titulo: 'O que você faz com quem já comprou?', opcoes: [
        { v: 'nada', t: 'Nada, espero o cliente voltar' },
        { v: 'asvezes', t: 'Mando mensagem às vezes (volta às aulas, promoção)' },
        { v: 'rotina', t: 'Aviso quando os óculos fazem 1 ano' },
      ] },
      { id: 'anuncio', titulo: 'Você anuncia no Facebook ou no Instagram hoje?', opcoes: ANUNCIO },
    ],
  },
}

export function ehNicho(v: any): v is Nicho { return v === 'oficina' || v === 'otica' }

// ---------------- as premissas (todas baixas de propósito) ----------------
export const PREMISSAS = {
  pedidos_por_unidade: 0.5,     // pedidos de orçamento no WhatsApp por mês = metade do volume do mês
  fecha: 1 / 3,                 // de cada 3 pedidos respondidos a tempo, 1 vira serviço/venda
  desiste: { rapido: 0, eu1h: 0.1, horas: 0.2, fimdia: 0.25 } as Record<string, number>,
  fora_do_horario: 0.1,         // quem responde rápido: 1 em 10 pedidos chega à noite ou no fim de semana...
  desiste_fora: 0.5,            // ...e metade desses procura outro antes de você abrir
  sem_resposta: 1 / 3,          // 1 em cada 3 orçamentos fica sem resposta do cliente
  retomada: { nada: 0.1, asvezes: 0.05, rotina: 0 } as Record<string, number>,   // fecham com a retomada
  base_mes: { nada: 1 / 300, asvezes: 1 / 600, rotina: 0 } as Record<string, number>, // clientes do último ano que voltam por mês com o recado
  base_valor: 0.5,              // quem volta pelo recado conta metade do valor médio (revisão, lente nova, óculos de sol)
  base_reduz: { retifica: 0.5, funilaria: 0.5 } as Record<string, number>,  // serviço que não se repete tanto: metade
  // o lado do ganho (tráfego pago com a Maia)
  verba_sugerida: 900,          // R$ 30 por dia, sugestão pra quem não anuncia
  custo_conversa: 10,           // R$ por conversa no WhatsApp: faixa de R$ 8 a R$ 15 na tela, usamos R$ 10
  fecha_anuncio: { otica: 1 / 7, oficina: 1 / 6 } as Record<string, number>,  // conversas atendidas na hora e com retomada que fecham. Oficina 1 em 6: quem chama com o carro com problema precisa resolver logo
  valor_anuncio: 0.8,           // 1ª venda de quem vem do anúncio: 80% do valor médio (às vezes começa por uma lente mais simples ou um diagnóstico)
  direto_na_loja: 0.25,         // pra cada 4 vendas medidas pelo WhatsApp, 1 de quem viu o anúncio e foi direto na loja
  melhora_otimizando: 0.3,      // quem já anuncia: +30% de vendas com a mesma verba (cortar o que não vende, replicar o que vende)
  teto_ganho: 2,                // trava de sanidade: o ganho do anúncio (medido + direto) nunca passa de 2x o faturamento de hoje
}

// ---------------- o diagnóstico ----------------
export type Ponto = {
  id: 'resposta' | 'retomada' | 'base'
  titulo: string
  onde_perde: string
  maia_faz: string
  premissa: string | null
  unidades_mes: number          // carros / óculos por mês (0 quando o ponto não entra na conta)
  valor_mes: number             // R$ por mês (arredondado pra baixo, de 10 em 10)
  quantidade: string | null     // "cerca de 1,4 carro por mês" / "cerca de 8 óculos por ano"
}
export type Ganho = {
  modo: 'novo' | 'otimizar'     // novo = não anuncia hoje (verba sugerida) · otimizar = já anuncia
  titulo: string
  contexto: string
  verba: number                 // R$ por mês
  verba_sugerida: boolean
  custo_conversa: number
  conversas: number             // por mês
  unidades_mes: number          // carros / óculos a mais por mês, MEDIDOS (passaram pelo WhatsApp)
  valor_mes: number             // R$ por mês medido pelo anúncio
  direto_unidades: number       // quem viu o anúncio e foi direto na loja (sem métrica)
  direto_mes: number
  total_mes: number             // medido + direto (é o que soma no total)
  total_ano: number
  retorno: number               // R$ em serviço/venda MEDIDO a cada R$ 1 de anúncio (com a Maia)
  limitado: boolean             // bateu na trava de 2x o faturamento
  cenario: { verba: number; unidades_mes: number; valor_mes: number; premissa: string } | null  // quem anuncia pouco: subir pra verba sugerida
  vendas_maia_mes: number       // vendas medidas no mês com a Maia (as de hoje + as a mais), pro exemplo de relatório
  valor_maia_mes: number
  direto_premissa: string
  premissa: string
  quantidade: string | null
}
export type Diagnostico = {
  nicho: Nicho
  negocio: string
  volume: number
  ticket: number
  faturamento: number           // volume x ticket (estimado pelas faixas)
  pontos: Ponto[]               // o que fica na mesa hoje
  ganho: Ganho                  // o que dá pra ganhar a mais com anúncio
  bem: string[]                 // o que o dono já faz bem
  na_mesa_mes: number
  na_mesa_ano: number
  oportunidade_mes: number      // na mesa + ganho
  oportunidade_ano: number
  unidades_mes: number          // carros / óculos que a oportunidade representa por mês
  pagam_maia: number            // quantos serviços/óculos por mês pagam a mensalidade
  principal: { titulo: string; valor_mes: number }
  respostas_legiveis: Record<string, string>
  completo: boolean
}

const reais = (n: number) => 'R$ ' + Math.round(n).toLocaleString('pt-BR')
const dec = (n: number) => (Math.round(n * 10) / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
const baixo10 = (n: number) => Math.max(0, Math.floor(n / 10) * 10)
const umEm = (x: number) => `1 em cada ${Math.round(1 / x)}`

function quantos(u: number, q: Quiz): string | null {
  if (u <= 0) return null
  if (u < 1) {
    const ano = Math.max(1, Math.floor(u * 12))
    return `cerca de ${ano} ${ano === 1 ? q.unidade[0] : q.unidade[1]} por ano`
  }
  return `cerca de ${dec(u)} ${Math.round(u * 10) / 10 < 2 ? q.unidade[0] : q.unidade[1]} por mês`
}

export function respostasLegiveis(nicho: Nicho, r: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of QUIZZES[nicho].perguntas) {
    const o = p.opcoes.find(x => x.v === r?.[p.id])
    out[p.titulo] = o ? o.t : '-'
  }
  return out
}

// r = { tipo, volume, ticket, origem, resposta, retomada, base, anuncio } (os "v" das opções)
export function diagnosticar(nicho: Nicho, r: Record<string, any>, negocioNome = ''): Diagnostico {
  const q = QUIZZES[nicho]
  const P = PREMISSAS
  const op = (id: string) => q.perguntas.find(p => p.id === id)?.opcoes.find(o => o.v === r?.[id])
  const completo = q.perguntas.every(p => !!op(p.id))
  // faltou resposta: usa a menor faixa (nunca aumenta a conta)
  const volume = op('volume')?.n ?? q.perguntas.find(p => p.id === 'volume')!.opcoes[0].n!
  const ticket = op('ticket')?.n ?? q.perguntas.find(p => p.id === 'ticket')!.opcoes[0].n!
  const resp = String(r?.resposta || 'eu1h'), ret = String(r?.retomada || 'rotina'), base = String(r?.base || 'rotina')
  const anuncio = String(r?.anuncio || 'nao'), origem = String(r?.origem || ''), tipo = String(r?.tipo || '')
  const negocio = String(negocioNome || '').trim()
  const sua = `a sua ${q.nome}`, daSua = `da sua ${q.nome}`
  const uN = q.unidade[1]
  const ofi = nicho === 'oficina'
  const pedidos = volume * P.pedidos_por_unidade
  const pedidosTxt = `metade dos seus ${volume} ${uN} do mês chega por um pedido de orçamento no WhatsApp (${dec(pedidos)} pedidos)`

  const pontos: Ponto[] = []
  const bem: string[] = []

  // 1) resposta no WhatsApp
  {
    const rapido = resp === 'rapido'
    const desiste = rapido ? P.fora_do_horario * P.desiste_fora : (P.desiste[resp] ?? P.desiste.eu1h)
    const u = pedidos * desiste * P.fecha
    const quando = resp === 'eu1h' ? 'leva até 1 hora' : resp === 'horas' ? 'leva algumas horas' : 'só sai no fim do dia'
    if (rapido) bem.push('Você responde o WhatsApp rápido no horário da loja. Isso já segura muito cliente.')
    pontos.push({
      id: 'resposta',
      titulo: rapido ? 'Mensagem que chega fora do horário' : 'Mensagem que demora a ser respondida',
      onde_perde: rapido
        ? `À noite, no domingo e no feriado ninguém responde. Quem pede orçamento nessa hora costuma mandar a mesma mensagem pra mais ${ofi ? 'duas oficinas' : 'duas óticas'}, e fica com quem responder primeiro.`
        : `Quem pede orçamento no WhatsApp costuma mandar a mesma mensagem pra mais ${ofi ? 'duas oficinas' : 'duas óticas'}. Quando a resposta ${quando}, uma parte já fechou com outro.`,
      maia_faz: ofi
        ? `A Maia responde no WhatsApp com o nome ${daSua}, em até 1 minuto, 24 horas por dia, inclusive à noite e no domingo. Ela pergunta o modelo do carro e o que está acontecendo, explica como funciona o orçamento e passa pra você só o que precisa da sua mão.`
        : `A Maia responde no WhatsApp com o nome ${daSua}, em até 1 minuto, 24 horas por dia, inclusive à noite e no domingo. Ela pergunta o que a pessoa procura (armação, lente, óculos de sol), mostra como funciona e passa pra você só o que precisa da sua mão.`,
      premissa: rapido
        ? `Considerando que ${pedidosTxt}, que ${umEm(P.fora_do_horario)} desses chega fora do horário, que metade desses procura outro antes de você abrir e que ${umEm(P.fecha)} fecharia com você.`
        : `Considerando que ${pedidosTxt}, que ${umEm(desiste)} desiste quando a resposta ${quando} e que ${umEm(P.fecha)} desses fecharia com você.`,
      unidades_mes: u, valor_mes: baixo10(u * ticket), quantidade: quantos(u, q),
    })
  }

  // 2) orçamento sem retomada
  {
    const taxa = P.retomada[ret] ?? 0
    if (taxa <= 0) bem.push(ofi ? 'Você já chama de novo quem recebeu orçamento e não respondeu. Pouca oficina faz isso.' : 'Você já chama de novo quem pediu orçamento de lente e não voltou. Pouca ótica faz isso.')
    else {
      const parados = pedidos * P.sem_resposta
      const u = parados * taxa
      pontos.push({
        id: 'retomada',
        titulo: ofi ? 'Orçamento que fica parado' : 'Orçamento de lente que não volta',
        onde_perde: ret === 'nada'
          ? 'O cliente pediu preço, recebeu e sumiu. Muitas vezes ele só se distraiu ou ficou esperando o salário, e ninguém volta a chamar.'
          : 'Chamar de novo "quando lembra" depende do seu dia. Em semana cheia, o orçamento esfria e o cliente resolve em outro lugar.',
        maia_faz: 'A Maia chama de novo quem pediu orçamento e sumiu: no dia seguinte, com 3 dias e com 6 dias, com uma mensagem curta e educada. Se a pessoa não quiser, ela se despede e para.',
        premissa: `Considerando os mesmos ${dec(pedidos)} pedidos, que ${umEm(P.sem_resposta)} orçamentos fica sem resposta do cliente e que ${umEm(taxa)} desses fecharia se fosse chamado de novo${ret === 'asvezes' ? ' (metade do normal, porque você já chama às vezes)' : ''}.`,
        unidades_mes: u, valor_mes: baixo10(u * ticket), quantidade: quantos(u, q),
      })
    }
  }

  // 3) base de clientes parada
  {
    const reduz = ofi ? (P.base_reduz[tipo] ?? 1) : 1
    const taxa = (P.base_mes[base] ?? 0) * reduz
    if (taxa <= 0) bem.push(ofi ? 'Você já avisa o cliente na época da revisão. A sua base trabalha por você.' : 'Você já avisa o cliente quando os óculos fazem 1 ano. A sua base trabalha por você.')
    else {
      const clientesAno = volume * 12
      const u = clientesAno * taxa
      const valor = ticket * P.base_valor
      pontos.push({
        id: 'base',
        titulo: 'Cliente antigo que não é chamado de volta',
        onde_perde: ofi
          ? `Quem já trouxe o carro uma vez confia em você. Sem um lembrete na época da ${tipo === 'funilaria' ? 'manutenção ou antes de uma viagem' : 'revisão ou da troca de óleo'}, ele faz o próximo serviço onde estiver mais perto.`
          : 'Quem já comprou na sua ótica confia em você. Sem um lembrete quando os óculos fazem 1 ano ou na volta às aulas, a próxima compra vai pra loja que aparecer primeiro.',
        maia_faz: ofi
          ? 'A Maia manda recado pra sua base de clientes nas épocas certas: lembrete de revisão e troca de óleo, antes das férias e das viagens de fim de ano. Mensagem curta, com o nome da oficina.'
          : 'A Maia manda recado pra sua base de clientes nas épocas certas: quando os óculos fazem 1 ano, na volta às aulas, no Dia das Mães e dos Pais e no fim de ano. Mensagem curta, com o nome da ótica.',
        premissa: `Considerando os ${clientesAno} ${uN} dos últimos 12 meses (${volume} por mês), que ${umEm(taxa)} volta por mês por causa de um recado${base === 'asvezes' ? ' (metade do normal, porque você já manda às vezes)' : ''}${reduz < 1 ? ` (metade, porque ${tipo === 'retifica' ? 'retífica' : 'funilaria'} não se repete tanto)` : ''} e contando só metade do valor médio (${reais(valor)}), porque a volta costuma ser um ${ofi ? 'serviço menor' : 'pedido menor, como lente nova ou óculos de sol'}.`,
        unidades_mes: u, valor_mes: baixo10(u * valor), quantidade: quantos(u, q),
      })
    }
  }

  // 4) o lado do GANHO: tráfego pago com a Maia medindo de ponta a ponta
  const naoAnuncia = anuncio === 'nao' || anuncio === 'parei'
  const verbaAtual = ANUNCIO.find(o => o.v === anuncio)?.n || 0
  const verba = naoAnuncia || !verbaAtual ? P.verba_sugerida : verbaAtual
  const vAnuncio = ticket * P.valor_anuncio
  const fechaA = P.fecha_anuncio[nicho]
  const pctValor = Math.round(P.valor_anuncio * 100)
  const vendasDe = (v: number) => (v / P.custo_conversa) * fechaA
  const conversas = verba / P.custo_conversa
  const vendasBase = vendasDe(verba)
  const faturamento = volume * ticket
  const teto = (faturamento * P.teto_ganho) / vAnuncio        // em unidades, somando medido + direto
  // medido pelo anúncio (passa pelo WhatsApp)
  let uMed = naoAnuncia ? vendasBase : vendasBase * P.melhora_otimizando
  let uDir = uMed * P.direto_na_loja
  const limitado = uMed + uDir > teto
  if (limitado) { const k = teto / (uMed + uDir); uMed *= k; uDir *= k }
  const medidoMes = baixo10(uMed * vAnuncio)
  const diretoMes = baixo10(uDir * vAnuncio)
  const vendasComMaia = naoAnuncia ? uMed : vendasBase + uMed
  const retorno = verba > 0 ? (vendasComMaia * vAnuncio) / verba : 0
  const coisa = ofi ? 'serviço' : 'venda'
  const loja = ofi ? 'oficina' : 'loja'
  const dependeDe = origem === 'indicacao' ? 'da indicação' : origem === 'passam' ? `de quem passa na frente ${daSua}` : origem === 'google' ? 'do Google' : origem === 'instagram' ? 'das postagens no Instagram' : ''
  const premValor = `contando ${pctValor}% do seu valor médio (${reais(vAnuncio)}), porque o primeiro ${ofi ? 'serviço de quem chega pelo anúncio às vezes é menor, como um diagnóstico ou uma revisão' : 'pedido de quem chega pelo anúncio às vezes é menor, como uma lente mais simples'}`
  // quem anuncia pouco (até R$ 500): o cenário de subir pra verba sugerida, com a Maia
  let cenario: Ganho['cenario'] = null
  if (!naoAnuncia && verba < P.verba_sugerida) {
    const u = vendasDe(P.verba_sugerida) * (1 + P.melhora_otimizando) - vendasBase
    const uc = Math.min(u * (1 + P.direto_na_loja), teto)
    cenario = {
      verba: P.verba_sugerida, unidades_mes: uc, valor_mes: baixo10(uc * vAnuncio),
      premissa: `Se você subir a verba de ${reais(verba)} pra ${reais(P.verba_sugerida)} por mês (R$ 30 por dia; os ${reais(P.verba_sugerida - verba)} a mais são seus, pagos direto à Meta), com as mesmas premissas, os ${Math.round(P.melhora_otimizando * 100)}% a mais da Maia e quem vai direto na ${loja}.`,
    }
  }
  const ganho: Ganho = {
    modo: naoAnuncia ? 'novo' : 'otimizar',
    titulo: naoAnuncia ? `Cliente novo que chega pelo anúncio` : 'A mesma verba rendendo mais',
    contexto: naoAnuncia
      ? `${dependeDe ? `Hoje o cliente novo depende ${dependeDe}. ` : ''}Quando isso desacelera, o movimento cai junto. Anúncio bem feito, com resposta na hora, traz gente da sua cidade que ainda não conhece ${sua}.${anuncio === 'parei' ? ' Anúncio que foi parado costuma ter parado por falta de tempo pra acompanhar ou de resposta rápida pra quem chamou: as duas coisas a Maia faz.' : ''}`
      : `Você já investe ${reais(verbaAtual)} por mês, mais ou menos. O que define o resultado é saber qual anúncio vende e qual só traz curioso, e responder quem chama na hora. Sem isso, parte da verba vai embora sem ninguém perceber.`,
    verba, verba_sugerida: naoAnuncia, custo_conversa: P.custo_conversa, conversas: Math.floor(conversas),
    unidades_mes: uMed, valor_mes: medidoMes,
    direto_unidades: uDir, direto_mes: diretoMes,
    total_mes: medidoMes + diretoMes, total_ano: (medidoMes + diretoMes) * 12,
    retorno: Math.floor(retorno * 10) / 10, limitado, cenario,
    vendas_maia_mes: vendasComMaia, valor_maia_mes: baixo10(vendasComMaia * vAnuncio),
    premissa: (naoAnuncia
      ? `Considerando uma verba inicial sugerida de ${reais(verba)} por mês (R$ 30 por dia, paga por você direto à Meta), um custo por conversa no WhatsApp entre R$ 8 e R$ 15 (usamos ${reais(P.custo_conversa)}), o que dá ${Math.floor(conversas)} conversas por mês, e que ${umEm(fechaA)} conversas atendidas na hora e com retomada vira ${coisa}${ofi ? ' (quem chama com o carro com problema precisa resolver logo)' : ''}, ${premValor}.`
      : `Considerando a sua verba de cerca de ${reais(verba)} por mês, um custo por conversa no WhatsApp entre R$ 8 e R$ 15 (usamos ${reais(P.custo_conversa)}), o que dá ${Math.floor(conversas)} conversas, que ${umEm(fechaA)} vira ${coisa} (${dec(vendasBase)} por mês hoje), ${premValor}, e que, com a Maia medindo cada venda, cortando o que não vende e replicando o que vende, a mesma verba rende ${Math.round(P.melhora_otimizando * 100)}% a mais.`)
      + (limitado ? ` Limitamos o ganho do anúncio a 2 vezes o seu faturamento de hoje (${reais(faturamento)}).` : ''),
    direto_premissa: `Considerando que, pra cada 4 ${ofi ? 'serviços' : 'vendas'} que chegam pelo WhatsApp, pelo menos 1 vem de quem viu o anúncio e foi direto na ${loja}, sem mandar mensagem. Essas não dá pra ligar a um anúncio específico; a Maia mostra no relatório o movimento da ${loja} junto, pra você ver o efeito.`,
    quantidade: quantos(uMed, q),
  }

  const na_mesa_mes = pontos.reduce((s, p) => s + p.valor_mes, 0)
  const unidades_mesa = pontos.reduce((s, p) => s + p.unidades_mes, 0)
  const oportunidade_mes = na_mesa_mes + ganho.total_mes
  const comNumero = pontos.filter(p => p.valor_mes > 0).sort((a, b) => b.valor_mes - a.valor_mes)
  const maior = comNumero[0]
  const principal = !maior || ganho.total_mes > maior.valor_mes
    ? { titulo: ganho.titulo, valor_mes: ganho.total_mes }
    : { titulo: maior.titulo, valor_mes: maior.valor_mes }
  return {
    nicho, negocio, volume, ticket, faturamento, pontos, ganho, bem,
    na_mesa_mes, na_mesa_ano: na_mesa_mes * 12,
    oportunidade_mes, oportunidade_ano: oportunidade_mes * 12,
    unidades_mes: unidades_mesa + ganho.unidades_mes + ganho.direto_unidades,
    pagam_maia: Math.max(1, Math.ceil(OFERTA_QUIZ.mensal / ticket)),
    principal,
    respostas_legiveis: respostasLegiveis(nicho, r),
    completo,
  }
}

// ---------------- contato ----------------
const DDDS = new Set([11,12,13,14,15,16,17,18,19,21,22,24,27,28,31,32,33,34,35,37,38,41,42,43,44,45,46,47,48,49,51,53,54,55,61,62,63,64,65,66,67,68,69,71,73,74,75,77,79,81,82,83,84,85,86,87,88,89,91,92,93,94,95,96,97,98,99])
export const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

// Telefone do Brasil com DDD: celular (11 dígitos, começa com 9) ou fixo (10 dígitos, começa com 2 a 5).
// Devolve 55 + DDD + número, ou null.
export function telefoneBR(v: any): string | null {
  let d = String(v || '').replace(/\D/g, '')
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  if (d.length === 11 && d[0] === '0') d = d.slice(1)
  if (d.length !== 10 && d.length !== 11) return null
  if (!DDDS.has(Number(d.slice(0, 2)))) return null
  const n = d.slice(2)
  if (d.length === 11 && n[0] !== '9') return null
  if (d.length === 10 && !/[2-5]/.test(n[0])) return null
  if (/^(\d)\1+$/.test(n)) return null
  return '55' + d
}

export const reaisQuiz = reais

// Mensagem pronta do WhatsApp (vai pro /wa, que acrescenta o código da turma e o #ref)
export function mensagemWhats(d: Diagnostico, contato: { cidade?: string; uf?: string }, botao: 'comecar' | 'duvida'): string {
  const q = QUIZZES[d.nicho]
  const onde = [contato.cidade, contato.uf].filter(Boolean).join('/')
  const p = d.principal
  const ponto = p.valor_mes > 0 ? `${p.titulo.toLowerCase()} (cerca de ${reais(p.valor_mes)} por mês)` : p.titulo.toLowerCase()
  const sem = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const quem = !d.negocio ? `a minha ${q.nome}` : sem(d.negocio).includes(sem(q.nome)) ? d.negocio : `a ${q.nome} ${d.negocio}`
  const base = `Oi! Fiz o diagnóstico da Maia pra ${quem}${onde ? `, de ${onde}` : ''}. O ponto principal deu: ${ponto}.`.replace(/\s+/g, ' ')
  return botao === 'comecar' ? `${base} Quero começar.` : `${base} Tenho uma dúvida antes de começar.`
}
