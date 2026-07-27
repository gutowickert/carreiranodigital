import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { enviarTemplate, foneOficial } from '@/lib/whatsapp-oficial'
import { nomeSaudacao, datasCurtas } from '@/lib/saudacao'
import { dossiesLote } from '@/lib/historico-lead'
import { interpretarFollowup } from '@/lib/interpretar-followup'

export const maxDuration = 60

// 🤝 IA ASSUME OS FRIOS DO TIME — leads em agendado / aguardando_pagamento / proxima_turma com TAREFA VENCIDA
// (a data combinada JÁ PASSOU) e que sumiram. A IA lê a conversa (avaliação completa) e, se ainda faz sentido,
// manda o reabridor da etapa (cnd_mudanca_*, SEM preço, sem pressão) pra reabrir a conversa. O cliente responde → time.
// Respeita a data pedida (só pega tarefa VENCIDA). Pula: respondeu <24h, já resolveu (ganho/perda), voltou pro funil,
// já recebeu o reabridor. dryRun (padrão) simula. Enviar: { dryRun:false, confirm:true }.
const TPL_ETAPA: Record<string, string> = { agendado: 'cnd_mudanca_agendado', aguardando_pagamento: 'cnd_mudanca_pagamento', proxima_turma: 'cnd_mudanca_proxima' }
const TIME = Object.keys(TPL_ETAPA)
const RESOLVIDO = new Set(['ganho', 'perda', 'atendimento_inicial', 'lote_preco_ok', 'oferecer_bolsa'])
const cursoDe = (c: string | null, fam: string) => { const x = (c || '').toLowerCase(); if (x.startsWith('fc') || fam === 'FC') return 'Formação Completa em Marketing Digital'; if (x.startsWith('anl') || fam === 'ANL') return 'Anúncios para Negócios Locais'; return 'nossos cursos' }
const familia = (c: string | null) => { const x = (c || '').toLowerCase(); return x.startsWith('fc') ? 'FC' : x.startsWith('anl') ? 'ANL' : '' }
function datasDaTurma(ini: string | null, fim: string | null): string {
  if (!ini) return ''
  const a = new Date(ini + 'T12:00:00Z'), b = fim ? new Date(fim + 'T12:00:00Z') : a
  const arr: string[] = []
  for (const d = new Date(a); d <= b && arr.length < 10; d.setUTCDate(d.getUTCDate() + 1)) arr.push(`${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  return datasCurtas(arr)
}

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({} as any))
    const dryRun = b?.dryRun !== false
    const confirm = b?.confirm === true
    const limit = Math.min(Math.max(Number(b?.limit) || 8, 1), 12) // leitura LLM por lead — lotes pequenos
    if (!dryRun && !confirm) return NextResponse.json({ ok: false, error: 'pra enviar: dryRun=false E confirm=true' }, { status: 200 })

    const now = Date.now()
    const hojeBR = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    const alcancavel = (w: string) => { const s = String(w || ''); if (/@lid|@g\.us|@broadcast|@s\.whatsapp/i.test(s)) return false; const d = s.replace(/\D/g, ''); return d.length >= 10 && d.length <= 13 }

    // templates reabridores
    const { data: tpls } = await sb.from('followup_templates').select('nome_meta, corpo, variaveis').in('nome_meta', Object.values(TPL_ETAPA)).eq('org_id', org)
    const tplPorNome = new Map((tpls || []).map((t: any) => [t.nome_meta, t]))

    // tarefas VENCIDAS abertas → leads
    const { data: tks } = await sb.from('tarefas_lead').select('id, lead_id').eq('org_id', org).eq('concluida', false).eq('cancelada', false).lt('data_vencimento', new Date().toISOString()).limit(1000)
    const tarefasDe = new Map<string, string[]>()
    for (const t of tks || []) { const a = tarefasDe.get(t.lead_id) || []; a.push(t.id); tarefasDe.set(t.lead_id, a) }
    const idsComTarefa = [...tarefasDe.keys()]
    if (!idsComTarefa.length) return NextResponse.json({ ok: true, dryRun, alvo: 0, nada: true })

    const { data: leadsAll } = await sb.from('leads').select('id, nome, whatsapp, etapa, codigo_turma, turma_id, vendedor_id, resumo_ia, resumo_ia_em').in('id', idsComTarefa)
    const leads = (leadsAll || []).filter(l => TIME.includes(l.etapa) && alcancavel(l.whatsapp))
    const dossies = await dossiesLote(sb, org, leads)

    // turma (cidade, codigo, preço, datas) + vendedor
    const turmaIds = [...new Set(leads.map(l => l.turma_id).filter(Boolean))] as string[]
    const turmaInfo = new Map<string, any>()
    if (turmaIds.length) { const { data: tt } = await sb.from('turmas').select('id, codigo, data_inicio, data_fim, cidades(nome)').in('id', turmaIds); for (const t of (tt || []) as any[]) turmaInfo.set(t.id, { cidade: t.cidades?.nome || '', codigo: t.codigo || '', datas: datasDaTurma(t.data_inicio, t.data_fim) }) }
    const vendIds = [...new Set(leads.map(l => l.vendedor_id).filter(Boolean))] as string[]
    const vendNome = new Map<string, string>()
    if (vendIds.length) { const { data: us } = await sb.from('usuarios_perfil').select('id, nome').in('id', vendIds); for (const u of us || []) vendNome.set(u.id, (u.nome || '').split(' ')[0] || 'Mateus') }

    // dedup: quem já recebeu o reabridor de mudança
    const jaReabriu = new Set<string>()
    for (let i = 0; i < leads.length; i += 100) {
      const chunk = leads.slice(i, i + 100).map(l => l.id)
      const ands: any[] = []
      for (let from = 0; ; from += 1000) { const { data } = await sb.from('lead_andamentos').select('lead_id, observacao').in('lead_id', chunk).range(from, from + 999); if (!data?.length) break; ands.push(...data); if (data.length < 1000) break }
      for (const a of ands) if (/cnd_mudanca_(agendado|pagamento|proxima)/i.test(a.observacao || '')) jaReabriu.add(a.lead_id)
    }

    const resumoStale = (l: any) => { const em = l.resumo_ia_em, ult = dossies.get(l.id)?.ultimoContatoEm; return !l.resumo_ia?.etapaReal || !em || (ult && em < ult) }
    let budget = limit, adiados = 0
    const previews: any[] = []
    let enviados = 0, pulados = 0, falhas = 0, falhasSeguidas = 0

    for (const l of leads) {
      const d = dossies.get(l.id)!
      if (jaReabriu.has(l.id)) { pulados++; previews.push({ lead: l.nome, pulado: 'já recebeu o reabridor' }); continue }
      const eng = d.ultimoEngajamentoEm
      if (eng && new Date(eng).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) === hojeBR) { pulados++; previews.push({ lead: l.nome, pulado: 'respondeu hoje — é do time' }); continue }

      const precisaReler = resumoStale(l)
      if (precisaReler && budget <= 0) { adiados++; previews.push({ lead: l.nome, pulado: 'aguardando leitura (próxima rodada)' }); continue }
      const interp = await interpretarFollowup(sb, org, d, l, precisaReler)
      if (precisaReler) budget--
      const et = interp?.etapa
      if (et && RESOLVIDO.has(et)) { pulados++; previews.push({ lead: l.nome, avaliacao: et, pulado: `avaliação: ${et} (resolvido/voltou pro funil)` }); continue }
      // a etapa do TEMPLATE = a etapa gravada do time (agendado/pagamento/proxima). (a interpretação já confirmou que
      // não saiu do estado; se ela apontar outro estado do time, mantemos o template da etapa atual do lead.)
      const tplNome = TPL_ETAPA[l.etapa]
      const tpl: any = tplPorNome.get(tplNome)
      if (!tpl) { pulados++; previews.push({ lead: l.nome, pulado: `sem template ${tplNome}` }); continue }

      const ti = turmaInfo.get(l.turma_id || '')
      const fam = familia(l.codigo_turma) || familia(ti?.codigo || null)
      const valores: Record<string, string> = {
        nome: nomeSaudacao(l.nome), vendedor: (l.vendedor_id && vendNome.get(l.vendedor_id)) || 'Mateus',
        curso: cursoDe(l.codigo_turma, fam), cidade: ti?.cidade || 'sua região', datas: ti?.datas || '',
      }
      const ordem = (tpl.variaveis || '').split(',').map((s: string) => s.trim()).filter(Boolean)
      const textoRender = (tpl.corpo || '').replace(/\{\{(\w+)\}\}/g, (_m: string, k: string) => valores[k] ?? `{{${k}}}`)
      // ⛔ blindagem: variável não resolvida (ex.: proxima_turma sem datas) → não manda
      if (/\{\{\w+\}\}/.test(textoRender)) { pulados++; previews.push({ lead: l.nome, pulado: 'variável não resolvida (ex.: sem datas da turma)' }); continue }
      const to = foneOficial(l.whatsapp || '')
      if (!to) { falhas++; continue }

      if (dryRun) { previews.push({ lead: l.nome, etapa: l.etapa, avaliacao: et, template: tplNome, texto: textoRender }); continue }

      const parametros = ordem.map((k: string) => ({ type: 'text', text: valores[k] ?? k }))
      const r = await enviarTemplate(to, tplNome, 'pt_BR', parametros.length ? [{ type: 'body', parameters: parametros }] : undefined)
      if (!r.ok) { falhas++; falhasSeguidas++; previews.push({ lead: l.nome, erro: r.error }); if (enviados === 0 && falhasSeguidas >= 5) return NextResponse.json({ ok: false, abortado: true, error: 'Abortado: 5 falhas seguidas.', falhas: previews }, { status: 200 }); continue }
      falhasSeguidas = 0; enviados++
      await sb.from('leads').update({ atendido_por: 'ia', atualizado_em: new Date().toISOString() }).eq('id', l.id)
      // a IA fez o follow-up → encerra a tarefa vencida do time (some das atrasadas)
      const tks2 = tarefasDe.get(l.id) || []
      if (tks2.length) await sb.from('tarefas_lead').update({ cancelada: true, cancelada_em: new Date().toISOString() }).in('id', tks2)
      let conv: any = (await sb.from('wa_conversas').select('id').eq('org_id', org).eq('lead_id', l.id).eq('canal', 'oficial').limit(1).maybeSingle()).data
      if (!conv) { const c = await sb.from('wa_conversas').insert({ org_id: org, telefone: to, nome: l.nome, lead_id: l.id, canal: 'oficial' }).select('id').single(); conv = c.data }
      if (conv) { await sb.from('wa_mensagens').insert({ org_id: org, conversa_id: conv.id, zapi_id: r.wamid || null, direcao: 'enviada', tipo: 'texto', texto: textoRender, status: 'enviada', canal: 'oficial' }); await sb.from('wa_conversas').update({ ultima_msg: textoRender.slice(0, 200), ultima_msg_em: new Date().toISOString() }).eq('id', conv.id) }
      await sb.from('lead_andamentos').insert({ lead_id: l.id, tipo: 'ia_followup', observacao: `🤝 IA retomou (frio do time — ${l.etapa}): ${tplNome}` })
    }

    return NextResponse.json({
      ok: true, dryRun, alvo: leads.length, restantes: adiados,
      enviados: dryRun ? previews.filter(p => p.texto).length : enviados, pulados, falhas,
      amostra: dryRun ? previews.filter(p => p.texto).slice(0, 15) : undefined,
      pulos: dryRun ? previews.filter(p => p.pulado).slice(0, 15) : undefined,
      erros: !dryRun ? previews.filter(p => p.erro) : undefined,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
