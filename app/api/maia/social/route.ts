// Maia: a social media (06/11; desde 08/11 faz parte do plano único de R$ 997), pro painel da equipe (senha em x-senha, igual à operação).
//   GET  ?acao=agenda|resultados|analise|link|capi&negocio=<id>   (link: &rede=instagram|facebook)
//   POST {acao, ...}: criar_post {negocio_id, quando, tipo, midias:[{url|caminho, tipo}], legenda, tema, formato, objetivo, redes}
//        aprovar_equipe {post_id} · aprovar_dono {post_id} (pra teste; o dono de verdade dá o 👍 no WhatsApp)
//        publicar_agora {post_id} · ler_resultados_agora {negocio_id?} · analise_agora {negocio_id, mes?} · dataset {negocio_id}
import { equipeOk, naoAutorizado } from '@/lib/maia/acesso'
import { agenda, resultados, analises, linkDoPerfil, criaPost, aprovaEquipe, aprovaDono, publica, leResultados, analiseDoMes, type Rede } from '@/lib/maia/social'
import { garanteDataset, placarCapi } from '@/lib/maia/conversoes'

export const maxDuration = 300
const ok = (d: any) => Response.json(d)
const erro = (m: string, s = 400) => Response.json({ erro: m }, { status: s })

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
      case 'criar_post': return ok(await criaPost(b.negocio_id, { quando: b.quando, tipo: b.tipo, midias: b.midias || [], legenda: b.legenda, tema: b.tema, formato: b.formato, objetivo: b.objetivo, redes: b.redes, por }))
      case 'aprovar_equipe': return ok(await aprovaEquipe(b.post_id, por))
      case 'aprovar_dono': return ok(await aprovaDono(b.post_id))
      case 'publicar_agora': return ok(await publica(b.post_id, { forcar: true, por }))
      case 'ler_resultados_agora': return ok(await leResultados({ negocio_id: b.negocio_id || null }))
      case 'analise_agora': return ok(await analiseDoMes(b.negocio_id, { mes: b.mes, forcar: !!b.forcar }))
      case 'dataset': return ok(await garanteDataset(b.negocio_id))
      default: return erro('ação desconhecida: ' + b.acao)
    }
  } catch (e: any) { return erro(String(e?.message || e)) }
}
