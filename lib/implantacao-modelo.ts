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

// `somente`: o questionário mostra SÓ estes blocos, sem o MODELO genérico (21/10/2026). Pra quem já
// respondeu o básico em outro lugar (a Cristina, do Mundo do Papelão, já tinha passado a empresa,
// o funil e os produtos no Deu Venda dela): perguntar de novo pega mal e afasta.
export type Propostas = { somente?: Bloco[]; hoje?: Pergunta[]; etapas?: Pergunta[]; produtos?: Pergunta[]; qualifica?: Pergunta[]; followup?: Pergunta[]; depois?: Pergunta[]; ia?: Pergunta[]; teste?: string[] }

const T = (quando: string, acao: string, marca?: 'tpl' | 'tar'): Toque => ({ quando, acao, marca })

export const PROPOSTAS: Record<string, Propostas> = {
  // O MUNDO DO PAPELÃO / TRES (21/10/2026). As lojas da Cristina (Porto Alegre, Canoas, Novo
  // Hamburgo, Cachoeirinha), saindo do Ultrafox. Só as perguntas DELA (`somente`): o genérico ela já
  // respondeu no Deu Venda. 28 perguntas montadas pela conversa do Mundo do Papelão
  // (material/mundo-do-papelao/questionario-pacote-escola.md); o caminho de cada resposta está no
  // `porque` e a sugestão vai como "(nossa sugestão)" no fim da opção. Desenho em estado/mundo-do-papelao.md.
  'o-mundo-do-papelao': {
    somente: [
      { id: 'whatsapp', titulo: 'WhatsApp', intro: 'A decisão que define todo o resto.', perguntas: [
    { id: "numeros_app", p: "Os números das lojas estão no WhatsApp Business ou no WhatsApp comum?", tipo: 'escolha', porque: "Hoje só o 3347-4747 é oficial. Os outros (Canoas 9731-0380, NH 9566-3225, o antigo da Nicole 9323-7199 e o 99760-9532) entram no Ultrafox por QR Code, e é isso que limita a 10 envios por dia. O sistema novo só pode usar número oficial. A Meta tem um jeito de deixar o MESMO número oficial sem tirar o WhatsApp do celular da loja, mas ele só funciona no WhatsApp Business. Pra conferir: no celular da loja, o ícone do app tem um \"B\". Se \"Todos estão no WhatsApp Business\": O caminho mais simples: cada loja fica com o número dela, agora oficial, o app continua no celular e a Meta traz as conversas dos últimos 6 meses. Acaba o limite de 10 por dia. Se \"Alguns ou todos estão no WhatsApp comum\": Antes, a loja passa o número pro WhatsApp Business no mesmo celular (o próprio app faz e mantém as conversas). Depois segue o caminho de cima. Se \"Não sei\": A gente confere junto contigo numa chamada de 10 minutos, olhando os celulares.", o: ["Todos estão no WhatsApp Business (nossa sugestão)","Alguns ou todos estão no WhatsApp comum","Não sei"], ph: "Confirma de qual loja é cada número, principalmente o 99760-9532, e se Cachoeirinha tem número próprio." },
    { id: "meta_conta", p: "De quem é a conta da Meta onde está o 3347-4747?", tipo: 'escolha', porque: "O número oficial fica dentro de uma conta de empresa na Meta (o Business Manager). Se a conta é da TRES, a gente liga o sistema novo direto. Se foi o Ultrafox que criou e controla, é preciso pedir a eles a liberação. Pra ver: entra em business.facebook.com com o teu Facebook. Se aparece \"TRES\" e tu és administradora, a conta é tua. Se \"É da TRES e eu sou administradora\": Ligamos o sistema no número sem depender de ninguém. É o caminho mais rápido. Se \"É da TRES, mas outra pessoa é a administradora\": Essa pessoa te dá acesso de administradora (2 minutos) e seguimos pelo caminho de cima. Se \"Foi o Ultrafox que criou ou controla\": Pedimos ao Ultrafox que passe a conta pra TRES. Leva alguns dias, e a gente te manda o texto pronto do pedido. Se \"Não sei\": A gente te mostra numa chamada rápida onde ver.", o: ["É da TRES e eu sou administradora (nossa sugestão)","É da TRES, mas outra pessoa é a administradora","Foi o Ultrafox que criou ou controla","Não sei"] },
    { id: "numeros_futuro", p: "Daqui pra frente, cada loja continua com o número dela?", tipo: 'escolha', porque: "Em 20/10 tu decidiu que cada cliente continua no número em que já conversa. Mantendo isso, o cliente nem percebe a troca de sistema. Se \"Sim, cada loja com o seu, e o 3347-4747 como número geral\": Quem chama a loja cai direto nela. Quem chama o 3347-4747 vai pra loja mais perto. Quem já é cliente continua no mesmo número. Se \"Prefiro concentrar tudo no 3347-4747\": Fica um número só pra divulgar, mas os clientes antigos das lojas precisam ser avisados da troca, e isso vai contra a decisão de 20/10. Se \"Quero conversar sobre isso antes\": A gente explica as duas formas numa chamada.", o: ["Sim, cada loja com o seu, e o 3347-4747 como número geral (nossa sugestão)","Prefiro concentrar tudo no 3347-4747","Quero conversar sobre isso antes"] },
    { id: "ultrafox_contrato", p: "Como é o contrato do Ultrafox?", tipo: 'escolha', porque: "O plano é trocar o Ultrafox loja por loja, começando por uma, e só desligar quando as 4 estiverem no sistema novo. O contrato diz quando dá pra parar de pagar. Se \"Mensal, sem fidelidade\": A gente desliga o Ultrafox assim que a última loja estiver rodando no sistema novo. Se \"Tem contrato com prazo\": A gente planeja a troca pra terminar perto do fim do contrato, pra não pagar os dois por muito tempo. Se \"Não sei\": Vale olhar o contrato ou a fatura. Tu me passas depois.", o: ["Mensal, sem fidelidade","Tem contrato com prazo","Não sei"], ph: "Quanto vocês pagam por mês e até quando vai o contrato (se souber)." },
      ] },
      { id: 'lojas', titulo: 'Lojas e equipe', intro: 'Quem atende o quê.', perguntas: [
    { id: "equipe", p: "Quem atende o WhatsApp em cada loja hoje?", tipo: 'longo', porque: "Cada atendente vai ver só a fila da loja dela, e a responsável vê a loja inteira. Pela análise a gente sabe de Gabriela (POA), Priscila e Júlia (Canoas), Ana e Morgana (NH) e Alex (Cachoeirinha e Indústria). Corrige e completa: o nome de quem atende, quem é a responsável e o horário de cada uma, se for diferente do da loja. Responder uma linha por loja: Porto Alegre, Canoas, Novo Hamburgo, Cachoeirinha.", ph: "Ex.: Canoas: Priscila e Júlia, responsável Júlia, 9h às 18h" },
    { id: "ve_tudo", p: "Quem pode ver as 4 lojas juntas?", tipo: 'escolha', porque: "Quem vê tudo enxerga as vendas, as conversas e os números de todas as lojas. Atendente e responsável de loja só veem a loja delas. Se \"Só eu\": Só tu tens a visão das 4 lojas lado a lado. Se \"Eu e mais alguém (escreve quem embaixo)\": Essas pessoas ganham a mesma visão que a tua.", o: ["Só eu","Eu e mais alguém (escreve quem embaixo) (nossa sugestão)"], ph: "Ex.: Jonas, supervisão." },
    { id: "distribuicao", p: "Quando chega cliente novo numa loja, pra quem vai?", tipo: 'escolha', porque: "Hoje o Ultrafox entrega pra quem está online no departamento. No sistema novo dá pra fazer de três jeitos. Se \"Rodízio entre as atendentes que estão no turno\": Cada cliente novo vai pra próxima da fila. Ninguém fica sobrecarregada, e quem está de folga não recebe. Se \"Cada loja tem uma pessoa só no WhatsApp\": Tudo vai pra ela, e a responsável cobre quando ela falta. Se \"A responsável da loja distribui\": O cliente cai na fila da loja e a responsável escolhe quem atende. Dá mais controle, mas atrasa a primeira resposta.", o: ["Rodízio entre as atendentes que estão no turno (nossa sugestão)","Cada loja tem uma pessoa só no WhatsApp","A responsável da loja distribui"] },
    { id: "carteira", p: "Cliente empresa (B2B) fica sempre com a mesma atendente?", tipo: 'escolha', porque: "A Morgana já tem carteira própria. Com carteira, o cliente que volta cai direto na atendente que já conhece ele, sem rodízio. Se \"Sim, todo B2B fica com quem atendeu primeiro\": A carteira se monta sozinha. Se a atendente sair, a carteira dela passa pra outra da mesma loja de uma vez (foi o que aconteceu com a Nicole). Se \"Só alguns clientes têm dona\": Tu ou a responsável marca na ficha quem é de quem. O resto entra no rodízio. Se \"Não, qualquer atendente atende\": Todo cliente entra no rodízio, mesmo quem já comprou.", o: ["Sim, todo B2B fica com quem atendeu primeiro (nossa sugestão)","Só alguns clientes têm dona","Não, qualquer atendente atende"], ph: "Além da Morgana, quem tem clientes fixos hoje?" },
    { id: "alerta", p: "Cliente esperando resposta: quem é avisado?", tipo: 'escolha', porque: "Tua meta é responder em até 5 minutos no horário da loja. Em setembro, 1 de cada 5 contatos de anúncio esperou mais de 2 horas. O sistema avisa no celular quando passa do tempo. Se \"A atendente em 5 minutos e a responsável da loja em 15\": Quase sempre a atendente resolve. A responsável só fica sabendo do que escapou. Se \"Direto a responsável da loja\": A responsável recebe todo atraso, até os de 5 minutos. Se \"A atendente, a responsável e eu\": Tu também recebes, mas vão ser muitos avisos por dia.", o: ["A atendente em 5 minutos e a responsável da loja em 15 (nossa sugestão)","Direto a responsável da loja","A atendente, a responsável e eu"] },
      ] },
      { id: 'numero_geral', titulo: 'Cliente pelo número geral', intro: 'Como ele chega na loja certa.', perguntas: [
    { id: "escolha_loja", p: "Como escolher a loja de quem chama o 3347-4747?", tipo: 'escolha', porque: "Hoje o robô manda um menu, e quem escreve \"bom dia\" recebe o menu de novo, duas ou três vezes. No sistema novo, a IA entende a cidade escrita (\"canoas\", \"NH\", \"moro em Esteio\") e manda pra loja certa. Se \"A loja mais perto da cidade ou do bairro do cliente\": A IA pergunta de onde ele é e manda pra loja certa usando a tabela da próxima pergunta. Quem vem de anúncio de uma cidade já cai na loja dela, sem pergunta nenhuma. Se \"O cliente escolhe a loja\": A IA mostra as 4 lojas com o endereço e ele responde com o nome. Sem menu de número. Se \"Tudo cai numa pessoa que redistribui\": Fica no controle de alguém, mas a primeira resposta demora mais.", o: ["A loja mais perto da cidade ou do bairro do cliente (nossa sugestão)","O cliente escolhe a loja","Tudo cai numa pessoa que redistribui"] },
    { id: "mapa_cidades", p: "Confere a nossa proposta de qual cidade vai pra qual loja", tipo: 'longo', porque: "É um ponto de partida montado pela distância até cada loja. Corrige o que não faz sentido pra vocês. Cidade que não está na lista vai pra loja mais perto pelo mapa. Nossa proposta: Porto Alegre ← Porto Alegre, Viamão, Guaíba, Eldorado do Sul, Alvorada (zona sul e centro) · Canoas ← Canoas, Esteio, Sapucaia do Sul, Nova Santa Rita · Cachoeirinha ← Cachoeirinha, Gravataí, Glorinha, Alvorada (norte) · Novo Hamburgo ← Novo Hamburgo, São Leopoldo, Campo Bom, Estância Velha, Dois Irmãos, Sapiranga, Ivoti, Portão. Escreve só o que muda." },
    { id: "fora_regiao", p: "E quem é de longe, fora da Grande Porto Alegre?", tipo: 'escolha', porque: "Em setembro, 45% dos contatos do anúncio eram do interior ou de fora do estado, e quase nenhum comprou. Muitos chegam perguntando \"posso comprar online?\". Se \"Responder com educação que é só retirada na loja\": A IA explica, passa o endereço da loja mais perto e não ocupa a fila das atendentes. Se for empresa com pedido grande, vai pra Indústria. Se \"Atender normal\": Entra na fila da loja como qualquer cliente. Se \"Vocês mandam pelo correio ou transportadora\": Então a gente monta o caminho do envio. Escreve embaixo como funciona.", o: ["Responder com educação que é só retirada na loja (nossa sugestão)","Atender normal","Vocês mandam pelo correio ou transportadora"], ph: "Se vocês enviam pra longe, como funciona." },
    { id: "fechada", p: "O que acontece quando o cliente chama com a loja fechada?", tipo: 'escolha', porque: "8% dos contatos chegam com a loja fechada, e metade espera 14 horas ou mais pela primeira resposta. Tu mesma escreveu que a IA devia começar ajudando, e só depois responder sozinha. Se \"A IA responde e pega medida, quantidade e pra quando, sem passar preço\": De manhã a atendente já encontra o pedido pronto e responde com o preço. O cliente não fica no vácuo. Se \"A IA já passa o preço da tabela\": Fecha mais rápido, mas só depois que a tabela de preços estiver conferida (pergunta 15). Se \"Só um recado de loja fechada\": Como é hoje, mas pedindo a medida e a quantidade.", o: ["A IA responde e pega medida, quantidade e pra quando, sem passar preço (nossa sugestão)","A IA já passa o preço da tabela","Só um recado de loja fechada"] },
    { id: "ia_sozinha", p: "Depois de 2 semanas, a IA pode passar preço sozinha fora do horário?", tipo: 'escolha', porque: "Nas 2 primeiras semanas a IA só sugere a resposta, e a atendente confere e manda. Se ela acertar, dá pra deixar responder sozinha à noite e no fim de semana. Se \"Sim, se a tabela estiver em dia\": Fora do horário a IA passa o preço e já pergunta se pode separar. Quem confirma a reserva de manhã é a atendente. Se \"Decido depois de ver as 2 semanas\": A gente te mostra as respostas da IA e tu decides. Se \"Não, preço só sai de uma pessoa\": A IA continua só pegando o pedido.", o: ["Sim, se a tabela estiver em dia (nossa sugestão)","Decido depois de ver as 2 semanas","Não, preço só sai de uma pessoa"] },
      ] },
      { id: 'preco', titulo: 'Preço, estoque e entrega', intro: 'O que a IA e as atendentes podem dizer.', perguntas: [
    { id: "preco_igual", p: "O preço é o mesmo nas 4 lojas?", tipo: 'escolha', porque: "Define se o sistema tem uma tabela de preços só ou uma por loja. Se \"Sim, igual nas 4\": Uma tabela só, e quando muda, muda pra todas. Se \"Muda de loja pra loja\": Uma tabela por loja. Escreve embaixo o que muda.", o: ["Sim, igual nas 4 (nossa sugestão)","Muda de loja pra loja"] },
    { id: "estoque", p: "As 4 lojas têm os mesmos produtos?", tipo: 'escolha', porque: "Se o estoque muda, a IA não pode prometer o que a loja não tem. Se \"Sim, praticamente o mesmo nas 4\": O sistema não precisa olhar estoque. Se faltar algo, a atendente avisa. Se \"Muda, e o Adderi sabe o estoque de cada loja\": Começamos com a atendente confirmando, e depois vemos se dá pra puxar o estoque do Adderi. Se \"Muda, e ninguém controla de perto\": A IA sempre diz \"vou confirmar aqui na loja\" antes de separar.", o: ["Sim, praticamente o mesmo nas 4 (nossa sugestão)","Muda, e o Adderi sabe o estoque de cada loja","Muda, e ninguém controla de perto"] },
    { id: "tabela", p: "Onde está a tabela de preços hoje, e quem cuida dela?", tipo: 'escolha', porque: "É a base de tudo o que a IA pode dizer: sem tabela conferida, a IA não passa preço. Tu já tinhas perguntado \"quem é dono das tabelas?\" em 14/10. Se \"Numa planilha\": A gente importa e a pessoa responsável atualiza ali mesmo no sistema. Se \"Só no catálogo em PDF (o de 2026 com preço)\": A gente transforma o PDF em tabela uma vez, e a pessoa responsável confere. Se \"Só no Adderi\": Exportamos do Adderi e a pessoa responsável confere.", o: ["Numa planilha (nossa sugestão)","Só no catálogo em PDF (o de 2026 com preço)","Só no Adderi"], ph: "Quem vai ser a responsável pela tabela e de quanto em quanto tempo o preço muda." },
    { id: "entrega", p: "Como fica a entrega?", tipo: 'escolha', porque: "Hoje cada atendente responde de um jeito (\"teria que cotar\", \"depende do valor\"). Isso está pendente desde 14/10. Com uma regra só, a IA e as 4 lojas respondem igual. Se \"Só retirada na loja\": A resposta pronta diz que é retirada e já oferece separar. Se \"Retirada, ou a loja chama um motoboy ou Uber e o cliente paga\": A atendente chama e passa o valor. Resolve a maioria dos casos sem montar tele própria. Se \"Tele própria (escreve o valor mínimo e as cidades embaixo)\": A IA calcula e avisa quando o pedido passa do mínimo pra tele grátis.", o: ["Só retirada na loja","Retirada, ou a loja chama um motoboy ou Uber e o cliente paga (nossa sugestão)","Tele própria (escreve o valor mínimo e as cidades embaixo)"], ph: "Ex.: tele grátis acima de R$ 300 em POA e Canoas." },
    { id: "pix", p: "O desconto de 5% no Pix que a Ana dá em NH vira regra das 4 lojas?", tipo: 'escolha', porque: "Desconto vira resposta pronta e pode ajudar a fechar (\"na internet está mais barato\"). Se \"Sim, 5% no Pix nas 4 lojas\": Entra na resposta pronta e a IA pode oferecer. Se \"Só acima de um valor (escreve qual)\": A IA oferece quando o pedido passa do valor. Se \"Não, sem desconto padrão\": Desconto continua caso a caso, aprovado pela supervisão.", o: ["Sim, 5% no Pix nas 4 lojas","Só acima de um valor (escreve qual) (nossa sugestão)","Não, sem desconto padrão"] },
    { id: "reserva", p: "A reserva fica 48 horas a partir do OK do cliente, com lembrete em 36 horas?", tipo: 'escolha', porque: "Foi o que tu decidiste em 14/10. O sistema conta o prazo sozinho, manda o lembrete no horário da loja e, quando vence, pergunta à atendente se o cliente retirou. Se \"Sim, 48 horas e lembrete em 36\": Fica assim. Se \"Outro prazo (escreve qual)\": A gente ajusta.", o: ["Sim, 48 horas e lembrete em 36 (nossa sugestão)","Outro prazo (escreve qual)"] },
      ] },
      { id: 'caixa', titulo: 'Caixa e recompra', intro: 'A venda do WhatsApp chegando no Adderi.', perguntas: [
    { id: "adderi_api", p: "O Adderi tem integração (API) com outros sistemas?", tipo: 'escolha', porque: "Com integração, as vendas entram no sistema sozinhas e a recompra se calcula sem ninguém mexer. Sem integração, alguém da casa sobe a exportação uma vez por mês (2 minutos), como tu já faz. Se \"Sim, tem\": A gente liga direto. Precisamos do contato do suporte do Adderi. Se \"Não tem\": Exportação mensal: tu sobes a planilha no sistema e ele faz o resto. Se \"Não sei\": A gente te manda pronta a pergunta pro suporte do Adderi.", o: ["Sim, tem (nossa sugestão)","Não tem","Não sei"] },
    { id: "codigo_caixa", p: "Como o caixa fica sabendo que a venda veio do WhatsApp?", tipo: 'escolha', porque: "Hoje a venda sai no nome de quem estava no caixa: a Priscila fez 1.503 atendimentos e tem R$ 4.900 no nome dela. A ideia é cada reserva ganhar um código curto (ex.: C1234) que o cliente mostra no balcão. Se \"O caixa digita o código na observação da venda\": Com a exportação do Adderi, o sistema liga cada venda à atendente que atendeu. Fica certo quanto o WhatsApp vende, por loja e por pessoa. Se \"O caixa lança a atendente do WhatsApp como vendedora\": Funciona, mas depende de o caixa lembrar, e não liga a venda à conversa. Se \"Usar um campo próprio do Adderi (tipo \"Tipo Venda\")\": Se existir, é o melhor dos dois. A gente pergunta ao suporte do Adderi.", o: ["O caixa digita o código na observação da venda (nossa sugestão)","O caixa lança a atendente do WhatsApp como vendedora","Usar um campo próprio do Adderi (tipo \"Tipo Venda\")"] },
    { id: "qr_balcao", p: "Um QR Code no balcão pra pegar o WhatsApp de quem compra?", tipo: 'escolha', porque: "R$ 1,48 milhão das vendas de 2026 é \"consumidor não informado\": essa gente nunca recebe aviso de reposição. Um cartaz no caixa (\"Quer aviso quando for hora de repor? Aponta aqui\") abre o WhatsApp da loja com a mensagem pronta, e o cliente entra no sistema sozinho. Se \"Sim, um em cada caixa\": A gente cria o QR de cada loja e o texto do cartaz. Se \"Prefiro que o caixa peça o celular e digite\": Continua no Adderi. Importamos junto com a exportação. Se \"Não por enquanto\": Fica pra depois.", o: ["Sim, um em cada caixa (nossa sugestão)","Prefiro que o caixa peça o celular e digite","Não por enquanto"] },
    { id: "recompra", p: "A recompra pode funcionar assim?", tipo: 'escolha', porque: "Do jeito que tu decidiste em 20/10: aviso quando passa 3/4 do ciclo de cada cliente, contando da última compra. Sem histórico, ciclo de 20 dias. A diferença é que o sistema faz sozinho o que hoje é campanha criada à mão no Ultrafox. Se \"Sim: A pela atendente, B e C automáticos\": Cliente A (compra sempre) vira tarefa da atendente no dia certo, com a mensagem pronta (\"separo as de sempre?\"). Os B recebem o aviso de reposição sozinhos. Os C (compraram uma vez) recebem uma reativação a cada 3 meses. Quem responde \"Sim, separa!\" já vira reserva. Se \"Tudo passa pela atendente\": O sistema monta a lista do dia com o texto pronto e ela manda. Mais controle, mais trabalho. Se \"Quero ajustar (escreve embaixo)\": A gente ajusta as regras.", o: ["Sim: A pela atendente, B e C automáticos (nossa sugestão)","Tudo passa pela atendente","Quero ajustar (escreve embaixo)"] },
      ] },
      { id: 'fechar', titulo: 'O que tu quer ver', intro: 'Pra fechar.', perguntas: [
    { id: "painel", p: "O que tu mais quer ver no celular toda manhã?", tipo: 'multi', porque: "O sistema monta um resumo por loja. Marca até 4. O resto fica no painel.", o: ["De cada 100 preços passados, quantos viraram venda","Quem está esperando resposta agora","Reservas vencendo hoje","Recompras do dia e quem está atrasado","Quanto o WhatsApp vendeu ontem, por loja","Quanto custou cada venda que veio do anúncio","Vendas perdidas e o motivo"] },
    { id: "comeco", p: "Por qual loja a gente começa?", tipo: 'escolha', porque: "A troca do Ultrafox vai ser loja por loja: uma loja por 2 semanas, depois as outras. Tu já tinhas escolhido Canoas pra começar o processo novo. Se \"Canoas\": A loja com mais conversa e o faturamento parado. É onde a diferença vai aparecer primeiro. Se \"Porto Alegre\": A que mais vende. Mais impacto, mas mais risco se algo der errado no começo. Se \"Outra (escreve qual)\":", o: ["Canoas (nossa sugestão)","Porto Alegre","Outra (escreve qual)"] },
    { id: "nao_perder", p: "O que o Ultrafox faz hoje que tu não podes perder?", tipo: 'longo', porque: "Qualquer coisa que as atendentes usam todo dia: mensagens rápidas, banco de arquivos com os catálogos em PDF, etiquetas, transferência pra Indústria… A gente leva tudo junto." },
    { id: "incomoda", p: "E o que mais te incomoda hoje, que tu queria que sumisse?", tipo: 'longo', porque: "Pode ser qualquer coisa: a planilha diária, o PC que precisa ficar ligado, a fila que não fecha, o que for." },
      ] },
    ],
  },
  // W PRIME SEEDS (15/10/2026). Representação comercial de insumos pro TABACO, pelo que o Instagram
  // mostra (@wprimeseeds: "W Prime Seeds Tobacco | Representações"): sementes de tabaco (híbrido
  // Virgínia, PVH2444 — Profigen do Brasil), substrato pra float (Agrinobre), Phytoagri e o creme
  // protetor da Protege Química. Cliente final: o produtor de tabaco. O negócio anda pelo CALENDÁRIO
  // DA SAFRA (semente e substrato antes da semeadura; creme na colheita), então o funil tem
  // "Próxima safra" no lugar de perda, e o follow-up é por época, não só por dias. Tudo aqui é
  // SUPOSIÇÃO pra ele aprovar ou corrigir; nada disso foi confirmado ainda.
  'w-prime-seeds': {
    hoje: [
      { id: 'como_vende', p: 'Como a venda acontece hoje?', tipo: 'multi', porque: 'Representação vende de jeitos diferentes. Saber o seu decide se o sistema organiza visita, conversa de WhatsApp ou pedido de revenda.', o: ['Visita na propriedade', 'WhatsApp com o produtor', 'Telefone', 'Pelas revendas/agropecuárias', 'Pela fumageira ou cooperativa', 'Dia de campo e eventos', 'Outro'], entra: 'etapas · agenda' },
      { id: 'regiao', p: 'Que região você atende? Municípios, ou até onde vai', porque: 'A IA precisa saber se atende a cidade de quem chama, e a agenda de visitas agrupa por região.', ph: 'Ex.: Vale do Rio Pardo, Centro-Serra, até Candelária…', entra: 'atendimento · agenda' },
      { id: 'integrado', p: 'Os produtores que compram de você são integrados a alguma fumageira? Isso muda a compra?', porque: 'Produtor integrado muitas vezes recebe insumo pela empresa. Entender isso muda o argumento de venda e quem decide.', entra: 'qualificação · argumento' },
      { id: 'pedidos_hoje', p: 'Onde ficam hoje os pedidos e a lista de clientes? (caderno, planilha, sistema da representada…)', porque: 'É o que a gente traz pro CRM no primeiro dia, pra ninguém começar do zero.', entra: 'importação' },
    ],
    etapas: [
      { id: 'e1', p: 'Novo contato', tipo: 'valida', prop: 'Chegou pelo Instagram, indicação, dia de campo ou visita. <b>Quem responde primeiro na época da semeadura leva.</b>', entra: 'etapas' },
      { id: 'e2', p: 'Qualificação', tipo: 'valida', prop: 'O que planta (Virgínia, Burley…), quantos pés ou estufas, município, quando semeia, se é integrado e a qual empresa. A IA pode perguntar isso sozinha.', entra: 'etapas' },
      { id: 'e3', p: 'Visita marcada', tipo: 'valida', prop: 'Ir na propriedade mostrar a semente, o substrato, o creme. Entra na agenda, com lembrete no dia anterior.', entra: 'etapas · agenda' },
      { id: 'e4', p: 'Orçamento enviado', tipo: 'valida', prop: 'Quantidade e valor na mão do produtor. Esperando resposta, com lembrete.', entra: 'etapas' },
      { id: 'e5', p: 'Negociação', tipo: 'valida', prop: 'Prazo, forma de pagamento (à vista, na safra), entrega. Aqui é gente, não IA.', entra: 'etapas' },
      { id: 'e6', p: 'Pedido fechado — entregar', tipo: 'valida', prop: 'Fechou: separar, entregar, cobrar. Sai do funil de venda e entra no "depois da venda".', entra: 'etapas' },
      { id: 'e7', p: 'Próxima safra', tipo: 'valida', prop: 'Já comprou neste ano, ou ainda não é época. <b>Não é perda</b>: o sistema traz de volta antes da próxima semeadura.', entra: 'etapas' },
      { id: 'e8', p: 'Perdido', tipo: 'valida', prop: 'Comprou de outro ou parou de plantar. Fica guardado com o motivo, e volta na próxima safra.', entra: 'etapas' },
    ],
    produtos: [
      { id: 'prod', p: 'Os produtos que vimos no seu Instagram', tipo: 'valida', prop: 'Sementes de tabaco (híbridos Virgínia, como o PVH2444 — Profigen) · Substrato pra float (Agrinobre) · Produtos Phytoagri · Creme protetor pra colheita (Protege Química). <b>Confirma, corrige e completa</b>: o que mais você representa, e o preço ou a faixa de cada um.', entra: 'produtos' },
    ],
    qualifica: [
      { id: 'q_semente', p: 'Semente — o que perguntar antes de orçar', tipo: 'valida', prop: 'Tipo de tabaco (Virgínia, Burley, Comum) · quantos pés ou estufas · município · quando faz a semeadura · usa float? · é integrado? a qual empresa · já usou a variedade?', entra: 'qualificação' },
      { id: 'q_substrato', p: 'Substrato', tipo: 'valida', prop: 'Quantas bandejas · qual substrato usa hoje · quando monta o float · precisa de entrega?', entra: 'qualificação' },
      { id: 'q_creme', p: 'Creme protetor', tipo: 'valida', prop: 'Quantas pessoas trabalham na colheita · quando começa a colher · já usa alguma proteção?', entra: 'qualificação' },
    ],
    followup: [
      { id: 'c1', p: 'Novo contato', tipo: 'valida', entra: 'cadência', toques: [T('na hora', 'responder e perguntar o que planta e quantos pés'), T('+2h', 'segunda mensagem, se não respondeu'), T('fim do dia', 'sem resposta: a IA assume o follow-up')] },
      { id: 'c4', p: 'Orçamento enviado', tipo: 'valida', entra: 'cadência', toques: [T('D+1', '"conseguiu ver? quer que eu passe aí?"', 'tpl'), T('D+3', 'responder a dúvida mais comum', 'tpl'), T('D+7', 'última, lembrando a época da semeadura', 'tpl')] },
      { id: 'c7', p: 'Próxima safra', tipo: 'valida', entra: 'cadência', toques: [T('antes da semeadura', 'semente e substrato: "vai semear quando? já separo o teu"', 'tpl'), T('antes da colheita', 'creme protetor pra quem colhe', 'tpl'), T('depois da colheita', '"como foi a safra?" + indicação', 'tpl')] },
      { id: 'c8', p: 'Perdido', tipo: 'valida', entra: 'cadência', toques: [T('na próxima safra', 'convite pra orçar de novo, mesmo quem comprou de outro', 'tpl')] },
    ],
    depois: [
      { id: 'r1', p: 'Pedido entregue', tipo: 'valida', entra: 'roteiro', toques: [T('na entrega', 'confirmação + orientação de uso do fabricante'), T('D+15', '"como tá a germinação / as mudas?"', 'tpl'), T('na colheita', 'oferta do creme protetor', 'tpl'), T('fim da safra', '"como foi?" + começa a próxima', 'tar')] },
    ],
    ia: [
      { id: 'ia_agro', p: 'Recomendação técnica', tipo: 'valida', prop: 'A IA <b>nunca</b> recomenda dose, mistura ou aplicação de produto, nem diagnostica problema na lavoura ou na muda: isso <b>passa pra você na hora</b>. Ela colhe a informação (foto, o que está acontecendo, desde quando) pra você já chegar sabendo.', entra: 'travas da IA' },
      { id: 'ia_travas', p: 'Travas', tipo: 'valida', prop: 'A IA <b>nunca</b>: promete produtividade ou resultado de safra · dá desconto ou prazo fora do combinado · fala mal de outra semente ou de outra empresa · passa preço que não esteja no cadastro.', entra: 'travas da IA' },
    ],
    teste: [
      '"Oi, tem a semente PVH2444? Quanto fica?"',
      '"Qual substrato é melhor pro float?"',
      '"Minhas mudas tão amarelando, o que eu faço?"',
      '"Vocês entregam lá no interior de Candelária?"',
      '"Dá pra pagar na safra?"',
      '"Pra que serve esse creme protetor?"',
      '"A fumageira já me dá a semente, por que eu compraria de vocês?"',
      '"Me manda o preço que eu vejo com meu sogro"',
    ],
  },
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
  if (pr?.somente?.length) return pr.somente
  return MODELO.map(b => {
    const extra = pr ? (pr as any)[b.id] as Pergunta[] | undefined : undefined
    if (b.id === 'teste') {
      const falas = pr?.teste || []
      return { ...b, perguntas: falas.map((f, n) => ({ id: 't' + (n + 1), p: f, tipo: 'teste' as Tipo, entra: 'o que responder' })) }
    }
    return extra?.length ? { ...b, perguntas: [...extra, ...b.perguntas] } : b
  }).filter(b => b.perguntas.length > 0)
}

/** Este questionário mostra só as perguntas do cliente (sem o modelo genérico)? */
export const soDoCliente = (slug: string) => !!PROPOSTAS[slug]?.somente?.length
