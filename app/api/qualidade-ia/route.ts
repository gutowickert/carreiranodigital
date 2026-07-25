import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { dossiesLote, timelineDossie } from '@/lib/historico-lead'

// Controle de Qualidade dos atendimentos da IA (Nando + Guto + Rick).
//  GET ?email= -> atendimentos da IA (leads atendido_por='ia') + conversa + última revisão + métricas
//  POST { email, lead_id, nota, status, comentario } -> salva a revisão (webhook_logs origem='qc-ia')
const PERMITIDOS = ['guto.wickert@gmail.com', 'debairros@hotmail.com', 'ricardovognach@hotmail.com', 'tizonmidia@gmail.com']
const ok = (e: string) => PERMITIDOS.includes((e || '').toLowerCase())

export async function GET(req: NextRequest) {
  try {
    const email = (req.nextUrl.searchParams.get('email') || '').toLowerCase()
    if (!ok(email)) return NextResponse.json({ ok: false, error: 'sem acesso' }, { status: 200 })
    const org = await orgDaRequest(req.headers.get('authorization'))

    const { data: leads } = await supabase.from('leads')
      .select('id, nome, whatsapp, etapa, codigo_turma, resumo_ia, resumo_ia_em').eq('org_id', org).eq('atendido_por', 'ia').limit(60)
    const alvo = leads || []

    // DOSSIÊ ÚNICO (mesma lib do motor e do copiloto): mensagens dos 2 canais + ligações + áudios + todos os andamentos.
    const dossies = await dossiesLote(supabase, org, alvo)
    const linhasDe = (l: any) => timelineDossie(dossies.get(l.id)!, 20).map(t => ({ quem: t.quem, texto: (t.texto || '').slice(0, 400), em: t.em }))

    // revisões salvas
    const { data: revs } = await supabase.from('webhook_logs').select('payload, recebido_em').eq('org_id', org).eq('origem', 'qc-ia').order('recebido_em', { ascending: false })
    const ultimaPorLead: Record<string, any> = {}
    for (const r of (revs || [])) { const p: any = r.payload; if (p?.lead_id && !ultimaPorLead[p.lead_id]) ultimaPorLead[p.lead_id] = { ...p, em: r.recebido_em } }

    const atendimentos = alvo.map(l => {
      const dos = dossies.get(l.id)
      const ligs = (dos?.ligacoes || []).map(g => ({ duracao: g.duracao, atendida: g.atendida, tem_transcricao: !!g.transcricao, em: g.em }))
      return {
        lead_id: l.id, nome: l.nome, etapa: l.etapa, turma: l.codigo_turma, whatsapp: l.whatsapp,
        mensagens: linhasDe(l), revisao: ultimaPorLead[l.id] || null,
        resumo: (l as any).resumo_ia || null, resumo_em: (l as any).resumo_ia_em || null,
        ligacoes: ligs, engajado: !!dos?.engajado,
      }
    })

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
    const org = await orgDaRequest(req.headers.get('authorization'))
    await supabase.from('webhook_logs').insert({ org_id: org, origem: 'qc-ia', evento: b.status, status: 'processado', payload: { lead_id: b.lead_id, nota: b.nota ? Number(b.nota) : null, status: b.status, comentario: (b.comentario || '').toString().slice(0, 800), revisor: email } })
    // se "assumir", devolve o lead pro humano
    if (b.status === 'assumir') await supabase.from('leads').update({ atendido_por: 'humano' }).eq('org_id', org).eq('id', b.lead_id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
