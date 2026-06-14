import type { SupabaseClient } from '@supabase/supabase-js'

// Aplica rateio entre vendedores da turma e retorna o vendedor_id escolhido.
// Usado tanto pelo formulario do site quanto pelo webhook do WhatsApp.
export async function aplicarRateio(
  supabase: SupabaseClient,
  turmaId: string
): Promise<string | null> {
  const { data: config } = await supabase.from('vendedor_config_turma')
    .select('vendedor_id, leads_por_ciclo, ordem')
    .eq('turma_id', turmaId).eq('ativo', true).order('ordem')
  if (!config || config.length === 0) return null

  const { data: estado } = await supabase.from('rateio_estado')
    .select('*').eq('turma_id', turmaId).maybeSingle()

  let proximoVendedor: string
  let novoContador: number

  if (!estado) {
    proximoVendedor = config[0].vendedor_id
    novoContador = 1
  } else {
    const idxAtual = config.findIndex(c => c.vendedor_id === estado.ultimo_vendedor_id)
    const configAtual = idxAtual >= 0 ? config[idxAtual] : config[0]
    if (estado.leads_atribuidos_ciclo >= configAtual.leads_por_ciclo) {
      const proxIdx = (idxAtual + 1) % config.length
      proximoVendedor = config[proxIdx].vendedor_id
      novoContador = 1
    } else {
      proximoVendedor = estado.ultimo_vendedor_id
      novoContador = estado.leads_atribuidos_ciclo + 1
    }
  }

  if (estado) {
    await supabase.from('rateio_estado').update({
      ultimo_vendedor_id: proximoVendedor,
      leads_atribuidos_ciclo: novoContador,
      atualizado_em: new Date().toISOString(),
    }).eq('turma_id', turmaId)
  } else {
    await supabase.from('rateio_estado').insert({
      turma_id: turmaId, ultimo_vendedor_id: proximoVendedor, leads_atribuidos_ciclo: novoContador,
    })
  }
  return proximoVendedor
}
