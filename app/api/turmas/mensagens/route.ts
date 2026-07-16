import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'

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

// "11, 12 e 13/08" — e trata virada de mês: "31/08, 01, 02 e 03/09"
function fmtDatas(datasISO: string[]): string {
  const porMes: { mes: string; dias: string[] }[] = []
  for (const d of datasISO) {
    const mes = d.slice(5, 7); const dia = d.slice(8, 10)
    const g = porMes.find(x => x.mes === mes)
    if (g) g.dias.push(dia); else porMes.push({ mes, dias: [dia] })
  }
  return porMes.map(g => {
    const ds = g.dias
    const lista = ds.length === 1 ? ds[0] : ds.slice(0, -1).join(', ') + ' e ' + ds[ds.length - 1]
    return `${lista}/${g.mes}`
  }).join(', ')
}

export async function GET() {
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const { data: turmas } = await sb.from('turmas')
    .select('id, codigo, produto_id, produtos(nome), cidades(nome)')
    .gte('data_inicio', hoje).not('status', 'in', '(cancelada,realizada)')
    .order('data_inicio')
  const ids = (turmas || []).map((t: any) => t.id)
  if (!ids.length) return NextResponse.json({ ok: true, turmas: [] })

  const { data: datas } = await sb.from('turma_datas')
    .select('turma_id, modulo_id, data, horario_inicio, horario_fim, ordem').in('turma_id', ids).order('data')
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
    const hi = hhmm(ds[0]?.horario_inicio), hf = hhmm(ds[0]?.horario_fim)
    const horario = hi && hf ? `${hi} às ${hf}` : ''

    let msg = ''
    if (ehFC) {
      // agrupa datas por módulo (ordem do módulo)
      const grupos: Record<string, { nome: string; ordem: number; datas: string[] }> = {}
      for (const d of ds) {
        const mid = d.modulo_id || 'x'
        const info = modMap[mid] || { nome: 'Módulo', ordem: 99 }
        const g = grupos[mid] = grupos[mid] || { nome: info.nome, ordem: info.ordem, datas: [] }
        g.datas.push(d.data)
      }
      // ordena os módulos pela DATA em que acontecem (não pela ordem fixa do módulo) — respeita a sequência real da turma
      const ordenados = Object.values(grupos).sort((a, b) => (a.datas.slice().sort()[0] < b.datas.slice().sort()[0] ? -1 : 1))
      msg = `O curso de ${cidade} será nestes dias! 🎓\n`
      if (horario) msg += `🕐 Aulas ${horario}\n`
      for (const g of ordenados) {
        msg += `\n📌 *${g.nome}*\n📅 ${fmtDatas(g.datas)}\n${DESC[norm(g.nome)] || ''}`.trimEnd() + '\n'
      }
    } else {
      // ANL / demais: dias corridos, sem módulo
      msg = `O curso de Anúncios para Negócios Locais em ${cidade} será nestes dias! 🎯\n\n📅 ${fmtDatas(ds.map(d => d.data))}`
      if (horario) msg += `\n🕐 ${horario}`
      msg += `\n\nSão 3 dias práticos: você aprende a criar e rodar anúncios no Meta (Facebook/Instagram) e sai com campanha no ar, com leads chegando no WhatsApp.`
    }

    out.push({
      codigo: t.codigo, cidade, produto: t.produtos?.nome || '', tipo: ehFC ? 'FC' : 'ANL',
      inicio: ds[0].data, mensagem: msg.trim(),
    })
  }
  return NextResponse.json({ ok: true, turmas: out })
}
