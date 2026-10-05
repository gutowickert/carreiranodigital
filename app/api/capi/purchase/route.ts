import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPurchase } from '@/lib/capi'
import { eventoMensagens } from '@/lib/ctwa'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Dispara a Purchase pro CAPI a partir de uma matrícula já criada.
// Chamado pela tela da turma logo após registrar a venda manual.
export async function POST(req: NextRequest) {
  let body: any = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const matriculaId = (body.matricula_id || '').toString().trim()
  if (!matriculaId) {
    return NextResponse.json({ error: 'matricula_id obrigatório' }, { status: 400 })
  }

  const { data: mat } = await supabase.from('matriculas')
    .select('id, valor_pago, turma_id, aluno_id, lead_id')
    .eq('id', matriculaId).maybeSingle()
  if (!mat) {
    return NextResponse.json({ error: 'Matrícula não encontrada' }, { status: 404 })
  }

  const { data: aluno } = await supabase.from('alunos')
    .select('nome, email, whatsapp').eq('id', mat.aluno_id).maybeSingle()

  const { data: turma } = await supabase.from('turmas')
    .select('codigo').eq('id', mat.turma_id).maybeSingle()

  let fbp: string | null = null
  let fbc: string | null = null
  if (mat.lead_id) {
    const { data: lead } = await supabase.from('leads')
      .select('fbp, fbc').eq('id', mat.lead_id).maybeSingle()
    if (lead) { fbp = lead.fbp; fbc = lead.fbc }
  }

  const capi = await sendPurchase({
    eventId: mat.id,
    value: Number(mat.valor_pago) || 0,
    currency: 'BRL',
    email: aluno?.email || null,
    phone: aluno?.whatsapp || null,
    firstName: aluno?.nome || null,
    fbc,
    fbp,
    externalId: mat.lead_id || mat.aluno_id,
    codigoTurma: turma?.codigo || null,
  })

  // Lead que veio de ANÚNCIO DE WHATSAPP: a venda também vai pelo canal de mensagens, com o id do
  // clique (ctwa_clid). É só assim que a Meta credita a venda ao anúncio de WhatsApp (lib/ctwa.ts).
  if (mat.lead_id) {
    const { data: lw } = await supabase.from('leads').select('ctwa_clid, whatsapp').eq('id', mat.lead_id).maybeSingle()
    if (lw?.ctwa_clid) {
      try { await eventoMensagens('Purchase', { leadId: mat.lead_id, ctwaClid: lw.ctwa_clid, telefone: lw.whatsapp, codigoTurma: turma?.codigo || null, valor: Number(mat.valor_pago) || 0, eventId: `Purchase-${mat.id}` }) } catch { /* melhor esforço */ }
    }
  }

  // (o log em webhook_logs origem='capi-purchase' agora é feito dentro do sendCapiEvent — não duplica aqui)
  if (!capi.ok) {
    console.error('CAPI Purchase (manual) falhou:', capi.error)
    return NextResponse.json({ ok: false, error: capi.error }, { status: 200 })
  }
  return NextResponse.json({ ok: true }, { status: 200 })
}