import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { enviarTemplate, foneOficial } from '@/lib/whatsapp-oficial'
import { nomeSaudacao } from '@/lib/saudacao'

export const maxDuration = 30

// 📄 ENVIA UM TEMPLATE APROVADO PRO LEAD (escolhido no card). Reabre conversa fora das 24h.
// Reusa as MESMAS variáveis e blindagens do motor de follow-up (preço fixo FC/ANL, trava R$0,
// variável não resolvida, prazo vencido) pra nunca mandar template quebrado.
const familia = (c: string | null) => { const x = (c || '').toLowerCase(); return x.startsWith('fc') ? 'FC' : x.startsWith('anl') ? 'ANL' : null }
const cursoNome = (fam: string | null) => fam === 'FC' ? 'Formação Completa em Marketing Digital' : fam === 'ANL' ? 'Anúncios para Negócios Locais' : 'nosso curso'
const money = (v: number) => `R$${v}`
function fmtDatas(isos: string[]): string {
  const s = isos.slice().filter(Boolean).sort()
  if (!s.length) return ''
  const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
  if (s.length > 4) return `${dm(s[0])} a ${dm(s[s.length - 1])}`
  const d = s.map(dm)
  return d.length === 1 ? d[0] : d.slice(0, -1).join(', ') + ' e ' + d[d.length - 1]
}

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({} as any))
    const leadId = (b.leadId || '').toString()
    const templateId = (b.templateId || '').toString()
    const enviadoPor = (b.enviadoPor || '').toString() || null
    if (!leadId || !templateId) return NextResponse.json({ ok: false, error: 'faltam leadId/templateId' }, { status: 200 })

    // lead + template (só templates APROVADOS pela Meta)
    const { data: lead } = await sb.from('leads').select('id, nome, whatsapp, codigo_turma, turma_id, etapa').eq('org_id', org).eq('id', leadId).maybeSingle()
    if (!lead) return NextResponse.json({ ok: false, error: 'lead não encontrado' }, { status: 200 })
    const { data: tpl } = await sb.from('followup_templates').select('nome_meta, corpo, variaveis, status').eq('org_id', org).eq('id', templateId).maybeSingle()
    if (!tpl) return NextResponse.json({ ok: false, error: 'template não encontrado' }, { status: 200 })
    if (tpl.status !== 'aprovado') return NextResponse.json({ ok: false, error: `template "${tpl.nome_meta}" não está aprovado pela Meta (${tpl.status})` }, { status: 200 })

    const to = foneOficial(lead.whatsapp || '')
    if (!to) return NextResponse.json({ ok: false, error: 'telefone do lead inválido' }, { status: 200 })

    // dados da turma (cidade, produto, datas)
    let cidade = 'sua região', codTurma = lead.codigo_turma, datasStr = ''
    if (lead.turma_id) {
      const { data: t } = await sb.from('turmas').select('codigo, cidades(nome), produtos(nome)').eq('id', lead.turma_id).maybeSingle() as any
      if (t) { cidade = t.cidades?.nome || cidade; codTurma = t.codigo || codTurma }
      const { data: td } = await sb.from('turma_datas').select('data').eq('turma_id', lead.turma_id).order('data')
      datasStr = fmtDatas((td || []).map((x: any) => x.data))
    }
    const fam = familia(lead.codigo_turma) || familia(codTurma)
    const precoPix = fam === 'ANL' ? 797 : fam === 'FC' ? 2397 : 0
    const bolsaTxt = fam === 'FC' ? 'R$2.097 no Pix ou R$2.497 em 10x sem juros' : fam === 'ANL' ? 'R$697 no Pix ou R$897 em 10x sem juros' : ''

    // BLINDAGEM: template que precisa de preço/bolsa sem produto resolvido → NÃO manda
    const precisaPreco = /\{\{\s*(preco|preco_pix|preco_cartao)\s*\}\}/.test(tpl.corpo || '')
    const precisaBolsa = /\{\{\s*condicao_bolsa\s*\}\}/.test(tpl.corpo || '')
    if (precisaPreco && precoPix <= 0) return NextResponse.json({ ok: false, error: 'esse template precisa de preço, mas o produto (FC/ANL) do lead não está definido. Defina a turma do lead ou escolha outro template.' }, { status: 200 })
    if (precisaBolsa && !bolsaTxt) return NextResponse.json({ ok: false, error: 'esse template precisa de bolsa, mas o produto (FC/ANL) do lead não está definido.' }, { status: 200 })

    const valores: Record<string, string> = {
      nome: nomeSaudacao(lead.nome), vendedor: enviadoPor || '', curso: cursoNome(fam),
      cidade, datas: datasStr,
      preco_pix: money(precoPix), preco: money(precoPix),
      preco_cartao: fam === 'FC' ? 'R$2697 no cartão em até 10x' : '',
      condicao_bolsa: bolsaTxt,
    }
    const ordem = (tpl.variaveis || '').split(',').map((s: string) => s.trim()).filter(Boolean)
    const textoRender = (tpl.corpo || '').replace(/\{\{(\w+)\}\}/g, (_m: string, k: string) => valores[k] ?? `{{${k}}}`)
    // trava R$0 + variável não resolvida
    if (/R\$\s?0(?![0-9.,])/.test(textoRender)) return NextResponse.json({ ok: false, error: 'o texto renderizou R$0 — envio abortado (trava de preço).' }, { status: 200 })
    if (/\{\{\w+\}\}/.test(textoRender)) return NextResponse.json({ ok: false, error: 'esse template tem uma variável que não consegui preencher com os dados do lead — escolha outro.' }, { status: 200 })

    const parametros = ordem.map((k: string) => ({ type: 'text', text: valores[k] ?? k }))
    const r = await enviarTemplate(to, tpl.nome_meta, 'pt_BR', parametros.length ? [{ type: 'body', parameters: parametros }] : undefined)
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error || 'falha ao enviar template' }, { status: 200 })

    // registra no card (conversa oficial) + andamento (conta pra anti-repetição do motor)
    let conv: any = (await sb.from('wa_conversas').select('id').eq('org_id', org).eq('lead_id', leadId).eq('canal', 'oficial').limit(1).maybeSingle()).data
    if (!conv) conv = (await sb.from('wa_conversas').insert({ org_id: org, telefone: to, nome: lead.nome, lead_id: leadId, canal: 'oficial' }).select('id').single()).data
    if (conv) {
      await sb.from('wa_mensagens').insert({ org_id: org, conversa_id: conv.id, zapi_id: r.wamid || null, direcao: 'enviada', tipo: 'texto', texto: textoRender, status: 'enviada', canal: 'oficial', enviado_por: enviadoPor })
      await sb.from('wa_conversas').update({ ultima_msg: textoRender.slice(0, 200), ultima_msg_em: new Date().toISOString() }).eq('id', conv.id)
    }
    await sb.from('lead_andamentos').insert({ lead_id: leadId, tipo: 'ia_followup', observacao: `📄 Template MANUAL (card)${enviadoPor ? ' por ' + enviadoPor : ''} — ${tpl.nome_meta}` })

    return NextResponse.json({ ok: true, texto: textoRender, template: tpl.nome_meta })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
