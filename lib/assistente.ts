import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { TOOLS, runTool } from '@/lib/agente-tools'
import { contextoCentral } from '@/lib/contexto-central'
import { enviarTexto, enviarTemplate, baixarMidia, foneOficial, uploadMidia, enviarMidia } from '@/lib/whatsapp-oficial'
import { imagemAgenda, imagemTrafego } from '@/lib/assistente-imagem'
import { montarMonitor, textoResumoMonitor } from '@/lib/monitor-entregas'
import { hojeBR, menosDias } from '@/lib/periodos'
import { LOCAIS, ROTEIROS, type Produto, type Local } from '@/lib/entrega'
import { criarProjeto } from '@/lib/criar-projeto'
import { dossieLead, timelineDossie } from '@/lib/historico-lead'
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

// Imagem (card) com legenda. Só dentro da janela: fora dela a Meta só aceita template.
export async function enviarImagemAoTime(u: Usuario, png: Buffer, legenda?: string) {
  if (!janelaAberta(u)) return { ok: false, error: 'janela de 24h fechada' }
  const up = await uploadMidia(png, 'image/png', 'card.png')
  if (!up.ok || !up.id) return { ok: false, error: up.error || 'upload falhou' }
  // o Guto pediu: quando vem card, vem só o card, sem texto embaixo
  const r = await enviarMidia(u.whatsapp, 'image', up.id, legenda ? legenda.slice(0, 1024) : undefined)
  if (r.ok) await guardar(u, 'assistente', '[card] ' + (legenda || '').slice(0, 300))
  return { ok: r.ok, via: 'imagem', error: r.error }
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

// vendas fechadas ontem (o Guto quer saber de manhã, antes de perguntar ao Rick)
export async function vendasDeOntem(org: string) {
  const ontem = menosDias(hojeBR(), 1)
  const { data } = await sb.from('leads').select('nome, valor_venda, codigo_turma, data_ganho').eq('org_id', org).eq('etapa', 'ganho')
    .gte('data_ganho', ontem + 'T00:00:00-03:00').lte('data_ganho', ontem + 'T23:59:59-03:00').order('data_ganho')
  const v = data || []
  const brl = (x: number) => 'R$ ' + x.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  return { n: v.length, total: v.reduce((acc, l) => acc + Number(l.valor_venda || 0), 0), nomes: v.map(l => l.nome + (l.valor_venda ? ' (' + brl(Number(l.valor_venda)) + ')' : '')) }
}

// leads ativos com mensagem DELES que o time ainda não abriu (a IA não conta: ela responde sozinha)
export async function leadsEsperando(org: string, horas = 0) {
  const { data } = await sb.from('wa_conversas').select('id, nome, ultima_msg_em, lead_id, leads!inner(id, nome, etapa, atendido_por)')
    .eq('org_id', org).gt('nao_lidas', 0).not('lead_id', 'is', null)
    .lt('ultima_msg_em', new Date(Date.now() - horas * 3600 * 1000).toISOString())
    .gt('ultima_msg_em', new Date(Date.now() - 48 * 3600 * 1000).toISOString())
    .order('ultima_msg_em')
  return (data || []).filter((c: any) => c.leads && !['ganho', 'perda'].includes(c.leads.etapa) && c.leads.atendido_por !== 'ia')
    .map((c: any) => ({ conversa_id: c.id as string, lead_id: c.leads.id as string, nome: (c.leads.nome || c.nome) as string, desde: c.ultima_msg_em as string }))
}

function textoAgenda(itens: Item[], data: string) {
  if (!itens.length) return `Agenda de ${nomeDia(data)}, ${fmtDia(data)}: livre.`
  return `Agenda de ${nomeDia(data)}, ${fmtDia(data)}:\n` + itens.map(i => `• ${i.hora} ${i.titulo}${i.detalhe ? ` (${i.detalhe})` : ''}`).join('\n')
}

// ═══════════════════════════════════════════════════════════ o bom dia

export async function bomDia(u: Usuario) {
  const hoje = hojeBR()
  const [itens, pend, ontem, esperando] = await Promise.all([agendaDoDia(u, hoje), pendenciasDeEntrega(u), vendasDeOntem(u.org_id), leadsEsperando(u.org_id)])
  const partes = [`Bom dia, ${chamar(u)}.`, textoAgenda(itens, hoje)]
  const brl0 = (x: number) => 'R$ ' + x.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  const linhaOntem = ontem.n ? `Ontem: ${ontem.n} ${ontem.n === 1 ? 'venda' : 'vendas'}, ${brl0(ontem.total)} (${ontem.nomes.slice(0, 4).join(', ')}).` : 'Ontem: nenhuma venda.'
  const linhaEsp = esperando.length ? `${esperando.length} ${esperando.length === 1 ? 'lead esperando resposta' : 'leads esperando resposta'}: ${esperando.slice(0, 5).map(x => x.nome).join(', ')}.` : ''
  partes.push([linhaOntem, linhaEsp].filter(Boolean).join('\n'))
  if (pend.semReconfirmar.length) partes.push(`Amanhã sem reconfirmação:\n${pend.semReconfirmar.map(x => '• ' + x).join('\n')}`)
  if (pend.atrasados.length) partes.push(`Encontros que passaram da data prevista e ainda não foram marcados:\n${pend.atrasados.map(x => '• ' + x).join('\n')}`)
  partes.push('Me manda o que precisar por aqui, texto ou áudio.')
  const texto = partes.join('\n\n')

  // janela aberta: o card de imagem com a agenda, e o texto vai na legenda (a legenda cabe 1024)
  if (janelaAberta(u)) {
    try {
      const atencao = [linhaOntem, ...(linhaEsp ? [linhaEsp] : []), ...pend.semReconfirmar.map(x => 'Amanhã sem reconfirmação: ' + x), ...pend.atrasados.map(x => 'Sem data marcada: ' + x)]
      const png = await imagemAgenda({ nome: chamar(u), data: hoje, itens, atencao })
      const r = await enviarImagemAoTime(u, png)
      if (r.ok) return { ...r, compromissos: itens.length }
    } catch { /* sem card, vai o texto */ }
  }
  // fora da janela vai o template curto; a resposta dele abre a janela e aí a agenda completa vai livre
  const primeiro = itens[0] ? `${itens[0].hora} ${itens[0].titulo}` : 'nada marcado'
  const r = await enviarAoTime(u, texto, { nome: TEMPLATE_BOM_DIA, params: [chamar(u), String(itens.length), primeiro.slice(0, 120)] })
  return { ...r, compromissos: itens.length }
}

// ═══════════════════════════════════════════════════════════ o relatório de tráfego

// O monitor das entregas como card + texto. Só dentro da janela (imagem e texto livre não
// passam fora dela); fora, fica pro dia em que ele responder o bom dia.
export async function relatorioTrafego(u: Usuario) {
  if (!janelaAberta(u)) return { ok: false, error: 'janela de 24h fechada: vai depois que ele responder o bom dia' }
  const m = await montarMonitor(u.org_id)
  const linhas = m.cards.filter(c => c.painel && (c.painel.total.gasto > 0 || c.painel.total.resultados > 0)).map(c => {
    const t = c.painel!.total, a = c.painel!.anterior
    return { cliente: c.cliente, nivel: c.nivel, fase: c.faseLabel, resultados: t.resultados, custo: t.custo, gasto: t.gasto,
      delta: a && a.resultados ? Math.round(((t.resultados - a.resultados) / a.resultados) * 100) : null, tipo: c.painel!.nome.varios,
      puxando: c.painel!.anuncios.find(x => x.situacao === 'puxando')?.nome || null, parado: c.anuncios_ativos === 0 && t.gasto > 0 }
  })
  const atencao = m.cards.flatMap(c => c.alertas.filter(a => !['sem_portal', 'sem_valor_cliente'].includes(a.chave)).map(a => ({ nivel: a.nivel, texto: `${c.cliente}: ${a.titulo}` })))
    .sort((a, b) => (a.nivel === 'vermelho' ? 0 : 1) - (b.nivel === 'vermelho' ? 0 : 1))
  const texto = await textoResumoMonitor(u.org_id)
  try {
    const png = await imagemTrafego({ dias: m.dias, de: m.de, ate: m.ate, resumo: m.resumo, linhas, atencao, contatar: [...new Set(m.contatar.map(x => x.cliente))] })
    const r = await enviarImagemAoTime(u, png)
    if (r.ok) return r
  } catch { /* sem card, vai o texto */ }
  return enviarAoTime(u, texto)
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
  { name: 'criar_entrega', description: 'CADASTRA um cliente novo nas ENTREGAS (cria o projeto com todos os marcos do roteiro e já põe a sessão de implantação na agenda). Use quando ele fechar uma venda: "cadastra o Fulano no Deu Venda, sessão terça às 14h na sede de POA". Grava direto. Se faltar a data/hora da sessão ou o lugar, pergunte antes.', input_schema: { type: 'object', properties: { cliente: { type: 'string', description: 'nome do cliente ou da empresa' }, whatsapp: { type: 'string' }, produto: { type: 'string', description: 'deu_venda (padrão), crm, combo (Deu Venda + CRM + Tráfego) ou crm_trafego' }, sessao: { type: 'string', description: 'data e hora da sessão de implantação, YYYY-MM-DDTHH:MM (Brasília). É a data de início do contrato.' }, local: { type: 'string', description: 'sede_lajeado | regiao_lajeado (na empresa do cliente, região de Lajeado) | sede_poa | regiao_poa' }, lead: { type: 'string', description: 'nome do lead de origem no CRM, se houver (liga a entrega ao card)' }, mensalidade_valor: { type: 'number' }, observacoes: { type: 'string' } }, required: ['cliente', 'sessao', 'local'] } },
  { name: 'resumo_lead', description: 'A conversa inteira com um lead (WhatsApp nos dois canais, ligações, notas do time), em ordem. Use pra "resume a conversa com X", "o que rolou com X", antes de ele ligar pra alguém. Você resume em poucas linhas: situação, o que o lead quer, objeção, último contato, próximo passo.', input_schema: { type: 'object', properties: { nome: { type: 'string' } }, required: ['nome'] } },
  { name: 'combinado_cliente', description: 'O que foi combinado com um CLIENTE das entregas (Deu Venda/CRM): meta, valores, observações da ficha, notas dos encontros, o que foi registrado e o que falta. Use pra "o que eu combinei com X", "como está a entrega do X".', input_schema: { type: 'object', properties: { cliente: { type: 'string' } }, required: ['cliente'] } },
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
  if (name === 'criar_entrega') {
    const produto = (String(input.produto || 'deu_venda') as Produto)
    if (!ROTEIROS[produto]) return { erro: 'produto inválido: use deu_venda, crm, combo ou crm_trafego' }
    const local = String(input.local || '') as Local
    if (!LOCAIS.some(l => l.chave === local)) return { erro: 'local inválido: sede_lajeado, regiao_lajeado, sede_poa ou regiao_poa' }
    const sessao = new Date(String(input.sessao).length <= 16 ? `${input.sessao}:00-03:00` : String(input.sessao))
    if (isNaN(sessao.getTime())) return { erro: 'data/hora da sessão inválida' }
    let lead_id: string | null = null
    if (input.lead) {
      const { data } = await sb.from('leads').select('id, nome, whatsapp').eq('org_id', u.org_id).ilike('nome', `%${input.lead}%`).order('atualizado_em', { ascending: false }).limit(2)
      if (data?.length === 1 || data?.find(l => l.nome.toLowerCase() === String(input.lead).toLowerCase())) { const l = data.find(x => x.nome.toLowerCase() === String(input.lead).toLowerCase()) || data[0]; lead_id = l.id; if (!input.whatsapp) input.whatsapp = l.whatsapp }
      else if (data && data.length > 1) return { erro: 'achei mais de um lead: ' + data.map(l => l.nome).join(' | ') + '. Qual?' }
    }
    const r = await criarProjeto(u.org_id, {
      cliente: String(input.cliente), produto, data_inicio: sessao.toLocaleDateString('en-CA', { timeZone: TZ }),
      whatsapp: input.whatsapp || null, lead_id, responsavel_id: u.id, sessao_em: sessao.toISOString(), local,
      mensalidade_valor: input.mensalidade_valor != null ? Number(input.mensalidade_valor) : null, observacoes: input.observacoes || null, autor: chamar(u) + ' (WhatsApp)',
    })
    if (!r.ok) return { erro: r.error }
    return { ok: true, id: r.id, cliente: r.cliente, produto: ROTEIROS[produto].nome, marcos: r.marcos, sessao: sessao.toLocaleString('pt-BR', { timeZone: TZ, weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), local: LOCAIS.find(l => l.chave === local)?.nome, lead_ligado: !!lead_id, ficha: `${origin}/dashboard/entregas/${r.id}` }
  }
  if (name === 'resumo_lead') {
    const { data } = await sb.from('leads').select('id, nome, whatsapp, etapa, origem, codigo_turma, valor_venda, negocio, maior_problema, resumo_ia, atendido_por, criado_em').eq('org_id', u.org_id).ilike('nome', '%' + input.nome + '%').order('atualizado_em', { ascending: false }).limit(3)
    if (!data?.length) return { erro: 'lead não encontrado' }
    const exato = data.find(l => l.nome.toLowerCase() === String(input.nome).toLowerCase())
    if (data.length > 1 && !exato) return { erro: 'achei mais de um: ' + data.map(l => l.nome).join(' | ') + '. Qual?' }
    const lead = exato || data[0]
    const d = await dossieLead(sb, u.org_id, { id: lead.id, whatsapp: lead.whatsapp })
    const linha = timelineDossie(d, 40).map(x => '[' + new Date(x.em).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + '] ' + (x.quem === 'cliente' ? 'LEAD' : x.quem === 'nos' ? 'NÓS' : '') + ': ' + String(x.texto).slice(0, 300))
    return { lead: { nome: lead.nome, etapa: lead.etapa, origem: lead.origem, turma: lead.codigo_turma, negocio: lead.negocio, problema: lead.maior_problema, atendido_por: lead.atendido_por, desde: lead.criado_em, resumo_anterior: lead.resumo_ia }, ultimo_contato_do_lead: d.ultimoEngajamentoEm, conversa: linha }
  }
  if (name === 'combinado_cliente') {
    const { data } = await sb.from('projetos').select('*').eq('org_id', u.org_id).ilike('cliente', '%' + input.cliente + '%').order('criado_em', { ascending: false }).limit(2)
    if (!data?.length) return { erro: 'cliente não encontrado nas entregas' }
    if (data.length > 1) return { erro: 'achei mais de um: ' + data.map(p => p.cliente).join(' | ') + '. Qual?' }
    const p = data[0]
    const [{ data: marcos }, { data: and }, { data: reg }, { data: pend }, notas] = await Promise.all([
      sb.from('projeto_marcos').select('titulo, estado, data_combinada, data_prevista, registro, local').eq('projeto_id', p.id).order('ordem'),
      sb.from('projeto_andamentos').select('tipo, observacao, autor, criado_em').eq('projeto_id', p.id).order('criado_em', { ascending: false }).limit(20),
      sb.from('projeto_registros').select('tipo, frente, titulo, descricao, data').eq('projeto_id', p.id).order('data', { ascending: false }).limit(10),
      sb.from('projeto_pendencias').select('descricao, pedido_em, entregue_em').eq('projeto_id', p.id),
      p.lead_id ? sb.from('lead_andamentos').select('tipo, observacao, criado_em').eq('lead_id', p.lead_id).order('criado_em', { ascending: false }).limit(15).then(r => r.data || []) : Promise.resolve([] as any[]),
    ])
    return {
      cliente: p.cliente, produto: ROTEIROS[p.produto as Produto]?.nome || p.produto, fase: p.fase, inicio: p.data_inicio, fim: p.data_fim,
      valores: { implantacao: p.valor_implantacao, mensalidade: p.mensalidade_valor, dia: p.mensalidade_dia, valor_cliente: p.valor_cliente, alvo_custo: p.alvo_custo_resultado },
      meta: { objetivo: p.meta_objetivo, leads: p.meta_leads, vendas: p.meta_vendas, faturamento: p.meta_faturamento }, observacoes: p.observacoes,
      encontros: (marcos || []).map((m: any) => ({ titulo: m.titulo, estado: m.estado, quando: m.data_combinada || m.data_prevista, local: m.local, registro: m.registro })),
      andamentos: (and || []).map((a: any) => ({ em: a.criado_em, tipo: a.tipo, texto: a.observacao, autor: a.autor })),
      registros: reg || [], pendencias_com_cliente: (pend || []).filter((x: any) => !x.entregue_em).map((x: any) => x.descricao),
      notas_do_lead: (notas as any[]).filter((x: any) => x.observacao).map((x: any) => ({ em: x.criado_em, texto: x.observacao })),
    }
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
3. 'criar_entrega' cadastra um cliente novo nas entregas (cria o projeto, os marcos e a sessão na agenda). Precisa de cliente, data/hora da sessão e lugar (sede ou região, Lajeado ou POA); sem isso, pergunte. Produto padrão Deu Venda. Confirme em uma linha com a data da sessão e diga que a ficha está no sistema. 'resumo_lead' traz a conversa inteira com um lead: resuma em 4 a 6 linhas (situação, o que quer, objeção, último contato, próximo passo), sem copiar a conversa. 'combinado_cliente' traz a ficha da entrega: responda o que foi combinado (valores, meta, encontros, o que falta). Tráfego dos clientes das entregas: 'trafego_clientes' (todos, resumo) e 'trafego_cliente' (um, completo). Ao resumir vários, uma linha por cliente: nome, investido, conversas, custo, melhor anúncio; depois só o que pede atenção. 'anotar_lead' grava nota no histórico de um lead. 'registrar_vendas_cliente' grava vendas/faturamento do mês de um cliente do Deu Venda ou CRM.
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
