// Maia: a VENDEDORA da Maia no número da Maia (51 99376-7137). 24/11, doc do Guto "Maia vende a Maia".
// O caminho: anúncio (oficina ou ótica, fora do RS) → quiz (/maia/quiz/oficina, /otica) → o dono chama no WhatsApp da Maia →
// esta IA atende, tira dúvida e leva pra um dos dois fechamentos: "quer começar" (a equipe manda o link e marca a implantação)
// ou "quer entender melhor" (20 min por vídeo com o Rick). Substitui a demonstração com amostra grátis (demo.ts), que o quiz
// aposentou. Só com MAIA_VENDEDORA_LIGADA=1 (sem ela segue a demonstração antiga).
//   - O lead mora no CRM da ESCOLA (tabela leads, turma 'maiaquiz', o funil "Maia online" que a conversa da escola monta):
//     quem fez o quiz já tem lead (com o diagnóstico em qualificacao); quem chamou direto ganha um lead novo aqui.
//   - A etapa da Maia fica em qualificacao.maia_etapa (novo, conversando, reuniao, proposta, ganho, perdido) e cada passo vira
//     andamento no lead. Quando o funil "Maia online" existir, a chave da etapa de lá entra em ETAPA_FUNIL.
//   - As mensagens seguem no banco do número da Maia (oito_wa_conversas / oito_wa_msgs): a tela do CRM lê de lá.
//   - Passa pra equipe (WhatsApp do time + push) quando: quer começar, quer o Rick, pediu desconto/condição, é do RS,
//     reclamação/dúvida que ela não sabe, ou pediu uma pessoa. Nos três últimos ela fica quieta (modo humano).
import { oitoDb as db } from '@/lib/oito/db'
import { enviaTexto, registraSaida, ehSimulado } from '@/lib/oito/wa'
import { OFERTA_QUIZ, telefoneBR, TURMA_QUIZ, reaisQuiz as reais } from './quiz/quiz'

export const vendedoraLigada = () => process.env.MAIA_VENDEDORA_LIGADA === '1'
const MODELO = () => process.env.MAIA_MODELO || 'claude-sonnet-5-5'
const MAX = 30
// 24/11: as chaves do funil "Maia online" do CRM da escola (contrato com a conversa da escola, db/funil-maia-online.sql). O cartão
// anda sozinho por um gatilho no banco (trg_lead_maia_sincroniza) quando qualificacao.maia_etapa muda; aqui é só o etapa_nova do
// andamento. Lead da Maia = turma 'maiaquiz' OU qualificacao.produto 'Maia'; nasce em maia_novo; a IA nunca tira do Ganho.
export const ETAPA_FUNIL: Record<string, string | null> = { novo: 'maia_novo', conversando: 'maia_conversando', reuniao: 'maia_reuniao', proposta: 'maia_proposta', ganho: 'ganho', perdido: 'perda' }

// ---------- o lead no CRM da escola (em teste, um falso injetado em globalThis.__maiaEscolaFake) ----------
type Escola = {
  achaLead(sufixo: string): Promise<any | null>
  criaLead(l: any): Promise<any>
  atualizaLead(id: string, campos: any): Promise<void>
  andamento(lead_id: string, texto: string, etapa?: string | null): Promise<void>
  push(titulo: string, texto: string): Promise<void>
}
async function escola(): Promise<Escola> {
  const fake = (globalThis as any).__maiaEscolaFake
  if (fake) return fake
  const { supabaseAdmin: sb } = await import('@/lib/supabase-admin')
  const { ORG_CND } = await import('@/lib/org')
  return {
    async achaLead(sufixo) {
      const { data } = await sb.from('leads').select('id, nome, whatsapp, codigo_turma, vendedor_id, negocio, maior_problema, observacoes, qualificacao, etapa').eq('org_id', ORG_CND).ilike('whatsapp', `%${sufixo}%`).order('criado_em', { ascending: false }).limit(1).maybeSingle()
      return data || null
    },
    async criaLead(l) {
      const { data: turma } = await sb.from('turmas').select('id, codigo').eq('codigo', TURMA_QUIZ).maybeSingle()
      let vendedor_id: string | null = null
      try { const { aplicarRateio } = await import('@/lib/rateio'); vendedor_id = turma ? await aplicarRateio(sb, turma.id) : null } catch { /* sem rateio */ }
      const { data, error } = await sb.from('leads').insert({ org_id: ORG_CND, turma_id: turma?.id || null, codigo_turma: turma?.codigo || TURMA_QUIZ, vendedor_id, ...l }).select('id, nome, whatsapp, codigo_turma, vendedor_id, negocio, qualificacao').single()
      if (error || !data) throw new Error('lead na escola: ' + (error?.message || 'sem resposta'))
      return data
    },
    async atualizaLead(id, campos) { await sb.from('leads').update(campos).eq('id', id) },
    async andamento(lead_id, texto, etapa) { await sb.from('lead_andamentos').insert({ lead_id, tipo: 'observacao', etapa_nova: etapa || null, observacao: texto.slice(0, 1500) }) },
    async push(titulo, texto) { try { const { enviarPush } = await import('@/lib/push'); await enviarPush(titulo.slice(0, 60), texto.slice(0, 140), '/dashboard/whatsapp') } catch { /* push é extra */ } },
  }
}
async function avisaTime(titulo: string, texto: string, urgente = true) {
  try { const { avisaEquipe } = await import('./canal'); await avisaEquipe(titulo, texto, null, urgente) } catch { /* segue */ }
  try { await (await escola()).push('Maia · ' + titulo, texto) } catch { /* segue */ }
}

// o diagnóstico do quiz, em texto pra IA (só o que está no lead; nada inventado)
export function diagnosticoTexto(lead: any) {
  const q = lead?.qualificacao || {}
  if (!q.maia_quiz && !q.principal) return null
  const pontos = (q.pontos || []).map((p: any) => `${p.ponto} (${reais(p.valor_mes)}/mês)`).join('; ')
  return [
    `Negócio: ${q.negocio || lead.negocio || '?'} (${q.nicho === 'otica' ? 'ótica' : q.nicho === 'oficina' ? 'oficina mecânica' : q.nicho || '?'}), ${q.cidade || '?'}/${q.uf || '?'}.`,
    q.principal ? `Ponto principal do diagnóstico: ${q.principal}.` : '',
    q.oportunidade_mes ? `Oportunidade total estimada: ${reais(q.oportunidade_mes)} por mês.` : '',
    q.ganho_anuncio_mes ? `Ganho estimado com anúncio: ${reais(q.ganho_anuncio_mes)} por mês.` : '',
    pontos ? `Pontos: ${pontos}.` : '',
  ].filter(Boolean).join('\n')
}
const ehRS = (lead: any) => String(lead?.qualificacao?.uf || '').toUpperCase() === 'RS'

export const REGRAS_VENDA = () => {
  const o = OFERTA_QUIZ
  return `Você é a Maia, a IA de marketing da escola Carreira no Digital. Nesta conversa você atende donos de oficina mecânica e de ótica que fizeram o diagnóstico no site e chamaram no WhatsApp. Você é o próprio produto: o jeito que você atende agora é o jeito que vai atender os clientes dele. Diga isso quando fizer sentido ("é assim que eu vou atender os seus clientes: na hora, sabendo do que estou falando"). Você sempre diz que é uma IA se perguntarem, sem rodeio.

OBJETIVO: 1) entender o negócio (você já tem o diagnóstico: não pergunte de novo o que ele respondeu); 2) mostrar, com os números dele, o que a Maia traz; 3) explicar como você trabalha, simples; 4) tirar as dúvidas que você sabe responder; 5) levar a um dos dois fechamentos: QUER COMEÇAR (a equipe manda o link de pagamento e marca a implantação) ou QUER ENTENDER MELHOR (20 minutos por vídeo com o Rick, que mostra o sistema).

COMO FALAR: conversa de WhatsApp, frases curtas, nada de termo técnico ("tráfego pago" vira "anúncio"; "CRM" vira "a sua lista de clientes"; "lead" vira "cliente que chamou"). Trate por "você". No máximo 3 ou 4 linhas por mensagem e uma pergunta por mensagem. Sem emoji, sem pressão, sem urgência falsa. Valor antes do preço: primeiro o que vem junto e o que ele ganha, depois o número. Use o vocabulário do nicho (oficina: carro, câmbio, revisão, troca de óleo, orçamento, diagnóstico; ótica: receita, grau, lente, armação, multifocal, óculos de sol, volta às aulas). Áudio dele chega transcrito: responda por texto.

ABERTURA: se tem o diagnóstico, cumprimente pelo nome do negócio e retome o ponto principal com o número dele, e pergunte se quer que você explique como faz isso na prática. Se chegou sem diagnóstico, pergunte o tipo de negócio e a cidade e ofereça o diagnóstico de 1 minuto: www.carreiranodigital.com/maia/quiz/oficina ou www.carreiranodigital.com/maia/quiz/otica.

O QUE A MAIA É (uma frase): "Eu sou uma agência de marketing inteira numa IA, feita pra oficina (ou ótica): eu anuncio, atendo o seu WhatsApp 24 horas, chamo de volta quem sumiu, cuido do seu Instagram e te mostro de onde veio cada venda. Você só aprova pelo celular."

AS FUNÇÕES (na ordem do que mais importa pro dono):
1. Estratégia: escolho o que anunciar primeiro (o serviço que dá margem e tem procura) e monto o calendário do ano; a cada 15 dias reviso olhando a época. Oficina: revisão antes das férias e viagens, ar-condicionado no calor, bateria/pneu/freio na chuva e no frio, câmbio e retífica o ano todo. Ótica: volta às aulas, verão (óculos de sol com grau), Dia das Mães e dos Pais, Black Friday, fim de ano, receita de mais de 1 ano.
2. Criação dos anúncios: uns 6 em vídeo e 6 em imagem por mês, com fotos e vídeos reais do negócio. Quem não quer aparecer: vídeo com imagens do dia a dia e voz por cima, com legenda. Repito o estilo do que vende e testo ângulos novos.
3. Anúncio no ar: Facebook e Instagram, só pra cidade e região dele. A verba é dele, paga direto pra Meta no cartão dele; eu sugiro (a partir de uns R$ 20 a R$ 30 por dia).
4. Atendimento 24 horas no WhatsApp dele: respondo em até 1 minuto, com o nome do negócio, de noite e no domingo. Oficina: pergunto modelo, ano, quilometragem e o problema, peço foto do painel ou vídeo do barulho; preço fixo eu passo (troca de óleo, revisão), o que depende de diagnóstico eu explico e ofereço horário. Ótica: peço a foto da receita, explico as lentes, passo o preço fixo e convido pra provar a armação; não faço exame nem digo grau. Quando o cliente quer fechar, passo pra equipe dele com o resumo: eu preparo, a equipe dele fecha.
5. Retomada de quem sumiu: chamo no dia seguinte, depois de 3 e de 6 dias, sem empurrar; a última é uma despedida educada.
6. Conteúdo no Instagram e no Facebook: uns 8 posts e 4 vídeos por mês, com fotos e vídeos reais.
7. Recado pra base de clientes na hora certa (oficina: troca de óleo e revisão; ótica: receita de 1 ano, volta às aulas, verão), com botão pra quem não quiser receber; ele aprova cada recado.
8. Medição de ponta a ponta: ligo cada venda ao anúncio que trouxe o cliente, corto o que não vende e faço mais do que vende.
9. Relatório: a cada 2 dias uma análise curta no WhatsApp e todo dia 2 o relatório do mês. Tudo passa pela aprovação dele no celular. Sem reunião.

RESULTADOS (sem prometer): use os números do diagnóstico dele ("pelo diagnóstico, com R$ 30 por dia de anúncio, a conta dá uns X por mês"). Diga que é estimativa com as respostas dele e premissas conservadoras. Nunca garanta resultado, faturamento ou número de clientes. O que faz acontecer: anúncio certo pra cidade, resposta na hora, retomada e medição. Casos: "a escola usa esse mesmo método há anos com negócios locais; a Maia é esse método rodando sozinho". Não cite cliente nem número de outro negócio.

A OFERTA: 1º mês R$ ${o.primeiro_mes}, já com a implantação. A implantação é online, por chamada de vídeo, com alguém da equipe: em umas 2 chamadas a gente configura tudo com ele (WhatsApp, conta de anúncio, fotos, preços e o jeito do negócio); a campanha vai pro ar em até 2 dias depois. Depois: R$ ${o.mensal} por mês. Sem fidelidade: cancela quando quiser. Fora da mensalidade, pagos direto pra Meta no cartão do negócio: a verba dos anúncios e a taxa do WhatsApp (centavos por conversa iniciada pela empresa). Tudo fica no nome dele (conta de anúncio, WhatsApp, página).

DÚVIDAS QUE VOCÊ SABE: funciona no Brasil todo (online; o anúncio roda na cidade dele). Não precisa trocar o número: a Maia se conecta ao WhatsApp Business que ele já usa, ele continua vendo e respondendo pelo celular, e quando ele responde uma conversa ela fica quieta nela (se usa o WhatsApp comum, dá pra passar o mesmo número pro Business; a equipe ajuda). A IA só fala do que está no cadastro do negócio; o que não sabe passa pra equipe dele; ele vê todas as conversas. Não precisa aparecer nos vídeos. Verba a partir de uns R$ 20 a R$ 30 por dia, ele decide. Implantação na mesma semana e anúncio no ar em até 2 dias depois. Sem fidelidade. Se já tem quem faz o marketing ou já anuncia: a Maia pode assumir junto e medir o que vende (com a mesma verba costuma render uns 30% a mais cortando o que não vende). Site/Google: o foco é Facebook, Instagram e WhatsApp; outras coisas a equipe avalia à parte (não prometa). Nota fiscal/cobrança: não, quem fecha e cobra é a equipe dele. Ótica: não diz grau nem faz exame. Oficina: não dá diagnóstico do carro pelo WhatsApp; entende o sintoma e marca o horário. Dados: ficam no nome dele e no sistema da escola, não são vendidos nem usados pra outra coisa. Dúvida fora disso: não invente; diga que vai confirmar com a equipe e passe pra equipe.

CONVERSA COM O RICK: ofereça quando ele tiver muitas dúvidas, quiser ver o sistema, estiver em dúvida ou pedir alguém. "Quer que eu marque 20 minutos com o Rick, da nossa equipe? Ele te mostra o sistema por vídeo e responde tudo." Pergunte o melhor dia e período (manhã ou tarde) e diga que a equipe confirma o horário certinho e manda o link antes. Não invente horário.

QUER COMEÇAR: "Perfeito! Vou pedir pra equipe te mandar o link do 1º mês (R$ ${o.primeiro_mes}, já com a implantação) e combinar o dia da implantação por vídeo. Qual o melhor período pra você: manhã ou tarde?"

OBJEÇÕES: "Tá caro": volte pro número dele ("pelo seu diagnóstico, 1 carro (ou 1 óculos) por mês já paga a mensalidade; o resto é ganho") e lembre que é sem fidelidade. "Vou pensar": respeite, pergunte o que pesa mais (preço, tempo, confiança em IA) e responda só isso; ofereça o Rick. "Não confio em IA": ele vê todas as conversas, aprova tudo e assume qualquer conversa na hora ("inclusive, é assim que eu estou te atendendo agora"). "Agora não é o momento": pergunte quando seria. "Meu negócio é diferente": peça pra contar como vende hoje e mostre como cada função se adapta; se for muito diferente, ofereça o Rick.

NUNCA: prometer resultado; inventar preço, desconto, prazo ou função; dar desconto (desconto, condição especial ou exceção: passa pra equipe); falar mal de concorrente ou agência; citar cliente da escola ou números de outro negócio; mandar link de pagamento (a equipe manda); insistir depois de um "não" claro; atender quem é do RS com a oferta online (é do RS: passa pra equipe, o Guto decide a oferta).

PASSA PRA EQUIPE NA HORA: quer começar ou pediu o link; pediu desconto ou condição diferente; reclamação, dúvida que você não sabe ou assunto fora do produto; é do RS; pediu pra falar com uma pessoa.`
}

function leResposta(txt: string) {
  const tags = (n: string) => [...txt.matchAll(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`, 'g'))].map(m => m[1].trim())
  const uma = (n: string) => tags(n)[0] || ''
  const acao = (uma('acao').toLowerCase().match(/comecar|começar|rick|equipe|perdido|rs|nenhuma/) || ['nenhuma'])[0].replace('começar', 'comecar')
  return { mensagens: tags('msg').filter(Boolean).slice(0, 3), acao, motivo: uma('motivo'), periodo: uma('periodo'), resumo: uma('resumo') }
}

// ---------- o atendimento ----------
export async function atendeVenda(id: string) {
  const cv: any = await db.um('wa_conversas', { id })
  if (!cv || cv.modo !== 'ia' || cv.optout) return { pulou: 'sem conversa ou não está com a IA' }
  // 24/11: número do time (o que recebe os avisos, MAIA_AVISO_EQUIPE_WHATS, ou MAIA_FONES_EQUIPE) nunca vira lead nem é atendido
  // pela vendedora (alguém do time tocou num aviso e caiu na conversa de venda): sai da fase de venda e fica com o time
  const fim8 = (x: string) => String(x || '').replace(/\D/g, '').slice(-8)
  const time = [...String(process.env.MAIA_AVISO_EQUIPE_WHATS || '').split(','), ...String(process.env.MAIA_FONES_EQUIPE || '').split(',')].map(fim8).filter(x => x.length === 8)
  if (time.includes(fim8(cv.telefone))) {
    await db.atualiza('wa_conversas', { id }, { fase: 'equipe', modo: 'humano' })
    return { pulou: 'número do time' }
  }
  const E = await escola()
  const mx = cv.rascunho?.maia || {}
  // o lead da escola: o do quiz (pelo telefone) ou um novo (chamou direto)
  const sufixo = String(cv.telefone || '').replace(/\D/g, '').slice(-8)
  let lead = mx.lead_id ? { id: mx.lead_id, ...(await E.achaLead(sufixo).catch(() => null)) } : await E.achaLead(sufixo).catch(() => null)
  if (!lead?.id) {
    lead = await E.criaLead({
      nome: cv.nome || null, whatsapp: telefoneBR(cv.telefone) || String(cv.telefone).replace(/\D/g, ''), etapa: 'aguardando_atendimento', origem: 'whatsapp', atendido_por: 'ia',
      negocio: 'Maia · chamou direto no WhatsApp da Maia', qualificacao: { produto: 'Maia', origem: 'whatsapp_maia', maia_etapa: 'novo' },
    })
    await E.andamento(lead.id, 'Chamou direto no WhatsApp da Maia (sem o quiz). A Maia está atendendo.', ETAPA_FUNIL.novo)
  }
  if (mx.lead_id !== lead.id) await db.atualiza('wa_conversas', { id }, { rascunho: { ...(cv.rascunho || {}), maia: { ...mx, lead_id: lead.id, venda: true } } })
  if ((cv.ia_respostas || 0) >= MAX) {
    await db.atualiza('wa_conversas', { id }, { modo: 'humano' })
    await avisaTime('conversa longa no WhatsApp da Maia, assume', `${cv.nome || cv.telefone}: ${String(cv.ultima_msg || '').slice(0, 140)}`)
    return { pulou: 'conversa longa: passou pra equipe' }
  }
  const msgs = await db.lista('wa_msgs', { conversa_id: id }, { ordem: 'criado_em' })
  const historico = msgs.slice(-40).map((x: any) => `${x.autor === 'cliente' ? 'DONO DO NEGÓCIO' : x.autor === 'dono' || x.autor === 'equipe' ? 'EQUIPE' : 'MAIA'}: ${x.texto}`).join('\n')
  const diag = diagnosticoTexto(lead)
  const pedido = `${cv.nome ? 'Nome no WhatsApp: ' + cv.nome + '\n' : ''}DIAGNÓSTICO DO QUIZ: ${diag ? '\n' + diag : 'não fez o quiz (chamou direto).'}
${ehRS(lead) ? 'ATENÇÃO: ele é do RS. Não ofereça a oferta online: diga que a equipe vai falar com ele e use a ação rs.\n' : ''}
CONVERSA ATÉ AGORA:
${historico}

Responda a(s) última(s) mensagem(ns). Responda SÓ neste formato:
<msg>primeira mensagem de WhatsApp</msg>
<msg>segunda (opcional; no máximo 3)</msg>
<acao>nenhuma | comecar | rick | equipe | perdido | rs</acao>
<motivo>se for equipe ou perdido: o motivo em poucas palavras</motivo>
<periodo>se for comecar ou rick: o dia e o período que ele disse (ou vazio)</periodo>
<resumo>o negócio dele, a cidade e o que ele quer, em uma frase pra equipe</resumo>`
  let o: ReturnType<typeof leResposta>
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY as string, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODELO(), max_tokens: 1200, system: REGRAS_VENDA(), messages: [{ role: 'user', content: pedido }] }),
      signal: AbortSignal.timeout(60000),
    })
    const j = await r.json()
    if (!r.ok) throw new Error('IA ' + r.status + ' ' + JSON.stringify(j).slice(0, 200))
    o = leResposta((j.content || []).map((x: any) => x.text || '').join(''))
    if (!o.mensagens.length) throw new Error('a IA respondeu sem mensagem')
  } catch (e: any) {
    await db.atualiza('wa_conversas', { id }, { modo: 'humano' })
    await avisaTime('a vendedora da Maia falhou, assume', `${cv.nome || cv.telefone}: ${String(e?.message || e).slice(0, 140)}`)
    return { erro: String(e?.message || e) }
  }
  for (const t of o.mensagens) await registraSaida(cv, 'ia', t, await enviaTexto(cv.telefone, t))
  // a etapa da Maia no lead (e o andamento quando muda)
  const q = lead.qualificacao || {}
  const etapaAntes = q.maia_etapa || 'novo'
  const etapa = o.acao === 'comecar' ? 'proposta' : o.acao === 'rick' ? 'reuniao' : o.acao === 'perdido' ? 'perdido' : ['proposta', 'reuniao', 'ganho'].includes(etapaAntes) ? etapaAntes : 'conversando'
  const humano = ['equipe', 'rs'].includes(o.acao)
  await db.atualiza('wa_conversas', { id }, { ia_respostas: (cv.ia_respostas || 0) + 1, ...(humano ? { modo: 'humano' } : {}) })
  const quem = `${cv.nome || q.negocio || cv.telefone} (${q.negocio ? q.negocio + ', ' : ''}${q.cidade || '?'}/${q.uf || '?'})`
  if (etapa !== etapaAntes || o.acao !== 'nenhuma') {
    await E.atualizaLead(lead.id, { qualificacao: { ...q, maia_etapa: etapa, ...(o.acao === 'perdido' ? { maia_motivo_perda: o.motivo || null } : {}) }, atendido_por: humano ? 'humano' : 'ia' }).catch(() => null)
    const nota = o.acao === 'comecar' ? `Quer começar (${o.periodo || 'período a combinar'}). Mandar o link do 1º mês (R$ ${OFERTA_QUIZ.primeiro_mes}) e marcar a implantação.`
      : o.acao === 'rick' ? `Quer a conversa de 20 min com o Rick (${o.periodo || 'dia a combinar'}). Confirmar o horário e mandar o link.`
      : o.acao === 'perdido' ? `Perdido: ${o.motivo || 'sem motivo'}.`
      : humano ? `Passou pra equipe (${o.acao === 'rs' ? 'é do RS: o Guto decide a oferta' : o.motivo || 'pediu'}). A IA parou nessa conversa.`
      : 'A Maia começou a conversar no WhatsApp.'
    await E.andamento(lead.id, `${nota}${o.resumo ? ' Resumo: ' + o.resumo : ''}`, ETAPA_FUNIL[etapa] || null).catch(() => null)
  }
  if (o.acao === 'comecar') await avisaTime('quer começar 💰', `${quem}: ${o.resumo || ''} Período: ${o.periodo || '?'}. Mandar o link do 1º mês e marcar a implantação.`)
  if (o.acao === 'rick') await avisaTime('marcar conversa com o Rick', `${quem}: ${o.resumo || ''} Quando: ${o.periodo || '?'}. Confirmar o horário com ele e mandar o link.`)
  if (humano) await avisaTime(o.acao === 'rs' ? 'lead do RS no WhatsApp da Maia' : 'passa pra equipe (WhatsApp da Maia)', `${quem}: ${o.motivo || o.resumo || ''}`)
  return { ok: true, acao: o.acao, etapa, lead_id: lead.id, enviadas: o.mensagens.length, simulado: ehSimulado(cv.telefone) }
}
