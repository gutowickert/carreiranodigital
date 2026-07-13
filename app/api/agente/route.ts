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

Responda em português, direto e objetivo, com os números que importam. Formate valores em R$ e use listas/tabelas curtas quando ajudar. Você é SÓ-LEITURA: não altera nada no sistema (ainda).`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const email = (body.email || '').toString().trim().toLowerCase()
    if (!PERMITIDOS.includes(email)) return NextResponse.json({ ok: false, error: 'sem acesso ao agente' }, { status: 200 })
    const key = process.env.ANTHROPIC_API_KEY
    if (!key) return NextResponse.json({ ok: false, error: 'falta ANTHROPIC_API_KEY' }, { status: 200 })

    const historico = Array.isArray(body.mensagens) ? body.mensagens : []
    const messages: any[] = historico.map((m: any) => ({ role: m.role, content: m.content }))

    const client = new Anthropic({ apiKey: key })
    let passos = 0
    let final = ''
    while (passos < 8) {
      passos++
      const resp = await client.messages.create({ model: MODELO, max_tokens: 1500, system: SYSTEM(), tools: TOOLS as any, messages })
      const toolUses = (resp.content || []).filter((b: any) => b.type === 'tool_use')
      const texto = (resp.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
      if (resp.stop_reason !== 'tool_use' || !toolUses.length) { final = texto; break }
      // executa as ferramentas e devolve os resultados
      messages.push({ role: 'assistant', content: resp.content })
      const results: any[] = []
      for (const tu of toolUses as any[]) {
        let out: any
        try { out = await runTool(tu.name, tu.input, req.nextUrl.origin) } catch (e: any) { out = { erro: e?.message || 'falha' } }
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out) })
      }
      messages.push({ role: 'user', content: results })
    }
    return NextResponse.json({ ok: true, resposta: final || '(sem resposta)' })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
