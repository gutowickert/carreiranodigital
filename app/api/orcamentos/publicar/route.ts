import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { quemEuVejo } from '@/lib/quem-eu-vejo'

export const maxDuration = 60

// Publica o orçamento: cria o endereço público e marca como publicado.
//
// O QUE ELA NÃO FAZ, de propósito (decisão do Nando em 18/09/2026): não mexe na etapa do funil, não
// cria tarefa e não manda mensagem. Publicar é só deixar a proposta pronta pra enviar.
//
// O que ela registra: uma linha no histórico do lead, pra quem abrir o card depois saber que foi
// enviada uma proposta, por quem e quando. Histórico é leitura, não muda o andamento de ninguém.

// endereço sem ambiguidade visual (sem 0/O, 1/l): vai ser lido em tela de celular
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789'
const sorteio = (n = 5) => Array.from({ length: n }, () => ALFABETO[Math.floor(Math.random() * ALFABETO.length)]).join('')

// O endereço leva o nome da pessoa: "/proposta/vinicius-meirer-4f7k2" em vez de "/proposta/gzhgb8nvgw".
// Código puro tem cara de link encurtado, e é isso que o cliente associa a golpe — o nome dele no
// endereço diz, antes de abrir, que aquilo foi feito pra ele.
//
// ⚠️ O SORTEIO NO FIM NÃO SAI. Sem ele o endereço vira adivinhável: o link é aberto, sem senha, e
// quem abrir lê o preço e as frases que a pessoa disse na conversa. Com 5 caracteres sorteados são
// mais de 28 milhões de combinações por nome — tentar na mão não chega a lugar nenhum.
function enderecoDe(nome: string) {
  const partes = (nome || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').trim()
    .split(/\s+/).filter(Boolean)
  // primeiro nome + último sobrenome: nome do meio só alonga o endereço
  const nomes = partes.length > 1 ? [partes[0], partes[partes.length - 1]] : partes
  const limpo = nomes.join('-').slice(0, 34)
  return `${limpo || 'proposta'}-${sorteio()}`
}

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

    // já publicado: devolve o mesmo link, sem criar outro
    if (orc.situacao === 'publicado' && orc.slug) {
      return NextResponse.json({ ok: true, slug: orc.slug, url: `${new URL(req.url).origin}/proposta/${orc.slug}`, ja_estava: true })
    }

    if (!orc.capa?.titulo) {
      return NextResponse.json({ ok: false, error: 'o rascunho está sem título — gera de novo antes de publicar' }, { status: 200 })
    }

    // objeção que o vendedor tirou não vai pra proposta
    const objecoes = (orc.objecoes as any[] || []).filter(o => o.situacao !== 'fora')

    const { data: dono } = await sb.from('leads').select('nome').eq('id', orc.lead_id).maybeSingle()
    let slug = enderecoDe(dono?.nome || '')
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const { data: existe } = await sb.from('orcamentos').select('id').eq('slug', slug).maybeSingle()
      if (!existe) break
      slug = enderecoDe(dono?.nome || '')
    }

    const { data, error } = await sb.from('orcamentos')
      .update({ situacao: 'publicado', slug, publicado_em: new Date().toISOString(), objecoes, atualizado_em: new Date().toISOString() })
      .eq('org_id', org).eq('id', id).select('*').single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })

    // histórico do lead: quem abrir o card vê que saiu proposta, por quem e quando
    try {
      await sb.from('lead_andamentos').insert({
        lead_id: orc.lead_id,
        vendedor_id: quem.eu.id,
        tipo: 'observacao',
        observacao: `📄 Proposta enviada por ${quem.eu.nome}: /proposta/${slug}`,
      })
    } catch { /* histórico não pode derrubar a publicação */ }

    return NextResponse.json({ ok: true, slug, url: `${new URL(req.url).origin}/proposta/${slug}`, orcamento: data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
