// Imersão Deu Venda (16/10/2026): o link individual do aluno e o progresso de cada passo.
// A página é estática: public/imersao/aluno/index.html?c=<codigo>. O painel do professor: public/imersao/aluno/turma.html.
// Banco: tabela imersao_alunos + função imersao_marca (Supabase da escola, só a chave de serviço lê e grava).
//
//   GET  ?c=<codigo>                         → { nome, turma, negocio, feitos }   (o aluno; o código é a senha dele)
//   POST { c, passo, feito }                 → marca ou desmarca um passo          (o aluno)
//   GET  ?todos=1            + x-senha        → todos os alunos, com o progresso    (o professor)
//   POST { acao: 'criar', nome, turma, negocio?, whatsapp? }  + x-senha → cria o aluno e devolve o código
//   POST { acao: 'editar', c, nome?, turma?, negocio?, whatsapp?, notas? } + x-senha
//   POST { acao: 'apagar', c }                + x-senha
// A senha do professor: a do painel do Recado (RECADO_PAINEL_SENHA) ou a só da imersão (IMERSAO_SENHA, pra equipe e sócios).
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const U = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string
const K = () => process.env.SUPABASE_SERVICE_ROLE_KEY as string
async function banco(caminho: string, opts: any = {}): Promise<any> {
  const r = await fetch(U() + caminho, {
    ...opts,
    headers: { apikey: K(), Authorization: 'Bearer ' + K(), 'Content-Type': 'application/json', ...(opts.headers || {}) },
    cache: 'no-store',
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`banco ${r.status}: ${t.slice(0, 200)}`)
  return t ? JSON.parse(t) : null
}

const TURMAS = ['poa-tarde', 'laj-noite', 'poa-noite']
const CODIGO = /^[a-z0-9]{6,16}$/
const PASSO = /^[a-z0-9-]{1,40}$/
// 19/10: a IMERSAO_SENHA (só deste painel, pra dividir com os sócios) também entra; a do Recado continua valendo pro Guto
const semAspas = (v?: string) => (v || '').replace(/^"|"$/g, '').trim()
const senhaOk = (s: string | null) => !!s && [semAspas(process.env.RECADO_PAINEL_SENHA), semAspas(process.env.IMERSAO_SENHA)].some(v => !!v && s === v)
const erro = (msg: string, status = 400) => NextResponse.json({ erro: msg }, { status })
const limpa = (v: any, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

// sem letras que se confundem (l, 1, o, 0), pra dar pra ditar o link
function novoCodigo() {
  const A = 'abcdefghijkmnpqrstuvwxyz23456789'
  let s = ''
  const b = crypto.getRandomValues(new Uint8Array(8))
  for (const x of b) s += A[x % A.length]
  return s
}

export async function GET(req: Request) {
  try {
    const u = new URL(req.url)
    if (u.searchParams.get('todos')) {
      if (!senhaOk(req.headers.get('x-senha'))) return erro('senha', 401)
      const alunos = await banco('/rest/v1/imersao_alunos?select=*&order=turma.asc,nome.asc')
      return NextResponse.json({ alunos })
    }
    const c = (u.searchParams.get('c') || '').toLowerCase()
    if (!CODIGO.test(c)) return erro('codigo')
    const l = await banco(`/rest/v1/imersao_alunos?codigo=eq.${c}&select=nome,turma,negocio,feitos`)
    if (!l?.length) return erro('nao_achei', 404)
    // o último acesso, pro professor ver quem abriu o link (não trava a resposta se falhar)
    banco(`/rest/v1/imersao_alunos?codigo=eq.${c}`, { method: 'PATCH', body: JSON.stringify({ ultimo_acesso: new Date().toISOString() }) }).catch(() => {})
    return NextResponse.json(l[0])
  } catch (e: any) {
    return erro('falhou: ' + e.message, 500)
  }
}

export async function POST(req: Request) {
  let b: any = {}
  try { b = await req.json() } catch { return erro('json') }
  try {
    // ---- o aluno marca um passo
    if (!b.acao) {
      const c = String(b.c || '').toLowerCase(), passo = String(b.passo || '')
      if (!CODIGO.test(c) || !PASSO.test(passo)) return erro('dados')
      const feitos = await banco('/rest/v1/rpc/imersao_marca', { method: 'POST', body: JSON.stringify({ c, p: passo, f: !!b.feito }) })
      if (feitos == null) return erro('nao_achei', 404)
      return NextResponse.json({ ok: true, feitos })
    }
    // ---- o professor
    if (!senhaOk(req.headers.get('x-senha'))) return erro('senha', 401)
    if (b.acao === 'criar') {
      const nome = limpa(b.nome), turma = limpa(b.turma, 20)
      if (!nome || !TURMAS.includes(turma)) return erro('nome e turma')
      for (let i = 0; i < 5; i++) {
        const codigo = novoCodigo()
        try {
          const l = await banco('/rest/v1/imersao_alunos', {
            method: 'POST', headers: { Prefer: 'return=representation' },
            body: JSON.stringify({ codigo, nome, turma, negocio: limpa(b.negocio) || null, whatsapp: limpa(b.whatsapp, 30) || null }),
          })
          return NextResponse.json({ ok: true, aluno: l[0] })
        } catch (e: any) { if (!String(e.message).includes('409')) throw e }
      }
      return erro('nao consegui gerar codigo', 500)
    }
    const c = String(b.c || '').toLowerCase()
    if (!CODIGO.test(c)) return erro('codigo')
    if (b.acao === 'editar') {
      const d: Record<string, any> = { atualizado_em: new Date().toISOString() }
      if (b.nome !== undefined) d.nome = limpa(b.nome)
      if (b.turma !== undefined) { if (!TURMAS.includes(b.turma)) return erro('turma'); d.turma = b.turma }
      if (b.negocio !== undefined) d.negocio = limpa(b.negocio) || null
      if (b.whatsapp !== undefined) d.whatsapp = limpa(b.whatsapp, 30) || null
      if (b.notas !== undefined) d.notas = limpa(b.notas, 2000) || null
      const l = await banco(`/rest/v1/imersao_alunos?codigo=eq.${c}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(d) })
      return NextResponse.json({ ok: true, aluno: l?.[0] })
    }
    if (b.acao === 'apagar') {
      await banco(`/rest/v1/imersao_alunos?codigo=eq.${c}`, { method: 'DELETE' })
      return NextResponse.json({ ok: true })
    }
    return erro('acao')
  } catch (e: any) {
    return erro('falhou: ' + e.message, 500)
  }
}
