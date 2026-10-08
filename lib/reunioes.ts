import { randomBytes } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { supabaseDoUsuario } from '@/lib/supabase-user'
import { lerTudo } from '@/lib/ler-tudo'

// AS REUNIÕES POR VÍDEO (vieram da JamRock pra escola em 08/10/2026; lá nasceram em 29/09). Várias pessoas na mesma sala, sala de espera,
// cada um grava o próprio microfone, sugestões ao vivo só pro anfitrião e resumo no fim.
//
// A conversa em si acontece entre os navegadores (WebRTC em malha, app/r/[codigo]); este arquivo
// cuida do resto: criar o link, a fila da sala de espera, receber os pedaços de áudio,
// transcrever cada um (Deepgram) e pedir à IA as sugestões e o resumo.
//
// Veio da chamada da Dani (lib/chamadas.ts lá), que é de 1 com 1 e grava os dois lados misturados.
// Aqui cada pessoa grava só a própria voz: a fala sai com o nome certo, sem separar vozes.

const BUCKET = 'reunioes'
// o modelo novo primeiro; se ele recusar (conta sem acesso, nome errado), o que o resto do sistema já usa
const MODELOS = ['claude-sonnet-5', 'claude-sonnet-4-6']

// ── quem está logado (as rotas do painel)
export async function usuarioDaRequest(authorization?: string | null) {
  if (!authorization) return null
  try {
    const { data } = await supabaseDoUsuario(authorization).auth.getUser()
    const uid = data.user?.id
    if (!uid) return null
    const { data: p } = await sb.from('usuarios_perfil').select('id, nome, papel, org_id').eq('auth_id', uid).maybeSingle()
    return p ? { id: p.id as string, nome: (p.nome || '').toString(), papel: (p.papel || '').toString(), org_id: p.org_id as string } : null
  } catch { return null }
}

// a marca de quem convida (cadastro da empresa)
export async function marcaDaEmpresa(org_id: string | null | undefined) {
  const { data } = org_id ? await sb.from('organizacoes').select('nome, cor, logo_url').eq('id', org_id).maybeSingle() : { data: null as any }
  return { nome: (data?.nome || 'a empresa').toString(), cor: data?.cor || '#7c3aed', logo: data?.logo_url || null }
}

// código curto, sem letras ambíguas, pra caber num WhatsApp
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789'
const novoCodigo = (n = 8) => Array.from(randomBytes(n)).map(b => ALFABETO[b % ALFABETO.length]).join('')
const novoToken = () => randomBytes(18).toString('base64url')

export async function criarReuniao(org: string, x: { titulo: string; contexto?: string | null; quando?: string | null; lead_id?: string | null; lead_nome?: string | null; criado_por: string; criado_por_nome: string }) {
  const { data, error } = await sb.from('reunioes').insert({
    org_id: org, codigo: novoCodigo(), chave_host: novoToken(), titulo: x.titulo, contexto: x.contexto || null, quando: x.quando || null,
    lead_id: x.lead_id || null, lead_nome: x.lead_nome || null, criado_por: x.criado_por || null, criado_por_nome: x.criado_por_nome,
  }).select('*').single()
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const, reuniao: data }
}

export async function reuniaoPorCodigo(codigo: string) {
  const { data } = await sb.from('reunioes').select('*').eq('codigo', codigo).maybeSingle()
  return data
}

// ── A SALA DE ESPERA
// Quem abre o link "bate na porta": vira uma pessoa com status 'esperando' e um token só dela.
// O anfitrião (quem tem a chave) entra direto. Quem já tinha sido liberado e voltou (recarregou,
// caiu a internet) entra direto também: não faz sentido pedir de novo.
export async function baterNaPorta(r: any, x: { nome: string; host: boolean; pessoa_id?: string; token?: string }) {
  if (x.pessoa_id && x.token) {
    const { data: p } = await sb.from('reuniao_pessoas').select('*').eq('id', x.pessoa_id).eq('reuniao_id', r.id).maybeSingle()
    if (p && p.token === x.token) {
      const volta = p.status === 'saiu' && p.liberada_em ? 'dentro' : p.status
      const nome = (x.nome || p.nome).toString().slice(0, 60)
      await sb.from('reuniao_pessoas').update({ status: volta, nome, visto_em: new Date().toISOString() }).eq('id', p.id)
      return { pessoa_id: p.id, token: p.token, status: volta, papel: p.papel }
    }
  }
  const agora = new Date().toISOString()
  const { data, error } = await sb.from('reuniao_pessoas').insert({
    org_id: r.org_id, reuniao_id: r.id, nome: (x.nome || 'Convidado').toString().slice(0, 60), papel: x.host ? 'host' : 'convidado',
    token: novoToken(), status: x.host ? 'dentro' : 'esperando', liberada_em: x.host ? agora : null,
  }).select('*').single()
  if (error || !data) throw new Error(error?.message || 'não consegui entrar')
  return { pessoa_id: data.id, token: data.token, status: data.status, papel: data.papel }
}

export async function pessoaValida(r: any, pessoa_id: string, token: string) {
  if (!pessoa_id || !token) return null
  const { data } = await sb.from('reuniao_pessoas').select('*').eq('id', pessoa_id).eq('reuniao_id', r.id).maybeSingle()
  return data && data.token === token ? data : null
}

// quem está dentro (a lista que os navegadores usam pra aceitar conexão) e, pro anfitrião, quem espera
export async function quemEsta(r: any) {
  const { data } = await sb.from('reuniao_pessoas').select('id, nome, papel, status, criado_em, visto_em').eq('reuniao_id', r.id).in('status', ['dentro', 'esperando']).order('criado_em')
  const lista = data || []
  // sala de espera: só quem continua com a tela aberta (bate de novo a cada poucos segundos)
  const vivo = (p: any) => +new Date(p.visto_em) > Date.now() - 30000
  return {
    dentro: lista.filter(p => p.status === 'dentro').map(p => ({ id: p.id, nome: p.nome, papel: p.papel })),
    esperando: lista.filter(p => p.status === 'esperando' && vivo(p)).map(p => ({ id: p.id, nome: p.nome })),
  }
}

// ── O ÁUDIO: cada pessoa manda o próprio microfone em pedaços de ~20s (cada pedaço é um arquivo
// completo, o navegador reinicia a gravação a cada um). `em` é o instante do começo do pedaço, já
// no relógio do servidor. Guardado e transcrito na hora: é isso que alimenta as sugestões ao vivo.
export async function guardarPedaco(r: any, pessoa: any, emMs: number, buf: Buffer, mime: string) {
  const ext = mime.includes('mp4') ? 'mp4' : 'webm'
  const path = `${r.codigo}/${pessoa.id}/${emMs}.${ext}`
  const { error } = await sb.storage.from(BUCKET).upload(path, buf, { contentType: mime, upsert: true })
  if (error) return { ok: false as const, error: error.message, path }
  if (r.status === 'marcada') await sb.from('reunioes').update({ status: 'em_andamento', iniciada_em: new Date(emMs).toISOString() }).eq('id', r.id).eq('status', 'marcada')
  return { ok: true as const, path }
}

export async function transcreverPedaco(r: any, pessoa: any, emMs: number, buf: Buffer, mime: string, termos: string[] = []) {
  const key = process.env.DEEPGRAM_API_KEY || ''
  if (!key || !buf.length) return 0
  const reforco = [...new Set(termos.flatMap(t => t.split(/\s+/)).filter(w => w.length > 2))].slice(0, 20).map(w => `&keywords=${encodeURIComponent(w + ':2')}`).join('')
  const resp = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=pt&smart_format=true&punctuate=true&utterances=true' + reforco, {
    method: 'POST', headers: { Authorization: `Token ${key}`, 'Content-Type': mime.split(';')[0] }, body: new Uint8Array(buf),
  })
  const j: any = await resp.json().catch(() => null)
  if (!resp.ok) { console.error('[reuniao] deepgram', resp.status, JSON.stringify(j).slice(0, 300)); return 0 }
  const utts: any[] = (j?.results?.utterances || []).filter((u: any) => (u.transcript || '').trim())
  let linhas = utts.map(u => ({ em: new Date(emMs + Math.round((u.start || 0) * 1000)).toISOString(), texto: u.transcript.trim() }))
  if (!linhas.length) {
    const t = (j?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '').trim()
    if (t) linhas = [{ em: new Date(emMs).toISOString(), texto: t }]
  }
  if (!linhas.length) return 0
  await sb.from('reuniao_falas').insert(linhas.map(l => ({ org_id: r.org_id, reuniao_id: r.id, pessoa_id: pessoa.id, nome: pessoa.nome, em: l.em, texto: l.texto })))
  return linhas.length
}

// as falas transcritas + o que foi escrito no chat (marcado "(chat)"), na ordem em que aconteceu.
// LIDAS DE 1000 EM 1000 (08/10/2026): o banco entrega no máximo 1000 linhas e não avisa. A reunião com a
// Valler (1h20) teve 1.480 falas e o resumo leu só as 1.000 primeiras: os últimos ~25 min ficaram de fora.
export async function falasDaReuniao(r: any) {
  const [f, m] = await Promise.all([
    lerTudo<any>((de, ate) => sb.from('reuniao_falas').select('pessoa_id, nome, em, texto').eq('reuniao_id', r.id).order('em').order('id').range(de, ate)),
    lerTudo<any>((de, ate) => sb.from('reuniao_mensagens').select('pessoa_id, nome, criado_em, texto').eq('reuniao_id', r.id).order('criado_em').order('id').range(de, ate)),
  ])
  const chat = (m || []).map(x => ({ pessoa_id: x.pessoa_id, nome: x.nome, em: x.criado_em, texto: x.texto, chat: true }))
  return [...(f || []), ...chat].sort((a: any, b: any) => +new Date(a.em) - +new Date(b.em)) as { pessoa_id: string | null; nome: string; em: string; texto: string; chat?: boolean }[]
}

// O CHAT (ideia do Rick, 29/09): todos na reunião escrevem e veem
export async function mensagensDaReuniao(r: any) {
  return lerTudo<any>((de, ate) => sb.from('reuniao_mensagens').select('id, pessoa_id, nome, texto, criado_em').eq('reuniao_id', r.id).order('criado_em').order('id').range(de, ate))
}
export async function novaMensagem(r: any, pessoa: any, texto: string) {
  const { data, error } = await sb.from('reuniao_mensagens').insert({ org_id: r.org_id, reuniao_id: r.id, pessoa_id: pessoa.id, nome: pessoa.nome, texto: texto.slice(0, 2000) }).select('id, pessoa_id, nome, texto, criado_em').single()
  if (error) throw new Error(error.message)
  return data
}

const mmss = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }
export function transcricaoEmTexto(r: any, falas: any[]) {
  const t0 = r.iniciada_em ? +new Date(r.iniciada_em) : falas.length ? +new Date(falas[0].em) : Date.now()
  return falas.map(f => `[${mmss(+new Date(f.em) - t0)}] ${f.nome}${f.chat ? ' (chat)' : ''}: ${f.texto}`).join('\n')
}

// ── A IA
function jsonDa(txt: string) {
  const a = txt.indexOf('{'), b = txt.lastIndexOf('}')
  if (a < 0 || b < a) return null
  try { return JSON.parse(txt.slice(a, b + 1)) } catch { return null }
}
async function perguntarIA(system: string | Anthropic.TextBlockParam[], user: string, max = 1500) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  let ultimo: any = null
  for (const model of MODELOS) {
    try {
      const resp = await client.messages.create({ model, max_tokens: max, system, messages: [{ role: 'user', content: user }] })
      return resp.content.map((c: any) => c.type === 'text' ? c.text : '').join('')
    } catch (e: any) {
      ultimo = e
      // chave errada ou sem crédito: trocar de modelo não resolve
      if (e?.status === 401 || e?.status === 403 || /credit|billing/i.test(e?.message || '')) break
      console.error('[reuniao] modelo', model, 'recusou:', e?.status, (e?.message || '').slice(0, 160))
    }
  }
  throw ultimo
}

// SUGESTÕES AO VIVO (só o anfitrião vê). Recalcula quando chegou fala nova, no máximo a cada 60s;
// senão devolve a última. A pauta nasce do contexto (a carta/proposta) e vai sendo marcada.
// 60s e não 15s (08/10/2026): na reunião com a Valler (1h20) as sugestões a cada ~20s acabaram com o
// crédito da IA da escola no meio da reunião. A tela continua perguntando a cada 20s (sai do cache).
export async function sugestoesAoVivo(r: any) {
  const falas = await falasDaReuniao(r)
  const recente = r.sugestoes_em && +new Date(r.sugestoes_em) > Date.now() - 60000
  if (r.sugestoes && (falas.length === r.sugestoes_falas || recente)) return { ...r.sugestoes, falas: falas.length, atualizado_em: r.sugestoes_em }
  if (!process.env.ANTHROPIC_API_KEY) return { erro: 'sem chave da IA', falas: falas.length }

  const anterior = r.sugestoes || {}
  const system = `Você é o copiloto de ${r.criado_por_nome || 'quem conduz'} numa reunião de negócios da ${(await marcaDaEmpresa(r.org_id)).nome}. Só ${r.criado_por_nome || 'ele'} vê o que você escreve, durante a reunião, numa tela pequena: seja curto e direto, em português do Brasil.

Sua função:
1. Manter a PAUTA da reunião (de 4 a 8 itens curtos, tirados do contexto) e marcar o que já foi falado e o que está sendo falado agora.
2. Quando alguém do outro lado levantar uma OBJEÇÃO (preço, orçamento, prazo, dúvida, desconfiança, comparação, "vou pensar"), dizer como responder usando os fatos do contexto, e uma pergunta pra fazer.
3. Sem objeção agora: dar a próxima DICA útil (o que falar a seguir, um número do contexto que ajuda, um sinal de interesse pra aproveitar).

Nunca invente números, prazos ou condições que não estejam no contexto. Se não souber, diga pra confirmar depois.

Responda SÓ com um JSON neste formato:
{"pauta":[{"item":"texto curto","estado":"feito|agora|falta"}],
 "agora":{"tipo":"objecao|dica","titulo":"ex.: Objeção · investimento","quem":"nome de quem falou ou vazio","trecho":"a frase da pessoa, curta, ou vazio","responda":"o que dizer, 1 ou 2 frases","pergunte":"uma pergunta pra fazer, ou vazio"},
 "antes":["até 3 dicas anteriores, bem curtas"]}`
  // A CARTA É IGUAL EM TODA CHAMADA: vai no system, marcada pra cache — a partir da 2ª chamada da
  // reunião ela é cobrada a ~10% do preço (as sugestões rodam a cada ~20s enquanto a IA ouve)
  const systemComCarta: Anthropic.TextBlockParam[] = [{ type: 'text', text: `${system}

CONTEXTO DA REUNIÃO (pauta, proposta, carta):
${(r.contexto || '(sem contexto: sugira com base só na conversa)').slice(0, 12000)}`, cache_control: { type: 'ephemeral' } }]
  const user = `TÍTULO: ${r.titulo}
QUEM CONDUZ: ${r.criado_por_nome || '—'}

PAUTA E DICA QUE VOCÊ DEU DA ÚLTIMA VEZ (mantenha os mesmos itens de pauta, só atualize o estado):
${JSON.stringify({ pauta: anterior.pauta || [], agora: anterior.agora || null })}

A CONVERSA ATÉ AGORA (as últimas falas são as que importam pro "agora"):
${transcricaoEmTexto(r, falas).slice(-9000) || '(ninguém falou ainda: monte a pauta e dê a dica de abertura)'}`
  const txt = await perguntarIA(systemComCarta, user, 1200)
  const j = jsonDa(txt)
  if (!j) return { ...(anterior || {}), falas: falas.length, atualizado_em: r.sugestoes_em }
  const agora = new Date().toISOString()
  await sb.from('reunioes').update({ sugestoes: j, sugestoes_em: agora, sugestoes_falas: falas.length }).eq('id', r.id)
  return { ...j, falas: falas.length, atualizado_em: agora }
}

// O RESUMO (depois de encerrar): objeções, o que cada pessoa falou, próximos passos. O tempo de
// fala sai das próprias falas (quantidade de texto de cada um), não da IA.
export async function resumirReuniao(codigo: string) {
  const r = await reuniaoPorCodigo(codigo)
  if (!r) return { ok: false, error: 'reunião não encontrada' }
  try {
    const falas = await falasDaReuniao(r)
    const { data: pessoas } = await sb.from('reuniao_pessoas').select('id, nome, papel, liberada_em').eq('reuniao_id', r.id).not('liberada_em', 'is', null)
    const tamanho: Record<string, number> = {}
    for (const f of falas) if (!f.chat) tamanho[f.nome] = (tamanho[f.nome] || 0) + f.texto.length
    const total = Object.values(tamanho).reduce((a, b) => a + b, 0) || 1
    const fala = Object.fromEntries(Object.entries(tamanho).map(([n, v]) => [n, Math.round(v / total * 100)]))
    const inicio = falas.length ? +new Date(falas[0].em) : r.iniciada_em ? +new Date(r.iniciada_em) : null
    const fim = falas.length ? +new Date(falas[falas.length - 1].em) : null
    let ia: any = null
    if (falas.length && process.env.ANTHROPIC_API_KEY) {
      const system = `Você resume reuniões de negócios da ${(await marcaDaEmpresa(r.org_id)).nome} pra quem conduziu (${r.criado_por_nome || '—'}). Português do Brasil, frases curtas, só o que foi dito de verdade: nada inventado.
Responda SÓ com JSON:
{"resumo":"3 a 5 frases","clima":"favorável|neutro|difícil",
 "objecoes":[{"tema":"1 a 2 palavras","quem":"nome","trecho":"a frase exata ou quase","em":"mm:ss","status":"respondida|em aberto","resposta":"como foi respondida, ou o que falta"}],
 "pessoas":[{"nome":"nome","posicao":"a favor|neutro|cético|conduziu","pontos":[{"texto":"o que a pessoa disse de importante","em":"mm:ss"}]}],
 "proximos":[{"acao":"o que fazer","quem":"nome","prazo":"dd/mm ou vazio"}]}`
      const txt = await perguntarIA(system, `REUNIÃO: ${r.titulo}\n\nCONTEXTO:\n${(r.contexto || '').slice(0, 8000)}\n\nTRANSCRIÇÃO (cada pessoa gravada separadamente, o nome é certo; linhas com "(chat)" foram escritas no chat da reunião):\n${transcricaoEmTexto(r, falas).slice(-60000)}`, 3000)
      ia = jsonDa(txt)
    }
    const resumo = { ...(ia || {}), fala, duracao_seg: inicio && fim ? Math.round((fim - inicio) / 1000) : null, participantes: (pessoas || []).map(p => ({ nome: p.nome, papel: p.papel })), falas: falas.length, gerado_em: new Date().toISOString() }
    // o resumo sempre fica salvo; o status só vira 'resumida' se a reunião continua encerrada —
    // se o anfitrião REABRIU nesse meio-tempo, ela segue aberta (e ganha um resumo novo no próximo fim)
    // o resumo deu certo: apaga o erro de uma tentativa anterior (08/10/2026: o "Refazer" gerava o resumo,
    // mas a tela seguia mostrando o erro de crédito da 1ª tentativa, porque o status ficava 'erro')
    await sb.from('reunioes').update({ resumo, erro: null }).eq('id', r.id)
    await sb.from('reunioes').update({ status: 'resumida' }).eq('id', r.id).in('status', ['encerrada', 'erro'])
    // no histórico do lead, se a reunião for de um lead
    if (r.lead_id) {
      await sb.from('lead_andamentos').insert({ org_id: r.org_id, lead_id: r.lead_id, vendedor_id: r.criado_por, tipo: 'reuniao', observacao: `🎥 Reunião "${r.titulo}" com ${(pessoas || []).length} pessoas.${ia?.resumo ? ' ' + ia.resumo : ''}` })
    }
    return { ok: true, falas: falas.length }
  } catch (e: any) {
    // o erro do crédito vinha cru (o JSON inteiro da Anthropic): diz em português o que fazer
    const msg = /credit balance|billing/i.test(e?.message || '') ? 'Acabou o crédito da IA da escola (conta da Anthropic). Depois de pôr crédito,' : (e?.message || 'falha ao resumir')
    await sb.from('reunioes').update({ status: 'erro', erro: msg }).eq('id', r.id).in('status', ['encerrada', 'erro'])
    return { ok: false, error: e?.message }
  }
}

export async function urlAudio(path: string) {
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600)
  return data?.signedUrl || null
}

// EXCLUIR: a reunião some com tudo (pessoas, falas, chat pelo ON DELETE CASCADE) e as gravações do bucket
export async function excluirReuniao(org: string, codigo: string) {
  const r = await reuniaoPorCodigo(codigo)
  if (!r || r.org_id !== org) return { ok: false as const, error: 'reunião não encontrada' }
  try {
    const { data: pastas } = await sb.storage.from(BUCKET).list(codigo, { limit: 1000 })
    for (const p of pastas || []) {
      const { data: arqs } = await sb.storage.from(BUCKET).list(`${codigo}/${p.name}`, { limit: 1000 })
      const paths = (arqs || []).map(a => `${codigo}/${p.name}/${a.name}`)
      if (paths.length) await sb.storage.from(BUCKET).remove(paths)
    }
  } catch { /* a gravação órfã não impede de excluir a reunião */ }
  const { error } = await sb.from('reunioes').delete().eq('id', r.id).eq('org_id', org)
  return error ? { ok: false as const, error: error.message } : { ok: true as const }
}
