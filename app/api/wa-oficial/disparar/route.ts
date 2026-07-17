import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { enviarTemplate, foneOficial } from '@/lib/whatsapp-oficial'

// Custo estimado por categoria (Brasil, aprox.)
function custoCategoria(cat: string): number {
  return cat === 'marketing' ? 0.35 : 0.03 // utility/authentication
}

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const body = await req.json()
    const { action } = body

    // 1) Cria a campanha e retorna o id
    if (action === 'criar') {
      const { nome, template, idioma, categoria, total } = body
      const { data, error } = await supabase.from('wa_disparos').insert({
        org_id: org,
        nome: nome || `Disparo ${template}`,
        template_nome: template,
        template_idioma: idioma || 'pt_BR',
        categoria: categoria || 'marketing',
        status: 'enviando',
        total: total || 0,
      }).select('id').single()
      if (error || !data) return NextResponse.json({ ok: false, error: error?.message || 'erro ao criar' }, { status: 200 })
      return NextResponse.json({ ok: true, disparoId: data.id })
    }

    // 2) Envia um LOTE de contatos da campanha
    if (action === 'enviar') {
      const { disparoId, template, idioma, categoria, headerMidia, bodyParams, contatos } = body
      if (!disparoId || !template || !Array.isArray(contatos)) {
        return NextResponse.json({ ok: false, error: 'parâmetros faltando' }, { status: 200 })
      }
      const custo = custoCategoria((categoria || 'marketing').toLowerCase())

      // opt-out: não envia pra quem pediu pra sair
      const fones = contatos.map((c: any) => foneOficial(c.telefone))
      const { data: outs } = await supabase.from('wa_optout').select('telefone').eq('org_id', org).in('telefone', fones)
      const optoutSet = new Set((outs || []).map((o: any) => o.telefone))

      let enviados = 0, falhas = 0
      const envios: any[] = []

      for (const c of contatos) {
        const tel = foneOficial(c.telefone)
        if (!tel || tel.length < 12) { falhas++; envios.push({ org_id: org, disparo_id: disparoId, telefone: c.telefone, nome: c.nome || null, lead_id: c.lead_id || null, aluno_id: c.aluno_id || null, status: 'falha', erro: 'telefone invalido', atualizado_em: new Date().toISOString() }); continue }
        if (optoutSet.has(tel)) { falhas++; envios.push({ org_id: org, disparo_id: disparoId, telefone: tel, nome: c.nome || null, lead_id: c.lead_id || null, aluno_id: c.aluno_id || null, status: 'falha', erro: 'opt-out', atualizado_em: new Date().toISOString() }); continue }

        // monta componentes do template
        const componentes: any[] = []
        if (headerMidia && headerMidia.tipo && (headerMidia.id || headerMidia.link)) {
          const tipo = headerMidia.tipo // image | video | document
          const midiaParam = headerMidia.id ? { id: headerMidia.id } : { link: headerMidia.link }
          componentes.push({ type: 'header', parameters: [{ type: tipo, [tipo]: midiaParam }] })
        }
        if (Array.isArray(bodyParams) && bodyParams.length) {
          const params = bodyParams.map((p: string) => ({ type: 'text', text: (p || '').replace(/\{nome\}/gi, c.nome || '') }))
          componentes.push({ type: 'body', parameters: params })
        }

        const r = await enviarTemplate(tel, template, idioma || 'pt_BR', componentes.length ? componentes : undefined)
        if (r.ok) enviados++; else falhas++
        envios.push({
          org_id: org, disparo_id: disparoId, telefone: tel, nome: c.nome || null,
          lead_id: c.lead_id || null, aluno_id: c.aluno_id || null,
          status: r.ok ? 'enviado' : 'falha', wamid: r.wamid || null, erro: r.ok ? null : r.error,
          custo: r.ok ? custo : null, enviado_em: r.ok ? new Date().toISOString() : null,
          atualizado_em: new Date().toISOString(),
        })
      }

      if (envios.length) await supabase.from('wa_disparo_envios').insert(envios)
      // atualiza contadores da campanha
      const { data: d } = await supabase.from('wa_disparos').select('enviados, falhas').eq('org_id', org).eq('id', disparoId).single()
      await supabase.from('wa_disparos').update({
        enviados: (d?.enviados || 0) + enviados,
        falhas: (d?.falhas || 0) + falhas,
      }).eq('org_id', org).eq('id', disparoId)

      // marca os contatos frios que receberam (só novo -> enviado; preserva respondeu/optout/etc).
      // Inofensivo p/ leads/colados: telefone que não está em wa_contatos só não casa.
      const enviadosFones = envios.filter(e => e.status === 'enviado').map(e => e.telefone)
      if (enviadosFones.length) {
        await supabase.from('wa_contatos')
          .update({ status: 'enviado', atualizado_em: new Date().toISOString() })
          .eq('org_id', org).in('telefone', enviadosFones).eq('status', 'novo')
      }

      return NextResponse.json({ ok: true, enviados, falhas })
    }

    // 3) Finaliza a campanha
    if (action === 'concluir') {
      await supabase.from('wa_disparos').update({ status: 'concluido' }).eq('org_id', org).eq('id', body.disparoId)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: false, error: 'action inválida' }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}
