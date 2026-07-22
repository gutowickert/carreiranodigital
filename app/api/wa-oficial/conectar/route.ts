import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'

// Fecha o Embedded Signup (Coexistência): troca o `code` por token, inscreve a WABA no webhook,
// e guarda phone_number_id/waba_id/token em wa_oficial_config. Depois o followup usa esse número.
const APP_ID = process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID || ''
const APP_SECRET = process.env.META_APP_SECRET || ''
const GRAPH = 'https://graph.facebook.com/v25.0'

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({}))
    const code = (b.code || '').toString()
    const phoneNumberId = (b.phoneNumberId || '').toString()
    const wabaId = (b.wabaId || '').toString()
    const rotulo = (b.rotulo || 'Coexistência').toString()
    if (!code) return NextResponse.json({ ok: false, error: 'faltou o code do login' }, { status: 200 })
    if (!APP_ID || !APP_SECRET) return NextResponse.json({ ok: false, error: 'faltam META_APP_ID / META_APP_SECRET no servidor (Vercel).' }, { status: 200 })

    // 1) code -> token de negócio (permanente no Embedded Signup)
    const tk = await fetch(`${GRAPH}/oauth/access_token?client_id=${encodeURIComponent(APP_ID)}&client_secret=${encodeURIComponent(APP_SECRET)}&code=${encodeURIComponent(code)}`).then(r => r.json()).catch(() => null)
    const token = tk?.access_token
    if (!token) return NextResponse.json({ ok: false, error: 'não consegui trocar o code por token: ' + JSON.stringify(tk?.error || tk) }, { status: 200 })

    // 2) inscreve a WABA no app (pra receber respostas no webhook) — best-effort
    let inscrito = false
    if (wabaId) {
      const s = await fetch(`${GRAPH}/${wabaId}/subscribed_apps`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => null)
      inscrito = !!s?.success
    }

    // 3) salva/atualiza a conexão
    const { data: existe } = await sb.from('wa_oficial_config').select('id').eq('org_id', org).eq('phone_number_id', phoneNumberId).maybeSingle()
    if (existe) {
      await sb.from('wa_oficial_config').update({ waba_id: wabaId, token, rotulo, ativo: true, atualizado_em: new Date().toISOString() }).eq('id', existe.id)
    } else {
      await sb.from('wa_oficial_config').insert({ org_id: org, rotulo, phone_number_id: phoneNumberId, waba_id: wabaId, token, ativo: true })
    }
    return NextResponse.json({ ok: true, phoneNumberId, wabaId, inscrito })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}

// lista as conexões salvas (pra tela mostrar o que já está conectado)
export async function GET(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const { data } = await sb.from('wa_oficial_config').select('id, rotulo, phone_number_id, waba_id, ativo, criado_em').eq('org_id', org).order('criado_em', { ascending: false })
    return NextResponse.json({ ok: true, contas: data || [] })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
