// GRAVAÇÕES (29/10/2026): o Guto grava encontros, aulas e reuniões presenciais pelo PC (mic Lark M2) e a
// IA preenche o sistema sozinha. Fluxo: o navegador sobe pedaços de 30 s direto pra pasta "gravacoes"
// (link assinado, sem passar pelo limite de 4,5 MB da função) → no "Finalizar", junta os pedaços,
// transcreve no Deepgram separando as vozes → o Claude lê a transcrição COM o contexto (cliente, roteiro,
// próximos encontros, pessoas do time) e devolve um JSON → aplicarGravacao grava: registro + conclusão
// do encontro, próximo encontro na agenda, compromissos nossos, pendências do cliente, outros
// compromissos com data (inclusive pessoais) e avisa no WhatsApp.
//
// ⚠️ A chave geral (gravacao_config.ligado) desliga TUDO: o botão some e a rota recusa.
// ⚠️ LGPD: o áudio é apagado depois de apagar_audio_dias (padrão 60); fica só o texto.
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { hojeBR } from '@/lib/periodos'
import { LOCAIS } from '@/lib/entrega'
import { logIaUso } from '@/lib/ia-uso'
import { enviarAoTime, type Usuario } from '@/lib/assistente'

export const BUCKET = 'gravacoes'
export type Contexto = 'encontro' | 'agenda' | 'turma' | 'livre'
export type Config = { ligado: boolean; aplicar_sozinho: boolean; apagar_audio_dias: number }
const PADRAO: Config = { ligado: true, aplicar_sozinho: true, apagar_audio_dias: 60 }

export async function configDe(usuarioId: string): Promise<Config> {
  const { data } = await sb.from('gravacao_config').select('ligado, aplicar_sozinho, apagar_audio_dias').eq('usuario_id', usuarioId).maybeSingle()
  return { ...PADRAO, ...(data || {}) }
}
export async function salvarConfig(usuarioId: string, org: string, c: Partial<Config>) {
  const atual = await configDe(usuarioId)
  const novo = { ...atual, ...c }
  await sb.from('gravacao_config').upsert({ usuario_id: usuarioId, org_id: org, ...novo, atualizado_em: new Date().toISOString() })
  return novo
}

export const caminhoParte = (org: string, id: string, seq: number, ext: string) => `${org}/${id}/${String(seq).padStart(5, '0')}.${ext}`
export const extDe = (mime: string) => (mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : 'webm')

// ── o que a IA precisa saber sobre a gravação ──
async function contextoDa(g: any) {
  const linhas: string[] = []
  let projeto: any = null, marco: any = null
  if (g.contexto_tipo === 'encontro' && g.contexto_id) {
    const { data: m } = await sb.from('projeto_marcos').select('id, projeto_id, titulo, natureza, estado, data_combinada, data_prevista, local, lista, ordem').eq('id', g.contexto_id).maybeSingle()
    marco = m
    if (m) {
      const { data: p } = await sb.from('projetos').select('id, cliente, produto, data_inicio, data_fim, status, observacoes').eq('id', m.projeto_id).maybeSingle()
      projeto = p
      linhas.push(`É um ENCONTRO da entrega do cliente "${p?.cliente}" (produto ${p?.produto}, de ${p?.data_inicio} até ${p?.data_fim}).`)
      linhas.push(`Encontro gravado: "${m.titulo}" (estado ${m.estado}).`)
      const itens = Array.isArray(m.lista) ? m.lista.map((x: any) => (typeof x === 'string' ? x : x?.texto || x?.titulo)).filter(Boolean) : []
      if (itens.length) linhas.push(`Roteiro deste encontro: ${itens.join(' · ')}`)
      const { data: outros } = await sb.from('projeto_marcos').select('titulo, estado, data_combinada, data_prevista, natureza').eq('projeto_id', m.projeto_id).order('ordem')
      const abertos = (outros || []).filter(o => o.natureza === 'encontro' && !['concluido', 'cancelado'].includes(o.estado))
      if (abertos.length) linhas.push(`Encontros ainda abertos dessa entrega: ${abertos.map(o => `${o.titulo} (${o.data_combinada ? 'combinado ' + String(o.data_combinada).slice(0, 16) : 'previsto ' + o.data_prevista})`).join('; ')}`)
      const { data: pend } = await sb.from('projeto_pendencias').select('descricao').eq('projeto_id', m.projeto_id).is('entregue_em', null).limit(20)
      if (pend?.length) linhas.push(`Pendências do cliente em aberto: ${pend.map(x => x.descricao).join('; ')}`)
    }
  } else if (g.contexto_tipo === 'agenda' && g.contexto_id) {
    const { data: e } = await sb.from('agenda_eventos').select('titulo, descricao, tipo, inicio, fim').eq('id', g.contexto_id).maybeSingle()
    if (e) linhas.push(`É um compromisso da agenda: "${e.titulo}" (${e.tipo}, ${String(e.inicio).slice(0, 16)}).${e.descricao ? ' Descrição: ' + e.descricao : ''}`)
  } else if (g.contexto_tipo === 'turma' && g.contexto_id) {
    const { data: t } = await sb.from('turmas').select('codigo, produtos(nome)').eq('id', g.contexto_id).maybeSingle()
    if (t) linhas.push(`É uma AULA da turma ${(t as any).produtos?.nome || ''} (${t.codigo}). Há vários alunos; o professor é o Guto.`)
  } else {
    linhas.push('É uma gravação solta (pode ser trabalho ou vida pessoal do Guto).')
  }
  if (g.titulo) linhas.push(`Título dado na gravação: ${g.titulo}`)
  const { data: pessoas } = await sb.from('usuarios_perfil').select('id, nome, apelido').eq('org_id', g.org_id).eq('ativo', true)
  return { texto: linhas.join('\n'), projeto, marco, pessoas: pessoas || [] }
}

// ── transcrição (Deepgram, uma voz por "Voz N") ──
async function transcrever(buf: Buffer, mime: string): Promise<string | null> {
  const key = process.env.DEEPGRAM_API_KEY || ''
  if (!key || !buf.length) return null
  const termos = ['Claude:2', 'Deu Venda:2', 'Imersão:1', 'Meta:1', 'tráfego:1', 'WhatsApp:1', 'Reels:1', 'Lajeado:1']
  for (const modelo of ['nova-3', 'nova-2']) {
    const kw = modelo === 'nova-3' ? termos.map(t => 'keyterm=' + encodeURIComponent(t.split(':')[0])).join('&') : termos.map(t => 'keywords=' + encodeURIComponent(t)).join('&')
    const r = await fetch(`https://api.deepgram.com/v1/listen?model=${modelo}&language=${modelo === 'nova-3' ? 'pt-BR' : 'pt'}&smart_format=true&punctuate=true&diarize=true&utterances=true&${kw}`, {
      method: 'POST', headers: { Authorization: `Token ${key}`, 'Content-Type': mime.split(';')[0] }, body: new Uint8Array(buf),
    }).catch(() => null)
    if (!r || !r.ok) continue
    const j: any = await r.json().catch(() => null)
    const utts: any[] = j?.results?.utterances || []
    const mm = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
    if (utts.length) return utts.filter(u => (u.transcript || '').trim()).sort((a, b) => a.start - b.start).map(u => `[${mm(u.start)}] Voz ${(u.speaker ?? 0) + 1}: ${u.transcript}`).join('\n')
    const t = j?.results?.channels?.[0]?.alternatives?.[0]?.transcript
    if (typeof t === 'string' && t.trim()) return t.trim()
  }
  return null
}

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
function hojeTexto() {
  const h = hojeBR(); const d = new Date(h + 'T12:00:00-03:00')
  return `${DIAS[d.getUTCDay()]}, ${h}`
}

function jsonDa(txt: string) {
  const i = txt.indexOf('{'), f = txt.lastIndexOf('}')
  if (i < 0 || f < i) throw new Error('a IA não devolveu JSON')
  return JSON.parse(txt.slice(i, f + 1))
}

const SISTEMA = `Tu és o assistente do Guto, dono da escola Carreira no Digital (marketing e IA para pequenos negócios, em Lajeado e Porto Alegre, RS). Tu recebes a transcrição de uma gravação (encontro presencial com aluno ou cliente, aula, reunião ou um momento qualquer do dia dele) e o contexto do sistema. As vozes vêm como "Voz 1", "Voz 2"...: descobre pelo conteúdo quem é o Guto (quem ensina/conduz) e quem é o aluno/cliente.

Teu trabalho é não deixar NADA se perder. Extrai só o que foi dito de verdade (nunca inventa). Datas relativas ("quinta que vem", "amanhã", "dia 10") viram datas absolutas a partir de hoje. Se a data ou a hora não ficou clara, deixa null.

Responde SÓ com este JSON:
{"titulo": "título curto do que foi a gravação",
 "resumo": "o que aconteceu, em 4 a 8 linhas, direto",
 "registro": "o que foi feito no encontro, em tópicos curtos separados por ' · ' (vai pro registro do encontro na ficha)",
 "itens_roteiro_feitos": ["itens do roteiro do encontro que foram cumpridos"],
 "proximo_encontro": {"data": "AAAA-MM-DD", "hora": "HH:MM ou null", "local": "uma das chaves de LOCAIS ou null", "titulo": "ex.: Encontro 2"} ou null (só se foi combinado na conversa),
 "encerrar_entrega": false (true só se ficou claro que foi o último encontro e a entrega terminou),
 "compromissos": [{"descricao": "o que NÓS (Guto ou o time) ficamos de fazer, começando com verbo", "responsavel_id": "id da pessoa do time ou null (se não disse, é do Guto)", "prazo": "AAAA-MM-DD ou null", "hora": "HH:MM se foi dita uma hora, senão null", "pessoal": false, "trecho": "a frase dita, curta"}],
 "pendencias_cliente": [{"descricao": "o que o aluno/cliente ficou de fazer ou mandar", "prazo": "AAAA-MM-DD ou null"}],
 "agenda": [{"titulo": "outro compromisso com dia (e hora, se tiver) citado, que NÃO é o próximo encontro", "data": "AAAA-MM-DD", "hora": "HH:MM ou null", "duracao_min": 60, "pessoal": false}],
 "mensagem_cliente": "mensagem curta pro aluno/cliente no WhatsApp resumindo o que foi feito e o que ele tem que fazer até o próximo encontro (tom próximo da escola, 'tu', sem emoji) ou null se não for encontro com cliente",
 "conteudo": [{"formato": "reels | carrossel | post", "gancho": "frase de abertura que segmenta público e região, ex.: 'Dono de loja de Lajeado e região...'", "ideia": "o que mostrar, tirado de uma dúvida, explicação ou resultado da gravação"}],
 "sinais": {"venda": ["interesse em outro produto da escola (teunegócio OS, atendente de IA, tráfego pela agência...)"], "risco": ["desânimo, reclamação, sinal de cancelamento"], "indicacao": ["momento bom pra pedir indicação ou depoimento"], "duvidas": ["dúvidas do aluno que valem virar material"]},
 "confianca": 0.0 a 1.0}

Listas vazias quando não houver. Compromissos pessoais do Guto (família, saúde, banco, casa) também entram, com "pessoal": true.`

export async function analisar(g: any, transcricao: string) {
  const ctx = await contextoDa(g)
  const user = `HOJE: ${hojeTexto()} (horário de Brasília)
LOCAIS (chaves): ${LOCAIS.map(l => `${l.chave} = ${l.nome}`).join(' | ')}
PESSOAS DO TIME (id = nome): ${ctx.pessoas.map(p => `${p.id} = ${p.apelido || p.nome}`).join(' | ')}

CONTEXTO DO SISTEMA:
${ctx.texto}

TRANSCRIÇÃO:
${transcricao.slice(0, 180000)}`
  const ia = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  let ultimoErro: any = null
  for (const modelo of ['claude-sonnet-5-5', 'claude-sonnet-5']) {
    try {
      const r: any = await ia.messages.create({ model: modelo, max_tokens: 8000, system: SISTEMA, messages: [{ role: 'user', content: user }] })
      logIaUso('gravacao', modelo, r.usage, { gravacao_id: g.id }).catch(() => {})
      const txt = (r.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
      return { analise: jsonDa(txt), ctx }
    } catch (e) { ultimoErro = e }
  }
  throw ultimoErro || new Error('IA indisponível')
}

// ── junta os pedaços e processa ──
export async function processarGravacao(id: string, origem: string, auth: string | null) {
  const { data: g } = await sb.from('gravacoes').select('*').eq('id', id).maybeSingle()
  if (!g) return
  try {
    const pasta = `${g.org_id}/${g.id}`
    const { data: arqs } = await sb.storage.from(BUCKET).list(pasta, { limit: 10000, sortBy: { column: 'name', order: 'asc' } })
    const nomes = (arqs || []).map(a => a.name).filter(n => /^\d+\./.test(n)).sort()
    if (!nomes.length) throw new Error('nenhum pedaço de áudio chegou')
    const bufs: Buffer[] = []
    for (const n of nomes) {
      const { data } = await sb.storage.from(BUCKET).download(`${pasta}/${n}`)
      if (data) bufs.push(Buffer.from(await data.arrayBuffer()))
    }
    const audio = Buffer.concat(bufs)
    const transcricao = await transcrever(audio, g.mime || 'audio/webm')
    if (!transcricao) throw new Error('a transcrição voltou vazia (o áudio chegou sem voz ou o Deepgram falhou)')
    await sb.from('gravacoes').update({ transcricao }).eq('id', id)
    const { analise } = await analisar(g, transcricao)
    const cfg = g.usuario_id ? await configDe(g.usuario_id) : PADRAO
    const apagar = new Date(Date.now() + cfg.apagar_audio_dias * 86400e3).toISOString()
    await sb.from('gravacoes').update({ analise, status: 'pronta', titulo: g.titulo || analise.titulo || null, apagar_audio_em: apagar, erro: null }).eq('id', id)
    if (cfg.aplicar_sozinho) await aplicarGravacao(id, origem, auth, null)
    else await avisar(g, `🎙️ A gravação "${analise.titulo || g.titulo || 'sem título'}" está pronta pra revisar: ${origem}/dashboard/gravacoes?g=${id}`)
  } catch (e: any) {
    await sb.from('gravacoes').update({ status: 'erro', erro: String(e?.message || e).slice(0, 500) }).eq('id', id)
    await avisar(g, `⚠️ A gravação "${g.titulo || 'sem título'}" deu erro: ${String(e?.message || e).slice(0, 160)}. Abre em ${origem}/dashboard/gravacoes?g=${id} pra tentar de novo.`).catch(() => {})
  }
  // aproveita pra apagar áudios vencidos (LGPD)
  limparAudiosVencidos().catch(() => {})
}

async function avisar(g: any, texto: string) {
  if (!g?.usuario_id) return
  const { data: u } = await sb.from('usuarios_perfil').select('id, org_id, nome, apelido, email, whatsapp, assistente_ultima_msg_em, assistente_bom_dia').eq('id', g.usuario_id).maybeSingle()
  if (u?.whatsapp) await enviarAoTime(u as Usuario, texto).catch(() => {})
}

const instante = (data: string, hora?: string | null) => new Date(`${data}T${hora || '09:00'}:00-03:00`)
const valida = (d: any) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)

// ── grava no sistema o que a IA entendeu ──
// escolhas: o que a pessoa desmarcou na revisão (ex.: { proximo_encontro: false, compromissos: [0,2] })
export async function aplicarGravacao(id: string, origem: string, auth: string | null, escolhas: any) {
  const { data: g } = await sb.from('gravacoes').select('*').eq('id', id).maybeSingle()
  if (!g || !g.analise) throw new Error('gravação sem análise')
  const a = g.analise, feito: any = { em: new Date().toISOString(), itens: [] as string[], avisos: [] as string[] }
  const quer = (k: string) => !escolhas || escolhas[k] !== false
  const indices = (k: string, n: number) => (escolhas && Array.isArray(escolhas[k]) ? escolhas[k] : Array.from({ length: n }, (_, i) => i))
  const org = g.org_id, autor = 'Gravação (IA)'
  let projetoId: string | null = g.projeto_id || null

  // 1) ENCONTRO: conclui com o registro e já cria o próximo — pelo mesmo caminho da ficha (rota do marco)
  if (g.contexto_tipo === 'encontro' && g.contexto_id) {
    const { data: m } = await sb.from('projeto_marcos').select('id, projeto_id, estado, titulo, local').eq('id', g.contexto_id).maybeSingle()
    projetoId = m?.projeto_id || projetoId
    if (m && quer('concluir') && !['concluido', 'cancelado'].includes(m.estado)) {
      const corpo: any = { acao: 'concluir', id: m.id, registro: (a.registro || a.resumo || '').slice(0, 1900), mesmo_assim: true, autor }
      const p = a.proximo_encontro
      if (p && valida(p.data) && quer('proximo_encontro')) corpo.novo_encontro = { titulo: p.titulo || '', data: p.data, hora: p.hora || '', local: (LOCAIS.some(l => l.chave === p.local) ? p.local : (p.hora ? m.local : '')) || '' }
      const r = await fetch(`${origem}/api/projetos/marco`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) }, body: JSON.stringify(corpo) }).then(x => x.json()).catch((e: any) => ({ ok: false, error: e?.message }))
      if (r?.ok) { feito.itens.push(`Encontro "${m.titulo}" concluído com o registro`); if (corpo.novo_encontro) feito.itens.push(`Próximo encontro criado: ${p.data}${p.hora ? ' às ' + p.hora : ''}`) }
      else feito.avisos.push(`Não consegui concluir o encontro: ${r?.error || 'erro'}`)
      if (r?.aviso) feito.avisos.push(r.aviso)
    } else if (m && projetoId) {
      await sb.from('projeto_andamentos').insert({ org_id: org, projeto_id: projetoId, marco_id: m.id, tipo: 'nota', observacao: `🎙️ ${(a.resumo || '').slice(0, 1900)}`, autor })
      feito.itens.push('Resumo anotado na entrega')
    }
    if (a.encerrar_entrega) feito.avisos.push('A IA entendeu que a entrega terminou: confere e fecha na ficha, se for o caso.')
  }

  // 2) AGENDA: o compromisso vira concluído, com o resumo na descrição
  if (g.contexto_tipo === 'agenda' && g.contexto_id && quer('concluir')) {
    const { data: e } = await sb.from('agenda_eventos').select('descricao').eq('id', g.contexto_id).maybeSingle()
    await sb.from('agenda_eventos').update({ concluido: true, descricao: `${e?.descricao ? e.descricao + '\n\n' : ''}🎙️ ${(a.resumo || '').slice(0, 3000)}`, atualizado_em: new Date().toISOString() }).eq('id', g.contexto_id)
    feito.itens.push('Compromisso da agenda concluído com o resumo')
  }

  // 3) PENDÊNCIAS DO CLIENTE (só faz sentido com entrega)
  if (projetoId) {
    for (const i of indices('pendencias_cliente', (a.pendencias_cliente || []).length)) {
      const p = a.pendencias_cliente?.[i]; if (!p?.descricao) continue
      await sb.from('projeto_pendencias').insert({ org_id: org, projeto_id: projetoId, descricao: String(p.descricao).slice(0, 200) })
      await sb.from('projeto_andamentos').insert({ org_id: org, projeto_id: projetoId, tipo: 'pendencia', observacao: `📌 Pedido ao cliente: ${String(p.descricao).slice(0, 200)}`, autor })
      feito.itens.push(`Pendência do cliente: ${p.descricao}`)
    }
  }

  // 4) NOSSOS COMPROMISSOS: lista própria + lembrete na agenda de quem é o responsável
  for (const i of indices('compromissos', (a.compromissos || []).length)) {
    const c = a.compromissos?.[i]; if (!c?.descricao) continue
    const resp = c.responsavel_id || g.usuario_id
    let eventoId: string | null = null
    if (valida(c.prazo) && resp) {
      const ini = instante(c.prazo, /^[0-9]{2}:[0-9]{2}$/.test(c.hora || '') ? c.hora : '09:00')
      const { data: ev } = await sb.from('agenda_eventos').insert({ org_id: org, usuario_id: resp, criado_por: g.usuario_id, titulo: `Compromisso: ${String(c.descricao).slice(0, 120)}`, tipo: 'tarefa', inicio: ini.toISOString(), fim: new Date(ini.getTime() + 30 * 60e3).toISOString(), descricao: `Saiu da gravação "${g.titulo || a.titulo || ''}".${c.trecho ? ' Frase: "' + c.trecho + '"' : ''}`, publico: false, dia_todo: false }).select('id').single()
      eventoId = ev?.id || null
    }
    await sb.from('compromissos').insert({ org_id: org, gravacao_id: g.id, projeto_id: projetoId, responsavel_id: resp, descricao: String(c.descricao).slice(0, 300), trecho: c.trecho ? String(c.trecho).slice(0, 300) : null, prazo: valida(c.prazo) ? c.prazo : null, pessoal: !!c.pessoal, agenda_evento_id: eventoId, criado_por: g.usuario_id })
    feito.itens.push(`Compromisso${c.pessoal ? ' pessoal' : ''}: ${c.descricao}${valida(c.prazo) ? ' (até ' + c.prazo.split('-').reverse().join('/') + ')' : ''}`)
  }

  // 5) OUTROS COMPROMISSOS COM DATA (inclusive pessoais) → agenda de quem gravou
  for (const i of indices('agenda', (a.agenda || []).length)) {
    const x = a.agenda?.[i]; if (!x?.titulo || !valida(x.data) || !g.usuario_id) continue
    const ini = instante(x.data, x.hora); const dur = Math.max(15, Math.min(480, Number(x.duracao_min) || 60))
    await sb.from('agenda_eventos').insert({ org_id: org, usuario_id: g.usuario_id, criado_por: g.usuario_id, titulo: String(x.titulo).slice(0, 160), tipo: x.pessoal ? 'tarefa' : 'reuniao', inicio: ini.toISOString(), fim: new Date(ini.getTime() + dur * 60e3).toISOString(), descricao: `Saiu da gravação "${g.titulo || a.titulo || ''}".`, publico: false, dia_todo: !x.hora })
    feito.itens.push(`Na agenda: ${x.titulo} (${x.data.split('-').reverse().join('/')}${x.hora ? ' ' + x.hora : ''})`)
  }

  await sb.from('gravacoes').update({ status: 'aplicada', aplicado: feito, projeto_id: projetoId }).eq('id', id)

  // 6) aviso no WhatsApp: o que foi feito + o que vale olhar
  const s = a.sinais || {}
  const extras = [
    (s.venda || []).length ? `💰 Sinal de venda: ${s.venda[0]}` : '',
    (s.risco || []).length ? `⚠️ Risco: ${s.risco[0]}` : '',
    (a.conteudo || []).length ? `🎬 ${a.conteudo.length} ideia(s) de conteúdo` : '',
  ].filter(Boolean)
  await avisar(g, [`🎙️ ${a.titulo || g.titulo || 'Gravação'} — pronto.`, ...feito.itens.slice(0, 8).map((t: string) => '✓ ' + t), ...feito.avisos.map((t: string) => '! ' + t), ...extras, `Ver tudo: ${origem}/dashboard/gravacoes?g=${id}`].join('\n'))
  return feito
}

export async function limparAudiosVencidos() {
  const { data } = await sb.from('gravacoes').select('id, org_id').eq('audio_apagado', false).lt('apagar_audio_em', new Date().toISOString()).limit(20)
  for (const g of data || []) {
    const pasta = `${g.org_id}/${g.id}`
    const { data: arqs } = await sb.storage.from(BUCKET).list(pasta, { limit: 10000 })
    if (arqs?.length) await sb.storage.from(BUCKET).remove(arqs.map(a => `${pasta}/${a.name}`))
    await sb.from('gravacoes').update({ audio_apagado: true }).eq('id', g.id)
  }
}
