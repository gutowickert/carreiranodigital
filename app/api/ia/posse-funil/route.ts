import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { turmasForaDoMotor, leadForaDoMotor } from '@/lib/cadencia'

export const maxDuration = 60

// 👤→🤖 POSSE DO FUNIL — lead do funil (atendimento/lote/bolsa) que está com o TIME (atendido_por='humano')
// mas ESFRIOU (não respondeu nas últimas 24h) → passa pra IA. Assim a fila do time fica só com quem respondeu
// recente; os frios do funil (Pelicula & cia.) somem da cara do time e o follow-up cuida deles.
// Detecção por CONSULTA DIRETA (mensagem recebida nas últimas 24h), NÃO pelo dossiê (que sub-conta em escala).
// dryRun (padrão) simula. Aplicar: { dryRun:false, confirm:true }.
const FUNIL = ['atendimento_inicial', 'lote_preco_ok', 'oferecer_bolsa']
// tarefas de CADÊNCIA (a IA faz por cadência, não por tarefa) — canceladas quando o lead é da IA, pra não
// poluir a fila do time. NÃO inclui ligacao_boa nem tarefas de estado do time (verificar_pagamento etc.).
const MSG_TASK = ['seguir_followup', 'triagem_mensagem', 'lote_virando', 'pos_virada_lote', 'msg_horario', 'apresentacao_completa', 'bolsa_1', 'bolsa_2', 'seguir_whatsapp', 'followup']
const DIA = 864e5

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({} as any))
    const dryRun = b?.dryRun !== false
    const confirm = b?.confirm === true
    const horas = Math.min(Math.max(Number(b?.horas) || 24, 6), 168) // janela de "respondeu recente" (default 24h)
    if (!dryRun && !confirm) return NextResponse.json({ ok: false, error: 'pra aplicar: dryRun=false E confirm=true' }, { status: 200 })

    // quem RESPONDEU nas últimas `horas` (consulta direta) → fica com o time
    const desde = new Date(Date.now() - horas * 36e5).toISOString()
    const inb: any[] = []
    for (let from = 0; ; from += 1000) { const { data } = await sb.from('wa_mensagens').select('conversa_id').eq('org_id', org).or('direcao.eq.recebida,status.eq.recebida').gte('criado_em', desde).range(from, from + 999); if (!data?.length) break; inb.push(...data); if (data.length < 1000) break }
    const convIds = [...new Set(inb.map((m: any) => m.conversa_id).filter(Boolean))]
    const respRecente = new Set<string>()
    for (let i = 0; i < convIds.length; i += 200) { const { data } = await sb.from('wa_conversas').select('id, lead_id').in('id', convIds.slice(i, i + 200)); for (const c of data || []) if (c.lead_id) respRecente.add(c.lead_id) }

    // TODOS os leads do funil (qualquer dono). Frio = não respondeu nas últimas `horas`.
    const foraMotor = await turmasForaDoMotor(sb, org)
    const { data: leads } = await sb.from('leads').select('id, nome, etapa, atendido_por, codigo_turma, turma_id').eq('org_id', org).in('etapa', FUNIL).limit(5000)
    // 🚫 Turmas com motor_cadencia != 'turma' (Deu Venda: implantação 1 a 1) ficam FORA
    // da cadência dos cursos e do atendimento por IA — o time atende na mão.
    const frios = (leads || []).filter(l => !respRecente.has(l.id) && !leadForaDoMotor(l, foraMotor))              // frios do funil (a IA cuida)
    const passar = frios.filter(l => (l as any).atendido_por === 'humano')       // ainda com o time → flipar pra IA
    const friosIds = frios.map(l => l.id)

    let tarefasCanceladas = 0
    if (!dryRun) {
      // 1) flipa os frios que estavam com o time → IA
      for (let i = 0; i < passar.length; i += 100) {
        const chunk = passar.slice(i, i + 100).map(l => l.id)
        await sb.from('leads').update({ atendido_por: 'ia', atualizado_em: new Date().toISOString() }).in('id', chunk)
      }
      const rows = passar.map(l => ({ lead_id: l.id, tipo: 'reconciliacao', observacao: `🤖 Posse — esfriou no funil (${l.etapa}, sem responder há ${horas}h) → passou pra IA cuidar do follow-up.` }))
      for (let i = 0; i < rows.length; i += 200) await sb.from('lead_andamentos').insert(rows.slice(i, i + 200))
      // 2) CANCELA as tarefas de cadência de TODOS os frios do funil (a IA faz por cadência) → limpa a fila do time
      for (let i = 0; i < friosIds.length; i += 100) {
        const { data: c } = await sb.from('tarefas_lead').update({ cancelada: true, cancelada_em: new Date().toISOString() }).in('lead_id', friosIds.slice(i, i + 100)).in('tipo', MSG_TASK).eq('concluida', false).eq('cancelada', false).select('id')
        tarefasCanceladas += (c || []).length
      }
    } else {
      // dryRun: conta quantas tarefas de cadência seriam canceladas
      for (let i = 0; i < friosIds.length; i += 100) {
        const { count } = await sb.from('tarefas_lead').select('id', { count: 'exact', head: true }).in('lead_id', friosIds.slice(i, i + 100)).in('tipo', MSG_TASK).eq('concluida', false).eq('cancelada', false)
        tarefasCanceladas += count || 0
      }
    }

    const porEtapa: Record<string, number> = {}
    for (const l of passar) porEtapa[l.etapa] = (porEtapa[l.etapa] || 0) + 1
    return NextResponse.json({
      ok: true, dryRun, friosNoFunil: frios.length, responderamRecente: (leads || []).length - frios.length,
      passaramPraIA: passar.length, tarefasCadenciaCanceladas: tarefasCanceladas, porEtapa,
      amostra: passar.slice(0, 15).map(l => ({ nome: l.nome, etapa: l.etapa })),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
