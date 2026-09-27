import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { ORG_CND } from '@/lib/org'

// ONDE A CLIENTE ESTÁ NO MANUAL — o sinal que a página dela manda e a versão interna lê.
//
// Na apresentação, ela rola o manual dela no celular e o Nando vê, na versão interna, o capítulo
// dela pintado — sem perguntar "onde tu está?". A página dela manda o id do capítulo a cada troca
// (e um batimento a cada 20s enquanto está aberta); a dele pergunta a cada 3s.
//
// ⚠️ É PÚBLICO DE PROPÓSITO: a página dela não tem login. O que se aceita é só um id de capítulo de
// uma lista fechada, pra um cliente de uma lista fechada, e o que se guarda é isso e a hora. Nada
// de nome, telefone ou conteúdo. Guardado em `configuracoes` (chave manual.presenca.<cliente>) pra
// não pedir tabela nova por um sinal de dez bytes.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}
const CLIENTES = new Set(['dani-fell'])
const SECOES = new Set(['o-que-faz', 'entrar', 'dia-a-dia', 'whatsapp', 'funil', 'tarefas', 'cliente', 'maquina', 'caixa', 'ajustes', 'duvidas'])
const chaveDe = (c: string) => `manual.presenca.${c}`

export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS }) }

export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({} as any))
    const cliente = String(b.cliente || ''), secao = String(b.secao || '')
    if (!CLIENTES.has(cliente) || !SECOES.has(secao)) return NextResponse.json({ ok: false }, { status: 400, headers: CORS })
    const valor = JSON.stringify({ secao, em: new Date().toISOString() })
    const chave = chaveDe(cliente)
    const { data: atual } = await sb.from('configuracoes').select('chave').eq('org_id', ORG_CND).eq('chave', chave).maybeSingle()
    if (atual) await sb.from('configuracoes').update({ valor, atualizado_em: new Date().toISOString() }).eq('org_id', ORG_CND).eq('chave', chave)
    else await sb.from('configuracoes').insert({ org_id: ORG_CND, chave, valor, tipo: 'texto', categoria: 'manual', descricao: 'Onde a cliente está no manual (sinal da apresentação)', sistema: true })
    return NextResponse.json({ ok: true }, { headers: CORS })
  } catch {
    return NextResponse.json({ ok: false }, { status: 200, headers: CORS })
  }
}

export async function GET(req: NextRequest) {
  const cliente = req.nextUrl.searchParams.get('cliente') || ''
  if (!CLIENTES.has(cliente)) return NextResponse.json({ ok: false }, { status: 400, headers: CORS })
  const { data } = await sb.from('configuracoes').select('valor').eq('org_id', ORG_CND).eq('chave', chaveDe(cliente)).maybeSingle()
  let secao: string | null = null, ha = 999999
  try { const v = JSON.parse(data?.valor || '{}'); secao = v.secao || null; ha = Math.round((Date.now() - new Date(v.em).getTime()) / 1000) } catch { }
  // passou de 60s sem sinal, ela fechou (ou o celular apagou): não pinta nada
  return NextResponse.json({ ok: true, secao: ha <= 60 ? secao : null, ha_segundos: ha }, { headers: { ...CORS, 'Cache-Control': 'no-store' } })
}
