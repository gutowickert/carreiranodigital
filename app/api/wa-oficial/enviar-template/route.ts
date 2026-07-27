import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { enviarTemplate, foneOficial } from '@/lib/whatsapp-oficial'
import { nomeSaudacao, datasCurtas } from '@/lib/saudacao'

const money = (n: number) => 'R$' + n.toFixed(2).replace('.', ',').replace(/,00$/, '')
const familia = (c: string | null) => { const x = (c || '').toLowerCase(); return x.startsWith('fc') ? 'FC' : x.startsWith('anl') ? 'ANL' : '' }
// datas por extenso a partir do intervalo da turma (ex.: "03, 04 e 05/08")
function datasDaTurma(ini: string | null, fim: string | null): string {
  if (!ini) return ''
  const a = new Date(ini + 'T12:00:00Z'), b = fim ? new Date(fim + 'T12:00:00Z') : a
  const arr: string[] = []
  for (const d = new Date(a); d <= b && arr.length < 10; d.setUTCDate(d.getUTCDate() + 1)) arr.push(`${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  return datasCurtas(arr)
}

// Envia um TEMPLATE aprovado pra REABRIR uma conversa fria (>24h) pelo número oficial.
// Escolhe o template pela ETAPA do lead (os cnd_mudanca_* de migração = "mudamos de número, me
// responde com um oi"); fora dessas etapas usa o reabridor genérico cnd_retomar.
// Preenche as variáveis na ordem que o template declara (followup_templates.variaveis).
// Grava a mensagem na conversa OFICIAL (cai no card). A resposta do cliente é que abre as 24h.

const TEMPLATE_POR_ETAPA: Record<string, string> = {
  atendimento_inicial: 'cnd_mudanca_atendimento',
  lote_preco_ok: 'cnd_mudanca_lote',
  agendado: 'cnd_mudanca_agendado',
  aguardando_pagamento: 'cnd_mudanca_pagamento',
  oferecer_bolsa: 'cnd_mudanca_bolsa',
}
const cursoDe = (c: string | null) => { const x = (c || '').toLowerCase(); return x.startsWith('fc') ? 'Formação Completa em Marketing Digital' : x.startsWith('anl') ? 'Anúncios para Negócios Locais' : 'nossos cursos' }

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({} as any))
    const leadId = (b.leadId || '').toString().trim()
    let conversaId = (b.conversaId || '').toString().trim()
    let templateNome = (b.template || '').toString().trim()

    // resolve o lead (por leadId ou pela conversa)
    let lead: any = null
    if (leadId) {
      const { data } = await sb.from('leads').select('id, nome, whatsapp, etapa, codigo_turma, turma_id, vendedor_id').eq('org_id', org).eq('id', leadId).maybeSingle()
      lead = data
    } else if (conversaId) {
      const { data: c } = await sb.from('wa_conversas').select('lead_id, telefone, nome').eq('org_id', org).eq('id', conversaId).maybeSingle()
      if (c?.lead_id) { const { data } = await sb.from('leads').select('id, nome, whatsapp, etapa, codigo_turma, turma_id, vendedor_id').eq('org_id', org).eq('id', c.lead_id).maybeSingle(); lead = data }
      if (!lead && c) lead = { id: null, nome: c.nome, whatsapp: c.telefone, etapa: null, codigo_turma: null, turma_id: null, vendedor_id: null }
    }
    if (!lead) return NextResponse.json({ ok: false, error: 'lead/conversa não encontrado' }, { status: 200 })

    // escolhe o template: o pedido, senão o da etapa, senão o reabridor genérico
    if (!templateNome) templateNome = TEMPLATE_POR_ETAPA[lead.etapa] || 'cnd_retomar'
    const { data: tpl } = await sb.from('followup_templates').select('nome_meta, corpo, variaveis').eq('org_id', org).eq('nome_meta', templateNome).maybeSingle()
    if (!tpl) return NextResponse.json({ ok: false, error: `template ${templateNome} não encontrado` }, { status: 200 })

    // nome do vendedor (dono do lead) — senão o padrão Mateus
    let vendedorNome = 'Mateus'
    if (lead.vendedor_id) { const { data: u } = await sb.from('usuarios_perfil').select('nome').eq('id', lead.vendedor_id).maybeSingle(); if (u?.nome) vendedorNome = u.nome.split(' ')[0] }
    // turma: cidade + preço + código (deriva produto) + datas
    let cidade = 'sua região', turmaCod = '', precoTurma = 0, datas = ''
    if (lead.turma_id) { const { data: t } = await sb.from('turmas').select('codigo, preco_venda, data_inicio, data_fim, cidades(nome)').eq('id', lead.turma_id).maybeSingle(); if (t) { if ((t as any).cidades?.nome) cidade = (t as any).cidades.nome; turmaCod = (t as any).codigo || ''; precoTurma = (t as any).preco_venda || 0; datas = datasDaTurma((t as any).data_inicio, (t as any).data_fim) } }
    // produto/preço com o MESMO tratamento do motor (deriva da turma se o lead não tem código) + blindagem R$0
    const fam = familia(lead.codigo_turma) || familia(turmaCod)
    let precoPix = fam === 'ANL' ? 797 : fam === 'FC' ? 2397 : 0
    if (!precoPix && precoTurma > 0) precoPix = precoTurma

    // ⛔ BLINDAGEM 1: template que PRECISA de preço sem preço confiável → não manda (foi o bug do {{condicao_bolsa}}).
    const precisaPreco = /\{\{\s*(preco|preco_pix|preco_cartao|condicao_bolsa)\s*\}\}/.test(tpl.corpo || '')
    if (precisaPreco && precoPix <= 0) return NextResponse.json({ ok: false, error: 'Esse template usa preço/condição, mas não há preço confiável pra este lead (falta produto/turma no cadastro). Escolha outro template ou complete o cadastro.' }, { status: 200 })

    const valores: Record<string, string> = {
      nome: nomeSaudacao(lead.nome), vendedor: vendedorNome,
      curso: cursoDe(lead.codigo_turma) !== 'nossos cursos' ? cursoDe(lead.codigo_turma) : (fam === 'FC' ? 'Formação Completa em Marketing Digital' : fam === 'ANL' ? 'Anúncios para Negócios Locais' : 'nossos cursos'),
      cidade, datas, prazo: 'esta semana',
      preco_pix: money(precoPix), preco: money(precoPix),
      preco_cartao: fam === 'FC' ? 'R$2697 no cartão em até 10x' : '',
      condicao_bolsa: `${money(precoPix * 0.9)} no Pix (10% de desconto)`, condicao: '',
    }
    const ordem = (tpl.variaveis || '').split(',').map((s: string) => s.trim()).filter(Boolean)
    const textoRender = (tpl.corpo || '').replace(/\{\{(\w+)\}\}/g, (_m: string, k: string) => valores[k] ?? `{{${k}}}`)

    // ⛔ BLINDAGEM 2: qualquer variável não resolvida ({{x}}) ou preço zerado (R$0) no texto → não manda.
    if (/\{\{\w+\}\}/.test(textoRender)) return NextResponse.json({ ok: false, error: 'Esse template usa uma variável que não consegui preencher pra este lead. Escolha outro template ou complete o cadastro do lead.' }, { status: 200 })
    if (/R\$\s?0(?![0-9.,])/.test(textoRender)) return NextResponse.json({ ok: false, error: 'Preço ficou R$0 — cadastro do lead/turma incompleto. Não enviei.' }, { status: 200 })

    const parametros = ordem.map((v: string) => ({ type: 'text', text: valores[v] ?? v }))

    const to = foneOficial(lead.whatsapp || '')
    if (!to) return NextResponse.json({ ok: false, error: 'telefone inválido' }, { status: 200 })

    const r = await enviarTemplate(to, templateNome, 'pt_BR', parametros.length ? [{ type: 'body', parameters: parametros }] : undefined)
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error || 'falha ao enviar template' }, { status: 200 })

    // acha/cria a conversa oficial e grava a mensagem (cai no card)
    if (!conversaId) {
      const byLead = lead.id ? (await sb.from('wa_conversas').select('id').eq('org_id', org).eq('lead_id', lead.id).eq('canal', 'oficial').limit(1).maybeSingle()).data : null
      const byFone = byLead ? null : (await sb.from('wa_conversas').select('id').eq('org_id', org).eq('telefone', to).eq('canal', 'oficial').maybeSingle()).data
      let conv = byLead || byFone
      if (!conv) { const { data } = await sb.from('wa_conversas').insert({ org_id: org, telefone: to, nome: lead.nome, lead_id: lead.id, canal: 'oficial' }).select('id').single(); conv = data }
      conversaId = conv?.id || ''
    }
    if (conversaId) {
      await sb.from('wa_mensagens').insert({ org_id: org, conversa_id: conversaId, zapi_id: r.wamid || null, direcao: 'enviada', tipo: 'texto', texto: textoRender, status: 'enviada', canal: 'oficial', enviado_por: (b.email || null) })
      await sb.from('wa_conversas').update({ ultima_msg: textoRender.slice(0, 200), ultima_msg_em: new Date().toISOString() }).eq('id', conversaId)
    }
    return NextResponse.json({ ok: true, template: templateNome, conversaId })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
