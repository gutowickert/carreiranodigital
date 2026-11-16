// Maia, lançamento: o quadro do CRM (/dashboard/lancamento-maia, 15/11/2026). Mesmo dado da tela da equipe
// (/maia/operacao/lancamento.html), mas pra quem está logado no CRM da escola, sem a senha do painel.
//   GET                       → as etapas, os contadores e um cartão por pessoa da lista
//   POST {id, etapa}          → muda a etapa (o "mover o cartão" do quadro)
// O resto (coleta, fotos, peças, aprovar e entregar) continua na tela da equipe.
import { chamadaPermitida } from '@/lib/exigir-login'
import { maiaDb as db } from '@/lib/maia/db'
import { ETAPAS, contato as acha, salva, lancamentoLigado } from '@/lib/maia/lancamento/base'

const ok = (d: any) => Response.json(d)
const erro = (m: string, s = 400) => Response.json({ erro: m }, { status: s })

function cartao(c: any) {
  const k = c.coleta || {}
  return {
    id: c.id, nome: c.nome, final: String(c.telefone || '').slice(-4), versao: c.versao, remessa: c.remessa,
    negocio: k.nome_negocio || k.negocio || null, cidade: k.cidade || c.cidade || null, etapa: c.etapa,
    entrega_em: c.entrega_em, entregue_em: c.entregue_em, aberturas: c.aberturas || 0, testou: !!c.testou_em,
    rick_pendente: !!(c.rick_pendente_em && !c.rick_feito_em), duvida: !!c.estado?.duvida, em_teste: c.estado?.modo === 'teste',
    atualizado_em: c.ultima_entrada_em || c.atualizado_em,
  }
}

export async function GET(req: Request) {
  if (!(await chamadaPermitida(req))) return erro('faça login', 401)
  try {
    const todos = await db.lista('lanc_contatos')
    const lista = todos.map(cartao).sort((a, b) => String(b.atualizado_em || '').localeCompare(String(a.atualizado_em || '')))
    const conta: Record<string, number> = Object.fromEntries(ETAPAS.map(e => [e.chave, 0]))
    for (const c of lista) conta[c.etapa] = (conta[c.etapa] || 0) + 1
    return ok({ ok: true, ligado: lancamentoLigado(), etapas: ETAPAS, conta, total: lista.length, lista })
  } catch (e: any) {
    return erro(e?.message || 'falha ao ler a lista', 500)
  }
}

export async function POST(req: Request) {
  if (!(await chamadaPermitida(req))) return erro('faça login', 401)
  const b = await req.json().catch(() => ({} as any))
  if (!ETAPAS.some(e => e.chave === b.etapa)) return erro('etapa inválida')
  const c = await acha(String(b.id || ''))
  if (!c) return erro('contato não existe', 404)
  await salva(c, { etapa: b.etapa })
  return ok({ ok: true })
}
