import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { enviarTexto, enviarMidiaLink, foneOficial } from '@/lib/whatsapp-oficial'
import { CONTEXTO_NEGOCIO } from '@/lib/contexto-negocio'
import { enviarPush } from '@/lib/push'
import { logIaUso } from '@/lib/ia-uso'
import { eventoMensagens } from '@/lib/ctwa'

// IA DO DEU VENDA — atende quem chega pelo ANÚNCIO DE WHATSAPP (Guto, 05/10/2026).
//
// O combinado: a IA atende sozinha, FILTRA e EXPLICA, oferece uma conversa com o especialista e, quando
// o lead está quente (ou quando ela não sabe), PASSA PRO TIME com aviso no celular e tarefa de ligação.
// Ela NÃO marca horário: quem agenda é o comercial ("a nossa agenda ainda não está madura pra isso").
//
// Só age em lead do Deu Venda com atendido_por='ia' e sem handoff — que é exatamente o lead que nasce
// pelo anúncio (lib/ctwa.ts). Os outros leads do Deu Venda continuam 100% com o time.

const MODELO = process.env.IA_DEU_VENDA_MODELO || 'claude-sonnet-4-6'
const ESPERA_MS = 25_000   // o lead costuma mandar 2 ou 3 mensagens seguidas: responde o conjunto
// O vídeo do site (Panda) comprimido pra caber no WhatsApp (até 16 MB): public/midia/deu-venda-2min.mp4
const VIDEO_URL = 'https://carreiranodigital.vercel.app/midia/deu-venda-2min.mp4'
const VIDEO_LEGENDA = 'O Deu Venda em menos de 2 minutos'

export function roteiroDeuVenda(nome: string | null, cidade: string) {
  return `Tu é a pessoa que atende o WhatsApp da escola Carreira no Digital, conversando com alguém que chegou agora por um ANÚNCIO DO DEU VENDA (${cidade}). Escreve como gente: mensagens curtas, uma ideia por vez, tratando por "tu", sem emoji, sem travessão, sem gíria. Começa com "Oi" ou "Olá"${nome ? ` e pode usar o primeiro nome (${nome.split(' ')[0]})` : ''}.

# O QUE É O DEU VENDA (use só isto; nunca invente)
${CONTEXTO_NEGOCIO.slice(CONTEXTO_NEGOCIO.indexOf('## DEU VENDA'), CONTEXTO_NEGOCIO.indexOf('## ESTEIRA'))}
Novidade que pode citar: a máquina também EDITA OS VÍDEOS que o dono grava no celular: corta as pausas, põe legenda e a marca dele.
VÍDEO: tens um vídeo de 1min47 que explica o Deu Venda do começo ao fim. Ele vai como vídeo dentro da conversa (a pessoa não sai do WhatsApp): pra mandar, marca mandar_video = true e a tua resposta vai logo antes dele (ex.: "Te mando um vídeo curtinho que mostra como funciona"). Manda UMA vez só, na hora de explicar, e nunca sozinho: a resposta que vai antes explica em uma ou duas frases, ligadas ao negócio da pessoa. Se na conversa já aparece "Escola: [video" ele já foi: não manda de novo.

# PREÇO (os únicos valores que existem; nunca invente outro, nem desconto, nem condição)
R$ 2.797 à vista ou 10x de R$ 299,70 no cartão (total R$ 2.997), com os três meses de acompanhamento inclusos nos dois. Fica FORA do preço: a verba de anúncio (é da pessoa, paga direto na Meta) e o CRM.
- Tu só passa o preço DEPOIS de ter explicado o produto (a explicação do passo 3 já aparece em mensagem da Escola, ou o vídeo já foi).
- Se perguntarem o preço ANTES de tu explicar: explica primeiro em poucas linhas, ligando ao negócio dela, manda o vídeo e diz que já passa o valor. O valor vai na tua próxima resposta.
- Se perguntarem DEPOIS de explicado: passa os dois valores, diz o que fica fora e, na mesma mensagem, oferece a conversa com o especialista.
- Nunca puxa o preço por conta própria: só quando perguntam.

# TEU TRABALHO, NESTA ORDEM
1. ENTENDER: o que a pessoa vende e em que cidade está. Uma pergunta por mensagem.
2. FILTRAR (sem parecer interrogatório, encaixando na conversa): já anuncia ou já tentou anunciar? Qual o valor médio de uma venda dela? Consegue reservar dois turnos no começo, em dias diferentes, e vir até Lajeado ou Porto Alegre? Tem verba pra anúncio (a verba é dela, paga direto na Meta)?
3. EXPLICAR o Deu Venda de forma simples, ligando ao negócio dela: a estratégia decidida com um especialista, a máquina de IA que faz as peças e edita os vídeos, a campanha no ar no mesmo dia e três meses de acompanhamento. É aqui que vai o vídeo.
4. OFERECER uma conversa com o especialista: "posso pedir pro nosso especialista te chamar pra entender o teu negócio?". Tu NÃO marca dia nem hora: quem combina o horário é o time.

# QUANDO PASSAR PRO TIME (acao = "passar_pro_time")
- A pessoa aceitou falar com o especialista, pediu ligação, ou demonstrou interesse claro (quer saber como começa, quando pode fazer).
- Tu acabou de passar o preço (já explicado o produto): passa pro time como quente, porque quem pergunta preço depois de entender está interessado.
- Pediu desconto, outra condição de pagamento, ou qualquer coisa que tu não sabe com certeza, reclamação, ou pedido pra falar com uma pessoa.
Ao passar: avisa com naturalidade que alguém do time vai chamar em breve pra combinar o melhor horário. Não promete quando o time vai chamar, mesmo que a pessoa peça um horário: diz que repassa o pedido.

# QUANDO NÃO SERVE (acao = "nao_serve")
Quem ainda não sabe o que vende ou por quanto, quem não tem nenhuma verba pra anúncio agora, quem quer alguém que faça tudo sem participar, ou quem só quer APRENDER a anunciar (aí o caminho é o curso de Anúncios para Negócios Locais, em turma). Responde com respeito, sem empurrar, e indica o caminho certo.

# REGRAS DURAS
- Preço só do jeito da seção PREÇO. Nunca cite desconto, garantia de resultado, número de clientes ou prazo pra dar resultado.
- Nunca diga que é curso ou turma: o Deu Venda é individual, um a um.
- Nunca use depoimento dos cursos como prova do Deu Venda.
- Nunca marque horário.
- Se a pessoa mandou áudio, tu recebe o texto dele entre colchetes; responde normalmente.
- Mensagem curta: no máximo 3 frases.`
}

const FERRAMENTA: Anthropic.Tool = {
  name: 'responder', description: 'A próxima mensagem pro lead e o que fazer com o atendimento.',
  input_schema: {
    type: 'object',
    properties: {
      resposta: { type: 'string', description: 'A mensagem que vai pro lead no WhatsApp. Vazia só se não houver o que responder.' },
      acao: { type: 'string', enum: ['continuar', 'passar_pro_time', 'nao_serve'] },
      temperatura: { type: 'string', enum: ['frio', 'morno', 'quente'] },
      mandar_video: { type: 'boolean', description: 'true pra mandar o vídeo de 1min47 logo depois da resposta. Uma vez só por conversa.' },
      negocio: { type: 'string', description: 'o que a pessoa vende, se já disse' },
      cidade: { type: 'string', description: 'cidade, se já disse' },
      ja_anuncia: { type: 'string', description: 'sim / não / já tentou / não disse' },
      ticket: { type: 'string', description: 'valor médio da venda, se disse' },
      resumo_pro_time: { type: 'string', description: 'Duas ou três linhas pro comercial: quem é, o que vende, o que quer, objeções. Obrigatório ao passar pro time.' },
    },
    required: ['resposta', 'acao', 'temperatura', 'resumo_pro_time'],
  },
}

/** A decisão em si (sem banco, sem WhatsApp) — separada pra dar pra testar com conversas de exemplo. */
export async function decidirDeuVenda(key: string, o: { nome: string | null; cidade: string; conversa: string }) {
  const client = new Anthropic({ apiKey: key })
  const r = await client.messages.create({
    model: MODELO, max_tokens: 700, system: roteiroDeuVenda(o.nome, o.cidade),
    tools: [FERRAMENTA], tool_choice: { type: 'tool', name: 'responder' },
    messages: [{ role: 'user', content: `A conversa até agora (a última é a que acabou de chegar). "Lead:" é a pessoa; "Escola:" somos nós.\n\n${o.conversa}` }],
  })
  const bloco = r.content.find(c => c.type === 'tool_use')
  const d: any = bloco && bloco.type === 'tool_use' ? bloco.input : {}
  return { d, usage: r.usage }
}

async function killAtivo(org: string): Promise<boolean> {
  const { data } = await sb.from('webhook_logs').select('payload').eq('org_id', org).eq('origem', 'ia-automacao').order('recebido_em', { ascending: false }).limit(1).maybeSingle()
  return (data?.payload as any)?.ligado === false
}

/**
 * Chamado pelo webhook do WhatsApp oficial no after(), a cada mensagem do lead. Espera o lead terminar
 * de escrever; só age se aquela ainda for a última mensagem e ninguém do time tiver respondido.
 */
export async function atenderDeuVenda(org: string, conversaId: string, msgId: string) {
  await new Promise(r => setTimeout(r, ESPERA_MS))
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return
  if (await killAtivo(org)) return

  const { data: conv } = await sb.from('wa_conversas').select('id, lead_id, telefone, nome').eq('id', conversaId).maybeSingle()
  if (!conv?.lead_id) return
  const { data: lead } = await sb.from('leads').select('id, nome, whatsapp, etapa, codigo_turma, atendido_por, handoff_em, ctwa_clid, vendedor_id').eq('id', conv.lead_id).maybeSingle()
  if (!lead || lead.atendido_por !== 'ia' || lead.handoff_em || !(lead.codigo_turma || '').startsWith('deuvenda')) return

  const { data: msgs } = await sb.from('wa_mensagens').select('id, direcao, tipo, texto, criado_em').eq('conversa_id', conversaId).order('criado_em', { ascending: false }).limit(30)
  const lista = (msgs || []).reverse()
  const ultima = lista[lista.length - 1]
  if (!ultima || ultima.id !== msgId || ultima.direcao !== 'recebida') return   // chegou outra depois, ou alguém já respondeu

  const conversa = lista.map(m => {
    const quem = m.direcao === 'recebida' ? 'Lead' : 'Escola'
    const t = m.tipo === 'texto' ? (m.texto || '') : m.tipo === 'audio' ? `[áudio${m.texto ? ': ' + m.texto : ' sem transcrição'}]` : `[${m.tipo}${m.texto ? ': ' + m.texto : ''}]`
    return `${quem}: ${t}`
  }).join('\n')
  const cidade = lead.codigo_turma === 'deuvendaportoalegre' ? 'Porto Alegre' : 'Lajeado'

  let d: any = {}
  try {
    const r = await decidirDeuVenda(key, { nome: lead.nome && lead.nome !== 'Lead WhatsApp' ? lead.nome : null, cidade, conversa })
    d = r.d
    await logIaUso('ia-deu-venda', MODELO, r.usage, { lead_id: lead.id })
  } catch (e: any) {
    await sb.from('webhook_logs').insert({ org_id: org, origem: 'ia-deu-venda', evento: 'erro', status: 'erro', payload: { lead_id: lead.id, erro: e?.message || String(e) } })
    return
  }

  const to = foneOficial(lead.whatsapp || conv.telefone || '')
  const resposta = String(d.resposta || '').replace(/\s*[—–]\s*/g, ', ').trim()
  if (resposta && to) {
    const env = await enviarTexto(to, resposta)
    if (env.ok) {
      await sb.from('wa_mensagens').insert({ org_id: org, conversa_id: conversaId, zapi_id: env.wamid || null, direcao: 'enviada', tipo: 'texto', texto: resposta, status: 'enviada', canal: 'oficial', enviado_por: 'IA Deu Venda' })
      await sb.from('wa_conversas').update({ ultima_msg: resposta.slice(0, 200), ultima_msg_em: new Date().toISOString() }).eq('id', conversaId)
    }
  }
  // o vídeo vai uma vez só por conversa, mesmo que a IA peça de novo
  const videoJaFoi = lista.some(m => m.direcao === 'enviada' && m.tipo === 'video')
  if (d.mandar_video && !videoJaFoi && to) {
    const v = await enviarMidiaLink(to, 'video', VIDEO_URL, VIDEO_LEGENDA)
    if (v.ok) await sb.from('wa_mensagens').insert({ org_id: org, conversa_id: conversaId, zapi_id: v.wamid || null, direcao: 'enviada', tipo: 'video', texto: VIDEO_LEGENDA, midia_url: VIDEO_URL, midia_mime: 'video/mp4', status: 'enviada', canal: 'oficial', enviado_por: 'IA Deu Venda' })
    else await sb.from('webhook_logs').insert({ org_id: org, origem: 'ia-deu-venda', evento: 'video', status: 'erro', payload: { lead_id: lead.id, erro: v.error } })
  }

  const qualif = [d.negocio && `vende: ${d.negocio}`, d.cidade && `cidade: ${d.cidade}`, d.ja_anuncia && `anuncia: ${d.ja_anuncia}`, d.ticket && `ticket: ${d.ticket}`].filter(Boolean).join(' · ')
  await sb.from('webhook_logs').insert({ org_id: org, origem: 'ia-deu-venda', evento: d.acao || 'continuar', status: 'processado', payload: { lead_id: lead.id, acao: d.acao, temperatura: d.temperatura, resposta, qualif } })

  if (d.acao === 'passar_pro_time') {
    const agora = new Date().toISOString()
    const motivo = `IA do Deu Venda: lead ${d.temperatura || 'quente'}. ${d.resumo_pro_time || ''}`.slice(0, 400)
    await sb.from('leads').update({ atendido_por: 'humano', handoff_em: agora, handoff_motivo: motivo, resumo_ia: d.resumo_pro_time || null, atualizado_em: agora }).eq('id', lead.id)
    await sb.from('lead_andamentos').insert({ lead_id: lead.id, tipo: 'ia_handoff', observacao: `🔥 IA do Deu Venda passou pro time (${d.temperatura || 'quente'}). ${qualif}\n${d.resumo_pro_time || ''}`.slice(0, 900) })
    // a tarefa vence AGORA: lead quente esfria rápido
    await sb.from('tarefas_lead').insert({ org_id: org, lead_id: lead.id, tipo: 'ligar_agendado', titulo: `Deu Venda: ligar e marcar a conversa com o especialista — ${lead.nome || 'lead'}`, descricao: `${d.resumo_pro_time || ''}\n${qualif}`.trim(), data_vencimento: agora })
    await enviarPush('Deu Venda: lead quente 🔥', `${lead.nome || 'Lead'} quer falar com o especialista. ${d.negocio ? '(' + d.negocio + ')' : ''}`.slice(0, 120), '/dashboard/whatsapp')
    await eventoMensagens('QualifiedLead', { leadId: lead.id, ctwaClid: lead.ctwa_clid, telefone: lead.whatsapp, codigoTurma: lead.codigo_turma })
  } else if (d.acao === 'nao_serve') {
    await sb.from('leads').update({ atendido_por: 'humano', atualizado_em: new Date().toISOString() }).eq('id', lead.id)
    await sb.from('lead_andamentos').insert({ lead_id: lead.id, tipo: 'observacao', observacao: `🤖 IA do Deu Venda: não é o perfil agora. ${qualif}\n${d.resumo_pro_time || ''}`.slice(0, 900) })
  } else {
    await sb.from('lead_andamentos').insert({ lead_id: lead.id, tipo: 'ia_followup', observacao: `🤖 IA do Deu Venda respondeu (${d.temperatura || '?'}): ${resposta.slice(0, 140)}` })
  }
}
