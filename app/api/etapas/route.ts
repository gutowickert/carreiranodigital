import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'

const slug = (s: string) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)

// Etapas do funil da org. GET = lista; POST {etapas:[...]} = salva a lista inteira (ordem/edições/novas).
export async function GET(req: Request) {
  const org = await orgDaRequest(req.headers.get('authorization'))
  const { data } = await sb.from('etapas').select('id, chave, label, ordem, cor, papel, ativo').eq('org_id', org).order('ordem', { ascending: true })
  return NextResponse.json({ ok: true, etapas: data || [] })
}

export async function POST(req: Request) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({}))
    const arr = Array.isArray(b.etapas) ? b.etapas : []
    let i = 0
    for (const e of arr) {
      const label = (e.label || '').toString().trim()
      if (!label) continue
      const campos: any = {
        label: label.slice(0, 60), ordem: i, cor: (e.cor || '').toString().slice(0, 20) || null,
        papel: ['ativa', 'ganho', 'perda', 'parking'].includes(e.papel) ? e.papel : 'ativa',
        ativo: e.ativo !== false,
      }
      if (e.id) {
        await sb.from('etapas').update(campos).eq('org_id', org).eq('id', e.id)
      } else {
        const chave = slug(e.chave || label) || ('etapa_' + i)
        await sb.from('etapas').insert({ ...campos, org_id: org, chave }).select('id')
      }
      i++
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
