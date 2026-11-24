// Seu 2027: a IA só ESCREVE. Os números chegam prontos de calculos.ts e ela não pode mudar nenhum.
// Modelo: claude-sonnet-5-5 (o padrão de texto da escola), esforço baixo e saída em JSON com formato fixo.
// Custo medido em 24/11 (mapa do Guto): 2,6 mil tokens de entrada e 2,9 mil de saída = US$ 0,034 (≈ R$ 0,19) por mapa.
import Anthropic from '@anthropic-ai/sdk'
import { seu2027 } from './config'
import { AREAS, ARCANOS, NUMEROS, MESES, type Numeros } from './calculos'

export type Textos = {
  abertura: string
  ano_pessoal: string
  arcano: string
  destino: string
  meses: { mes: number; titulo: string; texto: string }[]
  amor: string; trabalho: string; dinheiro: string; emocional: string
  foco: string
  conselhos: string[]
  favoraveis: string
  fechamento: string
}

const SISTEMA = `Você escreve o "Seu 2027", um mapa do ano de autoconhecimento e entretenimento, em português do Brasil.
Tom: acolhedor, positivo, elegante, como uma conversa calma com alguém que deseja o bem da pessoa. Trate a pessoa por "você" e pelo primeiro nome de vez em quando.
Base: numerologia (ano pessoal, mês pessoal, número do destino) e um arcano maior do tarô. Os números já vêm calculados: use exatamente os números recebidos, nunca recalcule nem troque.
Regras firmes:
- Nunca prometa resultado, cura, dinheiro, emprego, casamento ou qualquer garantia. Fale em tendências, convites, energias e oportunidades ("é um bom momento para", "favorece", "pede").
- Nunca fale de morte, doença, acidente, desgraça, traição ou qualquer previsão negativa. Desafios aparecem como cuidados gentis.
- Nada de termos médicos (diagnóstico, remédio, terapia como prescrição) nem financeiros específicos (investimento, ações, empréstimo, cripto, percentuais). Em dinheiro, fale de organização, escolhas conscientes e valorização do próprio trabalho.
- Sem emoji, sem listas com marcadores dentro dos textos, sem títulos em maiúsculas, sem jargão esotérico pesado. Frases claras, parágrafos curtos.
- Texto original e específico para os números desta pessoa (não genérico). Varie o começo das frases entre os meses.
Responda só com o JSON pedido.`

const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['abertura', 'ano_pessoal', 'arcano', 'destino', 'meses', 'amor', 'trabalho', 'dinheiro', 'emocional', 'foco', 'conselhos', 'favoraveis', 'fechamento'],
  properties: {
    abertura: { type: 'string', description: '2 a 3 frases de boas-vindas ao ano, citando o ano pessoal e o arcano' },
    ano_pessoal: { type: 'string', description: '2 parágrafos (separados por \\n\\n) sobre o ano pessoal em 2027' },
    arcano: { type: 'string', description: '1 a 2 parágrafos sobre o arcano do ano e o que ele convida a viver' },
    destino: { type: 'string', description: '1 parágrafo sobre o número do destino e como ele conversa com 2027' },
    meses: { type: 'array', description: 'exatamente 12 itens, janeiro a dezembro', items: { type: 'object', additionalProperties: false, required: ['mes', 'titulo', 'texto'],
      properties: { mes: { type: 'integer' }, titulo: { type: 'string', description: '2 a 4 palavras' }, texto: { type: 'string', description: '2 a 3 frases' } } } },
    amor: { type: 'string', description: '1 parágrafo' },
    trabalho: { type: 'string', description: '1 parágrafo' },
    dinheiro: { type: 'string', description: '1 parágrafo, sem conselho financeiro específico' },
    emocional: { type: 'string', description: '1 parágrafo, sem termos médicos' },
    foco: { type: 'string', description: '1 parágrafo sobre a área que a pessoa mais quer em 2027 (ou, se não escolheu, sobre o tema central do ano)' },
    conselhos: { type: 'array', description: 'exatamente 3 conselhos curtos (1 a 2 frases cada)', items: { type: 'string' } },
    favoraveis: { type: 'string', description: '1 parágrafo apresentando os meses e dias favoráveis recebidos' },
    fechamento: { type: 'string', description: '2 frases de despedida carinhosa' },
  },
}

export function montaPedido(nome: string, n: Numeros, foco: string | null) {
  const primeiro = nome.trim().split(/\s+/)[0]
  const fav = (k: string) => n.favoraveis[k].map(m => MESES[m - 1]).join(', ') || 'nenhum em destaque'
  return `Pessoa: ${nome} (chame de ${primeiro})
Nascimento: ${n.nascimento.split('-').reverse().join('/')}
O que mais quer em 2027: ${foco ? AREAS[foco] : 'não escolheu'}

NÚMEROS (já calculados, use exatamente estes):
- Ano pessoal 2027: ${n.anoPessoal} (${NUMEROS[n.anoPessoal].tema}: ${NUMEROS[n.anoPessoal].palavras})
- Arcano do ano: ${ARCANOS[n.arcano].romano}, ${n.arcanoNome} (${n.arcanoPalavras})
- Número do destino: ${n.destino} (${NUMEROS[n.destino].tema}: ${NUMEROS[n.destino].palavras})
- Meses pessoais de 2027:
${n.meses.map(m => `  ${m.nome}: ${m.numero} (${NUMEROS[m.numero].tema}: ${NUMEROS[m.numero].palavras})`).join('\n')}
- Meses mais favoráveis: amor (${fav('amor')}); trabalho (${fav('trabalho')}); dinheiro (${fav('dinheiro')}); emocional (${fav('emocional')}); família (${fav('familia')}); novos começos (${fav('comecos')})
- Dias do mês que vibram com o ano dela: ${n.dias.join(', ')}

Escreva o mapa.`
}

export async function escreverMapa(nome: string, n: Numeros, foco: string | null): Promise<{ textos: Textos; uso: any; modelo: string }> {
  const ia = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const modelos = [...new Set([seu2027.modelo(), 'claude-sonnet-5-5', 'claude-sonnet-5'])]
  let erro: any = null
  for (const modelo of modelos) {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      try {
        const r: any = await ia.messages.create({
          model: modelo, max_tokens: 12000, system: SISTEMA,
          output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
          messages: [{ role: 'user', content: montaPedido(nome, n, foco) }],
        } as any)
        if (r.stop_reason === 'refusal') throw new Error('a IA recusou')
        const txt = (r.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
        const t = JSON.parse(txt) as Textos
        if (!Array.isArray(t.meses) || t.meses.length !== 12 || !Array.isArray(t.conselhos) || t.conselhos.length < 3) throw new Error('mapa incompleto')
        t.meses = t.meses.map((m, i) => ({ ...m, mes: i + 1 }))
        t.conselhos = t.conselhos.slice(0, 3)
        return { textos: limpa(t), uso: r.usage, modelo }
      } catch (e) { erro = e }
    }
  }
  throw erro || new Error('IA indisponível')
}

// tira emoji e travessão longo que às vezes escapam
function limpa<T>(x: T): T {
  if (typeof x === 'string') return x.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/\s—\s/g, ', ').trim() as any
  if (Array.isArray(x)) return x.map(limpa) as any
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, limpa(v)])) as any
  return x
}
