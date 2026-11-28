// Maia: o RECADO PRA BASE (14/11). A mensagem ATIVA pros clientes de sempre de um negócio: jogo novo, bolão, prêmio
// acumulado, produto novo. 1º cliente: uma lotérica ("abriu o bolão da Mega da Virada, 10 cotas de R$ 50").
// Tabelas novas (db/maia-recado-base.sql): maia_base (os contatos), maia_recados (cada recado) e maia_recado_envios (cada
// mensagem que saiu). Sem o SQL rodado, a função fica indisponível com um erro claro e o resto da Maia segue normal.
//
// 1) A BASE: a equipe cola a lista ou sobe um .csv (painel, aba Base); o dono sobe pelo painel dele ou manda pelo WhatsApp da
//    Maia (planilha .csv, cartão .vcf ou os contatos do celular). Telefone normalizado (55 + DDD + número), sem repetido.
//    Quem já é cliente do negócio (lead) pode entrar junto. "Não quero receber"/SAIR marca optout na hora (nunca mais recebe).
// 2) O RECADO: o dono pede (WhatsApp ou painel) ou a equipe cria. A Maia escreve curto, valor antes do preço, chamando pra
//    responder. Equipe aprova → dono aprova (👍 ou painel) → vira um modelo de MARKETING do negócio na Meta (modelos.ts) →
//    a rotina confere a aprovação → manda em lotes (até 200 por hora), só no horário do negócio (horario.ts), respeitando
//    optout, etiqueta e o intervalo (1 recado por contato a cada 3 dias e no máximo 2 por semana).
// 3) AS RESPOSTAS: "Quero participar" (ou "quero") vira contato no funil (origem 'base') e a conversa passa pro time do
//    negócio fechar (o mesmo caminho de "quer fechar" do atendente.ts). A Maia NÃO vende nem cobra pelo WhatsApp (política
//    da Meta pra loteria: o recado avisa e chama). Outra resposta: a Maia atende normal, sabendo de qual recado veio.
//    A venda marcada nesse contato (funil.ts, ganhou) soma no recado.
import { doNeg } from './artigo'
import { maiaDb as db, maiaLocal } from './db'
import { ehSimulado, fone } from '@/lib/oito/wa'
import { podeFalar } from './horario'
import { tomDoNegocio } from './tom'
import { BOTAO_QUERO, BOTAO_SAIR } from './modelos'

const D = 86400e3
const r2 = (n: number) => Math.round(n * 100) / 100
const semAc = (s: any) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const primeiro = (s: any) => String(s || '').trim().split(/\s+/)[0] || ''
const plural = (n: number, s: string, p = s + 's') => `${n} ${n === 1 ? s : p}`

export const INTERVALO_DIAS = 3    // 1 recado por contato a cada 3 dias
export const POR_SEMANA = 2        // e no máximo 2 em 7 dias
export const LOTE_PADRAO = 200     // por rodada da rotina (de hora em hora), por negócio
export const CUSTO_PADRAO = 0.40   // R$ por mensagem de marketing na Meta (o negócio paga direto pra Meta). 14/11: US$ 0,07188 desde 01/04/2026, uns R$ 0,40
export const STATUS_NOME: Record<string, string> = {
  rascunho: 'rascunho', aprovar_equipe: 'equipe revisando', aprovar_dono: 'esperando o dono', aguardando_meta: 'esperando o WhatsApp aprovar',
  agendado: 'agendado', enviando: 'enviando', enviado: 'enviado', cancelado: 'cancelado',
}
export const custoMsg = (neg: any) => { const v = Number(neg?.meta?.recado?.custo_msg ?? process.env.MAIA_RECADO_CUSTO); return v > 0 && v < 10 ? v : CUSTO_PADRAO }
const loteDo = (neg: any) => Math.min(1000, Math.max(10, Number(neg?.meta?.recado?.lote) || LOTE_PADRAO))

// ─────────────── a tabela existe? (sem o SQL, a função fica indisponível; o resto segue)
export const INDISPONIVEL = 'O recado pra base ainda não está ligado: falta rodar o db/maia-recado-base.sql no banco.'
const faltaTabela = (e: any) => /does not exist|42P01|PGRST20\d|could not find the table|schema cache|banco 404/i.test(String(e?.message || e))
let temTabela = false, semTabelaAte = 0
export async function baseDisponivel() {
  if (maiaLocal() || temTabela) return true
  if (Date.now() < semTabelaAte) return false   // não pergunta pro banco a cada mensagem: confere de novo em 10 min
  try {
    for (const t of ['base', 'recados', 'recado_envios']) await db.lista(t, {}, { limite: 1, campos: 'id' })
    temTabela = true; return true
  } catch (e) { if (faltaTabela(e)) { semTabelaAte = Date.now() + 10 * 60e3; return false } throw e }
}
async function exige() { if (!(await baseDisponivel())) throw new Error(INDISPONIVEL) }

// ─────────────── telefones
// 55 + DDD + número. Celular sem o 9 ganha o 9. Telefone de teste (55000...) passa (nunca sai pra Meta)
export function normalizaTel(raw: any): string | null {
  let d = String(raw ?? '').replace(/\D/g, '').replace(/^0+/, '')
  if (/^55000\d{6,9}$/.test(d)) return d
  if (d.length === 10 || d.length === 11) d = '55' + d
  if (!/^55\d{10,11}$/.test(d)) return null
  if (/0/.test(d.slice(2, 4))) return null                 // DDD do Brasil não tem zero
  if (d.length === 12 && /[6-9]/.test(d[4])) d = d.slice(0, 4) + '9' + d.slice(4)
  if (d.length === 13 && d[4] !== '9') return null
  return d
}
// o mesmo número com e sem o 9 (o WhatsApp às vezes manda o "from" sem ele)
export function variantes(tel: string) {
  const t = String(tel || '')
  if (/^55\d{2}9\d{8}$/.test(t)) return [t, t.slice(0, 4) + t.slice(5)]
  if (/^55\d{10}$/.test(t)) return [t, t.slice(0, 4) + '9' + t.slice(4)]
  return [t]
}
export const limpaEtiqueta = (s: any) => semAc(s).replace(/[^a-z0-9 ]+/g, ' ').trim().replace(/\s+/g, ' ').slice(0, 30)
const etiquetasDe = (v: any): string[] => [...new Set((Array.isArray(v) ? v : String(v ?? '').split(/[,|/;]+/)).map(limpaEtiqueta).filter(Boolean))]

// ─────────────── ler a lista (CSV colado ou arquivo, ou cartões .vcf)
type Lida = { nome: string | null; bruto: string; etiquetas: string[] }
function divide(linha: string, sep: string) {
  const out: string[] = []; let cur = '', aspas = false
  for (const ch of linha) {
    if (ch === '"') { aspas = !aspas; continue }
    if (ch === sep && !aspas) { out.push(cur.trim()); cur = ''; continue }
    cur += ch
  }
  out.push(cur.trim()); return out
}
const digitos = (s: string) => s.replace(/\D/g, '').length
export function leLista(texto: string): Lida[] {
  const t = String(texto || '').replace(/^﻿/, '')
  if (/BEGIN:VCARD/i.test(t)) {
    return t.split(/END:VCARD/i).map(b => {
      const fn = /(?:^|\n)FN[^:\n]*:(.*)/i.exec(b)?.[1]?.trim() || /(?:^|\n)N[^:\n]*:([^\n]*)/i.exec(b)?.[1]?.split(';').filter(Boolean).reverse().join(' ').trim() || null
      const tel = /(?:^|\n)(?:item\d+\.)?TEL[^:\n]*?(?:waid=(\d+))?[^:\n]*:([^\n]*)/i.exec(b)
      return tel ? { nome: fn, bruto: tel[1] || tel[2] || '', etiquetas: [] } : null
    }).filter(Boolean) as Lida[]
  }
  const linhas = t.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 5000)
  if (!linhas.length) return []
  const amostra = linhas.find(l => digitos(l) >= 8) || linhas[0]
  const sep = amostra.includes(';') ? ';' : amostra.includes('\t') ? '\t' : ','
  // cabeçalho (nome;telefone;etiquetas, em qualquer ordem)
  let iNome = -1, iTel = -1, iEtq = -1, inicio = 0
  const cab = divide(linhas[0], sep).map(semAc)
  if (digitos(linhas[0]) < 8 && cab.some(c => /nome|telefone|fone|celular|whats|numero|etiqueta|tag|grupo/.test(c))) {
    iNome = cab.findIndex(c => /nome/.test(c)); iTel = cab.findIndex(c => /telefone|fone|celular|whats|numero/.test(c)); iEtq = cab.findIndex(c => /etiqueta|tag|grupo|jogo/.test(c)); inicio = 1
  }
  const out: Lida[] = []
  for (const l of linhas.slice(inicio)) {
    const cols = divide(l, sep)
    let ti = iTel >= 0 ? iTel : cols.findIndex(c => digitos(c) >= 8)
    if (ti < 0) { out.push({ nome: null, bruto: l.slice(0, 40), etiquetas: [] }); continue }
    let nome = iNome >= 0 ? cols[iNome] || null : cols.find((c, i) => i !== ti && /\p{L}/u.test(c) && digitos(c) < 8) || null
    const telCol = cols[ti] || ''
    if (!nome && /\p{L}/u.test(telCol)) nome = telCol.replace(/[\d()+\-.\s]{8,}/g, ' ').trim() || null
    const resto = iEtq >= 0 ? [cols[iEtq] || ''] : cols.filter((c, i) => i !== ti && c !== nome)
    out.push({ nome: nome ? nome.replace(/\s+/g, ' ').slice(0, 80) : null, bruto: telCol, etiquetas: etiquetasDe(resto.join(',')) })
  }
  return out
}

// ─────────────── 1) a base
// importa a lista. incluir: 'compraram' (quem já comprou do negócio, etiqueta "comprou") ou 'todos' (todo contato do funil)
export async function importaBase(neg: any, d: { texto?: string | null; incluir?: 'compraram' | 'todos' | null; etiquetas?: string[] | string | null; origem?: 'importado' | 'dono'; por: string }) {
  await exige()
  const extra = etiquetasDe(d.etiquetas || [])
  const lidas = leLista(d.texto || '').map(l => ({ ...l, etiquetas: [...new Set([...l.etiquetas, ...extra])], origem: d.origem || 'importado' }))
  if (d.incluir === 'compraram' || d.incluir === 'todos') {
    for (const l of await db.lista('leads', { negocio_id: neg.id })) {
      if (!l.telefone || (d.incluir === 'compraram' && l.etapa !== 'ganho')) continue
      lidas.push({ nome: l.nome || null, bruto: l.telefone, etiquetas: [...new Set([...(l.etapa === 'ganho' ? ['comprou'] : []), ...extra])], origem: 'conversa' as any })
    }
  }
  if (!lidas.length) throw new Error('não achei nenhum contato: cola uma linha por pessoa (nome;telefone;etiquetas) ou sobe o .csv')
  const atuais = await db.lista('base', { negocio_id: neg.id })
  const porTel = new Map<string, any>()
  for (const c of atuais) for (const v of variantes(c.telefone)) porTel.set(v, c)
  const novos = new Map<string, any>(), mudou = new Map<string, any>()
  let ja = 0, repetidos = 0
  const invalidos: string[] = []
  for (const l of lidas) {
    const tel = normalizaTel(l.bruto)
    if (!tel) { invalidos.push(String(l.bruto || '').slice(0, 40)); continue }
    const novo = variantes(tel).map(v => novos.get(v)).find(Boolean)
    if (novo) { repetidos++; novo.etiquetas = [...new Set([...novo.etiquetas, ...l.etiquetas])]; if (!novo.nome && l.nome) novo.nome = l.nome; continue }
    const ex = variantes(tel).map(v => porTel.get(v)).find(Boolean)
    if (ex) {
      ja++
      const etq = [...new Set([...(ex.etiquetas || []), ...l.etiquetas])]
      if (etq.length !== (ex.etiquetas || []).length || (!ex.nome && l.nome)) { ex.etiquetas = etq; if (!ex.nome && l.nome) ex.nome = l.nome; mudou.set(ex.id, ex) }
      continue
    }
    novos.set(tel, { negocio_id: neg.id, telefone: tel, nome: l.nome, etiquetas: l.etiquetas, optout: false, origem: (l as any).origem })
  }
  const entraram = await db.insereMuitos('base', [...novos.values()], 'negocio_id,telefone')
  for (const c of [...mudou.values()].slice(0, 2000)) await db.atualiza('base', { id: c.id }, { etiquetas: c.etiquetas, nome: c.nome })
  const r = { ok: true, novos: entraram.length, ja_estavam: ja, repetidos, invalidos: invalidos.length, exemplos_invalidos: invalidos.slice(0, 5), total: atuais.length + entraram.length }
  await db.evento('base_importada', neg.id, { por: d.por, novos: r.novos, ja_estavam: ja, repetidos, invalidos: r.invalidos, incluir: d.incluir || null })
  return r
}

export async function baseDoNegocio(neg: any, limite = 300) {
  await exige()
  const todos = await db.lista('base', { negocio_id: neg.id }, { ordem: 'criado_em', desc: true })
  const ativos = todos.filter(c => !c.optout)
  const conta: Record<string, number> = {}
  for (const c of ativos) for (const e of c.etiquetas || []) conta[e] = (conta[e] || 0) + 1
  return {
    total: todos.length, ativos: ativos.length, saiu: todos.length - ativos.length,
    etiquetas: Object.entries(conta).sort((a, b) => b[1] - a[1]).map(([nome, n]) => ({ nome, n })),
    contatos: todos.slice(0, limite).map(c => ({ id: c.id, nome: c.nome, telefone: c.telefone, etiquetas: c.etiquetas || [], optout: !!c.optout, optout_em: c.optout_em || null, origem: c.origem, ultimo_recado_em: c.ultimo_recado_em || null, criado_em: c.criado_em })),
  }
}

// a equipe tira ou devolve alguém da lista (o optout pedido pelo próprio contato só ele desfaz: a equipe só volta com cuidado)
export async function mudaContato(neg: any, id: string, d: { optout?: boolean; etiquetas?: string[] | string; apagar?: boolean }, por: string) {
  await exige()
  const c = await db.um('base', { id, negocio_id: neg.id })
  if (!c) throw new Error('contato não existe nessa base')
  if (d.apagar) { await apagaTelefoneDaBase(neg.id, c.telefone); await db.evento('base_contato_apagado', neg.id, { por }); return { ok: true, apagado: true } }
  const campos: any = {}
  if (d.optout !== undefined) { campos.optout = !!d.optout; campos.optout_em = d.optout ? new Date().toISOString() : null }
  if (d.etiquetas !== undefined) campos.etiquetas = etiquetasDe(d.etiquetas)
  const [x] = await db.atualiza('base', { id: c.id }, campos)
  await db.evento('base_contato', neg.id, { por, optout: campos.optout ?? null })
  return x
}

// LGPD (lgpd.ts, apagaContato): o contato sai da base; os envios ficam só como número (sem o telefone), pra conta do recado
export async function apagaTelefoneDaBase(negocio_id: string, telefone: string) {
  if (!telefone || !(await baseDisponivel().catch(() => false))) return 0
  let n = 0
  for (const v of variantes(normalizaTel(telefone) || fone(telefone))) {
    const cs = await db.lista('base', { negocio_id, telefone: v })
    for (const c of cs) { await db.apaga('base', { id: c.id, negocio_id }); n++ }
    for (const e of await db.lista('recado_envios', { negocio_id, telefone: v })) await db.atualiza('recado_envios', { id: e.id }, { telefone: 'apagado-' + String(e.id).slice(0, 8), base_id: null })
  }
  return n
}

// ─────────────── 2) o recado
const casaEtiqueta = (c: any, alvo: string[]) => !alvo?.length || (c.etiquetas || []).some((e: string) => alvo.includes(limpaEtiqueta(e)))

// quem recebe agora: na base, sem optout, com a etiqueta, que ainda não recebeu ESTE recado e que não recebeu outro há menos de 3
// dias nem 2 na semana. `agora` é o relógio da rotina (o teste passa outro); o intervalo conta pela hora do envio (enviado_em)
export async function quemRecebe(neg: any, rec: any, agora = new Date(), pre?: { base?: any[]; recentes?: any[] }) {
  const base = pre?.base || await db.lista('base', { negocio_id: neg.id })
  const ja = new Set((await db.lista('recado_envios', { recado_id: rec.id })).map(e => e.telefone))
  const recentes = (pre?.recentes || await db.lista('recado_envios', { negocio_id: neg.id }, { desde: ['enviado_em', new Date(agora.getTime() - 7 * D).toISOString()] }))
    .filter(e => e.status !== 'falhou' && e.recado_id !== rec.id && String(e.enviado_em || '') <= agora.toISOString())
  const porTel = new Map<string, string[]>()
  for (const e of recentes) (porTel.get(e.telefone) || porTel.set(e.telefone, []).get(e.telefone)!).push(String(e.enviado_em || e.criado_em))
  const limite = new Date(agora.getTime() - INTERVALO_DIAS * D).toISOString()
  const alvo = (rec.etiquetas_alvo || []).map(limpaEtiqueta)
  const lista: any[] = []
  let pulados = 0, saiu = 0, fora = 0
  for (const c of base) {
    if (ja.has(c.telefone)) continue
    if (c.optout) { saiu++; continue }
    if (!casaEtiqueta(c, alvo)) { fora++; continue }
    const r = variantes(c.telefone).flatMap(v => porTel.get(v) || [])
    if (r.some(x => x > limite) || r.length >= POR_SEMANA) { pulados++; continue }
    lista.push(c)
  }
  return { lista, pulados, saiu, fora, ja: ja.size }
}
export const estimativa = (neg: any, n: number) => ({ contatos: n, custo_msg: custoMsg(neg), custo: r2(n * custoMsg(neg)) })
const reais = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// a Maia escreve o recado (IA). Sem IA: um texto provisório a partir do pedido, que a equipe revisa (ninguém fica travado)
const SAUDACAO = /^\s*(oi|ol[aá]|e a[ií]|bom dia|boa tarde|boa noite|ei)\b[^!.?\n]{0,40}[!.?,]\s*/i
function limpaTexto(neg: any, t: string, acertaTom: (n: any, s: string) => string) {
  let s = String(t || '').replace(/\*\*?|__/g, '').replace(/\s*\n\s*\n\s*/g, '\n').trim()
  for (let i = 0; i < 2 && SAUDACAO.test(s); i++) s = s.replace(SAUDACAO, '').trim()
  s = s.charAt(0).toUpperCase() + s.slice(1)
  return acertaTom(neg, s).slice(0, 600).trim()
}
export async function escreveRecado(neg: any, pedido: string, ajuste?: { anterior: string; nota: string }) {
  const { jeitoAtendimento, acertaTom } = await import('./tom')
  const voce = tomDoNegocio(neg).pessoa === 'voce'
  const sistema = `${jeitoAtendimento(neg)}
Tua tarefa agora: escrever um RECADO PRA BASE. É uma mensagem ativa de WhatsApp que o negócio manda pros clientes de sempre avisando uma novidade (jogo novo, bolão, prêmio acumulado, produto novo, data especial).
REGRAS DO RECADO:
- Curto: no máximo 350 caracteres, 2 ou 3 frases. SEM saudação no começo (o "Oi, Nome!" vai na frente sozinho). Sem link.
- Valor antes do preço: primeiro o que a pessoa ganha ou por que vale a pena (o prêmio, a chance, a novidade); depois o preço ou a condição, se o pedido trouxe.
- Termina chamando pra responder aqui, ex.: "Quer participar? Responde aqui que a gente separa ${voce ? 'a sua' : 'a tua'}." (no jeito de falar do negócio).
- Só o que está no pedido e no que se sabe do negócio: não inventa preço, data, prêmio, quantidade nem horário.
- NÃO vende nem cobra pelo WhatsApp: nada de Pix, pagamento, link de compra ou "garanta já pagando". O recado avisa e chama; quem fecha é a equipe do negócio (ou a pessoa passa na loja).
- Loteria, aposta, sorteio: nunca promete prêmio nem diz que a pessoa vai ganhar; sem pressão exagerada ("não perca!!!", "última chance"). Pode dizer que as cotas são limitadas se o pedido disse.
- No máximo 1 emoji. Sem negrito, sem lista.
- titulo: 2 a 5 palavras pra equipe reconhecer (ex.: "Bolão da Mega da Virada").`
  const ped = `NEGÓCIO: ${neg.nome} · ${neg.nicho || '?'} · ${neg.cidade || '?'}
O QUE SE SABE DO NEGÓCIO: ${JSON.stringify(neg.contexto || {}).slice(0, 1500)}
PEDIDO DO RECADO: ${pedido}${ajuste ? `\nTEXTO ANTERIOR: ${ajuste.anterior}\nAJUSTE DO RECADO PEDIDO: ${ajuste.nota}\n(refaz o texto com esse ajuste, mantendo as regras)` : ''}
Devolve {"titulo":"...","texto":"..."}`
  try {
    const { emJson } = await import('./ia')
    const r = await emJson<{ titulo: string; texto: string }>(sistema, ped, [], { uso: { tipo: 'recado', negocio_id: neg.id } })
    const texto = limpaTexto(neg, r?.texto || '', acertaTom)
    if (texto.length < 20) throw new Error('texto curto demais')
    return { titulo: String(r?.titulo || '').replace(/["“”]/g, '').trim().slice(0, 60) || tituloDoPedido(pedido), texto, sem_ia: false }
  } catch {
    const p = pedido.replace(/^\s*(manda|mande|envia|envie|dispara|avisa|avise|fala|fale)\s+(pr[ao]s?|para|a|os|as|na|no)?\s*(minha\s+|nossa\s+)?(base|clientes|jogadores|lista|todo mundo|galera|pessoal)\s*(que|:|,|-)?\s*/i, '').trim()
    const base = ajuste ? ajuste.anterior : `${p.charAt(0).toUpperCase() + p.slice(1).replace(/[.!\s]+$/, '')}. Quer participar? Responde aqui que a gente separa ${voce ? 'a sua' : 'a tua'}.`
    return { titulo: tituloDoPedido(p || pedido), texto: limpaTexto(neg, base, acertaTom), sem_ia: true }
  }
}
const tituloDoPedido = (p: string) => { const t = String(p || '').split(/[,.;:\n]/)[0].trim(); return (t.charAt(0).toUpperCase() + t.slice(1)).slice(0, 40) || 'Recado pra base' }

const NOTA_SEM_IA = 'texto provisório: a IA estava fora do ar. Revisa antes de aprovar.'
export async function criaRecado(neg: any, d: { pedido: string; etiquetas?: string[] | string | null; midia_id?: string | null; quando?: string | null; titulo?: string | null; por: string }) {
  await exige()
  const n = (await db.um('negocios', { id: neg.id })) || neg
  const pedido = String(d.pedido || '').trim().slice(0, 1000)
  if (pedido.length < 5) throw new Error('escreve o que o recado tem que avisar (ex.: abriu o bolão da Mega da Virada, 10 cotas de R$ 50)')
  const base = await db.lista('base', { negocio_id: n.id })
  if (!base.some(c => !c.optout)) throw new Error('a base de contatos está vazia: importa a lista primeiro (planilha .csv com nome;telefone;etiquetas, ou os contatos pelo WhatsApp)')
  const alvo = etiquetasDe(d.etiquetas || [])
  if (alvo.length && !base.some(c => !c.optout && casaEtiqueta(c, alvo))) throw new Error(`nenhum contato da base tem a etiqueta ${alvo.join(', ')}`)
  let midia_id: string | null = null
  if (d.midia_id) {
    const m = await db.um('midias', { id: String(d.midia_id), negocio_id: n.id })
    if (!m || m.tipo !== 'foto') throw new Error('a imagem do recado tem que ser uma foto do banco de mídias desse negócio')
    midia_id = m.id
  }
  const quando = d.quando && !isNaN(Date.parse(d.quando)) && Date.parse(d.quando) > Date.now() ? new Date(d.quando).toISOString() : null
  const t = await escreveRecado(n, pedido)
  const rec = await db.insere('recados', {
    negocio_id: n.id, titulo: String(d.titulo || '').trim().slice(0, 60) || t.titulo, pedido, texto: t.texto, etiquetas_alvo: alvo, midia_id,
    status: 'aprovar_equipe', agendado_para: quando, criado_por: d.por, nota: t.sem_ia ? NOTA_SEM_IA : null, custo_msg: custoMsg(n),
  })
  await db.evento('recado_criado', n.id, { recado_id: rec.id, por: d.por, sem_ia: t.sem_ia })
  const est = estimativa(n, (await quemRecebe(n, rec, new Date(), { base })).lista.length)
  if (n.aprovacao_equipe === false) await equipeAprovaRecado(rec.id, 'automatico')
  else {
    const { avisaEquipe } = await import('./canal')
    await avisaEquipe('recado pra base pra aprovar', `${n.nome}: "${rec.titulo}" pra ${plural(est.contatos, 'contato')} (custo estimado ${reais(est.custo)}). Aprovar no painel da equipe, aba Base.${t.sem_ia ? ' A IA estava fora: o texto é provisório.' : ''}`, n.id)
  }
  return { ...((await db.um('recados', { id: rec.id })) || rec), estimativa: est }
}

const previa = (rec: any) => `Oi, (nome da pessoa)! ${rec.texto}`
export function textoProDono(neg: any, rec: any, est: { contatos: number; custo: number; custo_msg: number }) {
  const nome = primeiro(neg.dono_nome)
  const alvo = (rec.etiquetas_alvo || []).length ? ` com a etiqueta ${rec.etiquetas_alvo.join(', ')}` : ' da tua base'
  return `${nome ? nome + ', ' : ''}o recado pra base "${rec.titulo}" está pronto pra tu aprovar:\n\n"${previa(rec)}"\n[${BOTAO_QUERO}] [${BOTAO_SAIR}]\n\n` +
    `Vai pra ${plural(est.contatos, 'contato')}${alvo}, só no horário comercial. Custo estimado na Meta: ${reais(est.custo)} (${reais(est.custo_msg)} por mensagem, cobrado direto do teu negócio pela Meta).\n` +
    `Me dá um 👍 que eu peço a aprovação do WhatsApp e mando. Ou me diz o que mudar.`
}

async function recado(id: string) { const r = await db.um('recados', { id: String(id || '') }); if (!r) throw new Error('recado não existe'); return r }

// a equipe aprovou: vai pro dono (com a prévia, quantos contatos e o custo estimado)
export async function equipeAprovaRecado(id: string, por: string) {
  await exige()
  const rec = await recado(id)
  if (!['aprovar_equipe', 'rascunho'].includes(rec.status)) throw new Error('o recado não está esperando a equipe (' + (STATUS_NOME[rec.status] || rec.status) + ')')
  if (!String(rec.texto || '').trim()) throw new Error('o recado está sem texto')
  const neg = await db.um('negocios', { id: rec.negocio_id })
  const est = estimativa(neg, (await quemRecebe(neg, rec)).lista.length)
  const { conversaDoDono, mandaTexto, mandaImagem } = await import('./canal')
  let wamid: string | null = null
  if (neg?.dono_whatsapp) {
    const cv = await conversaDoDono(neg)
    const t = textoProDono(neg, rec, est)
    const m = rec.midia_id ? await db.um('midias', { id: rec.midia_id }) : null
    const link = m ? await db.link(m.path).catch(() => null) : null
    const r = link ? await mandaImagem(cv, link, t) : await mandaTexto(cv, t)
    wamid = r.wamid || null
  }
  const [x] = await db.atualiza('recados', { id: rec.id }, { status: 'aprovar_dono', aprovado_equipe_por: por, aprovado_equipe_em: new Date().toISOString(), wamid_dono: wamid, nota: null })
  await db.evento('recado_equipe_aprovou', rec.negocio_id, { recado_id: rec.id, por })
  return { ...x, estimativa: est }
}

// a equipe pede pra Maia refazer (com a nota) ou edita o texto direto
export async function equipeAjustaRecado(id: string, nota: string, por: string) {
  await exige()
  const rec = await recado(id)
  if (!['aprovar_equipe', 'rascunho'].includes(rec.status)) throw new Error('só dá pra ajustar antes de ir pro dono')
  if (!String(nota || '').trim()) throw new Error('escreve o ajuste')
  const neg = await db.um('negocios', { id: rec.negocio_id })
  const t = await escreveRecado(neg, rec.pedido || rec.texto, { anterior: rec.texto, nota })
  const [x] = await db.atualiza('recados', { id: rec.id }, { texto: t.texto, nota: t.sem_ia ? NOTA_SEM_IA + ' (o ajuste "' + nota.slice(0, 80) + '" não foi feito)' : null, status: 'aprovar_equipe' })
  await db.evento('recado_ajuste', rec.negocio_id, { recado_id: rec.id, por, quem: 'equipe', sem_ia: t.sem_ia })
  return x
}
export async function equipeEditaRecado(id: string, d: { texto?: string; titulo?: string; etiquetas?: string[] | string; quando?: string | null }, por: string) {
  await exige()
  const rec = await recado(id)
  if (!['aprovar_equipe', 'rascunho'].includes(rec.status)) throw new Error('só dá pra editar antes de ir pro dono')
  const neg = await db.um('negocios', { id: rec.negocio_id })
  const campos: any = {}
  if (d.texto !== undefined) {
    const { acertaTom } = await import('./tom')
    const t = limpaTexto(neg, String(d.texto), acertaTom)
    if (t.length < 20) throw new Error('o texto ficou curto demais')
    campos.texto = t; campos.nota = null
  }
  if (d.titulo !== undefined && String(d.titulo).trim()) campos.titulo = String(d.titulo).trim().slice(0, 60)
  if (d.etiquetas !== undefined) campos.etiquetas_alvo = etiquetasDe(d.etiquetas)
  if (d.quando !== undefined) campos.agendado_para = d.quando && !isNaN(Date.parse(d.quando)) ? new Date(d.quando).toISOString() : null
  const [x] = await db.atualiza('recados', { id: rec.id }, campos)
  await db.evento('recado_editado', rec.negocio_id, { recado_id: rec.id, por })
  return x
}
export async function cancelaRecado(id: string, por: string) {
  await exige()
  const rec = await recado(id)
  if (['enviado', 'cancelado'].includes(rec.status)) throw new Error('esse recado já está ' + STATUS_NOME[rec.status])
  const [x] = await db.atualiza('recados', { id: rec.id }, { status: 'cancelado' })
  await db.evento('recado_cancelado', rec.negocio_id, { recado_id: rec.id, por, estava: rec.status })
  return x
}

// ─────────────── o dono (WhatsApp e painel chamam as mesmas)
export async function recadosComDono(negocio_id: string) {
  if (!(await baseDisponivel().catch(() => false))) return []
  return db.lista('recados', { negocio_id, status: 'aprovar_dono' }, { ordem: 'criado_em' }).catch(() => [] as any[])
}
export async function recadoDaMensagem(negocio_id: string, wamid: string) {
  if (!wamid || !(await baseDisponivel().catch(() => false))) return null
  return db.um('recados', { negocio_id, wamid_dono: wamid }).catch(() => null)
}
const nomeDoModelo = (rec: any) => {
  const slug = semAc(rec.titulo || 'recado').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'recado'
  const d = new Date(Date.now() - 3 * 3600e3).toISOString()
  return `maia_recado_${slug}_${d.slice(8, 10)}${d.slice(5, 7)}_${String(rec.id).replace(/-/g, '').slice(0, 4)}`.replace(/_+/g, '_')
}
// o 👍 do dono: pede o modelo na Meta (só a partir daqui o WhatsApp deixa mandar pra quem não falou nas últimas 24 h)
export async function donoAprovaRecado(negocio_id: string, id?: string | null, via = 'whatsapp') {
  await exige()
  const lista = id ? [await db.um('recados', { id: String(id), negocio_id })].filter(Boolean) as any[] : await recadosComDono(negocio_id)
  const ok = lista.filter(r => r.status === 'aprovar_dono')
  if (id && !ok.length) throw new Error('esse recado não está esperando a tua aprovação')
  const neg = await db.um('negocios', { id: negocio_id })
  const { criaModeloRecado } = await import('./modelos')
  const { avisaEquipe } = await import('./canal')
  const feitos: any[] = []
  for (const rec of ok) {
    const nome = nomeDoModelo(rec)
    const m = await criaModeloRecado(neg, nome, rec.texto)
    await db.atualiza('recados', { id: rec.id }, { status: 'aguardando_meta', aprovado_dono_em: new Date().toISOString(), modelo_nome: nome, modelo_status: m.ok ? (m.status || 'PENDING') : 'ERRO', nota: m.ok ? null : 'a Meta não aceitou o pedido do modelo: ' + String(m.erro || '?').slice(0, 200) })
    await db.evento('recado_dono_aprovou', negocio_id, { recado_id: rec.id, via, modelo: nome, ok: m.ok })
    await avisaEquipe(m.ok ? 'dono aprovou o recado' : 'modelo do recado não foi pedido', `${neg?.nome}: "${rec.titulo}". ${m.ok ? 'O modelo foi pedido na Meta; quando aprovar, a rotina manda no horário comercial.' : 'Erro da Meta: ' + (m.erro || '?') + '. Pedir de novo na aba Base.'}`, negocio_id, !m.ok)
    feitos.push({ id: rec.id, titulo: rec.titulo, modelo: nome, ok: m.ok })
  }
  return feitos
}
// o dono pediu ajuste: a Maia refaz e volta pra equipe conferir (igual às peças)
export async function donoAjustaRecado(negocio_id: string, id: string | null, nota: string) {
  await exige()
  const pend = id ? [await db.um('recados', { id: String(id), negocio_id })].filter(Boolean) as any[] : await recadosComDono(negocio_id)
  const rec = pend.filter(r => r.status === 'aprovar_dono').slice(-1)[0]
  if (!rec) return { ok: false, erro: 'nenhum recado esperando a aprovação do dono' }
  if (!String(nota || '').trim()) return { ok: false, erro: 'falta dizer o que mudar' }
  const neg = await db.um('negocios', { id: negocio_id })
  const t = await escreveRecado(neg, rec.pedido || rec.texto, { anterior: rec.texto, nota })
  await db.atualiza('recados', { id: rec.id }, { texto: t.texto, status: 'aprovar_equipe', nota: 'o dono pediu: ' + nota.slice(0, 300) + (t.sem_ia ? ' (a IA estava fora: refazer à mão)' : '') })
  const { avisaEquipe } = await import('./canal')
  await avisaEquipe('dono pediu ajuste no recado', `${neg?.nome}: "${rec.titulo}": ${nota.slice(0, 160)}`, negocio_id)
  return { ok: true, recado: rec.id }
}
export async function donoCancelaRecado(negocio_id: string, id: string | null) {
  const pend = id ? [await db.um('recados', { id: String(id), negocio_id })].filter(Boolean) as any[] : await recadosComDono(negocio_id)
  const rec = pend.filter(r => !['enviado', 'cancelado'].includes(r.status)).slice(-1)[0]
  if (!rec) return { ok: false, erro: 'nenhum recado pra cancelar' }
  await cancelaRecado(rec.id, 'dono')
  return { ok: true, recado: rec.id }
}

// ─────────────── a Meta: a aprovação do modelo
// modo local (teste): a "Meta" é o campo modelo_status, que o teste (ou a equipe, no painel de teste) marca
export async function statusMetaSimulado(id: string, status: 'APPROVED' | 'REJECTED' | 'PENDING', motivo?: string) {
  if (!maiaLocal()) throw new Error('só no modo de teste')
  const [x] = await db.atualiza('recados', { id }, { modelo_status: status, ...(motivo ? { modelo_motivo: motivo } : {}) })
  return x
}
// pedir o modelo de novo (a Meta recusou o pedido ou deu erro)
export async function pedeModeloDeNovo(id: string, por: string) {
  const rec = await recado(id)
  if (rec.status !== 'aguardando_meta') throw new Error('o recado não está esperando a Meta')
  const neg = await db.um('negocios', { id: rec.negocio_id })
  const { criaModeloRecado } = await import('./modelos')
  const nome = rec.modelo_status === 'ERRO' || !rec.modelo_nome ? nomeDoModelo(rec) : rec.modelo_nome
  const m = await criaModeloRecado(neg, nome, rec.texto)
  const [x] = await db.atualiza('recados', { id: rec.id }, { modelo_nome: nome, modelo_status: m.ok ? (m.status || 'PENDING') : 'ERRO', nota: m.ok ? null : 'a Meta não aceitou o pedido do modelo: ' + String(m.erro || '?').slice(0, 200) })
  await db.evento('recado_modelo_de_novo', rec.negocio_id, { recado_id: rec.id, por, ok: m.ok })
  return x
}
async function confereMeta(neg: any, recs: any[]) {
  const { waDoNegocio } = await import('./wa-negocio')
  const w = waDoNegocio(neg)
  let daMeta: Record<string, any> | null = null
  if (!maiaLocal() && w?.waba) {
    const { statusModelos } = await import('./modelos')
    const s: any = await statusModelos({ token: w.token, waba: w.waba }).catch(() => null)
    if (s?.ok) { daMeta = {}; for (const m of s.modelos || []) daMeta[m.name] = m }
  }
  const out: any[] = []
  for (const rec of recs) {
    if (rec.modelo_status === 'ERRO') continue
    const m = daMeta ? daMeta[rec.modelo_nome] : maiaLocal() ? { status: rec.modelo_status, rejected_reason: rec.modelo_motivo } : null
    const st = String(m?.status || '').toUpperCase()
    if (st === 'APPROVED') {
      await db.atualiza('recados', { id: rec.id }, { status: 'agendado', modelo_status: 'APPROVED' })
      rec.status = 'agendado'; rec.modelo_status = 'APPROVED'
      out.push({ recado: rec.id, meta: 'aprovado' })
    } else if (st === 'REJECTED') {
      const motivo = String(m?.rejected_reason || 'sem motivo').replace(/_/g, ' ').toLowerCase()
      await db.atualiza('recados', { id: rec.id }, { status: 'aprovar_equipe', modelo_status: 'REJECTED', nota: `a Meta recusou o modelo (${motivo}). Ajusta o texto e aprova de novo: ele volta pro dono.` })
      const { avisaEquipe } = await import('./canal')
      await avisaEquipe('a Meta recusou o recado', `${neg.nome}: "${rec.titulo}" (${motivo}). Ajustar na aba Base.`, neg.id, true)
      out.push({ recado: rec.id, meta: 'recusado' })
    } else if (st && st !== rec.modelo_status) await db.atualiza('recados', { id: rec.id }, { modelo_status: st })
  }
  return out
}

// ─────────────── o envio (rotina de hora em hora)
const RODAPE_TEXTO = 'Pra participar, é só responder QUERO. Se não quiser mais receber esses avisos, responde SAIR.'
async function mandaUm(neg: any, rec: any, c: any, cvDe: Map<string, any>, link: string | null) {
  const { mandaTexto, mandaImagem, mandaModeloCliente, janelaAbertaCv } = await import('./canal')
  const nome = primeiro(c.nome).slice(0, 30) || 'tudo bem'
  const cv = variantes(c.telefone).map(t => cvDe.get(t)).find(Boolean)
  if (cv && janelaAbertaCv(cv)) {
    const corpo = `Oi, ${nome}! ${rec.texto}\n\n${RODAPE_TEXTO}`
    const r = link ? await mandaImagem(cv, link, corpo) : await mandaTexto(cv, corpo)
    return { ...r, como: link ? 'imagem' : 'texto' }
  }
  if (cv) return { ...(await mandaModeloCliente(cv, rec.modelo_nome, [nome], `(modelo ${rec.modelo_nome}) recado pra base: ${rec.titulo}`)), como: 'modelo' }
  if (ehSimulado(c.telefone)) return { ok: true, wamid: 'sim-rec-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), como: 'modelo' }
  const { waDoNegocio, enviaModeloNeg } = await import('./wa-negocio')
  return { ...(await enviaModeloNeg(waDoNegocio(neg)!, c.telefone, rec.modelo_nome, [nome])), como: 'modelo' }
}

export async function mandaLote(neg: any, rec: any, relogio = new Date()) {
  const q = await quemRecebe(neg, rec, relogio)
  const lote = q.lista.slice(0, loteDo(neg))
  // número de verdade só sai com o WhatsApp do negócio ligado (MAIA_CLIENTES_LIGADO + atendimento ligado pela equipe)
  const { atendimentoLigado } = await import('./wa-negocio')
  if (lote.some(c => !ehSimulado(c.telefone)) && !atendimentoLigado(neg)) {
    const ja = (await db.lista('eventos', { negocio_id: neg.id, tipo: 'recado_travado' })).some(e => e.detalhe?.recado_id === rec.id)
    if (!ja) {
      await db.evento('recado_travado', neg.id, { recado_id: rec.id })
      const { avisaEquipe } = await import('./canal')
      await avisaEquipe('recado pra base parado', `${neg.nome}: "${rec.titulo}" está aprovado, mas o WhatsApp do negócio não está ligado pra mandar (conexão ou atendimento desligado). Assim que ligar, a rotina manda.`, neg.id, true)
    }
    return { recado: rec.id, travado: 'whatsapp do negócio desligado' }
  }
  if (rec.status !== 'enviando') { await db.atualiza('recados', { id: rec.id }, { status: 'enviando', iniciado_em: relogio.toISOString() }); rec.status = 'enviando' }
  const cvDe = new Map<string, any>()
  for (const cv of await db.lista('conversas', { negocio_id: neg.id, canal: 'cliente' })) cvDe.set(cv.telefone, cv)
  const m = rec.midia_id ? await db.um('midias', { id: rec.midia_id }) : null
  const link = m ? await db.link(m.path).catch(() => null) : null
  let ok = 0, falhas = 0
  for (const c of lote) {
    const env: any = await mandaUm(neg, rec, c, cvDe, link).catch((e: any) => ({ ok: false, erro: String(e?.message || e).slice(0, 200), como: 'modelo' }))
    try {
      await db.insere('recado_envios', { negocio_id: neg.id, recado_id: rec.id, base_id: c.id, telefone: c.telefone, como: env.como, status: env.ok ? 'enviado' : 'falhou', wamid: env.wamid || null, erro: env.ok ? null : String(env.erro || '?').slice(0, 200), enviado_em: relogio.toISOString() })
    } catch { continue }   // já tinha (duas rotinas ao mesmo tempo): não conta de novo
    if (env.ok) { ok++; await db.atualiza('base', { id: c.id }, { ultimo_recado_em: relogio.toISOString() }) } else falhas++
  }
  const resta = q.lista.length - lote.length
  const n = await reconta(rec.id)
  if (resta <= 0) {
    await db.atualiza('recados', { id: rec.id }, { status: 'enviado', enviado_em: relogio.toISOString(), pulados: q.pulados })
    await db.evento('recado_enviado', neg.id, { recado_id: rec.id, enviados: n.enviados, falhas: n.falhas, pulados: q.pulados })
    if (neg.dono_whatsapp) {
      const { conversaDoDono, mandaTexto } = await import('./canal')
      const t = n.enviados
        ? `Pronto: o recado "${rec.titulo}" foi pra ${plural(n.enviados, 'contato')} da tua base.${q.pulados ? ` ${plural(q.pulados, 'pessoa ficou', 'pessoas ficaram')} de fora porque já tinha${q.pulados === 1 ? '' : 'm'} recebido recado nos últimos dias (pra ninguém se incomodar).` : ''} Quem responder que quer participar, eu te passo na hora pra tu fechar.`
        : `O recado "${rec.titulo}" não foi pra ninguém: todo mundo da lista já tinha recebido recado nos últimos 3 dias ou pediu pra sair. Dá pra mandar daqui uns dias.`
      await mandaTexto(await conversaDoDono(neg), t).catch(() => null)
    }
    if (falhas) { const { avisaEquipe } = await import('./canal'); await avisaEquipe('recado pra base com falhas', `${neg.nome}: "${rec.titulo}" não saiu pra ${plural(falhas, 'contato')} (ver a aba Base).`, neg.id) }
  }
  return { recado: rec.id, enviados: ok, falhas, resta: Math.max(0, resta), pulados: q.pulados, terminou: resta <= 0 }
}

// os números do recado a partir dos envios (as vendas somam na hora da venda: vendaDoRecado)
export async function reconta(recado_id: string) {
  const es = await db.lista('recado_envios', { recado_id })
  const c = {
    enviados: es.filter(e => e.status !== 'falhou').length, falhas: es.filter(e => e.status === 'falhou').length,
    entregues: es.filter(e => e.status === 'entregue' || e.status === 'lido').length,
    respostas: es.filter(e => e.respondeu_em).length, quero: es.filter(e => e.quero_em).length, saidas: es.filter(e => e.saiu_em).length,
  }
  await db.atualiza('recados', { id: recado_id }, c)
  return c
}

// a rotina: confere a Meta e manda os lotes. Fora do horário do negócio, espera a próxima rodada dentro dele
export async function rotinaRecados(relogio = new Date()) {
  if (!(await baseDisponivel().catch(() => false))) return { indisponivel: true }
  const recs = (await db.lista('recados', {}, { ordem: 'criado_em' })).filter(r => ['aguardando_meta', 'agendado', 'enviando'].includes(r.status))
  const feitos: any[] = []
  const porNeg = new Map<string, any[]>()
  for (const r of recs) (porNeg.get(r.negocio_id) || porNeg.set(r.negocio_id, []).get(r.negocio_id)!).push(r)
  for (const [negocio_id, lista] of porNeg) {
    const neg = await db.um('negocios', { id: negocio_id })
    if (!neg || ['pausado', 'cancelado'].includes(neg.status)) continue
    try {
      const esperando = lista.filter(r => r.status === 'aguardando_meta')
      if (esperando.length) feitos.push(...await confereMeta(neg, esperando))
      for (const rec of lista.filter(r => r.status === 'agendado' || r.status === 'enviando')) {
        if (rec.agendado_para && rec.agendado_para > relogio.toISOString()) continue
        if (!podeFalar(neg, relogio)) { feitos.push({ recado: rec.id, fora_do_horario: true }); continue }
        feitos.push(await mandaLote(neg, rec, relogio))
      }
    } catch (e: any) { feitos.push({ negocio: negocio_id, erro: String(e?.message || e).slice(0, 200) }) }
  }
  // os números dos recados da última semana (entregues chegam depois, pelo webhook)
  for (const r of (await db.lista('recados', { status: 'enviado' })).filter(r => r.enviado_em && Date.now() - Date.parse(r.atualizado_em || r.enviado_em) < 7 * D)) await reconta(r.id).catch(() => null)
  return feitos
}

// o status da Meta (webhook do WhatsApp do negócio): entregue, lido, falhou. "entregue" não volta atrás de "lido"
export async function anotaStatusEnvio(wamid: string, st: string) {
  if (!wamid || !['entregue', 'lido', 'falhou'].includes(st)) return
  if (!(await baseDisponivel().catch(() => false))) return
  if (st === 'entregue') await db.atualiza('recado_envios', { wamid, status: 'enviado' }, { status: st })
  else await db.atualiza('recado_envios', { wamid }, { status: st })
}

// ─────────────── 3) as respostas (atendente.ts, recebeDoCliente)
const ehSair = (t: string) => t === semAc(BOTAO_SAIR) || /^(sair|parar|pare|stop|cancelar|descadastrar|remover|remova|nao quero (mais )?receber( mais)?( esses avisos| isso| essas mensagens| mensagens?)?|nao quero mais( receber)?|me (tira|tire) (da|dessa) lista)$/.test(t)
const ehQuero = (t: string) => t === semAc(BOTAO_QUERO) || /^(quero|eu quero|quero sim|sim,? quero|quero participar|participar|to dentro|quero entrar|me reserva( uma)?|reserva (uma|a minha)( pra mim)?|separa (uma|a minha)( pra mim)?)$/.test(t)
async function ultimoEnvio(negocio_id: string, tel: string, dias = 7) {
  const es: any[] = []
  for (const v of variantes(tel)) es.push(...await db.lista('recado_envios', { negocio_id, telefone: v }, { ordem: 'criado_em', desc: true, limite: 1 }))
  return es.filter(e => e.status !== 'falhou' && Date.now() - Date.parse(e.criado_em) < dias * D).sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1))[0] || null
}

// o que essa mensagem do cliente é pro recado: saiu da lista, quer participar, ou respondeu (ou nada: null)
export async function respostaDaBase(neg: any, d: { telefone: string; texto: string }) {
  if (!(await baseDisponivel().catch(() => false))) return null
  const tel = normalizaTel(d.telefone) || fone(d.telefone)
  const t = semAc(d.texto).trim().replace(/[.!\s]+$/, '').replace(/\s+/g, ' ')
  const envio = await ultimoEnvio(neg.id, tel)
  if (ehSair(t)) {
    const naBase = (await Promise.all(variantes(tel).map(v => db.um('base', { negocio_id: neg.id, telefone: v })))).find(Boolean)
    // "sair"/"parar" de quem nem está na base nem recebeu recado não é com o recado (o atendente cuida)
    if (!envio && !naBase && t !== semAc(BOTAO_SAIR)) return null
    const agora = new Date().toISOString()
    if (naBase) await db.atualiza('base', { id: naBase.id }, { optout: true, optout_em: agora })
    else await db.insere('base', { negocio_id: neg.id, telefone: tel, nome: null, etiquetas: [], optout: true, optout_em: agora, origem: 'conversa' }).catch(() => null)
    if (envio) { await db.atualiza('recado_envios', { id: envio.id }, { saiu_em: agora, respondeu_em: envio.respondeu_em || agora }); await reconta(envio.recado_id) }
    await db.evento('base_optout', neg.id, { recado_id: envio?.recado_id || null })
    return { tipo: 'saiu' as const, envio, recado: envio ? await db.um('recados', { id: envio.recado_id }) : null }
  }
  if (!envio) return null
  const rec = await db.um('recados', { id: envio.recado_id })
  if (!rec) return null
  // "quero" vale como resposta ao recado: o botão sempre; escrito, só se for a 1ª resposta depois do recado
  const quero = !envio.quero_em && (t === semAc(BOTAO_QUERO) || (!envio.respondeu_em && ehQuero(t)))
  const agora = new Date().toISOString()
  await db.atualiza('recado_envios', { id: envio.id }, { respondeu_em: envio.respondeu_em || agora, ...(quero ? { quero_em: agora } : {}) })
  await reconta(rec.id)
  return { tipo: quero ? 'quero' as const : 'resposta' as const, envio, recado: rec }
}

export const textoSaiu = (neg: any) => tomDoNegocio(neg).pessoa === 'voce'
  ? `Pronto, você não vai mais receber esses avisos ${doNeg(neg)}. Se precisar de alguma coisa, é só chamar aqui.`
  : `Pronto, tu não vai mais receber esses avisos ${doNeg(neg)}. Se precisar de alguma coisa, é só chamar aqui.`
export const textoQuero = (neg: any) => tomDoNegocio(neg).pessoa === 'voce'
  ? `Que bom! Já avisei a equipe ${doNeg(neg)}: uma pessoa fala com você por aqui mesmo pra separar a sua participação.`
  : `Que bom! Já avisei a equipe ${doNeg(neg)}: uma pessoa fala contigo por aqui mesmo pra separar a tua participação.`

// "Quero participar": o contato vai pro funil (proposta) e a conversa passa pro time do negócio fechar (a Maia não vende)
export async function queroDoRecado(neg: any, cv: any, lead: any, rec: any) {
  const { mandaTexto } = await import('./canal')
  await db.insere('lead_eventos', { negocio_id: neg.id, lead_id: lead.id, tipo: 'recado_quero', autor: 'maia', detalhe: { recado_id: rec.id, titulo: rec.titulo } })
  if (lead.etapa === 'perdido') { const { mudaEtapa } = await import('./funil'); lead = (await mudaEtapa(lead, 'proposta', 'maia', { produto: rec.titulo })) || lead }
  await mandaTexto(cv, textoQuero(neg))
  const { passaPraFechar } = await import('./atendente')
  await passaPraFechar(neg, cv, lead, `quer fechar: respondeu "${BOTAO_QUERO}" no recado "${rec.titulo}"`)
  return lead
}
// o contato respondeu outra coisa: fica ligado ao recado (pra venda somar) e a Maia atende normal
export async function ligaAoRecado(neg: any, lead: any, rec: any) {
  const evs = await db.lista('lead_eventos', { lead_id: lead.id })
  if (evs.some(e => (e.tipo === 'recado_resposta' || e.tipo === 'recado_quero') && e.detalhe?.recado_id === rec.id)) return
  await db.insere('lead_eventos', { negocio_id: neg.id, lead_id: lead.id, tipo: 'recado_resposta', autor: 'maia', detalhe: { recado_id: rec.id, titulo: rec.titulo } })
}

// pro atendimento: de qual recado esse cliente veio (a Maia responde sabendo)
export async function contextoDoRecado(neg: any, telefone: string) {
  if (!(await baseDisponivel().catch(() => false))) return ''
  const e = await ultimoEnvio(neg.id, normalizaTel(telefone) || fone(telefone))
  if (!e) return ''
  const rec = await db.um('recados', { id: e.recado_id })
  return rec ? `\nESSE CLIENTE RECEBEU O RECADO PRA BASE "${rec.titulo}" (${String(e.enviado_em || e.criado_em).slice(0, 10)}): "${rec.texto}". Responde sabendo disso. Se ele quiser participar ou comprar, é fechamento: passar_para_o_dono com "quer fechar: ...". Tu não vende nem cobra pelo WhatsApp (sem Pix, sem link de pagamento).` : ''
}

// a venda marcada num contato que veio do recado soma no recado (uma vez por contato e recado)
export async function vendaDoRecado(lead: any, valor: number | null) {
  if (!lead?.id || !(await baseDisponivel().catch(() => false))) return null
  const evs = await db.lista('lead_eventos', { lead_id: lead.id })
  const lig = evs.filter(e => (e.tipo === 'recado_quero' || e.tipo === 'recado_resposta') && Date.now() - Date.parse(e.criado_em) < 45 * D).sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1))[0]
  if (!lig) return null
  const rid = lig.detalhe?.recado_id
  const rec = await db.um('recados', { id: rid })
  if (!rec) return null
  // a mesma venda marcada de novo (ex.: "Fechou" sem valor e depois "foi 50"): não conta outra venda, só acerta o valor
  const ja = evs.find(x => x.tipo === 'recado_venda' && x.detalhe?.recado_id === rid)
  if (ja) {
    const antes = Number(ja.detalhe?.valor) || 0, agora = Number(valor) || 0
    if (valor == null || agora === antes) return null
    await db.atualiza('lead_eventos', { id: ja.id }, { detalhe: { ...ja.detalhe, valor: agora } })
    const [y] = await db.atualiza('recados', { id: rid }, { valor_vendas: r2((Number(rec.valor_vendas) || 0) - antes + agora) })
    return y
  }
  await db.insere('lead_eventos', { negocio_id: lead.negocio_id, lead_id: lead.id, tipo: 'recado_venda', autor: 'maia', detalhe: { recado_id: rid, valor } })
  const [x] = await db.atualiza('recados', { id: rid }, { vendas: (Number(rec.vendas) || 0) + 1, valor_vendas: r2((Number(rec.valor_vendas) || 0) + (Number(valor) || 0)) })
  return x
}

// ─────────────── a lista pelo WhatsApp do dono (dono.ts): planilha .csv, cartão .vcf ou contatos compartilhados
export function ehListaDoDono(m: any) {
  if (m?.type === 'contacts' && Array.isArray(m.contacts)) return true
  if (m?.type !== 'document') return false
  const mime = String(m.document?.mime_type || '').toLowerCase(), nome = String(m.document?.filename || '').toLowerCase()
  return /csv|vcard|x-vcard|spreadsheet|ms-excel|text\/plain/.test(mime) || /\.(csv|vcf|txt|xlsx?)$/.test(nome)
}
export async function importaListaDoDono(neg: any, m: any, midia?: { buf: Buffer; mime: string }) {
  if (!(await baseDisponivel().catch(() => false))) {
    const { avisaEquipe } = await import('./canal')
    await avisaEquipe('lista de contatos chegou sem a base ligada', `${neg.nome}: o dono mandou uma lista pelo WhatsApp. ${INDISPONIVEL}`, neg.id)
    return { ok: false, resposta: 'Recebi a lista! A parte de recado pra base ainda está sendo ligada aqui: a equipe já foi avisada e eu te confirmo quando ela entrar.' }
  }
  let texto = ''
  if (m.type === 'contacts') texto = (m.contacts || []).map((c: any) => `${String(c?.name?.formatted_name || c?.name?.first_name || '').replace(/[;\n]/g, ' ')};${(c?.phones || [])[0]?.wa_id || (c?.phones || [])[0]?.phone || ''}`).join('\n')
  else {
    const nome = String(m.document?.filename || '').toLowerCase(), mime = String(m.document?.mime_type || midia?.mime || '').toLowerCase()
    if (/\.xlsx?$/.test(nome) || /spreadsheet|ms-excel/.test(mime) && !/csv/.test(mime)) return { ok: false, resposta: 'Recebi a planilha, mas eu leio só no formato .csv. No Excel ou no Google Planilhas: Arquivo → Salvar como (ou Fazer download) → CSV. Uma coluna com o nome, uma com o telefone com DDD e, se quiser, uma com as etiquetas (ex.: mega, lotofácil).' }
    let buf = midia?.buf
    if (!buf) { const { baixaMidia } = await import('@/lib/oito/wa'); buf = (await baixaMidia(m.document.id)).buf }
    texto = buf.toString('utf8')
    if (texto.includes('�')) texto = buf.toString('latin1')   // planilha salva no Excel do Windows
  }
  const leg = String(m.document?.caption || '')
  const etq = /etiquetas?\s*:?\s*(.+)$/i.exec(leg)?.[1] || null
  try {
    const r = await importaBase(neg, { texto, origem: 'dono', etiquetas: etq, por: 'dono_whatsapp' })
    const b = await baseDoNegocio(neg, 0)
    const partes = [r.ja_estavam ? `${r.ja_estavam} já estava${r.ja_estavam === 1 ? '' : 'm'}` : '', r.repetidos ? `${plural(r.repetidos, 'repetido')} no arquivo` : '', r.invalidos ? `${r.invalidos} ${r.invalidos === 1 ? 'número não deu' : 'números não deu'} pra ler (sem DDD ou incompleto${r.exemplos_invalidos.length ? ', ex.: ' + r.exemplos_invalidos.slice(0, 2).join(', ') : ''})` : ''].filter(Boolean)
    return { ...r, resposta: `Recebi a lista: ${r.novos === 1 ? '1 contato novo entrou' : r.novos + ' contatos novos entraram'} na tua base${partes.length ? ' (' + partes.join('; ') + ')' : ''}. Agora são ${b.ativos} na base. Quando quiser avisar todo mundo de uma novidade, é só me dizer "manda pra base que...".` }
  } catch (e: any) { return { ok: false, resposta: `Não consegui ler essa lista: ${String(e?.message || e).slice(0, 160)}. Manda em .csv com uma linha por pessoa: nome;telefone;etiquetas.` } }
}

// ─────────────── os painéis (equipe e dono) e o resumo da semana
export async function painelRecados(neg: any, limite = 20) {
  const recs = await db.lista('recados', { negocio_id: neg.id }, { ordem: 'criado_em', desc: true, limite })
  const base = await db.lista('base', { negocio_id: neg.id })
  const recentes = await db.lista('recado_envios', { negocio_id: neg.id }, { desde: ['enviado_em', new Date(Date.now() - 7 * D).toISOString()] })
  const out: any[] = []
  for (const r of recs) {
    const antes = ['rascunho', 'aprovar_equipe', 'aprovar_dono', 'aguardando_meta', 'agendado'].includes(r.status)
    const est = antes ? estimativa(neg, (await quemRecebe(neg, r, new Date(), { base, recentes })).lista.length) : null
    const n = r.status === 'enviando' || r.status === 'enviado' ? await reconta(r.id) : null
    const v = n ? { ...r, ...n } : r
    out.push({ id: r.id, titulo: r.titulo, texto: r.texto, pedido: r.pedido, status: r.status, status_nome: STATUS_NOME[r.status] || r.status, etiquetas_alvo: r.etiquetas_alvo || [],
      midia_id: r.midia_id || null, agendado_para: r.agendado_para || null, enviado_em: r.enviado_em || null, criado_em: r.criado_em, criado_por: r.criado_por, nota: r.nota || null,
      modelo_nome: r.modelo_nome || null, modelo_status: r.modelo_status || null,
      numeros: { enviados: v.enviados || 0, entregues: v.entregues || 0, respostas: v.respostas || 0, quero: v.quero || 0, saidas: v.saidas || 0, vendas: v.vendas || 0, valor_vendas: Number(v.valor_vendas) || 0, falhas: v.falhas || 0, pulados: v.pulados || 0 },
      estimativa: est, custo_real: n ? r2((n.enviados || 0) * (Number(r.custo_msg) || custoMsg(neg))) : null })
  }
  return out
}
export async function painelDoDono(neg: any) {
  if (!(await baseDisponivel().catch(() => false))) return { disponivel: false }
  const b = await baseDoNegocio(neg, 0)
  // o dono não vê a nota interna da equipe nem o texto que a equipe ainda está revisando
  const recados = (await painelRecados(neg, 10)).map(r => ({ ...r, nota: null, pedido: null, texto: r.status === 'aprovar_equipe' || r.status === 'rascunho' ? null : r.texto }))
  return { disponivel: true, base: { total: b.total, ativos: b.ativos, saiu: b.saiu, etiquetas: b.etiquetas.slice(0, 12) }, recados, custo_msg: custoMsg(neg) }
}
// a soma dos recados que saíram no período (resumo da semana)
export async function recadosDoPeriodo(neg: any, de: Date, ate: Date) {
  if (!(await baseDisponivel().catch(() => false))) return null
  const rs = (await db.lista('recados', { negocio_id: neg.id })).filter(r => (r.status === 'enviado' || r.status === 'enviando') && (Number(r.enviados) || 0) > 0 && String(r.iniciado_em || r.enviado_em || '') >= de.toISOString() && String(r.iniciado_em || r.enviado_em || '') <= ate.toISOString())
  if (!rs.length) return null
  const s = (k: string) => rs.reduce((t, r) => t + (Number(r[k]) || 0), 0)
  return { recados: rs.length, enviados: s('enviados'), quero: s('quero'), vendas: s('vendas'), valor_vendas: r2(s('valor_vendas')), saidas: s('saidas') }
}
