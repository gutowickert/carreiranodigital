import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { TOOLS, runTool } from '@/lib/agente-tools'

export const maxDuration = 120

// Agente Interno (só Guto, Nando, Rick). Loop de tool-use sobre os dados, SÓ-LEITURA.
export const PERMITIDOS = ['guto.wickert@gmail.com', 'debairros@hotmail.com', 'ricardovognach@hotmail.com']

const MODELO = 'claude-sonnet-4-6'
const hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const SYSTEM = () => `Você é o assistente interno da Carreira No Digital (escola de marketing digital com cursos presenciais no RS). Responde ao dono e aos sócios sobre a empresa: vendas, leads, marketing, financeiro, turmas e satisfação.

Hoje é ${hoje()} (America/Sao_Paulo). Você tem FERRAMENTAS que consultam os dados REAIS — use-as sempre que a pergunta pedir número/fato, nunca invente. Combine ferramentas quando precisar. Se a pergunta for vaga, assuma o período mais útil (ex.: últimos 30 dias) e diga qual usou.

Você consegue ler o SISTEMA INTEIRO: além das ferramentas específicas (panorama_vendas, financeiro, marketing, trafego, turmas_status, nps, detalhe_lead), há as GENÉRICAS 'esquema' (mostra tabelas/colunas), 'consultar' (lê qualquer tabela com filtros) e 'agregar' (conta/soma, agrupando). Se a pergunta não for coberta pelas específicas, use 'esquema' pra descobrir onde está o dado e depois 'consultar'/'agregar'. Nunca responda "não tenho esse dado" sem antes tentar as genéricas.

Pontos importantes: DESPESA/custo = lançamentos com tipo 'custo' (a ferramenta financeiro já trata). CAMPANHA do anúncio fica em leads.utm_campaign. GASTO de anúncio/tráfego vem ao vivo da Meta (ferramenta trafego, precisa de datas) — não está no banco.

CONCILIAÇÃO BANCÁRIA: se receber imagem/PDF de EXTRATO bancário, (1) extraia cada transação (data, valor, descrição) LENDO do documento — nunca invente; (2) puxe os lançamentos do sistema no mesmo período (ferramenta financeiro com incluir_previsto=true, ou consultar em lancamentos_empresa por data); (3) case por data+valor e liste o que NÃO bate: transações do extrato que faltam no sistema (sugerindo o lançamento — tipo receita/custo, valor, data, descrição) e lançamentos do sistema que não aparecem no extrato; (4) feche o caixa: saldo do extrato x soma dos lançamentos, apontando a diferença. Apresente em tabela clara. Você é só-leitura: SUGIRA os lançamentos a criar, não crie.

Responda em português, direto e objetivo, com os números que importam. Formate valores em R$ e use listas/tabelas curtas quando ajudar. Você é SÓ-LEITURA: não altera nada no sistema (ainda).

Quando a conversa render algo ESTRATÉGICO (uma decisão, um plano, um diagnóstico importante, uma descoberta que vale reler depois), sugira ao final: "💾 Se quiser, salve essa conversa (botão Salvar) pra continuar depois." Não faça isso em perguntas triviais/pontuais.

ATALHOS (escrita com confirmação): você PODE cadastrar despesas (inclusive em lote) e criar/atualizar leads — mas NUNCA grava direto. Use as ferramentas 'propor_despesas' e 'propor_lead' pra montar a proposta; o sistema mostra um cartão e o usuário clica em Confirmar pra efetivar. Antes de propor, confira se tem os dados essenciais (despesa: descrição+valor; lead: nome). Se faltar algo importante (ex.: valor de uma despesa), pergunte. Depois de propor, diga em 1 linha que é só confirmar no cartão abaixo. Nunca diga que já cadastrou — quem efetiva é o clique do usuário.`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const email = (body.email || '').toString().trim().toLowerCase()
    if (!PERMITIDOS.includes(email)) return NextResponse.json({ ok: false, error: 'sem acesso ao agente' }, { status: 200 })
    const key = process.env.ANTHROPIC_API_KEY
    if (!key) return NextResponse.json({ ok: false, error: 'falta ANTHROPIC_API_KEY' }, { status: 200 })

    const historico = Array.isArray(body.mensagens) ? body.mensagens : []
    const bloco = (a: any) => a.tipo === 'document'
      ? { type: 'document', source: { type: 'base64', media_type: a.media_type || 'application/pdf', data: a.data } }
      : { type: 'image', source: { type: 'base64', media_type: a.media_type || 'image/jpeg', data: a.data } }
    const messages: any[] = historico.map((m: any) => ({
      role: m.role,
      content: (Array.isArray(m.anexos) && m.anexos.length)
        ? [{ type: 'text', text: m.content || 'Analise o anexo.' }, ...m.anexos.map(bloco)]
        : m.content,
    }))

    const client = new Anthropic({ apiKey: key })
    let passos = 0
    let final = ''
    const pendencias: any[] = []
    let seqPend = 0
    while (passos < 8) {
      passos++
      const resp = await client.messages.create({ model: MODELO, max_tokens: 2800, system: SYSTEM(), tools: TOOLS as any, messages })
      const toolUses = (resp.content || []).filter((b: any) => b.type === 'tool_use')
      const texto = (resp.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
      if (resp.stop_reason !== 'tool_use' || !toolUses.length) { final = texto; break }
      // executa as ferramentas e devolve os resultados
      messages.push({ role: 'assistant', content: resp.content })
      const results: any[] = []
      for (const tu of toolUses as any[]) {
        let out: any
        try { out = await runTool(tu.name, tu.input, req.nextUrl.origin) } catch (e: any) { out = { erro: e?.message || 'falha' } }
        if (String(tu.name).startsWith('propor_') && out?.proposta) pendencias.push({ id: `p${++seqPend}`, ...out.proposta })
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out) })
      }
      messages.push({ role: 'user', content: results })
    }
    return NextResponse.json({ ok: true, resposta: final || '(sem resposta)', pendencias })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
