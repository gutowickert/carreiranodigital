// 19/10: o rastreio do anúncio direto pro WhatsApp (CTWA). Os eventos pra Meta (lib/ctwa.ts, eventoMensagens)
// precisam de um conjunto de dados LIGADO à conta do WhatsApp Business; o pixel da escola não é ligado e a Meta
// recusava tudo ("Não há uma conta do WhatsApp Business vinculada a este conjunto de dados").
//   GET ?chave=...            → o número oficial e o conjunto de dados que a conta do WhatsApp já tem (sem mudar nada)
//   GET ?chave=...&criar=1    → cria (ou devolve) o conjunto de dados da conta do WhatsApp — a Meta devolve o mesmo se já existir
// chave = RECADO_PAINEL_SENHA. O id que voltar vai na variável CAPI_WA_DATASET_ID.
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const G = 'https://graph.facebook.com/v25.0'

export async function GET(req: Request) {
  const u = new URL(req.url)
  const senha = (process.env.RECADO_PAINEL_SENHA || '').replace(/^"|"$/g, '')
  if (!senha || u.searchParams.get('chave') !== senha) return NextResponse.json({ erro: 'chave' }, { status: 401 })
  const waba = process.env.WA_OFICIAL_WABA_ID, token = process.env.WA_OFICIAL_TOKEN
  if (!waba || !token) return NextResponse.json({ erro: 'faltam WA_OFICIAL_WABA_ID ou WA_OFICIAL_TOKEN' }, { status: 500 })
  const auth = { Authorization: 'Bearer ' + token }
  const ler = async (r: Response) => { const j: any = await r.json().catch(() => ({})); return r.ok ? j : { erro: j?.error?.message || r.status } }
  const numeros = await ler(await fetch(`${G}/${waba}/phone_numbers?fields=display_phone_number,verified_name,quality_rating`, { headers: auth }))
  let dataset = await ler(await fetch(`${G}/${waba}/dataset`, { headers: auth }))
  let criado = false
  if (u.searchParams.get('criar') === '1') {
    dataset = await ler(await fetch(`${G}/${waba}/dataset`, { method: 'POST', headers: auth }))
    criado = !dataset?.erro
  }
  return NextResponse.json({
    numeros: numeros?.data || numeros,
    dataset,
    criado,
    em_uso_hoje: process.env.CAPI_WA_DATASET_ID ? 'CAPI_WA_DATASET_ID' : 'FB_PIXEL_ID (o pixel da escola, que não é ligado ao WhatsApp)',
  })
}
