// Bocadinho Doceria (31/10): o sistema do irmão do Guto (public/bocadinho/sistema.html) guarda tudo aqui,
// hospedado temporariamente na escola. Tabelas próprias (db/bocadinho.sql), nada da escola é tocado.
// Toda chamada leva a senha do sistema no cabeçalho x-bocadinho-senha; o hash fica em bocadinho_config/acesso.
import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'

const COLECOES: Record<string, string> = { contatos: 'bocadinho_contatos', pedidos: 'bocadinho_pedidos', gastos: 'bocadinho_gastos', estoque: 'bocadinho_estoque', config: 'bocadinho_config' }
const ID = /^[A-Za-z0-9_-]{1,64}$/

let hashCache: { h: string; em: number } | null = null
async function senhaOk(req: NextRequest) {
  const s = req.headers.get('x-bocadinho-senha') || ''
  if (!s || s.length > 80) return false
  if (!hashCache || Date.now() - hashCache.em > 60_000) {
    const { data } = await sb.from('bocadinho_config').select('dados').eq('id', 'acesso').maybeSingle()
    hashCache = { h: (data?.dados as any)?.hash || '', em: Date.now() }
  }
  return !!hashCache.h && createHash('sha256').update('bocadinho:' + s).digest('hex') === hashCache.h
}
const negado = () => NextResponse.json({ ok: false, erro: 'senha' }, { status: 401 })

export async function GET(req: NextRequest) {
  if (!(await senhaOk(req))) return negado()
  const col = req.nextUrl.searchParams.get('col') || ''
  const tabela = COLECOES[col]
  if (!tabela) return NextResponse.json({ ok: false, erro: 'colecao' }, { status: 400 })
  // o banco devolve no máximo 1000 linhas por vez: pagina
  const docs: any[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from(tabela).select('id, dados').order('id').range(de, de + 999)
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
    for (const r of data || []) if (!(col === 'config' && r.id === 'acesso')) docs.push({ id: r.id, ...(r.dados as any) })
    if (!data || data.length < 1000) break
  }
  return NextResponse.json({ ok: true, docs })
}

export async function POST(req: NextRequest) {
  if (!(await senhaOk(req))) return negado()
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ ok: false }, { status: 400 }) }
  if (b.acao === 'login') return NextResponse.json({ ok: true })
  const tabela = COLECOES[b.col]
  const id = String(b.id || '')
  if (!tabela || !ID.test(id) || (b.col === 'config' && id === 'acesso')) return NextResponse.json({ ok: false, erro: 'caminho' }, { status: 400 })
  const dados = b.dados && typeof b.dados === 'object' && !Array.isArray(b.dados) ? b.dados : {}
  if (JSON.stringify(dados).length > 200_000) return NextResponse.json({ ok: false, erro: 'grande' }, { status: 400 })
  const agora = new Date().toISOString()
  if (b.acao === 'set') {
    const { error } = await sb.from(tabela).upsert({ id, dados, atualizado_em: agora })
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  } else if (b.acao === 'update') {
    const { data: atual } = await sb.from(tabela).select('dados').eq('id', id).maybeSingle()
    if (!atual) return NextResponse.json({ ok: false, erro: 'nao_existe' }, { status: 404 })
    const { error } = await sb.from(tabela).update({ dados: { ...(atual.dados as any), ...dados }, atualizado_em: agora }).eq('id', id)
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  } else if (b.acao === 'delete') {
    const { error } = await sb.from(tabela).delete().eq('id', id)
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  } else return NextResponse.json({ ok: false, erro: 'acao' }, { status: 400 })
  return NextResponse.json({ ok: true })
}
