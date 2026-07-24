import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { enviarTemplate, foneOficial } from '@/lib/whatsapp-oficial'
import { nomeSaudacao } from '@/lib/saudacao'

export const maxDuration = 60

// RECUPERAÇÃO: leads que receberam uma mensagem LIVRE hoje FORA da janela de 24h (provável falha
// de entrega — o Meta dá wamid mas não entrega). Reabre com TEMPLATE (cnd_retomar, entrega frio).
// Idempotente (marca 'recuperacao_falha'), dryRun + lotes.

const TPL = 'cnd_retomar' // reabridor genérico aprovado (nome, vendedor, cidade)
const cursoDe = (c: string | null) => { const x = (c || '').toLowerCase(); return x.startsWith('fc') ? 'Formação Completa em Marketing Digital' : x.startsWith('anl') ? 'Anúncios para Negócios Locais' : 'nossos cursos' }

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({} as any))
    const dryRun = b?.dryRun !== false
    const confirm = b?.confirm === true
    const limit = Math.min(Math.max(Number(b?.limit) || 25, 1), 60)
    if (!dryRun && !confirm) return NextResponse.json({ ok: false, error: 'pra enviar: dryRun=false E confirm=true' }, { status: 200 })
    const hojeIni = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) + 'T00:00:00-03:00').toISOString()

    // conversas oficiais (lead -> convIds)
    const { data: convs } = await sb.from('wa_conversas').select('id, lead_id').eq('org_id', org).eq('canal', 'oficial').not('lead_id', 'is', null).limit(20000)
    const leadDaConv = new Map<string, string>((convs || []).map((c: any) => [c.id, c.lead_id]))
    const convsDeLead: Record<string, string[]> = {}
    for (const [cid, lid] of leadDaConv) (convsDeLead[lid] = convsDeLead[lid] || []).push(cid)
    const cids = [...leadDaConv.keys()]

    // outbound de hoje
    const outbound: any[] = []
    for (let i = 0; i < cids.length; i += 200) {
      const { data } = await sb.from('wa_mensagens').select('conversa_id, texto, criado_em').in('conversa_id', cids.slice(i, i + 200)).eq('direcao', 'enviada').gte('criado_em', hojeIni)
      outbound.push(...(data || []))
    }
    // leads afetados: msg LIVRE (não template) FORA da janela de 24h
    const afetados = new Set<string>()
    for (const m of outbound) {
      if (/Tivemos um problema no nosso n|salva este (novo )?contato|mudamos de n[úu]mero/i.test(m.texto || '')) continue // template
      const lead = leadDaConv.get(m.conversa_id); if (!lead) continue
      if (afetados.has(lead)) continue
      const convsLead = convsDeLead[lead] || []
      const { data: ins } = await sb.from('wa_mensagens').select('criado_em').in('conversa_id', convsLead).eq('direcao', 'recebida').lt('criado_em', m.criado_em).order('criado_em', { ascending: false }).limit(1)
      const ultIn = ins && ins[0] ? +new Date(ins[0].criado_em) : 0
      if (+new Date(m.criado_em) - ultIn > 24 * 60 * 60 * 1000) afetados.add(lead)
    }
    const ids = [...afetados]

    // já recuperados (idempotência)
    const jaRec = new Set<string>()
    for (let i = 0; i < ids.length; i += 300) {
      const { data: am } = await sb.from('lead_andamentos').select('lead_id').eq('tipo', 'recuperacao_falha').in('lead_id', ids.slice(i, i + 300))
      for (const a of am || []) jaRec.add(a.lead_id)
    }
    const pendentes = ids.filter(id => !jaRec.has(id))

    // dados dos leads + template
    const { data: tpl } = await sb.from('followup_templates').select('corpo, variaveis').eq('org_id', org).eq('nome_meta', TPL).maybeSingle()
    const ordem = (tpl?.variaveis || 'nome,vendedor,cidade').split(',').map((s: string) => s.trim()).filter(Boolean)
    const lote = pendentes.slice(0, limit)
    const previews: any[] = []
    let enviados = 0, falhas = 0, falhasSeguidas = 0

    for (const leadId of lote) {
      const { data: L } = await sb.from('leads').select('id, nome, whatsapp, codigo_turma, turma_id, vendedor_id').eq('id', leadId).maybeSingle()
      if (!L) continue
      let vendedorNome = 'Mateus'
      if (L.vendedor_id) { const { data: u } = await sb.from('usuarios_perfil').select('nome').eq('id', L.vendedor_id).maybeSingle(); if (u?.nome) vendedorNome = u.nome.split(' ')[0] }
      let cidade = 'sua região'
      if (L.turma_id) { const { data: t } = await sb.from('turmas').select('cidades(nome)').eq('id', L.turma_id).maybeSingle(); if ((t as any)?.cidades?.nome) cidade = (t as any).cidades.nome }
      const valores: Record<string, string> = { nome: nomeSaudacao(L.nome), vendedor: vendedorNome, cidade, curso: cursoDe(L.codigo_turma) }
      const textoRender = (tpl?.corpo || '').replace(/\{\{(\w+)\}\}/g, (_m: string, k: string) => valores[k] ?? `{{${k}}}`)
      const to = foneOficial(L.whatsapp || '')
      if (!to) continue

      if (dryRun) { previews.push({ lead: L.nome, cidade, texto: textoRender }); continue }

      const parametros = ordem.map((k: string) => ({ type: 'text', text: valores[k] ?? k }))
      const r = await enviarTemplate(to, TPL, 'pt_BR', [{ type: 'body', parameters: parametros }])
      if (!r.ok) {
        falhas++; falhasSeguidas++; previews.push({ lead: L.nome, erro: r.error })
        if (enviados === 0 && falhasSeguidas >= 5) return NextResponse.json({ ok: false, abortado: true, error: 'Abortado: 5 falhas seguidas.', falhas: previews }, { status: 200 })
        continue
      }
      falhasSeguidas = 0; enviados++
      // conversa oficial + mensagem
      let conv: any = (await sb.from('wa_conversas').select('id').eq('org_id', org).eq('lead_id', L.id).eq('canal', 'oficial').limit(1).maybeSingle()).data
      if (!conv) { const c = await sb.from('wa_conversas').insert({ org_id: org, telefone: to, nome: L.nome, lead_id: L.id, canal: 'oficial' }).select('id').single(); conv = c.data }
      if (conv) {
        await sb.from('wa_mensagens').insert({ org_id: org, conversa_id: conv.id, zapi_id: r.wamid || null, direcao: 'enviada', tipo: 'texto', texto: textoRender, status: 'enviada', canal: 'oficial' })
        await sb.from('wa_conversas').update({ ultima_msg: textoRender.slice(0, 200), ultima_msg_em: new Date().toISOString() }).eq('id', conv.id)
      }
      await sb.from('lead_andamentos').insert({ lead_id: L.id, tipo: 'recuperacao_falha', observacao: `Reaberto com template ${TPL} (mensagem livre de hoje falhou fora da janela 24h).` })
    }

    const restantes = pendentes.length - (dryRun ? 0 : (enviados + falhas))
    return NextResponse.json({ ok: true, dryRun, afetadosTotal: ids.length, jaRecuperados: jaRec.size, pendentes: pendentes.length, processadosAgora: lote.length, enviados, falhas, restantes: Math.max(0, restantes), amostra: dryRun ? previews.slice(0, 6) : undefined, erros: !dryRun && previews.length ? previews : undefined })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
