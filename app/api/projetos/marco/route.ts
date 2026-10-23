import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { temSessao } from '@/lib/quem-eu-vejo'
import { ROTEIROS, LOCAIS, type Produto } from '@/lib/entrega'
import { combinarMarco, novoEncontro, conferirNovoEncontro, avisoDeRegiao, type DadosNovoEncontro } from '@/lib/marco-acoes'
import { isoBR } from '@/lib/periodos'
import { chamadaPermitida } from '@/lib/exigir-login'

// A máquina de estados do compromisso.
//   combinar  → data e hora acertadas com o cliente (na sessão anterior)
//   confirmar → reconfirmado, até 2 dias antes
//   concluir  → aconteceu. Desde 23/10/2026 NÃO obriga mais a marcar o próximo: os encontros do
//               meio não nascem com o projeto. Oferece (opcional) marcar a data do próximo que já
//               existe e/ou criar um novo encontro ali mesmo.
//   remarcar  → nova data; os do meio empurram junto, a âncora não sai do lugar.
//
// QUEM PODE: qualquer pessoa logada da empresa (admin, gestor, vendedor). Não há trava por papel
// nem por responsável do marco — o dono do marco só decide em que agenda ele aparece.

const ok = (o: any) => NextResponse.json({ ok: true, ...o })
const erro = (m: string, extra?: any) => NextResponse.json({ ok: false, error: m, ...(extra || {}) }, { status: 200 })

export async function POST(req: Request) {
  if (!(await chamadaPermitida(req))) return NextResponse.json({ ok: false, error: 'faça login' }, { status: 401 })
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
    const { data: irmaos } = await sb.from('projeto_marcos').select('id, ordem, ancora, estado, data_prevista, natureza, titulo, data_combinada, local')
      .eq('projeto_id', marco.projeto_id).order('ordem')

    const registrar = (tipo: string, observacao: string) =>
      sb.from('projeto_andamentos').insert({ org_id: org, projeto_id: marco.projeto_id, marco_id: marcoId, tipo, observacao, autor: (b.autor || '').toString() || null })

    const agora = new Date().toISOString()
    const fmt = (iso: string) => { const d = new Date(iso); return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) }

    // ───────────────────────────────────────────── a lista do que fazer
    // riscar um item não conclui o marco: o marco se conclui com o registro do que aconteceu
    if (acao === 'lista_item') {
      const lista: any[] = Array.isArray(marco.lista) ? [...marco.lista] : []
      const i = Number(b.indice)
      if (!(i >= 0 && i < lista.length)) return erro('item não existe')
      lista[i] = { ...lista[i], feito: !!b.feito }
      const { error } = await sb.from('projeto_marcos').update({ lista }).eq('id', marcoId)
      if (error) return erro(error.message)
      return NextResponse.json({ ok: true })
    }

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

      // A ANTIGA REGRA DE OURO VIROU CONVITE (23/10/2026). Os encontros do meio não nascem mais
      // com o projeto, então não dá pra exigir "marca o próximo". Concluir sem marcar nada funciona.
      // Os dois extras são opcionais e podem vir juntos:
      //   proxima_data_hora + proxima_local → marca a data do próximo encontro que JÁ existe
      //   novo_encontro { titulo, data, hora?, local? } → cria um encontro novo ali mesmo
      // Tudo é conferido ANTES de fechar este (data, lugar, região do dia): um aviso de região no
      // meio do caminho não pode deixar o encontro fechado e o próximo sem marcar.
      const proximoEncontro = (irmaos || []).find(m =>
        m.ordem > marco.ordem && m.natureza === 'encontro' && m.estado !== 'concluido' && m.estado !== 'cancelado')
      const inicio = String(projeto?.data_inicio || '').slice(0, 10)
      const mesmoAssim = !!b.mesmo_assim
      const autor = (b.autor || '').toString() || null

      let proxQuando: Date | null = null
      let proxLocal = ''
      if (b.proxima_data_hora) {
        if (!proximoEncontro) return erro('Não há próximo encontro criado pra marcar. Use "criar um novo encontro".')
        proxQuando = new Date(b.proxima_data_hora.toString())
        if (isNaN(proxQuando.getTime())) return erro('data do próximo encontro inválida')
        if (inicio && isoBR(proxQuando) < inicio) {
          return erro(`A data do próximo encontro é antes do início do projeto (${inicio.split('-').reverse().join('/')}). Confere o dia.`)
        }
        // o próximo entra na agenda COM lugar: sem região, ninguém vê se o dia já está comprometido
        proxLocal = (b.proxima_local || proximoEncontro.local || '').toString()
        if (!LOCAIS.some(l => l.chave === proxLocal)) return erro('Escolhe onde vai ser o próximo encontro (sede ou região, Lajeado ou Porto Alegre).')
        if (!mesmoAssim) {
          const av = await avisoDeRegiao(org, isoBR(proxQuando), proxLocal, [proximoEncontro.id])
          if (av) return erro(av, { precisa_confirmar_regiao: true })
        }
      }

      const n = b.novo_encontro && typeof b.novo_encontro === 'object' ? b.novo_encontro : null
      const dadosNovo: DadosNovoEncontro | null = n ? {
        titulo: (n.titulo || '').toString(), data: (n.data || '').toString(), hora: (n.hora || '').toString() || null,
        local: (n.local || '').toString() || null, mesmoAssim, autor,
      } : null
      if (dadosNovo) {
        const p = await conferirNovoEncontro(org, inicio, dadosNovo)
        if (p) return erro(p.error, p.precisa_confirmar_regiao ? { precisa_confirmar_regiao: true } : undefined)
      }

      await sb.from('projeto_marcos').update({
        estado: 'concluido', concluido_em: agora, registro: registro || null, atualizado_em: agora,
      }).eq('id', marcoId)
      await registrar('concluido', `✔️ ${marco.titulo} concluído.${registro ? ' — ' + registro : ''}`)

      const avisos: string[] = []
      // marca o próximo, se veio — pelo mesmo caminho do combinar (empurra os seguintes, zera a reconfirmação)
      if (proximoEncontro && proxQuando) {
        const r = await combinarMarco(org, proximoEncontro.id, proxQuando.toISOString(), proxLocal, {
          acao: proximoEncontro.data_combinada ? 'remarcar' : 'combinar', mesmoAssim: true, autor,
        })
        if (!r.ok) avisos.push(`O encontro foi concluído, mas o próximo não foi marcado: ${r.error}`)
        else if (r.aviso) avisos.push(r.aviso)
      }
      // cria o encontro novo, se veio
      let criouNovo = false
      if (dadosNovo && projeto) {
        const r = await novoEncontro(org, projeto.id, { ...dadosNovo, mesmoAssim: true })
        if (!r.ok) avisos.push(`O encontro foi concluído, mas o novo encontro não foi criado: ${r.error}`)
        else { criouNovo = true; if (r.aviso) avisos.push(r.aviso) }
      }

      // avança a fase do projeto e fecha se acabou
      if (projeto) {
        const r = ROTEIROS[projeto.produto as Produto]
        const restantes = (irmaos || []).filter(m => m.id !== marcoId && m.estado !== 'concluido' && m.estado !== 'cancelado')
        const patch: any = { atualizado_em: agora }
        const idx = r?.fases.findIndex(f => f.chave === projeto.fase) ?? -1
        if (r && idx >= 0 && idx < r.fases.length - 1) patch.fase = r.fases[idx + 1].chave
        // criou um encontro novo agora? então a entrega não acabou, mesmo que este fosse o último
        if (!restantes.length && !criouNovo) {
          patch.status = projeto.fim_tipo === 'manutencao' ? 'manutencao' : 'concluido'
          patch.fase = r?.fases[r.fases.length - 1]?.chave || projeto.fase
          await registrar('fim', patch.status === 'manutencao'
            ? '🔧 Entrega concluída — o projeto passa a manutenção.'
            : '🏁 Entrega concluída.')
        }
        await sb.from('projetos').update(patch).eq('id', projeto.id)
      }

      return ok({ aviso: avisos.length ? avisos.join(' ') : null })
    }

    return erro('ação inválida')
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
