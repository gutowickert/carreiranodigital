// Maia: vídeo com LOCUÇÃO (13/11, aprovado pelo Guto). Metade dos donos não quer aparecer no vídeo. O formato: vários takes
// curtos e reais do dia a dia do negócio (os vídeos que o dono mandou) + uma voz lendo a copy do anúncio por cima
// (gancho → problema → solução → CTA pro WhatsApp), com a legenda no tempo da fala e o cartão final.
//   1. a IA escreve o roteiro a partir da peça (gancho, texto, CTA), com ~20 a 40 s de fala (escreveRoteiro);
//   2. a ElevenLabs fala o roteiro e devolve o tempo de cada letra (falaComTempo, endpoint "with-timestamps"): a legenda sai
//      daí, sem precisar da Deepgram;
//   3. o áudio vai pro armazenamento e o tempo das palavras vai nos dados da tarefa (JSON); a oficina junta os takes na ordem,
//      corta em cima do tempo da locução, tira o som original e monta (maia-oficina/video.js, editarLocucao).
// A peça continua sendo 'anuncio_video' (sem mudar o banco): a tarefa leva dados.variante = 'locucao' e dados.midia_ids (os takes).
// A voz: contexto.voz_locucao do negócio, senão MAIA_VOZ_LOCUCAO, senão a voz da Maia (a mesma do áudio do atendimento).
// O custo: o roteiro anota 'uso_ia' com tipo 'locucao' e a fala anota 'voz_locucao' (caracteres), que o custo.ts soma no tipo 'locucao'.
import { maiaDb as db } from './db'
import { emJson } from './ia'
import { textoFalado } from './voz'
import { tomDoNegocio } from './tom'

export type Palavra = { txt: string; ini: number; fim: number }
export type Roteiro = { partes: { papel: 'gancho' | 'problema' | 'solucao' | 'cta'; texto: string }[]; texto: string }

const VOZ_MAIA = '5QMOJHwbSpbG7akM67Nn'
export const vozDaLocucao = (neg: any) => String(neg?.contexto?.voz_locucao || process.env.MAIA_VOZ_LOCUCAO || neg?.meta?.atendimento?.voz_id || process.env.MAIA_VOZ_ID || VOZ_MAIA)
// a locução precisa da chave da ElevenLabs (a mesma do áudio do atendimento). Sem ela, a Maia não cria vídeo com locução
export const locucaoLigada = () => !!process.env.ELEVENLABS_API_KEY && process.env.MAIA_LOCUCAO !== '0'

// a voz da ElevenLabs em português fala ~2,2 palavras por segundo (teste de 13/11: 90 palavras deram 41 s):
// 45 a 75 palavras dá ~20 a 34 s
const PALAVRAS_MIN = 45, PALAVRAS_MAX = 75

// 1. o roteiro (a IA). Só o que a peça e a base dizem: não inventa preço, prazo nem brinde
export async function escreveRoteiro(neg: any, peca: { gancho?: string; texto?: string; cta?: string }, op: { takes?: string[] } = {}): Promise<Roteiro> {
  const t = tomDoNegocio(neg), voce = t.pessoa === 'voce'
  const r = await emJson<Roteiro>(`Tu és a redatora de locução da Maia (Carreira no Digital). Escreves o texto que uma voz lê por cima de um vídeo de anúncio de um pequeno negócio, em português do Brasil, falando com o CLIENTE do negócio. (Estas instruções falam contigo usando "tu"; na locução vale só o jeito de falar abaixo.)
JEITO DE FALAR: ${voce ? 'trata o ouvinte por "você" (seu, sua). NUNCA "tu", "teu", "tua"' : 'trata o ouvinte por "tu" (teu, tua), do jeito do Sul'}; ${t.gaucho ? 'pode ter um toque gaúcho leve' : 'português neutro, sem regionalismo'}; frases curtas, faladas, como gente conversando (nada de texto de folheto).
ESTRUTURA (4 partes, nessa ordem): gancho (1 frase que prende: público + situação, igual ao gancho do anúncio ou bem perto dele), problema (a dor ou o desejo do cliente), solução (o que o negócio faz, com o que a peça e a base dizem), cta (chama pro WhatsApp, curto, igual ou parecido com o CTA da peça).
TAMANHO: ${PALAVRAS_MIN} a ${PALAVRAS_MAX} palavras no total (20 a 35 segundos falados). Conta as palavras: passar de ${PALAVRAS_MAX} deixa o vídeo longo demais.
REGRAS: usa SÓ o que está na peça e em O QUE A MAIA SABE (preço, prazo, condição). Não inventa preço, desconto, brinde nem prazo. Nada de "hoje", "amanhã", "essa semana" (o anúncio roda por semanas). Sem emoji, sem hashtag, sem sigla difícil de falar, sem link. Número escrito do jeito que se fala bem ("R$ 79,90" pode ficar assim; a voz lê).`,
    `NEGÓCIO: ${neg.nome} (${neg.nicho || 'nicho não informado'}), ${neg.cidade || ''}.
O QUE A MAIA SABE: ${JSON.stringify(neg.contexto || {}).slice(0, 3000)}
A PEÇA:\nGancho: ${peca.gancho || '-'}\nTexto: ${peca.texto || '-'}\nCTA: ${peca.cta || '-'}
${op.takes?.length ? `OS TAKES QUE VÃO APARECER (só pra combinar; não descreve a imagem): ${op.takes.join(' | ')}\n` : ''}Devolve {"partes":[{"papel":"gancho","texto":"..."},{"papel":"problema","texto":"..."},{"papel":"solucao","texto":"..."},{"papel":"cta","texto":"..."}]}`,
    [], { uso: { tipo: 'locucao', negocio_id: neg.id || null } })
  const partes = (r.partes || []).filter(p => p && p.texto).map(p => ({ papel: p.papel, texto: textoFalado(String(p.texto)) }))
  if (!partes.length) throw new Error('a IA não devolveu o roteiro da locução')
  return { partes, texto: partes.map(p => p.texto).join(' ') }
}

// 2. a fala com o tempo de cada palavra (a ElevenLabs devolve o tempo de cada letra; aqui vira palavra)
export async function falaComTempo(voz: string, texto: string): Promise<{ audio: Buffer; palavras: Palavra[]; duracao: number; caracteres: number }> {
  const k = process.env.ELEVENLABS_API_KEY
  if (!k) throw new Error('sem ELEVENLABS_API_KEY: a locução precisa da voz')
  const t = textoFalado(texto).slice(0, 1200)
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voz)}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': k, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: t, model_id: process.env.MAIA_LOCUCAO_MODELO || 'eleven_multilingual_v2', language_code: 'pt', voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true } }),
    signal: AbortSignal.timeout(90000),
  })
  if (!r.ok) throw new Error(`a voz não saiu (ElevenLabs ${r.status}): ${(await r.text()).slice(0, 200)}`)
  const j: any = await r.json()
  const audio = Buffer.from(String(j.audio_base64 || ''), 'base64')
  if (audio.length < 1000) throw new Error('a ElevenLabs devolveu um áudio vazio')
  const al = j.normalized_alignment || j.alignment || {}
  const palavras = palavrasDoAlinhamento(al.characters || [], al.character_start_times_seconds || [], al.character_end_times_seconds || [])
  const duracao = palavras.length ? palavras[palavras.length - 1].fim : 0
  return { audio, palavras, duracao, caracteres: t.length }
}

// letras com tempo → palavras com tempo (o espaço separa; a pontuação fica grudada na palavra, como na Deepgram)
export function palavrasDoAlinhamento(letras: string[], ini: number[], fim: number[]): Palavra[] {
  const out: Palavra[] = []
  let atual: Palavra | null = null
  for (let i = 0; i < letras.length; i++) {
    const c = letras[i]
    if (/\s/.test(c)) { if (atual) { out.push(atual); atual = null } continue }
    if (!atual) atual = { txt: '', ini: +ini[i] || 0, fim: +fim[i] || 0 }
    atual.txt += c; atual.fim = +fim[i] || atual.fim
  }
  if (atual) out.push(atual)
  return out.map(p => ({ txt: p.txt, ini: Math.round(p.ini * 1000) / 1000, fim: Math.round(p.fim * 1000) / 1000 }))
}

// 3. tudo junto, na hora em que a oficina pega a tarefa (rota /api/maia/oficina): roteiro + voz + áudio no armazenamento.
// Fica salvo em tarefa.dados.locucao; se a oficina falhar e a tarefa voltar pra fila, não gera (nem paga) de novo
export async function preparaLocucao(tarefa: any): Promise<{ caminho: string; palavras: Palavra[]; texto: string; duracao: number } | null> {
  if (tarefa?.dados?.variante !== 'locucao') return null
  if (tarefa.dados.locucao?.caminho) return tarefa.dados.locucao
  const [peca, neg] = await Promise.all([db.um('pecas', { id: tarefa.peca_id }), db.um('negocios', { id: tarefa.negocio_id })])
  if (!peca || !neg) throw new Error('a tarefa de locução veio sem a peça ou o negócio')
  const takes = (await Promise.all((tarefa.dados.midia_ids || []).map((id: string) => db.um('midias', { id })))).filter(Boolean).map((m: any) => String(m.descricao || m.legenda || '').slice(0, 120))
  const roteiro = await escreveRoteiro(neg, peca, { takes })
  const voz = vozDaLocucao(neg)
  const f = await falaComTempo(voz, roteiro.texto)
  const caminho = await db.sobe(`${neg.id}/pecas/${peca.id}-locucao-${Date.now().toString(36)}.mp3`, f.audio, 'audio/mpeg')
  await db.evento('voz_locucao', neg.id, { peca_id: peca.id, tarefa_id: tarefa.id, caracteres: f.caracteres, voz, segundos: Math.round(f.duracao * 10) / 10 })
  const locucao = { caminho, palavras: f.palavras, texto: roteiro.texto, partes: roteiro.partes, duracao: f.duracao }
  await db.atualiza('tarefas', { id: tarefa.id }, { dados: { ...tarefa.dados, locucao } })
  return locucao
}
