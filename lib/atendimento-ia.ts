import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'
import { CONTEXTO_NEGOCIO } from '@/lib/contexto-negocio'

// Motor de resposta do atendimento: ANTES de sugerir, busca conversas REAIS onde a gente
// FECHOU (mesmo produto/situação) e responde no nosso tom, seguindo o fluxo que converte.
const MODELO = 'claude-sonnet-4-6'
const suf = (t: string) => (t || '').replace(/\D/g, '').slice(-8)
const familia = (cod: string) => { const c = (cod || '').toLowerCase(); return c.startsWith('fc') ? 'FC' : c.startsWith('anl') ? 'ANL' : c.startsWith('anlnovohamburgo') ? 'ANL' : '?' }
const produtoDaFamilia = (f: string) => f === 'FC' ? 'Formação Completa em Marketing Digital' : f === 'ANL' ? 'Anúncios para Negócios Locais' : ''

const SYSTEM = `Você é o MELHOR vendedor da Carreira No Digital (escola PRESENCIAL de marketing digital no RS). Sugere a próxima mensagem pra um lead no WhatsApp, do jeito que a gente REALMENTE fecha.

IMPORTANTE — GÊNERO: quem atende é SEMPRE HOMEM. Fale no MASCULINO ("honesto", "obrigado", "tranquilo") — nunca no feminino.

REGRA DE OURO: antes de responder, olhe os EXEMPLOS DE VENDAS GANHAS fornecidos e ache o momento/objeção mais parecido com o do lead atual — responda como a gente respondeu nas que FECHARAM. Copie o TOM (humano, direto, caloroso, sem robô), o ritmo e as jogadas que funcionam.

DESCOBERTA ANTES DO PITCH: se o lead ainda NÃO está etiquetado (sem cidade/curso definidos), sua PRIORIDADE é descobrir, de forma natural e no nosso tom, a CIDADE e o CURSO de interesse (e turno preferido) ANTES de ofertar — isso separa ganho de perda. Se ele já disse cidade/curso na conversa, use, não pergunte de novo. Se não tem turma na cidade dele agora, registre o interesse pra PRÓXIMA turma daquela cidade.

FLUXO ATÉ O FECHAMENTO — sempre AVANCE, não fique só respondendo dúvida: 1) descoberta (objetivo do lead, cidade, curso, turno); 2) construa valor ligando o curso ao objetivo dele; 3) oferta concreta (turma + preço + condição); 4) contorne a objeção; 5) FECHE — quando surgir sinal de compra (perguntou preço/forma de pagamento/data, disse "quero", "como faço"), PEÇA A VENDA: ofereça o link de matrícula ou o sinal de R$100 pra travar a vaga.

QUANDO CABE LIGAÇÃO com especialista: prefira resolver e VENDER pelo WhatsApp. Ofereça uma ligação rápida SÓ quando o lead tem muitas dúvidas/insegurança, pede pra "conversar melhor", está indeciso num ticket maior (FC), ou pediu pra ligar — aí proponha um horário. Se o lead já está pronto (sinais de compra), NÃO enrole com ligação: vá direto pro fechamento.

REABRIR CONVERSA FRIA: se a última mensagem foi de outro dia (faz 1+ dia), NÃO responda como continuação — REABRA: cumprimente pelo nome, retome o contexto do que ficou pendente ("passando aqui pra retomar…") e puxe de volta com uma pergunta ou uma oferta concreta.

TURMAS: SEMPRE olhe a lista de TURMAS ABERTAS (são as futuras). NUNCA diga que "não tem turma" na cidade sem conferir a lista. Se a turma que o lead veio etiquetado já aconteceu, ofereça a PRÓXIMA na mesma cidade. NUNCA invente preço/data/turma — use só as TURMAS ABERTAS informadas. Só ofereça cidade que a gente atende. Se o lead falou por áudio, o texto vem com 🎤.

Responda APENAS um JSON válido:
{
 "situacao": "<1 frase: onde o lead está / o que ele acabou de dizer>",
 "objecao": "<a barreira atual, ou 'nenhuma'>",
 "etapa_funil": "<ex: descoberta, oferta, objeção de preço, fechamento>",
 "resposta": "<a mensagem PRONTA pra mandar no WhatsApp — nosso tom, MASCULINO, curta, humana, 1 a 3 frases>",
 "acao_sugerida": "<descobrir | construir_valor | ofertar | contornar_objecao | fechar | agendar_ligacao | reabrir | nutrir>",
 "baseado_em": "<em qual venda ganha você se baseou + o que era parecido>",
 "proximo_passo": "<a ação concreta depois dessa mensagem>",
 "etiqueta": {"produto": "<FC|ANL|indefinido>", "cidade": "<cidade de interesse ou indefinido>", "turma_alvo": "<código de uma turma em vendas que encaixa, ou 'próxima turma' se não houver na cidade>"},
 "precisa_descobrir": ["<o que ainda falta saber pra etiquetar: cidade, curso, turno — vazio se já sabe tudo>"]
}`

async function carregarMensagens(convIds: string[]) {
  const msgs: Record<string, any[]> = {}
  for (let i = 0; i < convIds.length; i += 100) {
    const chunk = convIds.slice(i, i + 100); let from = 0
    for (; ;) {
      const { data } = await supabase.from('wa_mensagens').select('conversa_id, direcao, status, texto, criado_em').in('conversa_id', chunk).range(from, from + 999)
      if (!data?.length) break
      for (const m of data) (msgs[m.conversa_id] = msgs[m.conversa_id] || []).push(m)
      if (data.length < 1000) break; from += 1000
    }
  }
  return msgs
}
function linhas(convIds: string[], msgs: Record<string, any[]>, max = 40) {
  const ms = convIds.flatMap(id => msgs[id] || []).sort((a, b) => +new Date(a.criado_em) - +new Date(b.criado_em))
  const out: string[] = []
  for (const m of ms) {
    const quem = (m.direcao === 'recebida' || m.status === 'recebida') ? 'CLIENTE' : 'NÓS'
    const c = (m.texto || '').replace(/\s+/g, ' ').trim().slice(0, 300)
    if (c) out.push(`${quem}: ${c}`)
  }
  return out.slice(-max)
}

export async function sugerirAtendimento(input: { leadId?: string; conversaId?: string; situacaoTexto?: string; produtoHint?: string; cidadeHint?: string }): Promise<any> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { ok: false, error: 'falta ANTHROPIC_API_KEY' }
  const simul = !!input.situacaoTexto && !input.leadId && !input.conversaId

  // 1) lead/conversa atual (ou lead simulado)
  let lead: any = null
  if (simul) {
    const f = /anl|an[úu]ncio/i.test(input.produtoHint || '') ? 'anl' : /fc|forma/i.test(input.produtoHint || '') ? 'fc' : ''
    lead = { id: null, nome: '(lead simulado)', whatsapp: '', codigo_turma: f, turma_id: null, etapa: 'simulação' }
  } else if (input.leadId) {
    const { data } = await supabase.from('leads').select('id, nome, whatsapp, codigo_turma, turma_id, etapa').eq('id', input.leadId).maybeSingle()
    lead = data
  } else if (input.conversaId) {
    const { data: c } = await supabase.from('wa_conversas').select('id, telefone, nome, lead_id').eq('id', input.conversaId).maybeSingle()
    if (c?.lead_id) { const { data } = await supabase.from('leads').select('id, nome, whatsapp, codigo_turma, turma_id, etapa').eq('id', c.lead_id).maybeSingle(); lead = data }
    if (!lead && c) lead = { id: null, nome: c.nome || 'Lead', whatsapp: c.telefone, codigo_turma: null, etapa: '?' }
  }
  if (!lead) return { ok: false, error: 'lead/conversa não encontrado' }

  // 2) mapa de conversas
  const { data: convs } = await supabase.from('wa_conversas').select('id, telefone, lead_id')
  const byLead: Record<string, string[]> = {}, telConv: Record<string, string[]> = {}
  for (const c of (convs || [])) { if (c.lead_id) (byLead[c.lead_id] = byLead[c.lead_id] || []).push(c.id); const s = suf(c.telefone); if (s.length === 8) (telConv[s] = telConv[s] || []).push(c.id) }
  const convIdsDe = (l: any) => [...new Set([...(l.id ? byLead[l.id] || [] : []), ...(telConv[suf(l.whatsapp)] || [])])]

  const fam = familia(lead.codigo_turma || '')
  const produto = produtoDaFamilia(fam)

  // 3) EXEMPLOS DE VENDAS GANHAS (mesmo produto de preferência)
  const { data: wonAll } = await supabase.from('leads').select('id, nome, whatsapp, codigo_turma, valor_venda').eq('etapa', 'ganho')
  let won = (wonAll || []).filter((l: any) => fam === '?' ? true : familia(l.codigo_turma || '') === fam)
  if (won.length < 4) won = wonAll || [] // sem match de produto, usa todos
  won = won.slice(0, 22)
  const convAtual = convIdsDe(lead)
  const convWon = won.map(l => ({ l, ids: convIdsDe(l) }))
  const todosIds = [...new Set([...convAtual, ...convWon.flatMap(x => x.ids)])]
  const msgs = await carregarMensagens(todosIds)

  const atual = simul
    ? ((input.situacaoTexto || '').includes('CLIENTE:') ? (input.situacaoTexto || '').split('\n').filter(Boolean) : ['CLIENTE: ' + input.situacaoTexto])
    : linhas(convAtual, msgs, 30)
  if (!simul && atual.length < 2) return { ok: false, error: 'conversa atual sem mensagens suficientes' }

  // tempo desde a última mensagem (pra saber se precisa REABRIR a conversa)
  const msAtual = convAtual.flatMap(id => msgs[id] || []).sort((a, b) => +new Date(a.criado_em) - +new Date(b.criado_em))
  const ult = msAtual[msAtual.length - 1]
  let gap = ''
  if (ult) {
    const dias = Math.floor((Date.now() - +new Date(ult.criado_em)) / 864e5)
    const quem = (ult.direcao === 'recebida' || ult.status === 'recebida') ? 'CLIENTE' : 'NÓS'
    gap = dias >= 1
      ? `⚠️ A última mensagem foi há ${dias} dia(s) (${new Date(ult.criado_em).toLocaleDateString('pt-BR')}), enviada por ${quem}. A conversa ESFRIOU — REABRA: cumprimente (Oi ${(lead.nome || '').split(' ')[0]}!), retome o contexto do que ficou pendente e puxe de volta. NÃO responda como se fosse continuação do mesmo papo.`
      : `A última mensagem foi hoje (por ${quem}) — conversa quente, siga a continuação.`
  }

  const ganhas = convWon.map(x => ({ nome: x.l.nome, valor: x.l.valor_venda, t: linhas(x.ids, msgs, 30) }))
    .filter(x => x.t.length >= 4).sort((a, b) => b.t.length - a.t.length).slice(0, 6)

  // 4) playbook (análise de conversão) + 5) dossiê (voz do cliente)
  const { data: pb } = await supabase.from('webhook_logs').select('payload').eq('origem', 'analise-conversao').order('recebido_em', { ascending: false }).limit(1).maybeSingle()
  const playbook = (pb?.payload as any) || {}
  let dossie: any = null
  if (produto) { const { data: d } = await supabase.from('inteligencia_cliente').select('dossie, cidade').eq('produto', produto).limit(1).maybeSingle(); dossie = (d as any)?.dossie || null }

  // 6) TURMAS ABERTAS = futuras (data_fim >= hoje) e não canceladas/realizadas. SEMPRE ofertar destas.
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const { data: tv } = await supabase.from('turmas').select('codigo, status, preco_venda, data_inicio, data_fim, produtos(nome), cidades(nome)').gte('data_inicio', hoje).not('status', 'in', '(cancelada,realizada)').order('data_inicio').limit(40)
  const ofertas = (tv || []).map((t: any) => `${t.produtos?.nome} — ${t.cidades?.nome} — ${t.codigo} — R$${t.preco_venda} — ${t.data_inicio} a ${t.data_fim}`)
  // a turma que o lead veio etiquetado já aconteceu?
  let turmaPassada = ''
  if (lead.codigo_turma) {
    const { data: tt } = await supabase.from('turmas').select('codigo, data_fim, cidades(nome)').eq('codigo', lead.codigo_turma).maybeSingle()
    if (tt && (tt.data_fim || '') < hoje) turmaPassada = `${tt.codigo} (${(tt as any).cidades?.nome || ''})`
  }
  const { data: cids } = await supabase.from('cidades').select('nome').eq('ativo', true)
  const cidades = (cids || []).map((c: any) => c.nome).join(', ')
  const etiquetado = simul ? !!(input.cidadeHint && input.produtoHint) : !!(lead.codigo_turma || lead.turma_id)

  // 7) monta o prompt
  let corpus = CONTEXTO_NEGOCIO + '\n\n'
  corpus += `# CIDADES QUE ATENDEMOS: ${cidades}\n\n`
  corpus += `# LEAD ATUAL${simul ? ' (SIMULAÇÃO — teste de fluxo)' : ''}\nNome: ${lead.nome} | Produto de interesse: ${produto || '(indefinido)'}${simul && input.cidadeHint ? ` | Cidade: ${input.cidadeHint}` : ''} | Etapa: ${lead.etapa} | ${etiquetado ? 'JÁ ETIQUETADO (veio com turma)' : '⚠️ NÃO ETIQUETADO — descubra cidade e curso antes de ofertar'}\n`
  if (turmaPassada) corpus += `⚠️ ATENÇÃO: a turma que ele veio etiquetado (${turmaPassada}) JÁ ACONTECEU. Ofereça a PRÓXIMA turma aberta na MESMA cidade (veja abaixo). NUNCA diga que não há turma sem conferir a lista de turmas abertas.\n`
  if (gap) corpus += gap + '\n'
  corpus += `\n## Conversa até agora:\n${atual.join('\n')}\n\n`
  corpus += `# VENDAS GANHAS SIMILARES (espelhe o TOM e as jogadas que fecharam):\n`
  ganhas.forEach((g, i) => { corpus += `\n--- GANHO ${i + 1}: ${g.nome}${g.valor ? ` (R$${g.valor})` : ''} ---\n${g.t.join('\n').slice(0, 2600)}\n` })
  if (playbook?.o_que_funciona) corpus += `\n# O QUE FUNCIONA (playbook):\n${(playbook.o_que_funciona || []).map((x: any) => `- ${x.titulo}: ${x.descricao}`).join('\n')}\n`
  if (playbook?.melhor_fluxo) corpus += `\n# FLUXO QUE CONVERTE:\n${(playbook.melhor_fluxo || []).map((x: any, i: number) => `${i + 1}. ${x.passo}: ${x.descricao}`).join('\n')}\n`
  if (dossie?.objecoes) corpus += `\n# OBJEÇÕES E CONTORNOS (voz do cliente):\n${JSON.stringify(dossie.objecoes).slice(0, 1500)}\n`
  if (ofertas.length) corpus += `\n# TURMAS ABERTAS (futuras — única fonte de preço/data; SEMPRE ofereça destas):\n${ofertas.join('\n')}\n`

  const client = new Anthropic({ apiKey: key })
  const resp = await client.messages.create({ model: MODELO, max_tokens: 1200, system: SYSTEM, messages: [{ role: 'user', content: corpus }] })
  const raw = (resp.content || []).map((b: any) => b.type === 'text' ? b.text : '').join('').trim()
  let dados: any = null
  try { dados = JSON.parse(raw) } catch { const a = raw.indexOf('{'), z = raw.lastIndexOf('}'); if (a >= 0 && z > a) { try { dados = JSON.parse(raw.slice(a, z + 1)) } catch { } } }
  if (!dados) return { ok: false, error: 'IA não retornou JSON' }
  return { ok: true, sugestao: dados, baseado_em_n: ganhas.length }
}
