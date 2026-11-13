// Maia: o CRM e o financeiro da ESCOLA (13/11), onde cada cliente da Maia vira cliente como os outros clientes recorrentes da escola.
// As tabelas são as da escola (projetos, instalacoes, lancamentos_empresa, projeto_andamentos, contas_financeiras), no
// banco da escola, pela chave de serviço (lib/supabase-admin). No modo local da Maia (MAIA_LOCAL=1) são arquivos JSON
// escola_<tabela> na mesma pasta dos testes: nada toca o banco de verdade.
// Só igualdade nos filtros (o resto é feito em JS: são poucas linhas por cliente).
import { maiaDb, maiaLocal } from './db'

export const ORG_ESCOLA = '00000000-0000-0000-0000-0000000000cd'
type Tabela = 'projetos' | 'instalacoes' | 'lancamentos_empresa' | 'projeto_andamentos' | 'contas_financeiras'
type Filtro = Record<string, string | number | boolean | null>

async function sb() { const { supabaseAdmin } = await import('@/lib/supabase-admin'); return supabaseAdmin }
const filtra = (q: any, f: Filtro) => { for (const [k, v] of Object.entries(f)) q = v === null ? q.is(k, null) : q.eq(k, v); return q }

export const escola = {
  async lista(t: Tabela, f: Filtro = {}): Promise<any[]> {
    if (maiaLocal()) return maiaDb.lista('escola_' + t, f)
    const { data, error } = await filtra((await sb()).from(t).select('*'), f)
    if (error) throw new Error(`escola ${t}: ${error.message}`)
    return data || []
  },
  async um(t: Tabela, f: Filtro) { return (await escola.lista(t, f))[0] || null },
  async insere(t: Tabela, linha: Record<string, any>): Promise<any> {
    if (maiaLocal()) return maiaDb.insere('escola_' + t, linha)
    const { data, error } = await (await sb()).from(t).insert(linha).select('*').single()
    if (error) throw new Error(`escola ${t}: ${error.message}`)
    return data
  },
  async atualiza(t: Tabela, f: Filtro, campos: Record<string, any>): Promise<any[]> {
    if (maiaLocal()) return maiaDb.atualiza('escola_' + t, f, campos)
    const { data, error } = await filtra((await sb()).from(t).update(campos), f).select('*')
    if (error) throw new Error(`escola ${t}: ${error.message}`)
    return data || []
  },
  async apaga(t: Tabela, f: Filtro) {
    if (maiaLocal()) return maiaDb.apaga('escola_' + t, f)
    const { error } = await filtra((await sb()).from(t).delete(), f)
    if (error) throw new Error(`escola ${t}: ${error.message}`)
  },
}
