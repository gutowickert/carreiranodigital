import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { orgDaRequest } from '@/lib/org'
import { recursoLigado, configDaMaquina } from '@/lib/recurso'
import { logIaUso } from '@/lib/ia-uso'
import { sistemaDaMaquina, FERRAMENTAS_MAQUINA, salvarPeca } from '@/lib/maquina'
import { runTool } from '@/lib/agente-tools'
import { quemUsaMaquina } from '@/lib/maquina-acesso'

// A MÁQUINA CND — a conversa que pensa junto e produz. Transmitida enquanto escreve.
//
// ⚠️ POR QUE STREAMING, E NÃO UMA RESPOSTA SÓ. Uma página de oferta com pesquisa na internet leva
// mais de dois minutos. Ninguém espera isso olhando pra "pensando…" — fecha a aba e conclui que
// travou. O claude.ai não é mais rápido: ele MOSTRA enquanto escreve. Aqui é igual.
//
// ⚠️ O MODELO É O MESMO DO CLAUDE.AI, e o mais forte da família. Economizar centavos numa
// ferramenta cujo argumento é "tão boa quanto o site" é economizar no lugar errado.

const MODELO = 'claude-opus-5'
export const maxDuration = 300

const evento = (t: string, d: any) => `data: ${JSON.stringify({ t, ...d })}\n\n`

export async function POST(req: NextRequest) {
  // ── portões: tudo que pode recusar, recusa ANTES de abrir a transmissão
  if (!(await recursoLigado('maquina'))) {
    return NextResponse.json({ ok: false, error: 'a Máquina ainda não está ligada nesta empresa' }, { status: 200 })
  }
  const auth = req.headers.get('authorization')
  const perfil = await quemUsaMaquina(auth)
  if (!perfil) return NextResponse.json({ ok: false, error: 'a Máquina é só pra admin e comercial — se tu é, entra de novo' }, { status: 403 })
  const org = await orgDaRequest(auth)
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return NextResponse.json({ ok: false, error: 'A chave da IA ainda não foi instalada nesta empresa. Fala com quem cuida do sistema.' }, { status: 200 })

  const body = await req.json().catch(() => ({} as any))
  const historico = Array.isArray(body.mensagens) ? body.mensagens : []
  if (!historico.length) return NextResponse.json({ ok: false, error: 'sem mensagem' }, { status: 200 })

  const bloco = (a: any) => a.tipo === 'document'
    ? { type: 'document', source: { type: 'base64', media_type: a.media_type || 'application/pdf', data: a.data } }
    : { type: 'image', source: { type: 'base64', media_type: a.media_type || 'image/jpeg', data: a.data } }
  const messages: Anthropic.MessageParam[] = historico.map((m: any) => ({
    role: m.role,
    content: (Array.isArray(m.anexos) && m.anexos.length)
      ? [{ type: 'text', text: m.content || 'Olha o anexo.' }, ...m.anexos.map(bloco)]
      : m.content,
  }))

  const client = new Anthropic({ apiKey: key })
  const cfg = await configDaMaquina()
  const sys = await sistemaDaMaquina(cfg.nome, cfg.modo)
  const enc = new TextEncoder()

  const corpo = new ReadableStream({
    async start(ctrl) {
      const manda = (t: string, d: any = {}) => ctrl.enqueue(enc.encode(evento(t, d)))
      const fontes: string[] = []
      try {
        // ⚠️ O TETO DE VOLTAS EXISTE PRA NÃO GASTAR DINHEIRO EM LOOP. Com pesquisa na internet o
        // modelo pausa e retoma (`pause_turn`); cada retomada é uma chamada paga.
        for (let passo = 0; passo < 10; passo++) {
          const stream = client.messages.stream({
            model: MODELO,
            max_tokens: 16000,
            thinking: { type: 'adaptive' },
            // "medium": pensa o bastante pra uma peça boa sem levar o tempo de um problema de
            // matemática. "high" levou quase três minutos numa página.
            output_config: { effort: 'medium' },
            // ⚠️ CACHE DE 1 HORA, NÃO DE 5 MINUTOS. Numa conversa de 42 min o Rick pagou o "acordar"
            // 6 vezes (US$ 0,85) porque parava mais de 5 min entre mensagens. Gravar por 1h custa o
            // dobro por gravação e acontece uma vez — pra uso humano, que tem pausa, sai mais barato.
            system: [{ type: 'text', text: sys, cache_control: { type: 'ephemeral', ttl: '1h' } }],
            tools: FERRAMENTAS_MAQUINA as any,
            messages,
          })

          stream.on('text', (delta) => manda('texto', { d: delta }))
          stream.on('contentBlock', (b: any) => {
            if (b.type === 'server_tool_use' && b.name === 'web_search') manda('pesquisando', { q: b.input?.query || '' })
          })
          const resp = await stream.finalMessage()
          await logIaUso('maquina', MODELO, resp.usage, { quem: perfil.email || perfil.nome }).catch(() => null)
          console.log(`[maquina] volta ${passo + 1}: ${resp.stop_reason} | ${(resp.content as any[]).map(b => b.type + (b.name ? ':' + b.name : '')).join(', ')} | in ${resp.usage.input_tokens} out ${resp.usage.output_tokens}`)

          for (const b of resp.content as any[]) {
            if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
              for (const r of b.content) if (r?.url && !fontes.includes(r.url)) fontes.push(r.url)
            }
          }

          if (resp.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: resp.content }); continue }

          const usos = (resp.content as any[]).filter(b => b.type === 'tool_use')
          if (resp.stop_reason !== 'tool_use' || !usos.length) break

          // o conteúdo volta inteiro (pensamento e pesquisa incluídos): a continuação precisa dele
          messages.push({ role: 'assistant', content: resp.content })
          const results: any[] = []
          for (const tu of usos) {
            let out: any
            if (tu.name === 'salvar_peca') {
              out = await salvarPeca(org, perfil.id, tu.input, { tarefa_id: body.tarefa_id || null, versao_de: body.versao_de || null })
              if (out?.peca) manda('peca', { ...out.peca, conteudo: String(tu.input?.conteudo || '') })
            } else {
              manda('ferramenta', { nome: tu.name })
              try { out = await runTool(tu.name, tu.input, req.nextUrl.origin) } catch (e: any) { out = { erro: e?.message || 'falha' } }
              // ⚠️ 'propor_*' NÃO GRAVA: devolve um cartão que a pessoa confirma na tela.
              if (String(tu.name).startsWith('propor_') && out?.proposta) manda('pendencia', { id: `${passo}-${tu.id}`, ...out.proposta })
            }
            results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out) })
          }
          messages.push({ role: 'user', content: results })
          manda('texto', { d: '\n\n' })
        }
        manda('fim', { fontes })
      } catch (e: any) {
        const msg = e instanceof Anthropic.AuthenticationError ? 'a chave da IA desta empresa não é válida'
          : e instanceof Anthropic.RateLimitError ? 'muita coisa ao mesmo tempo — tenta de novo em um minuto'
          : e instanceof Anthropic.APIError ? `a IA recusou (${e.status}): ${e.message}`
          : (e?.message || 'erro')
        console.error('[maquina] erro:', msg)
        manda('erro', { msg })
      } finally {
        ctrl.close()
      }
    },
  })

  return new Response(corpo, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' },
  })
}
