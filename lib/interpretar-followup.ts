import Anthropic from '@anthropic-ai/sdk'
import { timelineDossie, type Dossie } from '@/lib/historico-lead'
import { logIaUso } from '@/lib/ia-uso'

// INTERPRETADOR LEVE do follow-up: 1 chamada focada (só o histórico do lead) pra decidir ONDE ele REALMENTE está
// no fluxo — pra o motor não disparar template incoerente pela etapa gravada. Barato e rápido (não é o copiloto inteiro).
const MODELO = 'claude-sonnet-4-6'
const SYSTEM = `Você analisa o HISTÓRICO de um lead da Carreira No Digital (cursos presenciais de marketing no RS) pra decidir o follow-up automático. Leia a conversa (WhatsApp + ligações + notas do time) e diga ONDE o lead REALMENTE está no fluxo comercial — pra não mandar mensagem incoerente.

ETAPAS:
- atendimento_inicial: ainda NÃO recebeu preço/lote nem o curso explicado direito.
- lote_preco_ok: JÁ recebeu preço + lote (numa conversa/ligação) e está decidindo.
- oferecer_bolsa: já demonstrou interesse OU o time já fez uma oferta/condição especial — hora da bolsa.
- agendado: pediu pra retomar/pagar numa DATA futura, ou "vou pensar"/"falo com alguém" com retorno.
- aguardando_pagamento: decidiu fechar / recebeu link de pagamento.
- proxima_turma: quer só uma turma FUTURA (não a atual).
- perda: disse claramente que NÃO quer / não vai fazer / não tem interesse / pediu pra parar.
- ganho: já fechou/pagou.

Responda APENAS um JSON: {"etapa":"<uma das acima>","motivo":"<1 frase curta citando o que o lead disse OU o que o time já fez>"}. Sem texto fora do JSON.`

type LeadRef = { nome?: string | null; etapa?: string | null; codigo_turma?: string | null }

export async function interpretarFollowup(d: Dossie, lead: LeadRef): Promise<{ etapa: string; motivo: string } | null> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  const linhas = timelineDossie(d, 28).map(t => `${t.quem === 'cliente' ? 'CLIENTE' : t.quem === 'evento' ? '·' : 'NÓS'}: ${(t.texto || '').slice(0, 280)}`).join('\n')
  if (!linhas.trim()) return null // sem histórico → deixa o motor seguir a etapa gravada
  try {
    const client = new Anthropic({ apiKey: key })
    const resp = await client.messages.create({
      model: MODELO, max_tokens: 200, system: SYSTEM,
      messages: [{ role: 'user', content: `LEAD: ${lead.nome || '(sem nome)'} | etapa gravada: ${lead.etapa || '-'} | turma: ${lead.codigo_turma || '-'}\n\nHISTÓRICO:\n${linhas}\n\nOnde ele está de verdade?` }],
    })
    try { await logIaUso('interpretar-followup', MODELO, resp.usage) } catch { /* não quebra */ }
    const raw = (resp.content || []).map((b: any) => b.type === 'text' ? b.text : '').join('').trim()
    const a = raw.indexOf('{'), z = raw.lastIndexOf('}')
    if (a < 0 || z < a) return null
    const out = JSON.parse(raw.slice(a, z + 1))
    return out?.etapa ? { etapa: String(out.etapa), motivo: String(out.motivo || '') } : null
  } catch { return null }
}
