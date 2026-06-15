import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// Webhook da API Oficial (Cloud API): recebe STATUS das mensagens enviadas
// (sent/delivered/read/failed) e atualiza cada envio do disparo pelo wamid.
const VERIFY_TOKEN = process.env.WA_OFICIAL_VERIFY_TOKEN || 'cnd-wa-2026'

// Verificação do webhook (a Meta chama via GET ao configurar)
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const mode = sp.get('hub.mode')
  const token = sp.get('hub.verify_token')
  const challenge = sp.get('hub.challenge')
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new NextResponse(challenge || '', { status: 200 })
  }
  return new NextResponse('forbidden', { status: 403 })
}

const MAP: Record<string, string> = { sent: 'enviado', delivered: 'entregue', read: 'lido', failed: 'falha' }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const entries = body.entry || []
    for (const e of entries) {
      for (const ch of (e.changes || [])) {
        const statuses = ch.value?.statuses || []
        for (const st of statuses) {
          const wamid = st.id
          const novo = MAP[st.status] || st.status
          const erro = (st.errors && st.errors[0]) ? `${st.errors[0].code || ''} ${st.errors[0].title || st.errors[0].message || ''}`.trim() : null
          if (!wamid) continue
          const patch: any = { status: novo, atualizado_em: new Date().toISOString() }
          if (erro) patch.erro = erro
          await supabase.from('wa_disparo_envios').update(patch).eq('wamid', wamid)
        }
      }
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}
