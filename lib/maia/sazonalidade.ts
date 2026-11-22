// Maia: o CALENDÁRIO DE DATAS (22/11, pedido do Guto: "a Maia precisa levar em consideração a sazonalidade de cada período
// antes de propor estratégias"). Puro: sem banco e sem IA (testado direto no node: scripts/maia-teste-estrategia.mjs).
//
// - Datas do Brasil e do RS (Natal, Black Friday, Mães, Pais, Namorados, Crianças, volta às aulas, Carnaval, Páscoa, 13º,
//   férias, IR...) MAIS as datas de cada ramo (lotérica, advocacia, oficina, estética, saúde, alimentação, varejo, educação).
// - Cada data tem a ANTECEDÊNCIA certa: o dia em que o anúncio (ou o recado) tem que começar. Ex.: Natal, 3 a 4 semanas antes;
//   Mega da Virada, bolões desde meados de novembro.
// - Datas próprias do negócio: contexto.calendario.datas (a implantação põe; o dono adiciona pelo WhatsApp ou pelo painel).
// - Cuidados por ramo (OAB, conselhos de saúde, lotérica): entram em toda proposta. Data que não combina com o ramo nem
//   aparece (advocacia não tem Black Friday; lotérica não tem Dia das Mães).
// Quem usa: estrategia.ts (o ciclo de 15 dias, SEMPRE antes de propor) e relatorios.ts (a análise de 2 dias, quando sugere mudar).

export type Grupo = 'loterica' | 'advocacia' | 'oficina' | 'estetica' | 'saude' | 'alimentacao' | 'varejo' | 'educacao' | 'geral'

export type DataSazonal = {
  id: string
  nome: string
  grupos: Grupo[]
  dia: (ano: number) => string                 // o dia principal (AAAA-MM-DD)
  ate?: (ano: number) => string                // datas que são uma temporada (férias, IR): até quando vale
  antecedencia: number | Partial<Record<Grupo | 'padrao', number>>   // dias antes do dia principal em que o anúncio começa
  janela_inicio?: (ano: number) => string      // quando a temporada já tem um começo fixo (IR: o dia que a Receita abre)
  porque: string                               // por que pesa
  dica: string | Partial<Record<Grupo | 'padrao', string>>   // o que fazer (por ramo)
  confirmar?: string                           // a data muda todo ano: onde conferir
}

// ─────────────── contas de data (tudo em AAAA-MM-DD, sem fuso)
const p2 = (n: number) => String(n).padStart(2, '0')
export const iso = (a: number, m: number, d: number) => { const t = new Date(Date.UTC(a, m - 1, d)); return `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}` }
export const somaDias = (d: string, n: number) => { const [a, m, dd] = d.split('-').map(Number); return iso(a, m, dd + n) }
export const diasEntre = (de: string, ate: string) => Math.round((Date.parse(ate + 'T00:00:00Z') - Date.parse(de + 'T00:00:00Z')) / 86400e3)
export const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
// a Páscoa (algoritmo de Meeus/Jones/Butcher): Carnaval, Sexta-feira Santa e a Dupla de Páscoa saem dela
export function pascoa(ano: number) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1
  return iso(ano, mes, dia)
}
// o n-ésimo dia da semana do mês (0 = domingo): Dia das Mães = 2º domingo de maio
export function enesimo(ano: number, mes: number, semana: number, n: number) {
  const primeiro = new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay()
  return iso(ano, mes, 1 + ((semana - primeiro + 7) % 7) + (n - 1) * 7)
}
const fixo = (m: number, d: number) => (ano: number) => iso(ano, m, d)
// Black Friday: a sexta depois da 4ª quinta de novembro
const blackFriday = (ano: number) => somaDias(enesimo(ano, 11, 4, 4), 1)


export const DATAS: DataSazonal[] = [
  // ── começo do ano
  { id: 'comeco_ano', nome: 'Começo de ano (metas e planejamento)', grupos: ['saude', 'estetica', 'educacao', 'advocacia'], dia: fixo(1, 8), antecedencia: 14,
    porque: 'em janeiro a pessoa decide cuidar de si, estudar e organizar a vida',
    dica: { padrao: 'campanha "comece o ano" com o serviço de entrada', advocacia: 'conteúdo informativo sobre revisão de contratos e o reajuste do salário mínimo (pensão e benefícios do INSS mudam em janeiro)', educacao: 'matrícula pro começo do ano' } },
  { id: 'ferias_verao', nome: 'Férias de verão (litoral)', grupos: ['oficina', 'estetica', 'alimentacao'], dia: fixo(12, 26), ate: (a) => iso(a + 1, 2, 28), antecedencia: 21,
    porque: 'dezembro a fevereiro o gaúcho desce pro litoral: carro na estrada e corpo de verão',
    dica: { padrao: 'oferta de verão', oficina: 'revisão antes de viajar (freio, pneu, óleo, ar-condicionado)', estetica: 'pacote de verão (depilação, pele, corpo)', alimentacao: 'encomendas pras férias e pra praia' } },
  { id: 'trabalhista_janeiro', nome: 'Demissões de janeiro e fim de contrato temporário', grupos: ['advocacia'], dia: fixo(1, 20), ate: fixo(2, 28), antecedencia: 14,
    porque: 'depois das festas tem demissões e os contratos temporários de fim de ano terminam em janeiro e fevereiro',
    dica: 'conteúdo informativo: "fui demitido, o que conferir na rescisão" (sem prometer resultado)' },
  { id: 'volta_aulas', nome: 'Volta às aulas', grupos: ['varejo', 'educacao', 'alimentacao', 'geral'], dia: fixo(2, 23), antecedencia: 30,
    porque: 'material, uniforme, mochila e lanche: a família compra nas 3 a 4 semanas antes',
    dica: { padrao: 'kit de volta às aulas', educacao: 'matrícula e turma nova', alimentacao: 'lanche da escola e encomendas pra semana' },
    confirmar: 'a data muda por rede de ensino (estadual do RS costuma ser no fim de fevereiro)' },
  { id: 'carnaval', nome: 'Carnaval', grupos: ['estetica', 'oficina', 'varejo'], dia: (a) => somaDias(pascoa(a), -47), antecedencia: 21,
    porque: 'feriadão: viagem e festa',
    dica: { padrao: 'oferta de feriadão', oficina: 'revisão antes da viagem do feriadão', estetica: 'cabelo, unha e pele pra festa' } },
  // ── março a maio
  { id: 'dia_mulher', nome: 'Dia da Mulher', grupos: ['estetica', 'varejo', 'alimentacao'], dia: fixo(3, 8), antecedencia: 14,
    porque: 'presente e homenagem de empresa pras funcionárias', dica: 'presente e homenagem (empresas compram em quantidade)' },
  { id: 'dia_consumidor', nome: 'Dia do Consumidor', grupos: ['varejo', 'alimentacao', 'estetica', 'oficina', 'geral'], dia: fixo(3, 15), antecedencia: 10,
    porque: 'a "Black Friday de março": o cliente espera condição especial', dica: 'condição especial de um dia (ou semana) no produto que entra primeiro' },
  { id: 'imposto_renda', nome: 'Declaração do Imposto de Renda', grupos: ['advocacia'], dia: fixo(5, 29), janela_inicio: fixo(3, 16), antecedencia: 0,
    porque: 'de meados de março ao fim de maio todo mundo precisa declarar', dica: 'conteúdo informativo sobre a declaração e o que muda no ano (sem preço nem promoção)',
    confirmar: 'a Receita anuncia as datas todo ano (normalmente de meados de março ao fim de maio)' },
  { id: 'pascoa', nome: 'Páscoa', grupos: ['alimentacao', 'varejo', 'geral'], dia: (a) => pascoa(a), antecedencia: { alimentacao: 35, padrao: 21 },
    porque: 'chocolate, presente e almoço de família', dica: { padrao: 'presente de Páscoa', alimentacao: 'encomenda de ovo e de Páscoa (abre 4 a 5 semanas antes; avisa o último dia pra encomendar)' } },
  { id: 'dupla_pascoa', nome: 'Dupla Sena de Páscoa', grupos: ['loterica'], dia: (a) => somaDias(pascoa(a), -1), antecedencia: 21,
    porque: 'concurso especial com prêmio grande: o pessoal procura bolão', dica: 'bolão da Dupla de Páscoa (recado pra base e anúncio chamando pro balcão)',
    confirmar: 'conferir no site da Caixa a data do sorteio e o prêmio estimado' },
  { id: 'dia_maes', nome: 'Dia das Mães', grupos: ['varejo', 'alimentacao', 'estetica', 'geral'], dia: (a) => enesimo(a, 5, 0, 2), antecedencia: 21,
    porque: 'a 2ª maior data do comércio: o filho compra nas 3 semanas antes', dica: 'presente pra mãe (gancho de prontidão: "presente pro Dia das Mães em <cidade>")' },
  // ── junho a agosto
  { id: 'dia_namorados', nome: 'Dia dos Namorados', grupos: ['varejo', 'alimentacao', 'estetica', 'geral'], dia: fixo(6, 12), antecedencia: 18,
    porque: 'presente e jantar a dois', dica: 'presente pro namorado ou namorada' },
  { id: 'festa_junina', nome: 'Festa junina (São João)', grupos: ['alimentacao'], dia: fixo(6, 24), antecedencia: 21,
    porque: 'festa de escola, de empresa e de família', dica: 'encomendas pra festa junina (doces e salgados típicos)' },
  { id: 'quina_sao_joao', nome: 'Quina de São João', grupos: ['loterica'], dia: fixo(6, 24), antecedencia: 30,
    porque: 'concurso especial que não acumula: muita procura por bolão', dica: 'bolão da Quina de São João',
    confirmar: 'conferir no site da Caixa a data do sorteio e o prêmio estimado' },
  { id: 'inverno', nome: 'Inverno e chuva no RS', grupos: ['oficina', 'varejo'], dia: fixo(6, 21), ate: fixo(8, 31), antecedencia: 25,
    porque: 'frio, chuva e neblina: bateria arreia, pneu careca vira risco, palheta e desembaçador fazem falta',
    dica: { padrao: 'coleção de inverno', oficina: 'check-up de inverno (bateria, pneu, palheta, luzes, desembaçador)' } },
  { id: 'ferias_julho', nome: 'Férias de julho', grupos: ['oficina', 'educacao', 'alimentacao'], dia: fixo(7, 13), ate: fixo(7, 31), antecedencia: 21,
    porque: 'criança em casa e viagem pra serra', dica: { padrao: 'oferta de férias', oficina: 'revisão antes de subir a serra', educacao: 'curso de férias e matrícula do 2º semestre' } },
  { id: 'dia_avos', nome: 'Dia dos Avós', grupos: ['varejo', 'alimentacao'], dia: fixo(7, 26), antecedencia: 14, porque: 'presente e visita', dica: 'presente pros avós' },
  { id: 'dia_pais', nome: 'Dia dos Pais', grupos: ['varejo', 'alimentacao', 'estetica', 'oficina', 'geral'], dia: (a) => enesimo(a, 8, 0, 2), antecedencia: 21,
    porque: 'presente pro pai: compra nas 3 semanas antes', dica: { padrao: 'presente pro pai', oficina: 'vale-revisão ou lavagem de presente pro pai', estetica: 'barba e cabelo, vale-presente' } },
  { id: 'lotofacil_independencia', nome: 'Lotofácil da Independência', grupos: ['loterica'], dia: fixo(9, 9), antecedencia: 35,
    porque: 'o maior concurso da Lotofácil, que não acumula: as apostas abrem semanas antes', dica: 'bolão da Lotofácil da Independência',
    confirmar: 'conferir no site da Caixa a data do sorteio (perto do 7 de setembro) e o prêmio estimado' },
  // ── setembro a dezembro
  { id: 'dia_cliente', nome: 'Dia do Cliente', grupos: ['varejo', 'alimentacao', 'estetica', 'oficina', 'geral'], dia: fixo(9, 15), antecedencia: 10,
    porque: 'boa desculpa pra chamar a base de volta', dica: 'mimo ou condição pros clientes de sempre (recado pra base)' },
  { id: 'farroupilha', nome: 'Semana Farroupilha (RS)', grupos: ['alimentacao', 'varejo'], dia: fixo(9, 20), antecedencia: 14,
    porque: 'acampamento, churrasco e pilcha no RS', dica: 'tradição gaúcha: encomendas e produtos pra semana' },
  { id: 'setembro_amarelo', nome: 'Setembro Amarelo', grupos: ['saude'], dia: fixo(9, 10), antecedencia: 10,
    porque: 'mês de prevenção ao suicídio: o tema está em todo lugar', dica: 'SÓ conteúdo informativo e de acolhimento (onde pedir ajuda: CVV 188); nunca usar pra vender' },
  { id: 'verao_chegando', nome: 'Preparação pro verão', grupos: ['estetica', 'saude'], dia: fixo(10, 15), antecedencia: 21,
    porque: 'de setembro a dezembro a pessoa começa a se preparar pro verão', dica: { padrao: 'pacote de preparação pro verão', saude: 'consulta de nutrição e acompanhamento (sem promessa de resultado)' } },
  { id: 'dia_criancas', nome: 'Dia das Crianças', grupos: ['varejo', 'alimentacao', 'geral'], dia: fixo(10, 12), antecedencia: 21,
    porque: 'presente de criança: compra nas 3 semanas antes', dica: 'presente pras crianças' },
  { id: 'outubro_rosa', nome: 'Outubro Rosa', grupos: ['saude'], dia: fixo(10, 1), ate: fixo(10, 31), antecedencia: 7,
    porque: 'mês da prevenção do câncer de mama', dica: 'SÓ conteúdo informativo (prevenção, exame); nunca usar a doença pra vender' },
  { id: 'novembro_azul', nome: 'Novembro Azul', grupos: ['saude'], dia: fixo(11, 1), ate: fixo(11, 30), antecedencia: 7,
    porque: 'mês da saúde do homem', dica: 'SÓ conteúdo informativo (prevenção, cuidado); nunca usar a doença pra vender' },
  { id: 'black_friday', nome: 'Black Friday', grupos: ['varejo', 'alimentacao', 'estetica', 'oficina', 'educacao', 'geral'], dia: blackFriday, antecedencia: 14,
    porque: 'o cliente segura a compra esperando a oferta: sem oferta, ele compra do concorrente', dica: { padrao: 'uma oferta de verdade no produto que entra primeiro (com prazo pra acabar)', oficina: 'pneu, bateria ou revisão com condição de Black Friday' } },
  { id: 'decimo_terceiro', nome: '13º salário (1ª parcela)', grupos: ['varejo', 'oficina', 'estetica', 'educacao', 'geral'], dia: fixo(11, 30), antecedencia: 10,
    porque: 'até 30/11 cai a 1ª parcela: dinheiro extra no bolso', dica: { padrao: 'chamada "usa o 13º em ..."', oficina: 'a revisão ou o pneu que estava esperando', educacao: 'investir o 13º num curso' } },
  { id: 'formaturas', nome: 'Formaturas e casamentos de fim de ano', grupos: ['estetica', 'saude'], dia: fixo(12, 12), antecedencia: 30,
    porque: 'dezembro é mês de formatura, casamento e festa de empresa', dica: { padrao: 'pacote de festa (cabelo, maquiagem, pele)', saude: 'clareamento e cuidado do sorriso antes das festas (sem antes e depois)' } },
  { id: 'decimo_terceiro_2', nome: '13º salário (2ª parcela)', grupos: ['varejo', 'oficina', 'estetica', 'geral'], dia: fixo(12, 20), antecedencia: 10,
    porque: 'até 20/12 cai a 2ª parcela, junto com as compras de Natal', dica: 'chamada "usa o 13º em ..."' },
  { id: 'natal', nome: 'Natal', grupos: ['varejo', 'alimentacao', 'estetica', 'geral'], dia: fixo(12, 25), antecedencia: 28,
    porque: 'a maior data do comércio: o anúncio começa 3 a 4 semanas antes, quando a pessoa começa a lista de presentes',
    dica: { padrao: 'presente de Natal (gancho de prontidão: "presente de Natal em <cidade>")', alimentacao: 'encomendas de Natal e de fim de ano, com o último dia pra encomendar', estetica: 'vale-presente de Natal' } },
  { id: 'mega_virada', nome: 'Mega da Virada', grupos: ['loterica'], dia: fixo(12, 31), antecedencia: 45,
    porque: 'o maior prêmio do ano: os bolões começam em meados de novembro e esgotam perto do dia',
    dica: 'bolão da Mega da Virada: recado pra base e anúncio desde meados de novembro, chamando pro balcão (cotas limitadas, sem prometer prêmio)',
    confirmar: 'conferir no site da Caixa o início das apostas e o prêmio estimado' },
]

// ─────────────── o ramo do negócio (o nicho é texto livre do cadastro)
const sem = (s: any) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
export function gruposDoNicho(nicho: any): Grupo[] {
  const n = sem(nicho)
  if (!n.trim()) return ['geral']
  const g: Grupo[] = []
  if (/loteri/.test(n)) g.push('loterica')
  if (/advoga|advocacia|juridic|direito|escritorio de advoc/.test(n)) g.push('advocacia')
  // "estética automotiva" é carro, não beleza
  if (/oficina|mecanic|auto ?pe|autopec|pneu|funilar|estetica automotiva|lava.?(car|jato|rapido)|martelinho|auto ?center|retifica/.test(n)) g.push('oficina')
  else if (/estetica|beleza|salao|cabele|barbe|unha|manicure|depila|sobrancelha|cilio|spa|maquiag/.test(n)) g.push('estetica')
  if (/psic|odonto|dentist|nutri|fisio|medic|clinica|consultorio|saude|terapia|fono/.test(n) && !g.includes('estetica')) g.push('saude')
  if (/doce|cookie|confeit|padaria|restaurant|lanche|pizza|cafe|bolo|comida|aliment|hamburg|marmita|salgad|chocolate|acougue|mercado|sorvet/.test(n)) g.push('alimentacao')
  if (/escola|curso|educa|idioma|ingles|aula|treinamento|faculdade/.test(n)) g.push('educacao')
  if (/loja|presente|personaliz|moda|roupa|calcad|otica|gravac|laser|movel|moveis|decora|joia|semijoia|acessori|infantil|brinquedo|papelaria|floricult|cosmetic|perfum|varejo|boutique/.test(n)) g.push('varejo')
  return g.length ? g : ['geral']
}

// ─────────────── os cuidados de cada ramo (entram na proposta e valem pra todo anúncio da quinzena)
export const CUIDADOS: Partial<Record<Grupo, string[]>> = {
  loterica: [
    'nunca prometer prêmio nem chance de ganhar',
    'nunca vender nem cobrar pelo WhatsApp: o anúncio e o recado avisam e chamam pro balcão',
    'aposta é só pra maiores de 18 anos',
    'data e prêmio de concurso especial: conferir no site da Caixa antes de anunciar',
  ],
  advocacia: [
    'regras da OAB: sem promessa de resultado, sem "garantido", sem preço, promoção ou desconto',
    'conteúdo informativo ("conheça os teus direitos"), nunca captação mercantil',
    'data comercial (Black Friday, Dia do Consumidor, Natal com oferta) fica de fora',
  ],
  saude: [
    'regras do conselho da profissão: sem promessa de resultado, sem antes e depois, sem preço como chamariz',
    'campanhas de saúde (Setembro Amarelo, Outubro Rosa, Novembro Azul) só com conteúdo informativo, nunca pra vender',
  ],
  estetica: ['sem promessa de resultado garantido e sem antes e depois de procedimento'],
}
export function cuidadosDo(grupos: Grupo[]) { return grupos.flatMap(g => CUIDADOS[g] || []) }
// ramos em que a Maia não sugere recado de venda pra base (só conteúdo)
export const SEM_RECADO_DE_VENDA: Grupo[] = ['advocacia', 'saude']

// ─────────────── as datas próprias do negócio (contexto.calendario.datas)
export type DataPropria = { nome: string; dia: string; antecedencia_dias?: number | null; porque?: string | null; ate?: string | null }
// aceita "25/12", "12-25", "2026-12-25" (com ano: só aquele ano)
export function leDia(s: any): { mes: number; dia: number; ano: number | null } | null {
  const t = String(s || '').trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)
  if (m) return valida(Number(m[2]), Number(m[3]), Number(m[1]))
  m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(t)
  if (m) return valida(Number(m[2]), Number(m[1]), m[3] ? Number(m[3]) : null)
  m = /^(\d{1,2})-(\d{1,2})$/.exec(t)
  if (m) return valida(Number(m[1]), Number(m[2]), null)
  return null
}
function valida(mes: number, dia: number, ano: number | null) {
  if (!(mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31)) return null
  const d = new Date(Date.UTC(ano || 2024, mes - 1, dia))   // 2024 é bissexto: 29/02 passa
  return d.getUTCMonth() === mes - 1 ? { mes, dia, ano } : null
}
export function datasProprias(neg: any): DataPropria[] {
  const l = neg?.contexto?.calendario?.datas
  return Array.isArray(l) ? l.filter((x: any) => x && x.nome && leDia(x.dia)) : []
}
function daPropria(x: DataPropria, i: number): DataSazonal & { anoFixo: number | null } {
  const d = leDia(x.dia)!, ate = x.ate ? leDia(x.ate) : null
  const ant = Number(x.antecedencia_dias)
  return {
    id: 'propria_' + i, nome: String(x.nome).slice(0, 80), grupos: [], anoFixo: d.ano,
    dia: (a: number) => iso(d.ano || a, d.mes, d.dia), ...(ate ? { ate: (a: number) => { const y = ate.ano || a; const v = iso(y, ate.mes, ate.dia); return v < iso(d.ano || a, d.mes, d.dia) ? iso(y + 1, ate.mes, ate.dia) : v } } : {}),
    antecedencia: ant >= 0 && ant <= 120 ? Math.round(ant) : 21,
    porque: x.porque ? String(x.porque).slice(0, 200) : 'data forte do negócio (combinada com o dono)', dica: 'campanha da data',
  }
}

// ─────────────── o que pesa agora
export type DataDaVez = {
  id: string; nome: string; propria: boolean
  dia: string; ate: string; inicio: string            // o dia, até quando vale, e quando o anúncio começa
  antecedencia: number; porque: string; dica: string; confirmar: string | null
  atrasada: boolean                                    // o anúncio já devia ter começado
  faltam_dias: number                                  // até o dia principal (negativo: a temporada já começou)
}
const antecedenciaDe = (d: DataSazonal, grupos: Grupo[]) => typeof d.antecedencia === 'number' ? d.antecedencia : (grupos.map(g => (d.antecedencia as any)[g]).find(v => v != null) ?? (d.antecedencia as any).padrao ?? 21)
const dicaDe = (d: DataSazonal, grupos: Grupo[]) => typeof d.dica === 'string' ? d.dica : (grupos.map(g => (d.dica as any)[g]).find(Boolean) || (d.dica as any).padrao || '')

// A Maia SEMPRE chama isto antes de propor estratégia. `hoje` = AAAA-MM-DD no fuso do negócio.
//   pesam: a campanha da data cai dentro da próxima quinzena (o anúncio começa até hoje + 15 dias e a data ainda não passou)
//   radar: o anúncio começa entre 16 e 45 dias daqui (já vale preparar o material)
export function datasDaVez(neg: any, hoje: string, op: { quinzena?: number; radar?: number } = {}) {
  const q = op.quinzena ?? 15, r = op.radar ?? 45
  const grupos = gruposDoNicho(neg?.nicho)
  const ano = Number(hoje.slice(0, 4))
  const lista: (DataSazonal & { anoFixo?: number | null })[] = [...DATAS.filter(d => d.grupos.some(g => grupos.includes(g))), ...datasProprias(neg).map(daPropria)]
  const pesam: DataDaVez[] = [], radar: DataDaVez[] = []
  const vistos = new Set<string>()
  for (const a of [ano - 1, ano, ano + 1]) {
    for (const d of lista) {
      if (d.anoFixo && d.anoFixo !== a) continue
      const dia = d.dia(a), ate = d.ate ? d.ate(a) : dia
      if (ate < hoje) continue
      const ant = antecedenciaDe(d, grupos)
      const inicio = d.janela_inicio ? d.janela_inicio(a) : somaDias(dia, -ant)
      const chave = d.id
      if (vistos.has(chave)) continue
      const x: DataDaVez = { id: d.id, nome: d.nome, propria: d.id.startsWith('propria_'), dia, ate, inicio, antecedencia: d.janela_inicio ? Math.max(0, diasEntre(inicio, dia)) : ant,
        porque: d.porque, dica: dicaDe(d, grupos), confirmar: d.confirmar || null, atrasada: inicio < hoje && dia >= hoje && !d.janela_inicio && !d.ate, faltam_dias: diasEntre(hoje, dia) }
      if (inicio <= somaDias(hoje, q)) { pesam.push(x); vistos.add(chave) }
      else if (inicio <= somaDias(hoje, r)) { radar.push(x); vistos.add(chave) }
    }
  }
  const ord = (a: DataDaVez, b: DataDaVez) => a.inicio.localeCompare(b.inicio) || a.dia.localeCompare(b.dia)
  return { grupos, pesam: pesam.sort(ord), radar: radar.sort(ord), cuidados: cuidadosDo(grupos) }
}

// a frase que diz qual data pesou e por quê, com a antecedência ("Natal (25/12): ... o anúncio entra no ar em 27/11")
export function fraseDaData(x: DataDaVez, hoje: string) {
  const quando = x.ate !== x.dia && x.inicio <= hoje ? `até ${ddmm(x.ate)}` : `${ddmm(x.dia)}`
  const ant = x.antecedencia >= 7 ? `${Math.round(x.antecedencia / 7)} semana${Math.round(x.antecedencia / 7) === 1 ? '' : 's'} antes` : x.antecedencia > 0 ? `${x.antecedencia} dias antes` : 'desde o começo da temporada'
  const comeca = x.inicio < hoje ? (x.atrasada ? `o anúncio já devia ter começado em ${ddmm(x.inicio)} (${ant}): entra no ar já` : `a temporada já começou (${ddmm(x.inicio)}): vale agora`)
    : x.inicio === hoje ? `o anúncio começa hoje (${ant})` : `o anúncio começa ${ant}, em ${ddmm(x.inicio)}`
  return `${x.nome} (${quando}): ${x.porque}; ${comeca}${x.confirmar ? ` (${x.confirmar})` : ''}`
}
