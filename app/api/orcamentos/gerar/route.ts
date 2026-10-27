import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { quemEuVejo } from '@/lib/quem-eu-vejo'
import { temProposta, resumoDoProduto, exigeTurma } from '@/lib/proposta-produtos'
import { logIaUso } from '@/lib/ia-uso'
import { falasDaReuniao, transcricaoEmTexto } from '@/lib/reunioes'
import { MODELO, MAX_OBJECOES, MAX_CARACTERES_MATERIAL, SYSTEM, mecanicaDoOutroProduto, normal, citacaoConfere, jsonDaResposta } from '@/lib/orcamento-ia'

// 120 e não 60: se a primeira resposta vier cortada, tenta de novo sozinho (ver abaixo)
export const maxDuration = 120

// Gera o RASCUNHO do orçamento: a capa e a página de objeções, a partir do que a pessoa já disse.
// O resto da proposta (o que é, como funciona, investimento, aceite) é modelo fixo — não passa pela
// IA, não custa token e não varia de proposta pra proposta.
//
// AS QUATRO TRAVAS, todas aqui no servidor e não no texto do pedido:
//  1. PREÇO NÃO VEM DA IA. O que ela escrever sobre valor é ignorado; o preço é o que a tela mandou,
//     que por sua vez veio do cadastro.
//  2. CITAÇÃO TEM QUE EXISTIR. Cada objeção precisa citar uma frase que esteja no material. O que não
//     casar é descartado — é o que impede proposta inventada.
//  3. SEM MATERIAL, SEM OBJEÇÃO. Material curto gera proposta padrão, com a lista vazia.
//  4. A CAPA NÃO FALA DA MECÂNICA DO OUTRO PRODUTO. Capa de implantação não cita turma nem dias de
//     curso; capa de curso não cita implantação nem meses de acompanhamento. Pedir isso no texto do
//     pedido não basta — o pedido é conselho, isto é porta.
//
export async function POST(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    const org = await orgDaRequest(auth)
    const quem = await quemEuVejo(auth, org)
    if (!quem) return NextResponse.json({ ok: false, error: 'sem sessao' }, { status: 401 })

    const key = process.env.ANTHROPIC_API_KEY
    if (!key) return NextResponse.json({ ok: false, error: 'a chave da IA não está configurada nesta instalação' }, { status: 200 })

    const b = await req.json().catch(() => ({} as any))
    const leadId = (b.lead_id || '').toString()
    if (!leadId) return NextResponse.json({ ok: false, error: 'falta o lead' }, { status: 200 })

    const { data: lead } = await sb.from('leads')
      .select('id, nome, whatsapp, etapa, vendedor_id, negocio, turmas(codigo, preco_venda, produtos(id, nome, preco_venda))')
      .eq('org_id', org).eq('id', leadId).maybeSingle()
    if (!lead) return NextResponse.json({ ok: false, error: 'lead não encontrado' }, { status: 200 })

    const { data: perfil } = await sb.from('usuarios_perfil').select('leads_escopo').eq('id', quem.eu.id).maybeSingle()
    const soMeus = perfil?.leads_escopo === 'proprios'
    const meu = !lead.vendedor_id || (soMeus ? lead.vendedor_id === quem.eu.id : quem.visiveis.has(lead.vendedor_id))
    if (!meu) return NextResponse.json({ ok: false, error: 'este lead não é teu' }, { status: 403 })

    // ── o material marcado na tela
    const idsLigacao: string[] = Array.isArray(b.ligacoes) ? b.ligacoes.map(String) : []
    const idsConversa: string[] = Array.isArray(b.conversas) ? b.conversas.map(String) : []
    const idsReuniao: string[] = Array.isArray(b.reunioes) ? b.reunioes.map(String) : []
    const pedacos: string[] = []

    // A REUNIÃO POR VÍDEO (26/10/2026): a apresentação do Matheus Segatto foi de 46 min e virou
    // proposta à mão, porque o gerador só lia ligação e WhatsApp. Entra a transcrição inteira, com o
    // nome de quem falou; só reunião DESTE lead, e só depois de encerrada.
    if (idsReuniao.length) {
      const { data: reus } = await sb.from('reunioes')
        .select('id, titulo, iniciada_em, encerrada_em, status').eq('org_id', org).eq('lead_id', leadId).in('id', idsReuniao)
      for (const r of reus || []) {
        if (!['encerrada', 'resumida'].includes(r.status)) continue
        const t = transcricaoEmTexto(r, await falasDaReuniao(r))
        const min = r.iniciada_em && r.encerrada_em ? Math.round((+new Date(r.encerrada_em) - +new Date(r.iniciada_em)) / 60000) : null
        if (t) pedacos.push(`REUNIÃO POR VÍDEO "${r.titulo}"${min ? ` de ${min} min` : ''} em ${String(r.iniciada_em || '').slice(0, 10)}:\n${t}`)
      }
    }

    if (idsLigacao.length) {
      const { data: ligs } = await sb.from('ligacoes')
        .select('id, criado_em, duracao, metadata').eq('org_id', org).eq('lead_id', leadId).in('id', idsLigacao)
      for (const l of ligs || []) {
        const t = String((l.metadata as any)?.transcricao || '')
        if (t) pedacos.push(`LIGAÇÃO de ${Math.round((l.duracao || 0) / 60)} min em ${String(l.criado_em).slice(0, 10)}:\n${t}`)
      }
    }
    if (idsConversa.length) {
      for (const cid of idsConversa) {
        const msgs: any[] = []
        for (let de = 0; ; de += 1000) {
          const { data } = await sb.from('wa_mensagens')
            .select('direcao, status, texto, criado_em').eq('conversa_id', cid).order('criado_em').order('id').range(de, de + 999)
          msgs.push(...(data || []))
          if (!data || data.length < 1000) break
        }
        const linhas = msgs
          .map(m => {
            const quemFalou = (m.direcao === 'recebida' || m.status === 'recebida') ? 'CLIENTE' : 'NÓS'
            const texto = (m.texto || '').replace(/\s+/g, ' ').trim()
            return texto ? `${quemFalou}: ${texto}` : ''
          })
          .filter(Boolean)
        if (linhas.length) pedacos.push(`CONVERSA NO WHATSAPP:\n${linhas.join('\n')}`)
      }
    }

    const material = pedacos.join('\n\n———\n\n').slice(0, MAX_CARACTERES_MATERIAL)
    const materialNormal = normal(material)

    // ── O PRODUTO É O QUE A TELA ESCOLHEU. A turma do lead entra só como sugestão.
    //
    // ⚠️ POR QUE NÃO PODE SAIR DA TURMA DIRETO: a turma do lead é a última coisa que ele comprou ou
    // demonstrou interesse — no orçamento do José ela ainda era a Formação Completa, o curso que ele
    // JÁ TINHA FEITO. A proposta saiu com o nome desse curso enquanto o texto inteiro descrevia o
    // Deu Venda. Quem sabe o que está sendo vendido é quem está vendendo.
    const turma: any = (lead as any).turmas || null
    let produto: any = turma?.produtos || null
    if (b.produto_id) {
      const { data: escolhido } = await sb.from('produtos')
        .select('id, nome, preco_venda').eq('org_id', org).eq('id', b.produto_id).maybeSingle()
      if (!escolhido) return NextResponse.json({ ok: false, error: 'produto não encontrado' }, { status: 200 })
      // a trava que impede a contradição: só produto com corpo de proposta escrito
      if (!temProposta(escolhido.nome)) {
        return NextResponse.json({ ok: false, error: `ainda não existe proposta escrita para "${escolhido.nome}"` }, { status: 200 })
      }
      produto = escolhido
    }

    // ⚠️ PRODUTO DE TURMA NÃO NASCE SEM DATA. A trava é aqui, na criação, e não só na publicação:
    // rascunho sem turma é uma proposta que alguém vai publicar com pressa, e o cliente recebe um
    // curso sem saber quando é. A turma também tem que ser DAQUELE produto — escolher a turma de
    // outro curso imprimiria a data errada com toda a confiança do mundo.
    let turmaId: string | null = (b.turma_id || '').toString() || null
    if (produto && exigeTurma(produto.nome)) {
      if (!turmaId) return NextResponse.json({ ok: false, error: `escolhe a turma do ${produto.nome} antes de gerar` }, { status: 200 })
      const { data: t } = await sb.from('turmas').select('id, produto_id, status').eq('org_id', org).eq('id', turmaId).maybeSingle()
      if (!t || t.produto_id !== produto.id) return NextResponse.json({ ok: false, error: 'essa turma não é deste produto' }, { status: 200 })
      if (t.status !== 'em_vendas') return NextResponse.json({ ok: false, error: 'essa turma não está em vendas' }, { status: 200 })
    } else {
      turmaId = null   // produto sem turma não carrega turma de sobra do rascunho anterior
    }
    const precoVista = b.preco_vista != null && b.preco_vista !== '' ? Number(String(b.preco_vista).replace(',', '.')) : (turma?.preco_venda ?? produto?.preco_venda ?? null)
    const parcelas = b.parcelas ? Number(b.parcelas) : null
    const precoParcelado = b.preco_parcelado ? Number(String(b.preco_parcelado).replace(',', '.')) : null

    const contexto = {
      o_que_vende: (b.o_que_vende || '').toString().slice(0, 300),
      regiao: (b.regiao || '').toString().slice(0, 200),
      // serviço mensal: a condição além da mensalidade (ex.: "+ 10% de cada assinatura nova").
      // Quem escreve é o vendedor; a IA não lê nem escreve isto.
      condicao: (b.condicao || '').toString().trim().slice(0, 300),
    }

    // NOME QUE SAI NA PROPOSTA. O cadastro do lead costuma trazer o apelido do WhatsApp — o do José
    // está como "Jose Poa 2", e era isso que aparecia na capa e no endereço do link. Aqui vale o que
    // a tela mandou; em branco, continua sendo o nome do lead.
    const clienteNome = (b.cliente_nome || '').toString().trim().slice(0, 120) || null

    // ── sem material: proposta padrão, sem objeções, sem gastar token
    let capa = { titulo: '', subtitulo: '' }
    let objecoes: any[] = []
    let usoIA: any = null
    let contaminado: string | null = null
    let descartadas = 0

    if (material.length >= 300) {
      const pedido = [
        `CLIENTE: ${clienteNome || lead.nome}`,
        contexto.o_que_vende ? `O QUE O NEGÓCIO DELE VENDE: ${contexto.o_que_vende}` : 'O NEGÓCIO DELE: não informado — não invente exemplos de produto.',
        contexto.regiao ? `REGIÃO QUE ELE ATENDE: ${contexto.regiao}` : '',
        produto ? `PRODUTO QUE ESTAMOS PROPONDO: ${produto.nome}` : '',
        // o que ESTE produto é, com as respostas que a escola já usa — senão a IA escreve uma
        // proposta plausível do produto errado, e o cliente ouve três versões da mesma escola
        produto ? resumoDoProduto(produto.nome) : '',
        '',
        'MATERIAL (o que a pessoa já disse):',
        material,
      ].filter(Boolean).join('\n')

      const client = new Anthropic({ apiKey: key })
      const pedirIA = () => client.messages.create({
        model: MODELO,
        // 4000 e não 2048: com uma ligação longa a resposta batia no teto, era cortada no meio e o
        // JSON chegava quebrado — a proposta saía vazia sem ninguém entender por quê (18/09/2026).
        max_tokens: 4000,
        system: SYSTEM,
        messages: [{ role: 'user', content: pedido }],
      })
      let resp = await pedirIA()
      // CORTADA? TENTA DE NOVO SOZINHO (28/09/2026, proposta da Grace Rocha): o MESMO pedido deu 4000
      // (cortado) às 11h20 e 1996 (inteiro) às 11h22. Não é excesso de material — às vezes a IA só se
      // alonga. Uma segunda tentativa resolve quase sempre, e a pessoa nem vê o erro.
      if (resp.stop_reason === 'max_tokens') {
        await logIaUso('orcamento-falhou', MODELO, resp.usage, { lead_id: leadId, motivo: 'resposta cortada — tentando de novo' })
        resp = await pedirIA()
      }
      usoIA = resp.usage
      const raw = (resp.content || []).map((c: any) => (c.type === 'text' ? c.text : '')).join('').trim()
      const out = jsonDaResposta(raw)

      // Falhar calado é o pior desfecho: sem isto, a tela mostrava proposta em branco como se fosse
      // resultado. O custo já foi gasto, então registra o uso e devolve o motivo.
      if (!out?.capa || resp.stop_reason === 'max_tokens') {
        await logIaUso('orcamento-falhou', MODELO, resp.usage, { lead_id: leadId, motivo: resp.stop_reason === 'max_tokens' ? 'resposta cortada' : 'resposta ilegível' })
        return NextResponse.json({
          ok: false,
          error: resp.stop_reason === 'max_tokens'
            ? 'A IA se estendeu demais duas vezes seguidas e a resposta foi cortada. Tenta de novo.'
            : 'A IA respondeu num formato que eu não consegui ler. Tenta de novo.',
        }, { status: 200 })
      }

      if (out?.capa) {
        capa = {
          titulo: String(out.capa.titulo || '').slice(0, 140),
          subtitulo: String(out.capa.subtitulo || '').slice(0, 700),
        }
        // ⚠️ A QUARTA TRAVA: a capa não pode falar da mecânica do OUTRO produto.
        contaminado = mecanicaDoOutroProduto(produto?.nome || null, `${capa.titulo} ${capa.subtitulo}`)
        if (contaminado) {
          const correcao = await client.messages.create({
            model: MODELO, max_tokens: 900, system: SYSTEM,
            messages: [
              { role: 'user', content: pedido },
              { role: 'assistant', content: raw },
              { role: 'user', content: `PARE: a tua capa citou "${contaminado}", que é a mecânica de OUTRO produto da escola — não do ${produto?.nome}. Isso vira um documento que se contradiz na página seguinte. Reescreve SÓ o JSON da capa, no mesmo formato {"capa":{"titulo":"...","subtitulo":"..."},"objecoes":[]}, falando do NEGÓCIO da pessoa e do que ela ganha, sem citar quantidade de encontros, dias, meses ou aulas.` },
            ],
          })
          const outC = jsonDaResposta((correcao.content || []).map((c: any) => (c.type === 'text' ? c.text : '')).join('').trim())
          const nova = outC?.capa
            ? { titulo: String(outC.capa.titulo || '').slice(0, 140), subtitulo: String(outC.capa.subtitulo || '').slice(0, 700) }
            : null
          // só aceita a correção se ela veio limpa; senão fica o título e a capa perde o subtítulo,
          // que o vendedor escreve. Texto em branco ele percebe; texto errado, não.
          if (nova && !mecanicaDoOutroProduto(produto?.nome || null, `${nova.titulo} ${nova.subtitulo}`)) {
            capa = nova
          } else {
            capa = { titulo: capa.titulo, subtitulo: '' }
          }
          await logIaUso('orcamento-capa-corrigida', MODELO, correcao.usage, { lead_id: leadId, termo: contaminado, produto: produto?.nome })
        }
      }
      const cruas = Array.isArray(out?.objecoes) ? out.objecoes.slice(0, MAX_OBJECOES) : []
      for (const o of cruas) {
        const citacao = String(o?.citacao || '').trim()
        // TRAVA 2: citação que não existe no material vira objeção inventada — fora.
        if (!citacaoConfere(citacao, materialNormal)) { descartadas++; continue }
        objecoes.push({
          ordem: objecoes.length + 1,
          titulo: String(o?.titulo || '').slice(0, 120),
          citacao: citacao.slice(0, 400),
          texto_ia: String(o?.texto || '').slice(0, 1600),
          texto_final: null,     // preenchido quando o vendedor editar
          situacao: 'pendente',  // pendente | aprovada | fora
        })
      }

      await logIaUso('orcamento', MODELO, resp.usage, { lead_id: leadId, objecoes: objecoes.length, descartadas })
    }

    // ── grava o rascunho
    const custo = usoIA
      ? Math.round((((usoIA.input_tokens || 0) * 2 + (usoIA.output_tokens || 0) * 10) / 1_000_000) * 1e6) / 1e6
      : 0
    const { data: orc, error } = await sb.from('orcamentos').insert({
      org_id: org,
      lead_id: leadId,
      produto_id: produto?.id || null,
      produto_nome: produto?.nome || null,
      turma_id: turmaId,
      cliente_nome: clienteNome,
      preco_vista: precoVista,
      preco_parcelado: precoParcelado,
      parcelas,
      contexto,
      fontes: { ligacoes: idsLigacao, conversas: idsConversa, reunioes: idsReuniao, caracteres: material.length },
      capa,
      objecoes,
      situacao: 'rascunho',
      modelo: usoIA ? MODELO : null,
      tokens_entrada: usoIA?.input_tokens || null,
      tokens_saida: usoIA?.output_tokens || null,
      custo_usd: usoIA ? custo : null,
      criado_por: quem.eu.id,
    }).select('*').single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })

    return NextResponse.json({
      ok: true,
      orcamento: orc,
      // pra tela contar a história: quanto entrou, quanto saiu, o que foi descartado e por quê
      medido: {
        tokens_entrada: usoIA?.input_tokens || 0,
        tokens_saida: usoIA?.output_tokens || 0,
        custo_usd: custo,
        caracteres_material: material.length,
        objecoes: objecoes.length,
        descartadas,
        sem_material: material.length < 300,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 200 })
  }
}
