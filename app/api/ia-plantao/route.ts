import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { meuPerfil } from '@/lib/quem-eu-vejo'
import { ORG_CND } from '@/lib/org'
import { configPlantao, modoPlantao, pausarNoPlantao } from '@/lib/plantao'
import { simularPlantao, voltaDoTime, resumoDoPlantao, decidirPlantao, conferirMensagens, turmasAbertas, atenderPlantao, aposAceitePlantao, cutucarPlantao, MODELO_PLANTAO } from '@/lib/ia-plantao'
import { TEMPLATE_AVISO } from '@/lib/plantao-avisos'

export const maxDuration = 300

// O PLANTÃO DA IA — a tela (/dashboard/ia-plantao) e o interruptor (lib/ia-plantao.ts).
//   GET ?contar=1                       → { abertos }: o balão vermelho do menu
//   GET                                 → interruptor, avisos abertos, leads pausados e o registro dos últimos 7 dias
//   GET ?simular=<lead>&chave=…         → o que ela responderia agora pra esse lead (não manda nada)
//   GET ?conversa=…&ficha=…&chave=…     → idem, pra uma conversa inventada (teste das regras)
//   GET ?modelo=ver|criar&chave=…       → consulta ou pede à Meta o modelo cnd_plantao_aviso
//   GET ?resumo=1&chave=…               → manda o resumo agora (teste)
//   GET ?atender=<conversa>&msg=<id>&chave=… / ?aceite=<orçamento>&chave=… / ?cutucar=1&chave=…
//                                       → roda na hora o que o webhook, o aceite e o cron rodam (suporte e teste)
//   POST { modo, de, ate }              → só admin: desligado | sombra | ligado, com a janela opcional
//   POST { resolver: tarefaId }         → o aviso sai do balão
//   POST { devolver: leadId }           → a IA volta a atender esse lead
//   POST { pausar: leadId }             → a IA para nesse lead

const GRAPH = 'https://graph.facebook.com/v25.0'
const MODELO_AVISO_META = {
  name: TEMPLATE_AVISO, language: 'pt_BR', category: 'UTILITY',
  components: [{
    type: 'BODY', text: 'Aviso do plantão da IA: {{1}}\n\n{{2}}\n\nAbra o sistema da escola para ver a conversa.',
    example: { body_text: [['Quer conversar por ligação', 'Paula: Imersão Porto Alegre, turno da noite. Prefere quarta de manhã.']] },
  }],
}

async function chaveOk(chave: string | null) {
  if (!chave || chave.length < 16) return false
  const { data } = await sb.from('configuracoes').select('valor').eq('chave', 'assistente.cron_chave').eq('valor', chave).limit(1)
  return !!data?.length
}

async function waba() {
  if (process.env.WA_OFICIAL_WABA_ID) return process.env.WA_OFICIAL_WABA_ID
  const T = process.env.WA_OFICIAL_TOKEN, P = process.env.WA_OFICIAL_PHONE_ID
  const r: any = await fetch(`${GRAPH}/${P}?fields=whatsapp_business_account&access_token=${T}`).then(r => r.json())
  return r?.whatsapp_business_account?.id as string | undefined
}

async function avisosAbertos() {
  const { data } = await sb.from('tarefas_lead').select('id, lead_id, tipo, titulo, descricao, data_vencimento, criado_em, leads(nome, whatsapp, etapa)')
    .eq('org_id', ORG_CND).like('tipo', 'plantao_%').eq('concluida', false).eq('cancelada', false).order('criado_em', { ascending: false }).limit(200)
  return data || []
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const chave = sp.get('chave')
  if (chave) {
    if (!(await chaveOk(chave))) return NextResponse.json({ ok: false, error: 'não autorizado' }, { status: 401 })
    if (sp.get('simular')) return NextResponse.json(await simularPlantao(ORG_CND, sp.get('simular')!))
    if (sp.get('conversa')) {
      const agora = new Date()
      const r = await decidirPlantao(process.env.ANTHROPIC_API_KEY || '', { agora, volta: voltaDoTime(await configPlantao(), agora), turmas: await turmasAbertas(), ficha: sp.get('ficha') || 'FICHA DO LEAD: (teste)', conversa: sp.get('conversa')! })
      return NextResponse.json({ ok: true, decisao: r.d, ...conferirMensagens(r.d.mensagens) })
    }
    if (sp.get('resumo')) return NextResponse.json(await resumoDoPlantao(ORG_CND, true))
    if (sp.get('atender')) { await atenderPlantao(ORG_CND, sp.get('atender')!, sp.get('msg') || ''); return NextResponse.json({ ok: true }) }
    if (sp.get('aceite')) { await aposAceitePlantao(sp.get('aceite')!); return NextResponse.json({ ok: true }) }
    if (sp.get('cutucar')) return NextResponse.json(await cutucarPlantao(ORG_CND))
    const modelo = sp.get('modelo')
    if (modelo) {
      const W = await waba(), T = process.env.WA_OFICIAL_TOKEN
      if (!W || !T) return NextResponse.json({ ok: false, error: 'sem a conta do WhatsApp oficial' })
      if (modelo === 'criar') return NextResponse.json(await fetch(`${GRAPH}/${W}/message_templates?access_token=${T}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(MODELO_AVISO_META) }).then(r => r.json()))
      return NextResponse.json(await fetch(`${GRAPH}/${W}/message_templates?name=${TEMPLATE_AVISO}&fields=name,status,category,rejected_reason&access_token=${T}`).then(r => r.json()))
    }
    return NextResponse.json({ ok: false, error: 'nada pedido' })
  }

  const eu = await meuPerfil(req.headers.get('authorization'))
  if (!eu) return NextResponse.json({ ok: false, error: 'sem sessão' }, { status: 401 })

  if (sp.get('contar')) {
    const { count } = await sb.from('tarefas_lead').select('id', { count: 'exact', head: true }).eq('org_id', ORG_CND).like('tipo', 'plantao_%').eq('concluida', false).eq('cancelada', false)
    return NextResponse.json({ ok: true, abertos: count || 0 })
  }

  const config = await configPlantao()
  const desde = new Date(Date.now() - 7 * 864e5).toISOString()
  const { data: logs } = await sb.from('webhook_logs').select('id, evento, status, payload, recebido_em').eq('org_id', ORG_CND).eq('origem', 'ia-plantao').gte('recebido_em', desde).order('recebido_em', { ascending: false }).limit(800)

  // leads em que a IA está parada agora (o último registro de pausa/volta é uma pausa)
  const { data: marcas } = await sb.from('lead_andamentos').select('lead_id, tipo, observacao, criado_em, leads(nome)').in('tipo', ['plantao_pausa', 'plantao_volta']).gte('criado_em', new Date(Date.now() - 30 * 864e5).toISOString()).order('criado_em', { ascending: false }).limit(500)
  const vistos = new Set<string>()
  const pausados: any[] = []
  for (const m of marcas || []) {
    if (vistos.has(m.lead_id)) continue
    vistos.add(m.lead_id)
    if (m.tipo === 'plantao_pausa') pausados.push({ lead_id: m.lead_id, nome: (m as any).leads?.nome || '', motivo: m.observacao, desde: m.criado_em })
  }

  const { data: p } = await sb.from('usuarios_perfil').select('papel').eq('id', eu.id).maybeSingle()
  return NextResponse.json({
    ok: true, config, modoAgora: await modoPlantao(), volta: voltaDoTime(config).toISOString(), modelo: MODELO_PLANTAO,
    souAdmin: p?.papel === 'admin',
    avisos: await avisosAbertos(), pausados,
    registros: (logs || []).map(l => ({ id: l.id, evento: l.evento, status: l.status, em: l.recebido_em, ...(l.payload as any) })),
  })
}

export async function POST(req: NextRequest) {
  const eu = await meuPerfil(req.headers.get('authorization'))
  if (!eu) return NextResponse.json({ ok: false, error: 'sem sessão' }, { status: 401 })
  const b = await req.json().catch(() => ({} as any))
  const agora = new Date().toISOString()

  if (b.modo !== undefined) {
    const { data: p } = await sb.from('usuarios_perfil').select('papel, nome').eq('id', eu.id).maybeSingle()
    if (p?.papel !== 'admin') return NextResponse.json({ ok: false, error: 'só admin liga e desliga o plantão' }, { status: 403 })
    if (!['desligado', 'sombra', 'ligado'].includes(b.modo)) return NextResponse.json({ ok: false, error: 'modo inválido' })
    const valida = (s: any) => (s && !isNaN(+new Date(s)) ? new Date(s).toISOString() : null)
    const atual = await configPlantao()
    const cfg = {
      modo: b.modo,
      de: b.de !== undefined ? valida(b.de) : atual.de ?? null,
      ate: b.ate !== undefined ? valida(b.ate) : atual.ate ?? null,
      mudou_em: agora, mudou_por: p?.nome || eu.id,
    }
    const { data: ja } = await sb.from('configuracoes').select('chave').eq('chave', 'ia.plantao').maybeSingle()
    const { error } = ja
      ? await sb.from('configuracoes').update({ valor: JSON.stringify(cfg) }).eq('chave', 'ia.plantao')
      : await sb.from('configuracoes').insert({ org_id: ORG_CND, chave: 'ia.plantao', valor: JSON.stringify(cfg), tipo: 'texto', categoria: 'ia', descricao: 'Plantão da IA: modo e janela (lib/plantao.ts)', sistema: true })
    if (error) return NextResponse.json({ ok: false, error: error.message })
    await sb.from('webhook_logs').insert({ org_id: ORG_CND, origem: 'ia-plantao', evento: 'interruptor', status: 'processado', payload: { ...cfg, sombra: b.modo === 'sombra' } })
    return NextResponse.json({ ok: true, config: cfg })
  }

  if (b.resolver) {
    const { error } = await sb.from('tarefas_lead').update({ concluida: true, concluida_em: agora, atualizado_em: agora }).eq('org_id', ORG_CND).eq('id', String(b.resolver)).like('tipo', 'plantao_%')
    return NextResponse.json(error ? { ok: false, error: error.message } : { ok: true })
  }

  if (b.devolver) {
    const { data: p } = await sb.from('usuarios_perfil').select('nome').eq('id', eu.id).maybeSingle()
    const { error } = await sb.from('lead_andamentos').insert({ lead_id: String(b.devolver), vendedor_id: eu.id, tipo: 'plantao_volta', observacao: `▶️ ${p?.nome || 'Time'} devolveu o lead pra IA do plantão` })
    return NextResponse.json(error ? { ok: false, error: error.message } : { ok: true })
  }

  if (b.pausar) {
    const { data: p } = await sb.from('usuarios_perfil').select('nome').eq('id', eu.id).maybeSingle()
    await pausarNoPlantao(String(b.pausar), `${p?.nome || 'o time'} pausou pela tela do plantão`)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'nada pedido' })
}
