import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { quemEuVejo } from '@/lib/quem-eu-vejo'

export const maxDuration = 30

// O ACEITE VISTO DE DENTRO: desfazer um aceite que não devia ter acontecido, ou registrar à mão um
// que aconteceu fora do link (o cliente disse sim por telefone, por WhatsApp, pessoalmente).
//
// EXIGE LOGIN — ao contrário de /api/orcamentos/aceitar, que é a porta do cliente. Quem mexe aqui é
// gente da casa, e fica registrado quem foi.
//
// ⚠️ DESFAZER NÃO APAGA A HISTÓRIA. O aceite sai do orçamento (o card volta a mostrar "aberta, sem
// aceite"), mas o histórico do lead ganha uma linha dizendo que houve um aceite e que fulano
// desfez, com a data do que foi desfeito. Aceite de cliente que some sem deixar rastro é o tipo de
// coisa que vira discussão depois.

export async function POST(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    const org = await orgDaRequest(auth)
    const quem = await quemEuVejo(auth, org)
    if (!quem) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })

    const b = await req.json().catch(() => ({} as any))
    const id = (b.id || '').toString()
    const acao = (b.acao || '').toString()
    if (!id) return NextResponse.json({ ok: false, error: 'falta o orçamento' }, { status: 200 })

    const { data: orc } = await sb.from('orcamentos')
      .select('id, lead_id, slug, situacao, aceito_em, aceito_nome')
      .eq('org_id', org).eq('id', id).maybeSingle()
    if (!orc) return NextResponse.json({ ok: false, error: 'orçamento não encontrado' }, { status: 200 })

    // quem vê o lead é quem mexe no aceite dele
    const { data: lead } = await sb.from('leads').select('id, nome, vendedor_id').eq('org_id', org).eq('id', orc.lead_id).maybeSingle()
    const { data: perfil } = await sb.from('usuarios_perfil').select('leads_escopo').eq('id', quem.eu.id).maybeSingle()
    const soMeus = perfil?.leads_escopo === 'proprios'
    const meu = !lead?.vendedor_id || (soMeus ? lead.vendedor_id === quem.eu.id : quem.visiveis.has(lead.vendedor_id))
    if (!meu) return NextResponse.json({ ok: false, error: 'este lead não é teu' }, { status: 403 })

    const agora = new Date().toISOString()
    const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

    if (acao === 'desfazer') {
      if (!orc.aceito_em) return NextResponse.json({ ok: false, error: 'esta proposta não está marcada como aceita' }, { status: 200 })

      await sb.from('orcamentos')
        .update({ aceito_em: null, aceito_nome: null, aceito_dispositivo: null, atualizado_em: agora })
        .eq('org_id', org).eq('id', id)

      try {
        await sb.from('lead_andamentos').insert({
          lead_id: orc.lead_id, vendedor_id: quem.eu.id, tipo: 'observacao',
          observacao: `↩️ Aceite desfeito por ${quem.eu.nome}. Estava registrado como aceito por "${orc.aceito_nome || 'sem nome'}" em ${quando(orc.aceito_em)}.`,
        })
      } catch { /* o histórico não pode travar a correção */ }

      return NextResponse.json({ ok: true, aceito_em: null, aceito_nome: null })
    }

    if (acao === 'registrar') {
      if (orc.situacao !== 'publicado') return NextResponse.json({ ok: false, error: 'a proposta ainda não foi publicada' }, { status: 200 })
      if (orc.aceito_em) return NextResponse.json({ ok: true, ja_estava: true, aceito_em: orc.aceito_em, aceito_nome: orc.aceito_nome })

      const nome = (b.nome || '').toString().trim().slice(0, 120) || lead?.nome || 'o cliente'
      const onde = (b.onde || '').toString().trim().slice(0, 60) || 'fora do link'

      await sb.from('orcamentos')
        .update({ aceito_em: agora, aceito_nome: nome, aceito_dispositivo: `registrado por ${quem.eu.nome}`, atualizado_em: agora })
        .eq('org_id', org).eq('id', id).is('aceito_em', null)

      try {
        await sb.from('lead_andamentos').insert({
          lead_id: orc.lead_id, vendedor_id: quem.eu.id, tipo: 'observacao',
          observacao: `✅ Aceite registrado à mão por ${quem.eu.nome}: "${nome}" aceitou ${onde}.`,
        })
      } catch { /* idem */ }

      return NextResponse.json({ ok: true, aceito_em: agora, aceito_nome: nome })
    }

    return NextResponse.json({ ok: false, error: 'ação desconhecida' }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
