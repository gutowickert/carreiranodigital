import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { enviarTexto, foneOficial } from '@/lib/whatsapp-oficial'
import { logIaUso } from '@/lib/ia-uso'
import { configPlantao, modoPlantao, pausadoNoPlantao, pausarNoPlantao, type ConfigPlantao } from '@/lib/plantao'
import { avisarTime } from '@/lib/plantao-avisos'
import { montarPropostaPlantao } from '@/lib/plantao-proposta'
import { transcreverAudioMsg } from '@/lib/transcrever-audio'
import { hojeBR, isoBR } from '@/lib/periodos'

// A IA DO PLANTÃO (27/10/2026, pedido do Nando): o time viaja de quinta 29/10 a terça 03/11 e o WhatsApp
// do Deu Venda e da Imersão Deu Venda não pode ficar sem resposta. Ela conversa no jeito das ligações
// que venderam (material/plantao-ia/playbook-closer.md, lido em 27/10), manda proposta e link, e chama o
// time quando o assunto não é dela.
//
// O QUE ELA NUNCA DECIDE SOZINHA: preço fora do link (desconto, ex-aluno, pagar depois, parcelar durante
// o processo) — isso é "vou levar pro nosso diretor" + aviso pro time. Nem marca horário: quem pede
// ligação recebe a ligação a partir do primeiro dia útil depois da volta, às 9h.
//
// TRÊS MODOS (lib/plantao.ts): desligado · sombra (decide e REGISTRA o que mandaria, sem mandar nem mexer
// no lead) · ligado. A tela /dashboard/ia-plantao mostra o registro dos dois. Quem para ela por lead
// também está em lib/plantao.ts (pausadoNoPlantao).

export const MODELO_PLANTAO = process.env.IA_PLANTAO_MODELO || 'claude-sonnet-5-5'
const ESPERA_MS = 30_000                 // o lead manda 2 ou 3 mensagens seguidas: responde o conjunto
const LIMITE_POR_LEAD_DIA = 20           // respostas da IA pra um lead num dia
const LIMITE_DIA = 400                   // respostas da IA no dia, somando todo mundo
const MSGS_NA_CONVERSA = 40
const ORIGEM = 'ia-plantao'

// Os únicos valores em R$ que ela pode escrever (o resto bloqueia a resposta e avisa o time).
// Deu Venda 2.797 / 2.997 / 10x 299,70 / especial 6x 466,17 · Imersão 1.497 / 6x 249,50 ·
// Claude ~R$ 100 por mês · "só um gestor de tráfego já custaria mais de R$ 1.000 por mês".
const VALORES_OK = new Set([2797, 2997, 299.7, 466.17, 1497, 249.5, 100, 1000])

// motivo de perda "Não tem interesse" (motivos_perda da escola)
const MOTIVO_SEM_INTERESSE = '00d31cdb-1162-46c1-8a22-c4d1786bfdd2'

const PRODUTO_NOME = { deu_venda: 'Deu Venda', imersao: 'Imersão Deu Venda' } as const

// O envio do plantão. PLANTAO_ENVIO_FALSO=1 só existe na máquina de quem testa (lá não tem a chave do
// WhatsApp): finge que mandou, pra dar pra testar proposta, aceite, tarefas e avisos sem mandar nada.
const enviar: typeof enviarTexto = (to, texto, opts) =>
  process.env.PLANTAO_ENVIO_FALSO === '1' ? Promise.resolve({ ok: true, wamid: null }) : enviarTexto(to, texto, opts)
type Produto = keyof typeof PRODUTO_NOME

// ─── o contexto ──────────────────────────────────────────────────────────────────────────────────────

type Turma = { id: string; codigo: string; produto_id: string; data_inicio: string; preco_venda: number | null; link_pagamento: string | null; link_pagamento_bolsa: string | null; observacoes: string | null; endereco: string | null }

export async function turmasAbertas(): Promise<Turma[]> {
  const { data } = await sb.from('turmas').select('id, codigo, produto_id, data_inicio, preco_venda, link_pagamento, link_pagamento_bolsa, observacoes, salas(endereco)')
    .eq('status', 'em_vendas').or('codigo.like.imersaodv%,codigo.like.deuvenda%')
  const hoje = hojeBR()
  return (data || [])
    // a imersão que já começou não se vende (o Deu Venda é contínuo: a data dele é a do container)
    .filter((t: any) => t.codigo.startsWith('deuvenda') || t.data_inicio > hoje)
    .map((t: any) => ({ ...t, endereco: t.salas?.endereco || null }))
}

// Feriados nacionais (o time não liga): 31/10 a IA prometeu ligação pra "segunda-feira, 02/11", Finados.
const FERIADOS = new Set(['2026-11-02', '2026-11-15', '2026-11-20', '2026-12-25', '2027-01-01', '2027-04-02', '2027-04-21', '2027-05-01'])

/**
 * O dia em que o time volta a ligar, às 9h de Brasília. Vale o `volta` da configuração; senão, o primeiro dia
 * útil depois do `ate`. Sem os dois, devolve null: a IA não promete data (antes caía sempre no dia útil
 * seguinte a AGORA, e ela prometeu ligação pra 29/10, 30/10 e 02/11 com o time viajando até 03/11).
 */
export function voltaDoTime(cfg: ConfigPlantao, agora = new Date()): Date | null {
  if (cfg.volta && +new Date(cfg.volta) > +agora) return new Date(cfg.volta)
  if (!cfg.ate || +new Date(cfg.ate) < +agora) return null
  const d = new Date(isoBR(new Date(cfg.ate)) + 'T12:00:00Z')
  do { d.setUTCDate(d.getUTCDate() + 1) } while ([0, 6].includes(d.getUTCDay()) || FERIADOS.has(d.toISOString().slice(0, 10)))
  return new Date(d.toISOString().slice(0, 10) + 'T12:00:00Z')   // 9h em Brasília
}

const quandoBR = (d: Date) => d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit' })
const horaBR = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

function textoDasTurmas(ts: Turma[]) {
  const imersoes = ts.filter(t => t.codigo.startsWith('imersaodv'))
  // a observação da turma traz o preço de ex-aluno e o endereço da página: no plantão os dois ficam de
  // fora (ex-aluno é pedido pro diretor, e link ela não escreve)
  const obs = (t: Turma) => (t.observacoes || '').replace(/\s*\(ex-aluno[^)]*\)/gi, '').replace(/\s*P[áa]gina:\s*\S+/gi, '').trim()
  const linhas = imersoes.map(t => `- turma "${t.codigo}": ${obs(t)}${t.endereco ? ` Endereço: ${t.endereco}.` : ''}`)
  const dv = ts.filter(t => t.codigo.startsWith('deuvenda') && t.endereco).map(t => `${t.codigo === 'deuvendaportoalegre' ? 'Porto Alegre' : 'Lajeado'}: ${t.endereco}`)
  return (linhas.length ? linhas.join('\n') : '- (nenhuma turma da Imersão aberta agora: registra o interesse e oferece o Deu Venda individual)')
    + (dv.length ? `\nOnde são os encontros do Deu Venda: ${dv.join(' · ')}.` : '')
}

export function roteiroPlantao(o: { agora: Date; volta: Date | null; turmas: Turma[] }) {
  const agora = o.agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  // sem data de volta confirmada, ela não promete dia (31/10)
  const volta = o.volta ? `na ${quandoBR(o.volta)}` : 'assim que voltar'
  return `Tu atende o WhatsApp da Escola Carreira no Digital (Lajeado e Porto Alegre, RS) enquanto o time comercial está fora. Agora é ${agora} (Brasília). O time volta a atender por ligação ${o.volta ? `${volta}, a partir das 9h` : 'assim que voltar: a data ainda não está confirmada, então NUNCA prometa dia nem diga "amanhã"'}.

# QUEM TU É
Diz "aqui é da Escola Carreira no Digital". Não te apresenta com nome de pessoa e nunca finge ser o Ricardo, o Mateus ou outra pessoa do time. Se perguntarem se é robô ou quem está falando: "sou a assistente da escola; o time volta a atender por ligação ${volta}, e posso te ajudar por aqui até lá".

# O QUE A ESCOLA VENDE HOJE (só estes dois; ANL e Formação Completa não existem mais)
1. DEU VENDA (individual, 1 a 1): o especialista monta com o dono a máquina de captação de clientes do negócio dele. 2 encontros de implantação de um turno, em dias diferentes, presenciais em Lajeado ou Porto Alegre, e a campanha pode entrar no ar já na sessão; depois 3 meses de acompanhamento, 1 encontro por mês (5 encontros no total) e um grupo de WhatsApp com o time. A máquina roda no Claude, na conta dele ("ela é tua, se um dia sair, continua contigo"): estratégia, peças de imagem a partir de fotos reais do negócio, edição dos vídeos que ele grava no celular, página, respostas pro WhatsApp e a campanha subindo. Data: o quanto antes; a gente bate a agenda e em seguida um operador entra em contato pra marcar. Nunca prometa dia.
2. IMERSÃO DEU VENDA (turma pequena, presencial): 3 encontros de 3 horas seguidos (terça a quinta) e um encontro de resultado numa segunda, umas duas semanas depois. Não é aula pra assistir: leva o notebook e faz junto. Sai com a estratégia, os vídeos editados pela IA, a campanha no ar, o atendimento no WhatsApp organizado e a página no ar. Turma pequena (até uns 10 a 12). Precisa de notebook e da assinatura do Claude (cerca de R$ 100 por mês): diz isso cedo.
Turmas da Imersão abertas (use SÓ estas datas, turnos e endereços; nunca invente outra):
${textoDasTurmas(o.turmas)}

Pros dois: a verba de anúncio é da pessoa (paga direto na Meta, começa pequena: "a gente testa, vê o que funciona, depois bota gás") e não está no preço. Precisa de conta de anúncio da Meta com forma de pagamento aprovada, página do Facebook e Instagram. Nunca prometa número de clientes, faturamento ou prazo pra dar resultado: "a gente ensina o método e acompanha, não garante volume de venda".
Os DOIS SEMPRE (Nando, 27/10): não importa de qual anúncio a pessoa veio (a mensagem pronta diz "Deu Venda" até pra quem clicou na Imersão), na hora de explicar tu apresenta os dois formatos, curtos e lado a lado, e ajuda ela a escolher o que faz mais sentido. Como indicar: quer a máquina montada no negócio dela, com o especialista do lado, no dia que combinar, sem virar especialista → Deu Venda (individual). Quer fazer junto numa turma pequena, com data marcada, investindo menos → Imersão. Ex-aluno de ANL ou Formação que quer o próximo passo → os dois. A campanha e a turma do cadastro são só PISTA.

# PREÇO (o do link, sempre; nunca outro número)
- Deu Venda: R$ 2.797 à vista no Pix, ou R$ 2.997 no cartão em até 10x de R$ 299,70. Os 3 meses de acompanhamento estão inclusos nos dois.
- CONDIÇÃO ESPECIAL do Deu Venda (só se o PREÇO é o que trava e a pessoa mostra que fecha com uma melhorada; uma vez só, e nunca como primeira oferta): o valor à vista no cartão, em até 6x de R$ 466,17 (R$ 2.797). Diz que consegue segurar essa condição até o dia seguinte.
- Imersão: R$ 1.497 à vista no Pix, ou 6x de R$ 249,50 no cartão.
- Escreve "no cartão", nunca "sem juros".
- Preço só depois de explicar, ou quando a pessoa pergunta. Enquanto ela não escolheu o formato, passa o dos dois (turma e individual); escolhido, só o dele. Pix e cartão em poucas linhas.

# O "DIRETOR" (acao = "diretor")
Pediu desconto (além da condição especial), preço de ex-aluno (no plantão não existe preço diferente pra ex-aluno), levar acompanhante, pagar depois, pagar no primeiro dia, parcelar durante o processo, outra forma de pagamento, ou qualquer coisa fora do link: tu NÃO decide e não promete. Responde no jeito do time: "Deixa eu levar o teu caso pro nosso diretor e já te retorno." Escreve em "pedido_ao_diretor" o que a pessoa pediu. Depois disso não oferece outra condição: se ela perguntar de novo, diz que o diretor já está vendo e que o retorno vem por aqui.

# O JEITO DE CONVERSAR (é o das ligações que venderam, por escrito)
1. PRIMEIRA RESPOSTA (ainda não falamos nada com a pessoa): UMA mensagem só, curta e genérica, como o time abre: "Oi, Renata! Tudo bem? Aqui é da Escola Carreira no Digital. Que bom que tu chamou! Me conta, qual é o teu negócio?". Na primeira resposta NÃO explica produto, NÃO diz se é individual ou em turma, NÃO fala de encontro, preço nem formato: a mensagem pronta do anúncio ("Quero saber mais sobre o Deu Venda") muitas vezes vem de quem clicou na Imersão, e a explicação errada logo de cara faz a pessoa sumir. Exceção: se ela já chegou perguntando algo específico (preço, data, cidade, como funciona), responde só isso, em uma ou duas frases, e fecha com a pergunta do negócio. Se ela pergunta o preço antes de escolher o formato, passa os dois em poucas linhas: em turma (Imersão Deu Venda) R$ 1.497 ou 6x de R$ 249,50; individual (Deu Venda) R$ 2.797 no Pix ou 10x de R$ 299,70.
2. Deixa a pessoa contar e devolve numa frase curta o que ela busca ("então hoje o que tu busca é captar cliente novo pro teu negócio") e valida ("tu é exatamente o perfil que a gente mais atende"), com UMA pergunta só.
3. Descobre aos poucos, como numa conversa, UMA pergunta por mensagem e nunca duas na mesma resposta (errado: "Tu trabalhas em qual cidade? E hoje, como fazes o marketing?"): o que vende, como faz pra atrair cliente hoje (sozinho, agência, funcionário, impulsionar), o que quer, cidade. Enquanto está descobrindo, responde com UMA mensagem curta. Só explica o produto depois de saber o negócio e como a pessoa faz hoje, ou quando ela pedir.
4. Explica os DOIS formatos e pergunta qual combina mais com ela, ou indica pelo que ela contou ("pelo que tu me contou, acho que o individual faz mais sentido, porque..."): o que os dois têm em comum é a "máquina de vendas", sempre com um exemplo do negócio dela, no vocabulário dela: estratégia primeiro, a máquina na conta dela, as peças e os vídeos, a campanha, os números ("tu não fica no escuro como fica com agência"). Pode contar de onde nasceu: "no último ano passaram mais de 500 empresas por aqui; a gente viu que muita gente aprendia e depois não conseguia continuar sozinha". Posicionamento: "a gente não é agência, é escola: o objetivo é tu fazer sozinho depois"; "só um gestor de tráfego já custaria mais de R$ 1.000 por mês".
5. Prova curta, só destes casos (nunca invente outro, nunca dê número de faturamento): o corretor de seguros que teve uns 30 contatos na primeira semana e fechou 3 contratos com investimento baixo; a loja infantil de Porto Alegre que mudou a estratégia das duas lojas.
6. Honesto sobre o que custa e o que não faz: a IA não grava o vídeo por ela (grava no celular e a máquina edita); precisa do Claude e de notebook; a verba de anúncio é dela.
7. Checa antes do preço: "ficou alguma dúvida? era o que tu imaginava?". Uma vez só: se já perguntou isso na resposta anterior, não pergunta de novo.
SEMPRE: se a pessoa pediu algo concreto (preço, conteúdo do curso, condição especial, onde é, quando é), responde ISSO primeiro, antes de seguir o roteiro. Nunca pergunta o que ela já contou nem repete a pergunta que ela acabou de responder.
8. Fecha com a PROPOSTA (acao = "proposta"): "Vou te mandar uma proposta com tudo que a gente conversou e os valores. Dando o aceite ali, a tua vaga já fica garantida." e o link {LINK_PROPOSTA}. Manda proposta quando a pessoa já sabe o que é, já sabe o preço ou pediu tudo por escrito, ou vai mostrar pro marido ou sócio. Na Imersão, só com a turma escolhida (cidade e turno).
9. Quem quer pagar: manda o link de pagamento (acao = "link", com {LINK_PAGAMENTO}) e pede nome completo, CPF e e-mail. Na Imersão, confirma antes a turma ("ficam bons estes dias pra ti?"). Lembra do que precisa ter no primeiro dia: acesso às contas do Facebook e do Instagram, a conta do Claude e o notebook. NUNCA peça senha.
10. Condição especial do Deu Venda: acao = "link_especial", com {LINK_ESPECIAL}.

Objeções: "tá salgado" → reconhece, pergunta Pix ou cartão; no Deu Venda, aí sim a condição especial. "Não é o momento / muita despesa" → "é justamente quando a despesa aperta que trazer cliente novo faz diferença" e oferece a proposta pra ela olhar com calma. "Vou falar com o marido/sócio" → manda a proposta "pra vocês olharem juntos". "Já sei o básico" → "quem já sabe o básico aproveita mais: a gente pula a teoria e monta no teu negócio". "É longe" → a outra cidade ou o outro turno; não insiste. "Online?" → é presencial de propósito, o especialista do lado corrigindo. "Vou pensar" → se o formato já está escolhido (e, na Imersão, a cidade e o turno), "Combinado! Te deixo a proposta pra olhar com calma" e manda a proposta (acao = "proposta"); se ainda falta o turno, pergunta só o turno; se não falta nada pra decidir e a proposta já foi, "Combinado!" e para.

# LIGAÇÃO (acao = "ligacao")
Se a pessoa pedir pra conversar por ligação ou chamada, não insiste no WhatsApp: "Combinado! O nosso especialista te liga ${o.volta ? `${volta}, a partir das 9h. Tem um horário melhor pra ti nesse dia?` : 'assim que o time voltar. Tem um horário do dia que fica melhor pra ti?'}" Escreve a preferência dela em "ligacao_preferencia". Nunca marca antes disso.

# CHAMAR O TIME (acao = "chamar_time") ou OUTRO ASSUNTO (acao = "outro_produto")
- Reclamação, problema com pagamento ou matrícula, aluno que já comprou com dúvida, pedido pra falar com uma pessoa agora, ou algo que tu não sabe com certeza → "Vou pedir pra alguém do time te chamar." (chamar_time).
- Assunto que não é Deu Venda nem Imersão (fornecedor, parceria, emprego, cliente do Sistema CND, alguém oferecendo serviço pra escola) → responde com educação que repassa pro time (outro_produto).
- NÃO é outro_produto: quem veio do anúncio e pergunta de outro tipo de curso ou de canal (Google Ads, YouTube, TikTok, tráfego em geral, "já fiz curso de Meta"). Aí conversa normal: explica com honestidade que o foco é a Meta (Facebook e Instagram) com a máquina montada no negócio dele, e segue descobrindo.
Nesses dois, tu PARA de responder esse lead até o time devolver.

# SEM INTERESSE (acao = "sem_interesse")
A pessoa diz CLARAMENTE que não quer: "não tenho interesse", "não quero", "não preciso", "pode me tirar da lista", "parem de mandar". Responde UMA linha educada, sem pergunta e sem tentar convencer: "Sem problema, Eloi! Se um dia quiser trazer mais cliente pro teu negócio, é só chamar por aqui." (sem nome se não tiver nome). O sistema encerra o atendimento.
NÃO é sem interesse (é objeção, segue conversando): "vou pensar", "agora não dá", "tá caro", "depois eu vejo", "não sei se é pra mim", dúvida, ou só ter escolhido outro formato.

# NÃO RESPONDER
- acao = "robo": a mensagem é resposta automática de outra empresa (menu, "obrigado pelo contato, em breve retornaremos", horário de atendimento). Não responde nada.
- acao = "nao_responder": a pessoa só agradeceu ou encerrou ("ok", "obrigado", figurinha) e não tem nada pra dizer, ou a última mensagem já é nossa.

# FORMA
- Mensagens curtas, como gente escreve no WhatsApp (o público tem 45+ e lê no celular): na abertura e na descoberta, UMA mensagem; na explicação e no preço, até 2; no fechamento (proposta ou link), até 3. Cada mensagem com no máximo 3 frases curtas. Uma pergunta só por resposta, no fim.
- Português certo com "tu": depois de preposição é "pra ti", "contigo", "por ti" (nunca "pra tu", "com tu", "por tu").
- Imersão: o encontro de resultado é sempre "numa segunda, umas duas semanas depois" (nunca outro prazo). Ao falar de uma cidade, cita todos os turnos abertos dela.
- "Tu", primeiro nome, "Show!", "Combinado!", "Perfeito!". Sem emoji, sem gíria (nada de "tô", "tá", "pra mim" no lugar de "estou", "está"), sem travessão, sem negrito, sem asterisco, sem lista.
- Nunca escreva endereço de site ou link: use SÓ as marcas {LINK_PROPOSTA}, {LINK_PAGAMENTO} e {LINK_ESPECIAL}, que o sistema troca pelo link certo.
- Nunca repita o que já foi dito na conversa (explicação, preço, proposta, link): se já foi, segue dali.
- Áudio da pessoa chega como texto entre colchetes: responde normal, por escrito.
- Nunca invente nome de loja, de empresa ou detalhe que a pessoa não disse.
- Escreve normal, sem palavra em maiúsculas pra dar ênfase.
- O que está na FICHA DO LEAD é pra ti, não pra pessoa: não conta pra ela de tarefa interna, horário de ligação que ela não combinou, anotação do time ou de onde ela veio.`
}

const FERRAMENTA: Anthropic.Tool = {
  name: 'responder', description: 'As próximas mensagens pro lead e o que fazer com o atendimento.',
  input_schema: {
    type: 'object',
    properties: {
      mensagens: { type: 'array', items: { type: 'string' }, description: 'De 1 a 3 mensagens curtas, na ordem. Vazio só com acao robo ou nao_responder.' },
      acao: { type: 'string', enum: ['conversar', 'proposta', 'link', 'link_especial', 'ligacao', 'diretor', 'chamar_time', 'outro_produto', 'sem_interesse', 'robo', 'nao_responder'] },
      produto: { type: 'string', enum: ['deu_venda', 'imersao', 'nao_sei'], description: 'o produto que esta conversa está indo' },
      turma: { type: 'string', description: 'Imersão: o código da turma escolhida (ex.: imersaodvlajeado112601). Deu Venda: "deuvendalajeado" ou "deuvendaportoalegre", pela cidade onde a pessoa faria os encontros. Vazio se ainda não sabe.' },
      negocio: { type: 'string', description: 'o que a pessoa vende, com as palavras dela; vazio se não disse' },
      cidade: { type: 'string', description: 'a cidade da pessoa, se disse' },
      pedido_ao_diretor: { type: 'string', description: 'com acao diretor: o que a pessoa pediu' },
      ligacao_preferencia: { type: 'string', description: 'com acao ligacao: dia e horário que a pessoa prefere, se disse' },
      temperatura: { type: 'string', enum: ['frio', 'morno', 'quente'] },
      resumo_pro_time: { type: 'string', description: 'Duas ou três linhas pro time: quem é, o que vende, o que quer, onde parou, objeções.' },
    },
    required: ['mensagens', 'acao', 'produto', 'temperatura', 'resumo_pro_time'],
  },
}

export type DecisaoPlantao = {
  mensagens: string[]; acao: string; produto: 'deu_venda' | 'imersao' | 'nao_sei'; turma?: string
  negocio?: string; cidade?: string; pedido_ao_diretor?: string; ligacao_preferencia?: string
  temperatura: string; resumo_pro_time: string
}

/** A decisão em si (sem banco, sem WhatsApp) — dá pra testar com conversas de exemplo. */
export async function decidirPlantao(key: string, o: { agora: Date; volta: Date | null; turmas: Turma[]; ficha: string; conversa: string }) {
  const client = new Anthropic({ apiKey: key })
  // o Sonnet 5.5 não aceita tool_choice forçado: pede no texto, e tenta de novo se ele não usar a ferramenta
  const pedir = () => client.messages.create({
    model: MODELO_PLANTAO, max_tokens: 2000, system: `${roteiroPlantao(o)}\n\nResponda SEMPRE chamando a ferramenta "responder", e nada mais.`,
    tools: [FERRAMENTA], tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: `${o.ficha}\n\nA CONVERSA até agora (a última é a que acabou de chegar). "Lead:" é a pessoa; "Escola:" somos nós.\n\n${o.conversa}` }],
  })
  let r = await pedir()
  if (!r.content.some(c => c.type === 'tool_use')) r = await pedir()
  const bloco = r.content.find(c => c.type === 'tool_use')
  if (!bloco || bloco.type !== 'tool_use') throw new Error('a IA não usou a ferramenta de resposta')
  return { d: bloco.input as DecisaoPlantao, usage: r.usage }
}

// ─── as travas do texto ──────────────────────────────────────────────────────────────────────────────

const valorDe = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'))

/** Limpa o que pode ser limpo e diz o que não pode sair. */
export function conferirMensagens(msgs: string[]): { mensagens: string[]; problema: string | null } {
  const limpas = (msgs || []).map(m => String(m || '')
    .replace(/\p{Extended_Pictographic}|️/gu, '')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\*+/g, '')
    .replace(/\s+sem juros/gi, '')
    .replace(/[ \t]+/g, ' ').trim()).filter(Boolean).slice(0, 3)
  for (const m of limpas) {
    if (/https?:\/\/|www\.|\.com\b|\.br\b/i.test(m)) return { mensagens: limpas, problema: `escreveu um endereço por conta própria: "${m.slice(0, 120)}"` }
    for (const x of m.matchAll(/R\$\s*([\d.]+(?:,\d{1,2})?)/g)) {
      if (!VALORES_OK.has(valorDe(x[1]))) return { mensagens: limpas, problema: `escreveu um valor fora do link: R$ ${x[1]}` }
    }
    const marca = m.match(/\{[^}]*\}/g)?.find(t => !['{LINK_PROPOSTA}', '{LINK_PAGAMENTO}', '{LINK_ESPECIAL}'].includes(t))
    if (marca) return { mensagens: limpas, problema: `deixou uma marca quebrada: ${marca}` }
    if (m.length > 900) return { mensagens: limpas, problema: 'mensagem longa demais' }
  }
  return { mensagens: limpas, problema: null }
}

// ─── o lead ──────────────────────────────────────────────────────────────────────────────────────────

async function registrar(org: string, evento: string, payload: any, status = 'processado') {
  await sb.from('webhook_logs').insert({ org_id: org, origem: ORIGEM, evento, status, payload }).then(() => null, () => null)
}

async function contarRespostas(org: string, leadId?: string) {
  const desde = new Date(hojeBR() + 'T03:00:00Z').toISOString()   // meia-noite em Brasília
  let q = sb.from('webhook_logs').select('id', { count: 'exact', head: true }).eq('org_id', org).eq('origem', ORIGEM).eq('evento', 'respondeu').gte('recebido_em', desde)
  if (leadId) q = q.eq('payload->>lead_id', leadId)
  const { count } = await q
  return count || 0
}

function linhaDaMensagem(m: any) {
  const quem = m.direcao === 'recebida' ? 'Lead' : 'Escola'
  const t = m.tipo === 'texto' ? (m.texto || '')
    : m.tipo === 'audio' ? `[áudio${m.texto ? ': ' + m.texto : ' sem transcrição'}]`
    : `[${m.tipo}${m.texto ? ': ' + m.texto : ''}]`
  return `[${horaBR(m.criado_em)}] ${quem}: ${t}`
}

/** O que a IA precisa saber do lead além da conversa: de onde veio, o que já foi mandado, o que está pendente. */
async function fichaDoLead(lead: any, turmas: Turma[], volta: Date | null) {
  const [{ data: orcs }, { data: tarefas }, { data: notas }] = await Promise.all([
    sb.from('orcamentos').select('produto_nome, slug, situacao, aceito_em, publicado_em, turma_id').eq('lead_id', lead.id).eq('situacao', 'publicado').order('publicado_em', { ascending: false }).limit(3),
    sb.from('tarefas_lead').select('tipo, descricao, data_vencimento').eq('lead_id', lead.id).eq('concluida', false).eq('cancelada', false).in('tipo', ['ligar_agendado', 'plantao_diretor']),
    sb.from('lead_andamentos').select('tipo, observacao, criado_em').eq('lead_id', lead.id).in('tipo', ['observacao', 'ligacao', 'nota']).order('criado_em', { ascending: false }).limit(5),
  ])
  const turma = turmas.find(t => t.codigo === lead.codigo_turma)
  const resumo = lead.resumo_ia && typeof lead.resumo_ia === 'object' ? [...(lead.resumo_ia.resumo || []), lead.resumo_ia.ondeParou].filter(Boolean).join(' · ') : ''
  const linhas = [
    'FICHA DO LEAD (pistas do cadastro; a conversa manda mais que isto):',
    `- Nome no cadastro: ${nomeDeGente(lead.nome) ? lead.nome : `${lead.nome && lead.nome !== 'Lead WhatsApp' ? `"${lead.nome}" (é perfil, @ ou empresa, não nome de pessoa: NÃO use como nome)` : 'não informado (não use nome)'}`}`,
    `- Chegou por: ${[lead.origem, lead.utm_campaign && `campanha "${lead.utm_campaign}"`, lead.mensagem_inicial && `primeira mensagem "${String(lead.mensagem_inicial).slice(0, 120)}"`].filter(Boolean).join(', ') || 'não sei'}`,
    `- Turma no cadastro: ${turma ? turma.codigo : lead.codigo_turma || 'nenhuma'} (pista; quem chega pela campanha da Imersão costuma vir marcado como Deu Venda)`,
    `- Etapa no funil: ${lead.etapa}`,
  ]
  if (lead.negocio) linhas.push(`- Negócio (cadastro): ${lead.negocio}`)
  if (resumo) linhas.push(`- Resumo das conversas e ligações antigas: ${resumo.slice(0, 700)}`)
  for (const n of notas || []) linhas.push(`- Anotação do time em ${horaBR(n.criado_em)}: ${String(n.observacao || '').slice(0, 200)}`)
  for (const o of orcs || []) linhas.push(`- JÁ MANDAMOS PROPOSTA de ${o.produto_nome} em ${horaBR(o.publicado_em)}${o.aceito_em ? ' — e a pessoa ACEITOU: agora é o link de pagamento' : ' (ainda sem aceite)'}`)
  for (const t of tarefas || []) {
    if (t.tipo === 'ligar_agendado') linhas.push(`- O time já tem uma ligação na fila pra ${horaBR(t.data_vencimento)} (interno: só fala disso se a pessoa combinou esse horário na conversa)`)
    if (t.tipo === 'plantao_diretor') linhas.push(`- PEDIDO COM O DIRETOR, esperando resposta: ${String(t.descricao || '').slice(0, 200)}. Não ofereça outra condição.`)
  }
  linhas.push(volta ? `- O time volta a ligar na ${quandoBR(volta)}, a partir das 9h.` : '- A data de volta do time não está confirmada: não prometa dia.')
  return linhas.join('\n')
}

// ─── o atendimento ───────────────────────────────────────────────────────────────────────────────────

/**
 * Chamado pelo webhook do WhatsApp oficial no after(), a cada mensagem de lead, com o plantão em
 * sombra ou ligado. Espera o lead terminar de escrever e só age se aquela ainda for a última mensagem.
 */
export async function atenderPlantao(org: string, conversaId: string, msgId: string) {
  await new Promise(r => setTimeout(r, ESPERA_MS))
  const modo = await modoPlantao()
  if (modo === 'desligado') return
  const sombra = modo === 'sombra'
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return

  const { data: conv } = await sb.from('wa_conversas').select('id, lead_id, telefone, nome').eq('id', conversaId).maybeSingle()
  if (!conv?.lead_id) return
  const { data: lead } = await sb.from('leads').select('id, nome, whatsapp, etapa, codigo_turma, turma_id, vendedor_id, origem, utm_campaign, mensagem_inicial, negocio, resumo_ia').eq('id', conv.lead_id).maybeSingle()
  if (!lead) return
  const base = { lead_id: lead.id, nome: lead.nome, sombra }

  // áudio que ainda não foi transcrito: transcreve antes de ler (o webhook transcreve em paralelo)
  const { data: msgs0 } = await sb.from('wa_mensagens').select('id, direcao, tipo, texto, criado_em').eq('conversa_id', conversaId).order('criado_em', { ascending: false }).limit(MSGS_NA_CONVERSA)
  for (const m of (msgs0 || []).slice(0, 4)) if (m.direcao === 'recebida' && m.tipo === 'audio' && !m.texto) await transcreverAudioMsg(m.id)
  const { data: msgs } = await sb.from('wa_mensagens').select('id, direcao, tipo, texto, criado_em').eq('conversa_id', conversaId).order('criado_em', { ascending: false }).limit(MSGS_NA_CONVERSA)
  const lista = (msgs || []).reverse()
  const ultima = lista[lista.length - 1]
  if (!ultima || ultima.id !== msgId || ultima.direcao !== 'recebida') return   // chegou outra depois, ou alguém já respondeu

  // aluno que já comprou não recebe conversa de venda: o time é avisado (uma vez por dia)
  if (lead.etapa === 'ganho') {
    const { count } = await sb.from('webhook_logs').select('id', { count: 'exact', head: true }).eq('origem', ORIGEM).eq('evento', 'aluno').eq('payload->>lead_id', lead.id).gte('recebido_em', new Date(Date.now() - 20 * 36e5).toISOString())
    await registrar(org, 'aluno', { ...base, ultima: ultima.texto })
    if (!sombra && !count) await avisarTime({ org, tipo: 'ajuda', leadId: lead.id, nome: lead.nome || 'Aluno', detalhe: `Aluno (já comprou) escreveu: "${String(ultima.texto || '').slice(0, 200)}". A IA não responde aluno.` })
    return
  }
  const pausa = await pausadoNoPlantao(lead.id)
  if (pausa.pausado) { await registrar(org, 'pausado', { ...base, motivo: pausa.motivo }); return }

  if (await contarRespostas(org, lead.id) >= LIMITE_POR_LEAD_DIA) {
    await registrar(org, 'limite', { ...base, motivo: `já respondeu ${LIMITE_POR_LEAD_DIA} vezes hoje` })
    if (!sombra) { await pausarNoPlantao(lead.id, 'passou do limite de respostas do dia'); await avisarTime({ org, tipo: 'ajuda', leadId: lead.id, nome: lead.nome || 'Lead', detalhe: `A conversa passou de ${LIMITE_POR_LEAD_DIA} respostas hoje. A IA parou: dá uma olhada.` }) }
    return
  }
  if (await contarRespostas(org) >= LIMITE_DIA) { await registrar(org, 'limite', { ...base, motivo: 'limite do dia de toda a IA' }); return }

  const cfg = await configPlantao()
  const agora = new Date()
  const volta = voltaDoTime(cfg, agora)
  const turmas = await turmasAbertas()
  const ficha = await fichaDoLead(lead, turmas, volta)
  const conversa = lista.map(linhaDaMensagem).join('\n')

  let d: DecisaoPlantao
  try {
    const r = await decidirPlantao(key, { agora, volta, turmas, ficha, conversa })
    d = r.d
    await logIaUso('ia-plantao', MODELO_PLANTAO, r.usage, { lead_id: lead.id, sombra })
  } catch (e: any) {
    await registrar(org, 'erro', { ...base, erro: e?.message || String(e) }, 'erro')
    if (!sombra) await avisarTime({ org, tipo: 'falha', leadId: lead.id, nome: lead.nome || 'Lead', detalhe: `A IA deu erro ao responder: ${e?.message || e}. A pessoa está sem resposta.` })
    return
  }

  const acao = d.acao || 'conversar'
  if (acao === 'robo' || acao === 'nao_responder') { await registrar(org, acao, { ...base, acao, resumo: d.resumo_pro_time }); return }

  // ── o produto e a turma que valem (a turma tem que ser do produto e estar aberta)
  const produto: Produto | null = d.produto === 'deu_venda' || d.produto === 'imersao' ? d.produto : null
  let turma = turmas.find(t => t.codigo === (d.turma || '').trim()) || null
  if (turma && produto && (produto === 'imersao') !== turma.codigo.startsWith('imersaodv')) turma = null
  if (!turma && produto === 'deu_venda') {
    const poa = /porto alegre|poa\b|canoas|gravata|novo hamburgo|s[aã]o leopoldo|alvorada|viam[aã]o|cachoeirinha|esteio|sapucaia/i.test(`${d.cidade || ''} ${d.turma || ''}`)
    turma = turmas.find(t => t.codigo === (poa ? 'deuvendaportoalegre' : (lead.codigo_turma === 'deuvendaportoalegre' ? 'deuvendaportoalegre' : 'deuvendalajeado'))) || null
  }

  // ── as travas do texto
  let { mensagens, problema } = conferirMensagens(d.mensagens)
  // A PRIMEIRA RESPOSTA É UMA MENSAGEM SÓ (27/10, Nando: as duas primeiras pessoas sumiram depois de dois
  // balões explicando o produto). Se a IA mandar mais de uma, junta todas numa só.
  if (!problema && mensagens.length > 1 && !lista.some(m => m.direcao === 'enviada') && !mensagens.some(m => /\{LINK_/.test(m))) {
    mensagens = [mensagens.join('\n\n')]
  }
  const usa = (marca: string) => mensagens.some(m => m.includes(marca))
  if (!problema && (acao === 'proposta' || usa('{LINK_PROPOSTA}')) && !usa('{LINK_PROPOSTA}')) mensagens.push('{LINK_PROPOSTA}')
  if (!problema && acao === 'link' && !usa('{LINK_PAGAMENTO}')) mensagens.push('{LINK_PAGAMENTO}')
  if (!problema && acao === 'link_especial' && !usa('{LINK_ESPECIAL}')) mensagens.push('{LINK_ESPECIAL}')
  if (!problema && (usa('{LINK_PAGAMENTO}') || usa('{LINK_ESPECIAL}') || usa('{LINK_PROPOSTA}')) && !turma) problema = 'quis mandar link ou proposta sem saber o produto e a turma'
  if (!problema && usa('{LINK_ESPECIAL}') && !(produto === 'deu_venda' && turma?.link_pagamento_bolsa)) problema = 'quis mandar a condição especial fora do Deu Venda'
  if (!problema && !mensagens.length) problema = 'não escreveu nenhuma mensagem'

  // ── a proposta (na sombra ela escreve a capa e não grava)
  let proposta: any = null
  if (!problema && usa('{LINK_PROPOSTA}') && turma) {
    const prodNome = PRODUTO_NOME[turma.codigo.startsWith('imersaodv') ? 'imersao' : 'deu_venda']
    const { data: prod } = await sb.from('produtos').select('id, nome, preco_venda').eq('id', turma.produto_id).maybeSingle()
    try {
      proposta = await montarPropostaPlantao({
        org, leadId: lead.id, vendedorId: lead.vendedor_id || null,
        produto: prod || { id: turma.produto_id, nome: prodNome, preco_venda: turma.preco_venda },
        turma: { id: turma.id, preco_venda: turma.preco_venda },
        // o nome da proposta é o do cadastro; o negócio, só o que a pessoa escreveu (nunca inventado)
        clienteNome: lead.nome && lead.nome !== 'Lead WhatsApp' ? lead.nome : (conv.nome || 'Cliente'),
        negocio: d.negocio || null, regiao: d.cidade || null, conversa, sombra,
      })
    } catch (e: any) { proposta = { ok: false, erro: e?.message || String(e) } }
    if (!proposta?.ok) problema = `a proposta falhou: ${proposta?.erro || 'sem motivo'}`
  }

  const links: Record<string, string> = {
    '{LINK_PROPOSTA}': proposta?.url || (sombra ? '[link da proposta]' : ''),
    '{LINK_PAGAMENTO}': turma?.link_pagamento || '',
    '{LINK_ESPECIAL}': turma?.link_pagamento_bolsa || '',
  }
  const finais = mensagens.map(m => m.replace(/\{LINK_[A-Z]+\}/g, t => links[t] || t))
  if (!problema && finais.some(m => /\{LINK_[A-Z]+\}/.test(m))) problema = 'faltou o link certo no cadastro da turma'

  const registro = {
    ...base, acao, produto, turma: turma?.codigo || null, temperatura: d.temperatura, negocio: d.negocio || null, cidade: d.cidade || null,
    mensagens: finais, resumo: d.resumo_pro_time, pedido_ao_diretor: d.pedido_ao_diretor || null, ligacao_preferencia: d.ligacao_preferencia || null,
    proposta: proposta?.ok ? { url: proposta.url || null, capa: proposta.capa, objecoes: proposta.objecoes, nova: proposta.nova ?? true } : null,
    ultima: ultima.texto,
  }

  if (problema) {
    await registrar(org, 'bloqueado', { ...registro, problema }, 'erro')
    if (!sombra) await avisarTime({ org, tipo: 'falha', leadId: lead.id, nome: lead.nome || 'Lead', detalhe: `A IA não mandou a resposta (${problema}). A pessoa escreveu: "${String(ultima.texto || '').slice(0, 160)}"` })
    return
  }

  if (sombra) { await registrar(org, 'respondeu', registro); return }

  // ── manda (ligado)
  const to = foneOficial(lead.whatsapp || conv.telefone || '')
  if (!to) return
  // A PESSOA ESCREVEU DE NOVO ENQUANTO A IA PENSAVA (31/10: Jocimar perguntou o conteúdo e recebeu a proposta
  // sem resposta; Thiago recebeu a mesma explicação duas vezes): esta resposta já está velha. Não manda; a
  // chamada da mensagem nova responde tudo junto (ela passa pela trava de cima porque esta não gravou nada).
  const { data: novas } = await sb.from('wa_mensagens').select('id').eq('conversa_id', conversaId).eq('direcao', 'recebida').gt('criado_em', ultima.criado_em).limit(1)
  if (novas?.length) { await registrar(org, 'refeito', { ...base, motivo: 'chegou mensagem nova enquanto a IA escrevia', ultima: ultima.texto }); return }
  for (const texto of finais) {
    const env = await enviar(to, texto, { preview: /https?:\/\//.test(texto) })
    if (!env.ok) {
      await registrar(org, 'envio', { ...registro, erro: env.error }, 'erro')
      await avisarTime({ org, tipo: 'falha', leadId: lead.id, nome: lead.nome || 'Lead', detalhe: `O WhatsApp recusou a resposta da IA (${env.error}). A pessoa está sem resposta.` })
      return
    }
    await sb.from('wa_mensagens').insert({ org_id: org, conversa_id: conversaId, zapi_id: env.wamid || null, direcao: 'enviada', tipo: 'texto', texto, status: 'enviada', canal: 'oficial', enviado_por: null })
    await sb.from('wa_conversas').update({ ultima_msg: texto.slice(0, 200), ultima_msg_em: new Date().toISOString() }).eq('id', conversaId)
    if (finais.length > 1) await new Promise(r => setTimeout(r, 1500))
  }
  await registrar(org, 'respondeu', registro)
  await efeitosNoLead(org, lead, d, acao, turma, proposta, volta)
}

/** O que muda no lead depois que a resposta saiu (só com o plantão ligado). */
async function efeitosNoLead(org: string, lead: any, d: DecisaoPlantao, acao: string, turma: Turma | null, proposta: any, voltaCfg: Date | null) {
  const agora = new Date().toISOString()
  // a tarefa de ligação precisa de dia: sem volta confirmada, fica pro próximo dia útil (o time remarca)
  const volta = voltaCfg || (() => { const d = new Date(hojeBR() + 'T12:00:00Z'); do { d.setUTCDate(d.getUTCDate() + 1) } while ([0, 6].includes(d.getUTCDay()) || FERIADOS.has(d.toISOString().slice(0, 10))); return d })()
  const nome = lead.nome || 'Lead'
  const patch: any = { atualizado_em: agora }
  if (d.negocio && !lead.negocio) patch.negocio = d.negocio.slice(0, 200)
  // a turma do lead é por onde a matrícula do Herospark cai no lugar certo: grava antes do link
  // 31/10 (Thiago): a cidade do Deu Venda decidida na conversa também vale — antes só mudava com proposta ou
  // link, e ele ficou marcado em Lajeado depois de dizer que faria em Porto Alegre.
  if (turma && (lead.codigo_turma !== turma.codigo) && (acao === 'link' || acao === 'link_especial' || acao === 'proposta' || turma.codigo.startsWith('imersaodv') || !!d.cidade || !!d.turma)) {
    patch.codigo_turma = turma.codigo
    patch.turma_id = turma.id
  }
  // SEM INTERESSE (04/11/2026, Nando, o Eloi: "a gente nem entra nesse caso, já pode ir pra perda"). A IA já
  // mandou a linha de despedida; o lead vai direto pra Perda, motivo "Não tem interesse", sem aviso pro time.
  // Se ele escrever de novo um dia, a IA atende normalmente (Perda não fica pausado).
  if (acao === 'sem_interesse') {
    Object.assign(patch, { etapa: 'perda', data_perda: agora, motivo_perda_id: MOTIVO_SEM_INTERESSE })
    await sb.from('lead_andamentos').insert({ lead_id: lead.id, vendedor_id: lead.vendedor_id, tipo: 'mudanca_etapa', etapa_anterior: lead.etapa, etapa_nova: 'perda', observacao: '🤖 IA do plantão: a pessoa disse que não tem interesse — movido para Perda' })
    await sb.from('tarefas_lead').update({ cancelada: true, cancelada_em: agora, atualizado_em: agora }).eq('lead_id', lead.id).eq('concluida', false).eq('cancelada', false).not('tipo', 'like', 'plantao_%')
  }
  // com o plantão ligado, a IA faz o movimento que o time fazia à mão: Ligação → Atendimento inicial
  else if (lead.etapa === 'aguardando_atendimento') {
    patch.etapa = 'atendimento_inicial'
    await sb.from('lead_andamentos').insert({ lead_id: lead.id, vendedor_id: lead.vendedor_id, tipo: 'mudanca_etapa', etapa_anterior: lead.etapa, etapa_nova: 'atendimento_inicial', observacao: '🤖 IA do plantão atendeu — movido para Atendimento Inicial' })
    await sb.from('tarefas_lead').update({ cancelada: true, cancelada_em: agora, atualizado_em: agora }).eq('lead_id', lead.id).eq('concluida', false).eq('cancelada', false).neq('tipo', 'ligar_agendado').not('tipo', 'like', 'plantao_%')
  }
  await sb.from('leads').update(patch).eq('id', lead.id)
  await sb.from('lead_andamentos').insert({ lead_id: lead.id, vendedor_id: lead.vendedor_id, tipo: 'ia_followup', observacao: `🤖 IA do plantão (${acao}, ${d.temperatura || '?'}): ${d.resumo_pro_time || ''}`.slice(0, 900) })

  const prod = turma ? (turma.codigo.startsWith('imersaodv') ? `Imersão (${turma.codigo})` : 'Deu Venda') : 'produto ainda indefinido'
  if (acao === 'diretor') {
    // pedido ao diretor já aberto: não avisa de novo (31/10, Eliana: o mesmo pedido foi duas vezes)
    const { data: jaDir } = await sb.from('tarefas_lead').select('id').eq('lead_id', lead.id).eq('tipo', 'plantao_diretor').eq('concluida', false).eq('cancelada', false).limit(1)
    if (jaDir?.length) return
    await avisarTime({ org, tipo: 'diretor', leadId: lead.id, nome, detalhe: `${prod}. Pediu: ${d.pedido_ao_diretor || '(ver conversa)'}. ${d.resumo_pro_time || ''}` })
  } else if (acao === 'ligacao') {
    const { data: ja } = await sb.from('tarefas_lead').select('id').eq('lead_id', lead.id).eq('tipo', 'ligar_agendado').eq('concluida', false).eq('cancelada', false).limit(1)
    // ligação já na fila: não cria outra nem avisa de novo (a pessoa só repetiu o pedido)
    if (ja?.length) return
    await sb.from('tarefas_lead').insert({ org_id: org, lead_id: lead.id, vendedor_id: lead.vendedor_id || null, tipo: 'ligar_agendado', titulo: `Ligar (pediu no plantão) — ${nome}`, descricao: `${d.ligacao_preferencia ? `Prefere: ${d.ligacao_preferencia}. ` : ''}${d.resumo_pro_time || ''}`.slice(0, 900), data_vencimento: volta.toISOString() })
    await avisarTime({ org, tipo: 'ligacao', leadId: lead.id, nome, detalhe: `${prod}. Quer ligação${d.ligacao_preferencia ? ` (${d.ligacao_preferencia})` : ''}. Ficou na fila pra ${quandoBR(volta)}, 9h. ${d.resumo_pro_time || ''}`, vence: volta.toISOString() })
  } else if (acao === 'chamar_time' || acao === 'outro_produto') {
    await pausarNoPlantao(lead.id, acao === 'outro_produto' ? 'assunto que não é Deu Venda nem Imersão' : 'pediu alguém do time')
    await avisarTime({ org, tipo: acao === 'outro_produto' ? 'outro_produto' : 'ajuda', leadId: lead.id, nome, detalhe: `${d.resumo_pro_time || ''} A IA parou neste lead até alguém devolver.` })
  } else if (proposta?.ok && proposta.nova) {
    await avisarTime({ org, tipo: 'proposta', leadId: lead.id, nome, detalhe: `${prod}. Proposta enviada: ${proposta.url}. ${d.resumo_pro_time || ''}` })
  }
}

// ─── depois do aceite ────────────────────────────────────────────────────────────────────────────────

/**
 * O cliente aceitou uma proposta (chamado pela rota do aceite, no after()). Com o plantão ligado, manda
 * o link de pagamento da turma da proposta — só se o preço da proposta é o do link — e avisa o time.
 */
export async function aposAceitePlantao(orcamentoId: string) {
  const modo = await modoPlantao()
  if (modo === 'desligado') return
  const { data: orc } = await sb.from('orcamentos').select('id, org_id, lead_id, produto_nome, turma_id, preco_vista, cliente_nome, slug, contexto').eq('id', orcamentoId).maybeSingle()
  if (!orc?.lead_id) return
  // O TIME NA CONVERSA, A IA FORA (04/11/2026, Thiago: o time mandou a proposta e atendia, e a IA mandou o
  // link por cima). O link só sai sozinho em proposta que a PRÓPRIA IA mandou e com o lead sem o time.
  // Proposta do time: o aceite já avisa o time (rota do aceite), e quem cobra é quem está atendendo.
  const daIA = (orc.contexto as any)?.origem === 'plantao-ia'
  if (!daIA || (await pausadoNoPlantao(orc.lead_id)).pausado) {
    await registrar(orc.org_id, 'aceite', { lead_id: orc.lead_id, orcamento: orc.slug, mensagens: [], motivo: daIA ? 'o time está na conversa' : 'proposta do time' })
    return
  }
  const { data: lead } = await sb.from('leads').select('id, nome, whatsapp, codigo_turma').eq('id', orc.lead_id).maybeSingle()
  const { data: turma } = orc.turma_id ? await sb.from('turmas').select('id, codigo, preco_venda, link_pagamento').eq('id', orc.turma_id).maybeSingle() : { data: null as any }
  const nome = lead?.nome || orc.cliente_nome || 'Cliente'
  const linkVale = !!turma?.link_pagamento && Number(orc.preco_vista) === Number(turma.preco_venda)
  const primeiro = nomeDeGente(lead?.nome) || nomeDeGente(orc.cliente_nome)
  const texto = linkVale
    ? `${primeiro ? `${primeiro}, recebi` : 'Recebi'} o teu aceite. Pra garantir a tua vaga, é só finalizar o pagamento por aqui: ${turma.link_pagamento}\nDepois me manda o teu nome completo, CPF e e-mail que eu deixo tudo certo.`
    : null
  const base = { lead_id: orc.lead_id, nome, sombra: modo === 'sombra', orcamento: orc.slug, link_vale: linkVale, mensagens: texto ? [texto] : [] }

  if (modo === 'sombra') { await registrar(orc.org_id, 'aceite', base); return }

  if (texto && lead?.whatsapp) {
    const env = await enviar(foneOficial(lead.whatsapp), texto, { preview: true })
    if (env.ok) {
      const { data: conv } = await sb.from('wa_conversas').select('id').eq('lead_id', lead.id).order('ultima_msg_em', { ascending: false }).limit(1).maybeSingle()
      if (conv) await sb.from('wa_mensagens').insert({ org_id: orc.org_id, conversa_id: conv.id, zapi_id: env.wamid || null, direcao: 'enviada', tipo: 'texto', texto, status: 'enviada', canal: 'oficial', enviado_por: null })
    } else base.mensagens = []
    if (turma?.codigo && lead.codigo_turma !== turma.codigo) await sb.from('leads').update({ codigo_turma: turma.codigo, turma_id: turma.id, atualizado_em: new Date().toISOString() }).eq('id', lead.id)
  }
  await registrar(orc.org_id, 'aceite', base)
  await avisarTime({ org: orc.org_id, tipo: 'aceite', leadId: orc.lead_id, nome, detalhe: `${orc.produto_nome} — aceitou a proposta /proposta/${orc.slug}. ${base.mensagens.length ? 'A IA mandou o link de pagamento.' : 'O preço da proposta não é o do link: o link NÃO foi mandado, fala com a pessoa.'}` })
}

// ─── de hora em hora: a cutucada e os resumos ────────────────────────────────────────────────────────

const H = 36e5
function horaBrasilia(d: Date) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23' }).format(d))
}

/** Vai ter uma rodada da cutucada (de hora em hora, das 9h às 20h) com a pessoa entre 20 e 23,5 h sem responder? */
function rodadaNaFaixa(agora: Date, idade: number) {
  for (let k = 1; k <= 24; k++) {
    const id = idade + k * H
    if (id > 23.5 * H) return false
    const h = horaBrasilia(new Date(+agora + k * H))
    if (id >= 20 * H && h >= 9 && h <= 20) return true
  }
  return false
}

// Nome que parece de empresa não vira "Oi, Harmonizze!" (31/10): vai só "Oi!".
const PARECE_EMPRESA = /ltda|\bme\b|im[oó]ve|est[eé]tica|design|comunica|studio|est[uú]dio|cl[ií]nica|loja|store|house|criativ|sorriso|bem estar|&|\d/i
// NOME DE GENTE (04/11/2026, o aceite do Thiago saiu "@thiago.pessamiglio, recebi o teu aceite"): o cadastro
// traz o nome do perfil do WhatsApp, que muitas vezes é @ do Instagram, emoji ou nome de empresa. Só vale
// o primeiro nome quando parece nome de pessoa; senão, cumprimenta sem nome.
export function nomeDeGente(nome: string | null | undefined): string {
  const n = String(nome || '').replace(/\p{Extended_Pictographic}|\uFE0F/gu, '').trim()
  if (!n || n === 'Lead WhatsApp' || /[@._\d]/.test(n) || PARECE_EMPRESA.test(n)) return ''
  const p = n.split(/\s+/)[0]
  if (p.length < 2 || !/^\p{L}+$/u.test(p)) return ''
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
}

// O TEXTO DA CUTUCADA (31/10, do Guto): antes era fixo — "Ficou alguma dúvida do que eu te expliquei?" — e ia
// até pra quem só mandou a mensagem pronta do anúncio e nunca respondeu a primeira pergunta (a IA não tinha
// explicado nada). Agora a IA escreve a retomada lendo a conversa, presa ao que de fato aconteceu; se a
// chamada falhar ou o texto sair fora das regras, vale o texto fixo do caso, que também olha se a pessoa
// chegou a responder.
type CasoCutucada = 'link' | 'proposta' | 'conversa'
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
export async function textoCutucada(leadId: string, caso: CasoCutucada, oi: string, msgs: any[]): Promise<string> {
  const primeiraNossa = msgs.findIndex(m => m.direcao === 'enviada')
  const respondeuAlgumaVez = primeiraNossa >= 0 && msgs.slice(primeiraNossa + 1).some(m => m.direcao === 'recebida')
  const fixo = caso === 'link'
    ? `${oi} Conseguiste finalizar a inscrição pelo link? Se travou em alguma parte, me avisa que eu te ajudo.`
    : caso === 'proposta'
      ? `${oi} Conseguiste dar uma olhada na proposta? Se ficou alguma dúvida, me fala que eu te explico.`
      : respondeuAlgumaVez
        ? `${oi} Ficou alguma dúvida? Se quiser, me conta mais do teu negócio que eu te mostro como ficaria pra ti.`
        : `${oi} Vi que tu chamou querendo saber mais. Pra eu te explicar do jeito certo, me conta: qual é o teu negócio e como tu atrai cliente hoje?`
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return fixo
  try {
    const client = new Anthropic({ apiKey: key })
    const r = await client.messages.create({
      model: MODELO_PLANTAO, max_tokens: 300,
      system: `Tu escreve UMA mensagem curta de retomada no WhatsApp da Escola CarreiraNoDigital, pra uma pessoa que parou de responder há quase 24 horas.
Regras:
- Começa exatamente com "${oi}" e tem no máximo 2 frases curtas depois disso.
- Português do Rio Grande do Sul ("tu"), tom gentil, sem pressão, sem emoji, sem gíria. Nunca diga que é robô ou IA.
- Fala SÓ do que aconteceu de verdade na conversa. Nunca diga "o que eu te expliquei" se nada foi explicado; se a pessoa nunca respondeu a nossa pergunta, retome a pergunta de um jeito leve e diferente, mostrando por que ela importa.
- Não invente preço, data, turma, desconto nem promessa. Não repita a nossa última mensagem com as mesmas palavras.
- Hoje a escola só vende o Deu Venda (individual) e a Imersão Deu Venda (turma pequena). Cursos antigos que aparecerem no histórico (Formação Completa, ANL e outros) não existem mais: nunca fale deles.
- Termine com uma pergunta simples, que dê pra responder em uma linha.
${caso === 'proposta' ? '- A pessoa recebeu uma proposta: retome a proposta.' : caso === 'link' ? '- A pessoa recebeu o link de pagamento: pergunte se conseguiu finalizar e ofereça ajuda.' : ''}
Responda só com o texto da mensagem, nada mais.`,
      messages: [{ role: 'user', content: `A conversa ("Lead:" é a pessoa; "Escola:" somos nós):\n\n${msgs.map(linhaDaMensagem).join('\n')}` }],
    })
    await logIaUso('ia-plantao-cutucada', MODELO_PLANTAO, r.usage, { lead_id: leadId })
    const t = r.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('').trim().replace(/^"|"$/g, '')
    if (!t.startsWith(oi) || t.length > 320 || EMOJI.test(t) || (/expliquei/i.test(t) && !respondeuAlgumaVez)) return fixo
    return t
  } catch { return fixo }
}

/**
 * A CUTUCADA: quem conversou com a IA e parou de responder recebe UMA retomada, entre 20 e 23 horas
 * depois da última mensagem dele (ainda dentro da janela de 24 h do WhatsApp, que só aceita texto livre
 * nesse prazo). O funil-motor do Rick não pega esses leads: pra ele, quem respondeu é do time.
 */
export async function cutucarPlantao(org: string) {
  const modo = await modoPlantao()
  if (modo === 'desligado') return { modo, cutucados: 0 }
  const agora = new Date()
  if (horaBrasilia(agora) < 9 || horaBrasilia(agora) > 20) return { modo, cutucados: 0, pulou: 'fora do horário' }
  const { data: logs } = await sb.from('webhook_logs').select('payload, recebido_em').eq('org_id', org).eq('origem', ORIGEM).in('evento', ['respondeu', 'cutucada'])
    .gte('recebido_em', new Date(+agora - 30 * H).toISOString()).order('recebido_em', { ascending: true })
  const porLead = new Map<string, { ultimaIA: string; cutucadaEm: string | null; acao: string; nome: string }>()
  for (const l of logs || []) {
    const p: any = l.payload || {}
    if (!p.lead_id || !!p.sombra !== (modo === 'sombra')) continue
    const x = porLead.get(p.lead_id) || { ultimaIA: l.recebido_em, cutucadaEm: null, acao: p.acao, nome: p.nome }
    if (p.cutucada) x.cutucadaEm = l.recebido_em
    else { x.ultimaIA = l.recebido_em; x.acao = p.acao }
    porLead.set(p.lead_id, x)
  }
  let cutucados = 0
  for (const [leadId, x] of porLead) {
    if (['diretor', 'ligacao', 'chamar_time', 'outro_produto'].includes(x.acao)) continue
    const { data: lead } = await sb.from('leads').select('id, nome, whatsapp, etapa').eq('id', leadId).maybeSingle()
    if (!lead || lead.etapa === 'ganho' || lead.etapa === 'perda') continue
    if ((await pausadoNoPlantao(leadId)).pausado) continue
    const { data: conv } = await sb.from('wa_conversas').select('id').eq('lead_id', leadId).order('ultima_msg_em', { ascending: false }).limit(1).maybeSingle()
    if (!conv) continue
    const { data: ult } = await sb.from('wa_mensagens').select('direcao, tipo, texto, criado_em').eq('conversa_id', conv.id).order('criado_em', { ascending: false }).limit(MSGS_NA_CONVERSA)
    const ultimaDele = (ult || []).find(m => m.direcao === 'recebida')
    if (!ultimaDele) continue
    // a última é dele: a IA responde pelo webhook. Exceção (31/10, Cleusa e Priscilla): ele só agradeceu e a
    // IA decidiu não responder ("Obrigada", joinha) — aí a retomada vale, senão ninguém mais fala com ele.
    if (ult?.[0]?.direcao === 'recebida') {
      const { count } = await sb.from('webhook_logs').select('id', { count: 'exact', head: true }).eq('origem', ORIGEM).eq('evento', 'nao_responder')
        .eq('payload->>lead_id', leadId).gte('recebido_em', ultimaDele.criado_em)
      if (!count) continue
    }
    const idade = +agora - +new Date(ultimaDele.criado_em)
    // JANELA (31/10): era só entre 20 e 23 h depois da última mensagem dele, e a rodada só roda das 9h às 20h:
    // quem parou de responder de madrugada ou cedo (Jean Boni pediu o valor às 9h) nunca era retomado.
    // Agora: entre 20 e 23,5 h; ou antes, a partir de 10 h, se nenhuma rodada no horário cair nessa faixa.
    if (idade > 23.5 * H || idade < 10 * H) continue
    if (idade < 20 * H && rodadaNaFaixa(agora, idade)) continue
    if (x.cutucadaEm && +new Date(x.cutucadaEm) > +new Date(ultimaDele.criado_em)) continue
    const { data: orc } = await sb.from('orcamentos').select('aceito_em').eq('lead_id', leadId).eq('situacao', 'publicado').order('publicado_em', { ascending: false }).limit(1).maybeSingle()
    const primeiro = nomeDeGente(lead.nome)   // sem @, emoji nem empresa; "natália" vira "Natália"
    const oi = primeiro ? `Oi, ${primeiro}!` : 'Oi!'
    const caso: CasoCutucada = x.acao === 'link' || x.acao === 'link_especial' || orc?.aceito_em ? 'link' : orc ? 'proposta' : 'conversa'
    const texto = await textoCutucada(lead.id, caso, oi, ((ult || []) as any[]).slice().reverse())
    const reg = { lead_id: leadId, nome: lead.nome, sombra: modo === 'sombra', cutucada: true, acao: 'cutucada', caso, mensagens: [texto] }
    if (modo === 'ligado') {
      const env = await enviar(foneOficial(lead.whatsapp || ''), texto)
      if (!env.ok) { await registrar(org, 'cutucada', { ...reg, erro: env.error }, 'erro'); continue }
      await sb.from('wa_mensagens').insert({ org_id: org, conversa_id: conv.id, zapi_id: env.wamid || null, direcao: 'enviada', tipo: 'texto', texto, status: 'enviada', canal: 'oficial', enviado_por: null })
      await sb.from('wa_conversas').update({ ultima_msg: texto.slice(0, 200), ultima_msg_em: new Date().toISOString() }).eq('id', conv.id)
    }
    await registrar(org, 'cutucada', reg)
    cutucados++
  }
  return { modo, cutucados }
}

/** O resumo das 8h e das 19h pro time, no WhatsApp do assistente (e no push). */
export async function resumoDoPlantao(org: string, forcar = false) {
  const modo = await modoPlantao()
  if (modo === 'desligado') return { modo, enviado: false }
  const h = horaBrasilia(new Date())
  if (!forcar && h !== 8 && h !== 19) return { modo, enviado: false }
  const desde = new Date(Date.now() - 12 * H).toISOString()
  const { data: logs } = await sb.from('webhook_logs').select('evento, payload').eq('org_id', org).eq('origem', ORIGEM).gte('recebido_em', desde)
  const ls = (logs || []).filter((l: any) => !!l.payload?.sombra === (modo === 'sombra'))
  const leads = new Set(ls.filter((l: any) => l.evento === 'respondeu').map((l: any) => l.payload.lead_id))
  const conta = (f: (l: any) => boolean) => ls.filter(f).length
  const propostas = conta((l: any) => l.evento === 'respondeu' && l.payload.proposta)
  const links = conta((l: any) => l.evento === 'respondeu' && ['link', 'link_especial'].includes(l.payload.acao))
  const aceites = conta((l: any) => l.evento === 'aceite')
  const bloqueios = conta((l: any) => l.evento === 'bloqueado' || l.evento === 'erro')
  const { count: abertos } = await sb.from('tarefas_lead').select('id', { count: 'exact', head: true }).eq('org_id', org).like('tipo', 'plantao_%').eq('concluida', false).eq('cancelada', false)
  const { count: vendas } = await sb.from('leads').select('id', { count: 'exact', head: true }).eq('org_id', org).eq('etapa', 'ganho').gte('data_ganho', desde)
  const titulo = `Resumo das últimas 12h${modo === 'sombra' ? ' (SOMBRA: nada foi mandado)' : ''}`
  const n = (q: number, um: string, varios: string) => `${q} ${q === 1 ? um : varios}`
  const detalhe = `${n(leads.size, 'pessoa atendida', 'pessoas atendidas')}, ${n(propostas, 'proposta', 'propostas')}, ${n(links, 'link de pagamento', 'links de pagamento')}, ${n(aceites, 'aceite', 'aceites')}, ${n(vendas || 0, 'venda', 'vendas')}. ${n(abertos || 0, 'aviso esperando', 'avisos esperando')} alguém do time. ${bloqueios ? `${n(bloqueios, 'resposta bloqueada', 'respostas bloqueadas')} pelas travas.` : ''}`.trim()
  // o resumo vai como aviso, mas sem virar tarefa no lead: usa o mesmo caminho do WhatsApp do time
  const { enviarAoTime } = await import('@/lib/assistente')
  const { enviarPush } = await import('@/lib/push')
  const { TEMPLATE_AVISO } = await import('@/lib/plantao-avisos')
  const { data: time } = await sb.from('usuarios_perfil').select('id, org_id, nome, apelido, email, whatsapp, assistente_ultima_msg_em, assistente_bom_dia').eq('org_id', org).eq('ativo', true).not('whatsapp', 'is', null)
  for (const u of (time || []) as any[]) await enviarAoTime(u, `Plantão da IA · ${titulo}\n\n${detalhe}\n\nVer: carreiranodigital.vercel.app/dashboard/ia-plantao`, { nome: TEMPLATE_AVISO, params: [titulo, detalhe] }).catch(() => null)
  await enviarPush(`Plantão da IA · ${titulo}`, detalhe.slice(0, 140), '/dashboard/ia-plantao').catch(() => null)
  await registrar(org, 'resumo', { sombra: modo === 'sombra', titulo, detalhe })
  return { modo, enviado: true, detalhe }
}

/**
 * SIMULAR: o que a IA responderia AGORA pra este lead, a partir da conversa real — sem mandar, sem
 * gravar, sem escrever proposta. Pra testar o plantão em lead de verdade antes de ligar.
 */
export async function simularPlantao(org: string, leadId: string) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { ok: false, error: 'sem a chave da IA' }
  const { data: lead } = await sb.from('leads').select('id, nome, whatsapp, etapa, codigo_turma, turma_id, vendedor_id, origem, utm_campaign, mensagem_inicial, negocio, resumo_ia').eq('org_id', org).eq('id', leadId).maybeSingle()
  if (!lead) return { ok: false, error: 'lead não encontrado' }
  const { data: conv } = await sb.from('wa_conversas').select('id').eq('lead_id', leadId).order('ultima_msg_em', { ascending: false }).limit(1).maybeSingle()
  const { data: msgs } = conv ? await sb.from('wa_mensagens').select('id, direcao, tipo, texto, criado_em').eq('conversa_id', conv.id).order('criado_em', { ascending: false }).limit(MSGS_NA_CONVERSA) : { data: [] as any[] }
  const lista = (msgs || []).reverse()
  const cfg = await configPlantao()
  const agora = new Date()
  const volta = voltaDoTime(cfg, agora)
  const turmas = await turmasAbertas()
  const ficha = await fichaDoLead(lead, turmas, volta)
  const conversa = lista.map(linhaDaMensagem).join('\n') || '(sem conversa)'
  const r = await decidirPlantao(key, { agora, volta, turmas, ficha, conversa })
  await logIaUso('ia-plantao-simular', MODELO_PLANTAO, r.usage, { lead_id: leadId })
  const c = conferirMensagens(r.d.mensagens)
  return { ok: true, lead: lead.nome, decisao: r.d, mensagens: c.mensagens, problema: c.problema, ficha, conversa }
}

/**
 * Quem escreve do nada (sem #ref do site, sem anúncio) não vira lead no fluxo normal: espera o time.
 * Com o plantão LIGADO e o time fora, vira lead pra IA atender. Não vira: aluno (é atendimento, não
 * venda) e quem só está respondendo um disparo (esses seguem na caixa de Disparos).
 */
export async function leadDoPlantao(org: string, tel: string, nome: string | null): Promise<string | null> {
  const sufixo = tel.slice(-8)
  const { data: aluno } = await sb.from('alunos').select('id').ilike('whatsapp', `%${sufixo}%`).limit(1)
  if (aluno?.length) return null
  const { data: disparo } = await sb.from('wa_disparo_envios').select('id').ilike('telefone', `%${sufixo}`).limit(1)
  if (disparo?.length) return null
  const { data: novo } = await sb.from('leads').insert({ org_id: org, nome: nome || 'Lead WhatsApp', whatsapp: tel, etapa: 'aguardando_atendimento', origem: 'whatsapp' }).select('id').single()
  if (!novo) return null
  await sb.from('lead_andamentos').insert({ lead_id: novo.id, tipo: 'criado', etapa_nova: 'aguardando_atendimento', observacao: '🤖 Lead criado pelo plantão da IA: escreveu direto no WhatsApp, sem vir do site nem do anúncio' })
  return novo.id
}
