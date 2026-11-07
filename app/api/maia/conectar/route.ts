// Maia: o dono conecta o WhatsApp do negócio (05/11, pro Tech Provider). A equipe gera um link assinado no painel
// (acao link_conectar) e manda pro dono; ele abre /maia/conectar, entra com o Facebook (cadastro incorporado, coexistência:
// o número continua no app WhatsApp Business do celular) e o sistema guarda o número e a chave no negócio.
//   GET  ?n=<negocio>&t=<assinatura>  → o que a tela precisa (nome do negócio, app e configuração da Meta)
//   POST {n, t, code, phone_number_id, waba_id} → troca o code pela chave, inscreve a conta no webhook da Maia,
//        cria o modelo de retomada na conta do negócio e guarda tudo. O atendimento começa DESLIGADO (a equipe liga).
import { maiaDb as db } from '@/lib/maia/db'
import { avisaEquipe } from '@/lib/maia/canal'
import { criaModelosDoNegocio } from '@/lib/maia/modelos'
import { linkOk } from '@/lib/maia/conectar'
import { cifra } from '@/lib/maia/segredo'

const GRAPH = 'https://graph.facebook.com/v25.0'
const APP_ID = () => process.env.MAIA_META_APP_ID || '2069913353660247'          // app "Sistema CND" (portfólio da CND)
const CONFIG_ID = () => process.env.MAIA_META_CONFIG_ID || '2310936702790535'    // configuração do Login para Empresas (WhatsApp), do Nando
const APP_SECRET = () => process.env.MAIA_META_APP_SECRET || process.env.META_APP_SECRET || ''

export async function GET(req: Request) {
  const u = new URL(req.url)
  const n = u.searchParams.get('n') || '', t = u.searchParams.get('t') || ''
  if (!linkOk(n, t)) return Response.json({ ok: false, erro: 'Esse link venceu ou não é válido. Pede um novo pra equipe da Maia.' }, { status: 403 })
  const neg = await db.um('negocios', { id: n })
  if (!neg) return Response.json({ ok: false, erro: 'negócio não encontrado' }, { status: 404 })
  return Response.json({ ok: true, negocio: neg.nome, dono: String(neg.dono_nome || '').split(' ')[0], conectado: !!neg.wa_phone_id, app_id: APP_ID(), config_id: CONFIG_ID() })
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}))
  if (!linkOk(b.n, b.t)) return Response.json({ ok: false, erro: 'Esse link venceu ou não é válido. Pede um novo pra equipe da Maia.' }, { status: 403 })
  const neg = await db.um('negocios', { id: b.n })
  if (!neg) return Response.json({ ok: false, erro: 'negócio não encontrado' }, { status: 404 })
  const code = String(b.code || ''), phoneId = String(b.phone_number_id || ''), wabaId = String(b.waba_id || '')
  if (!code) return Response.json({ ok: false, erro: 'o Facebook não devolveu a autorização. Tenta de novo.' })
  if (!phoneId || !wabaId) return Response.json({ ok: false, erro: 'não veio o número ou a conta do WhatsApp. Tenta de novo e escolhe o número no fim.' })
  // 07/11 (segurança): os ids vão no caminho da Graph API: só dígitos
  if (!/^\d{5,25}$/.test(phoneId) || !/^\d{5,25}$/.test(wabaId)) return Response.json({ ok: false, erro: 'número ou conta do WhatsApp inválidos. Tenta de novo.' }, { status: 400 })
  if (!APP_SECRET()) return Response.json({ ok: false, erro: 'falta o segredo do app no servidor (MAIA_META_APP_SECRET). Avisa a equipe.' })
  const outro = await db.um('negocios', { wa_phone_id: phoneId })
  if (outro && outro.id !== neg.id) return Response.json({ ok: false, erro: 'esse número já está ligado a outro negócio na Maia. Fala com a equipe.' })

  // 1) code → chave do negócio
  const tk: any = await fetch(`${GRAPH}/oauth/access_token?client_id=${encodeURIComponent(APP_ID())}&client_secret=${encodeURIComponent(APP_SECRET())}&code=${encodeURIComponent(code)}`).then(r => r.json()).catch(() => null)
  const token = tk?.access_token
  if (!token) return Response.json({ ok: false, erro: 'não consegui trocar a autorização pela chave: ' + String(tk?.error?.message || 'sem resposta').slice(0, 160) })

  // 07/11 (segurança): o número e a conta vêm do navegador. Confere com a chave que a Meta acabou de dar que o número É
  // dessa conta (senão alguém com o link ligaria ao negócio dele o phone_number_id de outro negócio e receberia os eventos dele)
  const nums: any = await fetch(`${GRAPH}/${wabaId}/phone_numbers?fields=id&limit=100`, { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json()).catch(() => null)
  if (!(nums?.data || []).some((x: any) => String(x.id) === phoneId)) return Response.json({ ok: false, erro: 'esse número não aparece na conta do WhatsApp que tu autorizou. Tenta de novo e escolhe o número certo no fim.' })

  // 2) inscreve a conta no webhook da Maia (só os eventos deste negócio vêm pra cá)
  const base = process.env.MAIA_URL_PUBLICA || new URL(req.url).origin
  const sub: any = await fetch(`${GRAPH}/${wabaId}/subscribed_apps`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ override_callback_uri: `${base}/api/maia/whats/webhook`, verify_token: process.env.MAIA_WA_VERIFY_TOKEN || 'maia-wa-2026' }),
  }).then(r => r.json()).catch(() => null)

  // 3) guarda (o atendimento começa desligado: a equipe testa e liga no painel)
  // a chave vai cifrada pro banco quando há MAIA_CRIPTO_CHAVE (lib/maia/segredo.ts)
  const wa = { ...(neg.meta?.wa || {}), token: cifra(token), waba_id: wabaId, conectado_em: new Date().toISOString(), inscrito: !!sub?.success, atende: false }
  await db.atualiza('negocios', { id: neg.id }, { wa_phone_id: phoneId, meta: { ...(neg.meta || {}), wa } })
  await db.evento('whatsapp_conectado', neg.id, { phone_id: phoneId, waba_id: wabaId, inscrito: !!sub?.success })

  // 4) o modelo de retomada na conta do negócio (a Meta aprova em minutos ou horas)
  const modelos = await criaModelosDoNegocio({ token, waba: wabaId }, neg).catch((e: any) => ({ erro: String(e?.message || e) }))
  await avisaEquipe('WhatsApp conectado', `${neg.nome}: número conectado${sub?.success ? '' : ' (o webhook NÃO inscreveu: conferir)'}. Atendimento desligado até a equipe ligar no painel.`, neg.id, true)
  return Response.json({ ok: true, inscrito: !!sub?.success, modelos })
}
