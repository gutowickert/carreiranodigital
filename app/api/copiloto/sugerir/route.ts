import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 60

// Modelo do copiloto. Opus 4.8 = mais inteligente. Pra mais barato/rápido troque
// por 'claude-sonnet-4-6' ou 'claude-haiku-4-5'.
const MODELO = 'claude-opus-4-8'

const suf = (t: string) => (t || '').replace(/\D/g, '').slice(-8)

// Playbook destilado (das vendas reais) — é o "gabarito" que guia a sugestão.
const PLAYBOOK = `Você é o COPILOTO DE VENDAS da Carreira No Digital (cursos presenciais de marketing digital no RS). Ajuda o vendedor a converter no WhatsApp, no TOM da escola: próximo, direto, sem enrolação, tratando o cliente por "tu/você".

O QUE FUNCIONA (extraído das vendas reais):
- DESCOBERTA antes do preço: pergunte o negócio e o objetivo do cliente, ligue o curso a isso.
- OFERTA estruturada: o que é (3 dias / 4 semanas presenciais, 19h-22h15, prof. especialista) -> diferencial ("tu não sai com apostila, sai com o marketing do teu negócio rodando") -> bônus (10 agentes de IA, gravação 1 ano, certificado) -> ÂNCORA de preço ("normalmente R$X, pra essa condição R$Y à vista no Pix ou 10x") -> urgência real (vagas/lote) -> CTA ("me responde que te passo o link").
- FECHAR conduzindo: "vou gerar o link e te envio", não "gostaria de dar sequência?".

CONTORNO DE OBJEÇÃO (regras de ouro):
- "trabalho à noite / horário não dá" -> OFEREÇA A TURMA DA TARDE (14h-17h15). Esse é o erro nº1; sempre ofereça o outro turno.
- "tá caro / só boleto / não tenho à vista" -> sinal de R$100 no Pix do CNPJ agora + restante na hora do curso ("muita gente promete pagar na hora e não vem, o sinal garante tua vaga"). Variações: 1x cartão + resto dinheiro, 2 cartões, entrada + parcelado.
- "vai ser pra 2 pessoas / colega junto" -> ofereça condição pra 2 vagas.
- "sou leigo / zero à esquerda" -> "é justamente pra quem começa do zero, tu aprende fazendo com o professor do lado".
- "o curso vai acontecer mesmo?" -> "pode ficar tranquilo, já temos alunos matriculados, acontece nas datas".
- "vou pensar / falar com X" -> marque DATA e HORA de retorno + urgência. Não aceite solto.
- "quero fazer sozinho / já terceirizo" -> "nosso objetivo é tu ter controle total do teu marketing; terceirizar é caro e ninguém conhece teu negócio como tu".
- ligação caiu/ruim ou cliente não atende -> ofereça mandar áudio/seguir por aqui.

EVITE: monólogo dos módulos sem descoberta; mandar só preço e esperar; deixar objeção de horário/pagamento sem oferecer saída; follow-up genérico repetido; encerrar sem próximo passo concreto.

Sua tarefa: olhar a conversa até agora e a etapa do funil, e sugerir a PRÓXIMA mensagem que o vendedor deve enviar AGORA, já pronta, no tom da escola. Curta e natural (2-5 frases). Se o cliente levantou uma objeção, trate-a com a regra acima.

Responda APENAS com um objeto JSON válido, sem texto antes ou depois, exatamente neste formato:
{"objecao":"<objeção detectada do cliente, ou 'nenhuma'>","dica":"<dica curta de 1 linha pro vendedor>","rascunho":"<a mensagem pronta pra enviar>"}`

export async function POST(req: NextRequest) {
  try {
    const { leadId } = await req.json().catch(() => ({}))
    if (!leadId) return NextResponse.json({ ok: false, error: 'falta leadId' }, { status: 200 })

    const key = process.env.ANTHROPIC_API_KEY
    if (!key) return NextResponse.json({ ok: false, error: 'Falta ANTHROPIC_API_KEY no servidor (configurar na Vercel).' }, { status: 200 })

    const { data: lead } = await supabase.from('leads').select('id, nome, whatsapp, etapa, codigo_turma').eq('id', leadId).single()
    if (!lead) return NextResponse.json({ ok: false, error: 'lead não encontrado' }, { status: 200 })

    // conversa do lead (por lead_id ou telefone) — últimas mensagens, áudios já transcritos (🎤)
    const s = suf(lead.whatsapp)
    const { data: convs } = await supabase.from('wa_conversas').select('id').or(`lead_id.eq.${leadId}${s.length === 8 ? `,telefone.ilike.%${s}` : ''}`)
    const ids = (convs || []).map((c: any) => c.id)
    let linhas: string[] = []
    if (ids.length) {
      const { data: msgs } = await supabase.from('wa_mensagens')
        .select('direcao, status, texto, criado_em').in('conversa_id', ids)
        .not('texto', 'is', null).order('criado_em', { ascending: false }).limit(30)
      linhas = (msgs || []).reverse().map((m: any) => {
        const quem = (m.direcao === 'recebida' || m.status === 'recebida') ? 'CLIENTE' : 'VENDEDOR'
        return `${quem}: ${(m.texto || '').replace(/\s+/g, ' ').trim().slice(0, 400)}`
      }).filter((l: string) => l.length > 9)
    }

    const contexto = `Lead: ${lead.nome || '(sem nome)'} | etapa do funil: ${lead.etapa || '-'} | turma: ${lead.codigo_turma || '-'}\n\nCONVERSA ATÉ AGORA:\n${linhas.length ? linhas.join('\n') : '(ainda sem mensagens)'}\n\nSugira a próxima mensagem que o vendedor deve enviar agora.`

    const client = new Anthropic({ apiKey: key })
    const resp = await client.messages.create({
      model: MODELO,
      max_tokens: 1024,
      system: PLAYBOOK,
      messages: [{ role: 'user', content: contexto }],
    })

    const raw = (resp.content || []).map((b: any) => b.type === 'text' ? b.text : '').join('').trim()
    // parse defensivo: extrai o primeiro objeto JSON da resposta
    let out: any = null
    try { out = JSON.parse(raw) } catch {
      const a = raw.indexOf('{'), z = raw.lastIndexOf('}')
      if (a >= 0 && z > a) { try { out = JSON.parse(raw.slice(a, z + 1)) } catch {} }
    }
    if (!out || typeof out.rascunho !== 'string') {
      return NextResponse.json({ ok: true, objecao: 'nenhuma', dica: '', rascunho: raw.slice(0, 800) })
    }
    return NextResponse.json({ ok: true, objecao: out.objecao || 'nenhuma', dica: out.dica || '', rascunho: out.rascunho })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e && e.message) || 'erro' }, { status: 200 })
  }
}
