import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// Acesso de professor ao portal (/professor). Link é pelo EMAIL (login = professores.email).
//  GET  -> lista de emails que já têm acesso (setor='professor')
//  POST -> { professor_id, email, senha } cria o login e o perfil

export async function GET() {
  try {
    const { data } = await supabase.from('usuarios_perfil').select('email').eq('papel', 'professor')
    return NextResponse.json({ ok: true, emails: (data || []).map((r: any) => (r.email || '').toLowerCase()) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}))
    const email = (b.email || '').toString().trim().toLowerCase()
    const senha = (b.senha || '').toString()
    const professorId = b.professor_id
    if (!professorId || !email || senha.length < 6) {
      return NextResponse.json({ ok: false, error: 'informe professor, email e senha (mín. 6)' }, { status: 200 })
    }
    const { data: prof } = await supabase.from('professores').select('id, nome').eq('id', professorId).single()
    if (!prof) return NextResponse.json({ ok: false, error: 'professor não encontrado' }, { status: 200 })

    // garante o link: professores.email = email do login
    await supabase.from('professores').update({ email }).eq('id', professorId)

    // cria o usuário no Auth (sem precisar confirmar email)
    const { data: created, error: errAuth } = await supabase.auth.admin.createUser({
      email, password: senha, email_confirm: true, user_metadata: { nome: prof.nome, setor: 'professor' },
    })
    if (errAuth || !created?.user?.id) {
      const msg = errAuth?.message || 'falha ao criar login'
      return NextResponse.json({ ok: false, error: /already/i.test(msg) ? 'esse email já tem login' : msg }, { status: 200 })
    }

    const { error: errPerfil } = await supabase.from('usuarios_perfil').insert({
      id: created.user.id, nome: prof.nome, email, papel: 'professor', setor: 'operacoes', ativo: true,
    })
    if (errPerfil) {
      // desfaz o auth pra não deixar login órfão
      await supabase.auth.admin.deleteUser(created.user.id).catch(() => {})
      return NextResponse.json({ ok: false, error: 'erro ao salvar perfil: ' + errPerfil.message }, { status: 200 })
    }
    return NextResponse.json({ ok: true, email, senha })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
