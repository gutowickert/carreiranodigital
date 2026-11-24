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

// 14/11 (recado.ts): o RECADO PRA BASE. Cada recado vira um modelo de MARKETING próprio na conta do negócio (o texto aprovado
// pela equipe e pelo dono), com o nome do cliente no {{1}} e dois botões: "Quero participar" e "Não quero receber".
// Sem cabeçalho de imagem (a Meta pede o arquivo de exemplo por outro caminho de envio): a imagem vai só pra quem está com a
// janela de 24 h aberta. Modo local: nada vai pra Meta, o pedido fica "simulado" (o teste marca aprovado: recado.ts)
export const BOTAO_QUERO = 'Quero participar'
export const BOTAO_SAIR = 'Não quero receber'
export const RODAPE_RECADO = 'Pra não receber mais, toque em Não quero receber'
export function modeloDoRecado(nome: string, texto: string): Modelo {
  return {
    name: nome, category: 'MARKETING', language: 'pt_BR',
    components: [
      { type: 'BODY', text: `Oi, {{1}}! ${texto}`.slice(0, 1000), example: { body_text: [['Ana']] } },
      { type: 'FOOTER', text: RODAPE_RECADO },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: BOTAO_QUERO }, { type: 'QUICK_REPLY', text: BOTAO_SAIR }] },
    ],
  }
}
export async function criaModeloRecado(neg: any, nome: string, texto: string): Promise<{ nome: string; ok: boolean; status?: string; erro?: string; simulado?: boolean }> {
  const { waDoNegocio } = await import('./wa-negocio')
  const w = waDoNegocio(neg)
  if (maiaLocal() || !w?.waba) {
    if (!maiaLocal()) return { nome, ok: false, erro: 'o WhatsApp desse negócio ainda não foi conectado (falta a conta do WhatsApp)' }
    return { nome, ok: true, status: 'PENDING', simulado: true }
  }
  const r = await cria(w.token, w.waba, modeloDoRecado(nome, texto))
  return { nome, ok: r.ok, status: r.ok ? 'PENDING' : undefined, erro: (r as any).erro }
}

// o modelo do dono, na conta do número da Maia (a do Oito)
export async function criaModeloDoDono() {
  const token = process.env.OITO_WA_TOKEN || process.env.WA_OFICIAL_TOKEN || '', waba = process.env.OITO_WA_WABA_ID || ''
  if (!token || !waba) return { ok: false, erro: 'faltam OITO_WA_TOKEN/OITO_WA_WABA_ID no servidor' }
  return cria(token, waba, MODELO_DONO)
}

// 24/11 (doc do Guto "Maia vende a Maia"): os modelos da VENDA da Maia, no número da Maia (a vendedora, vendedora-rotina.ts).
//   maia_diagnostico       → chama quem fez o quiz e não chamou no WhatsApp (1 h depois)
//   maia_venda_retomada    → retomada de 3 dias (fora da janela de 24 h)
//   maia_venda_despedida   → a despedida de 6 dias
// Tratam por "você" (cliente do Brasil todo), sem emoji, sem urgência.
export const MODELOS_VENDA: Modelo[] = [
  {
    name: 'maia_diagnostico', category: 'MARKETING', language: 'pt_BR',
    components: [
      { type: 'BODY', text: 'Oi, {{1}}! Aqui é a Maia, a IA de marketing da Carreira no Digital. Vi o diagnóstico que você fez pra {{2}}: o maior ganho que apareceu foi {{3}}. Quer que eu te explique como eu faço isso na prática?', example: { body_text: [['Carlos', 'Auto Center Silva', 'cliente novo chegando pelo anúncio, uns R$ 6.000 por mês']] } },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Quero saber' }, { type: 'QUICK_REPLY', text: 'Agora não' }] },
    ],
  },
  {
    name: 'maia_venda_retomada', category: 'MARKETING', language: 'pt_BR',
    components: [
      { type: 'BODY', text: 'Oi, {{1}}! Aqui é a Maia de novo. Ficou alguma dúvida sobre como eu posso trazer mais clientes pra {{2}}? Se quiser, eu te explico em poucas mensagens ou marco 20 minutos com alguém da equipe.', example: { body_text: [['Carlos', 'Auto Center Silva']] } },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Quero saber' }, { type: 'QUICK_REPLY', text: 'Agora não' }] },
    ],
  },
  {
    name: 'maia_venda_despedida', category: 'MARKETING', language: 'pt_BR',
    components: [
      { type: 'BODY', text: 'Oi, {{1}}! Não quero te incomodar, então esta é a minha última mensagem. Se um dia quiser que eu cuide dos anúncios e do WhatsApp da {{2}}, é só me chamar aqui.', example: { body_text: [['Carlos', 'Auto Center Silva']] } },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Quero saber' }] },
    ],
  },
]
export async function criaModelosVenda() {
  const token = process.env.OITO_WA_TOKEN || process.env.WA_OFICIAL_TOKEN || '', waba = process.env.OITO_WA_WABA_ID || ''
  if (!token || !waba) return { ok: false, erro: 'faltam OITO_WA_TOKEN/OITO_WA_WABA_ID no servidor' }
  const r: any[] = []
  for (const m of MODELOS_VENDA) r.push(await cria(token, waba, m))
  return { ok: r.every(x => x.ok), modelos: r }
}

// a situação dos modelos da Maia (dono e, se pedir, de um negócio)
export async function statusModelos(w?: { token: string; waba: string } | null) {
  const token = w?.token || process.env.OITO_WA_TOKEN || process.env.WA_OFICIAL_TOKEN || '', waba = w?.waba || process.env.OITO_WA_WABA_ID || ''
  if (!token || !waba) return { ok: false, erro: 'sem conta pra consultar' }
  const r = await fetch(`${GRAPH}/${waba}/message_templates?fields=name,status,category,rejected_reason&limit=250`, { headers: { Authorization: 'Bearer ' + token } })
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok) return { ok: false, erro: String(j?.error?.message || r.status) }
  return { ok: true, modelos: (j.data || []).filter((m: any) => /^maia_/.test(m.name)) }
}
