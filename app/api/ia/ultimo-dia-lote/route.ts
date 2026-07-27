import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { enviarTemplate, foneOficial } from '@/lib/whatsapp-oficial'
import { nomeSaudacao } from '@/lib/saudacao'
import { dossiesLote } from '@/lib/historico-lead'
import { interpretarFollowup } from '@/lib/interpretar-followup'

export const maxDuration = 60

// 🔔 ÚLTIMO DIA DO LOTE — disparo DIRECIONADO pra quem o time avisou que o lote fecha numa data que é HOJE.
// Manda cnd_lote_ultimo ("hoje é o último dia…") — SEM preço, SEM data inventada (a data é hoje de fato).
// Escopo: leads em lote_preco_ok cuja CONVERSA menciona a data (default 27/07). Travas:
//   • pula quem RESPONDEU hoje (é a vez do time), @lid/inalcançável, quem já recebeu o último-dia,
//   • pula quem a interpretação diz que já saiu do jogo (perda/ganho/agendado/pagamento/próxima turma).
// dryRun (padrão) só simula. Enviar: { dryRun:false, confirm:true }. NÃO depende do kill switch (ação manual revisada).
const familia = (c: string | null) => { const x = (c || '').toLowerCase(); return x.startsWith('fc') ? 'FC' : x.startsWith('anl') ? 'ANL' : '' }
const cursoNome = (fam: string) => fam === 'FC' ? 'Formação Completa em Marketing Digital' : fam === 'ANL' ? 'Anúncios para Negócios Locais' : 'nossos cursos'
const FORA = new Set(['perda', 'ganho', 'agendado', 'aguardando_pagamento', 'proxima_turma'])
const DIA = 864e5

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({} as any))
    const dryRun = b?.dryRun !== false
    const confirm = b?.confirm === true
    const padroes: string[] = Array.isArray(b?.datas) && b.datas.length ? b.datas : ['27/07', '27/7', 'dia 27', '27 de julho']
    if (!dryRun && !confirm) return NextResponse.json({ ok: false, error: 'pra enviar: dryRun=false E confirm=true' }, { status: 200 })

    const now = Date.now()
    const hojeBR = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    const alcancavel = (w: string) => { const s = String(w || ''); if (/@lid|@g\.us|@broadcast|@s\.whatsapp/i.test(s)) return false; const d = s.replace(/\D/g, ''); return d.length >= 10 && d.length <= 13 }

    // template
    const { data: tpl } = await sb.from('followup_templates').select('nome_meta, corpo, variaveis').eq('org_id', org).eq('nome_meta', 'cnd_lote_ultimo').maybeSingle()
    if (!tpl) return NextResponse.json({ ok: false, error: 'template cnd_lote_ultimo não encontrado' }, { status: 200 })

    // leads em lote_preco_ok alcançáveis
    const { data: leadsRaw } = await sb.from('leads').select('id, nome, whatsapp, codigo_turma, turma_id, resumo_ia, resumo_ia_em, etapa').eq('org_id', org).eq('etapa', 'lote_preco_ok').limit(5000)
    const leads = (leadsRaw || []).filter(l => alcancavel(l.whatsapp))

    // conversas desses leads → mensagens que mencionam a data do lote (27/07)
    const leadIds = leads.map(l => l.id)
    const convToLead = new Map<string, string>()
    for (let i = 0; i < leadIds.length; i += 200) { const { data } = await sb.from('wa_conversas').select('id, lead_id').in('lead_id', leadIds.slice(i, i + 200)); for (const c of data || []) if (c.lead_id) convToLead.set(c.id, c.lead_id) }
    const convIds = [...convToLead.keys()]
    const leadsComData = new Set<string>()
    for (const pat of padroes) {
      for (let i = 0; i < convIds.length; i += 150) {
        const { data } = await sb.from('wa_mensagens').select('conversa_id, texto').in('conversa_id', convIds.slice(i, i + 150)).ilike('texto', `%${pat}%`).limit(2000)
        for (const m of data || []) { const lid = convToLead.get(m.conversa_id); if (lid) leadsComData.add(lid) }
      }
    }
    const alvo = leads.filter(l => leadsComData.has(l.id))

    // dossiê (respondeu hoje? / já recebeu último-dia?) + interpretação (cache) pra pular quem saiu do jogo
    const dossies = await dossiesLote(sb, org, alvo)
    // templates já enviados
    const jaUltimo = new Set<string>()
    for (let i = 0; i < alvo.length; i += 100) {
      const chunk = alvo.slice(i, i + 100).map(l => l.id)
      const ands: any[] = []
      for (let from = 0; ; from += 1000) { const { data } = await sb.from('lead_andamentos').select('lead_id, observacao').in('lead_id', chunk).range(from, from + 999); if (!data?.length) break; ands.push(...data); if (data.length < 1000) break }
      for (const a of ands) if (/cnd_lote_ultimo/i.test(a.observacao || '')) jaUltimo.add(a.lead_id)
    }

    // turma (cidade) + família
    const turmaIds = [...new Set(alvo.map(l => l.turma_id).filter(Boolean))] as string[]
    const turmaInfo = new Map<string, { cidade: string; codigo: string }>()
    if (turmaIds.length) { const { data: tt } = await sb.from('turmas').select('id, codigo, cidades(nome)').in('id', turmaIds); for (const t of (tt || []) as any[]) turmaInfo.set(t.id, { cidade: t.cidades?.nome || '', codigo: t.codigo || '' }) }

    const previews: any[] = []
    let enviados = 0, pulados = 0, falhas = 0, falhasSeguidas = 0

    for (const l of alvo) {
      const d = dossies.get(l.id)!
      // já recebeu o último-dia
      if (jaUltimo.has(l.id)) { pulados++; previews.push({ lead: l.nome, pulado: 'já recebeu o último-dia' }); continue }
      // respondeu hoje → vez do time
      const eng = d.ultimoEngajamentoEm
      if (eng && new Date(eng).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) === hojeBR) { pulados++; previews.push({ lead: l.nome, pulado: 'respondeu hoje — é do time' }); continue }
      // interpretação (cache): saiu do jogo?
      const interp = await interpretarFollowup(sb, org, d, l, false)
      if (interp?.etapa && FORA.has(interp.etapa)) { pulados++; previews.push({ lead: l.nome, pulado: `interpretação: ${interp.etapa}` }); continue }

      const ti = turmaInfo.get(l.turma_id || '')
      const fam = familia(l.codigo_turma) || familia(ti?.codigo || null)
      const valores: Record<string, string> = { nome: nomeSaudacao(l.nome), curso: cursoNome(fam), cidade: ti?.cidade || 'sua região' }
      const ordem = (tpl.variaveis || '').split(',').map((s: string) => s.trim()).filter(Boolean)
      const textoRender = (tpl.corpo || '').replace(/\{\{(\w+)\}\}/g, (_m: string, k: string) => valores[k] ?? `{{${k}}}`)
      if (/\{\{\w+\}\}/.test(textoRender)) { pulados++; previews.push({ lead: l.nome, pulado: 'variável não resolvida' }); continue }
      const to = foneOficial(l.whatsapp || '')
      if (!to) { falhas++; continue }

      if (dryRun) { previews.push({ lead: l.nome, texto: textoRender }); continue }

      const parametros = ordem.map((k: string) => ({ type: 'text', text: valores[k] ?? k }))
      const r = await enviarTemplate(to, tpl.nome_meta, 'pt_BR', parametros.length ? [{ type: 'body', parameters: parametros }] : undefined)
      if (!r.ok) { falhas++; falhasSeguidas++; previews.push({ lead: l.nome, erro: r.error }); if (enviados === 0 && falhasSeguidas >= 5) return NextResponse.json({ ok: false, abortado: true, error: 'Abortado: 5 falhas seguidas.', falhas: previews }, { status: 200 }); continue }
      falhasSeguidas = 0; enviados++
      await sb.from('leads').update({ atendido_por: 'ia', atualizado_em: new Date().toISOString() }).eq('id', l.id)
      let conv: any = (await sb.from('wa_conversas').select('id').eq('org_id', org).eq('lead_id', l.id).eq('canal', 'oficial').limit(1).maybeSingle()).data
      if (!conv) { const c = await sb.from('wa_conversas').insert({ org_id: org, telefone: to, nome: l.nome, lead_id: l.id, canal: 'oficial' }).select('id').single(); conv = c.data }
      if (conv) { await sb.from('wa_mensagens').insert({ org_id: org, conversa_id: conv.id, zapi_id: r.wamid || null, direcao: 'enviada', tipo: 'texto', texto: textoRender, status: 'enviada', canal: 'oficial' }); await sb.from('wa_conversas').update({ ultima_msg: textoRender.slice(0, 200), ultima_msg_em: new Date().toISOString() }).eq('id', conv.id) }
      await sb.from('lead_andamentos').insert({ lead_id: l.id, tipo: 'ia_followup', observacao: `🔔 IA — último dia do lote (27/07): ${tpl.nome_meta}` })
    }

    return NextResponse.json({
      ok: true, dryRun, emLotePrecoOk: leads.length, comDataDoLote: alvo.length,
      enviados: dryRun ? previews.filter(p => p.texto).length : enviados, pulados, falhas,
      amostra: dryRun ? previews.filter(p => p.texto).slice(0, 12) : undefined,
      pulos: dryRun ? previews.filter(p => p.pulado).slice(0, 15) : undefined,
      erros: !dryRun ? previews.filter(p => p.erro) : undefined,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
