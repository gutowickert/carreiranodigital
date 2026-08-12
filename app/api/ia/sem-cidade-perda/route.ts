import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'

export const maxDuration = 60

// ❌ SEM-CIDADE → PERDA (2 dias). Quem recebeu o disparo "qual tua cidade?" (template cnd_qual_cidade) e NÃO
// respondeu em 2 dias vira PERDA (entra no pool de disparo / win-back). Quem RESPONDEU fica pro time etiquetar.
// dryRun (padrão) simula. Aplicar: { dryRun:false, confirm:true }. Roda no cron da manhã.
const DIAS = 2
const ATIVAS = ['aguardando_atendimento', 'atendimento_inicial', 'lote_preco_ok', 'oferecer_bolsa', 'agendado', 'proxima_turma', 'ligacao_boa']

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({} as any))
    const dryRun = b?.dryRun !== false
    const confirm = b?.confirm === true
    if (!dryRun && !confirm) return NextResponse.json({ ok: false, error: 'pra aplicar: dryRun=false E confirm=true' }, { status: 200 })

    const limite = new Date(Date.now() - DIAS * 864e5).toISOString()
    // andamentos do disparo cnd_qual_cidade com >= 2 dias
    const { data: ands } = await sb.from('lead_andamentos')
      .select('lead_id, criado_em').ilike('observacao', '%cnd_qual_cidade%').lte('criado_em', limite).order('criado_em')
    const dispDe = new Map<string, string>()
    for (const a of ands || []) if (!dispDe.has(a.lead_id)) dispDe.set(a.lead_id, a.criado_em) // 1º disparo
    const ids = [...dispDe.keys()]
    if (!ids.length) return NextResponse.json({ ok: true, dryRun, candidatos: 0, perdidos: 0 })

    // leads ainda SEM turma + ativos (quem já foi etiquetado numa turma saiu)
    const leads: any[] = []
    for (let i = 0; i < ids.length; i += 100) { const { data } = await sb.from('leads').select('id, nome, turma_id, etapa').eq('org_id', org).in('id', ids.slice(i, i + 100)); leads.push(...(data || [])) }
    const alvos = leads.filter(l => !l.turma_id && ATIVAS.includes(l.etapa))

    // quem RESPONDEU depois do disparo (inbound) → NÃO é perda (fica pro time)
    const responderam = new Set<string>()
    for (let i = 0; i < alvos.length; i += 60) {
      const chunk = alvos.slice(i, i + 60)
      const { data: convs } = await sb.from('wa_conversas').select('id, lead_id').in('lead_id', chunk.map(l => l.id))
      const cid2lead = new Map<string, string>(); (convs || []).forEach((c: any) => cid2lead.set(c.id, c.lead_id))
      const cids = (convs || []).map((c: any) => c.id)
      if (!cids.length) continue
      const { data: msgs } = await sb.from('wa_mensagens').select('conversa_id, criado_em').in('conversa_id', cids).eq('direcao', 'recebida')
      for (const m of msgs || []) { const lid = cid2lead.get(m.conversa_id); if (lid && dispDe.get(lid) && m.criado_em > dispDe.get(lid)!) responderam.add(lid) }
    }
    const perder = alvos.filter(l => !responderam.has(l.id))

    if (dryRun) return NextResponse.json({ ok: true, dryRun: true, candidatos: alvos.length, responderam: responderam.size, perder: perder.length })

    const { data: mp } = await sb.from('motivos_perda').select('id').ilike('nome', '%sem resposta%').maybeSingle()
    const now = new Date().toISOString()
    let perdidos = 0
    for (const l of perder) {
      const upd: any = { etapa: 'perda', data_perda: now, atualizado_em: now }
      if (mp?.id) upd.motivo_perda_id = mp.id
      await sb.from('leads').update(upd).eq('id', l.id).eq('org_id', org)
      await sb.from('lead_andamentos').insert({ lead_id: l.id, tipo: 'mudanca_etapa', etapa_nova: 'perda', observacao: `❌ Não informou a cidade em ${DIAS} dias após o disparo → perda + pool de disparo (win-back).` })
      perdidos++
    }
    return NextResponse.json({ ok: true, dryRun: false, candidatos: alvos.length, responderam: responderam.size, perdidos })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
