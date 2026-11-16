// Maia, lançamento (16/11/2026, entrega nova): os TEXTOS da amostra que a equipe edita na tela e que a Maia usa na entrega,
// no acompanhamento e na página nova. Tudo fica nos JSON que já existem (coleta e amostra), sem coluna nova:
//   amostra.frase_entrega  a frase curta com a principal oportunidade (a Maia manda junto das peças no WhatsApp)
//   amostra.vimos          2 a 4 pontos "o que vimos → oportunidade" (a seção "O que a gente viu"; vazio = some)
//   amostra.roteiros       1 a 3 roteiros de vídeo de 20 a 35 s, em cenas (tempo, parte, o que filmar, a fala)
//   amostra.grade          a grade do Instagram (opcional), amostra.logo, amostra.capa, amostra.cor
// Nada inventado: o que não veio da coleta ou da equipe não vira afirmação. Sem preço nos anúncios e nos roteiros.
import { maiaLocal } from '../db'
import { primeiroNome } from './base'

export type Ponto = { vimos: string; oportunidade: string }
export type Cena = { tempo: string; parte: string; filmar: string; fala: string }
export type Roteiro = { titulo: string; quando: string; cenas: Cena[] }

const limpa = (s: any, n = 200) => String(s ?? '').replace(/\s+/g, ' ').trim().replace(/[.!;,]+$/, '').slice(0, n)
const minuscula = (s: string) => (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s)
export const nomeDoNegocio = (c: any) => limpa(c.coleta?.nome_negocio, 60) || (c.coleta?.negocio ? String(c.coleta.negocio).split(/[,.;]/)[0].trim().slice(0, 60) : '') || 'o teu negócio'
const usaIA = () => process.env.MAIA_LANC_IA === '1' || (!maiaLocal() && process.env.MAIA_LANC_IA !== '0' && !!process.env.ANTHROPIC_API_KEY)

// ---------- a frase da entrega ----------
export function frasePadrao(c: any) {
  const k = c.coleta || {}, neg = nomeDoNegocio(c)
  const pts: Ponto[] = c.amostra?.vimos || []
  if (pts[0]?.oportunidade) return `A principal oportunidade que eu vi pra ${neg}: ${minuscula(limpa(pts[0].oportunidade, 260))}.`
  const carro = limpa(k.carro_chefe, 80), cidade = limpa(k.cidade, 40), dif = limpa(k.dificuldade, 120)
  return [
    dif ? `Tu me contou que o desafio hoje é ${minuscula(dif)}.` : '',
    `A principal oportunidade que eu vejo pra ${neg}: anúncio ${carro ? `mostrando o que mais sai (${minuscula(carro)}) ` : ''}direto pra quem ${cidade ? `está em ${cidade} e região e ` : ''}já quer comprar, levando pro WhatsApp, onde eu atendo na hora.`,
  ].filter(Boolean).join(' ')
}
export const fraseEntrega = (c: any) => limpa(c.amostra?.frase_entrega, 600) ? String(c.amostra.frase_entrega).trim().slice(0, 600) : frasePadrao(c)

// ---------- "o que vimos → oportunidade": um por linha, separado por → ou -> ----------
export function lePontos(t: string): Ponto[] {
  const out: Ponto[] = []
  for (const l of String(t || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean)) {
    const m = l.split(/\s*(?:→|->|=>)\s*/)
    if (m.length < 2 || !m[0] || !m[1]) continue
    out.push({ vimos: m[0].replace(/^\d+[.)]\s*/, '').slice(0, 300), oportunidade: m.slice(1).join(' ').slice(0, 300) })
  }
  return out.slice(0, 4)
}
export const pontosTexto = (p: Ponto[] = []) => p.map(x => `${x.vimos} → ${x.oportunidade}`).join('\n')

// ---------- os roteiros: "# título | quando" e as cenas "tempo | parte | o que filmar | a fala" ----------
export function leRoteiros(t: string): Roteiro[] {
  const out: Roteiro[] = []
  for (const l of String(t || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean)) {
    if (l.startsWith('#')) { const [titulo, quando] = l.replace(/^#+\s*/, '').split(/\s*\|\s*/); out.push({ titulo: (titulo || 'Roteiro').slice(0, 80), quando: (quando || '').slice(0, 80), cenas: [] }); continue }
    const p = l.split(/\s*\|\s*/)
    if (p.length < 4) continue
    if (!out.length) out.push({ titulo: 'Roteiro', quando: '', cenas: [] })
    out[out.length - 1].cenas.push({ tempo: p[0].slice(0, 20), parte: p[1].slice(0, 30), filmar: p[2].slice(0, 200), fala: p.slice(3).join(' | ').replace(/^["“]|["”]$/g, '').slice(0, 300) })
  }
  return out.filter(r => r.cenas.length).slice(0, 3)
}
export const roteirosTexto = (rs: Roteiro[] = []) => rs.map(r => [`# ${r.titulo}${r.quando ? ' | ' + r.quando : ''}`, ...r.cenas.map(x => `${x.tempo} | ${x.parte} | ${x.filmar} | ${x.fala}`)].join('\n')).join('\n\n')

// sem IA: 1 roteiro de uns 30 s montado só com o que a pessoa contou (gancho de prontidão → problema → solução → como funciona → chamada)
export function roteiroSimples(c: any): Roteiro[] {
  const k = c.coleta || {}, neg = nomeDoNegocio(c)
  const carro = limpa(k.carro_chefe, 80), cidade = limpa(k.cidade, 40), dif = limpa(k.dificuldade, 120), como = limpa(k.como_vende, 140)
  const oque = limpa(k.negocio, 120)
  return [{
    titulo: 'Quem já quer comprar', quando: 'O principal · uns 30 segundos', cenas: [
      { tempo: '0 a 4s', parte: 'Gancho', filmar: carro ? `${minuscula(carro)} de perto, bem iluminado` : 'o produto ou o serviço de perto', fala: `${cidade ? `Tu que é de ${cidade} e ` : 'Tu que '}procura ${oque ? minuscula(oque) : 'isso'}, olha só.` },
      { tempo: '4 a 10s', parte: 'Problema', filmar: 'alguém procurando no celular, sem achar', fala: dif ? `A gente sabe: ${minuscula(dif)}.` : 'Achar quem faz bem feito e responde rápido não é fácil.' },
      { tempo: '10 a 20s', parte: 'Solução', filmar: 'as mãos de quem faz, o dia a dia do negócio', fala: `Aqui na ${neg}${carro ? `, o que mais sai é ${minuscula(carro)}` : ' tu encontra o que procura'}, feito com cuidado.` },
      { tempo: '20 a 26s', parte: 'Como funciona', filmar: 'o produto sendo entregue ou o cliente sendo atendido', fala: como ? `${como}.` : 'Tu chama no WhatsApp e a gente te atende na hora.' },
      { tempo: '26 a 32s', parte: 'Chamada', filmar: 'o celular abrindo o WhatsApp', fala: `Chama no WhatsApp${cidade ? `, aqui em ${cidade} e região` : ''}.` },
    ],
  }]
}

// com IA: 1 a 3 roteiros (o principal, a dificuldade que a pessoa contou, uma data próxima), no jeito do Guto
export async function geraRoteiros(c: any): Promise<Roteiro[]> {
  let rs = roteiroSimples(c)
  if (usaIA()) {
    try {
      const { emJson } = await import('../ia')
      const { fichaDoNegocio, jeitoDeFalar } = await import('./teste')
      const k = c.coleta || {}
      const j = await emJson<{ roteiros: Roteiro[] }>(
        'Tu escreves roteiros curtos de vídeo de anúncio (Instagram e Facebook, levando pro WhatsApp) pra pequenos negócios brasileiros. Português do Brasil, simples, falado, sem emoji.',
        `O negócio:\n${fichaDoNegocio(c)}\nMaior dificuldade pra vender: ${k.dificuldade || '?'}${jeitoDeFalar(c)}\n\nEscreve de 1 a 3 roteiros de 20 a 35 segundos (o 1º é o principal, pra quem já quer comprar; o 2º ataca a dificuldade que a pessoa contou; o 3º, se fizer sentido, uma data próxima como o Natal).
Estrutura de cada um: gancho de prontidão (o público + a situação dele, nas primeiras palavras) → problema → solução e diferencial → como funciona → chamada pro WhatsApp com a região e o jeito de receber no fim.
Regras: usa SÓ o que está acima, nunca inventa produto, prazo, endereço nem diferencial; SEM preço (o preço fica pra conversa no WhatsApp); a fala de cada cena é curta (o que dá pra falar no tempo dela); "filmar" diz uma cena simples que o dono grava no celular, só com coisas do negócio dele.
Devolve {"roteiros":[{"titulo":"quem é o público, curto","quando":"ex.: O principal · uns 30 segundos","cenas":[{"tempo":"0 a 4s","parte":"Gancho","filmar":"...","fala":"..."}]}]}`,
        [], { uso: { tipo: 'lancamento' } })
      const ok = (j?.roteiros || []).filter(r => r && Array.isArray(r.cenas) && r.cenas.length >= 3).slice(0, 3).map(r => ({
        titulo: limpa(r.titulo, 80) || 'Roteiro', quando: limpa(r.quando, 80),
        cenas: r.cenas.slice(0, 7).map(x => ({ tempo: limpa(x.tempo, 20), parte: limpa(x.parte, 30), filmar: limpa(x.filmar, 200), fala: String(x.fala || '').replace(/\s+/g, ' ').trim().replace(/^["“]|["”]$/g, '').slice(0, 300) })).filter(x => x.fala),
      })).filter(r => r.cenas.length >= 3 && !r.cenas.some(x => /R\$\s?\d/.test(x.fala)))
      if (ok.length) rs = ok
    } catch { /* fica o simples */ }
  }
  return rs
}

// ---------- o acompanhamento ----------
const oi = (c: any) => (primeiroNome(c.nome) ? `Oi, ${primeiroNome(c.nome)}!` : 'Oi!')
// a ideia nova do 3º dia: um ponto do "o que vimos" que não foi a frase da entrega, ou uma ideia montada com a coleta. Sem cobrar.
export function ideiaNova(c: any) {
  const neg = nomeDoNegocio(c), k = c.coleta || {}
  const pts: Ponto[] = c.amostra?.vimos || []
  const frase = fraseEntrega(c)
  const p = pts.find(x => x.oportunidade && !frase.includes(limpa(x.oportunidade, 60))) || null
  let ideia: string
  if (p) ideia = `${minuscula(limpa(p.oportunidade, 260))}.`
  else {
    const carro = limpa(k.carro_chefe, 80), cidade = limpa(k.cidade, 40)
    ideia = `um post mostrando ${carro ? minuscula(carro) : 'o teu produto'} de perto, com quem faz, e o WhatsApp na legenda. Quem vê o anúncio${cidade ? ` em ${cidade}` : ''} costuma olhar o Instagram antes de chamar, e esse tipo de post passa confiança.`
  }
  return { ideia, texto: `${oi(c)} Fiquei pensando na ${neg} e tive uma ideia: ${ideia} Se quiser, a gente conversa sobre isso.` }
}
export const textoDespedida = (c: any, link: string) => `${oi(c)} Tentei falar contigo, entendo a correria. A amostra da ${nomeDoNegocio(c)} continua aqui: ${link}\n\nVou parar por aqui e fico à disposição.`
export const PERGUNTA_TESTE = 'E aí, curtiu como ela atendeu teu cliente? O que tu achou?'
export const REENVIO = 'Fiz esse pra ti. Quer ver o resto e testar?'
export const POS_AUDIO = 'O que achou da amostra?'
export const LINK_FINAL = (link: string) => `Quer ver tudo, com os roteiros, a análise e o plano? Tá aqui: ${link}`
