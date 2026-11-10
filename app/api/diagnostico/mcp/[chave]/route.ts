// Conector MCP do diagnóstico (pra adicionar no claude.ai como "conector personalizado").
// Endereço: https://<site>/api/diagnostico/mcp/<DIAGNOSTICO_MCP_CHAVE>
// MCP "Streamable HTTP" sem estado: cada POST traz JSON-RPC 2.0 (um pedido ou uma lista) e a resposta volta
// em application/json (sem SSE, sem Mcp-Session-Id). Chave errada ou não configurada → 404. GET → 405.
// Ferramentas: instagram_perfil, site_analise, google_empresa. (Anúncios ficam com o conector oficial da Meta.)
import { timingSafeEqual } from 'node:crypto'
import { perfilInstagramDiagnostico } from '@/lib/diagnostico/instagram'
import { analisarSite } from '@/lib/diagnostico/site'
import { empresaGoogle } from '@/lib/diagnostico/google'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const VERSOES = ['2025-06-18', '2025-03-26']
const SERVIDOR = { name: 'diagnostico-carreira', version: '1.0.0' }
const INSTRUCOES =
  'Ferramentas pra montar o diagnóstico de marketing de uma empresa: instagram_perfil (perfil público e postagens de conta profissional), ' +
  'site_analise (o que o site mostra, WhatsApp, pixel, tag do Google e velocidade no celular) e google_empresa (ficha e avaliações no Google). ' +
  'Use só dados que as ferramentas devolverem; se uma falhar, diga o que não deu pra ver em vez de inventar. Anúncios: use o conector da Meta.'

const FERRAMENTAS = [
  {
    name: 'instagram_perfil',
    title: 'Perfil público do Instagram',
    description:
      'Lê o perfil PÚBLICO de uma conta PROFISSIONAL do Instagram (comercial ou criador) pelo caminho oficial da Meta. ' +
      'Devolve nome, bio, site, seguidores, total de posts, as últimas 18 postagens (tipo, data, curtidas, comentários, legenda, link) ' +
      'e um resumo: dias desde a última postagem, postagens nos últimos 30 dias e quantos vídeos/reels há nas últimas 9. ' +
      'Use quando precisar avaliar o Instagram de uma empresa. Contas pessoais ou inexistentes voltam com erro.',
    inputSchema: {
      type: 'object',
      properties: { usuario: { type: 'string', description: 'O @ da conta, com ou sem arroba (ex.: padariadojoao)' } },
      required: ['usuario'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'site_analise',
    title: 'Análise do site',
    description:
      'Abre o site de uma empresa e diz o que o visitante encontra: se abriu, endereço final, título, descrição, títulos principais (h1), ' +
      'o texto do topo da página, links de WhatsApp, telefones, se tem pixel da Meta e tag do Google, e a velocidade no celular ' +
      '(nota 0 a 100 do PageSpeed do Google). Use quando precisar avaliar o site de uma empresa. Pode levar até ~50 segundos.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string', description: 'Endereço do site (ex.: https://www.exemplo.com.br ou exemplo.com.br)' } },
      required: ['url'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'google_empresa',
    title: 'Empresa no Google',
    description:
      'Procura a empresa no Google Maps/Perfil da Empresa e devolve até 3 candidatos com endereço, situação, nota, total de avaliações, ' +
      'site, telefone, horários, link do Maps e as avaliações mais recentes (até 5 por empresa). Confira pelo endereço qual candidato ' +
      'é a empresa certa. Use quando precisar avaliar a presença da empresa no Google. A API não informa se a empresa responde às avaliações.',
    inputSchema: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Nome da empresa como aparece no Google (ex.: Ritter Esquadrias)' },
        cidade: { type: 'string', description: 'Cidade (e estado, se ajudar) — ex.: Lajeado RS' },
      },
      required: ['nome', 'cidade'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
]

function chaveOk(recebida: string): boolean {
  const certa = process.env.DIAGNOSTICO_MCP_CHAVE
  if (!certa) return false
  const a = Buffer.from(recebida || '')
  const b = Buffer.from(certa)
  return a.length === b.length && timingSafeEqual(a, b)
}

const naoEncontrado = () => new Response('Not Found', { status: 404 })
const json = (dados: unknown, status = 200) =>
  new Response(JSON.stringify(dados), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })

type Pedido = { jsonrpc?: string; id?: string | number | null; method?: string; params?: any }
const erro = (id: any, code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })
const ok = (id: any, result: unknown) => ({ jsonrpc: '2.0', id, result })

async function chamarFerramenta(nome: string, args: any): Promise<unknown> {
  const a = args && typeof args === 'object' ? args : {}
  if (nome === 'instagram_perfil') return perfilInstagramDiagnostico(String(a.usuario ?? ''))
  if (nome === 'site_analise') return analisarSite(String(a.url ?? ''))
  if (nome === 'google_empresa') return empresaGoogle(String(a.nome ?? ''), String(a.cidade ?? ''))
  throw Object.assign(new Error(`ferramenta desconhecida: ${nome}`), { codigo: -32602 })
}

// devolve a resposta JSON-RPC, ou null se for notificação (sem id)
async function atender(p: Pedido): Promise<object | null> {
  const notificacao = !p || typeof p !== 'object' || !('id' in p) || p.id === undefined
  if (!p || typeof p !== 'object' || p.jsonrpc !== '2.0' || typeof p.method !== 'string') {
    return notificacao && p && typeof p === 'object' && 'result' in p ? null : erro(p?.id, -32600, 'pedido inválido')
  }
  if (notificacao) return null // notifications/initialized, notifications/cancelled etc.: nada a responder
  const { id, method, params } = p
  switch (method) {
    case 'initialize': {
      const pedida = params?.protocolVersion
      return ok(id, {
        protocolVersion: VERSOES.includes(pedida) ? pedida : VERSOES[0],
        capabilities: { tools: {} },
        serverInfo: SERVIDOR,
        instructions: INSTRUCOES,
      })
    }
    case 'ping':
      return ok(id, {})
    case 'tools/list':
      return ok(id, { tools: FERRAMENTAS })
    case 'tools/call': {
      const nome = params?.name
      if (typeof nome !== 'string') return erro(id, -32602, 'falta o nome da ferramenta')
      try {
        const dados: any = await chamarFerramenta(nome, params?.arguments)
        const falhou = dados && typeof dados === 'object' && dados.ok === false
        return ok(id, { content: [{ type: 'text', text: JSON.stringify(dados) }], ...(falhou ? { isError: true } : {}) })
      } catch (e: any) {
        if (e?.codigo) return erro(id, e.codigo, e.message)
        return ok(id, { content: [{ type: 'text', text: JSON.stringify({ ok: false, erro: 'falha inesperada: ' + String(e?.message || e).slice(0, 200) }) }], isError: true })
      }
    }
    default:
      return erro(id, -32601, `método não suportado: ${method}`)
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ chave: string }> }) {
  const { chave } = await params
  if (!chaveOk(chave)) return naoEncontrado()
  let corpo: any
  try { corpo = await req.json() } catch { return json(erro(null, -32700, 'JSON inválido'), 400) }

  if (Array.isArray(corpo)) {
    if (!corpo.length) return json(erro(null, -32600, 'lista vazia'), 400)
    const respostas = (await Promise.all(corpo.map(atender))).filter(Boolean)
    return respostas.length ? json(respostas) : new Response(null, { status: 202 })
  }
  const resposta = await atender(corpo)
  return resposta ? json(resposta) : new Response(null, { status: 202 })
}

export async function GET(_req: Request, { params }: { params: Promise<{ chave: string }> }) {
  const { chave } = await params
  if (!chaveOk(chave)) return naoEncontrado()
  return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ chave: string }> }) {
  const { chave } = await params
  if (!chaveOk(chave)) return naoEncontrado()
  return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } })
}
