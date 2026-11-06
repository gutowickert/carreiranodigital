// Maia: o atendimento dos CLIENTES do negócio (03/11). Ela responde como a assistente virtual do negócio,
// leva a conversa até a venda e mexe no funil sozinha (etapa, ganho com valor, perdido com motivo, retomada).
// O canal de verdade (o WhatsApp do próprio negócio) só abre com o Tech Provider. Até lá roda na simulação
// (painel e testes), e o cérebro já fica pronto e testado.
import { maiaDb as db } from './db'
import { comFerramentas, JEITO, type Ferramenta } from './ia'
import { conversa, mandaTexto, conversaDoDono, avisaEquipe } from './canal'
import { novoLead, clienteRespondeu, mudaEtapa, ganhou, perdeu, agendaFollowup, type Etapa } from './funil'

// uma mensagem de cliente que chegou no WhatsApp do negócio. referral = o anúncio de onde veio (CTWA), quando vier
export async function recebeDoCliente(neg: any, d: { telefone: string; nome?: string | null; texto: string; wamid?: string | null; referral?: { source_id?: string; headline?: string } | null }) {
  if (d.wamid && (await db.um('msgs', { wamid: d.wamid }))) return null
  let lead = await novoLead(neg.id, { telefone: d.telefone, nome: d.nome, origem: d.referral?.source_id ? 'anuncio' : 'organico', anuncio_ref: d.referral?.source_id || null })
  lead = await clienteRespondeu(lead)
  const cv = await conversa(neg.id, 'cliente', d.telefone, { nome: d.nome, lead_id: lead.id })
  if (!cv.lead_id) await db.atualiza('conversas', { id: cv.id }, { lead_id: lead.id })
  await db.insere('msgs', { conversa_id: cv.id, negocio_id: neg.id, autor: 'cliente', texto: d.texto, wamid: d.wamid || null, status: 'recebido' }).catch(() => null)
  await db.atualiza('conversas', { id: cv.id }, { ultima_msg: d.texto.slice(0, 200), ultima_msg_em: new Date().toISOString(), janela_ate: new Date(Date.now() + 24 * 3600e3).toISOString(), nao_lidas: (cv.nao_lidas || 0) + 1 })
  return { cv: { ...cv, lead_id: lead.id } as any, lead, responder: cv.modo === 'ia' }
}

function ferramentas(neg: any, cv: any, lead: any, ctx: { humano: boolean }): Ferramenta[] {
  return [
    { name: 'mudar_etapa', description: 'Atualiza a etapa do cliente no funil: conversando (tirando dúvida), interessado (quer, falta decidir), proposta (recebeu preço/orçamento/horário).',
      input_schema: { type: 'object', properties: { etapa: { type: 'string', enum: ['conversando', 'interessado', 'proposta'] }, produto: { type: 'string' }, valor: { type: 'number' }, resumo: { type: 'string' } }, required: ['etapa'] },
      roda: async (q) => { lead = await mudaEtapa(lead, q.etapa as Etapa, 'maia', q); return { ok: true } } },
    { name: 'venda_fechada', description: 'O cliente fechou: agendou e confirmou, pagou ou fez o pedido. Marca GANHO com o valor.',
      input_schema: { type: 'object', properties: { valor: { type: 'number' }, produto: { type: 'string' } }, required: ['produto'] },
      roda: async (q) => { lead = await ganhou(lead, q.valor, q.produto, 'maia'); const dcv = await conversaDoDono(neg); await mandaTexto(dcv, `Venda nova 💰 ${lead.nome || 'Cliente'}: ${q.produto}${q.valor ? ', R$ ' + q.valor : ''}.`); return { ok: true } } },
    { name: 'venda_perdida', description: 'O cliente disse claramente que não vai comprar. Marca PERDIDO com o motivo (preço, comprou em outro lugar, não precisa mais, sem orçamento, fora da região).',
      input_schema: { type: 'object', properties: { motivo: { type: 'string' } }, required: ['motivo'] },
      roda: async (q) => { lead = await perdeu(lead, q.motivo, 'maia'); return { ok: true } } },
    { name: 'retomar_depois', description: 'O cliente pediu pra falar depois ("vou ver e te aviso", "semana que vem"). Agenda a retomada.',
      input_schema: { type: 'object', properties: { em_dias: { type: 'number' }, motivo: { type: 'string' } }, required: ['em_dias'] },
      roda: async (q) => { lead = await agendaFollowup(lead, new Date(Date.now() + q.em_dias * 86400e3).toISOString(), q.motivo); return { ok: true } } },
    { name: 'perguntar_ao_dono', description: 'Tu não sabe uma informação (preço que não está no que tu sabe, se tem tal produto, horário vago). Pergunta pro dono pelo WhatsApp dele; tu continua atendendo o cliente e repassa a resposta quando ele responder.',
      input_schema: { type: 'object', properties: { pergunta: { type: 'string', description: 'a dúvida do cliente, curta' } }, required: ['pergunta'] },
      roda: async ({ pergunta }) => { const dcv = await conversaDoDono(neg); await mandaTexto(dcv, `${lead.nome || 'Um cliente'} perguntou: ${pergunta}. Me responde aqui que eu passo pra ele.`); await db.insere('lead_eventos', { negocio_id: neg.id, lead_id: lead.id, tipo: 'pergunta_cliente', autor: 'maia', detalhe: { pergunta } }); return { ok: true } } },
    { name: 'passar_para_o_dono', description: 'Passa a CONVERSA pro dono (tu para de responder esse cliente): só quando o cliente pede pra falar com uma pessoa, reclama, ou é um caso delicado.',
      input_schema: { type: 'object', properties: { motivo: { type: 'string' } }, required: ['motivo'] },
      roda: async ({ motivo }) => { ctx.humano = true; await db.atualiza('conversas', { id: cv.id }, { modo: 'humano' }); const dcv = await conversaDoDono(neg); await mandaTexto(dcv, `${lead.nome || 'Um cliente'} (${lead.telefone || ''}) precisa de ti: ${motivo}`); return { ok: true } } },
  ]
}

const regras = (neg: any) => `${JEITO}

AGORA: tu és a ASSISTENTE VIRTUAL do negócio "${neg.nome}" (${neg.nicho || ''}, ${neg.cidade || ''}) e estás atendendo um CLIENTE dele no WhatsApp. Tu falas em nome do negócio.
O QUE TU SABE DO NEGÓCIO (só isso, não inventa nada além): ${JSON.stringify(neg.contexto || {})}
COMO ATENDER:
- Se apresenta na primeira mensagem como a assistente virtual do ${neg.nome}. Se perguntarem, diz que é uma IA.
- Responde rápido e direto o que perguntaram. Depois, UMA pergunta que leva pra venda (horário, quantidade, endereço de entrega).
- Preço, prazo, horário e condição: só o que está no que tu sabe. O que não está: "vou confirmar aqui e já te respondo" e perguntar_ao_dono. Tu SEGUE atendendo (passar_para_o_dono é só quando o cliente quer falar com uma pessoa ou reclama).
- O FUNIL, sempre que a conversa andar:
  · tirando dúvida → mudar_etapa conversando; quer, falta decidir → interessado; recebeu preço, orçamento ou marcou horário/visita → proposta (com o valor, se tiver).
  · venda_fechada SÓ quando a venda aconteceu de verdade: pagou, confirmou o pedido com pagamento, ou é serviço agendado E pago. "Vou passar aí comprar" ou "quero agendar" é proposta: quem confirma a venda depois é o dono.
  · o cliente disse que NÃO quer ("tá caro, não quero", "comprei em outro lugar", "não preciso mais") → venda_perdida com o motivo, e responde com educação deixando a porta aberta.
  · "vou pensar", "te aviso", "semana que vem" → retomar_depois.
- SEMPRE escreve a resposta pro cliente, mesmo quando usa ferramenta.
- Nunca insiste depois de um não. Nunca promete o que o negócio não disse que faz.
- Nunca diz que passou a conversa pra alguém ou que alguém vai entrar em contato sem chamar passar_para_o_dono NESSA MESMA resposta. Reclamação, cliente irritado ou pedido de dinheiro de volta: chama passar_para_o_dono na primeira mensagem.
- Não supõe o gênero do cliente ("chateado/chateada"): usa palavras neutras se não souber.
FORMATO: uma ou duas mensagens, cada uma entre <msg> e </msg>.`

// texto que é relatório pra equipe e não mensagem pro cliente (fala do cliente na 3ª pessoa, de etapa, de ferramenta)
const RELATORIO = /\b([Rr]espondi|[Aa]visei|[Mm]andei|[Pp]erguntei|[Dd]isse|[Ee]xpliquei)( pr[ao]| a| o| à)? [A-ZÁÉÍÓÚ][a-zà-ú]+\b|\b[Dd]eixei a conversa\b|\betapa\s*["“']|\b(a|o) cliente\b|\b([Ee]la|[Ee]le) (perguntou|pediu|quer saber)\b|perguntar_ao_dono|mudar_etapa/

export async function respondeCliente(conversa_id: string) {
  const cv = await db.um('conversas', { id: conversa_id })
  if (!cv || cv.canal !== 'cliente' || cv.modo !== 'ia') return null
  const neg = await db.um('negocios', { id: cv.negocio_id })
  let lead = cv.lead_id ? await db.um('leads', { id: cv.lead_id }) : null
  if (!neg || !lead) return null
  const msgs = await db.lista('msgs', { conversa_id }, { ordem: 'criado_em' })
  const hist = msgs.slice(-30).map(x => `${x.autor === 'cliente' ? 'CLIENTE' : x.autor === 'dono' || x.autor === 'equipe' ? 'DONO' : 'TU'}: ${x.texto}`).join('\n')
  const ctx = { humano: false }
  const r = await comFerramentas(regras(neg), `CLIENTE: ${lead.nome || cv.nome || 'sem nome'} · etapa ${lead.etapa}${lead.anuncio_ref ? ' · veio do anúncio ' + lead.anuncio_ref : ''}\n\nCONVERSA:\n${hist}\n\nResponde a(s) última(s) mensagem(ns) do cliente.`, ferramentas(neg, cv, lead, ctx), 6,
    // 06/11: o atendimento do cliente roda no modelo menor (custo-benefício; testado em conversas fáceis e difíceis). MAIA_MODELO_CLIENTE troca
    { modelo: process.env.MAIA_MODELO_CLIENTE || 'claude-haiku-5-5', uso: { tipo: 'cliente', negocio_id: neg.id, conversa_id: cv.id } })
  // 06/11: no teste, depois de usar as ferramentas a IA às vezes escreveu um RELATÓRIO ("Pronto, respondi a Carla e deixei na etapa...")
  // em vez da mensagem pro cliente. Isso nunca sai: só vale o que vem entre <msg>, e relatório é barrado.
  // Se não vier mensagem boa, pede de novo uma vez (sem ferramentas); se ainda falhar, não manda nada e chama a equipe.
  const boas = (t: string) => [...t.matchAll(/<msg>([\s\S]*?)<\/msg>/g)].map(x => x[1].trim()).filter(m => m && !RELATORIO.test(m))
  let partes = boas(r.texto)
  if (!partes.length) {
    const r2 = await comFerramentas(regras(neg), `CONVERSA:\n${hist}\n\nTua resposta anterior não foi uma mensagem pro cliente. Ela vai DIRETO pro WhatsApp do cliente: escreve só o que tu dirias pra ele, em 1 ou 2 mensagens, cada uma entre <msg> e </msg>. Não conta o que tu fez nem fala do sistema.`, [], 1,
      { modelo: process.env.MAIA_MODELO_CLIENTE || 'claude-haiku-5-5', uso: { tipo: 'cliente', negocio_id: neg.id, conversa_id: cv.id } })
    partes = boas(r2.texto)
  }
  const enviadas = partes.slice(0, 2)
  if (!enviadas.length) {
    await avisaEquipe('Maia sem resposta pro cliente', `A IA não conseguiu escrever uma mensagem pro cliente ${lead.nome || cv.telefone} no ${neg.nome}. Ninguém respondeu ainda: olha a conversa no painel.`, neg.id, true)
    return { mensagens: [], ferramentas: r.usadas.map(u => u.nome), etapa: lead?.etapa, sem_resposta: true }
  }
  for (const t of enviadas) await mandaTexto(cv, t)
  // a bola ficou com o cliente: se ele sumir, a retomada já está marcada
  lead = await db.um('leads', { id: lead.id })
  if (!ctx.humano && lead && !['ganho', 'perdido'].includes(lead.etapa) && !lead.proximo_followup_em) await agendaFollowup(lead)
  await db.atualiza('conversas', { id: cv.id }, { ia_respostas: (cv.ia_respostas || 0) + 1, nao_lidas: 0 })
  return { mensagens: enviadas, ferramentas: r.usadas.map(u => u.nome), etapa: lead?.etapa }
}

// a retomada de quem parou de responder: escrita pela IA, curta, sem pressão. Sem canal do negócio, vira lembrete pro dono.
export async function textoRetomada(neg: any, lead: any, numero: number) {
  const cv = await db.um('conversas', { negocio_id: neg.id, canal: 'cliente', telefone: lead.telefone || '' })
  const msgs = cv ? (await db.lista('msgs', { conversa_id: cv.id }, { ordem: 'criado_em' })).filter(m => m.texto).slice(-12) : []
  const { emJson } = await import('./ia')
  const r = await emJson<{ texto: string }>(`${JEITO}\nTu és a assistente virtual do ${neg.nome}. Escreve UMA mensagem curta de retomada pra um cliente que parou de responder. Sem pressão, útil, com uma pergunta fácil de responder. Retomada número ${numero} de 3 (a 3ª é a despedida: deixa a porta aberta).`,
    `Cliente: ${lead.nome || ''} · interesse: ${lead.produto || lead.resumo || '?'} · etapa: ${lead.etapa}\nO que o negócio oferece: ${JSON.stringify(neg.contexto || {})}\nÚltimas mensagens: ${msgs.map(m => m.texto).join(' | ').slice(0, 1500)}\nDevolve {"texto":"..."}`)
  return r.texto
}
