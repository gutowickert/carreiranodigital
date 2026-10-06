// Perguntas do Check-up de IA (página pública /checkup). Usado pela tela (mostrar) e pelo servidor
// (converter a resposta em número pra conta). O navegador manda só o id da opção; o valor sai daqui.
// Opção = [id, texto na tela, valor numérico usado na conta (lib/checkup/conta.ts)].

export type Opcao = [string, string, number?]
export type Pergunta = {
  id: string
  texto: string
  ajuda?: string
  tipo: 'nicho' | 'texto' | 'escolha' | 'numero' | 'escala' | 'multipla'
  opcoes?: Opcao[]
  se?: (r: Record<string, any>) => boolean
  placeholder?: string
  opcional?: boolean
}

// a lista que a pessoa vê (o catálogo completo fica em nichos.json, só no servidor)
export const NICHOS: [string, string][] = [
  ['salao-de-beleza', 'Salão de beleza, cabeleireiro, manicure'],
  ['barbearia', 'Barbearia'],
  ['clinica-estetica', 'Clínica de estética, harmonização'],
  ['clinica-odontologica', 'Dentista, clínica odontológica'],
  ['consultorio-medico', 'Consultório ou clínica médica'],
  ['nutricionista', 'Nutricionista, emagrecimento'],
  ['psicologo-terapeuta', 'Psicólogo, terapeuta'],
  ['fisioterapia-pilates', 'Fisioterapia, pilates'],
  ['academia-estudio', 'Academia, crossfit, estúdio de treino'],
  ['pet-veterinaria', 'Pet shop, banho e tosa, veterinária'],
  ['otica', 'Ótica'],
  ['farmacia', 'Farmácia'],
  ['restaurante-delivery', 'Restaurante, lancheria, delivery'],
  ['confeitaria-padaria', 'Confeitaria, doceria, padaria'],
  ['mercado-de-bairro', 'Mercado, hortifrúti, açougue'],
  ['loja-de-roupas', 'Loja de roupas, calçados, moda'],
  ['celular-assistencia', 'Celular, eletrônicos, assistência técnica'],
  ['material-de-construcao', 'Material de construção, ferragem'],
  ['moveis-planejados', 'Móveis planejados, decoração'],
  ['reformas-construcao', 'Reformas, construção, arquitetura'],
  ['energia-solar', 'Energia solar'],
  ['oficina-mecanica', 'Oficina mecânica, autocenter, funilaria'],
  ['estetica-automotiva', 'Lava-car, estética automotiva'],
  ['imobiliaria-corretor', 'Imobiliária, corretor de imóveis'],
  ['corretora-de-seguros', 'Corretora de seguros'],
  ['escritorio-contabil', 'Contabilidade'],
  ['advocacia', 'Advocacia'],
  ['escola-cursos', 'Escola, cursos, reforço escolar'],
  ['eventos-buffet', 'Buffet, festas, fotografia de eventos'],
  ['brindes-personalizados', 'Brindes, gráfica rápida, personalizados'],
  ['outro', 'Outro tipo de negócio'],
]

const temAgenda = (r: Record<string, any>) => r.agenda === 'sim'

export const PERGUNTAS: Pergunta[] = [
  { id: 'nicho', texto: 'Qual é o teu tipo de negócio?', tipo: 'nicho' },
  { id: 'o_que_vende', texto: 'O que tu vende, numa frase?', ajuda: 'Ex.: óculos de grau e lentes, com montagem na loja.', tipo: 'texto', placeholder: 'Escreve do teu jeito' },
  { id: 'cidade', texto: 'Em que cidade tu atende?', tipo: 'texto', placeholder: 'Cidade' },
  { id: 'equipe', texto: 'Quantas pessoas trabalham contigo, contando tu?', tipo: 'escolha', opcoes: [['1', 'Só eu', 1], ['2-3', '2 ou 3', 2.5], ['4-7', '4 a 7', 5.5], ['8-15', '8 a 15', 11], ['16+', 'Mais de 15', 20]] },
  { id: 'contatos_semana', texto: 'Quantas pessoas novas te procuram por semana?', ajuda: 'Somando WhatsApp, Instagram, telefone e balcão.', tipo: 'escolha', opcoes: [['ate10', 'Até 10', 6], ['10-30', '10 a 30', 20], ['30-80', '30 a 80', 50], ['80-200', '80 a 200', 130], ['200+', 'Mais de 200', 280]] },
  { id: 'ticket', texto: 'Quanto vale, em média, uma venda ou atendimento teu?', ajuda: 'Um valor aproximado, em reais.', tipo: 'numero', placeholder: 'R$' },
  { id: 'fechamento', texto: 'De cada 10 pessoas que te procuram, quantas acabam comprando?', tipo: 'escala' },
  { id: 'tempo_resposta', texto: 'Quando alguém manda mensagem, em quanto tempo costuma ter resposta?', tipo: 'escolha', opcoes: [['minutos', 'Em poucos minutos', 0.2], ['1h', 'Em até 1 hora', 0.6], ['horas', 'Algumas horas', 1], ['dia', 'No mesmo dia, quando dá', 1.2], ['seguinte', 'Às vezes só no outro dia', 1.4]] },
  { id: 'fora_horario', texto: 'Mensagem que chega à noite ou no fim de semana é respondida?', tipo: 'escolha', opcoes: [['sim', 'Sim, sempre', 0.2], ['as_vezes', 'Às vezes', 0.7], ['nao', 'Não, só no outro dia útil', 1]] },
  { id: 'agenda', texto: 'Tu trabalha com horário marcado?', ajuda: 'Consulta, sessão, serviço, visita.', tipo: 'escolha', opcoes: [['sim', 'Sim', 1], ['nao', 'Não', 0]] },
  { id: 'atendimentos_semana', texto: 'Quantos horários marcados por semana, mais ou menos?', tipo: 'escolha', se: temAgenda, opcoes: [['ate10', 'Até 10', 6], ['10-30', '10 a 30', 20], ['30-60', '30 a 60', 45], ['60-120', '60 a 120', 90], ['120+', 'Mais de 120', 150]] },
  { id: 'faltas', texto: 'De cada 10 horários marcados, quantos faltam ou desmarcam em cima da hora?', tipo: 'escala', se: temAgenda },
  { id: 'recompra', texto: 'Teus clientes costumam voltar a comprar?', tipo: 'escolha', opcoes: [['semana', 'Toda semana', 52], ['mes', 'Todo mês', 12], ['trimestre', 'A cada 2 ou 3 meses', 5], ['ano', 'Uma ou duas vezes por ano', 1.5], ['raro', 'Quase nunca, é compra única', 0.2]] },
  { id: 'clientes_ativos', texto: 'Quantos clientes compraram contigo nos últimos 12 meses?', tipo: 'escolha', opcoes: [['ate50', 'Até 50', 30], ['50-200', '50 a 200', 120], ['200-500', '200 a 500', 350], ['500-1500', '500 a 1.500', 900], ['1500+', 'Mais de 1.500', 2000], ['nao_sei', 'Não sei dizer']] },
  { id: 'tempo_gasto', texto: 'O que mais toma o teu tempo e o da equipe?', ajuda: 'Marca quantos quiser.', tipo: 'multipla', opcoes: [['whatsapp', 'Responder WhatsApp e direct'], ['agenda', 'Marcar, confirmar e remarcar horário'], ['orcamento', 'Fazer e acompanhar orçamento'], ['cobranca', 'Cobrar e controlar pagamento'], ['posvenda', 'Pós-venda e manter contato com cliente'], ['planilha', 'Planilha, cadastro e papelada'], ['conteudo', 'Postar e criar conteúdo'], ['estoque', 'Estoque e pedidos a fornecedor'], ['equipe', 'Organizar a equipe e as tarefas'], ['financeiro', 'Financeiro e fechamento do mês']] },
  { id: 'horas_whatsapp', texto: 'Somando todo mundo, quantas horas por dia vão só pro WhatsApp?', tipo: 'escolha', opcoes: [['<1', 'Menos de 1 hora', 0.5], ['1-2', '1 a 2 horas', 1.5], ['2-4', '2 a 4 horas', 3], ['4-8', '4 a 8 horas', 6], ['8+', 'Mais de 8 horas', 10]] },
  { id: 'onde_guarda', texto: 'Onde ficam os dados dos teus clientes hoje?', tipo: 'escolha', opcoes: [['cabeca', 'Na cabeça e no WhatsApp', 0], ['caderno', 'Caderno ou agenda de papel', 1], ['planilha', 'Planilha', 2], ['sistema', 'Num sistema', 3]] },
  { id: 'followup', texto: 'Quem pede orçamento e some, recebe contato de novo?', tipo: 'escolha', opcoes: [['sempre', 'Sim, sempre', 0.2], ['as_vezes', 'Às vezes', 0.6], ['nunca', 'Quase nunca', 1]] },
  { id: 'avaliacao_google', texto: 'Tu pede avaliação no Google depois do atendimento?', tipo: 'escolha', opcoes: [['sempre', 'Sempre', 0.2], ['as_vezes', 'Às vezes', 0.6], ['nunca', 'Nunca', 1]] },
  { id: 'tiraria', texto: 'Se tu pudesse tirar UMA tarefa da tua semana, qual seria?', tipo: 'texto', placeholder: 'Escreve do teu jeito' },
  { id: 'desafio', texto: 'Qual é o teu maior desafio no negócio hoje?', tipo: 'texto', placeholder: 'Escreve do teu jeito' },
]

// respostas cruas da tela (ids e textos) -> valores da conta + versão legível pra IA e pro comercial
export function converte(cru: Record<string, any>) {
  const num: Record<string, any> = {}
  const legivel: Record<string, string> = {}
  const txt = (v: any, max = 300) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
  for (const p of PERGUNTAS) {
    if (p.se && !p.se(cru)) continue
    const v = cru[p.id]
    if (p.tipo === 'nicho') continue
    if (p.tipo === 'texto') { num[p.id] = txt(v); legivel[p.texto] = num[p.id]; continue }
    if (p.tipo === 'numero') {
      const n = Number(String(v ?? '').replace(/[^\d,]/g, '').replace(',', '.'))
      num[p.id] = n > 0 && n < 10_000_000 ? n : null
      legivel[p.texto] = num[p.id] ? 'R$ ' + Math.round(num[p.id]).toLocaleString('pt-BR') : 'não informou'
      continue
    }
    if (p.tipo === 'escala') {
      const n = Number(v)
      num[p.id] = Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : null
      legivel[p.texto] = num[p.id] == null ? 'não informou' : `${num[p.id]} de 10`
      continue
    }
    if (p.tipo === 'multipla') {
      const ids = (Array.isArray(v) ? v : []).filter((x: any) => p.opcoes!.some(o => o[0] === x))
      num[p.id] = ids
      legivel[p.texto] = ids.map((x: string) => p.opcoes!.find(o => o[0] === x)![1]).join('; ') || 'nada marcado'
      continue
    }
    const o = p.opcoes!.find(o => o[0] === v)
    num[p.id] = o && o[2] != null ? o[2] : null
    legivel[p.texto] = o ? o[1] : 'não informou'
  }
  return { num, legivel }
}
