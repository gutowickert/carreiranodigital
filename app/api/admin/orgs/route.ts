import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { supabaseDoUsuario } from '@/lib/supabase-user'
import { ORG_CND } from '@/lib/org'

// PAINEL ADMIN (super-admin CnD): lista as organizações com uso/custo + ações.
// Só quem é admin da CnD acessa.
async function superAdmin(auth: string | null): Promise<{ ok: boolean; email?: string }> {
  try {
    const { data: { user } } = await supabaseDoUsuario(auth).auth.getUser()
    if (!user) return { ok: false }
    const { data: p } = await sb.from('usuarios_perfil').select('papel, org_id, email').eq('id', user.id).maybeSingle()
    return { ok: !!p && p.org_id === ORG_CND && p.papel === 'admin', email: user.email || undefined }
  } catch { return { ok: false } }
}

async function contar(tabela: string, org: string, f?: (q: any) => any) {
  let q = sb.from(tabela).select('*', { count: 'exact', head: true }).eq('org_id', org)
  if (f) q = f(q)
  const { count } = await q
  return count || 0
}

export async function GET(req: Request) {
  const sa = await superAdmin(req.headers.get('authorization'))
  if (!sa.ok) return NextResponse.json({ ok: false, error: 'sem acesso' }, { status: 200 })

  const mesInicio = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const { data: orgs } = await sb.from('organizacoes').select('*').order('criado_em', { ascending: true })
  const lista: any[] = []
  for (const o of (orgs || [])) {
    const org = o.id
    const [leads, ganhos, usuarios, msgsMes] = await Promise.all([
      contar('leads', org),
      contar('leads', org, q => q.eq('etapa', 'ganho')),
      contar('usuarios_perfil', org, q => q.eq('ativo', true)),
      contar('wa_mensagens', org, q => q.gte('criado_em', mesInicio)),
    ])
    // receita (soma valor_venda dos ganhos)
    const { data: vendas } = await sb.from('leads').select('valor_venda').eq('org_id', org).eq('etapa', 'ganho')
    const receita = (vendas || []).reduce((s: number, v: any) => s + (Number(v.valor_venda) || 0), 0)
    // custo de IA no mês (soma custo_usd dos logs ia-uso)
    let custoIA = 0, chamadasIA = 0
    for (let p = 0; p < 10; p++) {
      const { data } = await sb.from('webhook_logs').select('payload').eq('org_id', org).eq('origem', 'ia-uso').gte('recebido_em', mesInicio).range(p * 1000, p * 1000 + 999)
      if (!data || !data.length) break
      for (const r of data) { custoIA += Number((r.payload as any)?.custo_usd) || 0; chamadasIA++ }
      if (data.length < 1000) break
    }
    // última atividade (última mensagem)
    const { data: ult } = await sb.from('wa_mensagens').select('criado_em').eq('org_id', org).order('criado_em', { ascending: false }).limit(1).maybeSingle()
    lista.push({
      id: org, nome: o.nome, slug: o.slug, plano: o.plano, ativo: o.ativo, criado_em: o.criado_em,
      leads, ganhos, receita, usuarios, msgsMes,
      custoIA: Math.round(custoIA * 100) / 100, chamadasIA,
      ultimaAtividade: ult?.criado_em || null,
    })
  }
  return NextResponse.json({ ok: true, orgs: lista })
}

export async function POST(req: Request) {
  const sa = await superAdmin(req.headers.get('authorization'))
  if (!sa.ok) return NextResponse.json({ ok: false, error: 'sem acesso' }, { status: 200 })
  const b = await req.json().catch(() => ({}))
  const { orgId, acao } = b
  if (!orgId || !acao) return NextResponse.json({ ok: false, error: 'faltam dados' }, { status: 200 })
  if (orgId === ORG_CND && (acao === 'suspender')) return NextResponse.json({ ok: false, error: 'não dá pra suspender a CnD' }, { status: 200 })

  if (acao === 'suspender' || acao === 'reativar') {
    await sb.from('organizacoes').update({ ativo: acao === 'reativar' }).eq('id', orgId)
  } else if (acao === 'plano') {
    await sb.from('organizacoes').update({ plano: (b.plano || '').toString().slice(0, 40) }).eq('id', orgId)
  } else {
    return NextResponse.json({ ok: false, error: 'ação inválida' }, { status: 200 })
  }
  return NextResponse.json({ ok: true })
}

// Onboarding: cria a organização + o usuário ADMIN dela (login pronto).
export async function PUT(req: Request) {
  const sa = await superAdmin(req.headers.get('authorization'))
  if (!sa.ok) return NextResponse.json({ ok: false, error: 'sem acesso' }, { status: 200 })
  const b = await req.json().catch(() => ({}))
  const nome = (b.nome || '').toString().trim()
  const slug = (b.slug || '').toString().trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-') || nome.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const email = (b.adminEmail || '').toString().trim().toLowerCase()
  const senha = (b.adminSenha || '').toString()
  const adminNome = (b.adminNome || '').toString().trim() || nome
  if (!nome || !email || senha.length < 6) return NextResponse.json({ ok: false, error: 'informe nome da org, email e senha (mín. 6)' }, { status: 200 })

  // 1) cria a organização
  const orgId = randomUUID()
  const { error: eOrg } = await sb.from('organizacoes').insert({ id: orgId, nome, slug, plano: (b.plano || 'teste').toString(), ativo: true })
  if (eOrg) return NextResponse.json({ ok: false, error: 'erro ao criar org: ' + eOrg.message }, { status: 200 })

  // 2) cria o login no Auth
  const { data: created, error: eAuth } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome: adminNome } })
  if (eAuth || !created?.user?.id) {
    await sb.from('organizacoes').delete().eq('id', orgId)
    const msg = eAuth?.message || 'falha ao criar login'
    return NextResponse.json({ ok: false, error: /already/i.test(msg) ? 'esse email já tem login' : msg }, { status: 200 })
  }

  // 3) cria o perfil admin da org (acesso completo)
  const { error: ePerfil } = await sb.from('usuarios_perfil').insert({
    id: created.user.id, auth_id: created.user.id, org_id: orgId,
    nome: adminNome, email, papel: 'admin', setor: 'comercial', ativo: true,
    crm_interno: true, crm_externo: true, leads_escopo: 'todos', wa_caixa: true,
  })
  if (ePerfil) {
    await sb.auth.admin.deleteUser(created.user.id).catch(() => {})
    await sb.from('organizacoes').delete().eq('id', orgId)
    return NextResponse.json({ ok: false, error: 'erro ao criar perfil: ' + ePerfil.message }, { status: 200 })
  }

  return NextResponse.json({ ok: true, orgId, email, senha })
}
