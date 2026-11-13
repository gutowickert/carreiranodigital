// Maia: a API do aprendizado e do acompanhamento (13/11). Mesma senha do painel da equipe (x-senha).
// Página: public/maia/operacao/aprendizado.html. O gancho do painel principal (aprendizado-gancho.js) pergunta o porquê
// quando a equipe descarta ou pede ajuste de uma peça e põe o "isso está errado" nas mensagens da Maia.
//   GET  ?acao=painel                → negócios (acerto de primeira, motivos, acompanhamento), propostas, regras, correções
//   GET  ?acao=analises&negocio=     → as análises da manhã do negócio (últimas 30)
//   GET  ?acao=conversa&id=          → a conversa, as mensagens e as correções já feitas nela
//   POST corrigir {peca_id | conversa_id+msg_id | negocio_id, alvo, acao, motivos[], livre, certo, por}
//        propor {negocio_id?} · decidir {id, decisao: aprovar|recusar, texto?, escopo?, area?}
//        regra_nova {texto, area, escopo, negocio_id?} · regra_mudar {id, ativa?, texto?, area?}
//        analisar {negocio_id} (refaz a de ontem) · acompanhar {negocio_id, acompanhar: true|false|null, primeiras?, dias?}
//   Só no modo de teste (MAIA_LOCAL=1): teste_cliente_real, teste_msg, teste_rotina, teste_prompt
import { maiaDb as db } from '@/lib/maia/db'
import { equipeOk, naoAutorizado } from '@/lib/maia/acesso'
import * as ap from '@/lib/maia/aprendizado'
import * as ac from '@/lib/maia/acompanhamento'

export const maxDuration = 300
const ok = (d: any) => Response.json(d)
const erro = (m: string, s = 400) => Response.json({ erro: m }, { status: s })
const equipeNomes = () => String(process.env.MAIA_EQUIPE_NOMES || 'Guto,Mateus,Nando').split(',').map(s => s.trim()).filter(Boolean)

export async function GET(req: Request) {
  if (!equipeOk(req)) return naoAutorizado()
  const u = new URL(req.url), q = (k: string) => u.searchParams.get(k) || ''
  const acao = q('acao') || 'painel'
  try {
    if (acao === 'motivos') return ok({ motivos: Object.entries(ap.MOTIVOS).map(([id, m]) => ({ id, rotulo: m.rotulo, area: m.area })), equipe: equipeNomes() })
    if (acao === 'painel') {
      const negs = (await db.lista('negocios', {}, { ordem: 'criado_em', desc: true })).filter(n => !n.contexto?.demo && n.status !== 'cancelado')
      const cs = await ap.correcoes(null, 90)
      const analises = await db.lista('eventos', { tipo: 'analise_manha' }, { ordem: 'criado_em', desc: true, limite: 200 })
      const negocios = await Promise.all(negs.map(async n => ({
        id: n.id, nome: n.nome, status: n.status,
        acerto: await ap.acertoDePrimeira(n, Number(q('dias')) || 30),
        motivos: ap.motivosMaisComuns(cs.filter(c => c.negocio_id === n.id)),
        acompanhamento: { ativo: await ac.emAcompanhamento(n), marcado: n.meta?.acompanhar ?? null, primeiras: ac.limitePrimeiras(n), avisadas: (await db.lista('eventos', { tipo: 'acompanha_conversa', negocio_id: n.id })).length },
        ultima_analise: analises.find(a => a.negocio_id === n.id) || null,
      })))
      const nome = (id: string | null) => negs.find(n => n.id === id)?.nome || (id ? '?' : 'todos os negócios')
      return ok({
        motivos: Object.entries(ap.MOTIVOS).map(([id, m]) => ({ id, rotulo: m.rotulo, area: m.area })),
        equipe: equipeNomes(), avisos_whats: ac.fonesDoTime().length,
        negocios,
        propostas: (await ap.propostas()).slice(0, 100).map(p => ({ ...p.detalhe, criado_em: p.criado_em, negocio_id: p.negocio_id, negocio_nome: nome(p.negocio_id) })),
        regras: (await ap.regras()).map(r => ({ ...r, negocio_nome: nome(r.negocio_id) })),
        correcoes: cs.slice(0, 80).map(c => ({ id: c.id, criado_em: c.criado_em, negocio_id: c.negocio_id, negocio_nome: nome(c.negocio_id), ...c.detalhe })),
      })
    }
    if (acao === 'analises') {
      const l = await db.lista('eventos', { tipo: 'analise_manha', negocio_id: q('negocio') }, { ordem: 'criado_em', desc: true, limite: 30 })
      return ok(l.map(e => ({ id: e.id, criado_em: e.criado_em, ...e.detalhe })))
    }
    if (acao === 'conversa') {
      const cv = await db.um('conversas', { id: q('id') })
      if (!cv) return erro('conversa não existe', 404)
      const neg = await db.um('negocios', { id: cv.negocio_id })
      const msgs = await db.lista('msgs', { conversa_id: cv.id }, { ordem: 'criado_em' })
      const cs = (await db.lista('eventos', { tipo: 'correcao_time', negocio_id: cv.negocio_id })).filter(c => c.detalhe?.conversa_id === cv.id)
      return ok({ conversa: { id: cv.id, nome: cv.nome, telefone: cv.telefone, canal: cv.canal, modo: cv.modo, simulada: cv.simulada, criado_em: cv.criado_em },
        negocio: neg ? { id: neg.id, nome: neg.nome, dono_nome: neg.dono_nome } : null,
        msgs: msgs.map(m => ({ id: m.id, autor: m.autor, tipo: m.tipo, texto: m.texto, criado_em: m.criado_em, status: m.status })),
        correcoes: cs.map(c => ({ id: c.id, criado_em: c.criado_em, ...c.detalhe })) })
    }
    return erro('ação desconhecida')
  } catch (e: any) { return erro(e.message, 500) }
}

export async function POST(req: Request) {
  if (!equipeOk(req)) return naoAutorizado()
  const b = await req.json().catch(() => ({}))
  const por = String(b.por || 'equipe').slice(0, 40)
  const local = db.modo() === 'local'
  try {
    switch (b.acao) {
      case 'corrigir': {
        let negocio_id = b.negocio_id ? String(b.negocio_id) : '', alvo = b.alvo as ap.Alvo
        if (b.peca_id) {
          const p = await db.um('pecas', { id: b.peca_id })
          if (!p) return erro('peça não existe')
          negocio_id = p.negocio_id
          if (!alvo) alvo = p.tipo === 'relatorio' || p.tipo === 'texto' ? 'sugestao' : 'peca'
        }
        if (b.conversa_id) {
          const cv = await db.um('conversas', { id: b.conversa_id })
          if (!cv) return erro('conversa não existe')
          if (negocio_id && negocio_id !== cv.negocio_id) return erro('essa conversa é de outro negócio')
          negocio_id = cv.negocio_id
          if (!alvo) alvo = 'resposta'
        }
        if (!negocio_id) return erro('falta o negócio')
        if (!['peca', 'resposta', 'sugestao'].includes(alvo)) return erro('alvo: peca, resposta ou sugestao')
        const e = await ap.registraCorrecao({ negocio_id, alvo, acao: b.acao_original || b.tipo || null, peca_id: b.peca_id || null, conversa_id: b.conversa_id || null, msg_id: b.msg_id ?? null, motivos: Array.isArray(b.motivos) ? b.motivos : [], livre: b.livre, certo: b.certo, por })
        return ok({ ok: true, id: e.id })
      }
      case 'propor': return ok({ novas: (await ap.propoeRegras({ negocio_id: b.negocio_id || null, por })).map(p => p.detalhe) })
      case 'decidir': return ok(await ap.decideProposta(String(b.id || ''), { decisao: b.decisao === 'aprovar' ? 'aprovar' : 'recusar', texto: b.texto, escopo: b.escopo, area: b.area, por }))
      case 'regra_nova': {
        const texto = String(b.texto || '').trim()
        if (texto.length < 5) return erro('escreve a regra')
        const escopo = b.escopo === 'geral' ? 'geral' : 'negocio'
        if (escopo === 'negocio' && !(await db.um('negocios', { id: b.negocio_id }))) return erro('negócio não existe')
        return ok(await ap.criaRegra({ texto: texto.slice(0, 400), area: ['criacao', 'atendimento', 'tudo'].includes(b.area) ? b.area : 'tudo', escopo, negocio_id: escopo === 'negocio' ? b.negocio_id : null, por }))
      }
      case 'regra_mudar': return ok(await ap.mudaRegra(String(b.id || ''), { ativa: b.ativa === undefined ? undefined : !!b.ativa, texto: b.texto, area: b.area, por }))
      case 'analisar': {
        const n = await db.um('negocios', { id: b.negocio_id })
        if (!n) return erro('negócio não existe')
        return ok(await ac.analisaDia(n, { forcar: true, agora: local && b.relogio ? new Date(b.relogio) : undefined }))
      }
      case 'acompanhar': {
        const n = await db.um('negocios', { id: b.negocio_id })
        if (!n) return erro('negócio não existe')
        const meta: any = { ...(n.meta || {}) }
        if ('acompanhar' in b) { if (b.acompanhar === true || b.acompanhar === false) meta.acompanhar = b.acompanhar; else delete meta.acompanhar }
        if (b.primeiras !== undefined) { const p = Math.round(Number(b.primeiras)); if (p >= 0 && p <= 50) meta.acompanhar_primeiras = p; else delete meta.acompanhar_primeiras }
        if (b.dias !== undefined) { const d = Math.round(Number(b.dias)); if (d >= 1 && d <= 365) meta.acompanhar_dias = d; else delete meta.acompanhar_dias }
        await db.atualiza('negocios', { id: n.id }, { meta })
        await db.evento('config_acompanhamento', n.id, { por, acompanhar: meta.acompanhar ?? null, primeiras: meta.acompanhar_primeiras ?? null, dias: meta.acompanhar_dias ?? null })
        return ok({ acompanhar: meta.acompanhar ?? null, primeiras: ac.limitePrimeiras({ meta }), dias: meta.acompanhar_dias ?? 30 })
      }
      // ---------- só no modo de teste ----------
      // um cliente "real" (conversa sem a marca de simulação) manda mensagem: passa pela entrada de verdade (recebeDoCliente,
      // onde está o gancho do aviso), SEM a resposta da IA. No modo local nada sai do computador
      case 'teste_cliente_real': {
        if (!local) return erro('só no modo de teste')
        const n = await db.um('negocios', { id: b.negocio_id })
        if (!n) return erro('negócio não existe')
        const { recebeDoCliente } = await import('@/lib/maia/atendente')
        const r = await recebeDoCliente(n, { telefone: String(b.telefone), nome: b.nome || null, texto: String(b.texto || 'oi') })
        // quando: faz de conta que a conversa e a mensagem chegaram nessa hora (pro teste da análise de ontem)
        if (r?.cv && b.quando) { const q = new Date(Date.parse(b.quando)).toISOString(); await db.atualiza('conversas', { id: r.cv.id }, { criado_em: q }); for (const m of await db.lista('msgs', { conversa_id: r.cv.id })) await db.atualiza('msgs', { id: m.id }, { criado_em: q }) }
        return ok({ conversa_id: r?.cv?.id, lead_id: r?.lead?.id })
      }
      case 'teste_msg': {
        if (!local) return erro('só no modo de teste')
        const cv = await db.um('conversas', { id: b.conversa_id })
        if (!cv) return erro('conversa não existe')
        const quando = new Date(b.quando ? Date.parse(b.quando) : Date.now() - (Number(b.minutos_atras) || 0) * 60e3).toISOString()
        const m = await db.insere('msgs', { conversa_id: cv.id, negocio_id: cv.negocio_id, autor: b.autor || 'maia', tipo: 'texto', texto: String(b.texto || ''), status: b.autor === 'cliente' ? 'recebido' : 'enviado', criado_em: quando })
        if (b.conversa_quando) await db.atualiza('conversas', { id: cv.id }, { criado_em: new Date(Date.parse(b.conversa_quando)).toISOString() })
        return ok(m)
      }
      case 'teste_rotina': {
        if (!local) return erro('só no modo de teste')
        return ok(await ac.rotinaAprendizado({ relogio: b.relogio ? new Date(b.relogio) : new Date(), forcar: !!b.forcar }))
      }
      // o texto das regras que entra no prompt de criação e no de atendimento (lido do negócio, como os prompts leem)
      case 'teste_prompt': {
        if (!local) return erro('só no modo de teste')
        const n = await db.um('negocios', { id: b.negocio_id })
        if (!n) return erro('negócio não existe')
        return ok({ criacao: ap.textoRegrasAprendidas(n, 'criacao'), atendimento: ap.textoRegrasAprendidas(n, 'atendimento'), regras_aprendidas: n.contexto?.regras_aprendidas || [] })
      }
      default: return erro('ação desconhecida')
    }
  } catch (e: any) { return erro(e.message, 500) }
}
