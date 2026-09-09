import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { diasAte, empurrarPosteriores, ROTEIROS, type Produto } from '@/lib/entrega'

// A máquina de estados do compromisso.
//   combinar  → data e hora acertadas com o cliente (na sessão anterior)
//   confirmar → reconfirmado, até 2 dias antes
//   concluir  → aconteceu. 🔒 NÃO FECHA sem marcar o próximo encontro.
//   remarcar  → nova data; os do meio empurram junto, a âncora não sai do lugar.

const ok = (o: any) => NextResponse.json({ ok: true, ...o })
const erro = (m: string, extra?: any) => NextResponse.json({ ok: false, error: m, ...(extra || {}) }, { status: 200 })

export async function POST(req: Request) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({} as any))
    const acao = (b.acao || '').toString()
    const marcoId = (b.id || '').toString()
    if (!marcoId) return erro('falta o marco')

    const { data: marco } = await sb.from('projeto_marcos').select('*').eq('org_id', org).eq('id', marcoId).maybeSingle()
    if (!marco) return erro('marco não encontrado')

    const { data: projeto } = await sb.from('projetos').select('*').eq('id', marco.projeto_id).maybeSingle()
    const { data: irmaos } = await sb.from('projeto_marcos').select('id, ordem, ancora, estado, data_prevista, natureza, titulo, data_combinada')
      .eq('projeto_id', marco.projeto_id).order('ordem')

    const registrar = (tipo: string, observacao: string) =>
      sb.from('projeto_andamentos').insert({ org_id: org, projeto_id: marco.projeto_id, marco_id: marcoId, tipo, observacao, autor: (b.autor || '').toString() || null })

    const agora = new Date().toISOString()
    const fmt = (iso: string) => { const d = new Date(iso); return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) }

    // ───────────────────────────────────────────── combinar / remarcar
    if (acao === 'combinar' || acao === 'remarcar') {
      const dataHora = (b.data_hora || '').toString()
      if (!dataHora) return erro('informe a data e a hora combinadas')
      const nova = new Date(dataHora)
      if (isNaN(nova.getTime())) return erro('data inválida')

      const novaData = nova.toISOString().slice(0, 10)
      const antes = (marco.data_combinada || marco.data_prevista || '').slice(0, 10)
      const desloc = antes ? diasAte(novaData, antes) : 0

      await sb.from('projeto_marcos').update({
        data_combinada: nova.toISOString(), data_prevista: novaData,
        estado: 'combinado', confirmado_em: null, atualizado_em: agora,
      }).eq('id', marcoId)

      // os posteriores acompanham o deslocamento; a âncora fica onde está
      let aviso: string | null = null
      if (desloc !== 0 && irmaos?.length) {
        const { mover, esbarrouNaAncora } = empurrarPosteriores(irmaos as any, marco.ordem, desloc)
        for (const m of mover) await sb.from('projeto_marcos').update({ data_prevista: m.data_prevista, atualizado_em: agora }).eq('id', m.id)
        if (esbarrouNaAncora) aviso = 'Um dos próximos passos bateu na data de fim do contrato e não foi empurrado. Vale olhar o prazo.'
      }

      await registrar(acao, `${acao === 'combinar' ? '📅 Combinado' : '🔄 Remarcado'}: ${marco.titulo} para ${fmt(nova.toISOString())}${desloc ? ` (${desloc > 0 ? '+' : ''}${desloc} dias)` : ''}.`)
      return ok({ aviso })
    }

    // ───────────────────────────────────────────────────── confirmar
    if (acao === 'confirmar') {
      if (!marco.data_combinada) return erro('esse compromisso ainda não tem data combinada com o cliente')
      await sb.from('projeto_marcos').update({ estado: 'confirmado', confirmado_em: agora, atualizado_em: agora }).eq('id', marcoId)
      await registrar('confirmado', `✅ Confirmado com o cliente: ${marco.titulo} em ${fmt(marco.data_combinada)}.`)
      return ok({})
    }

    // ───────────────────────────────────────── marcar como a remarcar
    if (acao === 'a_remarcar') {
      await sb.from('projeto_marcos').update({ estado: 'a_remarcar', atualizado_em: agora }).eq('id', marcoId)
      await registrar('a_remarcar', `⚠️ ${marco.titulo} ficou sem reconfirmação — precisa remarcar.`)
      return ok({})
    }

    // ───────────────────────────────────────────────────── concluir
    if (acao === 'concluir') {
      const registro = (b.registro || '').toString().trim()

      // 🔒 a regra de ouro: encontro só fecha marcando o próximo encontro
      const proximoEncontro = (irmaos || []).find(m =>
        m.ordem > marco.ordem && m.natureza === 'encontro' && m.estado !== 'concluido' && m.estado !== 'cancelado')

      if (marco.natureza === 'encontro' && proximoEncontro && !b.proxima_data_hora) {
        return erro('Antes de fechar, marca o próximo encontro com o cliente.', {
          precisa_proximo: { id: proximoEncontro.id, titulo: proximoEncontro.titulo, data_prevista: proximoEncontro.data_prevista },
        })
      }

      await sb.from('projeto_marcos').update({
        estado: 'concluido', concluido_em: agora, registro: registro || null, atualizado_em: agora,
      }).eq('id', marcoId)
      await registrar('concluido', `✔️ ${marco.titulo} concluído.${registro ? ' — ' + registro : ''}`)

      // combina o próximo, se veio
      if (proximoEncontro && b.proxima_data_hora) {
        const nova = new Date(b.proxima_data_hora.toString())
        if (!isNaN(nova.getTime())) {
          const novaData = nova.toISOString().slice(0, 10)
          const antes = (proximoEncontro.data_prevista || '').slice(0, 10)
          const desloc = antes ? diasAte(novaData, antes) : 0
          await sb.from('projeto_marcos').update({
            data_combinada: nova.toISOString(), data_prevista: novaData, estado: 'combinado', atualizado_em: agora,
          }).eq('id', proximoEncontro.id)
          if (desloc !== 0 && irmaos?.length) {
            const { mover } = empurrarPosteriores(irmaos as any, proximoEncontro.ordem, desloc)
            for (const m of mover) await sb.from('projeto_marcos').update({ data_prevista: m.data_prevista, atualizado_em: agora }).eq('id', m.id)
          }
          await registrar('combinado', `📅 Próximo combinado na hora: ${proximoEncontro.titulo} em ${fmt(nova.toISOString())}.`)
        }
      }

      // avança a fase do projeto e fecha se acabou
      if (projeto) {
        const r = ROTEIROS[projeto.produto as Produto]
        const restantes = (irmaos || []).filter(m => m.id !== marcoId && m.estado !== 'concluido' && m.estado !== 'cancelado')
        const patch: any = { atualizado_em: agora }
        const idx = r?.fases.findIndex(f => f.chave === projeto.fase) ?? -1
        if (r && idx >= 0 && idx < r.fases.length - 1) patch.fase = r.fases[idx + 1].chave
        if (!restantes.length) {
          patch.status = projeto.fim_tipo === 'manutencao' ? 'manutencao' : 'concluido'
          patch.fase = r?.fases[r.fases.length - 1]?.chave || projeto.fase
          await registrar('fim', patch.status === 'manutencao'
            ? '🔧 Entrega concluída — o projeto passa a manutenção.'
            : '🏁 Entrega concluída.')
        }
        await sb.from('projetos').update(patch).eq('id', projeto.id)
      }

      return ok({})
    }

    return erro('ação inválida')
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
