// Seu 2027: as CONTAS do mapa. Tudo aqui é código, nunca IA (a IA só escreve o texto a partir destes números).
//
// REGRAS (uma regra só de reduzir em todo o mapa):
// - reduzir(n): soma os dígitos até ficar entre 1 e 9. Se em algum passo der 11 ou 22, para ali (números mestres).
// - Ano pessoal 2027: soma de TODOS os dígitos do dia, do mês e de 2027 (2+0+2+7 = 11), depois reduzir().
//     ex.: 05/11 -> 0+5 + 1+1 + 2+0+2+7 = 18 -> 1+8 = 9
// - Número do destino (caminho de vida): soma de todos os dígitos da data completa, depois reduzir().
//     ex.: 05/11/1985 -> 0+5+1+1+1+9+8+5 = 30 -> 3
// - Arcano do ano (tarô, ordem de Marselha): dia + mês + soma dos dígitos de 2027 (11). Se passar de 22, soma os dígitos
//   até ficar entre 1 e 22. 22 = O Louco.   ex.: 5 + 11 + 11 = 27 -> 2+7 = 9 (O Eremita)
// - Mês pessoal: ano pessoal (mestre conta como a soma dele: 11 -> 2, 22 -> 4) + número do mês, depois reduzir().
//     ex.: ano 9, fevereiro (2) -> 11 (mestre, fica 11); outubro (10) -> 19 -> 10 -> 1
// - Meses mais favoráveis: os meses cujo mês pessoal combina com cada área (tabela AFINIDADE abaixo).
// - Dias do mês que vibram com a pessoa: os dias cujo número reduzido é igual ao ano pessoal (1 a 9).

export const ANO = 2027
const somaDigitos = (n: number) => String(Math.abs(n)).split('').reduce((s, d) => s + +d, 0)

export function reduzir(n: number): number {
  let x = n
  while (x > 9 && x !== 11 && x !== 22) x = somaDigitos(x)
  return x
}
// a "raiz" de um número mestre (11 -> 2, 22 -> 4), pra somar com outra coisa
export const raiz = (n: number) => (n === 11 ? 2 : n === 22 ? 4 : n)

export const ARCANOS: Record<number, { nome: string; romano: string; palavras: string }> = {
  1: { nome: 'O Mago', romano: 'I', palavras: 'iniciativa, talento, começar com o que já se tem' },
  2: { nome: 'A Sacerdotisa', romano: 'II', palavras: 'intuição, silêncio, sabedoria interior' },
  3: { nome: 'A Imperatriz', romano: 'III', palavras: 'criatividade, fartura, expressão, cuidado' },
  4: { nome: 'O Imperador', romano: 'IV', palavras: 'estrutura, firmeza, construir bases' },
  5: { nome: 'O Hierofante', romano: 'V', palavras: 'aprendizado, valores, mestres e tradição' },
  6: { nome: 'Os Enamorados', romano: 'VI', palavras: 'escolhas do coração, vínculos, harmonia' },
  7: { nome: 'O Carro', romano: 'VII', palavras: 'direção, avanço, foco na conquista' },
  8: { nome: 'A Justiça', romano: 'VIII', palavras: 'equilíbrio, clareza, colher o que se planta' },
  9: { nome: 'O Eremita', romano: 'IX', palavras: 'reflexão, sabedoria, encerrar ciclos com calma' },
  10: { nome: 'A Roda da Fortuna', romano: 'X', palavras: 'movimento, mudanças de cenário, oportunidades' },
  11: { nome: 'A Força', romano: 'XI', palavras: 'coragem serena, autocontrole, gentileza firme' },
  12: { nome: 'O Enforcado', romano: 'XII', palavras: 'pausa, novo ponto de vista, paciência' },
  13: { nome: 'A Transformação', romano: 'XIII', palavras: 'renovação, deixar ir o que já cumpriu o papel, recomeço' },
  14: { nome: 'A Temperança', romano: 'XIV', palavras: 'medida, paciência, cura emocional, harmonia' },
  15: { nome: 'O Desejo', romano: 'XV', palavras: 'vontade, magnetismo, olhar para os próprios apegos' },
  16: { nome: 'A Torre', romano: 'XVI', palavras: 'libertação, verdade, abrir espaço para o novo' },
  17: { nome: 'A Estrela', romano: 'XVII', palavras: 'esperança, inspiração, fé no caminho' },
  18: { nome: 'A Lua', romano: 'XVIII', palavras: 'sensibilidade, sonhos, intuição' },
  19: { nome: 'O Sol', romano: 'XIX', palavras: 'alegria, clareza, vitalidade, sucesso' },
  20: { nome: 'O Julgamento', romano: 'XX', palavras: 'despertar, chamado, renascimento' },
  21: { nome: 'O Mundo', romano: 'XXI', palavras: 'realização, completude, expansão' },
  22: { nome: 'O Louco', romano: '0', palavras: 'liberdade, aventura, confiar no novo' },
}

// o que cada número significa (base pra IA escrever; ela não inventa o sentido dos números)
export const NUMEROS: Record<number, { tema: string; palavras: string }> = {
  1: { tema: 'Começos', palavras: 'iniciar, plantar sementes, independência, coragem de dar o primeiro passo' },
  2: { tema: 'Parcerias', palavras: 'paciência, cooperação, relações, sensibilidade, esperar a semente brotar' },
  3: { tema: 'Expressão', palavras: 'criatividade, comunicação, alegria, vida social, se mostrar' },
  4: { tema: 'Construção', palavras: 'trabalho, organização, disciplina, base sólida, rotina' },
  5: { tema: 'Mudança', palavras: 'liberdade, movimento, viagens, novidades, flexibilidade' },
  6: { tema: 'Cuidado', palavras: 'família, casa, amor, responsabilidade, harmonia' },
  7: { tema: 'Interiorização', palavras: 'autoconhecimento, estudo, espiritualidade, silêncio, confiança interior' },
  8: { tema: 'Conquista', palavras: 'realização, prosperidade, liderança, reconhecimento, colher resultados' },
  9: { tema: 'Encerramento', palavras: 'concluir ciclos, gratidão, generosidade, desapego, preparar o novo' },
  11: { tema: 'Inspiração', palavras: 'intuição elevada, propósito, inspirar outras pessoas, sensibilidade' },
  22: { tema: 'Grande construção', palavras: 'projetos grandes, visão prática, legado, construir pra muitos' },
}

// que mês pessoal favorece cada área (em ordem de força)
const AFINIDADE: Record<string, number[]> = {
  amor: [6, 2, 11, 3],
  trabalho: [8, 1, 4, 22],
  dinheiro: [8, 4, 22, 1],
  emocional: [7, 9, 11, 2],
  familia: [6, 4, 2],
  comecos: [1, 5, 3],
}
export const AREAS: Record<string, string> = { amor: 'Amor', trabalho: 'Trabalho', dinheiro: 'Dinheiro', emocional: 'Saúde emocional', familia: 'Família' }
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export type Numeros = ReturnType<typeof calcular>

// nascimento em 'AAAA-MM-DD'
export function calcular(nascimento: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(nascimento)
  if (!m) throw new Error('data inválida')
  const ano = +m[1], mes = +m[2], dia = +m[3]
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  if (d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia || ano < 1900 || ano > 2026) throw new Error('data inválida')

  const dd = String(dia).padStart(2, '0'), mm = String(mes).padStart(2, '0')
  // ano pessoal
  const somaAP = somaDigitos(+dd) + somaDigitos(+mm) + somaDigitos(ANO)
  const anoPessoal = reduzir(somaAP)
  // destino
  const somaDestino = somaDigitos(dia) + somaDigitos(mes) + somaDigitos(ano)
  const destino = reduzir(somaDestino)
  // arcano
  const somaArcano = dia + mes + somaDigitos(ANO)
  let arcano = somaArcano
  while (arcano > 22) arcano = somaDigitos(arcano)
  // meses
  const meses = MESES.map((nome, i) => {
    const bruto = raiz(anoPessoal) + (i + 1)
    return { mes: i + 1, nome, numero: reduzir(bruto), conta: `${raiz(anoPessoal)} + ${i + 1} = ${bruto}${reduzir(bruto) !== bruto ? ' → ' + reduzir(bruto) : ''}` }
  })
  const favoraveis: Record<string, number[]> = {}
  for (const [area, nums] of Object.entries(AFINIDADE)) {
    const lista: number[] = []
    for (const n of nums) for (const mm2 of meses) if (mm2.numero === n && !lista.includes(mm2.mes)) lista.push(mm2.mes)
    favoraveis[area] = lista.slice(0, 3).sort((a, b) => a - b)
  }
  const umDigito = (x: number) => { while (x > 9) x = somaDigitos(x); return x }
  const alvo = raiz(anoPessoal)
  const dias = Array.from({ length: 31 }, (_, i) => i + 1).filter(x => umDigito(x) === alvo)

  return {
    nascimento, dia, mes, ano,
    anoPessoal, anoPessoalTema: NUMEROS[anoPessoal],
    contaAnoPessoal: `${dd.split('').join(' + ')} + ${mm.split('').join(' + ')} + 2 + 0 + 2 + 7 = ${somaAP}${somaAP !== anoPessoal ? ' → ' + anoPessoal : ''}`,
    destino, destinoTema: NUMEROS[destino],
    contaDestino: `${dd.split('').join(' + ')} + ${mm.split('').join(' + ')} + ${String(ano).split('').join(' + ')} = ${somaDestino}${somaDestino !== destino ? ' → ' + destino : ''}`,
    arcano, arcanoNome: ARCANOS[arcano].nome, arcanoRomano: ARCANOS[arcano].romano, arcanoPalavras: ARCANOS[arcano].palavras,
    contaArcano: `${dia} + ${mes} + 11 (2+0+2+7) = ${somaArcano}${somaArcano !== arcano ? ' → ' + arcano : ''}`,
    meses, favoraveis, dias,
  }
}

// a frase grátis da página de venda (sem IA): "Em 2027 você vive o ano 9: Encerramento"
export function previa(nascimento: string) {
  const n = calcular(nascimento)
  return { anoPessoal: n.anoPessoal, tema: n.anoPessoalTema.tema, palavras: n.anoPessoalTema.palavras, arcano: n.arcano, arcanoNome: n.arcanoNome, arcanoRomano: n.arcanoRomano }
}
