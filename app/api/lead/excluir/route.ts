import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// Exclui um lead cadastrado por engano, limpando os registros ligados.
// Bloqueia se houver matrícula vinculada (não quebrar o financeiro).
export async function POST(req: NextRequest) {
  try {
    const { leadId } = await req.json()
    if (!leadId) return NextResponse.json({ ok: false, error: 'leadId obrigatório' }, { status: 400 })

    // Bloqueia se já virou matrícula (venda real)
    const { count } = await supabase.from('matriculas')
      .select('id', { count: 'exact', head: true }).eq('lead_id', leadId)
    if (count && count > 0) {
      return NextResponse.json({ ok: false, error: 'Lead tem matrícula vinculada — não pode ser excluído.' }, { status: 200 })
    }

    // Apaga os filhos diretos
    await supabase.from('tarefas_lead').delete().eq('lead_id', leadId)
    await supabase.from('lead_andamentos').delete().eq('lead_id', leadId)
    await supabase.from('ligacoes').delete().eq('lead_id', leadId)
    await supabase.from('contatos_lead').delete().eq('lead_id', leadId)
    // Desvincula a conversa do WhatsApp e o clique (mantém o histórico)
    await supabase.from('wa_conversas').update({ lead_id: null }).eq('lead_id', leadId)
    await supabase.from('wa_clicks').update({ lead_id: null }).eq('lead_id', leadId)

    const { error } = await supabase.from('leads').delete().eq('id', leadId)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}
