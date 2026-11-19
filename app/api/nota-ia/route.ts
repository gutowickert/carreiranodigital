import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { ORG_CND } from '@/lib/org'
import { aplicarRateio } from '@/lib/rateio'
import { enviarPush } from '@/lib/push'
import { sendLead } from '@/lib/capi'
import { calcular, faltando, registroCRM, telefoneBR } from '@/public/nota-ia/calculo.js'

// Quiz "Qual é a nota de IA do teu negócio?" (página pública /nota-ia, 19/11/2026).
// Recebe as respostas + nome + WhatsApp, refaz a conta aqui (não confia na nota da página) e grava o lead
// no CRM da escola com as respostas, a nota e o caminho (campos do card + qualificacao + anotação na linha do tempo).
// Quem já está no CRM não duplica: ganha a anotação no card que já tem.
// Depois a pessoa toca no botão do WhatsApp (/wa com o #código): o webhook acha este lead pelo telefone e casa o clique.
// Sem IA, sem mensagem pra ninguém. `teste: true` (só fora da produção) não mexe no rateio, nem avisa o time, nem manda pra Meta.

const s = (v: any, max = 300) => (v == null ? null : String(v).trim().slice(0, max) || null)

export async function POST(req: NextRequest) {
  let p: any
  try { p = await req.json() } catch { return NextResponse.json({ erro: 'Não deu pra ler as respostas.' }, { status: 400 }) }

  const nome = String(p?.nome || '').replace(/\s+/g, ' ').trim().slice(0, 80)
  const whatsapp = telefoneBR(p?.whatsapp)
  const r = p?.respostas && typeof p.respostas === 'object' && !Array.isArray(p.respostas) ? p.respostas : null
  if (nome.length < 2) return NextResponse.json({ erro: 'Escreve o teu nome.' }, { status: 400 })
  if (!whatsapp) return NextResponse.json({ erro: 'Confere o WhatsApp: DDD e número.' }, { status: 400 })
  if (!r || faltando(r).length) return NextResponse.json({ erro: 'Faltam respostas. Volta e completa o quiz.' }, { status: 400 })
  const teste = p.teste === true && process.env.NODE_ENV !== 'production'

  // guarda só as respostas que existem no quiz (nada de campo solto vindo de fora)
  const chaves = ['ramo', 'tamanho', 'origem', 'verba', 'whats', 'some', 'organiza', 'conteudo', 'ticket', 'ia', 'objetivo', 'jeito', 'regiao']
  const resp: Record<string, any> = {}
  for (const k of chaves) if (r[k] != null) resp[k] = Array.isArray(r[k]) ? r[k].slice(0, 6).map((x: any) => String(x).slice(0, 30)) : String(r[k]).slice(0, 30)

  const res = calcular(resp)
  const variante = p.variante === 'b' ? 'b' : 'a'
  const reg = registroCRM(resp, res, { variante })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  const userAgent = req.headers.get('user-agent') || null
  const fbclid = s(p.fbclid)
  const fbp = s(p.fbp, 200)
  const fbc = s(p.fbc, 300) || (fbclid ? `fb.1.${Date.now()}.${fbclid}` : null)
  const eventId = s(p.event_id, 100) || randomUUID()
  const pagina = s(p.pagina, 500)
  const utm = { utm_source: s(p.utm_source, 200), utm_medium: s(p.utm_medium, 200), utm_campaign: s(p.utm_campaign, 200) || 'quiz-nota-ia', utm_content: s(p.utm_content, 200) }
  const qualificacao = { ...reg.qualificacao, ip, event_id: eventId, visitor_id: s(p.vid, 100), em: new Date().toISOString() }

  // freio contra abuso: no máximo 6 envios por hora do mesmo endereço
  if (ip && !teste) {
    const { count } = await sb.from('leads').select('id', { count: 'exact', head: true })
      .eq('qualificacao->>quiz', 'nota-ia').eq('qualificacao->>ip', ip).gte('criado_em', new Date(Date.now() - 3600_000).toISOString())
    if ((count || 0) >= 6) return NextResponse.json({ erro: 'Muitos envios seguidos daqui. Tenta de novo daqui a pouco.' }, { status: 429 })
  }

  const sufixo = whatsapp.slice(-8)
  const { data: existente } = await sb.from('leads').select('id, vendedor_id, qualificacao, criado_em').ilike('whatsapp', `%${sufixo}%`).order('criado_em', { ascending: false }).limit(1).maybeSingle()

  // mandou duas vezes seguidas (clique duplo, voltou e enviou de novo): não grava de novo
  const qa: any = existente?.qualificacao
  const q0: any = qa?.quiz === 'nota-ia' ? qa : qa?.nota_ia
  if (existente && q0?.em && Date.now() - new Date(q0.em).getTime() < 10 * 60_000) {
    return NextResponse.json({ ok: true, lead_id: existente.id, event_id: q0.event_id || eventId, repetido: true })
  }

  let leadId: string | null = existente?.id || null
  let vendedorId: string | null = existente?.vendedor_id || null
  let criado = false

  if (!existente) {
    const { data: turma } = res.turma ? await sb.from('turmas').select('id, codigo').eq('codigo', res.turma).maybeSingle() : { data: null }
    vendedorId = turma && !teste ? await aplicarRateio(sb, turma.id) : null
    const { data: novo, error } = await sb.from('leads').insert({
      org_id: ORG_CND, nome, whatsapp, turma_id: turma?.id || null, codigo_turma: turma?.codigo || null, vendedor_id: vendedorId,
      etapa: 'aguardando_atendimento', origem: 'formulario', campanha: 'quiz-nota-ia',
      ...utm, fbclid, fbp, fbc,
      ...reg.campos,
      qualificacao,
    }).select('id').single()
    if (error || !novo) {
      await sb.from('webhook_logs').insert({ org_id: ORG_CND, origem: 'nota-ia', evento: 'lead', status: 'erro', payload: { erro: error?.message, nome, whatsapp } })
      return NextResponse.json({ erro: 'Não consegui guardar agora. Tenta de novo em 1 minuto.' }, { status: 500 })
    }
    leadId = novo.id; criado = true
  } else {
    // lead que já existe: não troca nada do que o time já tem; só guarda o quiz na qualificação e completa campo vazio
    const atual: any = existente.qualificacao && typeof existente.qualificacao === 'object' ? existente.qualificacao : {}
    await sb.from('leads').update({ qualificacao: { ...atual, nota_ia: qualificacao } }).eq('id', existente.id)
  }

  // a anotação abre com o resumo: é o que a IA de atendimento e o vendedor leem primeiro no card
  await sb.from('lead_andamentos').insert({
    lead_id: leadId, vendedor_id: vendedorId, tipo: criado ? 'criado' : 'observacao', etapa_nova: criado ? 'aguardando_atendimento' : null,
    observacao: reg.texto.slice(0, 3000),
  })
  if (criado) {
    // a 'criado' não aparece pra IA de plantão; esta sim (ela lê as anotações do time)
    await sb.from('lead_andamentos').insert({ lead_id: leadId, vendedor_id: vendedorId, tipo: 'observacao', observacao: reg.resumo.slice(0, 1000) })
  }
  await sb.from('tarefas_lead').insert({
    org_id: ORG_CND, lead_id: leadId, tipo: 'ligar_agendado',
    titulo: `Quiz Nota de IA: ${nome} tirou ${res.nota}. Puxar conversa pela dor dele`, descricao: reg.texto.slice(0, 1500), data_vencimento: new Date().toISOString(),
  })

  if (!teste) {
    try { await enviarPush('Quiz da nota de IA', `${nome} tirou ${res.nota} no quiz. Maior dor: ${res.maiorDor}.`.slice(0, 140), '/dashboard/whatsapp') } catch { /* aviso não trava o lead */ }
    if (criado) {
      try {
        const capi = await sendLead({ eventId, eventSourceUrl: pagina, phone: whatsapp, firstName: nome.split(' ')[0], fbc, fbp, clientIp: ip, userAgent, externalId: leadId, codigoTurma: res.turma || 'quiz-nota-ia' })
        if (!capi.ok) console.error('CAPI Lead (nota-ia) falhou:', capi.error)
      } catch (e) { console.error('CAPI Lead (nota-ia):', e) }
    }
  }

  return NextResponse.json({ ok: true, lead_id: leadId, event_id: eventId, criado })
}
