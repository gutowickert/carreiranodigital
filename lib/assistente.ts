import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { TOOLS, runTool } from '@/lib/agente-tools'
import { contextoCentral } from '@/lib/contexto-central'
import { enviarTexto, enviarTemplate, baixarMidia, foneOficial } from '@/lib/whatsapp-oficial'
import { hojeBR, menosDias } from '@/lib/periodos'
import { LOCAIS } from '@/lib/entrega'
import { lerPainel } from '@/lib/trafego-cliente'
import { impostoMetaPct } from '@/lib/imposto-meta'

// O ASSISTENTE DO TIME NO WHATSAPP.
//
// O Guto fala com o sistema pelo número oficial da escola. O webhook reconhece o número dele
// (usuarios_perfil.whatsapp) e desvia pra cá ANTES de virar lead. A conversa fica em
// assistente_mensagens, nunca na caixa do time.
//
// Três coisas ele faz:
//   bomDia        → manhã: agenda do dia, o que está atrasado, quem falta reconfirmar.
//   responder     → texto ou áudio dele vira pergunta ou ordem. Perguntas usam as ferramentas
//                   do agente interno (só leitura). Ordens de agenda GRAVAM DIRETO e confirmam
//                   em uma linha; ele responde "desfaz" se errou. Cartão de confirmação no
//                   WhatsApp seria fricção demais.
//   enviarAoTime  → decide sozinho entre texto livre (janela de 24h aberta) e template.

const MODELO = 'claude-sonnet-4-6'
const TZ = 'America/Sao_Paulo'
const TEMPLATE_BOM_DIA = 'cnd_bom_dia_agenda'

export type Usuario = { id: string; org_id: string; nome: string; apelido?: string | null; email: string; whatsapp: string; assistente_ultima_msg_em: string | null; assistente_bom_dia: boolean }
// como a pessoa é chamada de verdade: o cadastro diz "Luis Augusto", ele é o Guto
export const chamar = (u: Usuario) => (u.apelido || u.nome.split(' ')[0]).trim()

// ═══════════════════════════════════════════════════════════ quem é

export async function usuarioDoNumero(tel: string): Promise<Usuario | null> {
  const d = foneOficial(tel)
  if (d.length < 10) return null
  const sufixo = d.slice(-8)
  const { data } = await sb.from('usuarios_perfil').select('id, org_id, nome, apelido, email, whatsapp, assistente_ultima_msg_em, assistente_bom_dia')
    .eq('ativo', true).not('whatsapp', 'is', null).ilike('whatsapp', `%${sufixo}`).limit(1)
  return (data?.[0] as Usuario) || null
}

// ═══════════════════════════════════════════════════════════ a janela

function janelaAberta(u: Usuario) {
  if (!u.assistente_ultima_msg_em) return false
  return Date.now() - new Date(u.assistente_ultima_msg_em).getTime() < 23.5 * 3600 * 1000  // meia hora de folga
}

// Texto livre se a janela está aberta; senão, o template (se houver um que caiba).
export async function enviarAoTime(u: Usuario, texto: string, template?: { nome: string; params: string[] }) {
  if (janelaAberta(u)) {
    const r = await enviarTexto(u.whatsapp, texto)
    if (r.ok) { await guardar(u, 'assistente', texto); return { ok: true, via: 'texto' } }
    // a Meta recusou (janela fechou no meio): tenta o template
    if (!template) return { ok: false, error: r.error }
  }
  if (!template) return { ok: false, error: 'janela de 24h fechada e sem template pra esse aviso' }
  const r = await enviarTemplate(u.whatsapp, template.nome, 'pt_BR', [{ type: 'body', parameters: template.params.map(t => ({ type: 'text', text: t })) }])
  if (r.ok) await guardar(u, 'assistente', `[template ${template.nome}] ${template.params.join(' · ')}`)
  return { ok: r.ok, via: 'template', error: r.error }
}

async function guardar(u: Usuario, papel: 'usuario' | 'assistente' | 'sistema', texto: string, wamid?: string) {
  const { error } = await sb.from('assistente_mensagens').insert({ org_id: u.org_id, usuario_id: u.id, papel, texto, wamid: wamid || null })
  return !error
}

// ═══════════════════════════════════════════════════════════ a agenda dele

const fmtHora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
const fmtDia = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7)
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const nomeDia = (d: string) => DIAS[new Date(d + 'T12:00:00-03:00').getDay()]

type Item = { hora: string; iso: string; titulo: string; detalhe?: string; origem: 'agenda' | 'cliente' | 'aula' }

export async function agendaDoDia(u: Usuario, data: string): Promise<Item[]> {
  const ini = `${data}T00:00:00-03:00`, fim = `${data}T23:59:59-03:00`
  const [{ data: ev }, { data: marcos }, { data: aulas }] = await Promise.all([
    sb.from('agenda_eventos').select('id, titulo, tipo, inicio, fim, descricao, usuario_id, participantes, concluido, dia_todo')
      .eq('org_id', u.org_id).gte('inicio', ini).lte('inicio', fim).eq('concluido', false).order('inicio'),
    sb.from('projeto_marcos').select('id, titulo, data_combinada, estado, local, responsavel_id, reconfirmacao_resposta, projetos!inner(cliente, responsavel_id, participantes)')
      .eq('org_id', u.org_id).in('estado', ['combinado', 'confirmado']).gte('data_combinada', ini).lte('data_combinada', fim).order('data_combinada'),
    sb.from('agenda_aulas').select('id, titulo, inicio, fim, professor_id, turmas(codigo)')
      .eq('org_id', u.org_id).eq('professor_id', u.id).gte('inicio', ini).lte('inicio', fim).order('inicio'),
  ])
  const meu = (x: any) => x.usuario_id === u.id || (Array.isArray(x.participantes) && x.participantes.includes(u.id))
  const itens: Item[] = []
  for (const e of ev || []) if (meu(e)) itens.push({ hora: e.dia_todo ? 'dia todo' : fmtHora(e.inicio), iso: e.inicio, titulo: e.titulo, detalhe: e.descricao || undefined, origem: 'agenda' })
  for (const m of marcos || []) {
    const p: any = m.projetos
    if (m.responsavel_id === u.id || p?.responsavel_id === u.id || (Array.isArray(p?.participantes) && p.participantes.includes(u.id))) {
      const local = LOCAIS.find(l => l.chave === m.local)?.nome
      itens.push({ hora: fmtHora(m.data_combinada), iso: m.data_combinada, titulo: `${p?.cliente}: ${m.titulo}`, detalhe: [local, m.estado === 'confirmado' ? 'confirmado' : 'a confirmar'].filter(Boolean).join(' · '), origem: 'cliente' })
    }
  }
  for (const a of aulas || []) itens.push({ hora: fmtHora(a.inicio), iso: a.inicio, titulo: `Aula: ${a.titulo || (a as any).turmas?.codigo || ''}`, origem: 'aula' })
  return itens.sort((a, b) => a.iso.localeCompare(b.iso))
}

// o que está pendente com os clientes dele: encontro atrasado e encontro de amanhã sem reconfirmação
async function pendenciasDeEntrega(u: Usuario) {
  const hoje = hojeBR(), amanha = menosDias(hoje, -1)
  const { data: marcos } = await sb.from('projeto_marcos').select('titulo, estado, data_prevista, data_combinada, natureza, reconfirmacao_resposta, responsavel_id, projetos!inner(cliente, responsavel_id, status)')
    .eq('org_id', u.org_id).not('estado', 'in', '("concluido","cancelado")')
  const meus = (marcos || []).filter((m: any) => (m.responsavel_id === u.id || m.projetos?.responsavel_id === u.id) && m.projetos?.status === 'ativo')
  const atrasados = meus.filter((m: any) => m.natureza === 'encontro' && m.estado === 'previsto' && m.data_prevista && String(m.data_prevista).slice(0, 10) < hoje)
  const semReconfirmar = meus.filter((m: any) => m.estado === 'combinado' && m.data_combinada && new Date(m.data_combinada).toLocaleDateString('en-CA', { timeZone: TZ }) === amanha && !m.reconfirmacao_resposta)
  return {
    atrasados: atrasados.map((m: any) => `${m.projetos.cliente}: ${m.titulo} (previsto ${fmtDia(String(m.data_prevista))})`),
    semReconfirmar: semReconfirmar.map((m: any) => `${m.projetos.cliente}: ${m.titulo} às ${fmtHora(m.data_combinada)}`),
  }
}

function textoAgenda(itens: Item[], data: string) {
  if (!itens.length) return `Agenda de ${nomeDia(data)}, ${fmtDia(data)}: livre.`
  return `Agenda de ${nomeDia(data)}, ${fmtDia(data)}:\n` + itens.map(i => `• ${i.hora} ${i.titulo}${i.detalhe ? ` (${i.detalhe})` : ''}`).join('\n')
}

// ═══════════════════════════════════════════════════════════ o bom dia

export async function bomDia(u: Usuario) {
  const hoje = hojeBR()
  const [itens, pend] = await Promise.all([agendaDoDia(u, hoje), pendenciasDeEntrega(u)])
  const partes = [`Bom dia, ${chamar(u)}.`, textoAgenda(itens, hoje)]
  if (pend.semReconfirmar.length) partes.push(`Amanhã sem reconfirmação:\n${pend.semReconfirmar.map(x => '• ' + x).join('\n')}`)
  if (pend.atrasados.length) partes.push(`Encontros que passaram da data prevista e ainda não foram marcados:\n${pend.atrasados.map(x => '• ' + x).join('\n')}`)
  partes.push('Me manda o que precisar por aqui, texto ou áudio.')
  const texto = partes.join('\n\n')

  // fora da janela vai o template curto; a resposta dele abre a janela e aí a agenda completa vai livre
  const primeiro = itens[0] ? `${itens[0].hora} ${itens[0].titulo}` : 'nada marcado'
  const r = await enviarAoTime(u, texto, { nome: TEMPLATE_BOM_DIA, params: [chamar(u), String(itens.length), primeiro.slice(0, 120)] })
  return { ...r, compromissos: itens.length }
}

// ═══════════════════════════════════════════════════════════ responder

// áudio direto do id da mídia (a mensagem não passa por wa_mensagens)
async function transcrever(mediaId: string): Promise<string | null> {
  const dgKey = process.env.DEEPGRAM_API_KEY || ''
  if (!dgKey) return null
  const dl = await baixarMidia(mediaId)
  if (!dl.ok || !dl.buffer) return null
  const ct = (dl.mime || 'audio/ogg').split(';')[0]
  const r = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=pt&smart_format=true&punctuate=true&keywords=Claude:2&keywords=Meta:1&keywords=tráfego:1', {
    method: 'POST', headers: { Authorization: `Token ${dgKey}`, 'Content-Type': ct }, body: Buffer.from(dl.buffer),
  })
  const j: any = await r.json().catch(() => null)
  const txt = j?.results?.channels?.[0]?.alternatives?.[0]?.transcript
  return typeof txt === 'string' && txt.trim() ? txt.trim() : null
}

// as ferramentas de ESCRITA, só do assistente (o agente interno da tela continua só leitura)
const TOOLS_AGENDA = [
  { name: 'minha_agenda', description: 'A agenda do usuário num dia: reuniões, tarefas, encontros com clientes, aulas. Use pra "o que tenho hoje/amanhã/quinta".', input_schema: { type: 'object', properties: { data: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['data'] } },
  { name: 'marcar', description: 'GRAVA um compromisso (reunião) ou lembrete (tarefa) na agenda do usuário. Grava direto. Use quando ele mandar marcar, agendar, lembrar.', input_schema: { type: 'object', properties: { titulo: { type: 'string' }, inicio: { type: 'string', description: 'YYYY-MM-DDTHH:MM no horário de Brasília' }, duracao_min: { type: 'number', description: 'default 60' }, tipo: { type: 'string', description: 'reuniao ou tarefa (default reuniao)' }, descricao: { type: 'string', description: 'lugar, com quem, o que levar' } }, required: ['titulo', 'inicio'] } },
  { name: 'desmarcar', description: 'Apaga da agenda um compromisso criado pelo assistente (pra "desfaz", "cancela a reunião de quinta"). Informe a data e parte do título.', input_schema: { type: 'object', properties: { data: { type: 'string', description: 'YYYY-MM-DD' }, titulo: { type: 'string' } }, required: ['data', 'titulo'] } },
  { name: 'anotar_lead', description: 'GRAVA uma nota no histórico de um lead ("anota no lead da Jessica que..."). Grava direto.', input_schema: { type: 'object', properties: { nome: { type: 'string' }, texto: { type: 'string' } }, required: ['nome', 'texto'] } },
  { name: 'trafego_clientes', description: 'RESUMO do tráfego de TODOS os clientes das entregas (Deu Venda, CRM) num período, lido do painel de cada um: investido, conversas, custo por conversa, melhor anúncio e a análise escrita. Use pra "como estão meus clientes", "resumo do tráfego dos clientes". Default: últimos 7 dias.', input_schema: { type: 'object', properties: { de: { type: 'string', description: 'YYYY-MM-DD' }, ate: { type: 'string', description: 'YYYY-MM-DD' } } } },
  { name: 'trafego_cliente', description: 'O painel completo de UM cliente das entregas: totais, comparação com o período anterior, cada anúncio (puxando/queimando), o que foi feito, conquistas. Use pra "como tá o tráfego da Dani".', input_schema: { type: 'object', properties: { cliente: { type: 'string' }, de: { type: 'string' }, ate: { type: 'string' } }, required: ['cliente'] } },
  { name: 'registrar_vendas_cliente', description: 'GRAVA no placar de um cliente do Deu Venda/CRM as vendas e o faturamento de um mês ("a Dani fechou 3 vendas esse mês"). Grava direto; o painel do cliente atualiza.', input_schema: { type: 'object', properties: { cliente: { type: 'string' }, mes: { type: 'string', description: 'YYYY-MM, default mês atual' }, vendas: { type: 'number' }, faturamento: { type: 'number' }, observacao: { type: 'string' } }, required: ['cliente'] } },
]

async function runToolAssistente(u: Usuario, name: string, input: any, origin: string): Promise<any> {
  if (name === 'minha_agenda') {
    const itens = await agendaDoDia(u, input.data)
    return { data: input.data, itens: itens.map(i => ({ hora: i.hora, titulo: i.titulo, detalhe: i.detalhe || null, origem: i.origem })) }
  }
  if (name === 'marcar') {
    const ini = new Date(String(input.inicio).length <= 16 ? `${input.inicio}:00-03:00` : input.inicio)
    if (isNaN(ini.getTime())) return { erro: 'data/hora inválida' }
    const fim = new Date(ini.getTime() + (Number(input.duracao_min) || 60) * 60000)
    const tipo = input.tipo === 'tarefa' ? 'tarefa' : 'reuniao'
    const { data, error } = await sb.from('agenda_eventos').insert({ org_id: u.org_id, usuario_id: u.id, criado_por: u.id, titulo: String(input.titulo).slice(0, 200), tipo, inicio: ini.toISOString(), fim: fim.toISOString(), descricao: input.descricao ? String(input.descricao).slice(0, 1000) : null, publico: false, dia_todo: false }).select('id').single()
    if (error) return { erro: error.message }
    return { ok: true, id: data.id, gravado: `${tipo} "${input.titulo}" em ${ini.toLocaleString('pt-BR', { timeZone: TZ, weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` }
  }
  if (name === 'desmarcar') {
    const ini = `${input.data}T00:00:00-03:00`, fim = `${input.data}T23:59:59-03:00`
    const { data } = await sb.from('agenda_eventos').select('id, titulo').eq('org_id', u.org_id).eq('usuario_id', u.id).gte('inicio', ini).lte('inicio', fim).ilike('titulo', `%${input.titulo}%`).limit(2)
    if (!data?.length) return { erro: 'não achei esse compromisso nesse dia' }
    if (data.length > 1) return { erro: 'achei mais de um: ' + data.map(x => x.titulo).join(' | ') + '. Qual?' }
    await sb.from('agenda_eventos').delete().eq('id', data[0].id)
    return { ok: true, apagado: data[0].titulo }
  }
  if (name === 'anotar_lead') {
    const { data } = await sb.from('leads').select('id, nome').eq('org_id', u.org_id).ilike('nome', `%${input.nome}%`).order('atualizado_em', { ascending: false }).limit(3)
    if (!data?.length) return { erro: 'lead não encontrado' }
    if (data.length > 1 && !data.find(l => l.nome.toLowerCase() === String(input.nome).toLowerCase())) return { erro: 'achei mais de um: ' + data.map(l => l.nome).join(' | ') + '. Qual?' }
    const lead = data.find(l => l.nome.toLowerCase() === String(input.nome).toLowerCase()) || data[0]
    const { error } = await sb.from('lead_andamentos').insert({ lead_id: lead.id, tipo: 'nota', observacao: `📝 ${chamar(u)} (pelo WhatsApp): ${input.texto}` })
    if (error) return { erro: error.message }
    return { ok: true, lead: lead.nome }
  }
  if (name === 'registrar_vendas_cliente') {
    const { data } = await sb.from('projetos').select('id, cliente').eq('org_id', u.org_id).in('status', ['ativo', 'manutencao']).ilike('cliente', `%${input.cliente}%`).limit(2)
    if (!data?.length) return { erro: 'cliente não encontrado nas entregas' }
    if (data.length > 1) return { erro: 'achei mais de um: ' + data.map(p => p.cliente).join(' | ') + '. Qual?' }
    const mes = input.mes || hojeBR().slice(0, 7)
    const { data: ja } = await sb.from('projeto_placar').select('id').eq('projeto_id', data[0].id).eq('mes', mes).is('ponto_a', null).limit(1)
    const linha: any = { autor: chamar(u) + ' (WhatsApp)' }
    if (input.vendas != null) linha.vendas = Number(input.vendas)
    if (input.faturamento != null) linha.comissao = Number(input.faturamento)
    if (input.observacao) linha.observacao = String(input.observacao).slice(0, 500)
    if (ja?.[0]) await sb.from('projeto_placar').update(linha).eq('id', ja[0].id)
    else await sb.from('projeto_placar').insert({ ...linha, org_id: u.org_id, projeto_id: data[0].id, mes, data: hojeBR(), fonte: 'cliente' })
    return { ok: true, cliente: data[0].cliente, mes, ...linha }
  }
  if (name === 'trafego_clientes' || name === 'trafego_cliente') {
    const hoje = hojeBR()
    const de = input.de || menosDias(hoje, 6), ate = input.ate || hoje
    let q = sb.from('projetos').select('id, org_id, cliente, produto, fase, ad_account_id, data_inicio, valor_cliente, alvo_custo_resultado').eq('org_id', u.org_id).in('status', ['ativo', 'manutencao']).not('ad_account_id', 'is', null)
    if (name === 'trafego_cliente') q = q.ilike('cliente', `%${input.cliente}%`)
    const { data: projetos } = await q.order('cliente')
    if (!projetos?.length) return { erro: name === 'trafego_cliente' ? 'cliente não encontrado (ou sem conta de anúncio ligada)' : 'nenhum cliente com conta de anúncio' }
    const pct = await impostoMetaPct(u.org_id)
    const out: any[] = []
    for (const p of projetos) {
      const pn = await lerPainel(p as any, de, ate, pct)
      const melhor = pn.anuncios.find(a => a.situacao === 'puxando') || pn.anuncios[0]
      const base = { cliente: p.cliente, produto: p.produto, fase: p.fase, periodo: `${pn.de} a ${pn.ate}`, investido: Math.round(pn.total.gasto * 100) / 100, resultados: pn.total.resultados, tipo: pn.nome.varios, custo: pn.total.custo != null ? Math.round(pn.total.custo * 100) / 100 : null,
        vs_anterior: pn.anterior ? { investido: Math.round(pn.anterior.gasto * 100) / 100, resultados: pn.anterior.resultados } : null, melhor_anuncio: melhor ? `${melhor.nome} (${melhor.resultados} a R$ ${melhor.custo?.toFixed(2) ?? '-'})` : null, analise: pn.analise }
      out.push(name === 'trafego_cliente' ? { ...base, anuncios: pn.anuncios.map(a => ({ nome: a.nome, situacao: a.situacao, status: a.status, resultados: a.resultados, gasto: Math.round(a.gasto * 100) / 100, custo: a.custo != null ? Math.round(a.custo * 100) / 100 : null })), eventos: pn.eventos.slice(0, 8), conquistas: pn.conquistas.map(c => c.titulo), proximas: pn.proximas } : base)
    }
    return { periodo: `${de} a ${ate}`, clientes: out }
  }
  return runTool(name, input, origin)
}

const SYSTEM = (u: Usuario) => `Você é o assistente pessoal de ${chamar(u)} (chame-o assim, nunca pelo nome do cadastro), dono da Carreira no Digital, falando com ele pelo WhatsApp. Hoje é ${hojeBR()} (${nomeDia(hojeBR())}), fuso America/Sao_Paulo.

COMO FALAR: é WhatsApp. Respostas curtas, diretas, em português, sem markdown (nada de asteriscos duplos, cabeçalhos ou tabelas; use quebras de linha e o marcador "•" quando listar). Nunca use travessão. Nunca emoji. Trate por "tu".

O QUE VOCÊ FAZ:
1. Responde perguntas sobre a empresa com as ferramentas de dados (vendas, leads, financeiro, tráfego, clientes das entregas, turmas). Nunca invente número: se a ferramenta não trouxe, diga que não achou.
2. Agenda: 'minha_agenda' pra ver; 'marcar' pra gravar reunião/lembrete; 'desmarcar' pra tirar. Você GRAVA DIRETO e confirma em uma linha ("Marcado: quinta 02/10, 14h, reunião com o Moacir, sede de POA."). Se ele disser que errou, use 'desmarcar' e grave de novo. Interprete datas relativas ("quinta", "amanhã", "semana que vem") a partir de hoje; sem horário, pergunte. Encontros com CLIENTES das entregas (projeto_marcos) você só lê; marcar esses é pela ficha do sistema.
3. Tráfego dos clientes das entregas: 'trafego_clientes' (todos, resumo) e 'trafego_cliente' (um, completo). Ao resumir vários, uma linha por cliente: nome, investido, conversas, custo, melhor anúncio; depois só o que pede atenção. 'anotar_lead' grava nota no histórico de um lead. 'registrar_vendas_cliente' grava vendas/faturamento do mês de um cliente do Deu Venda ou CRM.
4. Ferramentas 'propor_*' do agente interno NÃO servem aqui (não há cartão pra confirmar no WhatsApp): se ele pedir despesa, mudança de fluxo ou regra da IA de vendas, diga que isso se faz pela tela do sistema.

Quando gravar algo, a resposta é só a confirmação do que foi gravado. Quando responder pergunta, vá direto ao número. Se a mensagem veio de áudio transcrito e ficou ambígua, pergunte em vez de adivinhar.`

export async function responder(u: Usuario, m: any, origin: string) {
  // dedup: a Meta reenvia o webhook quando não recebe 200 rápido
  if (m.id) {
    const { data: ja } = await sb.from('assistente_mensagens').select('id').eq('wamid', m.id).limit(1)
    if (ja?.length) return { ok: true, repetida: true }
  }
  let texto: string | null = null
  if (m.type === 'text') texto = m.text?.body || null
  else if (m.type === 'audio' || m.type === 'voice') texto = m.audio?.id ? await transcrever(m.audio.id) : null
  else if (m.type === 'button') texto = m.button?.text || null
  else if (m.type === 'interactive') texto = m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || null

  const agora = new Date().toISOString()
  await sb.from('usuarios_perfil').update({ assistente_ultima_msg_em: agora }).eq('id', u.id)
  u.assistente_ultima_msg_em = agora

  if (!texto) {
    const aviso = m.type === 'audio' || m.type === 'voice' ? 'Não consegui entender o áudio. Manda de novo, ou escreve.' : 'Por aqui eu leio texto e áudio.'
    await guardar(u, 'usuario', `[${m.type}]`, m.id)
    await enviarAoTime(u, aviso)
    return { ok: true }
  }
  await guardar(u, 'usuario', (m.type === 'audio' || m.type === 'voice') ? `🎤 ${texto}` : texto, m.id)

  // memória curta: o que foi dito nas últimas 24h
  const { data: hist } = await sb.from('assistente_mensagens').select('papel, texto').eq('usuario_id', u.id).gte('criado_em', new Date(Date.now() - 24 * 3600 * 1000).toISOString()).order('criado_em').limit(30)
  const messages: any[] = []
  for (const h of hist || []) {
    if (h.papel === 'sistema') continue
    const role = h.papel === 'usuario' ? 'user' : 'assistant'
    if (messages.length && messages[messages.length - 1].role === role) messages[messages.length - 1].content += '\n' + h.texto
    else messages.push({ role, content: h.texto })
  }
  if (!messages.length || messages[messages.length - 1].role !== 'user') messages.push({ role: 'user', content: texto })

  const key = process.env.ANTHROPIC_API_KEY
  if (!key) { await enviarAoTime(u, 'Estou sem a chave da IA configurada.'); return { ok: false } }
  const client = new Anthropic({ apiKey: key })
  const cerebro = await contextoCentral().catch(() => '')
  const sys = cerebro ? `${cerebro}\n\n---\n\n${SYSTEM(u)}` : SYSTEM(u)
  const tools = [...TOOLS.filter((t: any) => !String(t.name).startsWith('propor_') && t.name !== 'simular_atendimento'), ...TOOLS_AGENDA]

  let final = ''
  for (let passo = 0; passo < 8; passo++) {
    const resp: any = await client.messages.create({ model: MODELO, max_tokens: 1200, system: sys, tools: tools as any, messages })
    const textoResp = (resp.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim()
    const usos = (resp.content || []).filter((b: any) => b.type === 'tool_use')
    if (resp.stop_reason !== 'tool_use' || !usos.length) { final = textoResp; break }
    messages.push({ role: 'assistant', content: resp.content })
    const results: any[] = []
    for (const tu of usos) {
      let out: any
      try { out = await runToolAssistente(u, tu.name, tu.input, origin) } catch (e: any) { out = { erro: e?.message || 'falha' } }
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out).slice(0, 12000) })
    }
    messages.push({ role: 'user', content: results })
  }
  if (!final) final = 'Não consegui fechar essa. Tenta de outro jeito.'
  // WhatsApp não tem markdown: tira o que escapar
  final = final.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/gm, '').replace(/—/g, ',').slice(0, 3900)
  await enviarAoTime(u, final)
  return { ok: true }
}
