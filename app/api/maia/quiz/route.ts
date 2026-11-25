import { NextRequest, NextResponse, after } from 'next/server'
import { randomBytes, randomUUID } from 'crypto'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { ORG_CND } from '@/lib/org'
import { aplicarRateio } from '@/lib/rateio'
import { enviarPush } from '@/lib/push'
import { sendLead } from '@/lib/capi'
import { diagnosticar, ehNicho, telefoneBR, UFS, QUIZZES, TURMA_QUIZ, reaisQuiz as reais } from '@/lib/maia/quiz/quiz'

// Quiz de diagnóstico da Maia (páginas públicas /maia/quiz/oficina e /maia/quiz/otica). Recebe nicho +
// respostas + contato, refaz a conta no servidor (lib/maia/quiz/quiz.ts, a mesma da página), entrega o lead
// pro comercial na turma-recipiente "maiaquiz" (uma pros dois nichos; o nicho vai na qualificação), guarda o
// diagnóstico em checkup_diagnosticos (a tabela do check-up, com nicho "maia-oficina"/"maia-otica"), avisa a
// equipe (push) e manda o Lead pra Meta (CAPI) com o MESMO event_id do pixel da página (deduplica).
// Se a turma ainda não existir no banco, o lead entra sem turma (codigo_turma "maiaquiz"); se a gravação do
// diagnóstico falhar, o lead continua valendo (o diagnóstico vai inteiro nas observações do card).
// 300: depois de responder à página, a rota espera ~5 min e a Maia chama a pessoa no WhatsApp (lib/maia/vendedora-rotina.ts)
export const maxDuration = 300

const limpa = (v: any, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

async function log(evento: string, payload: any) {
  try { await sb.from('webhook_logs').insert({ org_id: ORG_CND, origem: 'maia-quiz', evento, status: 'erro', payload }) } catch { /* log é best-effort */ }
}

export async function POST(req: NextRequest) {
  let p: any
  try { p = await req.json() } catch { return NextResponse.json({ erro: 'Não deu pra ler as respostas.' }, { status: 400 }) }

  const nicho = p?.nicho
  if (!ehNicho(nicho)) return NextResponse.json({ erro: 'Quiz inválido.' }, { status: 400 })
  const nome = limpa(p.nome, 80)
  const negocio = limpa(p.negocio, 100)
  const whatsapp = telefoneBR(p.whatsapp)
  const cidade = limpa(p.cidade, 80)
  const uf = UFS.includes(String(p.uf || '').toUpperCase()) ? String(p.uf).toUpperCase() : ''
  const r = p.respostas && typeof p.respostas === 'object' ? p.respostas : null
  if (nome.length < 2) return NextResponse.json({ erro: 'Falta o seu nome.' }, { status: 400 })
  if (negocio.length < 2) return NextResponse.json({ erro: 'Falta o nome do negócio.' }, { status: 400 })
  if (!whatsapp) return NextResponse.json({ erro: 'Confira o WhatsApp: DDD e número.' }, { status: 400 })
  if (!cidade || !uf) return NextResponse.json({ erro: 'Falta a cidade e o estado.' }, { status: 400 })
  if (!r) return NextResponse.json({ erro: 'Faltam respostas.' }, { status: 400 })

  const eventId = limpa(p.event_id, 80) || randomUUID()
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  const userAgent = req.headers.get('user-agent') || null
  const tag = 'maia-' + nicho
  const q = QUIZZES[nicho]

  // mandou duas vezes (a página tenta de novo se a rede falhar): devolve o mesmo código, sem duplicar
  const dezMin = new Date(Date.now() - 600_000).toISOString()
  const { data: recente, error: eTab } = await sb.from('checkup_diagnosticos').select('codigo').eq('whatsapp', whatsapp).eq('nicho', tag).gte('criado_em', dezMin).order('criado_em', { ascending: false }).limit(1).maybeSingle()
  if (recente) return NextResponse.json({ ok: true, codigo: recente.codigo, repetido: true })
  // freio contra abuso: 10 diagnósticos por hora do mesmo IP
  if (ip && !eTab) {
    const { count } = await sb.from('checkup_diagnosticos').select('id', { count: 'exact', head: true }).like('nicho', 'maia-%').eq('origem->>ip', ip).gte('criado_em', new Date(Date.now() - 3600_000).toISOString())
    if ((count || 0) >= 10) return NextResponse.json({ erro: 'Muitos diagnósticos seguidos daqui. Tente de novo daqui a pouco.' }, { status: 429 })
  }

  const d = diagnosticar(nicho, r, negocio)
  const codigo = randomBytes(4).toString('hex').slice(0, 6).toUpperCase()
  const fbclid = limpa(p.fbclid, 300) || null
  const fbc = limpa(p.fbc, 300) || (fbclid ? `fb.1.${Date.now()}.${fbclid}` : null)
  const origem = {
    ip, user_agent: userAgent, pagina: limpa(p.pagina, 300) || null, event_id: eventId,
    utm_source: limpa(p.utm_source, 200) || null, utm_medium: limpa(p.utm_medium, 200) || null,
    utm_campaign: limpa(p.utm_campaign, 200) || null, utm_content: limpa(p.utm_content, 200) || null,
    fbclid, fbp: limpa(p.fbp, 200) || null, fbc,
  }

  // ---- o que o vendedor lê no card ----
  const onde = `${cidade}/${uf}`
  const g = d.ganho
  const resumo = `Quiz da Maia (${q.nome}): ${negocio}, ${onde}. Oportunidade ${reais(d.oportunidade_mes)}/mês (na mesa ${reais(d.na_mesa_mes)} + a ganhar com anúncio ${reais(g.total_mes)}). Principal: ${d.principal.titulo}.`
  const obs = [
    resumo,
    uf === 'RS' ? 'ATENÇÃO: é do RS. A oferta online (R$ 497 + R$ 797) é pra fora do RS; ver com o Guto qual oferta passar.' : '',
    `Na mesa hoje:\n${d.pontos.map(x => `• ${x.titulo}: ${reais(x.valor_mes)}/mês (${x.quantidade})`).join('\n')}`,
    `A ganhar com anúncio (${g.modo === 'novo' ? 'não anuncia; verba sugerida' : 'já anuncia'} ${reais(g.verba)}/mês): ${reais(g.total_mes)}/mês = ${reais(g.valor_mes)} medido pelo WhatsApp (${g.quantidade}, retorno de cerca de R$ ${String(g.retorno).replace('.', ',')} por R$ 1) + ${reais(g.direto_mes)} de quem vai direto na loja.${g.cenario ? ` Se subir a verba pra ${reais(g.cenario.verba)}: +${reais(g.cenario.valor_mes)}/mês.` : ''}`,
    `${d.pagam_maia} ${d.pagam_maia === 1 ? q.unidade[0] : q.unidade[1]} por mês pagam a mensalidade (valor médio ${reais(d.ticket)}).`,
    d.bem.length ? `Já faz bem:\n${d.bem.map(x => '• ' + x).join('\n')}` : '',
    `Respostas:\n${Object.entries(d.respostas_legiveis).map(([k, v]) => `• ${k} ${v}`).join('\n')}`,
    `Oferta mostrada: 1º mês R$ 497 com implantação online, depois R$ 797/mês, sem fidelidade. Código ${codigo}.`,
  ].filter(Boolean).join('\n\n')
  const anuncio = d.respostas_legiveis[q.perguntas.find(x => x.id === 'anuncio')!.titulo]

  // ---- lead pro comercial (quem já está no CRM não duplica: ganha o diagnóstico no card que já tem) ----
  const sufixo = whatsapp.slice(-8)
  const { data: existente } = await sb.from('leads').select('id, vendedor_id').ilike('whatsapp', `%${sufixo}%`).order('criado_em', { ascending: false }).limit(1).maybeSingle()
  let leadId: string | null = existente?.id || null
  let vendedorId: string | null = existente?.vendedor_id || null
  let criado = false
  if (!existente) {
    const { data: turma } = await sb.from('turmas').select('id, codigo').eq('codigo', TURMA_QUIZ).maybeSingle()
    vendedorId = turma ? await aplicarRateio(sb, turma.id) : null
    const { data: novo, error } = await sb.from('leads').insert({
      org_id: ORG_CND, nome, whatsapp, turma_id: turma?.id || null, codigo_turma: turma?.codigo || TURMA_QUIZ, vendedor_id: vendedorId,
      etapa: 'aguardando_atendimento', origem: 'formulario', atendido_por: 'humano',
      utm_source: origem.utm_source, utm_medium: origem.utm_medium, utm_campaign: origem.utm_campaign, utm_content: origem.utm_content,
      fbclid: origem.fbclid, fbp: origem.fbp, fbc: origem.fbc,
      negocio: `Maia · ${q.nome}: ${negocio} (${onde})`.slice(0, 300),
      investimento_marketing: anuncio && anuncio !== '-' ? anuncio : null,
      maior_problema: d.principal.titulo.slice(0, 500),
      observacoes: resumo,
      qualificacao: {
        maia_quiz: codigo, produto: 'Maia', nicho, negocio, cidade, uf,
        na_mesa_mes: d.na_mesa_mes, ganho_anuncio_mes: g.total_mes, ganho_medido_mes: g.valor_mes, ganho_direto_mes: g.direto_mes, oportunidade_mes: d.oportunidade_mes, principal: d.principal.titulo,
        pontos: d.pontos.map(x => ({ ponto: x.titulo, valor_mes: x.valor_mes })),
        respostas: r,
      },
    }).select('id').single()
    if (error || !novo) {
      await log('lead', { erro: error?.message, nome, whatsapp, negocio, nicho })
      return NextResponse.json({ erro: 'Não consegui registrar agora. Tentando de novo.' }, { status: 500 })
    }
    leadId = novo.id; criado = true
  }

  // ---- o diagnóstico guardado (na tabela do check-up) ----
  const { error: eDiag } = await sb.from('checkup_diagnosticos').insert({
    org_id: ORG_CND, codigo, lead_id: leadId, nome, whatsapp, nicho: tag,
    respostas: { cru: r, legivel: d.respostas_legiveis, contato: { negocio, cidade, uf } },
    conta: d, texto: { tipo: 'maia_quiz', resumo }, origem,
  })
  if (eDiag) await log('salvar', { erro: eDiag.message, nome, whatsapp, codigo })

  if (leadId) {
    await sb.from('lead_andamentos').insert({ lead_id: leadId, vendedor_id: vendedorId, tipo: criado ? 'criado' : 'observacao', etapa_nova: criado ? 'aguardando_atendimento' : null, observacao: `${criado ? 'Lead criado pelo' : 'Fez o'} Quiz da Maia (${q.nome}).\n\n${obs}`.slice(0, 3000) })
    await sb.from('tarefas_lead').insert({ org_id: ORG_CND, lead_id: leadId, tipo: 'ligar_agendado', titulo: `Quiz da Maia: chamar ${nome} (${negocio}) e fechar a implantação online`.slice(0, 200), descricao: obs.slice(0, 1500), data_vencimento: new Date().toISOString() })
    try { await enviarPush('Quiz da Maia feito', `${nome} (${q.nome} ${negocio}, ${onde}) viu o diagnóstico: ${reais(d.oportunidade_mes)}/mês. Chama enquanto está quente.`.slice(0, 140), '/dashboard/whatsapp') } catch (e) { console.error('push (maia quiz):', e) }
    // a página já disparou o Lead no pixel com este event_id: a Meta junta os dois e conta um só
    try {
      const capi = await sendLead({ eventId, eventSourceUrl: origem.pagina, phone: whatsapp, firstName: nome.split(' ')[0], fbp: origem.fbp, fbc: origem.fbc, clientIp: ip, userAgent, externalId: leadId, codigoTurma: TURMA_QUIZ })
      if (!capi.ok) console.error('CAPI Lead (maia quiz) falhou:', capi.error)
    } catch (e) { console.error('CAPI Lead (maia quiz):', e) }
  }

  // 24/11: a Maia chama quem fez o quiz ~5 min depois, se a pessoa não chamou antes (a resposta pra página já saiu)
  if (leadId && process.env.MAIA_VENDEDORA_LIGADA === '1') {
    const id = leadId
    after(async () => {
      try {
        await new Promise(r => setTimeout(r, 4.6 * 60e3))
        const { chamaQuemNaoChamou } = await import('@/lib/maia/vendedora-rotina')
        await chamaQuemNaoChamou(new Date(), { soLead: id })
      } catch (e) { await log('chamar', { erro: String((e as any)?.message || e), lead: id }) }
    })
  }

  return NextResponse.json({ ok: true, codigo, criado })
}
