import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { diasAte, empurrarPosteriores, LOCAIS, REGIOES, conflitoDeRegiao, nomeDoLocal, type Local } from '@/lib/entrega'

// COMBINAR / REMARCAR UM ENCONTRO. Um caminho só, usado pela ficha (rota do marco) e pelo
// assistente do WhatsApp ("marquei com a Natália a segunda sessão, segunda às 14h, sede de
// Lajeado"). Antes vivia só na rota, e o assistente caía em lembrete na agenda pessoal.
//
// O que faz: grava data, hora e lugar; zera a reconfirmação anterior; empurra os marcos
// seguintes pelo mesmo deslocamento (a âncora, o fim do contrato, não sai do lugar); avisa
// conflito de região no mesmo dia (não proíbe: quem chamou decide com `mesmoAssim`).

export type ResultadoCombinar =
  | { ok: true; aviso: string | null; quando: string; local: string }
  | { ok: false; error: string; precisa_confirmar_regiao?: boolean }

export async function combinarMarco(org: string, marcoId: string, dataHora: string, local: string, opts: { acao?: 'combinar' | 'remarcar'; mesmoAssim?: boolean; autor?: string | null } = {}): Promise<ResultadoCombinar> {
  const acao = opts.acao || 'combinar'
  const nova = new Date(dataHora)
  if (isNaN(nova.getTime())) return { ok: false, error: 'data inválida' }
  if (!LOCAIS.some(l => l.chave === local)) return { ok: false, error: 'escolhe onde vai ser o encontro (sede ou região, Lajeado ou Porto Alegre)' }

  const { data: marco } = await sb.from('projeto_marcos').select('*').eq('org_id', org).eq('id', marcoId).maybeSingle()
  if (!marco) return { ok: false, error: 'marco não encontrado' }
  const { data: projeto } = await sb.from('projetos').select('data_inicio').eq('id', marco.projeto_id).maybeSingle()
  const { data: irmaos } = await sb.from('projeto_marcos').select('id, ordem, ancora, estado, data_prevista, natureza, titulo, data_combinada').eq('projeto_id', marco.projeto_id).order('ordem')

  const novaData = nova.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const inicio = String(projeto?.data_inicio || '').slice(0, 10)
  if (inicio && novaData < inicio) return { ok: false, error: `Essa data (${novaData.split('-').reverse().join('/')}) é antes do início do projeto (${inicio.split('-').reverse().join('/')}). Confere o dia.` }
  const antes = String(marco.data_combinada || marco.data_prevista || '').slice(0, 10)
  const desloc = antes ? diasAte(novaData, antes) : 0

  const { data: doDia } = await sb.from('projeto_marcos').select('id, local, estado').eq('org_id', org).eq('data_prevista', novaData).neq('id', marcoId)
  const conf = conflitoDeRegiao(local as Local, (doDia || []) as any)
  if (conf.conflito && !opts.mesmoAssim) {
    return { ok: false, precisa_confirmar_regiao: true, error: `Nesse dia já tem ${conf.quantos} atendimento${conf.quantos > 1 ? 's' : ''} em ${REGIOES[conf.outra!].nome}. Não dá tempo do deslocamento pra ${REGIOES[conf.regiao!].nome} no mesmo dia.` }
  }

  const agora = new Date().toISOString()
  await sb.from('projeto_marcos').update({
    local, reconfirmacao_enviada_em: null, reconfirmacao_2a_em: null, reconfirmacao_resposta: null, reconfirmacao_resposta_em: null,
    data_combinada: nova.toISOString(), data_prevista: novaData, estado: 'combinado', confirmado_em: null, atualizado_em: agora,
  }).eq('id', marcoId)

  let aviso: string | null = null
  if (desloc !== 0 && irmaos?.length) {
    const { mover, esbarrouNaAncora } = empurrarPosteriores(irmaos as any, marco.ordem, desloc)
    for (const m of mover) await sb.from('projeto_marcos').update({ data_prevista: m.data_prevista, atualizado_em: agora }).eq('id', m.id)
    if (esbarrouNaAncora) aviso = 'Um dos próximos passos bateu na data de fim do contrato e não foi empurrado. Vale olhar o prazo.'
  }

  const fmt = nova.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  await sb.from('projeto_andamentos').insert({ org_id: org, projeto_id: marco.projeto_id, marco_id: marcoId, tipo: acao, observacao: `${acao === 'combinar' ? '📅 Combinado' : '🔄 Remarcado'}: ${marco.titulo} para ${fmt} — ${nomeDoLocal(local as Local)}${desloc ? ` (${desloc > 0 ? '+' : ''}${desloc} dias)` : ''}.`, autor: opts.autor || null })
  return { ok: true, aviso, quando: nova.toISOString(), local: nomeDoLocal(local as Local) }
}
