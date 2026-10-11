// Recado Encantado: cria (ou consulta) na Meta o modelo de aviso pro dono, cnd_aviso_recado (11/10).
// Fora da janela de 24 h o WhatsApp oficial só aceita modelo aprovado; o aviso de venda usa este.
// POST cria · GET consulta o status. Protegido pela senha do painel (x-senha). A chave do WhatsApp fica só aqui no servidor.
import { NextRequest, NextResponse } from 'next/server'

const GRAPH = 'https://graph.facebook.com/v25.0', NOME = 'cnd_aviso_recado'
const ok = (req: NextRequest) => !!process.env.RECADO_PAINEL_SENHA && req.headers.get('x-senha') === process.env.RECADO_PAINEL_SENHA
async function waba() {
  if (process.env.WA_OFICIAL_WABA_ID) return process.env.WA_OFICIAL_WABA_ID
  const T = process.env.WA_OFICIAL_TOKEN, P = process.env.WA_OFICIAL_PHONE_ID
  const r: any = await fetch(`${GRAPH}/${P}?fields=whatsapp_business_account&access_token=${T}`).then(r => r.json())
  if (r?.whatsapp_business_account?.id) return r.whatsapp_business_account.id
  const d: any = await fetch(`${GRAPH}/debug_token?input_token=${T}&access_token=${T}`).then(r => r.json())
  return (d?.data?.granular_scopes || []).find((s: any) => s.scope === 'whatsapp_business_management')?.target_ids?.[0]
}

export async function GET(req: NextRequest) {
  if (!ok(req)) return NextResponse.json({ erro: 'senha' }, { status: 401 })
  const W = await waba(), T = process.env.WA_OFICIAL_TOKEN
  const r: any = await fetch(`${GRAPH}/${W}/message_templates?name=${NOME}&fields=name,status,category,rejected_reason&access_token=${T}`).then(r => r.json())
  return NextResponse.json(r)
}

export async function POST(req: NextRequest) {
  if (!ok(req)) return NextResponse.json({ erro: 'senha' }, { status: 401 })
  const W = await waba(), T = process.env.WA_OFICIAL_TOKEN
  const corpo = {
    name: NOME, language: 'pt_BR', category: 'UTILITY',
    components: [{ type: 'BODY', text: 'Aviso do Recado Encantado: {{1}}. Detalhes: {{2}}. Acompanhe no painel.',
      example: { body_text: [['nova venda confirmada', 'Missão Tchau Chupeta, R$ 94,90, pedido CHUPETA-AB12C'] ] } }],
  }
  const r: any = await fetch(`${GRAPH}/${W}/message_templates?access_token=${T}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }).then(r => r.json())
  return NextResponse.json(r)
}
