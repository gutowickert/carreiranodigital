import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// Controle de Qualidade dos atendimentos da IA (Nando + Guto + Rick).
//  GET ?email= -> atendimentos da IA (leads atendido_por='ia') + conversa + última revisão + métricas
//  POST { email, lead_id, nota, status, comentario } -> salva a revisão (webhook_logs origem='qc-ia')
const PERMITIDOS = ['guto.wickert@gmail.com', 'debairros@hotmail.com', 'ricardovognach@hotmail.com', 'tizonmidia@gmail.com']
const ok = (e: string) => PERMITIDOS.includes((e || '').toLowerCase())
const suf = (t: string) => (t || '').replace(/\D/g, '').slice(-8)

export async function GET(req: NextRequest) {
  try {
    const email = (req.nextUrl.searchParams.get('email') || '').toLowerCase()
    if (!ok(email)) return NextResponse.json({ ok: false, error: 'sem acesso' }, { status: 200 })

    const { data: leads } = await supabase.from('leads')
      .select('id, nome, whatsapp, etapa, codigo_turma').eq('atendido_por', 'ia').limit(60)
    const alvo = leads || []

    // conversas dos leads da IA
    let mensagens: any[] = []
    if (alvo.length) {
      const { data: convs } = await supabase.from('wa_conversas').select('id, telefone, lead_id')
      const byLead: Record<string, string[]> = {}, telConv: Record<string, string[]> = {}
      for (const c of (convs || [])) { if (c.lead_id) (byLead[c.lead_id] = byLead[c.lead_id] || []).push(c.id); const s = suf(c.telefone); if (s.length === 8) (telConv[s] = telConv[s] || []).push(c.id) }
      const idsDe = (l: any) => [...new Set([...(byLead[l.id] || []), ...(telConv[suf(l.whatsapp)] || [])])]
      const todos = [...new Set(alvo.flatMap(idsDe))]
      const porLead: Record<string, string[]> = Object.fromEntries(alvo.map(l => [l.id, idsDe(l)]))
      if (todos.length) {
        const { data } = await supabase.from('wa_mensagens').select('conversa_id, direcao, status, texto, criado_em').in('conversa_id', todos).order('criado_em', { ascending: false }).limit(2000)
        mensagens = data || []
      }
      var linhasDe = (l: any) => {
        const ids = porLead[l.id] || []
        return mensagens.filter(m => ids.includes(m.conversa_id)).sort((a, b) => +new Date(a.criado_em) - +new Date(b.criado_em)).slice(-14)
          .map(m => ({ quem: (m.direcao === 'recebida' || m.status === 'recebida') ? 'cliente' : 'nos', texto: (m.texto || '').slice(0, 400), em: m.criado_em }))
      }
    }

    // revisões salvas
    const { data: revs } = await supabase.from('webhook_logs').select('payload, recebido_em').eq('origem', 'qc-ia').order('recebido_em', { ascending: false })
    const ultimaPorLead: Record<string, any> = {}
    for (const r of (revs || [])) { const p: any = r.payload; if (p?.lead_id && !ultimaPorLead[p.lead_id]) ultimaPorLead[p.lead_id] = { ...p, em: r.recebido_em } }

    const atendimentos = alvo.map(l => ({
      lead_id: l.id, nome: l.nome, etapa: l.etapa, turma: l.codigo_turma, whatsapp: l.whatsapp,
      mensagens: typeof linhasDe === 'function' ? linhasDe(l) : [], revisao: ultimaPorLead[l.id] || null,
    }))

    // métricas (todas as revisões)
    const todasRev = (revs || []).map((r: any) => r.payload).filter(Boolean)
    const notas = todasRev.filter((r: any) => r.nota != null).map((r: any) => r.nota)
    const metrics = {
      revisados: todasRev.length,
      nota_media: notas.length ? +(notas.reduce((a: number, b: number) => a + b, 0) / notas.length).toFixed(1) : 0,
      ok: todasRev.filter((r: any) => r.status === 'ok').length,
      corrigir: todasRev.filter((r: any) => r.status === 'corrigir').length,
      assumir: todasRev.filter((r: any) => r.status === 'assumir').length,
      na_fila: alvo.length,
    }
    return NextResponse.json({ ok: true, atendimentos, metrics })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}))
    const email = (b.email || '').toLowerCase()
    if (!ok(email)) return NextResponse.json({ ok: false, error: 'sem acesso' }, { status: 200 })
    if (!b.lead_id || !['ok', 'corrigir', 'assumir'].includes(b.status)) return NextResponse.json({ ok: false, error: 'dados inválidos' }, { status: 200 })
    await supabase.from('webhook_logs').insert({ origem: 'qc-ia', evento: b.status, status: 'processado', payload: { lead_id: b.lead_id, nota: b.nota ? Number(b.nota) : null, status: b.status, comentario: (b.comentario || '').toString().slice(0, 800), revisor: email } })
    // se "assumir", devolve o lead pro humano
    if (b.status === 'assumir') await supabase.from('leads').update({ atendido_por: 'humano' }).eq('id', b.lead_id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
