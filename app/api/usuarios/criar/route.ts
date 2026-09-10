import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { supabaseDoUsuario } from '@/lib/supabase-user'

// CRIAR USUÁRIO — pelo servidor, não pelo navegador.
//
// A tela fazia `supabase.auth.signUp()` direto do navegador, e isso tem DOIS problemas:
//
//   1. `signUp` TROCA A SESSÃO do navegador pela do usuário recém-criado. Ou seja: o admin que
//      clicava em "Criar usuário" era deslogado e virava o novo funcionário, sem aviso nenhum.
//      Isso é antigo, não veio da hierarquia.
//
//   2. Como a sessão já era a do novato, o `insert` do perfil rodava como ELE — que não é dono.
//      Com a regra nova (só dono escreve em usuarios_perfil), esse insert passa a ser recusado, e
//      sobra um login no Auth sem perfil nenhum: a pessoa entra e o sistema não sabe quem ela é.
//
// Aqui: confere que quem pediu é dono, cria com a chave de serviço (que não mexe na sessão de
// ninguém) e, se o perfil falhar, desfaz o login pra não deixar órfão. É o mesmo caminho que a
// rota de acesso de professor já usava.

export async function POST(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    const org = await orgDaRequest(auth)

    const { data: u } = await supabaseDoUsuario(auth).auth.getUser().catch(() => ({ data: { user: null } as any }))
    if (!u?.user?.id) return NextResponse.json({ ok: false, error: 'sessão expirada' }, { status: 200 })

    const { data: quemPediu } = await sb.from('usuarios_perfil')
      .select('papel,org_id').eq('auth_id', u.user.id).maybeSingle()
    if (!quemPediu || quemPediu.papel !== 'admin') {
      return NextResponse.json({ ok: false, error: 'só o dono pode criar usuário' }, { status: 200 })
    }

    const { email, senha, nome, setor, papel } = await req.json()
    if (!email || !senha || !nome) return NextResponse.json({ ok: false, error: 'faltou email, senha ou nome' }, { status: 200 })

    const { data: criado, error: errAuth } = await sb.auth.admin.createUser({
      email, password: senha, email_confirm: true, user_metadata: { nome, setor },
    })
    if (errAuth || !criado?.user?.id) {
      const msg = errAuth?.message || 'falha ao criar login'
      return NextResponse.json({ ok: false, error: /already/i.test(msg) ? 'esse email já tem login' : msg }, { status: 200 })
    }

    const { error: errPerfil } = await sb.from('usuarios_perfil').insert({
      id: criado.user.id, auth_id: criado.user.id, org_id: quemPediu.org_id || org,
      nome, email, setor: setor || 'operacoes', papel: papel || 'vendedor', ativo: true,
    })
    if (errPerfil) {
      await sb.auth.admin.deleteUser(criado.user.id).catch(() => {})
      return NextResponse.json({ ok: false, error: 'erro ao salvar perfil: ' + errPerfil.message }, { status: 200 })
    }

    return NextResponse.json({ ok: true, email })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
