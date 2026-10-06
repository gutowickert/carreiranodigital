import { NextRequest, NextResponse } from 'next/server'
import { randomBytes, randomUUID } from 'crypto'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { ORG_CND } from '@/lib/org'
import { gerarDiagnostico } from '@/lib/checkup/diagnostico'
import { aplicarRateio } from '@/lib/rateio'
import { enviarPush } from '@/lib/push'
import { sendLead } from '@/lib/capi'

// Check-up de IA do teunegócio OS (página pública /checkup). Recebe as respostas, faz o diagnóstico
// (lib/checkup), guarda em checkup_diagnosticos e entrega o lead pro comercial (turma-recipiente
// teunegociooscheckup, fora da cadência e da IA de atendimento). Devolve o código do relatório.
export const maxDuration = 60

const TURMA = 'teunegociooscheckup'
const fmt = (n: number) => 'R$ ' + Math.round(n).toLocaleString('pt-BR')
const h = (n: number) => String(n).replace('.', ',')

function telefone(v: any): string | null {
  let d = String(v || '').replace(/\D/g, '')
  if (d.length === 10 || d.length === 11) d = '55' + d
  return d.length >= 12 && d.length <= 13 && d.startsWith('55') ? d : null
}

export async function POST(req: NextRequest) {
  let p: any
  try { p = await req.json() } catch { return NextResponse.json({ erro: 'Não deu pra ler as respostas.' }, { status: 400 }) }

  const nome = String(p.nome || '').replace(/\s+/g, ' ').trim().slice(0, 80)
  const whatsapp = telefone(p.whatsapp)
  const r = p.respostas && typeof p.respostas === 'object' ? p.respostas : null
  if (!nome) return NextResponse.json({ erro: 'Falta o teu nome.' }, { status: 400 })
  if (!whatsapp) return NextResponse.json({ erro: 'Confere o WhatsApp: DDD e número, só os dígitos.' }, { status: 400 })
  if (!r || !r.nicho || !r.o_que_vende) return NextResponse.json({ erro: 'Faltam respostas. Volta e completa o check-up.' }, { status: 400 })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  const userAgent = req.headers.get('user-agent') || null
  const umaHora = new Date(Date.now() - 3600_000).toISOString()

  // mandou duas vezes (clique duplo, voltou e enviou de novo): devolve o mesmo relatório
  const { data: recente } = await sb.from('checkup_diagnosticos').select('codigo').eq('whatsapp', whatsapp).gte('criado_em', new Date(Date.now() - 600_000).toISOString()).order('criado_em', { ascending: false }).limit(1).maybeSingle()
  if (recente) return NextResponse.json({ ok: true, codigo: recente.codigo })
  // freio contra abuso (cada diagnóstico custa IA)
  if (ip) {
    const { count } = await sb.from('checkup_diagnosticos').select('id', { count: 'exact', head: true }).eq('origem->>ip', ip).gte('criado_em', umaHora)
    if ((count || 0) >= 5) return NextResponse.json({ erro: 'Muitos check-ups seguidos daqui. Tenta de novo daqui a pouco.' }, { status: 429 })
  }

  let d: Awaited<ReturnType<typeof gerarDiagnostico>>
  try { d = await gerarDiagnostico(r) } catch (e: any) {
    await sb.from('webhook_logs').insert({ org_id: ORG_CND, origem: 'checkup', evento: 'diagnostico', status: 'erro', payload: { erro: e?.message || String(e), nome, whatsapp } })
    return NextResponse.json({ erro: 'Não consegui montar o diagnóstico agora. Tenta de novo em 1 minuto.' }, { status: 500 })
  }
  const c = d.conta, t = d.texto
  const codigo = randomBytes(4).toString('hex').slice(0, 6).toUpperCase()
  const origem = {
    ip, user_agent: userAgent, pagina: String(p.pagina || '').slice(0, 300) || null,
    utm_source: p.utm_source || null, utm_medium: p.utm_medium || null, utm_campaign: p.utm_campaign || null, utm_content: p.utm_content || null,
    fbclid: p.fbclid || null, fbp: p.fbp || null,
  }

  // ---- lead pro comercial (quem já está no CRM não duplica: ganha o check-up no card que já tem) ----
  const resumoLead = `Check-up de IA (${d.nicho_nome}): ${h(c.horas_semana[0])} a ${h(c.horas_semana[1])} h/semana que a IA pode assumir · ${fmt(c.receita_mes[0])} a ${fmt(c.receita_mes[1])}/mês a mais (estimativa) · faturamento estimado hoje ${fmt(c.base.faturamento_mes)}.`
  const prioridades = c.tarefas.slice(0, 3).map(x => '• ' + x.tarefa).join('\n')
  const respostas = d.respostas_legiveis
  const obs = [
    resumoLead,
    `Vende: ${d.respostas_num.o_que_vende || '-'} · Cidade: ${d.respostas_num.cidade || '-'}`,
    `Quer tirar da semana: ${d.respostas_num.tiraria || '-'}`,
    `Maior desafio: ${d.respostas_num.desafio || '-'}`,
    `Onde está o maior ganho:\n${prioridades}`,
    d.perguntas_especialista.length ? `Perguntas pra conversa:\n${d.perguntas_especialista.slice(0, 4).map(x => '• ' + x).join('\n')}` : '',
    `Relatório: /checkup/r/${codigo}`,
  ].filter(Boolean).join('\n\n')

  const sufixo = whatsapp.slice(-8)
  const { data: existente } = await sb.from('leads').select('id, nome, vendedor_id').ilike('whatsapp', `%${sufixo}%`).order('criado_em', { ascending: false }).limit(1).maybeSingle()
  let leadId: string | null = existente?.id || null
  let vendedorId: string | null = existente?.vendedor_id || null
  let criado = false
  if (!existente) {
    const { data: turma } = await sb.from('turmas').select('id, codigo').eq('codigo', TURMA).maybeSingle()
    vendedorId = turma ? await aplicarRateio(sb, turma.id) : null
    const { data: novo, error } = await sb.from('leads').insert({
      org_id: ORG_CND, nome, whatsapp, turma_id: turma?.id || null, codigo_turma: turma?.codigo || TURMA, vendedor_id: vendedorId,
      etapa: 'aguardando_atendimento', origem: 'formulario', atendido_por: 'humano',
      utm_source: origem.utm_source, utm_medium: origem.utm_medium, utm_campaign: origem.utm_campaign, utm_content: origem.utm_content,
      fbclid: origem.fbclid, fbp: origem.fbp,
      negocio: `${d.nicho_nome}: ${d.respostas_num.o_que_vende || ''}`.slice(0, 300),
      tamanho_equipe: respostas['Quantas pessoas trabalham contigo, contando tu?'] || null,
      maior_problema: (d.respostas_num.desafio || '').slice(0, 500) || null,
      observacoes: resumoLead,
      qualificacao: { checkup: codigo, nicho: d.nicho, cidade: d.respostas_num.cidade || null, tiraria: d.respostas_num.tiraria || null, faturamento_estimado: c.base.faturamento_mes },
    }).select('id').single()
    if (error || !novo) {
      await sb.from('webhook_logs').insert({ org_id: ORG_CND, origem: 'checkup', evento: 'lead', status: 'erro', payload: { erro: error?.message, nome, whatsapp } })
    } else { leadId = novo.id; criado = true }
  }

  const { error: eDiag } = await sb.from('checkup_diagnosticos').insert({
    org_id: ORG_CND, codigo, lead_id: leadId, nome, whatsapp, nicho: d.nicho,
    respostas: { cru: r, legivel: respostas, nicho_escolhido: d.nicho_escolhido },
    conta: c, texto: t, origem: { ...origem, valores_fora_da_conta: d.valores_fora_da_conta },
  })
  if (eDiag) {
    await sb.from('webhook_logs').insert({ org_id: ORG_CND, origem: 'checkup', evento: 'salvar', status: 'erro', payload: { erro: eDiag.message, nome, whatsapp } })
    return NextResponse.json({ erro: 'Não consegui guardar o teu diagnóstico. Tenta de novo em 1 minuto.' }, { status: 500 })
  }

  if (leadId) {
    await sb.from('lead_andamentos').insert({ lead_id: leadId, vendedor_id: vendedorId, tipo: criado ? 'criado' : 'observacao', etapa_nova: criado ? 'aguardando_atendimento' : null, observacao: `🩺 ${criado ? 'Lead criado pelo' : 'Fez o'} Check-up de IA do teunegócio OS.\n\n${obs}`.slice(0, 3000) })
    // tarefa vence agora: quem acabou de ver o diagnóstico está quente
    await sb.from('tarefas_lead').insert({ org_id: ORG_CND, lead_id: leadId, tipo: 'ligar_agendado', titulo: `Check-up de IA: chamar ${nome} e marcar a conversa com o especialista`, descricao: obs.slice(0, 1500), data_vencimento: new Date().toISOString() })
    await enviarPush('Check-up de IA feito 🩺', `${nome} (${d.nicho_nome}) acabou de fazer o check-up. Chama enquanto está quente.`.slice(0, 140), '/dashboard/whatsapp')
    if (criado) {
      try {
        const capi = await sendLead({ eventId: randomUUID(), eventSourceUrl: origem.pagina, phone: whatsapp, firstName: nome.split(' ')[0], fbp: origem.fbp, fbc: origem.fbclid ? `fb.1.${Date.now()}.${origem.fbclid}` : null, clientIp: ip, userAgent, externalId: leadId, codigoTurma: TURMA })
        if (!capi.ok) console.error('CAPI Lead (checkup) falhou:', capi.error)
      } catch (e) { console.error('CAPI Lead (checkup):', e) }
    }
  }

  return NextResponse.json({ ok: true, codigo })
}
