// Maia: o jeito de vender que vem do CADASTRO da implantação (13/11). A skill implantacao-maia gera o cadastro.json e o
// importador grava em negocios.contexto: funil {sim, etapas[{etapa, proximo_passo}]}, limites {desconto_maximo, faixa_preco,
// nunca_prometer, passar_pro_dono}, perguntas [{pergunta, resposta}], provas, mais_vendido. Antes isso ia pro atendimento só
// como um JSON solto no meio do resto. Agora vira instrução clara (atendente.ts e a retomada) e duas travas sem IA:
//   - descontoAcima: a resposta ofereceu desconto maior que o máximo do dono (aí reescreve e, se insistir, pergunta pro dono)
//   - motivoDoCadastro: o motivo da passagem pro dono bate com o "quando passar pro dono" do cadastro (aí a passagem vale)
// Funções puras: nada aqui lê banco nem chama IA. Campo vazio ou "a confirmar" não entra.

const semAc = (s: any) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
export const vazio = (v: any) => v == null || (typeof v === 'string' && (!v.trim() || /^a confirmar$/i.test(v.trim()))) || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)
const txt = (v: any): string => vazio(v) ? '' : typeof v === 'string' ? v.trim() : Array.isArray(v) ? v.map(txt).filter(Boolean).join('; ') : typeof v === 'object' ? Object.values(v).map(txt).filter(Boolean).join('; ') : String(v)

export type Etapa = { etapa: string; proximo_passo: string }
export function funilDo(neg: any): { sim: string; etapas: Etapa[] } {
  const f = neg?.contexto?.funil
  if (!f || typeof f !== 'object') return { sim: '', etapas: [] }
  const etapas = (Array.isArray(f.etapas) ? f.etapas : []).map((e: any) => typeof e === 'string' ? { etapa: e, proximo_passo: '' } : { etapa: txt(e?.etapa), proximo_passo: txt(e?.proximo_passo) }).filter((e: Etapa) => e.etapa || e.proximo_passo)
  return { sim: txt(f.sim), etapas }
}

export type Limites = { desconto_maximo: string; faixa_preco: string; nunca_prometer: string; passar_pro_dono: string }
export function limitesDoCadastro(neg: any): Limites {
  const l = neg?.contexto?.limites || {}
  return { desconto_maximo: txt(l.desconto_maximo), faixa_preco: txt(l.faixa_preco), nunca_prometer: txt(l.nunca_prometer), passar_pro_dono: txt(l.passar_pro_dono) }
}

// perguntas frequentes: lista [{pergunta, resposta}], ou um texto livre
export function perguntasDo(neg: any): { pergunta: string; resposta: string }[] {
  const p = neg?.contexto?.perguntas
  if (Array.isArray(p)) return p.map((x: any) => typeof x === 'string' ? { pergunta: x, resposta: '' } : { pergunta: txt(x?.pergunta), resposta: txt(x?.resposta) }).filter(x => x.pergunta && x.resposta)
  return []
}

// o desconto máximo em % (0 = não dá desconto; null = o cadastro não diz um número)
export function descontoMax(neg: any): number | null {
  const d = limitesDoCadastro(neg).desconto_maximo
  if (!d) return null
  const s = semAc(d)
  if (/\b(sem desconto|nao (da|dar|damos|tem|oferece|faz)\w* desconto|nenhum|zero|nao da)\b/.test(s) && !/\d+\s*%/.test(s)) return 0
  const ps = [...s.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)].map(m => Number(m[1].replace(',', '.')))
  return ps.length ? Math.max(...ps) : null
}

// a resposta oferece desconto acima do máximo? ("dou 15% de desconto" com máximo de 10%). Só olha frases que falam de desconto
export function descontoAcima(neg: any, resposta: string): number | null {
  const max = descontoMax(neg)
  if (max == null) return null
  for (const f of String(resposta || '').split(/(?<=[.!?])\s+/)) {
    const s = semAc(f)
    if (!/\b(desconto|descontinho|abatimento|off)\b/.test(s)) continue
    for (const m of s.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)) { const v = Number(m[1].replace(',', '.')); if (v > max) return v }
    // "não dá desconto" no cadastro e a resposta "consigo um desconto pra você" (sem número) também passa do limite
    if (max === 0 && !/\b(nao|sem)\b[^.?!]{0,25}\bdesconto|\bdesconto\b[^.?!]{0,25}\bnao\b/.test(s) && /\b(consigo|posso|faco|dou|damos|te dou|fazer|tem|temos|sai com|fica com)\b/.test(s)) return 1
  }
  return null
}

// tira da resposta as frases que oferecem desconto (a trava final, se a reescrita insistir)
export const semFrasesDeDesconto = (t: string) => String(t || '').split(/(?<=[.!?])\s+/).filter(f => !/\b(desconto|descontinho|abatimento)\b/.test(semAc(f))).join(' ').trim()

const PARADAS = new Set(['quando', 'cliente', 'pedido', 'pedir', 'qualquer', 'sobre', 'outro', 'outra', 'outros', 'outras', 'mais', 'menos', 'acima', 'abaixo', 'entre', 'depois', 'antes', 'sempre', 'nunca', 'algum', 'alguma', 'quiser', 'precisa', 'pessoa', 'perguntar', 'falar'])
const palavras = (t: string) => semAc(t).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length >= 5 && !PARADAS.has(w)).map(w => w.slice(0, 6))
// os casos do "quando passar pro dono" do cadastro, um por um ("Encomenda de empresa ou mais de 10 caixas; reclamação")
export const casosDePassagem = (neg: any) => limitesDoCadastro(neg).passar_pro_dono.split(/[;\n]|\.\s|,\s|\s+ou\s+/i).map(s => s.trim()).filter(s => palavras(s).length)
// o motivo que a IA deu bate com algum caso do cadastro? (pelo menos uma palavra de peso em comum; 2 quando o caso tem 3+)
export function motivoDoCadastro(neg: any, motivo: string): string | null {
  const m = new Set(palavras(motivo))
  if (!m.size) return null
  for (const c of casosDePassagem(neg)) {
    const p = [...new Set(palavras(c))], comum = p.filter(w => m.has(w)).length
    if (comum >= (p.length >= 3 ? 2 : 1)) return c
  }
  return null
}

// ---- 13/11 (Guto, a Vendedora): quem fecha a venda ----
// contexto.fechamento: 'time' (o padrão) = a Maia NÃO agenda horário e NÃO fecha: prepara o cliente (tira dúvida, mostra o valor,
// diz o preço) e, quando ele quer comprar (pagar, fechar, agendar), passa a conversa pro dono/time (modo humano + aviso).
// 'maia' = como era até 12/11: ela manda o Pix/o próximo passo e marca a venda.
export type Fechamento = 'time' | 'maia'
export const fechamentoDo = (neg: any): Fechamento => semAc(neg?.contexto?.fechamento).trim() === 'maia' ? 'maia' : 'time'

// ---- 13/11: preço personalizado ----
// Serviço sem preço fixo (estética, tratamento individualizado): o preço só sai depois de uma avaliação (que tem preço fixo).
// contexto.preco_personalizado: { servicos, por_que, caminho } (ou uma lista deles). Vem de ficha.preco_personalizado do cadastro
export type PrecoPersonalizado = { servicos: string; por_que: string; caminho: string }
export function precoPersonalizadoDo(neg: any): PrecoPersonalizado[] {
  const p = neg?.contexto?.preco_personalizado
  const lista = Array.isArray(p) ? p : p && typeof p === 'object' ? [p] : []
  return lista.map((x: any) => ({ servicos: txt(x?.servicos), por_que: txt(x?.por_que), caminho: txt(x?.caminho) })).filter((x: PrecoPersonalizado) => x.servicos)
}

// a ficha que vai pro prompt como "o que tu sabe": sem o que vira regra abaixo e sem o que é da equipe (peças, estilo, datas)
const FORA_DA_FICHA = ['funil', 'limites', 'perguntas', 'provas', 'pecas_aprovadas', 'estilo', 'implantacao', 'demo', 'fechamento', 'preco_personalizado']
export function fichaParaAtender(neg: any) {
  const c = { ...(neg?.contexto || {}) }
  for (const k of FORA_DA_FICHA) delete c[k]
  // 13/11: com o fechamento no time, a chave Pix não vai pro prompt (quem manda os dados do pagamento é o dono/time)
  if (fechamentoDo(neg) === 'time') { delete c.pix; delete c.chave_pix }
  for (const k of Object.keys(c)) if (vazio(c[k])) delete c[k]
  return c
}

// o bloco do cadastro no prompt do atendimento (vazio quando o negócio não tem nada disso)
export function regrasDoCadastro(neg: any): string {
  const f = funilDo(neg), l = limitesDoCadastro(neg), pq = perguntasDo(neg), max = descontoMax(neg)
  const provas = txt(neg?.contexto?.provas), mais = txt(neg?.contexto?.mais_vendido)
  const linhas: string[] = []
  // 13/11: com o fechamento no time, o "sim" é o destino da conversa, mas quem fecha é a equipe (regraDoFechamento)
  if (f.sim) linhas.push(`- O "SIM" DESTE NEGÓCIO (o que conta como venda): ${f.sim}. Toda conversa caminha pra isso. ${fechamentoDo(neg) === 'time' ? 'Quando o cliente quer chegar nele, quem fecha é a equipe: passar_para_o_dono (ver QUEM FECHA A VENDA).' : 'venda_fechada só quando isso aconteceu de verdade.'}`)
  if (f.etapas.length) linhas.push(`- O CAMINHO DA VENDA (etapa → o próximo passo). Vê em que etapa o cliente está pelo que ele já disse e faz o próximo passo DELA (um passo por vez):\n${f.etapas.map((e, i) => `  ${i + 1}. ${e.etapa || '?'} → ${e.proximo_passo || '(segue a conversa)'}`).join('\n')}`)
  if (mais) linhas.push(`- MAIS VENDIDO: ${mais}. Cliente em dúvida do que escolher: sugere esse.`)
  if (l.faixa_preco) linhas.push(`- PREÇO: ${l.faixa_preco}.`)
  // 13/11: serviço sem preço fixo: explica por que e leva pro caminho (a avaliação). Nunca inventa número nem faixa
  for (const p of precoPersonalizadoDo(neg)) linhas.push(`- PREÇO PERSONALIZADO (${p.servicos}): esse serviço NÃO tem preço fixo${p.por_que ? ` porque ${p.por_que.replace(/[.\s]+$/, '')}` : ''}. Perguntaram o preço disso: em uma ou duas frases curtas diz o que a pessoa ganha e por que o valor depende de cada caso, e leva pro caminho: ${p.caminho || 'a avaliação'}. NUNCA inventa um valor, faixa ou "a partir de" pra esse serviço (o preço da avaliação, se estiver no caminho, pode dizer).`)
  if (l.desconto_maximo) linhas.push(`- DESCONTO: ${max === 0 ? 'este negócio não dá desconto' : `no máximo ${l.desconto_maximo}`}. Tu NUNCA oferece desconto por conta própria: só fala de desconto se o cliente pedir${max === 0 ? '' : ', e dentro desse limite'}. Pediu mais que isso: diz que vai ver com o responsável e chama perguntar_ao_dono (não promete nada).`)
  if (l.nunca_prometer) linhas.push(`- NUNCA PROMETE: ${l.nunca_prometer}. Se o cliente pedir isso, diz com educação que não dá e oferece o que dá.`)
  if (l.passar_pro_dono) linhas.push(`- PASSA A CONVERSA PRO DONO (passar_para_o_dono, com o motivo dito assim) quando: ${l.passar_pro_dono}. Além dos casos de sempre (pedido de pessoa, reclamação, devolução, apagar dados).`)
  if (pq.length) linhas.push(`- PERGUNTAS FREQUENTES (o dono já respondeu: usa a resposta dele, com as tuas palavras e no jeito de falar):\n${pq.slice(0, 15).map(p => `  · ${p.pergunta} → ${p.resposta}`).join('\n')}`)
  if (provas) linhas.push(`- PROVAS (quando o cliente desconfia, pergunta se é confiável ou hesita antes de pagar): ${provas}.`)
  if (!linhas.length) return ''
  return `O JEITO DE VENDER DESTE NEGÓCIO (o dono combinou na implantação; vale mais que qualquer outra coisa da ficha):\n${linhas.join('\n')}`
}

// o resumo curto pra retomada (o sim, o caminho e o que nunca prometer)
export function regrasDaRetomada(neg: any): string {
  const f = funilDo(neg), l = limitesDoCadastro(neg)
  const t: string[] = []
  if (f.sim) t.push(`O "sim" deste negócio: ${f.sim}.`)
  if (f.etapas.length) t.push(`Caminho da venda (etapa → próximo passo): ${f.etapas.map(e => `${e.etapa} → ${e.proximo_passo}`).join('; ')}. A retomada oferece de novo o próximo passo da etapa em que o cliente parou.`)
  if (l.nunca_prometer) t.push(`Nunca promete: ${l.nunca_prometer}.`)
  for (const p of precoPersonalizadoDo(neg)) t.push(`${p.servicos}: não tem preço fixo; o caminho é ${p.caminho || 'a avaliação'}.`)
  // 13/11: com o fechamento no time, a retomada não manda Pix nem marca horário: convida a seguir e quem combina é a equipe
  if (fechamentoDo(neg) === 'time') t.push('Quem fecha (pagamento, horário, pedido) é a equipe do negócio: a retomada não manda dados de pagamento nem marca horário; se o cliente quiser seguir, uma pessoa da equipe combina com ele.')
  t.push('Nunca oferece desconto na retomada.')
  return t.join('\n')
}

// 13/11: a regra do fechamento no prompt do atendimento (vale com ou sem cadastro)
export function regraDoFechamento(neg: any): string {
  if (fechamentoDo(neg) === 'maia') return ''
  return `QUEM FECHA A VENDA (regra deste negócio, vale mais que o caminho da venda acima): tu NÃO agenda horário, NÃO manda chave Pix nem dados de pagamento, NÃO confirma pedido e NÃO marca venda. Teu trabalho é preparar o cliente: tirar as dúvidas, mostrar o valor, dizer o preço (quando tem) e entender o que ele quer (qual produto/serviço, quantidade, dia que prefere).
Quando ele quer comprar (pede pra pagar, pede o Pix, quer fechar, agendar, marcar horário, reservar, "quero 2", "pode fazer"): responde o que ele perguntou e diz, com naturalidade, que uma pessoa da equipe vai falar com ele por aqui mesmo pra combinar o pagamento ou o horário e finalizar; e chama passar_para_o_dono NESSA MESMA resposta, com o motivo "quer fechar: <o que ele quer>". Nada de "vou ver se tem horário" sem passar.`
}
