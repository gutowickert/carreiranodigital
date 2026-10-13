// Oito Posts: cadastra os domínios das marcas no Resend e mostra os registros de DNS que vão no Editor de Zona da HostGator (13/10).
// Salão e Prato ficam na conta do Recado (RESEND_API_KEY). O Pata fica numa conta grátis própria (OITO_RESEND_PATA),
// porque o plano grátis do Resend tem limite de domínios por conta.
//   GET              (x-senha) → por domínio: status e registros (tipo, nome, valor, prioridade)
//   POST             (x-senha) → cria os que faltam
//   POST ?verificar=1 (x-senha) → pede pro Resend conferir o DNS agora
import { NextResponse } from 'next/server'
import { senhaOk, oitoConfig as cfg } from '@/lib/oito/config'

export const maxDuration = 60
const R = 'https://api.resend.com'
const CONTAS = () => [
  { chave: process.env.RESEND_API_KEY, dominios: [cfg.marcas.salao.dominio, cfg.marcas.prato.dominio] },
  { chave: process.env.OITO_RESEND_PATA, dominios: [cfg.marcas.pata.dominio] },
].filter(c => c.chave) as { chave: string; dominios: string[] }[]
const H = (k: string) => ({ Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' })

async function lista() {
  const out: { id: string; name: string; chave: string }[] = []
  for (const c of CONTAS()) {
    const j: any = await fetch(`${R}/domains`, { headers: H(c.chave), cache: 'no-store' }).then(r => r.json())
    for (const d of j.data || []) if (c.dominios.includes(d.name)) out.push({ id: d.id, name: d.name, chave: c.chave })
  }
  return out
}

export async function GET(req: Request) {
  if (!senhaOk(req.headers.get('x-senha'))) return NextResponse.json({ erro: 'senha' }, { status: 401 })
  const ds = await lista()
  const out = await Promise.all(ds.map(async d => {
    const x: any = await fetch(`${R}/domains/${d.id}`, { headers: H(d.chave), cache: 'no-store' }).then(r => r.json())
    return { dominio: d.name, status: x.status, registros: (x.records || []).map((r: any) => ({ tipo: r.type, nome: r.name, valor: r.value, prioridade: r.priority ?? null, status: r.status })) }
  }))
  const todos = Object.values(cfg.marcas).map(m => m.dominio)
  return NextResponse.json({ conta_pata: !!process.env.OITO_RESEND_PATA, faltam: todos.filter(n => !ds.find(d => d.name === n)), dominios: out })
}

export async function POST(req: Request) {
  if (!senhaOk(req.headers.get('x-senha'))) return NextResponse.json({ erro: 'senha' }, { status: 401 })
  const ds = await lista()
  if (new URL(req.url).searchParams.get('verificar')) {
    const r = await Promise.all(ds.map(d => fetch(`${R}/domains/${d.id}/verify`, { method: 'POST', headers: H(d.chave) }).then(x => x.json()).then(j => ({ dominio: d.name, ok: !!j.id }))))
    return NextResponse.json({ verificando: r })
  }
  const criados = []
  for (const c of CONTAS()) for (const nome of c.dominios) {
    if (ds.find(d => d.name === nome)) continue
    const j = await fetch(`${R}/domains`, { method: 'POST', headers: H(c.chave), body: JSON.stringify({ name: nome, region: 'us-east-1' }) }).then(r => r.json())
    criados.push({ dominio: nome, resposta: j.id ? 'criado' : j })
  }
  return NextResponse.json({ criados })
}
