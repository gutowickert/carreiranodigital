// Maia: a API do PAINEL DO DONO (07/11). Ver lib/maia/painel-dono.ts.
//   POST {acao:'entrar', t}  → confere o link mágico e guarda num cookie httpOnly (a página tira o token da barra de endereço)
//   GET  ?acao=tudo          → tudo do negócio do cookie (números, funil, retomadas, conversas, anúncios, vendas, avisos)
//   GET  ?acao=conversa&id=  → a conversa completa com um cliente (só se for do negócio do cookie)
//   POST {acao:'venda'|'perda'|'aprovar'|'ajuste'|'devolver'|'sair'} → as poucas ações do dono, pelas MESMAS funções do WhatsApp
//   13/11: 'devolver' {conversa_id} = o botão "Resolvido, devolver pra Maia" (o mesmo que "devolve pra Maia" no WhatsApp, humano.ts)
//          'responder' {lead_id, texto} = responde a pergunta de um cliente (a Maia repassa, como no WhatsApp)
//          'verba' {valor} = pede pra mudar a verba por dia (vira pedido; a equipe aprova antes de valer)
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
    // 13/11 (relatorios.ts): a PÁGINA do relatório do mês (cards), só do negócio do cookie e só a que já foi pro dono
    if (acao === 'relatorio') {
      const { paginaDoRelatorio } = await import('@/lib/maia/relatorios')
      const html = await paginaDoRelatorio(r.neg, u.searchParams.get('id') || '')
      return html ? new Response(html, { headers: { ...CAB, 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY' } }) : erro('relatório não encontrado', 404)
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
      // 13/11: o dono responde a pergunta de um cliente pelo painel (o mesmo que responder pra Maia no WhatsApp: dono.ts, responderCliente)
      case 'responder': {
        const l = await achaLead(neg.id, { id: String(b.lead_id || '') })
        if (!l || !l.telefone) return erro('contato não encontrado', 404)
        const texto = String(b.texto || '').trim().slice(0, 1000)
        if (!texto) return erro('escreve a resposta')
        const { perguntasAbertas, responderCliente } = await import('@/lib/maia/dono')
        if (!(await perguntasAbertas(neg)).some(x => x.lead.id === l.id)) return erro('esse cliente não tem pergunta esperando')
        const r = await responderCliente(neg, l, texto, 'painel')
        await db.evento('painel_dono_acao', neg.id, { acao: 'responder', lead: l.id })
        return ok({ ok: true, aviso: (r as any).aviso || null })
      }
      // 13/11: o dono pede pra mudar a verba por dia pelo painel (o mesmo pedido do WhatsApp: a equipe aprova antes de valer)
      case 'verba': {
        const valor = Number(String(b.valor ?? '').replace(',', '.'))
        if (!isFinite(valor) || valor <= 0) return erro('valor inválido')
        const { pedeVerba } = await import('@/lib/maia/pendencias')
        const p = await pedeVerba(neg, valor, 'dono_painel')
        if (!p.ok) return erro(p.erro || 'não deu')
        await db.evento('painel_dono_acao', neg.id, { acao: 'verba', valor: p.valor })
        return ok({ ok: true, pedido: p.pedido, valor: p.valor })
      }
      // 13/11 (junção): o dono pede carrossel ou vídeo com locução pelo painel (o mesmo de pedir pra Maia no WhatsApp: dono.ts, pedeConteudo)
      case 'conteudo': {
        const o = b.o === 'carrossel' ? 'carrossel' : b.o === 'locucao' ? 'locucao' : null
        if (!o) return erro('pedido inválido')
        const tema = String(b.tema || '').trim().slice(0, 200)
        if (o === 'carrossel' && !tema) return erro('escreve o tema')
        const { pedeConteudo } = await import('@/lib/maia/dono')
        const p: any = await pedeConteudo(neg, { o, tema, tipo: b.tipo === 'produto' ? 'produto' : 'dica' }, 'dono_painel')
        if (!p?.ok) return erro(p?.erro || 'não deu')
        await db.evento('painel_dono_acao', neg.id, { acao: 'conteudo', o })
        return ok({ ok: true })
      }
      // 13/11 (material.ts): o dono manda fotos e vídeos pelo painel (regra da casa: WhatsApp E painel). Pequeno em base64;
      // grande vai direto pro armazenamento (midia_envio → PUT no link → midia_registrar)
      case 'midia_subir': {
        if (!b.arquivo_b64) return erro('falta o arquivo')
        const m = await import('@/lib/maia/material')
        const x = await m.sobeMidia(neg, { buf: Buffer.from(String(b.arquivo_b64), 'base64'), mime: b.mime, nome: b.nome || null, por: 'dono_painel' })
        await db.evento('painel_dono_acao', neg.id, { acao: 'midia' })
        return ok({ ok: true, id: x.id })
      }
      case 'midia_envio': { const m = await import('@/lib/maia/material'); const x = await m.linkDeEnvio(neg, b.mime); return ok({ caminho: x.caminho, url: x.url }) }
      case 'midia_registrar': {
        const m = await import('@/lib/maia/material')
        const x = await m.registraMidia(neg, { caminho: b.caminho, mime: b.mime, nome: b.nome || null, por: 'dono_painel' })
        await db.evento('painel_dono_acao', neg.id, { acao: 'midia' })
        return ok({ ok: true, id: x.id })
      }
      // 14/11 (recado.ts): o RECADO PRA BASE pelo painel (regra da casa: o mesmo que pelo WhatsApp da Maia).
      //   base_importar {texto, incluir?} · recado_criar {pedido, etiquetas?} · recado_aprovar {recado_id} · recado_ajuste {recado_id, nota}
      // O erro de regra (base vazia, etiqueta que não existe, função ainda não ligada) volta com a frase pro dono
      case 'base_importar': case 'recado_criar': case 'recado_aprovar': case 'recado_ajuste': {
        const R = await import('@/lib/maia/recado')
        try {
          if (b.acao === 'base_importar') {
            const texto = String(b.texto || '').slice(0, 400_000)
            const incluir = b.incluir === 'compraram' || b.incluir === 'todos' ? b.incluir : null
            if (!texto.trim() && !incluir) return erro('cola a lista ou escolhe o arquivo .csv')
            const r = await R.importaBase(neg, { texto, incluir, origem: 'dono', por: 'dono_painel' })
            await db.evento('painel_dono_acao', neg.id, { acao: 'base_importar', novos: r.novos })
            return ok(r)
          }
          if (b.acao === 'recado_criar') {
            const r: any = await R.criaRecado(neg, { pedido: String(b.pedido || '').slice(0, 1000), etiquetas: b.etiquetas || null, por: 'dono_painel' })
            await db.evento('painel_dono_acao', neg.id, { acao: 'recado_criar', recado: r.id })
            return ok({ ok: true, id: r.id, titulo: r.titulo, estimativa: r.estimativa })
          }
          if (b.acao === 'recado_aprovar') {
            const a = await R.donoAprovaRecado(neg.id, String(b.recado_id || ''), 'painel')
            await db.evento('painel_dono_acao', neg.id, { acao: 'recado_aprovar', recado: b.recado_id })
            return ok({ ok: true, aprovados: a.length })
          }
          const nota = String(b.nota || '').trim().slice(0, 500)
          if (!nota) return erro('escreve o que mudar')
          const a = await R.donoAjustaRecado(neg.id, String(b.recado_id || ''), nota)
          if (!a.ok) return erro(a.erro || 'não deu')
          await db.evento('painel_dono_acao', neg.id, { acao: 'recado_ajuste', recado: b.recado_id })
          return ok({ ok: true })
        } catch (e: any) { return erro(String(e?.message || 'não deu').slice(0, 300)) }
      }
      // 22/11 (estrategia.ts): a ESTRATÉGIA DA QUINZENA e o calendário pelo painel (regra da casa: o mesmo que pelo WhatsApp da Maia).
      //   estrategia_aprovar {estrategia_id} · estrategia_ajuste {estrategia_id, nota} · calendario_data {nome, dia, antecedencia_dias?, porque?}
      case 'estrategia_aprovar': case 'estrategia_ajuste': case 'calendario_data': {
        const E = await import('@/lib/maia/estrategia')
        if (!E.estrategiaLigada()) return erro('a estratégia de 15 dias ainda não está ligada')
        try {
          if (b.acao === 'estrategia_aprovar') {
            const a = await E.donoAprovaEstrategia(neg.id, String(b.estrategia_id || ''), 'painel')
            await db.evento('painel_dono_acao', neg.id, { acao: 'estrategia_aprovar', estrategia: b.estrategia_id })
            return ok({ ok: true, aprovadas: a.length })
          }
          if (b.acao === 'estrategia_ajuste') {
            const nota = String(b.nota || '').trim().slice(0, 500)
            if (!nota) return erro('escreve o que mudar')
            const a = await E.donoAjustaEstrategia(neg.id, String(b.estrategia_id || ''), nota, 'painel')
            if (!a.ok) return erro(a.erro || 'não deu')
            await db.evento('painel_dono_acao', neg.id, { acao: 'estrategia_ajuste', estrategia: b.estrategia_id })
            return ok({ ok: true })
          }
          const r = await E.adicionaData(neg, { nome: String(b.nome || ''), dia: String(b.dia || ''), antecedencia_dias: b.antecedencia_dias === '' || b.antecedencia_dias == null ? null : Number(b.antecedencia_dias), porque: b.porque ? String(b.porque) : null }, 'dono_painel')
          if (!r.ok) return erro(r.erro || 'não deu')
          await db.evento('painel_dono_acao', neg.id, { acao: 'calendario_data', nome: r.data?.nome })
          return ok(r)
        } catch (e: any) { return erro(String(e?.message || 'não deu').slice(0, 300)) }
      }
      default: return erro('ação desconhecida')
    }
  } catch (e: any) { console.error('[painel do dono]', e?.message); return erro('não deu agora. Tenta de novo ou fala com a Maia no WhatsApp.', 500) }
}
