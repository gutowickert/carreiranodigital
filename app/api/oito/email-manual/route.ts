// Oito Posts: e-mail avulso pra um cliente (13/10), com a moldura da marca. Protegido pela senha do painel.
//   POST {codigo, assunto, titulo, paragrafos: string[], botao?: 'teste'|'area'}
import { NextResponse } from 'next/server'
import { senhaOk, oitoConfig as cfg, Marca } from '@/lib/oito/config'
import { oitoDb as db } from '@/lib/oito/db'
import { molduraOito, enviaEmailOito } from '@/lib/oito/email'

const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

export async function POST(req: Request) {
  if (!senhaOk(req.headers.get('x-senha'))) return NextResponse.json({ erro: 'senha' }, { status: 401 })
  const b = await req.json()
  const c = await db.um('clientes', { codigo: String(b.codigo || '').toUpperCase() })
  if (!c) return NextResponse.json({ erro: 'cliente' }, { status: 404 })
  const m = c.marca as Marca, site = `https://www.${cfg.marcas[m].dominio}`
  const corpo = (Array.isArray(b.paragrafos) ? b.paragrafos : []).map((p: string) => `<p>${esc(p)}</p>`).join('')
  const botao = b.botao === 'area' ? { texto: 'Abrir minha área', url: `${site}/conta.html?c=${c.codigo}` } : b.botao === 'teste' ? { texto: 'Ver meus posts', url: `${site}/teste.html?c=${c.codigo}` } : undefined
  const r = await enviaEmailOito(m, c.email, String(b.assunto || '').slice(0, 150), molduraOito(m, String(b.titulo || b.assunto || ''), corpo, botao))
  await db.evento('email_manual', { cliente_id: c.id, marca: m, detalhe: { assunto: String(b.assunto || '').slice(0, 150), enviado: !!r.ok } })
  return NextResponse.json(r)
}
