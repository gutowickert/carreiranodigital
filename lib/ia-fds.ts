import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { logIaUso } from '@/lib/ia-uso'

// A IA DO FIM DE SEMANA (decisão do Nando, 28/09/2026).
//
// Com o Mateus indo pro Deu Venda, o Rick ficou sozinho no comercial, e quem escreve no fim de semana
// esperava até segunda. Esta IA entra SÓ na janela de sexta 17h até segunda 5h e tem UM trabalho:
// marcar a ligação de segunda. Ela não vende, não fala preço, não manda link, não "desenrola" — o
// consultor faz isso na ligação.
//
// ⚠️ É UMA IA SEPARADA da IA de vendas (lib/atendimento-ia, lib/atender-lead). Roteiro curto e uma
// lista FECHADA de ações (ferramenta `decidir`): se não está na lista, ela não tem como fazer.
//
// MODOS (configuracoes 'ia.fds', JSON):
//   sombra    → escreve o que responderia e qual ligação marcaria, NÃO envia e NÃO cria tarefa.
//               Tudo fica em webhook_logs (origem 'ia-fds') e a tela /dashboard/ia-fds mostra.
//   desligado → não faz nada.
//   ligado    → AINDA NÃO EXISTE: só depois de o Nando revisar os fins de semana em sombra.
//
// Quem chama: o webhook do WhatsApp oficial, no after(), a cada mensagem de lead.

const TZ = 'America/Sao_Paulo'
const RICK = '73c588d5-da34-45f3-921c-e65ff7000684'
const MODELO = process.env.IA_FDS_MODELO || 'claude-sonnet-5'
const ESPERA_MS = 45_000   // lead costuma mandar 2 ou 3 mensagens seguidas: responde o conjunto

export type ConfigFds = { modo: 'sombra' | 'desligado' | 'ligado'; horarios: string[]; limite: number }
const PADRAO: ConfigFds = { modo: 'sombra', horarios: ['09:00', '10:30', '14:00', '16:00'], limite: 3 }

export async function configFds(): Promise<ConfigFds> {
  const { data } = await sb.from('configuracoes').select('valor').eq('chave', 'ia.fds').maybeSingle()
  try { return { ...PADRAO, ...(data?.valor ? JSON.parse(data.valor) : {}) } } catch { return PADRAO }
}

// hora de São Paulo: dia da semana (0=dom) e minutos desde 0h
function agoraSP(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(d).map(x => [x.type, x.value]))
  const dia = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday)
  return { dia, min: (Number(p.hour) % 24) * 60 + Number(p.minute), data: `${p.year}-${p.month}-${p.day}` }
}

/** A janela: sexta 17h → segunda 5h (hora de São Paulo). */
export function naJanela(d = new Date()) {
  const { dia, min } = agoraSP(d)
  return (dia === 5 && min >= 17 * 60) || dia === 6 || dia === 0 || (dia === 1 && min < 5 * 60)
}

/** A segunda-feira que fecha esta janela (AAAA-MM-DD). */
export function segundaDaJanela(d = new Date()) {
  const { dia, data } = agoraSP(d)
  const soma = ({ 5: 3, 6: 2, 0: 1, 1: 0 } as Record<number, number>)[dia] ?? 0
  return new Date(new Date(data + 'T12:00:00Z').getTime() + soma * 864e5).toISOString().slice(0, 10)
}

const dataBR = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/')

// Vagas: por horário, quantas ligações o consultor já tem naquela segunda (tarefas reais + o que a
// própria IA já "marcou" em sombra, pra simular a lotação de verdade).
async function vagas(cfg: ConfigFds, segunda: string, quem: string) {
  const ini = `${segunda}T00:00:00-03:00`, fim = `${segunda}T23:59:59-03:00`
  const [{ data: tarefas }, { data: sombras }] = await Promise.all([
    sb.from('tarefas_lead').select('data_vencimento').eq('vendedor_id', quem).eq('tipo', 'ligar_agendado')
      .eq('concluida', false).eq('cancelada', false).gte('data_vencimento', ini).lte('data_vencimento', fim),
    sb.from('webhook_logs').select('payload').eq('origem', 'ia-fds').gte('recebido_em', new Date(Date.now() - 4 * 864e5).toISOString()),
  ])
  const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
  const ocupado: Record<string, number> = {}
  for (const t of tarefas || []) { const h = hhmm(t.data_vencimento); ocupado[h] = (ocupado[h] || 0) + 1 }
  for (const s of sombras || []) { const p: any = s.payload; if (p?.acao === 'marcar' && p.segunda === segunda && p.quem_liga === quem && p.horario) ocupado[p.horario] = (ocupado[p.horario] || 0) + 1 }
  return cfg.horarios.filter(h => (ocupado[h] || 0) < cfg.limite)
}

const FERRAMENTA: Anthropic.Tool = {
  name: 'decidir',
  description: 'O que fazer com a conversa. Sempre chame esta ferramenta, uma vez.',
  input_schema: {
    type: 'object',
    properties: {
      acao: { type: 'string', enum: ['oferecer', 'marcar', 'whatsapp', 'ajuda', 'lembrar', 'nada'],
        description: 'oferecer = mandar os horários; marcar = o lead escolheu um horário da lista; whatsapp = prefere seguir por mensagem ou quer outro dia; ajuda = assunto que não é marcar ligação (reclamação, aluno, pagamento, cancelamento); lembrar = já tem ligação marcada; nada = não precisa responder (ex.: "ok", "obrigado" depois de marcado)' },
      horario: { type: 'string', description: 'Só quando acao=marcar: o horário escolhido, exatamente como na lista (HH:MM).' },
      resposta: { type: 'string', description: 'A mensagem de WhatsApp que seria enviada. Vazia quando acao=nada.' },
      motivo: { type: 'string', description: 'Uma frase curta explicando a decisão, pro time revisar.' },
    },
    required: ['acao', 'resposta', 'motivo'],
  },
}

// SEM EMOJI (decisão do Nando, 28/09/2026: o público é empreendedor acima de 45 anos). O roteiro já
// proíbe; isto é a trava pro caso de escapar um.
const semEmoji = (s: string) => s.replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu, '').replace(/[ \t]{2,}/g, ' ').replace(/ +([.,!?])/g, '$1').trim()

// "09:00" → "9h", "10:30" → "10h30": é assim que se fala no WhatsApp
const falado = (h: string) => { const [a, b] = h.split(':'); return `${Number(a)}h${b === '00' ? '' : b}` }

function roteiro(o: { nome: string; consultor: string; segunda: string; livres: string[]; jaMarcada: string | null }) {
  return `Você responde o WhatsApp da Carreira no Digital (escola presencial de marketing digital, Lajeado e Porto Alegre/RS) no FIM DE SEMANA.

SEU ÚNICO OBJETIVO: marcar uma ligação na SEGUNDA-FEIRA (${dataBR(o.segunda)}) entre o lead e NOSSO ESPECIALISTA, que vai explicar tudo por telefone.
Chame SEMPRE de "nosso especialista" e NUNCA diga o nome dele — é mais profissional.
Horários livres na segunda (código → como escrever pro lead): ${o.livres.length ? o.livres.map(h => `${h} → ${falado(h)}`).join(', ') : 'NENHUM (todos lotados)'}.
${o.jaMarcada ? `Este lead JÁ TEM ligação marcada: ${o.jaMarcada}.` : ''}

COMO FALAR:
- Quem escreve é, na maioria, EMPREENDEDOR ACIMA DE 45 ANOS. Tom cordial, claro e respeitoso — de uma empresa séria, não de rede social. Trate por "tu".
- NENHUM EMOJI. Nenhum. Nem carinha, nem símbolo, nem figura.
- Nada de gíria ou jeito de jovem: nada de "show", "top", "blz", "tudinho", "oii", "certinho" repetido, reticências ou exclamação em excesso.
- Mensagens curtas (no máximo 3 linhas).
- Cumprimente só com "Oi" ou "Olá" — nunca "bom dia", "boa tarde" ou "boa noite" (você não sabe a hora em que a pessoa vai ler).
- Chame pelo primeiro nome se souber: ${o.nome || '(nome desconhecido — não invente)'}.
- Se apresente como "aqui é da Carreira no Digital". Não diga que é IA nem que é robô, e não finja ser uma pessoa com nome.
- Escreva os horários do jeito falado (9h, 10h30, 14h, 16h), nunca "09:00". Quem tem os horários é o especialista: "nosso especialista tem 9h, 10h30…" — nunca "eu tenho" ou "eu consigo".
- Português correto do Sul: "contigo", nunca "com tu".

O QUE VOCÊ NÃO FAZ (nunca):
- Não fala preço, valor, desconto, parcelamento, datas ou horários de turma, conteúdo do curso, link de pagamento.
- Se perguntarem qualquer coisa disso: diga que na ligação nosso especialista explica tudo e tira as dúvidas, leva uns 10 minutinhos — e volte pros horários.
- Não inventa informação nenhuma. Não promete nada além da ligação.

DECISÕES:
- Lead escolheu um horário da lista → acao "marcar" (horario exatamente como na lista) e confirme: "segunda às HH:MM nosso especialista te liga nesse número".
- Lead pediu horário ou dia fora da lista → ofereça o mais próximo da lista; se insistir em outro dia, ou preferir seguir por mensagem → acao "whatsapp" e diga que segunda cedo alguém responde por aqui.
- Sem horário livre → acao "whatsapp": segunda cedo o time chama por aqui.
- Assunto que não é marcar ligação (já é aluno, reclamação, pagamento, cancelamento, problema) → acao "ajuda": diga com gentileza que segunda cedo o time retorna, sem tentar resolver.
- Já tem ligação marcada → acao "lembrar" e confirme o horário.
- Mensagem que não pede resposta ("ok", "obrigado", figurinha, emoji) depois de já estar tudo combinado → acao "nada".
- Primeira mensagem do fim de semana, ou pergunta sobre o curso → acao "oferecer" com os horários livres.`
}

/** A decisão em si (sem banco, sem WhatsApp) — separada pra dar pra testar com conversas de exemplo. */
export async function decidirFds(key: string, o: { nome: string; consultor: string; segunda: string; livres: string[]; jaMarcada: string | null; conversa: string }) {
  const client = new Anthropic({ apiKey: key })
  const r = await client.messages.create({
    model: MODELO, max_tokens: 600,
    system: roteiro(o),
    tools: [FERRAMENTA], tool_choice: { type: 'tool', name: 'decidir' },
    messages: [{ role: 'user', content: `A conversa até agora (a última é a que acabou de chegar):\n\n${o.conversa}` }],
  })
  const bloco = r.content.find(c => c.type === 'tool_use')
  const d: any = bloco && bloco.type === 'tool_use' ? bloco.input : {}
  return { d, usage: r.usage }
}

/**
 * Processa a mensagem que acabou de chegar. Chamada pelo webhook no after(): espera o lead terminar
 * de escrever e só age se aquela ainda for a última mensagem dele, sem ninguém do time ter respondido.
 */
export async function processarFds(conversaId: string, msgId: string) {
  if (!naJanela()) return
  const cfg = await configFds()
  if (cfg.modo === 'desligado') return

  await new Promise(r => setTimeout(r, ESPERA_MS))

  const { data: conv } = await sb.from('wa_conversas').select('id, lead_id, aluno_id, eh_grupo, nome, telefone').eq('id', conversaId).maybeSingle()
  if (!conv || conv.eh_grupo) return
  const { data: msgs } = await sb.from('wa_mensagens').select('id, direcao, tipo, texto, criado_em, enviado_por').eq('conversa_id', conversaId).order('criado_em', { ascending: false }).limit(20)
  const lista = (msgs || []).reverse()
  const ultima = lista[lista.length - 1]
  if (!ultima || ultima.id !== msgId) return          // chegou outra depois: aquela cuida
  if (ultima.direcao !== 'recebida') return            // alguém já respondeu

  const log = async (payload: any) => { await sb.from('webhook_logs').insert({ origem: 'ia-fds', evento: payload.acao, status: cfg.modo, payload }) }
  const base: any = { modo: cfg.modo, conversa_id: conv.id, msg_id: msgId, telefone: conv.telefone }

  // quem já é cliente não é lead pra ligação: aluno, Deu Venda, matriculado
  const { data: lead } = conv.lead_id
    ? await sb.from('leads').select('id, nome, etapa, vendedor_id, matricula_id').eq('id', conv.lead_id).maybeSingle()
    : { data: null as any }
  if (!lead) return
  base.lead_id = lead.id; base.lead_nome = lead.nome
  if (conv.aluno_id || lead.matricula_id || ['ganho', 'deu_venda'].includes(lead.etapa)) {
    await log({ ...base, acao: 'fora', motivo: `é cliente/aluno (etapa ${lead.etapa}) — não é pra marcar ligação de venda`, resposta: '' })
    return
  }

  const quem = lead.vendedor_id || RICK
  const { data: perfil } = await sb.from('usuarios_perfil').select('nome').eq('id', quem).maybeSingle()
  const consultor = (perfil?.nome || 'Rick').split(' ')[0].replace(/^Ricardo$/, 'Rick')
  const segunda = segundaDaJanela()
  const livres = await vagas(cfg, segunda, quem)
  const { data: marcada } = await sb.from('tarefas_lead').select('data_vencimento').eq('lead_id', lead.id).eq('tipo', 'ligar_agendado')
    .eq('concluida', false).eq('cancelada', false).gte('data_vencimento', new Date().toISOString()).order('data_vencimento').limit(1).maybeSingle()
  const jaMarcada = marcada ? new Date(marcada.data_vencimento).toLocaleString('pt-BR', { timeZone: TZ, weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null

  const conversa = lista.map(m => `${m.direcao === 'recebida' ? 'LEAD' : 'ESCOLA'}: ${m.texto?.trim() || `[${m.tipo}]`}`).join('\n')
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) { await log({ ...base, acao: 'erro', motivo: 'sem ANTHROPIC_API_KEY', resposta: '' }); return }

  try {
    const { d, usage } = await decidirFds(key, { nome: (lead.nome || conv.nome || '').split(' ')[0], consultor, segunda, livres, jaMarcada, conversa })
    await logIaUso('ia-fds', MODELO, usage, { lead_id: lead.id })
    let acao = String(d.acao || 'nada'), horario = d.horario ? String(d.horario).slice(0, 5) : null
    // horário que não está livre não se marca — vira oferta
    if (acao === 'marcar' && (!horario || !livres.includes(horario))) { acao = 'oferecer'; d.motivo = `${d.motivo || ''} (horário ${horario || '?'} não estava livre)`.trim() }
    await log({ ...base, acao, horario: acao === 'marcar' ? horario : null, segunda, quem_liga: quem, consultor, livres,
      resposta: semEmoji(String(d.resposta || '')), motivo: String(d.motivo || ''), entrada: lista.filter(m => m.direcao === 'recebida').slice(-3).map(m => m.texto || `[${m.tipo}]`) })
    // modo 'ligado' (enviar + criar a tarefa de ligação) só depois da revisão em sombra — de propósito não existe ainda
  } catch (e: any) {
    await log({ ...base, acao: 'erro', motivo: String(e?.message || e).slice(0, 300), resposta: '' })
  }
}

export const _teste = { agoraSP, naJanela, segundaDaJanela }
