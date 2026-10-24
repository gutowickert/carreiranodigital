// Recado Encantado: ACORDO DE NATAL (24/10/2026). A página da família manda por aqui:
//   { acao: 'aceite_link', c, tipo }   -> link pra subir o áudio/vídeo do "eu aceito" direto pro storage (vídeo de celular passa do limite da Vercel)
//   { acao: 'aceite_ok', c, caminho }  -> confere que o arquivo chegou e monta a agenda (V2 no dia seguinte às 18h, domingos, 24/12)
//   { acao: 'aceite_contado', c }      -> "aceitou, mas ficou com vergonha de gravar": mesma coisa, o V2 vai com "a sua família me contou"
//   { acao: 'semana', c, resposta }    -> o toque do fim de semana (otimo | quase | dificil) ou a pergunta final de 22/12 (venceu | progresso)
// Sem resposta até o prazo (domingo 15h / 23/12 12h), o trabalhador escolhe sozinho (fabrica/lib/acordo.js).
import { NextRequest, NextResponse } from 'next/server'
import { recadoDb as db } from '@/lib/recado/db'
import { ehAcordo, SEMANA, FINAL, aceiteChegou } from '@/lib/recado/acordo'

const sem = { headers: { 'Cache-Control': 'no-store' } }
const cod = (s: any) => String(s || '').toUpperCase().replace(/[^A-Z0-9-]/g, '')
const U = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string, K = () => process.env.SUPABASE_SERVICE_ROLE_KEY as string
const H = () => ({ apikey: K(), Authorization: 'Bearer ' + K(), 'Content-Type': 'application/json' })
const EXT: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/3gpp': '3gp',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/3gpp': '3gp' }
const erro = (msg: string, status = 400) => NextResponse.json({ erro: msg }, { status })

export async function POST(req: NextRequest) {
  try {
    const b: any = await req.json().catch(() => ({}))
    const c = cod(b.c)
    if (!c) return erro('sem código')
    const [p] = await db.busca('pedidos', `codigo=eq.${c}&select=id,codigo,pacote,status,missao`)
    if (!p || !ehAcordo(p.pacote)) return erro('pedido não encontrado', 404)
    if (['aguardando_pagamento', 'cancelado', 'reembolsado'].includes(p.status)) return erro('o pedido ainda não está pago', 409)
    const etapas = await db.busca('etapas', `pedido_id=eq.${p.id}&order=ordem.asc&select=id,ordem,tipo,quando,status,resposta,extras`)

    if (['aceite_link', 'aceite_ok', 'aceite_contado'].includes(b.acao)) {
      const ac = etapas.find((e: any) => e.tipo === 'acordo')
      if (etapas[0]?.status !== 'entregue') return erro('o "eu aceito" vem depois do vídeo da proposta', 409)
      if (!ac || ac.status !== 'agendada') return erro('o Papai Noel já está gravando o vídeo do acordo', 409)
      if (b.acao === 'aceite_contado') return NextResponse.json({ ok: true, ...(await aceiteChegou(p.id, { tipo: 'contado', por: 'pagina' })) }, sem)
      if (b.acao === 'aceite_link') {
        const tipo = String(b.tipo || '').split(';')[0].toLowerCase(), ext = EXT[tipo] || (tipo.startsWith('video/') ? 'mp4' : tipo.startsWith('audio/') ? 'm4a' : '')
        if (!ext) return erro('manda um áudio ou um vídeo')
        const caminho = `${p.codigo}/aceite-${Date.now()}.${ext}`
        const r = await fetch(`${U()}/storage/v1/object/upload/sign/recado/${caminho}`, { method: 'POST', headers: H(), body: '{}' })
        const j: any = await r.json().catch(() => ({}))
        if (!r.ok || !j.url) throw new Error('storage ' + r.status + ': ' + JSON.stringify(j).slice(0, 200))
        return NextResponse.json({ caminho, envio: U() + '/storage/v1' + j.url }, sem)
      }
      // aceite_ok: o arquivo tem que estar lá, na pasta deste pedido
      const caminho = String(b.caminho || '')
      if (!new RegExp(`^${p.codigo}/aceite-\\d+\\.[a-z0-9]{2,4}$`).test(caminho)) return erro('arquivo inválido')
      const nome = caminho.split('/')[1]
      const l = await fetch(`${U()}/storage/v1/object/list/recado`, { method: 'POST', headers: H(), body: JSON.stringify({ prefix: p.codigo + '/', search: nome, limit: 5 }) }).then(r => r.json()).catch(() => [])
      const arq = Array.isArray(l) ? l.find((x: any) => x.name === nome) : null
      if (!arq) return erro('o arquivo não chegou, tenta mandar de novo', 409)
      const r = await aceiteChegou(p.id, { tipo: 'voz', caminho, mime: arq.metadata?.mimetype || null, tamanho: arq.metadata?.size || null, por: 'pagina' })
      return NextResponse.json({ ok: true, ...r }, sem)
    }

    if (b.acao === 'semana') {
      let ult = -1; etapas.forEach((e: any, i: number) => { if (e.status === 'entregue') ult = i })
      const atual = etapas[ult], prox = etapas[ult + 1]
      if (ult < 1 || !prox || !['andamento', 'conquista'].includes(prox.tipo)) return erro('agora não tem vídeo esperando resposta', 409)
      const resposta = (prox.tipo === 'conquista' ? FINAL : SEMANA)[String(b.resposta || '')]
      if (!resposta) return erro('resposta inválida')
      if (prox.status !== 'agendada') return erro('o Papai Noel já está gravando este vídeo', 409)
      const abre = Date.parse(prox.extras?.abre || ''), corte = Date.parse(prox.extras?.corte || '')
      if (!(Date.now() >= abre)) return erro('os botões ainda não abriram', 409)
      if (!(Date.now() < corte)) return erro('passou do prazo: o Papai Noel já escolheu a mensagem', 409)
      await db.atualiza('etapas', `id=eq.${atual.id}`, { resposta, respondida_em: new Date().toISOString() })
      await db.evento(p.id, 'resposta_semana', { ordem: atual.ordem, resposta: b.resposta })
      return NextResponse.json({ ok: true }, sem)
    }
    return erro('ação inválida')
  } catch (e: any) {
    console.error('recado/acordo', e)
    return erro(/gravando/.test(e?.message) ? e.message : 'não deu agora, tenta de novo em instantes', 500)
  }
}
