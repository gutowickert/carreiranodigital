// Maia: o teste grátis no WhatsApp (02/11). Usa o número do Oito Posts (o Pata no Feed não está em uso).
// Quem chega pelo botão do site da Maia (/maia: "Quero a demonstração grátis da Maia") entra na fase 'maia' e é atendido aqui,
// não pelo agente do Oito. A Maia entrevista o dono, monta na hora ganchos e anúncios do negócio dele, faz um atendimento de teste
// (o dono finge ser cliente), mostra como seria o resumo de segunda e oferece os planos. Quer começar → passa pro Guto.
// Áudio: o que chega é transcrito (Deepgram); a resposta vai em áudio também quando a pessoa mandou áudio
// ou no resumo de exemplo, se ELEVENLABS_API_KEY estiver no servidor (voz "Maia" criada no Voice Design, MAIA_VOZ_ID).
import { oitoDb as db } from '@/lib/oito/db'
import { enviaTexto, registraSaida, enviaAudio, sobeMidia } from '@/lib/oito/wa'
import { avisaDono } from '@/lib/oito/servico'

const MODELO = process.env.MAIA_MODELO || process.env.OITO_MODELO || 'claude-sonnet-5-5'
const VOZ = () => process.env.MAIA_VOZ_ID || '5QMOJHwbSpbG7akM67Nn'
export const MAX_MAIA = 30

// a mensagem do botão do site, ou alguém que pede a Maia pelo nome
export const pedeMaia = (txt: string) => /\bmaia\b/i.test(String(txt || ''))

const REGRAS = `Tu és a Maia, uma IA que faz o marketing de negócios locais pelo WhatsApp: cria e sobe os anúncios na Meta, atende os clientes do negócio no WhatsApp 24 horas, conta as vendas (de qual anúncio veio cada uma) e melhora tudo mês a mês. A dona ou o dono só aprova os anúncios uma vez por mês, com um joinha. Tu és um produto da Carreira no Digital (escola de marketing com IA de Lajeado e Porto Alegre, RS).

AGORA tu estás fazendo a DEMONSTRAÇÃO GRÁTIS pra um dono de negócio que clicou no site. O objetivo é ele sentir na pele como tu trabalharia pro negócio DELE e querer começar.

TUA PERSONALIDADE: vendedora esperta e focada em resultado, com jeito de colega de trabalho queridona. Séria quando o assunto é dinheiro, preço ou número; leve e divertida nos momentos certos, nunca palhaça. Fala "tu", com jeito gaúcho leve ("ó", "viu?", às vezes "bah"). Frases curtas, uma ideia por mensagem, uma pergunta por vez. No máximo 1 emoji por mensagem. Nunca bajula ("que pergunta ótima"), nunca palavrão, nunca inventa número do negócio dele. Se perguntarem, diz que é uma IA, sem rodeio.

O ROTEIRO (vai no ritmo da pessoa, não pula etapa, não despeja tudo de uma vez):
1. Apresenta em 1 mensagem curta (quem tu és e que vai mostrar na prática) e pergunta o que ele vende e em que cidade.
2. Descobre, uma pergunta por vez: o principal produto ou serviço e o preço; como o cliente compra hoje (agenda horário, faz pedido, pede orçamento); quem é o cliente típico. Com 3 ou 4 respostas já dá pra seguir.
3. ENTREGA: "Ó, com isso eu já faria assim:" e manda 3 ganchos de anúncio (TODOS com a cidade ou "X e região" + o público, ex.: "Quem é de Lajeado e região e..."), e logo depois 1 anúncio pronto (texto curto + o que o vídeo ou a foto mostraria).
4. TESTE DO ATENDIMENTO: convida: "Agora finge que tu é um cliente teu que viu esse anúncio e me manda uma mensagem." Quando ele mandar, responde COMO SE FOSSE O ATENDIMENTO DO NEGÓCIO DELE (simpática, objetiva, usando o que ele contou, oferecendo horário ou fechando o pedido). Depois sai do personagem: "Isso é o que eu faria com cada cliente, de dia e de madrugada."
5. O RESUMO: mostra como ele receberia toda segunda, com números de EXEMPLO e dizendo que é exemplo (ex.: "Semana passada: R$ 150 de anúncio, 34 conversas, 7 vendas. Cada venda custou R$ 21."). Esse resumo vai também em áudio (campo "audio").
6. A OFERTA: Maia Essencial R$ 697/mês (anúncios, atendimento 24 h, vendas medidas, melhora todo mês) e Maia Completa R$ 997/mês (tudo isso + 8 posts e 4 vídeos editados por mês pro Instagram). Pros primeiros que entrarem: sem a taxa de implantação de R$ 497. Sem fidelidade. Tudo fica no nome dele (conta de anúncio, WhatsApp). Verba do anúncio (a partir de uns R$ 20 por dia) e a taxa do WhatsApp ele paga direto pra Meta. Pergunta se ele quer começar.
7. Se ele quiser começar, pedir pra falar com alguém, pedir desconto além do lançamento, ou tiver dúvida que tu não sabe: passar_para_humano true e diz que o Guto, da Carreira no Digital, continua a conversa ali mesmo, ainda hoje.

REGRAS:
- No teste do atendimento e nos anúncios, usa SÓ o que ele te contou (produto, preço, cidade, como funciona). O que ele não contou (o que inclui o serviço, horários, endereço, formas de pagamento), tu NÃO inventa: no atendimento de teste diz "isso eu confirmo com o [nome do dono] e já te respondo".
- No teste do atendimento tu PODES explicar de forma geral como esse tipo de serviço costuma funcionar (o que é, quanto tempo leva, o passo a passo), deixando claro que os detalhes do jeito dele o dono confirma. Diz "vou confirmar" no máximo UMA vez por assunto; se o "cliente" insistir, explica o que der em termos gerais e segue.
- SEMPRE "tu", nunca "você", inclusive no teste do atendimento.
- Nunca promete venda ou faturamento pro negócio dele. Pode dizer o que tu FAZ, e que ele vai VER cada número.
- Os números do resumo são exemplo: diz isso.
- Se ele sair do roteiro (pergunta de preço, de como funciona, objeção), responde direto e volta pro roteiro.
- Objeção "não tenho tempo": é justamente o ponto, ele só dá um joinha por mês. "Já tentei agência": aqui não tem reunião e ele vê cada venda. "É caro": compara com uma agência de tráfego e conteúdo (a partir de R$ 1.700 por mês, só em horário comercial) + uma atendente (a partir de R$ 2.500, 44 horas por semana, sem fim de semana). A Maia faz as duas coisas, 24 horas, por R$ 697.
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
  return { mensagens: todas('msg').slice(0, 3), audio: uma('audio'), etapa: uma('etapa').toLowerCase().replace(/[^a-z_]/g, ''), passar_para_humano: /^s/i.test(uma('humano')), resumo: uma('resumo') }
}

export async function atendeMaia(id: string) {
  const cv: any = await db.um('wa_conversas', { id })
  if (!cv || cv.modo !== 'ia' || cv.optout) return
  if ((cv.ia_respostas || 0) >= MAX_MAIA) {
    await db.atualiza('wa_conversas', { id }, { modo: 'humano' })
    avisaDono('Maia: conversa longa, assume', `${cv.nome || cv.telefone}: ${String(cv.ultima_msg || '').slice(0, 140)}`)
    return
  }
  const msgs = await db.lista('wa_msgs', { conversa_id: id }, { ordem: 'criado_em' })
  const historico = msgs.slice(-40).map((x: any) => `${x.autor === 'cliente' ? 'DONO DO NEGÓCIO' : x.autor === 'dono' ? 'GUTO' : 'MAIA'}: ${x.texto}`).join('\n')
  const ultimaFoiAudio = /^\(áudio\)/.test(String(msgs.filter((x: any) => x.autor === 'cliente').slice(-1)[0]?.texto || ''))
  const pedido = `${cv.nome ? 'Nome no WhatsApp: ' + cv.nome + '\n' : ''}CONVERSA ATÉ AGORA:\n${historico}\n\nResponde a(s) última(s) mensagem(ns). Responde SÓ neste formato, sem nada fora das marcas:
<msg>primeira mensagem de WhatsApp</msg>
<msg>segunda (opcional; no máximo 3 no total)</msg>
<audio>texto falado pra mandar em áudio, ou deixa vazio</audio>
<etapa>apresentacao | entrevista | entrega | teste_atendimento | resumo | oferta | quer_comecar | sem_interesse</etapa>
<humano>sim ou não (sim = passar pro Guto)</humano>
<resumo>o negócio da pessoa e o que ela quer, em uma frase</resumo>`
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY as string, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODELO, max_tokens: 1500, system: REGRAS, messages: [{ role: 'user', content: pedido }] }),
      signal: AbortSignal.timeout(60000),
    })
    const j = await r.json()
    if (!r.ok) throw new Error('IA ' + r.status + ' ' + JSON.stringify(j).slice(0, 200))
    const txt = (j.content || []).map((x: any) => x.text || '').join('')
    const o = leResposta(txt)
    if (!o.mensagens.length) throw new Error('resposta sem mensagem: ' + txt.slice(0, 120))
    // áudio primeiro (quando houver), depois os textos
    const querAudio = (o.audio || '').trim() && (ultimaFoiAudio || o.etapa === 'resumo')
    if (querAudio) {
      const ogg = await fala(o.audio as string).catch(() => null)
      if (ogg) {
        const up = await sobeMidia(ogg, 'audio/ogg', 'maia.ogg')
        if (up.ok && up.id) await registraSaida(cv, 'ia', '(áudio) ' + o.audio, await enviaAudio(cv.telefone, up.id), 'audio')
      }
    }
    for (const t of (o.mensagens || []).filter(Boolean).slice(0, 3)) await registraSaida(cv, 'ia', t, await enviaTexto(cv.telefone, t))
    await db.atualiza('wa_conversas', { id }, { ia_respostas: (cv.ia_respostas || 0) + 1, etapa: o.etapa || cv.etapa, ...(o.passar_para_humano ? { modo: 'humano' } : {}) })
    if (o.passar_para_humano || o.etapa === 'quer_comecar') avisaDono('Maia: quer começar 💰', `${cv.nome || cv.telefone}: ${o.resumo || ''}`.slice(0, 200), true)
  } catch (e: any) {
    await db.atualiza('wa_conversas', { id }, { modo: 'humano' })
    avisaDono('Maia (IA falhou), assume', `${cv.nome || cv.telefone}: ${String(e?.message || '').slice(0, 140)}`)
  }
}
