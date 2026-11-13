// Maia Gestora (T15, 08/11): a parte que roda sozinha. Chamada pela rotina de hora em hora (lib/maia/rotina.ts, com
// MAIA_GESTORA_LIGADA=1) e pelo botão do painel (/api/maia/gestora). SÓ LÊ a Meta e os CRMs (lib/maia/gestora-crm.ts).
//   de 2 em 2 horas, das 9h às 19h: só as regras urgentes da Meta (gasto sem conversa, conta parou); manda só o que é novo
//   7h todo dia: todas as regras, grava em maia_avisos (um por problema por dia) e a foto do dia em maia_crm_dia; manda UMA mensagem
//   segunda 7h: também o resumo da semana e o funil por anúncio (maia_funil_semana)
// Quem recebe: por enquanto só a equipe (avisaEquipe, o celular do Guto). Sem nome de cliente final nesse aviso (ele passa
// pelo ntfy): os nomes ficam no CRM e a tela busca na hora. O dono recebe direto só quando o negócio está em
// MAIA_GESTORA_DONOS (ids separados por vírgula, ou "todos"; padrão: ninguém), e a mensagem dele só fala dele.
// Nunca mexe em verba, status de anúncio, nem escreve no CRM ou na Meta.
import { maiaDb as db } from './db'
import { avisaEquipe, conversaDoDono, mandaTexto } from './canal'
import { analisa, textoDono, textoResumo, diaBR, menos, qualModo, MODELO_AVISO, paramsModeloAviso, type Analise, type Aviso, type ModoGestora } from './gestora'
import { lerCRM, lerMeta } from './gestora-crm'

type Modo = ModoGestora
// 13/11 (Guto): problema TÉCNICO (conta parou de gastar: cartão, saldo ou anúncio reprovado; WhatsApp falhando; conversões
// falhando) não vai direto pro dono: avisa a equipe e o recado pro dono fica pendente até a equipe aprovar (pendencias.ts)
export const TECNICOS = new Set(['parou_de_gastar', 'wa_falha', 'capi_falhando'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const gestoraLigada = () => process.env.MAIA_GESTORA_LIGADA === '1'

// os negócios que a Gestora vigia: os que têm a configuração dela (maia_negocios.gestora), menos os pausados e cancelados
export async function negociosGeridos() {
  return (await db.lista('negocios')).filter(n => n.gestora && typeof n.gestora === 'object' && Object.keys(n.gestora).length && !['cancelado', 'pausado'].includes(n.status))
}

const donosDiretos = () => String(process.env.MAIA_GESTORA_DONOS || '').split(',').map(s => s.trim()).filter(Boolean)
export const recebeDireto = (neg: any) => { const v = donosDiretos(); return v.includes('todos') || v.includes(String(neg.id)) }

// a segunda-feira da semana (a chave de maia_funil_semana)
const segundaDa = (dia: string) => { const w = new Date(dia + 'T12:00:00Z').getUTCDay(); return menos(dia, (w + 6) % 7) }

async function gravaAvisos(neg: any, a: Analise, direto: boolean) {
  const ja = new Set((await db.lista('avisos', { negocio_id: neg.id, dia: a.dia })).map(x => x.tipo))
  const novos: Aviso[] = []
  for (const x of a.avisos) {
    if (ja.has(x.tipo)) continue
    try {
      await db.insere('avisos', {
        negocio_id: neg.id, dia: a.dia, tipo: x.tipo, nivel: x.nivel, titulo: x.titulo, texto: x.texto, acao: x.acao, numeros: x.numeros || {},
        lead_ids: (x.lead_ids || []).filter(i => UUID.test(i)).slice(0, 200),   // só os ids do CRM do cliente; o nome nunca é gravado
        status: direto && !TECNICOS.has(x.tipo) ? 'enviado' : 'revisao_equipe', enviado_em: direto && !TECNICOS.has(x.tipo) ? new Date().toISOString() : null, util: null,
      })
      novos.push(x); ja.add(x.tipo)
    } catch (e: any) { if (!/duplicate|23505/.test(e.message)) throw e }
  }
  return novos
}

async function upsert(tab: string, chave: Record<string, any>, campos: Record<string, any>) {
  const tem = await db.um(tab, chave)
  if (tem) await db.atualiza(tab, chave, campos)
  else await db.insere(tab, { ...chave, ...campos })
}

async function gravaFotoDoDia(neg: any, a: Analise) {
  if (!a.tem_crm) return
  const r = a.resumo, conta = (t: string) => a.avisos.find(x => x.tipo === t)?.numeros?.total || 0
  await upsert('crm_dia', { negocio_id: neg.id, dia: a.dia_crm }, {
    leads_novos: r.fichas_novas || 0, leads_de_anuncio: r.fichas_de_anuncio || 0, vendas: r.vendas || 0, vendas_de_anuncio: r.vendas_de_anuncio || 0,
    receita: r.receita || 0, quentes_parados: conta('quente_parado'), primeira_resposta_min: r.primeira_resposta_min ?? null,
    sem_resposta: conta('sem_resposta'), capi_erros: a.avisos.find(x => x.tipo === 'capi_falhando')?.numeros?.erros || 0,
  })
}

async function gravaFunil(neg: any, a: Analise) {
  const semana = segundaDa(a.dia)
  for (const x of [...a.funil.tabela, ...a.funil.extra]) {
    await upsert('funil_semana', { negocio_id: neg.id, semana, ad_id: String(x.ad_id) }, {
      ad_nome: x.anuncio, gasto: x.gasto || 0, conversas_meta: x.conversas_meta || 0, contatos_crm: x.fichas || 0, vendas: x.vendas || 0, receita: x.receita || 0, quentes: x.quentes || 0,
    })
  }
  return semana
}

// fala com o dono pelo número da Maia. Dentro da janela de 24 h: texto. Fora dela: com MAIA_GESTORA_MODELO_AVISO=1 (o modelo
// maia_aviso aprovado), guarda o texto na fila do dono e chama com o maia_aviso; sem ele, a fila normal do canal (maia_novidades).
async function mandaProDono(neg: any, texto: string, n: number) {
  if (!neg.dono_whatsapp) return { ok: false, erro: 'negócio sem dono_whatsapp' }
  const cv = await conversaDoDono(neg)
  const atual = (await db.um('conversas', { id: cv.id })) || cv
  const aberta = !!atual.janela_ate && atual.janela_ate > new Date().toISOString()
  if (aberta || process.env.MAIA_GESTORA_MODELO_AVISO !== '1') return mandaTexto(cv, texto)
  await db.evento('fila_dono', neg.id, { conversa_id: cv.id, tipo: 'texto', texto, enviado: false })
  const { enviaModelo, ehSimulado } = await import('@/lib/oito/wa')
  const r: any = ehSimulado(cv.telefone) || cv.simulada ? { ok: true, simulado: true } : await enviaModelo(cv.telefone, MODELO_AVISO.name, MODELO_AVISO.language, paramsModeloAviso(neg.dono_nome, n, neg.nome))
  await db.evento('modelo_dono', neg.id, { conversa_id: cv.id, modelo: MODELO_AVISO.name, ok: !!r.ok, erro: r.erro || null })
  return { ok: !!r.ok, na_fila: true }
}

// pede a aprovação do modelo maia_aviso na WABA do número da Maia (a do Oito). NÃO é chamado sozinho em lugar nenhum:
// fica pronto pro Nando chamar uma vez, com o sim do Guto (é a única coisa deste arquivo que escreve fora do sistema).
export async function pedeModeloAviso() {
  const token = process.env.OITO_WA_TOKEN || process.env.WA_OFICIAL_TOKEN || '', waba = process.env.OITO_WA_WABA_ID || ''
  if (!token || !waba) return { ok: false, erro: 'faltam OITO_WA_TOKEN/OITO_WA_WABA_ID no servidor' }
  const r = await fetch(`https://graph.facebook.com/v25.0/${waba}/message_templates`, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(MODELO_AVISO) })
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok && !/already exists|duplicate|existe/i.test(String(j?.error?.error_user_msg || j?.error?.message || ''))) return { ok: false, erro: String(j?.error?.error_user_msg || j?.error?.message || r.status).slice(0, 200) }
  return { ok: true, status: j?.status || 'já existia' }
}

const curto = (s: string) => String(s || '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim()

// opc.previa: só calcula (não grava nem manda nada) — é o "quantos avisos sairiam hoje"
export async function rotinaGestora(opc: { relogio?: Date; forcar?: Modo; previa?: boolean; negocio?: string } = {}) {
  const relogio = opc.relogio || new Date()
  const modo = opc.forcar || qualModo(relogio)
  if (!modo) return null
  const agora = relogio.getTime(), dia = diaBR(agora)
  // a rodada das 7h é uma por dia (o painel pode rodar a rotina de novo na mesma hora): só repete se for forçada
  if (!opc.forcar && !opc.previa && modo !== 'urgentes') {
    const ja = (await db.lista('eventos', { tipo: 'gestora_rodada' }, { ordem: 'criado_em', desc: true, limite: 20 })).find(e => e.detalhe?.dia === dia && e.detalhe?.modo !== 'urgentes' && !e.detalhe?.previa)
    if (ja) return { pulou: 'a rodada das 7h já foi hoje' }
  }
  const negs = (await negociosGeridos()).filter(n => !opc.negocio || n.id === opc.negocio)
  const saida: any[] = [], pGuto: string[] = []
  let urgentes = 0
  for (const neg of negs) {
    try {
      const cfg = neg.gestora || {}
      const crm = modo === 'urgentes' ? null : await lerCRM(neg, agora)
      const meta = await lerMeta(neg, agora)
      const a = analisa({ cliente: cfg, crm: crm?.dados || null, dataDosDados: crm?.data_dos_dados || null, meta: meta.linhas, rascunhos: cfg.rascunhos || [], agora, modo: modo === 'urgentes' ? 'urgentes' : 'tudo', notas: [...meta.notas, crm?.nota].filter(Boolean) as string[] })
      const direto = recebeDireto(neg)
      const item: any = { negocio_id: neg.id, nome: neg.nome, dia: a.dia, avisos: a.avisos.length, urgentes: a.avisos.filter(x => x.nivel === 'urgente').length,
        tipos: a.avisos.map(x => x.nivel + ':' + x.tipo), titulos: a.avisos.map(x => x.titulo), notas: a.notas, meta: { linhas: meta.linhas.length, fontes: meta.usadas }, crm: crm ? (crm.dados ? crm.fonte : 'pulado') : 'não lê (só Meta)', direto }
      if (!opc.previa) {
        const novos = await gravaAvisos(neg, a, direto)
        item.novos = novos.length
        if (modo !== 'urgentes') await gravaFotoDoDia(neg, a)
        if (modo === 'semana') item.funil_semana = await gravaFunil(neg, a)
        // o que vai pro Guto (sem nome de ninguém): no das 7h, todos; nos de 2 em 2 horas, só o que é novo
        const mostrar = modo === 'urgentes' ? novos : a.avisos
        urgentes += mostrar.filter(x => x.nivel === 'urgente').length
        if (mostrar.length) pGuto.push(`${curto(neg.nome)}: ${modo === 'urgentes' ? mostrar.map(x => x.titulo).join('; ') : `${mostrar.length} (${mostrar.filter(x => x.nivel === 'urgente').length} urgente)`}`)
        else if (modo !== 'urgentes') pGuto.push(`${curto(neg.nome)}: tudo certo`)
        // o dono, só quando está na lista; e só os avisos dele
        // 13/11: o técnico novo vira recado pendente pro dono (a equipe aprova no painel) e sai da mensagem direta
        if (direto) {
          const { problemaTecnico } = await import('./pendencias')
          for (const x of novos.filter(x => TECNICOS.has(x.tipo))) await problemaTecnico(neg, { tipo: x.tipo, equipe: `${x.titulo}. ${x.acao || ''}`.trim(), dono: `${x.titulo}. ${x.texto}`.trim() })
        }
        const naoTec = (l: Aviso[]) => l.filter(x => !TECNICOS.has(x.tipo))
        if (direto && (modo !== 'urgentes' ? true : naoTec(novos).length)) {
          const so = modo === 'urgentes' ? { ...a, avisos: naoTec(novos) } : { ...a, avisos: naoTec(a.avisos) }
          const partes = [textoDono(neg.nome, so, { saude: !!cfg.saude, comNomes: true })]
          if (modo === 'semana') partes.push(textoResumo(neg.nome, a))
          const r: any = await mandaProDono(neg, partes.join('\n\n'), so.avisos.length)
          item.dono = r?.ok ? (r.na_fila ? 'na fila' : 'enviado') : 'não saiu: ' + (r?.erro || '?')
        }
      }
      saida.push(item)
    } catch (e: any) { saida.push({ negocio_id: neg.id, nome: neg.nome, erro: String(e?.message || e).slice(0, 200) }) }
  }
  if (!opc.previa) {
    await db.evento('gestora_rodada', null, { dia, modo, negocios: saida })
    if (pGuto.length && (modo !== 'urgentes' || urgentes)) {
      // o celular mostra uns 200 caracteres: o texto inteiro fica no evento aviso_equipe e na aba Avisos do painel
      const titulo = (modo === 'urgentes' ? 'Gestora: urgente' : modo === 'semana' ? 'Gestora: avisos do dia e resumo da semana' : 'Gestora: avisos do dia') + ' (painel, aba Avisos)'
      await avisaEquipe(titulo, pGuto.join(' · ') + '.', null, urgentes > 0)
    }
  }
  return { modo, dia, previa: !!opc.previa, negocios: saida, total: saida.reduce((s, x) => s + (x.avisos || 0), 0) }
}
