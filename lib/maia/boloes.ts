// Maia: os BOLÕES DO DIA da lotérica (28/11, Lotérica do Zart).
// Toda manhã alguém da equipe manda pro número da Maia a lista (texto) ou a arte (foto) dos bolões do dia. A Maia lê com a IA,
// grava o evento 'boloes_do_dia' e passa a atender só com essa lista. "Esgotou o de 10" marca o item como esgotado.
// A lista do dia também vira o story do bolão do dia (stories.ts, bolaoDoDiaChegou).
import { maiaDb as db } from './db'
import { emJson } from './ia'

export type Bolao = { jogo: string; concurso?: string | null; sorteio?: string | null; premio_estimado?: string | null; numeros_por_jogo?: number | null; jogos?: number | null; cotas?: number | null; preco_cota?: number | null; obs?: string | null; esgotado?: boolean; foto?: string | null }

const semAc = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export const hojeBR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)

// só negócio de bolão: nicho lotérica, ou o cadastro fala de bolão
export const vendeBolao = (neg: any) => /loter/.test(semAc(neg?.nicho)) || /bolao|boloes/.test(semAc(JSON.stringify(neg?.contexto || {})))
const JOGOS = /\b(mega|quina|lotofacil|lotomania|timemania|dupla ?sena|dia de sorte|super ?sete|milionaria|federal|loteca|virada)\b/

// "esgotou o de 10", "acabou o bolão da quina", "o de 25 esgotou"
export function ehEsgotou(neg: any, texto: string) {
  if (!vendeBolao(neg)) return false
  const s = semAc(texto)
  return /\b(esgot\w*|acabou|acabaram|nao tem mais|vendeu tudo)\b/.test(s) && s.length < 200
}

// a lista do dia: texto com bolão + jogo + (cotas ou preço), ou a foto da arte (descrição com bolão/jogo/cota)
export function ehListaDeBoloes(neg: any, texto: string) {
  if (!vendeBolao(neg)) return false
  const s = semAc(texto)
  if (ehEsgotou(neg, texto)) return true
  const temJogo = JOGOS.test(s)
  const temValor = /r\$\s*\d|\bcotas?\b|\bdezenas?\b|\bnumeros\b/.test(s)
  const pareceLista = /\bbol(ao|oes)\b/.test(s) || /\b(hoje|do dia)\b/.test(s)
  // foto: o recebeDoDono já descreveu ("(mandou uma foto: ...)"); se a descrição fala de bolão/jogo e cota, é a arte do dia
  if (/^\(mandou uma foto/.test(s)) return temJogo && (/\bbol(ao|oes)\b|\bcotas?\b/.test(s))
  return temJogo && temValor && pareceLista
}

export async function boloesDeHoje(neg: any): Promise<{ data: string; itens: Bolao[]; criado_em?: string } | null> {
  const evs = await db.lista('eventos', { negocio_id: neg.id, tipo: 'boloes_do_dia' }, { ordem: 'criado_em', desc: true, limite: 5 })
  const e = evs.find((x: any) => x.detalhe?.data === hojeBR())
  return e ? { data: e.detalhe.data, itens: e.detalhe.itens || [], criado_em: e.criado_em } : null
}

const SIS = 'Tu lês a lista de bolões de loteria que a equipe de uma lotérica mandou (texto ou foto da arte). Extrai cada bolão exatamente como está escrito, sem inventar nada. Campo que não aparece fica null. Números em reais viram número (R$ 25 → 25; R$ 405,40 → 405.4). Prêmio estimado fica como texto ("R$ 82 milhões").'
const FORMATO = `Devolve {"itens":[{"jogo":"Mega-Sena","concurso":null,"sorteio":"29/11","premio_estimado":"R$ 82 milhões","numeros_por_jogo":10,"jogos":1,"cotas":34,"preco_cota":50,"obs":null}]}`

// 28/11 (Guto: "a menina vai enviar as fotos dos bolões do dia, que precisam ser adicionadas às artes de story"): cada bolão lido de
// uma foto guarda o caminho dela (foto), e o story do bolão usa a foto. Foto nova no mesmo dia SOMA na lista (ela pode mandar uma
// foto por bolão); o mesmo bolão (jogo + números + preço da cota) é trocado pelo mais novo. Lista em texto troca a lista inteira,
// mas o bolão que já tinha foto continua com ela.
const chave = (b: Bolao) => [semAc(b.jogo).replace(/[^a-z0-9+]/g, ''), b.numeros_por_jogo ?? '', b.preco_cota ?? ''].join('|')
export async function registraBoloes(neg: any, d: { texto: string; imagem?: { b64: string; mime: string } | null; foto?: string | null }, por: string) {
  const hoje = await boloesDeHoje(neg)
  // "esgotou o de X": marca na lista de hoje, sem ler tudo de novo
  if (ehEsgotou(neg, d.texto) && hoje?.itens?.length) {
    const r = await emJson<{ indices: number[] }>('Tu marcas quais bolões da lista esgotaram, pela mensagem da equipe. Só os que a mensagem indica.',
      `LISTA DE HOJE:\n${hoje.itens.map((b, i) => `${i}: ${linha(b)}`).join('\n')}\n\nMENSAGEM DA EQUIPE: ${d.texto}\n\nDevolve {"indices":[0]}`, [], { uso: { tipo: 'dono', negocio_id: neg.id } })
    const idx = new Set((r.indices || []).filter(i => Number.isInteger(i) && i >= 0 && i < hoje.itens.length))
    if (!idx.size) return { ok: false, itens: hoje.itens, resposta: 'Não achei qual bolão esgotou na lista de hoje. Me diz o jogo e o preço da cota (ex.: "esgotou a Mega de R$ 50").' }
    const itens = hoje.itens.map((b, i) => (idx.has(i) ? { ...b, esgotado: true } : b))
    await db.evento('boloes_do_dia', neg.id, { data: hojeBR(), itens, fonte: 'esgotou: ' + d.texto.slice(0, 200), por })
    const esg = itens.filter((_, i) => idx.has(i)).map(nomeCurto)
    return { ok: true, itens, esgotou: esg, resposta: `Anotado: ${esg.join(' e ')} ${esg.length > 1 ? 'esgotaram' : 'esgotou'}. Não ofereço mais pra ninguém hoje.` }
  }
  const r = await emJson<{ itens: Bolao[] }>(SIS, `${d.imagem ? 'A foto é a arte dos bolões do dia.' : ''}\nTEXTO DA EQUIPE: ${d.texto}\n\n${FORMATO}`, d.imagem ? [d.imagem] : [], { uso: { tipo: 'dono', negocio_id: neg.id } })
  const lidos: Bolao[] = (r.itens || []).filter(b => b && b.jogo).map(b => ({ ...b, esgotado: false, foto: d.foto || null }))
  if (!lidos.length) return { ok: false, itens: [], resposta: 'Não consegui ler os bolões dessa mensagem. Manda em texto, um por linha: jogo, números, cotas e preço da cota.' }
  const antes = hoje?.itens || []
  let itens: Bolao[]
  if (d.foto && antes.length) {
    const novas = new Set(lidos.map(chave))
    itens = [...antes.filter(b => !novas.has(chave(b))), ...lidos]
  } else itens = lidos.map(b => ({ ...b, foto: b.foto || antes.find(a => chave(a) === chave(b))?.foto || null }))
  await db.evento('boloes_do_dia', neg.id, { data: hojeBR(), itens, fonte: d.texto.slice(0, 500), por, ...(d.foto ? { foto: d.foto } : {}) })
  const somou = itens.length > lidos.length
  return { ok: true, itens, resposta: somou
    ? `Recebi ${lidos.length === 1 ? 'o bolão' : `${lidos.length} bolões`} dessa foto: ${lidos.map(nomeCurto).join('; ')}. A lista de hoje ficou com ${itens.length}: ${itens.map(nomeCurto).join('; ')}. Tá certo? Se algum esgotar, me avisa aqui ("esgotou o de R$ 50").`
    : `Recebi ${itens.length} ${itens.length === 1 ? 'bolão' : 'bolões'} de hoje: ${itens.map(nomeCurto).join('; ')}. Tá certo? Se algum esgotar, me avisa aqui ("esgotou o de R$ 50").` }
}

const reais = (v: any) => (v == null ? '' : 'R$ ' + Number(v).toFixed(2).replace('.', ',').replace(',00', ''))
export const nomeCurto = (b: Bolao) => [b.jogo, b.numeros_por_jogo ? `${b.jogos && b.jogos > 1 ? b.jogos + ' jogos de ' : ''}${b.numeros_por_jogo} números` : '', b.preco_cota != null ? reais(b.preco_cota) : ''].filter(Boolean).join(' ')
export const linha = (b: Bolao) => [b.jogo, b.concurso ? 'concurso ' + b.concurso : '', b.sorteio ? 'sorteio ' + b.sorteio : '', b.premio_estimado ? 'prêmio estimado ' + b.premio_estimado : '',
  b.numeros_por_jogo ? `${b.jogos || 1} jogo(s) de ${b.numeros_por_jogo} números` : '', b.cotas ? b.cotas + ' cotas' : '', b.preco_cota != null ? reais(b.preco_cota) + ' a cota' : '', b.obs || '', b.esgotado ? 'ESGOTADO' : ''].filter(Boolean).join(' · ')

// o jogo que o cliente citou, conferido na lista de hoje pelo sistema (o modelo barato às vezes não olha a lista):
// tem → a linha exata; esgotou → diz que esgotou; não está na lista → hoje não tem (sem perguntar à equipe)
const NOMES: [RegExp, RegExp][] = [
  [/\bmega\b(?!.*virada)|mega ?sena/, /mega/], [/virada/, /virada/], [/\bquina\b/, /quina/], [/lotofacil|loto facil/, /lotofacil/], [/lotomania/, /lotomania/],
  [/timemania/, /timemania/], [/dupla ?sena/, /dupla/], [/dia de sorte/, /dia de sorte/], [/super ?sete/, /super ?sete/], [/milionaria/, /milionaria/], [/federal/, /federal/],
]
export async function blocoDoPedido(neg: any, textoCliente: string) {
  if (!vendeBolao(neg) || !textoCliente) return ''
  const h = await boloesDeHoje(neg).catch(() => null)
  if (!h?.itens?.length) return ''
  const s = semAc(textoCliente), linhas: string[] = []
  for (const [i, [noCliente, naLista]] of NOMES.entries()) {
    if (!noCliente.test(s)) continue
    const virada = i === 1
    const daLista = h.itens.filter(b => naLista.test(semAc(b.jogo + ' ' + (b.obs || ''))) && !(i === 0 && /virada/.test(semAc(b.jogo))))
    const nome = virada ? 'Mega da Virada' : (daLista[0]?.jogo || textoCliente.match(new RegExp(noCliente.source, 'i'))?.[0] || 'esse jogo')
    if (virada && !daLista.length) continue   // a Virada mora no cadastro (bolão especial)
    const abertos = daLista.filter(b => !b.esgotado), esg = daLista.filter(b => b.esgotado)
    if (abertos.length) linhas.push(`O CLIENTE PERGUNTOU DE ${nome.toUpperCase()}: hoje TEM, e é este (responde com ele primeiro): ${abertos.map(linha).join(' | ')}`)
    else if (esg.length) linhas.push(`O CLIENTE PERGUNTOU DE ${nome.toUpperCase()}: o bolão de hoje (${esg.map(nomeCurto).join('; ')}) ESGOTOU. Diz que esgotou e oferece outro da lista de hoje. Não pergunta à equipe.`)
    else linhas.push(`O CLIENTE PERGUNTOU DE ${nome.toUpperCase()}: hoje NÃO tem bolão desse jogo (a lista de hoje está completa). Diz isso e oferece os da lista. Não pergunta à equipe nem promete retorno.`)
  }
  return linhas.length ? '\n' + linhas.join('\n') : ''
}

// trava do perguntar_ao_dono: "tem bolão de X hoje?" não vai pro dono quando a equipe já mandou a lista do dia.
// Devolve o texto pra IA (o que a lista diz) ou null (a pergunta é outra coisa: prêmio, resultado, conferência, horário...)
export async function respostaDaLista(neg: any, pergunta: string) {
  if (!vendeBolao(neg)) return null
  const s = semAc(pergunta)
  if (/\b(premi|ganh|result|confer|sorteou|horario|abre|fecha|endereco|pix|pagamento|comprovante|cpf)\w*/.test(s)) return null
  if (!(JOGOS.test(s) || /\bbol(ao|oes)\b|\bcotas?\b/.test(s))) return null
  const h = await boloesDeHoje(neg).catch(() => null)
  if (!h?.itens?.length) return null
  const especifico = await blocoDoPedido(neg, pergunta)
  const abertos = h.itens.filter(b => !b.esgotado)
  return (especifico ? especifico.trim() + ' ' : '') + `A lista de hoje já responde (não precisa do dono): ${abertos.map(linha).join(' | ') || 'todos esgotaram'}. Responde o cliente com ela agora, sem prometer confirmar.`
}

// o bloco que entra no pedido do atendente (só pra quem vende bolão)
export async function blocoParaAtender(neg: any) {
  if (!vendeBolao(neg)) return ''
  const h = await boloesDeHoje(neg).catch(() => null)
  if (!h?.itens?.length) return '\nBOLÕES DE HOJE: a equipe ainda não mandou a lista de hoje. NÃO ofereça nem invente bolão de concurso específico (Mega, Quina etc.) que não esteja no cadastro; usa só os bolões fixos do cadastro e diz que confirma com a equipe os bolões de hoje.'
  const abertos = h.itens.filter(b => !b.esgotado), esg = h.itens.filter(b => b.esgotado)
  return `\nBOLÕES DE HOJE (lista da equipe, use só estes; os esgotados não oferece). PRIORIDADE: os bolões do dia a dia que aparecem no cadastro (Quina, Mega, Lotofácil com cotas de R$ 25 a R$ 150) são EXEMPLOS ANTIGOS e NÃO valem hoje; pra bolão do dia a dia vale SÓ esta lista. Os bolões especiais do cadastro (Mega da Virada) continuam valendo, mas quando o cliente pergunta de um jogo que está nesta lista (ex.: "tem bolão da mega?"), responde PRIMEIRO com o desta lista:\n${abertos.map(b => '- ' + linha(b)).join('\n') || '- (todos esgotados)'}${esg.length ? `\nESGOTADOS HOJE (se perguntarem, diz que esgotou e oferece outro da lista): ${esg.map(nomeCurto).join('; ')}` : ''}\nEsta lista é a COMPLETA de hoje (a equipe mandou de manhã). Se o cliente pedir um jogo que não está nela nem no cadastro, tu JÁ SABE a resposta: hoje não tem bolão desse jogo. Diz isso e oferece os da lista. NÃO pergunta à equipe nem ao dono e NÃO promete retorno sobre isso.`
}
