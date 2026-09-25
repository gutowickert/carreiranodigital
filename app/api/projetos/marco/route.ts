import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { temSessao } from '@/lib/quem-eu-vejo'
import { ROTEIROS, type Produto } from '@/lib/entrega'
import { combinarMarco } from '@/lib/marco-acoes'

// A máquina de estados do compromisso.
//   combinar  → data e hora acertadas com o cliente (na sessão anterior)
//   confirmar → reconfirmado, até 2 dias antes
//   concluir  → aconteceu. 🔒 NÃO FECHA sem marcar o próximo encontro.
//   remarcar  → nova data; os do meio empurram junto, a âncora não sai do lugar.

const ok = (o: any) => NextResponse.json({ ok: true, ...o })
const erro = (m: string, extra?: any) => NextResponse.json({ ok: false, error: m, ...(extra || {}) }, { status: 200 })

export async function POST(req: Request) {
  try {
    // Sem login, não responde: sem token, `orgDaRequest` cai na empresa padrão e a rota gravava
    // como se fosse gente de dentro. A tela da ficha já manda o login.
    const auth = req.headers.get('authorization')
    if (!(await temSessao(auth))) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
    const org = await orgDaRequest(auth)
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
    // dono do marco: é quem recebe na agenda. Vazio = segue o responsável do projeto.
    if (acao === 'responsavel') {
      const novo = (b.responsavel_id || '').toString() || null
      if (novo) {
        const { data: pessoa } = await sb.from('usuarios_perfil').select('id, nome').eq('org_id', org).eq('id', novo).eq('ativo', true).maybeSingle()
        if (!pessoa) return erro('pessoa não encontrada')
      }
      await sb.from('projeto_marcos').update({ responsavel_id: novo, atualizado_em: agora }).eq('id', marcoId)
      return ok({})
    }

    // Só REUNIÃO com o cliente (natureza 'encontro') tem hora combinada. Tarefa interna ("Primeira semana
    // no grupo") e marco ("CRM no ar") só se concluem. Deixar marcar hora nelas fazia a mesma data virar
    // duas "reuniões" na agenda (caso da Cristina, 15/09/2026).
    if (['combinar', 'remarcar', 'confirmar', 'a_remarcar'].includes(acao) && marco.natureza !== 'encontro') {
      return erro(`"${marco.titulo}" não é reunião com o cliente — não tem hora pra combinar. É só concluir quando for feito.`)
    }

    if (acao === 'combinar' || acao === 'remarcar') {
      // a lógica vive em lib/marco-acoes.ts: é o mesmo caminho do assistente do WhatsApp
      const r = await combinarMarco(org, marcoId, (b.data_hora || '').toString(), (b.local || '').toString(), { acao, mesmoAssim: !!b.mesmo_assim, autor: (b.autor || '').toString() || null })
      if (!r.ok) return NextResponse.json({ ok: false, error: r.error, ...(r.precisa_confirmar_regiao ? { precisa_confirmar_regiao: true } : {}) }, { status: 200 })
      return ok({ aviso: r.aviso })
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

      if (b.proxima_data_hora) {
        const px = new Date(b.proxima_data_hora.toString())
        const inicio = String(projeto?.data_inicio || '').slice(0, 10)
        if (isNaN(px.getTime())) return erro('data do próximo encontro inválida')
        if (inicio && px.toISOString().slice(0, 10) < inicio) {
          return erro(`A data do próximo encontro é antes do início do projeto (${inicio.split('-').reverse().join('/')}). Confere o dia.`)
        }
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
          // o próximo nasce COM lugar quando quem fechou informou — senão entraria na agenda sem
          // região, e o problema que isto resolve voltaria pela porta dos fundos
          const proxLocal = (b.proxima_local || '').toString()
          await sb.from('projeto_marcos').update({
            data_combinada: nova.toISOString(), data_prevista: novaData, estado: 'combinado', atualizado_em: agora,
            ...(LOCAIS.some(l => l.chave === proxLocal) ? { local: proxLocal } : {}),
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
