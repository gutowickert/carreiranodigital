import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { fazerLigacao } from '@/lib/api4com'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { leadId, vendedorId, ramal } = body
    if (!leadId) return NextResponse.json({ ok: false, error: 'leadId obrigatorio' }, { status: 400 })

    const { data: lead } = await supabase
      .from('leads')
      .select('id, nome, whatsapp, vendedor_id')
      .eq('id', leadId)
      .single()
    if (!lead) return NextResponse.json({ ok: false, error: 'lead nao encontrado' }, { status: 404 })

    const ext = ramal || process.env.API4COM_RAMAL_PADRAO || ''
    const fone = lead.whatsapp || ''
    const vend = vendedorId || lead.vendedor_id || null

    const r = await fazerLigacao(ext, fone, { gateway: 'carreiranodigital', leadId: lead.id, vendedorId: vend })
    if (!r.ok) return NextResponse.json(r, { status: 200 })

    await supabase.from('ligacoes').insert({
      api4com_id: r.id,
      lead_id: lead.id,
      vendedor_id: vend,
      telefone: fone,
      ramal: ext,
      status: 'iniciada',
      metadata: { gateway: 'carreiranodigital', leadId: lead.id },
    })

    return NextResponse.json({ ok: true, id: r.id })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}