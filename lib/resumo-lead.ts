import Anthropic from '@anthropic-ai/sdk'
import { dossieLead, durHumana, type Dossie } from './historico-lead'

// Gera o RESUMO do lead a partir do DOSSIÊ ÚNICO (mensagens dos 2 canais + andamentos + LIGAÇÕES transcritas).
// Um só lugar — usado pelo /api/lead/resumo e pela tela Qualidade IA. Cacheia em leads.resumo_ia.
// Sonnet dá conta e é barato; o resumo só regenera quando entra atividade nova.
const MODELO = 'claude-sonnet-4-6'

const SYSTEM = `Você resume a negociação de um lead da Carreira No Digital (cursos presenciais de marketing no RS) pro vendedor bater o olho e saber onde está, SEM reler tudo. Baseie-se APENAS no que foi fornecido: conversa do WhatsApp, anotações/andamentos do vendedor e transcrições de LIGAÇÕES. Não invente. Se algo não apareceu, diga que não.

Responda APENAS com um objeto JSON válido, sem texto antes ou depois, exatamente neste formato:
{
 "temperatura":"quente|morno|frio",
 "jaExplicouCurso":"sim|parcial|nao",
 "ondeParou":"1 frase: qual foi a última interação e o que está pendente agora",
 "resumo":["3 a 6 bullets curtos com o essencial: objetivo/negócio do cliente, cidade/turma de interesse, o que já foi oferecido (formato, valor, condição), sinais de interesse"],
 "objecoes":"objeções levantadas e se foram resolvidas — ou 'nenhuma'",
 "proximoPasso":"o que o vendedor deve fazer AGORA pra avançar",
 "etapaReal":"<onde o lead REALMENTE está no fluxo, pela conversa — uma de: atendimento_inicial (não recebeu preço/curso) | lote_preco_ok (já recebeu preço/lote, decidindo) | oferecer_bolsa (demonstrou interesse OU time já fez oferta/condição especial) | agendado (pediu retorno/pagamento numa data futura, ou 'vou pensar' com retorno) | aguardando_pagamento (decidiu/recebeu link) | proxima_turma (quer só turma futura) | perda (disse que NÃO quer/não vai fazer) | ganho (já pagou)>"
}
Regras: jaExplicouCurso = 'sim' só se oferta/formato E preço já foram apresentados; 'parcial' se parte; 'nao' se nada. temperatura pela intenção de compra demonstrada. Considere as LIGAÇÕES atendidas tanto quanto as mensagens. etapaReal = a situação REAL pela conversa (não a etapa gravada). Português, direto, tom da escola.`

type LeadInfo = { id: string; nome?: string | null; whatsapp?: string | null; etapa?: string | null; codigo_turma?: string | null }

function montarContexto(lead: LeadInfo, d: Dossie): string {
  const linhas = d.mensagens.filter(m => (m.texto || '').trim()).slice(-50)
    .map(m => `[${(m.em || '').slice(0, 10)}] ${m.quem === 'cliente' ? 'CLIENTE' : 'VENDEDOR'}: ${(m.texto || '').replace(/\s+/g, ' ').trim().slice(0, 400)}`)
  const andTxt = d.andamentos.filter(a => (a.observacao || '').trim() && !['tarefa_criada', 'criado'].includes(a.tipo))
    .slice(-40).map(a => `[${(a.em || '').slice(0, 10)}] ${a.observacao}`)
  const ligTxt = d.ligacoes.filter(g => g.atendida).map(g =>
    `[${(g.em || '').slice(0, 10)}] LIGAÇÃO ATENDIDA (${durHumana(g.duracao)})${g.transcricao ? ' — transcrição: ' + g.transcricao.replace(/\s+/g, ' ').trim().slice(0, 6000) : ' (sem transcrição)'}`)
  const ligCurtas = d.ligacoes.filter(g => !g.atendida).length

  return `LEAD: ${lead.nome || '(sem nome)'} | etapa atual: ${lead.etapa || '-'} | turma de interesse: ${lead.codigo_turma || '-'}

ANDAMENTOS (anotações do vendedor):
${andTxt.length ? andTxt.join('\n') : '(sem andamentos)'}

LIGAÇÕES:
${ligTxt.length ? ligTxt.join('\n') : '(nenhuma ligação atendida)'}${ligCurtas ? `\n(+ ${ligCurtas} ligação(ões) não atendida(s), < 1min)` : ''}

CONVERSA NO WHATSAPP:
${linhas.length ? linhas.join('\n') : '(sem mensagens)'}

Gere o resumo em JSON.`
}

// Gera e SALVA o resumo. Retorna o objeto do resumo (ou null se não deu).
export async function gerarResumo(sb: any, org: string, lead: LeadInfo, dossie?: Dossie): Promise<any | null> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  const d = dossie || await dossieLead(sb, org, lead)
  // nada pra resumir
  if (!d.mensagens.length && !d.ligacoes.length && !d.andamentos.some(a => (a.observacao || '').trim())) return null

  const client = new Anthropic({ apiKey: key })
  const resp = await client.messages.create({ model: MODELO, max_tokens: 1024, system: SYSTEM, messages: [{ role: 'user', content: montarContexto(lead, d) }] })
  const raw = (resp.content || []).map((b: any) => b.type === 'text' ? b.text : '').join('').trim()
  let out: any = null
  try { out = JSON.parse(raw) } catch { const a = raw.indexOf('{'), z = raw.lastIndexOf('}'); if (a >= 0 && z > a) { try { out = JSON.parse(raw.slice(a, z + 1)) } catch {} } }
  if (!out) return null
  if (typeof out.resumo === 'string') out.resumo = out.resumo.split(/\n|•|·/).map((x: string) => x.trim()).filter(Boolean)

  await sb.from('leads').update({ resumo_ia: out, resumo_ia_em: new Date().toISOString() }).eq('org_id', org).eq('id', lead.id)
  return out
}
