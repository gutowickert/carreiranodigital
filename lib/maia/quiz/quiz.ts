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
export type Destino = { tipo: 'wa' } | { tipo: 'link'; url: string }
export const DESTINO_COMECAR: Destino = { tipo: 'wa' }
export const DESTINO_DUVIDA: Destino = { tipo: 'wa' }
// turma-recipiente dos leads do quiz no CRM da escola (uma só pros dois nichos; o nicho vai na qualificação)
export const TURMA_QUIZ = 'maiaquiz'
export const PIXEL_ESCOLA = '3968641693466078'

// ---------------- as perguntas ----------------
export type Nicho = 'oficina' | 'otica'
export type Opcao = { v: string; t: string; n?: number }   // n = número que entra na conta (quando a opção é faixa)
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
  { v: 'ate500', t: 'Sim, até R$ 500 por mês' },
  { v: '500a1500', t: 'Sim, de R$ 500 a R$ 1.500 por mês' },
  { v: 'mais1500', t: 'Sim, mais de R$ 1.500 por mês' },
]

export const QUIZZES: Record<Nicho, Quiz> = {
  oficina: {
    nicho: 'oficina', nome: 'oficina', artigo: 'a', unidade: ['carro', 'carros'], servico: 'serviço',
    eyebrow: 'Diagnóstico para oficinas',
    titulo: 'Quanto a sua oficina deixa de faturar por mês com mensagem sem resposta e orçamento parado?',
    sub: 'Responda 8 perguntas de tocar. No fim você vê, com os seus números, onde o cliente escapa e o que dá pra fazer em cada ponto.',
    perguntas: [
      { id: 'tipo', titulo: 'Qual é o forte da sua oficina?', opcoes: [
        { v: 'mecanica', t: 'Mecânica geral' },
        { v: 'cambio', t: 'Câmbio automático' },
        { v: 'retifica', t: 'Retífica de motor' },
        { v: 'injecao', t: 'Injeção e elétrica' },
        { v: 'funilaria', t: 'Funilaria e pintura' },
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
    titulo: 'Quantos óculos a sua ótica deixa de vender por mês sem perceber?',
    sub: 'Responda 8 perguntas de tocar. No fim você vê, com os seus números, onde o cliente escapa e o que dá pra fazer em cada ponto.',
    perguntas: [
      { id: 'tipo', titulo: 'Como é a sua ótica?', opcoes: [
        { v: 'rua', t: 'Loja de rua' },
        { v: 'shopping', t: 'Loja de shopping' },
        { v: 'varias', t: 'Mais de uma loja' },
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
}

// ---------------- o diagnóstico ----------------
export type Ponto = {
  id: 'resposta' | 'retomada' | 'base' | 'anuncio'
  titulo: string
  onde_perde: string
  maia_faz: string
  premissa: string | null
  unidades_mes: number          // carros / óculos por mês (0 quando o ponto não entra na conta)
  valor_mes: number             // R$ por mês (arredondado pra baixo, de 10 em 10)
  quantidade: string | null     // "cerca de 1,4 carro por mês" / "cerca de 8 óculos por ano"
}
export type Diagnostico = {
  nicho: Nicho
  negocio: string
  volume: number
  ticket: number
  pontos: Ponto[]
  bem: string[]                 // o que o dono já faz bem
  total_mes: number
  total_ano: number
  principal: Ponto
  respostas_legiveis: Record<string, string>
  completo: boolean
}

const reais = (n: number) => 'R$ ' + Math.round(n).toLocaleString('pt-BR')
const dec = (n: number) => (Math.round(n * 10) / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
const baixo10 = (n: number) => Math.max(0, Math.floor(n / 10) * 10)
const umEm = (x: number) => `1 em cada ${Math.round(1 / x)}`

function quantos(u: number, q: Quiz): string | null {
  if (u <= 0) return null
  if (u < 1) {
    const ano = Math.max(1, Math.floor(u * 12))
    return `cerca de ${ano} ${ano === 1 ? q.unidade[0] : q.unidade[1]} por ano`
  }
  return `cerca de ${dec(u)} ${u < 2 ? q.unidade[0] : q.unidade[1]} por mês`
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

  // 4) anúncio (não entra na conta: depende da verba e da cidade)
  {
    const naoAnuncia = anuncio === 'nao' || anuncio === 'parei'
    const dependeDe = origem === 'indicacao' ? 'da indicação' : origem === 'passam' ? `de quem passa na frente ${daSua}` : origem === 'google' ? 'do Google' : origem === 'instagram' ? 'das postagens no Instagram' : ''
    pontos.push({
      id: 'anuncio',
      titulo: naoAnuncia ? `Quem ainda não conhece ${sua} não fica sabendo dela` : 'Anúncio que traz contato, mas depende de quem responde',
      onde_perde: naoAnuncia
        ? `${dependeDe ? `Hoje o cliente novo depende ${dependeDe}. ` : ''}Quando isso desacelera, o movimento cai junto, e não tem como ligar de volta. ${anuncio === 'parei' ? 'Anúncio que foi parado costuma ter parado por falta de tempo pra acompanhar ou de resposta rápida pra quem chamou.' : ''}`.trim()
        : 'Cada contato do anúncio custa dinheiro. Se a mensagem espera horas pra ser respondida, ou se ninguém olha o que está vendendo e o que não está, parte da verba vai embora.',
      maia_faz: 'A Maia cria e roda os anúncios no Facebook e no Instagram mostrando o seu trabalho pra quem está perto, responde quem chama em até 1 minuto e manda o relatório pro seu WhatsApp: quanto gastou, quantos chamaram, quantos fecharam. A verba do anúncio é sua, paga direto à Meta.',
      premissa: null, unidades_mes: 0, valor_mes: 0, quantidade: null,
    })
  }

  const total_mes = pontos.reduce((s, p) => s + p.valor_mes, 0)
  const comNumero = pontos.filter(p => p.valor_mes > 0).sort((a, b) => b.valor_mes - a.valor_mes)
  return {
    nicho, negocio, volume, ticket, pontos, bem, total_mes, total_ano: total_mes * 12,
    principal: comNumero[0] || pontos[0],
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
