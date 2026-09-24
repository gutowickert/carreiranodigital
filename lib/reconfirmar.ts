import { supabaseAdmin as sb } from '@/lib/supabase-admin'
import { enviarTemplate } from '@/lib/whatsapp-oficial'
import { enviarPush } from '@/lib/push'
import { nomeDoLocal, diasAte } from '@/lib/entrega'

// A RECONFIRMAÇÃO DO ENCONTRO — a IA perguntando pro cliente antes de a equipe pegar a estrada.
//
// O PROBLEMA: quem lembra do compromisso em cima da hora avisa quando o time já está se deslocando,
// e o dia inteiro se perde. A regra dos 2 dias já existia no módulo (DIAS_PRAZO_CONFIRMAR) e só
// pintava a tela — ninguém mandava a mensagem.
//
// ⚠️ O MOTOR OLHA A DATA, NUNCA O ESTADO. A máquina prevê `combinado` (o time acertou) e
// `confirmado` (reconfirmado depois), mas o time marca tudo direto como `confirmado` — os encontros
// da semana estão todos assim. Um motor preso ao nome do estado não mandaria mensagem nenhuma.
// A memória do motor são as colunas `reconfirmacao_*`, separadas do estado que o time usa.
//
// ⚠️ A IA NÃO REMARCA. Ela confirma ou não. Data nova se combina com gente — e quem responde "não
// vou poder" precisa de uma pessoa, não de um robô oferecendo horário.

const TEMPLATE = 'cnd_reconfirmar_encontro'
const CHAVE = 'reconfirmar_encontro'

type Marco = {
  id: string; titulo: string; projeto_id: string; local: string | null
  data_combinada: string | null; data_prevista: string | null
  reconfirmacao_enviada_em: string | null; reconfirmacao_2a_em: string | null
  reconfirmacao_resposta: string | null; responsavel_id: string | null
}

const soData = (x: string) => String(x).slice(0, 10)
const horaDe = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
const dataDe = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })

/** Avisa quem atende: tarefa no histórico do projeto + aviso no celular. */
async function avisarEquipe(m: Marco, org: string, titulo: string, corpo: string) {
  try {
    await sb.from('projeto_andamentos').insert({
      org_id: org, projeto_id: m.projeto_id, marco_id: m.id, tipo: 'reconfirmacao', observacao: corpo, autor: 'IA',
    })
  } catch { /* o aviso não pode derrubar o motor */ }
  try { await enviarPush(titulo, corpo, `/dashboard/entregas/${m.projeto_id}`) } catch { /* idem */ }
}

export async function reconfirmarEncontros(org: string, hojeISO?: string) {
  const hoje = hojeISO || new Date().toISOString().slice(0, 10)
  const enviadas: string[] = []
  const avisados: string[] = []

  // Só sai por template aprovado: mensagem 2 dias antes está fora da janela de 24h do WhatsApp.
  // Sem aprovação, o motor não tenta — mandar e falhar calado seria pior que não mandar.
  const { data: tpl } = await sb.from('followup_templates')
    .select('status, corpo').eq('org_id', org).eq('chave', CHAVE).maybeSingle()
  if (tpl?.status !== 'aprovado') {
    return { ok: false, motivo: `template ${CHAVE} ainda não aprovado na Meta (está "${tpl?.status || 'não cadastrado'}")`, enviadas: 0, avisados: 0 }
  }

  const { data: marcos } = await sb.from('projeto_marcos')
    .select('id, titulo, projeto_id, local, data_combinada, data_prevista, reconfirmacao_enviada_em, reconfirmacao_2a_em, reconfirmacao_resposta, responsavel_id')
    .eq('org_id', org).eq('natureza', 'encontro')
    .not('estado', 'in', '(concluido,cancelado)')
    .not('data_combinada', 'is', null)
    .gte('data_prevista', hoje)

  for (const m of (marcos || []) as Marco[]) {
    if (!m.data_combinada) continue
    // quem já respondeu está resolvido — não se pergunta duas vezes
    if (m.reconfirmacao_resposta) continue
    const faltam = diasAte(soData(m.data_combinada), hoje)

    const { data: proj } = await sb.from('projetos').select('cliente, whatsapp').eq('id', m.projeto_id).maybeSingle()
    if (!proj?.whatsapp) continue

    const primeiroNome = String(proj.cliente || '').trim().split(/\s+/)[0] || 'tudo bem'
    const variaveis = [
      primeiroNome,
      dataDe(m.data_combinada),
      horaDe(m.data_combinada),
      nomeDoLocal(m.local) || 'no lugar combinado',
    ]
    const componentes = [{ type: 'body', parameters: variaveis.map(text => ({ type: 'text', text })) }]

    // ── 2 dias antes: a primeira
    if (faltam === 2 && !m.reconfirmacao_enviada_em) {
      const r = await enviarTemplate(proj.whatsapp, TEMPLATE, 'pt_BR', componentes)
      if (r.ok) {
        await sb.from('projeto_marcos').update({ reconfirmacao_enviada_em: new Date().toISOString() }).eq('id', m.id)
        enviadas.push(`${proj.cliente} (2 dias)`)
      }
      continue
    }

    // ── 1 dia antes, sem resposta: segunda tentativa E o aviso, no MESMO momento.
    // Não se espera a segunda falhar: um dia antes ainda dá pra ligar; no dia da viagem, não.
    if (faltam === 1 && m.reconfirmacao_enviada_em && !m.reconfirmacao_2a_em) {
      const r = await enviarTemplate(proj.whatsapp, TEMPLATE, 'pt_BR', componentes)
      await sb.from('projeto_marcos').update({ reconfirmacao_2a_em: new Date().toISOString() }).eq('id', m.id)
      if (r.ok) enviadas.push(`${proj.cliente} (1 dia, 2ª)`)
      await avisarEquipe(m, org,
        `⚠️ ${proj.cliente} não confirmou`,
        `${proj.cliente} não respondeu a reconfirmação do encontro de amanhã (${dataDe(m.data_combinada)} às ${horaDe(m.data_combinada)}${nomeDoLocal(m.local) ? ', ' + nomeDoLocal(m.local) : ''}). Mandei a segunda tentativa — vale ligar hoje.`)
      avisados.push(proj.cliente)
      continue
    }
  }

  return { ok: true, enviadas: enviadas.length, avisados: avisados.length, detalhe: { enviadas, avisados } }
}

/**
 * A RESPOSTA DO CLIENTE, quando ela chega pelo botão.
 *
 * O clique volta como uma mensagem de texto cujo corpo é exatamente o rótulo do botão — por isso a
 * comparação é pelo texto. Devolve `true` quando a mensagem ERA uma resposta de reconfirmação, pra
 * quem chamou saber que não precisa passar isso pra IA de atendimento responder.
 */
export async function lerRespostaDeReconfirmacao(org: string, telefone: string, texto: string): Promise<boolean> {
  const t = (texto || '').trim().toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[!.,;]+$/, '')

  // ⚠️ ENTENDE O BOTÃO **E** O TEXTO DIGITADO. O clique volta com o rótulo exato, mas gente digita:
  // "sim", "ok", "confirmado", "tá certo". E o primeiro template desta função foi submetido à Meta
  // SEM os botões (a mudança que os habilita não estava publicada ainda) — se esta função só
  // entendesse o rótulo, ela nunca reconheceria resposta nenhuma, e ninguém veria o erro: as
  // mensagens sairiam, os clientes responderiam, e o sistema continuaria achando que não houve
  // resposta.
  //
  // Na dúvida, NÃO decide. Frase ambígua ("acho que sim", "só se for de manhã") cai fora daqui e
  // segue pro atendimento normal — numa decisão que custa uma viagem, adivinhar é caro.
  const SIM = /^(sim,? ?(confirmado)?|confirmado|confirmo|ok|okay|beleza|blz|isso|certo|ta certo|tudo certo|pode ser|positivo|👍|✅)$/
  const NAO = /^(nao,? ?(vou poder)?|nao posso|nao vou poder|negativo|infelizmente nao|nao da|nao vai dar|remarcar|preciso remarcar|❌)$/
  const sim = SIM.test(t)
  const nao = NAO.test(t)
  if (!sim && !nao) return false

  // o encontro mais próximo, desta pessoa, que está esperando resposta
  const sufixo = telefone.replace(/\D/g, '').slice(-8)
  const { data: projetos } = await sb.from('projetos').select('id, cliente, whatsapp').eq('org_id', org)
  const proj = (projetos || []).find(p => String(p.whatsapp || '').replace(/\D/g, '').endsWith(sufixo))
  if (!proj) return false

  const { data: m } = await sb.from('projeto_marcos')
    .select('id, titulo, projeto_id, data_combinada, local, responsavel_id')
    .eq('projeto_id', proj.id).eq('natureza', 'encontro')
    .not('reconfirmacao_enviada_em', 'is', null).is('reconfirmacao_resposta', null)
    .not('estado', 'in', '(concluido,cancelado)')
    .order('data_combinada').limit(1).maybeSingle()
  if (!m) return false

  const agora = new Date().toISOString()
  const quando = m.data_combinada ? `${dataDe(m.data_combinada)} às ${horaDe(m.data_combinada)}` : 'o encontro'

  if (sim) {
    // o cliente confirmou: o encontro vira `confirmado` de verdade — é exatamente o que o estado
    // sempre quis dizer, e agora quem afirma isso é o cliente, não a nossa suposição
    await sb.from('projeto_marcos').update({
      reconfirmacao_resposta: 'sim', reconfirmacao_resposta_em: agora,
      estado: 'confirmado', confirmado_em: agora, atualizado_em: agora,
    }).eq('id', m.id as string)
    await avisarEquipe(m as any, org, `✅ ${proj.cliente} confirmou`, `${proj.cliente} confirmou o encontro de ${quando}.`)
    return true
  }

  // "não vou poder": NÃO REMARCA. Marca a resposta, tira o encontro de "confirmado" e chama gente.
  await sb.from('projeto_marcos').update({
    reconfirmacao_resposta: 'nao', reconfirmacao_resposta_em: agora,
    estado: 'a_remarcar', atualizado_em: agora,
  }).eq('id', m.id as string)
  await avisarEquipe(m as any, org, `🚫 ${proj.cliente} não vai poder`,
    `${proj.cliente} disse que NÃO vai poder no encontro de ${quando}. Precisa remarcar — a IA não marca data, isso é contigo.`)
  return true
}
