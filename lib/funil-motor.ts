import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { plantaoLigado } from '@/lib/plantao'
import { ORG_CND } from '@/lib/org'
import { enviarTemplate, foneOficial } from '@/lib/whatsapp-oficial'
import { nomeSaudacao } from '@/lib/saudacao'
import { dossiesLote } from '@/lib/historico-lead'
import { hojeBR, isoBR } from '@/lib/periodos'

// ⚙️ MOTOR DO FUNIL NOVO (22–23/10/2026, desenho do Rick) — acompanha quem o TIME pôs em Atendimento inicial
// e não responde. Conta os dias da entrada em Atendimento inicial:
//   ~20h (antes de completar 24h) → retomada (ligação / conversa / proposta, com ou sem nome)
//   dia 3  → urgência + move pra Urgência enviada (lote_preco_ok)
//   dia 6  → move pra Lead frio (oferecer_bolsa) + despedida
//   dia 10 → Perda, motivo "Sem resposta"
// Respondeu (mensagem ou ligação atendida > 1 min) depois da entrada → para; o lead é do time.
// Só mexe no que ELE moveu: lead que o time pôs à mão em Urgência/Lead frio fica com o time.
// Interruptor próprio: webhook_logs origem 'funil-motor' {modo: desligado|simulacao|ligado, desde}. Sem linha = desligado.
// Só pega quem entrou em Atendimento inicial depois do `desde`. Roda de hora em hora (rota dos alertas), seg–sáb 9h–19h.

const MARCA = '⚙️ Funil automático'
const MOTIVO_SEM_RESPOSTA = 'f972b270-691a-4e24-bd79-3b7583970a51'
const ETAPAS = ['atendimento_inicial', 'lote_preco_ok', 'oferecer_bolsa']
const LIMITE_ENVIOS = 30
const H = 36e5

type Modo = 'desligado' | 'simulacao' | 'ligado'
type Acao = { lead: string; leadId: string; etapa: string; faz: string; template?: string; texto?: string; move?: string }

export async function configFunilMotor(): Promise<{ modo: Modo; desde: string | null }> {
  const { data } = await sb.from('webhook_logs').select('payload').eq('org_id', ORG_CND).eq('origem', 'funil-motor').order('recebido_em', { ascending: false }).limit(1).maybeSingle()
  const p = (data?.payload || {}) as any
  const modo: Modo = p.modo === 'ligado' || p.modo === 'simulacao' ? p.modo : 'desligado'
  return { modo, desde: p.desde || null }
}

// seg–sáb, das 9h às 19h59 de Brasília (a rodada das 19h ainda vale)
function noHorario(d: Date) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(d)
  const dia = p.find(x => x.type === 'weekday')?.value, h = Number(p.find(x => x.type === 'hour')?.value)
  return dia !== 'Sun' && h >= 9 && h <= 19
}
// próxima rodada (de hora em hora) que cai no horário
function proximaRodada(d: Date) {
  const t = new Date(d.getTime() + H)
  for (let i = 0; i < 80 && !noHorario(t); i++) t.setTime(t.getTime() + H)
  return t
}
// dia N contado da entrada, no calendário de Brasília (ancorado ao meio-dia)
function diaAlvo(entrada: Date, n: number) {
  const d = new Date(isoBR(entrada) + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// O passo de UM lead (sem banco — dá pra testar com casos inventados). null = nada a fazer agora.
export function decidirPasso(x: { etapa: string; entrada: Date; anterior: string | null; enviados: Set<string>; agora: Date; conversou: boolean; semNome: boolean }): { faz: string; template?: string; move?: string } | null {
  const sufixo = x.semNome ? '_sem_nome' : ''
  const hoje = isoBR(x.agora)
  if (x.etapa === 'atendimento_inicial' && ![...x.enviados].some(e => e.startsWith('cnd_funil_retomada'))) {
    // ~20h depois da entrada; se a próxima rodada no horário já passar das 24h, vai nesta
    if (+x.agora < +x.entrada + 20 * H && +proximaRodada(x.agora) <= +x.entrada + 24 * H) return null
    const tipo = x.anterior === 'ligacao_boa' ? 'proposta' : x.conversou ? 'conversa' : 'ligacao'
    return { faz: 'retomada', template: `cnd_funil_retomada_${tipo}${sufixo}` }
  }
  if (x.etapa === 'atendimento_inicial' && hoje >= diaAlvo(x.entrada, 3)) return { faz: 'urgência', template: `cnd_funil_urgencia${sufixo}`, move: 'lote_preco_ok' }
  if (x.etapa === 'lote_preco_ok' && hoje >= diaAlvo(x.entrada, 6)) return { faz: 'despedida', template: `cnd_funil_despedida${sufixo}`, move: 'oferecer_bolsa' }
  if (x.etapa === 'oferecer_bolsa' && hoje >= diaAlvo(x.entrada, 10)) return { faz: 'perda', move: 'perda' }
  return null
}

export async function rodarFunilMotor(opts: { simular?: boolean; desde?: string; ignorarHorario?: boolean } = {}) {
  const cfg = await configFunilMotor()
  const simular = opts.simular === true || cfg.modo === 'simulacao'
  if (cfg.modo === 'desligado' && !opts.simular) return { ok: true, modo: cfg.modo, pulou: 'desligado' }
  const agora = new Date()
  if (!opts.ignorarHorario && !noHorario(agora)) return { ok: true, modo: cfg.modo, pulou: 'fora do horário' }
  // a IA antiga mexe nas mesmas etapas com os textos de FC/ANL: com ela ligada, o motor novo não roda
  const { data: chave } = await sb.from('webhook_logs').select('payload').eq('org_id', ORG_CND).eq('origem', 'ia-automacao').order('recebido_em', { ascending: false }).limit(1).maybeSingle()
  if ((chave?.payload as any)?.ligado !== false) return { ok: false, modo: cfg.modo, pulou: 'IA antiga ligada (ia-automacao) — o motor novo não roda junto' }
  const desde = (opts.simular && opts.desde) || cfg.desde
  if (!desde) return { ok: false, modo: cfg.modo, pulou: 'sem data de início (desde)' }
  const desdeMs = +new Date(desde)
  const hoje = hojeBR()

  const { data: tpls } = await sb.from('followup_templates').select('nome_meta, corpo, variaveis').eq('org_id', ORG_CND).eq('ativo', true).eq('status', 'aprovado').like('nome_meta', 'cnd_funil_%')
  const tpl = new Map((tpls || []).map((t: any) => [t.nome_meta, t]))

  const leads: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('leads').select('id, nome, whatsapp, etapa, vendedor_id').eq('org_id', ORG_CND).in('etapa', ETAPAS).range(from, from + 999)
    if (!data?.length) break
    leads.push(...data)
    if (data.length < 1000) break
  }
  const alcancavel = (w: string) => { const s = String(w || ''); if (/@lid|@g\.us|@broadcast|@s\.whatsapp/i.test(s)) return false; const d = s.replace(/\D/g, ''); return d.length >= 10 && d.length <= 13 }
  const { data: optRows } = await sb.from('wa_optout').select('telefone')
  const optout = new Set((optRows || []).map((o: any) => String(o.telefone).replace(/\D/g, '').slice(-8)))
  const vivos = leads.filter(l => alcancavel(l.whatsapp) && !optout.has(String(l.whatsapp).replace(/\D/g, '').slice(-8)))

  // andamentos dos candidatos (paginado: o banco corta em 1000)
  const ands = new Map<string, any[]>()
  const ids = vivos.map(l => l.id)
  for (let i = 0; i < ids.length; i += 100) {
    for (let from = 0; ; from += 1000) {
      const { data } = await sb.from('lead_andamentos').select('lead_id, tipo, etapa_anterior, etapa_nova, observacao, criado_em').in('lead_id', ids.slice(i, i + 100)).order('criado_em', { ascending: true }).range(from, from + 999)
      if (!data?.length) break
      for (const a of data) { const arr = ands.get(a.lead_id) || []; arr.push(a); ands.set(a.lead_id, arr) }
      if (data.length < 1000) break
    }
  }
  // ligação agendada pendente = o time vai ligar; o motor não manda nada por cima
  const agendados = new Set<string>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await sb.from('tarefas_lead').select('lead_id').in('lead_id', ids.slice(i, i + 200)).eq('tipo', 'ligar_agendado').eq('concluida', false).eq('cancelada', false)
    for (const t of data || []) agendados.add(t.lead_id)
  }

  // quem entrou em Atendimento inicial pela mão do time depois do `desde`, e cuja etapa atual foi o motor que pôs
  const candidatos: { l: any; entrada: Date; anterior: string | null; enviados: Set<string>; tocadoHoje: boolean }[] = []
  for (const l of vivos) {
    const as = ands.get(l.id) || []
    const mudancas = as.filter(a => a.tipo === 'mudanca_etapa')
    let ent: any = null
    for (const a of mudancas) if (a.etapa_nova === 'atendimento_inicial' && !(a.observacao || '').startsWith(MARCA)) ent = a
    if (!ent || +new Date(ent.criado_em) < desdeMs) continue
    const ultima = mudancas[mudancas.length - 1]
    if (l.etapa !== 'atendimento_inicial' && !(ultima?.etapa_nova === l.etapa && (ultima.observacao || '').startsWith(MARCA))) continue
    const meus = as.filter(a => a.tipo === 'ia_followup' && (a.observacao || '').startsWith(MARCA) && a.criado_em >= ent.criado_em)
    const enviados = new Set<string>()
    for (const a of meus) { const m = (a.observacao || '').match(/cnd_funil_[a-z0-9_]+/); if (m) enviados.add(m[0].replace(/_sem_nome(_v2)?$/, '')) }
    candidatos.push({ l, entrada: new Date(ent.criado_em), anterior: ent.etapa_anterior || null, enviados, tocadoHoje: meus.some(a => isoBR(new Date(a.criado_em)) === hoje) })
  }
  const dossies = await dossiesLote(sb, ORG_CND, candidatos.map(c => c.l))

  const acoes: Acao[] = []
  const pulados: { lead: string; motivo: string }[] = []
  for (const c of candidatos) {
    const { l, entrada } = c
    const d = dossies.get(l.id)
    const respondeu = (!!d?.ultimoInboundEm && +new Date(d.ultimoInboundEm) > +entrada) || (d?.ligacoes || []).some(g => g.atendida && +new Date(g.em) > +entrada)
    if (respondeu) { pulados.push({ lead: l.nome, motivo: 'respondeu — é do time' }); continue }
    if (agendados.has(l.id)) { pulados.push({ lead: l.nome, motivo: 'tem ligação agendada' }); continue }
    if (c.tocadoHoje) continue
    // "conversou" = atendeu ligação (> 1 min) ou respondeu a alguma mensagem NOSSA. A 1ª mensagem de quem vem
    // do anúncio de WhatsApp é automática e não conta.
    const primeiraNossa = (d?.mensagens || []).find(m => m.quem === 'nos')?.em
    const conversou = !!d?.temLigacaoAtendida || (!!primeiraNossa && (d?.mensagens || []).some(m => m.quem === 'cliente' && m.em > primeiraNossa))
    const passo = decidirPasso({ etapa: l.etapa, entrada, anterior: c.anterior, enviados: c.enviados, agora, conversou, semNome: nomeSaudacao(l.nome) === 'tudo bem' })
    if (passo) acoes.push({ lead: l.nome, leadId: l.id, etapa: l.etapa, ...passo })
  }

  let enviados = 0, movidos = 0, falhas = 0, falhasSeguidas = 0
  const feito: Acao[] = []
  // PLANTÃO DA IA LIGADO = NINGUÉM VIRA PERDA (27/10/2026, Nando): com o time viajando, a perda do dia 10
  // fica pra depois. O lead segue em "Lead frio" e, quando o plantão desliga, a próxima rodada faz a perda.
  const semPerda = await plantaoLigado()
  for (const a of acoes) {
    if (a.move === 'perda' && semPerda) { pulados.push({ lead: a.lead, motivo: 'perda segurada: plantão da IA ligado' }); continue }
    const l = candidatos.find(c => c.l.id === a.leadId)!.l
    const t = a.template ? tpl.get(a.template) : null
    if (a.template && !t) { pulados.push({ lead: a.lead, motivo: `modelo ${a.template} não aprovado/ativo` }); continue }
    if (t) a.texto = String(t.corpo || '').replace(/\{\{nome\}\}/g, nomeSaudacao(l.nome))
    if (simular) { feito.push(a); continue }
    if (t && enviados >= LIMITE_ENVIOS) break

    if (t) {
      const to = foneOficial(l.whatsapp || '')
      const vars = String(t.variaveis || '').split(',').map((s: string) => s.trim()).filter(Boolean)
      const params = vars.map((k: string) => ({ type: 'text', text: k === 'nome' ? nomeSaudacao(l.nome) : k }))
      const r = await enviarTemplate(to, t.nome_meta, 'pt_BR', params.length ? [{ type: 'body', parameters: params }] : undefined)
      if (!r.ok) {
        falhas++; falhasSeguidas++; pulados.push({ lead: a.lead, motivo: `falhou o envio: ${r.error}` })
        if (falhasSeguidas >= 5) break
        continue
      }
      falhasSeguidas = 0; enviados++
      let conv: any = (await sb.from('wa_conversas').select('id').eq('org_id', ORG_CND).eq('lead_id', l.id).eq('canal', 'oficial').limit(1).maybeSingle()).data
      if (!conv) conv = (await sb.from('wa_conversas').insert({ org_id: ORG_CND, telefone: to, nome: l.nome, lead_id: l.id, canal: 'oficial' }).select('id').single()).data
      if (conv) {
        await sb.from('wa_mensagens').insert({ org_id: ORG_CND, conversa_id: conv.id, zapi_id: r.wamid || null, direcao: 'enviada', tipo: 'texto', texto: a.texto, status: 'enviada', canal: 'oficial' })
        await sb.from('wa_conversas').update({ ultima_msg: (a.texto || '').slice(0, 200), ultima_msg_em: new Date().toISOString() }).eq('id', conv.id)
      }
      // tipo ia_followup: conta como automático no dossiê (não vira "nota humana")
      await sb.from('lead_andamentos').insert({ lead_id: l.id, vendedor_id: l.vendedor_id, tipo: 'ia_followup', observacao: `${MARCA} — ${a.faz} enviada: ${t.nome_meta}` })
    }
    if (a.move) {
      const ag = new Date().toISOString()
      const upd: any = { etapa: a.move, atualizado_em: ag }
      if (a.move === 'perda') { upd.data_perda = ag; upd.motivo_perda_id = MOTIVO_SEM_RESPOSTA }
      await sb.from('leads').update(upd).eq('id', l.id).eq('etapa', l.etapa)
      const nomeEtapa = a.move === 'lote_preco_ok' ? 'Urgência enviada' : a.move === 'oferecer_bolsa' ? 'Lead frio' : 'Perda (sem resposta)'
      await sb.from('lead_andamentos').insert({ lead_id: l.id, vendedor_id: l.vendedor_id, tipo: 'mudanca_etapa', etapa_anterior: l.etapa, etapa_nova: a.move, observacao: `${MARCA} — sem resposta, movido para ${nomeEtapa}` })
      // na Perda, fecha as tarefas abertas (a ligação agendada fica, como na tela)
      if (a.move === 'perda') await sb.from('tarefas_lead').update({ cancelada: true, cancelada_em: ag, atualizado_em: ag }).eq('lead_id', l.id).eq('concluida', false).eq('cancelada', false).neq('tipo', 'ligar_agendado')
      movidos++
    }
    feito.push(a)
  }

  const res = { ok: true, modo: simular ? 'simulacao' : cfg.modo, candidatos: candidatos.length, acoes: feito, pulados, enviados, movidos, falhas }
  // simulação do cron: guarda o que faria, pra conferir depois
  if (simular && !opts.simular && feito.length) await sb.from('webhook_logs').insert({ org_id: ORG_CND, origem: 'funil-motor-sim', evento: 'simulacao', status: 'processado', payload: { acoes: feito, pulados } })
  return res
}
