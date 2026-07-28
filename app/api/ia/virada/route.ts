import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { dossiesLote } from '@/lib/historico-lead'
import { interpretarFollowup } from '@/lib/interpretar-followup'
import { getFluxo, primeiraTarefaFluxo } from '@/lib/fluxo'

export const maxDuration = 60

// 🌙 VIRADA DA NOITE — processa quem o CLIENTE movimentou HOJE (respondeu msg / ligação atendida / nota humana).
// Pra cada um: lê a conversa (interpretação FRESCA), reposiciona no lugar certo do fluxo, devolve pro TIME
// (respondeu = vez do time responder) e GARANTE a tarefa da etapa (cria se o atendente ainda não criou).
// Roda em LOTES (LLM por lead → evita timeout): o cron chama em loop até `restantes` = 0.
// dryRun (padrão) só simula. Aplicar: { dryRun:false, confirm:true }.
// NÃO envia mensagem — é reposicionamento interno; por isso NÃO depende do kill switch de envio.

const ATIVAS = ['atendimento_inicial', 'lote_preco_ok', 'oferecer_bolsa', 'agendado', 'aguardando_pagamento', 'proxima_turma']
// destinos VÁLIDOS de move. NÃO inclui atendimento_inicial: rebaixar quem respondeu pro começo do funil é quase
// sempre erro de leitura (foi o caso da Deise — pediu retorno na semana, virou "atendimento"). Se a leitura disser
// atendimento, o lead FICA onde está (não volta pro começo).
const VALIDAS = new Set(['lote_preco_ok', 'oferecer_bolsa', 'agendado', 'aguardando_pagamento', 'proxima_turma', 'perda'])

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({} as any))
    const dryRun = b?.dryRun !== false
    const confirm = b?.confirm === true
    const limit = Math.min(Math.max(Number(b?.limit) || 8, 1), 12) // interpretação por lead é cara → lotes pequenos
    if (!dryRun && !confirm) return NextResponse.json({ ok: false, error: 'pra aplicar: dryRun=false E confirm=true' }, { status: 200 })

    // dia-alvo em fuso de Brasília: normalmente HOJE; pode vir { data:'YYYY-MM-DD' } pra recuperar um dia que a virada perdeu.
    const hojeBR = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    const alvoBR = /^\d{4}-\d{2}-\d{2}$/.test(b?.data || '') ? b.data : hojeBR
    const ehHoje = (iso: string | null | undefined) => !!iso && new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) === alvoBR
    const fluxo = await getFluxo()

    const { data: leads } = await sb.from('leads').select('id, nome, whatsapp, etapa, codigo_turma, atendido_por, resumo_ia, resumo_ia_em').eq('org_id', org).in('etapa', ATIVAS).limit(5000)
    const dossies = await dossiesLote(sb, org, leads || [])

    // quem o CLIENTE movimentou HOJE (última atividade DELE = hoje) — não o nosso envio
    const respHoje = (leads || []).filter(l => ehHoje(dossies.get(l.id)?.ultimoEngajamentoEm))

    // tarefas pendentes desses leads (1 query) — pra saber quem já tem tarefa (atendente criou)
    const idsResp = respHoje.map(l => l.id)
    const temTarefa = new Set<string>()
    for (let i = 0; i < idsResp.length; i += 200) {
      const { data: tks } = await sb.from('tarefas_lead').select('lead_id').in('lead_id', idsResp.slice(i, i + 200)).eq('concluida', false).eq('cancelada', false)
      for (const t of tks || []) temTarefa.add(t.lead_id)
    }

    // PENDENTES = quem ainda precisa de trabalho: resumo desatualizado (interpretação nova) OU sem tarefa.
    // Depois de processado (real), o resumo fica fresco e a tarefa passa a existir → sai da fila (restantes cai).
    const resumoStale = (l: any) => { const em = l.resumo_ia_em, ult = dossies.get(l.id)?.ultimoContatoEm; return !l.resumo_ia?.etapaReal || !em || (ult && em < ult) }
    const pendentes = respHoje.filter(l => resumoStale(l) || !temTarefa.has(l.id))
    const fila = pendentes.slice(0, limit)

    const acoes: any[] = []
    let movidos = 0, tarefasCriadas = 0, devolvidos = 0
    for (const l of fila) {
      const d = dossies.get(l.id)!
      const interp = await interpretarFollowup(sb, org, d, l, true) // FRESCO (regenera se preciso)
      let etapaReal = interp?.etapa && VALIDAS.has(interp.etapa) ? interp.etapa : (l.etapa as string)
      const motivo = (interp?.motivo || '').slice(0, 180)
      const jaTem = temTarefa.has(l.id)
      const mexeu = etapaReal !== l.etapa
      const t = !jaTem ? primeiraTarefaFluxo(fluxo, etapaReal) : null // 1ª tarefa da etapa certa (se não tem nenhuma)
      const acao: any = { nome: l.nome, de: l.etapa, para: etapaReal, mexeu, jaTinhaTarefa: jaTem, criaTarefa: t?.chave || null, motivo, fonte: interp?.fonte || 'sem-resumo' }

      if (!dryRun) {
        if (mexeu) {
          await sb.from('leads').update({ etapa: etapaReal, atualizado_em: new Date().toISOString() }).eq('id', l.id)
          await sb.from('lead_andamentos').insert({ lead_id: l.id, tipo: 'mudanca_etapa', etapa_anterior: l.etapa, etapa_nova: etapaReal, observacao: `🌙 Virada da noite — cliente respondeu hoje; leitura da conversa: ${motivo}` })
          movidos++
        }
        // respondeu = vez do TIME responder
        if (l.atendido_por !== 'humano' && etapaReal !== 'perda') { await sb.from('leads').update({ atendido_por: 'humano' }).eq('id', l.id); devolvidos++ }
        // garante a tarefa da etapa (só se o atendente não criou nenhuma)
        if (t) {
          const venc = new Date(); venc.setUTCDate(venc.getUTCDate() + (t.dias || 0)); venc.setUTCHours(12, 0, 0, 0)
          await sb.from('tarefas_lead').insert({ org_id: org, lead_id: l.id, tipo: t.chave, titulo: `${t.titulo} — ${l.nome}`, descricao: t.descricao, data_vencimento: venc.toISOString() })
          tarefasCriadas++
        }
      }
      acoes.push(acao)
    }

    return NextResponse.json({
      ok: true, dryRun,
      respHojeTotal: respHoje.length, pendentes: pendentes.length, processados: fila.length,
      restantes: Math.max(0, pendentes.length - fila.length),
      movidos, devolvidos, tarefasCriadas,
      acoes: acoes.slice(0, 20),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
