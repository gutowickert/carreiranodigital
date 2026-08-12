import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { enviarTemplate, foneOficial } from '@/lib/whatsapp-oficial'
import { nomeSaudacao } from '@/lib/saudacao'
import { getFluxo } from '@/lib/fluxo'
import { dossiesLote } from '@/lib/historico-lead'
import { interpretarFollowup } from '@/lib/interpretar-followup'
import { loteVigente, diasAteVirada, type Lote } from '@/lib/lote'

export const maxDuration = 60

// MOTOR DA ESTEIRA IA — follow-up 100% automático dos leads FRIOS (nunca responderam), SEGUINDO O FLUXO
// definido no sistema (getFluxo): o toque de cada etapa dispara no DIA que o fluxo manda (o `dias`),
// com o TEMPLATE amarrado por etapa+chave (FC/ANL pelo curso). Assinado Mateus.
// Esgotou os toques da etapa → avança pra próxima (atendimento→lote→bolsa). Toque 'demissao' → PERDA.
// Marca atendido_por='ia' (aparece na Qualidade IA). Lead responde → webhook devolve pro humano.
// dryRun (padrão) só simula. Enviar: { dryRun:false, confirm:true }. Kill switch: ia-automacao {ligado:false}.

const ETAPAS = ['atendimento_inicial', 'lote_preco_ok', 'oferecer_bolsa']
const PROX_ETAPA: Record<string, string | null> = { atendimento_inicial: 'lote_preco_ok', lote_preco_ok: 'oferecer_bolsa', oferecer_bolsa: null }
// etapas válidas pra onde a interpretação pode MOVER um lead com a cadência esgotada (evita avanço cego/ping-pong)
const MOVE_VALIDO = new Set(['lote_preco_ok', 'oferecer_bolsa', 'agendado', 'aguardando_pagamento', 'proxima_turma', 'perda'])
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
    // no dryRun deixa ver TUDO (análise); no envio real, teto de 60 por rodada (segurança)
    const limit = Math.min(Math.max(Number(b?.limit) || 20, 1), dryRun ? 400 : 60)
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
    // 🆕 REPOSIÇÃO DE LOTE — templates buscados DIRETO por nome (fora da cadência normal por etapa/chave).
    // SÓ 'aprovado': enquanto a Meta não aprovar, o toque de reposição não dispara (não tenta enviar template pendente).
    const { data: tplsRepo } = await sb.from('followup_templates').select('nome_meta, corpo, variaveis').eq('org_id', org).eq('ativo', true).eq('status', 'aprovado').in('nome_meta', ['cnd_reposicao_unico', 'cnd_reposicao_lote'])
    const tplRepoUnico = (tplsRepo || []).find((t: any) => t.nome_meta === 'cnd_reposicao_unico') || null  // A: lote único ("segurei o valor")
    const tplRepoMulti = (tplsRepo || []).find((t: any) => t.nome_meta === 'cnd_reposicao_lote') || null   // B: multi-lote ("estendi o lote 1")
    // 🆕 NUTRIÇÃO (Fase 4) — gotejar de valor/cases durante a ESPERA (turma com lote, virada longe). Ordem fixa N1→N8.
    // SÓ 'aprovado' (não dispara pendente). Cada lead recebe 1 por vez, a cada ~3 dias, cada um 1x.
    const NUTRI_ORDER = ['cnd_nutri_1', 'cnd_nutri_2', 'cnd_nutri_3', 'cnd_nutri_4', 'cnd_nutri_5', 'cnd_nutri_6', 'cnd_nutri_7', 'cnd_nutri_8']
    const { data: tplsNutri } = await sb.from('followup_templates').select('nome_meta, corpo, variaveis').eq('org_id', org).eq('ativo', true).eq('status', 'aprovado').in('nome_meta', NUTRI_ORDER)
    const nutriTpls = NUTRI_ORDER.map(n => (tplsNutri || []).find((t: any) => t.nome_meta === n)).filter(Boolean) as any[]

    // leads das 3 etapas + conversas escopadas
    const { data: leadsRaw } = await sb.from('leads').select('id, nome, whatsapp, etapa, codigo_turma, turma_id, criado_em, atendido_por, resumo_ia, resumo_ia_em').eq('org_id', org).in('etapa', ETAPAS).limit(5000)
    // exclui inalcançáveis: @lid/@g.us/@broadcast (identificador interno, sem número real) ou dígitos demais (LID)
    const alcancavel = (w: string) => { const s = String(w || ''); if (/@lid|@g\.us|@broadcast|@s\.whatsapp/i.test(s)) return false; const d = s.replace(/\D/g, ''); return d.length >= 10 && d.length <= 13 }
    const leads = (leadsRaw || []).filter(l => alcancavel(l.whatsapp))

    // DOSSIÊ ÚNICO (fonte de verdade): mensagens dos 2 canais (zapi+oficial, inclusive conversas só por telefone
    // que a busca por lead_id perdia) + ligações + TODOS os andamentos. Mesma lib da tela e do copiloto.
    const dossies = await dossiesLote(sb, org, leads)
    // QUEM ENTRA NA CADÊNCIA:
    //  • frio de verdade (nunca respondeu) → cadência completa;
    //  • já é da IA (re-inscrito) → segue;
    //  • DE "lote e preço ok" PRA FRENTE (lote_preco_ok / oferecer_bolsa): TODOS entram — o time deu preço+lote
    //    (com os 3 dias pra virada), então a cadência do lote virando cobre engajado E frio.
    // Só o atendimento_inicial ENGAJADO fica de fora (é "time liga primeiro"). A trava de template já impede
    // reabridor/apresentação frios pra engajado; lote/bolsa não são bloqueados.
    // TAREFAS DE MENSAGEM vencidas — o time NÃO faz mais follow-up; a IA trabalha esses leads (guiado pela TAREFA do CRM).
    const MSG_TASK = ['seguir_followup', 'triagem_mensagem', 'lote_virando', 'pos_virada_lote', 'msg_horario', 'apresentacao_completa', 'bolsa_1', 'bolsa_2', 'seguir_whatsapp', 'followup']
    const tarefaDeLead = new Map<string, string>() // leadId -> taskId (a concluir quando a IA atender)
    { const { data: tks } = await sb.from('tarefas_lead').select('id, lead_id, data_vencimento').eq('org_id', org).in('tipo', MSG_TASK).eq('concluida', false).eq('cancelada', false).limit(2000); const nowMs = Date.now(); for (const t of tks || []) { const venc = t.data_vencimento ? +new Date(t.data_vencimento) : 0; if ((!venc || venc <= nowMs) && !tarefaDeLead.has(t.lead_id)) tarefaDeLead.set(t.lead_id, t.id) } }
    // ÚLTIMA COMUNICAÇÃO REAL (mensagem enviada/recebida ou ligação) — NÃO conta andamento de sistema (mudança de etapa,
    // ia_followup marcador). É a régua de silêncio robusta: não reseta quando a interpretação/reconciliador corrige a etapa.
    const ultRealDe = (l: any) => { const d = dossies.get(l.id); return Math.max(d?.ultimoOutboundEm ? +new Date(d.ultimoOutboundEm) : 0, d?.ultimoInboundEm ? +new Date(d.ultimoInboundEm) : 0, ...((d?.ligacoes || []).map((g: any) => +new Date(g.em)))) }
    // O CLIENTE se mexeu nas últimas 24h (respondeu / ligação atendida / nota humana) → é a vez do TIME responder, IA não toca.
    const engajadoRecente = (l: any) => { const e = dossies.get(l.id)?.ultimoEngajamentoEm; return e ? (now - +new Date(e) < DIA) : false }
    // IA faz o follow-up de TODOS os leads do funil que ESFRIARAM — fica de fora só quem o cliente movimentou nas últimas 24h.
    // (A interpretação adiante ainda roteia p/ o time quem está em negociação real: agendado / aguardando_pagamento.)
    const frios = (leads || []).filter(l => !engajadoRecente(l))
    const lastOutDe = (l: any) => { const e = dossies.get(l.id)?.ultimoOutboundEm; return e ? +new Date(e) : 0 }

    // entrada na etapa atual + toques da IA já dados NESSA etapa
    const ids = frios.map(l => l.id)
    const entradaEtapa: Record<string, number> = {}
    const toquesIA: Record<string, { n: number; ultimo: number }> = {}
    const enviadosTpl: Record<string, Set<string>> = {} // templates (cnd_*) que o lead JÁ recebeu (qualquer fonte) → não repetir
    const reativadoRecente = new Set<string>() // lead que o roteador reativou ("nova turma") nos últimos 7d → cooldown da cadência
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100)
      // PAGINADO — o Supabase corta em 1000 linhas; com muitos andamentos por lead isso truncava e cegava o dedup (repetia template)
      const ands: any[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await sb.from('lead_andamentos').select('lead_id, tipo, etapa_nova, observacao, criado_em').in('lead_id', chunk).order('criado_em', { ascending: true }).range(from, from + 999)
        if (!data?.length) break
        ands.push(...data)
        if (data.length < 1000) break
      }
      const byLead: Record<string, any[]> = {}
      for (const a of ands || []) (byLead[a.lead_id] = byLead[a.lead_id] || []).push(a)
      for (const l of frios) {
        if (!chunk.includes(l.id)) continue
        const as = byLead[l.id] || []
        let ent = l.criado_em ? +new Date(l.criado_em) : 0
        // entrada na etapa = última mudança GENUÍNA pra essa etapa. Ignora correção da própria IA ('🤖 IA (interpretou…')
        // que resetava o relógio do fluxo a cada rodada e travava o lead em "não due" pra sempre.
        for (const a of as) if (a.tipo === 'mudanca_etapa' && a.etapa_nova === l.etapa && !/^🤖/.test(a.observacao || '')) ent = +new Date(a.criado_em)
        entradaEtapa[l.id] = ent
        const toques = as.filter(a => a.tipo === 'ia_followup' && +new Date(a.criado_em) >= ent)
        toquesIA[l.id] = { n: toques.length, ultimo: toques.length ? +new Date(toques[toques.length - 1].criado_em) : 0 }
        // coleta TODO template já enviado (ia_followup, recuperacao_falha, migracao_num…) pra não repetir a mesma mensagem
        const set = new Set<string>()
        for (const a of as) { const m = (a.observacao || '').match(/cnd_[a-z0-9_]+/gi); if (m) m.forEach((x: string) => set.add(x.toLowerCase())) }
        enviadosTpl[l.id] = set
        // reativado pelo roteador nos últimos 7 dias? → entra em cooldown (não deixa a cadência disparar em cima)
        if (as.some(a => a.tipo === 'ia_followup' && /reativa_nova_turma/.test(a.observacao || '') && (now - +new Date(a.criado_em)) < 7 * DIA)) reativadoRecente.add(l.id)
      }
    }

    // 🆕 FASE 3 — CONTEXTO DE LOTE por turma: quantos dias faltam pra VIRADA do lote vigente. É isso que dirige a
    // URGÊNCIA pela DATA REAL (turma com lote cadastrado). Sem lote → null → cadência fictícia de sempre (guarda).
    const frioTurmaIds = [...new Set(frios.map(l => l.turma_id).filter(Boolean))] as string[]
    const lotesPorTurma = new Map<string, Lote[]>()
    if (frioTurmaIds.length) {
      const { data: allLotes } = await sb.from('turma_lotes').select('turma_id, ordem, nome, preco_pix, preco_cartao, parcela_cartao, vale_ate').in('turma_id', frioTurmaIds).order('ordem')
      for (const x of (allLotes || []) as any[]) { const a = lotesPorTurma.get(x.turma_id) || []; a.push(x); lotesPorTurma.set(x.turma_id, a) }
    }
    const dvDaTurma = (tid: string | null): number | null => { const ls = tid ? lotesPorTurma.get(tid) : null; return ls?.length ? diasAteVirada(ls, hojeBR) : null }
    // turma com PRÓXIMO lote (preço vai subir) → reposição B ("estendi o lote 1"); sem próximo (único/último) → A ("segurei o valor").
    const temProximoLote = (tid: string | null): boolean => { const ls = tid ? lotesPorTurma.get(tid) : null; if (!ls?.length) return false; const vig = loteVigente(ls, hojeBR); return !!vig && ls.some(x => x.ordem > vig.ordem) }
    // Toques de URGÊNCIA guiados pela virada real: lote_virando dispara de 3 dias antes até a véspera (dv 1..3);
    // pos_virada ("hoje é o último dia") dispara NO dia da virada (dv<=0). Fora dessas janelas, o card ESPERA.
    const URGENCIA_CHAVE = new Set(['lote_virando', 'pos_virada_lote'])
    const urgenciaDue = (chave: string, dv: number): boolean =>
      chave === 'lote_virando' ? (dv >= 1 && dv <= 3) : chave === 'pos_virada_lote' ? (dv <= 0) : false

    // decide, por lead: qual a ação (enviar toque X / avançar etapa / esperar / nada)
    type Plano = { lead: any; acao: 'enviar' | 'avancar'; chave?: string; tpl?: any; demite?: boolean; proxEtapa?: string }
    const planos: Plano[] = []
    for (const l of frios) {
      // ⛔ COOLDOWN pós-reativação: o roteador acabou de mandar "nova turma abriu" a este lead. A cadência normal
      // NÃO dispara em cima nos primeiros 7 dias (senão ele levaria, ex., a demissão logo depois da reativação).
      // Dá tempo dele responder à turma nova; passado o cooldown, a cadência retoma (com a trava anti-repetição).
      if (reativadoRecente.has(l.id)) continue
      const cad = (fluxo.cadencia[l.etapa] || [])
      const o = toquesIA[l.id] || { n: 0, ultimo: 0 }
      const fam = familia(l.codigo_turma)
      const jaEnv = enviadosTpl[l.id] || new Set<string>()
      const dvLead = dvDaTurma(l.turma_id) // 🆕 dias até a virada real do lote (null = turma sem lote → modo antigo)
      // 🆕 REPOSIÇÃO DE LOTE: 1 contato AGORA pra reancorar o lead de turma COM lote cuja virada ainda está LONGE
      // (>3d, fora da janela de urgência da Fase 3) e que NUNCA recebeu reposição. Fecha o silêncio da transição pro
      // modelo novo (o lead ficava parado até 3 dias antes da virada). Só etapas pós-preço (lote_preco_ok/oferecer_bolsa).
      // Escolhe A (lote único: "segurei o valor") ou B (multi-lote: "estendi o lote 1") sozinho, pela existência de próximo lote.
      if (dvLead !== null && dvLead > 3 && (l.etapa === 'lote_preco_ok' || l.etapa === 'oferecer_bolsa')) {
        const tRepo = temProximoLote(l.turma_id) ? tplRepoMulti : tplRepoUnico
        if (tRepo && !jaEnv.has((tRepo.nome_meta || '').toLowerCase())) { planos.push({ lead: l, acao: 'enviar', chave: 'reposicao_lote', tpl: tRepo }); continue }
      }
      // 🆕 NUTRIÇÃO (Fase 4): depois da reposição, GOTEJA valor/cases enquanto a virada está longe (dv>3). 1 a cada ~3
      // dias, ciclando N1→N8, cada 1x. Preenche a espera até a urgência. Só pós-preço (lote_preco_ok/oferecer_bolsa).
      if (dvLead !== null && dvLead > 3 && nutriTpls.length && (l.etapa === 'lote_preco_ok' || l.etapa === 'oferecer_bolsa')) {
        const proxNutri = nutriTpls.find(t => !jaEnv.has((t.nome_meta || '').toLowerCase()))
        const ultOut = lastOutDe(l)
        const espacado = !ultOut || (now - ultOut >= 3 * DIA)         // gotejar: ~3 dias entre toques
        const jaHojeN = !!ultOut && new Date(ultOut).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) === hojeBR
        if (proxNutri && espacado && !jaHojeN) { planos.push({ lead: l, acao: 'enviar', chave: 'nutricao', tpl: proxNutri }); continue }
      }
      // acha o próximo toque cujo template AINDA NÃO foi enviado a esse lead (não repete a mesma mensagem)
      // e que não seja reabridor/apresentação frio pra engajado.
      let idx = o.n, toque: any = null, tpl: any = null
      while (idx < cad.length) {
        const tq = cad[idx]
        const t = pickTpl(l.etapa, tq.chave, fam)
        const jaFoi = t && jaEnv.has((t.nome_meta || '').toLowerCase())
        // 🆕 FASE 3: turma com lote — se a JANELA do lote_virando já passou (virada hoje/no passado), PULA esse
        // toque pra selecionar o pós-virada ("último dia"). Sem lote (dvLead null) → nunca pula.
        const urgPassou = dvLead !== null && tq.chave === 'lote_virando' && dvLead <= 0
        // 🚫 NUNCA manda template de ABERTURA/REINTRODUÇÃO/APRESENTAÇÃO pra quem JÁ ENGAJOU (respondeu alguma vez).
        // Template fixo não sabe o que o cliente já disse — reabrir com "aqui é o Mateus, qual é teu negócio?" pra
        // quem já respondeu "Estética" e já viu o pitch soa como se a gente não lembrasse dele. Warm = do time/copiloto
        // (contexto), não do motor de template. Antes só travava nas últimas 24h → o lead esfriava em 1 dia e levava a
        // apresentação genérica de novo (caso da Estética). Agora trava por ter engajado ALGUMA VEZ.
        const jaEngajou = !!dossies.get(l.id)?.ultimoEngajamentoEm
        const aberturaFria = /retomar|retomada|apresenta|mudanca|nao_atendeu/i.test(t.nome_meta || '')
        const engBloq = t && aberturaFria && (engajadoRecente(l) || jaEngajou)
        if (t && !jaFoi && !engBloq && !urgPassou) { toque = tq; tpl = t; break }
        idx++
      }
      if (!tpl) {
        // esgotou os toques da etapa. NÃO avança CEGO pra próxima (gera ping-pong: a cadência empurra e a
        // interpretação corrige de volta, em loop). Consulta a interpretação (cache): se ela diz OUTRA etapa,
        // move pra LÁ; se diz a MESMA etapa (ou não há leitura), DEIXA PARADO — lead totalmente tocado, aguardando.
        const it = await interpretarFollowup(sb, org, dossies.get(l.id)!, l, false)
        const alvo = it?.etapa
        if (alvo && alvo !== l.etapa && MOVE_VALIDO.has(alvo)) planos.push({ lead: l, acao: 'avancar', proxEtapa: alvo })
        // senão: nada a fazer (não fica avançando à toa) — quebra o ping-pong
        continue
      }
      // timing do toque CONFORME O FLUXO: 1º toque conta da ENTRADA na etapa (D+X do fluxo); toques seguintes,
      // do último toque da IA. A entrada agora ignora correção da IA (não reseta), então o D+X é confiável.
      const ref = o.n > 0 ? o.ultimo : (entradaEtapa[l.id] || 0)
      // due = chegou o dia da cadência do fluxo OU tem TAREFA de mensagem vencida (o time não faz mais; a IA faz)
      // 🆕 FASE 3: toque de URGÊNCIA em turma COM lote dispara pela DATA REAL da virada (lote_virando 3d antes→véspera;
      //   pos_virada no dia da virada). Fora da janela SEGURA (o card espera a virada, não cutuca antes). Sem lote = D+X.
      const due = (URGENCIA_CHAVE.has(toque.chave) && dvLead !== null)
        ? urgenciaDue(toque.chave, dvLead)
        : ((now - ref >= (toque.dias || 0) * DIA) || tarefaDeLead.has(l.id))
      const jaHoje = lastOutDe(l) && new Date(lastOutDe(l)).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) === hojeBR
      if (!due || jaHoje) continue
      planos.push({ lead: l, acao: 'enviar', chave: toque.chave, tpl, demite: /demiss|encerr/i.test(toque.chave) })
    }

    // mais FRIO primeiro (maior silêncio) — assim o limite por rodada ataca os mais atrasados
    planos.sort((a, b) => (ultRealDe(a.lead) || 0) - (ultRealDe(b.lead) || 0))
    const lote = planos.slice(0, limit)
    // turma (cidade + preço) por lead + prazo do lote (hoje+3, fim de semana → segunda)
    const turmaIds = [...new Set(lote.map(p => p.lead.turma_id).filter(Boolean))] as string[]
    const turmaInfo = new Map<string, { cidade: string; preco: number; codigo: string; loteVig: Lote | null }>()
    if (turmaIds.length) {
      const { data: tt } = await sb.from('turmas').select('id, codigo, preco_venda, cidades(nome)').in('id', turmaIds)
      // 🆕 LOTE REAL: preço do lote VIGENTE manda na mensagem. Reusa o `lotesPorTurma` já carregado (todos os frios).
      for (const t of (tt || []) as any[]) turmaInfo.set(t.id, { cidade: t.cidades?.nome || '', preco: t.preco_venda || 0, codigo: t.codigo || '', loteVig: loteVigente(lotesPorTurma.get(t.id) || [], hojeBR) })
    }
    // prazo do lote FIXO POR LEAD = entrada no lote + 4 dias úteis (o dia do "último dia") — assim o "lote virando"
    // e o "último dia" batem a mesma data pro mesmo lead (não recalcula hoje+3 a cada mensagem).
    // prazo ROLANTE a partir de HOJE (+4 dias úteis). Antes ancorava na ENTRADA da etapa — se o lead entrou faz
    // uma semana, o prazo nascia no PASSADO ("vale até 20/07" saindo dia 27). Ancorado em hoje, nunca vence.
    const prazoDe = (_entMs: number) => {
      const base = new Date(hojeBR + 'T15:00:00Z')
      const d = new Date(base); d.setUTCDate(d.getUTCDate() + 4); while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1)
      return `${d.toISOString().slice(8, 10)}/${d.toISOString().slice(5, 7)}`
    }
    const money = (n: number) => 'R$' + n.toFixed(2).replace('.', ',').replace(/,00$/, '')
    const previews: any[] = []
    let enviados = 0, avancados = 0, demitidos = 0, falhas = 0, falhasSeguidas = 0

    for (const p of lote) {
      const l = p.lead
      if (p.acao === 'avancar') {
        if (!dryRun) { const ag = new Date().toISOString(); await sb.from('leads').update({ etapa: p.proxEtapa, atualizado_em: ag }).eq('id', l.id); await sb.from('lead_andamentos').insert({ lead_id: l.id, tipo: 'mudanca_etapa', etapa_anterior: l.etapa, etapa_nova: p.proxEtapa, observacao: `🤖 IA — cadência de ${l.etapa} esgotada sem resposta → avança pra ${p.proxEtapa}.` }) }
        avancados++; previews.push({ lead: l.nome, acao: `avança ${l.etapa} → ${p.proxEtapa}` }); continue
      }

      // ═══ INTERPRETAÇÃO: SÓ lê o resumo cacheado (rápido). A geração roda num processo separado (/api/ia/resumos). ═══
      const interp = await interpretarFollowup(sb, org, dossies.get(l.id)!, l, false)
      // sem resumo ainda → NÃO manda template cego; adia (o warming vai gerar o resumo)
      if (!interp) { previews.push({ lead: l.nome, pulado: 'sem resumo ainda — adiado (warming pendente)' }); continue }
      const etapaReal = interp?.etapa
      const situacao = (interp?.motivo || '').slice(0, 140)
      const mover = async (novaEtapa: string, motivo: string) => { if (!dryRun) { await sb.from('leads').update({ etapa: novaEtapa, atualizado_em: new Date().toISOString() }).eq('id', l.id); await sb.from('lead_andamentos').insert({ lead_id: l.id, tipo: 'mudanca_etapa', etapa_anterior: l.etapa, etapa_nova: novaEtapa, observacao: `🤖 IA (interpretou o histórico) — ${motivo}` }) } }
      if (etapaReal && etapaReal !== l.etapa) {
        if (etapaReal === 'perda') { await mover('perda', `declinou / sem interesse: ${situacao}`); demitidos++; previews.push({ lead: l.nome, acao: '→ PERDA (declinou)', motivo: situacao }); continue }
        if (['agendado', 'aguardando_pagamento', 'proxima_turma', 'ganho'].includes(etapaReal)) { await mover(etapaReal, `situação real: ${situacao}`); previews.push({ lead: l.nome, acao: `→ ${etapaReal} (é do time)`, motivo: situacao }); continue }
        if (['atendimento_inicial', 'lote_preco_ok', 'oferecer_bolsa'].includes(etapaReal)) {
          const RANK: Record<string, number> = { atendimento_inicial: 1, lote_preco_ok: 2, oferecer_bolsa: 3 }
          const rNovo = RANK[etapaReal] || 0, rAtual = RANK[l.etapa as string] || 0
          // ⛔ SÓ CORRIGE PRA FRENTE. REBAIXAR (ex.: oferecer_bolsa → atendimento_inicial) quase sempre é erro de
          // leitura do resumo — foi o caso do arquiteto/pizzaria: o resumo disse "preço não apresentado" quando o
          // preço JÁ tinha sido dado, aí rebaixou pro começo e re-disparou a APRESENTAÇÃO COMPLETA do zero.
          // Rebaixamento fica mantido na etapa atual (segue a cadência dela, não re-apresenta).
          if (rNovo > rAtual) { await mover(etapaReal, `estava em ${l.etapa}, mas o histórico diz ${etapaReal}: ${situacao}`); previews.push({ lead: l.nome, acao: `corrige ${l.etapa} → ${etapaReal}`, motivo: situacao }); continue }
          previews.push({ lead: l.nome, info: `interpretação disse ${etapaReal} (rebaixaria ${l.etapa}) — IGNORADO (não rebaixa, não re-apresenta)` })
          // NÃO dá continue: cai na cadência da etapa ATUAL abaixo
        }
      }

      const ti = turmaInfo.get(l.turma_id || '')
      // produto (FC/ANL): do código do lead; se vazio (bug da Helena), deriva do CÓDIGO DA TURMA.
      const fam = familia(l.codigo_turma) || familia(ti?.codigo || null)
      // preço FIXO por produto (FC 2397 pix / 2697 cartão 10x; ANL 797 pix). Fallback: preço real da turma
      // (2697 é o valor do CARTÃO, não do Pix — não usa como Pix).
      let precoPix = fam === 'ANL' ? 797 : fam === 'FC' ? 2397 : 0
      if (!precoPix && ti?.preco && ti.preco > 0 && ti.preco !== 2697) precoPix = ti.preco
      // 🆕 LOTE REAL vence o hardcoded: turma com lote cadastrado → usa o preço do lote VIGENTE (Pix).
      if (ti?.loteVig) precoPix = ti.loteVig.preco_pix
      // BOLSA fixa por produto (sem 10%, valores cravados pelo time em 27/07)
      const bolsaTxt = fam === 'FC' ? 'R$2.097 no Pix ou R$2.497 em 10x sem juros' : fam === 'ANL' ? 'R$697 no Pix ou R$897 em 10x sem juros' : ''
      // ⛔ BLINDAGEM R$0 (bug grave da Helena): template que precisa de preço/bolsa sem produto resolvido → NÃO manda.
      const precisaPreco = /\{\{\s*(preco|preco_pix|preco_cartao)\s*\}\}/.test(p.tpl.corpo || '')
      const precisaBolsa = /\{\{\s*condicao_bolsa\s*\}\}/.test(p.tpl.corpo || '')
      if (precisaPreco && precoPix <= 0) { previews.push({ lead: l.nome, pulado: '⛔ sem preço confiável — NÃO manda (blindagem), fica pro time' }); continue }
      if (precisaBolsa && !bolsaTxt) { previews.push({ lead: l.nome, pulado: '⛔ produto não resolvido (FC/ANL) — NÃO manda bolsa, fica pro time' }); continue }
      const valores: Record<string, string> = {
        nome: nomeSaudacao(l.nome), vendedor: VENDEDOR, curso: cursoNome(fam),
        cidade: ti?.cidade || 'sua região',
        preco_pix: money(precoPix), preco: money(precoPix),
        preco_cartao: ti?.loteVig ? `10x de ${money(ti.loteVig.parcela_cartao)}` : (fam === 'FC' ? 'R$2697 no cartão em até 10x' : ''),
        condicao_bolsa: bolsaTxt,
        // 🆕 prazo REAL do lote (vale_ate) quando a turma tem lote e a data ainda não passou; senão o prazo rolante de sempre.
        prazo: (ti?.loteVig && ti.loteVig.vale_ate >= hojeBR) ? `${ti.loteVig.vale_ate.slice(8, 10)}/${ti.loteVig.vale_ate.slice(5, 7)}` : prazoDe(entradaEtapa[l.id] || 0),
      }
      const ordem = (p.tpl.variaveis || '').split(',').map((s: string) => s.trim()).filter(Boolean)
      const textoRender = (p.tpl.corpo || '').replace(/\{\{(\w+)\}\}/g, (_m: string, k: string) => valores[k] ?? `{{${k}}}`)
      // ⛔ TRAVA FINAL: qualquer "R$0" (preço zerado) no texto renderizado aborta o envio, seja qual for a origem.
      if (/R\$\s?0(?![0-9.,])/.test(textoRender)) { previews.push({ lead: l.nome, pulado: '⛔ render deu R$0 — abortado (trava final de preço)' }); continue }
      // variável de template ainda não resolvida ({{algo}}) também não pode ir pro cliente
      if (/\{\{\w+\}\}/.test(textoRender)) { previews.push({ lead: l.nome, pulado: '⛔ variável não resolvida no texto — abortado' }); continue }
      // ⛔ TRAVA DE PRAZO VENCIDO: não manda "vale até DD/MM" / "último dia … DD/MM" com data no PASSADO
      // (foi o caso do "vale até 27/07" enviado dia 29). Prazo vencido = incoerente → segura, fica pro time.
      const mPz = textoRender.match(/\b(?:at[ée]|dia)\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/i)
      if (mPz) {
        const brt = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
        const hoje0 = new Date(brt.getFullYear(), brt.getMonth(), brt.getDate())
        const yy = mPz[3] ? (Number(mPz[3]) < 100 ? 2000 + Number(mPz[3]) : Number(mPz[3])) : brt.getFullYear()
        const prazoD = new Date(yy, Number(mPz[2]) - 1, Number(mPz[1]))
        const diffDias = (hoje0.getTime() - prazoD.getTime()) / 864e5
        // vencido = está no passado, mas não por causa de virada de ano (ex.: "05/01" em dezembro → é do ano que vem)
        if (diffDias > 0 && diffDias < 300) { previews.push({ lead: l.nome, pulado: `⛔ prazo vencido no texto (${mPz[1]}/${mPz[2]}) — não manda data no passado` }); continue }
      }
      const to = foneOficial(l.whatsapp || '')
      if (!to) { falhas++; continue }

      // ⛔ ANTI-REPETIÇÃO DURA (banco é autoritativo): NÃO reenvia o MESMO template a este lead em 14 dias.
      // A régua em memória (jaEnv) às vezes fura — ex.: andamento da véspera não lido no lote → mandou cnd_lote_virando
      // 2 dias seguidos (caso Claudia). Esta checagem direta no banco fecha o furo, independente do porquê.
      {
        const { count: repet } = await sb.from('lead_andamentos').select('id', { count: 'exact', head: true })
          .eq('lead_id', l.id).eq('tipo', 'ia_followup').ilike('observacao', `%${p.tpl.nome_meta}%`)
          .gte('criado_em', new Date(Date.now() - 14 * DIA).toISOString())
        if (repet) { previews.push({ lead: l.nome, pulado: `⛔ ${p.tpl.nome_meta} já foi enviado nos últimos 14 dias — não repete` }); continue }
      }

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

    // categoriza o que o dryRun faria (pro time entender o disparo: quantos são ENVIO real vs move/pulo)
    const cat = { envio_real: 0, corrige_etapa: 0, avanca_etapa: 0, vira_perda: 0, vai_pro_time: 0, pulado_sem_preco: 0, pulado_sem_resumo: 0, pulado_outro: 0 }
    for (const p of previews as any[]) {
      if (p.texto || p.template) cat.envio_real++
      else if (p.pulado?.includes('preço')) cat.pulado_sem_preco++
      else if (p.pulado?.includes('resumo')) cat.pulado_sem_resumo++
      else if (p.pulado) cat.pulado_outro++
      else if (/PERDA/.test(p.acao || '')) cat.vira_perda++
      else if (/corrige/.test(p.acao || '')) cat.corrige_etapa++
      else if (/avança/.test(p.acao || '')) cat.avanca_etapa++
      else if (/é do time/.test(p.acao || '')) cat.vai_pro_time++
    }
    return NextResponse.json({
      ok: true, dryRun, frios: frios.length, planejados: planos.length, processados: lote.length,
      enviados, avancados, demitidos, falhas,
      resumo: dryRun ? cat : undefined,
      amostra: dryRun ? previews.filter((p: any) => p.texto).slice(0, 8) : undefined,
      erros: !dryRun && previews.filter((p: any) => p.erro).length ? previews.filter((p: any) => p.erro) : undefined,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
