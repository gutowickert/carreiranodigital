// "Postar por mim" (14/10): publica no Instagram dos clientes os posts cuja hora chegou. O gerador chama a cada 2 minutos.
//   POST (x-senha) → { publicados: [...], erros: [...], renovados, desligados }
// Regras: cliente ativo e ligado; post pronto, não pulado, ainda não publicado, hora vencida, menos de 3 tentativas. No máximo 10 por chamada.
// Token recusado (190): desliga, guarda o erro e manda e-mail pedindo pra conectar de novo.
import { NextResponse } from 'next/server'
import { oitoDb as db } from '@/lib/oito/db'
import { senhaOk, oitoConfig as cfg, Marca } from '@/lib/oito/config'
import { igDisponivel, publicaImagem, legendaIG, renovaToken, erroDeToken, avisaReconectar } from '@/lib/oito/postar'
import { avisaDono } from '@/lib/oito/servico'

export const maxDuration = 60
const MAX = 10

export async function POST(req: Request) {
  if (!senhaOk(req.headers.get('x-senha'))) return NextResponse.json({ erro: 'senha' }, { status: 401 })
  if (!igDisponivel()) return NextResponse.json({ erro: 'instagram não configurado (OITO_IG_APP_ID)' }, { status: 503 })
  const t0 = Date.now(), agora = new Date().toISOString()
  const res = { publicados: [] as any[], erros: [] as any[], renovados: 0, desligados: 0 }
  const ligacoes = await db.lista('instagram', { ligado: true })

  const desliga = async (ig: any, c: any, motivo: string) => {
    await db.atualiza('instagram', { id: ig.id }, { ligado: false, token: null, erro: motivo.slice(0, 300), atualizado_em: new Date().toISOString() })
    ig.ligado = false; res.desligados++
    await db.evento('ig_desligou', { cliente_id: c.id, marca: c.marca, detalhe: { por: 'erro', motivo: motivo.slice(0, 300) } })
    await avisaReconectar(c).catch(() => null)
    if (!c.exemplo) avisaDono('Instagram desconectou', `${c.nome_negocio} (@${ig.usuario}): ${motivo.slice(0, 120)}`)
  }

  for (const ig of ligacoes) {
    if (Date.now() - t0 > 45e3 || res.publicados.length + res.erros.length >= MAX) break
    const c = await db.um('clientes', { id: ig.cliente_id })
    if (!c) continue
    // token vencido sem volta: só reconectando
    if (!ig.token || (ig.expira_em && ig.expira_em < agora)) { await desliga(ig, c, 'token vencido'); continue }
    // renova o token de 60 dias: com mais de 7 dias de vida e vencendo em menos de 15
    const idade = Date.now() - new Date(ig.token_em || ig.criado_em).getTime(), resta = new Date(ig.expira_em || 0).getTime() - Date.now()
    if (idade > 7 * 86400e3 && resta < 15 * 86400e3) {
      try {
        const n = await renovaToken(ig.token)
        await db.atualiza('instagram', { id: ig.id }, { token: n.token, expira_em: n.expira_em, token_em: new Date().toISOString(), atualizado_em: new Date().toISOString() })
        Object.assign(ig, { token: n.token, expira_em: n.expira_em }); res.renovados++
      } catch (e: any) { if (erroDeToken(e)) { await desliga(ig, c, e.message); continue } console.error('oito ig renova', e?.message) }
    }
    if (c.status !== 'ativo') continue

    const posts = (await db.lista('posts', { cliente_id: c.id, status: 'pronto', publicado_em: null }))
      .filter(p => p.publicar_em && p.publicar_em <= agora && !p.nao_publicar && (p.publicacao_tentativas || 0) < 3)
      .sort((a, b) => (a.publicar_em > b.publicar_em ? 1 : -1))
    for (const p of posts) {
      if (!ig.ligado || Date.now() - t0 > 45e3 || res.publicados.length + res.erros.length >= MAX) break
      const tent = (p.publicacao_tentativas || 0) + 1
      // conta a tentativa antes (se cair no meio, não repete sem fim)
      await db.atualiza('posts', { id: p.id }, { publicacao_tentativas: tent })
      try {
        const url = await db.link(p.imagem_path, 60 * 60 * 24)
        if (!url) throw new Error('post sem imagem')
        const id = await publicaImagem(ig, url, legendaIG(p.legenda))
        await db.atualiza('posts', { id: p.id }, { publicado_em: new Date().toISOString(), ig_media_id: id, publicacao_erro: null })
        await db.evento('publicado', { cliente_id: c.id, marca: c.marca, detalhe: { post: p.id, ig_media_id: id, tentativa: tent } })
        res.publicados.push({ cliente: c.codigo, post: p.id, ig: id })
      } catch (e: any) {
        const msg = String(e?.message || e).slice(0, 300)
        await db.atualiza('posts', { id: p.id }, { publicacao_erro: msg })
        await db.evento('publicacao_erro', { cliente_id: c.id, marca: c.marca, detalhe: { post: p.id, erro: msg, codigo: e?.code ?? null, tentativa: tent } })
        res.erros.push({ cliente: c.codigo, post: p.id, erro: msg })
        if (erroDeToken(e)) await desliga(ig, c, msg)
        else if (tent >= 3 && !c.exemplo) avisaDono('post não publicou', `${cfg.marcas[c.marca as Marca].nome} · ${c.nome_negocio}: ${msg.slice(0, 150)}`)
      }
    }
  }
  return NextResponse.json(res)
}
