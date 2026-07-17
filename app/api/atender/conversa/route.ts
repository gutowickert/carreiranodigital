import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'

// Últimas mensagens de uma conversa — pra dar CONTEXTO na hora de aprovar a resposta na fila "Atender Agora".
export async function GET(req: NextRequest) {
  const org = await orgDaRequest(req.headers.get('authorization'))
  const conversaId = req.nextUrl.searchParams.get('conversaId')
  if (!conversaId) return NextResponse.json({ ok: false, error: 'faltou conversaId' }, { status: 200 })
  const { data } = await sb.from('wa_mensagens')
    .select('direcao,status,texto,tipo,criado_em')
    .eq('org_id', org)
    .eq('conversa_id', conversaId)
    .order('criado_em', { ascending: false })
    .limit(18)
  const msgs = (data || []).reverse().map((m: any) => ({
    de: (m.direcao === 'recebida' || m.status === 'recebida') ? 'cliente' : 'nos',
    texto: m.texto || (m.tipo === 'audio' ? '🎤 áudio' : m.tipo && m.tipo !== 'texto' ? `📎 ${m.tipo}` : ''),
    em: m.criado_em,
  }))
  return NextResponse.json({ ok: true, msgs })
}
