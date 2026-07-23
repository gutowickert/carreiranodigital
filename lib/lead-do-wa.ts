import { aplicarRateio } from '@/lib/rateio'
import { sendLead } from '@/lib/capi'
import { randomUUID } from 'crypto'

// Cria (ou atribui) o LEAD a partir da 1ª mensagem de WhatsApp, seja pelo canal
// Z-API (número atual) ou pelo canal OFICIAL (Cloud API / número de disparo).
// A lógica é a mesma dos dois lados — extraída do webhook Z-API pra não duplicar
// nem divergir: casa o #ref do /wa com wa_clicks, resolve turma/rateio/UTM/CAPI.
//
// Retorna { lead, leadCriado } — `lead` = novo criado OU já existente/recorrente.
export async function criarOuAtribuirLeadDoWa(
  supabase: any,
  p: {
    telefone: string          // só dígitos
    texto: string | null      // corpo da mensagem (pode ter #ref e código de turma)
    nome?: string | null      // melhor nome disponível
    ehLid?: boolean           // Z-API @lid (sem número real) — não casa por telefone
    ehGrupo?: boolean
    fromMe?: boolean
  }
): Promise<{
  lead: { id: string; nome: string | null } | null
  leadCriado: { id: string; nome: string | null } | null
  leadExistente: { id: string; nome: string | null } | null
  aluno: { id: string; nome: string | null } | null
}> {
  const { telefone } = p
  const texto = p.texto || null
  const ehLid = !!p.ehLid
  const ehGrupo = !!p.ehGrupo
  const fromMe = !!p.fromMe
  const nome = p.nome || null

  const sufixo = telefone.slice(-8)
  const leadExistente = (ehLid || ehGrupo) ? null : (await supabase.from('leads').select('id, nome').ilike('whatsapp', `%${sufixo}%`).order('criado_em', { ascending: false }).limit(1)).data?.[0]
  const aluno = (ehLid || ehGrupo) ? null : (await supabase.from('alunos').select('id, nome').ilike('whatsapp', `%${sufixo}%`).limit(1)).data?.[0]

  let leadCriado: { id: string; nome: string | null } | null = null

  // Lead via botão de WhatsApp: a 1ª mensagem traz o CÓDIGO DA TURMA + o #ref do clique.
  if (!fromMe && !ehGrupo && !leadExistente && !aluno && texto) {
    const corrigeTypo = (s: string) => (s || '').replace(/novogamburgo/gi, 'novohamburgo')
    const txtLower = corrigeTypo(texto.toLowerCase())
    const { data: turmas } = await supabase.from('turmas').select('id, codigo').not('codigo', 'is', null)

    // 1) Casa pelo `ref` (#A1B2C3D4): clique EXATO desta pessoa → UTM/criativo certo.
    const refMatch = texto.match(/#([0-9A-Fa-f]{8})\b/)
    const ref = refMatch ? refMatch[1].toUpperCase() : null
    let click = ref
      ? (await supabase.from('wa_clicks').select('*').eq('ref', ref).is('consumido_em', null).order('criado_em', { ascending: false }).limit(1).maybeSingle()).data
      : null

    const acharTurma = (cod?: string | null) =>
      (turmas || []).find((t: any) => t.codigo && cod && t.codigo.toLowerCase() === corrigeTypo(cod.toLowerCase()))
    const turmaPorTexto = (turmas || []).find((t: any) => t.codigo && t.codigo.length >= 4 && txtLower.includes(t.codigo.toLowerCase()))
    const turmaMatch = (click ? acharTurma(click.codigo_turma) : null) || turmaPorTexto

    if (turmaMatch) {
      // Fallback (sem ref): pega o clique mais recente não-consumido da turma.
      if (!click) {
        const { data } = await supabase.from('wa_clicks').select('*').eq('codigo_turma', turmaMatch.codigo).is('consumido_em', null).order('criado_em', { ascending: false }).limit(1).maybeSingle()
        click = data || null
      }
      const vendedorId = await aplicarRateio(supabase, turmaMatch.id)
      const { data: novoLead } = await supabase.from('leads').insert({
        nome: nome || 'Lead WhatsApp',
        whatsapp: telefone,
        turma_id: turmaMatch.id,
        codigo_turma: turmaMatch.codigo,
        vendedor_id: vendedorId,
        etapa: 'aguardando_atendimento',
        origem: 'whatsapp',
        fbclid: click?.fbclid ?? null, fbc: click?.fbc ?? null, fbp: click?.fbp ?? null,
        utm_source: click?.utm_source ?? null, utm_medium: click?.utm_medium ?? null,
        utm_campaign: click?.utm_campaign ?? null, utm_content: click?.utm_content ?? null,
      }).select('id, nome').single()
      if (novoLead) {
        leadCriado = novoLead
        await supabase.from('lead_andamentos').insert({
          lead_id: novoLead.id, vendedor_id: vendedorId, tipo: 'criado',
          etapa_nova: 'aguardando_atendimento', observacao: 'Lead criado via botão de WhatsApp',
        })
        try {
          const capi = await sendLead({
            eventId: click?.event_id || randomUUID(),
            eventSourceUrl: click?.event_source_url,
            phone: ehLid ? null : telefone,
            firstName: nome,
            fbc: click?.fbc, fbp: click?.fbp,
            clientIp: click?.client_ip, userAgent: click?.user_agent,
            externalId: novoLead.id, codigoTurma: turmaMatch.codigo,
          })
          if (!capi.ok) console.error('CAPI Lead (WhatsApp) falhou:', capi.error)
        } catch (e) { console.error('CAPI Lead (WhatsApp) exception:', e) }
        if (click) await supabase.from('wa_clicks').update({ consumido_em: new Date().toISOString(), lead_id: novoLead.id }).eq('id', click.id)
      }
    } else if (click) {
      // Clique pelo /wa (site principal / bio) SEM turma — cria lead com origem certa (untagged).
      const { data: novoLead } = await supabase.from('leads').insert({
        nome: nome || 'Lead WhatsApp',
        whatsapp: telefone,
        etapa: 'aguardando_atendimento',
        origem: 'whatsapp',
        fbclid: click?.fbclid ?? null, fbc: click?.fbc ?? null, fbp: click?.fbp ?? null,
        utm_source: click?.utm_source ?? null, utm_medium: click?.utm_medium ?? null,
        utm_campaign: click?.utm_campaign ?? null, utm_content: click?.utm_content ?? null,
      }).select('id, nome').single()
      if (novoLead) {
        leadCriado = novoLead
        await supabase.from('lead_andamentos').insert({
          lead_id: novoLead.id, tipo: 'criado', etapa_nova: 'aguardando_atendimento',
          observacao: `Lead criado via site (${click.utm_source || 'site-principal'})${click.utm_content ? ' — ' + click.utm_content : ''}`,
        })
        await supabase.from('wa_clicks').update({ consumido_em: new Date().toISOString(), lead_id: novoLead.id }).eq('id', click.id)
      }
    }
  }

  const lead = leadCriado || leadExistente || null

  // ATRIBUIÇÃO ROBUSTA: se veio #ref e há lead (novo OU recorrente), consome o clique
  // e preenche o que faltar (utm/fbc/turma). Conserta o lead recorrente que reclica no anúncio.
  if (lead && !fromMe && texto) {
    const rf = texto.match(/#([0-9A-Fa-f]{8})\b/)
    if (rf) {
      const { data: clk } = await supabase.from('wa_clicks').select('*').eq('ref', rf[1].toUpperCase()).is('consumido_em', null).limit(1).maybeSingle()
      if (clk) {
        const { data: atual } = await supabase.from('leads').select('utm_source, utm_medium, utm_campaign, utm_content, fbc, fbp, fbclid, codigo_turma').eq('id', lead.id).maybeSingle()
        const patch: any = {}
        if (!atual?.utm_source && clk.utm_source) patch.utm_source = clk.utm_source
        if (!atual?.utm_medium && clk.utm_medium) patch.utm_medium = clk.utm_medium
        if (!atual?.utm_campaign && clk.utm_campaign) patch.utm_campaign = clk.utm_campaign
        if (!atual?.utm_content && clk.utm_content) patch.utm_content = clk.utm_content
        if (!atual?.fbc && clk.fbc) patch.fbc = clk.fbc
        if (!atual?.fbp && clk.fbp) patch.fbp = clk.fbp
        if (!atual?.fbclid && clk.fbclid) patch.fbclid = clk.fbclid
        if (!atual?.codigo_turma && clk.codigo_turma) {
          const cod = clk.codigo_turma.replace(/novogamburgo/gi, 'novohamburgo')
          const { data: t } = await supabase.from('turmas').select('id, codigo').ilike('codigo', cod).maybeSingle()
          if (t) { patch.codigo_turma = t.codigo; patch.turma_id = t.id }
        }
        if (Object.keys(patch).length) await supabase.from('leads').update(patch).eq('id', lead.id)
        await supabase.from('wa_clicks').update({ consumido_em: new Date().toISOString(), lead_id: lead.id }).eq('id', clk.id)
      }
    }
  }

  return { lead, leadCriado, leadExistente: leadExistente || null, aluno: aluno || null }
}
