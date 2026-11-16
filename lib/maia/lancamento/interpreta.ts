// Maia, lançamento: entender o que a pessoa respondeu na coleta. Com a IA quando dá (MAIA_LANC_IA=1, ou na Vercel com a chave);
// sem ela (teste local, ou a IA fora do ar), umas regras simples: a resposta vale pro passo em que a conversa está.
// A IA só ENTENDE (devolve JSON): as perguntas e as respostas da Maia são fixas (lancamento/conversa.ts), pra não sair do roteiro.
import { maiaLocal } from '../db'
import { emJson } from '../ia'

export const PASSOS = ['negocio', 'cidade', 'produtos', 'como_vende', 'carro_chefe', 'dificuldade', 'instagram', 'fotos', 'hora'] as const
export type Passo = typeof PASSOS[number]

export type Intencao = 'responde' | 'duvida' | 'preco' | 'sem_negocio' | 'agora_nao' | 'sem_foto' | 'sem_video' | 'so_essas' | 'quero_ver' | 'teste'
export type Leitura = {
  intencao: Intencao
  campos: Partial<{ negocio: string; nome_negocio: string; publico: string; cidade: string; produtos: string; como_vende: string; carro_chefe: string; dificuldade: string; instagram: string; hora: number }>
  duvida?: string
}

const sem = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

export const ehQueroVer = (t: string) => /^(quero ver|quero|sim|bora|vamos|pode ser|claro|ok|quero sim)[!. ]*$/.test(sem(t))
// "não" sozinho só vale como recusa na resposta ao convite (o botão "Agora não"); no meio da coleta é resposta ("não tenho Instagram")
export const ehAgoraNao = (t: string, convite = false) => (convite && /^(nao|nao obrigad[oa])[!. ]*$/.test(sem(t))) || /^(agora nao|nao quero|sem interesse)[!. ]*$/.test(sem(t)) || /nao (tenho|tem) interesse|nao me (chama|mande)|para de me mandar|desisti|deixa pra la|nao vou querer/.test(sem(t))
// 16/11 (Nando): as mesmas palavras que o webhook da escola trata como descadastro (PALAVRAS_OPTOUT). Fora do modo teste,
// quem manda uma delas pediu pra sair da lista: a Maia não responde e o contato vira "perdido"
export const ehDescadastro = (t: string) => /^(sair|parar|pare|cancelar|descadastrar|remover|stop)[!. ]*$/.test(sem(t))
// 16/11 (Nando): a SAUDAÇÃO AUTOMÁTICA do WhatsApp Business de quem recebeu o disparo ("X agradece seu contato. Como podemos
// ajudar?", "Seja bem-vindo à...", "em breve retornamos"). Na 1ª hora do lançamento, 110 das 128 primeiras respostas eram isso,
// e a Maia abria a coleta com cada uma. Não é interesse: a Maia fica quieta e a pessoa continua "Disparado"
export const ehAutoResposta = (t: string) => {
  const s = sem(t)
  if (!s || /^quero ver/.test(s)) return false
  return /(agradece (o |pelo )?(seu )?contato|como (podemos|posso) (te |lhe )?ajudar|seja (muito )?bem[- ]?vind|bem[- ]?vindo\(a\)|em breve (te |lhe )?(retorn|respond|iremos|vou|entraremos|falo)|assim que (possivel|puder)|obrigad[oa] (pelo|por) (seu |sua |ter )?(entrado em |entrar em )?(contato|mensagem)|mensagem automatica|resposta automatica|no momento (nao|estou|estamos)|fora do (nosso )?horario|recebemos (a )?sua mensagem|retornaremos|deixe (aqui )?(seu|sua) (recado|mensagem)|estou em atendimento|que (bom|otimo|prazer) (falar|receber|ter)|prazer (em )?ter voce|prazer te ter|e um prazer (te )?atend|para agilizar (seu|o) atendimento|bem[- ]?vind[oa]|bem -vind|seja bem\\b|agradeco (o |pelo )?(seu )?contato|agradecemos (por|pelo|o)|retornarei|ja (ja|lhe|te) (te )?atend|logo (logo |mais )?(vou|retorn|te atend|lhe atend)|em seguida (ja )?(vou|retorno|te respond)|digite \\d|numero secundario|o mais (rapido|breve) possivel|(me )?diz (o )?teu nome que|como posso ajuda)/.test(s)
}
// 16/11 (Nando): pediu pra falar com uma pessoa. A Maia avisa uma vez que chamou o time e fica quieta com essa pessoa
export const ehPedeHumano = (t: string) => /\b(humano|humana|atendente|pessoa de verdade|pessoa real|falar com (alguem|uma pessoa|o time|voces|o pessoal)|chama (alguem|o time|uma pessoa)|quero falar com)\b/.test(sem(t))
export const ehSair = (t: string) => /^(sair|sai|parar|pare|fim|encerrar|chega)[!. ]*$/.test(sem(t))
// 16/11 (Andréia): pergunta sobre a própria Maia no meio do modo teste (preço, ativação, implantação, contratar)
export const ehSobreMaia = (t: string) => {
  const x = sem(t)
  return /\bmaia\b/.test(x) || /\b(ativar|ativacao|implantacao|mensalidade|contratar|assinar|assinatura)\b/.test(x) || /\b(497|997)\b/.test(x)
}
// o texto pronto do botão da página da amostra liga o modo teste
export const ehGatilhoTeste = (t: string) => /\bmodo teste\b|quero testar a maia|testar como (se fosse|cliente)/.test(sem(t))
// 16/11 (entrega nova): o botão "Testar agora" que a Maia manda junto da amostra (só vale com MAIA_LANC_ENTREGA_V2=1)
export const ehTestarAgora = (t: string) => /^testar( a maia)? agora[!. ]*$/.test(sem(t))

// a hora da entrega: "10", "às 15h", "de manhã", "de tarde"; das 8h às 20h
export function lerHora(t: string): number | null {
  const s = sem(t)
  const m = s.match(/\b([01]?\d|2[0-3])\s*(h|:|hs|horas)?\b/)
  if (m) { const h = +m[1]; if (h >= 8 && h <= 20) return h; if (h >= 1 && h <= 7 && /tarde|noite/.test(s)) return h + 12 }
  if (/manha|cedo/.test(s)) return 10
  if (/tarde/.test(s)) return 15
  if (/qualquer|tanto faz|pode ser|tanto/.test(s)) return 10
  return null
}

// sem IA: regras simples
export function leituraSimples(texto: string, passo: Passo): Leitura {
  const s = sem(texto)
  if (ehAgoraNao(texto)) return { intencao: 'agora_nao', campos: {} }
  if (passo === 'instagram' && /^(nao|nao tenho|nao tem|sem|nenhum|ainda nao)\b/.test(s)) return { intencao: 'responde', campos: { instagram: 'não tem' } }
  if (/nao tenho (negocio|empresa|loja)|nao sou empresari|nao vendo nada|so (estudo|trabalho de clt)/.test(s)) return { intencao: 'sem_negocio', campos: {} }
  if (/quanto (custa|e|fica|sai)|qual (o )?(valor|preco)|\bpreco\b/.test(s) && s.includes('?')) return { intencao: 'preco', campos: {} }
  if (passo === 'fotos') {
    if (/nao tenho foto|sem foto|nao tenho nenhuma/.test(s)) return { intencao: 'sem_foto', campos: {} }
    if (/sem video|nao tenho video|nao tenho nenhum video|nao tenho$|so (tenho )?(essas|isso)|e isso|so isso/.test(s)) return { intencao: /video/.test(s) ? 'sem_video' : 'so_essas', campos: {} }
  }
  if (passo === 'hora') { const h = lerHora(texto); return h != null ? { intencao: 'responde', campos: { hora: h } } : (s.includes('?') ? { intencao: 'duvida', campos: {}, duvida: texto } : { intencao: 'responde', campos: {} }) }
  // pergunta que não é resposta: termina com "?" e não parece resposta curta
  if (/\?\s*$/.test(texto) && s.split(/\s+/).length >= 3 && passo !== 'instagram') return { intencao: 'duvida', campos: {}, duvida: texto }
  if (passo === 'fotos') return { intencao: 'responde', campos: {} }
  const campo = passo === 'negocio' ? 'negocio' : passo
  return { intencao: 'responde', campos: { [campo]: texto.trim().slice(0, 600) } as any }
}

const usaIA = () => process.env.MAIA_LANC_IA === '1' || (!maiaLocal() && process.env.MAIA_LANC_IA !== '0' && !!process.env.ANTHROPIC_API_KEY)

export async function interpreta(texto: string, passo: Passo, coleta: any): Promise<Leitura> {
  const simples = leituraSimples(texto, passo)
  // o que é certo sem IA não gasta IA
  if (!usaIA() || ['agora_nao', 'sem_foto', 'sem_video', 'so_essas'].includes(simples.intencao) || (passo === 'hora' && simples.campos.hora != null)) return simples
  try {
    const r = await emJson<Leitura>(
      'Tu lês as respostas que donos de pequenos negócios dão pra Maia (a IA da escola Carreira no Digital) numa conversa de WhatsApp em que ela coleta informações pra fazer uma amostra grátis de anúncios. Tu só entendes e devolves JSON: não escreves resposta.',
      `A pergunta da vez é sobre: ${passo} (negocio = o que vende e pra quem; cidade; produtos = 2 ou 3 produtos ou serviços com preço; como_vende = entrega, retirada, agendamento, horário; carro_chefe = o que mais vende ou dá mais lucro; dificuldade = a maior dificuldade pra vender hoje; instagram = o @, ou "não tem"; fotos = ela pediu fotos e vídeos; hora = a hora da entrega amanhã, 10h ou 15h).
O que já se sabe: ${JSON.stringify(coleta || {}).slice(0, 1500)}
A pessoa escreveu: """${texto.slice(0, 1500)}"""

Devolve {"intencao": "...", "campos": {...}, "duvida": "..."}:
- intencao: "responde" (respondeu, mesmo que curto ou "não sei"), "duvida" (fez uma pergunta que não é resposta e que a Maia não sabe: sobre a escola, contrato, como funciona, etc.), "preco" (perguntou quanto custa a Maia), "sem_negocio" (disse que não tem negócio), "agora_nao" (não quer mais), "sem_foto" (disse que não tem foto), "sem_video" (disse que não tem vídeo), "so_essas" (disse que só tem as fotos que já mandou).
- campos: só o que a pessoa disse de verdade, nas palavras dela, resumido: negocio (o que vende e pra quem), nome_negocio (o nome do negócio, se disse), publico, cidade, produtos (os produtos com preço, como texto), como_vende, carro_chefe, dificuldade, instagram (o @ ou "não tem"), hora (número de 8 a 20, só se disse a hora). Pode vir mais de um campo se ela respondeu várias coisas juntas. Não inventa nada.
- duvida: a pergunta, se intencao for "duvida".`,
      [], { uso: { tipo: 'lancamento' } })
    if (!r || !r.intencao) return simples
    r.campos = r.campos || {}
    // a resposta do passo da vez nunca se perde: se a IA não pôs o campo, vale o texto
    const campo = passo === 'negocio' ? 'negocio' : passo
    if (r.intencao === 'responde' && !['fotos', 'hora'].includes(passo) && !(r.campos as any)[campo]) (r.campos as any)[campo] = texto.trim().slice(0, 600)
    if (passo === 'hora' && r.campos.hora == null) { const h = lerHora(texto); if (h != null) r.campos.hora = h }
    return r
  } catch { return simples }
}

// pós-entrega: o que a pessoa quer agora (sem IA: regras simples)
export type Depois = 'quer_fechar' | 'nao_quer' | 'duvida' | 'outro'
export async function lePosEntrega(texto: string): Promise<Depois> {
  const s = sem(texto)
  let simples: Depois = 'outro'
  if (/quero (contratar|fechar|comecar|a maia|marcar)|como (faco|faz) pra (contratar|comecar|ter)|vamos fechar|pode marcar|quero a implantacao|fechado/.test(s)) simples = 'quer_fechar'
  else if (ehAgoraNao(texto, true) || /nao (e|eh) pra mim|nao tenho como pagar|muito caro|vou passar/.test(s)) simples = 'nao_quer'
  else if (s.includes('?')) simples = 'duvida'
  if (!usaIA()) return simples
  try {
    const r = await emJson<{ quer: Depois }>('Tu lês respostas de donos de negócio que receberam uma amostra grátis da Maia (IA de marketing da escola Carreira no Digital). Só devolves JSON.',
      `A pessoa escreveu: """${texto.slice(0, 1200)}"""\nDevolve {"quer": "quer_fechar" | "nao_quer" | "duvida" | "outro"}. quer_fechar = quer contratar, marcar a implantação ou saber como começar; nao_quer = recusou; duvida = fez uma pergunta; outro = elogio, comentário, agradecimento.`, [], { uso: { tipo: 'lancamento' } })
    return (['quer_fechar', 'nao_quer', 'duvida', 'outro'] as Depois[]).includes(r?.quer) ? r.quer : simples
  } catch { return simples }
}
