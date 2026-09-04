import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { enviarTemplate, foneOficial } from '@/lib/whatsapp-oficial'
import { nomeSaudacao } from '@/lib/saudacao'

export const maxDuration = 60

// 🔄 ROTEADOR DE TURMA — 10 dias depois de uma turma COMEÇAR, os leads dela que NÃO converteram rolam pra PRÓXIMA
// turma da mesma cidade/produto, com 1 TOQUE de reativação ("abriu uma nova turma"). MANTÉM a etapa (não reseta) →
// recoloca no fluxo de onde parou; a trava anti-repetição do motor blinda contra repetir o que já foi.
// Se NÃO houver próxima turma → NÃO processa; devolve em `semProxima` pra o Guto decidir (cadastrar a nova).
// aguardando_pagamento fica de FORA (é quase-venda → humano). dryRun (padrão) simula. Aplicar: { dryRun:false, confirm:true }.
const DIAS_APOS = 10
const ETAPAS_LEAD = ['atendimento_inicial', 'lote_preco_ok', 'oferecer_bolsa', 'agendado', 'proxima_turma', 'ligacao_boa']
const TPL = 'cnd_nova_turma'

// datas legíveis: até 4 aulas lista ("08, 09 e 10/09"); mais que isso vira faixa ("08/09 a 01/10") pra não poluir.
function fmtDatas(isos: string[]): string {
  const s = isos.slice().sort()
  if (!s.length) return ''
  const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
  if (s.length > 4) return `${dm(s[0])} a ${dm(s[s.length - 1])}`
  const porMes: { mes: string; dias: string[] }[] = []
  for (const iso of s) { const mes = iso.slice(5, 7), dia = iso.slice(8, 10); const g = porMes.find(x => x.mes === mes); if (g) g.dias.push(dia); else porMes.push({ mes, dias: [dia] }) }
  return porMes.map(g => { const d = g.dias; const lista = d.length === 1 ? d[0] : d.slice(0, -1).join(', ') + ' e ' + d[d.length - 1]; return `${lista}/${g.mes}` }).join(', ')
}
const cursoNome = (n: string) => (n || '').replace(/^Anúncios.*Locais$/i, 'Anúncios para Negócios Locais').replace(/^Formação.*Digital$/i, 'Formação Completa em Marketing Digital')

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({} as any))
    const dryRun = b?.dryRun !== false
    const confirm = b?.confirm === true
    const dias = Math.min(Math.max(Number(b?.dias) || DIAS_APOS, 3), 60)
    if (!dryRun && !confirm) return NextResponse.json({ ok: false, error: 'pra aplicar: dryRun=false E confirm=true' }, { status: 200 })

    const hojeBR = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    const limite = new Date(Date.now() - dias * 864e5).toISOString().slice(0, 10)   // começou há >= `dias`
    const minData = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10)     // não mexe em turma muito antiga

    // template pronto? (só dispara o toque se a Meta já aprovou = ativo)
    const { data: tpl } = await sb.from('followup_templates').select('ativo').eq('org_id', org).eq('nome_meta', TPL).maybeSingle()
    const tplPronto = !!tpl?.ativo
    // ⛔ SEGURANÇA: no modo real, NÃO processa até o template estar aprovado (ativo). Senão re-apontaria o lead pra
    // turma nova SEM mandar o toque de reativação (o toque se perderia, pois o lead já teria saído da turma antiga).
    if (!dryRun && !tplPronto) return NextResponse.json({ ok: true, aguardandoTemplate: true, reativados: 0, msg: `template ${TPL} ainda não aprovado pela Meta — roteador em espera.` }, { status: 200 })

    // turmas que COMEÇARAM há >= `dias` (e não canceladas)
    const { data: turmas } = await sb.from('turmas')
      .select('id, codigo, produto_id, cidade_id, data_inicio, produtos(nome), cidades(nome)')
      // só turmas regidas pela cadência de curso (Deu Venda tem motor_cadencia='nenhum')
      .eq('motor_cadencia', 'turma')
      .eq('org_id', org).lte('data_inicio', limite).gte('data_inicio', minData).neq('status', 'cancelada').order('data_inicio')

    let reativados = 0
    const semProxima: any[] = []
    const acoes: any[] = []

    for (const t of (turmas || []) as any[]) {
      // leads não-convertidos ainda apontando pra ESSA turma
      const { data: leads } = await sb.from('leads').select('id, nome, whatsapp, etapa, fbc, fbp').eq('org_id', org).eq('turma_id', t.id).in('etapa', ETAPAS_LEAD).limit(2000)
      if (!leads?.length) continue

      // próxima turma aberta da MESMA cidade/produto
      const { data: prox } = await sb.from('turmas').select('id, codigo, data_inicio').eq('org_id', org).eq('produto_id', t.produto_id).eq('cidade_id', t.cidade_id).eq('status', 'em_vendas').gt('data_inicio', hojeBR).order('data_inicio').limit(1).maybeSingle()
      if (!prox) { semProxima.push({ turma: t.codigo, cidade: t.cidades?.nome, produto: t.produtos?.nome, leadsOrfaos: leads.length }); continue }

      const { data: td } = await sb.from('turma_datas').select('data').eq('turma_id', prox.id).order('data')
      const datasStr = fmtDatas((td || []).map((x: any) => x.data))
      const curso = cursoNome(t.produtos?.nome || ''), cidade = t.cidades?.nome || ''
      acoes.push({ de: t.codigo, para: prox.codigo, datas: datasStr, leads: leads.length, tocou: tplPronto })

      if (dryRun) { reativados += leads.length; continue }

      for (const l of leads) {
        // 1 TOQUE de reativação (só se o template já foi aprovado)
        if (tplPronto) {
          const to = foneOficial(l.whatsapp || '')
          if (to) {
            const params = [nomeSaudacao(l.nome), curso, cidade, datasStr].map(x => ({ type: 'text', text: x }))
            const r = await enviarTemplate(to, TPL, 'pt_BR', [{ type: 'body', parameters: params }])
            if (r.ok) {
              let conv: any = (await sb.from('wa_conversas').select('id').eq('org_id', org).eq('lead_id', l.id).eq('canal', 'oficial').limit(1).maybeSingle()).data
              if (!conv) conv = (await sb.from('wa_conversas').insert({ org_id: org, telefone: to, nome: l.nome, lead_id: l.id, canal: 'oficial' }).select('id').single()).data
              const texto = `Oi ${nomeSaudacao(l.nome)}, novidade boa: abriu uma nova turma do ${curso} em ${cidade}, nos dias ${datasStr}. Como tu já tava de olho, quis te avisar pra garantir tua vaga. Quer que eu segure pra ti?`
              if (conv) { await sb.from('wa_mensagens').insert({ org_id: org, conversa_id: conv.id, zapi_id: r.wamid || null, direcao: 'enviada', tipo: 'texto', texto, status: 'enviada', canal: 'oficial' }); await sb.from('wa_conversas').update({ ultima_msg: texto.slice(0, 200), ultima_msg_em: new Date().toISOString() }).eq('id', conv.id) }
              await sb.from('lead_andamentos').insert({ lead_id: l.id, tipo: 'ia_followup', observacao: `🔄 Roteador (reativação) — ${t.etapa || l.etapa}/reativa_nova_turma: ${TPL}` })
            }
          }
        }
        // re-aponta pra próxima turma + MANTÉM a etapa (recoloca no fluxo)
        await sb.from('leads').update({ turma_id: prox.id, codigo_turma: prox.codigo, atendido_por: 'ia', atualizado_em: new Date().toISOString() }).eq('id', l.id)
        await sb.from('lead_andamentos').insert({ lead_id: l.id, tipo: 'reconciliacao', observacao: `🔄 Roteador — ${dias}d após início da ${t.codigo}: rolado pra turma nova ${prox.codigo} (etapa mantida, recolocado no fluxo).` })
        reativados++
      }
    }

    return NextResponse.json({ ok: true, dryRun, tplPronto, reativados, semProxima, acoes })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
