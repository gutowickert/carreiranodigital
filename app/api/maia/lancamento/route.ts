// Maia: a API da tela do LANÇAMENTO (15/11/2026), /maia/operacao/lancamento.html. A mesma senha do painel da equipe (x-senha).
//   GET  ?acao=lista                    → todos da lista com etapa, contadores e as filas (produzir, Rick, dúvidas, retomada à mão)
//   GET  ?acao=contato&id=              → um contato: coleta, conversa, fotos e vídeos (links pra baixar), as peças, a oficina
//   POST {acao,...}: etapa, rick_feito, duvida_resolvida, link_envio, definir_peca, legenda, gerar_oficina, usar_peca,
//        gerar_conversa, salvar_conversa, aprovar (agora: true = na hora do clique), zerar e remover (só a lista de teste, remessa 0),
//        adicionar (um contato à mão, ex.: o teste do time)
//   16/11 (entrega nova, MAIA_LANC_ENTREGA_V2): salvar_textos (frase da entrega, o que vimos, nome do negócio, cor), gerar_roteiros,
//        salvar_roteiros, marcar_logo, marcar_capa, salvar_grade, ligar_feito (a fila "Rick: ligar")
//   Só no modo de teste (MAIA_LOCAL=1): simular_entrada, rodar_rotina, relogio, chave_v2
import { maiaDb as db, maiaLocal } from '@/lib/maia/db'
import { equipeOk, naoAutorizado } from '@/lib/maia/acesso'
import { ETAPAS, ORDEM, contato as acha, salva, salvaJson, msgs, midias, novoContato, variantes, contatoDoTelefone, lancamentoLigado, entregaV2 } from '@/lib/maia/lancamento/base'
import { frasePadrao, lePontos, pontosTexto, leRoteiros, roteirosTexto, geraRoteiros } from '@/lib/maia/lancamento/conteudo'
import { atividade } from '@/lib/maia/lancamento/entrega'
import { SLOTS, definePeca, legendaPeca, linkEnvio, geraComOficina, pecasDaOficina, usaPecaDaOficina, geraConversa, leConversaTexto, aprova, linkAmostra, type Slot } from '@/lib/maia/lancamento/amostra'

export const maxDuration = 300
const ok = (d: any) => Response.json(d)
const erro = (m: string, s = 400) => Response.json({ erro: m }, { status: s })

function resumo(c: any) {
  const k = c.coleta || {}
  return {
    id: c.id, nome: c.nome, telefone: c.telefone, versao: c.versao, remessa: c.remessa, nota: c.nota, ramo: c.ramo, cidade: k.cidade || c.cidade,
    negocio: k.nome_negocio || k.negocio || null, etapa: c.etapa, entrega_em: c.entrega_em, entregue_em: c.entregue_em,
    aberturas: c.aberturas || 0, aberta_em: c.aberta_em, testou_em: c.testou_em, rick_pendente: !!(c.rick_pendente_em && !c.rick_feito_em),
    rick_motivo: c.estado?.rick_motivo || null, duvida: c.estado?.duvida || null, com_time: c.estado?.time_em || (c.estado?.humano ? c.estado?.humano?.em || true : null), retomada_a_mao: c.estado?.retomada?.como === 'a_mao' ? c.estado.retomada : null,
    pecas: SLOTS.filter(s => c.amostra?.pecas?.[s]).length, aprovada_em: c.amostra?.aprovada_em || null, falha: c.amostra?.falha || null,
    em_teste: c.estado?.modo === 'teste', ultima_entrada_em: c.ultima_entrada_em, atualizado_em: c.atualizado_em,
    // 16/11 (entrega nova): o que a pessoa fez (cartão do Rick), a resposta que foi pro time e a fila "Rick: ligar"
    atividade: atividade(c), rick_texto: c.estado?.rick_texto || null, entrega_v2: !!c.amostra?.entrega_v2,
    ligar: c.estado?.acomp?.ligar && !c.estado.acomp.ligar.feito_em ? c.estado.acomp.ligar : null,
    // 19/11 (tráfego): de onde veio, o nicho, o encaixe, o prazo prometido e a ligação marcada com o Rick
    origem: c.estado?.origem ? { canal: c.estado.origem.canal, fonte: c.estado.origem.fonte, campanha: c.estado.origem.campanha || null, anuncio: c.estado.origem.anuncio || c.estado.origem.titulo || null, anuncio_id: c.estado.origem.anuncio_id || null, janela_gratis_ate: c.estado.origem.janela_gratis_ate || null } : null,
    nicho: c.coleta?.nicho || null, encaixe: c.estado?.encaixe || null, prazo_em: c.estado?.prazo_em || null,
    ligacao: c.estado?.ligacao?.hora && !c.estado.ligacao.feita_em ? c.estado.ligacao.hora : null,
  }
}

export async function GET(req: Request) {
  if (!equipeOk(req)) return naoAutorizado()
  const u = new URL(req.url), q = (k: string) => u.searchParams.get(k) || ''
  try {
    if (q('acao') === 'contato') {
      const c = await acha(q('id'))
      if (!c) return erro('não achei', 404)
      const [ms, md, of] = await Promise.all([msgs(c.id), midias(c.id), pecasDaOficina(c)])
      const pecas: any = {}
      for (const s of SLOTS) { const p = c.amostra?.pecas?.[s]; if (p) pecas[s] = { ...p, url: await db.link(p.path) } }
      return ok({
        ...resumo(c), coleta: c.coleta || {}, estado: c.estado || {}, motivo: c.motivo, nome_crm: c.nome_crm, motivo_perda: c.motivo_perda,
        link: c.token ? linkAmostra(c) : null, previa: c.token ? `/maia/amostra/${c.token}?previa=1` : null,
        conversa_pronta: c.amostra?.conversa || null, retomada_pronta: c.amostra?.retomada || null, pecas,
        nova: {
          frase_entrega: c.amostra?.frase_entrega || '', frase_padrao: frasePadrao(c), vimos: pontosTexto(c.amostra?.vimos || []), roteiros: roteirosTexto(c.amostra?.roteiros || []),
          nome_negocio: c.coleta?.nome_negocio || '', cor: c.amostra?.cor || '', logo: c.amostra?.logo || null, capa: c.amostra?.capa || null, grade: c.amostra?.grade || [], acomp: c.estado?.acomp || {},
        },
        msgs: ms.slice(-200).map(m => ({ direcao: m.direcao, autor: m.autor, tipo: m.tipo, texto: m.texto, ok: m.ok, erro: m.erro, em: m.criado_em })),
        midias: await Promise.all(md.map(async m => ({ id: m.id, tipo: m.tipo, origem: m.origem, mime: m.mime, em: m.criado_em, path: m.path, url: await db.link(m.path) }))),
        oficina: of,
      })
    }
    // 19/11 (tráfego): o funil de quem veio do anúncio, por nicho e por anúncio
    if (q('acao') === 'trafego') { const { funilTrafego } = await import('@/lib/maia/lancamento/trafego'); return ok({ ok: true, ...funilTrafego(await db.lista('lanc_contatos'), ORDEM) }) }
    // a lista toda
    const todos = await db.lista('lanc_contatos')
    const lista = todos.map(resumo).sort((a, b) => String(b.ultima_entrada_em || b.atualizado_em || '').localeCompare(String(a.ultima_entrada_em || a.atualizado_em || '')))
    const conta: Record<string, number> = Object.fromEntries(ETAPAS.map(e => [e.chave, 0]))
    for (const c of lista) conta[c.etapa] = (conta[c.etapa] || 0) + 1
    // "chegou até" cada etapa (o funil): quem está nela ou depois (fora Agora não e Perdido)
    const chegou: Record<string, number> = {}
    for (const e of ETAPAS.slice(0, ORDEM.pago + 1)) chegou[e.chave] = lista.filter(c => ORDEM[c.etapa] >= ORDEM[e.chave] && ORDEM[c.etapa] <= ORDEM.pago).length
    return ok({
      ligado: lancamentoLigado(), v2: entregaV2(), modo: db.modo(), etapas: ETAPAS, conta, chegou, total: lista.length,
      abriram: lista.filter(c => c.aberta_em).length, testaram: lista.filter(c => c.testou_em).length,
      lista,
    })
  } catch (e: any) { return erro(String(e?.message || e), 500) }
}

export async function POST(req: Request) {
  if (!equipeOk(req)) return naoAutorizado()
  const b = await req.json().catch(() => ({} as any))
  const por = String(b.por || 'equipe').slice(0, 40)
  try {
    // ---- só no modo de teste ----
    if (b.acao === 'simular_entrada' || b.acao === 'rodar_rotina' || b.acao === 'chave_v2' || b.acao === 'simular_time') {
      if (!maiaLocal()) return erro('só no modo de teste', 403)
      // 16/11: o time respondendo pela caixa do CRM (o mesmo que o responder da escola chama)
      if (b.acao === 'simular_time') { const { timeFalou } = await import('@/lib/maia/lancamento/base'); return ok({ ok: true, id: await timeFalou(b.telefone, b.texto ?? null) }) }
      // liga e desliga a entrega nova no servidor de teste (na Vercel é a variável MAIA_LANC_ENTREGA_V2)
      if (b.acao === 'chave_v2') {
        if (b.ligar) process.env.MAIA_LANC_ENTREGA_V2 = '1'; else delete process.env.MAIA_LANC_ENTREGA_V2
        // os nomes dos modelos (fora das 24 h), pra testar o caminho do modelo: { ENTREGA: 'x', REENVIO: 'y', ... }; null apaga
        for (const [k, v] of Object.entries(b.modelos || {})) { if (!/^[A-Z_]+$/.test(k)) continue; if (v) process.env['MAIA_LANC_MODELO_' + k] = String(v); else delete process.env['MAIA_LANC_MODELO_' + k] }
        return ok({ ok: true, v2: entregaV2() })
      }
      if (b.acao === 'rodar_rotina') { const { rotinaLancamento } = await import('@/lib/maia/lancamento/rotina'); return ok(await rotinaLancamento(b.relogio ? new Date(b.relogio) : new Date())) }
      const { entrada, processa } = await import('@/lib/maia/lancamento/conversa')
      const r = await entrada({ telefone: b.telefone, nome: b.nome || null, tipo: b.tipo || 'texto', texto: b.texto ?? null, midia_id: b.midia_id || null, mime: b.mime || null, b64: b.b64 || null, referral: b.referral || null })
      if (!r.tratado) return ok({ tratado: false })
      const p = await processa(r.contato_id!, r.msg_id!)
      return ok({ tratado: true, ...p })
    }
    if (b.acao === 'adicionar') {
      const tel = variantes(String(b.telefone || ''))[0]
      if (!tel || tel.length < 12) return erro('telefone inválido')
      if (await contatoDoTelefone(tel)) return erro('esse telefone já está na lista')
      const c = await novoContato({ telefone: tel, nome: String(b.nome || '').slice(0, 60) || null, versao: b.versao === 'aluno' ? 'aluno' : 'contato', remessa: Number.isFinite(+b.remessa) ? +b.remessa : 0, motivo: String(b.motivo || 'adicionado à mão').slice(0, 200) })
      return ok({ ok: true, id: c.id })
    }
    const c = await acha(String(b.id || ''))
    if (!c) return erro('contato não existe', 404)
    switch (b.acao) {
      case 'etapa': {
        if (!ETAPAS.some(e => e.chave === b.etapa)) return erro('etapa inválida')
        await salva(c, { etapa: b.etapa, ...(b.motivo != null ? { motivo_perda: String(b.motivo).slice(0, 300) } : {}) })
        return ok({ ok: true })
      }
      case 'rick_feito': await salva(c, { rick_feito_em: new Date().toISOString() }); await salvaJson(c, 'estado', { rick_por: por }); return ok({ ok: true })
      case 'duvida_resolvida': await salvaJson(c, 'estado', { duvida: null, humano: null }); return ok({ ok: true })   // 16/11: a dúvida foi respondida
      // 16/11 (Nando): o time termina e devolve a pessoa pra Maia (tira o "com o time", o pedido de humano e a dúvida)
      case 'devolver': {
        await salvaJson(c, 'estado', { time_em: null, humano: null, duvida: null })
        // 17/11: "Devolver e responder": a Maia responde agora o que a pessoa mandou enquanto estava com o time
        if (!b.responder) return ok({ ok: true })
        const { respondePendentes } = await import('@/lib/maia/lancamento/conversa')
        return ok({ ok: true, respondeu: await respondePendentes((await acha(c.id)) || c) })
      }
      // 17/11 (Nando, Indiara): amostra de OUTRO negócio da mesma pessoa (a de antes fica guardada) e a Maia recomeça as perguntas
      case 'nova_amostra': {
        const { novaAmostra } = await import('@/lib/maia/lancamento/conversa')
        return ok(await novaAmostra(c, String(b.sobre || '').slice(0, 80)))
      }
      case 'retomada_feita': await salvaJson(c, 'estado', { retomada: { ...(c.estado?.retomada || {}), como: 'a_mao_feita' } }); return ok({ ok: true })
      case 'link_envio': return ok(await linkEnvio(c, String(b.mime || '')))
      case 'definir_peca': {
        const caminho = String(b.caminho || '')
        if (!caminho.startsWith(`lanc-${c.id}/`)) return erro('caminho inválido')
        if (!(await db.existe(caminho))) return erro('o arquivo não chegou no armazenamento')
        return ok({ ok: true, pecas: await definePeca(c, b.slot as Slot, { path: caminho, mime: String(b.mime || ''), legenda: b.legenda ?? null, origem: 'equipe' }) })
      }
      case 'legenda': await legendaPeca(c, b.slot as Slot, String(b.legenda || '')); return ok({ ok: true })
      case 'gerar_oficina': return ok({ ok: true, ...(await geraComOficina(c)) })
      case 'usar_peca': return ok({ ok: true, pecas: await usaPecaDaOficina(c, String(b.peca_id || ''), b.slot as Slot) })
      case 'gerar_conversa': return ok({ ok: true, ...(await geraConversa(c)) })
      case 'salvar_conversa': {
        const r = leConversaTexto(String(b.texto || ''))
        if (r.conversa.length < 2) return erro('escreve pelo menos 2 falas, cada uma começando com "Cliente:" ou "Maia:"')
        await salvaJson(c, 'amostra', { conversa: r.conversa, ...(r.retomada ? { retomada: r.retomada } : {}) })
        return ok({ ok: true })
      }
      case 'aprovar': await salvaJson(c, 'estado', { time_em: null, humano: null }); return ok(await aprova(c, { agora: !!b.agora, por }))   // aprovar a amostra devolve pra Maia (é ela que entrega)
      // ---- 16/11: a entrega nova (os textos da página e da entrega, os roteiros, a logo, a capa e a grade) ----
      case 'salvar_textos': {
        if (b.frase_entrega != null) await salvaJson(c, 'amostra', { frase_entrega: String(b.frase_entrega).trim().slice(0, 600) })
        if (b.vimos != null) {
          const pts = lePontos(String(b.vimos))
          if (String(b.vimos).trim() && !pts.length) return erro('escreve um ponto por linha: o que vimos → oportunidade')
          await salvaJson(c, 'amostra', { vimos: pts })
        }
        if (b.cor != null) { const cor = String(b.cor).trim(); if (cor && !/^#[0-9a-f]{6}$/i.test(cor)) return erro('a cor é no formato #e8202e'); await salvaJson(c, 'amostra', { cor: cor || null }) }
        if (b.nome_negocio != null) await salvaJson(c, 'coleta', { nome_negocio: String(b.nome_negocio).trim().slice(0, 60) || null })
        return ok({ ok: true })
      }
      case 'gerar_roteiros': { const r = await geraRoteiros(c); await salvaJson(c, 'amostra', { roteiros: r }); return ok({ ok: true, roteiros: r, texto: roteirosTexto(r) }) }
      case 'salvar_roteiros': {
        const r = leRoteiros(String(b.texto || ''))
        if (!r.length) return erro('escreve pelo menos 1 roteiro: "# título | quando" e as cenas "tempo | parte | o que filmar | a fala"')
        await salvaJson(c, 'amostra', { roteiros: r })
        return ok({ ok: true, roteiros: r.length })
      }
      case 'marcar_logo': case 'marcar_capa': {
        const campo = b.acao === 'marcar_logo' ? 'logo' : 'capa'
        if (!b.midia_id) { await salvaJson(c, 'amostra', { [campo]: null }); return ok({ ok: true }) }
        const m = (await midias(c.id)).find(x => x.id === b.midia_id)
        if (!m || m.tipo !== 'foto') return erro('foto não é desse contato')
        await salvaJson(c, 'amostra', { [campo]: m.path })
        return ok({ ok: true })
      }
      case 'salvar_grade': {
        const ms = await midias(c.id)
        const itens = (Array.isArray(b.itens) ? b.itens : []).slice(0, 9).map((x: any) => ({ m: ms.find(y => y.id === x.midia_id && y.tipo === 'foto'), titulo: String(x.titulo || '').slice(0, 40), tipo: String(x.tipo || '').toLowerCase().replace(/[^a-zà-ú ]/g, '').trim().slice(0, 15) || 'produto' }))
        if (itens.some((x: any) => !x.m)) return erro('foto não é desse contato')
        if (itens.length && itens.length < 3) return erro('a grade precisa de pelo menos 3 fotos (ou nenhuma)')
        await salvaJson(c, 'amostra', { grade: itens.map((x: any) => ({ path: x.m.path, titulo: x.titulo, tipo: x.tipo })) })
        return ok({ ok: true, grade: itens.length })
      }
      case 'ligacao_feita': { const lg = c.estado?.ligacao || {}; await salvaJson(c, 'estado', { ligacao: { ...lg, feita_em: new Date().toISOString(), por } }); return ok({ ok: true }) }   // 19/11: o Rick ligou
      case 'ligar_feito': { const a = c.estado?.acomp || {}; await salvaJson(c, 'estado', { acomp: { ...a, ligar: { ...(a.ligar || {}), feito_em: new Date().toISOString(), por } } }); return ok({ ok: true }) }
      case 'zerar': {
        if (c.remessa !== 0) return erro('só dá pra zerar quem está na lista de teste (remessa 0)')
        for (const m of await msgs(c.id)) await db.apaga('lanc_msgs', { id: m.id })
        for (const m of await midias(c.id)) await db.apaga('lanc_midias', { id: m.id })
        for (const pasta of ['midias', 'pecas']) await db.apagaPasta(`lanc-${c.id}/${pasta}`).catch(() => 0)
        await salva(c, { etapa: 'na_lista', coleta: {}, estado: {}, amostra: {}, entrega_em: null, entregue_em: null, aberturas: 0, aberta_em: null, testou_em: null, rick_pendente_em: null, rick_feito_em: null, disparado_em: null, motivo_perda: null, negocio_id: null })
        return ok({ ok: true })
      }
      case 'remover': {
        // tira da lista (só o teste do time): o número volta a ser atendido como antes (o assistente do time, no caso do Guto)
        if (c.remessa !== 0) return erro('só dá pra tirar da lista quem está no teste do time (remessa 0)')
        for (const m of await msgs(c.id)) await db.apaga('lanc_msgs', { id: m.id })
        for (const m of await midias(c.id)) await db.apaga('lanc_midias', { id: m.id })
        for (const pasta of ['midias', 'pecas']) await db.apagaPasta(`lanc-${c.id}/${pasta}`).catch(() => 0)
        await db.apaga('lanc_contatos', { id: c.id })
        return ok({ ok: true })
      }
      default: return erro('ação desconhecida')
    }
  } catch (e: any) { return erro(String(e?.message || e), 400) }
}
