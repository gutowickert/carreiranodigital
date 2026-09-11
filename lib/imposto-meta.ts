import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { IMPOSTO_META_CHAVE, IMPOSTO_META_PADRAO } from '@/lib/meta-ads'

/** O % de imposto da Meta configurado pra empresa (Configurações → financeiro). */
export async function impostoMetaPct(org: string): Promise<number> {
  const { data } = await sb.from('configuracoes').select('valor').eq('org_id', org).eq('chave', IMPOSTO_META_CHAVE).maybeSingle()
  const n = parseFloat(String(data?.valor ?? '').replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : IMPOSTO_META_PADRAO
}
