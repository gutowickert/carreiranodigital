// Oito Posts: o WhatsApp de venda no painel (14/10). Tudo com a senha do painel (x-senha).
//   GET                    → as conversas (as mais recentes primeiro) + se o número está ligado
//   GET ?regiao=br|latam   → (15/10) só as conversas da região, pela marca da conversa ou do cliente; conversa sem marca fica no Brasil
//   GET ?id=               → a conversa inteira (zera as não lidas)
//   POST {acao:'responder', id, texto}      → o dono escreve (só dentro da janela de 24 h; fora dela a Meta só aceita modelo)
//   POST {acao:'modo', id, modo:'ia'|'humano'|'encerrada'}
//   POST {acao:'followup'}                  → roda a varredura do follow-up (o gerador chama a cada 2 min)
import { NextResponse } from 'next/server'
import { senhaOk, regiaoDe, lerRegiao } from '@/lib/oito/config'
import { oitoDb as db } from '@/lib/oito/db'
import { enviaTexto, registraSaida, waLigado } from '@/lib/oito/wa'
import { rodaFollowups, atendeConversa } from '@/lib/oito/vendedor'

export const maxDuration = 120
const nega = () => NextResponse.json({ erro: 'senha' }, { status: 401 })

export async function GET(req: Request) {
  if (!senhaOk(req.headers.get('x-senha'))) return nega()
  const sp = new URL(req.url).searchParams, id = sp.get('id')
  if (id) {
    const cv = await db.um('wa_conversas', { id })
    if (!cv) return NextResponse.json({ erro: 'conversa' }, { status: 404 })
    await db.atualiza('wa_conversas', { id }, { nao_lidas: 0 })
    const [msgs, cli] = await Promise.all([db.lista('wa_msgs', { conversa_id: id }, { ordem: 'criado_em' }), cv.cliente_id ? db.um('clientes', { id: cv.cliente_id }) : null])
    return NextResponse.json({ conversa: cv, cliente: cli ? { codigo: cli.codigo, nome: cli.nome_negocio, cidade: cli.cidade, status: cli.status, marca: cli.marca, instagram: cli.instagram } : null,
      msgs: msgs.map(m => ({ autor: m.autor, tipo: m.tipo, texto: m.texto, status: m.status, erro: m.erro, em: m.criado_em })) }, { headers: { 'Cache-Control': 'no-store' } })
  }
  // 15/10: painel zerado: só as conversas com movimento depois de painel_desde (quem responder de novo volta pra lista)
  const zero = String((await db.um('estado', { chave: 'painel_desde' }).catch(() => null))?.valor || '')
  const cvs = (await db.lista('wa_conversas', {}, { ordem: 'atualizado_em', desc: true, limite: 200 })).filter(cv => !zero || String(cv.ultima_msg_em || cv.atualizado_em || '') >= zero)
  const regiao = lerRegiao(sp.get('regiao'))
  let lista = cvs
  if (regiao) {
    const semMarca = [...new Set(cvs.filter(cv => !cv.marca && cv.cliente_id).map(cv => cv.cliente_id))]
    const marcaCli = new Map<string, any>()
    if (semMarca.length) for (const c of await db.lista('clientes', {})) marcaCli.set(c.id, c.marca)
    lista = cvs.filter(cv => regiaoDe(cv.marca || (cv.cliente_id ? marcaCli.get(cv.cliente_id) : null)) === regiao)
  }
  return NextResponse.json({ ligado: waLigado(), regiao, conversas: lista }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: Request) {
  if (!senhaOk(req.headers.get('x-senha'))) return nega()
  const b = await req.json().catch(() => ({}))
  if (b.acao === 'followup') return NextResponse.json(await rodaFollowups())
  const cv = b.id ? await db.um('wa_conversas', { id: String(b.id) }) : null
  if (!cv) return NextResponse.json({ erro: 'conversa' }, { status: 404 })
  if (b.acao === 'responder') {
    const texto = String(b.texto || '').trim().slice(0, 4000)
    if (!texto) return NextResponse.json({ erro: 'Escreve a mensagem.' }, { status: 400 })
    if (!cv.janela_ate || cv.janela_ate < new Date().toISOString()) return NextResponse.json({ erro: 'Passaram 24 h da última mensagem do cliente: a Meta só deixa mandar modelo aprovado. Espera ele responder.' }, { status: 409 })
    const r = await enviaTexto(cv.telefone, texto)
    await registraSaida(cv, 'dono', texto, r)
    // quem responde assume a conversa (a IA para de responder)
    await db.atualiza('wa_conversas', { id: cv.id }, { modo: 'humano', nao_lidas: 0 })
    return NextResponse.json(r.ok ? { ok: true } : { erro: r.erro }, { status: r.ok ? 200 : 502 })
  }
  if (b.acao === 'modo' && ['ia', 'humano', 'encerrada'].includes(b.modo)) {
    await db.atualiza('wa_conversas', { id: cv.id }, { modo: b.modo, ...(b.modo === 'ia' ? { ia_respostas: 0 } : {}) })
    // devolveu pra IA com mensagem do cliente sem resposta: ela responde agora
    if (b.modo === 'ia') { const ult = (await db.lista('wa_msgs', { conversa_id: cv.id }, { ordem: 'criado_em', desc: true, limite: 1 }))[0]; if (ult?.autor === 'cliente') await atendeConversa(cv.id) }
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ erro: 'ação' }, { status: 400 })
}
