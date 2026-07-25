import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { enviarTemplate, foneOficial } from '@/lib/whatsapp-oficial'
import { nomeSaudacao } from '@/lib/saudacao'
import { getFluxo } from '@/lib/fluxo'
import { dossiesLote } from '@/lib/historico-lead'

export const maxDuration = 60

// MOTOR DA ESTEIRA IA — follow-up 100% automático dos leads FRIOS (nunca responderam), SEGUINDO O FLUXO
// definido no sistema (getFluxo): o toque de cada etapa dispara no DIA que o fluxo manda (o `dias`),
// com o TEMPLATE amarrado por etapa+chave (FC/ANL pelo curso). Assinado Mateus.
// Esgotou os toques da etapa → avança pra próxima (atendimento→lote→bolsa). Toque 'demissao' → PERDA.
// Marca atendido_por='ia' (aparece na Qualidade IA). Lead responde → webhook devolve pro humano.
// dryRun (padrão) só simula. Enviar: { dryRun:false, confirm:true }. Kill switch: ia-automacao {ligado:false}.

const ETAPAS = ['atendimento_inicial', 'lote_preco_ok', 'oferecer_bolsa']
const PROX_ETAPA: Record<string, string | null> = { atendimento_inicial: 'lote_preco_ok', lote_preco_ok: 'oferecer_bolsa', oferecer_bolsa: null }
const VENDEDOR = 'Mateus'
const MOTIVO_SEM_RESPOSTA = 'f972b270-691a-4e24-bd79-3b7583970a51'
const familia = (c: string | null) => { const x = (c || '').toLowerCase(); return x.startsWith('fc') ? 'FC' : x.startsWith('anl') ? 'ANL' : '' }
const cursoNome = (fam: string) => fam === 'FC' ? 'Formação Completa em Marketing Digital' : fam === 'ANL' ? 'Anúncios para Negócios Locais' : 'nossos cursos'
const DIA = 864e5

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({} as any))
    const dryRun = b?.dryRun !== false
    const confirm = b?.confirm === true
    const limit = Math.min(Math.max(Number(b?.limit) || 20, 1), 60)
    if (!dryRun && !confirm) return NextResponse.json({ ok: false, error: 'pra enviar: dryRun=false E confirm=true' }, { status: 200 })

    // KILL SWITCH
    const { data: cfg } = await sb.from('webhook_logs').select('payload').eq('org_id', org).eq('origem', 'ia-automacao').order('recebido_em', { ascending: false }).limit(1).maybeSingle()
    if ((cfg?.payload as any)?.ligado === false && !dryRun) return NextResponse.json({ ok: false, killed: true, error: 'Automação DESLIGADA (kill switch).' }, { status: 200 })

    const fluxo = await getFluxo()
    const now = Date.now()
    const hojeBR = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

    // templates por etapa+chave (FC/ANL pelo nome)
    const { data: tpls } = await sb.from('followup_templates').select('etapa, chave, nome_meta, corpo, variaveis').eq('org_id', org).eq('ativo', true)
    const tplMap: Record<string, any[]> = {}
    for (const t of tpls || []) { if (!t.etapa || !t.chave) continue; const k = `${t.etapa}|${t.chave}`; (tplMap[k] = tplMap[k] || []).push(t) }
    const pickTpl = (etapa: string, chave: string, fam: string) => {
      const arr = tplMap[`${etapa}|${chave}`] || []
      if (!arr.length) return null
      const byFam = arr.find(t => fam === 'FC' ? /_fc$/i.test(t.nome_meta) : fam === 'ANL' ? /_anl$/i.test(t.nome_meta) : false)
      return byFam || arr.find(t => !/_(fc|anl)$/i.test(t.nome_meta)) || arr[0]
    }

    // leads das 3 etapas + conversas escopadas
    const { data: leadsRaw } = await sb.from('leads').select('id, nome, whatsapp, etapa, codigo_turma, turma_id, criado_em, atendido_por').eq('org_id', org).in('etapa', ETAPAS).limit(5000)
    // exclui inalcançáveis: @lid/@g.us/@broadcast (identificador interno, sem número real) ou dígitos demais (LID)
    const alcancavel = (w: string) => { const s = String(w || ''); if (/@lid|@g\.us|@broadcast|@s\.whatsapp/i.test(s)) return false; const d = s.replace(/\D/g, ''); return d.length >= 10 && d.length <= 13 }
    const leads = (leadsRaw || []).filter(l => alcancavel(l.whatsapp))

    // DOSSIÊ ÚNICO (fonte de verdade): mensagens dos 2 canais (zapi+oficial, inclusive conversas só por telefone
    // que a busca por lead_id perdia) + ligações + TODOS os andamentos. Mesma lib da tela e do copiloto.
    const dossies = await dossiesLote(sb, org, leads)
    // Esteira IA = frio de verdade (nunca respondeu, sem nota humana) OU já é da IA (re-inscrito pelo reconciliador).
    // Engajado sem ser da IA → é do time.
    const frios = (leads || []).filter(l => (l as any).atendido_por === 'ia' || !dossies.get(l.id)?.engajado)
    const lastOutDe = (l: any) => { const e = dossies.get(l.id)?.ultimoOutboundEm; return e ? +new Date(e) : 0 }

    // entrada na etapa atual + toques da IA já dados NESSA etapa
    const ids = frios.map(l => l.id)
    const entradaEtapa: Record<string, number> = {}
    const toquesIA: Record<string, { n: number; ultimo: number }> = {}
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200)
      const { data: ands } = await sb.from('lead_andamentos').select('lead_id, tipo, etapa_nova, criado_em').in('lead_id', chunk).order('criado_em', { ascending: true })
      const byLead: Record<string, any[]> = {}
      for (const a of ands || []) (byLead[a.lead_id] = byLead[a.lead_id] || []).push(a)
      for (const l of frios) {
        if (!chunk.includes(l.id)) continue
        const as = byLead[l.id] || []
        let ent = l.criado_em ? +new Date(l.criado_em) : 0
        for (const a of as) if (a.tipo === 'mudanca_etapa' && a.etapa_nova === l.etapa) ent = +new Date(a.criado_em)
        entradaEtapa[l.id] = ent
        const toques = as.filter(a => a.tipo === 'ia_followup' && +new Date(a.criado_em) >= ent)
        toquesIA[l.id] = { n: toques.length, ultimo: toques.length ? +new Date(toques[toques.length - 1].criado_em) : 0 }
      }
    }

    // decide, por lead: qual a ação (enviar toque X / avançar etapa / esperar / nada)
    type Plano = { lead: any; acao: 'enviar' | 'avancar'; chave?: string; tpl?: any; demite?: boolean; proxEtapa?: string }
    const planos: Plano[] = []
    for (const l of frios) {
      const cad = (fluxo.cadencia[l.etapa] || [])
      const o = toquesIA[l.id] || { n: 0, ultimo: 0 }
      if (o.n >= cad.length) {
        // esgotou a etapa → avança pra próxima (a próxima rodada toca a nova etapa)
        const prox = PROX_ETAPA[l.etapa]
        if (prox) planos.push({ lead: l, acao: 'avancar', proxEtapa: prox })
        continue
      }
      const toque = cad[o.n]
      const ref = o.n > 0 ? o.ultimo : (entradaEtapa[l.id] || 0)
      const due = now - ref >= (toque.dias || 0) * DIA
      const jaHoje = lastOutDe(l) && new Date(lastOutDe(l)).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) === hojeBR
      if (!due || jaHoje) continue // segue o fluxo (dias) + não manda 2x no mesmo dia
      const fam = familia(l.codigo_turma)
      const tpl = pickTpl(l.etapa, toque.chave, fam)
      if (!tpl) continue // sem template mapeado pra esse toque
      // TRAVA: lead ENGAJADO (já respondeu/atendeu ligação) NUNCA recebe reabridor/apresentação frios
      // ("me conta qual é teu negócio" pra quem já conversou). Só toques que não assumem 1º contato (lote/bolsa).
      if (dossies.get(l.id)?.engajado && /retomar|apresentacao/i.test(tpl.nome_meta)) continue
      planos.push({ lead: l, acao: 'enviar', chave: toque.chave, tpl, demite: /demiss|encerr/i.test(toque.chave) })
    }

    const lote = planos.slice(0, limit)
    // turma (cidade + preço) por lead + prazo do lote (hoje+3, fim de semana → segunda)
    const turmaIds = [...new Set(lote.map(p => p.lead.turma_id).filter(Boolean))] as string[]
    const turmaInfo = new Map<string, { cidade: string; preco: number }>()
    if (turmaIds.length) { const { data: tt } = await sb.from('turmas').select('id, preco_venda, cidades(nome)').in('id', turmaIds); for (const t of (tt || []) as any[]) turmaInfo.set(t.id, { cidade: t.cidades?.nome || '', preco: t.preco_venda || 0 }) }
    const _pl = new Date(hojeBR + 'T15:00:00Z'); _pl.setUTCDate(_pl.getUTCDate() + 3); while (_pl.getUTCDay() === 0 || _pl.getUTCDay() === 6) _pl.setUTCDate(_pl.getUTCDate() + 1)
    const prazoLote = `${_pl.toISOString().slice(8, 10)}/${_pl.toISOString().slice(5, 7)}`
    const money = (n: number) => 'R$' + n.toFixed(2).replace('.', ',').replace(/,00$/, '')
    const previews: any[] = []
    let enviados = 0, avancados = 0, demitidos = 0, falhas = 0, falhasSeguidas = 0

    for (const p of lote) {
      const l = p.lead
      if (p.acao === 'avancar') {
        if (!dryRun) { const ag = new Date().toISOString(); await sb.from('leads').update({ etapa: p.proxEtapa, atualizado_em: ag }).eq('id', l.id); await sb.from('lead_andamentos').insert({ lead_id: l.id, tipo: 'mudanca_etapa', etapa_anterior: l.etapa, etapa_nova: p.proxEtapa, observacao: `🤖 IA — cadência de ${l.etapa} esgotada sem resposta → avança pra ${p.proxEtapa}.` }) }
        avancados++; previews.push({ lead: l.nome, acao: `avança ${l.etapa} → ${p.proxEtapa}` }); continue
      }
      const fam = familia(l.codigo_turma)
      const ti = turmaInfo.get(l.turma_id || '')
      // preço FIXO por produto (FC sempre 2397 pix / 2697 cartão 10x; ANL 797 pix) — cravado no corpo dos templates
      const precoPix = fam === 'ANL' ? 797 : fam === 'FC' ? 2397 : 0
      const valores: Record<string, string> = {
        nome: nomeSaudacao(l.nome), vendedor: VENDEDOR, curso: cursoNome(fam),
        cidade: ti?.cidade || 'sua região',
        preco_pix: money(precoPix), preco: money(precoPix),
        preco_cartao: fam === 'FC' ? 'R$2697 no cartão em até 10x' : '',
        condicao_bolsa: `${money(precoPix * 0.9)} no Pix (10% de desconto)`, prazo: prazoLote,
      }
      const ordem = (p.tpl.variaveis || '').split(',').map((s: string) => s.trim()).filter(Boolean)
      const textoRender = (p.tpl.corpo || '').replace(/\{\{(\w+)\}\}/g, (_m: string, k: string) => valores[k] ?? `{{${k}}}`)
      const to = foneOficial(l.whatsapp || '')
      if (!to) { falhas++; continue }

      if (dryRun) { previews.push({ lead: l.nome, etapa: l.etapa, toque: p.chave, template: p.tpl.nome_meta, demite: p.demite, texto: textoRender }); continue }

      const parametros = ordem.map((k: string) => ({ type: 'text', text: valores[k] ?? k }))
      const r = await enviarTemplate(to, p.tpl.nome_meta, 'pt_BR', parametros.length ? [{ type: 'body', parameters: parametros }] : undefined)
      if (!r.ok) { falhas++; falhasSeguidas++; previews.push({ lead: l.nome, erro: r.error }); if (enviados === 0 && falhasSeguidas >= 5) return NextResponse.json({ ok: false, abortado: true, error: 'Abortado: 5 falhas seguidas.', falhas: previews }, { status: 200 }); continue }
      falhasSeguidas = 0; enviados++

      await sb.from('leads').update({ atendido_por: 'ia', atualizado_em: new Date().toISOString() }).eq('id', l.id)
      // frio é da IA → cancela tarefas do time (a IA gerencia; volta pro time quando responder)
      await sb.from('tarefas_lead').update({ cancelada: true, cancelada_em: new Date().toISOString() }).eq('lead_id', l.id).eq('concluida', false).eq('cancelada', false)
      let conv: any = (await sb.from('wa_conversas').select('id').eq('org_id', org).eq('lead_id', l.id).eq('canal', 'oficial').limit(1).maybeSingle()).data
      if (!conv) { const c = await sb.from('wa_conversas').insert({ org_id: org, telefone: to, nome: l.nome, lead_id: l.id, canal: 'oficial' }).select('id').single(); conv = c.data }
      if (conv) { await sb.from('wa_mensagens').insert({ org_id: org, conversa_id: conv.id, zapi_id: r.wamid || null, direcao: 'enviada', tipo: 'texto', texto: textoRender, status: 'enviada', canal: 'oficial' }); await sb.from('wa_conversas').update({ ultima_msg: textoRender.slice(0, 200), ultima_msg_em: new Date().toISOString() }).eq('id', conv.id) }
      await sb.from('lead_andamentos').insert({ lead_id: l.id, tipo: 'ia_followup', observacao: `🤖 IA (fluxo) — ${l.etapa}/${p.chave}: ${p.tpl.nome_meta}` })

      if (p.demite) {
        await sb.from('leads').update({ etapa: 'perda', data_perda: new Date().toISOString(), motivo_perda_id: MOTIVO_SEM_RESPOSTA, atualizado_em: new Date().toISOString() }).eq('id', l.id)
        await sb.from('lead_andamentos').insert({ lead_id: l.id, tipo: 'mudanca_etapa', etapa_nova: 'perda', observacao: '🤖 IA — encerramento (demissão) enviado → perda.' })
        demitidos++
      }
    }

    return NextResponse.json({
      ok: true, dryRun, frios: frios.length, planejados: planos.length, processados: lote.length,
      enviados, avancados, demitidos, falhas,
      amostra: dryRun ? previews.slice(0, 10) : undefined, erros: !dryRun && previews.filter((p: any) => p.erro).length ? previews.filter((p: any) => p.erro) : undefined,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
