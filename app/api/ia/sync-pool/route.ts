import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'

export const maxDuration = 60

// 🔄 SYNC LEADS → POOL DE DISPARO (wa_contatos). Todo lead entra no pool sozinho e a categoria segue o estado:
//   • perda → 'perdido' (win-back)   • ganho → 'comprador'   • qualquer outra etapa ativa → 'interessado'
// Preenche cidade (da turma) + produto (FC/ANL) pra segmentar o disparo. Idempotente: insere o que falta e
// corrige a categoria de quem mudou de estado. Roda em lotes (teto de escritas por chamada). dryRun (padrão) simula.
const alcancavel = (w: string) => { const s = String(w || ''); if (/@lid|@g\.us|@broadcast|@s\.whatsapp/i.test(s)) return false; const d = s.replace(/\D/g, ''); return d.length >= 10 && d.length <= 13 }
const suf = (t: string) => (t || '').replace(/\D/g, '').slice(-8)
const norm = (w: string) => { let d = String(w || '').replace(/\D/g, ''); if (d.length >= 10 && d.length <= 11) d = '55' + d; return d }
const fam = (c: string | null) => { const x = (c || '').toLowerCase(); return x.startsWith('fc') ? 'FC' : x.startsWith('anl') ? 'ANL' : null }
const cidCod = (c: string | null) => { const x = (c || '').toLowerCase().replace(/^(fc|anl)/, '').replace(/[0-9]+$/, ''); const m: Record<string, string> = { portoalegre: 'Porto Alegre', lajeado: 'Lajeado', caxias: 'Caxias do Sul', caxiasdosul: 'Caxias do Sul', novohamburgo: 'Novo Hamburgo', canoas: 'Canoas', santacruz: 'Santa Cruz do Sul', bentogoncalves: 'Bento Gonçalves' }; return m[x] || null }
const catDaEtapa = (e: string) => e === 'perda' ? 'perdido' : e === 'ganho' ? 'comprador' : 'interessado'

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({} as any))
    const dryRun = b?.dryRun !== false
    const confirm = b?.confirm === true
    const limit = Math.min(Math.max(Number(b?.limit) || 300, 1), 800) // teto de ESCRITAS por chamada
    if (!dryRun && !confirm) return NextResponse.json({ ok: false, error: 'pra aplicar: dryRun=false E confirm=true' }, { status: 200 })

    // leads (todos, com whatsapp) — paginado
    const leads: any[] = []
    for (let from = 0; ; from += 1000) { const { data } = await sb.from('leads').select('id, nome, whatsapp, etapa, codigo_turma, turma_id').eq('org_id', org).not('etapa', 'is', null).range(from, from + 999); if (!data?.length) break; leads.push(...data); if (data.length < 1000) break }
    const val = leads.filter(l => alcancavel(l.whatsapp))

    // turma → cidade
    const tids = [...new Set(val.map(l => l.turma_id).filter(Boolean))] as string[]
    const tcid = new Map<string, { cidade: string | null; cod: string }>()
    for (let i = 0; i < tids.length; i += 200) { const { data } = await sb.from('turmas').select('id, codigo, cidades(nome)').in('id', tids.slice(i, i + 200)); for (const t of (data || []) as any[]) tcid.set(t.id, { cidade: t.cidades?.nome || cidCod(t.codigo), cod: t.codigo }) }

    // pool atual (por sufixo)
    const pool: any[] = []
    for (let from = 0; ; from += 1000) { const { data } = await sb.from('wa_contatos').select('id, telefone, categoria, cidade, produto').eq('org_id', org).range(from, from + 999); if (!data?.length) break; pool.push(...data); if (data.length < 1000) break }
    const bySuf = new Map<string, any>(); for (const c of pool) { const s = suf(c.telefone); if (s.length === 8) bySuf.set(s, c) }

    let inseridos = 0, atualizados = 0, jaOk = 0, escritas = 0
    const seen = new Set<string>()
    const amostra: any[] = []
    for (const l of val) {
      if (escritas >= limit) break
      const s = suf(l.whatsapp); if (s.length !== 8 || seen.has(s)) continue; seen.add(s)
      const cidade = tcid.get(l.turma_id)?.cidade || cidCod(l.codigo_turma) || null
      const prod = fam(l.codigo_turma) || fam(tcid.get(l.turma_id)?.cod || null) || null
      const cat = catDaEtapa(l.etapa)
      const ex = bySuf.get(s)
      if (ex) {
        // já no pool — corrige categoria/cidade/produto só se mudou (não reescreve à toa)
        const upd: any = {}
        if (ex.categoria !== cat) upd.categoria = cat
        if (!ex.cidade && cidade) upd.cidade = cidade
        if (!ex.produto && prod) upd.produto = prod
        if (Object.keys(upd).length) { escritas++; if (!dryRun) { upd.lead_id = l.id; upd.atualizado_em = new Date().toISOString(); await sb.from('wa_contatos').update(upd).eq('id', ex.id) } atualizados++; if (amostra.length < 10) amostra.push({ nome: l.nome, acao: 'atualiza', cat, cidade, prod }) }
        else jaOk++
      } else {
        escritas++
        if (amostra.length < 10) amostra.push({ nome: l.nome, acao: 'insere', cat, cidade, prod })
        if (!dryRun) {
          const row = { org_id: org, nome: l.nome || 'Lead', telefone: norm(l.whatsapp), cidade, categoria: cat, produto: prod, origem: 'sync_leads', lead_id: l.id, status: 'pendente' }
          const { error } = await sb.from('wa_contatos').insert(row)
          if (error) { await sb.from('wa_contatos').update({ categoria: cat, lead_id: l.id }).eq('org_id', org).eq('telefone', norm(l.whatsapp)) } // telefone já existe em outro formato → corrige
        }
        inseridos++
      }
    }
    const restantes = Math.max(0, val.length - seen.size)
    return NextResponse.json({ ok: true, dryRun, leads: val.length, inseridos, atualizados, jaOk, restantes, amostra })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
