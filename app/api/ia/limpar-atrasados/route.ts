import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { dossiesLote } from '@/lib/historico-lead'
import { interpretarFollowup } from '@/lib/interpretar-followup'

export const maxDuration = 60

// 🧹 LIMPEZA DE ATRASADOS — lê a conversa (avaliação completa) dos leads com TAREFA VENCIDA em estados do time
// (agendado / aguardando_pagamento / proxima_turma / aguardando_atendimento) e resolve:
//   • já pagou   → ganho  (encerra as tarefas)
//   • declinou   → perda  (encerra as tarefas)
//   • voltou pro funil (atendimento/lote/bolsa) → reposiciona (o motor assume; encerra a tarefa velha do time)
//   • segue no mesmo estado do time (data ainda válida / negociando) → NÃO mexe (é tarefa real do time)
// Roda em lotes (LLM por lead). dryRun (padrão) simula. Aplicar: { dryRun:false, confirm:true }. Não envia mensagem.
const TIME = ['agendado', 'aguardando_pagamento', 'proxima_turma', 'aguardando_atendimento']
const FUNIL = new Set(['atendimento_inicial', 'lote_preco_ok', 'oferecer_bolsa'])
const MOTIVO_SEM_RESPOSTA = 'f972b270-691a-4e24-bd79-3b7583970a51'

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({} as any))
    const dryRun = b?.dryRun !== false
    const confirm = b?.confirm === true
    const limit = Math.min(Math.max(Number(b?.limit) || 10, 1), 15)
    if (!dryRun && !confirm) return NextResponse.json({ ok: false, error: 'pra aplicar: dryRun=false E confirm=true' }, { status: 200 })

    const agora = new Date().toISOString()
    // tarefas VENCIDAS abertas
    const { data: tks } = await sb.from('tarefas_lead').select('id, lead_id, tipo, data_vencimento').eq('org_id', org).eq('concluida', false).eq('cancelada', false).lt('data_vencimento', agora).limit(1000)
    const tarefasDe = new Map<string, string[]>()
    for (const t of tks || []) { const a = tarefasDe.get(t.lead_id) || []; a.push(t.id); tarefasDe.set(t.lead_id, a) }
    const lids = [...tarefasDe.keys()]
    if (!lids.length) return NextResponse.json({ ok: true, dryRun, atrasados: 0, nada: true })

    // só os leads em ESTADO DO TIME (é o alvo da limpeza)
    const { data: leadsAll } = await sb.from('leads').select('id, nome, whatsapp, etapa, codigo_turma, resumo_ia, resumo_ia_em, atendido_por').in('id', lids)
    const leads = (leadsAll || []).filter(l => TIME.includes(l.etapa))
    const dossies = await dossiesLote(sb, org, leads)

    const resumoStale = (l: any) => { const em = l.resumo_ia_em, ult = dossies.get(l.id)?.ultimoContatoEm; return !l.resumo_ia?.etapaReal || !em || (ult && em < ult) }
    let budget = limit, adiados = 0
    const acoes: any[] = []
    const cont = { ganho: 0, perda: 0, funil: 0, fica: 0, adiado: 0 }

    const encerrarTarefas = async (leadId: string, nota: string) => {
      const ids = tarefasDe.get(leadId) || []
      if (ids.length) await sb.from('tarefas_lead').update({ cancelada: true, cancelada_em: new Date().toISOString() }).in('id', ids)
      await sb.from('lead_andamentos').insert({ lead_id: leadId, tipo: 'mudanca_etapa', observacao: `🧹 Limpeza — ${nota}` })
    }

    for (const l of leads) {
      const d = dossies.get(l.id)!
      const precisaReler = resumoStale(l)
      if (precisaReler && budget <= 0) { adiados++; cont.adiado++; acoes.push({ nome: l.nome, pulado: 'aguardando leitura (próxima rodada)' }); continue }
      const interp = await interpretarFollowup(sb, org, d, l, precisaReler)
      if (precisaReler) budget--
      const et = interp?.etapa
      const motivo = (interp?.motivo || '').slice(0, 130)
      if (!et) { cont.fica++; acoes.push({ nome: l.nome, de: l.etapa, resultado: 'sem leitura — mantém', motivo }); continue }

      if (et === 'ganho') {
        cont.ganho++; acoes.push({ nome: l.nome, de: l.etapa, resultado: '→ GANHO', motivo })
        if (!dryRun) { await sb.from('leads').update({ etapa: 'ganho', atualizado_em: new Date().toISOString() }).eq('id', l.id); await encerrarTarefas(l.id, `já pagou → ganho. ${motivo}`) }
      } else if (et === 'perda') {
        cont.perda++; acoes.push({ nome: l.nome, de: l.etapa, resultado: '→ PERDA', motivo })
        if (!dryRun) { await sb.from('leads').update({ etapa: 'perda', data_perda: new Date().toISOString(), motivo_perda_id: MOTIVO_SEM_RESPOSTA, atualizado_em: new Date().toISOString() }).eq('id', l.id); await encerrarTarefas(l.id, `declinou → perda. ${motivo}`) }
      } else if (FUNIL.has(et) && et !== l.etapa) {
        cont.funil++; acoes.push({ nome: l.nome, de: l.etapa, resultado: `→ ${et} (volta pro funil)`, motivo })
        if (!dryRun) { await sb.from('leads').update({ etapa: et, atualizado_em: new Date().toISOString() }).eq('id', l.id); await encerrarTarefas(l.id, `voltou pro funil (${et}); motor assume. ${motivo}`) }
      } else {
        // segue no mesmo estado do time (ou outro estado do time) → NÃO mexe, é tarefa real
        cont.fica++; acoes.push({ nome: l.nome, de: l.etapa, resultado: 'mantém (tarefa real do time)', motivo })
      }
    }

    return NextResponse.json({
      ok: true, dryRun, atrasadosNoTime: leads.length, processados: leads.length - adiados, restantes: adiados,
      resultado: cont,
      amostra: acoes.filter(a => a.resultado && !a.resultado.startsWith('mantém')).slice(0, 25),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
