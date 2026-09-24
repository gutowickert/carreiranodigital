// O QUESTIONÁRIO DE IMPLANTAÇÃO — as perguntas que a gente faz antes de montar o CRM de uma empresa.
//
// DE ONDE VEIO: a entrevista da Dani (public/implantacao/dani.html, 89 perguntas escritas à mão pro
// caso dela — ela respondeu 93 campos) mais o que a implantação dela ensinou depois. O que o
// questionário dela provou e ficou:
//
//   • O tipo `valida` é o que faz funcionar. Perguntar "como tu quer o teu funil" trava qualquer
//     dono de negócio; chegar com as etapas prontas e pedir Aprovado/Ajustar/Tirar, uma por uma,
//     muda tudo. A Dani aprovou 29 de 38 propostas sem mexer, e as 9 que ela mudou viraram
//     informação de verdade em vez de opinião solta.
//   • Cada pergunta diz POR QUE está sendo feita, e para ONDE a resposta vai (`entra`). Quem
//     configura depois filtra por destino em vez de ler tudo em ordem.
//   • O tipo `teste`: mostra a fala de um cliente e pergunta "o que tu responderia?". É o melhor
//     treino da IA, e acontece antes de ela existir.
//
// ⚠️ ISTO É O MOLDE, NÃO A RESPOSTA DE NINGUÉM. As perguntas valem pra qualquer negócio. O que é de
// UMA empresa são as PROPOSTAS (abaixo), que a gente monta antes de mandar o link — e é delas que
// vem a força do questionário: ele parece escrito pra aquela pessoa. Questionário genérico com "o
// seu produto" e "o seu cliente" não faz ninguém responder 93 campos.

export type Tipo = 'texto' | 'longo' | 'escolha' | 'multi' | 'valida' | 'teste'
export type Toque = { quando: string; acao: string; marca?: 'tpl' | 'tar' }
export type Pergunta = {
  id: string
  p: string                 // a pergunta
  tipo?: Tipo               // sem tipo = 'longo'
  porque?: string           // por que a gente pergunta — aparece pro cliente
  ph?: string               // exemplo dentro do campo
  o?: string[]              // opções (escolha/multi)
  prop?: string             // a proposta pronta (valida) — aceita <b>
  toques?: Toque[]          // a proposta como sequência (valida de cadência)
  req?: boolean
  entra?: string            // onde a resposta entra no sistema
}
export type Bloco = { id: string; titulo: string; intro: string; perguntas: Pergunta[] }

export const MODELO: Bloco[] = [
  { id: 'empresa', titulo: 'Você e a empresa', intro: 'Quem atende, de onde, e por qual número. Define quem entra no sistema e como o WhatsApp é ligado.', perguntas: [
    { id: 'empresa', p: 'Nome da empresa', tipo: 'texto', req: true, entra: 'marca' },
    { id: 'seu_nome', p: 'Seu nome e o que você faz nela', tipo: 'texto', req: true, ph: 'Ex.: Ana, sócia, cuido do comercial', entra: 'usuários' },
    // ⚠️ ERA "quem mais ATENDE cliente". Enquadrava todo mundo como comercial, e quem não atende
    // cliente respondia uma palavra só. Na GAJA voltou "Eliana — Administrativa" e foi tudo —
    // o que ela faz de verdade só apareceu quando a gente perguntou de novo, por fora. O bloco
    // "Quem faz o quê" logo abaixo existe por causa dessa resposta curta.
    { id: 'equipe', p: 'Quem mais trabalha na empresa, e o que cada um faz', porque: 'Uma pessoa por linha, com o e-mail. É isso que vira usuário do sistema — inclusive quem nunca fala com cliente.', ph: 'João — cota e emite — joao@…\nMaria — administrativo, emissão e cobrança — maria@…', entra: 'usuários' },
    { id: 'cidade_horario', p: 'Cidade, endereço e horário de atendimento', tipo: 'texto', porque: 'Pergunta de todo dia — a IA responde sozinha.', entra: 'contexto da IA' },
    { id: 'whatsapp', p: 'O WhatsApp que os clientes usam hoje é…', tipo: 'escolha', porque: 'O sistema usa a API oficial da Meta. O número que entra nela não pode continuar no WhatsApp Business do celular.', o: ['O mesmo número do celular pessoal', 'Um chip só da empresa', 'Um número em cada pessoa', 'Ainda não tem WhatsApp comercial'], entra: 'WhatsApp' },
    { id: 'email', p: 'E-mail da empresa (o que recebe os avisos)', tipo: 'texto', entra: 'marca' },
  ]},

  // QUEM FAZ O QUÊ — o bloco que nasceu de uma resposta curta.
  //
  // A tela de trabalho do sistema tem duas áreas: comercial (quem fala com cliente) e
  // administrativo (o que vem depois do sim). Quem monta a implantação precisa saber o que entra
  // em cada uma — e isso NÃO se descobre perguntando "o que cada um faz" junto com o e-mail:
  // vem "Fulano — Administrativa" e acabou. Aqui a pergunta é sobre o DIA da pessoa, não sobre o
  // cargo dela.
  //
  // ⚠️ O TRABALHO SEM CLIENTE COBRANDO É O QUE MAIS ATRASA. Emitir, cobrar documento, postar,
  // criar anúncio: ninguém do outro lado reclama, então fica pra "quando sobrar tempo". É
  // exatamente esse trabalho que o sistema precisa transformar em lembrete — e por isso ele
  // precisa ser dito aqui, antes de existir tela.
  { id: 'areas', titulo: 'Quem faz o quê', intro: 'O sistema separa o trabalho em duas áreas: falar com cliente, e tudo que vem depois do sim. Estas respostas decidem o que aparece na tela de cada pessoa.', perguntas: [
    { id: 'depois_venda_quem', p: 'Depois que o cliente diz sim, quem toca o resto?', tipo: 'escolha', porque: 'Se é outra pessoa, ela precisa de uma área própria na tela — senão o trabalho dela fica invisível e some.', o: ['A mesma pessoa que vendeu', 'Outra pessoa cuida disso', 'Depende do produto', 'Ninguém, fica solto'], entra: 'áreas' },
    { id: 'admin_dia', p: 'Se tem alguém na parte administrativa: o que essa pessoa faz num dia normal?', porque: 'Do jeito que acontece, não o cargo. É o que vira a tela de trabalho dela — sem isso a gente adivinha, e adivinhar aqui dá tela vazia.', ph: 'Ex.: de manhã confere o que entrou, emite as apólices do dia, corre atrás de documento que faltou, e no fim do dia vê quem não pagou', entra: 'áreas' },
    { id: 'admin_o_que', p: 'O que já acontece hoje, depois da venda?', tipo: 'multi', porque: 'Cada um destes vira um bloco na tela dela — e alguns o sistema já consegue cobrar sozinho.', o: ['Emitir o contrato / a apólice', 'Correr atrás de documento que faltou', 'Conferir documento que o cliente mandou', 'Cobrança e quem não pagou', 'Pós-venda e acompanhamento', 'Nada estruturado — cada um faz o que dá'], entra: 'áreas' },
    { id: 'marketing_quem', p: 'Quem cuida de anúncio e das redes?', tipo: 'escolha', porque: 'Se é alguém de dentro, o sistema lembra sozinho — é o trabalho que ninguém cobra e que por isso atrasa.', o: ['Eu mesmo', 'Alguém de dentro da empresa', 'Agência ou freelancer', 'Ninguém por enquanto'], entra: 'áreas · marketing' },
    { id: 'marketing_ritmo', p: 'Com que frequência deveria sair anúncio novo e post?', tipo: 'texto', porque: 'Vira lembrete automático, no ritmo de vocês. "Não sei" também serve — a gente começa com um ritmo e ajusta.', ph: 'Ex.: anúncio novo a cada 15 dias, post 2x por semana', entra: 'marketing' },
    { id: 'pedidos_internos', p: 'O que uma pessoa pede pra outra no dia a dia — e por onde esse pedido chega hoje?', porque: 'Quase sempre a resposta é "no WhatsApp", e quase sempre alguma coisa some na rolagem. Isso vira tarefa dentro do sistema.', ph: 'Ex.: "emite a do Cristiano", "liga pra esse cliente", "manda o boleto"', entra: 'áreas' },
  ]},

  { id: 'hoje', titulo: 'O que vocês já usam hoje', intro: 'Sistema, planilha, agenda — tudo que já guarda cliente. É o que decide o que precisa se integrar e o que precisa ser importado, antes de qualquer tela ser montada.', perguntas: [
    { id: 'sistemas', p: 'Que ferramentas vocês usam no dia a dia?', tipo: 'multi', o: ['Sistema do ramo (multicálculo, gestão, PDV…)', 'Planilha (Excel / Google Sheets)', 'Agenda (Google, Outlook)', 'Outro CRM', 'Sistema de fornecedor', 'Nada — é no WhatsApp e na cabeça', 'Outro'], entra: 'integração' },
    { id: 'sistemas_quais', p: 'Quais, exatamente? E o que cada um faz pra vocês', req: true, porque: 'Nome do sistema e pra que serve. É o que decide o que dá pra integrar e o que vai ser digitado duas vezes.', ph: 'Um por linha', entra: 'integração' },
    { id: 'base', p: 'Tem uma base de clientes pra trazer pro CRM?', tipo: 'escolha', porque: 'Sem ela o sistema nasce vazio e o lembrete de renovação não tem de onde partir.', o: ['Tem, num sistema', 'Tem, em planilha', 'Tem, mas espalhada', 'Não tem'], entra: 'importação' },
    { id: 'base_tamanho', p: 'Quantos clientes ativos, mais ou menos?', tipo: 'escolha', o: ['Até 100', 'De 100 a 500', 'De 500 a 2.000', 'Mais de 2.000'], entra: 'importação' },
    { id: 'integrar', p: 'O que precisaria conversar com o CRM pra vocês não digitarem duas vezes?', porque: 'Se não souber, descreve o caminho de hoje que a gente descobre.', entra: 'integração' },
  ]},

  { id: 'cliente', titulo: 'Quem é o seu cliente', intro: 'A história por trás da venda. É daqui que a IA tira o jeito de falar e o argumento de quando o cliente está comparando.', perguntas: [
    { id: 'o_que_resolve', p: 'O que você resolve, nas suas palavras? O que o cliente conta quando chega?', req: true, porque: 'A IA usa as mesmas palavras do cliente, não termo técnico.', entra: 'contexto da IA' },
    { id: 'cliente_tipico', p: 'Quem é o cliente típico? Idade, perfil, o que já tentou antes', entra: 'contexto da IA' },
    { id: 'por_que_voces', p: 'Por que escolhem vocês? O que os clientes mais elogiam?', porque: 'É o argumento quando ele está em dúvida ou comparando preço.', entra: 'contexto da IA' },
  ]},

  { id: 'chega', titulo: 'Como o cliente chega', intro: 'Por onde entra, quanto entra e quem responde. Define o primeiro passo do funil e a urgência do atendimento.', perguntas: [
    { id: 'canais', p: 'Por onde os clientes chegam?', tipo: 'multi', o: ['Instagram', 'Indicação', 'Google / site', 'Ligação', 'WhatsApp direto', 'Parceiros', 'Anúncio', 'Outro'], entra: 'placar' },
    { id: 'volume', p: 'Quantos contatos novos por semana?', tipo: 'escolha', o: ['Até 5', 'De 5 a 20', 'De 20 a 50', 'Mais de 50'], entra: 'placar' },
    { id: 'tempo_resposta', p: 'Em quanto tempo o cliente costuma ser respondido?', tipo: 'escolha', o: ['Na hora', 'No mesmo dia', 'No dia seguinte', 'Depende muito'], entra: 'automação' },
    { id: 'onde_perde', p: 'Onde você sente que perde cliente hoje?', porque: 'Pode ser um momento ("quando peço os documentos ele some") ou um motivo.', entra: 'etapas' },
  ]},

  { id: 'etapas', titulo: 'O caminho até a venda', intro: 'As etapas por onde o cliente passa até fechar. A IA e os lembretes automáticos seguem estas etapas — marca uma por uma.', perguntas: [
    { id: 'etapa_falta', p: 'Faltou alguma etapa? Ou alguma está sobrando?', porque: 'Melhor ajustar agora do que com cliente dentro.', entra: 'etapas' },
    { id: 'motivos_perda', p: 'Quando o cliente desiste, o que ele costuma dizer?', porque: 'Vira a lista de motivos de perda — e mostra onde a mensagem precisa melhorar.', entra: 'motivos de perda' },
  ]},

  { id: 'produtos', titulo: 'O que você vende', intro: 'O catálogo é a única fonte de preço do sistema. O que estiver aqui é o que a IA pode oferecer.', perguntas: [
    { id: 'produtos_confirma', p: 'Quais existem de verdade, quais faltam, quais sobram?', porque: 'Se não tem lista pronta acima, escreve o que você vende, um por linha.', entra: 'produtos' },
    { id: 'carro_chefe', p: 'Qual é o carro-chefe — o que mais vende ou mais dá resultado?', tipo: 'texto', entra: 'produtos' },
    { id: 'ticket', p: 'Faixa de valor de cada um, e como o cliente paga', porque: 'Serve pra IA saber o que é ticket alto e o que é venda rápida — e pro caixa.', entra: 'produtos · caixa' },
    { id: 'nao_vende', p: 'O que pedem e você NÃO vende?', tipo: 'texto', porque: 'Cada produto que existe e a IA não conhece vira resposta errada — e o contrário também.', entra: 'travas da IA' },
  ]},

  { id: 'qualifica', titulo: 'O que você pergunta antes de qualquer proposta', intro: 'As perguntas que você faz em TODA conversa. Viram os campos do cadastro e o roteiro da IA. Na implantação anterior essa foi a descoberta mais valiosa: uma única pergunta organizava todo o atendimento.', perguntas: [
    { id: 'perguntas_sempre', p: 'O que mais você pergunta sempre, antes de propor?', req: true, porque: 'Uma por linha, na ordem em que você pergunta. Se as propostas acima já cobrem, escreve "é isso".', entra: 'qualificação' },
    { id: 'documentos', p: 'Que documentos você pede, e em que momento?', entra: 'qualificação' },
    { id: 'vencimento', p: 'Você pergunta quando vence o contrato atual do cliente?', tipo: 'escolha', porque: 'É o que permite o sistema lembrar sozinho da renovação.', o: ['Sempre', 'Às vezes', 'Não pergunto'], entra: 'qualificação' },
  ]},

  { id: 'fala', titulo: 'O jeito de falar', intro: 'A IA aprende com exemplo, não com descrição. As conversas reais que você colar aqui valem mais que qualquer explicação.', perguntas: [
    { id: 'tratamento', p: 'Você trata o cliente por…', tipo: 'escolha', o: ['tu', 'você', 'depende do cliente'], entra: 'tom da IA' },
    { id: 'saudacao', p: 'Como você abre a conversa com quem chega?', tipo: 'texto', ph: 'A frase exata que você usa', entra: 'tom da IA' },
    { id: 'exemplos', p: 'Cola 2 ou 3 conversas reais de WhatsApp que deram certo', req: true, porque: 'Pode apagar o nome do cliente. Quanto mais real melhor, inclusive as abreviações — cliente sente na hora quando é robô.', entra: 'tom da IA' },
    { id: 'palavras', p: 'Palavras que a empresa NUNCA usaria', tipo: 'texto', ph: 'Ex.: "prezado", "oportunidade imperdível"…', entra: 'tom da IA' },
    { id: 'audio_liga', p: 'Você manda áudio? Liga pro cliente?', tipo: 'escolha', porque: 'Muda as tarefas que o sistema cria: ligação converte mais que texto na hora da decisão.', o: ['Só texto', 'Texto e áudio', 'Ligo quando está quente', 'Ligo pra todo mundo'], entra: 'cadência' },
  ]},

  { id: 'ia', titulo: 'O que a IA pode fazer sozinha', intro: 'A fronteira entre o automático e a pessoa. É a pergunta que mais muda de empresa pra empresa — e a que mais protege o seu cliente.', perguntas: [
    { id: 'ia_para', p: 'O que mais a IA deve SEMPRE passar pra uma pessoa?', tipo: 'multi', o: ['Fazer a proposta', 'Negociar desconto', 'Reclamação', 'Urgência', 'Receber documentos', 'Fechar a venda', 'Cliente antigo que voltou', 'Outro'], entra: 'passar pra pessoa' },
    { id: 'ia_horario', p: 'Fora do horário, a IA…', tipo: 'escolha', porque: 'Quem chama de noite e fica sem resposta resolve com outro.', o: ['Responde normalmente', 'Só avisa que responde no horário', 'Não responde nada'], entra: 'automação' },
    { id: 'nao_atende', p: 'Tem cliente ou pedido que você NÃO atende?', tipo: 'texto', porque: 'A IA filtra antes, e ninguém chega pra ouvir "não dá".', entra: 'travas da IA' },
    { id: 'objecoes', p: 'O que você responde pra "tá caro", "vou pensar", "vou ver com outro"?', porque: 'A IA contorna objeção do seu jeito, não com resposta de manual.', entra: 'o que responder' },
    { id: 'repetidas', p: 'As perguntas que você responde toda semana — e as respostas', porque: 'Abre o seu WhatsApp e pega as que você pensa "de novo isso". Metade do atendimento some aqui.', entra: 'o que responder' },
  ]},

  { id: 'materiais', titulo: 'Materiais prontos', intro: 'O que você já manda e funciona. Áudio na sua voz, PDF, tabela — a IA pode enviar no momento certo.', perguntas: [
    { id: 'materiais', p: 'O que você tem pronto e manda com frequência?', tipo: 'multi', o: ['Áudio explicando como funciona', 'PDF / apresentação', 'Tabela ou comparativo', 'Vídeo', 'Link do site', 'Nada, escrevo na hora'], entra: 'materiais' },
    { id: 'materiais_desc', p: 'Descreve cada um: o que é, e em que momento você manda', porque: 'Os arquivos em si você pode anexar aqui mesmo.', entra: 'materiais' },
  ]},

  { id: 'followup', titulo: 'Follow-up e renovação', intro: 'O que o sistema faz sozinho em cada etapa. Os dias contam de quando o cliente entrou na etapa.', perguntas: [
    { id: 'decisao', p: 'Quanto tempo o cliente leva pra decidir?', tipo: 'escolha', porque: 'Se fecha na hora a cadência encurta; se leva semanas, estica.', o: ['Horas', 'Alguns dias', 'Semanas', 'Meses'], entra: 'cadência' },
    { id: 'lembretes', p: 'Quantos lembretes antes de virar incômodo?', tipo: 'escolha', o: ['1 ou 2', '3 ou 4', 'Até responder', 'Nenhum'], entra: 'cadência' },
    { id: 'limites', p: 'Horário ou dia em que NÃO pode chegar mensagem?', tipo: 'texto', entra: 'cadência' },
    { id: 'renovacao_como', p: 'Como a renovação ou recompra é feita hoje? Quem lembra, e o que acontece quando passa batido?', porque: 'É a receita recorrente indo embora sem briga.', entra: 'cadência' },
  ]},

  { id: 'depois', titulo: 'Depois que fechou', intro: 'O CRM comercial termina na venda. O que vem depois vira um roteiro — pra o cliente não sumir depois de pagar.', perguntas: [
    { id: 'pos_venda', p: 'O que acontece do "aceitou" até o cliente estar atendido de fato?', req: true, porque: 'Passo a passo. Cada passo vira um marco com data.', entra: 'roteiro' },
    { id: 'problema', p: 'Quando o cliente tem um problema, como é o atendimento?', porque: 'É o momento em que a empresa mais se prova — e em que a IA mais precisa sair da frente.', entra: 'passar pra pessoa' },
    { id: 'area_cliente', p: 'Faria sentido o cliente ter um link só dele — pra mandar documento, ver o que contratou e acompanhar?', tipo: 'escolha', porque: 'Na implantação anterior isso virou a "área da cliente": ficha, exames e a jornada numa página só.', o: ['Sim, resolveria muita coisa', 'Talvez', 'Não vejo uso'], entra: 'área do cliente' },
  ]},

  { id: 'agenda', titulo: 'Agenda', intro: 'Ligações, visitas, atendimentos. A IA só oferece horário que existe.', perguntas: [
    { id: 'agenda_hoje', p: 'Onde vocês marcam compromisso hoje?', tipo: 'escolha', porque: 'Decide se a gente migra a agenda ou só espelha.', o: ['Google Agenda / Outlook', 'Caderno ou papel', 'WhatsApp e memória', 'Sistema próprio', 'Não marcamos'], entra: 'agenda' },
    { id: 'agenda_tipos', p: 'Que tipo de compromisso vocês têm, e quanto dura cada um?', ph: 'Ex.: ligação 15 min · visita 1h', entra: 'agenda' },
    { id: 'agenda_quem', p: 'Cada pessoa tem a própria agenda, ou é uma só?', tipo: 'escolha', o: ['Uma por pessoa', 'Uma só', 'Depende do tipo'], entra: 'agenda' },
  ]},

  { id: 'caixa', titulo: 'Caixa simples', intro: 'Não é contabilidade. É olhar no fim do mês e saber quanto entrou, de quê, e quanto ainda vai entrar.', perguntas: [
    { id: 'caixa_quer', p: 'O que você gostaria de ver no fim do mês, sem montar planilha?', tipo: 'multi', o: ['Receita por produto', 'Receita por pessoa da equipe', 'O que ainda vai entrar (parcelas)', 'Renovações feitas e perdidas', 'Custos', 'Não preciso disso agora'], entra: 'caixa' },
    { id: 'caixa_hoje', p: 'Como você controla isso hoje?', entra: 'caixa' },
  ]},

  { id: 'numeros', titulo: 'Os números de hoje', intro: 'Do jeito que você souber. Se não souber, o sistema mede nas 3 primeiras semanas. A meta é o que não pode ficar sem resposta.', perguntas: [
    { id: 'propostas_mes', p: 'Quantas propostas ou atendimentos por mês?', tipo: 'texto', entra: 'placar' },
    { id: 'fecha', p: 'Dessas, quantas fecham?', tipo: 'texto', porque: 'É a conversão que o follow-up tem que melhorar.', entra: 'placar' },
    { id: 'meta', p: 'Onde você quer chegar em 6 meses? Em palavras e em número', req: true, porque: '"Crescer" não se mede. "40 vendas por mês", sim. Vira a meta do sistema.', entra: 'meta' },
  ]},

  { id: 'teste', titulo: 'Como você responderia?', intro: 'Mensagens que um cliente mandaria. Responde como você responderia de verdade, no WhatsApp — é o melhor treino que a IA pode ter. Pula as que não fizerem sentido.', perguntas: [] },

  { id: 'contas', titulo: 'Contas e acessos', intro: 'Todas as contas são da empresa, no nome dela. A gente configura; ninguém fica pendurado em conta de outro.', perguntas: [
    { id: 'instagram', p: 'Instagram e site da empresa', tipo: 'texto', entra: 'marca' },
    { id: 'meta_business', p: 'A empresa tem Gerenciador de Negócios da Meta?', tipo: 'escolha', o: ['Tem', 'Não sei', 'Não tem'], entra: 'WhatsApp' },
    { id: 'chip', p: 'Se precisar, topa um chip novo só pro atendimento do sistema?', tipo: 'escolha', porque: 'É o caminho mais simples pra ligar a API oficial sem mexer no WhatsApp que já existe.', o: ['Topa', 'Prefere migrar o número atual', 'Precisa conversar'], entra: 'WhatsApp' },
    { id: 'cartao', p: 'Tem cartão internacional pra as contas de IA (cobradas em dólar, por uso)?', tipo: 'escolha', porque: 'O gasto é pequeno — centavos por conversa — mas a conta precisa ser da empresa.', o: ['Tem', 'Não tem', 'Preciso de ajuda com isso'], entra: 'contas' },
    { id: 'logo', p: 'Cores da marca, se tiver definido', tipo: 'texto', porque: 'O logo em boa resolução pode anexar aqui — a cor do sistema sai dele.', entra: 'marca' },
  ]},

  { id: 'fim', titulo: 'Pra fechar', intro: 'O que realmente importa pra você.', perguntas: [
    { id: 'maior_problema', p: 'Qual é o maior problema do seu comercial hoje, em uma frase?', req: true, entra: 'meta' },
    { id: 'obs', p: 'Alguma coisa que a gente não perguntou e você acha que importa?', entra: 'observações' },
  ]},
]

// ─────────────────────────────────────────────────────── as propostas de cada empresa
//
// É o que a gente monta ANTES de mandar o link, a partir do que já sabe do negócio. Entra nos
// blocos como pergunta do tipo `valida`: o dono só marca Aprovado / Ajustar / Tirar.
// Empresa sem proposta aqui recebe o questionário genérico e responde do zero — funciona, mas
// rende menos.

export type Propostas = { hoje?: Pergunta[]; etapas?: Pergunta[]; produtos?: Pergunta[]; qualifica?: Pergunta[]; followup?: Pergunta[]; depois?: Pergunta[]; ia?: Pergunta[]; teste?: string[] }

const T = (quando: string, acao: string, marca?: 'tpl' | 'tar'): Toque => ({ quando, acao, marca })

export const PROPOSTAS: Record<string, Propostas> = {
  'gaja-corretora-de-seguros': {
    // Perguntar "que sistema vocês usam?" a um corretor rende "o de cotação". Perguntar pelo NOME
    // rende a resposta certa — e é o nome que decide se dá pra integrar ou se vai ser digitação
    // dobrada. Esta é a pergunta que evita descobrir a integração no meio da implantação.
    hoje: [
      { id: 'multicalculo', p: 'Qual multicálculo vocês usam?', tipo: 'multi', porque: 'É por onde a cotação sai. Saber qual decide se o valor pode aparecer sozinho no card do cliente ou se alguém vai copiar à mão.', o: ['Segfy', 'Quiver', 'TEx (Tex Sistemas)', 'Agger', 'Sispro', 'Cotafácil', 'Direto no site de cada seguradora', 'Outro'], entra: 'integração' },
      { id: 'gestao_apolices', p: 'E pra guardar as apólices e controlar comissão?', tipo: 'multi', porque: 'É onde mora a data de vencimento de cada cliente — a matéria-prima do lembrete de renovação.', o: ['O mesmo multicálculo', 'Outro sistema de gestão', 'Planilha', 'Portal de cada seguradora', 'Não controlamos num lugar só'], entra: 'integração · importação' },
      { id: 'seguradoras', p: 'Com quais seguradoras vocês trabalham?', porque: 'Entra no cadastro e é o que a IA pode citar quando o cliente pergunta.', entra: 'produtos' },
    ],
    etapas: [
      { id: 'e1', p: 'Novo contato', tipo: 'valida', prop: 'Chegou e ninguém falou ainda. <b>O relógio da resposta corre aqui</b> — seguro é comparado, quem cota primeiro leva.', entra: 'etapas' },
      { id: 'e2', p: 'Qualificação', tipo: 'valida', prop: 'Qual seguro, quando vence o atual, o que ele já tem. A IA pode fazer essas perguntas sozinha.', entra: 'etapas' },
      { id: 'e3', p: 'Aguardando dados do cliente', tipo: 'valida', prop: 'Pedimos documentos e estamos esperando. <b>É onde mais morre negócio em corretora</b> — por isso é etapa separada, com lembrete automático.', entra: 'etapas' },
      { id: 'e4', p: 'Cotando', tipo: 'valida', prop: 'Rodando nas seguradoras. Trabalho da corretora; o cliente não é cobrado aqui.', entra: 'etapas' },
      { id: 'e5', p: 'Cotação enviada', tipo: 'valida', prop: 'O comparativo está na mão dele. Esperando resposta, com lembrete.', entra: 'etapas' },
      { id: 'e6', p: 'Negociação', tipo: 'valida', prop: 'Ajuste de cobertura, franquia, parcelamento. Aqui é gente, não IA.', entra: 'etapas' },
      { id: 'e7', p: 'Fechado — emitindo', tipo: 'valida', prop: 'Aceitou: vistoria, assinatura, pagamento, apólice. Sai do funil de venda e entra no "depois da venda".', entra: 'etapas' },
      { id: 'e8', p: 'Renovação futura', tipo: 'valida', prop: 'Tem seguro vigente em outro lugar e vence lá na frente. <b>Não é perda</b>: o sistema traz de volta 45 dias antes.', entra: 'etapas' },
      { id: 'e9', p: 'Perdido', tipo: 'valida', prop: 'Fechou com outro ou sumiu. Não some do sistema: entra na nutrição e na próxima renovação.', entra: 'etapas' },
    ],
    produtos: [
      { id: 'prod', p: 'Os produtos que a gente já cadastrou', tipo: 'valida', prop: 'Seguro Auto · Vida · Residencial · Empresarial · Condomínio · Viagem · Fiança Locatícia · Plano de Saúde. Todos sem valor fixo — em seguro o preço sai da cotação.', entra: 'produtos' },
    ],
    qualifica: [
      { id: 'q_auto', p: 'Seguro Auto — o que perguntar antes de cotar', tipo: 'valida', prop: 'Placa (ou modelo e ano) · CEP de pernoite · uso (particular/app/trabalho) · idade do condutor principal · tem seguro hoje? qual seguradora e quando vence', entra: 'qualificação' },
      { id: 'q_vida', p: 'Seguro de Vida', tipo: 'valida', prop: 'Idade · profissão · fumante? · capital desejado ou renda a proteger · tem algum hoje?', entra: 'qualificação' },
      { id: 'q_resid', p: 'Residencial e Condomínio', tipo: 'valida', prop: 'CEP · casa ou apartamento · valor aproximado do imóvel e do conteúdo · alugado ou próprio', entra: 'qualificação' },
      { id: 'q_emp', p: 'Empresarial', tipo: 'valida', prop: 'Atividade · endereço · faturamento aproximado · o que mais quer proteger (estoque, equipamento, lucro cessante)', entra: 'qualificação' },
      { id: 'q_saude', p: 'Plano de Saúde', tipo: 'valida', prop: 'Idade de cada pessoa · quantas vidas · cidade · tem CNPJ? · tem plano hoje?', entra: 'qualificação' },
    ],
    followup: [
      { id: 'c1', p: 'Novo contato', tipo: 'valida', entra: 'cadência', toques: [T('na hora', 'responder, perguntar qual seguro e quando vence o atual'), T('+2h', 'segunda mensagem, se não respondeu'), T('fim do dia', 'sem resposta: a IA assume o follow-up')] },
      { id: 'c3', p: 'Aguardando dados', tipo: 'valida', entra: 'cadência', toques: [T('D+1', '"faltou só o X pra eu cotar"', 'tpl'), T('D+3', '"uma foto do documento já resolve"', 'tpl'), T('D+7', 'última — sem resposta vai pra Perdido', 'tpl')] },
      { id: 'c4', p: 'Cotando', tipo: 'valida', entra: 'cadência', toques: [T('24h', 'prazo interno pra devolver a cotação — tarefa pra quem cota, não mensagem pro cliente', 'tar')] },
      { id: 'c5', p: 'Cotação enviada', tipo: 'valida', entra: 'cadência', toques: [T('D+1', '"conseguiu ver? alguma dúvida na cobertura?"', 'tpl'), T('D+3', 'responder a objeção mais comum', 'tpl'), T('D+7', 'última — a cotação tem validade', 'tpl')] },
      { id: 'c8', p: 'Renovação futura', tipo: 'valida', entra: 'cadência', toques: [T('45 dias antes', 'cotar de novo e avisar que vem a renovação', 'tar'), T('30 dias antes', 'enviar a proposta', 'tpl'), T('15 dias antes', '"vence dia X, não deixa descoberto"', 'tpl'), T('venceu', 'não renovou = Perdido, com o motivo')] },
      { id: 'c9', p: 'Perdido (nutrição)', tipo: 'valida', entra: 'cadência', toques: [T('1 vez por mês', 'conteúdo útil', 'tpl'), T('45 dias antes do vencimento dele', 'convite pra cotar de novo — mesmo quem fechou com outro', 'tpl')] },
    ],
    depois: [
      { id: 'r1', p: 'Apólice emitida', tipo: 'valida', entra: 'roteiro', toques: [T('no dia', 'apólice + boas-vindas + "guarda o número do sinistro e o meu"'), T('D+7', '"chegou tudo certo?"', 'tpl'), T('D+30', 'acompanhamento e indicação', 'tpl'), T('45 dias antes do fim', 'começa a renovação', 'tar')] },
    ],
    ia: [
      { id: 'ia_preco', p: 'O que a IA fala de preço', tipo: 'valida', prop: 'A IA <b>nunca passa valor</b>: em seguro o preço sai da cotação. Ela explica de que o valor depende, colhe os dados e diz quando a cotação chega.', entra: 'travas da IA' },
      { id: 'ia_travas', p: 'Travas', tipo: 'valida', prop: 'A IA <b>nunca</b>: diz que "está coberto" sem a apólice na mão · promete prazo de indenização · orienta em sinistro (passa pra pessoa <b>na hora</b>) · dá desconto · fala mal de seguradora ou de outro corretor.', entra: 'travas da IA' },
    ],
    teste: [
      '"Oi, vi no Instagram. Quanto fica o seguro do meu carro?"',
      '"Bateram no meu carro agora, o que eu faço?"',
      '"Roubo tá coberto?"',
      '"Achei caro, na outra corretora tava 300 a menos"',
      '"Meu seguro vence semana que vem"',
      '"Manda a cotação que eu vejo depois"',
      '"Não tenho o documento aqui agora"',
      '"Quero cancelar o seguro"',
    ],
  },
}

/** O modelo com as propostas daquela empresa encaixadas nos blocos certos. */
export function modeloDe(slug: string): Bloco[] {
  const pr = PROPOSTAS[slug]
  return MODELO.map(b => {
    const extra = pr ? (pr as any)[b.id] as Pergunta[] | undefined : undefined
    if (b.id === 'teste') {
      const falas = pr?.teste || []
      return { ...b, perguntas: falas.map((f, n) => ({ id: 't' + (n + 1), p: f, tipo: 'teste' as Tipo, entra: 'o que responder' })) }
    }
    return extra?.length ? { ...b, perguntas: [...extra, ...b.perguntas] } : b
  }).filter(b => b.perguntas.length > 0)
}
