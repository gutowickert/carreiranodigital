import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { quemEuVejo } from '@/lib/quem-eu-vejo'
import { hojeBR } from '@/lib/periodos'

// CLIENTES COM RECORRÊNCIA (13/10/2026, pedido do Rick) — os clientes do CRM que pagam por mês,
// 12 meses em fileira, e o botão de "pagou" que lança no financeiro.
//
// ⚠️ OS DADOS SÃO OS DO CADASTRO, não uma cópia. Valor, dia e início saem de `projetos`
// (mensalidade_valor, mensalidade_dia, cobranca_desde) — os mesmos que se editam em
// Sistemas → Clientes do CRM. Cliente sem início ou sem dia não aparece nos meses: a tela diz o que falta.
//
// ⚠️ NÃO CRIA OS 12 MESES DE UMA VEZ. O lançamento só nasce no clique de "pagou" — 12 previstos de
// cara inflariam o "previsto" do Fluxo e dos relatórios.
//
// ⚠️ NUNCA DUPLICA. O mês de um cliente é `grupo_recorrencia = projeto.id` + `mes_referencia`, a
// mesma chave do motor (lib/mensalidades.ts). Se o motor já criou o previsto daquele mês, o "pagou"
// ATUALIZA esse previsto pra realizado; se não existe, cria já realizado — e o motor, achando o mês,
// não cria outro.

const CATEGORIA = 'mensalidade_cliente'
const MESES = 12

const ok = (o: any) => NextResponse.json({ ok: true, ...o })
const erro = (m: string, s = 200) => NextResponse.json({ ok: false, error: m }, { status: s })

// mesmo critério de Clientes do CRM: aqui aparece valor de contrato de cliente
async function souAdmin(auth: string | null, org: string) {
  const quem = await quemEuVejo(auth, org)
  if (!quem) return null
  const { data } = await sb.from('usuarios_perfil').select('papel').eq('id', quem.eu.id).maybeSingle()
  return data?.papel === 'admin' ? quem : null
}

/** O vencimento daquele mês. Dia 31 em mês de 30 cai no último dia — igual ao motor. */
function vencimento(ano: number, mes0: number, dia: number): string {
  const ultimo = new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate()
  const d = Math.min(Math.max(1, dia), ultimo)
  return `${ano}-${String(mes0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Os meses de cobrança a partir do início, `n` deles. Pula o mês do início se o vencimento cai antes dele (como o motor). */
function mesesDesde(desde: string, dia: number, n: number) {
  const out: { mes: string; vence: string }[] = []
  const ini = new Date(desde + 'T12:00:00Z')
  for (let d = new Date(Date.UTC(ini.getUTCFullYear(), ini.getUTCMonth(), 1)); out.length < n; d.setUTCMonth(d.getUTCMonth() + 1)) {
    const vence = vencimento(d.getUTCFullYear(), d.getUTCMonth(), dia)
    if (vence < desde) continue
    out.push({ mes: vence.slice(0, 8) + '01', vence })
  }
  return out
}

export async function GET(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    const org = await orgDaRequest(auth)
    if (!(await souAdmin(auth, org))) return erro('só administradores', 403)

    // bloco de 12 meses: 0 = os 12 primeiros desde o início da cobrança, 1 = os 12 seguintes…
    const bloco = Math.max(0, Math.min(10, Number(new URL(req.url).searchParams.get('bloco') || 0) || 0))

    // os clientes são os sistemas de cliente ativos com contrato ligado (os internos nunca cobram)
    const { data: insts } = await sb.from('instalacoes')
      .select('nome, projeto_id').eq('org_id', org).eq('ativo', true).eq('tipo', 'cliente').not('projeto_id', 'is', null)
    const ids = [...new Set((insts || []).map(i => i.projeto_id as string))]
    const { data: projetos } = ids.length
      ? await sb.from('projetos')
        .select('id, cliente, status, mensalidade_dia, mensalidade_valor, cobranca_desde')
        .in('id', ids).in('status', ['ativo', 'manutencao'])
      : { data: [] as any[] }

    // os lançamentos de mensalidade desses clientes (poucos: 1 por mês por cliente — sem risco do limite de 1000)
    const pids = (projetos || []).map((p: any) => p.id)
    const { data: lancs } = pids.length
      ? await sb.from('lancamentos_empresa')
        .select('id, valor, status, mes_referencia, data_vencimento, data_pagamento, conta_id, grupo_recorrencia, recorrente')
        .eq('org_id', org).in('grupo_recorrencia', pids).eq('recorrente', true)
      : { data: [] as any[] }

    const hoje = hojeBR()
    const clientes = (projetos || []).map((p: any) => {
      const nome = (insts || []).find(i => i.projeto_id === p.id)?.nome || p.cliente
      const falta = !p.mensalidade_valor ? 'valor da mensalidade' : !p.mensalidade_dia ? 'dia do vencimento' : !p.cobranca_desde ? 'data de início da cobrança' : null
      if (falta) return { id: p.id, nome, contrato: p.cliente, valor: p.mensalidade_valor, dia: p.mensalidade_dia, desde: p.cobranca_desde, falta, meses: [] }

      const todos = mesesDesde(p.cobranca_desde, p.mensalidade_dia, MESES * (bloco + 1))
      const meses = todos.slice(MESES * bloco).map(m => {
        const l = (lancs || []).find((x: any) => x.grupo_recorrencia === p.id && String(x.mes_referencia).slice(0, 10) === m.mes)
        const pago = l?.status === 'realizado'
        const vence = l?.data_vencimento ? String(l.data_vencimento).slice(0, 10) : m.vence
        return {
          mes: m.mes, vence,
          valor: Number(l?.valor ?? p.mensalidade_valor),
          situacao: pago ? 'pago' : vence < hoje ? 'vencido' : 'a_vencer',
          pagoEm: pago ? (l.data_pagamento ? String(l.data_pagamento).slice(0, 10) : null) : null,
          lancamentoId: l?.id || null,
        }
      })
      return { id: p.id, nome, contrato: p.cliente, valor: Number(p.mensalidade_valor), dia: p.mensalidade_dia, desde: p.cobranca_desde, falta: null, meses }
    })

    const { data: caixas } = await sb.from('contas_financeiras').select('id, nome').eq('ativo', true).order('nome')
    return ok({ clientes, caixas: caixas || [], bloco, hoje })
  } catch (e: any) {
    return erro(e?.message || 'erro')
  }
}

// "PAGOU" — grava o pagamento de UM mês de UM cliente.
export async function POST(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    const org = await orgDaRequest(auth)
    if (!(await souAdmin(auth, org))) return erro('só administradores', 403)

    const b = await req.json().catch(() => ({} as any))
    const projetoId = (b.projeto_id || '').toString()
    const mes = (b.mes || '').toString()
    const contaId = (b.conta_id || '').toString()
    const dataPag = (b.data_pagamento || '').toString()
    const valor = Number(String(b.valor ?? '').replace(',', '.'))
    if (!projetoId) return erro('falta o cliente')
    if (!/^\d{4}-\d{2}-01$/.test(mes)) return erro('mês inválido')
    if (!contaId) return erro('escolha o caixa onde o dinheiro entrou')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataPag)) return erro('data do pagamento inválida')
    if (dataPag > hojeBR()) return erro('a data do pagamento não pode ser depois de hoje')
    if (!Number.isFinite(valor) || valor <= 0) return erro('valor inválido')

    const { data: p } = await sb.from('projetos')
      .select('id, cliente, mensalidade_dia, mensalidade_valor, cobranca_desde').eq('id', projetoId).maybeSingle()
    if (!p) return erro('cliente não encontrado')
    if (!p.mensalidade_dia || !p.cobranca_desde) return erro('a cobrança deste cliente não está completa em Clientes do CRM')
    const vence = vencimento(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, p.mensalidade_dia)
    if (vence < p.cobranca_desde) return erro('este mês é anterior ao início da cobrança')

    const { data: caixa } = await sb.from('contas_financeiras').select('id').eq('id', contaId).eq('ativo', true).maybeSingle()
    if (!caixa) return erro('caixa não encontrado')

    // sem maybeSingle: com 2 linhas ele devolve vazio e a gente criaria uma terceira
    const { data: doMes, error: eLer } = await sb.from('lancamentos_empresa')
      .select('id, status').eq('org_id', org).eq('grupo_recorrencia', p.id).eq('mes_referencia', mes).eq('recorrente', true)
    if (eLer) return erro(eLer.message)
    if ((doMes || []).some(l => l.status === 'realizado')) return erro('este mês já está pago')
    if ((doMes || []).length > 1) return erro('este mês tem mais de um lançamento — confira em Lançamentos antes')
    const existe = doMes?.[0]

    if (existe) {
      // o previsto que o motor criou vira o pagamento — sem criar outro (contaria o dinheiro duas vezes)
      const { error } = await sb.from('lancamentos_empresa').update({
        status: 'realizado', data_pagamento: dataPag, conta_id: contaId, valor,
      }).eq('id', existe.id).eq('status', 'previsto')
      if (error) return erro(error.message)
      return ok({ atualizado: true })
    }

    const { error } = await sb.from('lancamentos_empresa').insert({
      org_id: org, tipo: 'receita', categoria: CATEGORIA, unidade: 'geral',
      descricao: `Mensalidade ${p.cliente}`,
      valor, mes_referencia: mes, data_vencimento: vence, data_pagamento: dataPag,
      status: 'realizado', recorrente: true, grupo_recorrencia: p.id, conta_id: contaId,
    })
    if (error) return erro(error.message)
    return ok({ criado: true })
  } catch (e: any) {
    return erro(e?.message || 'erro')
  }
}
