// Maia: o teste grátis no WhatsApp (02/11). Usa o número do Oito Posts (o Pata no Feed não está em uso).
// Quem chega pelo botão do site da Maia (/maia: "Quero a demonstração grátis da Maia") ou pelo anúncio entra na fase 'maia' e é
// atendido aqui, não pelo agente do Oito. Quer começar → passa pro Guto.
// 06/11 (teste no tráfego, o funil É a demonstração): 1) o anúncio; 2) a primeira resposta em segundos, sem IA, com o custo REAL
// da conversa (só se for bom); 3) entrevista curta; 4) a AMOSTRA no negócio dele (fotos e vídeo → anúncio pronto no dia seguinte,
// revisado pela equipe; demo-amostra.ts); 5) a retomada única de 24 h (rotina); 6) a proposta com o resumo REAL da semana.
// Áudio: o que chega é transcrito (Deepgram); a resposta vai em áudio também quando a pessoa mandou áudio
// ou na proposta, se ELEVENLABS_API_KEY estiver no servidor (voz "Maia" criada no Voice Design, MAIA_VOZ_ID).
import { oitoDb as db } from '@/lib/oito/db'
import { enviaTexto, registraSaida, enviaAudio, sobeMidia } from '@/lib/oito/wa'
import { avisaDono } from '@/lib/oito/servico'
import { oferta, textoOferta } from './oferta'

const MODELO = process.env.MAIA_MODELO || process.env.OITO_MODELO || 'claude-sonnet-5-5'
const VOZ = () => process.env.MAIA_VOZ_ID || '5QMOJHwbSpbG7akM67Nn'
export const MAX_MAIA = 30

// a mensagem do botão do site, ou alguém que pede a Maia pelo nome
export const pedeMaia = (txt: string) => /\bmaia\b/i.test(String(txt || ''))

const FRASE_AMOSTRA = 'Me manda 2 fotos do teu produto e um vídeo curto. Amanhã te devolvo um anúncio pronto, com arte, vídeo editado e texto, pro teu negócio.'

const REGRAS = () => `Tu és a Maia, uma IA que faz o marketing de negócios locais pelo WhatsApp: cria e sobe os anúncios na Meta, atende os clientes do negócio no WhatsApp 24 horas, conta as vendas (de qual anúncio veio cada uma) e melhora tudo mês a mês. A dona ou o dono só aprova os anúncios, com um joinha. Tu és um produto da Carreira no Digital (escola de marketing com IA de Lajeado e Porto Alegre, RS).

AGORA tu estás fazendo a DEMONSTRAÇÃO GRÁTIS pra um dono de negócio que chegou pelo teu anúncio (ou pelo site). O objetivo é ele sentir na pele como tu trabalharia pro negócio DELE e querer começar.

TUA PERSONALIDADE: vendedora esperta e focada em resultado, com jeito de colega de trabalho queridona. Séria quando o assunto é dinheiro, preço ou número; leve e divertida nos momentos certos, nunca palhaça. Fala "tu", com jeito gaúcho leve ("ó", "viu?", às vezes "bah"). Frases curtas, uma ideia por mensagem, uma pergunta por vez. No máximo 1 emoji por mensagem. Nunca bajula ("que pergunta ótima"), nunca palavrão. Tu és uma IA e nunca esconde isso.

O ROTEIRO (vai no ritmo da pessoa, não pula etapa, não despeja tudo de uma vez):
1. A APRESENTAÇÃO já foi feita pelo sistema (a primeira mensagem da conversa): não te apresenta de novo.
2. ENTREVISTA CURTA, uma pergunta por vez: o que ele vende (o principal produto ou serviço) e o preço; a cidade; quem é o cliente típico. Com essas 3 respostas já segue (se ele já contou alguma, não pergunta de novo).
3. UM GOSTINHO: "Ó, com isso eu já faria assim:" e 3 ganchos de anúncio numa mensagem só (TODOS com a cidade ou "X e região" + o público, ex.: "Quem é de Lajeado e região e...").
4. A AMOSTRA, logo em seguida, com esta frase (pode mudar só o começo): "${FRASE_AMOSTRA}" Se ele não tiver vídeo, as 2 fotos bastam. O bloco SITUAÇÃO DA AMOSTRA diz se tem vaga nesta semana; se não tiver, avisa a data que ele diz. Quem confere as fotos quando chegam é o sistema: tu não avalia foto e não diz que recebeu.
5. ENQUANTO A AMOSTRA NÃO CHEGA, o TESTE DO ATENDIMENTO: "Finge que tu é um cliente teu que viu esse anúncio e me manda uma mensagem." Quando ele mandar, responde COMO SE FOSSE O ATENDIMENTO DO NEGÓCIO DELE (simpática, objetiva, usando o que ele contou, oferecendo horário ou fechando o pedido). Depois sai do personagem: "Isso é o que eu faria com cada cliente, de dia e de madrugada."
6. A PROPOSTA (depois que a amostra chegou, ou antes se ele perguntar o preço): primeiro o resumo REAL da semana da campanha que trouxe ele, com os números do bloco NÚMEROS REAIS (diz que é a campanha de verdade, desta semana, e que é assim que ele recebe o dele toda segunda). Esse resumo vai também em áudio (campo "audio"). Depois a oferta (bloco A OFERTA). Pergunta se ele quer começar.
7. Se ele quiser começar, pedir pra falar com alguém, pedir desconto além do que está na oferta, ou tiver dúvida que tu não sabe: passar_para_humano true e diz que o Guto, da Carreira no Digital, continua a conversa ali mesmo, ainda hoje.

A OFERTA (só isto, sem inventar condição):
${textoOferta()}

REGRAS:
- NUNCA inventa número. Número de campanha, de conversa, de custo ou de resultado só do bloco NÚMEROS REAIS. Se o bloco diz que não tem número, não fala de número. Os números da campanha são pra PROPOSTA: antes disso não fala deles, e nunca "corrige" o número da primeira mensagem (ele é o total desde o começo; o da semana é outro recorte, os dois estão certos).
- No teste do atendimento e nos ganchos, usa SÓ o que ele te contou (produto, preço, cidade, como funciona). O que ele não contou (o que inclui o serviço, horários, endereço, formas de pagamento), tu NÃO inventa: no atendimento de teste diz "isso eu confirmo com o [nome do dono] e já te respondo".
- No teste do atendimento tu PODES explicar de forma geral como esse tipo de serviço costuma funcionar, deixando claro que os detalhes do jeito dele o dono confirma. Diz "vou confirmar" no máximo UMA vez por assunto.
- SEMPRE "tu", nunca "você", inclusive no teste do atendimento.
- Nunca promete venda, faturamento nem devolução de dinheiro. Pode dizer o que tu FAZ, e que ele vai VER cada número.
- Se ele sair do roteiro (pergunta de preço, de como funciona, objeção), responde direto e volta pro roteiro.
- Objeção "não tenho tempo": é justamente o ponto, ele só dá um joinha. "Já tentei agência": aqui não tem reunião e ele vê cada venda. "É caro": compara com uma agência de tráfego e conteúdo (a partir de R$ 1.700 por mês, só em horário comercial) + uma atendente (a partir de R$ 2.500, 44 horas por semana, sem fim de semana). A Maia faz as duas coisas, 24 horas, a partir de R$ ${oferta().essencial}.
- Se a pessoa mandou áudio, responde com um áudio curto também (campo "audio", até 40 palavras, falado, sem emoji e sem lista) e o essencial em texto.
- Se ele disser que não tem interesse: agradece, deixa a porta aberta, não insiste.`

// transcreve um áudio que chegou (Deepgram, a mesma chave das gravações da escola)
export async function transcreve(buf: Buffer, mime: string): Promise<string> {
  const k = process.env.DEEPGRAM_API_KEY
  if (!k) return ''
  const r = await fetch('https://api.deepgram.com/v1/listen?model=nova-3&language=pt-BR&smart_format=true', {
    method: 'POST', headers: { Authorization: 'Token ' + k, 'Content-Type': mime || 'audio/ogg' }, body: new Uint8Array(buf), signal: AbortSignal.timeout(30000),
  })
  const j: any = await r.json().catch(() => ({}))
  return String(j?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '').trim()
}

// fala um texto com a voz da Maia (Ogg Opus, o formato do áudio do WhatsApp); null se não houver chave
async function fala(texto: string): Promise<Buffer | null> {
  const k = process.env.ELEVENLABS_API_KEY
  if (!k || !texto.trim()) return null
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOZ()}?output_format=opus_48000_64`, {
    method: 'POST', headers: { 'xi-api-key': k, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: texto.slice(0, 600), model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.45, similarity_boost: 0.85, style: 0.3, use_speaker_boost: true, speed: 1.12 } }),
    signal: AbortSignal.timeout(40000),
  })
  if (!r.ok) return null
  return Buffer.from(await r.arrayBuffer())
}

// lê a resposta da IA (marcas <msg>, <audio>...): à prova de aspas e quebras de linha, que estragavam o JSON
export function leResposta(txt: string) {
  const todas = (tag: string) => [...txt.matchAll(new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>', 'g'))].map(m => m[1].trim()).filter(Boolean)
  const uma = (tag: string) => todas(tag)[0] || ''
  // 06/11: o que a entrevista levantou (vai pro pedido da amostra)
  const entrevista: Record<string, string> = {}
  for (const k of ['negocio', 'produto', 'preco', 'cidade', 'publico', 'nicho', 'como_compra']) { const v = uma(k); if (v && !/^(-|\?|não sei|nao sei|vazio)$/i.test(v)) entrevista[k] = v.slice(0, 160) }
  return { mensagens: todas('msg').slice(0, 3), audio: uma('audio'), etapa: uma('etapa').toLowerCase().replace(/[^a-z_]/g, ''), passar_para_humano: /^s/i.test(uma('humano')), resumo: uma('resumo'), entrevista }
}

// 06/11: o que a IA precisa saber da amostra pra falar certo (tem vaga? já foi? quando chega?)
async function situacaoAmostra(mx: any) {
  const a = await import('./demo-amostra')
  if (mx.amostra) {
    const { maiaDb } = await import('./db')
    const n = await maiaDb.um('negocios', { id: mx.amostra })
    const d = n?.contexto?.demo
    if (d?.status === 'enviada') return 'a amostra JÁ FOI ENTREGUE (arte e texto pro negócio dele, mais acima na conversa). Agora é a PROPOSTA.'
    if (d?.status === 'falta_cidade') return 'as fotos já chegaram, mas falta a CIDADE do negócio (vai no anúncio). Se ele ainda não disse, pergunta a cidade. Quando ele disser, confirma que agora a amostra vai pra equipe e chega ' + a.diaTxt(d.entrega) + '. Não pede foto de novo.'
    if (d?.status === 'fila') return `as fotos já chegaram; a amostra está na fila e chega ${a.diaTxt(d.entrega)}. Não pede foto de novo.`
    if (d) return `as fotos já chegaram e a amostra está sendo feita (chega ${a.diaTxt(d.entrega)}, revisada pela equipe). Não pede foto de novo. Segue com o teste do atendimento.`
  }
  const v = await a.proximaVaga()
  return v.agora ? 'ainda não pediu (ou ele ainda não mandou as fotos). TEM vaga nesta semana: usa a frase da amostra como está.'
    : `ainda não pediu. NÃO tem vaga nesta semana (as ${a.LIMITE_SEMANA()} amostras que a equipe revisa já foram): pede as fotos do mesmo jeito, mas troca "Amanhã te devolvo" por "a tua fica pronta ${a.diaTxt(v.entrega)}" e explica em meia frase que a equipe revisa cada uma.`
}

export async function atendeMaia(id: string) {
  const cv: any = await db.um('wa_conversas', { id })
  if (!cv || cv.modo !== 'ia' || cv.optout) return
  if ((cv.ia_respostas || 0) >= MAX_MAIA) {
    await db.atualiza('wa_conversas', { id }, { modo: 'humano' })
    avisaDono('Maia: conversa longa, assume', `${cv.nome || cv.telefone}: ${String(cv.ultima_msg || '').slice(0, 140)}`)
    return
  }
  const mx = cv.rascunho?.maia || {}
  const amostra = await import('./demo-amostra')
  try {
    // 06/11: 1) a primeira resposta, em segundos e sem IA (o custo real da conversa só aparece se for bom)
    if (!mx.primeira && !(cv.ia_respostas > 0)) {
      const t = await amostra.primeiraMensagem(mx.origem)
      await registraSaida(cv, 'ia', t, await enviaTexto(cv.telefone, t))
      await amostra.salvaMaia(id, { primeira: new Date().toISOString() })
      await db.atualiza('wa_conversas', { id }, { ia_respostas: 1, etapa: 'apresentacao' })
      return
    }
    // a amostra aprovada estava esperando ele voltar (fora das 24 h): entrega agora
    if (await amostra.entregaSePendente(cv)) { await db.atualiza('wa_conversas', { id }, { ia_respostas: (cv.ia_respostas || 0) + 1 }); return }
    // chegaram fotos ou vídeo: quem responde é o fluxo da amostra (confere a foto, faz o pedido, fila com data)
    const fixas = await amostra.midiasNovas(cv).catch(async (e: any) => {
      const { avisaEquipe } = await import('./canal')
      await avisaEquipe('amostra da demonstração falhou', `${cv.nome || cv.telefone}: ${String(e?.message || e).slice(0, 140)}`, null, true).catch(() => null)
      return null
    })
    if (fixas?.length) { await db.atualiza('wa_conversas', { id }, { ia_respostas: (cv.ia_respostas || 0) + 1 }); return }
  } catch (e: any) {
    await db.atualiza('wa_conversas', { id }, { modo: 'humano' })
    avisaDono('Maia (demonstração falhou), assume', `${cv.nome || cv.telefone}: ${String(e?.message || '').slice(0, 140)}`)
    return
  }
  const atual: any = (await db.um('wa_conversas', { id })) || cv
  const mxa = atual.rascunho?.maia || {}
  const msgs = await db.lista('wa_msgs', { conversa_id: id }, { ordem: 'criado_em' })
  const historico = msgs.slice(-40).map((x: any) => `${x.autor === 'cliente' ? 'DONO DO NEGÓCIO' : x.autor === 'dono' ? 'GUTO' : 'MAIA'}: ${x.texto}`).join('\n')
  const ultimaFoiAudio = /^\(áudio\)/.test(String(msgs.filter((x: any) => x.autor === 'cliente').slice(-1)[0]?.texto || ''))
  const [situacao, numeros] = await Promise.all([situacaoAmostra(mxa).catch(() => 'sem informação: não promete data.'), amostra.blocoNumeros().catch(() => 'Campanha: sem número agora (não fala de número da campanha).')])
  const sabe = Object.entries(mxa.entrevista || {}).map(([k, v]) => `${k}: ${v}`).join('; ')
  const pedido = `${cv.nome ? 'Nome no WhatsApp: ' + cv.nome + '\n' : ''}O QUE TU JÁ SABE DO NEGÓCIO DELE: ${sabe || 'nada ainda'}
SITUAÇÃO DA AMOSTRA: ${situacao}
NÚMEROS REAIS (pra proposta; não usa nenhum outro):
${numeros}

CONVERSA ATÉ AGORA:\n${historico}\n\nResponde a(s) última(s) mensagem(ns). Responde SÓ neste formato, sem nada fora das marcas:
<msg>primeira mensagem de WhatsApp</msg>
<msg>segunda (opcional; no máximo 3 no total)</msg>
<audio>texto falado pra mandar em áudio, ou deixa vazio</audio>
<etapa>entrevista | ganchos | pede_amostra | teste_atendimento | proposta | quer_comecar | sem_interesse</etapa>
<humano>sim ou não (sim = passar pro Guto)</humano>
<resumo>o negócio da pessoa e o que ela quer, em uma frase</resumo>
<negocio>nome do negócio, se ele disse (senão vazio)</negocio>
<produto>o principal produto ou serviço</produto>
<preco>o preço que ele disse</preco>
<cidade>a cidade</cidade>
<publico>o cliente típico</publico>
<nicho>o tipo de negócio, em 1 a 3 palavras</nicho>
(nas marcas do negócio, só o que ele contou; o que não sabe, deixa vazio)`
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY as string, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODELO, max_tokens: 1500, system: REGRAS(), messages: [{ role: 'user', content: pedido }] }),
      signal: AbortSignal.timeout(60000),
    })
    const j = await r.json()
    if (!r.ok) throw new Error('IA ' + r.status + ' ' + JSON.stringify(j).slice(0, 200))
    const txt = (j.content || []).map((x: any) => x.text || '').join('')
    const o = leResposta(txt)
    if (!o.mensagens.length) throw new Error('resposta sem mensagem: ' + txt.slice(0, 120))
    // áudio primeiro (quando houver), depois os textos
    const querAudio = (o.audio || '').trim() && (ultimaFoiAudio || o.etapa === 'proposta')
    if (querAudio) {
      const ogg = await fala(o.audio as string).catch(() => null)
      if (ogg) {
        const up = await sobeMidia(ogg, 'audio/ogg', 'maia.ogg')
        if (up.ok && up.id) await registraSaida(cv, 'ia', '(áudio) ' + o.audio, await enviaAudio(cv.telefone, up.id), 'audio')
      }
    }
    for (const t of (o.mensagens || []).filter(Boolean).slice(0, 3)) await registraSaida(cv, 'ia', t, await enviaTexto(cv.telefone, t))
    await db.atualiza('wa_conversas', { id }, { ia_respostas: (cv.ia_respostas || 0) + 1, etapa: o.etapa || cv.etapa, ...(o.passar_para_humano ? { modo: 'humano' } : {}) })
    if (Object.keys(o.entrevista).length || o.resumo) await amostra.salvaMaia(id, { entrevista: { ...(mxa.entrevista || {}), ...o.entrevista }, ...(o.resumo ? { resumo: o.resumo.slice(0, 300) } : {}) })
    // 06/11: as fotos chegaram antes da cidade: com a cidade, a amostra segue pra oficina
    if (o.entrevista.cidade) await amostra.cidadeChegou(id, { ...(mxa.entrevista || {}), ...o.entrevista }).catch(() => null)
    if (o.passar_para_humano || o.etapa === 'quer_comecar') avisaDono('Maia: quer começar 💰', `${cv.nome || cv.telefone}: ${o.resumo || ''}`.slice(0, 200), true)
  } catch (e: any) {
    await db.atualiza('wa_conversas', { id }, { modo: 'humano' })
    avisaDono('Maia (IA falhou), assume', `${cv.nome || cv.telefone}: ${String(e?.message || '').slice(0, 140)}`)
  }
}
