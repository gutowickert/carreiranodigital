import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { enviarTemplate, foneOficial } from '@/lib/whatsapp-oficial'
import { nomeSaudacao } from '@/lib/saudacao'

export const maxDuration = 60

// MOTOR DA ESTEIRA IA — follow-up 100% automático dos leads FRIOS (nunca responderam) nas etapas
// de nutrição por mensagem. Cadência de TEMPLATES (frio = fora das 24h), espaçada, assinada Mateus.
// Marca atendido_por='ia' (aparece na tela Qualidade IA). Esgotou os toques → demissão (perda).
// Quando o lead responde, o webhook devolve pro humano (para a IA). Ver hand-off no wa-oficial/webhook.
//
// SEGURANÇA: dryRun=true (padrão) só simula. Enviar de verdade: { dryRun:false, confirm:true }.
// KILL SWITCH: config em webhook_logs origem='ia-automacao' { ligado:false } desliga tudo.

const ETAPAS = ['atendimento_inicial', 'lote_preco_ok', 'oferecer_bolsa']
const VENDEDOR = 'Mateus'
const SPACING_DIAS = 3
// sequência de toques (templates utility aprovados). O último DEMITE (→ perda).
const TOQUES = [
  { tpl: 'cnd_retomar', demite: false },
  { tpl: 'cnd_nao_atendeu', demite: false },
  { tpl: 'cnd_encerramento', demite: true },
]
const cursoDe = (c: string | null) => { const x = (c || '').toLowerCase(); return x.startsWith('fc') ? 'Formação Completa em Marketing Digital' : x.startsWith('anl') ? 'Anúncios para Negócios Locais' : 'nossos cursos' }
const suf = (s: string) => (s || '').replace(/\D/g, '').slice(-8)
const DIA = 864e5

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({} as any))
    const dryRun = b?.dryRun !== false
    const confirm = b?.confirm === true
    const limit = Math.min(Math.max(Number(b?.limit) || 20, 1), 60)
    if (!dryRun && !confirm) return NextResponse.json({ ok: false, error: 'pra enviar: dryRun=false E confirm=true' }, { status: 200 })

    // KILL SWITCH
    const { data: cfg } = await sb.from('webhook_logs').select('payload').eq('org_id', org).eq('origem', 'ia-automacao').order('recebido_em', { ascending: false }).limit(1).maybeSingle()
    const ligado = (cfg?.payload as any)?.ligado
    if (ligado === false && !dryRun) return NextResponse.json({ ok: false, killed: true, error: 'Automação DESLIGADA (kill switch). Ligue em ia-automacao {ligado:true}.' }, { status: 200 })

    // leads das 3 etapas
    const { data: leads } = await sb.from('leads').select('id, nome, whatsapp, etapa, codigo_turma, turma_id').eq('org_id', org).in('etapa', ETAPAS).limit(5000)
    // conversas -> por lead + telefone
    const { data: convs } = await sb.from('wa_conversas').select('id, lead_id, telefone').eq('org_id', org).limit(20000)
    const cdl: Record<string, string[]> = {}, cpt: Record<string, string[]> = {}
    for (const c of convs || []) { if (c.lead_id) (cdl[c.lead_id] = cdl[c.lead_id] || []).push(c.id); const s = suf(c.telefone); if (s.length === 8) (cpt[s] = cpt[s] || []).push(c.id) }
    const cidsDe = (l: any) => [...new Set([...(cdl[l.id] || []), ...(cpt[suf(l.whatsapp)] || [])])]
    // quem TEM inbound (respondeu) — esses NÃO são Esteira IA
    const allc = [...new Set((leads || []).flatMap(cidsDe))]
    const temInbound = new Set<string>() // conversa_id (respondeu alguma vez)
    const lastOutConv: Record<string, number> = {} // último enviado por conversa
    for (let i = 0; i < allc.length; i += 150) {
      const chunk = allc.slice(i, i + 150); let mf = 0
      for (; ;) {
        const { data } = await sb.from('wa_mensagens').select('conversa_id, direcao, status, criado_em').in('conversa_id', chunk).range(mf, mf + 999)
        if (!data || !data.length) break
        for (const m of data) {
          const inb = (m.direcao === 'recebida' || m.status === 'recebida')
          if (inb) temInbound.add(m.conversa_id)
          else { const t = +new Date(m.criado_em); if (t > (lastOutConv[m.conversa_id] || 0)) lastOutConv[m.conversa_id] = t }
        }
        if (data.length < 1000) break; mf += 1000
      }
    }
    const frios = (leads || []).filter(l => { const cs = cidsDe(l); return cs.every(c => !temInbound.has(c)) })
    const lastOutDe = (l: any) => Math.max(0, ...cidsDe(l).map((c: string) => lastOutConv[c] || 0))

    // toques já dados (lead_andamentos tipo 'ia_followup') — pra saber o próximo e o espaçamento
    const ids = frios.map(l => l.id)
    const toquesDe: Record<string, { n: number; ultimo: number }> = {}
    for (let i = 0; i < ids.length; i += 300) {
      const { data: am } = await sb.from('lead_andamentos').select('lead_id, criado_em').eq('tipo', 'ia_followup').in('lead_id', ids.slice(i, i + 300))
      for (const a of am || []) { const o = toquesDe[a.lead_id] = toquesDe[a.lead_id] || { n: 0, ultimo: 0 }; o.n++; const t = +new Date(a.criado_em); if (t > o.ultimo) o.ultimo = t }
    }

    // due: ainda tem toque na sequência E não mandamos NADA (qualquer template/msg) nos últimos SPACING dias.
    // (respeita migração/recuperação recentes — não manda por cima)
    const now = Date.now()
    const due = frios.filter(l => {
      const o = toquesDe[l.id] || { n: 0, ultimo: 0 }
      if (o.n >= TOQUES.length) return false
      return now - lastOutDe(l) >= SPACING_DIAS * DIA
    })

    // cidade por turma
    const turmaIds = [...new Set(due.map(l => l.turma_id).filter(Boolean))] as string[]
    const cidadePorTurma = new Map<string, string>()
    if (turmaIds.length) { const { data: tt } = await sb.from('turmas').select('id, cidades(nome)').in('id', turmaIds); for (const t of (tt || []) as any[]) if (t.cidades?.nome) cidadePorTurma.set(t.id, t.cidades.nome) }

    // corpos dos templates
    const { data: temps } = await sb.from('followup_templates').select('nome_meta, corpo, variaveis').eq('org_id', org).in('nome_meta', TOQUES.map(t => t.tpl))
    const tplBy = new Map((temps || []).map(t => [t.nome_meta, t]))

    const lote = due.slice(0, limit)
    const previews: any[] = []
    let enviados = 0, demitidos = 0, falhas = 0, falhasSeguidas = 0

    for (const l of lote) {
      const o = toquesDe[l.id] || { n: 0, ultimo: 0 }
      const toque = TOQUES[o.n]
      const tpl = tplBy.get(toque.tpl)
      if (!tpl) { previews.push({ lead: l.nome, erro: `template ${toque.tpl} não encontrado` }); falhas++; continue }
      const valores: Record<string, string> = { nome: nomeSaudacao(l.nome), vendedor: VENDEDOR, curso: cursoDe(l.codigo_turma), cidade: cidadePorTurma.get(l.turma_id || '') || 'sua região' }
      const ordem = (tpl.variaveis || '').split(',').map((s: string) => s.trim()).filter(Boolean)
      const textoRender = (tpl.corpo || '').replace(/\{\{(\w+)\}\}/g, (_m: string, k: string) => valores[k] ?? `{{${k}}}`)
      const to = foneOficial(l.whatsapp || '')
      if (!to) { falhas++; continue }

      if (dryRun) { previews.push({ lead: l.nome, etapa: l.etapa, toque: o.n + 1, template: toque.tpl, demite: toque.demite, texto: textoRender }); continue }

      const parametros = ordem.map((k: string) => ({ type: 'text', text: valores[k] ?? k }))
      const r = await enviarTemplate(to, toque.tpl, 'pt_BR', parametros.length ? [{ type: 'body', parameters: parametros }] : undefined)
      if (!r.ok) {
        falhas++; falhasSeguidas++; previews.push({ lead: l.nome, erro: r.error })
        if (enviados === 0 && falhasSeguidas >= 5) return NextResponse.json({ ok: false, abortado: true, error: 'Abortado: 5 falhas seguidas.', falhas: previews }, { status: 200 })
        continue
      }
      falhasSeguidas = 0; enviados++

      // marca IA (aparece na Qualidade IA) + grava a mensagem na conversa oficial
      await sb.from('leads').update({ atendido_por: 'ia', atualizado_em: new Date().toISOString() }).eq('id', l.id)
      let conv: any = (await sb.from('wa_conversas').select('id').eq('org_id', org).eq('lead_id', l.id).eq('canal', 'oficial').limit(1).maybeSingle()).data
      if (!conv) { const c = await sb.from('wa_conversas').insert({ org_id: org, telefone: to, nome: l.nome, lead_id: l.id, canal: 'oficial' }).select('id').single(); conv = c.data }
      if (conv) {
        await sb.from('wa_mensagens').insert({ org_id: org, conversa_id: conv.id, zapi_id: r.wamid || null, direcao: 'enviada', tipo: 'texto', texto: textoRender, status: 'enviada', canal: 'oficial' })
        await sb.from('wa_conversas').update({ ultima_msg: textoRender.slice(0, 200), ultima_msg_em: new Date().toISOString() }).eq('id', conv.id)
      }
      await sb.from('lead_andamentos').insert({ lead_id: l.id, tipo: 'ia_followup', observacao: `🤖 IA (Esteira 1) — toque ${o.n + 1}/${TOQUES.length}: ${toque.tpl}` })

      // último toque → demite (perda)
      if (toque.demite) {
        await sb.from('leads').update({ etapa: 'perda', data_perda: new Date().toISOString(), motivo_perda_id: 'f972b270-691a-4e24-bd79-3b7583970a51', atualizado_em: new Date().toISOString() }).eq('id', l.id)
        await sb.from('tarefas_lead').update({ cancelada: true, cancelada_em: new Date().toISOString() }).eq('lead_id', l.id).eq('concluida', false).eq('cancelada', false)
        await sb.from('lead_andamentos').insert({ lead_id: l.id, tipo: 'mudanca_etapa', etapa_nova: 'perda', observacao: '🤖 IA — cadência esgotada sem resposta → demissão (perda).' })
        demitidos++
      }
    }

    return NextResponse.json({
      ok: true, dryRun, etapas: ETAPAS, frios: frios.length, due: due.length, processados: lote.length,
      enviados, demitidos, falhas, restantes: Math.max(0, due.length - (dryRun ? 0 : (enviados + falhas))),
      amostra: dryRun ? previews.slice(0, 8) : undefined, erros: !dryRun && previews.length ? previews : undefined,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
