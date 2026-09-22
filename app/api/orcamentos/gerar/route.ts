import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { orgDaRequest } from '@/lib/org'
import { quemEuVejo } from '@/lib/quem-eu-vejo'
import { temProposta } from '@/lib/proposta-produtos'
import { logIaUso } from '@/lib/ia-uso'

export const maxDuration = 60

// Gera o RASCUNHO do orçamento: a capa e a página de objeções, a partir do que a pessoa já disse.
// O resto da proposta (o que é, como funciona, investimento, aceite) é modelo fixo — não passa pela
// IA, não custa token e não varia de proposta pra proposta.
//
// AS TRÊS TRAVAS, todas aqui no servidor e não no texto do pedido:
//  1. PREÇO NÃO VEM DA IA. O que ela escrever sobre valor é ignorado; o preço é o que a tela mandou,
//     que por sua vez veio do cadastro.
//  2. CITAÇÃO TEM QUE EXISTIR. Cada objeção precisa citar uma frase que esteja no material. O que não
//     casar é descartado — é o que impede proposta inventada.
//  3. SEM MATERIAL, SEM OBJEÇÃO. Material curto gera proposta padrão, com a lista vazia.
//
// Modelo: Sonnet 5, escolhido pelo custo (é o mais barato que dá conta deste texto).

const MODELO = 'claude-sonnet-5'
const MAX_OBJECOES = 4
const MAX_CARACTERES_MATERIAL = 60_000   // teto de material lido: ligação de 40 min dá ~35 mil

const SYSTEM = `Tu escreves parte de uma proposta comercial brasileira, para uma escola de marketing digital que vende implantação com acompanhamento.

O QUE TU ESCREVE: só a capa e as respostas às objeções que a pessoa levantou. O resto da proposta já existe pronto.

REGRAS DURAS:
- Cada objeção precisa vir de uma FRASE EXATA que a pessoa disse no material. Copia a frase no campo "citacao", igual, sem corrigir português.
- Se não houver objeção clara no material, devolve a lista vazia. Não inventa objeção.
- NUNCA escreve preço, valor, parcela, desconto ou prazo de pagamento. Isso entra depois, do cadastro.
- NUNCA promete resultado, número de vendas ou garantia.
- Não inventa detalhe do negócio do cliente que não esteja no material ou no contexto informado.
- Escreve em português do Brasil, falando com a pessoa por "tu", tom direto e sem jargão. Frases curtas.
- Reconhece a objeção antes de responder; nada de resposta de manual.

COMO SE ESCREVEM OS NOMES (a transcrição erra estes, e o erro chega até aqui):
- A ferramenta de IA chama-se **Claude**. No material ela aparece como "cloud", "clod", "cláudio",
  "claudia" ou "claude" minúsculo — é tudo a mesma coisa, e no TÍTULO e no TEXTO escreve-se Claude.
- Chama-se **Hotmart**, **Kiwify**, **Meta**, **Instagram**, **WhatsApp**.
- ⚠️ NA CITAÇÃO NÃO SE CORRIGE NADA. Ela é a frase que a pessoa falou, e é o que prova que a
  objeção veio da conversa. Fica exatamente como está no material, com erro e tudo.

FORMATO DA RESPOSTA: só um JSON, sem texto em volta:
{"capa":{"titulo":"...","subtitulo":"..."},"objecoes":[{"titulo":"...","citacao":"...","texto":"..."}]}
- titulo da capa: até 90 caracteres, dizendo o que a pessoa ganha, no vocabulário do negócio dela.
- subtitulo: 2 ou 3 frases explicando o que acontece na prática.
- objecoes: no máximo ${MAX_OBJECOES}, da mais importante para a menos.
- titulo da objeção: como o vendedor descreveria o ponto, em até 60 caracteres.
- texto: 2 a 5 frases respondendo aquela objeção.`

// normaliza pra comparar citação com o material: sem acento, sem pontuação, espaços colapsados
const normal = (s: string) =>
  (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()

// a IA às vezes corta a frase no meio; aceita se um pedaço grande da citação existir no material
function citacaoConfere(citacao: string, materialNormal: string): boolean {
  const c = normal(citacao)
  if (c.length < 12) return false
  if (materialNormal.includes(c)) return true
  const palavras = c.split(' ')
  for (let tam = Math.min(palavras.length, 12); tam >= 6; tam--) {
    for (let i = 0; i + tam <= palavras.length; i++) {
      if (materialNormal.includes(palavras.slice(i, i + tam).join(' '))) return true
    }
  }
  return false
}

function jsonDaResposta(raw: string): any {
  try { return JSON.parse(raw) } catch { /* segue */ }
  const a = raw.indexOf('{'), z = raw.lastIndexOf('}')
  if (a >= 0 && z > a) { try { return JSON.parse(raw.slice(a, z + 1)) } catch { /* segue */ } }
  return null
}

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
    const pedacos: string[] = []

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
    const precoVista = b.preco_vista != null && b.preco_vista !== '' ? Number(String(b.preco_vista).replace(',', '.')) : (turma?.preco_venda ?? produto?.preco_venda ?? null)
    const parcelas = b.parcelas ? Number(b.parcelas) : null
    const precoParcelado = b.preco_parcelado ? Number(String(b.preco_parcelado).replace(',', '.')) : null

    const contexto = {
      o_que_vende: (b.o_que_vende || '').toString().slice(0, 300),
      regiao: (b.regiao || '').toString().slice(0, 200),
    }

    // NOME QUE SAI NA PROPOSTA. O cadastro do lead costuma trazer o apelido do WhatsApp — o do José
    // está como "Jose Poa 2", e era isso que aparecia na capa e no endereço do link. Aqui vale o que
    // a tela mandou; em branco, continua sendo o nome do lead.
    const clienteNome = (b.cliente_nome || '').toString().trim().slice(0, 120) || null

    // ── sem material: proposta padrão, sem objeções, sem gastar token
    let capa = { titulo: '', subtitulo: '' }
    let objecoes: any[] = []
    let usoIA: any = null
    let descartadas = 0

    if (material.length >= 300) {
      const pedido = [
        `CLIENTE: ${clienteNome || lead.nome}`,
        contexto.o_que_vende ? `O QUE O NEGÓCIO DELE VENDE: ${contexto.o_que_vende}` : 'O NEGÓCIO DELE: não informado — não invente exemplos de produto.',
        contexto.regiao ? `REGIÃO QUE ELE ATENDE: ${contexto.regiao}` : '',
        produto ? `PRODUTO QUE ESTAMOS PROPONDO: ${produto.nome}` : '',
        '',
        'MATERIAL (o que a pessoa já disse):',
        material,
      ].filter(Boolean).join('\n')

      const client = new Anthropic({ apiKey: key })
      const resp = await client.messages.create({
        model: MODELO,
        // 4000 e não 2048: com uma ligação longa a resposta batia no teto, era cortada no meio e o
        // JSON chegava quebrado — a proposta saía vazia sem ninguém entender por quê (18/09/2026).
        max_tokens: 4000,
        system: SYSTEM,
        messages: [{ role: 'user', content: pedido }],
      })
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
            ? 'A IA escreveu demais e a resposta foi cortada. Tenta de novo marcando menos material.'
            : 'A IA respondeu num formato que eu não consegui ler. Tenta de novo.',
        }, { status: 200 })
      }

      if (out?.capa) {
        capa = {
          titulo: String(out.capa.titulo || '').slice(0, 140),
          subtitulo: String(out.capa.subtitulo || '').slice(0, 700),
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
      cliente_nome: clienteNome,
      preco_vista: precoVista,
      preco_parcelado: precoParcelado,
      parcelas,
      contexto,
      fontes: { ligacoes: idsLigacao, conversas: idsConversa, caracteres: material.length },
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
