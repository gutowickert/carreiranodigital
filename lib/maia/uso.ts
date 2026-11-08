// Maia: o contador das conversas do mês, por negócio (07/11, piloto). A oferta promete 1.000 por mês (plano único, 08/11).
//
// O QUE CONTA COMO "CONVERSA": cada CONTATO diferente (telefone) que mandou pelo menos UMA mensagem pro WhatsApp do negócio
// dentro do mês do calendário (do dia 1 às 0h até o fim do mês, no fuso do negócio; padrão Brasília). O mesmo cliente
// escrevendo 30 vezes no mês = 1 conversa. Voltou no mês seguinte = conta de novo no mês seguinte.
// Não contam: conversas simuladas (telefone 55000..., painel e testes: aparecem à parte), mensagens do dono com a Maia
// e as retomadas que a Maia manda (só conta se o cliente escreveu).
// Contato apagado a pedido (LGPD) continua contando no mês em que conversou (maia_eventos 'contato_apagado', sem dado pessoal).
//
// A franquia (08/11, decisão do Guto: plano único de R$ 997): 1.000 conversas por mês pra qualquer negócio (lib/maia/oferta.ts),
// esteja ele marcado no banco como 'essencial' ou 'completa' (os dois valem como o plano único). meta.atendimento.franquia troca
// por negócio. Só o plano 'gestao' (Maia Gestora, só leitura: a Maia não atende os clientes dele) continua sem franquia.
// A equipe é avisada em 80% e 100%.
// NUNCA bloqueia o atendimento.
import { maiaDb as db } from './db'
import { ehSimulado } from '@/lib/oito/wa'
import { fusoDo, horaLocal } from './horario'
import { custoDoNegocio } from './custo'
import { oferta } from './oferta'

// a franquia do negócio: a do cadastro, se tiver; senão a do plano único (1.000). null = sem franquia (plano gestao)
export function franquiaDo(neg: any): number | null {
  const f = Number(neg?.meta?.atendimento?.franquia)
  if (f > 0) return Math.round(f)
  if (neg?.plano === 'gestao') return null
  return oferta().conversas   // 'essencial', 'completa' ou sem plano: todos são o plano único
}

// o começo do mês (dia 1, 0h) no fuso do negócio, em UTC
export function inicioDoMes(neg: any, agora = new Date()) {
  const fuso = fusoDo(neg)
  const { data } = horaLocal(agora, fuso)
  const [y, m] = data.split('-').map(Number)
  let t = Date.UTC(y, m - 1, 1, 0, 0)
  // acerta o fuso (duas voltas resolvem horário de verão)
  for (let i = 0; i < 2; i++) {
    const h = horaLocal(new Date(t), fuso)
    const local = Date.UTC(Number(h.data.slice(0, 4)), Number(h.data.slice(5, 7)) - 1, Number(h.data.slice(8, 10)), h.hora, h.minuto)
    t += Date.UTC(y, m - 1, 1, 0, 0) - local
  }
  return { mes: `${y}-${String(m).padStart(2, '0')}`, desde: new Date(t).toISOString() }
}

export async function usoDoMes(neg: any, agora = new Date()) {
  const { mes, desde } = inicioDoMes(neg, agora)
  const msgs = (await db.lista('msgs', { negocio_id: neg.id, autor: 'cliente' })).filter(m => m.criado_em >= desde)
  const cvs = await db.lista('conversas', { negocio_id: neg.id, canal: 'cliente' })
  const simulada = new Set(cvs.filter(c => c.simulada || ehSimulado(c.telefone)).map(c => c.id))
  const reais = new Set<string>(), simuladas = new Set<string>()
  for (const m of msgs) (simulada.has(m.conversa_id) ? simuladas : reais).add(m.conversa_id)
  const apagados = (await db.lista('eventos', { negocio_id: neg.id, tipo: 'contato_apagado' })).filter(e => e.detalhe?.mes === mes && e.detalhe?.contou).length
  const conversas = reais.size + apagados
  const franquia = franquiaDo(neg)
  const custo = await custoDoNegocio(neg.id, desde)
  return {
    negocio_id: neg.id, nome: neg.nome, mes, desde,
    conversas, simuladas: simuladas.size, franquia, pct: franquia ? Math.round(conversas / franquia * 1000) / 10 : null,
    custo_ia: custo.reais, custo_ia_por_tipo: custo.por_tipo,
    custo_por_conversa: conversas ? Math.round(custo.reais / conversas * 100) / 100 : null,
  }
}

// a rotina: avisa a equipe quando um negócio passa de 80% e de 100% da franquia no mês (uma vez cada). Não bloqueia nada.
export async function avisaFranquia(agora = new Date()) {
  const { avisaEquipe } = await import('./canal')
  const feitos: any[] = []
  for (const neg of await db.lista('negocios')) {
    if (neg.status === 'cancelado' || neg.contexto?.demo) continue
    const u = await usoDoMes(neg, agora)
    if (u.franquia == null || u.pct == null) continue   // plano sem franquia (gestao)
    const avisos = (await db.lista('eventos', { negocio_id: neg.id, tipo: 'franquia_aviso' })).filter(e => e.detalhe?.mes === u.mes)
    for (const nivel of [100, 80]) {
      if (u.pct < nivel) continue
      if (!avisos.some(e => e.detalhe?.nivel >= nivel)) {
        await avisaEquipe(`${neg.nome}: ${nivel}% das conversas do mês`, `${u.conversas} de ${u.franquia} conversas em ${u.mes} (IA no mês: R$ ${u.custo_ia}). O atendimento continua normal: nada é bloqueado.`, neg.id, nivel >= 100)
        await db.evento('franquia_aviso', neg.id, { mes: u.mes, nivel, conversas: u.conversas, franquia: u.franquia })
        feitos.push({ negocio: neg.id, nivel })
      }
      break   // passou de 100: não avisa 80 depois
    }
  }
  return feitos
}
