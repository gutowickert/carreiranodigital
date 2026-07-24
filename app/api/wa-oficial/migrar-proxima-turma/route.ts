import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { enviarTemplate, foneOficial } from '@/lib/whatsapp-oficial'
import { nomeSaudacao, datasCurtas } from '@/lib/saudacao'

export const maxDuration = 60

// MIGRAÇÃO dos leads em PROXIMA_TURMA (antigos, com histórico no número Z-API).
// Pra cada lead: acha a PRÓXIMA turma aberta na CIDADE + PRODUTO dele.
//  - TEM turma → template cnd_mudanca_proxima (com as DATAS).
//  - NÃO tem  → reabridor cnd_mudanca_atendimento (a IA entrega a turma na resposta).
// Só quem teve o número antigo (conversa 'zapi') e ainda não foi migrado. dryRun + lotes + idempotente.

const MATEUS_ID = 'b9c67274-4bb1-4ec6-a965-c7eedfaa9c9b'
const VENDEDOR_NOME = 'Mateus'
const TPL_DATAS = 'cnd_mudanca_proxima'
const TPL_REABRIR = 'cnd_mudanca_atendimento'

const digs = (s: string) => (s || '').replace(/\D/g, '')
const numeroOk = (w: string) => { const d = digs(w); return d.length >= 10 && d.length <= 13 }
const familia = (c: string | null) => { const x = (c || '').toLowerCase(); return x.startsWith('fc') ? 'FC' : x.startsWith('anl') ? 'ANL' : '' }
const cursoNome = (fam: string) => fam === 'FC' ? 'Formação Completa em Marketing Digital' : fam === 'ANL' ? 'Anúncios para Negócios Locais' : 'nossos cursos'
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
const brData = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({} as any))
    const dryRun = b?.dryRun !== false
    const confirm = b?.confirm === true
    const limit = Math.min(Math.max(Number(b?.limit) || 25, 1), 60)
    if (!dryRun && !confirm) return NextResponse.json({ ok: false, error: 'pra enviar: dryRun=false E confirm=true' }, { status: 200 })

    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

    // templates (corpo pra renderizar o texto no card)
    const { data: temps } = await sb.from('followup_templates').select('nome_meta, corpo, variaveis').eq('org_id', org).in('nome_meta', [TPL_DATAS, TPL_REABRIR])
    const tplBy = new Map((temps || []).map(t => [t.nome_meta, t]))
    const render = (nome: string, v: Record<string, string>) => (tplBy.get(nome)?.corpo || '').replace(/\{\{(\w+)\}\}/g, (_m: string, k: string) => v[k] ?? `{{${k}}}`)

    // leads em proxima_turma
    const { data: leads } = await sb.from('leads').select('id, nome, whatsapp, codigo_turma, turma_id, vendedor_id').eq('org_id', org).eq('etapa', 'proxima_turma')
    // só quem teve o número antigo
    const { data: zc } = await sb.from('wa_conversas').select('lead_id').eq('org_id', org).eq('canal', 'zapi').not('lead_id', 'is', null).limit(10000)
    const comZapi = new Set((zc || []).map((c: any) => c.lead_id))
    const reachable = (leads || []).filter(l => numeroOk(l.whatsapp) && comZapi.has(l.id))
    // já migrados
    const ids = reachable.map(l => l.id)
    const migrados = new Set<string>()
    for (let i = 0; i < ids.length; i += 300) {
      const { data: am } = await sb.from('lead_andamentos').select('lead_id').eq('tipo', 'migracao_num').in('lead_id', ids.slice(i, i + 300))
      for (const a of am || []) migrados.add(a.lead_id)
    }
    const pendentes = reachable.filter(l => !migrados.has(l.id))

    // cidade de cada lead (da turma que ele veio etiquetado, mesmo passada)
    const turmaIds = [...new Set(pendentes.map(l => l.turma_id).filter(Boolean))] as string[]
    const cidadeDoLeadTurma = new Map<string, string>()
    if (turmaIds.length) {
      const { data: tt } = await sb.from('turmas').select('id, cidades(nome)').in('id', turmaIds)
      for (const t of (tt || []) as any[]) if (t.cidades?.nome) cidadeDoLeadTurma.set(t.id, t.cidades.nome)
    }

    // TURMAS ABERTAS (futuras) + datas
    const { data: tv } = await sb.from('turmas').select('id, codigo, data_inicio, produtos(nome), cidades(nome)').gte('data_inicio', hoje).not('status', 'in', '(cancelada,realizada)').order('data_inicio')
    const tvIds = (tv || []).map((t: any) => t.id)
    const datasPorTurma: Record<string, string[]> = {}
    if (tvIds.length) {
      const { data: dd } = await sb.from('turma_datas').select('turma_id, data').in('turma_id', tvIds).order('data')
      for (const d of (dd || [])) (datasPorTurma[d.turma_id] = datasPorTurma[d.turma_id] || []).push(brData(d.data))
    }
    // acha a próxima turma aberta na cidade + família
    const proxNaCidade = (cidade: string, fam: string) => {
      const cand = (tv || []).filter((t: any) => norm(t.cidades?.nome) === norm(cidade) && (fam ? familia(t.codigo) === fam : true))
      return cand[0] || (tv || []).find((t: any) => norm(t.cidades?.nome) === norm(cidade)) || null
    }

    const lote = pendentes.slice(0, limit)
    const previews: any[] = []
    let comDatas = 0, semDatas = 0, enviados = 0, falhas = 0, falhasSeguidas = 0

    for (const l of lote) {
      const fam = familia(l.codigo_turma)
      const cidade = cidadeDoLeadTurma.get(l.turma_id || '') || ''
      const prox = cidade ? proxNaCidade(cidade, fam) : null
      const datasArr = prox ? (datasPorTurma[prox.id] || []) : []
      const temDatas = !!prox && datasArr.length > 0
      const datasStr = datasCurtas(datasArr)

      const templateNome = temDatas ? TPL_DATAS : TPL_REABRIR
      const v: Record<string, string> = {
        nome: nomeSaudacao(l.nome), vendedor: VENDEDOR_NOME,
        curso: cursoNome(fam) === 'nossos cursos' && prox ? ((prox as any).produtos?.nome || 'nossos cursos') : cursoNome(fam),
        cidade: cidade || 'sua região', datas: datasStr,
      }
      const textoRender = render(templateNome, v)
      const to = foneOficial(l.whatsapp)
      temDatas ? comDatas++ : semDatas++

      if (dryRun) { previews.push({ lead: l.nome, template: templateNome, cidade: v.cidade, datas: datasStr || '(sem turma na cidade → reabridor)', texto: textoRender }); continue }

      const ordem = (tplBy.get(templateNome)?.variaveis || '').split(',').map((s: string) => s.trim()).filter(Boolean)
      const parametros = ordem.map((k: string) => ({ type: 'text', text: v[k] ?? k }))
      const r = await enviarTemplate(to, templateNome, 'pt_BR', parametros.length ? [{ type: 'body', parameters: parametros }] : undefined)
      if (!r.ok) {
        falhas++; falhasSeguidas++
        previews.push({ lead: l.nome, template: templateNome, erro: r.error })
        if (enviados === 0 && falhasSeguidas >= 5) return NextResponse.json({ ok: false, abortado: true, error: 'Abortado: 5 falhas seguidas. Veja o erro.', falhas: previews }, { status: 200 })
        continue
      }
      falhasSeguidas = 0; enviados++

      if (!l.vendedor_id) await sb.from('leads').update({ vendedor_id: MATEUS_ID, atualizado_em: new Date().toISOString() }).eq('id', l.id)
      // conversa oficial + mensagem
      let conv: any = null
      const byLead = await sb.from('wa_conversas').select('id').eq('org_id', org).eq('lead_id', l.id).eq('canal', 'oficial').limit(1).maybeSingle()
      if (byLead.data) conv = byLead.data
      if (!conv) { const byFone = await sb.from('wa_conversas').select('id').eq('org_id', org).eq('telefone', to).eq('canal', 'oficial').maybeSingle(); if (byFone.data) conv = byFone.data }
      if (!conv) { const c = await sb.from('wa_conversas').insert({ org_id: org, telefone: to, nome: l.nome, lead_id: l.id, canal: 'oficial' }).select('id').single(); conv = c.data }
      if (conv) {
        await sb.from('wa_mensagens').insert({ org_id: org, conversa_id: conv.id, zapi_id: r.wamid || null, direcao: 'enviada', tipo: 'texto', texto: textoRender, status: 'enviada', canal: 'oficial' })
        await sb.from('wa_conversas').update({ ultima_msg: textoRender.slice(0, 200), ultima_msg_em: new Date().toISOString() }).eq('id', conv.id)
      }
      // tarefa pro Mateus se não tiver
      const { data: pend } = await sb.from('tarefas_lead').select('id').eq('lead_id', l.id).eq('concluida', false).eq('cancelada', false).limit(1).maybeSingle()
      if (!pend) {
        const amanha = new Date(); amanha.setDate(amanha.getDate() + 1); amanha.setHours(9, 0, 0, 0)
        await sb.from('tarefas_lead').insert({ lead_id: l.id, vendedor_id: MATEUS_ID, tipo: 'seguir_followup', titulo: `Retomar (próxima turma) — ${l.nome || 'lead'}`, descricao: 'Avisamos da mudança de número + próxima turma da cidade. Se responder, conversa abre no card.', data_vencimento: amanha.toISOString() })
      }
      await sb.from('lead_andamentos').insert({ lead_id: l.id, vendedor_id: MATEUS_ID, tipo: 'migracao_num', observacao: `Migração (próxima turma): ${templateNome}${datasStr ? ' — ' + datasStr : ''} (${v.cidade})` })
    }

    const restantes = pendentes.length - (dryRun ? 0 : (enviados + falhas))
    return NextResponse.json({
      ok: true, dryRun, alcancaveis: reachable.length, jaMigrados: migrados.size, pendentes: pendentes.length,
      processadosAgora: lote.length, comDatas, semDatas, enviados, falhas, restantes: Math.max(0, restantes),
      amostra: dryRun ? previews.slice(0, 8) : undefined, erros: !dryRun && previews.length ? previews : undefined,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
