// Maia Gestora (T15, 08/11): a API da aba "Avisos" do painel da equipe (public/maia/operacao/avisos.html). Mesma senha do painel (x-senha).
//   GET  ?acao=avisos[&dias=14]        → os avisos por negócio, a última rodada e se a Gestora está ligada
//   GET  ?acao=pessoas&id=<aviso>      → o primeiro nome + inicial das pessoas do aviso, lido NA HORA no CRM (nada é gravado; saúde: nunca)
//   GET  ?acao=funil&negocio=<id>      → o funil por anúncio da última semana fechada (maia_funil_semana)
//   POST {acao:'marcar', id, status: 'resolvido'|'ignorado'|'aberto'}  ·  {acao:'util', id, util: true|false|null}
//   POST {acao:'rodar', modo: 'urgentes'|'dia'|'semana', previa?: true}  → roda agora (previa: só calcula, não grava nem avisa)
// Nada aqui escreve na Meta nem nos CRMs: só lê e grava em maia_avisos / maia_crm_dia / maia_funil_semana.
import { maiaDb as db } from '@/lib/maia/db'
import { equipeOk, naoAutorizado } from '@/lib/maia/acesso'
import { negociosGeridos, rotinaGestora, gestoraLigada, recebeDireto } from '@/lib/maia/gestora-rotina'
import { nomesDosLeads } from '@/lib/maia/gestora-crm'

export const maxDuration = 300
const ok = (d: any) => Response.json(d)
const erro = (m: string, s = 400) => Response.json({ erro: m }, { status: s })

export async function GET(req: Request) {
  if (!equipeOk(req)) return naoAutorizado()
  const u = new URL(req.url), q = (k: string) => u.searchParams.get(k) || ''
  const acao = q('acao') || 'avisos'
  try {
    if (acao === 'avisos') {
      const dias = Math.min(60, Math.max(1, Number(q('dias')) || 14))
      const desde = new Date(Date.now() - dias * 86400e3 - 3 * 3600e3).toISOString().slice(0, 10)
      const negs = await negociosGeridos()
      const lista = await Promise.all(negs.map(async n => {
        const avs = (await db.lista('avisos', { negocio_id: n.id }, { ordem: 'criado_em', desc: true, limite: 300 })).filter(a => String(a.dia) >= desde)
        return {
          id: n.id, nome: n.nome, status: n.status, saude: !!n.gestora?.saude, direto: recebeDireto(n),
          crm: n.crm?.tipo === 'teunegocio' ? (n.crm.mesmo_banco ? 'mesmo banco' : 'chave de leitura') : n.crm?.tipo || 'nenhum',
          avisos: avs.map(a => ({ id: a.id, dia: a.dia, tipo: a.tipo, nivel: a.nivel, titulo: a.titulo, texto: a.texto, acao: a.acao, numeros: a.numeros, status: a.status, util: a.util, pessoas: (a.lead_ids || []).length, criado_em: a.criado_em, resolvido_em: a.resolvido_em })),
        }
      }))
      const rodada = (await db.lista('eventos', { tipo: 'gestora_rodada' }, { ordem: 'criado_em', desc: true, limite: 1 }))[0] || null
      const todos = lista.flatMap(n => n.avisos)
      const marcados = todos.filter(a => a.util === true || a.util === false)
      return ok({ ligada: gestoraLigada(), modo: db.modo(), negocios: lista, ultima_rodada: rodada ? { em: rodada.criado_em, ...rodada.detalhe } : null,
        placar: { avisos: todos.length, abertos: todos.filter(a => a.status === 'revisao_equipe' || a.status === 'novo' || a.status === 'enviado').length, marcados: marcados.length, ajudou: marcados.filter(a => a.util === true).length } })
    }
    if (acao === 'pessoas') {
      const a = await db.um('avisos', { id: q('id') })
      if (!a) return erro('aviso não existe', 404)
      const neg = await db.um('negocios', { id: a.negocio_id })
      if (neg?.gestora?.saude) return ok({ nomes: [], saude: true })
      const m = await nomesDosLeads(neg, (a.lead_ids || []).map(String))
      return ok({ nomes: (a.lead_ids || []).map((i: string) => m[String(i)]).filter(Boolean) })
    }
    if (acao === 'funil') {
      const linhas = await db.lista('funil_semana', { negocio_id: q('negocio') })
      const ult = linhas.map(l => String(l.semana)).sort().pop()
      return ok({ semana: ult || null, linhas: linhas.filter(l => String(l.semana) === ult).sort((a, b) => (Number(b.receita) - Number(a.receita)) || (Number(b.gasto) - Number(a.gasto))) })
    }
    return erro('ação desconhecida')
  } catch (e: any) { return erro(String(e?.message || e), 500) }
}

export async function POST(req: Request) {
  if (!equipeOk(req)) return naoAutorizado()
  const b: any = await req.json().catch(() => ({}))
  try {
    if (b.acao === 'marcar') {
      const st = ({ resolvido: 'resolvido', ignorado: 'ignorado', aberto: 'revisao_equipe' } as Record<string, string>)[b.status]
      if (!st || !b.id) return erro('status inválido')
      const r = await db.atualiza('avisos', { id: String(b.id) }, { status: st, resolvido_em: st === 'resolvido' ? new Date().toISOString() : null })
      return r.length ? ok({ ok: true, status: st }) : erro('aviso não existe', 404)
    }
    if (b.acao === 'util') {
      if (!b.id || ![true, false, null].includes(b.util)) return erro('util inválido')
      const r = await db.atualiza('avisos', { id: String(b.id) }, { util: b.util })
      return r.length ? ok({ ok: true, util: b.util }) : erro('aviso não existe', 404)
    }
    if (b.acao === 'rodar') {
      const modo = ['urgentes', 'dia', 'semana'].includes(b.modo) ? b.modo : 'dia'
      // só o teste local escolhe a hora (relogio); em produção é sempre agora
      const relogio = b.relogio && db.modo() === 'local' ? new Date(b.relogio) : new Date()
      return ok(await rotinaGestora({ forcar: modo, previa: !!b.previa, negocio: b.negocio || undefined, relogio }))
    }
    return erro('ação desconhecida')
  } catch (e: any) { return erro(String(e?.message || e), 500) }
}
