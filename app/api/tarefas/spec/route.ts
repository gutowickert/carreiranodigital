import { NextRequest, NextResponse } from 'next/server'
import { getFluxo, primeiraTarefaFluxo, proximaTarefaFluxo } from '@/lib/fluxo'

// Devolve a especificação da tarefa (1ª da etapa, ou a PRÓXIMA após 'apos') lendo o FLUXO EDITÁVEL.
// Usado pelo CRM e pela página de Tarefas pra criar tarefas seguindo o que o Nando definiu no agente.
export async function POST(req: NextRequest) {
  try {
    const { etapa, apos } = await req.json().catch(() => ({}))
    if (!etapa) return NextResponse.json({ ok: false, error: 'faltou etapa' }, { status: 200 })
    const f = await getFluxo()
    const t = apos ? proximaTarefaFluxo(f, etapa, apos) : primeiraTarefaFluxo(f, etapa)
    if (!t) return NextResponse.json({ ok: true, tarefa: null })
    return NextResponse.json({ ok: true, tarefa: { chave: t.chave, titulo: t.titulo, descricao: t.descricao, diasAposEntrada: t.dias, acao: t.acao } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
