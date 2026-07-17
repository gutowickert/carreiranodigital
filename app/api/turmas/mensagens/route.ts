import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'

export const maxDuration = 30

// Descrições dos módulos (não estão no banco) — padrão usado no atendimento.
const DESC: Record<string, string> = {
  'estrategia digital': 'Estratégia, posicionamento, pauta que vende, calendário e copy',
  'designer digital': 'Identidade visual, hierarquia, layout e templates práticos',
  'videomaker mobile': 'Roteiro, gravação com celular, áudio, luz e edição',
  'trafego pago': 'Segmentação, criativos, métricas e otimização simples',
  'gestao de trafego pago': 'Segmentação, criativos, métricas e otimização simples',
}
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
const hhmm = (t?: string | null) => { if (!t) return ''; const [h, m] = t.split(':'); return m && m !== '00' ? `${h}h${m}` : `${parseInt(h)}h` }

// Formata um conjunto de datas RESPEITANDO o horário de cada dia (agrupa por horário; trata virada de mês).
// Ex: "📅 23 e 24/07 — 19h às 22h15\n📅 25/07 — 08h30 às 11h45"
function bloco(datas: { data: string; hi?: string | null; hf?: string | null }[]): string {
  const buckets: { hi?: string | null; hf?: string | null; dias: string[] }[] = []
  for (const d of datas.slice().sort((a, b) => (a.data < b.data ? -1 : 1))) {
    const k = `${d.hi || ''}|${d.hf || ''}`
    let b = buckets.find(x => `${x.hi || ''}|${x.hf || ''}` === k)
    if (!b) { b = { hi: d.hi, hf: d.hf, dias: [] }; buckets.push(b) }
    b.dias.push(d.data)
  }
  return buckets.map(b => {
    const porMes: { mes: string; dias: string[] }[] = []
    for (const iso of b.dias) { const mes = iso.slice(5, 7), dia = iso.slice(8, 10); const g = porMes.find(x => x.mes === mes); if (g) g.dias.push(dia); else porMes.push({ mes, dias: [dia] }) }
    const dstr = porMes.map(g => { const ds = g.dias; const lista = ds.length === 1 ? ds[0] : ds.slice(0, -1).join(', ') + ' e ' + ds[ds.length - 1]; return `${lista}/${g.mes}` }).join(', ')
    const hor = (hhmm(b.hi) && hhmm(b.hf)) ? ` — ${hhmm(b.hi)} às ${hhmm(b.hf)}` : ''
    return `📅 ${dstr}${hor}`
  }).join('\n')
}

export async function GET(req: Request) {
  const org = await orgDaRequest(req.headers.get('authorization'))
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const { data: turmas } = await sb.from('turmas')
    .select('id, codigo, produto_id, produtos(nome), cidades(nome)')
    .eq('org_id', org).gte('data_inicio', hoje).not('status', 'in', '(cancelada,realizada)')
    .order('data_inicio')
  const ids = (turmas || []).map((t: any) => t.id)
  if (!ids.length) return NextResponse.json({ ok: true, turmas: [] })

  const { data: datas } = await sb.from('turma_datas')
    .select('turma_id, modulo_id, data, horario_inicio, horario_fim').in('turma_id', ids).order('data')
  const { data: mods } = await sb.from('produto_modulos').select('id, nome, ordem')
  const modMap: Record<string, { nome: string; ordem: number }> = {}
  for (const m of (mods || [])) modMap[m.id] = { nome: m.nome, ordem: m.ordem }

  const datasPorTurma: Record<string, any[]> = {}
  for (const d of (datas || [])) (datasPorTurma[d.turma_id] = datasPorTurma[d.turma_id] || []).push(d)

  const out: any[] = []
  for (const t of (turmas || []) as any[]) {
    const ds = (datasPorTurma[t.id] || []).slice().sort((a, b) => (a.data < b.data ? -1 : 1))
    if (!ds.length) continue
    const cidade = t.cidades?.nome || '—'
    const ehFC = /forma/i.test(t.produtos?.nome || '')
    const D = (d: any) => ({ data: d.data, hi: d.horario_inicio, hf: d.horario_fim })

    let msg = ''
    if (ehFC) {
      const grupos: Record<string, { nome: string; ordem: number; dat: any[] }> = {}
      for (const d of ds) {
        const mid = d.modulo_id || 'x'
        const info = modMap[mid] || { nome: 'Módulo', ordem: 99 }
        const g = grupos[mid] = grupos[mid] || { nome: info.nome, ordem: info.ordem, dat: [] }
        g.dat.push(d)
      }
      // ordena os módulos pela DATA real (não pela ordem fixa)
      const ordenados = Object.values(grupos).sort((a, b) => (a.dat[0].data < b.dat[0].data ? -1 : 1))
      msg = `O curso de ${cidade} será nestes dias! 🎓\n`
      for (const g of ordenados) {
        msg += `\n📌 *${g.nome}*\n${bloco(g.dat.map(D))}`
        const desc = DESC[norm(g.nome)]
        if (desc) msg += `\n${desc}`
        msg += '\n'
      }
    } else {
      msg = `O curso de Anúncios para Negócios Locais em ${cidade} será nestes dias! 🎯\n\n${bloco(ds.map(D))}`
      msg += `\n\nSão 3 dias práticos: você aprende a criar e rodar anúncios no Meta (Facebook/Instagram) e sai com campanha no ar, com leads chegando no WhatsApp.`
    }

    out.push({ codigo: t.codigo, cidade, produto: t.produtos?.nome || '', tipo: ehFC ? 'FC' : 'ANL', inicio: ds[0].data, mensagem: msg.trim() })
  }
  return NextResponse.json({ ok: true, turmas: out })
}
