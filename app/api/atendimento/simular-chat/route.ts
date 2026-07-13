import { NextRequest, NextResponse } from 'next/server'
import { sugerirAtendimento } from '@/lib/atendimento-ia'

export const maxDuration = 120

// Simulação de conversa multi-turno: você faz de LEAD, a IA de vendas conduz.
//  POST { dialog: [{de:'lead'|'vendedor', texto}], produto?, cidade? } -> próxima mensagem do vendedor + meta
export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}))
    const dialog = Array.isArray(b.dialog) ? b.dialog : []
    if (!dialog.length) return NextResponse.json({ ok: false, error: 'diálogo vazio' }, { status: 200 })
    const situacaoTexto = dialog.map((m: any) => (m.de === 'lead' ? 'CLIENTE: ' : 'NÓS: ') + (m.texto || '')).join('\n')
    const r = await sugerirAtendimento({ situacaoTexto, produtoHint: b.produto, cidadeHint: b.cidade })
    if (!r.ok) return NextResponse.json(r)
    const s = r.sugestao
    return NextResponse.json({ ok: true, resposta: s.resposta, meta: { etapa: s.etapa_funil, acao: s.acao_sugerida, objecao: s.objecao, proximo: s.proximo_passo, etiqueta: s.etiqueta } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
