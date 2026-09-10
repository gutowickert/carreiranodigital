import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { meuPerfil } from '@/lib/quem-eu-vejo'

// VENDAS DO MÊS — pro vendedor saber quanto já vendeu no mês, e quanto a empresa vendeu.
//
// "Vendido" = soma do valor das matrículas com data de compra no mês, fora as canceladas. NÃO é a
// "Receita do mês" do painel do dono, que soma o dinheiro que ENTROU (lançamentos): uma venda
// parcelada conta inteira aqui e vai entrando aos poucos lá. Os dois números vão ser diferentes, e
// os dois estão certos.
//
// O TOTAL DA EMPRESA vai junto porque, no combinado de hoje (set/2026), o vendedor comissiona sobre
// todo o faturamento. Quando o combinado mudar, é AQUI que se desliga — e não na tela: a tela só
// mostra o que esta rota devolve, então tirar daqui é tirar de verdade, e não só esconder.
const MOSTRA_TOTAL_EMPRESA = true

const CANCELADAS = ['cancelada', 'cancelado', 'estornada', 'reembolsada']

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  const eu = await meuPerfil(auth)
  if (!eu) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
  const org = await orgDaRequest(auth)

  // O mês corrente é o de São Paulo (o servidor roda em UTC: dia 1º às 21h ainda é o mês anterior).
  const mes = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7)

  const { data, error } = await sb.from('matriculas')
    .select('vendedor_id,valor_pago,data_compra,status')
    .eq('org_id', org).gte('data_compra', `${mes}-01`).limit(5000)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // ⚠️ `data_compra` é gravada como meia-noite UTC ("2026-09-01T00:00:00+00:00") — é uma DATA,
  // não um instante. Lê-se o dia como está escrito. Converter pra São Paulo jogaria a venda do dia 1º
  // pro dia 31 do mês anterior (21h do dia anterior em SP) — e ela sumiria do mês.
  const doMes = (data || []).filter(m => m.data_compra && String(m.data_compra).slice(0, 7) === mes && !CANCELADAS.includes(m.status))
  const somar = (l: typeof doMes) => ({ total: l.reduce((s, m) => s + Number(m.valor_pago || 0), 0), quantidade: l.length })

  return NextResponse.json({
    ok: true,
    mes,
    minhas: somar(doMes.filter(m => m.vendedor_id === eu.id)),
    empresa: MOSTRA_TOTAL_EMPRESA ? somar(doMes) : null,
  })
}
