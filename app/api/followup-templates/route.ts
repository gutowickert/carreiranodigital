import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'

// Templates de follow-up (oficial) mapeados à cadência do CRM. Editáveis pela equipe antes de submeter ao Meta.
const GRAPH = 'https://graph.facebook.com/v25.0'

// Puxa o status REAL de cada template na Meta e reflete no banco (APPROVED→aprovado, resto→submetido).
// Assim a tela mostra a verdade sem a equipe marcar na mão. Best-effort — nunca quebra a listagem.
async function sincronizarStatusMeta(org: string) {
  try {
    const { data: conta } = await sb.from('wa_oficial_config').select('waba_id, token').eq('org_id', org).eq('ativo', true).not('waba_id', 'is', null).order('criado_em', { ascending: false }).limit(1).maybeSingle()
    const WABA = conta?.waba_id || process.env.WA_OFICIAL_WABA_ID || ''
    const TOKEN = conta?.token || process.env.WA_OFICIAL_TOKEN || ''
    if (!WABA || !TOKEN) return
    const res = await fetch(`${GRAPH}/${WABA}/message_templates?fields=name,status&limit=250`, { headers: { Authorization: `Bearer ${TOKEN}` } })
    const j = await res.json().catch(() => ({} as any))
    if (!res.ok || !j?.data) return
    const metaStatus = new Map<string, string>()
    for (const t of j.data) metaStatus.set(t.name, t.status) // APPROVED | PENDING | REJECTED | ...
    const { data: locais } = await sb.from('followup_templates').select('id, nome_meta, status').eq('org_id', org).eq('ativo', true)
    for (const t of locais || []) {
      const ms = metaStatus.get(t.nome_meta)
      if (!ms) continue
      const novo = ms === 'APPROVED' ? 'aprovado' : ms === 'REJECTED' ? 'rejeitado' : 'submetido'
      if (novo !== t.status) await sb.from('followup_templates').update({ status: novo }).eq('id', t.id)
    }
  } catch { /* best-effort */ }
}

export async function GET(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    await sincronizarStatusMeta(org)
    const { data } = await sb.from('followup_templates').select('*').eq('org_id', org).eq('ativo', true).order('ordem')
    return NextResponse.json({ ok: true, templates: data || [] })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({}))
    const id = (b.id || '').toString()
    if (!id) return NextResponse.json({ ok: false, error: 'falta id' }, { status: 200 })
    const patch: any = { atualizado_em: new Date().toISOString() }
    for (const k of ['corpo', 'nome_meta', 'categoria', 'status', 'variaveis'] as const) {
      if (typeof b[k] === 'string') patch[k] = b[k]
    }
    await sb.from('followup_templates').update(patch).eq('org_id', org).eq('id', id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
