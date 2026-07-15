import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPurchase } from '@/lib/capi'

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
    const productId = pick(payload, ['product_id', 'product.id', 'data.product.id', 'produto.id'])
    const productName = pick(payload, ['product_name', 'product.name', 'data.product.name', 'produto.nome'])
    const buyerName = pick(payload, ['buyer_name', 'buyer.name', 'customer.name', 'data.buyer.name', 'comprador.nome', 'student.name'])
    const buyerEmail = pick(payload, ['buyer_email', 'buyer.email', 'customer.email', 'data.buyer.email', 'comprador.email', 'student.email'])
    const buyerCpf = pick(payload, ['buyer_cpf', 'buyer.cpf', 'customer.cpf', 'data.buyer.cpf', 'comprador.cpf', 'student.cpf'])
    const buyerPhone = pick(payload, ['buyer_phone', 'buyer.phone', 'customer.phone', 'data.buyer.phone', 'comprador.telefone', 'student.phone'])
    const amount = parseFloat(pick(payload, ['amount', 'value', 'total', 'data.amount', 'valor'], '0'))
    const paymentMethod = pick(payload, ['payment_method', 'data.payment_method', 'metodo_pagamento'], 'pix')
    const installments = parseInt(pick(payload, ['installments', 'data.installments', 'parcelas'], '1')) || 1

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

    // 4) Acha matrícula existente (evita DUPLICAR) ou cria
    // Boleto parcelado: a HeroSpark manda o valor da PARCELA + installments. O total da venda = parcela × parcelas.
    const ehBoletoParc = ((paymentMethod || '').toLowerCase().includes('boleto') || (paymentMethod || '').toLowerCase().includes('slip')) && installments > 1
    const valorFinal = ehBoletoParc ? Math.round(amount * installments * 100) / 100 : (amount > 0 ? amount : 0)
    const { data: matExistente } = await supabase.from('matriculas')
      .select('id').eq('aluno_id', alunoId).eq('turma_id', turmaId).limit(1).maybeSingle()

    let matricula: any = matExistente
    const jaExistia = !!matExistente
    if (!matricula) {
      const { data: novaMat, error: errMat } = await supabase.from('matriculas').insert({
        aluno_id: alunoId,
        turma_id: turmaId,
        valor_pago: valorFinal,
        data_compra: new Date().toISOString().split('T')[0],
        forma_pagamento: paymentMethod.includes('pix') ? 'pix' : (paymentMethod.includes('boleto') || paymentMethod.includes('slip')) ? 'boleto' : 'cartao',
        parcelas: ehBoletoParc ? installments : 1,
        status: 'ativa',
      }).select().single()

      if (errMat || !novaMat) {
        await supabase.from('webhook_logs').update({ status: 'erro', erro: 'Erro ao criar matrícula: ' + errMat?.message, processado_em: new Date().toISOString() }).eq('id', logId!)
        return NextResponse.json({ error: errMat?.message }, { status: 500 })
      }
      matricula = novaMat
    }

    // 4.5) Procura lead correspondente por whatsapp ou email — se achar, vincula
    let leadEncontrado: any = null
    if (buyerPhone) {
      const phoneNumeros = buyerPhone.toString().replace(/\D/g, '')
      // Casa pelos ÚLTIMOS 8 dígitos — tolera diferenças de 55/DDD/9 do celular
      const suf8 = phoneNumeros.slice(-8)
      if (suf8.length >= 8) {
        const { data: leadPorPhone } = await supabase.from('leads')
          .select('id, vendedor_id, etapa, nome, fbc, fbp')
          .ilike('whatsapp', `%${suf8}`)
          .not('etapa', 'in', '(perda)')
          .order('criado_em', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (leadPorPhone) leadEncontrado = leadPorPhone
      }
    }
    if (!leadEncontrado && buyerEmail) {
      const { data: leadPorEmail } = await supabase.from('leads')
        .select('id, vendedor_id, etapa, nome, fbc, fbp')
        .eq('email', buyerEmail)
        .not('etapa', 'in', '(perda)')
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (leadPorEmail) leadEncontrado = leadPorEmail
    }

    if (leadEncontrado && leadEncontrado.etapa !== 'ganho') {
      // Vincula matrícula ao lead + ao vendedor do lead (pra gerar comissão automática)
      await supabase.from('matriculas').update({
        lead_id: leadEncontrado.id,
        vendedor_id: leadEncontrado.vendedor_id || null,
      }).eq('id', matricula.id)

      // Move o lead pra Ganho
      await supabase.from('leads').update({
        etapa: 'ganho',
        data_ganho: new Date().toISOString(),
        valor_venda: valorFinal,
        matricula_id: matricula.id,
        motivo_ganho: 'Convertido via HeroSpark',
        atualizado_em: new Date().toISOString(),
      }).eq('id', leadEncontrado.id)

      // Registra andamento
      await supabase.from('lead_andamentos').insert({
        lead_id: leadEncontrado.id,
        vendedor_id: leadEncontrado.vendedor_id,
        tipo: 'webhook_convertido',
        etapa_anterior: leadEncontrado.etapa,
        etapa_nova: 'ganho',
        observacao: `Convertido via HeroSpark — R$ ${valorFinal.toFixed(2)}`,
      })
    }

    // 5/6/7) Financeiro
    const hoje = new Date().toISOString().split('T')[0]

    if (ehBoletoParc) {
      // BOLETO PARCELADO: a HeroSpark manda 1 webhook por boleto PAGO (valor da parcela).
      // No 1º boleto provisiona os N (1 pago + resto previsto, mensal). Nos seguintes, confirma o próximo previsto.
      // Dedup de retry: se já confirmei um boleto desse aluno HOJE, não faz de novo.
      const { count: jaHoje } = await supabase.from('lancamentos_empresa')
        .select('id', { count: 'exact', head: true })
        .eq('turma_id', turmaId).eq('tipo', 'receita').eq('status', 'realizado').eq('data_pagamento', hoje)
        .ilike('descricao', `Boleto%${alunoNome}%`)
      if (!jaHoje) {
        const taxaBoleto = Math.round((amount * 0.046 + 3) * 100) / 100 // boleto: 4,6% + R$3 por parcela
        const addMeses = (d: string, n: number) => { const x = new Date(d + 'T12:00:00'); x.setMonth(x.getMonth() + n); return x.toISOString().split('T')[0] }
        const { data: prox } = await supabase.from('lancamentos_empresa')
          .select('id, descricao').eq('turma_id', turmaId).eq('tipo', 'receita').eq('status', 'previsto')
          .ilike('descricao', `Boleto%${alunoNome}%`).order('data_vencimento').limit(1).maybeSingle()
        if (prox) {
          // confirma o próximo boleto previsto + a tarifa dele
          await supabase.from('lancamentos_empresa').update({ status: 'realizado', data_pagamento: hoje }).eq('id', prox.id)
          const num = (prox.descricao.match(/Boleto (\d+)\//) || [])[1]
          if (num) await supabase.from('lancamentos_empresa').update({ status: 'realizado', data_pagamento: hoje })
            .eq('turma_id', turmaId).eq('tipo', 'custo').eq('status', 'previsto').ilike('descricao', `Tarifa%boleto ${num}/%${alunoNome}%`)
        } else {
          // 1º boleto de uma matrícula nova: provisiona os N boletos
          for (let i = 0; i < installments; i++) {
            const d = addMeses(hoje, i); const pago = i === 0
            const base = { unidade: 'geral', mes_referencia: d.substring(0, 7) + '-01', data_vencimento: d, data_pagamento: pago ? d : null, status: pago ? 'realizado' : 'previsto', turma_id: turmaId, conta_id: caixaHero?.id || null }
            await supabase.from('lancamentos_empresa').insert({ ...base, tipo: 'receita', categoria: 'outro', descricao: `Boleto ${i + 1}/${installments} — ${alunoNome} (HeroSpark)`, valor: amount })
            if (taxaBoleto > 0) await supabase.from('lancamentos_empresa').insert({ ...base, tipo: 'custo', categoria: 'taxa_financeira', descricao: `Tarifa HeroSpark boleto ${i + 1}/${installments} — ${alunoNome}`, valor: taxaBoleto })
          }
        }
        // LTV e receita da turma sobem pelo valor do boleto pago (amount), a cada boleto
        const { data: alunoB } = await supabase.from('alunos').select('ltv').eq('id', alunoId).single()
        await supabase.from('alunos').update({ ltv: (alunoB?.ltv || 0) + amount }).eq('id', alunoId)
        const { data: finB } = await supabase.from('financeiro_turma').select('receita_realizada').eq('turma_id', turmaId).maybeSingle()
        if (finB) await supabase.from('financeiro_turma').update({ receita_realizada: (finB.receita_realizada || 0) + amount, atualizado_em: new Date().toISOString() }).eq('turma_id', turmaId)
      }
    } else if (!jaExistia) {
      // 5) Atualiza LTV do aluno
      const { data: alunoAtual } = await supabase.from('alunos').select('ltv').eq('id', alunoId).single()
      await supabase.from('alunos').update({ ltv: (alunoAtual?.ltv || 0) + valorFinal }).eq('id', alunoId)

      // 6) Cria lançamento de receita (à vista)
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

      // 6.1) Tarifa da HeroSpark como CUSTO (pra refletir o líquido real no caixa)
      // Tabela: 4,6% + R$1,00 (cartão/pix) ou + R$3,00 (boleto); parcelado = antecipação a 3,49%/mês (valor presente).
      const mPag = (paymentMethod || '').toLowerCase()
      const fixo = mPag.includes('boleto') ? 3.00 : 1.00
      const ehCartao = mPag.includes('credit') || mPag.includes('cartao') || mPag.includes('card')
      let liquido: number
      if (ehCartao && installments >= 2) {
        // Parcelado: antecipa as parcelas (valor presente a 3,49%/mês) e DEPOIS aplica 4,6% + R$1
        const parcela = valorFinal / installments
        let fator = 0
        for (let k = 1; k <= installments; k++) fator += 1 / Math.pow(1 + 0.0349, k)
        const antecipado = parcela * fator
        liquido = antecipado - (antecipado * 0.046 + 1.00)
      } else {
        // Pix / boleto / cartão à vista: só a taxa base
        liquido = valorFinal - (valorFinal * 0.046 + fixo)
      }
      let taxa = Math.round((valorFinal - liquido) * 100) / 100
      if (taxa > 0) {
        await supabase.from('lancamentos_empresa').insert({
          tipo: 'custo',
          categoria: 'taxa_financeira',
          descricao: `Tarifa HeroSpark — ${alunoNome}${installments >= 2 ? ` (cartão ${installments}x)` : ''}`,
          valor: taxa,
          unidade: 'geral',
          mes_referencia: hoje.substring(0, 7) + '-01',
          data_vencimento: hoje,
          data_pagamento: hoje,
          status: 'realizado',
          turma_id: turmaId,
          conta_id: caixaHero?.id || null,
        })
      }

      // 7) Atualiza financeiro_turma (receita realizada)
      const { data: fin } = await supabase.from('financeiro_turma').select('*').eq('turma_id', turmaId).single()
      if (fin) {
        const novaReceita = (fin.receita_realizada || 0) + valorFinal
        await supabase.from('financeiro_turma').update({
          receita_realizada: novaReceita,
          atualizado_em: new Date().toISOString(),
        }).eq('turma_id', turmaId)
      }
    }

    // 7.5) Dispara Purchase pro CAPI (server-side)
    try {
      const capiPurchase = await sendPurchase({
        eventId: matricula.id,
        value: valorFinal,
        currency: 'BRL',
        email: buyerEmail,
        phone: buyerPhone,
        firstName: buyerName,
        // fbc/fbp do lead = carimbo do clique no anúncio; é o que dá ao Meta a
        // atribuição forte da compra ao anúncio que trouxe o lead.
        fbc: leadEncontrado?.fbc || null,
        fbp: leadEncontrado?.fbp || null,
        externalId: leadEncontrado?.id || alunoId,
        codigoTurma: turmaCodigo,
      })
      if (!capiPurchase.ok) console.error('[webhook] CAPI Purchase falhou:', capiPurchase.error)
    } catch (e) {
      console.error('[webhook] CAPI Purchase exception:', e)
    }

    // 8) Marca log como processado
    await supabase.from('webhook_logs').update({
      status: 'processado',
      matricula_id: matricula.id,
      erro: jaExistia ? 'Matrícula já existia — vinculada ao lead sem duplicar (financeiro não relançado)' : null,
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