import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { sendLead } from '@/lib/capi'
import { aplicarRateio } from '@/lib/rateio'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Headers de CORS — necessários porque o site (HostGator) é um domínio diferente do Vercel
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// Preflight CORS (browser manda OPTIONS antes do POST quando é cross-origin)
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(req: NextRequest) {
  let payload: any = {}

  try {
    payload = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'JSON inválido' },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  const nome = (payload.nome || '').toString().trim()
  const whatsapp = (payload.whatsapp || '').toString().trim()
  const email = (payload.email || '').toString().trim()
  const codigoTurma = (payload.codigo_turma || '').toString().trim()
  const fbclid = (payload.fbclid || '').toString().trim() || null
  const utmSource = (payload.utm_source || '').toString().trim() || null
  const utmMedium = (payload.utm_medium || '').toString().trim() || null
  const utmCampaign = (payload.utm_campaign || '').toString().trim() || null
  const utmContent = (payload.utm_content || '').toString().trim() || null
  const observacoes = (payload.observacoes || '').toString().trim() || null

  // Qualificadores do modelo antigo (páginas de ANÚNCIO ainda mandam estes)
  const tamanhoEquipe = (payload.tamanho_equipe || '').toString().trim() || null
  const investimentoMarketing = (payload.investimento_marketing || '').toString().trim() || null
  const geraLeadsDigital = (payload.gera_leads_digital || '').toString().trim() || null
  const maiorProblema = (payload.maior_problema || '').toString().trim() || null
  const negocio = (payload.negocio || '').toString().trim() || null

  // Qualificadores novos por produto (páginas ORGÂNICAS) → guardados no jsonb `qualificacao`
  const jaAnuncia = (payload.ja_anuncia || '').toString().trim() || null       // Anúncios Locais
  const atuacao = (payload.atuacao || '').toString().trim() || null            // Imersão IA (imobiliário)
  const conteudoHoje = (payload.conteudo_hoje || '').toString().trim() || null // Imersão IA (imobiliário)
  const perfil = (payload.perfil || '').toString().trim() || null              // Formação Completa
  const objetivo = (payload.objetivo || '').toString().trim() || null          // Formação Completa

  const qualificacao: Record<string, string> = {}
  if (jaAnuncia) qualificacao.ja_anuncia = jaAnuncia
  if (atuacao) qualificacao.atuacao = atuacao
  if (conteudoHoje) qualificacao.conteudo_hoje = conteudoHoje
  if (perfil) qualificacao.perfil = perfil
  if (objetivo) qualificacao.objetivo = objetivo

  // CAPI: dados pra deduplicação e correspondência
  const eventId = (payload.event_id || '').toString().trim() || randomUUID()
  const fbp = (payload.fbp || '').toString().trim() || null
  let fbc = (payload.fbc || '').toString().trim() || null
  if (!fbc && fbclid) fbc = `fb.1.${Date.now()}.${fbclid}`
  const eventSourceUrl = (payload.event_source_url || '').toString().trim() || null
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  const userAgent = req.headers.get('user-agent') || null

  // Validação mínima
  if (!nome) {
    return NextResponse.json(
      { error: 'Nome é obrigatório' },
      { status: 400, headers: CORS_HEADERS }
    )
  }
  if (!whatsapp && !email) {
    return NextResponse.json(
      { error: 'WhatsApp ou email obrigatório' },
      { status: 400, headers: CORS_HEADERS }
    )
  }
  if (!codigoTurma) {
    return NextResponse.json(
      { error: 'Código da turma é obrigatório' },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  // Procura turma pelo código
  const { data: turma } = await supabase.from('turmas')
    .select('id, codigo, status')
    .ilike('codigo', codigoTurma)
    .maybeSingle()

  if (!turma) {
    return NextResponse.json(
      { error: 'Turma não encontrada para o código informado' },
      { status: 404, headers: CORS_HEADERS }
    )
  }

  // Aplica rateio pra escolher vendedor
  const vendedorId = await aplicarRateio(supabase, turma.id)

  // Cria lead
  const { data: leadCriado, error } = await supabase.from('leads').insert({
    nome,
    whatsapp: whatsapp || null,
    email: email || null,
    turma_id: turma.id,
    codigo_turma: turma.codigo,
    vendedor_id: vendedorId,
    etapa: 'aguardando_atendimento',
    origem: 'formulario',
    fbclid,
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    utm_content: utmContent,
    observacoes,
    tamanho_equipe: tamanhoEquipe,
    investimento_marketing: investimentoMarketing,
    gera_leads_digital: geraLeadsDigital,
    maior_problema: maiorProblema,
    negocio: negocio,
    qualificacao,
    fbp,
    fbc,
  }).select().single()

  if (error || !leadCriado) {
    return NextResponse.json(
      { error: 'Erro ao criar lead: ' + (error?.message || 'desconhecido') },
      { status: 500, headers: CORS_HEADERS }
    )
  }

  // Registra andamento inicial
  await supabase.from('lead_andamentos').insert({
    lead_id: leadCriado.id,
    vendedor_id: vendedorId,
    tipo: 'criado',
    etapa_nova: 'aguardando_atendimento',
    observacao: `Lead criado via formulário do site${fbclid ? ' (fbclid capturado)' : ''}`,
  })

  // Dispara o evento Lead pro CAPI (server-side). Falha aqui não quebra a captação.
  try {
    const capi = await sendLead({
      eventId,
      eventSourceUrl,
      email,
      phone: whatsapp,
      firstName: nome,
      fbc,
      fbp,
      clientIp,
      userAgent,
      externalId: leadCriado.id,
      codigoTurma: turma.codigo,
    })
    if (!capi.ok) console.error('CAPI Lead falhou:', capi.error)
  } catch (e) {
    console.error('CAPI Lead exception:', e)
  }

  return NextResponse.json(
    { ok: true, lead_id: leadCriado.id, event_id: eventId },
    { status: 200, headers: CORS_HEADERS }
  )
}

export async function GET() {
  return NextResponse.json(
    { status: 'ok', endpoint: 'site-lead' },
    { headers: CORS_HEADERS }
  )
}