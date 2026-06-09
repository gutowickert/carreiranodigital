import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Helper: normaliza campos que vêm com nomes diferentes em webhooks
function pick(obj: any, keys: string[], fallback: any = null) {
  for (const k of keys) {
    const parts = k.split('.')
    let v = obj
    for (const p of parts) v = v?.[p]
    if (v !== undefined && v !== null && v !== '') return v
  }
  return fallback
}

export async function POST(req: NextRequest) {
  let payload: any = {}
  let logId: string | null = null

  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  // Salva log primeiro (mesmo se falhar depois, registro fica)
  const { data: log, error: errLog } = await supabase.from('webhook_logs').insert({
    origem: 'herospark',
    evento: pick(payload, ['event', 'event_name', 'tipo']),
    payload,
    status: 'recebido',
  }).select().single()

  if (errLog) {
    console.error('[webhook] erro ao inserir log:', errLog)
    return NextResponse.json({ error: 'Erro ao salvar log: ' + errLog.message, payload_received: payload }, { status: 500 })
  }

  logId = log?.id || null
  if (!logId) {
    return NextResponse.json({ error: 'Log não foi criado (sem id retornado)', payload_received: payload }, { status: 500 })
  }

  try {
    // Extrai dados do payload
    const productId = pick(payload, ['product.id', 'product_id', 'data.product.id', 'produto.id'])
    const productName = pick(payload, ['product.name', 'product_name', 'data.product.name', 'produto.nome'])
    const buyerName = pick(payload, ['buyer.name', 'customer.name', 'data.buyer.name', 'comprador.nome', 'student.name'])
    const buyerEmail = pick(payload, ['buyer.email', 'customer.email', 'data.buyer.email', 'comprador.email', 'student.email'])
    const buyerCpf = pick(payload, ['buyer.cpf', 'customer.cpf', 'data.buyer.cpf', 'comprador.cpf', 'student.cpf'])
    const buyerPhone = pick(payload, ['buyer.phone', 'customer.phone', 'data.buyer.phone', 'comprador.telefone', 'student.phone'])
    const amount = parseFloat(pick(payload, ['amount', 'value', 'total', 'data.amount', 'valor'], '0'))
    const paymentMethod = pick(payload, ['payment_method', 'data.payment_method', 'metodo_pagamento'], 'pix')

    if (!buyerEmail && !buyerCpf) {
      await supabase.from('webhook_logs').update({ status: 'erro', erro: 'Faltam CPF e email do comprador', processado_em: new Date().toISOString() }).eq('id', logId!)
      return NextResponse.json({ error: 'CPF ou email obrigatórios' }, { status: 400 })
    }

    if (!productId && !productName) {
      await supabase.from('webhook_logs').update({ status: 'erro', erro: 'Faltam dados do produto', processado_em: new Date().toISOString() }).eq('id', logId!)
      return NextResponse.json({ error: 'Produto não identificado' }, { status: 400 })
    }

    // 1) Encontra ou cria aluno
    let alunoId: string | null = null
    let alunoNome = buyerName || 'Sem nome'

    if (buyerCpf) {
      const { data } = await supabase.from('alunos').select('id, nome').eq('cpf', buyerCpf).limit(1).single()
      if (data) { alunoId = data.id; alunoNome = data.nome }
    }
    if (!alunoId && buyerEmail) {
      const { data } = await supabase.from('alunos').select('id, nome').eq('email', buyerEmail).limit(1).single()
      if (data) { alunoId = data.id; alunoNome = data.nome }
    }
    if (!alunoId) {
      const { data: novo, error: errAluno } = await supabase.from('alunos').insert({
        nome: buyerName || 'Aluno HeroSpark',
        cpf: buyerCpf || null,
        email: buyerEmail || `herospark-${Date.now()}@semEmail.com`,
        whatsapp: buyerPhone || null,
      }).select().single()
      if (errAluno || !novo) {
        await supabase.from('webhook_logs').update({ status: 'erro', erro: 'Erro ao criar aluno: ' + errAluno?.message, processado_em: new Date().toISOString() }).eq('id', logId!)
        return NextResponse.json({ error: errAluno?.message }, { status: 500 })
      }
      alunoId = novo.id
    }

    // 2) Encontra turma pelo CÓDIGO embutido no nome do produto
    let turmaId: string | null = null
    let turmaCodigo: string | null = null

    // Busca todas as turmas com código preenchido
    const { data: turmasComCodigo } = await supabase.from('turmas')
      .select('id, codigo')
      .not('codigo', 'is', null)
      .neq('codigo', '')

    if (turmasComCodigo && productName) {
      const nomeUpper = productName.toString().toUpperCase()
      for (const t of turmasComCodigo) {
        if (t.codigo && nomeUpper.includes(t.codigo.toUpperCase())) {
          turmaId = t.id
          turmaCodigo = t.codigo
          break
        }
      }
    }

    if (!turmaId) {
      await supabase.from('webhook_logs').update({
        status: 'ignorado',
        erro: `Nenhuma turma com código encontrado no nome do produto: "${productName}"`,
        processado_em: new Date().toISOString()
      }).eq('id', logId!)
      return NextResponse.json({ warn: 'Nenhuma turma identificada pelo código no nome do produto' }, { status: 200 })
    }

    // 3) Busca caixa HeroSpark
    const { data: caixaHero } = await supabase.from('contas_financeiras')
      .select('id').eq('ativo', true).ilike('nome', '%herospark%').limit(1).single()

    // 4) Cria matrícula
    const valorFinal = amount > 0 ? amount : 0
    const { data: matricula, error: errMat } = await supabase.from('matriculas').insert({
      aluno_id: alunoId,
      turma_id: turmaId,
      valor_pago: valorFinal,
      data_compra: new Date().toISOString().split('T')[0],
      forma_pagamento: paymentMethod.includes('pix') ? 'pix' : paymentMethod.includes('boleto') ? 'boleto' : 'cartao',
      parcelas: 1,
      status: 'ativa',
    }).select().single()

    if (errMat || !matricula) {
      await supabase.from('webhook_logs').update({ status: 'erro', erro: 'Erro ao criar matrícula: ' + errMat?.message, processado_em: new Date().toISOString() }).eq('id', logId!)
      return NextResponse.json({ error: errMat?.message }, { status: 500 })
    }

    // 5) Atualiza LTV do aluno
    const { data: alunoAtual } = await supabase.from('alunos').select('ltv').eq('id', alunoId).single()
    await supabase.from('alunos').update({ ltv: (alunoAtual?.ltv || 0) + valorFinal }).eq('id', alunoId)

    // 6) Cria lançamento de receita (à vista)
    const hoje = new Date().toISOString().split('T')[0]
    await supabase.from('lancamentos_empresa').insert({
      tipo: 'receita',
      categoria: 'outro',
      descricao: `Matrícula HeroSpark — ${alunoNome}`,
      valor: valorFinal,
      unidade: 'geral',
      mes_referencia: hoje.substring(0, 7) + '-01',
      data_vencimento: hoje,
      data_pagamento: hoje,
      status: 'realizado',
      turma_id: turmaId,
      conta_id: caixaHero?.id || null,
    })

    // 7) Atualiza financeiro_turma (receita realizada)
    const { data: fin } = await supabase.from('financeiro_turma').select('*').eq('turma_id', turmaId).single()
    if (fin) {
      const novaReceita = (fin.receita_realizada || 0) + valorFinal
      await supabase.from('financeiro_turma').update({
        receita_realizada: novaReceita,
        atualizado_em: new Date().toISOString(),
      }).eq('turma_id', turmaId)
    }

    // 8) Marca log como processado
    await supabase.from('webhook_logs').update({
      status: 'processado',
      matricula_id: matricula.id,
      processado_em: new Date().toISOString(),
    }).eq('id', logId!)

    return NextResponse.json({ ok: true, matricula_id: matricula.id }, { status: 200 })

  } catch (err: any) {
    if (logId) {
      await supabase.from('webhook_logs').update({
        status: 'erro',
        erro: err.message || 'Erro desconhecido',
        processado_em: new Date().toISOString(),
      }).eq('id', logId)
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// HeroSpark pode bater com GET pra teste de conectividade
export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'herospark-webhook' })
}