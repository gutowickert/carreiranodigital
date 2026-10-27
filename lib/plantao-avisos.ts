import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { enviarPush } from '@/lib/push'
import { enviarAoTime, type Usuario } from '@/lib/assistente'

// OS AVISOS DO PLANTÃO DA IA PRO TIME (27/10/2026, pedido do Nando: "pode deixar o alerta pra todo
// mundo" e "a notificação pode ir pro sistema também, não só no celular").
//
// Cada aviso vai por três caminhos ao mesmo tempo, porque o time está viajando e ninguém sabe qual vai
// estar olhando:
//   1. NO SISTEMA — uma tarefa `plantao_<tipo>` no lead. É ela que conta no balão "Plantão da IA" do
//      menu e na tela /dashboard/ia-plantao, e só sai de lá quando alguém marca como resolvida.
//   2. NO CELULAR — o aviso do navegador/app (push), em todos os aparelhos inscritos.
//   3. NO WHATSAPP do assistente — pra cada pessoa ativa com WhatsApp no cadastro. Fora da janela de 24 h
//      só passa o modelo `cnd_plantao_aviso` (pedido à Meta por /api/ia-plantao?modelo=criar); se ele
//      ainda não estiver aprovado, esse caminho falha calado e os outros dois seguem.
export type TipoAviso = 'diretor' | 'ligacao' | 'proposta' | 'aceite' | 'outro_produto' | 'ajuda' | 'falha'

export const TEMPLATE_AVISO = 'cnd_plantao_aviso'

const TITULO: Record<TipoAviso, string> = {
  diretor: 'Pediu algo pro "diretor"',
  ligacao: 'Quer conversar por ligação',
  proposta: 'Proposta enviada',
  aceite: 'Aceitou a proposta',
  outro_produto: 'Lead de outro produto',
  ajuda: 'A IA precisa de alguém do time',
  falha: 'A IA não conseguiu responder',
}

export async function avisarTime(o: { org: string; tipo: TipoAviso; leadId: string; nome: string; detalhe: string; vence?: string }) {
  const titulo = `Plantão da IA · ${TITULO[o.tipo]}`
  const detalhe = o.detalhe.replace(/\s+/g, ' ').trim().slice(0, 600)

  // 1. no sistema: a tarefa no lead (o balão do menu conta estas)
  await sb.from('tarefas_lead').insert({
    org_id: o.org, lead_id: o.leadId, tipo: `plantao_${o.tipo}`,
    titulo: `${TITULO[o.tipo]} · ${o.nome}`.slice(0, 200), descricao: detalhe,
    data_vencimento: o.vence || new Date().toISOString(),
  }).then(() => null, () => null)

  // 2. no celular
  await enviarPush(titulo, `${o.nome}: ${detalhe}`.slice(0, 140), '/dashboard/ia-plantao').catch(() => null)

  // 3. no WhatsApp de cada pessoa do time que tem número no cadastro
  const { data: time } = await sb.from('usuarios_perfil')
    .select('id, org_id, nome, apelido, email, whatsapp, assistente_ultima_msg_em, assistente_bom_dia')
    .eq('org_id', o.org).eq('ativo', true).not('whatsapp', 'is', null)
  const texto = `${titulo}\n\n${o.nome}: ${detalhe}\n\nVer: carreiranodigital.vercel.app/dashboard/ia-plantao`
  for (const u of (time || []) as Usuario[]) {
    await enviarAoTime(u, texto, { nome: TEMPLATE_AVISO, params: [TITULO[o.tipo], `${o.nome}: ${detalhe}`.slice(0, 300)] }).catch(() => null)
  }
}
