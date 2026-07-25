import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { atenderLead } from '@/lib/atender-lead'

export const maxDuration = 300

// RESPONDEDOR AUTÔNOMO — a IA atende quem ESTÁ ESPERANDO resposta (última mensagem foi do CLIENTE,
// dentro da janela de 24h → dá pra mandar texto livre). Gera a resposta pelo copiloto e decide:
//   • responder normal → manda a mensagem (avança a etapa se mudou), marca atendido_por='ia'
//   • agendar_ligacao → cria ligação pro time + confirma
//   • chamar_humano / confiança baixa → ESCALA: seta handoff, devolve pro time, manda recado de espera
// dryRun (padrão) só mostra. Enviar: { dryRun:false, confirm:true }. Kill switch: ia-automacao {ligado:false}.
const DIA = 864e5

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({} as any))
    const dryRun = b?.dryRun !== false
    const confirm = b?.confirm === true
    const limit = Math.min(Math.max(Number(b?.limit) || 8, 1), 30)
    if (!dryRun && !confirm) return NextResponse.json({ ok: false, error: 'pra enviar: dryRun=false E confirm=true' }, { status: 200 })

    const { data: cfg } = await sb.from('webhook_logs').select('payload').eq('org_id', org).eq('origem', 'ia-automacao').order('recebido_em', { ascending: false }).limit(1).maybeSingle()
    if ((cfg?.payload as any)?.ligado === false && !dryRun) return NextResponse.json({ ok: false, killed: true, error: 'Automação DESLIGADA (kill switch).' }, { status: 200 })

    // 1) conversas oficiais com mensagem RECEBIDA nas últimas 24h
    const desde = new Date(Date.now() - DIA).toISOString()
    const { data: recs } = await sb.from('wa_mensagens').select('conversa_id, criado_em').eq('org_id', org).eq('canal', 'oficial').eq('direcao', 'recebida').gte('criado_em', desde).order('criado_em', { ascending: false }).limit(400)
    const convIds = [...new Set((recs || []).map(m => m.conversa_id))]
    if (!convIds.length) return NextResponse.json({ ok: true, dryRun, esperando: 0, planejados: 0, amostra: [] })

    // 2) por conversa: a ÚLTIMA mensagem é do cliente? (então está esperando resposta). pega lead + texto.
    const esperando: { leadId: string; conversaId: string; ultimaFala: string; em: string }[] = []
    for (let i = 0; i < convIds.length; i += 100) {
      const chunk = convIds.slice(i, i + 100)
      const { data: convs } = await sb.from('wa_conversas').select('id, lead_id').in('id', chunk)
      const leadDe = new Map((convs || []).map(c => [c.id, c.lead_id]))
      const { data: msgs } = await sb.from('wa_mensagens').select('conversa_id, direcao, status, texto, criado_em').in('conversa_id', chunk).order('criado_em', { ascending: false }).limit(2000)
      const ultima = new Map<string, any>()
      for (const m of msgs || []) if (!ultima.has(m.conversa_id)) ultima.set(m.conversa_id, m) // 1ª (mais recente)
      for (const [cid, m] of ultima) {
        const inbound = m.direcao === 'recebida' || m.status === 'recebida'
        const lead = leadDe.get(cid)
        if (inbound && lead && (Date.now() - +new Date(m.criado_em)) < DIA) esperando.push({ leadId: lead, conversaId: cid, ultimaFala: (m.texto || '').slice(0, 160), em: m.criado_em })
      }
    }
    // dedup por lead (um lead, um atendimento)
    const vistos = new Set<string>()
    const fila = esperando.filter(e => e.leadId && !vistos.has(e.leadId) && vistos.add(e.leadId)).slice(0, limit)

    // nomes pros previews
    const nomes = new Map<string, string>()
    { const { data } = await sb.from('leads').select('id, nome').in('id', fila.map(f => f.leadId)); for (const l of data || []) nomes.set(l.id, l.nome) }

    const previews: any[] = []
    let respondidos = 0, escalados = 0, agendados = 0, avancados = 0, falhas = 0, pulados = 0

    for (const e of fila) {
      const res = await atenderLead(org, e.leadId, { dryRun, conversaId: e.conversaId })
      const nome = nomes.get(e.leadId) || e.leadId
      if (!res.ok) {
        if (res.erro) { falhas++; previews.push({ lead: nome, erro: res.erro }) }
        else { pulados++; previews.push({ lead: nome, pulado: res.motivo }) }
        continue
      }
      const decisao = res.decisao === 'escala' ? '🙋 ESCALA (humano)' : res.decisao === 'agenda_ligacao' ? '📞 AGENDA LIGAÇÃO' : '🤖 RESPONDE'
      previews.push({ lead: nome, ultimaFala: e.ultimaFala, decisao, acao: res.acao, etapaSugerida: res.etapa, resposta: res.resposta })
      if (!dryRun) {
        if (res.decisao === 'escala') escalados++
        else { respondidos++; if (res.decisao === 'agenda_ligacao') agendados++ }
        if (res.etapa && res.etapa !== 'manter') avancados++
      }
    }

    return NextResponse.json({ ok: true, dryRun, esperando: fila.length, respondidos, escalados, agendados, avancados, falhas, pulados, amostra: previews })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
