import Anthropic from '@anthropic-ai/sdk'
import { calcula, type Conta } from './conta'
import { converte, NICHOS } from './perguntas'
import catalogo from './nichos.json'
import { logIaUso } from '@/lib/ia-uso'

// Diagnóstico do Check-up de IA do teunegócio OS. A conta (conta.ts) faz os números; a IA só escreve
// e acha o que é específico do negócio. Trava: todo "R$" do texto tem que existir na conta; se a IA
// inventar valor, ela reescreve uma vez; se ainda sobrar, o valor sai do texto.

const MODELO = process.env.CHECKUP_MODELO || 'claude-sonnet-4-6'
const CAT = catalogo as Record<string, any>

export type Texto = {
  resumo: string
  oportunidades: { titulo: string; hoje: string; com_ia: string; impacto: string }[]
  extras: { titulo: string; porque: string }[]
  comece_hoje: string[]
  convite: string
}

function cliente() {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY não configurada')
  return new Anthropic({ apiKey: key })
}

// "Outro": acha o nicho do catálogo mais parecido com o que a pessoa vende
async function nichoMaisProximo(client: Anthropic, oQueVende: string): Promise<string> {
  const opcoes = NICHOS.filter(n => n[0] !== 'outro')
  try {
    const r = await client.messages.create({
      model: MODELO, max_tokens: 200,
      tools: [{ name: 'nicho', description: 'o nicho mais parecido', input_schema: { type: 'object', required: ['slug'], properties: { slug: { type: 'string', enum: opcoes.map(n => n[0]) } } } }],
      tool_choice: { type: 'tool', name: 'nicho' },
      messages: [{ role: 'user', content: `Um dono de negócio local disse que vende: "${oQueVende}". Qual destes tipos de negócio tem a rotina mais parecida (atendimento, agenda, orçamento, pós-venda)?\n${opcoes.map(n => n[0] + ': ' + n[1]).join('\n')}` }],
    })
    await logIaUso('checkup_nicho', MODELO, r.usage)
    const s = (r.content.find(c => c.type === 'tool_use') as any)?.input?.slug
    if (s && CAT[s]) return s
  } catch { /* cai no padrão */ }
  return 'loja-de-roupas'   // comércio local genérico, se a IA falhar
}

const RS = /R\$\s?\d[\d.]*(,\d+)?/g
const valorDe = (s: string) => Number(s.replace(/[^\d,]/g, '').replace(',', '.'))

export async function gerarDiagnostico(cru: Record<string, any>) {
  const client = cliente()
  const { num, legivel } = converte(cru)
  const nichoEscolhido = String(cru.nicho || '')
  const slug = CAT[nichoEscolhido] ? nichoEscolhido : await nichoMaisProximo(client, num.o_que_vende || '')
  const nicho = CAT[slug]
  const conta: Conta = calcula(num, nicho)
  const top = conta.tarefas.slice(0, 7).map(t => ({ ...t, horas_mes_em_reais: t.horas_semana.map(h => Math.round(h * conta.base.custo_hora * 4.33)) }))

  const sistema = `Tu escreve o diagnóstico do "Check-up de IA" do teunegócio OS (o sistema com IA da CarreiraNoDigital) para o dono de um negócio local no Brasil.
Regras: português do Brasil, tratando por "tu" com o verbo como se fala no Sul ("tu faz", "tu vende", "tu tem", nunca "tu fazes", "tu tocas"), frases curtas, sem emoji, sem travessão (use vírgula ou ponto), sem jargão (se usar um termo técnico, explica em 3 palavras).
NÚMEROS: use SOMENTE os números da CONTA abaixo, do jeito que estão (horas por semana, reais por mês, faixas). Nunca invente outro número, nunca some, nunca arredonde pra cima. Sempre como faixa e como estimativa a partir das respostas dele.
Nunca prometa resultado. Nunca cite preço de produto. Quem atende é "o especialista" (nunca um nome).
AS 3 RESPOSTAS ABERTAS MANDAM: "O que tu vende" diz exatamente o negócio (não invente outro tipo); "tirar UMA tarefa" é o que ele mais quer tirar da semana: a oportunidade nº 1 TEM que resolver isso (se não estiver na conta, ela vem mesmo assim, com impacto descrito sem número e "a avaliar com o especialista"); "maior desafio" tem que aparecer no resumo e ser respondido por pelo menos uma oportunidade.
Pense no negócio DELE: use o que ele respondeu (nicho, cidade, equipe, o que toma tempo) para tornar cada ponto concreto. Além das tarefas da conta, aponte até 3 oportunidades específicas do nicho ou da estrutura dele que a conta não cobriu, sem números.`
  const usuario = `NICHO: ${nicho.nome}\nRESPOSTAS: ${JSON.stringify(legivel)}\n\nCONHECIMENTO DO NICHO (dores e tarefas típicas): ${JSON.stringify({ dores: nicho.dores, perfil: nicho.perfil_tipico, observacoes: nicho.observacoes })}\n\nCONTA (não altere): ${JSON.stringify({ base: conta.base, horas_semana: conta.horas_semana, horas_mes_em_reais: conta.horas_mes_em_reais, receita_mes: conta.receita_mes, notas: conta.notas, premissas: conta.premissas, comparativos: conta.comparativos, top })}

Use os COMPARATIVOS com o setor no resumo quando ajudarem (ex.: 'tu recebe menos contatos que o típico do setor': aí a captação entra como ponto). A tarefa que bate com o que ele marcou como 'o que mais toma tempo' (campo doi=true) deve vir primeiro, se o impacto for parecido.

CONJUGAÇÃO (obrigatório, confere cada frase): "tu" com o verbo na forma de "você", como se fala no Sul. Certo: tu tem, tu vende, tu fatura, tu faz, tu perde, tu atende. Errado: tu tens, tu vendes, faturais, tu fazes, tu perdes.`
  const ferramenta: Anthropic.Tool = {
    name: 'diagnostico', description: 'O diagnóstico pronto pra mostrar ao dono.',
    input_schema: { type: 'object', required: ['resumo', 'oportunidades', 'extras', 'comece_hoje', 'convite'], properties: {
      resumo: { type: 'string', description: '3 frases: o retrato do negócio dele e onde está o maior ganho' },
      oportunidades: { type: 'array', maxItems: 5, items: { type: 'object', required: ['titulo', 'hoje', 'com_ia', 'impacto'], properties: {
        titulo: { type: 'string' }, hoje: { type: 'string', description: 'como é hoje no negócio dele' }, com_ia: { type: 'string', description: 'como fica, concreto' },
        impacto: { type: 'string', description: 'horas e/ou reais DA CONTA, como faixa' } } } },
      extras: { type: 'array', maxItems: 3, items: { type: 'object', required: ['titulo', 'porque'], properties: { titulo: { type: 'string' }, porque: { type: 'string' } } } },
      comece_hoje: { type: 'array', maxItems: 3, items: { type: 'string' }, description: 'o que ele faz hoje mesmo, de graça, sem sistema' },
      convite: { type: 'string', description: '1 a 2 frases convidando pra conversar com o especialista, sem pressão' },
    } },
  }

  const resp = await client.messages.create({ model: MODELO, max_tokens: 3000, system: sistema, tools: [ferramenta], tool_choice: { type: 'tool', name: 'diagnostico' }, messages: [{ role: 'user', content: usuario }] })
  await logIaUso('checkup_diagnostico', MODELO, resp.usage, { nicho: slug })
  const uso1 = resp.content.find(c => c.type === 'tool_use') as Anthropic.ToolUseBlock
  let d = uso1.input as Texto

  // trava dos números: só valem os R$ que existem na conta (2% de folga pra arredondamento)
  const permitidos: number[] = []
  const junta = (x: any) => { if (typeof x === 'number') permitidos.push(Math.round(x)); else if (Array.isArray(x)) x.forEach(junta); else if (x && typeof x === 'object') Object.values(x).forEach(junta) }
  junta({ base: conta.base, h: conta.horas_mes_em_reais, r: conta.receita_mes, top })
  const ok = (v: number) => permitidos.some(p => Math.abs(p - v) <= Math.max(2, p * 0.02))
  const fora = (o: any) => (JSON.stringify(o).match(RS) || []).map(valorDe).filter(v => !ok(v))
  let inventados = fora(d)
  if (inventados.length) {
    const r2 = await client.messages.create({ model: MODELO, max_tokens: 3000, system: sistema, tools: [ferramenta], tool_choice: { type: 'tool', name: 'diagnostico' }, messages: [
      { role: 'user', content: usuario }, { role: 'assistant', content: resp.content },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: uso1.id, content: 'Estes valores em reais NÃO estão na CONTA e não podem aparecer: ' + inventados.join(', ') + '. Reescreva usando só os números da CONTA (ou sem número). Não faça contas.' }] },
    ] })
    await logIaUso('checkup_diagnostico_reescrita', MODELO, r2.usage, { nicho: slug })
    const u2 = r2.content.find(c => c.type === 'tool_use') as Anthropic.ToolUseBlock | undefined
    if (u2) d = u2.input as Texto
    inventados = fora(d)
  }

  // limpeza final: sem travessão; valor que ainda escapou da conta sai do texto
  const limpa = (s: string) => String(s || '').replace(/\s*[—–]\s*/g, ', ').replace(RS, m => ok(valorDe(m)) ? m : 'um valor a avaliar com o especialista')
  const texto: Texto = JSON.parse(JSON.stringify(d, (_k, v) => typeof v === 'string' ? limpa(v) : v))
  texto.oportunidades = (texto.oportunidades || []).slice(0, 5)
  texto.extras = texto.extras || []
  texto.comece_hoje = texto.comece_hoje || []

  return {
    nicho: slug, nicho_nome: nicho.nome as string, nicho_escolhido: nichoEscolhido,
    conta, texto, respostas_legiveis: legivel, respostas_num: num,
    perguntas_especialista: (nicho.perguntas_especificas || []) as string[],
    valores_fora_da_conta: inventados,
  }
}
