import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// Escala Douglas × Julio. Eventos = turmas ANL (inteiras) + módulo Gestor de
// Tráfego das FC, abertas e futuras (menos as 2 POA 072601/072602).
//  GET  -> eventos com a escolha atual
//  POST { chave, turma_id, modulo_id, escolha } -> salva a escolha

const ANL = '00a9db78-31d4-436a-8f72-d0e8e9c623f9'
const FC = '5985a70d-933d-4b0f-8972-b30a27ff412a'
const MOD_TRAFEGO = '487350fb-4e0f-4a00-98a1-714c590732b2'
const EXCLUI = new Set(['anlportoalegre072601', 'anlportoalegre072602'])

export async function GET(_req: NextRequest) {
  try {
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    const { data: turmas } = await supabase.from('turmas').select('id, codigo, produto_id, status, encerrada_em, data_fim').in('produto_id', [ANL, FC])
    const abertas = (turmas || []).filter((t: any) => !t.encerrada_em && !['encerrada', 'cancelada', 'concluida'].includes(t.status) && (t.data_fim || '') >= hoje)

    const { data: escolhas } = await supabase.from('escala_escolhas').select('chave, escolha')
    const mapa = new Map((escolhas || []).map((e: any) => [e.chave, e.escolha]))

    const eventos: any[] = []
    for (const t of abertas) {
      const cod = (t.codigo || '').toLowerCase()
      if (t.produto_id === ANL) {
        if (EXCLUI.has(cod)) continue
        const { data: dts } = await supabase.from('turma_datas').select('data').eq('turma_id', t.id).order('data')
        const dias = [...new Set((dts || []).map((x: any) => x.data))].sort()
        if (dias.length) eventos.push(mk(t, null, 'ANL', dias, mapa))
      } else if (t.produto_id === FC) {
        const { data: dts } = await supabase.from('turma_datas').select('data').eq('turma_id', t.id).eq('modulo_id', MOD_TRAFEGO).order('data')
        const dias = [...new Set((dts || []).map((x: any) => x.data))].sort()
        if (dias.length) eventos.push(mk(t, MOD_TRAFEGO, 'Gestor de Tráfego', dias, mapa))
      }
    }
    eventos.sort((a, b) => a.ini < b.ini ? -1 : 1)
    return NextResponse.json({ ok: true, eventos })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}

function mk(t: any, modulo_id: string | null, tipo: string, dias: string[], mapa: Map<string, string>) {
  const chave = `${t.id}|${modulo_id || 'anl'}`
  return { chave, turma_id: t.id, modulo_id, codigo: t.codigo, tipo, dias, ini: dias[0], escolha: mapa.get(chave) || 'julio' }
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}))
    if (!b.chave || !['douglas', 'julio'].includes(b.escolha)) return NextResponse.json({ ok: false, error: 'dados inválidos' }, { status: 200 })
    await supabase.from('escala_escolhas').upsert({
      chave: b.chave, turma_id: b.turma_id || null, modulo_id: b.modulo_id || null,
      escolha: b.escolha, atualizado_em: new Date().toISOString(),
    }, { onConflict: 'chave' })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}
