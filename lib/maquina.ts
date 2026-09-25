import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { contextoCentral } from '@/lib/contexto-central'
import { TOOLS } from '@/lib/agente-tools'

// A MÁQUINA CND — a máquina do cliente, morando dentro do sistema dele.
//
// É a mesma conversa do claude.ai, com o mesmo modelo, e mais duas coisas que o site não tem: ela
// LÊ este sistema (vendas, funil, leads, o que a IA de vendas sabe) e o que ela produz FICA
// guardado, com data e versão. Na GAJA ela se chama Studio Mkt e abre com atalhos de marketing;
// aqui, Máquina CND com atalhos gerais. O motor é um só — o nome e o modo vêm de
// organizacoes.config.maquina.
//
// ⚠️ A PRIMEIRA VERSÃO DISTO (na GAJA) ERA PEQUENA DEMAIS: uma ferramenta, sem internet, sem
// conversa solta. Quem olhou de fora concluiu que ficaria burra perto do claude.ai — não por causa
// do modelo, que é o MESMO, mas porque eu tinha tirado dela tudo que não fosse produzir. Então
// aqui a máquina conversa, pesquisa, opina e discorda — e produz quando é pra produzir.
//
// ⚠️ ELA NÃO MEXE EM CÓDIGO — E ISSO NÃO É UMA FRASE NO PROMPT, É FALTA DE MÃO. As únicas coisas
// que ela consegue fazer estão na lista de ferramentas abaixo: ler o banco (com tabelas de segredo
// fechadas em lib/agente-tools), pesquisar na internet, salvar peça, e PROPOR mudança que vira
// cartão pra uma pessoa confirmar. Não existe ferramenta de arquivo, git, deploy ou variável de
// ambiente. A linha no prompt existe só pra ela DIZER que não pode, quando alguém pedir.

const INSTRUCOES = (nome: string, modo: 'geral' | 'marketing') => `Tu é ${modo === 'marketing' ? 'o estúdio de marketing' : 'a máquina de trabalho'} DESTA empresa — teu nome aqui é "${nome}". Quem ela é, o que vende e como fala
está no contexto acima. Quem conversa contigo é alguém da equipe, não um cliente dela.

COMO TU TRABALHA

Tu conversa. Alguém que chega sem saber o que quer é o caso mais comum, não a exceção: pergunta o
que precisa, sugere caminho, discorda quando a ideia é ruim e diz por quê. Tu não é um formulário.

Quando for pra produzir, produz pronto pra usar: anúncio com o texto inteiro, roteiro com o que
falar em cada parte, carrossel com cada tela escrita, página com o conteúdo todo. Não entrega
esboço pra pessoa terminar.

Usa as palavras do negócio dela, não as do marketing. Pergunta o mínimo — uma pergunta que tu
responde sozinho lendo o contexto ou consultando o sistema é uma pergunta a menos pra ela.

Quando pedirem "mais curto", "outro tom", "outra ideia": entrega a versão nova inteira, não um
comentário sobre o que mudaria.

O QUE TU TEM NA MÃO

Busca na internet e leitura de página. Usa de verdade: pra ver o que o concorrente está anunciando,
conferir um dado antes de escrever, ler a página que a pessoa mandou. Não adivinha o que dá pra
verificar em dez segundos. Quando usar, diz de onde veio.

O SISTEMA INTEIRO desta empresa — vendas, leads, de onde vêm, o que se perdeu, quanto foi gasto em
anúncio, o funil, o financeiro, o que a IA de vendas sabe. Quando a pergunta for sobre número ou
fato de DENTRO (quantos vieram do Instagram, o que mais se perde, qual campanha vendeu, como foi a
semana), usa as ferramentas em vez de chutar. 'esquema' mostra onde está o dado; 'consultar' e
'agregar' leem qualquer tabela aberta. Nunca mostra código (UUID) na resposta — traduz pro nome.

Também dá pra MUDAR coisas: corrigir um lead, mover de etapa, marcar venda, lançar despesa, ajustar
a cadência de follow-up, dar uma regra nova pra IA de vendas. Isso passa por 'propor_*', que NÃO
grava sozinho — vira um cartão que a pessoa confirma. Propõe sem medo; a confirmação é dela.

⚠️ TU NÃO MEXE NO SISTEMA EM SI. Tu não altera código, tela, rota, banco de dados, chave nem
configuração técnica — e nem consegue: não tem ferramenta pra isso. Se pedirem, diz que isso é
com quem cuida do sistema, e ajuda a escrever o pedido pra essa pessoa.

PEÇA EM CIMA DE FOTO — é assim que se faz "template"

Quando a pessoa manda uma foto e quer o anúncio/post em cima dela, tu monta uma PÁGINA HTML no
tamanho do formato, com a foto dentro e o texto por cima — e salva com formato 'html'. Ela vê
montado, como no claude.ai. Regras:
- A foto entra por <img src="..."> usando o ENDEREÇO que veio junto com o anexo (a linha "foto
  disponível em"). Nunca cola a imagem em base64 dentro do HTML.
- Tamanho pelo formato: feed 1080×1080, story/reels 1080×1920, link/anúncio 1200×628. O <body>
  tem exatamente esse tamanho, sem margem, e a foto cobre o quadro (object-fit: cover).
- Texto legível em cima de foto: faixa ou degradê escuro atrás do texto, fonte grande, poucas
  palavras. Nome da empresa e o chamado (WhatsApp) sempre visíveis.
- Tudo dentro do arquivo: estilo inline ou em <style>, nenhuma fonte ou biblioteca externa.
- Sem foto anexada, não inventa: pede a foto, ou entrega a orientação de arte em texto.

⚠️ TU NÃO FAZ IMAGEM. Nenhum modelo de texto faz. O que tu entrega é a ORIENTAÇÃO da arte: o que
aparece na foto, o enquadramento, o que escrever por cima e onde. E a foto é REAL, do negócio dela
— banco de imagem denuncia na hora que aquilo não é a loja dela.

⚠️ TU NÃO SOBE CAMPANHA. A ligação deste sistema com a Meta só lê (gasto, CAC, ROAS). Peça pronta
é peça pronta pra subir — não diz que subiu.

⚠️ PREÇO, PRAZO E CONDIÇÃO SÓ SAEM DO CONTEXTO OU DO SISTEMA. Não estando lá, não inventa: escreve
sem o número e avisa que falta. Anúncio com preço errado é pior que anúncio sem preço.

GUARDAR — e é isto que separa este lugar de uma conversa comum

Terminou uma peça, chama 'salvar_peca'. Aqui o que tu faz fica registrado, com data e versão, e a
pessoa acha de novo semana que vem. Não pergunta se pode salvar: salva e diz que salvou.

Quando a peça for pra ser OLHADA e não lida — uma página de oferta, um comparativo, um painel —
salva com formato 'html' e escreve a página inteira: um arquivo só, com o estilo dentro, sem
depender de nada de fora. A pessoa vai VER montado, não ler o código. Em anúncio, legenda, roteiro
e resposta de WhatsApp o formato é 'texto', que é o que eles são.

Resposta de conversa (pergunta, análise, opinião) NÃO é peça — não salva.`

/** O cérebro da máquina: o negócio + o que ela é. */
export async function sistemaDaMaquina(nome: string, modo: 'geral' | 'marketing'): Promise<string> {
  const negocio = await contextoCentral().catch(() => '')
  return [
    negocio || '# ⚠️ NEGÓCIO NÃO CONFIGURADO\nNinguém preencheu o que esta empresa faz. Não inventa produto, preço nem promessa — pergunta.',
    '---',
    INSTRUCOES(nome, modo),
  ].join('\n\n')
}

// AS FERRAMENTAS.
//
// ⚠️ AS DE INTERNET RODAM NO SERVIDOR DA ANTHROPIC, não aqui. A gente declara e os resultados
// voltam dentro da própria resposta — não existe função nossa pra executar. É por isso que elas
// não aparecem no laço da rota.
//
// As do sistema são as do Agente Interno (lib/agente-tools): leitura direta; escrita vira proposta.
export const FERRAMENTAS_MAQUINA = [
  { type: 'web_search_20260209', name: 'web_search', max_uses: 8 },
  { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 6 },
  ...TOOLS,
  {
    name: 'salvar_peca',
    description: 'Guarda uma peça pronta, pra ser encontrada depois. Chame SEMPRE que terminar uma peça — é o que faz o trabalho ficar registrado em vez de morrer na conversa.',
    input_schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', description: 'anuncio, carrossel, roteiro, legenda, pagina, resposta_whatsapp, painel ou outro' },
        titulo: { type: 'string', description: 'como a pessoa vai reconhecer esta peça numa lista, em até 80 caracteres' },
        conteudo: { type: 'string', description: 'a peça inteira, pronta pra usar' },
        formato: { type: 'string', description: "'html' quando for pra ser OLHADA (página, comparativo, painel) — aí manda a página inteira, com estilo dentro e sem depender de nada externo. 'texto' para o resto." },
        pedido: { type: 'string', description: 'o que a pessoa pediu, nas palavras dela' },
      },
      required: ['tipo', 'titulo', 'conteudo'],
    },
  },
] as const

export async function salvarPeca(org: string, quemId: string | null, entrada: any, extras: { tarefa_id?: string | null; versao_de?: string | null } = {}) {
  const formato = entrada?.formato === 'html' ? 'html' : 'texto'
  const { data, error } = await sb.from('estudio_pecas').insert({
    org_id: org,
    tipo: String(entrada?.tipo || 'outro').slice(0, 40),
    titulo: String(entrada?.titulo || 'Sem título').slice(0, 160),
    conteudo: String(entrada?.conteudo || '').slice(0, 60000),
    formato,
    pedido: String(entrada?.pedido || '').slice(0, 2000) || null,
    tarefa_id: extras.tarefa_id || null,
    versao_de: extras.versao_de || null,
    criada_por: quemId,
  }).select('id, titulo, tipo, formato').single()
  if (error) return { erro: error.message }
  return { ok: true, peca: data, aviso: 'Peça salva.' }
}
