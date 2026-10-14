// "Postar por mim" (14/10): a volta do login do Instagram (o endereço fixo cadastrado no app da Meta).
//   GET ?code=…&state=… → troca pelo token de 60 dias, guarda, agenda os posts e devolve pra área do cliente (ig=ok|erro|pessoal)
//   GET ?error=…&state=… → a pessoa cancelou: volta com ig=erro
import { NextResponse } from 'next/server'
import { oitoDb as db } from '@/lib/oito/db'
import { oitoConfig as cfg, ehMarca } from '@/lib/oito/config'
import { igDisponivel, leState, trocaCodigo, agendaCliente, horaPadrao } from '@/lib/oito/postar'
import { avisaDono } from '@/lib/oito/servico'

export const maxDuration = 30

export async function GET(req: Request) {
  if (!igDisponivel()) return NextResponse.json({ erro: 'Em breve.' }, { status: 503 })
  const u = new URL(req.url), st = leState(u.searchParams.get('state'))
  if (!st || !ehMarca(st.m)) return NextResponse.json({ erro: 'Link vencido. Volte pra sua área e toque em Conectar de novo.' }, { status: 400 })
  const volta = (ig: string) => NextResponse.redirect(cfg.url(st.m, `conta.html?c=${st.c}&ig=${ig}`))
  const c = await db.um('clientes', { codigo: st.c })
  if (!c || c.status !== 'ativo') return volta('erro')
  const code = u.searchParams.get('code')
  if (!code) { await db.evento('ig_cancelou', { cliente_id: c.id, marca: c.marca, detalhe: { erro: u.searchParams.get('error_reason') || u.searchParams.get('error') } }); return volta('erro') }
  try {
    const t = await trocaCodigo(code)
    // conta pessoal não publica pela API: a pessoa precisa trocar pra profissional (comercial ou criador)
    if (t.tipo && !/BUSINESS|CREATOR/i.test(t.tipo)) { await db.evento('ig_conta_pessoal', { cliente_id: c.id, marca: c.marca, detalhe: { usuario: t.usuario } }); return volta('pessoal') }
    const agora = new Date().toISOString()
    const campos = { ig_user_id: t.ig_user_id, usuario: t.usuario, tipo_conta: t.tipo || null, token: t.token, token_em: agora, expira_em: t.expira_em, ligado: true, erro: null, atualizado_em: agora }
    let ig = await db.um('instagram', { cliente_id: c.id })
    if (ig) ig = (await db.atualiza('instagram', { id: ig.id }, campos))[0]
    else ig = await db.insere('instagram', { cliente_id: c.id, hora_padrao: horaPadrao(c.marca), ...campos })
    const agendados = await agendaCliente(c, ig)
    await db.evento('ig_conectou', { cliente_id: c.id, marca: c.marca, detalhe: { usuario: t.usuario, agendados } })
    if (!c.exemplo) avisaDono('Instagram conectado', `${c.nome_negocio} ligou @${t.usuario} (${agendados} posts agendados)`)
    return volta('ok')
  } catch (e: any) {
    console.error('oito ig retorno', e?.message)
    await db.evento('ig_erro_conexao', { cliente_id: c.id, marca: c.marca, detalhe: { erro: String(e?.message || e).slice(0, 300) } })
    return volta('erro')
  }
}
