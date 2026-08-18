import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { nomeSaudacao } from '@/lib/saudacao'
import { enviarTemplate, foneOficial } from '@/lib/whatsapp-oficial'

export const maxDuration = 60

// 📣 DISPARO AGENDADO (RESUMÍVEL) — feito pra o pg_cron chamar (dentro da infra, SEM firewall, ao contrário do agente
// da nuvem). Dado turma + template, monta o público SOZINHO e manda em LOTES; cada chamada envia até `limit` NOVOS
// (deduplicando por wa_disparo_envios da campanha do dia). O pg_cron chama várias vezes (ex.: todo minuto por 20min)
// até `restantes=0` — igual o followup drena. Assim disparo agendado grande (700+) é confiável.
//   publico='perda' → leads em PERDA da turma (win-back) · publico='fria' → lista fria importada (wa_contatos sem lead)
// dryRun (padrão) só conta. Disparar: { dryRun:false, confirm:true }.
const alcancavel = (w: string) => { const s = String(w || ''); if (/@lid|@g\.us|@broadcast|@s\.whatsapp/i.test(s)) return false; const d = s.replace(/\D/g, ''); return d.length >= 10 && d.length <= 13 }
const suf = (t: string) => String(t || '').replace(/\D/g, '').slice(-8)
const CUSTO = 0.35

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({} as any))
    const codigo = String(b?.codigo_turma || '').trim()
    const template = String(b?.template || '').trim()
    const publico = (b?.publico || 'perda').toLowerCase()
    const limit = Math.min(Math.max(Number(b?.limit) || 100, 1), 200)
    const dryRun = b?.dryRun !== false
    const confirm = b?.confirm === true
    if (!codigo || !template) return NextResponse.json({ ok: false, error: 'codigo_turma e template são obrigatórios' }, { status: 200 })
    if (!dryRun && !confirm) return NextResponse.json({ ok: false, error: 'pra disparar: dryRun=false E confirm=true' }, { status: 200 })

    const { data: turma } = await sb.from('turmas').select('id, cidades(nome)').eq('org_id', org).eq('codigo', codigo).maybeSingle()
    if (!turma) return NextResponse.json({ ok: false, error: `turma ${codigo} não encontrada` }, { status: 200 })
    const cidade = (turma as any).cidades?.nome || ''

    // público completo
    let contatos: { telefone: string; nome: string; lead_id?: string }[] = []
    if (publico === 'perda') {
      const { data: leads } = await sb.from('leads').select('id, nome, whatsapp').eq('org_id', org).eq('turma_id', turma.id).eq('etapa', 'perda').limit(5000)
      contatos = (leads || []).filter(l => alcancavel(l.whatsapp)).map(l => ({ telefone: l.whatsapp, nome: nomeSaudacao(l.nome), lead_id: l.id }))
    } else if (publico === 'fria') {
      const { data: wc } = await sb.from('wa_contatos').select('telefone, nome').eq('org_id', org).eq('cidade', cidade).is('lead_id', null).eq('categoria', 'interessado').is('produto', null).neq('status', 'respondeu').neq('status', 'optout').limit(8000)
      contatos = (wc || []).filter(x => alcancavel(x.telefone)).map(x => ({ telefone: x.telefone, nome: nomeSaudacao(x.nome) }))
    } else {
      return NextResponse.json({ ok: false, error: `publico '${publico}' inválido (perda ou fria)` }, { status: 200 })
    }
    const total = contatos.length
    if (dryRun) return NextResponse.json({ ok: true, dryRun: true, codigo, cidade, publico, total })
    if (!total) return NextResponse.json({ ok: true, codigo, publico, total: 0, enviados: 0, restantes: 0 })

    // campanha ESTÁVEL do dia (find-or-create) — pra dedup entre as várias chamadas do cron
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    const campNome = `Agendado ${template} ${codigo} ${publico} ${hoje}`
    let camp = (await sb.from('wa_disparos').select('id, enviados, falhas').eq('org_id', org).eq('nome', campNome).maybeSingle()).data as any
    if (!camp) camp = (await sb.from('wa_disparos').insert({ org_id: org, nome: campNome, template_nome: template, template_idioma: 'pt_BR', categoria: 'marketing', status: 'enviando', total }).select('id, enviados, falhas').single()).data
    const dispId = camp.id

    // dedup: quem já recebeu nesta campanha + opt-out
    const { data: je } = await sb.from('wa_disparo_envios').select('telefone').eq('disparo_id', dispId).limit(20000)
    const jaSet = new Set((je || []).map((e: any) => suf(e.telefone)))
    const { data: outs } = await sb.from('wa_optout').select('telefone').eq('org_id', org)
    const optout = new Set((outs || []).map((o: any) => o.telefone))

    const pend = contatos.filter(c => !jaSet.has(suf(c.telefone)))
    const lote = pend.slice(0, limit)
    const bodyParams: string[] = Array.isArray(b?.bodyParams) && b.bodyParams.length ? b.bodyParams : ['{nome}', cidade]

    const now = new Date().toISOString()
    const envios: any[] = []
    let enviados = 0, falhas = 0
    for (const c of lote) {
      const tel = foneOficial(c.telefone)
      if (!tel || tel.length < 12) { falhas++; envios.push({ org_id: org, disparo_id: dispId, telefone: c.telefone, nome: c.nome || null, lead_id: c.lead_id || null, status: 'falha', erro: 'telefone invalido', atualizado_em: now }); continue }
      if (optout.has(tel)) { falhas++; envios.push({ org_id: org, disparo_id: dispId, telefone: tel, nome: c.nome || null, lead_id: c.lead_id || null, status: 'falha', erro: 'opt-out', atualizado_em: now }); continue }
      const params = bodyParams.map((p: string) => ({ type: 'text', text: String(p).replace(/\{nome\}/gi, c.nome || '') }))
      const r = await enviarTemplate(tel, template, 'pt_BR', params.length ? [{ type: 'body', parameters: params }] : undefined)
      if (r.ok) enviados++; else falhas++
      envios.push({ org_id: org, disparo_id: dispId, telefone: tel, nome: c.nome || null, lead_id: c.lead_id || null, status: r.ok ? 'enviado' : 'falha', wamid: r.wamid || null, erro: r.ok ? null : r.error, custo: r.ok ? CUSTO : null, enviado_em: r.ok ? now : null, atualizado_em: now })
    }
    if (envios.length) await sb.from('wa_disparo_envios').insert(envios)
    await sb.from('wa_disparos').update({ enviados: (camp.enviados || 0) + enviados, falhas: (camp.falhas || 0) + falhas }).eq('id', dispId)
    const restantes = pend.length - lote.length
    if (restantes <= 0) await sb.from('wa_disparos').update({ status: 'concluido' }).eq('id', dispId)
    return NextResponse.json({ ok: true, codigo, publico, total, enviados, falhas, restantes })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
