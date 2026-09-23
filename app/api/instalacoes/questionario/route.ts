import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { quemEuVejo } from '@/lib/quem-eu-vejo'

export const maxDuration = 30

// CRIAR O QUESTIONÁRIO DE IMPLANTAÇÃO de uma empresa — o link que se manda pro dono responder.
//
// Cria a linha em `implantacoes` (endereço + chave) e devolve o link pronto pra copiar. A chave é
// sorteada e é o que protege as respostas: quem não tem o link com a chave não lê nem escreve nada.
// Por isso ela é MOSTRADA UMA VEZ e vive só ali — não tem tela que liste chaves.
//
// ⚠️ A chave NÃO é senha de usuário: é a fechadura daquele questionário. Se o link vazar, o que se
// faz é criar outro (e o antigo para de valer, porque a chave muda).

const ok = (o: any) => NextResponse.json({ ok: true, ...o })
const erro = (m: string, s = 200) => NextResponse.json({ ok: false, error: m }, { status: s })

// sem 0/O e 1/l: a chave vai ser lida e digitada de tela de celular
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const sorteio = (n: number) => Array.from({ length: n }, () => ALFABETO[Math.floor(Math.random() * ALFABETO.length)]).join('')

const endereco = (nome: string) => (nome || '')
  .normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'empresa'

export async function POST(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    const org = await orgDaRequest(auth)
    const quem = await quemEuVejo(auth, org)
    if (!quem) return erro('sem sessao', 401)
    const { data: perfil } = await sb.from('usuarios_perfil').select('papel').eq('id', quem.eu.id).maybeSingle()
    if (perfil?.papel !== 'admin') return erro('só administradores', 403)

    const b = await req.json().catch(() => ({} as any))
    const nome = (b.nome || '').toString().trim().slice(0, 120)
    if (!nome) return erro('falta o nome da empresa')

    // já existe questionário pra esta empresa? devolve o mesmo, com a chave — em vez de criar um
    // segundo e deixar duas metades respondidas em endereços diferentes
    const { data: ja } = await sb.from('implantacoes').select('slug, chave, nome').eq('nome', nome).maybeSingle()
    if (ja) return ok({ ja_existia: true, slug: ja.slug, chave: ja.chave })

    let slug = endereco(nome)
    for (let i = 0; i < 5; i++) {
      const { data: existe } = await sb.from('implantacoes').select('slug').eq('slug', slug).maybeSingle()
      if (!existe) break
      slug = `${endereco(nome)}-${sorteio(4).toLowerCase()}`
    }

    const chave = sorteio(16)
    const { error } = await sb.from('implantacoes').insert({ slug, nome, chave })
    if (error) return erro(error.message)
    return ok({ slug, chave })
  } catch (e: any) {
    return erro(e?.message || 'erro')
  }
}

// O que já existe, pra tela mostrar o link de quem já tem questionário.
export async function GET(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    const org = await orgDaRequest(auth)
    const quem = await quemEuVejo(auth, org)
    if (!quem) return erro('sem sessao', 401)
    const { data: perfil } = await sb.from('usuarios_perfil').select('papel').eq('id', quem.eu.id).maybeSingle()
    if (perfil?.papel !== 'admin') return erro('só administradores', 403)

    const { data } = await sb.from('implantacoes').select('slug, nome, chave, criado_em').order('criado_em', { ascending: false })
    const { data: respostas } = await sb.from('implantacao_respostas').select('slug')
    const conta = new Map<string, number>()
    for (const r of respostas || []) conta.set(r.slug, (conta.get(r.slug) || 0) + 1)

    return ok({ questionarios: (data || []).map(q => ({ ...q, respostas: conta.get(q.slug) || 0 })) })
  } catch (e: any) {
    return erro(e?.message || 'erro')
  }
}
