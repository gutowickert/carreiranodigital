import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { enviarTemplate, foneOficial } from '@/lib/whatsapp-oficial'

export const maxDuration = 60

// ─────────────────────────────────────────────────────────────────────────────
// MIGRAÇÃO DE NÚMERO — leads ANTIGOS (os que já estão no CRM).
// Dispara o template "mudamos de número" da ETAPA de cada lead, pelo número oficial.
// Vincula a conversa (canal oficial) ao lead, atribui o vendedor, cria a tarefa e
// marca o lead como migrado (idempotente — roda em lotes sem reenviar).
//
// Decisões do Guto (2026-07-23): todos no nome do MATEUS; fallback pra curso/nome
// faltando; disparar tudo. Só números válidos (10–13 dígitos).
//
// SEGURANÇA: dryRun=true (padrão) só simula (mostra as mensagens, não envia nem grava).
// Pra enviar de verdade: { dryRun:false, confirm:true }. Processa `limit` por chamada.
// ─────────────────────────────────────────────────────────────────────────────

const MATEUS_ID = 'b9c67274-4bb1-4ec6-a965-c7eedfaa9c9b'
const VENDEDOR_NOME = 'Mateus'

const TEMPLATE_POR_ETAPA: Record<string, string> = {
  atendimento_inicial: 'cnd_mudanca_atendimento',
  lote_preco_ok: 'cnd_mudanca_lote',
  agendado: 'cnd_mudanca_agendado',
  aguardando_pagamento: 'cnd_mudanca_pagamento',
  oferecer_bolsa: 'cnd_mudanca_bolsa',
}
const ETAPAS = Object.keys(TEMPLATE_POR_ETAPA)

const digs = (s: string) => (s || '').replace(/\D/g, '')
const numeroOk = (w: string) => { const d = digs(w); return d.length >= 10 && d.length <= 13 }
const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s
const generico = (n: string | null) => !n || n.trim().length < 2 || /lead|whatsapp|contato|cliente/i.test(n) || /^\d/.test(n.trim())

function primeiroNome(nome: string | null): string {
  if (generico(nome)) return 'tudo bem'         // "Oi tudo bem, aqui é Mateus…"
  return cap((nome || '').trim().split(/\s+/)[0].toLowerCase())
}
function cursoDe(codigo: string | null): string {
  const c = (codigo || '').toLowerCase()
  if (c.startsWith('fc')) return 'Formação Completa em Marketing Digital'
  if (c.startsWith('anl')) return 'Anúncios para Negócios Locais'
  return 'nossos cursos'
}
function renderCorpo(corpo: string, v: { nome: string; vendedor: string; curso: string; cidade: string }): string {
  return (corpo || '')
    .replace(/\{\{nome\}\}/g, v.nome).replace(/\{\{vendedor\}\}/g, v.vendedor)
    .replace(/\{\{curso\}\}/g, v.curso).replace(/\{\{cidade\}\}/g, v.cidade)
}

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({} as any))
    const dryRun = b?.dryRun !== false          // padrão: simula
    const confirm = b?.confirm === true
    const limit = Math.min(Math.max(Number(b?.limit) || 30, 1), 60)
    if (!dryRun && !confirm) return NextResponse.json({ ok: false, error: 'Pra enviar de verdade: dryRun=false E confirm=true' }, { status: 200 })

    // corpos dos templates (pra renderizar o texto que aparece no card)
    const { data: temps } = await sb.from('followup_templates').select('nome_meta, corpo').eq('org_id', org).in('nome_meta', Object.values(TEMPLATE_POR_ETAPA))
    const corpoDe = new Map((temps || []).map(t => [t.nome_meta, t.corpo]))

    // leads ativos das 5 etapas
    const { data: leads } = await sb.from('leads')
      .select('id, nome, whatsapp, etapa, codigo_turma, turma_id, vendedor_id')
      .eq('org_id', org).in('etapa', ETAPAS).order('etapa')
    const reachable = (leads || []).filter(l => numeroOk(l.whatsapp))

    // já migrados (idempotência): leads com andamento tipo 'migracao_num'
    const ids = reachable.map(l => l.id)
    const migrados = new Set<string>()
    for (let i = 0; i < ids.length; i += 300) {
      const { data: am } = await sb.from('lead_andamentos').select('lead_id').eq('tipo', 'migracao_num').in('lead_id', ids.slice(i, i + 300))
      for (const a of am || []) migrados.add(a.lead_id)
    }
    const pendentes = reachable.filter(l => !migrados.has(l.id))

    // cidade por turma
    const turmaIds = [...new Set(pendentes.map(l => l.turma_id).filter(Boolean))] as string[]
    const cidadePorTurma = new Map<string, string>()
    if (turmaIds.length) {
      const { data: tt } = await sb.from('turmas').select('id, cidades(nome)').in('id', turmaIds)
      for (const t of (tt || []) as any[]) if (t.cidades?.nome) cidadePorTurma.set(t.id, t.cidades.nome)
    }

    const lote = pendentes.slice(0, limit)
    const previews: any[] = []
    let enviados = 0, falhas = 0, faltouTemplate = 0
    let falhasSeguidas = 0

    for (const l of lote) {
      const template = TEMPLATE_POR_ETAPA[l.etapa]
      const corpo = corpoDe.get(template)
      if (!template || !corpo) { faltouTemplate++; continue }

      const v = {
        nome: primeiroNome(l.nome),
        vendedor: VENDEDOR_NOME,
        curso: cursoDe(l.codigo_turma),
        cidade: cidadePorTurma.get(l.turma_id || '') || 'sua região',
      }
      const texto = renderCorpo(corpo, v)
      const to = foneOficial(l.whatsapp)

      if (dryRun) { previews.push({ lead: l.nome, etapa: l.etapa, template, para: to, texto }); continue }

      // envia o template (parâmetros na ordem: nome, vendedor, curso, cidade)
      const r = await enviarTemplate(to, template, 'pt_BR', [{
        type: 'body',
        parameters: [
          { type: 'text', text: v.nome }, { type: 'text', text: v.vendedor },
          { type: 'text', text: v.curso }, { type: 'text', text: v.cidade },
        ],
      }])

      if (!r.ok) {
        falhas++; falhasSeguidas++
        previews.push({ lead: l.nome, para: to, erro: r.error })
        // trava de segurança: se as primeiras saírem todas com erro, aborta (protege o número)
        if (enviados === 0 && falhasSeguidas >= 5) return NextResponse.json({ ok: false, abortado: true, error: 'Abortado: 5 falhas seguidas sem nenhum envio ok. Veja o erro.', falhas: previews }, { status: 200 })
        continue
      }
      falhasSeguidas = 0; enviados++

      // atribui vendedor (Mateus) se ainda não tem
      if (!l.vendedor_id) await sb.from('leads').update({ vendedor_id: MATEUS_ID, atualizado_em: new Date().toISOString() }).eq('id', l.id)

      // conversa do canal oficial vinculada ao lead
      let conv: any = null
      const byLead = await sb.from('wa_conversas').select('id').eq('org_id', org).eq('lead_id', l.id).eq('canal', 'oficial').limit(1).maybeSingle()
      if (byLead.data) conv = byLead.data
      if (!conv) { const byFone = await sb.from('wa_conversas').select('id').eq('org_id', org).eq('telefone', to).eq('canal', 'oficial').maybeSingle(); if (byFone.data) conv = byFone.data }
      if (!conv) { const c = await sb.from('wa_conversas').insert({ org_id: org, telefone: to, nome: l.nome, lead_id: l.id, canal: 'oficial' }).select('id').single(); conv = c.data }
      if (conv) {
        await sb.from('wa_mensagens').insert({
          org_id: org, conversa_id: conv.id, zapi_id: r.wamid || null, direcao: 'enviada',
          tipo: 'texto', texto, status: 'enviada', canal: 'oficial',
        })
        await sb.from('wa_conversas').update({ ultima_msg: texto.slice(0, 200), ultima_msg_em: new Date().toISOString() }).eq('id', conv.id)
      }

      // tarefa pro Mateus (só se o lead não tiver tarefa pendente) — dono do follow-up
      const { data: pend } = await sb.from('tarefas_lead').select('id').eq('lead_id', l.id).eq('concluida', false).eq('cancelada', false).limit(1).maybeSingle()
      if (!pend) {
        const amanha = new Date(); amanha.setDate(amanha.getDate() + 1); amanha.setHours(9, 0, 0, 0)
        await sb.from('tarefas_lead').insert({
          lead_id: l.id, vendedor_id: MATEUS_ID, tipo: 'seguir_followup',
          titulo: `Retomar (migração de número) — ${l.nome || 'lead'}`,
          descricao: 'Avisamos a mudança de número. Se responder, a conversa abre no card; se não, retomar por aqui.',
          data_vencimento: amanha.toISOString(),
        })
      }

      // marca migrado (idempotência)
      await sb.from('lead_andamentos').insert({
        lead_id: l.id, vendedor_id: MATEUS_ID, tipo: 'migracao_num',
        observacao: `Migração de número: enviado ${template} (${v.curso}, ${v.cidade})`,
      })
    }

    const restantes = pendentes.length - (dryRun ? 0 : (enviados + falhas + faltouTemplate))
    return NextResponse.json({
      ok: true, dryRun,
      totalAtivos: (leads || []).length, alcancaveis: reachable.length, jaMigrados: migrados.size,
      pendentes: pendentes.length, processadosAgora: lote.length,
      enviados, falhas, faltouTemplate, restantes: Math.max(0, restantes),
      amostra: dryRun ? previews.slice(0, 8) : undefined,
      erros: !dryRun && previews.length ? previews : undefined,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
