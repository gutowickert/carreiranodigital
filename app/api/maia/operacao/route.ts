// Maia: a API do painel de operação da equipe (03/11). Senha no cabeçalho x-senha (lib/maia/acesso.ts).
//   GET  ?acao=resumo | negocios | negocio&id= | fila | pecas&negocio= | leads&negocio= | conversas&negocio= | msgs&conversa= | campanhas&negocio= | numeros&negocio=&de=&ate=
//   POST {acao, ...}: criar_negocio, atualizar_negocio, gerar_anuncios, aprovar_peca, ajustar_peca, descartar_peca, pedir_joinha,
//        criar_campanha, ativar_campanha, pausar_campanha, lead_novo, lead_etapa, lead_ganho, lead_perdido,
//        mandar_ao_dono, assumir, devolver, simular_dono, simular_cliente, rodar_rotina,
//        link_conectar, atendimento_clientes, criar_modelo_dono (05/11). GET também: modelos, chamadas
//   06/11 (demonstração grátis): GET amostras · POST simular_demo, rodar_demo, teste_demo_sumiu (só no modo de teste)
import { maiaDb as db } from '@/lib/maia/db'
import { equipeOk, naoAutorizado } from '@/lib/maia/acesso'
import { equipeAprova, equipeAjuste, descarta, pedeJoinha } from '@/lib/maia/aprovacao'
import { geraAnuncios } from '@/lib/maia/pecas'
import { criaCampanhaPausada, ativa, pausa, metaReal } from '@/lib/maia/meta'
import { novoLead, mudaEtapa, ganhou, perdeu, numeros, type Etapa } from '@/lib/maia/funil'
import { conversaDoDono, mandaTexto } from '@/lib/maia/canal'
import { comoDono, comoCliente } from '@/lib/maia/simula'
import { roda } from '@/lib/maia/rotina'
import { fone } from '@/lib/oito/wa'
import { ehDemo, painelAmostras, vagasDaSemana } from '@/lib/maia/demo-amostra'
import { cifra, semChaves } from '@/lib/maia/segredo'

export const maxDuration = 300
const ok = (d: any) => Response.json(d)
const erro = (m: string, s = 400) => Response.json({ erro: m }, { status: s })

async function comLinks(pecas: any[]) {
  return Promise.all(pecas.map(async p => ({ ...p, arquivo_url: await db.link(p.arquivo_path) })))
}

// as chaves do negócio (WhatsApp e social) nunca saem pro painel (07/11: a do social também)
const semChave = semChaves
// o meta que veio do painel, sem deixar ele trocar nem apagar as chaves guardadas: a do WhatsApp só vem da conexão;
// a do social só muda se vier uma nova de verdade (e vai cifrada)
function metaSeguro(novo: any, atual: any) {
  const m: any = { ...(novo || {}) }
  if (atual?.wa) m.wa = atual.wa; else delete m.wa
  // 07/11 (piloto): o jeito de atender (tom, aviso de privacidade, franquia, fuso) só muda pela ação config_atendimento
  if (atual?.atendimento) m.atendimento = atual.atendimento; else delete m.atendimento
  const st = typeof m.social_token === 'string' ? m.social_token.trim() : ''
  if (st && st !== '(guardada)') m.social_token = cifra(st)
  else if (atual?.social_token) m.social_token = atual.social_token
  else delete m.social_token
  return m
}

export async function GET(req: Request) {
  if (!equipeOk(req)) return naoAutorizado()
  const u = new URL(req.url), q = (k: string) => u.searchParams.get(k) || ''
  const acao = q('acao') || 'resumo'
  try {
    if (acao === 'resumo') {
      const [todosNegs, todasPecas, leads, camps] = await Promise.all([db.lista('negocios'), db.lista('pecas'), db.lista('leads'), db.lista('campanhas')])
      // 06/11: as amostras da demonstração moram em negócios marcados (contexto.demo): contam só no que é da equipe aprovar
      const demo = new Set(todosNegs.filter(ehDemo).map(n => n.id))
      const negs = todosNegs.filter(n => !demo.has(n.id)), pecas = todasPecas.filter(p => !demo.has(p.negocio_id))
      const semana = new Date(Date.now() - 7 * 86400e3).toISOString()
      return ok({
        modo: db.modo(), meta_real: metaReal(),
        negocios: negs.length, ativos: negs.filter(n => n.status === 'ativo').length,
        pra_equipe: todasPecas.filter(p => p.status === 'revisao_equipe').length,
        amostras_semana: await vagasDaSemana(),
        com_dono: pecas.filter(p => p.status === 'com_dono').length,
        pra_ligar: pecas.filter(p => p.status === 'aprovada' && (p.tipo === 'anuncio_imagem' || p.tipo === 'anuncio_video') && !p.campanha_id).length,
        campanhas_pausadas: camps.filter(c => c.status === 'criada_pausada').length,
        campanhas_ativas: camps.filter(c => c.status === 'ativa').length,
        leads_semana: leads.filter(l => l.criado_em >= semana).length,
        vendas_semana: leads.filter(l => l.ganho_em && l.ganho_em >= semana).length,
        receita_semana: leads.filter(l => l.ganho_em && l.ganho_em >= semana).reduce((s, l) => s + (Number(l.valor) || 0), 0),
        retomadas_vencidas: leads.filter(l => l.proximo_followup_em && l.proximo_followup_em <= new Date().toISOString() && !['ganho', 'perdido'].includes(l.etapa)).length,
      })
    }
    if (acao === 'negocios') {
      const [negs, pecas, leads] = await Promise.all([db.lista('negocios', {}, { ordem: 'criado_em', desc: true }), db.lista('pecas'), db.lista('leads')])
      return ok(negs.filter(n => !ehDemo(n)).map(n => ({ ...semChave(n), pra_equipe: pecas.filter(p => p.negocio_id === n.id && p.status === 'revisao_equipe').length, leads: leads.filter(l => l.negocio_id === n.id).length, ganhos: leads.filter(l => l.negocio_id === n.id && l.etapa === 'ganho').length })))
    }
    if (acao === 'negocio') return ok(semChave(await db.um('negocios', { id: q('id') })))
    // 05/11: situação dos modelos de mensagem (do número da Maia, ou de um negócio com ?negocio=) e o placar das 500 chamadas
    if (acao === 'modelos') {
      const { statusModelos } = await import('@/lib/maia/modelos')
      const { waDoNegocio } = await import('@/lib/maia/wa-negocio')
      const n = q('negocio') ? await db.um('negocios', { id: q('negocio') }) : null
      const w = n ? waDoNegocio(n) : null
      return ok(await statusModelos(w && w.waba ? { token: w.token, waba: w.waba } : null))
    }
    if (acao === 'custo_ia') { const { custoIA } = await import('@/lib/maia/custo'); return ok(await custoIA(+(q('dias') || 30))) }
    // 07/11 (piloto): conversas do mês x franquia e custo de IA do mês (um negócio com ?negocio=, ou todos)
    if (acao === 'uso_mes') {
      const { usoDoMes } = await import('@/lib/maia/uso')
      if (q('negocio')) { const n = await db.um('negocios', { id: q('negocio') }); return n ? ok(await usoDoMes(n)) : erro('negócio não existe', 404) }
      const negs = (await db.lista('negocios')).filter(n => !ehDemo(n) && n.status !== 'cancelado')
      return ok(await Promise.all(negs.map(n => usoDoMes(n))))
    }
    if (acao === 'chamadas') { const { placarChamadas } = await import('@/lib/maia/chamadas'); return ok(await placarChamadas()) }
    if (acao === 'fila') {
      const negs = await db.lista('negocios'), nome = (id: string) => negs.find(n => n.id === id)?.nome || '?'
      // 06/11: a peça de amostra da demonstração vai marcada, com o nome do lead
      const demo = (id: string) => { const n = negs.find(x => x.id === id); return ehDemo(n) ? { lead: n!.contexto.demo.lead, telefone: n!.contexto.demo.telefone, entrega: n!.contexto.demo.entrega } : null }
      const pecas = (await db.lista('pecas', {}, { ordem: 'criado_em' })).filter(p => ['revisao_equipe', 'gerando', 'ajuste_equipe', 'ajuste_dono', 'erro'].includes(p.status))
      return ok((await comLinks(pecas)).map(p => ({ ...p, negocio_nome: nome(p.negocio_id), demo: demo(p.negocio_id) })))
    }
    if (acao === 'amostras') return ok(await painelAmostras())
    if (acao === 'pecas') return ok(await comLinks(await db.lista('pecas', { negocio_id: q('negocio') }, { ordem: 'criado_em', desc: true })))
    if (acao === 'leads') return ok(await db.lista('leads', { negocio_id: q('negocio') }, { ordem: 'atualizado_em', desc: true }))
    if (acao === 'conversas') return ok(await db.lista('conversas', { negocio_id: q('negocio') }, { ordem: 'ultima_msg_em', desc: true }))
    if (acao === 'msgs') return ok(await db.lista('msgs', { conversa_id: q('conversa') }, { ordem: 'criado_em' }))
    if (acao === 'campanhas') return ok(await db.lista('campanhas', { negocio_id: q('negocio') }, { ordem: 'criado_em', desc: true }))
    if (acao === 'numeros') {
      const ate = q('ate') || new Date().toISOString(), de = q('de') || new Date(Date.now() - 30 * 86400e3).toISOString()
      return ok(await numeros(q('negocio'), de, ate))
    }
    return erro('ação desconhecida')
  } catch (e: any) { return erro(e.message, 500) }
}

export async function POST(req: Request) {
  if (!equipeOk(req)) return naoAutorizado()
  const b = await req.json().catch(() => ({}))
  const por = String(b.por || 'equipe')
  try {
    switch (b.acao) {
      case 'criar_negocio': {
        if (!b.nome || !b.dono_whatsapp) return erro('nome e WhatsApp do dono são obrigatórios')
        const n = await db.insere('negocios', {
          nome: b.nome, nicho: b.nicho || null, cidade: b.cidade || null, regiao: b.regiao || (b.cidade ? b.cidade + ' e região' : null),
          dono_nome: b.dono_nome || null, dono_whatsapp: fone(b.dono_whatsapp), plano: b.plano === 'completa' ? 'completa' : 'essencial',
          contexto: b.contexto || {}, marca: b.marca || {}, meta: metaSeguro(b.meta, null), verba_dia: b.verba_dia || null,
        })
        await db.evento('negocio_criado', n.id, { por })
        return ok(semChave(n))
      }
      case 'atualizar_negocio': {
        const campos: any = {}
        for (const k of ['nome', 'nicho', 'cidade', 'regiao', 'dono_nome', 'plano', 'status', 'contexto', 'marca', 'meta', 'verba_dia', 'aprovacao_equipe', 'ativa_sozinha', 'equipe_whatsapp']) if (k in b) campos[k] = b[k]
        if (b.dono_whatsapp) campos.dono_whatsapp = fone(b.dono_whatsapp)
        // 05/11: a conexão do WhatsApp (com a chave) não vem do painel: mantém a que está guardada
        if ('meta' in campos) { const atual = await db.um('negocios', { id: b.id }); campos.meta = metaSeguro(campos.meta, atual?.meta) }
        return ok(semChave((await db.atualiza('negocios', { id: b.id }, campos))[0]))
      }
      case 'gerar_anuncios': return ok(await geraAnuncios(await db.um('negocios', { id: b.negocio_id }), { quantidade: b.quantidade, tema: b.tema, midia_ids: b.midia_ids }))
      case 'aprovar_peca': return ok(await equipeAprova(b.peca_id, por))
      case 'ajustar_peca': if (!b.nota) return erro('escreve o ajuste'); return ok(await equipeAjuste(b.peca_id, b.nota, por))
      case 'descartar_peca': return ok(await descarta(b.peca_id, por))
      case 'pedir_joinha': await pedeJoinha(b.negocio_id); return ok({ ok: true })
      case 'criar_campanha': return ok(await criaCampanhaPausada(b.negocio_id, { peca_ids: b.peca_ids, verba_dia: b.verba_dia, raio_km: b.raio_km, idade_min: b.idade_min, idade_max: b.idade_max, por }))
      case 'ativar_campanha': return ok(await ativa(b.campanha_id, por))
      case 'pausar_campanha': return ok(await pausa(b.campanha_id, por))
      case 'lead_novo': return ok(await novoLead(b.negocio_id, { nome: b.nome, telefone: b.telefone, origem: b.origem || 'outro', produto: b.produto }, 'equipe'))
      case 'lead_etapa': { const l = await db.um('leads', { id: b.lead_id }); return ok(await mudaEtapa(l, b.etapa as Etapa, 'equipe', { valor: b.valor, produto: b.produto })) }
      case 'lead_ganho': { const l = await db.um('leads', { id: b.lead_id }); return ok(await ganhou(l, b.valor, b.produto, 'equipe')) }
      case 'lead_perdido': { const l = await db.um('leads', { id: b.lead_id }); return ok(await perdeu(l, b.motivo || 'sem motivo', 'equipe')) }
      case 'mandar_ao_dono': {
        const neg = await db.um('negocios', { id: b.negocio_id }); const cv = await conversaDoDono(neg)
        return ok(await mandaTexto(cv, String(b.texto || ''), 'equipe'))
      }
      // 07/11 (piloto): a equipe responde o cliente pelo WhatsApp do negócio. Depois de 24 h vai pelo modelo maia_resposta (fila)
      case 'mandar_ao_cliente': {
        const cv = await db.um('conversas', { id: b.conversa_id })
        if (!cv || cv.canal !== 'cliente') return erro('conversa de cliente não existe')
        if (b.negocio_id && cv.negocio_id !== b.negocio_id) return erro('essa conversa é de outro negócio')
        const t = String(b.texto || '').trim()
        if (!t) return erro('escreve a mensagem')
        const { mandaRespostaCliente } = await import('@/lib/maia/canal')
        const r = await mandaRespostaCliente(cv, t, 'equipe')
        // a equipe respondeu: a pergunta que esperava o dono não precisa mais de lembrete
        if (cv.lead_id) await db.insere('lead_eventos', { negocio_id: cv.negocio_id, lead_id: cv.lead_id, tipo: 'pergunta_respondida', autor: 'equipe', detalhe: { como: r.como } })
        return ok(r)
      }
      // 07/11 (piloto): assumir anota quando (a conversa volta pra Maia sozinha depois de 24 h sem o dono/equipe falar)
      case 'assumir': { const [c] = await db.atualiza('conversas', { id: b.conversa_id }, { modo: 'humano' }); if (c) await db.evento('modo_humano', c.negocio_id, { conversa_id: c.id, por }); return ok(c) }
      case 'devolver': { const [c] = await db.atualiza('conversas', { id: b.conversa_id }, { modo: 'ia' }); if (c) await db.evento('conversa_devolvida', c.negocio_id, { conversa_id: c.id, motivo: 'painel', por }); return ok(c) }
      // só no modo de teste: faz de conta que a conversa foi assumida há 25 h
      case 'teste_humano_antigo': {
        if (db.modo() !== 'local') return erro('só no modo de teste')
        const antes = new Date(Date.now() - 25 * 3600e3).toISOString()
        for (const e of (await db.lista('eventos', { tipo: 'modo_humano' })).filter(e => e.detalhe?.conversa_id === b.conversa_id)) await db.atualiza('eventos', { id: e.id }, { criado_em: antes })
        for (const m of (await db.lista('msgs', { conversa_id: b.conversa_id })).filter(m => m.autor === 'dono' || m.autor === 'equipe')) await db.atualiza('msgs', { id: m.id }, { criado_em: antes })
        return ok({ ok: true })
      }
      // só no modo de teste: faz as perguntas pro dono ficarem velhas (h horas)
      case 'teste_pergunta_antiga': {
        if (db.modo() !== 'local') return erro('só no modo de teste')
        const antes = new Date(Date.now() - (Number(b.horas) || 4) * 3600e3).toISOString()
        const ps = (await db.lista('lead_eventos', { negocio_id: b.negocio_id, tipo: 'pergunta_cliente' }))
        for (const e of ps) await db.atualiza('lead_eventos', { id: e.id }, { criado_em: antes })
        return ok({ perguntas: ps.length })
      }
      case 'simular_dono': {
        const arquivo = b.arquivo_b64 ? { buf: Buffer.from(b.arquivo_b64, 'base64'), mime: b.mime || 'image/jpeg', legenda: b.legenda } : undefined
        return ok(await comoDono(b.negocio_id, { texto: b.texto, arquivo, reacao: b.reacao }))
      }
      case 'simular_cliente': {
        // 07/11 (piloto): áudio ou foto do cliente simulado (arquivo_b64 + mime). `simulado` (transcrição/descrição de mentira) só vale no modo de teste
        const arquivo = b.arquivo_b64 ? { buf: Buffer.from(b.arquivo_b64, 'base64'), mime: b.mime || 'image/jpeg', legenda: b.legenda, simulado: b.simulado || null } : undefined
        return ok(await comoCliente(b.negocio_id, { telefone: b.telefone || '5500011112222', nome: b.nome, texto: b.texto || '', anuncio: b.anuncio || (b.origem === 'anuncio' ? 'simulado' : null), arquivo }))
      }
      // 05/11 (Tech Provider): o link que o dono abre pra conectar o WhatsApp do negócio
      case 'link_conectar': {
        const { assinaLink } = await import('@/lib/maia/conectar')
        const base = process.env.MAIA_URL_PUBLICA || new URL(req.url).origin
        return ok({ link: `${base}/maia/conectar?n=${b.negocio_id}&t=${assinaLink(b.negocio_id)}`, vale_dias: 14 })
      }
      // liga ou desliga o atendimento dos clientes pelo WhatsApp do negócio (começa desligado depois de conectar)
      case 'atendimento_clientes': {
        const n = await db.um('negocios', { id: b.negocio_id })
        if (!n) return erro('negócio não existe')
        if (b.ligado && !n.wa_phone_id) return erro('o WhatsApp desse negócio ainda não foi conectado')
        await db.atualiza('negocios', { id: n.id }, { meta: { ...(n.meta || {}), wa: { ...(n.meta?.wa || {}), atende: !!b.ligado } } })
        await db.evento(b.ligado ? 'atendimento_ligado' : 'atendimento_desligado', n.id, { por: b.por || null })
        return ok({ atende: !!b.ligado, chave_geral: process.env.MAIA_CLIENTES_LIGADO === '1' })
      }
      // 07/11 (piloto): o jeito de atender os clientes do negócio (fica em meta.atendimento; sem coluna nova)
      case 'config_atendimento': {
        const n = await db.um('negocios', { id: b.negocio_id })
        if (!n) return erro('negócio não existe')
        const { tomValido } = await import('@/lib/maia/tom')
        const at: any = { ...(n.meta?.atendimento || {}) }
        if (b.tom) at.tom = tomValido(b.tom)
        if (b.franquia !== undefined) { const f = Math.round(Number(b.franquia)); if (f > 0) at.franquia = f; else delete at.franquia }
        await db.atualiza('negocios', { id: n.id }, { meta: { ...(n.meta || {}), atendimento: at } })
        await db.evento('config_atendimento', n.id, { por, mudou: Object.keys(b).filter(k => !['acao', 'negocio_id', 'por'].includes(k)) })
        return ok({ atendimento: at })
      }
      case 'criar_modelo_dono': { const { criaModeloDoDono } = await import('@/lib/maia/modelos'); return ok(await criaModeloDoDono()) }
      // 07/11 (piloto): `relogio` (a hora da janela das 9h às 20h) só vale no modo de teste
      case 'rodar_rotina': return ok(await roda({ forcarRelatorio: !!b.forcar_relatorio, relogio: db.modo() === 'local' && b.relogio && !isNaN(Date.parse(b.relogio)) ? new Date(b.relogio) : undefined }))
      // só no modo de teste: faz as retomadas marcadas vencerem agora, pra testar o follow-up sem esperar dias
      case 'teste_vencer_retomadas': {
        if (db.modo() !== 'local') return erro('só no modo de teste')
        const ls = (await db.lista('leads')).filter(l => l.proximo_followup_em)
        for (const l of ls) await db.atualiza('leads', { id: l.id }, { proximo_followup_em: new Date(Date.now() - 60e3).toISOString() })
        return ok({ vencidas: ls.length })
      }
      // 07/11 (piloto), só no modo de teste: fecha a janela de 24 h de uma conversa e anota o status dos modelos do negócio
      case 'teste_fechar_janela': {
        if (db.modo() !== 'local') return erro('só no modo de teste')
        await db.atualiza('conversas', { id: b.conversa_id }, { janela_ate: new Date(Date.now() - 3600e3).toISOString() })
        return ok({ ok: true })
      }
      case 'teste_modelos_status': {
        if (db.modo() !== 'local') return erro('só no modo de teste')
        await db.evento('modelos_status', b.negocio_id, b.status || {})
        return ok({ ok: true })
      }
      // 06/11: a demonstração grátis simulada (telefone 55000..., nada sai pra Meta), pelo mesmo caminho do webhook do Oito
      case 'simular_demo': {
        const tel = String(b.telefone || '').replace(/\D/g, '')
        if (!/^55000\d{6,}$/.test(tel)) return erro('telefone de simulação começa com 55000')
        const { recebe } = await import('@/lib/oito/entrada')
        const { atendeConversa } = await import('@/lib/oito/vendedor')
        const { oitoDb } = await import('@/lib/oito/db')
        const arquivo = b.arquivo_b64 ? { buf: Buffer.from(b.arquivo_b64, 'base64'), mime: b.mime || 'image/jpeg' } : undefined
        const tipo = arquivo ? (/^video\//.test(arquivo.mime) ? 'video' : 'image') : 'text'
        const m: any = {
          id: 'sim-in-' + crypto.randomUUID(), from: tel, type: tipo,
          ...(tipo === 'text' ? { text: { body: String(b.texto || '') } } : tipo === 'video' ? { video: { caption: b.texto || '' } } : { image: { caption: b.texto || '' } }),
          ...(b.anuncio ? { referral: { source_type: 'ad', source_id: 'simulado' } } : {}),
        }
        const r = await recebe(m, b.nome || null, arquivo)
        if (!r) return erro('repetida', 409)
        const antes = (await oitoDb.lista('wa_msgs', { conversa_id: r.cv.id })).length
        if (r.responder && !b.sem_resposta) await atendeConversa(r.cv.id)
        const msgs = await oitoDb.lista('wa_msgs', { conversa_id: r.cv.id }, { ordem: 'criado_em' })
        const cv = await oitoDb.um('wa_conversas', { id: r.cv.id })
        return ok({ fase: cv?.fase, etapa: cv?.etapa, modo: cv?.modo, maia: cv?.rascunho?.maia, novas: msgs.slice(antes).map(x => ({ autor: x.autor, tipo: x.tipo, texto: x.texto })) })
      }
      case 'rodar_demo': { const { rotinaDemo } = await import('@/lib/maia/demo-amostra'); return ok(await rotinaDemo()) }
      // só no modo de teste: faz de conta que o lead sumiu há 22 h (pra testar a retomada única sem esperar)
      case 'teste_demo_sumiu': {
        if (db.modo() !== 'local') return erro('só no modo de teste')
        const { oitoDb } = await import('@/lib/oito/db')
        const cv = await oitoDb.um('wa_conversas', { telefone: String(b.telefone || '').replace(/\D/g, '') })
        if (!cv) return erro('conversa não existe')
        await oitoDb.atualiza('wa_conversas', { id: cv.id }, { janela_ate: new Date(Date.now() + 2 * 3600e3).toISOString() })
        return ok({ ok: true })
      }
      default: return erro('ação desconhecida')
    }
  } catch (e: any) { return erro(e.message, 500) }
}
