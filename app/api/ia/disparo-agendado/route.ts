import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { nomeSaudacao } from '@/lib/saudacao'

export const maxDuration = 60

// 📣 DISPARO AGENDADO — endpoint feito pra o pg_cron chamar (dentro da infra, SEM firewall, diferente do agente da nuvem).
// Dado um código de turma + template, ele monta o público SOZINHO (server-side) e dispara via /api/wa-oficial/disparar
// (que já tem a trava de "não vai pra lead ativo", opt-out e log). Assim disparo agendado é confiável, igual ao followup.
//   publico='perda' → leads em PERDA da turma (win-back)
//   publico='fria'  → lista fria importada (wa_contatos sem lead) da cidade+produto da turma
// dryRun (padrão true) só conta. Disparar: { dryRun:false, confirm:true }.
const familia = (c: string) => { const x = (c || '').toLowerCase(); return x.startsWith('fc') ? 'FC' : x.startsWith('anl') ? 'ANL' : '' }
const alcancavel = (w: string) => { const s = String(w || ''); if (/@lid|@g\.us|@broadcast|@s\.whatsapp/i.test(s)) return false; const d = s.replace(/\D/g, ''); return d.length >= 10 && d.length <= 13 }

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({} as any))
    const codigo = String(b?.codigo_turma || '').trim()
    const template = String(b?.template || '').trim()
    const publico = (b?.publico || 'perda').toLowerCase()
    const dryRun = b?.dryRun !== false
    const confirm = b?.confirm === true
    if (!codigo || !template) return NextResponse.json({ ok: false, error: 'codigo_turma e template são obrigatórios' }, { status: 200 })
    if (!dryRun && !confirm) return NextResponse.json({ ok: false, error: 'pra disparar: dryRun=false E confirm=true' }, { status: 200 })

    const { data: turma } = await sb.from('turmas').select('id, codigo, cidades(nome)').eq('org_id', org).eq('codigo', codigo).maybeSingle()
    if (!turma) return NextResponse.json({ ok: false, error: `turma ${codigo} não encontrada` }, { status: 200 })
    const cidade = (turma as any).cidades?.nome || ''
    const fam = familia(codigo)

    // monta o público
    let contatos: any[] = []
    if (publico === 'perda') {
      const { data: leads } = await sb.from('leads').select('id, nome, whatsapp').eq('org_id', org).eq('turma_id', turma.id).eq('etapa', 'perda').limit(3000)
      contatos = (leads || []).filter(l => alcancavel(l.whatsapp)).map(l => ({ telefone: l.whatsapp, nome: nomeSaudacao(l.nome), lead_id: l.id }))
    } else if (publico === 'fria') {
      // lista fria importada (sem lead) da cidade+produto, que ainda não respondeu
      const { data: wc } = await sb.from('wa_contatos').select('telefone, nome').eq('org_id', org).eq('cidade', cidade).is('lead_id', null).eq('categoria', 'interessado').eq('produto', fam).neq('status', 'respondeu').limit(5000)
      contatos = (wc || []).filter(x => alcancavel(x.telefone)).map(x => ({ telefone: x.telefone, nome: nomeSaudacao(x.nome) }))
    } else {
      return NextResponse.json({ ok: false, error: `publico '${publico}' inválido (use perda ou fria)` }, { status: 200 })
    }

    if (dryRun) return NextResponse.json({ ok: true, dryRun: true, codigo, cidade, publico, total: contatos.length })
    if (!contatos.length) return NextResponse.json({ ok: true, codigo, publico, total: 0, enviados: 0 })

    // dispara pelo PRÓPRIO app (server-side → alcança o próprio domínio, sem firewall). Origem dinâmica (sem URL cravada).
    const origin = new URL(req.url).origin
    const disp = (body: any) => fetch(origin + '/api/wa-oficial/disparar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()).catch(e => ({ ok: false, error: String(e) }))
    const bodyParams: string[] = Array.isArray(b?.bodyParams) && b.bodyParams.length ? b.bodyParams : ['{nome}', cidade]

    const cr = await disp({ action: 'criar', nome: `Agendado ${template} ${codigo}`, template, idioma: 'pt_BR', categoria: 'marketing', total: contatos.length })
    if (!cr.ok) return NextResponse.json({ ok: false, error: 'criar falhou: ' + (cr.error || '') }, { status: 200 })
    let enviados = 0, falhas = 0, pulados = 0
    for (let i = 0; i < contatos.length; i += 40) {
      const r = await disp({ action: 'enviar', disparoId: cr.disparoId, template, idioma: 'pt_BR', categoria: 'marketing', bodyParams, contatos: contatos.slice(i, i + 40) })
      if (r.ok) { enviados += r.enviados || 0; falhas += r.falhas || 0; pulados += r.pulados || 0 }
    }
    await disp({ action: 'concluir', disparoId: cr.disparoId })
    return NextResponse.json({ ok: true, codigo, cidade, publico, enviados, falhas, pulados })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
