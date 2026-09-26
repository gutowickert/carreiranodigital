import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { temSessao, meuPerfil } from '@/lib/quem-eu-vejo'
import { criarChamada, urlGravacao } from '@/lib/chamadas'

// AS CHAMADAS DO TIME (com login).
//   GET  → as últimas chamadas da empresa, com o link da gravação (assinado, 1h)
//   POST → cria uma chamada: { lead_id?, lead_nome?, telefone?, com_video? } → { codigo, link_lead, link_host }

export async function GET(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    if (!(await temSessao(auth))) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
    const org = await orgDaRequest(auth)
    const { data } = await sb.from('chamadas').select('id, codigo, chave_host, lead_id, lead_nome, telefone, criado_por_nome, com_video, status, criado_em, iniciada_em, encerrada_em, duracao_seg, pedacos, gravacao_path, transcricao, erro')
      .eq('org_id', org).order('criado_em', { ascending: false }).limit(50)
    const origem = new URL(req.url).origin
    const lista = await Promise.all((data || []).map(async c => ({
      ...c, gravacao_url: await urlGravacao(c.gravacao_path),
      link_lead: `${origem}/call/${c.codigo}`, link_host: `${origem}/call/${c.codigo}?h=${c.chave_host}`,
    })))
    return NextResponse.json({ ok: true, chamadas: lista })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    if (!(await temSessao(auth))) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })
    const org = await orgDaRequest(auth)
    const eu = await meuPerfil(auth)
    const b = await req.json().catch(() => ({} as any))

    // quem convida, como o lead vai ver do outro lado
    const { data: perfil } = await sb.from('usuarios_perfil').select('id, nome, apelido').eq('org_id', org).eq('id', eu?.id || '').maybeSingle()
    const nome = perfil?.apelido || perfil?.nome?.split(' ')[0] || 'a escola'

    let lead_nome = (b.lead_nome || '').toString() || null, telefone = (b.telefone || '').toString() || null
    if (b.lead_id) {
      const { data: lead } = await sb.from('leads').select('id, nome, whatsapp').eq('org_id', org).eq('id', b.lead_id).maybeSingle()
      if (!lead) return NextResponse.json({ ok: false, error: 'lead não encontrado' }, { status: 200 })
      lead_nome = lead_nome || lead.nome; telefone = telefone || lead.whatsapp
    }
    const r = await criarChamada(org, { lead_id: b.lead_id || null, lead_nome, telefone, criado_por: perfil?.id || eu?.id || '', criado_por_nome: nome, com_video: !!b.com_video })
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 200 })
    const origem = new URL(req.url).origin
    return NextResponse.json({ ok: true, codigo: r.chamada.codigo, link_lead: `${origem}/call/${r.chamada.codigo}`, link_host: `${origem}/call/${r.chamada.codigo}?h=${r.chamada.chave_host}` })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
