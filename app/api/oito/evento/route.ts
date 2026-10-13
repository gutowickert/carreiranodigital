// Oito Posts: o rastro do funil (visita, formulário, viu o teste, clicou em assinar). Só os tipos da lista.
import { NextResponse } from 'next/server'
import { oitoDb as db } from '@/lib/oito/db'
import { ehMarca } from '@/lib/oito/config'

const TIPOS = new Set(['visita', 'form_inicio', 'form_passo', 'form_erro', 'teste_visto', 'assinar_clique', 'fatura_aberta', 'area_visita', 'baixou', 'copiou_legenda'])

export async function POST(req: Request) {
  try {
    const b = await req.json()
    if (!TIPOS.has(b.tipo) || !ehMarca(b.marca)) return NextResponse.json({ ok: false })
    const c = b.c ? await db.um('clientes', { codigo: String(b.c).toUpperCase() }) : null
    const d = b.detalhe && typeof b.detalhe === 'object' && JSON.stringify(b.detalhe).length <= 1500 ? b.detalhe : {}
    await db.evento(b.tipo, { cliente_id: c?.id || null, marca: b.marca, sessao: String(b.sessao || '').slice(0, 60), detalhe: d })
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ ok: false }) }
}
