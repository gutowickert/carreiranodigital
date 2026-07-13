import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { getConfigIA } from '@/lib/ia-config'
import { sugerirAtendimento } from '@/lib/atendimento-ia'
import { getProximaTarefa } from '@/lib/sequencia-tarefas'

export const maxDuration = 300

// Orquestração da IA de atendimento (cron). SÓ age quando a automação está LIGADA em modo AUTO,
// e SÓ nos leads marcados como atendido_por='ia'. Conservador: teto por rodada + log de tudo.
export async function GET(req: NextRequest) {
  const ua = req.headers.get('user-agent') || ''
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  const permitido = ua.includes('vercel-cron') || (!!secret && auth === `Bearer ${secret}`)
  if (!permitido) return NextResponse.json({ ok: false, error: 'não autorizado' }, { status: 401 })

  const cfg = await getConfigIA()
  if (!cfg.ativa || cfg.modo !== 'auto') return NextResponse.json({ ok: true, skip: `automação ${cfg.ativa ? 'em semi (humano envia)' : 'desligada'}` })

  const agora = new Date().toISOString()
  // follow-ups vencidos SÓ dos leads da IA
  const { data: tarefas } = await supabase.from('tarefas_lead')
    .select('id, lead_id, tipo, leads!inner(id, nome, whatsapp, etapa, atendido_por)')
    .eq('concluida', false).eq('cancelada', false).lte('data_vencimento', agora)
    .eq('leads.atendido_por', 'ia').limit(15)

  const origin = req.nextUrl.origin
  let enviados = 0
  const feitos: any[] = []
  for (const t of (tarefas || [])) {
    const lead: any = (t as any).leads
    try {
      const r = await sugerirAtendimento({ leadId: lead.id })
      if (!r.ok || !r.sugestao?.resposta) { feitos.push({ lead: lead.nome, skip: r.error || 'sem sugestão' }); continue }
      const msg = r.sugestao.resposta
      // envia pela via oficial (salva a msg + atualiza conversa)
      const env = await fetch(`${origin}/api/wa/enviar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telefone: lead.whatsapp, leadId: lead.id, texto: msg }) }).then(x => x.json()).catch(() => ({ ok: false }))
      // conclui a tarefa e cria a próxima do pipeline
      await supabase.from('tarefas_lead').update({ concluida: true, concluida_em: agora, atualizado_em: agora }).eq('id', t.id)
      const prox = getProximaTarefa(lead.etapa, t.tipo)
      if (prox) { const v = new Date(); v.setDate(v.getDate() + 1); await supabase.from('tarefas_lead').insert({ lead_id: lead.id, tipo: prox.chave, titulo: `${prox.titulo} — ${lead.nome}`, descricao: prox.descricao, data_vencimento: v.toISOString() }) }
      // log da ação da IA (pra Qualidade IA)
      await supabase.from('webhook_logs').insert({ origem: 'ia-acao', evento: t.tipo, status: 'processado', payload: { lead_id: lead.id, texto: msg, enviado: !!env.ok, etapa: r.sugestao.etapa_funil } })
      if (env.ok) enviados++
      feitos.push({ lead: lead.nome, enviado: !!env.ok })
    } catch (e: any) { feitos.push({ lead: lead.nome, erro: e?.message }) }
  }
  return NextResponse.json({ ok: true, enviados, processados: feitos.length, feitos })
}
