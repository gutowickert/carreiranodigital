import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { resumoDoProduto, parcelasDoProduto, parcelaDoProduto } from '@/lib/proposta-produtos'
import { MODELO, MAX_OBJECOES, MAX_CARACTERES_MATERIAL, SYSTEM, mecanicaDoOutroProduto, normal, citacaoConfere, jsonDaResposta, enderecoDe } from '@/lib/orcamento-ia'
import { logIaUso } from '@/lib/ia-uso'

// A PROPOSTA QUE O PLANTÃO DA IA MONTA SOZINHO (27/10/2026).
//
// É a MESMA proposta da tela Gerar orçamento: o mesmo pedido pra IA e as mesmas travas
// (lib/orcamento-ia), o mesmo corpo fixo por produto e o preço do CADASTRO (a turma, ou o produto).
// A diferença é só quem aperta o botão: aqui ela já nasce publicada, porque não tem ninguém do time
// pra publicar de quinta a terça. Por isso ela avisa o time a cada proposta (lib/plantao-avisos), e
// quem quiser corrige no mesmo link.
//
// UMA POR PESSOA POR PRODUTO: se já existe proposta publicada desse produto pra esse lead nos últimos
// 30 dias, devolve a mesma, sem gerar outra.
//
// Na SOMBRA não grava nada: escreve a capa e as objeções e devolve, pra aparecer no registro.
const BASE = 'https://carreiranodigital.vercel.app'

export type PropostaPlantao =
  | { ok: true; url: string; slug: string; nova: boolean; capa: { titulo: string; subtitulo: string }; objecoes: number }
  | { ok: true; sombra: true; capa: { titulo: string; subtitulo: string }; objecoes: string[] }
  | { ok: false; erro: string }

export async function montarPropostaPlantao(o: {
  org: string; leadId: string; vendedorId: string | null
  produto: { id: string; nome: string; preco_venda: number | null }
  turma: { id: string; preco_venda: number | null } | null
  clienteNome: string; negocio: string | null; regiao: string | null
  conversa: string; sombra: boolean
}): Promise<PropostaPlantao> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { ok: false, erro: 'sem a chave da IA' }

  if (!o.sombra) {
    const desde = new Date(Date.now() - 30 * 864e5).toISOString()
    const { data: ja } = await sb.from('orcamentos').select('slug, capa, objecoes')
      .eq('org_id', o.org).eq('lead_id', o.leadId).eq('produto_id', o.produto.id).eq('situacao', 'publicado')
      .gte('criado_em', desde).order('criado_em', { ascending: false }).limit(1).maybeSingle()
    if (ja?.slug) return { ok: true, url: `${BASE}/proposta/${ja.slug}`, slug: ja.slug, nova: false, capa: (ja.capa as any) || { titulo: '', subtitulo: '' }, objecoes: ((ja.objecoes as any[]) || []).length }
  }

  const material = `CONVERSA NO WHATSAPP:\n${o.conversa}`.slice(0, MAX_CARACTERES_MATERIAL)
  const pedido = [
    `CLIENTE: ${o.clienteNome}`,
    o.negocio ? `O QUE O NEGÓCIO DELE VENDE: ${o.negocio}` : 'O NEGÓCIO DELE: não informado — não invente exemplos de produto.',
    o.regiao ? `REGIÃO QUE ELE ATENDE: ${o.regiao}` : '',
    `PRODUTO QUE ESTAMOS PROPONDO: ${o.produto.nome}`,
    resumoDoProduto(o.produto.nome),
    '',
    'MATERIAL (o que a pessoa já disse):',
    material,
  ].filter(Boolean).join('\n')

  const client = new Anthropic({ apiKey: key })
  const pedirIA = () => client.messages.create({ model: MODELO, max_tokens: 4000, system: SYSTEM, messages: [{ role: 'user', content: pedido }] })
  let resp = await pedirIA()
  if (resp.stop_reason === 'max_tokens') resp = await pedirIA()
  await logIaUso('plantao-proposta', MODELO, resp.usage, { lead_id: o.leadId, sombra: o.sombra })
  const out = jsonDaResposta((resp.content || []).map((c: any) => (c.type === 'text' ? c.text : '')).join('').trim())
  if (!out?.capa?.titulo) return { ok: false, erro: 'a IA não devolveu a capa' }

  let capa = { titulo: String(out.capa.titulo || '').slice(0, 140), subtitulo: String(out.capa.subtitulo || '').slice(0, 700) }
  // a trava da mecânica do OUTRO produto: aqui, sem segunda tentativa — tira o subtítulo e segue
  if (mecanicaDoOutroProduto(o.produto.nome, `${capa.titulo} ${capa.subtitulo}`)) capa = { titulo: capa.titulo, subtitulo: '' }
  if (mecanicaDoOutroProduto(o.produto.nome, capa.titulo)) return { ok: false, erro: 'a capa falou da mecânica de outro produto' }

  const materialNormal = normal(material)
  const objecoes = (Array.isArray(out.objecoes) ? out.objecoes.slice(0, MAX_OBJECOES) : [])
    .filter((x: any) => citacaoConfere(String(x?.citacao || ''), materialNormal))
    .map((x: any, i: number) => ({
      ordem: i + 1, titulo: String(x?.titulo || '').slice(0, 120), citacao: String(x?.citacao || '').slice(0, 400),
      texto_ia: String(x?.texto || '').slice(0, 1600), texto_final: null,
      // aprovada: no plantão ninguém revisa antes; o time revisa depois, pelo aviso
      situacao: 'aprovada',
    }))

  if (o.sombra) return { ok: true, sombra: true, capa, objecoes: objecoes.map((x: any) => x.titulo) }

  const precoVista = o.turma?.preco_venda ?? o.produto.preco_venda ?? null
  if (precoVista == null) return { ok: false, erro: 'sem preço no cadastro' }
  let slug = enderecoDe(o.clienteNome)
  for (let i = 0; i < 5; i++) {
    const { data: existe } = await sb.from('orcamentos').select('id').eq('slug', slug).maybeSingle()
    if (!existe) break
    slug = enderecoDe(o.clienteNome)
  }
  const agora = new Date().toISOString()
  const linha: any = {
    org_id: o.org, lead_id: o.leadId, produto_id: o.produto.id, produto_nome: o.produto.nome,
    turma_id: o.turma?.id || null, cliente_nome: o.clienteNome,
    preco_vista: precoVista, parcelas: parcelasDoProduto(o.produto.nome), preco_parcelado: parcelaDoProduto(o.produto.nome, precoVista),
    contexto: { o_que_vende: o.negocio || '', regiao: o.regiao || '', origem: 'plantao-ia' },
    fontes: { plantao: true, caracteres: material.length }, capa, objecoes,
    situacao: 'publicado', slug, publicado_em: agora, modelo: MODELO,
    tokens_entrada: resp.usage?.input_tokens || null, tokens_saida: resp.usage?.output_tokens || null,
    custo_usd: Math.round((((resp.usage?.input_tokens || 0) * 2 + (resp.usage?.output_tokens || 0) * 10) / 1_000_000) * 1e6) / 1e6,
    criado_por: o.vendedorId,
  }
  const { error } = await sb.from('orcamentos').insert(linha)
  if (error) return { ok: false, erro: error.message }
  await sb.from('lead_andamentos').insert({ lead_id: o.leadId, vendedor_id: o.vendedorId, tipo: 'observacao', observacao: `📄 Proposta enviada pela IA do plantão: /proposta/${slug}` }).then(() => null, () => null)
  return { ok: true, url: `${BASE}/proposta/${slug}`, slug, nova: true, capa, objecoes: objecoes.length }
}
