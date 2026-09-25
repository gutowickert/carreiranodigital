import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { enviarAoTime, chamar, leadsEsperando, type Usuario } from '@/lib/assistente'
import { montarMonitor } from '@/lib/monitor-entregas'
import { hojeBR } from '@/lib/periodos'

// OS AVISOS POR EVENTO. O critério do Guto: só entra no WhatsApp o que muda o que ele faz
// nas próximas horas. Nada por horário; tudo por acontecimento, uma vez só (assistente_alertas
// guarda o que já foi). Roda de hora em hora em horário comercial.
//
//   venda        → lead virou ganho: acima de LIMITES.venda ou Deu Venda, sempre
//   parada       → cliente da entrega com campanha parada, conta sem saldo ou desativada (vermelhos do monitor)
//   sem_resposta → lead ativo com mensagem dele sem resposta há 2h, em horário comercial
//
// Fora da janela de 24h a Meta só aceita template, então o aviso fica registrado (enviado=false)
// e o assunto entra no bom dia seguinte (vendas de ontem, leads esperando).

export const LIMITES_ALERTA = {
  venda: 1500,             // R$: acima disso avisa (cursos de R$ 797/997 não; FC e Deu Venda sim)
  horasSemResposta: 2,
  horarioComercial: [8, 19] as [number, number],   // hora de Brasília
}
const TZ = 'America/Sao_Paulo'
const brl = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const horaBR = () => Number(new Date().toLocaleString('en-US', { timeZone: TZ, hour: '2-digit', hour12: false }))
const fmtHora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })

async function jaFoi(u: Usuario, chave: string) {
  const { data } = await sb.from('assistente_alertas').select('id').eq('usuario_id', u.id).eq('chave', chave).limit(1)
  return !!data?.length
}
async function avisar(u: Usuario, chave: string, texto: string) {
  const r = await enviarAoTime(u, texto)
  await sb.from('assistente_alertas').upsert({ org_id: u.org_id, usuario_id: u.id, chave, texto, enviado: !!r.ok }, { onConflict: 'usuario_id,chave', ignoreDuplicates: true })
  return r.ok
}

// ═══════════════════════════════════════════════════════════ a rodada

export async function rodarAlertas(u: Usuario) {
  const hoje = hojeBR(), h = horaBR()
  const comercial = h >= LIMITES_ALERTA.horarioComercial[0] && h < LIMITES_ALERTA.horarioComercial[1]
  const enviados: string[] = []

  // 1) vendas das últimas 24h
  const { data: ganhos } = await sb.from('leads').select('id, nome, valor_venda, codigo_turma, motivo_ganho, data_ganho, vendedor_id').eq('org_id', u.org_id).eq('etapa', 'ganho')
    .gte('data_ganho', new Date(Date.now() - 24 * 3600 * 1000).toISOString()).order('data_ganho')
  for (const g of ganhos || []) {
    const valor = Number(g.valor_venda || 0)
    const deuVenda = /deu ?venda/i.test(`${g.codigo_turma || ''} ${g.motivo_ganho || ''}`) || (g.codigo_turma == null && valor >= 2000)
    if (!deuVenda && valor < LIMITES_ALERTA.venda) continue
    const chave = `venda:${g.id}`
    if (await jaFoi(u, chave)) continue
    const texto = `Venda: ${g.nome}, ${brl(valor)}${g.codigo_turma ? `, ${g.codigo_turma}` : ''}${deuVenda ? '. Deu Venda: cadastra a entrega quando marcar a sessão.' : '.'}${g.motivo_ganho ? ` (${String(g.motivo_ganho).slice(0, 80)})` : ''}`
    if (await avisar(u, chave, texto)) enviados.push(chave)
  }

  // 2) clientes das entregas: os vermelhos que dependem de alguém agir hoje
  const m = await montarMonitor(u.org_id, 7).catch(() => null)
  for (const c of m?.cards || []) {
    for (const a of c.alertas) {
      if (a.nivel !== 'vermelho' || !['parou', 'sem_gasto', 'sem_saldo', 'conta_inativa', 'sem_campanha'].includes(a.chave)) continue
      const chave = `parada:${c.id}:${a.chave}:${hoje}`
      if (await jaFoi(u, chave)) continue
      if (await avisar(u, chave, `${c.cliente}: ${a.titulo}.${a.acao ? ` ${a.acao}.` : ''}`)) enviados.push(chave)
    }
  }

  // 3) lead esperando resposta há 2h, só em horário comercial
  if (comercial) {
    for (const l of await leadsEsperando(u.org_id, LIMITES_ALERTA.horasSemResposta)) {
      const chave = `sem_resposta:${l.conversa_id}:${hoje}`
      if (await jaFoi(u, chave)) continue
      if (await avisar(u, chave, `${l.nome} mandou mensagem às ${fmtHora(l.desde)} e ninguém respondeu ainda.`)) enviados.push(chave)
    }
  }
  return { ok: true, enviados: enviados.length, chaves: enviados, comercial, usuario: chamar(u) }
}
