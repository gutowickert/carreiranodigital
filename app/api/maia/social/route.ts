// Maia: a social media (06/11; desde 08/11 faz parte do plano único de R$ 997), pro painel da equipe (senha em x-senha, igual à operação).
//   GET  ?acao=agenda|resultados|analise|link|capi&negocio=<id>   (link: &rede=instagram|facebook)
//   POST {acao, ...}: criar_post {negocio_id, quando, tipo, midias:[{url|caminho, tipo}], legenda, tema, formato, objetivo, redes}
//        aprovar_equipe {post_id} · aprovar_dono {post_id} (pra teste; o dono de verdade dá o 👍 no WhatsApp)
//        criar_carrossel {negocio_id, quando, tema, tipo: noticia|dica|produto, fonte?, midia_ids?, quantos?, redes?} (13/11: a IA escreve os
//          slides e a oficina monta as imagens com texto; ver lib/maia/carrossel.ts)
//        publicar_agora {post_id} · ler_resultados_agora {negocio_id?} · analise_agora {negocio_id, mes?} · dataset {negocio_id}
//   14/11 (aba Social do painel): GET ?acao=ligacao (o que falta pra postar; a chave nunca volta, só "guardada")
//        POST salvar_ligacao {negocio_id, page_id?, ig_id?, social_token?, apagar_chave?} (a chave vai cifrada) · achar_instagram {negocio_id}
//        editar_legenda {post_id, legenda} (só antes da equipe aprovar) · descartar_post {post_id}
//        criar_post também aceita midia_ids (do banco de mídias do negócio, em vez de midias com caminho)
import { equipeOk, naoAutorizado } from '@/lib/maia/acesso'
import { agenda, resultados, analises, linkDoPerfil, criaPost, aprovaEquipe, aprovaDono, publica, leResultados, analiseDoMes, ligacao, salvaLigacao, achaInstagram, editaLegenda, descartaPost, type Rede, type Midia } from '@/lib/maia/social'
import { maiaDb as db } from '@/lib/maia/db'
import { garanteDataset, placarCapi } from '@/lib/maia/conversoes'
import { criaCarrossel } from '@/lib/maia/carrossel'

export const maxDuration = 300
const ok = (d: any) => Response.json(d)
const erro = (m: string, s = 400) => Response.json({ erro: m }, { status: s })

// 14/11: as fotos e vídeos escolhidos no banco de mídias do negócio viram o caminho no armazenamento (só deste negócio)
async function midiasDoBanco(b: any): Promise<Midia[]> {
  if (!Array.isArray(b.midia_ids) || !b.midia_ids.length) return b.midias || []
  const todas = await db.lista('midias', { negocio_id: b.negocio_id })
  return b.midia_ids.map((id: string) => todas.find(m => m.id === id)).filter(Boolean).map((m: any) => ({ caminho: m.path, tipo: m.tipo === 'video' ? 'video' : 'foto' }))
}

export async function GET(req: Request) {
  if (!equipeOk(req)) return naoAutorizado()
  const u = new URL(req.url)
  const acao = u.searchParams.get('acao') || 'agenda', neg = u.searchParams.get('negocio') || ''
  if (!neg) return erro('falta o negocio')
  try {
    switch (acao) {
      case 'agenda': return ok(await agenda(neg))
      case 'resultados': return ok(await resultados(neg))
      case 'analise': return ok(await analises(neg))
      case 'link': return ok(await linkDoPerfil(neg, (u.searchParams.get('rede') as Rede) || 'instagram'))
      case 'capi': return ok(await placarCapi(neg))
      case 'ligacao': return ok(await ligacao(neg))
      default: return erro('ação desconhecida: ' + acao)
    }
  } catch (e: any) { return erro(String(e?.message || e)) }
}

export async function POST(req: Request) {
  if (!equipeOk(req)) return naoAutorizado()
  const b = await req.json().catch(() => ({}))
  const por = String(b.por || 'equipe')
  try {
    switch (b.acao) {
      case 'criar_post': return ok(await criaPost(b.negocio_id, { quando: b.quando, tipo: b.tipo, midias: await midiasDoBanco(b), legenda: b.legenda, tema: b.tema, formato: b.formato, objetivo: b.objetivo, redes: b.redes, por }))
      case 'criar_carrossel': return ok(await criaCarrossel(b.negocio_id, { quando: b.quando, tema: b.tema, tipo: b.tipo, fonte: b.fonte, midia_ids: b.midia_ids, quantos: b.quantos, redes: b.redes, por }))
      case 'aprovar_equipe': return ok(await aprovaEquipe(b.post_id, por))
      case 'aprovar_dono': return ok(await aprovaDono(b.post_id))
      case 'publicar_agora': return ok(await publica(b.post_id, { forcar: true, por }))
      case 'ler_resultados_agora': return ok(await leResultados({ negocio_id: b.negocio_id || null }))
      case 'analise_agora': return ok(await analiseDoMes(b.negocio_id, { mes: b.mes, forcar: !!b.forcar }))
      case 'dataset': return ok(await garanteDataset(b.negocio_id))
      case 'ligacao': return ok(await ligacao(b.negocio_id))
      case 'salvar_ligacao': return ok(await salvaLigacao(b.negocio_id, { page_id: b.page_id, ig_id: b.ig_id, social_token: b.social_token, apagar_chave: b.apagar_chave === true }, por))
      case 'achar_instagram': return ok(await achaInstagram(b.negocio_id))
      case 'editar_legenda': return ok(await editaLegenda(b.post_id, String(b.legenda || ''), por))
      case 'descartar_post': return ok(await descartaPost(b.post_id, por))
      default: return erro('ação desconhecida: ' + b.acao)
    }
  } catch (e: any) { return erro(String(e?.message || e)) }
}
