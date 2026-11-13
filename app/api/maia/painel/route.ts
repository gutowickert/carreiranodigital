// Maia: a API do PAINEL DO DONO (07/11). Ver lib/maia/painel-dono.ts.
//   POST {acao:'entrar', t}  → confere o link mágico e guarda num cookie httpOnly (a página tira o token da barra de endereço)
//   GET  ?acao=tudo          → tudo do negócio do cookie (números, funil, retomadas, conversas, anúncios, vendas, avisos)
//   GET  ?acao=conversa&id=  → a conversa completa com um cliente (só se for do negócio do cookie)
//   POST {acao:'venda'|'perda'|'aprovar'|'ajuste'|'devolver'|'sair'} → as poucas ações do dono, pelas MESMAS funções do WhatsApp
//   13/11: 'devolver' {conversa_id} = o botão "Resolvido, devolver pra Maia" (o mesmo que "devolve pra Maia" no WhatsApp, humano.ts)
// O negócio vem SÓ do token conferido no servidor. Nada aqui devolve chave, token, dado de outro negócio ou nota da equipe.
import { maiaDb as db } from '@/lib/maia/db'
import { donoBloqueado, donoErrou } from '@/lib/maia/acesso'
import { negocioDoToken, dadosDoPainel, conversaDoPainel, COOKIE } from '@/lib/maia/painel-dono'
import { achaLead, ganhou, perdeu } from '@/lib/maia/funil'
import { donoAprova, donoAjuste } from '@/lib/maia/aprovacao'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CAB = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }
const ok = (d: any, extra: Record<string, string> = {}) => Response.json(d, { headers: { ...CAB, ...extra } })
const erro = (m: string, s = 400, extra: Record<string, string> = {}, mais: Record<string, any> = {}) => Response.json({ erro: m, ...mais }, { status: s, headers: { ...CAB, ...extra } })
const LINK_RUIM = 'Esse link venceu ou não vale mais. Pede um novo pra Maia no WhatsApp: é só escrever "meu painel".'
// 08/11: abrir a página sem link nenhum (nem cookie) é diferente de link recusado: a página mostra "abre pelo link que a Maia te mandou"
const SEM_LINK = 'Abre o painel pelo link que a Maia te mandou no WhatsApp.'

const cookieDe = (req: Request) => {
  const c = req.headers.get('cookie') || ''
  const m = c.split(/;\s*/).find(x => x.startsWith(COOKIE + '='))
  return m ? decodeURIComponent(m.slice(COOKIE.length + 1)) : ''
}
const poeCookie = (t: string, segundos: number) => `${COOKIE}=${encodeURIComponent(t)}; Path=/api/maia/painel; Max-Age=${Math.max(0, Math.floor(segundos))}; HttpOnly; Secure; SameSite=Lax`
const tiraCookie = () => `${COOKIE}=; Path=/api/maia/painel; Max-Age=0; HttpOnly; Secure; SameSite=Lax`

// o negócio de quem pediu, pelo cookie (ou null). Cookie inválido conta como tentativa errada.
async function quem(req: Request) {
  const t = cookieDe(req)
  if (!t) return null
  const r = await negocioDoToken(t)
  if (!r) donoErrou(req)
  return r
}

export async function GET(req: Request) {
  if (donoBloqueado(req)) return erro('muitas tentativas. Espera 15 minutos.', 429)
  if (!cookieDe(req)) return erro(SEM_LINK, 401, {}, { motivo: 'sem_link' })
  const r = await quem(req)
  if (!r) return erro(LINK_RUIM, 401, { 'Set-Cookie': tiraCookie() }, { motivo: 'recusado' })
  const u = new URL(req.url), acao = u.searchParams.get('acao') || 'tudo'
  try {
    if (acao === 'tudo') return ok(await dadosDoPainel(r.neg))
    if (acao === 'conversa') {
      const c = await conversaDoPainel(r.neg, u.searchParams.get('id') || '')
      return c ? ok(c) : erro('conversa não encontrada', 404)
    }
    return erro('ação desconhecida')
  } catch (e: any) { console.error('[painel do dono]', e?.message); return erro('não deu pra carregar agora. Tenta de novo em um minuto.', 500) }
}

export async function POST(req: Request) {
  if (donoBloqueado(req)) return erro('muitas tentativas. Espera 15 minutos.', 429)
  const b = await req.json().catch(() => ({}))
  if (b.acao === 'entrar') {
    const r = await negocioDoToken(b.t)
    if (!r) { donoErrou(req); return erro(LINK_RUIM, 401, { 'Set-Cookie': tiraCookie() }, { motivo: 'recusado' }) }
    await db.evento('painel_dono_aberto', r.neg.id, {})
    return ok({ ok: true, negocio: r.neg.nome }, { 'Set-Cookie': poeCookie(String(b.t), r.exp - Date.now() / 1000) })
  }
  if (b.acao === 'sair') return ok({ ok: true }, { 'Set-Cookie': tiraCookie() })
  // as ações mudam dado: além do cookie (SameSite=Lax), pede um cabeçalho próprio (outro site não consegue mandar sem a página ser nossa)
  if (req.headers.get('x-maia-painel') !== '1') return erro('pedido inválido', 403)
  const r = await quem(req)
  if (!r) return erro(LINK_RUIM, 401, { 'Set-Cookie': tiraCookie() })
  const neg = r.neg
  try {
    switch (b.acao) {
      case 'venda': {
        const l = await achaLead(neg.id, { id: String(b.lead_id || '') })
        if (!l) return erro('contato não encontrado', 404)
        const valor = b.valor === '' || b.valor == null ? null : Number(String(b.valor).replace(',', '.'))
        if (valor != null && (!isFinite(valor) || valor < 0 || valor > 10_000_000)) return erro('valor inválido')
        const g = await ganhou(l, valor, b.produto ? String(b.produto).slice(0, 120) : null, 'dono')
        await db.evento('painel_dono_acao', neg.id, { acao: 'venda', lead: l.id, valor })
        return ok({ ok: true, etapa: g?.etapa, valor: g?.valor })
      }
      case 'perda': {
        const l = await achaLead(neg.id, { id: String(b.lead_id || '') })
        if (!l) return erro('contato não encontrado', 404)
        const motivo = String(b.motivo || '').trim().slice(0, 160)
        if (!motivo) return erro('escreve o motivo')
        const p = await perdeu(l, motivo, 'dono')
        await db.evento('painel_dono_acao', neg.id, { acao: 'perda', lead: l.id, motivo })
        return ok({ ok: true, etapa: p?.etapa })
      }
      case 'aprovar': {
        const p = await db.um('pecas', { id: String(b.peca_id || ''), negocio_id: neg.id })
        if (!p) return erro('anúncio não encontrado', 404)
        if (p.status !== 'com_dono') return erro('esse anúncio não está esperando o teu 👍')
        const a = await donoAprova(neg.id, p.id)
        await db.evento('painel_dono_acao', neg.id, { acao: 'aprovar', peca: p.id })
        return ok({ ok: true, aprovadas: a.length })
      }
      case 'ajuste': {
        const p = await db.um('pecas', { id: String(b.peca_id || ''), negocio_id: neg.id })
        if (!p) return erro('anúncio não encontrado', 404)
        if (p.status !== 'com_dono') return erro('esse anúncio não está esperando o teu 👍')
        const nota = String(b.nota || '').trim().slice(0, 500)
        if (!nota) return erro('escreve o que mudar')
        const a = await donoAjuste(neg.id, p.id, nota)
        await db.evento('painel_dono_acao', neg.id, { acao: 'ajuste', peca: p.id })
        return ok({ ok: !!a.ok })
      }
      // 13/11: regra da casa (toda ação do dono pelo WhatsApp E pelo painel): o dono resolveu a conversa e devolve pra Maia.
      // Só conversa de cliente DESTE negócio e que está com ele (modo humano)
      case 'devolver': {
        const cv = await db.um('conversas', { id: String(b.conversa_id || ''), negocio_id: neg.id })
        if (!cv || cv.canal !== 'cliente') return erro('conversa não encontrada', 404)
        if (cv.modo !== 'humano') return erro('essa conversa já está com a Maia')
        const { devolve } = await import('@/lib/maia/humano')
        await devolve(cv, 'dono_painel', 'dono')
        await db.evento('painel_dono_acao', neg.id, { acao: 'devolver', conversa: cv.id })
        return ok({ ok: true, modo: 'ia' })
      }
      default: return erro('ação desconhecida')
    }
  } catch (e: any) { console.error('[painel do dono]', e?.message); return erro('não deu agora. Tenta de novo ou fala com a Maia no WhatsApp.', 500) }
}
