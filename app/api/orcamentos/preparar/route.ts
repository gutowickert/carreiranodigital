import { NextResponse } from 'next/server'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { quemEuVejo } from '@/lib/quem-eu-vejo'
import { temProposta, exigeTurma, parcelasDoProduto, parcelaDoProduto } from '@/lib/proposta-produtos'
import { turmasDoProduto, rotuloDaTurma } from '@/lib/turma-da-proposta'
import { transcreverAudiosDoLead } from '@/lib/transcrever-audio'

// O rótulo da etapa vem do banco (tabela `etapas`), nunca escrito aqui.
async function rotulosDasEtapas(org: string): Promise<Record<string, string>> {
  const { data } = await sb.from('etapas').select('chave, label').eq('org_id', org)
  return Object.fromEntries((data || []).map((e: any) => [e.chave, e.label]))
}

export const maxDuration = 60

// Tudo que a tela precisa mostrar antes de gerar: o lead, o material que a IA vai ler (ligação e/ou
// conversa), o produto com o preço DO CADASTRO, e o que o vendedor precisa preencher.
//
// SÓ LEITURA. Não grava nada.
//
// ⚠️ O PREÇO NUNCA SAI DA CONVERSA. Sai da turma do lead (e, na falta dela, do produto). Na ligação
// do Vinicius o vendedor falou 10x; na proposta da Maderaf estava 6x. Quem decide é o cadastro, e
// quem quiser outra condição troca na tela — aí fica registrado quem trocou.

const MIN_CARACTERES_LIGACAO = 400
const TRECHOS = 4   // amostra que a tela mostra pra pessoa reconhecer a conversa

export async function GET(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    const org = await orgDaRequest(auth)
    const quem = await quemEuVejo(auth, org)
    if (!quem) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })

    const leadId = new URL(req.url).searchParams.get('lead_id') || ''
    if (!leadId) return NextResponse.json({ ok: false, error: 'falta o lead' }, { status: 200 })

    const { data: lead } = await sb.from('leads')
      .select('id, nome, whatsapp, etapa, vendedor_id, origem, utm_source, utm_campaign, negocio, maior_problema, observacoes, codigo_turma, turmas(codigo, preco_venda, produtos(id, nome, preco_venda))')
      .eq('org_id', org).eq('id', leadId).maybeSingle()
    if (!lead) return NextResponse.json({ ok: false, error: 'lead não encontrado' }, { status: 200 })

    const { data: perfil } = await sb.from('usuarios_perfil').select('leads_escopo').eq('id', quem.eu.id).maybeSingle()
    const soMeus = perfil?.leads_escopo === 'proprios'
    const meu = !lead.vendedor_id || (soMeus ? lead.vendedor_id === quem.eu.id : quem.visiveis.has(lead.vendedor_id))
    if (!meu) return NextResponse.json({ ok: false, error: 'este lead não é teu' }, { status: 403 })

    // ── ligações com transcrição
    const { data: ligacoes } = await sb.from('ligacoes')
      .select('id, duracao, criado_em, metadata')
      .eq('org_id', org).eq('lead_id', leadId).order('criado_em', { ascending: false }).limit(20)

    const ligacoesProntas = (ligacoes || [])
      .map(l => ({ l, texto: String((l.metadata as any)?.transcricao || '') }))
      .filter(x => x.texto.length >= MIN_CARACTERES_LIGACAO)
      .map(({ l, texto }) => ({
        id: l.id,
        minutos: Math.round((l.duracao || 0) / 60),
        em: l.criado_em,
        caracteres: texto.length,
        trecho: texto.slice(0, 300),
      }))

    // ⚠️ OS ÁUDIOS VIRAM TEXTO ANTES DE CONTAR O MATERIAL — e é aqui, não em outro lugar.
    //
    // A transcrição só rodava quando a IA atendia a conversa. Lead atendido na mão chegava nesta
    // tela com os áudios mudos: a tela dizia "pouco material" e a IA escrevia a proposta em cima
    // das poucas mensagens de texto. No Patrick Rosa eram 6 áudios e 4 textos — a conversa inteira
    // estava em áudio, e a proposta foi escrita sem ela.
    //
    // Sim, isto GRAVA (a rota era só leitura). Grava no lugar certo: a transcrição vai pro `texto`
    // da própria mensagem, então a conversa, a fila e o gerador passam a enxergar — não é um
    // cache desta tela.
    const audios = await transcreverAudiosDoLead(org, leadId).catch(() => ({ transcritos: 0, pendentes: 0 }))

    // ── conversas de WhatsApp
    const { data: conversas } = await sb.from('wa_conversas')
      .select('id, canal, ultima_msg_em').eq('org_id', org).eq('lead_id', leadId).order('ultima_msg_em', { ascending: false }).limit(5)

    const conversasProntas: any[] = []
    for (const c of conversas || []) {
      const msgs: any[] = []
      for (let de = 0; ; de += 1000) {
        const { data } = await sb.from('wa_mensagens')
          .select('direcao, status, texto, criado_em').eq('conversa_id', c.id).order('criado_em').range(de, de + 999)
        msgs.push(...(data || []))
        if (!data || data.length < 1000) break
      }
      const doCliente = msgs.filter(m => m.direcao === 'recebida' || m.status === 'recebida')
      conversasProntas.push({
        id: c.id,
        canal: c.canal,
        em: c.ultima_msg_em,
        mensagens: msgs.length,
        do_cliente: doCliente.length,
        caracteres: msgs.reduce((n, m) => n + (m.texto || '').length, 0),
        trechos: doCliente.map(m => (m.texto || '').trim()).filter(t => t.length > 12).slice(0, TRECHOS),
      })
    }

    // ── produto e preço, do cadastro
    const turma: any = (lead as any).turmas || null
    const produto = turma?.produtos || null
    const precoVista = turma?.preco_venda ?? produto?.preco_venda ?? null

    // ── orçamentos anteriores deste lead
    // O QUE JÁ FOI FEITO PRA ESTE LEAD. Antes isto voltava e a tela só contava quantos eram, sem
    // nada pra clicar — o rascunho do José ficou salvo e invisível, e alguém gerou outro do zero.
    // Agora vem com o que a tela precisa pra reabrir e continuar de onde parou.
    const { data: anteriores } = await sb.from('orcamentos')
      .select('*')
      .eq('org_id', org).eq('lead_id', leadId).order('criado_em', { ascending: false }).limit(5)

    // O QUE DÁ PRA OFERTAR. A turma do lead vira só a SUGESTÃO — no caso do José ela apontava pro
    // curso que ele já tinha feito. A lista são os produtos com proposta escrita (lib/proposta-produtos).
    const { data: todos } = await sb.from('produtos')
      .select('id, nome, preco_venda').eq('ativo', true).order('nome')
    const ofertaveis = (todos || []).filter(p => temProposta(p.nome))

    // as turmas abertas de cada produto ofertável — só as que ainda não começaram e estão em venda
    const turmasPorProduto: Record<string, Awaited<ReturnType<typeof turmasDoProduto>>> = {}
    await Promise.all(ofertaveis.map(async p => {
      if (exigeTurma(p.nome)) turmasPorProduto[p.id] = await turmasDoProduto(org, p.id)
    }))

    const rotulo = await rotulosDasEtapas(org)
    const caracteres = ligacoesProntas.reduce((n, l) => n + l.caracteres, 0) + conversasProntas.reduce((n, c) => n + c.caracteres, 0)

    return NextResponse.json({
      ok: true,
      lead: {
        id: lead.id, nome: lead.nome, whatsapp: lead.whatsapp,
        etapa: lead.etapa, etapa_label: rotulo[lead.etapa] || lead.etapa,
        origem: lead.origem, campanha: lead.utm_campaign,
        observacoes: lead.observacoes,
      },
      // `audios` conta o que acabou de virar texto nesta chamada — a tela avisa, senão a pessoa vê
      // o material engordar do nada e não sabe de onde veio.
      fontes: { ligacoes: ligacoesProntas, conversas: conversasProntas, caracteres, material: caracteres >= 1200 ? 'suficiente' : 'curto', audios },
      // o que a IA não tem como saber — a tela pergunta, e o que estiver em branco ela não inventa
      contexto: { o_que_vende: lead.negocio || '', regiao: '', problema: lead.maior_problema || '' },
      produto: produto ? {
        id: produto.id, nome: produto.nome,
        preco_vista: precoVista,
        origem_preco: turma?.preco_venda != null ? `turma ${turma.codigo}` : 'cadastro do produto',
        // Sugestão pela convenção da escola: no cartão é o valor à vista + R$ 200, dividido pelas
        // parcelas DAQUELE produto (Deu Venda 10x, ANL 6x — lib/proposta-produtos). É sugestão: o
        // vendedor troca na tela, e fica registrado quem trocou.
        parcelas: precoVista != null ? parcelasDoProduto(produto?.nome) : null,
        preco_parcelado: parcelaDoProduto(produto?.nome, precoVista),
      } : null,
      // a lista pra escolher o produto da proposta, e qual deles a turma do lead sugere.
      // `turmas` vem junto porque produto de turma não pode ser proposto sem data — e a tela
      // precisa saber disso ANTES de deixar gerar, não na hora de publicar.
      produtos: ofertaveis.map(p => ({
        id: p.id, nome: p.nome, preco_venda: p.preco_venda,
        exige_turma: exigeTurma(p.nome),
        // cada produto leva o SEU parcelamento: a tela troca junto quando o produto muda
        parcelas: parcelasDoProduto(p.nome),
        preco_parcelado: parcelaDoProduto(p.nome, p.preco_venda),
        turmas: (turmasPorProduto[p.id] || []).map(t => ({ ...t, rotulo: rotuloDaTurma(t) })),
      })),
      produto_sugerido: produto && temProposta(produto.nome) ? produto.id : (ofertaveis.length === 1 ? ofertaveis[0].id : null),
      // ⚠️ o produto da turma do lead pode ser o curso que ele JÁ FEZ: a tela avisa quando for outro
      produto_da_turma: produto ? { id: produto.id, nome: produto.nome } : null,
      anteriores: (anteriores || []).map(o => ({
        id: o.id, situacao: o.situacao, criado_em: o.criado_em, publicado_em: o.publicado_em,
        slug: o.slug, produto_nome: o.produto_nome, cliente_nome: o.cliente_nome || null,
        titulo: (o.capa as any)?.titulo || null,
        // a tela precisa saber se o cliente já aceitou: é o que separa "editar" de "só ver"
        aceito_em: o.aceito_em || null,
        turma_id: o.turma_id || null,
      })),
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
