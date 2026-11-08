// Maia: os modelos de mensagem (templates) da Meta (05/11). Fora da janela de 24 h, o WhatsApp só deixa mandar modelo aprovado.
//   no número da Maia (conta do Oito):      maia_novidades  → chama o dono quando tem coisa esperando por ele (a fila do canal.ts)
//   na conta de cada negócio (ao conectar): maia_retomada   → a retomada do cliente que parou de responder
//                                           maia_resposta   → a resposta do dono pra uma pergunta do cliente, chegando depois de 24 h
// A Meta aprova em minutos ou horas. Status: GET /api/maia/operacao?acao=modelos
// 08/11 (T2): cada modelo do negócio tem a versão "tu" (maia_retomada, maia_resposta) e a versão "você" (maia_retomada_voce,
// maia_resposta_voce). Na conexão (e na ação pedir_modelos_negocio do painel) pede as 4; no envio, vale o tom do negócio (nomeDoModelo).
// No modo local nada vai pra Meta: o pedido é só anotado (modelos_pedidos) e volta "simulado".
import { tomDoNegocio } from './tom'
import { maiaLocal } from './db'
const GRAPH = 'https://graph.facebook.com/v25.0'

// o nome do modelo no tom do negócio: "você" → maia_retomada_voce; "tu" → maia_retomada
export type ModeloCliente = 'maia_retomada' | 'maia_resposta'
export const nomeDoModelo = (neg: any, base: ModeloCliente) => tomDoNegocio(neg).pessoa === 'voce' ? `${base}_voce` : base
// a ordem de preferência no envio: o do tom do negócio e, se ele não estiver aprovado, o outro (a mensagem chega, mesmo no outro tom)
export const modelosEmOrdem = (neg: any, base: ModeloCliente) => { const n = nomeDoModelo(neg, base); return n === base ? [base, `${base}_voce`] : [n, base] }

type Modelo = { name: string; category: 'UTILITY' | 'MARKETING'; language: string; components: any[] }

export const MODELO_DONO: Modelo = {
  name: 'maia_novidades', category: 'UTILITY', language: 'pt_BR',
  components: [
    { type: 'BODY', text: 'Oi, {{1}}! A Maia tem novidades do {{2}} pra ti: {{3}}. Me responde aqui que eu te mando tudo.', example: { body_text: [['Ana', 'Ótica Tempo de Visão', '2 anúncios novos pra tu aprovar']] } },
    { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Ver agora' }] },
  ],
}

const modelosDoNegocio = (neg: any): Modelo[] => [
  {
    name: 'maia_retomada', category: 'MARKETING', language: 'pt_BR',
    components: [
      { type: 'BODY', text: 'Oi, {{1}}! Aqui é a assistente virtual do {{2}}. Tu tinha falado com a gente sobre {{3}}. Ainda posso te ajudar?', example: { body_text: [['Ana', neg?.nome || 'Ótica Tempo de Visão', 'óculos de grau']] } },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Sim, quero' }, { type: 'QUICK_REPLY', text: 'Agora não' }] },
    ],
  },
  {
    name: 'maia_resposta', category: 'UTILITY', language: 'pt_BR',
    components: [
      { type: 'BODY', text: 'Oi, {{1}}! Aqui é a assistente virtual do {{2}}. Já tenho a resposta da tua pergunta sobre {{3}}. Posso te mandar?', example: { body_text: [['Ana', neg?.nome || 'Ótica Tempo de Visão', 'o prazo de entrega']] } },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Pode mandar' }] },
    ],
  },
  // 08/11 (T2): as versões em "você" (o tom padrão dos negócios)
  {
    name: 'maia_retomada_voce', category: 'MARKETING', language: 'pt_BR',
    components: [
      { type: 'BODY', text: 'Oi, {{1}}! Aqui é a assistente virtual do {{2}}. Você tinha falado com a gente sobre {{3}}. Ainda posso ajudar você?', example: { body_text: [['Ana', neg?.nome || 'Ótica Tempo de Visão', 'óculos de grau']] } },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Sim, quero' }, { type: 'QUICK_REPLY', text: 'Agora não' }] },
    ],
  },
  {
    name: 'maia_resposta_voce', category: 'UTILITY', language: 'pt_BR',
    components: [
      { type: 'BODY', text: 'Oi, {{1}}! Aqui é a assistente virtual do {{2}}. Já tenho a resposta da sua pergunta sobre {{3}}. Posso mandar?', example: { body_text: [['Ana', neg?.nome || 'Ótica Tempo de Visão', 'o prazo de entrega']] } },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Pode mandar' }] },
    ],
  },
]
export const nomesDosModelosDoNegocio = () => modelosDoNegocio(null).map(m => m.name)

async function cria(token: string, waba: string, m: Modelo) {
  const r = await fetch(`${GRAPH}/${waba}/message_templates`, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(m) })
  const j: any = await r.json().catch(() => ({}))
  // "já existe" não é erro
  if (!r.ok && !/already exists|duplicate|existe/i.test(String(j?.error?.error_user_msg || j?.error?.message || ''))) return { nome: m.name, ok: false, erro: String(j?.error?.error_user_msg || j?.error?.message || r.status).slice(0, 200) }
  return { nome: m.name, ok: true, status: j?.status || 'já existia' }
}

export async function criaModelosDoNegocio(w: { token: string; waba: string } | null, neg: any) {
  const out: any[] = []
  // modo local: nada vai pra Meta (só anota o que seria pedido)
  if (maiaLocal() || !w) {
    if (!maiaLocal()) throw new Error('o WhatsApp desse negócio ainda não foi conectado')
    for (const m of modelosDoNegocio(neg)) out.push({ nome: m.name, ok: true, status: 'simulado', texto: m.components[0].text })
  } else for (const m of modelosDoNegocio(neg)) out.push(await cria(w.token, w.waba, m))
  if (neg?.id) await import('./db').then(({ maiaDb }) => maiaDb.evento('modelos_pedidos', neg.id, { modelos: out.map(o => ({ nome: o.nome, ok: o.ok, status: (o as any).status || null, erro: (o as any).erro || null })), simulado: maiaLocal() || !w }))
  return out
}

// o modelo do dono, na conta do número da Maia (a do Oito)
export async function criaModeloDoDono() {
  const token = process.env.OITO_WA_TOKEN || process.env.WA_OFICIAL_TOKEN || '', waba = process.env.OITO_WA_WABA_ID || ''
  if (!token || !waba) return { ok: false, erro: 'faltam OITO_WA_TOKEN/OITO_WA_WABA_ID no servidor' }
  return cria(token, waba, MODELO_DONO)
}

// a situação dos modelos da Maia (dono e, se pedir, de um negócio)
export async function statusModelos(w?: { token: string; waba: string } | null) {
  const token = w?.token || process.env.OITO_WA_TOKEN || process.env.WA_OFICIAL_TOKEN || '', waba = w?.waba || process.env.OITO_WA_WABA_ID || ''
  if (!token || !waba) return { ok: false, erro: 'sem conta pra consultar' }
  const r = await fetch(`${GRAPH}/${waba}/message_templates?fields=name,status,category,rejected_reason&limit=100`, { headers: { Authorization: 'Bearer ' + token } })
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok) return { ok: false, erro: String(j?.error?.message || r.status) }
  return { ok: true, modelos: (j.data || []).filter((m: any) => /^maia_/.test(m.name)) }
}
