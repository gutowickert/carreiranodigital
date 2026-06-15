import { NextResponse } from 'next/server'

// Diagnóstico da conta oficial: lista números e templates disponíveis.
const TOKEN = process.env.WA_OFICIAL_TOKEN || ''
const PHONE_ID = process.env.WA_OFICIAL_PHONE_ID || ''
const GRAPH = 'https://graph.facebook.com/v25.0'

async function get(path: string) {
  const res = await fetch(`${GRAPH}${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

export async function GET(req: import('next/server').NextRequest) {
  // permite inspecionar qualquer WABA via ?waba=  (default = env)
  const WABA_ID = req.nextUrl.searchParams.get('waba') || process.env.WA_OFICIAL_WABA_ID || ''
  if (!TOKEN || !WABA_ID) {
    return NextResponse.json({ ok: false, error: 'Faltam WA_OFICIAL_TOKEN/WA_OFICIAL_WABA_ID' }, { status: 200 })
  }
  // números da WABA (status, id) — pra conferir se o PHONE_ID bate
  const nums = await get(`/${WABA_ID}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type`)
  // templates aprovados (nome, idioma, status, categoria)
  const tpls = await get(`/${WABA_ID}/message_templates?fields=name,language,status,category,components&limit=100`)

  const numerosResumo = (nums.json?.data || []).map((n: any) => ({
    id: n.id,
    numero: n.display_phone_number,
    nome: n.verified_name,
    qualidade: n.quality_rating,
    verificacao: n.code_verification_status,
    plataforma: n.platform_type,
    confere_com_env: n.id === PHONE_ID,
  }))
  const templatesResumo = (tpls.json?.data || []).map((t: any) => {
    // conta variáveis do corpo e detecta tipo de header
    const body = (t.components || []).find((c: any) => c.type === 'BODY')
    const header = (t.components || []).find((c: any) => c.type === 'HEADER')
    const vars = (body?.text?.match(/\{\{\d+\}\}/g) || []).length
    return { nome: t.name, idioma: t.language, categoria: t.category, variaveis_corpo: vars, header: header ? header.format : 'nenhum' }
  })

  return NextResponse.json({
    ok: true,
    phone_id_env: PHONE_ID,
    numeros: nums.json?.error ? nums.json.error : numerosResumo,
    templates: tpls.json?.error ? tpls.json.error : templatesResumo,
  })
}
