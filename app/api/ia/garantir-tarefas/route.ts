import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'

export const maxDuration = 60

// 🛟 REDE DE SEGURANÇA — nenhum lead em ESTADO DO TIME (agendado / próxima turma / aguardando pagamento) pode
// ficar SEM TAREFA (órfão, sem próximo passo). Se ficou (a tarefa venceu/concluiu e não encadeou a próxima) e o
// cliente NÃO respondeu nas últimas 48h (senão está no inbox), cria uma tarefa de retomada pra ~2 dias úteis.
// Roda no cron. dryRun (padrão) simula. Aplicar: { dryRun:false, confirm:true }.
const TEAM = ['agendado', 'proxima_turma', 'aguardando_pagamento']
const TIPO: Record<string, string> = { agendado: 'ligar_agendado', proxima_turma: 'proxima_turma', aguardando_pagamento: 'verificar_pagamento' }
const TITULO: Record<string, string> = { agendado: 'Retomar contato (agendado)', proxima_turma: 'Avisar da próxima turma', aguardando_pagamento: 'Confirmar pagamento' }
const DIA = 864e5

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({} as any))
    const dryRun = b?.dryRun !== false
    const confirm = b?.confirm === true
    if (!dryRun && !confirm) return NextResponse.json({ ok: false, error: 'pra aplicar: dryRun=false E confirm=true' }, { status: 200 })

    const { data: leads } = await sb.from('leads').select('id, nome, etapa, vendedor_id').eq('org_id', org).in('etapa', TEAM).neq('atendido_por', 'ia').limit(5000)
    const ids = (leads || []).map(l => l.id)
    // quem tem tarefa aberta
    const comTarefa = new Set<string>()
    for (let i = 0; i < ids.length; i += 300) { const { data: t } = await sb.from('tarefas_lead').select('lead_id').in('lead_id', ids.slice(i, i + 300)).eq('concluida', false).eq('cancelada', false); for (const x of t || []) comTarefa.add(x.lead_id) }
    // quem respondeu nas últimas 48h (está no inbox, não é órfão)
    const { data: inb } = await sb.from('wa_mensagens').select('conversa_id').eq('org_id', org).or('direcao.eq.recebida,status.eq.recebida').gte('criado_em', new Date(Date.now() - 2 * DIA).toISOString()).limit(20000)
    const cids = [...new Set((inb || []).map((m: any) => m.conversa_id).filter(Boolean))]
    const resp = new Set<string>()
    for (let i = 0; i < cids.length; i += 200) { const { data } = await sb.from('wa_conversas').select('id, lead_id').in('id', cids.slice(i, i + 200)); for (const c of data || []) if (c.lead_id) resp.add(c.lead_id) }

    const orfaos = (leads || []).filter(l => !comTarefa.has(l.id) && !resp.has(l.id))
    // data-alvo = +2 dias úteis, 9h BRT (12:00 UTC)
    const venc = new Date(); let add = 0; while (add < 2) { venc.setUTCDate(venc.getUTCDate() + 1); const wd = venc.getUTCDay(); if (wd !== 0 && wd !== 6) add++ }
    venc.setUTCHours(12, 0, 0, 0)

    if (!dryRun && orfaos.length) {
      const rows = orfaos.map(l => ({ org_id: org, lead_id: l.id, vendedor_id: l.vendedor_id || null, tipo: TIPO[l.etapa] || 'seguir_followup', titulo: `${TITULO[l.etapa] || 'Retomar'} — ${l.nome}`, descricao: 'Rede de segurança: lead ficou sem próximo passo. Retomar o contato.', data_vencimento: venc.toISOString() }))
      for (let i = 0; i < rows.length; i += 200) await sb.from('tarefas_lead').insert(rows.slice(i, i + 200))
    }
    const porEtapa: Record<string, number> = {}
    for (const l of orfaos) porEtapa[l.etapa] = (porEtapa[l.etapa] || 0) + 1
    return NextResponse.json({ ok: true, dryRun, orfaos: orfaos.length, criadas: dryRun ? 0 : orfaos.length, vencimento: venc.toISOString().slice(0, 10), porEtapa })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
