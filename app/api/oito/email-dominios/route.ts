// Oito Posts: cadastra os 3 domínios das marcas no Resend (a mesma conta do Recado, RESEND_API_KEY) e mostra os registros de DNS
// que vão no Editor de Zona da HostGator (13/10).
//   GET              (x-senha) → por domínio: status e registros (tipo, nome, valor, prioridade)
//   POST             (x-senha) → cria os que faltam
//   POST ?verificar=1 (x-senha) → pede pro Resend conferir o DNS agora
import { NextResponse } from 'next/server'
import { senhaOk, oitoConfig as cfg } from '@/lib/oito/config'

export const maxDuration = 60
const R = 'https://api.resend.com'
const H = () => ({ Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' })
const DOMINIOS = Object.values(cfg.marcas).map(m => m.dominio)

async function lista() {
  const j: any = await fetch(`${R}/domains`, { headers: H(), cache: 'no-store' }).then(r => r.json())
  return (j.data || []).filter((d: any) => DOMINIOS.includes(d.name))
}
async function detalhe(id: string) { return fetch(`${R}/domains/${id}`, { headers: H(), cache: 'no-store' }).then(r => r.json()) }

export async function GET(req: Request) {
  if (!senhaOk(req.headers.get('x-senha'))) return NextResponse.json({ erro: 'senha' }, { status: 401 })
  const ds = await lista()
  const out = await Promise.all(ds.map(async (d: any) => {
    const x: any = await detalhe(d.id)
    return { dominio: d.name, status: x.status, registros: (x.records || []).map((r: any) => ({ tipo: r.type, nome: r.name, valor: r.value, prioridade: r.priority ?? null, status: r.status, ttl: r.ttl })) }
  }))
  return NextResponse.json({ faltam: DOMINIOS.filter(n => !ds.find((d: any) => d.name === n)), dominios: out })
}

export async function POST(req: Request) {
  if (!senhaOk(req.headers.get('x-senha'))) return NextResponse.json({ erro: 'senha' }, { status: 401 })
  const ds = await lista()
  if (new URL(req.url).searchParams.get('verificar')) {
    const r = await Promise.all(ds.map((d: any) => fetch(`${R}/domains/${d.id}/verify`, { method: 'POST', headers: H() }).then(x => x.json()).then(j => ({ dominio: d.name, resposta: j }))))
    return NextResponse.json({ verificando: r })
  }
  const criados = []
  for (const nome of DOMINIOS) {
    if (ds.find((d: any) => d.name === nome)) continue
    const j = await fetch(`${R}/domains`, { method: 'POST', headers: H(), body: JSON.stringify({ name: nome, region: 'us-east-1' }) }).then(r => r.json())
    criados.push({ dominio: nome, resposta: j.id ? 'criado' : j })
  }
  return NextResponse.json({ criados })
}
