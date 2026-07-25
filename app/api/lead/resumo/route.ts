import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { gerarResumo } from '@/lib/resumo-lead'

export const maxDuration = 60

const suf = (t: string) => (t || '').replace(/\D/g, '').slice(-8)

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const body = await req.json().catch(() => ({}))
    const leadId: string | undefined = body.leadId
    const forcar: boolean = !!body.forcar
    if (!leadId) return NextResponse.json({ ok: false, error: 'falta leadId' }, { status: 200 })

    const { data: lead } = await supabase.from('leads')
      .select('id, nome, whatsapp, etapa, codigo_turma, resumo_ia, resumo_ia_em').eq('org_id', org).eq('id', leadId).single()
    if (!lead) return NextResponse.json({ ok: false, error: 'lead não encontrado' }, { status: 200 })

    // conversas do lead (por lead_id e por sufixo do telefone)
    const s = suf(lead.whatsapp)
    const { data: convs } = await supabase.from('wa_conversas').select('id').eq('org_id', org)
      .or(`lead_id.eq.${leadId}${s.length === 8 ? `,telefone.ilike.%${s}` : ''}`)
    const convIds = (convs || []).map((c: any) => c.id)

    // última atividade (msg ou andamento) — pra saber se o cache está velho
    let ultimaMsg: string | null = null
    if (convIds.length) {
      const { data } = await supabase.from('wa_mensagens').select('criado_em').in('conversa_id', convIds)
        .order('criado_em', { ascending: false }).limit(1).maybeSingle()
      ultimaMsg = data?.criado_em || null
    }
    const { data: ultAnd } = await supabase.from('lead_andamentos').select('criado_em').eq('lead_id', leadId)
      .order('criado_em', { ascending: false }).limit(1).maybeSingle()
    const ultimaAtividade = [ultimaMsg, ultAnd?.criado_em].filter(Boolean).sort().pop() || null
    const stale = !lead.resumo_ia_em || (ultimaAtividade ? lead.resumo_ia_em < ultimaAtividade : false)

    // sem forçar: devolve o cache (não chama a IA)
    if (!forcar) {
      return NextResponse.json({ ok: true, resumo: lead.resumo_ia || null, em: lead.resumo_ia_em || null, stale, temMensagens: convIds.length > 0 })
    }

    // ---- gera com o DOSSIÊ ÚNICO (mensagens dos 2 canais + andamentos + LIGAÇÕES transcritas) ----
    const key = process.env.ANTHROPIC_API_KEY
    if (!key) return NextResponse.json({ ok: false, error: 'Falta ANTHROPIC_API_KEY no servidor.' }, { status: 200 })

    // transcreve áudios pendentes ANTES (o dossiê lê wa_mensagens.texto)
    const dgKey = process.env.DEEPGRAM_API_KEY
    if (convIds.length && dgKey) {
      const { data: msgs } = await supabase.from('wa_mensagens')
        .select('id, texto, midia_url').in('conversa_id', convIds).eq('tipo', 'audio')
        .order('criado_em', { ascending: false }).limit(15)
      const pendentes = (msgs || []).filter((m: any) => m.midia_url && !(m.texto || '').trim())
      await Promise.all(pendentes.map(async (m: any) => {
        try {
          const a = await fetch(m.midia_url); if (!a.ok) return
          const buf = Buffer.from(await a.arrayBuffer())
          const r = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=pt&smart_format=true', {
            method: 'POST', headers: { Authorization: 'Token ' + dgKey, 'Content-Type': 'audio/ogg' }, body: buf,
          })
          const j = await r.json()
          const tx = (j?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '').trim()
          if (tx) await supabase.from('wa_mensagens').update({ texto: '🎤 ' + tx }).eq('id', m.id)
        } catch { /* ignora */ }
      }))
    }

    const out = await gerarResumo(supabase, org, lead)
    if (!out) return NextResponse.json({ ok: false, error: 'não consegui gerar o resumo agora' }, { status: 200 })
    return NextResponse.json({ ok: true, resumo: out, em: new Date().toISOString(), stale: false, temMensagens: convIds.length > 0 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}
