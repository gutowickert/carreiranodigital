// Maia: aprender com as correções da equipe (13/11). Tudo passa pela aprovação do time; quando o time recusa, pede ajuste
// ou corrige uma resposta, o painel pergunta O PORQUÊ (motivos rápidos + campo livre). Com isso:
//   1) cada correção vira um evento 'correcao_time' (negócio, o que foi corrigido, motivo, quem, "o certo seria")
//   2) semanal (segunda 8h) ou no botão: a Maia junta as correções por negócio e PROPÕE regras ('regra_proposta')
//      ex.: "na Wood, 4 ganchos recusados sem região → regra: todo gancho da Wood leva a região"
//   3) a equipe aprova, edita ou recusa. Aprovada vira evento 'regra' (a fonte da verdade, sem tabela nova) e é copiada
//      pra negocios.contexto.regras_aprendidas[] de cada negócio que ela vale (escopo 'negocio' = só ele; 'geral' = todos).
//      O prompt de criação (pecas.ts) e o de atendimento (atendente.ts) leem dali com textoRegrasAprendidas(neg, area).
//   4) "quanto a Maia acerta de primeira": peças aprovadas sem ajuste / decididas, e respostas sem correção / respostas.
// A IA (modelo barato) só escreve o texto da regra; quem decide o que vira proposta é a contagem no código.
import crypto from 'node:crypto'
import { maiaDb as db } from './db'

export type Area = 'criacao' | 'atendimento' | 'tudo'
export type Alvo = 'peca' | 'resposta' | 'sugestao'
type Regra = { id: string; texto: string; area: Area; escopo: 'negocio' | 'geral'; negocio_id: string | null; motivo?: string | null; ativa: boolean; aprovada_em?: string; por?: string; proposta?: string | null }

// os botões rápidos do "por quê" (o painel mostra estes; 'outro' é o campo livre)
export const MOTIVOS: Record<string, { rotulo: string; area: Area }> = {
  gancho_generico: { rotulo: 'gancho genérico', area: 'criacao' },
  sem_regiao: { rotulo: 'sem cidade/região', area: 'criacao' },
  foto_nao_mostra: { rotulo: 'foto não mostra o produto', area: 'criacao' },
  cara_de_ia: { rotulo: 'imagem com cara de IA', area: 'criacao' },
  preco_antes: { rotulo: 'falou preço antes do valor', area: 'tudo' },
  tom_errado: { rotulo: 'tom errado', area: 'tudo' },
  prometeu: { rotulo: 'prometeu o que não pode', area: 'tudo' },
  inventou: { rotulo: 'inventou informação', area: 'tudo' },
  outro: { rotulo: 'outro motivo', area: 'tudo' },
}
const rotulo = (m: string) => MOTIVOS[m]?.rotulo || m

// quantas correções com o mesmo motivo (no mesmo negócio) fazem a Maia propor uma regra. Padrão 2
const MINIMO = () => Math.max(1, Number(process.env.MAIA_APRENDE_MINIMO) || 2)

// ---------- 1) guardar a correção ----------
export async function registraCorrecao(d: {
  negocio_id: string; alvo: Alvo; acao?: string | null; peca_id?: string | null; conversa_id?: string | null; msg_id?: string | number | null
  motivos?: string[]; livre?: string | null; certo?: string | null; por?: string | null
}) {
  const neg = await db.um('negocios', { id: d.negocio_id })
  if (!neg) throw new Error('negócio não existe')
  const motivos = [...new Set((d.motivos || []).map(String).filter(m => MOTIVOS[m]))]
  const livre = String(d.livre || '').trim().slice(0, 300)
  if (livre && !motivos.includes('outro') && !motivos.length) motivos.push('outro')
  if (!motivos.length) throw new Error('escolhe um motivo ou escreve o porquê')
  // o que foi corrigido (uma cópia curta: a peça pode mudar depois do ajuste, a mensagem pode ser apagada pela LGPD)
  let original = ''
  if (d.peca_id) {
    const p = await db.um('pecas', { id: d.peca_id })
    if (!p || p.negocio_id !== neg.id) throw new Error('peça não é desse negócio')
    original = [p.gancho, p.texto, p.cta].filter(Boolean).join(' · ').slice(0, 400)
  }
  if (d.msg_id != null && d.msg_id !== '') {
    const m = await db.um('msgs', { id: d.msg_id as any })
    if (!m || m.negocio_id !== neg.id) throw new Error('mensagem não é desse negócio')
    if (m.autor !== 'maia') throw new Error('só dá pra corrigir mensagem da Maia')
    original = String(m.texto || '').slice(0, 600)
  }
  const detalhe = {
    alvo: d.alvo, acao: d.acao || null, peca_id: d.peca_id || null, conversa_id: d.conversa_id || null, msg_id: d.msg_id ?? null,
    motivos, livre: livre || null, certo: String(d.certo || '').trim().slice(0, 800) || null, original, por: d.por || 'equipe',
  }
  return db.insere('eventos', { tipo: 'correcao_time', negocio_id: neg.id, detalhe })
}

export async function correcoes(negocio_id?: string | null, dias = 60) {
  const desde = new Date(Date.now() - dias * 86400e3).toISOString()
  const l = await db.lista('eventos', negocio_id ? { tipo: 'correcao_time', negocio_id } : { tipo: 'correcao_time' }, { ordem: 'criado_em', desc: true, desde: ['criado_em', desde] })
  return l
}

// ---------- 2) propor regras ----------
// o texto padrão da regra (sem IA). A IA, quando ligada, reescreve com os exemplos das correções
function regraPadrao(neg: any, motivo: string, livres: string[]): { texto: string; area: Area } | null {
  const nome = neg?.nome || 'este negócio'
  const regiao = neg?.regiao || (neg?.cidade ? neg.cidade + ' e região' : 'a cidade do negócio')
  switch (motivo) {
    case 'gancho_generico': return { area: 'criacao', texto: `Todo gancho do ${nome} começa pelo público e pela situação dele, com um detalhe concreto do produto. Nada de frase que serviria pra qualquer negócio.` }
    case 'sem_regiao': return { area: 'criacao', texto: `Todo gancho do ${nome} leva a cidade ou a região (${regiao}), com leveza.` }
    case 'foto_nao_mostra': return { area: 'criacao', texto: `No ${nome}, só usa foto em que o produto aparece claro e é o centro da imagem.` }
    case 'cara_de_ia': return { area: 'criacao', texto: `No ${nome}, nada de imagem com cara de IA: só foto real do negócio, sem efeito artificial.` }
    case 'preco_antes': return { area: 'tudo', texto: `No ${nome}, o preço vem sempre depois de dizer o que o cliente ganha (valor antes do preço).` }
    case 'tom_errado': return { area: 'tudo', texto: `No ${nome}, confere o tom combinado antes de mandar${livres.length ? ` (a equipe corrigiu: ${livres.slice(0, 2).join('; ')})` : ''}.` }
    case 'prometeu': return { area: 'tudo', texto: `No ${nome}, nunca promete o que não está no cadastro (prazo, resultado, desconto, brinde). Na dúvida, pergunta pro dono.` }
    case 'inventou': return { area: 'tudo', texto: `No ${nome}, não inventa informação: o que não está no que tu sabe, diz que confirma e pergunta pro dono.` }
    default: return livres.length ? { area: 'tudo', texto: `No ${nome}: ${livres[0]}` } : null
  }
}

async function textoComIA(neg: any, motivo: string, grupo: any[], padrao: { texto: string; area: Area }): Promise<{ texto: string; area: Area; ia: boolean }> {
  if (!process.env.ANTHROPIC_API_KEY || process.env.MAIA_APRENDE_SEM_IA === '1') return { ...padrao, ia: false }
  try {
    const { emJson } = await import('./ia')
    const { modeloBarato } = await import('./misto')
    const ex = grupo.slice(0, 8).map((c, i) => `${i + 1}. (${c.detalhe.alvo}) "${String(c.detalhe.original || '').slice(0, 200)}"${c.detalhe.livre ? ` · porquê: ${c.detalhe.livre}` : ''}${c.detalhe.certo ? ` · o certo seria: ${String(c.detalhe.certo).slice(0, 200)}` : ''}`).join('\n')
    const r = await emJson<{ regra: string; area: Area }>(
      'Tu transformas correções da equipe de marketing em UMA regra curta e clara pra IA que cria anúncios e atende clientes de um pequeno negócio. Português do Brasil, uma frase, no imperativo ou afirmativa, concreta, sem inventar nada além do que as correções mostram.',
      `NEGÓCIO: ${neg.nome} (${neg.nicho || ''}, ${neg.cidade || ''}). Região: ${neg.regiao || ''}.\nMOTIVO DAS CORREÇÕES: ${rotulo(motivo)}\nCORREÇÕES:\n${ex}\nSUGESTÃO DE REGRA (pode melhorar): ${padrao.texto}\nDevolve {"regra":"...","area":"criacao|atendimento|tudo"} (criacao = anúncios e posts; atendimento = conversa com cliente).`,
      [], { modelo: modeloBarato(), uso: { tipo: 'aprendizado', negocio_id: neg.id } })
    const t = String(r?.regra || '').trim()
    if (t.length < 10 || t.length > 400) return { ...padrao, ia: false }
    return { texto: t, area: ['criacao', 'atendimento', 'tudo'].includes(r.area) ? r.area : padrao.area, ia: true }
  } catch { return { ...padrao, ia: false } }
}

export async function propostas(status?: string | null) {
  const l = await db.lista('eventos', { tipo: 'regra_proposta' }, { ordem: 'criado_em', desc: true, limite: 500 })
  return status ? l.filter(e => e.detalhe?.status === status) : l
}

// junta as correções que ainda não entraram em proposta e propõe uma regra por (negócio, motivo) com MINIMO ou mais.
// O mesmo motivo em 2+ negócios vira também uma proposta GERAL (vale pra todos)
export async function propoeRegras(opc: { negocio_id?: string | null; por?: string } = {}) {
  const usadas = new Set<string>()
  const todas = await propostas()
  for (const p of todas) for (const id of p.detalhe?.correcoes || []) usadas.add(String(id))
  const ativas = await regras()
  const livresDe = (g: any[]) => g.map(c => c.detalhe.livre).filter(Boolean) as string[]
  const cs = (await correcoes(opc.negocio_id || null, 90)).filter(c => !usadas.has(String(c.id)))
  const grupos = new Map<string, any[]>()
  for (const c of cs) for (const m of c.detalhe?.motivos || []) {
    const k = c.negocio_id + '|' + m
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k)!.push(c)
  }
  const novas: any[] = [], porMotivo = new Map<string, Set<string>>()
  for (const [k, g] of grupos) {
    const [negocio_id, motivo] = k.split('|')
    if (!porMotivo.has(motivo)) porMotivo.set(motivo, new Set())
    porMotivo.get(motivo)!.add(negocio_id)
    if (g.length < MINIMO()) continue
    // já tem regra ativa com esse motivo nesse negócio: não propõe de novo (as correções ficam pra quem olhar)
    if (motivo !== 'outro' && ativas.some(r => r.motivo === motivo && (r.escopo === 'geral' || r.negocio_id === negocio_id))) continue
    const neg = await db.um('negocios', { id: negocio_id })
    if (!neg) continue
    const padrao = regraPadrao(neg, motivo, livresDe(g))
    if (!padrao) continue
    const t = await textoComIA(neg, motivo, g, padrao)
    const pecas = g.filter(c => c.detalhe.alvo === 'peca').length, resp = g.filter(c => c.detalhe.alvo === 'resposta').length, sug = g.length - pecas - resp
    const oque = [pecas ? `${pecas} peça(s) recusada(s) ou com ajuste` : '', resp ? `${resp} resposta(s) corrigida(s)` : '', sug ? `${sug} sugestão(ões) corrigida(s)` : ''].filter(Boolean).join(' e ')
    const p = await db.insere('eventos', { tipo: 'regra_proposta', negocio_id, detalhe: {
      id: crypto.randomUUID(), status: 'pendente', escopo: 'negocio', motivo, area: t.area, texto: t.texto, ia: t.ia,
      porque: `No ${neg.nome}, ${oque} por "${rotulo(motivo)}".`, correcoes: g.map(c => c.id), base: g.length, por: opc.por || 'maia',
    } })
    novas.push(p)
  }
  // o mesmo motivo em 2 ou mais negócios (sem regra geral ainda): proposta geral, sem consumir as correções
  if (!opc.negocio_id) {
    for (const [motivo, negs] of porMotivo) {
      if (motivo === 'outro' || negs.size < 2) continue
      if (ativas.some(r => r.escopo === 'geral' && r.motivo === motivo)) continue
      if (todas.some(p => p.detalhe?.escopo === 'geral' && p.detalhe?.motivo === motivo && p.detalhe?.status === 'pendente')) continue
      const padrao = regraPadrao({ nome: 'cada negócio', regiao: 'a cidade ou região do negócio' }, motivo, [])
      if (!padrao) continue
      const texto = padrao.texto.replace(/^No cada negócio, /, '').replace(/do cada negócio/g, 'de cada negócio').replace(/^./, c => c.toUpperCase())
      novas.push(await db.insere('eventos', { tipo: 'regra_proposta', negocio_id: null, detalhe: {
        id: crypto.randomUUID(), status: 'pendente', escopo: 'geral', motivo, area: padrao.area, texto, ia: false,
        porque: `"${rotulo(motivo)}" apareceu em ${negs.size} negócios diferentes.`, correcoes: [], base: negs.size, por: opc.por || 'maia',
      } }))
    }
  }
  return novas
}

// ---------- 3) a equipe decide ----------
export async function decideProposta(id: string, d: { decisao: 'aprovar' | 'recusar'; texto?: string | null; escopo?: 'negocio' | 'geral' | null; area?: Area | null; por?: string }) {
  const p = (await propostas()).find(e => e.detalhe?.id === id)
  if (!p) throw new Error('proposta não existe')
  if (p.detalhe.status !== 'pendente') throw new Error('essa proposta já foi decidida (' + p.detalhe.status + ')')
  const agora = new Date().toISOString(), por = d.por || 'equipe'
  if (d.decisao === 'recusar') {
    await db.atualiza('eventos', { id: p.id }, { detalhe: { ...p.detalhe, status: 'recusada', decidido_por: por, decidido_em: agora } })
    return { status: 'recusada' }
  }
  const texto = String(d.texto || p.detalhe.texto || '').trim().slice(0, 400)
  if (texto.length < 5) throw new Error('escreve a regra')
  const escopo = d.escopo === 'geral' || d.escopo === 'negocio' ? d.escopo : p.detalhe.escopo
  if (escopo === 'negocio' && !p.negocio_id) throw new Error('proposta geral não tem negócio: aprova como geral')
  const area: Area = d.area && ['criacao', 'atendimento', 'tudo'].includes(d.area) ? d.area : p.detalhe.area
  const regra = await criaRegra({ texto, area, escopo, negocio_id: escopo === 'negocio' ? p.negocio_id : null, motivo: p.detalhe.motivo, por, proposta: id })
  await db.atualiza('eventos', { id: p.id }, { detalhe: { ...p.detalhe, status: 'aprovada', texto_final: texto, escopo_final: escopo, area_final: area, regra_id: regra.id, decidido_por: por, decidido_em: agora } })
  return { status: 'aprovada', regra }
}

// a regra aprovada (ou escrita direto pela equipe): evento 'regra' + cópia no contexto dos negócios
export async function criaRegra(r: { texto: string; area: Area; escopo: 'negocio' | 'geral'; negocio_id: string | null; motivo?: string | null; por?: string; proposta?: string | null }) {
  const regra: Regra = { id: crypto.randomUUID(), texto: r.texto, area: r.area, escopo: r.escopo, negocio_id: r.escopo === 'geral' ? null : r.negocio_id, motivo: r.motivo || null, ativa: true, aprovada_em: new Date().toISOString(), por: r.por || 'equipe', proposta: r.proposta || null }
  await db.insere('eventos', { tipo: 'regra', negocio_id: regra.negocio_id, detalhe: regra })
  await sincronizaRegras()
  return regra
}

export async function mudaRegra(id: string, d: { ativa?: boolean; texto?: string | null; area?: Area | null; por?: string }) {
  const e = (await db.lista('eventos', { tipo: 'regra' })).find(x => x.detalhe?.id === id)
  if (!e) throw new Error('regra não existe')
  const det = { ...e.detalhe }
  if (d.ativa !== undefined) det.ativa = !!d.ativa
  if (d.texto) det.texto = String(d.texto).trim().slice(0, 400)
  if (d.area && ['criacao', 'atendimento', 'tudo'].includes(d.area)) det.area = d.area
  det.mudou_por = d.por || 'equipe'; det.mudou_em = new Date().toISOString()
  await db.atualiza('eventos', { id: e.id }, { detalhe: det })
  await sincronizaRegras()
  return det
}

export async function regras(): Promise<Regra[]> {
  return (await db.lista('eventos', { tipo: 'regra' }, { ordem: 'criado_em' })).map(e => e.detalhe).filter(r => r && r.ativa !== false)
}

// copia as regras ativas pra negocios.contexto.regras_aprendidas (o que o prompt lê, sem consulta extra na hora de responder).
// Roda quando uma regra muda e de hora em hora (rotina): se alguém salvar o contexto do negócio pelo painel com uma cópia
// velha, a lista volta sozinha. Pra mudar uma regra: na página Aprendizado (não no JSON do contexto)
export async function sincronizaRegras() {
  const ativas = await regras()
  let mudou = 0
  for (const n of await db.lista('negocios')) {
    if (n.contexto?.demo) continue
    const quer = ativas.filter(r => r.escopo === 'geral' || r.negocio_id === n.id).map(r => ({ id: r.id, texto: r.texto, area: r.area, escopo: r.escopo }))
    const tem = Array.isArray(n.contexto?.regras_aprendidas) ? n.contexto.regras_aprendidas : []
    if (JSON.stringify(tem) === JSON.stringify(quer)) continue
    if (!quer.length && !n.contexto?.regras_aprendidas) continue
    const ctx = { ...(n.contexto || {}) }
    if (quer.length) ctx.regras_aprendidas = quer; else delete ctx.regras_aprendidas
    await db.atualiza('negocios', { id: n.id }, { contexto: ctx })
    mudou++
  }
  return mudou
}

// o bloco que entra no prompt (sem consulta: lê do negócio já carregado). area 'criacao' = anúncios e posts; 'atendimento' = clientes
export function textoRegrasAprendidas(neg: any, area: 'criacao' | 'atendimento'): string {
  const l = (Array.isArray(neg?.contexto?.regras_aprendidas) ? neg.contexto.regras_aprendidas : []).filter((r: any) => r?.texto && (r.area === area || r.area === 'tudo'))
  if (!l.length) return ''
  return `\nREGRAS QUE A EQUIPE ENSINOU (vieram das correções do time; valem sempre, acima do teu gosto):\n${l.slice(0, 20).map((r: any) => `- ${String(r.texto).trim()}`).join('\n')}`
}

// ---------- 4) quanto a Maia acerta de primeira ----------
const conversaReal = (cv: any) => cv?.canal === 'cliente' && cv.simulada !== true && !/^55000/.test(String(cv.telefone || ''))
export async function acertoDePrimeira(neg: any, dias = 30) {
  const desde = new Date(Date.now() - dias * 86400e3).toISOString()
  const [pecas, ajustes, cs, cvs] = await Promise.all([
    db.lista('pecas', { negocio_id: neg.id }),
    db.lista('eventos', { tipo: 'ajuste_equipe', negocio_id: neg.id }),
    db.lista('eventos', { tipo: 'correcao_time', negocio_id: neg.id }),
    db.lista('conversas', { negocio_id: neg.id, canal: 'cliente' }),
  ])
  const ajustadas = new Set(ajustes.map(e => String(e.detalhe?.peca)))
  for (const c of cs) if (c.detalhe?.peca_id) ajustadas.add(String(c.detalhe.peca_id))
  const criativa = (p: any) => ['anuncio_imagem', 'anuncio_video', 'post', 'video'].includes(p.tipo)
  const decididas = pecas.filter(p => (p.criado_em || '') >= desde && (p.aprovado_equipe_em || p.status === 'descartada'))
  const conta = (l: any[]) => { const ok = l.filter(p => p.aprovado_equipe_em && p.status !== 'descartada' && !ajustadas.has(String(p.id))).length; return { total: l.length, de_primeira: ok, pct: l.length ? Math.round(ok / l.length * 100) : null } }
  const reais = new Set(cvs.filter(conversaReal).map(c => c.id))
  const msgs = reais.size ? (await db.lista('msgs', { negocio_id: neg.id, autor: 'maia' }, { desde: ['criado_em', desde] })).filter(m => reais.has(m.conversa_id)) : []
  const corrigidas = new Set(cs.filter(c => c.detalhe?.alvo === 'resposta' && c.detalhe?.msg_id != null).map(c => String(c.detalhe.msg_id)))
  const respCorr = msgs.filter(m => corrigidas.has(String(m.id))).length
  return {
    negocio_id: neg.id, nome: neg.nome, dias,
    pecas: conta(decididas.filter(criativa)),
    sugestoes: conta(decididas.filter(p => !criativa(p))),
    respostas: { total: msgs.length, corrigidas: respCorr, pct: msgs.length ? Math.round((msgs.length - respCorr) / msgs.length * 100) : null },
    correcoes: cs.filter(c => (c.criado_em || '') >= desde).length,
  }
}

// os motivos mais comuns (pra tela): { motivo, rotulo, n }
export function motivosMaisComuns(cs: any[]) {
  const n = new Map<string, number>()
  for (const c of cs) for (const m of c.detalhe?.motivos || []) n.set(m, (n.get(m) || 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([motivo, q]) => ({ motivo, rotulo: rotulo(motivo), n: q }))
}
