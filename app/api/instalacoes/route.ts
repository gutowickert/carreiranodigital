import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { quemEuVejo } from '@/lib/quem-eu-vejo'
import { gerarMensalidades, mensalidadesEmAberto } from '@/lib/mensalidades'

export const maxDuration = 60

// A TORRE DE CONTROLE — todos os sistemas que a gente instalou, num lugar só.
//
// ⚠️ SÓ ADMIN. Aqui aparece o endereço do sistema de cada cliente e o valor do contrato dele.
// A tela também é escondida do menu pra quem não é admin, mas a trava que vale é esta: menu
// escondido é decoração se a rota responde pra qualquer um.
//
// ⚠️ NENHUMA CREDENCIAL DE CLIENTE PASSA POR AQUI. O que se guarda é o ENDEREÇO. Quem clica cai
// no login daquele cliente e entra com a conta dele. A escola não guarda chave de banco de
// ninguém — se guardasse, um vazamento aqui levaria todos os clientes juntos.

const ok = (o: any) => NextResponse.json({ ok: true, ...o })
const erro = (m: string, s = 200) => NextResponse.json({ ok: false, error: m }, { status: s })

async function souAdmin(auth: string | null, org: string) {
  const quem = await quemEuVejo(auth, org)
  if (!quem) return null
  const { data } = await sb.from('usuarios_perfil').select('papel').eq('id', quem.eu.id).maybeSingle()
  return data?.papel === 'admin' ? quem : null
}

export async function GET(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    const org = await orgDaRequest(auth)
    if (!(await souAdmin(auth, org))) return erro('só administradores', 403)

    // o motor roda junto com a abertura da tela: quem abre vê o mês em dia, sem esperar o cron.
    // É idempotente, então abrir dez vezes não cria dez cobranças.
    let geradas: string[] = []
    try { geradas = (await gerarMensalidades()).criados } catch { /* a tela abre mesmo se o motor falhar */ }

    const { data: instalacoes } = await sb.from('instalacoes')
      .select('id, nome, url, projeto_id, tipo, ativo, observacoes, criado_em')
      .eq('org_id', org).eq('ativo', true).order('tipo').order('nome')

    const ids = (instalacoes || []).map(i => i.projeto_id).filter(Boolean) as string[]
    const { data: projetos } = ids.length
      ? await sb.from('projetos')
        .select('id, cliente, produto, status, fase, data_inicio, mensalidade_dia, mensalidade_valor, cobranca_desde, valor_implantacao')
        .in('id', ids)
      : { data: [] as any[] }
    const porProjeto = new Map((projetos || []).map((p: any) => [p.id, p]))

    // as cobranças em aberto, agrupadas por projeto
    const abertas = await mensalidadesEmAberto()
    const hoje = new Date().toISOString().slice(0, 10)
    const porGrupo = new Map<string, any[]>()
    for (const l of abertas) {
      const g = porGrupo.get(l.grupo_recorrencia) || []
      g.push(l); porGrupo.set(l.grupo_recorrencia, g)
    }

    // o estado da implantação: o questionário daquele cliente, se existir
    const { data: imps } = await sb.from('implantacoes').select('slug, nome')
    const { data: respostas } = await sb.from('implantacao_respostas').select('slug')
    const porSlug = new Map<string, number>()
    for (const r of respostas || []) porSlug.set(r.slug, (porSlug.get(r.slug) || 0) + 1)

    const lista = (instalacoes || []).map(i => {
      const p: any = i.projeto_id ? porProjeto.get(i.projeto_id) : null
      const cobrancas = (porGrupo.get(i.projeto_id || '') || [])
      const vencidas = cobrancas.filter(c => String(c.data_vencimento) < hoje)
      // casa o questionário pelo nome do sistema OU do contrato — foi assim que se descobriu que
      // "GAJA" e "Jhones Azambuja" eram a mesma coisa
      const imp = (imps || []).find(x =>
        x.nome?.toLowerCase() === i.nome.toLowerCase() ||
        (p?.cliente && x.nome?.toLowerCase() === p.cliente.toLowerCase()))

      return {
        id: i.id, nome: i.nome, url: i.url, tipo: i.tipo, observacoes: i.observacoes,
        contrato: p ? { id: p.id, cliente: p.cliente, produto: p.produto, status: p.status, fase: p.fase, desde: p.data_inicio } : null,
        cobranca: p ? {
          valor: p.mensalidade_valor, dia: p.mensalidade_dia, desde: p.cobranca_desde,
          // sem `cobranca_desde`, ou sem dia/valor, o motor não gera — a tela diz por quê
          ligada: !!(p.cobranca_desde && p.mensalidade_dia && p.mensalidade_valor),
          motivo: !p.cobranca_desde ? 'sem data de início' : !p.mensalidade_dia ? 'dia não definido' : !p.mensalidade_valor ? 'valor não definido' : null,
          emAberto: cobrancas.length, vencidas: vencidas.length,
          proxima: cobrancas[0] ? { valor: cobrancas[0].valor, vence: cobrancas[0].data_vencimento, mes: cobrancas[0].mes_referencia } : null,
        } : null,
        implantacao: imp ? { slug: imp.slug, respostas: porSlug.get(imp.slug) || 0 } : null,
      }
    })

    const mrr = lista.filter(i => i.tipo === 'cliente' && i.cobranca?.valor).reduce((s, i) => s + Number(i.cobranca!.valor), 0)
    return ok({ instalacoes: lista, mrr, geradas: geradas.length })
  } catch (e: any) {
    return erro(e?.message || 'erro')
  }
}

export async function POST(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    const org = await orgDaRequest(auth)
    if (!(await souAdmin(auth, org))) return erro('só administradores', 403)

    const b = await req.json().catch(() => ({} as any))
    const nome = (b.nome || '').toString().trim().slice(0, 120)
    if (!nome) return erro('falta o nome do sistema')
    const url = (b.url || '').toString().trim().slice(0, 300) || null
    if (url && !/^https:\/\//.test(url)) return erro('o endereço precisa começar com https://')

    const patch = {
      org_id: org, nome, url,
      projeto_id: (b.projeto_id || '').toString() || null,
      tipo: b.tipo === 'interno' ? 'interno' : 'cliente',
      observacoes: (b.observacoes || '').toString().slice(0, 1000) || null,
      atualizado_em: new Date().toISOString(),
    }

    // A COBRANÇA se edita aqui também, porque é aqui que se olha. Ela mora no PROJETO (é do
    // contrato, não do sistema) — a tela só é outra porta pro mesmo dado, e a ficha da entrega
    // continua valendo.
    if (patch.projeto_id && b.cobranca) {
      const c = b.cobranca
      const num = (x: any) => (x === '' || x == null) ? null : Number(String(x).replace(',', '.'))
      const valor = num(c.valor), dia = num(c.dia)
      if (valor != null && (!Number.isFinite(valor) || valor < 0)) return erro('valor inválido')
      if (dia != null && (!Number.isFinite(dia) || dia < 1 || dia > 31)) return erro('o dia tem que ser de 1 a 31')
      const desde = (c.desde || '').toString().trim() || null
      if (desde && !/^\d{4}-\d{2}-\d{2}$/.test(desde)) return erro('data de início inválida')

      const { error: e2 } = await sb.from('projetos').update({
        mensalidade_valor: valor, mensalidade_dia: dia, cobranca_desde: desde, atualizado_em: new Date().toISOString(),
      }).eq('id', patch.projeto_id)
      if (e2) return erro(e2.message)
    }

    if (b.id) {
      const { error } = await sb.from('instalacoes').update(patch).eq('org_id', org).eq('id', b.id)
      if (error) return erro(error.message)
      return ok({ atualizada: true })
    }
    const { error } = await sb.from('instalacoes').insert(patch)
    if (error) return erro(error.message)
    return ok({ criada: true })
  } catch (e: any) {
    return erro(e?.message || 'erro')
  }
}
