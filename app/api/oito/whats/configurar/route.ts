// Oito Posts: configura a conta de WhatsApp do Oito (14/10). Rodar uma vez, depois que o número estiver na conta.
//   GET  (x-senha) → o número, a conta e a situação dos modelos
//   POST (x-senha) {registrar?:true, pin?:'123456', webhook?:true, modelos?:true} → liga o webhook próprio na conta (override) e cria os modelos que faltam
// Precisa de OITO_WA_WABA_ID, OITO_WA_PHONE_ID e um token com acesso à conta (OITO_WA_TOKEN ou o WA_OFICIAL_TOKEN da escola).
import { NextResponse } from 'next/server'
import { senhaOk } from '@/lib/oito/config'

const GRAPH = 'https://graph.facebook.com/v25.0'
const T = () => process.env.OITO_WA_TOKEN || process.env.WA_OFICIAL_TOKEN || ''
const WABA = () => process.env.OITO_WA_WABA_ID || ''
const g = async (caminho: string, opts: any = {}) => {
  const r = await fetch(GRAPH + caminho, { ...opts, headers: { Authorization: 'Bearer ' + T(), 'Content-Type': 'application/json' }, cache: 'no-store' })
  return { ok: r.ok, j: await r.json().catch(() => ({})) }
}
const BASE_URL = 'https://carreiranodigital.vercel.app/oito/'
const EX = (es: boolean) => es ? ['Ana', 'Feed Peludo', 'Cola Contenta'] : ['Ana', 'Pata no Feed', 'Pet Feliz']

// {{1}} nome · {{2}} marca · {{3}} negócio (sempre nessa ordem no texto)
const MODELOS = [
  { name: 'oito_teste_pronto', language: 'pt_BR', es: false, url: true,
    texto: 'Oi, {{1}}! Aqui é do {{2}} 👋\n\nOs 2 posts grátis do {{3}} ficaram prontos. Conseguiu ver?\n\nSe quiser, te conto como funciona o mês inteiro, com os 8 posts.',
    botoes: ['Quero saber mais', 'Agora não'], link: 'Ver meus posts' },
  { name: 'oito_seguimento_1', language: 'pt_BR', es: false,
    texto: 'Oi, {{1}}! Aqui é do {{2}} de novo.\n\nO que achou dos posts do {{3}}? Com a assinatura, os 8 posts do mês chegam prontos, com a sua marca e a legenda. É só baixar e postar.\n\nPosso te ajudar com alguma dúvida?',
    botoes: ['Quero assinar', 'Tenho uma dúvida', 'Agora não'] },
  { name: 'oito_seguimento_2', language: 'pt_BR', es: false,
    texto: 'Oi, {{1}}! Aqui é do {{2}}. Essa é a nossa última mensagem por aqui 🙂\n\nOs posts grátis do {{3}} continuam na sua área. Quando quiser os 8 posts do mês, é só responder esta mensagem.\n\nSe não quiser mais receber, responda SAIR.',
    botoes: ['Quero assinar'] },
  { name: 'oito_es_prueba_lista', language: 'es', es: true, url: true,
    texto: '¡Hola, {{1}}! Te escribimos de {{2}} 👋\n\nLos 2 posts gratis de {{3}} ya están listos. ¿Alcanzaste a verlos?\n\nSi quieres, te cuento cómo funciona el mes completo, con los 8 posts.',
    botoes: ['Quiero saber más', 'Ahora no'], link: 'Ver mis posts' },
  { name: 'oito_es_seguimiento_1', language: 'es', es: true,
    texto: '¡Hola, {{1}}! Te escribimos de {{2}} otra vez.\n\n¿Qué te parecieron los posts de {{3}}? Con la suscripción, los 8 posts del mes llegan listos, con tu marca y el texto. Solo descargas y publicas.\n\n¿Te ayudo con alguna duda?',
    botoes: ['Quiero suscribirme', 'Tengo una duda', 'Ahora no'] },
  { name: 'oito_es_seguimiento_2', language: 'es', es: true,
    texto: '¡Hola, {{1}}! Te escribimos de {{2}}. Este es nuestro último mensaje por aquí 🙂\n\nLos posts gratis de {{3}} siguen en tu área. Cuando quieras los 8 posts del mes, solo responde este mensaje.\n\nSi no quieres recibir más mensajes, responde SALIR.',
    botoes: ['Quiero suscribirme'] },
  // 16/10 (v2, pedido do Guto): a 1ª mensagem busca a APROVAÇÃO, não a venda; tudo mais leve. O teste pronto vai como UTILIDADE
  // (é o aviso de uma entrega). Enquanto a Meta não aprova, o sistema cai sozinho nos modelos antigos (lib/oito/vendedor.ts).
  { name: 'oito_teste_pronto_v2', language: 'pt_BR', es: false, url: true, categoria: 'UTILITY',
    texto: 'Oi, {{1}}! Aqui é do {{2}} 😊\n\nOs 2 posts do {{3}} ficaram prontos. Deu uma olhada? Me conta o que achou.\n\nSe estiver do seu jeito, é só aprovar. Se quiser mudar alguma coisa (o texto, a foto, as cores), me diz aqui que eu ajusto.',
    botoes: ['Aprovado 👍', 'Quero ajustar'], link: 'Ver os posts' },
  { name: 'oito_seguimento_1_v2', language: 'pt_BR', es: false,
    texto: 'Oi, {{1}}! Aqui é do {{2}}, passando pra saber se os posts do {{3}} serviram 🙂\n\nSe algum detalhe não ficou do seu jeito, eu ajusto rapidinho. E se fizer sentido receber 8 assim todo mês, te conto como funciona, sem compromisso.',
    botoes: ['Quero ajustar', 'Como funciona?', 'Agora não'] },
  { name: 'oito_seguimento_2_v2', language: 'pt_BR', es: false,
    texto: 'Oi, {{1}}! Última mensagem do {{2}} por aqui, prometo 😊\n\nOs posts do {{3}} continuam guardados na sua área. Quando quiser os do mês, é só responder esta conversa.\n\nSe preferir não receber mais, responda SAIR.',
    botoes: ['Quero os do mês'] },
  { name: 'oito_es_prueba_lista_v2', language: 'es', es: true, url: true, categoria: 'UTILITY',
    texto: '¡Hola, {{1}}! Te escribimos de {{2}} 😊\n\nLos 2 posts de {{3}} ya están listos. ¿Alcanzaste a verlos? Cuéntame qué te parecieron.\n\nSi te gustan, solo apruébalos. Si quieres cambiar algo (el texto, la foto, los colores), dímelo aquí y lo ajusto.',
    botoes: ['Aprobado 👍', 'Quiero ajustar'], link: 'Ver los posts' },
  { name: 'oito_es_seguimiento_1_v2', language: 'es', es: true,
    texto: '¡Hola, {{1}}! Te escribimos de {{2}}: ¿los posts de {{3}} te sirvieron? 🙂\n\nSi algún detalle no quedó a tu gusto, lo ajusto rapidito. Y si te sirve recibir 8 así cada mes, te cuento cómo funciona, sin compromiso.',
    botoes: ['Quiero ajustar', '¿Cómo funciona?', 'Ahora no'] },
  { name: 'oito_es_seguimiento_2_v2', language: 'es', es: true,
    texto: '¡Hola, {{1}}! Último mensaje de {{2}} por aquí, lo prometo 😊\n\nLos posts de {{3}} siguen guardados en tu área. Cuando quieras los del mes, solo responde esta conversación.\n\nSi prefieres no recibir más mensajes, responde SALIR.',
    botoes: ['Quiero los del mes'] },
] as { name: string; language: string; es: boolean; url?: boolean; categoria?: string; texto: string; botoes: string[]; link?: string }[]

export async function GET(req: Request) {
  if (!senhaOk(req.headers.get('x-senha'))) return NextResponse.json({ erro: 'senha' }, { status: 401 })
  if (!WABA()) return NextResponse.json({ erro: 'falta OITO_WA_WABA_ID' }, { status: 503 })
  const [num, mods, apps] = await Promise.all([
    g(`/${process.env.OITO_WA_PHONE_ID}?fields=display_phone_number,verified_name,name_status,quality_rating,code_verification_status`),
    g(`/${WABA()}/message_templates?fields=name,status,language,rejected_reason&limit=50`),
    g(`/${WABA()}/subscribed_apps`),
  ])
  return NextResponse.json({ numero: num.j, modelos: (mods.j.data || []).filter((m: any) => /^oito_/.test(m.name)), apps: apps.j })
}

export async function POST(req: Request) {
  if (!senhaOk(req.headers.get('x-senha'))) return NextResponse.json({ erro: 'senha' }, { status: 401 })
  if (!WABA()) return NextResponse.json({ erro: 'falta OITO_WA_WABA_ID' }, { status: 503 })
  const b = await req.json().catch(() => ({}))
  const out: any = {}
  // 15/10: ativa o número na Cloud API (registro com o PIN de confirmação em duas etapas, 6 dígitos)
  if (b.registrar && /^\d{6}$/.test(String(b.pin || ''))) {
    const r = await g(`/${process.env.OITO_WA_PHONE_ID}/register`, { method: 'POST', body: JSON.stringify({ messaging_product: 'whatsapp', pin: String(b.pin) }) })
    out.registro = r.ok ? 'ativado' : r.j
  }
  if (b.webhook) {
    const r = await g(`/${WABA()}/subscribed_apps`, { method: 'POST', body: JSON.stringify({ override_callback_uri: 'https://carreiranodigital.vercel.app/api/oito/whats/webhook', verify_token: process.env.OITO_WA_VERIFY_TOKEN || 'oito-wa-2026' }) })
    out.webhook = r.ok ? 'ligado' : r.j
  }
  if (b.modelos) {
    const ja = new Set(((await g(`/${WABA()}/message_templates?fields=name,language&limit=100`)).j.data || []).map((m: any) => m.name + '|' + m.language))
    out.modelos = {}
    for (const m of MODELOS) {
      if (ja.has(m.name + '|' + m.language)) { out.modelos[m.name] = 'já existe'; continue }
      const buttons: any[] = []
      if (m.url) buttons.push({ type: 'URL', text: m.link, url: BASE_URL + '{{1}}', example: [BASE_URL + (m.es ? 'peludo' : 'pata') + '/teste.html?c=ABC123'] })
      for (const t of m.botoes) buttons.push({ type: 'QUICK_REPLY', text: t })
      const comp: any[] = [{ type: 'BODY', text: m.texto, example: { body_text: [EX(m.es)] } }, { type: 'BUTTONS', buttons }]
      const r = await g(`/${WABA()}/message_templates`, { method: 'POST', body: JSON.stringify({ name: m.name, language: m.language, category: m.categoria || 'MARKETING', components: comp }) })
      out.modelos[m.name] = r.ok ? (r.j.status || 'enviado') : (r.j.error?.error_user_msg || r.j.error?.message || 'erro')
    }
  }
  return NextResponse.json(out)
}
