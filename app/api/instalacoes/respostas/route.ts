import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { quemEuVejo } from '@/lib/quem-eu-vejo'

export const maxDuration = 60

// AS RESPOSTAS DE UMA IMPLANTAÇÃO, PRA QUEM VAI CONFIGURAR.
//
// ⚠️ AGRUPADAS POR DESTINO, não na ordem das perguntas. É a ideia do questionário do Guto que mais
// rendeu: cada resposta carrega ONDE ela entra no sistema (etapas, cadência, travas da IA,
// produtos, caixa…). Quem configura não lê 96 respostas em ordem — abre "etapas", configura as
// etapas, abre "cadência", configura a cadência.
//
// ⚠️ LÊ DO QUE FOI GRAVADO, não do molde. As respostas da Dani vieram do questionário antigo, com
// outro esquema de nomes (`bloco.pergunta`); as novas vêm do genérico (`pergunta`). As duas
// guardam a pergunta e o destino no `meta`, então a tela funciona para as duas sem saber a
// diferença — e continuará funcionando quando o molde mudar.
//
// SÓ ADMIN: aqui tem preço, margem, o que a IA não pode dizer e o que o dono acha do próprio
// negócio. É o material mais sensível que a empresa nos entrega.

const ok = (o: any) => NextResponse.json({ ok: true, ...o })
const erro = (m: string, s = 200) => NextResponse.json({ ok: false, error: m }, { status: s })

const ROTULO: Record<string, string> = { ok: 'Aprovado', ajustar: 'Ajustar', tirar: 'Tirar', sim: 'Feito', nao: 'Não' }

export async function GET(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    const org = await orgDaRequest(auth)
    const quem = await quemEuVejo(auth, org)
    if (!quem) return erro('sem sessao', 401)
    const { data: perfil } = await sb.from('usuarios_perfil').select('papel').eq('id', quem.eu.id).maybeSingle()
    if (perfil?.papel !== 'admin') return erro('só administradores', 403)

    const slug = new URL(req.url).searchParams.get('slug') || ''
    if (!slug) return erro('falta o questionário')

    const { data: imp } = await sb.from('implantacoes').select('slug, nome, criado_em').eq('slug', slug).maybeSingle()
    if (!imp) return erro('questionário não encontrado')

    const { data: linhas } = await sb.from('implantacao_respostas')
      .select('campo, valor, meta, atualizado_em').eq('slug', slug)

    // Os anexos vêm em linhas próprias (`<campo>__anexos`), com a transcrição do áudio dentro.
    // Links assinados de 6h — o balde é privado.
    const anexosPorCampo = new Map<string, any[]>()
    const caminhos: string[] = []
    for (const l of linhas || []) {
      if (!l.campo.endsWith('__anexos')) continue
      let lista: any[] = []
      try { lista = JSON.parse(l.valor || '[]') } catch { lista = [] }
      if (Array.isArray(lista) && lista.length) {
        anexosPorCampo.set(l.campo.replace(/__anexos$/, ''), lista)
        for (const a of lista) caminhos.push(a.path)
      }
    }
    const urls = new Map<string, string>()
    if (caminhos.length) {
      const { data } = await sb.storage.from('implantacao').createSignedUrls(caminhos, 6 * 3600)
      for (const s of data || []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl)
    }

    // o status de uma proposta é gravado em `<campo>__status`; o comentário fica no campo puro
    const status = new Map<string, string>()
    for (const l of linhas || []) if (l.campo.endsWith('__status')) status.set(l.campo.replace(/__status$/, ''), l.valor)

    const itens: any[] = []
    for (const l of linhas || []) {
      if (l.campo.endsWith('__anexos') || l.campo.endsWith('__status')) continue
      const m: any = l.meta || {}
      const st = status.get(l.campo)
      const anexos = (anexosPorCampo.get(l.campo) || []).map(a => ({ ...a, url: urls.get(a.path) || null }))
      if (!String(l.valor || '').trim() && !st && !anexos.length) continue
      itens.push({
        campo: l.campo,
        pergunta: m.pergunta || l.campo,
        tipo: m.tipo || 'texto',
        destino: (m.entra_em || '').trim() || 'sem destino',
        valor: l.valor || '',
        status: st ? (ROTULO[st] || st) : null,
        statusBruto: st || null,
        anexos,
        em: l.atualizado_em,
      })
    }
    // as que só têm anexo (o dono respondeu falando e não escreveu nada)
    for (const [campo, lista] of anexosPorCampo) {
      if (itens.some(i => i.campo === campo)) continue
      itens.push({
        campo, pergunta: campo, tipo: 'anexo', destino: 'sem destino', valor: '', status: null, statusBruto: null,
        anexos: lista.map(a => ({ ...a, url: urls.get(a.path) || null })), em: null,
      })
    }

    // agrupa por destino, com "sem destino" sempre no fim
    const grupos = new Map<string, any[]>()
    for (const i of itens) {
      const g = grupos.get(i.destino) || []
      g.push(i); grupos.set(i.destino, g)
    }
    const ordenados = [...grupos.entries()]
      .sort((a, b) => a[0] === 'sem destino' ? 1 : b[0] === 'sem destino' ? -1 : a[0].localeCompare(b[0]))
      .map(([destino, itens]) => ({ destino, itens }))

    const audios = itens.reduce((s, i) => s + i.anexos.filter((a: any) => a.tipo === 'audio').length, 0)
    return ok({
      nome: imp.nome, slug: imp.slug, criado_em: imp.criado_em,
      grupos: ordenados, total: itens.length, audios,
    })
  } catch (e: any) {
    return erro(e?.message || 'erro')
  }
}
