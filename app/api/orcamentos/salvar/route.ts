import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { quemEuVejo } from '@/lib/quem-eu-vejo'

export const maxDuration = 60

// Salva o que o vendedor mexeu no rascunho: o texto da capa, o texto de cada objeção, e quais ele
// aprovou ou tirou. Fica registrado quem editou e quando.
//
// O QUE ESTA ROTA NÃO DEIXA MUDAR: a citação (é a prova de que a objeção veio da conversa) e o preço
// (vem do cadastro). Texto editado à mão fica em `texto_final`; o que a IA escreveu continua em
// `texto_ia`, lado a lado — dá pra ver o que foi reescrito e por quem.

export async function POST(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    const org = await orgDaRequest(auth)
    const quem = await quemEuVejo(auth, org)
    if (!quem) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })

    const b = await req.json().catch(() => ({} as any))
    const id = (b.id || '').toString()
    if (!id) return NextResponse.json({ ok: false, error: 'falta o orçamento' }, { status: 200 })

    const { data: orc } = await sb.from('orcamentos').select('*').eq('org_id', org).eq('id', id).maybeSingle()
    if (!orc) return NextResponse.json({ ok: false, error: 'orçamento não encontrado' }, { status: 200 })
    if (orc.situacao === 'publicado') {
      return NextResponse.json({ ok: false, error: 'este orçamento já foi publicado — gere um novo pra mudar o texto' }, { status: 200 })
    }

    const patch: any = { atualizado_em: new Date().toISOString(), editado_por: quem.eu.id, editado_em: new Date().toISOString() }

    // o nome que sai na proposta (o cadastro do lead segue intocado)
    if (b.cliente_nome !== undefined) {
      patch.cliente_nome = (b.cliente_nome || '').toString().trim().slice(0, 120) || null
    }

    if (b.capa && typeof b.capa === 'object') {
      patch.capa = {
        titulo: String(b.capa.titulo || '').slice(0, 140),
        subtitulo: String(b.capa.subtitulo || '').slice(0, 700),
      }
    }

    if (Array.isArray(b.objecoes)) {
      const porOrdem = new Map<number, any>((orc.objecoes as any[] || []).map(o => [o.ordem, o]))
      patch.objecoes = b.objecoes.map((o: any, i: number) => {
        const original = porOrdem.get(Number(o?.ordem)) || {}
        const situacao = ['pendente', 'aprovada', 'fora'].includes(o?.situacao) ? o.situacao : (original.situacao || 'pendente')
        const editado = typeof o?.texto_final === 'string' ? o.texto_final.trim() : (original.texto_final || null)
        return {
          ordem: Number(o?.ordem) || i + 1,
          titulo: String(o?.titulo ?? original.titulo ?? '').slice(0, 120),
          // a citação não se edita: é a prova de que a objeção saiu da conversa
          citacao: original.citacao ?? '',
          texto_ia: original.texto_ia ?? '',
          texto_final: editado ? editado.slice(0, 1600) : null,
          situacao,
        }
      })
    }

    // condição de pagamento: o vendedor pode ajustar, e fica registrado que foi ele
    if (b.preco_vista !== undefined) patch.preco_vista = b.preco_vista === '' || b.preco_vista == null ? null : Number(String(b.preco_vista).replace(',', '.'))
    if (b.parcelas !== undefined) patch.parcelas = b.parcelas === '' || b.parcelas == null ? null : Number(b.parcelas)
    if (b.preco_parcelado !== undefined) patch.preco_parcelado = b.preco_parcelado === '' || b.preco_parcelado == null ? null : Number(String(b.preco_parcelado).replace(',', '.'))

    const { data, error } = await sb.from('orcamentos').update(patch).eq('org_id', org).eq('id', id).select('*').single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })

    return NextResponse.json({ ok: true, orcamento: data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
