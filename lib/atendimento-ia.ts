import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'
import { contextoCentral } from '@/lib/contexto-central'
import { transcreverLigacao } from '@/lib/transcrever-ligacao'
import { logIaUso } from '@/lib/ia-uso'

// Motor de resposta do atendimento: ANTES de sugerir, busca conversas REAIS onde a gente
// FECHOU (mesmo produto/situação) e responde no nosso tom, seguindo o fluxo que converte.
const MODELO = 'claude-sonnet-4-6'
const suf = (t: string) => (t || '').replace(/\D/g, '').slice(-8)
const familia = (cod: string) => { const c = (cod || '').toLowerCase(); return c.startsWith('fc') ? 'FC' : c.startsWith('anl') ? 'ANL' : c.startsWith('anlnovohamburgo') ? 'ANL' : '?' }
const produtoDaFamilia = (f: string) => f === 'FC' ? 'Formação Completa em Marketing Digital' : f === 'ANL' ? 'Anúncios para Negócios Locais' : ''

// remove surrogates soltos (emoji quebrado) que invalidam o JSON enviado ao Claude
const limpo = (s: string) => (s || '').replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '').replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')

const SYSTEM = `Você é o MELHOR vendedor da Carreira No Digital (escola PRESENCIAL de marketing digital no RS). Sugere a próxima mensagem pra um lead no WhatsApp, do jeito que a gente REALMENTE fecha.

IMPORTANTE — GÊNERO: quem atende é SEMPRE HOMEM. Fale no MASCULINO ("honesto", "obrigado", "tranquilo") — nunca no feminino.

CONHECIMENTO DO PRODUTO (você CONHECE o negócio a fundo — aja assim): use os nomes CERTOS — "a Formação"/"Formação Completa" é o FC; o ANL é o curso "Anúncios para Negócios Locais", NUNCA "Formação ANL". NUNCA invente conteúdo/módulo de curso: descreva só as competências do CONTEXTO. O ANL é tráfego PAGO na Meta (Facebook/Instagram) — NÃO diga que ensina Google, SEO nem gestão de perfil orgânico. Prefira ancorar na turma REAL (cidade, datas, horário) a soltar blurb genérico de marketing.

REGRA DE OURO: antes de responder, olhe os EXEMPLOS DE VENDAS GANHAS fornecidos e ache o momento/objeção mais parecido com o do lead atual — responda como a gente respondeu nas que FECHARAM. Copie o TOM (humano, direto, caloroso, sem robô), o ritmo e as jogadas que funcionam.

DESCOBERTA ANTES DO PITCH: se o lead ainda NÃO está etiquetado (sem cidade/curso definidos), sua PRIORIDADE é descobrir, de forma natural e no nosso tom, a CIDADE e o CURSO de interesse (e turno preferido) ANTES de ofertar — isso separa ganho de perda. Se ele já disse cidade/curso na conversa, use, não pergunte de novo. Se não tem turma na cidade dele agora, registre o interesse pra PRÓXIMA turma daquela cidade.

FLUXO ATÉ O FECHAMENTO — sempre AVANCE, não fique só respondendo dúvida: 1) descoberta (objetivo do lead, cidade, curso, turno); 2) construa valor ligando o curso ao objetivo dele; 3) oferta concreta (turma + preço + condição); 4) contorne a objeção; 5) FECHE — quando surgir sinal de compra (perguntou preço/forma de pagamento/data, disse "quero", "como faço"), PEÇA A VENDA seguindo a PRIORIDADE DE PAGAMENTO abaixo.

PRIORIDADE DE PAGAMENTO (a META é o aluno PAGAR LOGO): 1º) à vista / Pix do valor cheio — sempre tente isso primeiro; 2º) se não puder à vista, parcelamento no CARTÃO (10x sem juros); 3º) SÓ EM ÚLTIMO CASO (último mesmo — quando o lead está prestes a desistir por dinheiro) ofereça o sinal de R$100 pra travar a vaga. NUNCA ofereça o sinal de R$100 de primeira, nem como resposta padrão a "tem parcelamento?" — parcelamento é CARTÃO.

USE AS CONDIÇÕES DO CONTEXTO (seção CONDIÇÕES E OFERTAS): apresente o preço no formato certo (ANL: R$997 em 10x OU R$797 no Pix). O DESCONTO DE REATIVAÇÃO (ANL: R$697 à vista / 10x R$85,70) é EXCLUSIVO do follow-up de lead frio (após várias tentativas), sempre com uma justificativa plausível — NUNCA ofereça de primeira nem num lead novo/quente.

NÃO SOLTE O PREÇO CEDO: primeiro ENTENDA bem o negócio do lead (ramo, demanda, momento) e CONSTRUA VALOR ligando o curso à realidade dele. Quando o lead pedir "detalhes/conteúdo/datas", responda conteúdo e datas — mas só crave o PREÇO quando ele perguntar de preço/pagamento OU já estiver claramente interessado. Na FC (ticket alto), qualifique MAIS antes de precificar. Preço jogado cedo esfria.

QUANDO CABE LIGAÇÃO com especialista — GATILHO FORTE, seja proativo: se o lead pergunta "será que funciona pro MEU negócio?" / tem negócio complexo ou competitivo (provedor, indústria, nicho) / é FC (ticket alto) / traz várias objeções juntas — E você ainda NÃO ofereceu ligação — a jogada mais assertiva NÃO é insistir no fechamento nem só tranquilizar: é OFERECER uma ligação/conversa com um ESPECIALISTA que entende do ramo dele, pra mapear a demanda e mostrar como o curso aplica no caso específico. Proponha dia/horário (vira etapa AGENDADO). Ex: "Isso aí merece uma conversa mais a fundo — posso te ligar amanhã pra entender teu provedor e te mostrar exatamente como aplicar? Qual melhor horário?". Só vá direto pro fechamento quando o lead já dá sinais CLAROS de compra.

PIPELINE OFICIAL (ciclo de 9 dias — SEMPRE saiba em que ETAPA o lead está pelo campo "Etapa" e conduza pro próximo passo dela):
• AGUARDANDO ATENDIMENTO (D1-3): 1º contato — tenta LIGAÇÃO; se não atende, ÁUDIO avisando da tentativa. Depois → Atendimento Inicial.
• ATENDIMENTO INICIAL (D4-6): apresenta o curso, entende o lead e informa PREÇO + LOTE. Se não atende a ligação, manda ÁUDIO (conteúdo+valor+lote). No 3º dia sem retorno, manda mensagem com preço+lote+validade (3 dias). → Lote e Preço OK.
• LOTE E PREÇO OK: garante que recebeu preço/lote e mede interesse. Se demonstrou interesse E já entendemos o negócio dele → Oferecer Bolsa. Até o 6º dia sem interesse/resposta → mensagem de despedida → Lead Perdido.
• OFERECER BOLSA (D7-9, SÓ pra quem demonstrou interesse): apresenta a BOLSA = condição especial (no ANL: R$697 à vista ou 10x R$85,70) SEMPRE com uma justificativa plausível, tira dúvidas e conduz pra decisão. Vai pagar agora? Sim → link de pagamento → Aguardando Pagamento. Não → quer agendar? → Agendado.
• EXCEÇÕES que CONGELAM o ciclo e dão +3 dias: AGENDADO (marca dia/hora, cria tarefa, liga no dia) e AGUARDANDO PAGAMENTO (mandou link, +3 dias pra pagar; se não pagar, novo contato ligação/áudio/mensagem).
• SAÍDAS a qualquer momento: quer marcar horário → Agendado; quer pagar → link → Aguardando Pagamento; sem interesse → despedida → Perdido.
• PRAZOS: 9 dias no total; D6 sem interesse/resposta (etapas 1-3) = despedida; D9 sem conversão = despedida. A BOLSA (desconto) só na etapa Oferecer Bolsa — nunca antes.

REABRIR CONVERSA FRIA: se a última mensagem foi de outro dia (faz 1+ dia), NÃO responda como continuação — REABRA: cumprimente pelo nome, retome o contexto do que ficou pendente ("passando aqui pra retomar…") e puxe de volta com uma pergunta ou uma oferta concreta.

TURMAS: SEMPRE olhe a lista de TURMAS ABERTAS. Você TEM tudo de cada turma: as DATAS exatas com o DIA DA SEMANA já calculado, o HORÁRIO, o LOCAL e as VAGAS — e sabe QUE DIA É HOJE (no topo do contexto). Então NUNCA diga "vou confirmar", "deixa eu checar" ou "confirmo depois" pra uma info que você JÁ TEM (dias, dia da semana, horário, local, vagas): responda na hora, com os dados exatos. Nunca chute dia da semana — use o que está na lista. NUNCA invente preço/data/turma. Se a turma etiquetada já COMEÇOU (matrícula fechada), ofereça a próxima na mesma cidade. NUNCA diga que uma turma de um produto está "chegando"/"nova" numa cidade se ela NÃO está na lista TURMAS ABERTAS — isso é mentira e queima a venda. Se o produto que o lead quer NÃO tem turma na cidade dele, seja honesto e PRIORIZE manter o lead na cidade dele: se há turma aberta de OUTRO produto na mesma cidade, ofereça essa opção local primeiro (a pessoa tende a preferir na própria cidade); só depois, se ela insistir no produto original, ofereça o mesmo produto na cidade mais próxima que estiver na lista. Nunca prometa uma turma que não está listada.

RESPONDA ANTES DE VENDER: se o lead faz uma pergunta operacional (que dias? que horário? quantas vagas? onde é?), RESPONDA completo primeiro, com os dados reais. NÃO empurre "Pix ou cartão?" enquanto o lead ainda está pedindo informação — isso irrita e derruba a venda. Só conduza pro pagamento DEPOIS que ele tiver o que precisa e demonstrar que está decidindo. Se o lead falou por áudio, o texto vem com 🎤.

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

  // 2) mapa de conversas (PAGINADO — o Supabase corta em 1000)
  let convs: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('wa_conversas').select('id, telefone, lead_id').range(from, from + 999)
    if (!data?.length) break; convs.push(...data); if (data.length < 1000) break
  }
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
  if (!simul && atual.length < 1) return { ok: false, error: 'conversa atual sem mensagens' }

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

  // 6) TURMAS ABERTAS = futuras (não começaram) e não canceladas/realizadas. SEMPRE ofertar destas — com TUDO: datas+dia da semana, horário, local, vagas.
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const DS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
  const diaSem = (d: string) => DS[new Date(d + 'T12:00:00-03:00').getDay()]
  const brData = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
  const { data: tv } = await supabase.from('turmas').select('id, codigo, status, preco_venda, vagas, produtos(nome), cidades(nome), salas(nome)').gte('data_inicio', hoje).not('status', 'in', '(cancelada,realizada)').order('data_inicio').limit(40)
  const tvIds = (tv || []).map((t: any) => t.id)
  const datasPorTurma: Record<string, any[]> = {}
  if (tvIds.length) {
    const { data: dd } = await supabase.from('turma_datas').select('turma_id, data, horario_inicio, horario_fim').in('turma_id', tvIds).order('data')
    for (const d of (dd || [])) (datasPorTurma[d.turma_id] = datasPorTurma[d.turma_id] || []).push(d)
  }
  const ofertas = (tv || []).map((t: any) => {
    const ds = datasPorTurma[t.id] || []
    const dias = ds.map((d: any) => `${brData(d.data)} (${diaSem(d.data)})`).join(', ')
    const hor = ds[0]?.horario_inicio ? `${ds[0].horario_inicio.slice(0, 5)} às ${(ds[0].horario_fim || '').slice(0, 5)}` : ''
    return `${t.produtos?.nome} — ${t.cidades?.nome} — ${t.codigo} — R$${t.preco_venda}` +
      `${dias ? ` — DIAS: ${dias}` : ''}${hor ? ` — HORÁRIO: ${hor}` : ''}${t.salas?.nome ? ` — LOCAL: ${t.salas.nome}` : ''}${t.vagas ? ` — ${t.vagas} vagas` : ''}`
  })
  // a turma que o lead veio etiquetado já COMEÇOU? (matrícula fecha quando a turma inicia — não dá pra entrar no meio)
  let turmaPassada = ''
  if (lead.codigo_turma) {
    const { data: tt } = await supabase.from('turmas').select('codigo, data_inicio, data_fim, produtos(nome), cidades(nome)').eq('codigo', lead.codigo_turma).maybeSingle()
    if (tt && (tt.data_inicio || '') < hoje) {
      const cidNome = (tt as any).cidades?.nome || ''
      const prodNome = (tt as any).produtos?.nome || produto || ''
      const naCidade = (tv || []).filter((t: any) => (t.cidades?.nome || '') === cidNome)
      const mesmoProd = naCidade.filter((t: any) => (t.produtos?.nome || '') === prodNome)
      turmaPassada = `${tt.codigo} (${cidNome}${prodNome ? ' · ' + prodNome : ''}) já COMEÇOU em ${brData(tt.data_inicio)} — matrícula ENCERRADA.`
      if (mesmoProd.length) turmaPassada += ` Há turma NOVA de ${prodNome} em ${cidNome} na lista abaixo — ofereça essa.`
      else if (naCidade.length) turmaPassada += ` NÃO há turma nova de ${prodNome} em ${cidNome} agora — MAS há turma aberta na PRÓPRIA cidade de ${cidNome}, de outro produto: ${naCidade.map((t: any) => `${t.produtos?.nome} (${t.codigo})`).filter(Boolean).join(', ')}. PRIORIZE oferecer essa opção LOCAL (a pessoa é de ${cidNome} e tende a preferir na cidade dela) — apresente como alternativa real e concreta. Só ofereça ${prodNome} em outra cidade se ela insistir no ${prodNome}. Seja honesto: NUNCA prometa ${prodNome} em ${cidNome}.`
      else turmaPassada += ` NÃO há NENHUMA turma nova em ${cidNome} na lista. Seja honesto: registre o interesse pra próxima de ${cidNome} e ofereça ${prodNome} na cidade mais próxima que ESTIVER na lista. NUNCA diga que vem ${prodNome} em ${cidNome} se não está listada.`
    }
  }
  const { data: cids } = await supabase.from('cidades').select('nome').eq('ativo', true)
  const cidades = (cids || []).map((c: any) => c.nome).join(', ')
  const etiquetado = simul ? !!(input.cidadeHint && input.produtoHint) : !!(lead.codigo_turma || lead.turma_id)

  // Histórico de contatos FORA do WhatsApp (ligações via API4COM, anotações da equipe) — pra IA não ignorar o que já rolou
  let andamentosTxt = ''
  if (lead.id) {
    const { data: ands } = await supabase.from('lead_andamentos').select('tipo, observacao, criado_em').eq('lead_id', lead.id).order('criado_em', { ascending: false }).limit(25)
    const rel = (ands || []).filter((a: any) => a.tipo === 'ligacao' || (a.observacao && !['tarefa_criada', 'mudanca_etapa', 'criado'].includes(a.tipo)))
    if (rel.length) andamentosTxt = rel.slice(0, 12).reverse().map((a: any) => `- ${brData((a.criado_em || '').slice(0, 10))}: ${a.tipo === 'ligacao' ? '📞 NÓS LIGAMOS' : a.tipo}${a.observacao ? ' — ' + a.observacao : ''}`).join('\n')
  }

  // TRANSCRIÇÃO das ligações (o que foi REALMENTE falado na call) — transcreve sob demanda se faltar (cacheado)
  let ligacoesTxt = ''
  if (lead.id) {
    const { data: ligs } = await supabase.from('ligacoes').select('id, gravacao_url, duracao, metadata, criado_em').eq('lead_id', lead.id).order('criado_em', { ascending: false }).limit(5)
    const comRec = (ligs || []).filter((l: any) => l.gravacao_url && (l.duracao || 0) > 10)
    for (const l of comRec.slice(0, 1)) { // transcreve só a mais recente sem transcrição (evita travar demais)
      if (!(l.metadata && l.metadata.transcrita)) { const t = await transcreverLigacao(l.id); if (t) l.metadata = { ...(l.metadata || {}), transcricao: t } }
    }
    const trans = comRec.filter((l: any) => l.metadata?.transcricao)
    if (trans.length) ligacoesTxt = trans.slice(0, 2).reverse().map((l: any) => `📞 LIGAÇÃO de ${brData((l.criado_em || '').slice(0, 10))} (${Math.round((l.duracao || 0) / 60)}min):\n"${(l.metadata.transcricao || '').slice(0, 2200)}"`).join('\n\n')
  }

  // 7) monta o prompt
  let corpus = await contextoCentral() // CÉREBRO CENTRAL: negócio + produtos + condições + fluxo/cadência/prioridade + regras vivas
  corpus += `# HOJE É ${brData(hoje)}/${hoje.slice(0, 4)} (${diaSem(hoje)}).\n`
  corpus += `# CIDADES QUE ATENDEMOS: ${cidades}\n\n`
  corpus += `# LEAD ATUAL${simul ? ' (SIMULAÇÃO — teste de fluxo)' : ''}\nNome: ${lead.nome} | Produto de interesse: ${produto || '(indefinido)'}${simul && input.cidadeHint ? ` | Cidade: ${input.cidadeHint}` : ''} | Etapa: ${lead.etapa} | ${etiquetado ? 'JÁ ETIQUETADO (veio com turma)' : '⚠️ NÃO ETIQUETADO — descubra cidade e curso antes de ofertar'}\n`
  if (turmaPassada) corpus += `⚠️ ATENÇÃO — TURMA ETIQUETADA: ${turmaPassada} NUNCA invente turma/produto/cidade que não esteja na lista TURMAS ABERTAS abaixo.\n`
  if (gap) corpus += gap + '\n'
  corpus += `\n## Conversa até agora:\n${atual.join('\n')}\n\n`
  if (andamentosTxt) corpus += `# CONTATOS/LIGAÇÕES FORA DO WHATSAPP (JÁ ACONTECERAM — leve em conta, NÃO ignore: se já ligamos, não fale "vou te ligar" como se fosse a 1ª vez; retome o que ficou):\n${andamentosTxt}\n\n`
  if (ligacoesTxt) corpus += `# TRANSCRIÇÃO DA(S) LIGAÇÃO(ÕES) — o que o cliente REALMENTE falou na call (negócio, objetivo, objeções). USE isto: NÃO pergunte de novo o que ele já respondeu aqui; retome e avance a partir do que ele disse:\n${ligacoesTxt}\n\n`
  corpus += `# VENDAS GANHAS SIMILARES (espelhe o TOM e as jogadas que fecharam):\n`
  ganhas.forEach((g, i) => { corpus += `\n--- GANHO ${i + 1}: ${g.nome}${g.valor ? ` (R$${g.valor})` : ''} ---\n${g.t.join('\n').slice(0, 2600)}\n` })
  if (playbook?.o_que_funciona) corpus += `\n# O QUE FUNCIONA (playbook):\n${(playbook.o_que_funciona || []).map((x: any) => `- ${x.titulo}: ${x.descricao}`).join('\n')}\n`
  if (playbook?.melhor_fluxo) corpus += `\n# FLUXO QUE CONVERTE:\n${(playbook.melhor_fluxo || []).map((x: any, i: number) => `${i + 1}. ${x.passo}: ${x.descricao}`).join('\n')}\n`
  if (dossie?.objecoes) corpus += `\n# OBJEÇÕES E CONTORNOS (voz do cliente):\n${JSON.stringify(dossie.objecoes).slice(0, 1500)}\n`
  if (ofertas.length) corpus += `\n# TURMAS ABERTAS (futuras — única fonte de preço/data; SEMPRE ofereça destas):\n${ofertas.join('\n')}\n`
  // (fluxo + regras da equipe já vêm do CÉREBRO CENTRAL no topo do corpus)

  // APRENDIZADO com as CORREÇÕES da equipe: como o humano reescreveu a sugestão da IA (o tom REAL).
  try {
    const { data: edicoes } = await supabase.from('webhook_logs').select('payload').eq('origem', 'ia-edicao').order('recebido_em', { ascending: false }).limit(10)
    const exs = (edicoes || []).map((e: any) => e.payload).filter((p: any) => p?.original && p?.enviado)
    if (exs.length) {
      corpus += `\n# COMO A EQUIPE REESCREVE (APRENDA O TOM REAL — a IA sugeriu e o vendedor CORRIGIU antes de enviar; imite o estilo do "ENVIADO", não do "SUGERIDO"):\n`
      corpus += exs.slice(0, 6).map((p: any) => `— SUGERIDO: "${(p.original || '').slice(0, 320)}"\n  ✅ ENVIADO: "${(p.enviado || '').slice(0, 320)}"`).join('\n')
      corpus += `\n`
    }
  } catch { /* aprendizado é best-effort */ }

  const client = new Anthropic({ apiKey: key })
  const resp = await client.messages.create({ model: MODELO, max_tokens: 1200, system: SYSTEM, messages: [{ role: 'user', content: limpo(corpus) }] })
  await logIaUso('atendimento', MODELO, resp.usage)
  const raw = (resp.content || []).map((b: any) => b.type === 'text' ? b.text : '').join('').trim()
  let dados: any = null
  try { dados = JSON.parse(raw) } catch { const a = raw.indexOf('{'), z = raw.lastIndexOf('}'); if (a >= 0 && z > a) { try { dados = JSON.parse(raw.slice(a, z + 1)) } catch { } } }
  if (!dados) return { ok: false, error: 'IA não retornou JSON' }
  return { ok: true, sugestao: dados, baseado_em_n: ganhas.length }
}
