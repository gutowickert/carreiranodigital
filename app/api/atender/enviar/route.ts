import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { gerarProxima, garantirTarefa } from '@/lib/fluxo'

// Envia a mensagem aprovada pelo humano na fila "Atender Agora", conclui a tarefa atual do lead
// e AVANÇA a cadência (cria a próxima tarefa da mesma etapa). Se um MOVE vai seguir (botão "Enviar e mover"),
// o front manda avancar=false pra não criar tarefa da etapa antiga — o move cria a da etapa nova.
export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}))
    const auth = req.headers.get('authorization') || ''
    const org = await orgDaRequest(auth)
    const { leadId, conversaId, telefone, chatLid, texto } = b
    const avancar = b.avancar !== false
    if (!texto || !(telefone || conversaId)) return NextResponse.json({ ok: false, error: 'faltam texto e destino' }, { status: 200 })
    // repassa o token pro wa/enviar interno pra ele resolver a MESMA org (senão cairia no default)
    const env = await fetch(`${req.nextUrl.origin}/api/wa/enviar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
      body: JSON.stringify({ telefone, leadId, chatLid, conversaId, texto }),
    }).then(r => r.json()).catch(() => ({ ok: false }))
    if (!env.ok) return NextResponse.json({ ok: false, error: env.error || 'falha ao enviar' }, { status: 200 })
    let tarefas = 0
    if (leadId) {
      // pega o contexto pra avançar a cadência
      const { data: lead } = await sb.from('leads').select('etapa, nome, vendedor_id').eq('org_id', org).eq('id', leadId).maybeSingle()
      const { data: pend } = await sb.from('tarefas_lead').select('id, tipo').eq('org_id', org).eq('lead_id', leadId).eq('concluida', false).eq('cancelada', false).order('data_vencimento').limit(1).maybeSingle()
      // conclui as tarefas pendentes (a atual)
      const { data } = await sb.from('tarefas_lead').update({ concluida: true, concluida_em: new Date().toISOString() })
        .eq('org_id', org).eq('lead_id', leadId).eq('concluida', false).eq('cancelada', false).select('id')
      tarefas = (data || []).length
      // AVANÇA A CADÊNCIA na mesma etapa (cria a próxima tarefa) — a menos que um move vá seguir
      if (avancar && lead && pend) await gerarProxima(sb, leadId, lead.etapa, pend.tipo, lead.nome || 'Lead', lead.vendedor_id || null)
      // rede de segurança: não deixa lead ativo sem tarefa (ex.: chave antiga não encadeou)
      if (avancar && lead) await garantirTarefa(sb, leadId, lead.etapa, lead.nome || 'Lead', lead.vendedor_id || null)
      await sb.from('webhook_logs').insert({ org_id: org, origem: 'ia-acao', evento: 'atender-semi', status: 'enviado', payload: { lead_id: leadId, texto, aprovado_por: b.email || null } })
    }
    // APRENDIZADO: se o humano EDITOU a sugestão da IA (original != enviado), guarda o par pra IA aprender o tom real.
    const original = (b.original || '').toString().trim()
    const norm = (s: string) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase()
    if (original && leadId && norm(original) !== norm(texto)) {
      const { data: l } = await sb.from('leads').select('etapa, codigo_turma').eq('org_id', org).eq('id', leadId).maybeSingle()
      await sb.from('webhook_logs').insert({ org_id: org, origem: 'ia-edicao', evento: 'correcao', status: 'ok', payload: { lead_id: leadId, original, enviado: texto, etapa: l?.etapa || null, turma: l?.codigo_turma || null, por: b.email || null } })
    }
    return NextResponse.json({ ok: true, tarefas })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
