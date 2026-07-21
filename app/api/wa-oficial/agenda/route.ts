import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'

// AGENDA DE DISPAROS POR TURMA (oficial). Gera o plano de 3 toques por turma aberta:
//  • D-10  turma_aberta   (abertura de inscrições)
//  • D-5   ultimas_vagas  (urgência + condição especial)
//  • D-últ ultima_chamada (último DIA ÚTIL antes de começar)
// Regra de fim de semana: nenhum disparo cai sáb/dom — puxa pra sexta anterior.
// Semi-auto: gera como 'planejado'; só sai o que o humano 'confirmar'.

// ——— helpers de data (âncora ao meio-dia de Brasília = 15:00Z, à prova de fuso) ———
const anchor = (iso: string) => new Date(iso.slice(0, 10) + 'T15:00:00Z')
const shift = (d: Date, n: number) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x }
const weekday = (d: Date) => d.getUTCDay() // 0=dom .. 6=sáb (correto p/ o dia BRT)
const puxaUtil = (d: Date) => { let x = d; while (weekday(x) === 0 || weekday(x) === 6) x = shift(x, -1); return x }
const isoDate = (d: Date) => d.toISOString().slice(0, 10)
const brData = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const as10h = (d: Date) => new Date(`${isoDate(d)}T10:00:00-03:00`).toISOString() // dispara 10h BRT

function planoDaTurma(inicioISO: string) {
  const ini = anchor(inicioISO)
  return [
    { tipo: 'turma_aberta', titulo: 'Turma aberta', ordem: 1, quando: puxaUtil(shift(ini, -10)) },
    { tipo: 'ultimas_vagas', titulo: 'Últimas vagas', ordem: 2, quando: puxaUtil(shift(ini, -5)) },
    { tipo: 'ultima_chamada', titulo: 'Última chamada', ordem: 3, quando: puxaUtil(shift(ini, -1)) },
  ]
}

function copyDe(tipo: string, prod: string, cid: string, iniISO: string) {
  const ini = brData(iniISO)
  if (tipo === 'turma_aberta')
    return `Oi {{nome}}! 🎓 Abriram as inscrições da turma de ${prod} em ${cid}, começando ${ini}. São encontros presenciais à noite, com professor especialista. Quer saber como funciona e garantir tua vaga?`
  if (tipo === 'ultimas_vagas')
    return `Oi {{nome}}! ⏳ As últimas vagas da turma de ${prod} em ${cid} (início ${ini}) estão acabando — e essa semana tem uma condição especial pra fechar. Posso te passar os detalhes?`
  return `Oi {{nome}}! 🚨 Última chamada: a turma de ${prod} em ${cid} começa ${ini} e as inscrições encerram. Ainda dá tempo de garantir tua vaga — quer que eu te mande o link?`
}

async function turmasAbertas(org: string) {
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const { data } = await sb.from('turmas')
    .select('id, codigo, data_inicio, status, produtos(nome), cidades(nome)')
    .eq('org_id', org).gte('data_inicio', hoje).not('status', 'in', '(cancelada,realizada)')
    .order('data_inicio')
  return (data || []).map((t: any) => ({
    id: t.id, codigo: t.codigo, data_inicio: (t.data_inicio || '').slice(0, 10), status: t.status,
    produto: t.produtos?.nome || '', cidade: t.cidades?.nome || '',
  }))
}

export async function GET(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const turmas = await turmasAbertas(org)
    const ids = turmas.map(t => t.id)
    let disp: any[] = []
    if (ids.length) {
      const { data } = await sb.from('disparos_turma').select('*').eq('org_id', org).in('turma_id', ids).order('data_agendada')
      disp = data || []
    }
    const porTurma = turmas.map(t => ({
      ...t,
      disparos: disp.filter(d => d.turma_id === t.id).sort((a, b) => (a.data_agendada || '').localeCompare(b.data_agendada || '')),
    }))
    return NextResponse.json({ ok: true, turmas: porTurma })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const org = await orgDaRequest(req.headers.get('authorization'))
    const b = await req.json().catch(() => ({}))
    const acao = b.acao

    if (acao === 'gerar') {
      const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
      const turmas = await turmasAbertas(org)
      let criados = 0, pulados = 0
      for (const t of turmas) {
        // não duplica: se a turma já tem disparos (não cancelados), pula
        const { data: existe } = await sb.from('disparos_turma').select('id').eq('org_id', org).eq('turma_id', t.id).neq('status', 'cancelado').limit(1)
        if (existe && existe.length) { pulados++; continue }
        const plano = planoDaTurma(t.data_inicio)
        // dedup por data (janela curta) mantendo o toque mais urgente; e só datas >= hoje
        const porData = new Map<string, any>()
        for (const p of plano) {
          const d = isoDate(p.quando)
          if (d < hoje) continue // toque já passou
          const atual = porData.get(d)
          if (!atual || p.ordem > atual.ordem) porData.set(d, p)
        }
        const linhas = [...porData.values()].sort((a, b) => a.ordem - b.ordem).map(p => ({
          org_id: org, turma_id: t.id, tipo: p.tipo, titulo: `${p.titulo} — ${t.produto} ${t.cidade}`,
          copy: copyDe(p.tipo, t.produto, t.cidade, t.data_inicio),
          canal: 'whatsapp', data_agendada: as10h(p.quando), status: 'planejado',
        }))
        if (linhas.length) {
          const { error } = await sb.from('disparos_turma').insert(linhas)
          if (error) return NextResponse.json({ ok: false, error: 'insert falhou: ' + error.message }, { status: 200 })
          criados += linhas.length
        }
      }
      return NextResponse.json({ ok: true, criados, turmasPuladas: pulados })
    }

    if (acao === 'confirmar' || acao === 'cancelar' || acao === 'replanejar') {
      const id = (b.id || '').toString()
      if (!id) return NextResponse.json({ ok: false, error: 'falta id' }, { status: 200 })
      const patch: any = {}
      if (acao === 'confirmar') patch.status = 'confirmado'
      if (acao === 'cancelar') patch.status = 'cancelado'
      if (acao === 'replanejar') patch.status = 'planejado'
      if (typeof b.data_agendada === 'string' && b.data_agendada) patch.data_agendada = b.data_agendada
      if (typeof b.copy === 'string') patch.copy = b.copy
      await sb.from('disparos_turma').update(patch).eq('org_id', org).eq('id', id)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: false, error: 'ação inválida' }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
