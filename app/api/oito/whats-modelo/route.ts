// Oito Posts: cria (POST) ou consulta (GET) na Meta o modelo de aviso de venda "oito_aviso_venda" (13/10).
// POST ?teste=1 manda um aviso de teste pra todos os números. Protegido pela senha do painel (x-senha).
import { NextResponse } from 'next/server'
import { senhaOk } from '@/lib/oito/config'
import { MODELO_AVISO, avisaVendaWhats } from '@/lib/oito/whats'

const GRAPH = 'https://graph.facebook.com/v25.0'
async function waba() {
  if (process.env.WA_OFICIAL_WABA_ID) return process.env.WA_OFICIAL_WABA_ID
  const T = process.env.WA_OFICIAL_TOKEN, P = process.env.WA_OFICIAL_PHONE_ID
  const r: any = await fetch(`${GRAPH}/${P}?fields=whatsapp_business_account&access_token=${T}`).then(r => r.json())
  if (r?.whatsapp_business_account?.id) return r.whatsapp_business_account.id
  const d: any = await fetch(`${GRAPH}/debug_token?input_token=${T}&access_token=${T}`).then(r => r.json())
  return (d?.data?.granular_scopes || []).find((s: any) => s.scope === 'whatsapp_business_management')?.target_ids?.[0]
}

export async function GET(req: Request) {
  if (!senhaOk(req.headers.get('x-senha'))) return NextResponse.json({ erro: 'senha' }, { status: 401 })
  const W = await waba(), T = process.env.WA_OFICIAL_TOKEN
  return NextResponse.json(await fetch(`${GRAPH}/${W}/message_templates?name=${MODELO_AVISO}&fields=name,status,category,rejected_reason&access_token=${T}`).then(r => r.json()))
}

export async function POST(req: Request) {
  if (!senhaOk(req.headers.get('x-senha'))) return NextResponse.json({ erro: 'senha' }, { status: 401 })
  if (new URL(req.url).searchParams.get('teste')) return NextResponse.json({ envios: await avisaVendaWhats('Oito Posts (teste)', 'assim vão chegar os avisos de venda das 3 marcas') })
  const W = await waba(), T = process.env.WA_OFICIAL_TOKEN
  const corpo = {
    name: MODELO_AVISO, language: 'pt_BR', category: 'UTILITY',
    components: [{ type: 'BODY', text: 'Nova venda no {{1}}: {{2}}. Acompanhe no painel.',
      example: { body_text: [['Salão no Feed', 'Studio Bela, Lajeado, R$ 197 por mês'] ] } }],
  }
  return NextResponse.json(await fetch(`${GRAPH}/${W}/message_templates?access_token=${T}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }).then(r => r.json()))
}
