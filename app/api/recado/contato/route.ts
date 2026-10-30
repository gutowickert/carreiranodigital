// Recado Encantado (30/10): o formulário do Acordo agora pede nome e WhatsApp LOGO DEPOIS do desafio.
// Quando a pessoa preenche, o contato fica guardado (recado_site_eventos, evento 'form_contato') e o Guto recebe
// o aviso: se ela não terminar o pedido, dá pra chamar no WhatsApp. Antes, quem desistia no meio sumia sem contato.
// Público (o formulário é público), uma vez por visitante, só número com cara de celular.
import { NextRequest, NextResponse } from 'next/server'
import { recadoDb as db } from '@/lib/recado/db'
import { avisaDono } from '@/lib/recado/avisa-dono'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'

const limpa = (s: any, n = 80) => (s == null ? '' : String(s).replace(/[<>]/g, '').trim().slice(0, n))

export async function POST(req: NextRequest) {
  try {
    const b: any = JSON.parse(await req.text())
    const visitante = String(b.visitante || '')
    const wa = String(b.wa || '').replace(/\D/g, '')
    const nome = limpa(b.nome, 60)
    if (!/^[a-z0-9]{8,40}$/i.test(visitante) || wa.length < 10 || wa.length > 13 || !nome) return NextResponse.json({ ok: false }, { status: 400 })
    // uma vez por visitante
    const { data: ja } = await sb.from('recado_site_eventos').select('id').eq('visitante', visitante).eq('evento', 'form_contato').limit(1)
    if (ja?.length) return NextResponse.json({ ok: true, ja: true })
    const desafio = limpa(b.desafio, 30), anuncio = limpa(b.anuncio, 80)
    await db.insere('site_eventos', { visitante, evento: 'form_contato', pagina: '/recado/acordo.html', produto: 'noel/acordo', utm_content: anuncio || null, dados: { nome, wa, desafio } })
    await avisaDono('Acordo: deixou o WhatsApp', `${nome} · ${wa} · desafio: ${desafio || '-'}${anuncio ? ' · anúncio ' + anuncio : ''}. Começou o formulário; se não pagar em 1 hora, vale chamar.`, 'telephone_receiver')
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ ok: false }, { status: 400 }) }
}
