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
// DONO depois da conversa: follow-up de WhatsApp (funil) → a IA cuida pela cadência (não sobrecarrega o time).
// Estado GENUÍNO do time (ligação agendada / pagamento / próxima turma) → fica com o time.
const FUNIL_IA = new Set(['atendimento_inicial', 'lote_preco_ok', 'oferecer_bolsa'])
const TIME_ESTADO = new Set(['agendado', 'aguardando_pagamento', 'proxima_turma'])
// tarefas de cadência (a IA faz por cadência) — canceladas quando o lead volta pra IA
const MSG_TASK = ['seguir_followup', 'triagem_mensagem', 'lote_virando', 'pos_virada_lote', 'msg_horario', 'apresentacao_completa', 'bolsa_1', 'bolsa_2', 'seguir_whatsapp', 'followup']

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
    const fluxo = await getFluxo()

    const { data: leads } = await sb.from('leads').select('id, nome, whatsapp, etapa, codigo_turma, atendido_por, resumo_ia, resumo_ia_em').eq('org_id', org).in('etapa', ATIVAS).limit(5000)

    // QUEM RESPONDEU no dia-alvo (00:00–24:00 BRT = +3h UTC). SCOPED aos leads ATIVOS: parte das CONVERSAS deles
    // e busca só as recebidas do dia NELAS. Antes varria o firehose do dia inteiro (todas as recebidas da org) e
    // estourava o timeout de 60s em dia de disparo (milhares de mensagens frias). Agora o custo é O(leads ativos),
    // não O(volume do dia) — e a maioria das recebidas do dia (disparo frio) nem é de lead do funil.
    const iniUTC = alvoBR + 'T03:00:00.000Z'
    const fimUTC = new Date(new Date(iniUTC).getTime() + 864e5).toISOString()
    const ativosIds = (leads || []).map(l => l.id)
    // conversas dos leads ativos (1-2 por lead) → conv→lead
    const convToLead = new Map<string, string>()
    for (let i = 0; i < ativosIds.length; i += 150) { const { data } = await sb.from('wa_conversas').select('id, lead_id').eq('org_id', org).in('lead_id', ativosIds.slice(i, i + 150)); for (const c of data || []) if (c.lead_id) convToLead.set(c.id, c.lead_id) }
    const convIds = [...convToLead.keys()]
    // recebidas do dia SÓ nessas conversas → última resposta por lead (max criado_em); proxy de "resposta nova a interpretar"
    const ultRespPorLead = new Map<string, string>()
    for (let i = 0; i < convIds.length; i += 150) {
      const { data } = await sb.from('wa_mensagens').select('conversa_id, criado_em').eq('org_id', org).or('direcao.eq.recebida,status.eq.recebida').gte('criado_em', iniUTC).lt('criado_em', fimUTC).in('conversa_id', convIds.slice(i, i + 150))
      for (const m of data || []) { const lid = convToLead.get(m.conversa_id); if (!lid) continue; const prev = ultRespPorLead.get(lid); if (!prev || m.criado_em > prev) ultRespPorLead.set(lid, m.criado_em) }
    }
    const respHoje = (leads || []).filter(l => ultRespPorLead.has(l.id))

    // PENDENTE = resposta nova ainda não interpretada (resumo mais velho que a última resposta do cliente hoje).
    // Depois de processado (real), o resumo fica fresco → sai da fila (restantes cai). Usa a última resposta do
    // scan (não o dossiê) pra NÃO montar dossiê de todos os respondentes — era o que estourava o timeout de 60s.
    // (NÃO usa "sem tarefa" como gatilho — funil→IA fica de propósito sem tarefa, senão o loop nunca drena.)
    const resumoStale = (l: any) => { const em = l.resumo_ia_em, ult = ultRespPorLead.get(l.id); return !l.resumo_ia?.etapaReal || !em || (!!ult && em < ult) }
    const pendentes = respHoje.filter(l => resumoStale(l))
    const fila = pendentes.slice(0, limit)

    // AGORA sim — dossiê + tarefas SÓ do lote que vai processar (≤ limit), não de todos os respondentes.
    const dossies = await dossiesLote(sb, org, fila)
    const idsFila = fila.map(l => l.id)
    const temTarefa = new Set<string>()
    for (let i = 0; i < idsFila.length; i += 200) {
      const { data: tks } = await sb.from('tarefas_lead').select('lead_id').in('lead_id', idsFila.slice(i, i + 200)).eq('concluida', false).eq('cancelada', false)
      for (const t of tks || []) temTarefa.add(t.lead_id)
    }

    const acoes: any[] = []
    let movidos = 0, tarefasCriadas = 0, paraIA = 0, paraTime = 0
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
        // DONO depois da conversa (o que o Guto pediu): FUNIL = follow-up de WhatsApp → a IA cuida pela cadência
        // (não sobrecarrega o time). ESTADO DO TIME (ligação agendada / pagamento / próxima turma) → fica com o time.
        if (FUNIL_IA.has(etapaReal)) {
          if (l.atendido_por !== 'ia') await sb.from('leads').update({ atendido_por: 'ia' }).eq('id', l.id)
          // a cadência é da IA → tira as tarefas de follow-up da fila do time
          await sb.from('tarefas_lead').update({ cancelada: true, cancelada_em: new Date().toISOString() }).eq('lead_id', l.id).in('tipo', MSG_TASK).eq('concluida', false).eq('cancelada', false)
          paraIA++
        } else if (TIME_ESTADO.has(etapaReal)) {
          if (l.atendido_por !== 'humano') await sb.from('leads').update({ atendido_por: 'humano' }).eq('id', l.id)
          // garante a tarefa do time SÓ pra estado do time (ligar/pagamento/próxima)
          if (t) {
            const venc = new Date(); venc.setUTCDate(venc.getUTCDate() + (t.dias || 0)); venc.setUTCHours(12, 0, 0, 0)
            await sb.from('tarefas_lead').insert({ org_id: org, lead_id: l.id, tipo: t.chave, titulo: `${t.titulo} — ${l.nome}`, descricao: t.descricao, data_vencimento: venc.toISOString() })
            tarefasCriadas++
          }
          paraTime++
        }
        // perda / ganho: não mexe no dono
      }
      acoes.push(acao)
    }

    return NextResponse.json({
      ok: true, dryRun,
      respHojeTotal: respHoje.length, pendentes: pendentes.length, processados: fila.length,
      restantes: Math.max(0, pendentes.length - fila.length),
      movidos, paraIA, paraTime, tarefasCriadas,
      acoes: acoes.slice(0, 20),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
